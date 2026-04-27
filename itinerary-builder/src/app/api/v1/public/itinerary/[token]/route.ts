import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, notFound } from '@/lib/api-response';
import { QuoteStatus } from '@prisma/client';

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const quote = await prisma.quote.findUnique({
    where: { public_token: params.token },
    include: {
      snapshots: { where: { is_current: true } },
    },
  });

  if (!quote || quote.snapshots.length === 0) return notFound('Itinerary');

  // Record quote_viewed event
  await prisma.quoteEvent.create({
    data: { quote_id: quote.id, event_type: 'quote_viewed' },
  });

  // Update status to VIEWED if currently SENT
  if (quote.status === QuoteStatus.SENT) {
    await prisma.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.VIEWED } });
  }

  const snapshotJson = quote.snapshots[0].snapshot_json as Record<string, unknown>;
  return ok({ ...snapshotJson, selected_option_id: quote.selected_quote_option_id ?? null });
}
