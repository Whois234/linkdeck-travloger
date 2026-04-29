/**
 * /quotations/[token] — canonical customer-facing itinerary URL.
 * Renders the same ItineraryClient used by the old /itinerary/[token] route.
 * Shows a branded "link deactivated" page instead of 404 when link_active=false.
 */
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { cache } from 'react';
import { ItineraryClient } from '@/app/itinerary/[token]/ItineraryClient';
import QuotationTracker from './QuotationTracker';
import { prisma } from '@/lib/prisma';
import { QuoteStatus } from '@prisma/client';

const PHONE    = '6281392007';
const WA_BASE  = `https://wa.me/91${PHONE}`;

/* ── fetch quote + check active status ─────────────────────────────── */
const getQuoteRaw = cache(async (token: string) => {
  return prisma.quote.findUnique({
    where: { public_token: token },
    include: {
      snapshots: { where: { is_current: true } },
      state:     { select: { name: true } },
    },
  });
});

const getItinerary = cache(async (token: string) => {
  const quote = await getQuoteRaw(token);
  if (!quote || quote.snapshots.length === 0) return null;
  // Don't block here — deactivated is handled in the page component
  if ((quote as unknown as { link_active: boolean }).link_active === false) return null;

  prisma.quoteEvent.create({ data: { quote_id: quote.id, event_type: 'quote_viewed' } }).catch(() => {});
  if (quote.status === QuoteStatus.SENT) {
    prisma.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.VIEWED } }).catch(() => {});
  }

  const snapshotJson = quote.snapshots[0].snapshot_json as Record<string, unknown>;
  return { ...snapshotJson, selected_option_id: quote.selected_quote_option_id ?? null } as Record<string, unknown> & { selected_option_id: string | null };
});

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const data = await getItinerary(params.token);
  if (!data) return { title: 'Quote Unavailable | travloger.in' };
  const state    = (data.state    as { name?: string } | null);
  const customer = (data.customer as { name?: string } | null);
  return {
    title: `${state?.name ?? 'Your Trip'} — ${customer?.name ?? 'Itinerary'} | travloger.in`,
    description: `View your personalised ${state?.name ?? ''} itinerary from Travloger.`,
  };
}

/* ── Deactivated / expired page ─────────────────────────────────────── */
function DeactivatedPage({ quoteNumber, destination }: { quoteNumber: string; destination: string }) {
  const waMessage = encodeURIComponent(
    `Hi, I was checking my previous quote ${quoteNumber} for ${destination} which is no longer available. I'd like to enquire again for ${destination}.`
  );
  const waUrl = `${WA_BASE}?text=${waMessage}`;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: '440px', width: '100%' }}>
        {/* Logo / brand */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/travloger-logo-icon.jpeg"
            alt="Travloger"
            style={{ width: '72px', height: '72px', borderRadius: '18px', objectFit: 'cover', marginBottom: '10px', display: 'inline-block' }}
          />
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#134956', letterSpacing: '0.08em', textTransform: 'uppercase' }}>travloger.in</p>
        </div>

        {/* Card */}
        <div style={{
          backgroundColor: '#fff', borderRadius: '20px', padding: '36px 32px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0', textAlign: 'center',
        }}>
          {/* Icon */}
          <div style={{
            width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FFF7ED',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>

          <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', margin: '0 0 10px' }}>
            This Quote is No Longer Available
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6, margin: '0 0 8px' }}>
            Quote <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#134956' }}>{quoteNumber}</span> for{' '}
            <strong style={{ color: '#0F172A' }}>{destination}</strong> has expired or been deactivated.
          </p>
          <p style={{ fontSize: '14px', color: '#64748B', lineHeight: 1.6, margin: '0 0 28px' }}>
            Want to plan your trip again? Reach out to us — we&rsquo;d love to help!
          </p>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #F1F5F9', marginBottom: '24px' }} />

          {/* WhatsApp CTA */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              backgroundColor: '#25D366', color: '#fff',
              padding: '13px 24px', borderRadius: '12px', textDecoration: 'none',
              fontWeight: 700, fontSize: '15px', marginBottom: '12px',
              boxShadow: '0 2px 12px rgba(37,211,102,0.3)',
            }}
          >
            {/* WhatsApp icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Chat on WhatsApp
          </a>

          {/* Phone call option */}
          <a
            href={`tel:${PHONE}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '9px',
              backgroundColor: '#F8FAFC', color: '#134956',
              padding: '12px 24px', borderRadius: '12px', textDecoration: 'none',
              fontWeight: 600, fontSize: '14px', border: '1px solid #E2E8F0',
            }}
          >
            {/* clean filled phone handset */}
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.18 21 3 13.82 3 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1.02l-2.2 2.2z"/>
            </svg>
            Call {PHONE}
          </a>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#CBD5E1', marginTop: '20px' }}>
          © {new Date().getFullYear()} Travloger India. All rights reserved.
        </p>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default async function QuotationPage({ params }: { params: { token: string } }) {
  const quote = await getQuoteRaw(params.token);

  // Quote doesn't exist at all → true 404
  if (!quote || quote.snapshots.length === 0) notFound();

  // Link deactivated → branded message page (not 404)
  const linkActive = (quote as unknown as { link_active: boolean }).link_active;
  if (linkActive === false) {
    const destination = quote.state?.name ?? 'your destination';
    const quoteNumber = quote.quote_number ?? params.token.slice(0, 8).toUpperCase();
    return <DeactivatedPage quoteNumber={quoteNumber} destination={destination} />;
  }

  // Normal active quote → track & render
  const data = await getItinerary(params.token);
  if (!data) notFound();

  return (
    <>
      <QuotationTracker token={params.token} />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <ItineraryClient data={data as any} token={params.token} />
    </>
  );
}
