import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, Prisma } from '@prisma/client';

const UpdateSchema = z.object({
  room_category_name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  max_adults: z.number().int().min(1).optional(),
  max_children: z.number().int().min(0).optional(),
  max_total_occupancy: z.number().int().min(1).optional(),
  extra_bed_allowed: z.boolean().optional(),
  cwb_allowed: z.boolean().optional(),
  cwob_allowed: z.boolean().optional(),
  bed_type: z.string().optional().nullable(),
  images: z.array(z.string()).optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string; categoryId: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const room = await prisma.roomCategory.findFirst({
    where: { id: params.categoryId, hotel_id: params.id },
    include: {
      hotel_rates: {
        where: { status: true },
        include: { meal_plan: true },
        orderBy: { valid_from: 'asc' },
      },
    },
  });
  if (!room) return notFound('Room Category');
  return ok(room);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string; categoryId: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const room = await prisma.roomCategory.findFirst({ where: { id: params.categoryId, hotel_id: params.id } });
  if (!room) return notFound('Room Category');

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const { images, ...rest } = parsed.data;
  const updated = await prisma.roomCategory.update({
    where: { id: params.categoryId },
    data: {
      ...rest,
      ...(images !== undefined ? { images: images as Prisma.InputJsonValue } : {}),
    },
  });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; categoryId: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const room = await prisma.roomCategory.findFirst({ where: { id: params.categoryId, hotel_id: params.id } });
  if (!room) return notFound('Room Category');

  await prisma.roomCategory.update({ where: { id: params.categoryId }, data: { status: false } });
  return ok({ message: 'Room category deactivated' });
}
