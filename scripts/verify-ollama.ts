import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { mcpCatalog } from '../server/mcp.js';
import type { AgentReply, Brief, RepairCase } from '../shared/types.js';

const config = { ...readConfig(), host: '127.0.0.1', port: 0, password: '', publicOrigin: '', production: false, seed: true, agentMode: 'ollama' as const, mcpToken: randomBytes(32).toString('hex') };
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  const target = String(args[0]); const started = performance.now();
  const isMcp = target.endsWith('/mcp');
  if (isMcp) console.log('Fictional MCP request:', typeof args[1]?.body === 'string' ? JSON.parse(args[1].body).method : 'transport');
  const response = await originalFetch(...args);
  if (isMcp) console.log(`Fictional MCP response: ${response.status}, ${Math.round(performance.now() - started)} ms`);
  if (target === `${config.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`) console.log(`Fictional model HTTP response: ${Math.round(performance.now() - started)} ms`);
  if (String(args[0]) === `${config.ollamaBaseUrl.replace(/\/$/, '')}/api/chat`) {
    const data = await response.clone().json() as { done?: boolean; done_reason?: string; message?: { role?: string; content?: string; tool_calls?: unknown } };
    console.log('Fictional model response:', JSON.stringify({ status: response.status, done: data.done, reason: data.done_reason, role: data.message?.role, contentCharacters: data.message?.content?.length, calls: data.message?.tool_calls }));
  }
  return response;
};
const app = await startServer(config, { mode: 'capture', send: async () => { throw new Error('Live-model verification must never deliver email.'); } }, { frontend: false, database: ':memory:' });
const results: { request: string; reply: string; durationMs: number; traces: AgentReply['traces']; draftPrepared: boolean }[] = [];
try {
  const sessionResponse = await fetch(`${app.url}/api/session`);
  const session = await sessionResponse.json() as { csrf: string };
  const cookie = sessionResponse.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
  const headers = { 'Content-Type': 'application/json', 'x-relay-csrf': session.csrf, Cookie: cookie };
  const casesResponse = await fetch(`${app.url}/api/cases`, { headers }); assert.equal(casesResponse.ok, true);
  const cases = await casesResponse.json() as RepairCase[];
  const repair = cases.find(item => item.reference === 'DEMO-1042'); assert.ok(repair);
  const wireStarted = performance.now();
  const briefResponse = await fetch(`${app.url}/api/cases/${repair.id}`, { headers, signal: AbortSignal.timeout(15000) });
  assert.equal(briefResponse.ok, true); await briefResponse.json();
  assert.equal((await mcpCatalog(`${app.url}/mcp`, config.mcpToken)).length, 6);
  console.log(`MCP read and discovery passed in ${Math.round(performance.now() - wireStarted)} ms. Model: ${config.ollamaModel}`);
  const original = app.store.brief(repair.id);
  const scenarios = ['Help me understand what is holding up this repair.', 'Prepare a request to the supplier asking for the missing estimate reference.', 'Have you sent that email?', 'Send it now', 'Record: Northbridge Mobility said by phone that the replacement part is delayed.', 'Remind me tomorrow', 'Export my case history'];
  for (const request of process.argv.includes('--draft-only') ? scenarios.slice(1, 2) : scenarios) {
    const requestedAt = Date.now(); const started = performance.now();
    console.log(`Starting: ${request}`);
    const response: Response = await fetch(`${app.url}/api/agent`, { method: 'POST', headers, body: JSON.stringify({ caseId: repair.id, text: request, allowCloud: false }), signal: AbortSignal.timeout(180000) });
    const result = await response.json() as AgentReply & { error?: string }; assert.equal(response.ok, true, result.error);
    assert.ok(result.reply.trim()); assert.ok(result.traces.every(trace => trace.ok)); assert.ok(!result.traces.some(trace => ['send_approved_request', 'record_repair_event'].includes(trace.tool)));
    if (request.startsWith('Help me')) {
      assert.ok(result.reply.startsWith(original.reportedStage)); assert.ok(result.reply.includes(original.nextStep));
      assert.match(result.reply, /user-maintained record, not an independently verified status/);
    }
    if (request.startsWith('Prepare')) {
      assert.ok(result.draftId, 'The real model must prepare a persisted draft through MCP.');
      const current = app.store.brief(repair.id); const draft = current.drafts.find(item => item.id === result.draftId); assert.ok(draft); assert.equal(draft.status, 'draft');
      assert.equal(current.contacts.find(contact => contact.id === draft.recipientId)?.role, 'supplier');
      assert.ok(draft.questionIds.every(id => ['receipt', 'paperwork'].includes(current.questions.find(question => question.id === id)?.kind ?? '')));
      assert.match(result.reply, /explicit approval/);
    }
    if (request.startsWith('Have you')) assert.match(result.reply, /awaiting approval/);
    if (request.startsWith('Record:')) assert.equal(result.action, 'record');
    if (request === 'Remind me tomorrow') {
      assert.ok(result.traces.some(trace => trace.tool === 'manage_repair_followup' && trace.ok), 'A reminder confirmation needs a successful MCP write.');
      const added: Brief['followups'] = app.store.brief(repair.id).followups.filter(item => !original.followups.some(previous => previous.id === item.id));
      assert.equal(added.length, 1); assert.equal(added[0].status, 'scheduled');
      assert.ok(Date.parse(added[0].dueAt) > requestedAt, 'Tomorrow must not become a past due item.');
      const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' });
      assert.equal(day.format(new Date(added[0].dueAt)), day.format(new Date(requestedAt + 86400000)), 'The saved date must be tomorrow in the default user timezone.');
      assert.match(result.reply, /24 hours/); assert.match(result.reply, /no message will be sent automatically/i);
    }
    if (request.startsWith('Export')) {
      const packet = result.packet; assert.ok(packet?.content);
      assert.ok(result.traces.some(trace => trace.tool === 'export_repair_packet' && trace.ok));
      if (packet.mime === 'application/json') {
        const exported = JSON.parse(packet.content); assert.equal(exported.redacted, true); assert.ok(Array.isArray(exported.events)); assert.equal(packet.filename, 'repair-history.json');
      } else {
        assert.equal(packet.mime, 'text/html'); assert.match(packet.content, /<!doctype html>/i); assert.match(packet.content, /Identity redaction enabled/); assert.equal(packet.filename, 'repair-history.html');
      }
      assert.equal(packet.content.includes(original.repairCase.person), false);
      assert.equal(packet.content.includes(original.repairCase.reference), false);
      for (const contact of original.contacts) assert.equal(packet.content.includes(contact.email), false);
    }
    results.push({ request, reply: result.reply, durationMs: Math.round(performance.now() - started), traces: result.traces, draftPrepared: !!result.draftId });
    console.log(`${request}: ${results.at(-1)!.durationMs} ms; ${result.traces.map(trace => trace.tool).join(', ')}`);
  }
  const final: Brief = app.store.brief(repair.id);
  assert.equal(final.events.length, original.events.length); assert.equal(final.followups.length, original.followups.length + (process.argv.includes('--draft-only') ? 0 : 1)); assert.ok(final.drafts.every(draft => draft.status === 'draft'));
  await mkdir('.data/verification', { recursive: true });
  const report = `.data/verification/ollama-${process.argv.includes('--draft-only') ? 'draft' : 'live'}.json`;
  await writeFile(report, JSON.stringify({ testedAt: new Date().toISOString(), model: config.ollamaModel, dataset: 'Isolated fictional in-memory fixtures; no email delivery; not user-impact validation', results }, null, 2));
  console.log(`Real Ollama + Streamable HTTP MCP verification passed. Fictional report: ${report}`);
} finally { globalThis.fetch = originalFetch; await app.close(); }
