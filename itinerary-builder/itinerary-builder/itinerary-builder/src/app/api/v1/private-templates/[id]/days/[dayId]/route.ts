import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function PUT(req: NextRequest, { params }: { params: { id: string; dayId: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS, UserRole.SALES)) return forbidden();

  const day = await prisma.templateDay.findFirst({ where: { id: params.dayId, template_id: params.id } });
  if (!day) return notFound('Day');

  const body = await req.json();
  const updated = await prisma.templateDay.update({
    where: { id: params.dayId },
    data: {
      title: body.title ?? day.title,
      destination_id: body.destination_id ?? day.destination_id,
      night_destination_id: body.night_destination_id ?? day.night_destination_id,
      day_plan_id: body.day_plan_id ?? day.day_plan_id,
      description_override: body.description_override ?? day.description_override,
      image_override: body.image_override ?? day.image_override,
      activities: body.activities ?? day.activities,
      transfers: body.transfers ?? day.transfers,
      meals: body.meals ?? day.meals,
    },
  });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; dayId: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();
  const day = await prisma.templateDay.findFirst({ where: { id: params.dayId, template_id: params.id } });
  if (!day) return notFound('Day');
  await prisma.templateDay.delete({ where: { id: params.dayId } });
  return ok({ message: 'Day deleted' });
}
