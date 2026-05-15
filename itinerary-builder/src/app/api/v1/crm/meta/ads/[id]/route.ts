import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

// PATCH — update destination/trip_type/prefilled_code for an ad
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();
  const body = await req.json() as { destination?: string; trip_type?: string; prefilled_code?: string; is_active?: boolean };
  const existing = await prisma.metaAdsMapping.findUnique({ where: { id: params.id } });
  if (!existing) return notFound('MetaAdsMapping');
  const updated = await prisma.metaAdsMapping.update({
    where: { id: params.id },
    data: {
      ...(body.destination     !== undefined ? { destination:     body.destination || null }     : {}),
      ...(body.trip_type       !== undefined ? { trip_type:       body.trip_type || null }       : {}),
      ...(body.prefilled_code  !== undefined ? { prefilled_code:  body.prefilled_code || null }  : {}),
      ...(body.is_active       !== undefined ? { is_active:       body.is_active }               : {}),
    },
  });
  return ok(updated);
}
