import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

const Schema = z.object({
  group_template_name: z.string().min(1),
  state_id: z.string(),
  destinations: z.array(z.string()),
  duration_days: z.number().int().positive(),
  duration_nights: z.number().int().min(0),
  hero_image: z.string().optional().nullable(),
  gallery_images: z.array(z.string()).optional().nullable(),
  theme: z.string().optional().nullable(),
  start_city: z.string().optional().nullable(),
  end_city: z.string().optional().nullable(),
  tab_title: z.string().optional().nullable(),
  cms_data: z.record(z.unknown()).optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const state_id   = searchParams.get('state_id');
  const statusRaw  = searchParams.get('status');
  const statusFilter =
    statusRaw === 'live'    ? { status: true,  deleted_at: null } :
    statusRaw === 'draft'   ? { status: false, deleted_at: null } :
    statusRaw === 'deleted' ? { deleted_at: { not: null } }        :
    { deleted_at: null };   // default: exclude trashed items

  const templates = await prisma.groupTemplate.findMany({
    where: { ...statusFilter, ...(state_id ? { state_id } : {}) },
    include: {
      state: { select: { name: true } },
      group_template_days: { orderBy: { sort_order: 'asc' } },
      group_batches: { where: { status: true }, orderBy: { start_date: 'asc' } },
    },
    orderBy: { group_template_name: 'asc' },
    take: 200,
  });

  // Resolve creator names for all templates that have a created_by user id
  const creatorIds = Array.from(new Set(templates.map(t => t.created_by).filter((v): v is string => !!v)));
  const creators = creatorIds.length
    ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true } })
    : [];
  const creatorById = Object.fromEntries(creators.map(u => [u.id, u.name]));

  const enriched = templates.map(t => ({
    ...t,
    created_by_name: t.created_by ? (creatorById[t.created_by] ?? 'Unknown') : null,
  }));

  return ok(enriched);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.groupTemplate.create({
    data: {
      ...(parsed.data as Parameters<typeof prisma.groupTemplate.create>[0]['data']),
      created_by: user.sub,
    },
  });
  return created(record);
}
