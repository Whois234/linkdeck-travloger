import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, InclusionType, InclusionCategory } from '@prisma/client';

const Schema = z.object({
  type: z.nativeEnum(InclusionType),
  category: z.nativeEnum(InclusionCategory),
  text: z.string().min(1),
  destination_id: z.string().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') as InclusionType | null;
  const destination_id = searchParams.get('destination_id');

  const records = await prisma.inclusionExclusion.findMany({
    where: {
      status: true,
      ...(type ? { type } : {}),
      ...(destination_id ? { destination_id } : {}),
    },
    orderBy: [{ type: 'asc' }, { category: 'asc' }],
  });
  return ok(records);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.inclusionExclusion.create({ data: parsed.data as Parameters<typeof prisma.inclusionExclusion.create>[0]['data'] });
  return created(record);
}
