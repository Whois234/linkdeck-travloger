/**
 * POST /api/v1/quotes/:id/send-whatsapp
 *
 * Sends the itinerary_ready WhatsApp template to the quote's customer.
 * Credentials are read from the AppSetting table (CRM Settings → Gallabox tab).
 * No modal — direct send from the quote page.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound, err } from '@/lib/api-response';
import { UserRole } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER, UserRole.OPS))
    return forbidden();

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: { customer: { select: { name: true, phone: true } } },
  });
  if (!quote) return notFound('Quote');
  if (!quote.customer?.phone) return err('Customer phone number not found', 400);

  // Read Gallabox credentials from DB
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ['gallabox_api_key', 'gallabox_api_secret', 'gallabox_channel_id'] } },
  });
  const cfg: Record<string, string> = {};
  for (const r of rows) cfg[r.key] = r.value;

  const apiKey    = cfg['gallabox_api_key']    || process.env.GALLABOX_API_KEY    || '';
  const apiSecret = cfg['gallabox_api_secret'] || process.env.GALLABOX_API_SECRET || '';
  const channelId = cfg['gallabox_channel_id'] || process.env.GALLABOX_CHANNEL_ID || '';

  if (!apiKey || !apiSecret || !channelId) {
    return err('Gallabox credentials not configured — go to CRM Settings → Gallabox tab', 400);
  }

  const toNumber  = quote.customer.phone.replace(/[\s+\-()]/g, '');
  const quoteLink = `https://link.travloger.in/quotations/${quote.id}`;

  const payload = {
    channelId,
    type: 'template',
    template: {
      name:         'itinerary_ready',
      languageCode: 'en',
      buttons: [
        { type: 'url', index: '0', value: quoteLink },
      ],
    },
    whatsapp: { toNumber },
  };

  try {
    const res = await fetch('https://api.gallabox.com/dev/messages', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey':       apiKey,
        'apisecret':    apiSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errMsg = `Gallabox API error (${res.status})`;
      if (res.status === 401) errMsg = 'Gallabox unauthorised — check apikey and apisecret in CRM Settings';
      if (res.status === 404) errMsg = 'Template not found — verify itinerary_ready exists in Gallabox';
      try {
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          const d = await res.json() as Record<string, unknown>;
          const m = (d.message ?? d.error ?? '') as string;
          if (m) errMsg = m;
        }
      } catch { /* ignore */ }
      console.error('[send-whatsapp] Gallabox error:', errMsg);
      return err(errMsg, 400);
    }

    const data = await res.json() as Record<string, unknown>;
    console.log('[send-whatsapp] success:', JSON.stringify(data));

    // Log a quote event for analytics
    await prisma.quoteEvent.create({
      data: {
        quote_id:   params.id,
        event_type: 'whatsapp_sent',
        metadata:   { sent_by: user.sub, to: toNumber, template: 'itinerary_ready' },
      },
    }).catch(() => {}); // non-blocking

    return ok({ sent: true, to: toNumber });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[send-whatsapp] fetch error:', msg);
    return err(`Failed to reach Gallabox: ${msg}`, 500);
  }
}
