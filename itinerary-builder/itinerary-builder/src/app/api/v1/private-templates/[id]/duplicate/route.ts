import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { created, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, Prisma } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  // Fetch original with all related data
  const original = await prisma.privateTemplate.findUnique({
    where: { id: params.id },
    include: {
      template_days: { orderBy: { sort_order: 'asc' } },
      template_hotel_tiers: { orderBy: [{ tier_name: 'asc' }, { sort_order: 'asc' }] },
    },
  });
  if (!original) return notFound('Private Template');

  // Determine a unique name: "Copy of X", "Copy 2 of X", etc.
  const baseName = `Copy of ${original.template_name}`;
  const existing = await prisma.privateTemplate.count({ where: { template_name: { startsWith: baseName } } });
  const newName = existing === 0 ? baseName : `${baseName} (${existing + 1})`;

  // Destructure fields to copy — omit id, created_at, updated_at
  const {
    id: _id, created_at: _ca, updated_at: _ua,
    template_days: _td, template_hotel_tiers: _tht,
    ...templateFields
  } = original;

  const duplicate = await prisma.privateTemplate.create({
    data: {
      ...templateFields,
      template_name: newName,
      status: false, // always start as Draft
      created_by: user.name ?? user.email,
      destinations: templateFields.destinations as Prisma.InputJsonValue,
      default_inclusion_ids: templateFields.default_inclusion_ids as Prisma.InputJsonValue ?? undefined,
      default_exclusion_ids: templateFields.default_exclusion_ids as Prisma.InputJsonValue ?? undefined,
      default_policy_ids: templateFields.default_policy_ids as Prisma.InputJsonValue ?? undefined,
      cms_data: templateFields.cms_data as Prisma.InputJsonValue ?? undefined,
      // Copy child records
      template_days: {
        create: original.template_days.map(d => ({
          day_number:           d.day_number,
          destination_id:       d.destination_id,
          night_destination_id: d.night_destination_id,
          title:                d.title,
          day_plan_id:          d.day_plan_id,
          description_override: d.description_override,
          image_override:       d.image_override,
          gallery_images:       d.gallery_images as Prisma.InputJsonValue ?? undefined,
          activities:           d.activities as Prisma.InputJsonValue ?? undefined,
          transfers:            d.transfers as Prisma.InputJsonValue ?? undefined,
          meals:                d.meals as Prisma.InputJsonValue ?? undefined,
          sort_order:           d.sort_order,
        })),
      },
      template_hotel_tiers: {
        create: original.template_hotel_tiers.map(t => ({
          tier_name:                t.tier_name,
          destination_id:           t.destination_id,
          default_hotel_id:         t.default_hotel_id,
          default_room_category_id: t.default_room_category_id,
          default_meal_plan_id:     t.default_meal_plan_id,
          nights:                   t.nights,
          sort_order:               t.sort_order,
        })),
      },
    },
    include: {
      state: { select: { id: true, name: true } },
      template_days: true,
      template_hotel_tiers: true,
    },
  });

  return created(duplicate);
}
