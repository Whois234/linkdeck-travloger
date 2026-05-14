import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const record = await prisma.activity.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Activity');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.destination_id !== undefined) data.destination_id = body.destination_id;
    if (body.supplier_id !== undefined) data.supplier_id = body.supplier_id;
    if (body.activity_name !== undefined) data.activity_name = body.activity_name;
    if (body.activity_type !== undefined) data.activity_type = body.activity_type;
    if (body.duration !== undefined) data.duration = body.duration;
    if (body.description !== undefined) data.description = body.description;
    if (body.inclusions !== undefined) data.inclusions = body.inclusions;
    if (body.adult_cost !== undefined) data.adult_cost = body.adult_cost;
    if (body.child_cost !== undefined) data.child_cost = body.child_cost;
    if (body.rate_type !== undefined) data.rate_type = body.rate_type;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.activity.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const record = await prisma.activity.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Activity');

  await prisma.activity.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Activity deactivated' });
}
