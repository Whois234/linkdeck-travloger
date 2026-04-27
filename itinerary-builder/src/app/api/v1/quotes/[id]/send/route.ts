import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, unauthorized, forbidden, notFound, err } from '@/lib/api-response';
import { UserRole, QuoteStatus } from '@prisma/client';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const quote = await prisma.quote.findUnique({
    where: { id: params.id },
    include: { snapshots: { where: { is_current: true } } },
  });
  if (!quote) return notFound('Quote');

  if (quote.snapshots.length === 0) {
    return err('Publish the quote before sending', 400);
  }

  await prisma.quote.update({
    where: { id: params.id },
    data: { status: QuoteStatus.SENT },
  });

  await prisma.quoteEvent.create({
    data: { quote_id: params.id, event_type: 'quote_sent', metadata: { sent_by: user.sub } },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  return ok({
    share_link: `${appUrl}/itinerary/${quote.public_token}`,
    status: QuoteStatus.SENT,
  });
}
