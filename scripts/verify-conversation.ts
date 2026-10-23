import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../server/app.js';
import { readConfig } from '../server/config.js';
import type { AgentReply } from '../shared/types.js';

const config = { ...readConfig(), host: '127.0.0.1', port: 0, password: '', publicOrigin: '', production: false, seed: true, agentMode: 'ollama' as const, mcpToken: randomBytes(32).toString('hex') };
const originalFetch = globalThis.fetch;
const modelCalls: { durationMs: number; status: number; selection: string; tools: string[] }[] = [];
globalThis.fetch = async (...args: Parameters<typeof fetch>) => {
  const started = performance.now(); const response = await originalFetch(...args);
  if (String(args[0]) === `${config.ollamaBaseUrl}/api/chat`) {
    const data = await response.clone().json() as { message?: { content?: string; tool_calls?: { function: { name: string } }[] } };
    modelCalls.push({ durationMs: Math.round(performance.now() - started), status: response.status, selection: data.message?.content?.slice(0, 1000) ?? '', tools: data.message?.tool_calls?.map(call => call.function.name) ?? [] });
  }
  return response;
};
const app = await startServer(config, { mode: 'capture', send: async () => { throw new Error('Fictional conversation verification must never deliver email.'); } }, { frontend: false, database: ':memory:' });
const results: { request: string; passed: boolean; durationMs: number; modelCalls: number; reply: string; traces: AgentReply['traces']; error?: string }[] = [];
let passed = false;
try {
  const sessionResponse = await fetch(`${app.url}/api/session`); const { csrf } = await sessionResponse.json();
  const headers = { 'Content-Type': 'application/json', 'x-relay-csrf': csrf, Cookie: sessionResponse.headers.get('set-cookie')!.split(';')[0] };
  const repair = app.store.cases().find(item => item.reference === 'DEMO-1042')!;
  const before = app.store.brief(repair.id);
  const scenarios: { text: string; model: boolean; verify: (result: AgentReply) => void }[] = [
    { text: 'Put the accounts from the two organizations side by side.', model: true, verify: result => { assert.equal(result.focus?.view, 'comparison'); assert.match(result.reply, /Latest supplier report/); assert.match(result.reply, /Latest insurer report/); } },
    { text: 'Ask the supplier for that reference.', model: false, verify: result => { assert.ok(result.draftId); const draft = app.store.brief(repair.id).drafts.find(item => item.id === result.draftId)!; assert.equal(draft.status, 'draft'); assert.deepEqual(draft.questionIds, [before.questions.find(item => item.kind === 'receipt')!.id]); } },
    { text: 'Could you explain why that submission number is useful?', model: true, verify: result => { assert.equal(result.focus?.view, 'question'); assert.equal(result.focus.questionId, before.questions.find(item => item.kind === 'receipt')!.id); assert.match(result.reply, /Sent and received are different steps/); } },
    { text: 'Which information are we still waiting for before authorization?', model: true, verify: result => { assert.equal(result.focus?.view, 'question'); assert.equal(result.focus.questionId, before.questions.find(item => item.kind === 'approval')!.id); } },
    { text: 'Will the insurer approve my repair next week?', model: false, verify: result => { assert.match(result.reply, /cannot predict approval/); assert.equal(result.focus, undefined); } },
    { text: 'Why is my repair stuck?', model: false, verify: result => { assert.equal(result.focus?.view, 'next_step'); assert.match(result.reply, /user-maintained record/); } },
    { text: 'Export my case history', model: false, verify: result => { assert.ok(result.packet); assert.ok(result.packet.content.includes('Identity redaction enabled')); assert.equal(result.packet.content.includes(repair.person), false); } },
  ];
  for (const scenario of scenarios) {
    const started = performance.now(); const count = modelCalls.length;
    console.log(`Fictional conversation: ${scenario.text}`);
    const response = await fetch(`${app.url}/api/agent`, { method: 'POST', headers, body: JSON.stringify({ caseId: repair.id, text: scenario.text, allowCloud: false }), signal: AbortSignal.timeout(180000) });
    const result = await response.json() as AgentReply & { error?: string };
    const item = { request: scenario.text, passed: false, durationMs: Math.round(performance.now() - started), modelCalls: modelCalls.length - count, reply: result.reply ?? '', traces: result.traces ?? [], error: result.error };
    results.push(item);
    assert.equal(response.ok, true, result.error);
    assert.ok(result.traces.every(trace => trace.ok)); assert.ok(!result.traces.some(trace => ['send_approved_request', 'record_repair_event', 'manage_repair_followup'].includes(trace.tool)));
    scenario.verify(result); assert.equal(item.modelCalls > 0, scenario.model); item.passed = true;
    console.log(`Passed in ${item.durationMs} ms; ${item.modelCalls} real model request(s); ${result.traces.map(trace => trace.tool).join(', ')}`);
  }
  const after = app.store.brief(repair.id);
  assert.equal(after.events.length, before.events.length); assert.equal(after.followups.length, before.followups.length);
  assert.equal(after.drafts.length, 1); assert.equal(after.drafts[0].status, 'draft'); passed = true;
} finally {
  globalThis.fetch = originalFetch; await app.close();
  await mkdir('.data/verification', { recursive: true });
  const path = `.data/verification/conversation-${config.ollamaModel.replace(/[^a-zA-Z0-9._-]/g, '-')}-${Date.now()}.json`;
  await writeFile(path, JSON.stringify({ testedAt: new Date().toISOString(), model: config.ollamaModel, passed, dataset: 'Isolated fictional case with real local Ollama inference and Streamable HTTP MCP; not independent user feedback or physical speech verification', emailsDelivered: 0, modelCalls, results }, null, 2));
  console.log(`Conversation verification ${passed ? 'passed' : 'incomplete or failed'}: ${path}`);
}
