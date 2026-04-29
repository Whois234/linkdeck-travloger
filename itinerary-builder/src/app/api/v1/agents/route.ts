import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const Schema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  photo: z.string().optional().nullable(),
  designation: z.string().optional().nullable(),
  rating: z.number().min(0).max(5).optional().nullable(),
  years_experience: z.number().int().min(0).optional().nullable(),
  speciality: z.string().optional().nullable(),
  available_hours: z.string().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const agents = await prisma.agent.findMany({ where: { status: true }, orderBy: { name: 'asc' } });
  return ok(agents);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.agent.create({ data: parsed.data as Parameters<typeof prisma.agent.create>[0]['data'] });
  return created(record);
}
