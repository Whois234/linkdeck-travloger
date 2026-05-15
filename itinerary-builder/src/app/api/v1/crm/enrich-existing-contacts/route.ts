import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  // Find contacts that have a gallabox_ad_id in custom_fields but missing mapping enrichment
  const contacts = await prisma.crmContact.findMany({
    where: {
      deleted_at: null,
      OR: [
        { ad_name:    { not: null } },   // has some ad data
        { campaign_name: { not: null } },
      ],
    },
    select: {
      id: true, ad_name: true, campaign_name: true, ad_set_name: true,
      custom_fields: true, gallabox_campaign_id: true, gallabox_ad_set_id: true,
      interested_destination: true, trip_type: true, prefilled_code: true,
    },
  });

  let enriched = 0;
  let skipped  = 0;

  for (const contact of contacts) {
    const cf = (contact.custom_fields ?? {}) as Record<string, unknown>;
    const adId = (cf.gallabox_ad_id ?? cf.gallabox_source_id ?? '') as string;
    if (!adId) { skipped++; continue; }

    const mapping = await prisma.metaAdsMapping.findUnique({ where: { ad_id: adId } });
    if (!mapping) { skipped++; continue; }

    const patch: Record<string, unknown> = {};
    if (mapping.campaign_name && !contact.campaign_name)         patch.campaign_name      = mapping.campaign_name;
    if (mapping.ad_set_name   && !contact.ad_set_name)           patch.ad_set_name        = mapping.ad_set_name;
    if (mapping.ad_name       && !contact.ad_name)               patch.ad_name            = mapping.ad_name;
    if (mapping.campaign_id   && !contact.gallabox_campaign_id)  patch.gallabox_campaign_id = mapping.campaign_id;
    if (mapping.ad_set_id     && !contact.gallabox_ad_set_id)    patch.gallabox_ad_set_id   = mapping.ad_set_id;
    if (mapping.destination   && !contact.interested_destination) patch.interested_destination = mapping.destination;
    if (mapping.trip_type     && !contact.trip_type)             patch.trip_type           = mapping.trip_type;
    if (mapping.prefilled_code && !contact.prefilled_code)       patch.prefilled_code      = mapping.prefilled_code;

    if (Object.keys(patch).length > 0) {
      await prisma.crmContact.update({ where: { id: contact.id }, data: patch });
      enriched++;
    } else {
      skipped++;
    }
  }

  return ok({ total: contacts.length, enriched, skipped });
}
