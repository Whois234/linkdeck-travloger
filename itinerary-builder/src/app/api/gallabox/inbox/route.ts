/**
 * GET /api/gallabox/inbox
 * Returns all WhatsApp conversations grouped by contact phone,
 * each with last message preview, window status, and contact info.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    // Get the most recent message per unique contact_phone
    // Use a raw approach: get all messages ordered by created_at desc, then group in JS
    const messages = await prisma.gallaboxMessage.findMany({
      orderBy: { created_at: 'desc' },
      take: 2000,
      select: {
        id: true,
        contact_phone: true,
        contact_name: true,
        direction: true,
        content: true,
        message_type: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
    });

    // Group by contact_phone — keep only latest message per contact
    const contactMap = new Map<string, {
      contact_phone: string;
      contact_name: string | null;
      last_message: string | null;
      last_message_type: string | null;
      last_direction: string;
      last_message_at: string;
      total_messages: number;
    }>();

    // Track message counts per phone
    const countMap = new Map<string, number>();

    for (const msg of messages) {
      if (!msg.contact_phone) continue;
      const phone = msg.contact_phone;
      countMap.set(phone, (countMap.get(phone) ?? 0) + 1);
      if (!contactMap.has(phone)) {
        contactMap.set(phone, {
          contact_phone: phone,
          contact_name: msg.contact_name,
          last_message: msg.content,
          last_message_type: msg.message_type,
          last_direction: msg.direction,
          last_message_at: new Date(msg.created_at).toISOString(),
          total_messages: 0, // will set from countMap
        });
      }
    }

    // Compute 24hr window status for each contact
    const WINDOW_MS = 24 * 60 * 60 * 1000;
    const EXPIRING_MS = 2 * 60 * 60 * 1000;
    const now = Date.now();

    // For window: find latest message per phone (any direction) using created_at
    const latestPerPhone = new Map<string, Date>();
    for (const msg of messages) {
      if (!msg.contact_phone) continue;
      const existing = latestPerPhone.get(msg.contact_phone);
      const msgDate = new Date(msg.created_at);
      if (!existing || msgDate > existing) {
        latestPerPhone.set(msg.contact_phone, msgDate);
      }
    }

    const conversations = Array.from(contactMap.values()).map(c => {
      const count = countMap.get(c.contact_phone) ?? 1;
      const lastMsgDate = latestPerPhone.get(c.contact_phone);
      let windowStatus: 'open' | 'expiring' | 'closed' = 'closed';
      let minutesLeft = 0;
      if (lastMsgDate) {
        const elapsed = now - lastMsgDate.getTime();
        const remaining = WINDOW_MS - elapsed;
        minutesLeft = Math.max(0, Math.floor(remaining / 60000));
        if (remaining > 0) {
          windowStatus = remaining <= EXPIRING_MS ? 'expiring' : 'open';
        }
      }
      return {
        ...c,
        total_messages: count,
        window_status: windowStatus,
        minutes_left: minutesLeft,
      };
    });

    // ── Agent filter: non-admin/manager users see only their assigned contacts ──
    const isAdmin = user.role === 'ADMIN' || user.role === 'MANAGER';
    let filtered = conversations;

    if (!isAdmin) {
      const myContacts = await prisma.crmContact.findMany({
        where:  { assigned_to_id: user.sub, deleted_at: null },
        select: { phone: true },
      });
      const myPhones = new Set(myContacts.map(c => c.phone));
      filtered = conversations.filter(c => myPhones.has(c.contact_phone));
    }

    // Sort: open-window contacts first, then by last_message_at desc
    filtered.sort((a, b) => {
      const aOpen = a.window_status === 'open' ? 0 : a.window_status === 'expiring' ? 1 : 2;
      const bOpen = b.window_status === 'open' ? 0 : b.window_status === 'expiring' ? 1 : 2;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });

    return NextResponse.json({ ok: true, data: filtered });
  } catch (err) {
    console.error('[gallabox/inbox]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
