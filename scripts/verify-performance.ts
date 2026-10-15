import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { startServer } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { respond } from '../server/agent.js';
import { ollamaConverse } from '../server/ollama.js';

const label = process.argv[2] || 'current';
assert.match(label, /^[a-z0-9-]+$/);
const config = { ...readConfig(), host: '127.0.0.1', port: 0, password: '', publicOrigin: '', production: false, seed: true, mcpToken: randomBytes(32).toString('hex') };
const app = await startServer(config, { mode: 'capture', send: async () => { throw new Error('Performance checks must not deliver mail.'); } }, { frontend: false, database: ':memory:' });
const requests: { method: string; milliseconds: number }[] = [];
app.server.on('request', (request, response) => {
  if (request.url !== '/mcp') return;
  const started = performance.now(); const method = String((request as typeof request & { body?: { method?: string } }).body?.method || request.method);
  response.once('finish', () => requests.push({ method, milliseconds: Math.round(performance.now() - started) }));
});
try {
  const session = await fetch(`${app.url}/api/session`); const cookie = session.headers.get('set-cookie')!.split(';')[0];
  const repair = app.store.cases().find(item => item.reference === 'DEMO-1042')!;
  const reads: number[] = [];
  for (let index = 0; index < 20; index++) {
    const started = performance.now();
    const response = await fetch(`${app.url}/api/cases/${repair.id}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200); const result = await response.json();
    assert.equal(result.data.repairCase.id, repair.id); assert.equal(result.traces[0].ok, true);
    reads.push(Math.round(performance.now() - started));
  }
  const sorted = [...reads].sort((a, b) => a - b);
  const report: Record<string, unknown> = { label, reads, firstReadMs: reads[0], medianReadMs: sorted[10], p95ReadMs: sorted[18], mcpRequests: requests.length, methodCounts: Object.fromEntries([...new Set(requests.map(item => item.method))].map(method => [method, requests.filter(item => item.method === method).length])) };
  if (process.argv.includes('--ai')) {
    const model = ollamaConverse(config.ollamaBaseUrl, config.ollamaModel);
    const turns: { wallMs: number; inferenceMs?: number; inputTokens?: number; outputTokens?: number }[] = [];
    const started = performance.now();
    const reply = await respond({ caseId: repair.id, text: 'Prepare a request to the supplier asking for the missing estimate reference.', allowCloud: false }, { ...config, agentMode: 'ollama' }, app.mcp.call, `${app.url}/mcp`, { catalog: () => app.mcp.catalog(), converse: async (input, signal) => {
      const began = performance.now(); const result = await model(input, signal);
      turns.push({ wallMs: Math.round(performance.now() - began), inferenceMs: result.metrics?.latencyMs, inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens });
      return result;
    } });
    assert.ok(reply.draftId); assert.ok(reply.traces.some(trace => trace.tool === 'prepare_repair_request' && trace.ok));
    assert.equal(app.store.brief(repair.id).drafts[0].status, 'draft');
    report.ai = { totalMs: Math.round(performance.now() - started), turns, traces: reply.traces };
  }
  await mkdir('.data/verification', { recursive: true });
  await writeFile(`.data/verification/performance-${label}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await app.close(); }
