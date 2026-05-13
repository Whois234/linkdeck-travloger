/**
 * POST /api/webhooks/gallabox
 *
 * Diagnostic build — logs RAW headers + full payload before any processing.
 * Timestamps stored in IST (UTC+5:30).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

// ─── Config ──────────────────────────────────────────────────────────────────

const WEBHOOK_SECRET = process.env.GALLABOX_WEBHOOK_SECRET ?? 'travloger2026secret';

// ─── IST helper ──────────────────────────────────────────────────────────────

function nowIST(): Date {
  return new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
}

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

// ─── Event name normalisation ─────────────────────────────────────────────────
// Returns a lowercase-dot key for matching, e.g.:
//   "Message Received"  → "message.received"
//   "Message.Received"  → "message.received"
//   "message_received"  → "message.received"

function normaliseEvent(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '.');   // spaces and underscores → dots
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractText(msg: Record<string, unknown>): string | null {
  const text = msg.text as Record<string, unknown> | undefined;
  if (typeof text?.body === 'string') return text.body;
  if (typeof msg.caption === 'string') return msg.caption;
  if (typeof msg.body    === 'string') return msg.body;
  const interactive = msg.interactive as Record<string, unknown> | undefined;
  if (interactive) {
    const reply = (interactive.button_reply ?? interactive.list_reply) as Record<string, unknown> | undefined;
    if (typeof reply?.title === 'string') return reply.title;
  }
  return null;
}

function extractMediaUrl(msg: Record<string, unknown>): string | null {
  for (const key of ['image', 'video', 'audio', 'document', 'sticker']) {
    const media = msg[key] as Record<string, unknown> | undefined;
    if (typeof media?.link === 'string') return media.link;
    if (typeof media?.url  === 'string') return media.url;
  }
  return null;
}

function normalisePhone(raw: unknown): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  return digits || null;
}

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

  // ════════════════════════════════════════════════════════════
  // STEP 1 — Dump ALL raw headers immediately (before anything)
  // ════════════════════════════════════════════════════════════
  const allHeaders: Record<string, string> = {};
  req.headers.forEach((v, k) => { allHeaders[k] = v; });
  console.log('[gallabox] RAW HEADERS:', JSON.stringify(allHeaders));

  // ════════════════════════════════════════════════════════════
  // STEP 2 — Read raw body (must be before any .json() call)
  // ════════════════════════════════════════════════════════════
  const rawBody = await req.text();
  console.log('[gallabox] RAW BODY (first 500 chars):', rawBody.slice(0, 500));

  // ════════════════════════════════════════════════════════════
  // STEP 3 — Signature check
  // ════════════════════════════════════════════════════════════
  const sig = req.headers.get('x-gallabox-signature');
  if (!verifySignature(rawBody, sig)) {
    console.warn('[gallabox] Signature FAILED. sig=', sig);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  console.log('[gallabox] Signature OK');

  // ════════════════════════════════════════════════════════════
  // STEP 4 — Parse JSON body
  // ════════════════════════════════════════════════════════════
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ════════════════════════════════════════════════════════════
  // STEP 5 — Resolve event type from EVERY possible location
  // ════════════════════════════════════════════════════════════
  // Try every header variant Gallabox might use
  const rawEventFromHeader = (
    req.headers.get('x-gallabox-event')       ??
    req.headers.get('x-gallabox-event-type')  ??
    req.headers.get('x-gallabox-topic')       ??
    req.headers.get('x-webhook-event')        ??
    req.headers.get('x-event-type')           ??
    req.headers.get('event-type')             ??
    null
  );

  // Also try common body fields
  const rawEventFromBody = (
    (payload.event        as string | undefined) ??
    (payload.eventType    as string | undefined) ??
    (payload.type         as string | undefined) ??
    (payload.webhookEvent as string | undefined) ??
    (payload.topic        as string | undefined) ??
    null
  );

  const rawEvent  = rawEventFromHeader ?? rawEventFromBody ?? 'unknown';
  const event     = normaliseEvent(rawEvent);   // lowercase-dot, e.g. "message.received"

  console.log('[gallabox] rawEventFromHeader=', rawEventFromHeader,
              '| rawEventFromBody=', rawEventFromBody,
              '| rawEvent=', rawEvent,
              '| event (normalised)=', event);

  try {

    // ── Message.Received ─────────────────────────────────────────────────────
    if (event === 'message.received') {
      const wa      = (payload.whatsapp ?? {}) as Record<string, unknown>;
      const contact = (payload.contact  ?? {}) as Record<string, unknown>;

      const gallaboxId     = payload.id            as string | undefined;
      const conversationId = payload.conversationId as string | undefined;
      const phone    = normalisePhone(wa.from ?? contact.phone);
      const name     = (contact.name ?? contact.displayName ?? null) as string | null;
      const msgType  = (wa.type ?? wa.messageType ?? null) as string | null;
      const content  = extractText(wa);
      const mediaUrl = extractMediaUrl(wa);
      const waStatus = (wa.status ?? 'received') as string;
      const ist      = nowIST();

      console.log('[gallabox] Message.Received — upsert data:', JSON.stringify({
        gallaboxId, conversationId, phone, name, msgType, content, waStatus,
      }));

      await prisma.gallaboxMessage.upsert({
        where:  { gallabox_id: gallaboxId ?? `recv_${Date.now()}` },
        update: {
          conversation_id: conversationId,
          contact_phone:   phone    ?? undefined,
          contact_name:    name     ?? undefined,
          direction:       'incoming',
          message_type:    msgType  ?? undefined,
          content:         content  ?? undefined,
          media_url:       mediaUrl ?? undefined,
          status:          waStatus,
          event_type:      rawEvent,         // store original casing
          raw_payload:     payload as Prisma.InputJsonValue,
          updated_at:      ist,
        },
        create: {
          gallabox_id:     gallaboxId,
          conversation_id: conversationId,
          contact_phone:   phone,
          contact_name:    name,
          direction:       'incoming',
          message_type:    msgType,
          content,
          media_url:       mediaUrl,
          status:          waStatus,
          event_type:      rawEvent,
          raw_payload:     payload as Prisma.InputJsonValue,
          created_at:      ist,
          updated_at:      ist,
        },
      });

      console.log('[gallabox] Message.Received saved OK');
    }

    // ── Message.Send ─────────────────────────────────────────────────────────
    else if (event === 'message.send') {
      const wa      = (payload.whatsapp ?? payload.message ?? {}) as Record<string, unknown>;
      const contact = (payload.contact ?? {}) as Record<string, unknown>;

      const gallaboxId     = payload.id            as string | undefined;
      const conversationId = payload.conversationId as string | undefined;
      const toPhone  = normalisePhone(wa.to ?? contact.phone ?? payload.to);
      const name     = (contact.name ?? contact.displayName ?? null) as string | null;
      const msgType  = (wa.type ?? wa.messageType ?? null) as string | null;
      const content  = extractText(wa);
      const mediaUrl = extractMediaUrl(wa);
      const waStatus = (wa.status ?? 'sent') as string;
      const ist      = nowIST();

      console.log('[gallabox] Message.Send — upsert data:', JSON.stringify({
        gallaboxId, conversationId, toPhone, name, msgType, content, waStatus,
      }));

      await prisma.gallaboxMessage.upsert({
        where:  { gallabox_id: gallaboxId ?? `send_${Date.now()}` },
        update: {
          conversation_id: conversationId,
          contact_phone:   toPhone  ?? undefined,
          contact_name:    name     ?? undefined,
          direction:       'outgoing',
          message_type:    msgType  ?? undefined,
          content:         content  ?? undefined,
          media_url:       mediaUrl ?? undefined,
          status:          waStatus,
          event_type:      rawEvent,
          raw_payload:     payload as Prisma.InputJsonValue,
          updated_at:      ist,
        },
        create: {
          gallabox_id:     gallaboxId,
          conversation_id: conversationId,
          contact_phone:   toPhone,
          contact_name:    name,
          direction:       'outgoing',
          message_type:    msgType,
          content,
          media_url:       mediaUrl,
          status:          waStatus,
          event_type:      rawEvent,
          raw_payload:     payload as Prisma.InputJsonValue,
          created_at:      ist,
          updated_at:      ist,
        },
      });

      console.log('[gallabox] Message.Send saved OK');
    }

    // ── Contact.Created / Contact.Updated ────────────────────────────────────
    else if (event === 'contact.created' || event === 'contact.updated') {
      const contact = (payload.contact ?? payload) as Record<string, unknown>;
      const gallaboxContactId = (contact.id ?? contact.contactId) as string | undefined;
      const phone  = normalisePhone(contact.phone ?? contact.phoneNumber);
      const name   = (contact.name ?? contact.displayName ?? 'Unknown') as string;
      const email  = (contact.email ?? null) as string | null;

      console.log('[gallabox] Contact event phone=', phone);

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
                name, phone, email,
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
    else if (event === 'conversation.create' || event === 'conversation.update') {
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
            updated_at:   nowIST(),
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

    // ── Broadcast status ──────────────────────────────────────────────────────
    else if (event === 'broadcast.wa.message.status.received') {
      const msgId  = (payload.id ?? payload.messageId) as string | undefined;
      const status = (payload.status ?? payload.deliveryStatus) as string | undefined;
      if (msgId && status) {
        await prisma.gallaboxMessage.upsert({
          where:  { gallabox_id: msgId },
          update: { status, updated_at: nowIST() },
          create: {
            gallabox_id:   msgId,
            direction:     'outgoing',
            status,
            event_type:    rawEvent,
            raw_payload:   payload as Prisma.InputJsonValue,
          },
        });
      }
    }

    // ── Broadcast failed ─────────────────────────────────────────────────────
    else if (event === 'broadcast.wa.message.failed') {
      const msgId  = (payload.id ?? payload.messageId) as string | undefined;
      const reason = (payload.reason ?? payload.errorMessage ?? payload.error) as string | undefined;
      if (msgId) {
        await prisma.gallaboxMessage.upsert({
          where:  { gallabox_id: msgId },
          update: { status: 'failed', failure_reason: reason, updated_at: nowIST() },
          create: {
            gallabox_id:    msgId,
            direction:      'outgoing',
            status:         'failed',
            failure_reason: reason,
            event_type:     rawEvent,
            raw_payload:    payload as Prisma.InputJsonValue,
          },
        });
      }
    }

    // ── Template status ───────────────────────────────────────────────────────
    else if (event === 'template.status') {
      const tplId  = (payload.id ?? payload.templateId) as string | undefined;
      const status = payload.status as string | undefined;
      await prisma.gallaboxTemplate.upsert({
        where:  { gallabox_id: tplId ?? `tpl_${Date.now()}` },
        update: {
          status,
          rejection_reason: (payload.rejectionReason ?? payload.reason) as string | undefined,
          raw_payload:      payload as Prisma.InputJsonValue,
          updated_at:       nowIST(),
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

    // ── CATCH-ALL — saves everything, nothing silently lost ───────────────────
    else {
      console.log('[gallabox] UNHANDLED event — rawEvent=', rawEvent,
                  '| normalised=', event, '| saving to catch-all row');
      const gallaboxId = payload.id as string | undefined;
      await prisma.gallaboxMessage.create({
        data: {
          gallabox_id:     gallaboxId ? `${gallaboxId}_${Date.now()}` : undefined,
          conversation_id: payload.conversationId as string | undefined,
          direction:       'unknown',
          event_type:      rawEvent,    // store the real value even if unmatched
          raw_payload:     payload as Prisma.InputJsonValue,
          created_at:      nowIST(),
          updated_at:      nowIST(),
        },
      });
    }

  } catch (err) {
    console.error('[gallabox] DB error:', err);
    return NextResponse.json({ ok: false, event, error: String(err) }, { status: 200 });
  }

  return NextResponse.json({ ok: true, event }, { status: 200 });
}
