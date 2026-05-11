import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const patchSchema = z.object({
  name:  z.string().min(1).max(40).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const existing = await prisma.contactTag.findUnique({ where: { id: params.id } });
  if (!existing) return notFound('Tag');

  // If renaming, propagate to all contacts that carry the old tag name
  if (parsed.data.name && parsed.data.name.trim() !== existing.name) {
    const newName = parsed.data.name.trim();
    const collision = await prisma.contactTag.findUnique({ where: { name: newName } });
    if (collision && collision.id !== existing.id) return err(`Tag "${newName}" already exists.`, 409);

    const carriers = await prisma.crmContact.findMany({
      where: { tags: { has: existing.name } },
      select: { id: true, tags: true },
    });
    await prisma.$transaction([
      ...carriers.map(c =>
        prisma.crmContact.update({
          where: { id: c.id },
          data: { tags: c.tags.map(t => (t === existing.name ? newName : t)) },
        })
      ),
      prisma.contactTag.update({
        where: { id: params.id },
        data: { name: newName, color: parsed.data.color ?? existing.color },
      }),
    ]);
    const refreshed = await prisma.contactTag.findUnique({ where: { id: params.id } });
    return ok(refreshed);
  }

  const updated = await prisma.contactTag.update({ where: { id: params.id }, data: parsed.data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const existing = await prisma.contactTag.findUnique({ where: { id: params.id } });
  if (!existing) return notFound('Tag');

  // Strip this tag from every contact that has it
  const carriers = await prisma.crmContact.findMany({
    where: { tags: { has: existing.name } },
    select: { id: true, tags: true },
  });
  await prisma.$transaction([
    ...carriers.map(c =>
      prisma.crmContact.update({
        where: { id: c.id },
        data: { tags: c.tags.filter(t => t !== existing.name) },
      })
    ),
    prisma.contactTag.delete({ where: { id: params.id } }),
  ]);

  return ok({ deleted: true, stripped_from: carriers.length });
}
