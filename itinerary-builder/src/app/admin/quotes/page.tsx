import { prisma } from '@/lib/prisma';
import { getServerUser } from '@/lib/auth-server';
import { QuoteStatus, UserRole } from '@prisma/client';
import { QuotesTable, QuoteRow } from './QuotesTable';

export const dynamic = 'force-dynamic'; // always fetch fresh data, never cache

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const user = await getServerUser();
  const statusFilter = searchParams.status ?? '';

  // Role-based visibility: SALES only sees own quotes
  const agentFilter =
    user && [UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.OPS].includes(user.role)
      ? {}
      : { assigned_agent_id: user?.agent_id ?? undefined };

  const where = {
    ...agentFilter,
    ...(statusFilter ? { status: statusFilter as QuoteStatus } : {}),
  };

  const quotes = await prisma.quote.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      customer:      { select: { id: true, name: true, phone: true } },
      assigned_agent: { select: { name: true } },
      state:         { select: { name: true, code: true } },
      quote_options: { select: { final_price: true, is_most_popular: true } },
    },
  });

  return <QuotesTable quotes={quotes as QuoteRow[]} statusFilter={statusFilter} />;
}
