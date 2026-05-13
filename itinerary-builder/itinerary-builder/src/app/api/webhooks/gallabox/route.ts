/**
 * POST /api/webhooks/gallabox
 *
 * Receives signed webhook events from Gallabox and persists them to the DB.
 * Signature verification: HMAC-SHA256(secret, rawBody) must equal the value
 * in the x-gallabox-signature header (hex-encoded).
 *
 * Handled events:
 *   Message.Received              → gallabox_messages (direction=incoming)
 *   Message.Send                  → gallabox_messages (direction=outgoing)
 *   Contact.Created               → upsert CrmContact via gallabox_contact_id
 *   Contact.Updated               → upsert CrmContact via gallabox_contact_id
 *   Conversation.Create           → upsert gallabox_conversations
 *   Conversation.Update           → upsert gallabox_conversations
 *   Broadcast.WA.Message.Status.Received → update status on gallabox_messages
 *   Broadcast.WA.Message.Failed   → log failure reason on gallabox_messages
 *   Template.Status               → upsert gallabox_templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';

// ─── Config ──────────────────────────────────────────────────────────────────

// Hardcoded fallback ensures it works even if env var is not set in Vercel yet.
// After confirming data flows, set GALLABOX_WEBHOOK_SECRET in Vercel env and remove the fallback.
const WEBHOOK_SECRET = process.env.GALLABOX_WEBHOOK_SECRET ?? 'travloger2026secret';

// ─── Signature verification ───────────────────────────────────────────────────

function verifySignature(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  // Strip "sha256=" prefix if present
  const incoming = header.startsWith('sha256=') ? header.slice(7) : header;

  // Gallabox encodes the HMAC-SHA256 digest as Base64 (not hex).
  // Example header value: "0bXiIAwZFpXfPPka/hb80IPps8n/ijycougsRbqV2y4="
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

function extractText(message: Record<string, unknown>): string | null {
  if (message.text && typeof (message.text as Record<string, unknown>).body === 'string') {
    return (message.text as Record<string, unknown>).body as string;
  }
  if (typeof message.body === 'string') return message.body;
  if (typeof message.caption === 'string') return message.caption;
  return null;
}

function extractMediaUrl(message: Record<string, unknown>): string | null {
  for (const key of ['image', 'video', 'audio', 'document', 'sticker']) {
    const media = message[key] as Record<string, unknown> | undefined;
    if (media?.link) return media.link as string;
    if (media?.url) return media.url as string;
  }
  return null;
}

/** Normalise a phone number to E.164-ish (strip leading country code extras but keep digits). */
function normalisePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  // Return as-is; CrmContact.phone is stored without formatting in this codebase
  return digits;
}

/** Find the first ADMIN user to act as default owner for webhook-created contacts. */
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
  // 1. Read raw body text (needed for HMAC before parsing JSON)
  const rawBody = await req.text();
  const sig     = req.headers.get('x-gallabox-signature');

  // 2. Verify signature — return 401 on mismatch
  if (!verifySignature(rawBody, sig)) {
    console.warn('[gallabox-webhook] Signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // 3. Parse body
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = (payload.event ?? payload.type ?? '') as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data  = (payload.data ?? payload) as Record<string, any>;

  console.log(`[gallabox-webhook] event=${event}`);

  try {
    // ── Message.Received ───────────────────────────────────────────────────
    if (event === 'Message.Received') {
      const msg     = (data.message ?? {}) as Record<string, unknown>;
      const contact = (data.contact ?? {}) as Record<string, unknown>;
      const conv    = (data.conversation ?? {}) as Record<string, unknown>;

      const gallaboxId    = (msg.id ?? msg.messageId) as string | undefined;
      const conversationId = (conv.id ?? data.conversationId) as string | undefined;
      const phone         = normalisePhone((contact.phone ?? msg.from) as string);
      const name          = (contact.name ?? contact.displayName) as string | undefined;

      await prisma.gallaboxMessage.upsert({
        where:  { gallabox_id: gallaboxId ?? `recv_${Date.now()}` },
        update: { status: 'received', updated_at: new Date() },
        create: {
          gallabox_id:     gallaboxId,
          conversation_id: conversationId,
          contact_phone:   phone,
          contact_name:    name,
          direction:       'incoming',
          message_type:    (msg.type ?? msg.messageType) as string | undefined,
          content:         extractText(msg),
          media_url:       extractMediaUrl(msg),
          status:          'received',
          event_type:      event,
          raw_payload:     payload as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    }

    // ── Message.Send ───────────────────────────────────────────────────────
    else if (event === 'Message.Send') {
      const msg  = (data.message ?? {}) as Record<string, unknown>;
      const gallaboxId = (msg.id ?? msg.messageId) as string | undefined;
      const toPhone    = normalisePhone((msg.to ?? data.to) as string);

      await prisma.gallaboxMessage.upsert({
        where:  { gallabox_id: gallaboxId ?? `send_${Date.now()}` },
        update: { status: 'sent', updated_at: new Date() },
        create: {
          gallabox_id:     gallaboxId,
          conversation_id: (data.conversationId ?? data.conversation?.id) as string | undefined,
          contact_phone:   toPhone,
          contact_name:    (data.contact?.name ?? data.recipientName) as string | undefined,
          direction:       'outgoing',
          message_type:    (msg.type ?? msg.messageType) as string | undefined,
          content:         extractText(msg),
          media_url:       extractMediaUrl(msg),
          status:          'sent',
          event_type:      event,
          raw_payload:     payload as import("@prisma/client").Prisma.InputJsonValue,
        },
      });
    }

    // ── Contact.Created / Contact.Updated ──────────────────────────────────
    else if (event === 'Contact.Created' || event === 'Contact.Updated') {
      const contact = (data.contact ?? data) as Record<string, unknown>;
      const gallaboxContactId = (contact.id ?? contact.contactId) as string | undefined;
      const phone    = normalisePhone((contact.phone ?? contact.phoneNumber) as string);
      const name     = (contact.name ?? contact.displayName ?? 'Unknown') as string;
      const email    = (contact.email ?? null) as string | null;

      if (phone) {
        // Upsert into CrmContact by gallabox_contact_id first, then by phone
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
          // Update existing contact
          await prisma.crmContact.update({
            where: { id: existing.id },
            data: {
              name,
              ...(email ? { email } : {}),
              gallabox_contact_id: gallaboxContactId,
              lead_source: 'WHATSAPP' as string,
            },
          });
        } else {
          // Create new contact — need a default owner
          const ownerId = await defaultOwnerId();
          if (ownerId) {
            await prisma.crmContact.create({
              data: {
                name,
                phone,
                email,
                owner_id:           ownerId,
                gallabox_contact_id: gallaboxContactId,
                lead_source:        'WHATSAPP' as string,
                source:             'gallabox',
              },
            });
          }
        }
      }
    }

    // ── Conversation.Create / Conversation.Update ──────────────────────────
    else if (event === 'Conversation.Create' || event === 'Conversation.Update') {
      const conv    = (data.conversation ?? data) as Record<string, unknown>;
      const convId  = (conv.id ?? conv.conversationId) as string;
      const contact = (conv.contact ?? data.contact ?? {}) as Record<string, unknown>;
      const phone   = normalisePhone((contact.phone ?? conv.phone) as string);

      if (convId) {
        await prisma.gallaboxConversation.upsert({
          where:  { gallabox_id: convId },
          update: {
            status:       (conv.status ?? conv.state) as string | undefined,
            assigned_to:  (conv.assignedTo ?? conv.agent ?? conv.agentName) as string | undefined,
            contact_name: (contact.name ?? contact.displayName) as string | undefined,
            ...(phone ? { contact_phone: phone } : {}),
            raw_payload:  payload as import("@prisma/client").Prisma.InputJsonValue,
            updated_at:   new Date(),
          },
          create: {
            gallabox_id:  convId,
            contact_phone: phone,
            contact_name: (contact.name ?? contact.displayName) as string | undefined,
            status:       (conv.status ?? conv.state) as string | undefined,
            channel:      (conv.channel ?? conv.channelType) as string | undefined,
            assigned_to:  (conv.assignedTo ?? conv.agent ?? conv.agentName) as string | undefined,
            raw_payload:  payload as import("@prisma/client").Prisma.InputJsonValue,
          },
        });
      }
    }

    // ── Broadcast.WA.Message.Status.Received ──────────────────────────────
    else if (event === 'Broadcast.WA.Message.Status.Received') {
      const msg    = (data.message ?? data) as Record<string, unknown>;
      const msgId  = (msg.id ?? msg.messageId ?? data.messageId) as string | undefined;
      const status = (msg.status ?? data.status) as string | undefined;

      if (msgId && status) {
        // Update by gallabox_id; create a stub row if not seen before
        await prisma.gallaboxMessage.upsert({
          where:  { gallabox_id: msgId },
          update: { status, updated_at: new Date() },
          create: {
            gallabox_id:   msgId,
            direction:     'outgoing',
            status,
            event_type:    event,
            raw_payload:   payload as import("@prisma/client").Prisma.InputJsonValue,
          },
        });
      }
    }

    // ── Broadcast.WA.Message.Failed ────────────────────────────────────────
    else if (event === 'Broadcast.WA.Message.Failed') {
      const msg    = (data.message ?? data) as Record<string, unknown>;
      const msgId  = (msg.id ?? msg.messageId ?? data.messageId) as string | undefined;
      const reason = (data.reason ?? data.errorMessage ?? data.error ?? msg.failureReason) as string | undefined;

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
            raw_payload:    payload as import('@prisma/client').Prisma.InputJsonValue,
          },
        });
      }
    }

    // ── Template.Status ────────────────────────────────────────────────────
    else if (event === 'Template.Status') {
      const tpl    = (data.template ?? data) as Record<string, unknown>;
      const tplId  = (tpl.id ?? tpl.templateId) as string | undefined;
      const status = (tpl.status ?? data.status) as string | undefined;

      await prisma.gallaboxTemplate.upsert({
        where:  { gallabox_id: tplId ?? `tpl_${Date.now()}` },
        update: {
          status,
          rejection_reason: (tpl.rejectionReason ?? tpl.reason ?? data.reason) as string | undefined,
          raw_payload:      payload as import('@prisma/client').Prisma.InputJsonValue,
          updated_at:       new Date(),
        },
        create: {
          gallabox_id:      tplId,
          template_name:    (tpl.name ?? tpl.templateName) as string | undefined,
          status,
          category:         (tpl.category) as string | undefined,
          language:         (tpl.language ?? tpl.languageCode) as string | undefined,
          rejection_reason: (tpl.rejectionReason ?? tpl.reason ?? data.reason) as string | undefined,
          raw_payload:      payload as import('@prisma/client').Prisma.InputJsonValue,
        },
      });
    }

    else {
      // Unknown event — log and acknowledge so Gallabox doesn't retry
      console.log(`[gallabox-webhook] unhandled event: ${event}`);
    }

  } catch (err) {
    console.error('[gallabox-webhook] DB error:', err);
    // Return 200 anyway to prevent Gallabox retry storms; errors are logged
    return NextResponse.json({ ok: false, error: 'Internal error — logged' }, { status: 200 });
  }

  return NextResponse.json({ ok: true, event }, { status: 200 });
}
