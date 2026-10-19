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
  if (process.argv.includes('--commands')) {
    const model = ollamaConverse(config.ollamaBaseUrl, config.ollamaModel);
    const before = app.store.brief(repair.id);
    const commands: { text: string; milliseconds: number; modelCalls: number; traces: Awaited<ReturnType<typeof respond>>['traces'] }[] = [];
    for (let run = 0; run < 2; run++) {
      for (const text of ['Show my case status', 'What is the next step?', 'Help me understand what is holding up this repair.', 'Export my case history']) {
        let modelCalls = 0; const started = performance.now();
        const reply = await respond({ caseId: repair.id, text, allowCloud: false }, { ...config, agentMode: 'ollama' }, app.mcp.call, `${app.url}/mcp`, { catalog: () => app.mcp.catalog(), converse: async (input, signal) => { modelCalls++; return model(input, signal); } });
        const elapsed = Math.round(performance.now() - started);
        assert.ok(reply.traces.every(trace => trace.ok));
        if (!text.startsWith('Export')) { assert.ok(reply.reply.startsWith(before.reportedStage)); assert.deepEqual(reply.traces.map(trace => trace.tool), ['get_repair_brief']); }
        else {
          assert.ok(reply.packet); assert.equal(reply.packet.content.includes(before.repairCase.person), false);
          assert.ok(reply.traces.some(trace => trace.ok && trace.tool === 'export_repair_packet'));
        }
        if (process.argv.includes('--expect-direct')) assert.equal(modelCalls, 0, 'Recognized commands must not wait for inference.');
        commands.push({ text, milliseconds: elapsed, modelCalls, traces: reply.traces });
        console.log(`${text}: ${elapsed} ms, ${modelCalls} model calls`);
      }
    }
    assert.deepEqual(app.store.brief(repair.id), before, 'Read/export commands must not change the case.');
    report.commands = commands;
    report.commandSetup = { model: config.ollamaModel, dataset: 'Fictional in-memory case; warmed MCP connection; two spot checks per command, not a latency guarantee.' };
  }
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
