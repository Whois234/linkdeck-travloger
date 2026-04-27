import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, Prisma } from '@prisma/client';

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  short_description: z.string().optional().nullable(),
  long_description: z.string().optional().nullable(),
  best_season: z.string().optional().nullable(),
  ideal_nights: z.number().int().positive().optional().nullable(),
  hero_image: z.string().url().optional().nullable(),
  gallery_images: z.array(z.string()).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  status: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const dest = await prisma.destination.findUnique({ where: { id: params.id } });
  if (!dest) return notFound('Destination');

  const { gallery_images, tags, ...rest } = parsed.data;
  const updated = await prisma.destination.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(gallery_images !== undefined ? { gallery_images: gallery_images as Prisma.InputJsonValue } : {}),
      ...(tags !== undefined ? { tags: tags as Prisma.InputJsonValue } : {}),
    },
  });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const dest = await prisma.destination.findUnique({ where: { id: params.id } });
  if (!dest) return notFound('Destination');

  await prisma.destination.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Destination deactivated' });
}
