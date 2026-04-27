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
  const record = await prisma.groupBatch.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Group Batch');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.batch_name !== undefined) data.batch_name = body.batch_name;
    if (body.start_date !== undefined) data.start_date = body.start_date;
    if (body.end_date !== undefined) data.end_date = body.end_date;
    if (body.total_seats !== undefined) data.total_seats = body.total_seats;
    if (body.available_seats !== undefined) data.available_seats = body.available_seats;
    if (body.adult_price !== undefined) data.adult_price = body.adult_price;
    if (body.child_5_12_price !== undefined) data.child_5_12_price = body.child_5_12_price;
    if (body.child_below_5_price !== undefined) data.child_below_5_price = body.child_below_5_price;
    if (body.single_supplement !== undefined) data.single_supplement = body.single_supplement;
    if (body.gst_percent !== undefined) data.gst_percent = body.gst_percent;
    if (body.status !== undefined) data.status = body.status;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.groupBatch.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const record = await prisma.groupBatch.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Group Batch');

  await prisma.groupBatch.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Group Batch deactivated' });
}
