import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, err, unauthorized, forbidden, notFound } from '@/lib/api-response';
import { UserRole, QuoteStatus } from '@prisma/client';

const UpdateSchema = z.object({
  status: z.nativeEnum(QuoteStatus).optional(),
  pickup_point: z.string().optional().nullable(),
  drop_point: z.string().optional().nullable(),
  assigned_agent_id: z.string().optional().nullable(),
  expiry_date: z.string().datetime().optional().nullable(),
  selected_quote_option_id: z.string().optional().nullable(),
  link_active: z.boolean().optional(),
}).passthrough();

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: {
      customer: true,
      lead: true,
      state: true,
      assigned_agent: true,
      quote_options: {
        include: {
          vehicle_type: true,
          option_hotels: true,
        },
        orderBy: { display_order: 'asc' },
      },
      day_snapshots: { orderBy: { day_number: 'asc' } },
      snapshots: { orderBy: { version_number: 'desc' }, take: 1 },
    },
  });

  if (!quote) return notFound('Quote');

  // SALES can only see own quotes
  if (requireRole(user, UserRole.SALES) && quote.assigned_agent_id !== user.agent_id) {
    return forbidden();
  }

  return ok(quote);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER, UserRole.OPS)) return forbidden();

  const quote = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!quote) return notFound('Quote');

  const body = await req.json();
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const updated = await prisma.quote.update({
    where: { id: params.id },
    data: parsed.data,
  });
  return ok(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.MANAGER)) return forbidden();

  const quote = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!quote) return notFound('Quote');

  // Cascade delete via Prisma (QuoteOption, QuoteOptionHotel, QuoteSnapshot, QuoteEvent all have onDelete: Cascade)
  await prisma.quote.delete({ where: { id: params.id } });
  return ok({ deleted: true });
}
