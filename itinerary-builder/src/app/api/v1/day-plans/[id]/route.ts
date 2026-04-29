import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { Prisma, UserRole } from '@prisma/client';

const UpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  short_description: z.string().optional().nullable(),
  default_image: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  status: z.boolean().optional(),
}).passthrough();

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.dayPlan.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Day Plan');

  const { tags, ...rest } = parsed.data;
  const data: Parameters<typeof prisma.dayPlan.update>[0]['data'] = {
    ...rest,
    ...(tags !== undefined ? { tags: tags === null ? Prisma.JsonNull : tags } : {}),
  };
  const updated = await prisma.dayPlan.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();
  const record = await prisma.dayPlan.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Day Plan');
  await prisma.dayPlan.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Day Plan deactivated' });
}
