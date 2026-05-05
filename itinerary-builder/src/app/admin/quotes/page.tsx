import { prisma } from '@/lib/prisma';
import { getServerUser } from '@/lib/auth-server';
import { QuoteStatus, UserRole } from '@prisma/client';
import { QuotesTable, QuoteRow } from './QuotesTable';

export const dynamic = 'force-dynamic'; // always fetch fresh data, never cache

const PRIVILEGED = [UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.OPS] as string[];

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const user = await getServerUser();
  const statusFilter = searchParams.status ?? '';

  const isPrivileged = user && PRIVILEGED.includes(user.role);

  // Privileged users see all quotes; non-privileged only see quotes they created
  const ownerFilter = isPrivileged ? {} : { created_by: user?.sub ?? '' };

  const where = {
    ...ownerFilter,
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

  // For privileged users, fetch creator names
  let creatorNames: Record<string, string> = {};
  if (isPrivileged && raw.length > 0) {
    const creatorIds = Array.from(new Set(raw.map(q => q.created_by).filter(Boolean)));
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    creatorNames = Object.fromEntries(creators.map(u => [u.id, u.name]));
  }

  // Prisma returns Date objects — serialize to string for the client component
  const quotes: QuoteRow[] = raw.map((q) => ({
    ...q,
    start_date:      q.start_date instanceof Date  ? q.start_date.toISOString()  : String(q.start_date),
    created_at:      q.created_at instanceof Date  ? q.created_at.toISOString()  : String(q.created_at),
    created_by_name: creatorNames[q.created_by] ?? null,
  }));

  return <QuotesTable quotes={quotes} statusFilter={statusFilter} isPrivileged={!!isPrivileged} />;
}
