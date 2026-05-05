import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, canEditRates } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden, notFound } from '@/lib/api-response';

const RateSchema = z.object({
  room_category_id: z.string(),
  meal_plan_id: z.string(),
  season_name: z.string().optional().nullable(),
  valid_from: z.string().datetime(),
  valid_to: z.string().datetime(),
  currency: z.string().optional(),
  single_occupancy_cost: z.number().positive(),
  double_occupancy_cost: z.number().positive(),
  triple_occupancy_cost: z.number().positive().optional().nullable(),
  quad_occupancy_cost: z.number().positive().optional().nullable(),
  extra_adult_cost: z.number().min(0).optional().nullable(),
  child_with_bed_cost: z.number().min(0).optional().nullable(),
  child_without_bed_cost: z.number().min(0).optional().nullable(),
  weekend_surcharge: z.number().min(0).optional().nullable(),
  festival_surcharge: z.number().min(0).optional().nullable(),
  minimum_nights: z.number().int().positive().optional().nullable(),
  tax_included: z.boolean().optional(),
  supplier_gst_percent: z.number().min(0).optional().nullable(),
  blackout_dates: z.array(z.string()).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const hotel = await prisma.hotel.findUnique({ where: { id: params.id } });
  if (!hotel) return notFound('Hotel');

  const rates = await prisma.hotelRate.findMany({
    where: { hotel_id: params.id, status: true },
    include: {
      room_category: true,
      meal_plan: true,
    },
    orderBy: [{ room_category_id: 'asc' }, { valid_from: 'asc' }],
  });
  return ok(rates);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!canEditRates(user)) return forbidden();

  const hotel = await prisma.hotel.findUnique({ where: { id: params.id } });
  if (!hotel) return notFound('Hotel');

  const body = await req.json();
  const parsed = RateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  // Check for overlapping rates for same hotel + room + meal plan + dates
  const validFrom = new Date(parsed.data.valid_from);
  const validTo = new Date(parsed.data.valid_to);

  if (validFrom >= validTo) return err('valid_to must be after valid_from', 400);

  const overlap = await prisma.hotelRate.findFirst({
    where: {
      hotel_id: params.id,
      room_category_id: parsed.data.room_category_id,
      meal_plan_id: parsed.data.meal_plan_id,
      status: true,
      AND: [
        { valid_from: { lt: validTo } },
        { valid_to: { gt: validFrom } },
      ],
    },
  });

  if (overlap) {
    return err(
      `Overlapping rate exists for this room category and meal plan from ${overlap.valid_from.toISOString().split('T')[0]} to ${overlap.valid_to.toISOString().split('T')[0]}`,
      409
    );
  }

  const rate = await prisma.hotelRate.create({
    data: {
      ...parsed.data,
      hotel_id: params.id,
      valid_from: validFrom,
      valid_to: validTo,
    } as Parameters<typeof prisma.hotelRate.create>[0]['data'],
  });
  return created(rate);
}
