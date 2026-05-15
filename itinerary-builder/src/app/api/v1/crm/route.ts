/**
 * POST /api/v1/crm/rerun-workflows
 *
 * Re-evaluates on_create workflows for contacts that are still assigned to Admin
 * and have lead_source = 'whatsapp_ad'. Used to retroactively assign ad leads
 * that missed the workflow at creation time (e.g. before condition fix).
 *
 * Safe to run multiple times — only processes contacts matching the filter.
 * Pass `?dry_run=1` to preview without making changes.
 */

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { executeContactWorkflows } from '@/lib/contacts/service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';

  // Find the admin user id — contacts assigned here are "unassigned" effectively
  const admin = await prisma.user.findFirst({
    where:  { role: 'ADMIN', status: true },
    select: { id: true, name: true },
  });

  // Target: all active ad contacts regardless of assignment —
  // re-running workflows is idempotent (worst case: same agent gets re-assigned)
  const contacts = await prisma.crmContact.findMany({
    where: {
      deleted_at:  null,
      lead_source: { in: ['whatsapp_ad', 'CTWA', 'ctwa'] },
    },
    select: { id: true, name: true, phone: true, assigned_to_id: true, lead_source: true },
    orderBy: { created_at: 'desc' },
    take: 200, // safety cap
  });

  const results: { id: string; name: string; action: string }[] = [];

  for (const c of contacts) {
    if (dryRun) {
      results.push({ id: c.id, name: c.name ?? '', action: `dry_run — would rerun (assigned_to: ${c.assigned_to_id ?? 'none'})` });
      continue;
    }

    try {
      await executeContactWorkflows(c.id, 'on_create');
      results.push({ id: c.id, name: c.name ?? '', action: 'rerun OK' });
    } catch (e) {
      results.push({ id: c.id, name: c.name ?? '', action: `error: ${String(e).slice(0, 80)}` });
    }
  }

  return ok({
    dry_run:   dryRun,
    processed: results.length,
    admin_id:  admin?.id,
    results,
  });
}
