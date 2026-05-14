import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const Schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().min(7).max(20).regex(/^[0-9+\-\s()]+$/, 'Phone has invalid characters'),
  whatsapp: z.string().trim().max(20).regex(/^[0-9+\-\s()]*$/, 'Invalid WhatsApp number').nullable().optional(),
  email: z.string().trim().email().toLowerCase().nullable().optional().or(z.literal('').transform(() => null)),
  city: z.string().trim().max(80).nullable().optional(),
  nationality: z.string().trim().max(60).nullable().optional(),
  lead_id: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const PRIVILEGED = [UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.OPS] as UserRole[];

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  const isPrivileged = requireRole(user, ...PRIVILEGED);

  // Non-privileged users see customers they created OR customers linked to their quotes
  const ownerFilter = isPrivileged
    ? {}
    : { OR: [{ created_by: user.sub }, { quotes: { some: { created_by: user.sub } } }] };

  const customers = await prisma.customer.findMany({
    where: q
      ? { AND: [ownerFilter, { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }] }
      : ownerFilter,
    orderBy: { created_at: 'desc' },
    take: 200,
  });

  // Resolve creator names
  const creatorIds = Array.from(new Set(customers.map(c => c.created_by).filter((v): v is string => !!v)));
  const creators = creatorIds.length
    ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
    : [];
  const creatorById = Object.fromEntries(creators.map(u => [u.id, u.name]));

  const enriched = customers.map(c => ({
    ...c,
    created_by_name: c.created_by ? (creatorById[c.created_by] ?? 'Unknown') : null,
  }));

  return ok(enriched);
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
