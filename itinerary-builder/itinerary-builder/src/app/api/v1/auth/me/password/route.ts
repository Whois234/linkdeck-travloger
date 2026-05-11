import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getAuthUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ok, unauthorized, err } from '@/lib/api-response';

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

export async function PUT(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = ChangePasswordSchema.safeParse(body);
  if (!parsed.success) return err('Invalid request', 400);

  const { current_password, new_password } = parsed.data;

  const dbUser = await prisma.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) return unauthorized();

  const valid = await bcrypt.compare(current_password, dbUser.password);
  if (!valid) return err('Current password is incorrect', 400);

  const hashed = await bcrypt.hash(new_password, 10);
  await prisma.user.update({ where: { id: user.sub }, data: { password: hashed } });

  return ok({ message: 'Password updated successfully' });
}
