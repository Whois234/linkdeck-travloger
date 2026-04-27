import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ok, unauthorized, err } from '@/lib/api-response';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true, name: true, email: true, role: true, agent_id: true },
  });
  if (!dbUser) return unauthorized();

  return ok(dbUser);
}

const UpdateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

export async function PUT(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) return err('Invalid request', 400);

  const { name, email } = parsed.data;

  // Check email uniqueness if changing
  if (email) {
    const existing = await prisma.user.findFirst({ where: { email, NOT: { id: user.sub } } });
    if (existing) return err('Email already in use', 409);
  }

  const updated = await prisma.user.update({
    where: { id: user.sub },
    data: { ...(name && { name }), ...(email && { email }) },
    select: { id: true, name: true, email: true, role: true },
  });

  return ok(updated);
}
