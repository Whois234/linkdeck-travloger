import { prisma } from '@/lib/prisma';

interface RoomAllocation {
  type: string;
  count: number;
  adults: number;
  children_with_bed: number;
  children_without_bed: number;
}

interface RoomingJson {
  rooms: RoomAllocation[];
}

interface NightBreakdown {
  date: string;
  base_cost: number;
  weekend_surcharge: number;
  cwb_cost: number;
  cwob_cost: number;
  night_total: number;
}

export interface HotelCostResult {
  hotel_name: string;
  room_category_name: string;
  meal_plan_code: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  breakdown: NightBreakdown[];
  total_cost: number;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function getRoomCost(
  rate: {
    single_occupancy_cost: number;
    double_occupancy_cost: number;
    triple_occupancy_cost: number | null;
    quad_occupancy_cost: number | null;
    extra_adult_cost: number | null;
  },
  adults: number
): number {
  if (adults <= 1) return rate.single_occupancy_cost;
  if (adults === 2) return rate.double_occupancy_cost;
  if (adults === 3) return rate.triple_occupancy_cost ?? rate.double_occupancy_cost + (rate.extra_adult_cost ?? 0);
  if (adults === 4) return rate.quad_occupancy_cost ?? rate.triple_occupancy_cost ?? rate.double_occupancy_cost + (rate.extra_adult_cost ?? 0) * 2;
  const baseAdults = Math.min(adults, 4);
  const baseCost = getRoomCost(rate, baseAdults);
  return baseCost + (adults - 4) * (rate.extra_adult_cost ?? 0);
}

export async function calculateHotelCost(params: {
  hotel_id: string;
  room_category_id: string;
  meal_plan_id: string;
  check_in_date: Date;
  check_out_date: Date;
  rooming_json: RoomingJson;
}): Promise<HotelCostResult> {
  const { hotel_id, room_category_id, meal_plan_id, check_in_date, check_out_date, rooming_json } = params;

  const checkIn = new Date(check_in_date);
  checkIn.setHours(0, 0, 0, 0);
  const checkOut = new Date(check_out_date);
  checkOut.setHours(0, 0, 0, 0);

  const nights: Date[] = [];
  const cur = new Date(checkIn);
  while (cur < checkOut) {
    nights.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }

  if (nights.length === 0) throw new Error('check_out_date must be after check_in_date');

  // Fetch all reference data and rates in parallel (one query each instead of N per night)
  const [hotel, roomCat, mealPlan, allRates] = await Promise.all([
    prisma.hotel.findUnique({ where: { id: hotel_id }, select: { hotel_name: true } }),
    prisma.roomCategory.findUnique({ where: { id: room_category_id }, select: { room_category_name: true } }),
    prisma.mealPlan.findUnique({ where: { id: meal_plan_id }, select: { code: true } }),
    prisma.hotelRate.findMany({
      where: {
        hotel_id,
        room_category_id,
        meal_plan_id,
        valid_from: { lte: checkOut },
        valid_to: { gt: checkIn },
        status: true,
      },
      orderBy: { valid_from: 'asc' },
    }),
  ]);

  const breakdown: NightBreakdown[] = [];
  let total_cost = 0;

  for (const nightDate of nights) {
    const rate = allRates.find(
      (r) => r.valid_from <= nightDate && r.valid_to > nightDate
    );

    if (!rate) {
      const dateStr = nightDate.toISOString().split('T')[0];
      throw new Error(
        `No rate found for ${hotel?.hotel_name ?? hotel_id} (${roomCat?.room_category_name ?? room_category_id}, ${mealPlan?.code ?? meal_plan_id}) on ${dateStr}. Please add rates before calculating.`
      );
    }

    let nightBaseCost = 0;
    let nightCwb = 0;
    let nightCwob = 0;

    for (const room of rooming_json.rooms) {
      nightBaseCost += getRoomCost(rate, room.adults) * room.count;
      nightCwb += (rate.child_with_bed_cost ?? 0) * room.children_with_bed * room.count;
      nightCwob += (rate.child_without_bed_cost ?? 0) * room.children_without_bed * room.count;
    }

    const weekend_surcharge = isWeekend(nightDate) && rate.weekend_surcharge
      ? rate.weekend_surcharge * rooming_json.rooms.reduce((sum, r) => sum + r.count, 0)
      : 0;

    const night_total = nightBaseCost + nightCwb + nightCwob + weekend_surcharge;
    total_cost += night_total;

    breakdown.push({
      date: nightDate.toISOString().split('T')[0],
      base_cost: nightBaseCost,
      weekend_surcharge,
      cwb_cost: nightCwb,
      cwob_cost: nightCwob,
      night_total,
    });
  }

  return {
    hotel_name: hotel?.hotel_name ?? hotel_id,
    room_category_name: roomCat?.room_category_name ?? room_category_id,
    meal_plan_code: mealPlan?.code ?? meal_plan_id,
    check_in_date: check_in_date.toISOString().split('T')[0],
    check_out_date: check_out_date.toISOString().split('T')[0],
    nights: nights.length,
    breakdown,
    total_cost,
  };
}
