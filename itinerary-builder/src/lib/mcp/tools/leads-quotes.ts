import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { generateQuoteNumber } from '@/lib/generate-quote-number';
import { QuoteType, QuoteStatus, LeadStatus, MarkupType } from '@prisma/client';

export function registerLeadsQuotesTools(server: McpServer) {
  // ── GET LEADS ──────────────────────────────────────────────────────────────
  server.tool(
    'get_leads',
    'List leads with optional filters',
    {
      status: z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'DROPPED']).optional().describe('Filter by lead status'),
      pipeline_id: z.string().optional().describe('Filter by pipeline ID'),
      limit: z.number().int().min(1).max(100).optional().default(50).describe('Max records to return'),
    },
    async ({ status, pipeline_id, limit }) => {
      try {
        const leads = await prisma.lead.findMany({
          where: {
            ...(status ? { status: status as LeadStatus } : {}),
            ...(pipeline_id ? { pipeline_id } : {}),
          },
          include: {
            stage: { select: { name: true } },
            pipeline: { select: { name: true } },
          },
          orderBy: { created_at: 'desc' },
          take: limit,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(leads, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
      }
    }
  );

  // ── CREATE LEAD ────────────────────────────────────────────────────────────
  server.tool(
    'create_lead',
    'Create a new lead',
    {
      name: z.string().describe('Lead / customer name'),
      phone: z.string().describe('Phone number'),
      email: z.string().email().optional().describe('Email address'),
      source: z.string().optional().describe('Lead source (e.g. Instagram, Walk-in)'),
      destination_interest: z.string().optional().describe('Destination the lead is interested in'),
      travel_month: z.string().optional().describe('Expected travel month (e.g. Dec 2025)'),
      budget_range: z.string().optional().describe('Budget range string'),
      pipeline_id: z.string().optional().describe('Pipeline to assign the lead to'),
      stage_id: z.string().optional().describe('Stage within the pipeline'),
      notes: z.string().optional().describe('Internal notes'),
    },
    async (args) => {
      try {
        const lead = await prisma.lead.create({
          data: {
            name: args.name,
            phone: args.phone,
            email: args.email,
            source: args.source,
            destination_interest: args.destination_interest,
            travel_month: args.travel_month,
            budget_range: args.budget_range,
            pipeline_id: args.pipeline_id,
            stage_id: args.stage_id,
            notes: args.notes,
            status: LeadStatus.NEW,
          },
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(lead, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
      }
    }
  );

  // ── GET QUOTES ─────────────────────────────────────────────────────────────
  server.tool(
    'get_quotes',
    'List quotes with optional filters',
    {
      lead_id: z.string().optional().describe('Filter by lead ID'),
      status: z.enum(['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED']).optional().describe('Filter by quote status'),
      limit: z.number().int().min(1).max(100).optional().default(20).describe('Max records to return'),
    },
    async ({ lead_id, status, limit }) => {
      try {
        const quotes = await prisma.quote.findMany({
          where: {
            ...(lead_id ? { lead_id } : {}),
            ...(status ? { status: status as QuoteStatus } : {}),
          },
          include: {
            customer: { select: { name: true, phone: true } },
            state: { select: { name: true, code: true } },
            quote_options: {
              select: {
                id: true,
                option_name: true,
                final_price: true,
                is_most_popular: true,
                vehicle_cost: true,
                hotel_cost: true,
                profit_amount: true,
                gst_amount: true,
              },
            },
          },
          orderBy: { created_at: 'desc' },
          take: limit,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(quotes, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
      }
    }
  );

  // ── CREATE QUOTE ───────────────────────────────────────────────────────────
  server.tool(
    'create_quote',
    'Create a new quote for a lead/customer with full pricing',
    {
      lead_id: z.string().describe('Lead ID to attach the quote to'),
      customer_id: z.string().describe('Customer ID'),
      state_id: z.string().describe('State ID (for quote number generation)'),
      quote_type: z.enum(['PRIVATE', 'GROUP']).describe('Quote type'),
      start_date: z.string().describe('Trip start date (ISO 8601)'),
      end_date: z.string().describe('Trip end date (ISO 8601)'),
      duration_days: z.number().int().positive().describe('Total days'),
      duration_nights: z.number().int().min(0).describe('Total nights'),
      adults: z.number().int().positive().describe('Number of adults'),
      children_below_5: z.number().int().min(0).optional().default(0),
      children_5_12: z.number().int().min(0).optional().default(0),
      infants: z.number().int().min(0).optional().default(0),
      pickup_point: z.string().optional(),
      drop_point: z.string().optional(),
      expiry_date: z.string().optional().describe('Quote expiry date (ISO 8601)'),
      quote_name: z.string().optional().describe('Optional display name for the quote'),
      created_by: z.string().describe('User ID creating the quote'),
      options: z.array(z.object({
        option_name: z.string().describe('Option label e.g. "Budget", "Standard", "Luxury"'),
        vehicle_type_id: z.string().optional(),
        vehicle_cost: z.number().min(0).optional().default(0),
        hotel_cost: z.number().min(0).optional().default(0),
        activity_cost: z.number().min(0).optional().default(0),
        transfer_cost: z.number().min(0).optional().default(0),
        misc_cost: z.number().min(0).optional().default(0),
        profit_type: z.enum(['PERCENTAGE', 'FIXED']).describe('Markup type'),
        profit_value: z.number().min(0).describe('Profit % or fixed amount'),
        gst_percent: z.number().min(0).optional().default(5).describe('GST percentage (default 5%)'),
        discount_amount: z.number().min(0).optional().default(0),
        is_most_popular: z.boolean().optional().default(false),
        internal_notes: z.string().optional(),
        customer_visible_notes: z.string().optional(),
      })).min(1).describe('At least one pricing option'),
    },
    async (args) => {
      try {
        const quote_number = await generateQuoteNumber(args.state_id);

        const quote = await prisma.quote.create({
          data: {
            quote_number,
            quote_name: args.quote_name,
            quote_type: args.quote_type as QuoteType,
            customer_id: args.customer_id,
            lead_id: args.lead_id,
            state_id: args.state_id,
            status: QuoteStatus.DRAFT,
            start_date: new Date(args.start_date),
            end_date: new Date(args.end_date),
            duration_days: args.duration_days,
            duration_nights: args.duration_nights,
            adults: args.adults,
            children_below_5: args.children_below_5 ?? 0,
            children_5_12: args.children_5_12 ?? 0,
            infants: args.infants ?? 0,
            pickup_point: args.pickup_point,
            drop_point: args.drop_point,
            expiry_date: args.expiry_date ? new Date(args.expiry_date) : null,
            created_by: args.created_by,
            quote_options: {
              create: args.options.map((opt, idx) => {
                const base_cost =
                  (opt.vehicle_cost ?? 0) +
                  (opt.hotel_cost ?? 0) +
                  (opt.activity_cost ?? 0) +
                  (opt.transfer_cost ?? 0) +
                  (opt.misc_cost ?? 0);

                const profit_amount =
                  opt.profit_type === 'PERCENTAGE'
                    ? (base_cost * opt.profit_value) / 100
                    : opt.profit_value;

                const selling_before_gst = base_cost + profit_amount - (opt.discount_amount ?? 0);
                const gst_percent = opt.gst_percent ?? 5;
                const gst_amount = (selling_before_gst * gst_percent) / 100;
                const final_price = selling_before_gst + gst_amount;
                const price_per_adult_display = args.adults > 0 ? final_price / args.adults : final_price;

                return {
                  option_name: opt.option_name,
                  display_order: idx + 1,
                  is_most_popular: opt.is_most_popular ?? false,
                  vehicle_type_id: opt.vehicle_type_id,
                  vehicle_cost: opt.vehicle_cost ?? 0,
                  hotel_cost: opt.hotel_cost ?? 0,
                  activity_cost: opt.activity_cost ?? 0,
                  transfer_cost: opt.transfer_cost ?? 0,
                  misc_cost: opt.misc_cost ?? 0,
                  base_cost,
                  profit_type: opt.profit_type as MarkupType,
                  profit_value: opt.profit_value,
                  profit_amount,
                  discount_amount: opt.discount_amount ?? 0,
                  selling_before_gst,
                  gst_percent,
                  gst_amount,
                  final_price,
                  price_per_adult_display,
                  internal_notes: opt.internal_notes,
                  customer_visible_notes: opt.customer_visible_notes,
                };
              }),
            },
          },
          include: { quote_options: true },
        });

        // Events
        await prisma.quoteEvent.create({
          data: {
            quote_id: quote.id,
            event_type: 'quote_created',
            metadata: { created_by: args.created_by, source: 'mcp' },
          },
        });

        if (args.lead_id) {
          await prisma.leadActivity.create({
            data: {
              lead_id: args.lead_id,
              type: 'quote_created',
              metadata: { quote_id: quote.id, quote_number: quote.quote_number },
              created_by: args.created_by,
            },
          });
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(quote, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
      }
    }
  );

  // ── GET QUOTE LINK ─────────────────────────────────────────────────────────
  server.tool(
    'get_quote_link',
    'Get the public shareable link for a quote',
    {
      quote_id: z.string().describe('Quote ID'),
    },
    async ({ quote_id }) => {
      try {
        const quote = await prisma.quote.findUnique({
          where: { id: quote_id },
          select: { public_token: true, link_active: true, quote_number: true, status: true },
        });
        if (!quote) return { content: [{ type: 'text' as const, text: 'Quote not found' }], isError: true };

        const base_url = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.travloger.in';
        const link = `${base_url}/q/${quote.public_token}`;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ link, link_active: quote.link_active, quote_number: quote.quote_number, status: quote.status }, null, 2),
          }],
        };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
      }
    }
  );

  // ── ACTIVATE QUOTE ─────────────────────────────────────────────────────────
  server.tool(
    'activate_quote',
    'Activate a quote (set status to SENT and enable public link)',
    {
      quote_id: z.string().describe('Quote ID to activate'),
    },
    async ({ quote_id }) => {
      try {
        const quote = await prisma.quote.update({
          where: { id: quote_id },
          data: { status: QuoteStatus.SENT, link_active: true },
          select: { id: true, quote_number: true, status: true, public_token: true },
        });

        await prisma.quoteEvent.create({
          data: {
            quote_id: quote.id,
            event_type: 'quote_sent',
            metadata: { source: 'mcp' },
          },
        });

        const base_url = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.travloger.in';
        const link = `${base_url}/q/${quote.public_token}`;

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ ...quote, link }, null, 2),
          }],
        };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
      }
    }
  );
}
