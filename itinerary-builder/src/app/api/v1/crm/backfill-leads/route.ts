/**
 * POST /api/v1/crm/backfill-leads
 *
 * One-time backfill: creates pipeline Lead records for every CrmContact
 * that has no Lead yet. Assigns to the contact's assigned_to_id (if set)
 * or falls back to the first ADMIN.
 *
 * ADMIN only.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, err } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  // Find the default pipeline (or first active if none is marked default)
  const defaultPipeline = await prisma.pipeline.findFirst({
    where:   { is_default: true, status: true },
    include: { stages: { where: { status: true }, orderBy: { order: 'asc' }, take: 1 } },
  }) ?? await prisma.pipeline.findFirst({
    where:   { status: true },
    include: { stages: { where: { status: true }, orderBy: { order: 'asc' }, take: 1 } },
  });

  if (!defaultPipeline?.stages[0]) {
    return err('No active pipeline with stages found. Create a pipeline first.', 400);
  }

  const stageId = defaultPipeline.stages[0].id;

  // Fallback admin
  const admin = await prisma.user.findFirst({
    where:  { role: 'ADMIN', status: true },
    select: { id: true },
  });
  if (!admin) return err('No admin user found', 500);

  // Find contacts that have NO Lead record at all
  const contactsWithoutLeads = await prisma.crmContact.findMany({
    where: {
      deleted_at: null,
      leads:      { none: {} },
    },
    select: {
      id:             true,
      name:           true,
      phone:          true,
      assigned_to_id: true,
      lead_source:    true,
    },
  });

  if (contactsWithoutLeads.length === 0) {
    return ok({ created: 0, message: 'All contacts already have pipeline leads.' });
  }

  let created = 0;
  let failed  = 0;
  const errors: string[] = [];

  for (const contact of contactsWithoutLeads) {
    try {
      await prisma.lead.create({
        data: {
          name:              `${contact.name ?? 'Lead'} — WhatsApp`,
          phone:             contact.phone ?? '',
          pipeline_id:       defaultPipeline.id,
          stage_id:          stageId,
          owner_id:          admin.id,
          assigned_agent_id: contact.assigned_to_id ?? admin.id,
          source:            (contact.lead_source as string | undefined) ?? 'organic',
          crm_contact_id:    contact.id,
          status:            'NEW',
        },
      });
      created++;
    } catch (e) {
      failed++;
      errors.push(`${contact.id}: ${String(e).slice(0, 100)}`);
    }
  }

  return ok({
    created,
    failed,
    total: contactsWithoutLeads.length,
    errors: errors.slice(0, 20),
    message: `Created ${created} lead(s). ${failed} failed.`,
  });
}
