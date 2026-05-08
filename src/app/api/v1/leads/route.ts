import { cleanBody } from '@/lib/clean-body';
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

  const isLimitedSales = requireRole(user, UserRole.SALES);
  const agentFilter = isLimitedSales
    ? { assigned_agent_id: user.agent_id ?? undefined }
    : agent_id ? { assigned_agent_id: agent_id } : {};

  const leads = await prisma.lead.findMany({
    where: {
      ...agentFilter,
      ...(status ? { status } : {}),
      ...(pipeline_id ? { pipeline_id } : {}),
    },
    include: {
      stage: { select: { id: true, name: true, color: true, order: true } },
    },
    orderBy: { created_at: 'desc' },
  });
  return ok(leads);
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

  return created(record);
}
