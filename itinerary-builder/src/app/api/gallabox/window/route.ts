/**
 * POST /api/gallabox/window
 * Returns 24-hour WhatsApp window status for a list of phone numbers.
 * Body: { phones: string[] }
 * Response: { [phone]: { status: 'open'|'expiring'|'closed', minutesLeft: number, lastMessageAt: string|null } }
 *
 * Phone normalization:
 *   Both 91XXXXXXXXXX (12-digit) and XXXXXXXXXX (10-digit) forms are queried
 *   so a stored number 919391203737 matches a lookup for 9391203737 and vice versa.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** Strip ALL non-digits from phone */
function digitsOnly(p: string) { return p.replace(/\D/g, ''); }

/**
 * Return both the 10-digit local form and the 12-digit 91-prefixed form
 * so we match regardless of how the number was stored in the DB.
 */
function phoneVariants(phone: string): string[] {
  const d = digitsOnly(phone);
  if (d.length === 10) return [d, `91${d}`];
  if (d.length === 12 && d.startsWith('91')) return [d, d.slice(2)];
  if (d.length === 11 && d.startsWith('0')) return [d.slice(1), `91${d.slice(1)}`]; // 0XXXXXXXXXX
  return [d]; // unknown format — try as-is
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { phones } = await req.json() as { phones: string[] };
    if (!Array.isArray(phones) || phones.length === 0) {
      return NextResponse.json({ ok: true, data: {} });
    }

    // Build { inputPhone → variants[] } map
    const inputPhones = phones.map(digitsOnly).filter(Boolean);
    const allVariants = Array.from(new Set(inputPhones.flatMap(phoneVariants)));

    // Find ALL messages (any direction) for these phone variants,
    // ordered by created_at desc so we can find the most recent activity
    const rows = await prisma.gallaboxMessage.findMany({
      where: { contact_phone: { in: allVariants } },
      select: {
        contact_phone: true,
        direction: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    console.log(`[gallabox/window] Found ${rows.length} messages for ${allVariants.length} phone variants`);

    // Build a map: canonical-phone → latest timestamp (max of created_at / updated_at)
    // "canonical" = whichever variant was actually stored in DB
    const latestPerVariant = new Map<string, Date>();
    for (const row of rows) {
      if (!row.contact_phone) continue;
      const createdAt  = new Date(row.created_at);
      const updatedAt  = new Date(row.updated_at);
      const msgTime    = createdAt > updatedAt ? createdAt : updatedAt;
      const existing   = latestPerVariant.get(row.contact_phone);
      if (!existing || msgTime > existing) {
        latestPerVariant.set(row.contact_phone, msgTime);
      }
    }

    const now = Date.now();
    const WINDOW_MS   = 24 * 60 * 60 * 1000;  // 24 hours
    const EXPIRING_MS =  2 * 60 * 60 * 1000;  // 2-hour warning

    const result: Record<string, {
      status: 'open' | 'expiring' | 'closed';
      minutesLeft: number;
      lastMessageAt: string | null;
    }> = {};

    for (const inputPhone of inputPhones) {
      // Look across all variants of this input phone
      const variants = phoneVariants(inputPhone);
      let latestDate: Date | null = null;
      for (const v of variants) {
        const d = latestPerVariant.get(v);
        if (d && (!latestDate || d > latestDate)) latestDate = d;
      }

      if (!latestDate) {
        // No messages at all → window closed (they've never messaged us)
        console.log(`[gallabox/window] ${inputPhone}: no messages found → closed`);
        result[inputPhone] = { status: 'closed', minutesLeft: 0, lastMessageAt: null };
        continue;
      }

      const elapsed     = now - latestDate.getTime();
      const remaining   = WINDOW_MS - elapsed;
      const minutesLeft = Math.max(0, Math.floor(remaining / 60000));
      const hoursElapsed = elapsed / 3600000;

      const status: 'open' | 'expiring' | 'closed' =
        remaining <= 0 ? 'closed' : remaining <= EXPIRING_MS ? 'expiring' : 'open';

      console.log(`[gallabox/window] ${inputPhone}: lastMsg=${latestDate.toISOString()} elapsedHrs=${hoursElapsed.toFixed(2)} status=${status} minutesLeft=${minutesLeft}`);

      result[inputPhone] = { status, minutesLeft, lastMessageAt: latestDate.toISOString() };
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    console.error('[gallabox/window]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
