import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();
  const record = await prisma.groupTemplate.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Group Template');
  await prisma.groupTemplate.update({
    where: { id: params.id },
    data: { status: false, deleted_at: null },  // restore to Draft
  });
  return ok({ message: 'Restored to Draft' });
}
