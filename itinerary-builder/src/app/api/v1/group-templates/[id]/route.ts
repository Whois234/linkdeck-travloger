import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const record = await prisma.groupTemplate.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Group Template');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.group_template_name !== undefined) data.group_template_name = body.group_template_name;
    if (body.state_id !== undefined) data.state_id = body.state_id;
    if (body.duration_days !== undefined) data.duration_days = body.duration_days;
    if (body.duration_nights !== undefined) data.duration_nights = body.duration_nights;
    if (body.hero_image !== undefined) data.hero_image = body.hero_image;
    if (body.status !== undefined) data.status = body.status;

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
