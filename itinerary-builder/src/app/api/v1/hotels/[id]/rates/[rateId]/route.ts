import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, canEditRates } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';

const UpdateSchema = z.object({
  single_occupancy_cost: z.number().positive().optional(),
  double_occupancy_cost: z.number().positive().optional(),
  triple_occupancy_cost: z.number().positive().optional().nullable(),
  quad_occupancy_cost: z.number().positive().optional().nullable(),
  extra_adult_cost: z.number().min(0).optional().nullable(),
  child_with_bed_cost: z.number().min(0).optional().nullable(),
  child_without_bed_cost: z.number().min(0).optional().nullable(),
  weekend_surcharge: z.number().min(0).optional().nullable(),
  season_name: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.boolean().optional(),
}).passthrough();

export async function PUT(req: NextRequest, { params }: { params: { id: string; rateId: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!canEditRates(user)) return forbidden();

  const rate = await prisma.hotelRate.findFirst({ where: { id: params.rateId, hotel_id: params.id } });
  if (!rate) return notFound('Hotel Rate');

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const updated = await prisma.hotelRate.update({ where: { id: params.rateId }, data: parsed.data });
  return ok(updated);
}
