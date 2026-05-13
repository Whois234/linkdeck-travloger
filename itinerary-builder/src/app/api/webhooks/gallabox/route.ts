/**
 * POST /api/webhooks/gallabox
 *
 * Gallabox sends a FLAT payload (no `event` field in body, no `data` wrapper).
 * The event type comes from the x-gallabox-event header.
 * Signature is HMAC-SHA256(secret, rawBody) encoded as Base64 in x-gallabox-signature.
 *
 * Actual payload shape (Message.Received example):
 * {
 *   "id": "<message_id>",
 *   "conversationId": "<conv_id>",
 *   "contactId": "<contact_id>",
 *   "whatsapp": { "from": "919...", "type": "text", "text": { "body": "..." } },
 *   "contact": { "id": "...", "name": "..." },
 *   "channelId": "..."
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// ─── Config ──────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = process.env.GALLABOX_WEBHOOK_SECRET ?? 'travloger2026secret';

// ─── Signature verification ───────────────────────────────────────────────────

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const incoming = header.startsWith('sha256=') ? header.slice(7) : header;
  const expectedBase64 = createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
  try {
    return timingSafeEqual(
      Buffer.from(incoming,       'base64'),
      Buffer.from(expectedBase64, 'base64'),
    );
  } catch {
    return false;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract plain text from a Gallabox message object (whatsapp sub-object). */
function extractText(msg: Record<string, unknown>): string | null {
  // whatsapp.text.body  (text messages)
  const text = msg.text as Record<string, unknown> | undefined;
  if (typeof text?.body === 'string') return text.body;
  // whatsapp.caption  (image/video captions)
  if (typeof msg.caption === 'string') return msg.caption;
  // whatsapp.body  (some template messages)
  if (typeof msg.body === 'string') return msg.body;
  // interactive reply label
  const interactive = msg.interactive as Record<string, unknown> | undefined;
  if (interactive) {
    const reply = (interactive.button_reply ?? interactive.list_reply) as Record<string, unknown> | undefined;
    if (typeof reply?.title === 'string') return reply.title;
  }
  return null;
}

/** Extract media URL from a Gallabox whatsapp message object. */
function extractMediaUrl(msg: Record<string, unknown>): string | null {
  for (const key of ['image', 'video', 'audio', 'document', 'sticker']) {
    const media = msg[key] as Record<string, unknown> | undefined;
    if (typeof media?.link === 'string') return media.link;
    if (typeof media?.url  === 'string') return media.url;
  }
  return null;
}

/** Strip non-digits; return null if empty. */
function normalisePhone(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits || null;
}

/** Find the oldest ADMIN to use as default owner for webhook-created contacts. */
async function defaultOwnerId(): Promise<string | null> {
  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true },
    orderBy: { created_at: 'asc' },
  });
  return admin?.id ?? null;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Read raw body (must happen before any parsing for HMAC)
  const rawBody = await req.text();
  const sig     = req.headers.get('x-gallabox-signature');

  // 2. Log ALL incoming headers so we can see exactly what Gallabox sends
  const headerDump: Record<string, string> = {};
  req.headers.forEach((v, k) => { headerDump[k] = v; });
  console.log('[gallabox-webhook] headers:', JSON.stringify(headerDump));

  // 3. Verify signature
  if (!verifySignature(rawBody, sig)) {
    console.warn('[gallabox-webhook] Signature verification failed. sig=', sig);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 4. Parse body
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 5. Resolve event type — Gallabox puts it in a header, NOT the body
  const event = (
    req.headers.get('x-gallabox-event')      ??
    req.headers.get('x-gallabox-event-type') ??
    req.headers.get('x-gallabox-topic')      ??
    (payload.event as string | undefined)    ??
    (payload.type  as string | undefined)    ??
    'unknown'
  );

  console.log('[gallabox-webhook] event=', event, '| payload keys:', Object.keys(payload).join(', '));
  console.log('[gallabox-webhook] full payload:', JSON.stringify(payload));

  try {

    // ── Message.Received ─────────────────────────────────────────────────────
    // Payload shape (confirmed from real traffic):
    //   { id, conversationId, contactId,
    //     contact: { id, name },
    //     whatsapp: { from, type, text:{body}, status, time } }
    if (event === 'Message.Received') {
      const wa      = (payload.whatsapp  ?? {}) as Record<string, unknown>;
      const contact = (payload.contact   ?? {}) as Record<string, unknown>;

      const gallaboxId     = payload.id            as string | undefined;
      const conversationId = payload.conversationId as string | undefined;
      const contactId      = payload.contactId      as string | undefined;

      // phone comes from whatsapp.from (e.g. "919391203737")
      const phone = normalisePhone(wa.from ?? contact.phone);
      // name from contact.name
      const name  = (contact.name ?? contact.displayName) as string | undefined;
      // type: "text" | "image" | "audio" | …
      const msgType = (wa.type ?? wa.messageType) as string | undefined;
      // status from whatsapp.status ("received" | "sent" | "delivered" | "read")
      const waStatus = (wa.status ?? 'received') as string;
      // direction: incoming when the sender (whatsapp.from) is the contactId's phone
      // For Message.Received the message always comes FROM the contact → incoming
      const direction = 'incoming';

      console.log('[gallabox-webhook] Message.Received gallaboxId=', gallaboxId,
                  'phone=', phone, 'type=', msgType, 'contactId=', contactId);

      await prisma.gallaboxMessage.upsert({
        where:  { gallabox_id: gallaboxId ?? `recv_${Date.now()}` },
        update: {
          status:     waStatus,
          updated_at: new Date(),
          // also keep these fresh in case name/phone changed
          contact_phone: phone ?? undefined,
          contact_name:  name  ?? undefined,
        },
        create: {
          gallabox_id:     gallaboxId,
          conversation_id: conversationId,
          contact_phone:   phone,
          contact_name:    name,
          direction,
          message_type:    msgType,
          content:         extractText(wa),
          media_url:       extractMediaUrl(wa),
          status:          waStatus,
          event_type:      event,
          raw_payload:     payload as Prisma.InputJsonValue,
        },
      });

      console.log('[gallabox-webhook] Message.Received saved OK — content:', extractText(wa));
    }

    // ── Message.Send ─────────────────────────────────────────────────────────
    // Outgoing: Gallabox → contact. whatsapp.from is the channel number,
    // recipient phone is whatsapp.to OR contact.phone.
    else if (event === 'Message.Send') {
      const wa = (payload.whatsapp ?? payload.message ?? {}) as Record<string, unknown>;

      const gallaboxId     = payload.id            as string | undefined;
      const conversationId = payload.conversationId as string | undefined;
      const contact        = (payload.contact ?? {}) as Record<string, unknown>;
      // For outgoing, recipient is whatsapp.to or contact.phone
      const toPhone  = normalisePhone(wa.to ?? contact.phone ?? payload.to);
      const name     = (contact.name ?? contact.displayName) as string | undefined;
      const msgType  = (wa.type ?? wa.messageType) as string | undefined;
      const waStatus = (wa.status ?? 'sent') as string;

      await prisma.gallaboxMessage.upsert({
        where:  { gallabox_id: gallaboxId ?? `send_${Date.now()}` },
        update: { status: waStatus, updated_at: new Date() },
        create: {
          gallabox_id:     gallaboxId,
          conversation_id: conversationId,
          contact_phone:   toPhone,
          contact_name:    name,
          direction:       'outgoing',
          message_type:    msgType,
          content:         extractText(wa),
          media_url:       extractMediaUrl(wa),
          status:          waStatus,
          event_type:      event,
          raw_payload:     payload as Prisma.InputJsonValue,
        },
      });
    }

    // ── Contact.Created / Contact.Updated ────────────────────────────────────
    else if (event === 'Contact.Created' || event === 'Contact.Updated') {
      // May be flat or nested under payload.contact
      const contact = (payload.contact ?? payload) as Record<string, unknown>;
      const gallaboxContactId = (contact.id ?? contact.contactId) as string | undefined;
      const phone  = normalisePhone(contact.phone ?? contact.phoneNumber);
      const name   = (contact.name ?? contact.displayName ?? 'Unknown') as string;
      const email  = (contact.email ?? null) as string | null;

      console.log('[gallabox-webhook] Contact event phone=', phone, 'gallaboxContactId=', gallaboxContactId);

      if (phone) {
        const existing = await prisma.crmContact.findFirst({
          where: {
            OR: [
              ...(gallaboxContactId ? [{ gallabox_contact_id: gallaboxContactId }] : []),
              { phone },
            ],
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.crmContact.update({
            where: { id: existing.id },
            data: {
              name,
              ...(email ? { email } : {}),
              gallabox_contact_id: gallaboxContactId,
              lead_source: 'WHATSAPP',
            },
          });
        } else {
          const ownerId = await defaultOwnerId();
          if (ownerId) {
            await prisma.crmContact.create({
              data: {
                name,
                phone,
                email,
                owner_id:            ownerId,
                gallabox_contact_id: gallaboxContactId,
                lead_source:         'WHATSAPP',
                source:              'gallabox',
              },
            });
          }
        }
      }
    }

    // ── Conversation.Create / Conversation.Update ─────────────────────────────
    else if (event === 'Conversation.Create' || event === 'Conversation.Update') {
      // May be flat or nested
      const convId  = (payload.id ?? payload.conversationId) as string | undefined;
      const contact = (payload.contact ?? {}) as Record<string, unknown>;
      const phone   = normalisePhone(contact.phone ?? payload.phone);

      if (convId) {
        await prisma.gallaboxConversation.upsert({
          where:  { gallabox_id: convId },
          update: {
            status:       (payload.status ?? payload.state) as string | undefined,
            assigned_to:  (payload.assignedTo ?? payload.agent) as string | undefined,
            contact_name: (contact.name ?? contact.displayName) as string | undefined,
            ...(phone ? { contact_phone: phone } : {}),
            raw_payload:  payload as Prisma.InputJsonValue,
            updated_at:   new Date(),
          },
          create: {
            gallabox_id:   convId,
            contact_phone: phone,
            contact_name:  (contact.name ?? contact.displayName) as string | undefined,
            status:        (payload.status ?? payload.state) as string | undefined,
            channel:       (payload.channel ?? payload.channelId) as string | undefined,
            assigned_to:   (payload.assignedTo ?? payload.agent) as string | undefined,
            raw_payload:   payload as Prisma.InputJsonValue,
          },
        });
      }
    }

    // ── Broadcast.WA.Message.Status.Received ─────────────────────────────────
    else if (event === 'Broadcast.WA.Message.Status.Received') {
      const msgId  = (payload.id ?? payload.messageId) as string | undefined;
      const status = (payload.status ?? payload.deliveryStatus) as string | undefined;

      if (msgId && status) {
        await prisma.gallaboxMessage.upsert({
          where:  { gallabox_id: msgId },
          update: { status, updated_at: new Date() },
          create: {
            gallabox_id:   msgId,
            direction:     'outgoing',
            status,
            event_type:    event,
            raw_payload:   payload as Prisma.InputJsonValue,
          },
        });
      }
    }

    // ── Broadcast.WA.Message.Failed ──────────────────────────────────────────
    else if (event === 'Broadcast.WA.Message.Failed') {
      const msgId  = (payload.id ?? payload.messageId) as string | undefined;
      const reason = (payload.reason ?? payload.errorMessage ?? payload.error) as string | undefined;

      if (msgId) {
        await prisma.gallaboxMessage.upsert({
          where:  { gallabox_id: msgId },
          update: { status: 'failed', failure_reason: reason, updated_at: new Date() },
          create: {
            gallabox_id:    msgId,
            direction:      'outgoing',
            status:         'failed',
            failure_reason: reason,
            event_type:     event,
            raw_payload:    payload as Prisma.InputJsonValue,
          },
        });
      }
    }

    // ── Template.Status ──────────────────────────────────────────────────────
    else if (event === 'Template.Status') {
      const tplId  = (payload.id ?? payload.templateId) as string | undefined;
      const status = (payload.status) as string | undefined;

      await prisma.gallaboxTemplate.upsert({
        where:  { gallabox_id: tplId ?? `tpl_${Date.now()}` },
        update: {
          status,
          rejection_reason: (payload.rejectionReason ?? payload.reason) as string | undefined,
          raw_payload:      payload as Prisma.InputJsonValue,
          updated_at:       new Date(),
        },
        create: {
          gallabox_id:      tplId,
          template_name:    (payload.name ?? payload.templateName) as string | undefined,
          status,
          category:         payload.category as string | undefined,
          language:         (payload.language ?? payload.languageCode) as string | undefined,
          rejection_reason: (payload.rejectionReason ?? payload.reason) as string | undefined,
          raw_payload:      payload as Prisma.InputJsonValue,
        },
      });
    }

    // ── Unknown / catch-all ──────────────────────────────────────────────────
    // Save everything to GallaboxMessage with direction=unknown so nothing is ever lost.
    else {
      console.log('[gallabox-webhook] unhandled event type:', event, '— saving raw payload');
      const gallaboxId = payload.id as string | undefined;
      await prisma.gallaboxMessage.create({
        data: {
          gallabox_id:     gallaboxId ? `${gallaboxId}_${event}` : undefined,
          conversation_id: payload.conversationId as string | undefined,
          direction:       'unknown',
          event_type:      event,
          raw_payload:     payload as Prisma.InputJsonValue,
        },
      });
    }

  } catch (err) {
    console.error('[gallabox-webhook] DB insert error:', err);
    // Still return 200 so Gallabox doesn't retry and flood logs
    return NextResponse.json({ ok: false, event, error: String(err) }, { status: 200 });
  }

  return NextResponse.json({ ok: true, event }, { status: 200 });
}
