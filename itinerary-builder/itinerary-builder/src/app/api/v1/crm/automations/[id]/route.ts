import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();
  const body = await req.json().catch(() => ({}));
  const automation = await prisma.stageAutomation.update({
    where: { id: params.id },
    data: body,
  }).catch(() => null);
  if (!automation) return err('Not found', 404);
  return ok(automation);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();
  await prisma.stageAutomation.delete({ where: { id: params.id } }).catch(() => {});
  return ok({ deleted: true });
}
