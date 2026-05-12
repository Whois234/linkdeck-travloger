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
  state_ids: z.array(z.string()).min(1).optional(),
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

  // Privileged users see all (optionally filtered by agent).
  // SALES users see: quotes they created + quotes for any lead they own
  // (so they see all quotes for their contacts, even if another agent created the quote).
  const ownerFilter = isPrivileged
    ? (agent_id ? { assigned_agent_id: agent_id } : {})
    : { OR: [{ created_by: user.sub }, { lead: { owner_id: user.sub } }] };

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

  // state_ids: use provided array or fall back to [state_id]
  const state_ids = parsed.data.state_ids?.length ? parsed.data.state_ids : [parsed.data.state_id];
  const primaryStateId = state_ids[0];
  const quote_number = await generateQuoteNumber(primaryStateId);

  const { state_ids: _si, ...quoteData } = parsed.data;
  const quote = await prisma.quote.create({
    data: {
      ...quoteData,
      state_id: primaryStateId,
      state_ids,
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

  // ── Auto-link to pipeline lead ────────────────────────────────────────────
  // If lead_id was provided, just log the activity.
  // If not, find or create a pipeline lead for this customer automatically.
  let finalLeadId = quote.lead_id;

  if (finalLeadId) {
    await prisma.leadActivity.create({
      data: { lead_id: finalLeadId, type: 'quote_created', metadata: { quote_id: quote.id, quote_number: quote.quote_number }, created_by: user.sub },
    }).catch(() => {});
  } else {
    // Auto-link: find or create a pipeline lead for this customer.
    // Each step has its own error handling so a failure in one step doesn't
    // silently kill the entire chain.
    const customer = await prisma.customer.findUnique({ where: { id: quote.customer_id } }).catch(() => null);

    if (customer?.phone) {
      const rawPhone = customer.phone;
      const normalizedPhone = rawPhone.replace(/[\s\-\(\)]/g, '');

      // 1. Find existing CrmContact by phone (try both forms)
      let contact = await prisma.crmContact.findFirst({
        where: { OR: [{ phone: normalizedPhone }, { phone: rawPhone }] },
      }).catch(() => null);

      // 2. Find existing active (non-converted) lead for this contact
      let lead = contact
        ? await prisma.lead.findFirst({
            where: { crm_contact_id: contact.id, is_converted: false },
            orderBy: { created_at: 'desc' },
          }).catch(() => null)
        : null;

      // 3. Create CrmContact if missing
      let contactWasNew = false;
      if (!contact) {
        try {
          contact = await prisma.crmContact.create({
            data: {
              name:          customer.name,
              phone:         normalizedPhone,
              owner_id:      user.sub,
              assigned_to_id: user.sub,   // auto-assign to quote creator
            },
          });
          contactWasNew = true;
        } catch (e) {
          // Might already exist due to race — try to fetch again
          contact = await prisma.crmContact.findFirst({
            where: { OR: [{ phone: normalizedPhone }, { phone: rawPhone }] },
          }).catch(() => null);
          if (!contact) console.error('[quotes/POST] crmContact.create failed:', e);
        }
      }

      // Log LEAD_CREATED activity if we just created this contact
      if (contact && contactWasNew) {
        prisma.contactActivity.create({
          data: {
            contact_id:      contact.id,
            type:            'LEAD_CREATED',
            description:     `Contact created from quote`,
            metadata:        { source: 'quote', quote_number: quote.quote_number },
            performed_by_id: user.sub,
          },
        }).catch(e => console.error('[quotes/POST] contactActivity(LEAD_CREATED) failed:', e));
      }

      // 4. Create pipeline Lead if missing
      let leadWasNew = false;
      if (!lead && contact) {
        try {
          // Look for ANY pipeline (prefer default, fall back to first active)
          let defaultPipeline = await prisma.pipeline.findFirst({
            where: { is_default: true, status: true },
          }).catch(() => null);
          if (!defaultPipeline) {
            defaultPipeline = await prisma.pipeline.findFirst({
              where: { status: true },
              orderBy: { created_at: 'asc' },
            }).catch(() => null);
          }

          const firstStage = defaultPipeline
            ? await prisma.pipelineStage.findFirst({
                where: { pipeline_id: defaultPipeline.id, status: true },
                orderBy: { order: 'asc' },
              }).catch(() => null)
            : null;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lead = await prisma.lead.create({
            data: {
              name:           customer.name,
              phone:          normalizedPhone,
              crm_contact_id: contact.id,
              pipeline_id:    defaultPipeline?.id ?? null,
              stage_id:       firstStage?.id ?? null,
              owner_id:       user.sub,
            } as any,
          });
          leadWasNew = true;
        } catch (e) {
          console.error('[quotes/POST] lead.create failed:', e);
        }
      }

      // Log pipeline lead creation activity on the contact
      if (contact && lead && leadWasNew) {
        prisma.contactActivity.create({
          data: {
            contact_id:      contact.id,
            type:            'LEAD_CREATED',
            description:     `Pipeline lead created`,
            metadata:        { lead_id: lead.id },
            performed_by_id: user.sub,
          },
        }).catch(e => console.error('[quotes/POST] contactActivity(pipeline LEAD_CREATED) failed:', e));
      }

      // 5. Link quote → lead
      if (lead) {
        try {
          await prisma.quote.update({ where: { id: quote.id }, data: { lead_id: lead.id } });
          finalLeadId = lead.id;
        } catch (e) {
          console.error('[quotes/POST] quote.update(lead_id) failed:', e);
        }
      }

      // 6. Log quote-linked activity on contact (non-critical)
      if (contact && lead) {
        prisma.contactActivity.create({
          data: {
            contact_id:      contact.id,
            type:            'FIELD_UPDATE',
            description:     `Quote ${quote.quote_number} created`,
            metadata:        { quote_id: quote.id, quote_number: quote.quote_number, quote_type: quote.quote_type },
            performed_by_id: user.sub,
          },
        }).catch(e => console.error('[quotes/POST] contactActivity(FIELD_UPDATE) failed:', e));

        // Also log on the lead
        prisma.leadActivity.create({
          data: { lead_id: lead.id, type: 'quote_created', metadata: { quote_id: quote.id, quote_number: quote.quote_number }, created_by: user.sub },
        }).catch(e => console.error('[quotes/POST] leadActivity.create failed:', e));
      }
    }
  }

  return created({ ...quote, lead_id: finalLeadId });
}
