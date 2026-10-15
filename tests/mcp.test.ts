import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createMcpHost, mcpCaller, mcpCatalog } from '../server/mcp.js';
import type { ToolTrace } from '../shared/types.js';

for (const operation of ['catalog', 'call'] as const) test(`MCP ${operation} aborts a stalled HTTP connection without claiming success`, { timeout: 15000 }, async () => {
  let requests = 0;
  const server = createServer((_request, _response) => { requests++; });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const endpoint = `http://127.0.0.1:${address.port}/mcp`; const traces: ToolTrace[] = [];
  const started = performance.now();
  try {
    const timedOut = (error: unknown) => error instanceof Error && /timeout|aborted/i.test(error.message);
    if (operation === 'catalog') await assert.rejects(mcpCatalog(endpoint, 'fictional-timeout-token', 2000), timedOut);
    else {
      await assert.rejects(mcpCaller(() => endpoint, 'fictional-timeout-token', 2000)('get_repair_brief', { caseId: randomUUID() }, traces), timedOut);
      assert.equal(traces.length, 1); assert.equal(traces[0].ok, false);
    }
    assert.equal(requests, 1, 'A failed request must not be automatically replayed.');
    assert.ok(performance.now() - started < 10000, 'HTTP cancellation must finish before the outer test deadline.');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('reusable MCP host cancels a stalled connection and does not replay a write', { timeout: 15000 }, async () => {
  let requests = 0;
  const server = createServer(() => { requests++; });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const host = createMcpHost(() => `http://127.0.0.1:${address.port}/mcp`, 'fictional-timeout-token', 2000);
  const traces: ToolTrace[] = [];
  try {
    await assert.rejects(host.call('prepare_repair_request', { caseId: randomUUID() }, traces), error => error instanceof Error && /timeout|aborted|timed out/i.test(error.message));
    assert.equal(requests, 1); assert.equal(traces.length, 1); assert.equal(traces[0].ok, false);
    await host.close();
    await assert.rejects(host.catalog(), /closed/);
  } finally { await host.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('reusable MCP deadlines renew and transport failure reconnects only on a later request', { timeout: 20000 }, async () => {
  let initializations = 0; let writes = 0;
  const server = createServer((request, response) => {
    response.setHeader('Transfer-Encoding', 'chunked');
    if (request.method !== 'POST') { response.writeHead(405).end(); return; }
    let body = ''; request.on('data', chunk => { body += String(chunk); });
    request.once('end', () => {
      const rpc = JSON.parse(body);
      if (rpc.id === undefined) { response.writeHead(202).end(); return; }
      let result: unknown;
      if (rpc.method === 'initialize') {
        initializations++;
        result = { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fictional-host-regression', version: '1' } };
      } else if (rpc.method === 'tools/list') {
        result = { tools: ['get_repair_brief', 'prepare_repair_request'].map(name => ({ name, inputSchema: { type: 'object', properties: {} } })) };
      } else if (rpc.params.name === 'prepare_repair_request') {
        writes++; request.socket.destroy(); return;
      } else if (rpc.params.arguments?.fail) {
        result = { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'Fictional domain rejection.', status: 409 }) }] };
      } else if (rpc.params.arguments?.malformed) {
        result = { content: [{ type: 'text', text: '{' }] };
      } else {
        result = { content: [{ type: 'text', text: '{"fresh":true}' }], structuredContent: { data: { fresh: true } } };
      }
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const host = createMcpHost(() => `http://127.0.0.1:${address.port}/mcp`, 'fictional-reuse-token', 2000);
  const traces: ToolTrace[] = [];
  try {
    assert.deepEqual(await host.call('get_repair_brief', {}), { fresh: true });
    await new Promise(resolve => setTimeout(resolve, 2100));
    assert.deepEqual(await host.call('get_repair_brief', {}), { fresh: true }, 'An idle client must not inherit its creation-time deadline.');
    await assert.rejects(host.call('get_repair_brief', { fail: true }), /domain rejection/);
    assert.deepEqual(await host.call('get_repair_brief', {}), { fresh: true });
    assert.equal(initializations, 1, 'A domain error must not discard a healthy protocol client.');
    const malformed: ToolTrace[] = [];
    await assert.rejects(host.call('get_repair_brief', { malformed: true }, malformed));
    assert.equal(malformed[0].ok, false, 'Invalid tool data must not produce a successful trace.');
    assert.deepEqual(await host.call('get_repair_brief', {}), { fresh: true });
    assert.equal(initializations, 2);
    await assert.rejects(host.call('prepare_repair_request', {}, traces));
    assert.equal(writes, 1, 'An ambiguous transport failure must not replay a write.');
    assert.equal(traces.length, 1); assert.equal(traces[0].ok, false);
    assert.deepEqual(await host.call('get_repair_brief', {}), { fresh: true });
    assert.equal(initializations, 3); assert.equal(writes, 1);
  } finally { await host.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
