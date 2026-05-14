/**
 * GET /api/gallabox/conversation?phone=919391203737
 * Returns the full WhatsApp message history for a phone number.
 *
 * Phone normalization: queries both 91XXXXXXXXXX and XXXXXXXXXX forms
 * so stored numbers match regardless of whether the leading 91 was recorded.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function digitsOnly(p: string) { return p.replace(/\D/g, ''); }

function phoneVariants(phone: string): string[] {
  const d = digitsOnly(phone);
  if (d.length === 10) return [d, `91${d}`];
  if (d.length === 12 && d.startsWith('91')) return [d, d.slice(2)];
  if (d.length === 11 && d.startsWith('0')) return [d.slice(1), `91${d.slice(1)}`];
  return [d];
}

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const rawPhone = req.nextUrl.searchParams.get('phone') ?? '';
    if (!rawPhone) return NextResponse.json({ ok: false, error: 'phone required' }, { status: 400 });

    const variants = phoneVariants(rawPhone);
    console.log(`[gallabox/conversation] phone="${rawPhone}" variants=${variants.join(',')}`);

    const messages = await prisma.gallaboxMessage.findMany({
      where: { contact_phone: { in: variants } },
      orderBy: { created_at: 'asc' },
      take: 200,
      select: {
        id: true,
        gallabox_id: true,
        direction: true,
        message_type: true,
        content: true,
        status: true,
        event_type: true,
        created_at: true,
        contact_name: true,
      },
    });

    console.log(`[gallabox/conversation] Found ${messages.length} messages for variants [${variants.join(', ')}]`);

    return NextResponse.json({ ok: true, data: messages });
  } catch (err) {
    console.error('[gallabox/conversation]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
