import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  trip_id_prefix: z.string().optional(),
  description: z.string().optional().nullable(),
  hero_image: z.string().url().optional().nullable(),
  status: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const state = await prisma.state.findUnique({ where: { id: params.id } });
  if (!state) return notFound('State');

  const updated = await prisma.state.update({ where: { id: params.id }, data: parsed.data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const state = await prisma.state.findUnique({ where: { id: params.id } });
  if (!state) return notFound('State');

  await prisma.state.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'State deactivated' });
}
