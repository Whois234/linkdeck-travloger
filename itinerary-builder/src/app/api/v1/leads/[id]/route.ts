import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const lead = await prisma.lead.findUnique({
    where: { id: params.id },
    include: {
      stage: true,
      pipeline: { select: { id: true, name: true } },
      lead_notes: { orderBy: { created_at: 'desc' } },
      call_logs: { orderBy: { created_at: 'desc' } },
      lead_tasks: { orderBy: { due_time: 'asc' } },
      lead_activities: { orderBy: { created_at: 'desc' }, take: 50 },
      quotes: { select: { id: true, quote_number: true, status: true, created_at: true } },
    },
  });
  if (!lead) return notFound('Lead');
  return ok(lead);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const record = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Lead');

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.phone !== undefined) data.phone = body.phone;
  if (body.email !== undefined) data.email = body.email;
  if (body.source !== undefined) data.source = body.source;
  if (body.destination_interest !== undefined) data.destination_interest = body.destination_interest;
  if (body.travel_month !== undefined) data.travel_month = body.travel_month;
  if (body.budget_range !== undefined) data.budget_range = body.budget_range;
  if (body.status !== undefined) data.status = body.status;
  if (body.assigned_agent_id !== undefined) data.assigned_agent_id = body.assigned_agent_id;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.pipeline_id !== undefined) data.pipeline_id = body.pipeline_id;
  if (body.stage_id !== undefined) data.stage_id = body.stage_id;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.lead.update({
    where: { id: params.id },
    data,
    include: { stage: true, pipeline: { select: { id: true, name: true } } },
  });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const record = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Lead');

  await prisma.lead.delete({ where: { id: params.id } });
  return ok({ message: 'Lead deleted' });
}
