import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, ActivityRateType } from '@prisma/client';

const Schema = z.object({
  destination_id: z.string(),
  supplier_id: z.string().optional().nullable(),
  activity_name: z.string().min(1),
  activity_type: z.string().optional().nullable(),
  duration: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  inclusions: z.string().optional().nullable(),
  exclusions: z.string().optional().nullable(),
  adult_cost: z.number().positive(),
  child_cost: z.number().min(0).optional().nullable(),
  rate_type: z.nativeEnum(ActivityRateType),
  operating_days: z.array(z.string()).optional().nullable(),
  time_slots: z.array(z.string()).optional().nullable(),
  images: z.array(z.string()).optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const destination_id = searchParams.get('destination_id');

  const activities = await prisma.activity.findMany({
    where: { status: true, ...(destination_id ? { destination_id } : {}) },
    include: { destination: { select: { name: true } } },
    orderBy: { activity_name: 'asc' },
  });
  return ok(activities);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.activity.create({ data: parsed.data as Parameters<typeof prisma.activity.create>[0]['data'] });
  return created(record);
}
