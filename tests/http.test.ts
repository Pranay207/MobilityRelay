import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { startServer } from '../server/app.js';
import type { Config } from '../server/config.js';
import type { Brief, Draft } from '../shared/types.js';

const config: Config = { host: '127.0.0.1', port: 0, dataDir: '.data/test', password: '', mcpToken: 'test-token-'.repeat(8), publicOrigin: '', production: false, seed: true, agentMode: 'local', modelId: '', region: 'us-east-1' };
test('real HTTP MCP and browser-host workflows enforce permissions end to end', async () => {
  let deliveries = 0;
  const running = await startServer(config, { mode: 'capture', send: async () => { deliveries++; return 'captured-test'; } }, { frontend: false, database: ':memory:' });
  const headers = { Authorization: `Bearer ${config.mcpToken}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const request = (path: string, opts: RequestInit = {}) => fetch(`${running.url}${path}`, opts);
  try {
    assert.equal((await request('/api/cases')).status, 401);
    assert.equal((await request('/mcp', { method: 'POST', headers: { ...headers, Origin: 'https://malicious.example' }, body: '{}' })).status, 403);
    assert.equal((await request('/mcp', { method: 'POST', headers: { ...headers, Authorization: 'Bearer invalid' }, body: '{}' })).status, 401);
    assert.equal((await request('/mcp', { headers })).status, 405);
    const init = await request('/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'regression-client', version: '1' } } }) });
    assert.equal(init.status, 200); assert.equal((await init.json()).result.protocolVersion, '2025-11-25');
    const catalog = await request('/mcp', { method: 'POST', headers: { ...headers, 'MCP-Protocol-Version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
    assert.equal(catalog.status, 200); assert.equal((await catalog.json()).result.tools.length, 6);
    const session = await request('/api/session'); const { csrf } = await session.json(); const cookie = session.headers.get('set-cookie')!.split(';')[0];
    const hostHeaders = { 'Content-Type': 'application/json', Cookie: cookie, 'X-Relay-CSRF': csrf };
    const cases = await (await request('/api/cases', { headers: hostHeaders })).json();
    assert.equal(cases.length, 5); const c = cases.find((c: { reference: string }) => c.reference === 'DEMO-1042');
    const briefResult = await (await request(`/api/cases/${c.id}`, { headers: hostHeaders })).json(); const brief = briefResult.data as Brief;
    assert.equal(briefResult.traces[0].tool, 'get_repair_brief'); assert.equal(briefResult.traces[0].ok, true);
    assert.equal((await request('/api/action', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal((await request('/api/action', { method: 'POST', headers: hostHeaders, body: JSON.stringify({ tool: 'send_approved_request', args: {} }) })).status, 400);
    const draftResult = await request('/api/action', { method: 'POST', headers: hostHeaders, body: JSON.stringify({ tool: 'prepare_repair_request', args: { caseId: c.id, requestId: randomUUID(), recipientId: brief.contacts[0].id, questionIds: brief.questions.map(q => q.id) } }) });
    assert.equal(draftResult.status, 200); const draft = (await draftResult.json()).data as Draft;
    assert.equal(deliveries, 0);
    const falseApproval = await request(`/api/drafts/${draft.id}/send`, { method: 'POST', headers: hostHeaders, body: JSON.stringify({ caseId: c.id, expectedHash: draft.hash, confirmed: false }) }); assert.equal(falseApproval.status, 400);
    const sent = await request(`/api/drafts/${draft.id}/send`, { method: 'POST', headers: hostHeaders, body: JSON.stringify({ caseId: c.id, expectedHash: draft.hash, confirmed: true }) }); assert.equal(sent.status, 200); assert.equal((await sent.json()).data.status, 'captured'); assert.equal(deliveries, 1);
    const replay = await request(`/api/drafts/${draft.id}/send`, { method: 'POST', headers: hostHeaders, body: JSON.stringify({ caseId: c.id, expectedHash: draft.hash, confirmed: true }) }); assert.equal(replay.status, 409); assert.equal(deliveries, 1);
    const agent = await request('/api/agent', { method: 'POST', headers: hostHeaders, body: JSON.stringify({ caseId: c.id, text: 'Remind me tomorrow' }) }); assert.equal(agent.status, 200); assert.ok((await agent.json()).traces.some((t: { tool: string }) => t.tool === 'manage_repair_followup'));
    const exportResult = await request('/api/action', { method: 'POST', headers: hostHeaders, body: JSON.stringify({ tool: 'export_repair_packet', args: { caseId: c.id, format: 'json', redact: true } }) }); assert.equal(exportResult.status, 200); assert.ok(!(await exportResult.json()).data.content.includes('Maya'));
    const chat = await (await request(`/api/cases/${c.id}/chat`, { headers: hostHeaders })).json(); assert.equal(chat.length, 2);
  } finally { await running.close(); }
});
test('password sessions do not auto-login and reject invalid credentials', async () => {
  const running = await startServer({ ...config, password: 'test-only-password-12345', seed: false }, { mode: 'capture', send: async () => '' }, { frontend: false, database: ':memory:' });
  try {
    const session = await fetch(`${running.url}/api/session`); assert.equal((await session.json()).authenticated, false);
    const wrong = await fetch(`${running.url}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'wrong' }) }); assert.equal(wrong.status, 401);
    const login = await fetch(`${running.url}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-only-password-12345' }) }); assert.equal(login.status, 200); assert.ok(login.headers.get('set-cookie')?.includes('HttpOnly'));
  } finally { await running.close(); }
});
