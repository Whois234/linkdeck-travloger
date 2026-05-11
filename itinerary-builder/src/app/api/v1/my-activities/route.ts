import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, unauthorized } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

// Roles that can always see every user's tasks
const PRIVILEGED_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.MANAGER];

// Module key controlling "see-all" access for tasks
const MODULE_KEY = 'my-activities';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status'); // pending | overdue | completed | all
  const scopeParam = searchParams.get('scope'); // me | all
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10)));

  // Determine if user is allowed to see all tasks
  const moduleAccess = user.module_access;
  const hasModuleEdit = Array.isArray(moduleAccess)
    && moduleAccess.some(m => m.key === MODULE_KEY && m.perm === 'edit');
  const canSeeAll = PRIVILEGED_ROLES.includes(user.role) || moduleAccess === null || hasModuleEdit;

  // scope=all is only honored if user has permission
  const scope = canSeeAll && scopeParam === 'all' ? 'all' : (canSeeAll ? (scopeParam ?? 'all') : 'me');

  const where: Record<string, unknown> = {};
  if (status && status !== 'all') where.status = status;
  if (scope === 'me') where.created_by = user.sub;

  const [tasksRaw, notifications, unreadCount] = await Promise.all([
    prisma.leadTask.findMany({
      where,
      orderBy: [{ status: 'asc' }, { due_time: 'asc' }],
      take: limit,
      include: {
        lead: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.notification.findMany({
      where: { user_id: user.sub },
      orderBy: { created_at: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { user_id: user.sub, is_read: false } }),
  ]);

  // Attach owner (created_by) names
  const creatorIds = Array.from(new Set(tasksRaw.map(t => t.created_by).filter(Boolean)));
  const creators = creatorIds.length
    ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true, email: true } })
    : [];
  const creatorById = Object.fromEntries(creators.map(u => [u.id, u]));

  const now = new Date();
  const tasks = tasksRaw.map(t => ({
    id: t.id,
    type: t.type,
    notes: t.notes,
    status: t.status,
    due_time: t.due_time,
    created_at: t.created_at,
    notified: t.notified,
    is_overdue: t.status === 'pending' && t.due_time < now,
    lead: t.lead,
    owner: creatorById[t.created_by] ?? null,
  }));

  return ok({
    tasks,
    notifications,
    unreadCount,
    scope,
    canSeeAll,
    currentUserId: user.sub,
  });
}
