import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, GroupBatchStatus } from '@prisma/client';

const Schema = z.object({
  group_template_id: z.string(),
  batch_name: z.string().min(1),
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  total_seats: z.number().int().positive(),
  available_seats: z.number().int().min(0),
  adult_price: z.number().positive(),
  child_5_12_price: z.number().min(0),
  child_below_5_price: z.number().min(0),
  single_supplement: z.number().min(0).optional().nullable(),
  gst_percent: z.number().min(0).max(100),
  fixed_inclusions: z.array(z.string()).optional().nullable(),
  fixed_exclusions: z.array(z.string()).optional().nullable(),
  fixed_policies: z.array(z.string()).optional().nullable(),
  booking_status: z.nativeEnum(GroupBatchStatus).optional(),
  assigned_agent_id: z.string().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const template_id = searchParams.get('template_id');
  const booking_status = searchParams.get('booking_status') as GroupBatchStatus | null;

  const batches = await prisma.groupBatch.findMany({
    where: {
      status: true,
      ...(template_id ? { group_template_id: template_id } : {}),
      ...(booking_status ? { booking_status } : {}),
    },
    include: {
      group_template: { select: { group_template_name: true } },
      assigned_agent: { select: { name: true } },
    },
    orderBy: { start_date: 'asc' },
  });
  return ok(batches);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.OPS)) return forbidden();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.groupBatch.create({
    data: {
      ...parsed.data,
      start_date: new Date(parsed.data.start_date),
      end_date: new Date(parsed.data.end_date),
    } as Parameters<typeof prisma.groupBatch.create>[0]['data'],
  });
  return created(record);
}
