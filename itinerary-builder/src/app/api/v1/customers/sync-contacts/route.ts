import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

/**
 * POST /api/v1/customers/sync-contacts
 *
 * One-way sync: for every Customer record that has no matching CrmContact
 * (matched by phone), create a CrmContact so the customer appears in
 * the Contacts/CRM module. Also links the CrmContact → Lead if missing.
 *
 * Safe to call multiple times — skips customers already in contacts.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  // Fetch all customers
  const customers = await prisma.customer.findMany({
    select: {
      id: true, name: true, phone: true, email: true,
      city: true, lead_id: true, created_by: true,
    },
    where: { status: true },
  });

  let created = 0;
  let skipped = 0;
  let linked  = 0;

  for (const cust of customers) {
    if (!cust.phone?.trim()) { skipped++; continue; }

    const normalizedPhone = cust.phone.replace(/[\s\-\(\)]/g, '');

    // Check if a CrmContact already exists for this phone
    const existing = await prisma.crmContact.findFirst({
      where: { OR: [{ phone: normalizedPhone }, { phone: cust.phone }] },
    });

    if (existing) {
      // Contact exists — ensure it's linked to a Lead if one exists for this customer
      if (cust.lead_id && !existing.leads?.length) {
        const lead = await prisma.lead.findUnique({ where: { id: cust.lead_id } });
        if (lead && !lead.crm_contact_id) {
          await prisma.lead.update({
            where: { id: cust.lead_id },
            data: { crm_contact_id: existing.id },
          }).catch(() => {});
          linked++;
        }
      }
      skipped++;
      continue;
    }

    // No contact found — create one
    const ownerId = cust.created_by ?? user.sub;

    // Resolve default pipeline
    const defaultPipeline = await prisma.pipeline.findFirst({ where: { is_default: true, status: true } });
    const firstStage = defaultPipeline
      ? await prisma.pipelineStage.findFirst({
          where: { pipeline_id: defaultPipeline.id, status: true },
          orderBy: { order: 'asc' },
        })
      : null;

    const contact = await prisma.crmContact.create({
      data: {
        name:     cust.name,
        phone:    normalizedPhone,
        email:    cust.email ?? null,
        city:     cust.city ?? null,
        owner_id: ownerId,
      },
    });
    created++;

    // Create a Lead for this contact in the default pipeline if none exists
    let leadId = cust.lead_id;
    if (!leadId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lead = await prisma.lead.create({
        data: {
          name:           cust.name,
          phone:          normalizedPhone,
          crm_contact_id: contact.id,
          pipeline_id:    defaultPipeline?.id ?? null,
          stage_id:       firstStage?.id ?? null,
          owner_id:       ownerId,
        } as any,
      });
      leadId = lead.id;
      linked++;

      // Link customer → lead
      await prisma.customer.update({
        where: { id: cust.id },
        data: { lead_id: leadId },
      }).catch(() => {});
    } else {
      // Lead already exists — link contact to it
      await prisma.lead.update({
        where: { id: leadId },
        data: { crm_contact_id: contact.id },
      }).catch(() => {});
      linked++;
    }
  }

  return ok({
    message: `Sync complete. Created ${created} new contacts, linked ${linked} leads, skipped ${skipped} already-synced.`,
    created,
    skipped,
    linked,
  });
}
