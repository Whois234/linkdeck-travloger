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
  const record = await prisma.vehicleType.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Vehicle Type');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.vehicle_type !== undefined) data.vehicle_type = body.vehicle_type;
    if (body.display_name !== undefined) data.display_name = body.display_name;
    if (body.capacity !== undefined) data.capacity = body.capacity;
    if (body.luggage_capacity !== undefined) data.luggage_capacity = body.luggage_capacity;
    if (body.ac_available !== undefined) data.ac_available = body.ac_available;
    if (body.description !== undefined) data.description = body.description;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.vehicleType.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const record = await prisma.vehicleType.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Vehicle Type');

  await prisma.vehicleType.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Vehicle Type deactivated' });
}
