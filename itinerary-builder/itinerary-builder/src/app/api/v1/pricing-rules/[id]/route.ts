import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.FINANCE)) return forbidden();

  const body = await req.json();
  const record = await prisma.pricingRule.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Pricing Rule');

  // Only pick known updatable fields to prevent Prisma unknown-field errors
  const data: Record<string, unknown> = {};
    if (body.rule_name !== undefined) data.rule_name = body.rule_name;
    if (body.applies_to !== undefined) data.applies_to = body.applies_to;
    if (body.markup_type !== undefined) data.markup_type = body.markup_type;
    if (body.markup_value !== undefined) data.markup_value = body.markup_value;
    if (body.gst_percent !== undefined) data.gst_percent = body.gst_percent;
    if (body.rounding_rule !== undefined) data.rounding_rule = body.rounding_rule;
    if (body.valid_from !== undefined) data.valid_from = body.valid_from;
    if (body.valid_to !== undefined) data.valid_to = body.valid_to;
    if (body.status !== undefined) data.status = body.status;

  if (Object.keys(data).length === 0) return err('No valid fields to update', 400);

  const updated = await prisma.pricingRule.update({ where: { id: params.id }, data });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN)) return forbidden();

  const record = await prisma.pricingRule.findUnique({ where: { id: params.id } });
  if (!record) return notFound('Pricing Rule');

  await prisma.pricingRule.update({ where: { id: params.id }, data: { status: false } });
  return ok({ message: 'Pricing Rule deactivated' });
}
