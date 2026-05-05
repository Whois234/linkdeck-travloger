import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized, notFound } from '@/lib/api-response';
import { z } from 'zod';

const schema = z.object({ name: z.string().min(1).optional(), is_default: z.boolean().optional(), status: z.boolean().optional() });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const pipeline = await prisma.pipeline.findUnique({
    where: { id: params.id },
    include: {
      stages: { where: { status: true }, orderBy: { order: 'asc' } },
      leads: {
        where: { pipeline_id: params.id },
        include: { stage: true },
        orderBy: { created_at: 'desc' },
      },
    },
  });
  if (!pipeline) return notFound('Pipeline');
  return ok(pipeline);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400);
  if (parsed.data.is_default) {
    await prisma.pipeline.updateMany({ data: { is_default: false } });
  }
  const pipeline = await prisma.pipeline.update({
    where: { id: params.id },
    data: parsed.data,
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  return ok(pipeline);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  await prisma.pipeline.update({ where: { id: params.id }, data: { status: false } });
  return ok({ deleted: true });
}
