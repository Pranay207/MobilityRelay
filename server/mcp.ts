import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Agent } from 'undici';
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
function transport(endpoint: string, token: string, timeoutMs: number, reusable = false) {
  const url = new URL(endpoint);
  const dispatcher = new Agent({ connections: 1, pipelining: 0 });
  const deadline = AbortSignal.timeout(timeoutMs);
  const connection = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token}`, Connection: 'close' } },
    // The SDK supplies its own abort signal, so combine it in the fetch adapter.
    fetch: (input, init) => {
      const options: RequestInit & { dispatcher: Agent } = { ...init, dispatcher, signal: AbortSignal.any([reusable ? AbortSignal.timeout(timeoutMs) : deadline, ...(init?.signal ? [init.signal] : [])]) };
      return fetch(input, options);
    },
  });
  return { connection, dispatcher };
}

// Reuse protocol negotiation and schema validators, never case/tool results.
export function createMcpHost(endpoint: () => string, token: string, timeoutMs = 30000) {
  type Session = { client: Client; http: ReturnType<typeof transport>; tools: Awaited<ReturnType<Client['listTools']>>['tools'] };
  let active: Promise<Session> | undefined; let closed = false;
  const dispose = async (session: Session) => {
    await session.client.close().catch(() => {});
    await session.http.dispatcher.destroy().catch(() => {});
  };
  const ready = () => {
    if (closed) throw new AppError('The MCP host is closed.', 503);
    if (!active) {
      const pending = (async () => {
        const client = new Client({ name: 'mobilityrelay-web-host', version: '0.1.0' });
        const http = transport(endpoint(), token, timeoutMs, true);
        try {
          await client.connect(http.connection, { timeout: timeoutMs });
          const tools = (await client.listTools(undefined, { timeout: timeoutMs })).tools;
          return { client, http, tools };
        } catch (error) {
          await client.close().catch(() => {}); await http.dispatcher.destroy().catch(() => {});
          throw error;
        }
      })();
      active = pending;
      void pending.catch(() => { if (active === pending) active = undefined; });
    }
    return active;
  };
  const call: ToolCaller = async <T>(name: ToolName, args: Record<string, unknown>, traces: ToolTrace[] = []) => {
    const started = performance.now(); let ok = false; let pending: Promise<Session> | undefined;
    try {
      pending = ready(); const session = await pending;
      const result = await session.client.callTool({ name, arguments: args }, undefined, { timeout: timeoutMs, signal: AbortSignal.timeout(timeoutMs) });
      const raw = result.content as { type: string; text?: string }[];
      if (result.isError) {
        const error = JSON.parse(raw.find(block => block.type === 'text')?.text ?? '{}');
        throw new AppError(error.error ?? 'MCP tool failed.', error.status ?? 400);
      }
      const data = ((result.structuredContent as { data: T } | undefined)?.data ?? JSON.parse(raw.find(block => block.type === 'text')?.text ?? 'null')) as T;
      ok = true;
      return data;
    } catch (error) {
      // A later user request may reconnect; never replay this operation.
      if (!(error instanceof AppError) && pending && active === pending) {
        active = undefined;
        await pending.then(dispose, () => {});
      }
      throw error;
    } finally { traces.push({ tool: name, durationMs: Math.round(performance.now() - started), ok }); }
  };
  return {
    call,
    catalog: async () => (await ready()).tools,
    close: async () => { closed = true; const pending = active; active = undefined; await pending?.then(dispose, () => {}); },
  };
}
export async function mcpCatalog(endpoint: string, token: string, timeoutMs = 30000) {
  const client = new Client({ name: 'mobilityrelay-catalog', version: '0.1.0' });
  let http: ReturnType<typeof transport> | undefined;
  try {
    http = transport(endpoint, token, timeoutMs);
    await client.connect(http.connection);
    return (await client.listTools()).tools;
  } finally { await client.close().catch(() => {}); await http?.dispatcher.destroy().catch(() => {}); }
}
export function mcpCaller(endpoint: () => string, token: string, timeoutMs = 30000): ToolCaller {
  return async <T>(name: ToolName, args: Record<string, unknown>, traces: ToolTrace[] = []) => {
    const started = performance.now(); let ok = false;
    const client = new Client({ name: 'mobilityrelay-web-host', version: '0.1.0' });
    let http: ReturnType<typeof transport> | undefined;
    try {
      // Each host client is short-lived; avoid reusing pooled sockets across clients.
      http = transport(endpoint(), token, timeoutMs);
      await client.connect(http.connection);
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
      await http?.dispatcher.destroy().catch(() => {});
    }
  };
}
