/**
 * Lazy McpServer factory.
 *
 * All require() calls are inside createMcpServerInstance() — NOTHING runs at
 * module load time. This is critical because Next.js imports this file during
 * build to read the route's exports (including `dynamic`), and any top-level
 * side-effect that calls require() or require.resolve() will fail at that point.
 *
 * Subpath `./server/mcp` is not in the SDK's exports map, so we resolve the
 * CJS server barrel (which IS exported) to an absolute path, then navigate to
 * mcp.js in the same directory — absolute paths bypass the exports map.
 *
 * eval('require') prevents webpack from replacing require.resolve() with a
 * numeric module ID during bundling.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, no-eval */

// ── Types only (no runtime cost at import time) ───────────────────────────────

export interface McpServer {
  tool(
    name: string,
    description: string,
    schema: Record<string, any>,
    handler: (args: any) => Promise<any>
  ): void;
  connect(transport: any): Promise<void>;
  close(): Promise<void>;
}

// ── Lazy factory ──────────────────────────────────────────────────────────────

/**
 * Creates and returns a configured McpServer instance.
 * The SDK is loaded on first call, never at import time.
 */
export function createMcpServerInstance(options: { name: string; version: string }): McpServer {
  // eval() prevents webpack from analysing this require reference.
  const nativeRequire = eval('require') as NodeRequire;

  // Use nativeRequire for path too, so no top-level import is needed.
  const nodePath = nativeRequire('path') as typeof import('path');

  // '@modelcontextprotocol/sdk/server' IS in the exports map → resolves to
  // the absolute path of dist/cjs/server/index.js.
  const serverIndexAbsPath: string = nativeRequire.resolve('@modelcontextprotocol/sdk/server');

  // mcp.js lives in the same directory as index.js.
  const mcpAbsPath = nodePath.join(nodePath.dirname(serverIndexAbsPath), 'mcp.js');

  // Absolute path require bypasses the exports map restriction.
  const { McpServer } = nativeRequire(mcpAbsPath) as {
    McpServer: new (options: { name: string; version: string }) => McpServer;
  };

  return new McpServer(options);
}
