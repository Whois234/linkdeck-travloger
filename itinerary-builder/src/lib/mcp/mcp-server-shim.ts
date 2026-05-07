/**
 * Re-exports McpServer from the MCP SDK.
 *
 * The SDK's package.json exports map (`moduleResolution: bundler`) only exposes
 * `@modelcontextprotocol/sdk/server` (the barrel), which does NOT re-export McpServer.
 * McpServer lives in `./server/mcp` — a subpath not declared in exports.
 *
 * We load it via require() from the CJS dist at runtime (safe because the package is
 * listed in serverComponentsExternalPackages, so webpack skips it entirely).
 * We reconstruct the type by declaring a minimal compatible interface.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mod = require('@modelcontextprotocol/sdk/dist/cjs/server/mcp.js');

// Minimal interface matching the McpServer high-level API we use
export interface McpServer {
  tool(name: string, description: string, schema: Record<string, any>, handler: (args: any) => Promise<any>): void;
  connect(transport: any): Promise<void>;
  close(): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
export const McpServer: new (options: { name: string; version: string }) => McpServer = mod.McpServer;
