import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, unauthorized } from '@/lib/api-response';

export async function PUT(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  await prisma.notification.updateMany({
    where: { user_id: user.sub, is_read: false },
    data: { is_read: true },
  });

  return ok({ message: 'All notifications marked as read' });
}
