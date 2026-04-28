import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, MarkupType, RoundingRule } from '@prisma/client';
import { calculateHotelCost } from '@/lib/pricing/calculateHotelCost';
import { calculateQuoteOption } from '@/lib/pricing/calculateQuoteOption';

const HotelSelectionSchema = z.object({
  destination_id: z.string(),
  hotel_id: z.string(),
  room_category_id: z.string(),
  meal_plan_id: z.string(),
  check_in_date: z.string().datetime(),
  check_out_date: z.string().datetime(),
  rooming_json: z.object({
    rooms: z.array(z.object({
      type: z.string(),
      count: z.number().int().positive(),
      adults: z.number().int().min(0),
      children_with_bed: z.number().int().min(0),
      children_without_bed: z.number().int().min(0),
    })),
  }),
  manual_cost_override: z.number().min(0).optional().nullable(),
  override_reason: z.string().optional().nullable(),
});

const QuoteOptionSchema = z.object({
  option_name: z.string().min(1),
  display_order: z.number().int().min(1),
  is_most_popular: z.boolean().optional(),
  vehicle_type_id: z.string().optional().nullable(),
  vehicle_cost: z.number().min(0),
  activity_cost: z.number().min(0).optional(),
  transfer_cost: z.number().min(0).optional(),
  misc_cost: z.number().min(0).optional(),
  profit_type: z.nativeEnum(MarkupType),
  profit_value: z.number().min(0),
  discount_amount: z.number().min(0).optional(),
  gst_percent: z.number().min(0).max(100),
  rounding_rule: z.nativeEnum(RoundingRule),
  internal_notes: z.string().optional().nullable(),
  customer_visible_notes: z.string().optional().nullable(),
  hotels: z.array(HotelSelectionSchema),
});

const CalculateSchema = z.object({
  options: z.array(QuoteOptionSchema).min(1).max(3),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const quote = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!quote) return notFound('Quote');

  const body = await req.json();
  const parsed = CalculateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  // Validate most_popular rule
  const popularCount = parsed.data.options.filter((o) => o.is_most_popular).length;
  if (popularCount > 1) return err('Only one option can be marked as Most Popular', 400);

  try {
    const results: any[] = [];

    for (const option of parsed.data.options) {
      // Calculate hotel costs
      let total_hotel_cost = 0;
      const hotelBreakdowns = [];

      for (const hotel of option.hotels) {
        let hotelCost: number;
        let breakdown;

        if (hotel.manual_cost_override != null) {
          if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) {
            return forbidden();
          }
          if (!hotel.override_reason) {
            return err('override_reason is required when using manual_cost_override', 400);
          }
          hotelCost = hotel.manual_cost_override;
          breakdown = { manual_override: true, cost: hotelCost };
        } else {
          const result = await calculateHotelCost({
            hotel_id: hotel.hotel_id,
            room_category_id: hotel.room_category_id,
            meal_plan_id: hotel.meal_plan_id,
            check_in_date: new Date(hotel.check_in_date),
            check_out_date: new Date(hotel.check_out_date),
            rooming_json: hotel.rooming_json,
          });
          hotelCost = result.total_cost;
          breakdown = result;
        }

        total_hotel_cost += hotelCost;
        hotelBreakdowns.push({ ...hotel, calculated_cost: hotelCost, breakdown });
      }

      const pricing = calculateQuoteOption({
        hotel_cost: total_hotel_cost,
        vehicle_cost: option.vehicle_cost,
        activity_cost: option.activity_cost ?? 0,
        transfer_cost: option.transfer_cost ?? 0,
        misc_cost: option.misc_cost ?? 0,
        profit_type: option.profit_type,
        profit_value: option.profit_value,
        discount_amount: option.discount_amount ?? 0,
        gst_percent: option.gst_percent,
        rounding_rule: option.rounding_rule,
        adults: quote.adults,
      });

      results.push({
        option_name: option.option_name,
        display_order: option.display_order,
        is_most_popular: option.is_most_popular ?? false,
        vehicle_type_id: option.vehicle_type_id,
        hotel_breakdowns: hotelBreakdowns,
        pricing,
      });
    }

    // Auto-set most popular to middle option if 3 options and none marked
    if (parsed.data.options.length === 3 && popularCount === 0) {
      results[1].is_most_popular = true;
    }

    // Persist options + hotel selections.
    // NOTE: We intentionally avoid prisma.$transaction(async tx=>{...}) here because
    // Supabase uses PgBouncer in transaction-pooling mode which does not support
    // Prisma interactive (callback-based) transactions. Instead we delete + re-create
    // sequentially — the operation is idempotent so partial failures are safe to retry.
    await prisma.quoteOption.deleteMany({ where: { quote_id: params.id } });

    for (const result of results) {
        const qo = await prisma.quoteOption.create({
          data: {
            quote_id: params.id,
            option_name: result.option_name,
            display_order: result.display_order,
            is_most_popular: result.is_most_popular,
            vehicle_type_id: result.vehicle_type_id,
            vehicle_cost: result.pricing.vehicle_cost,
            hotel_cost: result.pricing.hotel_cost,
            activity_cost: result.pricing.activity_cost,
            transfer_cost: result.pricing.transfer_cost,
            misc_cost: result.pricing.misc_cost,
            base_cost: result.pricing.base_cost,
            profit_type: result.pricing.profit_type,
            profit_value: result.pricing.profit_value,
            profit_amount: result.pricing.profit_amount,
            discount_amount: result.pricing.discount_amount,
            selling_before_gst: result.pricing.selling_before_gst,
            gst_percent: result.pricing.gst_percent,
            gst_amount: result.pricing.gst_amount,
            final_price: result.pricing.final_price,
            price_per_adult_display: result.pricing.price_per_adult_display,
            rounding_adjustment: result.pricing.rounding_adjustment,
          },
        });

        const inputOption = parsed.data.options.find((o) => o.option_name === result.option_name)!;
        for (const h of inputOption.hotels) {
          const hb = result.hotel_breakdowns.find((b: any) => b.hotel_id === h.hotel_id && b.destination_id === h.destination_id);
          await prisma.quoteOptionHotel.create({
            data: {
              quote_option_id: qo.id,
              destination_id: h.destination_id,
              hotel_id: h.hotel_id,
              room_category_id: h.room_category_id,
              meal_plan_id: h.meal_plan_id,
              check_in_date: new Date(h.check_in_date),
              check_out_date: new Date(h.check_out_date),
              nights: Math.round((new Date(h.check_out_date).getTime() - new Date(h.check_in_date).getTime()) / (1000 * 60 * 60 * 24)),
              rooming_json: h.rooming_json,
              calculated_cost: hb?.calculated_cost ?? 0,
              manual_cost_override: h.manual_cost_override,
              override_reason: h.override_reason,
            },
          });
        }
    }

    return ok(results);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Pricing calculation failed';
    return err(message, 422);
  }
}
