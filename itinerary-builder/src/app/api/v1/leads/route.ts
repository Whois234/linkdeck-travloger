import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, LeadStatus } from '@prisma/client';

const Schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().min(7).max(20).regex(/^[0-9+\-\s()]+$/, 'Phone has invalid characters'),
  email: z.string().trim().email().toLowerCase().nullable().optional().or(z.literal('').transform(() => null)),
  source: z.string().trim().max(60).nullable().optional(),
  destination_interest: z.string().trim().max(120).nullable().optional(),
  travel_month: z.string().trim().max(20).nullable().optional(),
  budget_range: z.string().trim().max(60).nullable().optional(),
  status: z.nativeEnum(LeadStatus).optional(),
  assigned_agent_id: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).nullable().optional(),
  pipeline_id: z.string().optional().nullable(),
  stage_id: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status      = searchParams.get('status') as LeadStatus | null;
  const agent_id    = searchParams.get('agent_id');
  const pipeline_id = searchParams.get('pipeline_id');
  const page        = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit       = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50')));
  const skip        = (page - 1) * limit;

  const isLimitedSales = requireRole(user, UserRole.SALES);
  const agentFilter = isLimitedSales
    ? { assigned_agent_id: user.agent_id ?? undefined }
    : agent_id ? { assigned_agent_id: agent_id } : {};

  const where = {
    ...agentFilter,
    ...(status ? { status } : {}),
    ...(pipeline_id ? { pipeline_id } : {}),
  };

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        stage: { select: { id: true, name: true, color: true, order: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      skip,
    }),
    prisma.lead.count({ where }),
  ]);
  return ok(leads, { total, page, limit, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  const { pipeline_id, stage_id, ...rest } = parsed.data;

  // ── Contact ownership check ────────────────────────────────────────────────
  // Normalize phone: strip spaces/dashes for comparison
  const normalizedPhone = rest.phone.replace(/[\s\-\(\)]/g, '');

  const existingContact = await prisma.crmContact.findUnique({
    where: { phone: normalizedPhone },
  });

  let crmContactId: string;

  if (existingContact) {
    // Contact exists — check ownership
    if (existingContact.owner_id !== user.sub) {
      // Find the owner's name
      const ownerUser = await prisma.user.findUnique({
        where: { id: existingContact.owner_id },
        select: { name: true },
      });
      const ownerName = ownerUser?.name ?? 'another team member';
      // Log the duplicate attempt for admin review
      await prisma.duplicateContactAttempt.create({
        data: { phone: normalizedPhone, attempted_by: user.sub, existing_owner_id: existingContact.owner_id },
      }).catch(() => {});
      return err(
        `This contact is already owned by ${ownerName}. Contact them to create a deal for this lead.`,
        409
      );
    }
    crmContactId = existingContact.id;
  } else {
    // Create new CrmContact
    const newContact = await prisma.crmContact.create({
      data: {
        name:     rest.name,
        phone:    normalizedPhone,
        email:    rest.email ?? null,
        source:   rest.source ?? null,
        owner_id: user.sub,
      },
    });
    crmContactId = newContact.id;
  }

  // ── Pipeline / stage resolution ────────────────────────────────────────────
  let resolvedStageId    = stage_id ?? null;
  let resolvedPipelineId = pipeline_id ?? null;

  if (pipeline_id && !stage_id) {
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { pipeline_id, status: true },
      orderBy: { order: 'asc' },
    });
    resolvedStageId = firstStage?.id ?? null;
  }

  if (!pipeline_id) {
    const defaultPipeline = await prisma.pipeline.findFirst({ where: { is_default: true, status: true } });
    if (defaultPipeline) {
      resolvedPipelineId = defaultPipeline.id;
      const firstStage = await prisma.pipelineStage.findFirst({
        where: { pipeline_id: defaultPipeline.id, status: true },
        orderBy: { order: 'asc' },
      });
      resolvedStageId = firstStage?.id ?? null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const record = await prisma.lead.create({
    data: {
      ...rest,
      phone:          normalizedPhone,
      crm_contact_id: crmContactId,
      owner_id:       user.sub,
      pipeline_id:    resolvedPipelineId,
      stage_id:       resolvedStageId,
    } as any,
  });

  await prisma.leadActivity.create({
    data: { lead_id: record.id, type: 'created', metadata: { name: record.name }, created_by: user.sub },
  }).catch(() => {});

  // ── Ensure Customer record exists for this lead ───────────────────────────
  // Every lead should also appear in the Customers table so agents have
  // a single unified customer view.
  try {
    const existingCustomer = await prisma.customer.findFirst({
      where: { OR: [{ phone: normalizedPhone }, { phone: rest.phone }] },
    });
    if (!existingCustomer) {
      await prisma.customer.create({
        data: {
          name:       rest.name,
          phone:      normalizedPhone,
          email:      rest.email ?? null,
          lead_id:    record.id,
          created_by: user.sub,
        },
      });
    } else if (!existingCustomer.lead_id) {
      await prisma.customer.update({ where: { id: existingCustomer.id }, data: { lead_id: record.id } });
    }
  } catch { /* non-blocking */ }

  return created(record);
}
