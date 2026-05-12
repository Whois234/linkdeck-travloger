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
    select: { id: true, name: true, email: true, role: true, phone: true, gender: true, agent_id: true, module_access: true },
  });
  if (!dbUser) return unauthorized();

  return ok({
    ...dbUser,
    module_access: dbUser.module_access ? (JSON.parse(dbUser.module_access) as string[]) : null,
  });
}

const UpdateProfileSchema = z.object({
  name:   z.string().min(1).max(120).trim().optional(),
  email:  z.string().email().toLowerCase().optional(),
  phone:  z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/).optional().or(z.literal('').transform(() => null)),
  gender: z.enum(['male', 'female', 'other', '']).optional().transform(v => v === '' ? null : v),
});

export async function PUT(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) return err('Invalid request', 400);

  const { name, email, phone, gender } = parsed.data;

  // Check email uniqueness if changing
  if (email) {
    const existing = await prisma.user.findFirst({ where: { email, NOT: { id: user.sub } } });
    if (existing) return err('Email already in use', 409);
  }

  const data: Record<string, unknown> = {};
  if (name   !== undefined) data.name   = name;
  if (email  !== undefined) data.email  = email;
  if (phone  !== undefined) data.phone  = phone ?? null;
  if (gender !== undefined) data.gender = gender ?? null;

  const updated = await prisma.user.update({
    where: { id: user.sub },
    data,
    select: { id: true, name: true, email: true, role: true, phone: true, gender: true },
  });

  return ok(updated);
}
