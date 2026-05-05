import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized } from '@/lib/api-response';
import { z } from 'zod';

const schema = z.object({ name: z.string().min(1).optional(), color: z.string().optional(), order: z.number().optional() });

export async function PUT(req: NextRequest, { params }: { params: { id: string; stageId: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400);
  const stage = await prisma.pipelineStage.update({ where: { id: params.stageId }, data: parsed.data });
  return ok(stage);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; stageId: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  await prisma.pipelineStage.update({ where: { id: params.stageId }, data: { status: false } });
  return ok({ deleted: true });
}
