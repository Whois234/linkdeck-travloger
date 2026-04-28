import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, unauthorized, notFound } from '@/lib/api-response';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const notif = await prisma.notification.findFirst({
    where: { id: params.id, user_id: user.sub },
  });
  if (!notif) return notFound('Notification');

  const updated = await prisma.notification.update({
    where: { id: params.id },
    data: { is_read: true },
  });
  return ok(updated);
}
