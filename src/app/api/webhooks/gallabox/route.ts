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

  // 2. Log everything for debugging
  const allHeaders: Record<string, string> = {};
  req.headers.forEach((v, k) => { allHeaders[k] = v; });
  console.log('[gallabox] HEADERS:', JSON.stringify(allHeaders));
  console.log('[gallabox] BODY:', rawBody.slice(0, 600));

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

  return NextResponse.json({ ok: true, eventType }, { status: 200 });
}
