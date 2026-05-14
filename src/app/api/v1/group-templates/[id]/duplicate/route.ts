/**
 * POST /api/v1/group-templates/:id/duplicate
 * Duplicates a group template (with all its days) as a new Draft.
 */

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
  const original = await prisma.groupTemplate.findUnique({
    where: { id: params.id },
    include: {
      group_template_days: { orderBy: { sort_order: 'asc' } },
    },
  });
  if (!original) return notFound('Group Template');

  // Build a unique name: "Copy of X", "Copy 2 of X", etc.
  const baseName = `Copy of ${original.group_template_name}`;
  const existing = await prisma.groupTemplate.count({
    where: { group_template_name: { startsWith: baseName } },
  });
  const newName = existing === 0 ? baseName : `${baseName} (${existing + 1})`;

  // Strip auto-managed fields from parent
  const {
    id: _id, created_at: _ca, updated_at: _ua, deleted_at: _da,
    group_template_days: _days,
    ...templateFields
  } = original;

  const duplicate = await prisma.groupTemplate.create({
    data: {
      ...templateFields,
      group_template_name: newName,
      status:              false,            // always Draft
      created_by:          user.name ?? user.email,
      destinations:        templateFields.destinations        as Prisma.InputJsonValue,
      default_policy_ids:  templateFields.default_policy_ids as Prisma.InputJsonValue ?? undefined,
      gallery_images:      templateFields.gallery_images      as Prisma.InputJsonValue ?? undefined,
      cms_data:            templateFields.cms_data            as Prisma.InputJsonValue ?? undefined,
      deleted_at:          null,

      group_template_days: {
        create: original.group_template_days.map(d => ({
          day_number:           d.day_number,
          destination_id:       d.destination_id,
          title:                d.title,
          day_plan_id:          d.day_plan_id,
          description_override: d.description_override,
          image_override:       d.image_override,
          gallery_images:       d.gallery_images as Prisma.InputJsonValue ?? undefined,
          activities:           d.activities    as Prisma.InputJsonValue ?? undefined,
          transfers:            d.transfers     as Prisma.InputJsonValue ?? undefined,
          meals:                d.meals         as Prisma.InputJsonValue ?? undefined,
          sort_order:           d.sort_order,
        })),
      },
    },
    include: {
      state:              { select: { id: true, name: true } },
      group_template_days: true,
    },
  });

  return created(duplicate);
}
