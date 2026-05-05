import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized } from '@/lib/api-response';
import { z } from 'zod';

const schema = z.object({ name: z.string().min(1), is_default: z.boolean().optional() });

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const pipelines = await prisma.pipeline.findMany({
    where: { status: true },
    include: { stages: { where: { status: true }, orderBy: { order: 'asc' } } },
    orderBy: { created_at: 'asc' },
  });
  return ok(pipelines);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400);

  if (parsed.data.is_default) {
    await prisma.pipeline.updateMany({ data: { is_default: false } });
  }
  const pipeline = await prisma.pipeline.create({
    data: { name: parsed.data.name, is_default: parsed.data.is_default ?? false },
  });
  const defaultStages = ['New Lead', 'Contacted', 'Hot Lead', 'Quote Sent', 'Won', 'Lost'];
  const stageColors   = ['#64748B', '#3B82F6', '#F97316', '#8B5CF6', '#22C55E', '#EF4444'];
  await prisma.pipelineStage.createMany({
    data: defaultStages.map((name, i) => ({
      pipeline_id: pipeline.id, name, order: i + 1, color: stageColors[i],
    })),
  });
  const full = await prisma.pipeline.findUnique({
    where: { id: pipeline.id },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  return ok(full, 201);
}
