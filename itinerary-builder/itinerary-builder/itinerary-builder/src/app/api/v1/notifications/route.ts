import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, unauthorized } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread') === 'true';

  const notifications = await prisma.notification.findMany({
    where: {
      user_id: user.sub,
      ...(unreadOnly ? { is_read: false } : {}),
    },
    orderBy: { created_at: 'desc' },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: { user_id: user.sub, is_read: false },
  });

  return ok({ notifications, unreadCount });
}
