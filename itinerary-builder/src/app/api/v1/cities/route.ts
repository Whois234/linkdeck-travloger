import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const CitySchema = z.object({
  name: z.string().min(1),
  state_id: z.string().min(1),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const state_id = searchParams.get('state_id');
  const state_ids_raw = searchParams.get('state_ids');
  const state_ids = state_ids_raw ? state_ids_raw.split(',').filter(Boolean) : null;

  const stateFilter = state_ids?.length
    ? { state_id: { in: state_ids } }
    : state_id ? { state_id } : {};

  const cities = await prisma.city.findMany({
    where: { status: true, ...stateFilter },
    include: { state: { select: { name: true, code: true } } },
    orderBy: [{ state: { name: 'asc' } }, { name: 'asc' }],
  });
  return ok(cities);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const rawBody = await req.json();
  const body = cleanBody(rawBody);
  const parsed = CitySchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  // Prevent duplicates per state
  const existing = await prisma.city.findFirst({
    where: { name: { equals: parsed.data.name, mode: 'insensitive' }, state_id: parsed.data.state_id },
  });
  if (existing) return err('City already exists in this state', 409);

  const city = await prisma.city.create({ data: parsed.data });
  return created(city);
}
