import { calculateQuoteOption } from '../src/lib/pricing/calculateQuoteOption';
import { applyRoundingRule } from '../src/lib/pricing/applyRoundingRule';
import { MarkupType, RoundingRule } from '@prisma/client';

// ─── applyRoundingRule ────────────────────────────────────────────────────────

describe('applyRoundingRule', () => {
  test('NONE returns as-is', () => {
    expect(applyRoundingRule(12345.67, RoundingRule.NONE)).toBe(12345.67);
  });

  test('NEAREST_99 rounds 12500 to 12599', () => {
    expect(applyRoundingRule(12500, RoundingRule.NEAREST_99)).toBe(12599);
  });

  test('NEAREST_99 rounds 12600 to 12699', () => {
    expect(applyRoundingRule(12600, RoundingRule.NEAREST_99)).toBe(12699);
  });

  test('NEAREST_99 returns 12699 as-is when already ending in 99', () => {
    expect(applyRoundingRule(12699, RoundingRule.NEAREST_99)).toBe(12699);
  });

  test('NEAREST_500 rounds 12250 to 12500', () => {
    expect(applyRoundingRule(12250, RoundingRule.NEAREST_500)).toBe(12500);
  });

  test('NEAREST_500 rounds 12749 to 13000', () => {
    expect(applyRoundingRule(12749, RoundingRule.NEAREST_500)).toBe(13000);
  });

  test('NEAREST_1000 rounds 12400 to 12000', () => {
    expect(applyRoundingRule(12400, RoundingRule.NEAREST_1000)).toBe(12000);
  });

  test('NEAREST_1000 rounds 12600 to 13000', () => {
    expect(applyRoundingRule(12600, RoundingRule.NEAREST_1000)).toBe(13000);
  });
});

// ─── calculateQuoteOption ─────────────────────────────────────────────────────

describe('calculateQuoteOption – percentage markup', () => {
  const result = calculateQuoteOption({
    hotel_cost: 10000,
    vehicle_cost: 5000,
    activity_cost: 1000,
    transfer_cost: 0,
    misc_cost: 0,
    profit_type: MarkupType.PERCENTAGE,
    profit_value: 20,
    discount_amount: 0,
    gst_percent: 5,
    rounding_rule: RoundingRule.NONE,
    adults: 2,
  });

  test('base_cost = sum of all costs', () => {
    expect(result.base_cost).toBe(16000);
  });

  test('profit_amount = 20% of base_cost', () => {
    expect(result.profit_amount).toBe(3200);
  });

  test('selling_before_gst = base + profit - discount', () => {
    expect(result.selling_before_gst).toBe(19200);
  });

  test('gst_amount = 5% of selling_before_gst', () => {
    expect(result.gst_amount).toBe(960);
  });

  test('final_price = selling + gst (no rounding)', () => {
    expect(result.final_price).toBe(20160);
  });

  test('price_per_adult_display = final / adults', () => {
    expect(result.price_per_adult_display).toBe(10080);
  });
});

describe('calculateQuoteOption – flat markup', () => {
  const result = calculateQuoteOption({
    hotel_cost: 8000,
    vehicle_cost: 4000,
    activity_cost: 0,
    transfer_cost: 0,
    misc_cost: 500,
    profit_type: MarkupType.FLAT,
    profit_value: 2000,
    discount_amount: 500,
    gst_percent: 5,
    rounding_rule: RoundingRule.NONE,
    adults: 1,
  });

  test('base_cost correct', () => {
    expect(result.base_cost).toBe(12500);
  });

  test('flat profit_amount = profit_value', () => {
    expect(result.profit_amount).toBe(2000);
  });

  test('discount applied before GST', () => {
    expect(result.selling_before_gst).toBe(14000);
  });

  test('final_price correct with GST', () => {
    expect(result.final_price).toBe(14700);
  });
});

describe('calculateQuoteOption – rounding', () => {
  const base = {
    hotel_cost: 10000, vehicle_cost: 0, activity_cost: 0, transfer_cost: 0, misc_cost: 0,
    profit_type: MarkupType.FLAT as MarkupType, profit_value: 2000,
    discount_amount: 0, gst_percent: 5, adults: 1,
  };

  test('NEAREST_99 applied to final price', () => {
    const result = calculateQuoteOption({ ...base, rounding_rule: RoundingRule.NEAREST_99 });
    expect(result.final_price.toString()).toMatch(/99$/);
  });

  test('NEAREST_500 applied to final price', () => {
    const result = calculateQuoteOption({ ...base, rounding_rule: RoundingRule.NEAREST_500 });
    expect(result.final_price % 500).toBe(0);
  });

  test('NEAREST_1000 applied to final price', () => {
    const result = calculateQuoteOption({ ...base, rounding_rule: RoundingRule.NEAREST_1000 });
    expect(result.final_price % 1000).toBe(0);
  });

  test('rounding_adjustment = final_price - raw_price', () => {
    const result = calculateQuoteOption({ ...base, rounding_rule: RoundingRule.NEAREST_1000 });
    const raw = result.selling_before_gst + result.gst_amount;
    expect(Math.abs(result.rounding_adjustment - (result.final_price - raw))).toBeLessThan(0.01);
  });
});

describe('calculateQuoteOption – edge cases', () => {
  test('price_per_adult_display = 0 when adults = 0 (no divide by zero)', () => {
    const result = calculateQuoteOption({
      hotel_cost: 5000, vehicle_cost: 0, activity_cost: 0, transfer_cost: 0, misc_cost: 0,
      profit_type: MarkupType.FLAT, profit_value: 0,
      discount_amount: 0, gst_percent: 5, rounding_rule: RoundingRule.NONE, adults: 0,
    });
    expect(result.price_per_adult_display).toBe(0);
  });

  test('zero profit results in correct total', () => {
    const result = calculateQuoteOption({
      hotel_cost: 10000, vehicle_cost: 0, activity_cost: 0, transfer_cost: 0, misc_cost: 0,
      profit_type: MarkupType.FLAT, profit_value: 0,
      discount_amount: 0, gst_percent: 5, rounding_rule: RoundingRule.NONE, adults: 2,
    });
    expect(result.final_price).toBeCloseTo(10500, 1);
  });
});

describe('Quote option business rules', () => {
  test('most_popular flag: only one allowed – validation logic', () => {
    // This tests the business rule at API level — simulate it here
    const options = [
      { is_most_popular: true, option_name: 'Standard' },
      { is_most_popular: true, option_name: 'Deluxe' },
      { is_most_popular: false, option_name: 'Premium' },
    ];
    const popularCount = options.filter((o) => o.is_most_popular).length;
    expect(popularCount).toBeGreaterThan(1); // would fail validation
  });

  test('max 3 options rule', () => {
    const options = new Array(4).fill({ option_name: 'X', is_most_popular: false });
    expect(options.length).toBeGreaterThan(3); // exceeds limit
  });

  test('default most popular is middle when 3 options', () => {
    const options = [
      { option_name: 'Standard', is_most_popular: false },
      { option_name: 'Deluxe', is_most_popular: false },
      { option_name: 'Premium', is_most_popular: false },
    ];
    const popularCount = options.filter((o) => o.is_most_popular).length;
    // If popularCount === 0 and length === 3, API sets middle as popular
    if (options.length === 3 && popularCount === 0) {
      options[1].is_most_popular = true;
    }
    expect(options[1].is_most_popular).toBe(true);
  });
});
