/**
 * PATCH /api/v1/quotes/[id]/options/[optionId]
 * Updates discount and/or gst_percent on a single QuoteOption, recalculates
 * all derived pricing fields, persists, and auto-republishes the snapshot so
 * the customer itinerary reflects the change immediately.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, RoundingRule } from '@prisma/client';
import { calculateQuoteOption } from '@/lib/pricing/calculateQuoteOption';
import { generateQuoteSnapshot } from '@/lib/pricing/generateQuoteSnapshot';

const PatchSchema = z.object({
  discount_amount:     z.number().min(0).optional(),
  discount_expires_at: z.string().datetime().nullable().optional(),
  gst_percent:         z.number().min(0).max(100).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; optionId: string } },
) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const body = await req.json();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const option = await prisma.quoteOption.findUnique({
    where: { id: params.optionId },
    include: { quote: { select: { id: true, adults: true, status: true } } },
  });
  if (!option || option.quote_id !== params.id) return notFound('QuoteOption');

  const {
    discount_amount     = option.discount_amount,
    discount_expires_at,
    gst_percent         = option.gst_percent,
  } = parsed.data;

  const pricing = calculateQuoteOption({
    hotel_cost:    option.hotel_cost,
    vehicle_cost:  option.vehicle_cost,
    activity_cost: option.activity_cost,
    transfer_cost: option.transfer_cost,
    misc_cost:     option.misc_cost,
    profit_type:   option.profit_type,
    profit_value:  option.profit_value,
    discount_amount,
    gst_percent,
    rounding_rule: RoundingRule.NONE,
    adults:        option.quote.adults,
  });

  // Determine new discount_expires_at: if explicitly passed use it; otherwise keep existing
  const newExpiresAt = discount_expires_at !== undefined
    ? (discount_expires_at ? new Date(discount_expires_at) : null)
    : option.discount_expires_at;

  const updated = await prisma.quoteOption.update({
    where: { id: params.optionId },
    data: {
      gst_percent:          gst_percent,
      discount_amount:      pricing.discount_amount,
      discount_expires_at:  newExpiresAt,
      selling_before_gst:   pricing.selling_before_gst,
      gst_amount:           pricing.gst_amount,
      final_price:          pricing.final_price,
      price_per_adult_display: pricing.price_per_adult_display,
      rounding_adjustment:  pricing.rounding_adjustment,
    },
  });

  // Auto-republish so the customer itinerary page reflects the new price
  try {
    await generateQuoteSnapshot(params.id, user.sub);
  } catch {
    // Non-fatal — caller can re-publish manually
  }

  return ok(updated);
}
