import { cleanBody } from '@/lib/clean-body';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthUser, requireRole } from '@/lib/auth';
import { ok, created, err, unauthorized, forbidden } from '@/lib/api-response';
import { UserRole, QuoteType, QuoteStatus } from '@prisma/client';
import { generateQuoteNumber } from '@/lib/generate-quote-number';
import { sendWhatsAppTemplate, normalisePhone } from '@/lib/gallabox';

export const dynamic    = 'force-dynamic';
export const maxDuration = 60;

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
  const t0 = Date.now();
  console.log('[QUOTE] Start', t0);

  const user = await getAuthUser(req);
  if (!user) return unauthorized();
  if (!requireRole(user, UserRole.ADMIN, UserRole.SALES, UserRole.MANAGER)) return forbidden();

  console.log('[QUOTE] Auth', Date.now() - t0, 'ms');

  const rawBody = await req.json(); const body = cleanBody(rawBody);
  const parsed = QuoteSchema.safeParse(body);
  if (!parsed.success) return err('Validation failed', 400, parsed.error.flatten());

  console.log('[QUOTE] Validated', Date.now() - t0, 'ms');

  // state_ids: use provided array or fall back to [state_id]
  const state_ids = parsed.data.state_ids?.length ? parsed.data.state_ids : [parsed.data.state_id];
  const primaryStateId = state_ids[0];
  const quote_number = await generateQuoteNumber(primaryStateId);

  console.log('[QUOTE] Quote number generated', Date.now() - t0, 'ms');

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

  console.log('[QUOTE] DB saved', Date.now() - t0, 'ms');

  // ── Fire-and-forget: everything after this runs in background ──────────────
  // Return the quote to the client immediately — do NOT await any of the below.

  void (async () => {
    const bg0 = Date.now();
    try {
      // 1. Quote created event
      await prisma.quoteEvent.create({
        data: { quote_id: quote.id, event_type: 'quote_created', metadata: { created_by: user.sub } },
      });
      console.log('[QUOTE BG] quoteEvent.create', Date.now() - bg0, 'ms');
    } catch (e) { console.error('[QUOTE BG] quoteEvent.create failed:', e); }

    // 2. Auto-send WhatsApp notification to customer
    void (async () => {
      try {
        const customer = await prisma.customer.findUnique({
          where: { id: quote.customer_id },
          select: { name: true, phone: true },
        });
        if (customer?.phone) {
          const phone = normalisePhone(customer.phone);
          const templateName = process.env.GALLABOX_QUOTE_TEMPLATE ?? 'quote_preparation';
          const result = await sendWhatsAppTemplate(
            phone,
            templateName,
            [customer.name, quote.quote_number],
            customer.name,
          );

          const ist = new Date(new Date().getTime() + 5.5 * 60 * 60 * 1000);
          await prisma.gallaboxMessage.create({
            data: {
              gallabox_id:   result.messageId,
              contact_phone: phone,
              contact_name:  customer.name,
              direction:     'outgoing',
              message_type:  'template',
              content:       `[Template: ${templateName}] ${customer.name} | ${quote.quote_number}`,
              status:        result.ok ? 'sent' : 'failed',
              failure_reason: result.ok ? null : (result.error ?? null),
              event_type:    'Message.Send.Template',
              raw_payload:   { templateName, quoteId: quote.id, quoteNumber: quote.quote_number },
              created_at:    ist,
              updated_at:    ist,
            },
          }).catch(e => console.error('[QUOTE BG] WhatsApp log failed:', e));

          if (!result.ok) {
            console.warn('[QUOTE BG] WhatsApp auto-send failed:', result.error);
          } else {
            console.log('[QUOTE BG] WhatsApp sent for quote', quote.quote_number, '→ messageId:', result.messageId);
          }
        }
      } catch (e) {
        console.error('[QUOTE BG] WhatsApp auto-send error:', e);
      }
    })();

    // 3. Auto-link to pipeline lead
    void (async () => {
      try {
        if (parsed.data.lead_id) {
          await prisma.leadActivity.create({
            data: { lead_id: parsed.data.lead_id, type: 'quote_created', metadata: { quote_id: quote.id, quote_number: quote.quote_number }, created_by: user.sub },
          }).catch(() => {});
          return;
        }

        const customer = await prisma.customer.findUnique({ where: { id: quote.customer_id } }).catch(() => null);
        if (!customer?.phone) return;

        const rawPhone = customer.phone;
        const normalizedPhone = rawPhone.replace(/[\s\-\(\)]/g, '');

        // Find or create CrmContact
        let contact = await prisma.crmContact.findFirst({
          where: { OR: [{ phone: normalizedPhone }, { phone: rawPhone }] },
        }).catch(() => null);

        let contactWasNew = false;
        if (!contact) {
          try {
            contact = await prisma.crmContact.create({
              data: {
                name:           customer.name,
                phone:          normalizedPhone,
                owner_id:       user.sub,
                assigned_to_id: user.sub,
              },
            });
            contactWasNew = true;
          } catch {
            contact = await prisma.crmContact.findFirst({
              where: { OR: [{ phone: normalizedPhone }, { phone: rawPhone }] },
            }).catch(() => null);
          }
        }

        if (contact && contactWasNew) {
          prisma.contactActivity.create({
            data: {
              contact_id:      contact.id,
              type:            'LEAD_CREATED',
              description:     `Contact created from quote`,
              metadata:        { source: 'quote', quote_number: quote.quote_number },
              performed_by_id: user.sub,
            },
          }).catch(e => console.error('[QUOTE BG] contactActivity(LEAD_CREATED) failed:', e));
        }

        // Find or create pipeline lead
        let lead = contact
          ? await prisma.lead.findFirst({
              where: { crm_contact_id: contact.id, is_converted: false },
              orderBy: { created_at: 'desc' },
            }).catch(() => null)
          : null;

        let leadWasNew = false;
        if (!lead && contact) {
          try {
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
            console.error('[QUOTE BG] lead.create failed:', e);
          }
        }

        if (contact && lead && leadWasNew) {
          prisma.contactActivity.create({
            data: {
              contact_id:      contact.id,
              type:            'LEAD_CREATED',
              description:     `Pipeline lead created`,
              metadata:        { lead_id: lead.id },
              performed_by_id: user.sub,
            },
          }).catch(e => console.error('[QUOTE BG] contactActivity(pipeline) failed:', e));
        }

        if (lead) {
          await prisma.quote.update({ where: { id: quote.id }, data: { lead_id: lead.id } })
            .catch(e => console.error('[QUOTE BG] quote.update(lead_id) failed:', e));
        }

        if (contact && lead) {
          prisma.contactActivity.create({
            data: {
              contact_id:      contact.id,
              type:            'FIELD_UPDATE',
              description:     `Quote ${quote.quote_number} created`,
              metadata:        { quote_id: quote.id, quote_number: quote.quote_number, quote_type: quote.quote_type },
              performed_by_id: user.sub,
            },
          }).catch(e => console.error('[QUOTE BG] contactActivity(FIELD_UPDATE) failed:', e));

          prisma.leadActivity.create({
            data: { lead_id: lead.id, type: 'quote_created', metadata: { quote_id: quote.id, quote_number: quote.quote_number }, created_by: user.sub },
          }).catch(e => console.error('[QUOTE BG] leadActivity.create failed:', e));
        }

        console.log('[QUOTE BG] pipeline auto-link done in', Date.now() - bg0, 'ms');
      } catch (e) {
        console.error('[QUOTE BG] pipeline auto-link error:', e);
      }
    })();
  })();

  console.log('[QUOTE] All done (returning to client)', Date.now() - t0, 'ms');

  return created({ ...quote, lead_id: parsed.data.lead_id ?? null });
}
