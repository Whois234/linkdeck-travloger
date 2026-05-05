import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const Schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  city: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  lead_id: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const PRIVILEGED = [UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.OPS] as UserRole[];

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  const isPrivileged = requireRole(user, ...PRIVILEGED);

  // Non-privileged users only see customers they created
  const ownerFilter = isPrivileged ? {} : { created_by: user.sub };

  const customers = await prisma.customer.findMany({
    where: {
      ...ownerFilter,
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}),
    },
    orderBy: { name: 'asc' },
    take: 100,
  });
  return ok(customers);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  // Deduplicate by phone — if number already exists, return that customer
  const existing = await prisma.customer.findFirst({ where: { phone: parsed.data.phone } });
  if (existing) {
    // If existing customer has no owner, claim it for this user
    if (!existing.created_by) {
      await prisma.customer.update({ where: { id: existing.id }, data: { created_by: user.sub } });
    }
    return ok({ ...existing, created_by: existing.created_by ?? user.sub });
  }

  const record = await prisma.customer.create({
    data: { ...(parsed.data as Parameters<typeof prisma.customer.create>[0]['data']), created_by: user.sub },
  });
  return created(record);
}
