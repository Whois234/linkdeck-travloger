import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const StateSchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  code: z.string().min(2).max(6).toUpperCase(),
  trip_id_prefix: z.string().min(1),
  description: z.string().optional(),
  hero_image: z.string().url().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  const states = await prisma.state.findMany({
    where: status !== null ? { status: status === 'true' } : undefined,
    orderBy: { name: 'asc' },
  });
  return ok(states);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = StateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const existing = await prisma.state.findUnique({ where: { code: parsed.data.code } });
  if (existing) return err('State code already exists', 409);

  const state = await prisma.state.create({ data: parsed.data });
  return created(state);
}
