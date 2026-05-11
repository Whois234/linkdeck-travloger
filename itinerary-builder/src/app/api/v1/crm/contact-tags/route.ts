import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';
import { z } from 'zod';

const schema = z.object({
  name:  z.string().min(1).max(40),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const tags = await prisma.contactTag.findMany({ where: { status: true }, orderBy: { name: 'asc' } });
  return ok(tags);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const trimmed = parsed.data.name.trim();
  const existing = await prisma.contactTag.findUnique({ where: { name: trimmed } });
  if (existing) return err(`Tag "${trimmed}" already exists.`, 409);

  const tag = await prisma.contactTag.create({
    data: { name: trimmed, color: parsed.data.color ?? '#64748B' },
  });
  return created(tag);
}
