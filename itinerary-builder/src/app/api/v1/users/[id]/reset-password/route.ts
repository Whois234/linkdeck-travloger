import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound, err } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const ResetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const body = await req.json();
  const parsed = ResetPasswordSchema.safeParse(body);
  if (!parsed.success) return err('Invalid request', 400, parsed.error.flatten());

  const target = await prisma.user.findUnique({ where: { id: params.id } });
  if (!target) return notFound('User not found');

  const hashed = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.update({ where: { id: params.id }, data: { password: hashed } });

  return ok({ message: 'Password reset successfully' });
}
