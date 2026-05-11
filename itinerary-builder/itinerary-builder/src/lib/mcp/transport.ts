/**
 * Custom MCP SSE Transport for Next.js App Router.
 *
 * The official SSEServerTransport expects Node.js IncomingMessage/ServerResponse.
 * This implementation works with the Web API ReadableStream used by App Router.
 *
 * Protocol:
 *  GET  /api/mcp/sse              — opens SSE stream, emits "endpoint" event
 *  POST /api/mcp/sse?sid=<id>    — delivers JSON-RPC message to server
 */

// JSONRPCMessage from @modelcontextprotocol/sdk/types.js — inlined because
// that subpath is not declared in the SDK's package.json exports map and
// TypeScript (moduleResolution: bundler) cannot resolve it at build time.
type JSONRPCMessage = Record<string, unknown>;

export class NextSSETransport {
  private controller: ReadableStreamDefaultController<Uint8Array>;
  private encoder = new TextEncoder();
  private closed = false;

  /** Called by McpServer when it has a message to send to the client */
  onmessage?: (msg: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (err: Error) => void;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  /** McpServer calls this on connect — nothing to do, stream is already open */
  async start(): Promise<void> {}

  /** McpServer calls this to send a response/event back to the client */
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed) return;
    const line = `data: ${JSON.stringify(message)}\n\n`;
    this.controller.enqueue(this.encoder.encode(line));
  }

  /** Called by POST handler to deliver an inbound JSON-RPC message to McpServer */
  receiveMessage(message: JSONRPCMessage): void {
    this.onmessage?.(message);
  }

  /** Close the SSE stream gracefully */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try { this.controller.close(); } catch { /* already closed */ }
    this.onclose?.();
  }

  /** Send an SSE comment line — used for keepalives */
  keepalive(): void {
    if (this.closed) return;
    try { this.controller.enqueue(this.encoder.encode(': ping\n\n')); } catch { /* ignore */ }
  }
}

/** Global session store — survives across requests in long-running Node.js process */
export const sessions = new Map<string, NextSSETransport>();
