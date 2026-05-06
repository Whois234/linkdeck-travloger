import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, created, err, unauthorized } from '@/lib/api-response';
import { z } from 'zod';

const createSchema = z.object({
  name:   z.string().min(1),
  phone:  z.string().min(1),
  email:  z.string().email().optional().nullable(),
  source: z.string().optional().nullable(),
  notes:  z.string().optional().nullable(),
});

function buildDateFilter(dateRange: string | null, from: string | null, to: string | null) {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dateRange === 'today') {
    return { gte: startOfDay(now) };
  }
  if (dateRange === 'yesterday') {
    const yd = new Date(now); yd.setDate(yd.getDate() - 1);
    return { gte: startOfDay(yd), lt: startOfDay(now) };
  }
  if (dateRange === 'this_week') {
    const monday = new Date(now); monday.setDate(monday.getDate() - monday.getDay() + 1);
    return { gte: startOfDay(monday) };
  }
  if (dateRange === 'past_7') {
    const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
    return { gte: startOfDay(d7) };
  }
  if (dateRange === 'custom' && from) {
    const f: Record<string, Date> = { gte: new Date(from) };
    if (to) f.lte = new Date(to + 'T23:59:59');
    return f;
  }
  return undefined;
}

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const search    = searchParams.get('search') ?? '';
  const converted = searchParams.get('converted');
  const dateRange = searchParams.get('date_range');
  const dateFrom  = searchParams.get('date_from');
  const dateTo    = searchParams.get('date_to');
  const sortBy    = searchParams.get('sort') ?? 'newest';

  const dateFilter = buildDateFilter(dateRange, dateFrom, dateTo);

  const contacts = await prisma.crmContact.findMany({
    where: {
      ...(search ? {
        OR: [
          { name:  { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      } : {}),
      ...(converted === 'true'  ? { is_converted: true  } : {}),
      ...(converted === 'false' ? { is_converted: false } : {}),
      ...(dateFilter ? { created_at: dateFilter } : {}),
    },
    include: {
      leads: {
        include: {
          stage: { select: { id: true, name: true, color: true } },
          pipeline: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
      },
    },
    orderBy: sortBy === 'oldest' ? { created_at: 'asc' }
           : sortBy === 'name'   ? { name: 'asc' }
           :                       { created_at: 'desc' },
  });

  const ownerIds = Array.from(new Set(contacts.map(c => c.owner_id)));
  const owners   = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, name: true, email: true },
  });
  const ownerMap = Object.fromEntries(owners.map(o => [o.id, o]));

  const result = contacts.map(c => ({
    ...c,
    owner: ownerMap[c.owner_id] ?? null,
  }));

  return ok(result);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body   = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const normalizedPhone = parsed.data.phone.replace(/[\s\-\(\)]/g, '');

  const existing = await prisma.crmContact.findUnique({ where: { phone: normalizedPhone } });
  if (existing) {
    const ownerUser = await prisma.user.findUnique({ where: { id: existing.owner_id }, select: { name: true } });
    const ownerName = ownerUser?.name ?? 'another team member';
    await prisma.duplicateContactAttempt.create({
      data: { phone: normalizedPhone, attempted_by: user.sub, existing_owner_id: existing.owner_id },
    }).catch(() => {});
    return err(`This contact already exists and is owned by ${ownerName}.`, 409);
  }

  const contact = await prisma.crmContact.create({
    data: {
      name:     parsed.data.name,
      phone:    normalizedPhone,
      email:    parsed.data.email ?? null,
      source:   parsed.data.source ?? null,
      notes:    parsed.data.notes ?? null,
      owner_id: user.sub,
    },
  });

  return created(contact);
}
