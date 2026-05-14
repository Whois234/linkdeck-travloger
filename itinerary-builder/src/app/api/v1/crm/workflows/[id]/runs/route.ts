/**
 * GET /api/v1/crm/workflows/[id]/runs
 * Returns paginated WorkflowRun records for a specific workflow (latest first).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES, UserRole.OPS)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const url    = new URL(req.url);
  const page   = Math.max(1, parseInt(url.searchParams.get('page')   ?? '1'));
  const limit  = Math.min(50, parseInt(url.searchParams.get('limit') ?? '20'));

  const [runs, total] = await Promise.all([
    prisma.workflowRun.findMany({
      where:   { workflow_id: params.id },
      orderBy: { created_at: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    prisma.workflowRun.count({ where: { workflow_id: params.id } }),
  ]);

  return NextResponse.json({
    ok:    true,
    data:  runs,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  });
}
