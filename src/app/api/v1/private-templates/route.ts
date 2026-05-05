import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const Schema = z.object({
  template_name: z.string().min(1),
  state_id: z.string(),
  destinations: z.array(z.string()),
  duration_days: z.number().int().positive(),
  duration_nights: z.number().int().min(0),
  start_city: z.string().optional().nullable(),
  end_city: z.string().optional().nullable(),
  default_pickup_point: z.string().optional().nullable(),
  default_drop_point: z.string().optional().nullable(),
  theme: z.string().optional().nullable(),
  default_vehicle_route_id: z.string().optional().nullable(),
  default_inclusion_ids: z.array(z.string()).optional().nullable(),
  default_exclusion_ids: z.array(z.string()).optional().nullable(),
  default_policy_ids: z.array(z.string()).optional().nullable(),
  hero_image: z.string().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const state_id = searchParams.get('state_id');

  const templates = await prisma.privateTemplate.findMany({
    where: { status: true, ...(state_id ? { state_id } : {}) },
    include: {
      state: { select: { name: true } },
      template_days: { orderBy: { sort_order: 'asc' } },
      template_hotel_tiers: { orderBy: [{ tier_name: 'asc' }, { sort_order: 'asc' }] },
    },
    orderBy: { template_name: 'asc' },
  });
  return ok(templates);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.privateTemplate.create({ data: parsed.data as Parameters<typeof prisma.privateTemplate.create>[0]['data'] });
  return created(record);
}
