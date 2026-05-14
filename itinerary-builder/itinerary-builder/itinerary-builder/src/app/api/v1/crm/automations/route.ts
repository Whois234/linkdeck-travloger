import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const schema = z.object({
  pipeline_id: z.string(),
  stage_id:    z.string(),
  trigger:     z.string().default('on_enter'),
  action_type: z.enum(['assign_agent', 'assign_user', 'send_notification', 'send_whatsapp', 'create_task', 'update_status']),
  action_data: z.record(z.unknown()),
  is_active:   z.boolean().optional().default(true),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const { searchParams } = new URL(req.url);
  const pipeline_id = searchParams.get('pipeline_id');
  const automations = await prisma.stageAutomation.findMany({
    where: pipeline_id ? { pipeline_id } : {},
    include: { stage: { select: { id: true, name: true, color: true } } },
    orderBy: { created_at: 'asc' },
  });
  return ok(automations);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());
  const automation = await prisma.stageAutomation.create({ data: parsed.data as Parameters<typeof prisma.stageAutomation.create>[0]['data'] });
  return created(automation);
}
