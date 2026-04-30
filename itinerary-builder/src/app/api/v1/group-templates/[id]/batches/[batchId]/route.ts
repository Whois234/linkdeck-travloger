import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, GroupBatchStatus } from '@prisma/client';

export async function PUT(req: NextRequest, { params }: { params: { id: string; batchId: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS, UserRole.SALES)) return forbidden();

  const batch = await prisma.groupBatch.findFirst({ where: { id: params.batchId, group_template_id: params.id } });
  if (!batch) return notFound('Batch');

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.batch_name          !== undefined) data.batch_name          = body.batch_name;
  if (body.start_date          !== undefined) data.start_date          = new Date(body.start_date);
  if (body.end_date            !== undefined) data.end_date            = new Date(body.end_date);
  if (body.total_seats         !== undefined) data.total_seats         = body.total_seats;
  if (body.available_seats     !== undefined) data.available_seats     = body.available_seats;
  if (body.adult_price         !== undefined) data.adult_price         = body.adult_price;
  if (body.child_5_12_price    !== undefined) data.child_5_12_price    = body.child_5_12_price;
  if (body.child_below_5_price !== undefined) data.child_below_5_price = body.child_below_5_price;
  if (body.single_supplement   !== undefined) data.single_supplement   = body.single_supplement;
  if (body.gst_percent         !== undefined) data.gst_percent         = body.gst_percent;
  if (body.booking_status      !== undefined) data.booking_status      = body.booking_status as GroupBatchStatus;
  if (body.badge_text          !== undefined) data.badge_text          = body.badge_text;
  if (body.badge_color         !== undefined) data.badge_color         = body.badge_color;
  if (body.assigned_agent_id   !== undefined) data.assigned_agent_id   = body.assigned_agent_id;

  const updated = await prisma.groupBatch.update({ where: { id: params.batchId }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; batchId: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();
  const batch = await prisma.groupBatch.findFirst({ where: { id: params.batchId, group_template_id: params.id } });
  if (!batch) return notFound('Batch');
  await prisma.groupBatch.update({ where: { id: params.batchId }, data: { status: false } });
  return ok({ message: 'Batch deactivated' });
}
