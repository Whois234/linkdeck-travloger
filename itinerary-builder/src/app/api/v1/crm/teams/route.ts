import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(80),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const teams = await prisma.crmTeam.findMany({
    orderBy: { created_at: 'asc' },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
  });

  return ok(teams);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const existing = await prisma.crmTeam.findUnique({ where: { name: parsed.data.name } });
  if (existing) return err('A team with this name already exists', 400);

  const team = await prisma.crmTeam.create({
    data: { name: parsed.data.name },
    include: { members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } } },
  });

  return ok(team);
}
