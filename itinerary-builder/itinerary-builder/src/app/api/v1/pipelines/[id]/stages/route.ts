import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized } from '@/lib/api-response';
import { z } from 'zod';

const createSchema = z.object({ name: z.string().min(1), color: z.string().optional() });
const reorderSchema = z.object({ stages: z.array(z.object({ id: z.string(), order: z.number() })) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400);
  const lastStage = await prisma.pipelineStage.findFirst({
    where: { pipeline_id: params.id },
    orderBy: { order: 'desc' },
  });
  const stage = await prisma.pipelineStage.create({
    data: { pipeline_id: params.id, name: parsed.data.name, color: parsed.data.color ?? '#64748B', order: (lastStage?.order ?? 0) + 1 },
  });
  return ok(stage, 201);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  // Reorder stages
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const parsed = reorderSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400);
  await Promise.all(
    parsed.data.stages.map(s => prisma.pipelineStage.update({ where: { id: s.id }, data: { order: s.order } }))
  );
  return ok({ reordered: true });
}
