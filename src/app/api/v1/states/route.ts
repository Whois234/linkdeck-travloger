import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { getCachedStates } from '@/lib/cache/masterData';
import { revalidateTag } from 'next/cache';

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

  // Use cache for the common active-only case; fall back to direct query for status filters
  const states = status !== null
    ? await prisma.state.findMany({ where: { status: status === 'true' }, orderBy: { name: 'asc' } })
    : await getCachedStates();
  return ok(states);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = StateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const existing = await prisma.state.findUnique({ where: { code: parsed.data.code } });
  if (existing) return err('State code already exists', 409);

  const state = await prisma.state.create({ data: parsed.data });
  revalidateTag('master-states');
  return created(state);
}
