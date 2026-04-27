import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const body = await req.json();
  const record = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Lead');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.email !== undefined) data.email = body.email;
    if (body.source !== undefined) data.source = body.source;
    if (body.destination_interest !== undefined) data.destination_interest = body.destination_interest;
    if (body.travel_month !== undefined) data.travel_month = body.travel_month;
    if (body.budget_range !== undefined) data.budget_range = body.budget_range;
    if (body.status !== undefined) data.status = body.status;
    if (body.assigned_agent_id !== undefined) data.assigned_agent_id = body.assigned_agent_id;
    if (body.notes !== undefined) data.notes = body.notes;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.lead.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const record = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Lead');

  await prisma.lead.delete({ where: { id: params.id } });
  return ok({ message: 'Lead deleted' });
}
