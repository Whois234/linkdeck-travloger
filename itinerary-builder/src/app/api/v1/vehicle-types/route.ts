import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const Schema = z.object({
  vehicle_type: z.string().min(1),
  display_name: z.string().min(1),
  capacity: z.number().int().positive(),
  luggage_capacity: z.number().int().min(0).optional().nullable(),
  ac_available: z.boolean().optional(),
  description: z.string().optional().nullable(),
  images: z.array(z.string()).optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const types = await prisma.vehicleType.findMany({ where: { status: true }, orderBy: { capacity: 'asc' } });
  return ok(types);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.vehicleType.create({ data: parsed.data as Parameters<typeof prisma.vehicleType.create>[0]['data'] });
  return created(record);
}
