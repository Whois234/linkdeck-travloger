/**
 * POST /api/v1/public/itinerary/[token]/analytics
 * No auth required — called from the customer quotation page.
 * Stores a quote_viewed event with section + scroll metadata.
 * Also fires whatsapp_clicked event when event_type = 'whatsapp_clicked'.
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, notFound } from '@/lib/api-response';
import { QuoteEventType, Prisma } from '@prisma/client';

const ALLOWED_EVENTS: QuoteEventType[] = ['quote_viewed', 'whatsapp_clicked'];

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

  // Store the event
  await prisma.quoteEvent.create({
    data: {
      quote_id: quote.id,
      event_type: eventType,
      metadata: (body.metadata ?? Prisma.JsonNull) as Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue,
    },
  });

  // Create a notification for the assigned agent (if any)
  if (quote.assigned_agent?.user_account_id) {
    const messages: Record<string, string> = {
      quote_viewed:     `${quote.assigned_agent.name ? 'A customer' : 'Someone'} viewed your quotation`,
      whatsapp_clicked: `A customer clicked WhatsApp on your quotation`,
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
