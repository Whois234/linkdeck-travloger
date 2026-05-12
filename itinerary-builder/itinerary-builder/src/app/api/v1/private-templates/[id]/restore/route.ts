import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();
  const record = await prisma.privateTemplate.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Private Template');
  await prisma.privateTemplate.update({
    where: { id: params.id },
    data: { status: false, deleted_at: null },  // restore to Draft (not Live) so admin can review
  });
  return ok({ message: 'Restored to Draft' });
}
