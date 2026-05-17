import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { ok, err, unauthorized, notFound } from '@/lib/api-response';
import { z } from 'zod';

export const dynamic     = 'force-dynamic';
export const maxDuration = 10;

const schema = z.object({ name: z.string().min(1).optional(), is_default: z.boolean().optional(), status: z.boolean().optional() });

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const owner_id        = searchParams.get('owner_id');
  const date_from       = searchParams.get('date_from');
  const date_to         = searchParams.get('date_to');
  const owner_ids_raw      = searchParams.get('owner_ids');
  const exclude_ids_raw    = searchParams.get('exclude_owner_ids');
  const owner_ids          = owner_ids_raw?.split(',').filter(Boolean) ?? [];
  const exclude_ids        = exclude_ids_raw?.split(',').filter(Boolean) ?? [];
  const include_unassigned = searchParams.get('include_unassigned') === '1';
  const ids_only           = searchParams.get('ids_only') === '1';

  const leadsWhere: Record<string, unknown> = { pipeline_id: params.id };

  // A lead is "yours" if you own it (owner_id) OR are assigned to work it (assigned_agent_id).
  // This ensures leads assigned via the drawer always appear in the assignee's pipeline.
  const isPrivileged = requireRole(user, UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.OPS);
  if (!isPrivileged) {
    // SALES: show leads they own OR are assigned to
    leadsWhere.OR = [
      { owner_id: user.sub },
      { assigned_agent_id: user.sub },
    ];
  } else if (owner_ids.length > 0 || include_unassigned) {
    // Include: show leads owned by OR assigned to any of these users,
    // plus leads with no owner/agent if include_unassigned is set.
    const orClauses: Record<string, unknown>[] = [];
    if (owner_ids.length > 0) {
      orClauses.push(
        { owner_id: { in: owner_ids } },
        { assigned_agent_id: { in: owner_ids } },
      );
    }
    if (include_unassigned) {
      orClauses.push({ owner_id: null, assigned_agent_id: null });
    }
    leadsWhere.OR = orClauses;
  } else if (exclude_ids.length > 0) {
    // Exclude: show leads NOT owned by AND NOT assigned to any of these users
    leadsWhere.AND = [
      { NOT: { owner_id: { in: exclude_ids } } },
      { NOT: { assigned_agent_id: { in: exclude_ids } } },
    ] as Record<string, unknown>[];
  } else if (owner_id) {
    // Privileged + single user filter: show leads that user owns OR is assigned to
    leadsWhere.OR = [
      { owner_id: owner_id },
      { assigned_agent_id: owner_id },
    ];
  }

  if (date_from || date_to) {
    leadsWhere.created_at = {
      ...(date_from ? { gte: new Date(date_from) } : {}),
      ...(date_to   ? { lte: new Date(date_to + 'T23:59:59') } : {}),
    };
  }

  // Fast-path: caller only needs IDs (e.g. "Select All" button)
  if (ids_only) {
    const rows = await prisma.lead.findMany({
      where: leadsWhere,
      select: { id: true },
    });
    return ok({ ids: rows.map(r => r.id) });
  }

  const [pipeline, totalLeads, stageCountRows] = await Promise.all([
    prisma.pipeline.findUnique({
      where: { id: params.id },
      include: {
        stages: { where: { status: true }, orderBy: { order: 'asc' } },
        leads: {
          where: leadsWhere,
          include: {
            stage: { select: { id: true, name: true, color: true, order: true } },
            _count: { select: { call_logs: true, lead_notes: true } },
            quotes: {
              where: { status: { not: 'DRAFT' } },
              select: { id: true, status: true, events: { select: { event_type: true }, where: { event_type: { in: ['quote_viewed', 'approve_clicked'] } } } },
              orderBy: { created_at: 'desc' },
              take: 1,
            },
          },
          orderBy: { created_at: 'desc' },
          take: 300,   // cap payload size; show banner if truncated
        },
      },
    }),
    prisma.lead.count({ where: leadsWhere }),
    // True per-stage counts (unaffected by the 300-lead cap) so stage badges
    // show the real count even when the loaded-leads array is truncated.
    prisma.lead.groupBy({
      by: ['stage_id'],
      where: leadsWhere,
      _count: { id: true },
    }),
  ]);
  if (!pipeline) return notFound('Pipeline');

  // Build a { stageId → count } map for the frontend
  const stageCounts: Record<string, number> = {};
  for (const row of stageCountRows) {
    if (row.stage_id) stageCounts[row.stage_id] = row._count.id;
  }

  return ok({ ...pipeline, totalLeads, stageCounts });
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
