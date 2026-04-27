import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthUser } from '@/lib/auth';
import { ok, unauthorized, notFound } from '@/lib/api-response';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const quote = await prisma.quote.findUnique({ where: { id: params.id } });
  if (!quote) return notFound('Quote');

  const events = await prisma.quoteEvent.findMany({
    where: { quote_id: params.id },
    orderBy: { created_at: 'desc' },
  });
  return ok(events);
}
