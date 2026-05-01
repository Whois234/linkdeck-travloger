import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { cache } from 'react';

export const dynamic = 'force-dynamic';
import { ItineraryClient } from './ItineraryClient';
import { prisma } from '@/lib/prisma';
import { QuoteStatus } from '@prisma/client';

/**
 * Load itinerary data directly from the DB (no HTTP self-call).
 * Wrapped in React.cache so generateMetadata and the page component
 * share a single DB round-trip per request.
 */
const getItinerary = cache(async (token: string) => {
  const quote = await prisma.quote.findUnique({
    where: { public_token: token },
    include: {
      snapshots: { where: { is_current: true } },
    },
  });

  if (!quote || quote.snapshots.length === 0) return null;

  // Fire-and-forget: record view event + update status
  prisma.quoteEvent
    .create({ data: { quote_id: quote.id, event_type: 'quote_viewed' } })
    .catch(() => {});

  if (quote.status === QuoteStatus.SENT) {
    prisma.quote
      .update({ where: { id: quote.id }, data: { status: QuoteStatus.VIEWED } })
      .catch(() => {});
  }

  const snapshotJson = quote.snapshots[0].snapshot_json as Record<string, unknown>;
  return { ...snapshotJson, selected_option_id: quote.selected_quote_option_id ?? null } as Record<string, unknown> & { selected_option_id: string | null };
});

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const data = await getItinerary(params.token);
  if (!data) return { title: 'Itinerary | travloger.in' };
  const state = (data as Record<string, unknown>).state as { name?: string } | null;
  const customer = (data as Record<string, unknown>).customer as { name?: string } | null;
  return {
    title: `${state?.name ?? 'Your Trip'} — ${customer?.name ?? 'Itinerary'} | travloger.in`,
    description: `View your personalised ${state?.name ?? ''} itinerary from Travloger.`,
  };
}

export default async function ItineraryPage({ params }: { params: { token: string } }) {
  // Permanent redirect: /itinerary/[token] → /quotations/[token]
  redirect(`/quotations/${params.token}`);
}
