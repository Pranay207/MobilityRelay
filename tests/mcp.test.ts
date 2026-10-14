import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mcpCaller, mcpCatalog } from '../server/mcp.js';
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
