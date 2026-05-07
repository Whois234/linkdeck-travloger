/**
 * Re-exports McpServer from the MCP SDK using an absolute path.
 *
 * Problems we work around:
 * 1. The SDK's exports map doesn't include `./server/mcp`, so
 *    require('@modelcontextprotocol/sdk/dist/cjs/server/mcp.js') throws at runtime.
 * 2. Webpack intercepts `require.resolve()` and replaces it with a numeric
 *    module ID — passing a number to `path.dirname` throws ERR_INVALID_ARG_TYPE.
 *
 * Solution: use eval('require') to get a real Node.js require that webpack
 * never touches, resolve the CJS server barrel (which IS in the exports map)
 * to an absolute path, then navigate to mcp.js in the same directory.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, no-eval */
import path from 'path';

// eval() prevents webpack from analysing or replacing this require reference.
const nativeRequire = eval('require') as NodeRequire;

// './server' IS in the exports map → resolves to dist/cjs/server/index.js
const serverIndexAbsPath: string = nativeRequire.resolve('@modelcontextprotocol/sdk/server');

// mcp.js lives in the same directory as index.js
const mcpAbsPath = path.join(path.dirname(serverIndexAbsPath), 'mcp.js');

const mod = nativeRequire(mcpAbsPath) as {
  McpServer: new (options: { name: string; version: string }) => McpServer;
};

// Minimal interface covering what our tools actually call on McpServer.
export interface McpServer {
  tool(name: string, description: string, schema: Record<string, any>, handler: (args: any) => Promise<any>): void;
  connect(transport: any): Promise<void>;
  close(): Promise<void>;
}

export const McpServer = mod.McpServer;
