import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized } from '@/lib/api-response';
import { z } from 'zod';

const createSchema = z.object({
  type: z.enum(['call', 'follow_up', 'send_quote', 'meeting', 'other']),
  due_time: z.string().datetime(),
  notes: z.string().optional(),
});
const updateSchema = z.object({ status: z.enum(['pending', 'done', 'overdue']).optional(), notes: z.string().optional() });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const tasks = await prisma.leadTask.findMany({
    where: { lead_id: params.id },
    orderBy: { due_time: 'asc' },
  });
  return ok(tasks);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400);

  const task = await prisma.leadTask.create({
    data: {
      lead_id: params.id,
      type: parsed.data.type,
      due_time: new Date(parsed.data.due_time),
      notes: parsed.data.notes,
      created_by: user.sub,
    },
  });
  await prisma.leadActivity.create({
    data: {
      lead_id: params.id,
      type: 'task_added',
      metadata: { task_type: parsed.data.type, due_time: parsed.data.due_time },
      created_by: user.sub,
    },
  });
  return ok(task, 201);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId');
  if (!taskId) return err('taskId required', 400);
  const body = await req.json().catch(() => ({}));
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400);
  const task = await prisma.leadTask.update({ where: { id: taskId }, data: parsed.data });
  return ok(task);
}
