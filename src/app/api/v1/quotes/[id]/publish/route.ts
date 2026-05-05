import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound } from '@/lib/api-response';
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

  // Group quotes use batch pricing — no quote_options required
  if (quote.quote_type === 'PRIVATE' && quote.quote_options.length === 0) {
    return err('Quote must have at least one pricing option before publishing', 400);
  }

  // Mark SENT + fetch public_token in parallel — ~150ms total, no snapshot blocking
  const [updatedQuote] = await Promise.all([
    prisma.quote.update({
      where: { id: params.id },
      data: { status: QuoteStatus.SENT },
      select: { public_token: true },
    }),
  ]);

  // Fire snapshot generation in background — client gets the token immediately
  generateQuoteSnapshot(params.id, user.sub).catch((e) => {
    console.error(`[publish] snapshot failed for ${params.id}:`, e);
  });

  return ok({ public_token: updatedQuote.public_token });
}
