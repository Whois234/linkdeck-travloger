import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getAuthUser } from '@/lib/auth';
import { ok, err, unauthorized } from '@/lib/api-response';
import { calculateHotelCost } from '@/lib/pricing/calculateHotelCost';

const Schema = z.object({
  hotel_id: z.string(),
  room_category_id: z.string(),
  meal_plan_id: z.string(),
  check_in_date: z.string(),
  check_out_date: z.string(),
  // Preferred: per-room pax breakdown (one entry per physical room)
  rooms_config: z.array(z.object({ pax: z.number().int().min(1) })).optional(),
  // Legacy fallback: flat count + uniform adults_per_room
  rooms: z.number().int().positive().optional(),
  adults_per_room: z.number().int().min(1).optional(),
  cwb:  z.number().int().min(0).default(0),
  cwob: z.number().int().min(0).default(0),
});

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const { hotel_id, room_category_id, meal_plan_id, check_in_date, check_out_date,
          rooms_config, rooms, adults_per_room, cwb, cwob } = parsed.data;

  // Build per-room allocation: prefer the explicit rooms_config array so each
  // room uses its own pax count (e.g. Room 1 = 4 pax → QUAD rate).
  const roomsAllocation =
    rooms_config && rooms_config.length > 0
      ? rooms_config.map((rc, i) => ({
          type: 'Double', count: 1, room_number: i + 1,
          adults: rc.pax,
          children_with_bed: cwb,
          children_without_bed: cwob,
        }))
      : [{ type: 'Double', count: rooms ?? 1, adults: adults_per_room ?? 2,
           children_with_bed: cwb, children_without_bed: cwob }];

  try {
    const result = await calculateHotelCost({
      hotel_id,
      room_category_id,
      meal_plan_id,
      check_in_date: new Date(check_in_date),
      check_out_date: new Date(check_out_date),
      rooming_json: { rooms: roomsAllocation },
    });
    return ok({ total_cost: result.total_cost, nights: result.nights, breakdown: result.breakdown });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Rate lookup failed';
    return err(message, 422);
  }
}
