import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const Schema = z.object({
  route_name: z.string().min(1),
  state_id: z.string().min(1),          // required, must be a non-empty UUID
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
  const state_id      = searchParams.get('state_id');
  const state_ids_raw = searchParams.get('state_ids');
  const state_ids     = state_ids_raw ? state_ids_raw.split(',').filter(Boolean) : null;

  const stateFilter = state_ids?.length
    ? { state_id: { in: state_ids } }
    : state_id ? { state_id } : {};

  const rates = await prisma.vehiclePackageRate.findMany({
    where: { status: true, ...stateFilter },
    include: { vehicle_type: true, state: { select: { name: true } }, supplier: { select: { name: true } } },
    orderBy: { route_name: 'asc' },
    take: 500,
  });
  return ok(rates);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const validFrom = new Date(parsed.data.valid_from);
  const validTo   = new Date(parsed.data.valid_to);

  // Duplicate check: same route + vehicle + cities + validity period
  const duplicate = await prisma.vehiclePackageRate.findFirst({
    where: {
      route_name:      { equals: parsed.data.route_name, mode: 'insensitive' },
      vehicle_type_id: parsed.data.vehicle_type_id,
      start_city:      { equals: parsed.data.start_city, mode: 'insensitive' },
      end_city:        { equals: parsed.data.end_city,   mode: 'insensitive' },
      valid_from:      validFrom,
      valid_to:        validTo,
    },
  });
  if (duplicate) return err('Duplicate value — this rate already exists (same route, vehicle type, cities and validity period).', 409);

  const record = await prisma.vehiclePackageRate.create({
    data: { ...parsed.data, valid_from: validFrom, valid_to: validTo } as Parameters<typeof prisma.vehiclePackageRate.create>[0]['data'],
  });
  return created(record);
}
