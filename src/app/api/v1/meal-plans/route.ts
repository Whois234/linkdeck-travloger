import { NextRequest } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { ok, unauthorized } from '@/lib/api-response';
import { getCachedMealPlans } from '@/lib/cache/masterData';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  return ok(await getCachedMealPlans());
}
