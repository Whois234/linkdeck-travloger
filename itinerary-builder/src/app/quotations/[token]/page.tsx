/**
 * /quotations/[token] — canonical customer-facing itinerary URL.
 * Renders the same ItineraryClient used by the old /itinerary/[token] route.
 */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { cache } from 'react';
import { ItineraryClient } from '@/app/itinerary/[token]/ItineraryClient';
import { prisma } from '@/lib/prisma';
import { QuoteStatus } from '@prisma/client';

const getItinerary = cache(async (token: string) => {
  const quote = await prisma.quote.findUnique({
    where: { public_token: token },
    include: { snapshots: { where: { is_current: true } } },
  });
  if (!quote || quote.snapshots.length === 0) return null;

  prisma.quoteEvent.create({ data: { quote_id: quote.id, event_type: 'quote_viewed' } }).catch(() => {});
  if (quote.status === QuoteStatus.SENT) {
    prisma.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.VIEWED } }).catch(() => {});
  }

  const snapshotJson = quote.snapshots[0].snapshot_json as Record<string, unknown>;
  return { ...snapshotJson, selected_option_id: quote.selected_quote_option_id ?? null } as Record<string, unknown> & { selected_option_id: string | null };
});

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const data = await getItinerary(params.token);
  if (!data) return { title: 'Your Itinerary | travloger.in' };
  const state    = (data.state    as { name?: string } | null);
  const customer = (data.customer as { name?: string } | null);
  return {
    title: `${state?.name ?? 'Your Trip'} — ${customer?.name ?? 'Itinerary'} | travloger.in`,
    description: `View your personalised ${state?.name ?? ''} itinerary from Travloger.`,
  };
}

export default async function QuotationPage({ params }: { params: { token: string } }) {
  const data = await getItinerary(params.token);
  if (!data) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <ItineraryClient data={data as any} token={params.token} />;
}
