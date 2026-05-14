/**
 * POST /api/v1/public/contacts/webhook/gallabox
 *
 * Public endpoint (no auth) that receives Gallabox CTWA webhook payloads.
 * Maps fields, dedupes by phone, and ALWAYS returns 200 OK — webhooks should
 * never block on internal errors (Gallabox would retry indefinitely).
 *
 * Optional security: if GALLABOX_WEBHOOK_SECRET is set, requests must include
 * a matching `x-webhook-secret` header. We log to the server (not the response)
 * so attackers can't probe.
 */

export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { upsertContactFromGallabox } from '@/lib/contacts/service';
import { UserRole } from '@prisma/client';

interface GallaboxPayload {
  // Field names vary by Gallabox config — we accept the common variants.
  name?: string;
  full_name?: string;
  fullName?: string;
  phone?: string;
  phoneNumber?: string;
  mobile?: string;
  email?: string;
  contact_id?: string;
  contactId?: string;
  gallabox_contact_id?: string;
  campaign_name?: string;
  campaignName?: string;
  ad_set_name?: string;
  adSetName?: string;
  ad_name?: string;
  adName?: string;
  fbclid?: string;
  facebook_click_id?: string;
  fbp?: string;
  facebook_browser_id?: string;
  timestamp?: string;
  created_at?: string;
  // Gallabox-specific custom fields used for workflow conditions
  gallabox_bot_flow_id?: string;
  gallaboxBotFlowId?: string;
  bot_flow_id?: string;
  gallabox_ad_id?: string;
  gallaboxAdId?: string;
  gallabox_source?: string;
  gallaboxSource?: string;
  gallabox_ad_headline?: string;
  gallaboxAdHeadline?: string;
  // Anything else goes into other_ad_details
  [k: string]: unknown;
}

function pickPhone(p: GallaboxPayload): string | null {
  const raw = p.phone ?? p.phoneNumber ?? p.mobile;
  if (!raw) return null;
  return String(raw).replace(/[\s\-\(\)]/g, '');
}

function pickName(p: GallaboxPayload): string | null {
  return (p.full_name ?? p.fullName ?? p.name ?? null) as string | null;
}

/** Resolve a sensible owner for webhook-created contacts. */
async function getSystemOwnerId(): Promise<string | null> {
  // Prefer the oldest active ADMIN; fall back to oldest active user of any role.
  const admin = await prisma.user.findFirst({
    where: { status: true, role: UserRole.ADMIN },
    orderBy: { created_at: 'asc' },
    select: { id: true },
  });
  if (admin) return admin.id;
  const any = await prisma.user.findFirst({
    where: { status: true },
    orderBy: { created_at: 'asc' },
    select: { id: true },
  });
  return any?.id ?? null;
}

export async function POST(req: NextRequest) {
  // Optional shared-secret check.
  const expectedSecret = process.env.GALLABOX_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = req.headers.get('x-webhook-secret');
    if (got !== expectedSecret) {
      // eslint-disable-next-line no-console
      console.warn('[gallabox] rejected webhook with missing/invalid secret');
      return new Response(JSON.stringify({ success: true, received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  let payload: GallaboxPayload;
  try {
    payload = (await req.json()) as GallaboxPayload;
  } catch {
    return new Response(JSON.stringify({ success: true, received: true, note: 'no-json-body' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const phone = pickPhone(payload);
  if (!phone) {
    // eslint-disable-next-line no-console
    console.warn('[gallabox] webhook missing phone', payload);
    return new Response(JSON.stringify({ success: true, received: true, note: 'no-phone' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ownerId = await getSystemOwnerId();
  if (!ownerId) {
    // eslint-disable-next-line no-console
    console.error('[gallabox] no active user to attribute webhook contact to');
    return new Response(JSON.stringify({ success: true, received: true, note: 'no-owner' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extract Gallabox-specific custom fields for workflow condition matching.
  const gallaboxCustomFields: Record<string, unknown> = {};
  const botFlowId = payload.gallabox_bot_flow_id ?? payload.gallaboxBotFlowId ?? payload.bot_flow_id ?? null;
  const adId      = payload.gallabox_ad_id ?? payload.gallaboxAdId ?? null;
  const gbSource  = payload.gallabox_source ?? payload.gallaboxSource ?? null;
  const adHeadline = payload.gallabox_ad_headline ?? payload.gallaboxAdHeadline ?? null;
  if (botFlowId)   gallaboxCustomFields.gallabox_bot_flow_id  = String(botFlowId);
  if (adId)        gallaboxCustomFields.gallabox_ad_id         = String(adId);
  if (gbSource)    gallaboxCustomFields.gallabox_source        = String(gbSource);
  if (adHeadline)  gallaboxCustomFields.gallabox_ad_headline   = String(adHeadline);

  // Bundle anything we didn't recognize into other_ad_details for forensic value.
  const KNOWN_KEYS = new Set([
    'name', 'full_name', 'fullName', 'phone', 'phoneNumber', 'mobile', 'email',
    'contact_id', 'contactId', 'gallabox_contact_id',
    'campaign_name', 'campaignName', 'ad_set_name', 'adSetName', 'ad_name', 'adName',
    'fbclid', 'facebook_click_id', 'fbp', 'facebook_browser_id',
    'timestamp', 'created_at',
    'gallabox_bot_flow_id', 'gallaboxBotFlowId', 'bot_flow_id',
    'gallabox_ad_id', 'gallaboxAdId',
    'gallabox_source', 'gallaboxSource',
    'gallabox_ad_headline', 'gallaboxAdHeadline',
  ]);
  const otherAdDetails: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (!KNOWN_KEYS.has(k) && v !== undefined && v !== null && v !== '') otherAdDetails[k] = v;
  }

  try {
    const { contact, created } = await upsertContactFromGallabox({
      name:                pickName(payload),
      phone,
      email:               (payload.email ?? null) as string | null,
      gallabox_contact_id: (payload.gallabox_contact_id ?? payload.contact_id ?? payload.contactId ?? null) as string | null,
      campaign_name:       (payload.campaign_name ?? payload.campaignName ?? null) as string | null,
      ad_set_name:         (payload.ad_set_name   ?? payload.adSetName    ?? null) as string | null,
      ad_name:             (payload.ad_name       ?? payload.adName       ?? null) as string | null,
      facebook_click_id:   (payload.facebook_click_id ?? payload.fbclid ?? null) as string | null,
      facebook_browser_id: (payload.facebook_browser_id ?? payload.fbp ?? null) as string | null,
      other_ad_details:    Object.keys(otherAdDetails).length > 0 ? otherAdDetails : null,
      created_at:          (payload.created_at ?? payload.timestamp ?? null) as string | null,
      gallabox_custom_fields: Object.keys(gallaboxCustomFields).length > 0 ? gallaboxCustomFields : null,
      system_owner_id:     ownerId,
    });

    return new Response(JSON.stringify({ success: true, received: true, contact_id: contact.id, created }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[gallabox] upsert failed:', e, 'payload:', payload);
    // Still 200 so Gallabox doesn't retry forever; the error is captured server-side.
    return new Response(JSON.stringify({ success: true, received: true, note: 'logged' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
