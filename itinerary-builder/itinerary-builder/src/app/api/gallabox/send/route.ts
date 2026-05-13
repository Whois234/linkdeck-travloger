/**
 * POST /api/gallabox/send
 *
 * Send a WhatsApp message (template or free-text) via Gallabox,
 * and save the outgoing message to GallaboxMessage table.
 *
 * Body:
 * {
 *   phone:        string           — recipient phone (digits, e.g. "919391203737")
 *   contactName:  string           — display name
 *   templateName?: string          — if set, sends a template message
 *   variables?:   string[]         — template variable values (in order)
 *   messageText?: string           — if no templateName, sends free text
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppTemplate, sendWhatsAppText, normalisePhone } from '@/lib/gallabox';
import type { Prisma } from '@prisma/client';

function nowIST() {
  return new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    phone:         string;
    contactName?:  string;
    templateName?: string;
    variables?:    string[];
    messageText?:  string;
  };

  const { phone, contactName = 'Customer', templateName, variables = [], messageText } = body;

  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 });
  }
  if (!templateName && !messageText) {
    return NextResponse.json({ error: 'Either templateName or messageText is required' }, { status: 400 });
  }

  const digits = normalisePhone(phone);

  // ── Send via Gallabox ───────────────────────────────────────────────────────
  let result;
  let sentContent: string;

  if (templateName) {
    result      = await sendWhatsAppTemplate(digits, templateName, variables, contactName);
    sentContent = `[Template: ${templateName}] ${variables.join(' | ')}`;
  } else {
    result      = await sendWhatsAppText(digits, messageText!, contactName);
    sentContent = messageText!;
  }

  // ── Save to GallaboxMessage regardless of success (so we have a send record) ─
  const ist = nowIST();
  try {
    await prisma.gallaboxMessage.create({
      data: {
        gallabox_id:   result.messageId,
        contact_phone: digits,
        contact_name:  contactName,
        direction:     'outgoing',
        message_type:  templateName ? 'template' : 'text',
        content:       sentContent,
        status:        result.ok ? 'sent' : 'failed',
        failure_reason: result.ok ? null : (result.error ?? null),
        event_type:    templateName ? 'Message.Send.Template' : 'Message.Send.Text',
        raw_payload:   {
          templateName,
          variables,
          messageText,
          sentBy:    user.sub,
          sentByEmail: user.email,
        } as Prisma.InputJsonValue,
        created_at: ist,
        updated_at: ist,
      },
    });
  } catch (dbErr) {
    console.error('[gallabox/send] DB save error:', dbErr);
    // Don't fail the response — message may have sent OK
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 200 });
  }

  return NextResponse.json({ ok: true, messageId: result.messageId });
}
