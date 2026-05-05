import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, QuoteType, QuoteStatus } from '@prisma/client';
import { generateQuoteNumber } from '@/lib/generate-quote-number';

const QuoteSchema = z.object({
  quote_name: z.string().optional().nullable(),
  quote_type: z.nativeEnum(QuoteType),
  customer_id: z.string(),
  lead_id: z.string().optional().nullable(),
  state_id: z.string(),
  start_date: z.string().datetime(),
  end_date: z.string().datetime(),
  duration_days: z.number().int().positive(),
  duration_nights: z.number().int().min(0),
  adults: z.number().int().positive(),
  children_below_5: z.number().int().min(0).optional(),
  children_5_12: z.number().int().min(0).optional(),
  infants: z.number().int().min(0).optional(),
  pickup_point: z.string().optional().nullable(),
  drop_point: z.string().optional().nullable(),
  assigned_agent_id: z.string().optional().nullable(),
  expiry_date: z.string().datetime().optional().nullable(),
  private_template_id: z.string().optional().nullable(),
  group_template_id: z.string().optional().nullable(),
  group_batch_id: z.string().optional().nullable(),
});

const PRIVILEGED_ROLES = [UserRole.ADMIN, UserRole.MANAGER, UserRole.FINANCE, UserRole.OPS] as UserRole[];

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') as QuoteStatus | null;
  const type = searchParams.get('type') as QuoteType | null;
  const agent_id = searchParams.get('agent_id');
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = parseInt(searchParams.get('limit') ?? '20');
  const skip = (page - 1) * limit;

  const isPrivileged = requireRole(user, ...PRIVILEGED_ROLES);

  // Privileged users see all (optionally filtered by agent); non-privileged see only their own
  const ownerFilter = isPrivileged
    ? (agent_id ? { assigned_agent_id: agent_id } : {})
    : { created_by: user.sub };

  const where = {
    ...ownerFilter,
    ...(status ? { status } : {}),
    ...(type ? { quote_type: type } : {}),
  };

  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      include: {
        customer: { select: { name: true, phone: true } },
        assigned_agent: { select: { name: true } },
        state: { select: { name: true, code: true } },
        quote_options: { select: { id: true, option_name: true, final_price: true, is_most_popular: true } },
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: limit,
    }),
    prisma.quote.count({ where }),
  ]);

  // Attach creator names for privileged users
  let creatorNames: Record<string, string> = {};
  if (isPrivileged && quotes.length > 0) {
    const creatorIds = Array.from(new Set(quotes.map(q => q.created_by).filter(Boolean)));
    const creators = await prisma.user.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, name: true },
    });
    creatorNames = Object.fromEntries(creators.map(u => [u.id, u.name]));
  }

  const enriched = quotes.map(q => ({
    ...q,
    created_by_name: creatorNames[q.created_by] ?? null,
  }));

  return ok({ quotes: enriched, total, page, limit });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = QuoteSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const quote_number = await generateQuoteNumber(parsed.data.state_id);

  const quote = await prisma.quote.create({
    data: {
      ...parsed.data,
      quote_number,
      status: QuoteStatus.DRAFT,
      created_by: user.sub,
      start_date: new Date(parsed.data.start_date),
      end_date: new Date(parsed.data.end_date),
      expiry_date: parsed.data.expiry_date ? new Date(parsed.data.expiry_date) : null,
    } as Parameters<typeof prisma.quote.create>[0]['data'],
  });

  // Create quote_created event
  await prisma.quoteEvent.create({
    data: { quote_id: quote.id, event_type: 'quote_created', metadata: { created_by: user.sub } },
  });

  return created(quote);
}
