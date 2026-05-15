import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, err } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

async function graphGet(path: string, token: string): Promise<Record<string, unknown>> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${GRAPH_BASE}${path}${sep}access_token=${token}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Meta API error (${res.status}): ${txt.slice(0, 300)}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function fetchAllPages(path: string, token: string): Promise<Record<string, unknown>[]> {
  let url: string | null = `${GRAPH_BASE}${path}&access_token=${token}`;
  const all: Record<string, unknown>[] = [];
  while (url) {
    const res = await fetch(url);
    if (!res.ok) break;
    const data = await res.json() as { data?: Record<string, unknown>[]; paging?: { next?: string } };
    all.push(...(data.data ?? []));
    url = data.paging?.next ?? null;
  }
  return all;
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  // Read credentials from AppSetting
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ['meta_access_token', 'meta_ad_account_id'] } },
  });
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.key] = r.value;
  const token = cfg['meta_access_token'] || '';
  const accountId = (cfg['meta_ad_account_id'] || '').replace(/^act_/, '');
  if (!token || !accountId) return err('Meta Access Token and Ad Account ID not configured', 400);

  try {
    // Fetch all 3 levels in parallel
    const [campaigns, adsets, ads] = await Promise.all([
      fetchAllPages(`/act_${accountId}/campaigns?fields=id,name,status&limit=100`, token),
      fetchAllPages(`/act_${accountId}/adsets?fields=id,name,campaign_id,status&limit=100`, token),
      fetchAllPages(`/act_${accountId}/ads?fields=id,name,adset_id,campaign_id,status&limit=100`, token),
    ]);

    // Build lookup maps
    const campaignMap: Record<string, string> = {};
    for (const c of campaigns) campaignMap[String(c.id)] = String(c.name ?? '');

    const adsetMap: Record<string, { name: string; campaign_id: string }> = {};
    for (const a of adsets) adsetMap[String(a.id)] = { name: String(a.name ?? ''), campaign_id: String(a.campaign_id ?? '') };

    // Upsert each ad
    let upserted = 0;
    for (const ad of ads) {
      const adId = String(ad.id ?? '');
      if (!adId) continue;
      const adsetId = String(ad.adset_id ?? ad.adset_id ?? '');
      const campaignId = String(ad.campaign_id ?? '');
      const adsetInfo = adsetMap[adsetId];
      const campaignName = campaignMap[campaignId] ?? '';

      // Preserve existing destination/trip_type/prefilled_code if already set
      const existing = await prisma.metaAdsMapping.findUnique({ where: { ad_id: adId }, select: { destination: true, trip_type: true, prefilled_code: true } });

      await prisma.metaAdsMapping.upsert({
        where: { ad_id: adId },
        update: {
          ad_name:      String(ad.name ?? ''),
          ad_set_id:    adsetId || null,
          ad_set_name:  adsetInfo?.name || null,
          campaign_id:  campaignId || null,
          campaign_name: campaignName || null,
          is_active:    String(ad.status ?? '').toUpperCase() === 'ACTIVE',
          synced_at:    new Date(),
        },
        create: {
          ad_id:         adId,
          ad_name:       String(ad.name ?? ''),
          ad_set_id:     adsetId || null,
          ad_set_name:   adsetInfo?.name || null,
          campaign_id:   campaignId || null,
          campaign_name: campaignName || null,
          destination:   existing?.destination ?? null,
          trip_type:     existing?.trip_type ?? null,
          prefilled_code: existing?.prefilled_code ?? null,
          is_active:     String(ad.status ?? '').toUpperCase() === 'ACTIVE',
          synced_at:     new Date(),
        },
      });
      upserted++;
    }

    return ok({ synced: upserted, campaigns: campaigns.length, adsets: adsets.length, ads: ads.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[meta/sync]', msg);
    return err(msg, 400);
  }
}
