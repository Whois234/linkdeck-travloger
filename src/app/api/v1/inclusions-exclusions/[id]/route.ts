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
  const record = await prisma.inclusionExclusion.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Inclusion/Exclusion');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.text !== undefined) data.text = body.text;
    if (body.type !== undefined) data.type = body.type;
    if (body.category !== undefined) data.category = body.category;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.inclusionExclusion.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const record = await prisma.inclusionExclusion.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Inclusion/Exclusion');

  await prisma.inclusionExclusion.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Inclusion/Exclusion deactivated' });
}
