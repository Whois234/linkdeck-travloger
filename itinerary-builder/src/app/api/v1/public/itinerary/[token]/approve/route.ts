import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ok, notFound, err } from '@/lib/api-response';
import { QuoteStatus } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const quote = await prisma.quote.findUnique({ where: { public_token: params.token } });
  if (!quote) return notFound('Itinerary');

  if (!quote.selected_quote_option_id) {
    return err('Please select a package before approving', 400);
  }

  await prisma.quote.update({
    where: { id: quote.id },
    data: { status: QuoteStatus.APPROVED },
  });

  await prisma.quoteEvent.create({
    data: { quote_id: quote.id, event_type: 'approve_clicked' },
  });

  return ok({ status: QuoteStatus.APPROVED });
}
