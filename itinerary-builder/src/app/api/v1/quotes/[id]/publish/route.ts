import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound, err } from '@/lib/api-response';
import { UserRole, QuoteStatus } from '@prisma/client';
import { generateQuoteSnapshot } from '@/lib/pricing/generateQuoteSnapshot';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: { quote_options: true },
  });
  if (!quote) return notFound('Quote');

  if (quote.quote_options.length === 0) {
    return err('Quote must have at least one pricing option before publishing', 400);
  }

  let snapshot;
  try {
    snapshot = await generateQuoteSnapshot(params.id, user.sub);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to generate snapshot';
    return err(message, 500);
  }

  // Mark quote as SENT so the customer-facing page resolves it
  await prisma.quote.update({
    where: { id: params.id },
    data: { status: 'SENT' },
  });

  // Return snapshot + public_token so the client can build the share URL
  const updatedQuote = await prisma.quote.findUnique({
    where: { id: params.id },
    select: { public_token: true },
  });

  return ok({ ...snapshot, public_token: updatedQuote?.public_token });
}
