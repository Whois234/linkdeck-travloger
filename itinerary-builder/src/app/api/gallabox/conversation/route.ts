/**
 * GET /api/gallabox/conversation?phone=919391203737
 * Returns the full WhatsApp message history for a phone number.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const phone = req.nextUrl.searchParams.get('phone')?.replace(/\D/g, '') ?? '';
    if (!phone) return NextResponse.json({ ok: false, error: 'phone required' }, { status: 400 });

    const messages = await prisma.gallaboxMessage.findMany({
      where: { contact_phone: phone },
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

    return NextResponse.json({ ok: true, data: messages });
  } catch (err) {
    console.error('[gallabox/conversation]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
