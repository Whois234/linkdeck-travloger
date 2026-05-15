/**
 * POST /api/webhooks/gallabox
 *
 * Simplified: no event-type branching. Every request is saved to GallaboxMessage
 * regardless of event type. Fields are mapped directly from the confirmed payload shape.
 *
 * Confirmed header: x-event-name (e.g. "Message.Received", "Conversation.Update")
 * Confirmed payload shape:
 * {
 *   id, conversationId, contactId, sender, accountId, channelId,
 *   contact: { id, name, phone: ["919..."] },
 *   whatsapp: { from, type, text: { body }, status, time }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { createContact, updateContact } from '@/lib/contacts/service';

const WEBHOOK_SECRET = process.env.GALLABOX_WEBHOOK_SECRET ?? 'travloger2026secret';

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const incoming = header.startsWith('sha256=') ? header.slice(7) : header;
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(rawBody, 'utf8').digest('base64');
  try {
    return timingSafeEqual(Buffer.from(incoming, 'base64'), Buffer.from(expected, 'base64'));
  } catch {
    return false;
  }
}

function normalisePhone(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const d = raw.replace(/\D/g, '');
  return d || null;
}

export async function POST(req: NextRequest) {
  // 1. Raw body first (required for HMAC)
  const rawBody = await req.text();

  console.log('=== WEBHOOK RECEIVED ===', new Date().toISOString(), 'size:', rawBody.length);

  // 2. Log everything for debugging — full payload, no truncation
  const allHeaders: Record<string, string> = {};
  req.headers.forEach((v, k) => { allHeaders[k] = v; });
  console.log('[gallabox] HEADERS:', JSON.stringify(allHeaders));
  console.log('[gallabox] FULL_BODY:', rawBody); // full — needed to find botFlowId path

  // 3. Signature check
  const sig = req.headers.get('x-gallabox-signature');
  if (!verifySignature(rawBody, sig)) {
    console.warn('[gallabox] Signature FAILED');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 4. Parse JSON
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 5. Get event type from every possible location
  const eventType = (
    req.headers.get('x-event-name')          ??
    req.headers.get('x-gallabox-event')      ??
    req.headers.get('x-gallabox-event-type') ??
    req.headers.get('x-event-type')          ??
    (payload.event        as string | undefined) ??
    (payload.eventType    as string | undefined) ??
    (payload.type         as string | undefined) ??
    'unknown'
  );

  console.log('[gallabox] eventType=', eventType);

  // 6. Extract fields
  const wa      = (payload.whatsapp ?? {})  as Record<string, unknown>;
  const contact = (payload.contact  ?? {})  as Record<string, unknown>;
  const waText  = (wa.text ?? {})           as Record<string, unknown>;

  const gallaboxId     = payload.id            as string | undefined;
  const conversationId = payload.conversationId as string | undefined;

  // Determine direction FIRST — needed for correct phone extraction
  // sender === contactId  →  message came FROM the contact (incoming)
  // sender !== contactId  →  message came FROM us / bot (outgoing)
  const direction =
    payload.sender && payload.contactId && payload.sender === payload.contactId
      ? 'incoming'
      : payload.sender
      ? 'outgoing'
      : 'incoming';

  // Phone = ALWAYS the customer's number stored in contact.phone
  // For incoming: wa.from is the customer (use it as primary, contact.phone as fallback)
  // For outgoing: wa.from is OUR business WhatsApp number — NEVER use it; use contact.phone
  const contactPhoneArr = contact.phone as string[] | string | undefined;
  const contactPhoneRaw = Array.isArray(contactPhoneArr)
    ? contactPhoneArr[0]
    : (contactPhoneArr as string | undefined);

  const phone = normalisePhone(
    direction === 'outgoing'
      ? (contactPhoneRaw ?? wa.from)          // outgoing: contact's phone
      : (wa.from ?? contactPhoneRaw)          // incoming: wa.from (sender = contact)
  );

  // name: contact.name
  const name = (contact.name ?? null) as string | null;

  // message type and content
  const msgType = (wa.type ?? null) as string | null;
  const content = (
    (typeof waText.body === 'string' ? waText.body : null) ??
    (wa.caption as string | null)                          ??
    null
  );

  // status from whatsapp.status — may be null for many event types
  const newStatus = (wa.status ?? null) as string | null;

  const ist = new Date();

  const row = {
    gallabox_id:     gallaboxId,
    conversation_id: conversationId,
    contact_phone:   phone,
    contact_name:    name,
    direction,
    message_type:    msgType,
    content,
    status:          newStatus,
    event_type:      eventType,
    raw_payload:     payload as Prisma.InputJsonValue,
  };

  console.log('[gallabox] Saving row:', JSON.stringify({
    gallaboxId, conversationId, phone, name, msgType, content, status: newStatus, direction, eventType,
  }));

  // Status priority: read > delivered > sent > (null)
  // Never downgrade an existing status to null/lower when upserting
  const STATUS_RANK: Record<string, number> = { sent: 1, delivered: 2, read: 3 };
  const newRank = newStatus ? (STATUS_RANK[newStatus] ?? 0) : 0;

  try {
    if (gallaboxId) {
      await prisma.gallaboxMessage.upsert({
        where:  { gallabox_id: gallaboxId },
        update: {
          // Update all fields except the unique key and created_at
          conversation_id: conversationId,
          contact_phone:   phone,
          contact_name:    name,
          direction,
          message_type:    msgType,
          // Only update content if we have a value (don't wipe existing content)
          ...(content !== null ? { content } : {}),
          // Only upgrade status, never downgrade
          ...(newRank > 0 ? {
            status: newStatus,
          } : {}),
          event_type:  eventType,
          raw_payload: payload as Prisma.InputJsonValue,
          updated_at:  ist,
        },
        create: { ...row, created_at: ist, updated_at: ist },
      });
    } else {
      // No ID → always insert (e.g. some Gallabox events have no message ID)
      await prisma.gallaboxMessage.create({
        data: { ...row, created_at: ist, updated_at: ist },
      });
    }
    console.log('[gallabox] Saved OK — id:', gallaboxId);
  } catch (err) {
    console.error('[gallabox] DB error:', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }

  // Auto-create/update CrmContact for every incoming message from a new number.
  // MUST await — Vercel kills fire-and-forget tasks when the function returns.
  if (direction === 'incoming' && phone) {
    await autoCreateContactFromGallabox(phone, name, payload);
  }

  return NextResponse.json({ ok: true, eventType }, { status: 200 });
}

// ─── Auto-create CrmContact + Lead from incoming Gallabox message ─────────────

async function autoCreateContactFromGallabox(
  phone: string,
  name: string | null,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    // ── Normalise all known wrapper objects ───────────────────────────────────
    const wa           = (payload.whatsapp    ?? payload.message ?? {}) as Record<string, unknown>;
    const conversation = (payload.conversation ?? {}) as Record<string, unknown>;
    const contactObj   = (payload.contact     ?? {}) as Record<string, unknown>;

    // Gallabox puts referral data in multiple locations depending on event type.
    // Check all known paths and use the first non-empty one.
    const referral = (
      (wa.referral      as Record<string, unknown> | undefined)    ??
      (payload.referral as Record<string, unknown> | undefined)    ??
      {}
    ) as Record<string, unknown>;

    // ── Extract botFlowId — check EVERY known path ────────────────────────────
    const botFlowId = (
      payload.botFlowId            ??  // top-level (most common in Gallabox v2)
      payload.flowId               ??  // alternate top-level key
      payload.botFlow              ??  // full object fallback
      conversation.botFlowId       ??  // nested in conversation
      conversation.flowId          ??
      wa.botFlowId                 ??  // nested in whatsapp/message
      contactObj.botFlowId         ??  // nested in contact object
      null
    ) as string | null;

    // ── Extract Gallabox contact ID ───────────────────────────────────────────
    const gallaboxContactId = (
      payload.contactId  ??
      contactObj.id      ??
      null
    ) as string | null;

    // ── Extract ad / referral data (CTWA = Click-to-WhatsApp ads) ────────────
    const adId         = (referral.source_id  ?? null) as string | null;
    const adSourceType = (referral.source_type ?? null) as string | null;
    const adHeadline   = (referral.headline    ?? null) as string | null;
    const adBody       = (referral.body        ?? null) as string | null;
    const ctwaClid     = (referral.ctwa_clid   ?? null) as string | null;
    const refParam     = (referral.ref         ?? null) as string | null;

    // lead_source: 'whatsapp_ad' if came from an ad click, otherwise 'organic'
    const gallaboxSource = (adId || adSourceType === 'AD') ? 'whatsapp_ad' : 'organic';

    // Platform is always WHATSAPP for Gallabox (even for CTWA ads — they come through WhatsApp)
    const adPlatform = 'WHATSAPP';

    // Device platform from source_url: fb.me → ANDROID (Facebook app), instagram.com → IOS (Instagram)
    const sourceUrl = (referral.source_url ?? null) as string | null;
    const srcUrlLower = (sourceUrl ?? '').toLowerCase();
    let devicePlatformFromUrl: 'ANDROID' | 'IOS' | 'MOBILE' | 'DESKTOP' | null = null;
    if (srcUrlLower.includes('instagram.com')) devicePlatformFromUrl = 'IOS';
    else if (srcUrlLower.includes('fb.me') || srcUrlLower.includes('facebook.com')) devicePlatformFromUrl = 'ANDROID';

    // Look up Meta Ads mapping for enrichment
    let metaMapping: { ad_name: string | null; ad_set_id: string | null; ad_set_name: string | null; campaign_id: string | null; campaign_name: string | null; destination: string | null; trip_type: string | null; prefilled_code: string | null } | null = null;
    if (adId) {
      try {
        metaMapping = await prisma.metaAdsMapping.findUnique({
          where: { ad_id: adId },
          select: { ad_name: true, ad_set_id: true, ad_set_name: true, campaign_id: true, campaign_name: true, destination: true, trip_type: true, prefilled_code: true },
        });
        if (metaMapping) console.log('[gallabox/auto-contact] Meta mapping found for ad_id:', adId, JSON.stringify(metaMapping));
        else console.log('[gallabox/auto-contact] No Meta mapping for ad_id:', adId);
      } catch (e) { console.warn('[gallabox/auto-contact] meta mapping lookup failed:', e); }
    }

    // Extract prefilled code from first message body (e.g. "Hi I want Kerala trip #K01" → "K01")
    const waText = (wa.text ?? {}) as Record<string, unknown>;
    const msgBody = (typeof waText.body === 'string' ? waText.body : null) ?? '';
    const prefilledMatch = msgBody.match(/#([A-Z0-9]+)/i);
    const extractedPrefilledCode = prefilledMatch ? prefilledMatch[1].toUpperCase() : (metaMapping?.prefilled_code ?? null);

    const rawOs = (
      contactObj.os     ??
      contactObj.device ??
      wa.os             ??
      wa.device         ??
      referral.os       ??
      null
    ) as string | null;

    let devicePlatform: 'ANDROID' | 'IOS' | 'MOBILE' | 'DESKTOP' = 'MOBILE';
    if (rawOs) {
      const osLower = rawOs.toLowerCase();
      if (osLower.includes('android')) devicePlatform = 'ANDROID';
      else if (osLower.includes('ios') || osLower.includes('iphone') || osLower.includes('ipad')) devicePlatform = 'IOS';
    }

    // ── FULL DIAGNOSTIC LOG ──────────────────────────────────────────────────
    console.log('=== GALLABOX FIELDS EXTRACTED ===', JSON.stringify({
      phone,
      name,
      gallabox_bot_flow_id: botFlowId,
      gallabox_ad_id:       adId,
      lead_source:          gallaboxSource,
      adSourceType,
      adHeadline,
      ctwaClid,
      adPlatform,
      raw_referral:
        Object.keys(referral).length > 0 ? referral
        : wa.referral    ? `wa.referral: ${JSON.stringify(wa.referral)}`
        : payload.referral ? `payload.referral: ${JSON.stringify(payload.referral)}`
        : 'NOT FOUND',
      top_level_keys:      Object.keys(payload).slice(0, 25),
      wa_keys:             Object.keys(wa).slice(0, 20),
      conv_keys:           Object.keys(conversation).slice(0, 10),
      contact_keys:        Object.keys(contactObj).slice(0, 10),
    }));

    // ── Check if contact already exists ──────────────────────────────────────
    const existing = await prisma.crmContact.findUnique({ where: { phone } });

    // If the contact was soft-deleted, restore it so Gallabox re-engagement works
    if (existing?.deleted_at) {
      await prisma.crmContact.update({
        where: { id: existing.id },
        data: { deleted_at: null, updated_at: new Date() },
      });
      console.log('[gallabox/auto-contact] Restored soft-deleted contact:', existing.id, phone);
      // Fall through to enrichment below (treat as existing active contact)
    }

    if (existing) {
      // Always touch updated_at so sort=recent reflects latest Gallabox message activity
      await prisma.crmContact.update({ where: { id: existing.id }, data: { updated_at: new Date() } });

      // Enrich existing contact with any new gallabox fields not yet saved
      const cf = (existing.custom_fields ?? {}) as Record<string, unknown>;
      const newCf: Record<string, unknown> = { ...cf };
      if (botFlowId && !cf.gallabox_bot_flow_id)    newCf.gallabox_bot_flow_id = botFlowId;
      if (adId && !cf.gallabox_ad_id)               newCf.gallabox_ad_id = adId;
      if (adHeadline && !cf.gallabox_ad_headline)   newCf.gallabox_ad_headline = adHeadline;
      if (!cf.gallabox_source)                       newCf.gallabox_source = gallaboxSource;

      const hasCfUpdates = JSON.stringify(newCf) !== JSON.stringify(cf);
      const hasFieldUpdates =
        (adId && !existing.ad_name) ||
        (adHeadline && !existing.campaign_name) ||
        (ctwaClid && !existing.facebook_click_id) ||
        (gallaboxContactId && !existing.gallabox_contact_id) ||
        (metaMapping?.campaign_id && !existing.gallabox_campaign_id) ||
        (metaMapping?.ad_set_id && !existing.gallabox_ad_set_id) ||
        (extractedPrefilledCode && !existing.prefilled_code) ||
        (sourceUrl && !existing.source_url);

      if (hasCfUpdates || hasFieldUpdates) {
        await updateContact(
          existing.id,
          {
            ...(adId && !existing.ad_name                   ? { ad_name:             metaMapping?.ad_name ?? adId } : {}),
            ...(adHeadline && !existing.campaign_name        ? { campaign_name:       metaMapping?.campaign_name ?? adHeadline } : {}),
            ...(ctwaClid && !existing.facebook_click_id      ? { facebook_click_id:   ctwaClid } : {}),
            ...(gallaboxContactId && !existing.gallabox_contact_id ? { gallabox_contact_id: gallaboxContactId } : {}),
            ...(metaMapping?.ad_set_name && !existing.ad_set_name ? { ad_set_name: metaMapping.ad_set_name } : {}),
            ...(metaMapping?.campaign_id && !existing.gallabox_campaign_id ? { gallabox_campaign_id: metaMapping.campaign_id } : {}),
            ...(metaMapping?.ad_set_id && !existing.gallabox_ad_set_id ? { gallabox_ad_set_id: metaMapping.ad_set_id } : {}),
            ...(extractedPrefilledCode && !existing.prefilled_code ? { prefilled_code: extractedPrefilledCode } : {}),
            ...(sourceUrl && !existing.source_url ? { source_url: sourceUrl } : {}),
            ...(metaMapping?.destination && !existing.interested_destination ? { interested_destination: metaMapping.destination } : {}),
            ...(metaMapping?.trip_type && !existing.trip_type ? { trip_type: metaMapping.trip_type } : {}),
            custom_fields: newCf,
          },
          null,
        );
        console.log('[gallabox/auto-contact] Enriched existing contact:', existing.id);
      }
      return;
    }

    // ── Find default owner (first ADMIN) ──────────────────────────────────────
    const admin = await prisma.user.findFirst({
      where:  { role: 'ADMIN', status: true },
      select: { id: true },
    });
    if (!admin) {
      console.warn('[gallabox/auto-contact] No ADMIN user found — cannot create contact');
      return;
    }

    // ── Build custom_fields ───────────────────────────────────────────────────
    const customFields: Record<string, unknown> = {
      gallabox_source: gallaboxSource,
    };
    if (botFlowId)          customFields.gallabox_bot_flow_id = botFlowId;
    if (adId)               customFields.gallabox_ad_id       = adId;
    if (adHeadline)         customFields.gallabox_ad_headline = adHeadline;
    if (adBody)             customFields.gallabox_ad_body     = adBody;
    if (refParam)           customFields.gallabox_ref         = refParam;

    console.log('[gallabox/auto-contact] Creating contact with custom_fields:', JSON.stringify(customFields));

    // ── Create CrmContact — triggers on_create workflows ─────────────────────
    const contact = await createContact(
      {
        phone,
        name:                name?.trim() || 'WhatsApp Lead',
        lead_source:         gallaboxSource,
        platform:            adPlatform,
        device_platform:     devicePlatformFromUrl ?? devicePlatform,
        gallabox_contact_id: gallaboxContactId ?? undefined,
        // From Meta Ads mapping (preferred) OR from Gallabox referral data
        campaign_name:       metaMapping?.campaign_name ?? adHeadline ?? undefined,
        ad_set_name:         metaMapping?.ad_set_name ?? (adSourceType === 'AD' ? 'CTWA' : undefined),
        ad_name:             metaMapping?.ad_name ?? adId ?? undefined,
        facebook_click_id:   ctwaClid ?? undefined,
        // Travel interest from mapping
        interested_destination: metaMapping?.destination ?? undefined,
        trip_type:           metaMapping?.trip_type ?? undefined,
        // New enrichment fields
        gallabox_ad_set_id:   metaMapping?.ad_set_id ?? undefined,
        gallabox_campaign_id: metaMapping?.campaign_id ?? undefined,
        prefilled_code:       extractedPrefilledCode ?? undefined,
        source_url:           sourceUrl ?? undefined,
        custom_fields:        customFields,
        owner_id:             admin.id,
      },
      null,
    );

    console.log('=== CONTACT SAVED ===', JSON.stringify({
      id: contact.id, name: contact.name, phone: contact.phone,
      assigned_to_id: contact.assigned_to_id,
      custom_fields: contact.custom_fields,
    }));

    // createContact() now awaits executeContactWorkflows() before returning.
    // So by this point workflows have already run and assigned_to_id is set in DB.
    // No setTimeout needed — just fetch the updated contact.
    const updatedContact = await prisma.crmContact.findUnique({
      where:  { id: contact.id },
      select: { assigned_to_id: true },
    });
    console.log('[gallabox/auto-contact] Post-workflow assigned_to_id:', updatedContact?.assigned_to_id);

    // ── Auto-create a Lead in the default pipeline ────────────────────────────
    // Only create if no lead exists for this contact yet
    const existingLead = await prisma.lead.findFirst({ where: { crm_contact_id: contact.id } });
    if (!existingLead) {
      // Prefer is_default=true pipeline; fall back to first active pipeline
      const defaultPipeline = await prisma.pipeline.findFirst({
        where:   { status: true, is_default: true },
        include: { stages: { where: { status: true }, orderBy: { order: 'asc' }, take: 1 } },
      }) ?? await prisma.pipeline.findFirst({
        where:   { status: true },
        include: { stages: { where: { status: true }, orderBy: { order: 'asc' }, take: 1 } },
      });

      if (defaultPipeline?.stages[0]) {
        await prisma.lead.create({
          data: {
            name:              `${name ?? 'Lead'} — WhatsApp`,
            phone,
            pipeline_id:       defaultPipeline.id,
            stage_id:          defaultPipeline.stages[0].id,
            owner_id:          admin.id,
            assigned_agent_id: updatedContact?.assigned_to_id ?? admin.id,
            source:            gallaboxSource,
            crm_contact_id:    contact.id,
            status:            'NEW',
          },
        });
        console.log('[gallabox/auto-contact] Created Lead in pipeline:', defaultPipeline.id,
          'assigned_agent:', updatedContact?.assigned_to_id ?? admin.id,
        );
      }
    }
  } catch (e) {
    // Non-critical — log but don't fail the webhook
    console.error('[gallabox/auto-contact] Failed:', e);
  }
}
