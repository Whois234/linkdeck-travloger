import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { HotelCategory, HotelType, UserRole, Prisma } from '@prisma/client';

const UpdateSchema = z.object({
  destination_id: z.string().optional(),
  hotel_name: z.string().min(1).optional(),
  hotel_type: z.nativeEnum(HotelType).optional(),
  category_label: z.nativeEnum(HotelCategory).optional(),
  star_rating: z.number().int().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
  hotel_description: z.string().optional().nullable(),
  images: z.array(z.string()).optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const hotel = await prisma.hotel.findUnique({
    where: { id: params.id },
    include: { destination: { select: { id: true, name: true, state: { select: { id: true, name: true } } } } },
  });
  if (!hotel) return notFound('Hotel');
  return ok(hotel);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const hotel = await prisma.hotel.findUnique({ where: { id: params.id } });
  if (!hotel) return notFound('Hotel');

  const { destination_id, amenities, images, ...rest } = parsed.data;
  const updated = await prisma.hotel.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(destination_id ? { destination: { connect: { id: destination_id } } } : {}),
      ...(amenities !== undefined ? { amenities: amenities as Prisma.InputJsonValue } : {}),
      ...(images !== undefined ? { images: images as Prisma.InputJsonValue } : {}),
    },
  });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();
  const hotel = await prisma.hotel.findUnique({ where: { id: params.id } });
  if (!hotel) return notFound('Hotel');
  await prisma.hotel.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Hotel deactivated' });
}
