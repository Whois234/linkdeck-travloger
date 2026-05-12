import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { getCachedVehicleTypes } from '@/lib/cache/masterData';

const Schema = z.object({
  vehicle_type: z.string().min(1),
  display_name: z.string().min(1),
  capacity: z.number().int().positive(),
  luggage_capacity: z.number().int().min(0).optional().nullable(),
  ac_available: z.boolean().optional(),
  description: z.string().optional().nullable(),
  images: z.array(z.string()).optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  // Admin pages pass ?admin=1 to get a fresh, uncached list of ALL vehicle types
  const admin = new URL(req.url).searchParams.get('admin');
  if (admin === '1') {
    const all = await prisma.vehicleType.findMany({ orderBy: { capacity: 'asc' } });
    return ok(all);
  }

  return ok(await getCachedVehicleTypes());
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  // Duplicate check: same type code OR same display name (active or inactive)
  const duplicate = await prisma.vehicleType.findFirst({
    where: {
      OR: [
        { vehicle_type: { equals: parsed.data.vehicle_type, mode: 'insensitive' } },
        { display_name: { equals: parsed.data.display_name, mode: 'insensitive' } },
      ],
    },
  });
  if (duplicate) return err(`Duplicate vehicle type "${parsed.data.display_name}" — a vehicle type with this code or name already exists.`, 409);

  const record = await prisma.vehicleType.create({ data: parsed.data as Parameters<typeof prisma.vehicleType.create>[0]['data'] });
  return created(record);
}
