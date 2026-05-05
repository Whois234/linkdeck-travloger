import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, unauthorized } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const activities = await prisma.leadActivity.findMany({
    where: { lead_id: params.id },
    orderBy: { created_at: 'desc' },
    take: 100,
  });
  return ok(activities);
}
