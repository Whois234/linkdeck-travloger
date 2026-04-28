import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, Prisma } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const tpl = await prisma.groupTemplate.findUnique({
    where: { id: params.id },
    include: {
      state: { select: { id: true, name: true } },
      group_template_days: { orderBy: { sort_order: 'asc' } },
      group_batches: { where: { status: true }, orderBy: { start_date: 'asc' } },
    },
  });
  if (!tpl) return notFound('Group Template');
  return ok(tpl);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS, UserRole.SALES)) return forbidden();

  const body = await req.json();
  const record = await prisma.groupTemplate.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Group Template');

  const data: Record<string, unknown> = {};
  if (body.group_template_name !== undefined) data.group_template_name = body.group_template_name;
  if (body.state_id            !== undefined) data.state_id            = body.state_id;
  if (body.destinations        !== undefined) data.destinations        = body.destinations as Prisma.InputJsonValue;
  if (body.duration_days       !== undefined) data.duration_days       = body.duration_days;
  if (body.duration_nights     !== undefined) data.duration_nights     = body.duration_nights;
  if (body.theme               !== undefined) data.theme               = body.theme;
  if (body.start_city          !== undefined) data.start_city          = body.start_city;
  if (body.end_city            !== undefined) data.end_city            = body.end_city;
  if (body.default_policy_ids  !== undefined) data.default_policy_ids  = body.default_policy_ids as Prisma.InputJsonValue;
  if (body.hero_image          !== undefined) data.hero_image          = body.hero_image;
  if (body.gallery_images      !== undefined) data.gallery_images      = body.gallery_images as Prisma.InputJsonValue;
  if (body.cms_data            !== undefined) data.cms_data            = body.cms_data as Prisma.InputJsonValue;
  if (body.status              !== undefined) data.status              = body.status;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);
  const updated = await prisma.groupTemplate.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();
  const record = await prisma.groupTemplate.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Group Template');
  await prisma.groupTemplate.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Group Template deactivated' });
}
