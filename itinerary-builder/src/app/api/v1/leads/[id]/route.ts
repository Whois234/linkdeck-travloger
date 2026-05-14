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
      assigned_agent: { select: { id: true, name: true } },
      lead_notes: { orderBy: { created_at: 'desc' } },
      call_logs: { orderBy: { created_at: 'desc' } },
      lead_tasks: { orderBy: { due_time: 'asc' } },
      lead_activities: { orderBy: { created_at: 'desc' }, take: 50 },
      quotes: {
        select: {
          id: true, quote_number: true, status: true, created_at: true, updated_at: true,
          quote_name: true, start_date: true, end_date: true, adults: true, duration_days: true,
          quote_options: { select: { id: true, option_name: true, final_price: true, is_most_popular: true }, orderBy: { display_order: 'asc' } },
          events: { select: { id: true, event_type: true, metadata: true, created_at: true }, orderBy: { created_at: 'desc' }, take: 50 },
          _count: { select: { events: true } },
        },
        orderBy: { created_at: 'asc' },  // oldest first → Quote 1 is always the first quote sent
      },
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
  if (body.owner_id !== undefined) data.owner_id = body.owner_id;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.pipeline_id !== undefined) data.pipeline_id = body.pipeline_id;
  if (body.stage_id !== undefined) data.stage_id = body.stage_id;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const agentChanging = body.assigned_agent_id !== undefined && body.assigned_agent_id !== record.assigned_agent_id;

  const updated = await prisma.lead.update({
    where: { id: params.id },
    data,
    include: { stage: true, pipeline: { select: { id: true, name: true } }, assigned_agent: { select: { id: true, name: true } } },
  });

  // Log assignment activity when agent changes
  if (agentChanging) {
    const agentName = body.assigned_agent_id
      ? ((updated.assigned_agent as { name?: string } | null)?.name ?? body.assigned_agent_id)
      : null;
    const byUser = await prisma.user.findUnique({ where: { id: user.sub }, select: { name: true } }).catch(() => null);
    await prisma.leadActivity.create({
      data: {
        lead_id:    params.id,
        type:       'assigned',
        metadata:   { agent_id: body.assigned_agent_id ?? '', agent_name: agentName ?? '', by_name: byUser?.name ?? '' },
        created_by: user.sub,
      },
    }).catch(() => {});
  }

  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const record = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Lead');

  // ADMIN + MANAGER can delete any lead.
  // SALES can delete only leads they own.
  const isPrivileged = requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
  if (!isPrivileged && record.owner_id !== user.sub) return forbidden();

  // ── Snapshot all lead activity into the CrmContact before deleting ──────────
  if (record.crm_contact_id) {
    try {
      const [notes, calls, tasks, activities] = await Promise.all([
        prisma.leadNote.findMany({ where: { lead_id: params.id }, orderBy: { created_at: 'asc' } }),
        prisma.callLog.findMany({ where: { lead_id: params.id }, orderBy: { created_at: 'asc' } }),
        prisma.leadTask.findMany({ where: { lead_id: params.id }, orderBy: { due_time: 'asc' } }),
        prisma.leadActivity.findMany({ where: { lead_id: params.id }, orderBy: { created_at: 'asc' } }),
      ]);

      // Write a single FIELD_UPDATE activity on the contact with full history in metadata
      await prisma.contactActivity.create({
        data: {
          contact_id:      record.crm_contact_id,
          type:            'FIELD_UPDATE',
          description:     `Pipeline lead deleted — ${notes.length} note(s), ${calls.length} call(s), ${tasks.length} task(s) archived`,
          metadata:        {
            lead_id:    params.id,
            lead_name:  record.name,
            pipeline:   record.pipeline_id,
            stage:      record.stage_id,
            deleted_by: user.sub,
            notes:      notes.map(n => ({ content: n.content, created_at: n.created_at })),
            calls:      calls.map(c => ({ duration: c.duration, outcome: c.outcome, notes: c.notes, created_at: c.created_at })),
            tasks:      tasks.map(t => ({ type: t.type, status: t.status, due_time: t.due_time, notes: t.notes })),
            activities: activities.map(a => ({ type: a.type, metadata: a.metadata, created_at: a.created_at })),
          } as Parameters<typeof prisma.contactActivity.create>[0]['data']['metadata'],
          performed_by_id: user.sub,
        },
      });
    } catch (e) {
      console.error('[lead/DELETE] activity snapshot failed:', e);
    }
  }

  await prisma.lead.delete({ where: { id: params.id } });
  return ok({ message: 'Lead deleted' });
}
