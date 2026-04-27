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
  const record = await prisma.vehiclePackageRate.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Vehicle Rate');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.route_name !== undefined) data.route_name = body.route_name;
    if (body.state_id !== undefined) data.state_id = body.state_id;
    if (body.start_city !== undefined) data.start_city = body.start_city;
    if (body.end_city !== undefined) data.end_city = body.end_city;
    if (body.duration_days !== undefined) data.duration_days = body.duration_days;
    if (body.duration_nights !== undefined) data.duration_nights = body.duration_nights;
    if (body.vehicle_type_id !== undefined) data.vehicle_type_id = body.vehicle_type_id;
    if (body.supplier_id !== undefined) data.supplier_id = body.supplier_id;
    if (body.base_cost !== undefined) data.base_cost = body.base_cost;
    if (body.extra_day_cost !== undefined) data.extra_day_cost = body.extra_day_cost;
    if (body.extra_km_cost !== undefined) data.extra_km_cost = body.extra_km_cost;
    if (body.driver_bata_included !== undefined) data.driver_bata_included = body.driver_bata_included;
    if (body.toll_parking_included !== undefined) data.toll_parking_included = body.toll_parking_included;
    if (body.valid_from !== undefined) data.valid_from = body.valid_from;
    if (body.valid_to !== undefined) data.valid_to = body.valid_to;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.vehiclePackageRate.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const record = await prisma.vehiclePackageRate.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Vehicle Rate');

  await prisma.vehiclePackageRate.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Vehicle Rate deactivated' });
}
