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

  // Auto-convert when moved to "Won" stage
  const isWon = stage.name.toLowerCase().includes('won');
  if (isWon && lead.crm_contact_id) {
    await prisma.crmContact.update({
      where: { id: lead.crm_contact_id },
      data: { is_converted: true, converted_at: new Date() },
    }).catch(() => {});
    await prisma.lead.update({
      where: { id: params.id },
      data: { is_converted: true, converted_at: new Date() },
    }).catch(() => {});
  }

  // Fire stage automations
  const automations = await prisma.stageAutomation.findMany({
    where: { stage_id: parsed.data.stage_id, is_active: true, trigger: 'on_enter' },
  }).catch(() => []);

  for (const auto of automations) {
    const ad = auto.action_data as Record<string, unknown>;
    if (auto.action_type === 'assign_agent' && ad.agent_id) {
      await prisma.lead.update({ where: { id: params.id }, data: { assigned_agent_id: ad.agent_id as string } }).catch(() => {});
    }
    if (auto.action_type === 'create_task' && ad.task_type) {
      const due = new Date(); due.setHours(due.getHours() + ((ad.hours_from_now as number) ?? 24));
      await prisma.leadTask.create({
        data: { lead_id: params.id, type: ad.task_type as string, due_time: due, notes: ad.notes as string ?? null, created_by: 'automation' },
      }).catch(() => {});
    }
    if (auto.action_type === 'send_notification') {
      await prisma.notification.create({
        data: {
          user_id:    lead.assigned_agent_id ?? lead.owner_id ?? user.sub,
          message:    (ad.message as string) ?? `Lead "${lead.name}" moved to stage: ${stage.name}`,
          event_type: 'stage_changed',
          quote_id:   null,
        },
      }).catch(() => {});
    }
  }

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
