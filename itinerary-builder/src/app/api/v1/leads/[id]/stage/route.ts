import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized } from '@/lib/api-response';
import { z } from 'zod';

const schema = z.object({ stage_id: z.string(), pipeline_id: z.string().optional() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400);

  const stage = await prisma.pipelineStage.findUnique({ where: { id: parsed.data.stage_id } });
  if (!stage) return err('Stage not found', 404);

  const prevLead = await prisma.lead.findUnique({ where: { id: params.id }, select: { stage_id: true } });
  const prevStage = prevLead?.stage_id ? await prisma.pipelineStage.findUnique({ where: { id: prevLead.stage_id }, select: { name: true } }) : null;

  const lead = await prisma.lead.update({
    where: { id: params.id },
    data: { stage_id: parsed.data.stage_id, pipeline_id: parsed.data.pipeline_id ?? stage.pipeline_id },
  });

  // Log activity
  await prisma.leadActivity.create({
    data: {
      lead_id: params.id,
      type: 'stage_changed',
      metadata: { from: prevStage?.name ?? 'Unknown', to: stage.name },
      created_by: user.sub,
    },
  });

  return ok(lead);
}
