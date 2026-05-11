/**
 * POST /api/v1/public/itinerary/[token]/analytics
 * No auth required — called from the customer quotation page.
 * Stores quote_viewed / whatsapp_clicked events enriched with
 * device, OS, and rough location data derived from the request headers.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, notFound } from '@/lib/api-response';
import { QuoteEventType, Prisma } from '@prisma/client';

const ALLOWED_EVENTS: QuoteEventType[] = [
  'quote_viewed',
  'whatsapp_clicked',
  'booking_intent',
  'rating_submitted',
  'batch_selected',
  'package_selected',
];

/* ── lightweight UA parser ───────────────────────────────────────────── */
function parseUA(ua: string): { device: string; os: string; browser: string } {
  let device  = 'Desktop';
  let os      = 'Unknown';
  let browser = 'Unknown';

  if (/tablet|ipad/i.test(ua))       device = 'Tablet';
  else if (/mobile|android|iphone/i.test(ua)) device = 'Mobile';

  if (/windows nt/i.test(ua))        os = 'Windows';
  else if (/android/i.test(ua))      os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x/i.test(ua))     os = 'macOS';
  else if (/linux/i.test(ua))        os = 'Linux';

  if (/edg\//i.test(ua))             browser = 'Edge';
  else if (/opr\//i.test(ua))        browser = 'Opera';
  else if (/chrome/i.test(ua))       browser = 'Chrome';
  else if (/safari/i.test(ua))       browser = 'Safari';
  else if (/firefox/i.test(ua))      browser = 'Firefox';

  return { device, os, browser };
}

/* ── IP → rough location (non-blocking, best-effort) ─────────────────── */
async function resolveLocation(ip: string): Promise<{ city?: string; region?: string; country?: string } | null> {
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168') || ip.startsWith('10.')) return null;
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'travloger-itinerary-analytics/1.0' },
    });
    if (!res.ok) return null;
    const data = await res.json() as { city?: string; region?: string; country_name?: string; error?: boolean };
    if (data.error) return null;
    return { city: data.city, region: data.region, country: data.country_name };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const quote = await prisma.quote.findUnique({
    where: { public_token: params.token },
    include: {
      assigned_agent: { select: { user_account_id: true, name: true } },
    },
  });
  if (!quote) return notFound('Itinerary');

  const body = await req.json().catch(() => ({})) as {
    event_type?: string;
    metadata?: Record<string, unknown>;
  };

  const eventType = (body.event_type ?? 'quote_viewed') as QuoteEventType;
  if (!ALLOWED_EVENTS.includes(eventType)) return ok({ skipped: true });

  /* ── extract client info from headers ─────────────────────────────── */
  const rawIP  = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
              ?? req.headers.get('x-real-ip')
              ?? 'unknown';
  const ua     = req.headers.get('user-agent') ?? '';
  const uaParsed = parseUA(ua);

  /* ── resolve geo in parallel (non-blocking — don't await for latency) */
  const locationPromise = resolveLocation(rawIP);

  /* ── build enriched metadata ────────────────────────────────────────── */
  const location = await locationPromise;

  const enrichedMeta: Record<string, unknown> = {
    ...(body.metadata ?? {}),
    ip:      rawIP,
    device:  uaParsed.device,
    os:      uaParsed.os,
    browser: uaParsed.browser,
    ...(location ? { city: location.city, region: location.region, country: location.country } : {}),
  };

  await prisma.quoteEvent.create({
    data: {
      quote_id:   quote.id,
      event_type: eventType,
      metadata:   enrichedMeta as Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue,
    },
  });

  // Notification for assigned agent
  if (quote.assigned_agent?.user_account_id) {
    const batchDate = enrichedMeta.batch_start_date
      ? new Date(enrichedMeta.batch_start_date as string).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : null;
    const RATING_LABELS: Record<number, string> = { 0: 'Very Dissatisfied 😢', 1: 'Dissatisfied 😕', 2: 'Neutral 😐', 3: 'Satisfied 🙂', 4: 'Very Satisfied 😍' };
    const ratingLabel = enrichedMeta.rating != null ? (RATING_LABELS[Number(enrichedMeta.rating)] ?? `${enrichedMeta.rating}/4`) : '';
    const batchName   = enrichedMeta.batch_name ? ` (${enrichedMeta.batch_name})` : '';

    const messages: Record<string, string> = {
      quote_viewed:     `A customer viewed your quotation`,
      whatsapp_clicked: `A customer clicked WhatsApp on your quotation`,
      package_selected: enrichedMeta.tier_name ? `📦 Customer selected package tier: ${enrichedMeta.tier_name}` : `📦 Customer selected a package tier`,
      booking_intent:   batchDate
        ? `🎉 Booking Intent! ${enrichedMeta.customer_name ?? 'A customer'} wants ${enrichedMeta.adults ?? 1} adult(s) on ${batchDate} · ₹${enrichedMeta.total_price ?? ''}`
        : `🎉 Booking Intent! ${enrichedMeta.customer_name ?? 'A customer'} wants to book`,
      rating_submitted: `⭐ Customer rated the quotation: ${ratingLabel}`,
      batch_selected:   batchDate ? `📅 Customer selected departure${batchName}: ${batchDate}` : `📅 Customer selected a departure date`,
    };
    const message = messages[eventType];
    if (message) {
      await prisma.notification.create({
        data: {
          user_id:    quote.assigned_agent.user_account_id,
          quote_id:   quote.id,
          message,
          event_type: eventType,
        },
      }).catch(() => {});
    }
  }

  return ok({ recorded: true });
}
