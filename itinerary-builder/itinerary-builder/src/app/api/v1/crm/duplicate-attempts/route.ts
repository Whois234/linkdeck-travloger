import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const attempts = await prisma.duplicateContactAttempt.findMany({
    orderBy: { created_at: 'desc' },
    take: 200,
  });

  const userIds = Array.from(new Set([
    ...attempts.map(a => a.attempted_by),
    ...attempts.map(a => a.existing_owner_id),
  ]));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const result = attempts.map(a => ({
    ...a,
    attempted_by_user:    userMap[a.attempted_by]    ?? null,
    existing_owner_user:  userMap[a.existing_owner_id] ?? null,
  }));

  return ok(result);
}
