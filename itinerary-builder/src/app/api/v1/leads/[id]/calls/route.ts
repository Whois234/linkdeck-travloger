import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized } from '@/lib/api-response';
import { z } from 'zod';

const schema = z.object({
  duration: z.number().optional(),
  outcome: z.enum(['connected', 'not_picked', 'busy']),
  notes: z.string().optional(),
  next_task_type: z.string().optional(),
  next_task_time: z.string().datetime().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const calls = await prisma.callLog.findMany({
    where: { lead_id: params.id },
    orderBy: { created_at: 'desc' },
  });
  return ok(calls);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400);

  const call = await prisma.callLog.create({
    data: {
      lead_id: params.id,
      duration: parsed.data.duration,
      outcome: parsed.data.outcome,
      notes: parsed.data.notes,
      next_task_type: parsed.data.next_task_type,
      next_task_time: parsed.data.next_task_time ? new Date(parsed.data.next_task_time) : null,
      created_by: user.sub,
    },
  });

  // Auto-create follow-up task if requested
  if (parsed.data.next_task_type && parsed.data.next_task_time) {
    await prisma.leadTask.create({
      data: {
        lead_id: params.id,
        type: parsed.data.next_task_type,
        due_time: new Date(parsed.data.next_task_time),
        notes: `Follow up from call — ${parsed.data.outcome}`,
        created_by: user.sub,
      },
    });
  }

  await prisma.leadActivity.create({
    data: {
      lead_id: params.id,
      type: 'call_logged',
      metadata: { outcome: parsed.data.outcome, duration: parsed.data.duration },
      created_by: user.sub,
    },
  });

  // Update lead status to CONTACTED if still NEW
  await prisma.lead.updateMany({
    where: { id: params.id, status: 'NEW' },
    data: { status: 'CONTACTED' },
  });

  return ok(call, 201);
}
