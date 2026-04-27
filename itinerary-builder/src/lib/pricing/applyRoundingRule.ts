import { RoundingRule } from '@prisma/client';

export function applyRoundingRule(price: number, rule: RoundingRule): number {
  switch (rule) {
    case RoundingRule.NONE:
      return price;
    case RoundingRule.NEAREST_99: {
      const base = Math.floor(price / 100) * 100;
      const candidate = base + 99;
      return candidate >= price ? candidate : candidate + 100;
    }
    case RoundingRule.NEAREST_500:
      return Math.round(price / 500) * 500;
    case RoundingRule.NEAREST_1000:
      return Math.round(price / 1000) * 1000;
    default:
      return price;
  }
}
