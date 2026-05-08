import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  state_id: z.string().min(1).optional(),
  status: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const rawBody = await req.json();
  const body = cleanBody(rawBody);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const city = await prisma.city.update({ where: { id: params.id }, data: parsed.data });
  return ok(city);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  await prisma.city.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'City deactivated' });
}
