import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, PricingAppliesTo, MarkupType, RoundingRule } from '@prisma/client';

const Schema = z.object({
  rule_name: z.string().min(1),
  applies_to: z.nativeEnum(PricingAppliesTo),
  markup_type: z.nativeEnum(MarkupType),
  markup_value: z.number().min(0),
  gst_percent: z.number().min(0).max(100),
  rounding_rule: z.nativeEnum(RoundingRule),
  valid_from: z.string().datetime(),
  valid_to: z.string().datetime(),
  status: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  const rules = await prisma.pricingRule.findMany({ where: { status: true }, orderBy: { rule_name: 'asc' } });
  return ok(rules);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.FINANCE)) return forbidden();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.pricingRule.create({
    data: { ...parsed.data, valid_from: new Date(parsed.data.valid_from), valid_to: new Date(parsed.data.valid_to) } as Parameters<typeof prisma.pricingRule.create>[0]['data'],
  });
  return created(record);
}
