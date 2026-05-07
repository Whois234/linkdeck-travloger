/**
 * Re-exports McpServer from the MCP SDK using an absolute path require().
 *
 * Why: The SDK's package.json `exports` map only exposes named subpaths
 * (./server, ./client, etc.). Node.js enforces the exports map strictly, so
 * `require('@modelcontextprotocol/sdk/dist/cjs/server/mcp.js')` throws
 * MODULE_NOT_FOUND at runtime even though the file exists.
 *
 * Solution: Resolve the CJS index entry (which IS in the exports map) to an
 * absolute path, then navigate to mcp.js in the same directory. Requiring an
 * absolute file path bypasses the exports map entirely.
 *
 * This module is only evaluated on the server (the package is in webpack
 * externals) so `require` and `__dirname`-style resolution are always available.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import path from 'path';

// Resolve the published CJS entry point (./dist/cjs/server/index.js)
// by requiring the package's `./server` export, which IS in the exports map.
const serverIndexPath: string = require.resolve('@modelcontextprotocol/sdk/server');

// Navigate from the server index to mcp.js in the same directory.
const mcpAbsolutePath = path.join(path.dirname(serverIndexPath), 'mcp.js');

// Load via absolute path — bypasses the exports map.
const mod = require(mcpAbsolutePath) as { McpServer: new (options: { name: string; version: string }) => McpServer };

// Minimal McpServer interface covering what our tools actually use.
export interface McpServer {
  tool(name: string, description: string, schema: Record<string, any>, handler: (args: any) => Promise<any>): void;
  connect(transport: any): Promise<void>;
  close(): Promise<void>;
}

export const McpServer = mod.McpServer;
