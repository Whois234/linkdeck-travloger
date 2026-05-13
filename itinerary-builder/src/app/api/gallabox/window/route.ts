/**
 * POST /api/gallabox/window
 * Returns 24-hour WhatsApp window status for a list of phone numbers.
 * Body: { phones: string[] }
 * Response: { [phone]: { status: 'open'|'expiring'|'closed', minutesLeft: number, lastMessageAt: string|null } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { phones } = await req.json() as { phones: string[] };
    if (!Array.isArray(phones) || phones.length === 0) {
      return NextResponse.json({ ok: true, data: {} });
    }

    // Normalise phones to digits-only
    const normalised = phones.map(p => p.replace(/\D/g, '')).filter(Boolean);

    // Find the latest INCOMING message per phone
    const rows = await prisma.gallaboxMessage.findMany({
      where: {
        contact_phone: { in: normalised },
        direction: 'incoming',
      },
      select: { contact_phone: true, updated_at: true },
      orderBy: { updated_at: 'desc' },
    });

    // Group: keep only the most recent per phone
    const latestPerPhone = new Map<string, Date>();
    for (const row of rows) {
      if (row.contact_phone && !latestPerPhone.has(row.contact_phone)) {
        latestPerPhone.set(row.contact_phone, new Date(row.updated_at));
      }
    }

    const now = Date.now();
    const WINDOW_MS = 24 * 60 * 60 * 1000;   // 24 hours
    const EXPIRING_MS = 2 * 60 * 60 * 1000;  // 2 hours warning

    const result: Record<string, {
      status: 'open' | 'expiring' | 'closed';
      minutesLeft: number;
      lastMessageAt: string | null;
    }> = {};

    for (const phone of normalised) {
      const lastMsg = latestPerPhone.get(phone) ?? null;
      if (!lastMsg) {
        result[phone] = { status: 'closed', minutesLeft: 0, lastMessageAt: null };
        continue;
      }
      const elapsed    = now - lastMsg.getTime();
      const remaining  = WINDOW_MS - elapsed;
      const minutesLeft = Math.max(0, Math.floor(remaining / 60000));

      result[phone] = {
        status:        remaining <= 0 ? 'closed' : remaining <= EXPIRING_MS ? 'expiring' : 'open',
        minutesLeft,
        lastMessageAt: lastMsg.toISOString(),
      };
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error('[gallabox/window]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
