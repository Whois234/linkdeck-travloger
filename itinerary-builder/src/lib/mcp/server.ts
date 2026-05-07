import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMasterTools } from './tools/masters';
import { registerLeadsQuotesTools } from './tools/leads-quotes';
import { registerItineraryTools } from './tools/itinerary';

/**
 * Create and configure a new McpServer instance with all registered tools.
 * Called once per SSE session.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'travloger-crm',
    version: '1.0.0',
  });

  registerMasterTools(server);
  registerLeadsQuotesTools(server);
  registerItineraryTools(server);

  return server;
}
