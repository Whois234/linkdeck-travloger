import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, LeadStatus } from '@prisma/client';

const Schema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional().nullable(),
  source: z.string().optional().nullable(),
  destination_interest: z.string().optional().nullable(),
  travel_month: z.string().optional().nullable(),
  budget_range: z.string().optional().nullable(),
  status: z.nativeEnum(LeadStatus).optional(),
  assigned_agent_id: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status') as LeadStatus | null;
  const agent_id = searchParams.get('agent_id');

  const isLimitedSales = requireRole(user, UserRole.SALES);
  const agentFilter = isLimitedSales ? { assigned_agent_id: user.agent_id ?? undefined } : agent_id ? { assigned_agent_id: agent_id } : {};

  const leads = await prisma.lead.findMany({
    where: { ...agentFilter, ...(status ? { status } : {}) },
    orderBy: { created_at: 'desc' },
  });
  return ok(leads);
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const record = await prisma.lead.create({ data: parsed.data as Parameters<typeof prisma.lead.create>[0]['data'] });
  return created(record);
}
