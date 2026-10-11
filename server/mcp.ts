import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolSchemas, toolDescriptions, type ToolName } from './schemas.js';
import type { RepairService } from './service.js';
import { AppError } from './store.js';
import type { ToolTrace } from '../shared/types.js';

export function createMcpServer(service: RepairService) {
  const server = new McpServer({ name: 'mobilityrelay', version: '0.1.0' });
  for (const name of Object.keys(toolSchemas) as ToolName[]) {
    server.registerTool(name, {
      title: name.replaceAll('_', ' '), description: toolDescriptions[name], inputSchema: toolSchemas[name].shape,
      annotations: { readOnlyHint: ['get_repair_brief', 'export_repair_packet'].includes(name), destructiveHint: name === 'send_approved_request', openWorldHint: name === 'send_approved_request', idempotentHint: name !== 'send_approved_request' },
    }, async (args: Record<string, unknown>) => {
      try {
        const data = await service.run(name, args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(data) }], structuredContent: { data } };
      } catch (error) {
        const status = error instanceof AppError ? error.status : 400;
        const message = error instanceof Error ? error.message : 'Tool failed.';
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify({ error: message, status }) }] };
      }
    });
  }
  return server;
}

export type ToolCaller = <T>(name: ToolName, args: Record<string, unknown>, traces?: ToolTrace[]) => Promise<T>;
export async function mcpCatalog(endpoint: string, token: string) {
  const client = new Client({ name: 'mobilityrelay-catalog', version: '0.1.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
    return (await client.listTools()).tools;
  } finally { await client.close().catch(() => {}); }
}
export function mcpCaller(endpoint: () => string, token: string): ToolCaller {
  return async <T>(name: ToolName, args: Record<string, unknown>, traces: ToolTrace[] = []) => {
    const started = performance.now(); let ok = false;
    const client = new Client({ name: 'mobilityrelay-web-host', version: '0.1.0' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(endpoint()), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
      await client.listTools();
      const result = await client.callTool({ name, arguments: args });
      const raw = result.content as { type: string; text?: string }[];
      if (result.isError) {
        const err = JSON.parse(raw.find(block => block.type === 'text')?.text ?? '{}');
        throw new AppError(err.error ?? 'MCP tool failed.', err.status ?? 400);
      }
      ok = true;
      return ((result.structuredContent as { data: T } | undefined)?.data ?? JSON.parse(raw.find(block => block.type === 'text')?.text ?? 'null')) as T;
    } finally {
      traces.push({ tool: name, durationMs: Math.round(performance.now() - started), ok });
      await client.close().catch(() => {});
    }
  };
}
