import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, Prisma } from '@prisma/client';

const DestinationSchema = z.object({
  state_id: z.string(),
  name: z.string().min(1),
  country: z.string().min(1),
  short_description: z.string().optional().nullable(),
  long_description: z.string().optional().nullable(),
  best_season: z.string().optional().nullable(),
  ideal_nights: z.number().int().positive().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  default_pickup_points: z.array(z.string()).optional().nullable(),
  default_drop_points: z.array(z.string()).optional().nullable(),
  hero_image: z.string().url().optional().nullable(),
  gallery_images: z.array(z.string()).optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const state_id = searchParams.get('state_id');

  const destinations = await prisma.destination.findMany({
    where: {
      status: true,
      ...(state_id ? { state_id } : {}),
    },
    include: { state: { select: { name: true, code: true } } },
    orderBy: { name: 'asc' },
  });
  return ok(destinations);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = DestinationSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const { gallery_images, default_pickup_points, default_drop_points, tags, ...rest } = parsed.data;
  const destination = await prisma.destination.create({
    data: {
      ...rest,
      ...(gallery_images !== undefined ? { gallery_images: gallery_images as Prisma.InputJsonValue } : {}),
      ...(default_pickup_points !== undefined ? { default_pickup_points: default_pickup_points as Prisma.InputJsonValue } : {}),
      ...(default_drop_points !== undefined ? { default_drop_points: default_drop_points as Prisma.InputJsonValue } : {}),
      ...(tags !== undefined ? { tags: tags as Prisma.InputJsonValue } : {}),
    },
  });
  return created(destination);
}
