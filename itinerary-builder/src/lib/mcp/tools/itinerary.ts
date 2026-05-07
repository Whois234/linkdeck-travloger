import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export function registerItineraryTools(server: McpServer) {
  // ── GET DAY PLANS (as itinerary templates) ─────────────────────────────────
  server.tool(
    'get_templates',
    'List available day plans that can be used as itinerary templates',
    {
      destination_id: z.string().optional().describe('Filter by destination ID'),
      limit: z.number().int().min(1).max(100).optional().default(50),
    },
    async ({ destination_id, limit }) => {
      try {
        const plans = await prisma.dayPlan.findMany({
          where: {
            ...(destination_id ? { destination_id } : {}),
            status: true,
          },
          include: {
            destination: { select: { name: true } },
          },
          orderBy: { title: 'asc' },
          take: limit,
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(plans, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
      }
    }
  );

  // ── CREATE ITINERARY TEMPLATE ──────────────────────────────────────────────
  server.tool(
    'create_itinerary_template',
    'Compose a multi-day itinerary plan from existing day plans. Returns the composed structure — use attach_itinerary_to_quote to save it to a quote.',
    {
      name: z.string().describe('Template name'),
      description: z.string().optional().describe('Short description of the itinerary'),
      destination_id: z.string().describe('Primary destination ID'),
      days: z.array(z.object({
        day_number: z.number().int().positive().describe('Day number (1-based)'),
        day_plan_id: z.string().describe('Day plan ID to use for this day'),
        notes: z.string().optional().describe('Day-level notes'),
      })).min(1).describe('Day-by-day plan'),
    },
    async (args) => {
      try {
        const dayPlanIds = args.days.map(d => d.day_plan_id);
        const uniqueIds = Array.from(new Set(dayPlanIds));
        const existingPlans = await prisma.dayPlan.findMany({
          where: { id: { in: uniqueIds } },
          include: { destination: { select: { name: true } } },
        });

        if (existingPlans.length !== uniqueIds.length) {
          const found = existingPlans.map(p => p.id);
          const missing = uniqueIds.filter(id => !found.includes(id));
          return {
            content: [{ type: 'text' as const, text: `Day plan IDs not found: ${missing.join(', ')}` }],
            isError: true,
          };
        }

        const planMap = Object.fromEntries(existingPlans.map(p => [p.id, p]));

        const template = {
          name: args.name,
          description: args.description,
          destination_id: args.destination_id,
          days: args.days.map(d => ({
            day_number: d.day_number,
            notes: d.notes,
            day_plan: planMap[d.day_plan_id],
          })),
          created_at: new Date().toISOString(),
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(template, null, 2) }] };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
      }
    }
  );

  // ── ATTACH ITINERARY TO QUOTE ──────────────────────────────────────────────
  server.tool(
    'attach_itinerary_to_quote',
    'Attach day-by-day itinerary snapshots to an existing quote using day plans',
    {
      quote_id: z.string().describe('Quote ID to attach itinerary to'),
      days: z.array(z.object({
        day_number: z.number().int().positive(),
        date: z.string().describe('Actual date for this day (ISO 8601, e.g. 2025-12-01)'),
        day_plan_id: z.string().describe('Day plan ID to snapshot for this day'),
      })).min(1),
    },
    async ({ quote_id, days }) => {
      try {
        const quote = await prisma.quote.findUnique({
          where: { id: quote_id },
          select: { id: true, quote_number: true },
        });
        if (!quote) return { content: [{ type: 'text' as const, text: 'Quote not found' }], isError: true };

        const uniqueIds = Array.from(new Set(days.map(d => d.day_plan_id)));
        const dayPlans = await prisma.dayPlan.findMany({
          where: { id: { in: uniqueIds } },
          include: { destination: { select: { id: true, name: true } } },
        });
        const planMap = Object.fromEntries(dayPlans.map(p => [p.id, p]));

        // Delete existing snapshots
        await prisma.quoteDaySnapshot.deleteMany({ where: { quote_id } });

        // Create snapshots matching QuoteDaySnapshot schema
        const created = await prisma.$transaction(
          days.map(d => {
            const plan = planMap[d.day_plan_id];
            return prisma.quoteDaySnapshot.create({
              data: {
                quote_id,
                day_number: d.day_number,
                date: new Date(d.date),
                destination_id: plan?.destination_id ?? '',
                title: plan?.title ?? `Day ${d.day_number}`,
                description: plan?.description ?? null,
                activities: plan?.linked_activities ?? [],
              },
            });
          })
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              quote_id,
              quote_number: quote.quote_number,
              days_attached: created.length,
            }, null, 2),
          }],
        };
      } catch (e) {
        return { content: [{ type: 'text' as const, text: `Error: ${e}` }], isError: true };
      }
    }
  );
}
