import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const phone = req.nextUrl.searchParams.get('phone');
  if (!phone) return ok({ error: 'Pass ?phone=919849754957' });

  const contact = await prisma.crmContact.findFirst({
    where: { phone: { contains: phone.replace(/\D/g, '').slice(-10) } },
  });

  if (!contact) return notFound('Contact');

  // Also grab last 5 GallaboxMessages for this phone
  const messages = await prisma.gallaboxMessage.findMany({
    where: { contact_phone: { contains: phone.replace(/\D/g, '').slice(-10) } },
    orderBy: { created_at: 'desc' },
    take: 5,
    select: { id: true, event_type: true, direction: true, created_at: true, raw_payload: true },
  });

  // Grab workflow runs for this contact
  const runs = await prisma.workflowRun.findMany({
    where: { contact_id: contact.id },
    orderBy: { created_at: 'desc' },
    take: 10,
    select: { id: true, workflow_id: true, result: true, conditions_matched: true, action_type: true, error: true, created_at: true },
  });

  return ok({
    contact: {
      id:                  contact.id,
      name:                contact.name,
      phone:               contact.phone,
      lead_source:         contact.lead_source,
      platform:            contact.platform,
      campaign_name:       contact.campaign_name,
      ad_name:             contact.ad_name,
      gallabox_contact_id: contact.gallabox_contact_id,
      custom_fields:       contact.custom_fields,
      other_ad_details:    contact.other_ad_details,
      assigned_to_id:      contact.assigned_to_id,
      created_at:          contact.created_at,
      updated_at:          contact.updated_at,
    },
    recent_messages: messages,
    workflow_runs:   runs,
  });
}
