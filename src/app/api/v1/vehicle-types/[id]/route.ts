import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { revalidateTag } from 'next/cache';

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

  // Duplicate check on update
  const merged = { ...record, ...data };
  const duplicate = await prisma.vehicleType.findFirst({
    where: {
      id:     { not: params.id },
      status: true,
      OR: [
        { vehicle_type: { equals: String(merged.vehicle_type), mode: 'insensitive' } },
        { display_name: { equals: String(merged.display_name), mode: 'insensitive' } },
      ],
    },
  });
  if (duplicate) return err('Duplicate value — a vehicle type with this code or display name already exists.', 409);

  const updated = await prisma.vehicleType.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const record = await prisma.vehicleType.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Vehicle Type');

  // Hard-delete in a transaction:
  // 1. Null out vehicle_type_id on any QuoteOptions that reference this type
  // 2. Delete dependent VehiclePackageRates and Transfers
  // 3. Permanently delete the VehicleType row
  await prisma.$transaction([
    prisma.quoteOption.updateMany({ where: { vehicle_type_id: params.id }, data: { vehicle_type_id: null } }),
    prisma.vehiclePackageRate.deleteMany({ where: { vehicle_type_id: params.id } }),
    prisma.transfer.deleteMany({ where: { vehicle_type_id: params.id } }),
    prisma.vehicleType.delete({ where: { id: params.id } }),
  ]);

  revalidateTag('master-vehicle-types'); // bust cached vehicle-type list
  return ok({ message: 'Vehicle Type permanently deleted' });
}
