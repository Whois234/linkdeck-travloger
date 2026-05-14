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

  // Auto-create/update CrmContact for every incoming message from a new number
  if (direction === 'incoming' && phone) {
    void autoCreateContactFromGallabox(phone, name, payload);
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
    const wa           = (payload.whatsapp    ?? {}) as Record<string, unknown>;
    const referral     = (wa.referral         ?? {}) as Record<string, unknown>;
    const conversation = (payload.conversation ?? {}) as Record<string, unknown>;

    // ── Extract botFlowId from every known Gallabox payload location ──────────
    // Gallabox puts this in different places depending on event type + version
    const botFlowId = (
      payload.botFlowId        ??  // top-level (most common)
      payload.flowId           ??  // alternate key
      conversation.botFlowId   ??  // nested in conversation object
      wa.botFlowId             ??  // nested in whatsapp object
      payload.botFlow          ??  // some versions use full object
      null
    ) as string | null;

    // ── Extract Gallabox contact ID ───────────────────────────────────────────
    const gallaboxContactId = (
      payload.contactId  ??
      (payload.contact as Record<string, unknown>)?.id ??
      null
    ) as string | null;

    // ── Extract ad / referral data (CTWA = Click-to-WhatsApp ads) ────────────
    const adId          = (referral.source_id    ?? null) as string | null;
    const adSourceType  = (referral.source_type  ?? null) as string | null; // 'AD' | 'POST'
    const adHeadline    = (referral.headline     ?? null) as string | null; // Facebook ad headline
    const adBody        = (referral.body         ?? null) as string | null;
    const ctwaClid      = (referral.ctwa_clid    ?? null) as string | null; // Facebook click ID
    const refParam      = (referral.ref          ?? null) as string | null;

    // lead_source: 'whatsapp_ad' if came from an ad click, otherwise 'organic'
    const gallaboxSource = (adId || adSourceType === 'AD') ? 'whatsapp_ad' : 'organic';

    // platform is always WHATSAPP for Gallabox contacts
    // device_platform: MOBILE if ctwa_clid (click from phone) else MOBILE (WhatsApp is always mobile)
    const devicePlatform: 'MOBILE' | 'DESKTOP' = 'MOBILE';

    console.log('[gallabox/auto-contact] Extracted fields:', JSON.stringify({
      phone, name, botFlowId, gallaboxContactId,
      adId, adHeadline, ctwaClid, gallaboxSource, devicePlatform,
      refParam, adSourceType,
    }));

    // ── Check if contact already exists ──────────────────────────────────────
    const existing = await prisma.crmContact.findUnique({ where: { phone } });

    if (existing) {
      // Enrich existing contact with any new gallabox fields not yet saved
      const cf = (existing.custom_fields ?? {}) as Record<string, unknown>;
      const updatePatch: Record<string, unknown> = {};

      if (botFlowId && !cf.gallabox_bot_flow_id)    updatePatch['custom_fields.gallabox_bot_flow_id'] = botFlowId;
      if (adId && !existing.ad_name)                updatePatch.ad_name = adId;
      if (adHeadline && !existing.campaign_name)    updatePatch.campaign_name = adHeadline;
      if (ctwaClid && !existing.facebook_click_id)  updatePatch.facebook_click_id = ctwaClid;
      if (gallaboxContactId && !existing.gallabox_contact_id) updatePatch.gallabox_contact_id = gallaboxContactId;

      const hasCfUpdates = botFlowId && !cf.gallabox_bot_flow_id;
      const hasFieldUpdates = Object.keys(updatePatch).some(k => !k.startsWith('custom_fields.'));

      if (hasCfUpdates || hasFieldUpdates) {
        const newCf: Record<string, unknown> = { ...cf };
        if (botFlowId && !cf.gallabox_bot_flow_id)    newCf.gallabox_bot_flow_id = botFlowId;
        if (adId && !cf.gallabox_ad_id)               newCf.gallabox_ad_id = adId;
        if (adHeadline && !cf.gallabox_ad_headline)   newCf.gallabox_ad_headline = adHeadline;
        if (!cf.gallabox_source)                       newCf.gallabox_source = gallaboxSource;

        await updateContact(
          existing.id,
          {
            ...(adId && !existing.ad_name           ? { ad_name:             adId        } : {}),
            ...(adHeadline && !existing.campaign_name ? { campaign_name:     adHeadline  } : {}),
            ...(ctwaClid && !existing.facebook_click_id ? { facebook_click_id: ctwaClid  } : {}),
            ...(gallaboxContactId && !existing.gallabox_contact_id ? { gallabox_contact_id: gallaboxContactId } : {}),
            custom_fields: newCf,
          },
          null,
        );
        console.log('[gallabox/auto-contact] Updated existing contact:', existing.id);
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
        platform:            'WHATSAPP',          // always WhatsApp for Gallabox contacts
        device_platform:     devicePlatform,      // MOBILE (WhatsApp is always mobile)
        gallabox_contact_id: gallaboxContactId ?? undefined,
        campaign_name:       adHeadline ?? undefined,  // Facebook ad headline → campaign
        ad_name:             adId       ?? undefined,  // Ad ID → ad_name
        ad_set_name:         adSourceType === 'AD' ? 'CTWA' : undefined,
        facebook_click_id:   ctwaClid   ?? undefined,  // CTWA click ID
        custom_fields:       customFields,
        owner_id:            admin.id,
      },
      null,
    );

    console.log('[gallabox/auto-contact] Created CrmContact:', contact.id,
      'botFlowId:', botFlowId,
      'custom_fields:', JSON.stringify(contact.custom_fields),
    );

    // ── Auto-create a Lead in the default pipeline ────────────────────────────
    const defaultPipeline = await prisma.pipeline.findFirst({
      where:   { is_default: true, status: true },
      include: { stages: { where: { status: true }, orderBy: { order: 'asc' }, take: 1 } },
    });

    if (defaultPipeline?.stages[0]) {
      // Wait a short moment then fetch the contact to get workflow-assigned user
      await new Promise(r => setTimeout(r, 500));
      const updatedContact = await prisma.crmContact.findUnique({
        where:  { id: contact.id },
        select: { assigned_to_id: true },
      });

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
  } catch (e) {
    // Non-critical — log but don't fail the webhook
    console.error('[gallabox/auto-contact] Failed:', e);
  }
}
