/**
 * MCP Streamable HTTP endpoint — compatible with ChatGPT custom MCP integration.
 *
 * Protocol: JSON-RPC 2.0 over HTTP (no persistent sessions).
 *   OPTIONS /api/mcp/sse  — CORS preflight
 *   GET     /api/mcp/sse  — SSE keepalive stream (connection check)
 *   POST    /api/mcp/sse  — JSON-RPC method handler (all MCP traffic)
 *
 * Auth: x-api-key header must match MCP_API_KEY env var (POST only).
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS: HeadersInit = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

// ── Tool registry ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'ping',
    description: 'Health check — returns pong. Use this to verify the MCP server is reachable.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_leads',
    description: 'Return the 50 most recent leads from the Travloger CRM.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_destinations',
    description: 'Return all active travel destinations.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_states',
    description: 'Return all active states/regions.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_hotels',
    description: 'Return hotels, optionally filtered by destination.',
    inputSchema: {
      type: 'object',
      properties: {
        destination_id: { type: 'string', description: 'Filter by destination ID (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'get_quotes',
    description: 'Return quotes, optionally filtered by status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status: DRAFT | SENT | VIEWED | ACCEPTED | REJECTED | EXPIRED | CONVERTED',
        },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'create_lead',
    description: 'Create a new lead in the CRM.',
    inputSchema: {
      type: 'object',
      properties: {
        name:  { type: 'string', description: 'Customer name' },
        phone: { type: 'string', description: 'Phone number' },
        email: { type: 'string', description: 'Email address (optional)' },
        source: { type: 'string', description: 'Lead source e.g. Instagram, Walk-in' },
        destination_interest: { type: 'string', description: 'Destination of interest' },
        travel_month: { type: 'string', description: 'Expected travel month e.g. Dec 2025' },
        budget_range:  { type: 'string', description: 'Budget range' },
        notes: { type: 'string', description: 'Internal notes' },
      },
      required: ['name', 'phone'],
    },
  },
];

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {

    case 'ping':
      return { message: 'pong' };

    case 'get_leads':
      return prisma.lead.findMany({
        orderBy: { created_at: 'desc' },
        take: 50,
        include: {
          stage:    { select: { name: true } },
          pipeline: { select: { name: true } },
        },
      });

    case 'get_destinations':
      return prisma.destination.findMany({
        where: { status: true },
        orderBy: { name: 'asc' },
        include: { state: { select: { name: true, code: true } } },
      });

    case 'get_states':
      return prisma.state.findMany({
        where: { status: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, code: true, country: true, trip_id_prefix: true },
      });

    case 'get_hotels': {
      const dest = args.destination_id as string | undefined;
      return prisma.hotel.findMany({
        where: { status: true, ...(dest ? { destination_id: dest } : {}) },
        orderBy: { hotel_name: 'asc' },
        include: {
          destination: { select: { name: true } },
          supplier:    { select: { name: true } },
        },
        take: 50,
      });
    }

    case 'get_quotes': {
      const limit = typeof args.limit === 'number' ? args.limit : 20;
      return prisma.quote.findMany({
        where: args.status ? { status: args.status as import('@prisma/client').QuoteStatus } : undefined,
        include: {
          customer:      { select: { name: true, phone: true } },
          state:         { select: { name: true, code: true } },
          quote_options: { select: { option_name: true, final_price: true, is_most_popular: true } },
        },
        orderBy: { created_at: 'desc' },
        take: limit,
      });
    }

    case 'create_lead':
      return prisma.lead.create({
        data: {
          name:                 String(args.name),
          phone:                String(args.phone),
          email:                args.email   ? String(args.email)   : null,
          source:               args.source  ? String(args.source)  : null,
          destination_interest: args.destination_interest ? String(args.destination_interest) : null,
          travel_month:         args.travel_month ? String(args.travel_month) : null,
          budget_range:         args.budget_range ? String(args.budget_range) : null,
          notes:                args.notes ? String(args.notes) : null,
          status:               'NEW',
        },
      });

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── JSON-RPC helpers ──────────────────────────────────────────────────────────

function ok(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { headers: CORS });
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code, message } },
    { status: 200, headers: CORS },   // keep 200 so ChatGPT parses the body
  );
}

// ── Route handlers ────────────────────────────────────────────────────────────

/** CORS preflight */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** GET — lightweight SSE ping stream so ChatGPT can verify the endpoint */
export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(ctrl) {
      ctrl.enqueue(encoder.encode('data: {"type":"connected","server":"travloger-crm"}\n\n'));
    },
  });
  return new NextResponse(stream, {
    headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
  });
}

/** POST — JSON-RPC 2.0 dispatcher */
export async function POST(req: NextRequest) {
  // Auth
  const key = req.headers.get('x-api-key');
  if (!key || key !== process.env.MCP_API_KEY) {
    return rpcError(null, -32001, 'Unauthorized: invalid or missing x-api-key');
  }

  // Parse body
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return rpcError(null, -32700, 'Parse error: invalid JSON');
  }

  const { id = null, method = '', params } = body;
  const args = (params && typeof params === 'object' && !Array.isArray(params)
    ? params
    : {}) as Record<string, unknown>;

  // Dispatch
  switch (method) {

    case 'initialize':
      return ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'travloger-crm', version: '1.0.0' },
      });

    case 'notifications/initialized':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: TOOLS });

    case 'tools/call': {
      const toolName = typeof args.name === 'string' ? args.name : '';
      const toolArgs = (args.arguments && typeof args.arguments === 'object'
        ? args.arguments
        : {}) as Record<string, unknown>;

      if (!toolName) return rpcError(id, -32602, 'Invalid params: missing tool name');

      try {
        const result = await executeTool(toolName, toolArgs);
        return ok(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (e) {
        return rpcError(id, -32603, `Tool error: ${e}`);
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}
