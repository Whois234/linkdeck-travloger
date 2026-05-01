import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { err } from '@/lib/api-response';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return err('Invalid request', 400, parsed.error.flatten());

  const { email, password, remember } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email, status: true } });
  if (!user) return err('Invalid email or password', 401);

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return err('Invalid email or password', 401);

  // Update last_login timestamp
  await prisma.user.update({ where: { id: user.id }, data: { last_login: new Date() } });

  const token = await signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    agent_id: user.agent_id ?? undefined,
    module_access: user.module_access ? (JSON.parse(user.module_access) as string[]) : null,
  });

  const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 8; // 30 days or 8 hours

  const res = NextResponse.json({
    success: true,
    data: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  res.cookies.set('travloger_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
  return res;
}
