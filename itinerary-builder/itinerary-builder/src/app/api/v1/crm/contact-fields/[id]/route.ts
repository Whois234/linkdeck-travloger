import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const FIELD_TYPES = ['text', 'email', 'phone', 'number', 'date', 'select', 'multiselect', 'textarea', 'url'] as const;

const patchSchema = z.object({
  key:         z.string().min(1).regex(/^[a-z0-9_]+$/, 'Key must be lowercase snake_case').optional(),
  label:       z.string().min(1).optional(),
  type:        z.enum(FIELD_TYPES).optional(),
  required:    z.boolean().optional(),
  options:     z.array(z.string()).optional().nullable(),
  placeholder: z.string().optional().nullable(),
  status:      z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const existing = await prisma.contactField.findUnique({ where: { id: params.id } });
  if (!existing) return notFound('Contact field');

  const data: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.options !== undefined) {
    data.options = parsed.data.options as unknown as object;
  }

  const updated = await prisma.contactField.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const existing = await prisma.contactField.findUnique({ where: { id: params.id } });
  if (!existing) return notFound('Contact field');
  if (existing.is_system) return err('System fields cannot be deleted. You can hide them instead.', 400);

  await prisma.contactField.delete({ where: { id: params.id } });
  return ok({ deleted: true });
}
