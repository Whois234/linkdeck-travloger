/**
 * GET /api/v1/public/group-batches/[templateId]
 * No auth required — called from customer-facing itinerary to show live batch availability.
 * Returns only active, future batches (start_date >= today).
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, notFound } from '@/lib/api-response';

export async function GET(_req: NextRequest, { params }: { params: { templateId: string } }) {
  const tpl = await prisma.groupTemplate.findUnique({
    where: { id: params.templateId },
    select: { id: true },
  });
  if (!tpl) return notFound('Group Template');

  const batches = await prisma.groupBatch.findMany({
    where: {
      group_template_id: params.templateId,
      status: true,
      booking_status: { not: 'CANCELLED' },
      start_date: { gte: new Date() },
    },
    select: {
      id: true,
      batch_name: true,
      start_date: true,
      end_date: true,
      total_seats: true,
      available_seats: true,
      adult_price: true,
      child_5_12_price: true,
      child_below_5_price: true,
      single_supplement: true,
      gst_percent: true,
      booking_status: true,
      badge_text: true,
      badge_color: true,
    },
    orderBy: { start_date: 'asc' },
  });

  return ok(batches);
}
