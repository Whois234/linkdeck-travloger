import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

/**
 * GET /api/v1/crm/contacts/stats
 * Returns accurate contact counts for the stats bar — independent of pagination.
 * Respects the same role-based data isolation as the main contacts list.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const isPrivileged = requireRole(user, UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.OPS);
  const ownerScope = isPrivileged ? {} : { owner_id: user.sub };
  const base = { ...ownerScope, deleted_at: null };

  const [total, withPipeline, withoutPipeline, untouched] = await Promise.all([
    prisma.crmContact.count({ where: base }),
    prisma.crmContact.count({
      where: { ...base, leads: { some: { pipeline_id: { not: null } } } },
    }),
    prisma.crmContact.count({
      where: { ...base, NOT: { leads: { some: { pipeline_id: { not: null } } } } },
    }),
    prisma.crmContact.count({
      where: {
        ...base,
        NOT: { leads: { some: { OR: [{ call_logs: { some: {} } }, { lead_notes: { some: {} } }] } } },
      },
    }),
  ]);

  return ok({ total, withPipeline, withoutPipeline, untouched });
}
