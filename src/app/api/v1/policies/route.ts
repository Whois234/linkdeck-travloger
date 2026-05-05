import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, PolicyType, PolicyAppliesTo } from '@prisma/client';

const Schema = z.object({
  policy_type: z.nativeEnum(PolicyType),
  title: z.string().min(1),
  content: z.string().min(1),
  applies_to: z.nativeEnum(PolicyAppliesTo),
  state_id: z.string().optional().nullable(),
  destination_id: z.string().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const state_id = searchParams.get('state_id');
  const applies_to = searchParams.get('applies_to') as PolicyAppliesTo | null;

  const records = await prisma.policy.findMany({
    where: {
      status: true,
      ...(state_id ? { state_id } : {}),
      ...(applies_to ? { applies_to } : {}),
    },
    orderBy: [{ policy_type: 'asc' }],
  });
  return ok(records);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.policy.create({ data: parsed.data as Parameters<typeof prisma.policy.create>[0]['data'] });
  return created(record);
}
