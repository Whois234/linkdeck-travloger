/**
 * POST /api/gallabox/send
 * Sends a WhatsApp message via Gallabox and logs it to GallaboxMessage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendWhatsAppTemplate, sendWhatsAppText, normalisePhone } from '@/lib/gallabox';
import type { Prisma } from '@prisma/client';

export const dynamic = 'force-dynamic';

function nowIST() {
  return new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as {
      phone:         string;
      contactName?:  string;
      templateName?: string;
      variables?:    string[];
      buttonUrl?:    string;   // URL button dynamic parameter
      messageText?:  string;
    };

    const { phone, contactName = 'Customer', templateName, variables = [], buttonUrl, messageText } = body;

    if (!phone) {
      return NextResponse.json({ ok: false, error: 'phone is required' }, { status: 400 });
    }
    if (!templateName && !messageText) {
      return NextResponse.json({ ok: false, error: 'Either templateName or messageText is required' }, { status: 400 });
    }

    const digits = normalisePhone(phone) ?? phone.replace(/\D/g, '');

    // ── Send via Gallabox ─────────────────────────────────────────────────────
    let result;
    let sentContent: string;

    if (templateName) {
      const buttonValues = buttonUrl ? [buttonUrl] : [];
      result      = await sendWhatsAppTemplate(digits, templateName, variables, contactName, 'en', buttonValues);
      sentContent = `[Template: ${templateName}] ${[...variables, ...(buttonUrl ? [`URL:${buttonUrl}`] : [])].join(' | ')}`;
    } else {
      result      = await sendWhatsAppText(digits, messageText!, contactName);
      sentContent = messageText!;
    }

    // ── Save to GallaboxMessage (best-effort, never blocks response) ──────────
    const ist = nowIST();
    prisma.gallaboxMessage.create({
      data: {
        gallabox_id:    result.messageId,
        contact_phone:  digits,
        contact_name:   contactName,
        direction:      'outgoing',
        message_type:   templateName ? 'template' : 'text',
        content:        sentContent,
        status:         result.ok ? 'sent' : 'failed',
        failure_reason: result.ok ? null : (result.error ?? null),
        event_type:     templateName ? 'Message.Send.Template' : 'Message.Send.Text',
        raw_payload:    {
          templateName, variables, messageText,
          sentBy: user.sub, sentByEmail: user.email,
        } as Prisma.InputJsonValue,
        created_at: ist,
        updated_at: ist,
      },
    }).catch(e => console.error('[gallabox/send] DB save error:', e));

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error });
    }
    return NextResponse.json({ ok: true, messageId: result.messageId });

  } catch (err) {
    console.error('[gallabox/send] Unhandled error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
