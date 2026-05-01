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
  const privilegedRoles: string[] = [UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.OPS];
  const agentFilter =
    user && privilegedRoles.includes(user.role)
      ? {}
      : { assigned_agent_id: user?.agent_id ?? undefined };

  const where = {
    ...agentFilter,
    ...(statusFilter ? { status: statusFilter as QuoteStatus } : {}),
  };

  const raw = await prisma.quote.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      customer:       { select: { id: true, name: true, phone: true } },
      assigned_agent: { select: { name: true } },
      state:          { select: { name: true, code: true } },
      quote_options:  { select: { final_price: true, is_most_popular: true } },
    },
  });

  // Prisma returns Date objects — serialize to string for the client component
  const quotes: QuoteRow[] = raw.map((q) => ({
    ...q,
    start_date:  q.start_date instanceof Date  ? q.start_date.toISOString()  : String(q.start_date),
    created_at:  q.created_at instanceof Date  ? q.created_at.toISOString()  : String(q.created_at),
  }));

  return <QuotesTable quotes={quotes} statusFilter={statusFilter} />;
}
