import { createMcpServerInstance } from './mcp-server-shim';
import { registerMasterTools } from './tools/masters';
import { registerLeadsQuotesTools } from './tools/leads-quotes';
import { registerItineraryTools } from './tools/itinerary';

/**
 * Create and configure a new McpServer instance with all registered tools.
 * Called once per SSE session (inside the request handler, never at import time).
 */
export function createMcpServer() {
  const server = createMcpServerInstance({
    name: 'travloger-crm',
    version: '1.0.0',
  });

  registerMasterTools(server);
  registerLeadsQuotesTools(server);
  registerItineraryTools(server);

  return server;
}
