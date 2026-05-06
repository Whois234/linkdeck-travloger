import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const patchSchema = z.object({
  name:     z.string().min(1).optional(),
  phone:    z.string().min(1).optional(),
  email:    z.string().email().nullable().optional(),
  source:   z.string().nullable().optional(),
  notes:    z.string().nullable().optional(),
  owner_id: z.string().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const contact = await prisma.crmContact.findUnique({
    where: { id: params.id },
    include: {
      leads: {
        include: {
          stage:    { select: { id: true, name: true, color: true } },
          pipeline: { select: { id: true, name: true } },
          _count:   { select: { call_logs: true, lead_notes: true } },
        },
        orderBy: { created_at: 'desc' },
      },
    },
  });
  if (!contact) return notFound('Contact');

  const owner = await prisma.user.findUnique({ where: { id: contact.owner_id }, select: { id: true, name: true, email: true } });
  return ok({ ...contact, owner });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const contact = await prisma.crmContact.findUnique({ where: { id: params.id } });
  if (!contact) return notFound('Contact');

  // Only admin/manager can change owner or edit others' contacts
  const isOwner = contact.owner_id === user.sub;
  const isAdmin = requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
  if (!isOwner && !isAdmin) return forbidden();

  const body   = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  // Only admin/manager can change owner
  if (parsed.data.owner_id && !isAdmin) return forbidden();

  const updateData: Record<string, unknown> = { ...parsed.data };

  // Normalize and check phone uniqueness if changing
  if (parsed.data.phone) {
    const normalized = parsed.data.phone.replace(/[\s\-\(\)]/g, '');
    const existing = await prisma.crmContact.findUnique({ where: { phone: normalized } });
    if (existing && existing.id !== params.id) return err('This phone number belongs to another contact.', 409);
    updateData.phone = normalized;
  }

  const updated = await prisma.crmContact.update({
    where: { id: params.id },
    data:  updateData,
  });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();
  await prisma.crmContact.delete({ where: { id: params.id } }).catch(() => {});
  return ok({ deleted: true });
}
