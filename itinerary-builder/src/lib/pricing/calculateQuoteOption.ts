import { MarkupType, RoundingRule } from '@prisma/client';
import { applyRoundingRule } from './applyRoundingRule';

export interface QuoteOptionInput {
  hotel_cost: number;
  vehicle_cost: number;
  activity_cost: number;
  transfer_cost: number;
  misc_cost: number;
  profit_type: MarkupType;
  profit_value: number;
  discount_amount: number;
  gst_percent: number;
  rounding_rule: RoundingRule;
  adults: number;
}

export interface QuoteOptionBreakdown {
  hotel_cost: number;
  vehicle_cost: number;
  activity_cost: number;
  transfer_cost: number;
  misc_cost: number;
  base_cost: number;
  profit_type: MarkupType;
  profit_value: number;
  profit_amount: number;
  discount_amount: number;
  selling_before_gst: number;
  gst_percent: number;
  gst_amount: number;
  final_price_raw: number;
  final_price: number;
  rounding_adjustment: number;
  price_per_adult_display: number;
  adults: number;
}

export function calculateQuoteOption(params: QuoteOptionInput): QuoteOptionBreakdown {
  const {
    hotel_cost,
    vehicle_cost,
    activity_cost,
    transfer_cost,
    misc_cost,
    profit_type,
    profit_value,
    discount_amount,
    gst_percent,
    rounding_rule,
    adults,
  } = params;

  const base_cost = hotel_cost + vehicle_cost + activity_cost + transfer_cost + misc_cost;

  const profit_amount =
    profit_type === MarkupType.FLAT
      ? profit_value
      : (base_cost * profit_value) / 100;

  const selling_before_gst = base_cost + profit_amount - discount_amount;
  const gst_amount = (selling_before_gst * gst_percent) / 100;
  const final_price_raw = selling_before_gst + gst_amount;
  const final_price = applyRoundingRule(final_price_raw, rounding_rule);
  const rounding_adjustment = final_price - final_price_raw;
  const price_per_adult_display = adults > 0 ? final_price / adults : 0;

  return {
    hotel_cost,
    vehicle_cost,
    activity_cost,
    transfer_cost,
    misc_cost,
    base_cost,
    profit_type,
    profit_value,
    profit_amount,
    discount_amount,
    selling_before_gst,
    gst_percent,
    gst_amount,
    final_price_raw,
    final_price,
    rounding_adjustment,
    price_per_adult_display,
    adults,
  };
}
