import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound, err } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const found = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, email: true, role: true,
      agent_id: true, status: true, last_login: true, created_at: true, module_access: true,
    },
  });
  if (!found) return notFound('User not found');
  return ok({ ...found, module_access: found.module_access ? JSON.parse(found.module_access) : null });
}

const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole).optional(),
  agent_id: z.string().optional().nullable(),
  status: z.boolean().optional(),
  module_access: z.array(z.object({ key: z.string(), perm: z.enum(['view', 'edit']) })).nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const body = await req.json();
  const parsed = UpdateUserSchema.safeParse(body);
  if (!parsed.success) return err('Invalid request', 400, parsed.error.flatten());

  const existing = await prisma.user.findUnique({ where: { id: params.id } });
  if (!existing) return notFound('User not found');

  // Prevent removing your own admin status
  if (params.id === user.sub && parsed.data.role && parsed.data.role !== UserRole.ADMIN) {
    return err('You cannot change your own role', 400);
  }
  if (params.id === user.sub && parsed.data.status === false) {
    return err('You cannot deactivate your own account', 400);
  }

  // Check email uniqueness
  if (parsed.data.email && parsed.data.email !== existing.email) {
    const emailTaken = await prisma.user.findFirst({
      where: { email: parsed.data.email, NOT: { id: params.id } },
    });
    if (emailTaken) return err('Email already in use', 409);
  }

  // Check agent_id uniqueness
  if (parsed.data.agent_id && parsed.data.agent_id !== existing.agent_id) {
    const agentTaken = await prisma.user.findFirst({
      where: { agent_id: parsed.data.agent_id, NOT: { id: params.id } },
    });
    if (agentTaken) return err('Agent ID already in use', 409);
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.email !== undefined) data.email = parsed.data.email;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.agent_id !== undefined) data.agent_id = parsed.data.agent_id;
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.module_access !== undefined) {
    data.module_access = parsed.data.module_access === null ? null : JSON.stringify(parsed.data.module_access);
  }

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.user.update({
    where: { id: params.id },
    data,
    select: {
      id: true, name: true, email: true, role: true,
      agent_id: true, status: true, last_login: true, created_at: true,
    },
  });

  return ok(updated);
}
