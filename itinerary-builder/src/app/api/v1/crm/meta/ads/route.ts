import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, err } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

// GET — list all meta ads mappings
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();
  const ads = await prisma.metaAdsMapping.findMany({ orderBy: [{ campaign_name: 'asc' }, { ad_set_name: 'asc' }, { ad_name: 'asc' }] });
  return ok(ads);
}
