import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, HotelType, HotelCategory } from '@prisma/client';

const HotelSchema = z.object({
  destination_id: z.string(),
  supplier_id: z.string().optional().nullable(),
  hotel_name: z.string().min(1),
  hotel_type: z.nativeEnum(HotelType),
  star_rating: z.number().int().min(1).max(5).optional().nullable(),
  category_label: z.nativeEnum(HotelCategory),
  address: z.string().optional().nullable(),
  map_link: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().optional().nullable(),
  check_in_time: z.string().optional().nullable(),
  check_out_time: z.string().optional().nullable(),
  amenities: z.array(z.string()).optional().nullable(),
  hotel_description: z.string().optional().nullable(),
  images: z.array(z.string()).optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const destination_id = searchParams.get('destination_id');
  const category = searchParams.get('category') as HotelCategory | null;

  const hotels = await prisma.hotel.findMany({
    where: {
      status: true,
      ...(destination_id ? { destination_id } : {}),
      ...(category ? { category_label: category } : {}),
    },
    include: {
      destination: { select: { name: true, state: { select: { name: true } } } },
      room_categories: { where: { status: true } },
    },
    orderBy: { hotel_name: 'asc' },
  });
  return ok(hotels);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = HotelSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const hotel = await prisma.hotel.create({ data: parsed.data as Parameters<typeof prisma.hotel.create>[0]['data'] });
  return created(hotel);
}
