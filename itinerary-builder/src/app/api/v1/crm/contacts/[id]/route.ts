import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { z } from 'zod';
import {
  UserRole,
  LeadStage,
  DevicePlatform,
} from '@prisma/client';
import {
  updateContact,
  softDeleteContact,
  DuplicatePhoneError,
  ContactNotFoundError,
} from '@/lib/contacts/service';

// Light HTML strip — defense in depth.
function stripTags(v: string | null | undefined): string {
  if (!v) return '';
  return v.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '').trim();
}
const optionalString = (max: number) =>
  z.string().trim().max(max).transform(stripTags).nullable().optional().or(z.literal('').transform(() => null));

const patchSchema = z.object({
  // Basic
  name:  z.string().trim().min(1).max(120).transform(stripTags).optional(),
  phone: z.string().trim().min(7).max(20).regex(/^[0-9+\-\s()]+$/).optional(),
  email: z.string().trim().email().toLowerCase().nullable().optional().or(z.literal('').transform(() => null)),
  city:  optionalString(80),

  // Travel
  interested_destination: optionalString(120),
  number_of_travellers:   z.number().int().min(1).max(999).nullable().optional(),
  trip_type:              z.string().max(100).nullable().optional(),
  special_requirements:   optionalString(2000),
  budget_per_person:      z.union([z.number(), z.string()]).nullable().optional(),

  // Ad attribution
  lead_source:         z.string().max(100).nullable().optional(),
  platform:            z.string().max(100).nullable().optional(),
  campaign_name:       optionalString(200),
  ad_set_name:         optionalString(200),
  ad_name:             optionalString(200),
  other_ad_details:    z.record(z.unknown()).nullable().optional(),
  device_platform:     z.nativeEnum(DevicePlatform).nullable().optional(),
  facebook_click_id:   optionalString(200),
  facebook_browser_id: optionalString(200),
  google_click_id:     optionalString(200),
  platform_lead_id:    optionalString(200),
  gallabox_contact_id: optionalString(200),

  // CRM
  lead_stage:      z.nativeEnum(LeadStage).optional(),
  assigned_to_id:  z.string().nullable().optional(),
  follow_up_date:  z.union([z.string(), z.null()]).optional(),
  booking_value:   z.union([z.number(), z.string()]).nullable().optional(),
  tags:            z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  do_not_contact:  z.boolean().optional(),

  // Owner reassignment (admin/manager only)
  owner_id: z.string().optional(),

  // Legacy
  source:        optionalString(60),
  notes:         optionalString(2000),
  custom_fields: z.record(z.unknown()).nullable().optional(),
});

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(_req);
  if (!user) return unauthorized();

  const contact = await prisma.crmContact.findUnique({
    where: { id: params.id },
    include: {
      leads: {
        include: {
          stage:    { select: { id: true, name: true, color: true } },
          pipeline: { select: { id: true, name: true } },
          _count:   { select: { call_logs: true, lead_notes: true } },
        },
        orderBy: { created_at: 'desc' },
      },
      assigned_to: { select: { id: true, name: true, email: true, role: true } },
      activities: {
        orderBy: { created_at: 'desc' },
        take: 20,
        include: { performed_by: { select: { id: true, name: true } } },
      },
    },
  });
  if (!contact || contact.deleted_at) return notFound('Contact');

  const owner = await prisma.user.findUnique({ where: { id: contact.owner_id }, select: { id: true, name: true, email: true } });

  // Quotes linked through any of this contact's leads
  const leadIds = contact.leads.map(l => l.id);
  const quotes = leadIds.length
    ? await prisma.quote.findMany({
        where: { lead_id: { in: leadIds } },
        select: {
          id: true,
          quote_number: true,
          quote_type: true,
          status: true,
          start_date: true,
          adults: true,
          public_token: true,
          created_at: true,
          state: { select: { name: true, code: true } },
          quote_options: { select: { final_price: true, is_most_popular: true } },
          events: {
            select: { id: true, event_type: true, metadata: true, created_at: true },
            orderBy: { created_at: 'desc' },
            take: 20,
          },
        },
        orderBy: { created_at: 'desc' },
      })
    : [];

  return ok({ ...contact, owner, quotes });
}

// ─── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const existing = await prisma.crmContact.findUnique({ where: { id: params.id } });
  if (!existing || existing.deleted_at) return notFound('Contact');

  const isOwner = existing.owner_id === user.sub;
  const isAdmin = requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
  if (!isOwner && !isAdmin) return forbidden();

  const body   = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  // Only admin/manager can reassign owner.
  if (parsed.data.owner_id && !isAdmin) return forbidden();
  // owner_id is intentionally NOT routed through the service (service is for
  // automation-eligible fields). Apply it via a separate raw update so the
  // service's transactional guarantees on activity logging still hold for the
  // rest of the patch.
  const ownerChange = parsed.data.owner_id && parsed.data.owner_id !== existing.owner_id
    ? parsed.data.owner_id
    : undefined;
  const patchForService = { ...parsed.data };
  delete (patchForService as Record<string, unknown>).owner_id;

  // Normalize phone if changing.
  if (patchForService.phone) {
    patchForService.phone = patchForService.phone.replace(/[\s\-\(\)]/g, '');
  }

  // Tag whitelist (silently drop unknown tags so the UI never errors on stale tag state).
  if (patchForService.tags) {
    const known = await prisma.contactTag.findMany({ where: { status: true }, select: { name: true } });
    const knownSet = new Set(known.map(k => k.name));
    patchForService.tags = patchForService.tags.filter(t => knownSet.has(t));
  }

  try {
    const updated = await updateContact(params.id, patchForService, user.sub);
    // Apply owner change post-service if requested.
    if (ownerChange) {
      await prisma.crmContact.update({ where: { id: params.id }, data: { owner_id: ownerChange } });
    }
    return ok(updated);
  } catch (e) {
    if (e instanceof DuplicatePhoneError)  return err(e.message, 409);
    if (e instanceof ContactNotFoundError) return notFound('Contact');
    console.error('[contacts/PATCH]', e);
    const msg = e instanceof Error ? e.message : 'Update failed';
    return err(`Could not update contact: ${msg}`, 500);
  }
}

// ─── DELETE (soft) ───────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  try {
    await softDeleteContact(params.id, user.sub);
    return ok({ deleted: true });
  } catch (e) {
    if (e instanceof ContactNotFoundError) return notFound('Contact');
    console.error('[contacts/DELETE]', e);
    const msg = e instanceof Error ? e.message : 'Delete failed';
    return err(`Could not delete contact: ${msg}`, 500);
  }
}
