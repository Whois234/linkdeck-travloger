import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, GroupBatchStatus } from '@prisma/client';

const BatchSchema = z.object({
  batch_name:          z.string().min(1),
  start_date:          z.string(),
  end_date:            z.string(),
  total_seats:         z.number().int().min(1),
  available_seats:     z.number().int().min(0),
  adult_price:         z.number().min(0),
  child_5_12_price:    z.number().min(0),
  child_below_5_price: z.number().min(0),
  single_supplement:   z.number().min(0).optional().nullable(),
  gst_percent:         z.number().min(0).default(5),
  booking_status:      z.nativeEnum(GroupBatchStatus).default('OPEN'),
  badge_text:          z.string().optional().nullable(),
  badge_color:         z.string().optional().nullable(),
  assigned_agent_id:   z.string().optional().nullable(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const batches = await prisma.groupBatch.findMany({
    where: { group_template_id: params.id, status: true },
    orderBy: { start_date: 'asc' },
  });
  return ok(batches);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS, UserRole.SALES)) return forbidden();

  const tpl = await prisma.groupTemplate.findUnique({ where: { id: params.id } });
  if (!tpl) return notFound('Group Template');

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const batch = await prisma.groupBatch.create({
    data: {
      ...parsed.data,
      group_template_id: params.id,
      start_date: new Date(parsed.data.start_date),
      end_date: new Date(parsed.data.end_date),
    } as Parameters<typeof prisma.groupBatch.create>[0]['data'],
  });
  return created(batch);
}
