import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, Prisma } from '@prisma/client';

const RoomCategorySchema = z.object({
  room_category_name: z.string().min(1),
  description: z.string().optional().nullable(),
  max_adults: z.number().int().min(1),
  max_children: z.number().int().min(0),
  max_total_occupancy: z.number().int().min(1),
  extra_bed_allowed: z.boolean().optional(),
  cwb_allowed: z.boolean().optional(),
  cwob_allowed: z.boolean().optional(),
  bed_type: z.string().optional().nullable(),
  images: z.array(z.string()).optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const hotel = await prisma.hotel.findUnique({ where: { id: params.id } });
  if (!hotel) return notFound('Hotel');

  const rooms = await prisma.roomCategory.findMany({
    where: { hotel_id: params.id, status: true },
    orderBy: { room_category_name: 'asc' },
  });
  return ok(rooms);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const hotel = await prisma.hotel.findUnique({ where: { id: params.id } });
  if (!hotel) return notFound('Hotel');

  const body = await req.json();
  const parsed = RoomCategorySchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const { images, ...roomRest } = parsed.data;
  const room = await prisma.roomCategory.create({
    data: {
      ...roomRest,
      hotel_id: params.id,
      ...(images !== undefined ? { images: images as Prisma.InputJsonValue } : {}),
    },
  });
  return created(room);
}
