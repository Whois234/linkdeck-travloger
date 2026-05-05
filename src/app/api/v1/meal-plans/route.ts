import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, unauthorized } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const plans = await prisma.mealPlan.findMany({ where: { status: true }, orderBy: { code: 'asc' } });
  return ok(plans);
}
