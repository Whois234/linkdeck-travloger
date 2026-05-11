import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, created, err, unauthorized } from '@/lib/api-response';
import { z } from 'zod';

const createSchema = z.object({
  name:          z.string().min(1),
  phone:         z.string().min(1),
  email:         z.string().email().optional().nullable(),
  source:        z.string().optional().nullable(),
  notes:         z.string().optional().nullable(),
  tags:          z.array(z.string()).optional(),
  custom_fields: z.record(z.unknown()).optional().nullable(),
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

const PAGE_LIMIT = 50;

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const search    = searchParams.get('search') ?? '';
  const converted = searchParams.get('converted');
  const dateRange = searchParams.get('date_range');
  const dateFrom  = searchParams.get('date_from');
  const dateTo    = searchParams.get('date_to');
  const tagsParam = searchParams.get('tags'); // comma-separated tag names; contact must have ALL of them
  const sortBy    = searchParams.get('sort') ?? 'newest';
  const page      = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit     = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? String(PAGE_LIMIT), 10)));

  const dateFilter = buildDateFilter(dateRange, dateFrom, dateTo);

  const tagList = tagsParam ? tagsParam.split(',').map(t => t.trim()).filter(Boolean) : [];

  const where = {
    ...(search ? {
      OR: [
        { name:  { contains: search, mode: 'insensitive' as const } },
        { phone: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {}),
    ...(converted === 'true'  ? { is_converted: true  } : {}),
    ...(converted === 'false' ? { is_converted: false } : {}),
    ...(dateFilter ? { created_at: dateFilter } : {}),
    ...(tagList.length ? { tags: { hasEvery: tagList } } : {}),
  };

  const orderBy = sortBy === 'oldest' ? { created_at: 'asc' as const }
                : sortBy === 'name'   ? { name: 'asc' as const }
                :                       { created_at: 'desc' as const };

  const [total, contacts] = await Promise.all([
    prisma.crmContact.count({ where }),
    prisma.crmContact.findMany({
      where,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        leads: {
          select: {
            id: true,
            status: true,
            created_at: true,
            stage:    { select: { id: true, name: true, color: true } },
            pipeline: { select: { id: true, name: true } },
          },
          orderBy: { created_at: 'desc' },
          take: 5,
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return ok({ items: contacts, total, page, limit, pages: Math.ceil(total / limit) });
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
      name:          parsed.data.name,
      phone:         normalizedPhone,
      email:         parsed.data.email ?? null,
      source:        parsed.data.source ?? null,
      notes:         parsed.data.notes ?? null,
      owner_id:      user.sub,
      tags:          parsed.data.tags ?? [],
      custom_fields: (parsed.data.custom_fields ?? undefined) as object | undefined,
    },
  });

  return created(contact);
}
