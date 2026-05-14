import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '10'), 50);

  const rows = await prisma.gallaboxMessage.findMany({
    orderBy: { created_at: 'desc' },
    take: limit,
    select: {
      id: true,
      gallabox_id: true,
      contact_phone: true,
      contact_name: true,
      direction: true,
      event_type: true,
      created_at: true,
      raw_payload: true,
    },
  });

  // For each payload, surface the fields we care about for debugging
  const enriched = rows.map(r => {
    const p = (r.raw_payload ?? {}) as Record<string, unknown>;
    const wa  = (p.whatsapp ?? p.message ?? {}) as Record<string, unknown>;
    const ref = (
      (wa.referral   as Record<string, unknown>) ??
      (p.referral    as Record<string, unknown>) ??
      {}
    );
    const conv = (p.conversation ?? {}) as Record<string, unknown>;
    const contact = (p.contact ?? {}) as Record<string, unknown>;

    return {
      ...r,
      _extracted: {
        botFlowId:   p.botFlowId ?? p.flowId ?? conv.botFlowId ?? wa.botFlowId ?? contact.botFlowId ?? null,
        adId:        ref.source_id ?? null,
        adSourceType: ref.source_type ?? null,
        adHeadline:  ref.headline ?? null,
        ctwaClid:    ref.ctwa_clid ?? null,
        referralFound: JSON.stringify(ref) !== '{}',
        waKeys:      Object.keys(wa),
        topKeys:     Object.keys(p).slice(0, 20),
      },
    };
  });

  return ok({ count: enriched.length, logs: enriched });
}
