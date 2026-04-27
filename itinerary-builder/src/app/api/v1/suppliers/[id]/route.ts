import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const UpdateSchema = z.object({
  name: z.string().min(1).optional(),
  contact_person: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  gst_number: z.string().optional().nullable(),
  pan_number: z.string().optional().nullable(),
  status: z.boolean().optional(),
}).passthrough();

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const supplier = await prisma.supplier.findUnique({ where: { id: params.id } });
  if (!supplier) return notFound('Supplier');

  const updated = await prisma.supplier.update({ where: { id: params.id }, data: parsed.data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();
  const supplier = await prisma.supplier.findUnique({ where: { id: params.id } });
  if (!supplier) return notFound('Supplier');
  await prisma.supplier.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Supplier deactivated' });
}
