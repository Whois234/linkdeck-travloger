import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ItineraryClient } from './ItineraryClient';

async function getItinerary(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  const res = await fetch(`${baseUrl}/api/v1/public/itinerary/${token}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const json = await res.json();
  return json.success ? json.data : null;
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const data = await getItinerary(params.token);
  if (!data) return { title: 'Itinerary | travloger.in' };
  const { state, customer } = data;
  return {
    title: `${state?.name ?? 'Your Trip'} — ${customer?.name ?? 'Itinerary'} | travloger.in`,
    description: `View your personalised ${state?.name ?? ''} itinerary from Travloger.`,
  };
}

export default async function ItineraryPage({ params }: { params: { token: string } }) {
  const data = await getItinerary(params.token);
  if (!data) notFound();
  return <ItineraryClient data={data} token={params.token} />;
}
