import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const Schema = z.object({
  route_name: z.string().min(1),
  state_id: z.string(),
  start_city: z.string().min(1),
  end_city: z.string().min(1),
  destinations_covered: z.array(z.string()).optional().nullable(),
  duration_days: z.number().int().positive(),
  duration_nights: z.number().int().min(0),
  vehicle_type_id: z.string(),
  supplier_id: z.string().optional().nullable(),
  base_cost: z.number().positive(),
  extra_day_cost: z.number().min(0).optional().nullable(),
  extra_km_cost: z.number().min(0).optional().nullable(),
  driver_bata_included: z.boolean().optional(),
  toll_parking_included: z.boolean().optional(),
  valid_from: z.string().datetime(),
  valid_to: z.string().datetime(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const state_id = searchParams.get('state_id');

  const rates = await prisma.vehiclePackageRate.findMany({
    where: { status: true, ...(state_id ? { state_id } : {}) },
    include: { vehicle_type: true, state: { select: { name: true } } },
    orderBy: { route_name: 'asc' },
  });
  return ok(rates);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.vehiclePackageRate.create({
    data: { ...parsed.data, valid_from: new Date(parsed.data.valid_from), valid_to: new Date(parsed.data.valid_to) } as Parameters<typeof prisma.vehiclePackageRate.create>[0]['data'],
  });
  return created(record);
}
