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

  const snapshotJson = quote.snapshots[0].snapshot_json as Record<string, unknown>;
  const response = ok({ ...snapshotJson, selected_option_id: quote.selected_quote_option_id ?? null });

  // Fire analytics writes after response is built — non-blocking
  Promise.all([
    prisma.quoteEvent.create({ data: { quote_id: quote.id, event_type: 'quote_viewed' } }),
    quote.status === QuoteStatus.SENT
      ? prisma.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.VIEWED } })
      : Promise.resolve(null),
  ]).catch((e) => console.error('[itinerary] analytics write failed:', e));

  return response;
}
