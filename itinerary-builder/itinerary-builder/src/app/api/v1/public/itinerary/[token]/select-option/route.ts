import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ok, err, notFound } from '@/lib/api-response';

const Schema = z.object({ option_id: z.string() });

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const quote = await prisma.quote.findUnique({
    where: { public_token: params.token },
    include: {
      assigned_agent: { select: { user_account_id: true } },
      customer: { select: { name: true } },
    },
  });
  if (!quote) return notFound('Itinerary');

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('option_id is required', 400);

  const option = await prisma.quoteOption.findFirst({
    where: { id: parsed.data.option_id, quote_id: quote.id },
  });
  if (!option) return err('Invalid option', 400);

  await prisma.quote.update({
    where: { id: quote.id },
    data: { selected_quote_option_id: parsed.data.option_id },
  });

  await prisma.quoteEvent.create({
    data: {
      quote_id: quote.id,
      event_type: 'package_selected',
      metadata: { option_id: parsed.data.option_id, option_name: option.option_name },
    },
  });

  // Notify assigned agent
  if (quote.assigned_agent?.user_account_id) {
    await prisma.notification.create({
      data: {
        user_id:    quote.assigned_agent.user_account_id,
        quote_id:   quote.id,
        message:    `${quote.customer.name} selected the ${option.option_name} package`,
        event_type: 'package_selected',
      },
    }).catch(() => {});
  }

  return ok({ selected_option_id: parsed.data.option_id });
}
