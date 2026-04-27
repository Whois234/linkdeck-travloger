import { NextRequest } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, unauthorized, forbidden, err } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = Math.min(100, parseInt(searchParams.get('limit') ?? '20'));
  const search = searchParams.get('search') ?? '';
  const role = searchParams.get('role') ?? '';

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (role && Object.values(UserRole).includes(role as UserRole)) {
    where.role = role as UserRole;
  }

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        agent_id: true,
        status: true,
        last_login: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return ok({ items, total, page, limit, pages: Math.ceil(total / limit) });
}

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.nativeEnum(UserRole),
  agent_id: z.string().optional().nullable(),
  status: z.boolean().optional().default(true),
});

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const body = await req.json();
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) return err('Invalid request', 400, parsed.error.flatten());

  const { name, email, password, role, agent_id, status } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return err('A user with this email already exists', 409);

  if (agent_id) {
    const agentExists = await prisma.user.findUnique({ where: { agent_id } });
    if (agentExists) return err('Agent ID is already in use', 409);
  }

  const hashed = await bcrypt.hash(password, 12);

  const newUser = await prisma.user.create({
    data: { name, email, password: hashed, role, agent_id: agent_id ?? null, status },
    select: { id: true, name: true, email: true, role: true, agent_id: true, status: true, created_at: true },
  });

  return created(newUser);
}
