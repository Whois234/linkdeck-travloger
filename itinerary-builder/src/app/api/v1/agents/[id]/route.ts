import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const body = await req.json();
  const record = await prisma.agent.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Agent');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.role !== undefined) data.role = body.role;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.whatsapp !== undefined) data.whatsapp = body.whatsapp;
    if (body.email !== undefined) data.email = body.email;
    if (body.designation !== undefined) data.designation = body.designation;
    if (body.speciality !== undefined) data.speciality = body.speciality;
    if (body.rating !== undefined) data.rating = body.rating;
    if (body.years_experience !== undefined) data.years_experience = body.years_experience;
    if (body.available_hours !== undefined) data.available_hours = body.available_hours;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.agent.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const record = await prisma.agent.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Agent');

  await prisma.agent.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Agent deactivated' });
}
