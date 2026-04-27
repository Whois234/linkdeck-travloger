import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const Schema = z.object({
  title: z.string().min(1),
  destination_id: z.string(),
  description: z.string().optional().nullable(),
  short_description: z.string().optional().nullable(),
  duration_label: z.string().optional().nullable(),
  default_image: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  linked_activities: z.array(z.string()).optional().nullable(),
  linked_transfers: z.array(z.string()).optional().nullable(),
  meals_included: z.array(z.string()).optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const destination_id = searchParams.get('destination_id');

  const plans = await prisma.dayPlan.findMany({
    where: { status: true, ...(destination_id ? { destination_id } : {}) },
    include: { destination: { select: { name: true } } },
    orderBy: { title: 'asc' },
  });
  return ok(plans);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.dayPlan.create({ data: parsed.data as Parameters<typeof prisma.dayPlan.create>[0]['data'] });
  return created(record);
}
