/**
 * MCP SSE Server Route
 *
 * GET  /api/mcp/sse          — Opens an SSE stream. Emits an "endpoint" event
 *                              pointing the client to POST /api/mcp/sse?sid=<id>
 * POST /api/mcp/sse?sid=<id> — Delivers a JSON-RPC message to the MCP server
 *                              running in the session identified by <sid>.
 *
 * Both endpoints require the x-api-key header to match MCP_API_KEY in .env.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createMcpServer } from '@/lib/mcp/server';
import { NextSSETransport, sessions } from '@/lib/mcp/transport';

function checkApiKey(req: NextRequest): boolean {
  const key = req.headers.get('x-api-key');
  return key === process.env.MCP_API_KEY;
}

// ── GET — open SSE stream ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const sid = crypto.randomUUID();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const transport = new NextSSETransport(controller);
      sessions.set(sid, transport);

      // Build the POST endpoint URL from the incoming request
      const url = new URL(req.url);
      const endpointUrl = `${url.origin}/api/mcp/sse?sid=${sid}`;

      // Send MCP "endpoint" event so the client knows where to POST
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`event: endpoint\ndata: ${endpointUrl}\n\n`));

      // Wire up and start the MCP server
      const server = createMcpServer();
      server.connect(transport).catch(err => {
        console.error('[MCP] connect error:', err);
        sessions.delete(sid);
      });

      // Keepalive every 25 s to prevent proxy timeouts
      const keepaliveTimer = setInterval(() => {
        if (sessions.has(sid)) {
          transport.keepalive();
        } else {
          clearInterval(keepaliveTimer);
        }
      }, 25_000);

      // Clean up when the client disconnects
      transport.onclose = () => {
        clearInterval(keepaliveTimer);
        sessions.delete(sid);
      };
    },
    cancel() {
      sessions.delete(sid);
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  });
}

// ── POST — deliver JSON-RPC message ────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const sid = new URL(req.url).searchParams.get('sid');
  if (!sid) {
    return NextResponse.json({ error: 'Missing sid query parameter' }, { status: 400 });
  }

  const transport = sessions.get(sid);
  if (!transport) {
    return NextResponse.json({ error: 'Session not found or expired' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transport.receiveMessage(body as any);

  return new NextResponse(null, { status: 202 });
}
