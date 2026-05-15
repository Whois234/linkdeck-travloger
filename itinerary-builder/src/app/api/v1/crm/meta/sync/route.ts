import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, err } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export const dynamic     = 'force-dynamic';
export const maxDuration = 60;

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

async function graphFetch(url: string): Promise<Record<string, unknown>> {
  const safeUrl = url.replace(/access_token=[^&]+/, 'access_token=***');
  console.log('[META SYNC] GET', safeUrl);

  const res = await fetch(url, { next: { revalidate: 0 } });
  console.log('[META SYNC] Status:', res.status);

  const text = await res.text();

  if (!res.ok) {
    console.error('[META SYNC] Error body:', text.slice(0, 500));
    throw new Error(`Meta API ${res.status}: ${text.slice(0, 400)}`);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    console.error('[META SYNC] Invalid JSON:', text.slice(0, 200));
    throw new Error(`Meta API returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }

  // Meta sometimes wraps errors inside a 200 response
  if (data.error) {
    const e = data.error as Record<string, unknown>;
    const msg = `Meta API error ${e.code ?? ''} (${e.type ?? ''}): ${e.message ?? JSON.stringify(e)}`;
    console.error('[META SYNC]', msg);
    throw new Error(msg);
  }

  return data;
}

async function fetchAllPages(
  path: string,
  token: string,
  label: string,
): Promise<Record<string, unknown>[]> {
  let url: string | null = `${GRAPH_BASE}${path}&access_token=${token}`;
  const all: Record<string, unknown>[] = [];
  let page = 0;
  while (url) {
    page++;
    console.log(`[META SYNC] ${label} page ${page} — fetching…`);
    const data = await graphFetch(url) as { data?: Record<string, unknown>[]; paging?: { next?: string } };
    const items = data.data ?? [];
    all.push(...items);
    console.log(`[META SYNC] ${label} page ${page} — got ${items.length} (total: ${all.length})`);
    url = data.paging?.next ?? null;
  }
  console.log(`[META SYNC] ${label} TOTAL: ${all.length}`);
  return all;
}

export async function POST(req: NextRequest) {
  // Top-level catch ensures we ALWAYS return JSON — never an HTML error page
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

    // Read credentials from AppSetting
    let rows: { key: string; value: string }[] = [];
    try {
      rows = await prisma.appSetting.findMany({
        where: { key: { in: ['meta_access_token', 'meta_ad_account_id'] } },
      });
    } catch (dbErr) {
      console.error('[META SYNC] DB read failed:', dbErr);
      return err(`Database error reading credentials: ${String(dbErr)}`, 500);
    }

    console.log('[META SYNC] AppSetting rows found:', rows.length, rows.map(r => r.key));

    const cfg: Record<string, string> = {};
    for (const r of rows) cfg[r.key] = r.value;

    const token     = cfg['meta_access_token']  || '';
    const accountId = (cfg['meta_ad_account_id'] || '').replace(/^act_/, '');

    console.log('[META SYNC] token present:', !!token, '| first 20 chars:', token.substring(0, 20));
    console.log('[META SYNC] accountId:', accountId);

    if (!token || !accountId) {
      return err('Meta Access Token and Ad Account ID not configured. Save credentials first.', 400);
    }

    console.log('[META SYNC] Starting parallel fetch: campaigns + adsets + ads');

    const [campaigns, adsets, ads] = await Promise.all([
      fetchAllPages(`/act_${accountId}/campaigns?fields=id,name,status&limit=100`, token, 'campaigns'),
      fetchAllPages(`/act_${accountId}/adsets?fields=id,name,campaign_id,status&limit=100`, token, 'adsets'),
      fetchAllPages(`/act_${accountId}/ads?fields=id,name,adset_id,campaign_id,status&limit=100`, token, 'ads'),
    ]);

    console.log(`[META SYNC] Fetched: ${campaigns.length} campaigns, ${adsets.length} adsets, ${ads.length} ads`);

    if (ads.length === 0) {
      console.warn('[META SYNC] WARNING: 0 ads returned — verify the ad account has ads');
    }

    // Build lookup maps
    const campaignMap: Record<string, string> = {};
    for (const c of campaigns) campaignMap[String(c.id)] = String(c.name ?? '');

    const adsetMap: Record<string, { name: string; campaign_id: string }> = {};
    for (const a of adsets) adsetMap[String(a.id)] = { name: String(a.name ?? ''), campaign_id: String(a.campaign_id ?? '') };

    // Upsert each ad (preserve existing manual fields)
    let upserted = 0;
    for (const ad of ads) {
      const adId = String(ad.id ?? '');
      if (!adId) continue;
      const adsetId      = String(ad.adset_id    ?? '');
      const campaignId   = String(ad.campaign_id  ?? '');
      const adsetInfo    = adsetMap[adsetId];
      const campaignName = campaignMap[campaignId] ?? '';

      const existing = await prisma.metaAdsMapping.findUnique({
        where:  { ad_id: adId },
        select: { destination: true, trip_type: true, prefilled_code: true },
      });

      await prisma.metaAdsMapping.upsert({
        where:  { ad_id: adId },
        update: {
          ad_name:       String(ad.name ?? ''),
          ad_set_id:     adsetId      || null,
          ad_set_name:   adsetInfo?.name  || null,
          campaign_id:   campaignId   || null,
          campaign_name: campaignName || null,
          is_active:     String(ad.status ?? '').toUpperCase() === 'ACTIVE',
          synced_at:     new Date(),
        },
        create: {
          ad_id:          adId,
          ad_name:        String(ad.name ?? ''),
          ad_set_id:      adsetId      || null,
          ad_set_name:    adsetInfo?.name  || null,
          campaign_id:    campaignId   || null,
          campaign_name:  campaignName || null,
          destination:    existing?.destination    ?? null,
          trip_type:      existing?.trip_type       ?? null,
          prefilled_code: existing?.prefilled_code  ?? null,
          is_active:      String(ad.status ?? '').toUpperCase() === 'ACTIVE',
          synced_at:      new Date(),
        },
      });
      upserted++;
    }

    console.log(`[META SYNC] Done — upserted ${upserted} ads`);
    return ok({ synced: upserted, campaigns: campaigns.length, adsets: adsets.length, ads: ads.length });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[META SYNC] UNHANDLED ERROR:', msg);
    // Always return JSON — never let Next.js return an HTML error page
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
