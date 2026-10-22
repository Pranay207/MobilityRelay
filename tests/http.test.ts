import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
import { startServer } from '../server/app.js';
import type { Config } from '../server/config.js';
import type { AgentReply, Brief, ChatMessage, Draft } from '../shared/types.js';

const config: Config = { host: '127.0.0.1', port: 0, dataDir: '.data/test', password: '', mcpToken: 'test-token-'.repeat(8), publicOrigin: '', production: false, seed: true, agentMode: 'local', modelId: '', region: 'us-east-1', ollamaBaseUrl: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b' };
test('real HTTP MCP and browser-host workflows enforce permissions end to end', async () => {
  let deliveries = 0;
  const running = await startServer(config, { mode: 'capture', send: async () => { deliveries++; return 'captured-test'; } }, { frontend: false, database: ':memory:' });
  const connections: string[] = [];
  running.server.on('request', request => { if (request.url === '/mcp') connections.push(request.headers.connection ?? ''); });
  const headers = { Authorization: `Bearer ${config.mcpToken}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  const request = (path: string, opts: RequestInit = {}) => fetch(`${running.url}${path}`, opts);
  try {
    assert.equal((await request('/api/cases')).status, 401);
    assert.equal((await request('/mcp', { method: 'POST', headers: { ...headers, Origin: 'https://malicious.example' }, body: '{}' })).status, 403);
    assert.equal((await request('/mcp', { method: 'POST', headers: { ...headers, Authorization: 'Bearer invalid' }, body: '{}' })).status, 401);
    assert.equal((await request('/mcp', { headers })).status, 405);
    const init = await request('/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'regression-client', version: '1' } } }) });
    assert.equal(init.status, 200); const initBody = await init.text();
    assert.equal(init.headers.get('transfer-encoding'), 'chunked');
    assert.equal(init.headers.get('content-length'), null);
    assert.equal(JSON.parse(initBody).result.protocolVersion, '2025-11-25');
    const catalog = await request('/mcp', { method: 'POST', headers: { ...headers, 'MCP-Protocol-Version': '2025-11-25' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
    assert.equal(catalog.status, 200); assert.equal((await catalog.json()).result.tools.length, 6);
    const session = await request('/api/session'); const { csrf } = await session.json(); const cookie = session.headers.get('set-cookie')!.split(';')[0];
    const hostHeaders = { 'Content-Type': 'application/json', Cookie: cookie, 'X-Relay-CSRF': csrf };
    const cases = await (await request('/api/cases', { headers: hostHeaders })).json();
    assert.equal(cases.length, 5); const c = cases.find((c: { reference: string }) => c.reference === 'DEMO-1042');
    connections.length = 0;
    const briefResult = await (await request(`/api/cases/${c.id}`, { headers: hostHeaders })).json(); const brief = briefResult.data as Brief;
    assert.equal(briefResult.traces[0].tool, 'get_repair_brief'); assert.equal(briefResult.traces[0].ok, true);
    assert.ok(connections.length >= 3); assert.ok(connections.every(value => value === 'close'));
    connections.length = 0;
    const again = await (await request(`/api/cases/${c.id}`, { headers: hostHeaders })).json();
    assert.equal(again.data.repairCase.id, c.id);
    assert.equal(connections.length, 1, 'A subsequent read must call the real tool without repeating initialization/discovery.');
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

for (const mode of ['local', 'bedrock', 'ollama'] as const) test(`${mode} HTTP case commands work without inference while cloud requests still require consent`, async () => {
  const running = await startServer({ ...config, agentMode: mode, ollamaBaseUrl: 'http://127.0.0.1:1' }, { mode: 'capture', send: async () => { throw new Error('Case command checks must not send.'); } }, { frontend: false, database: ':memory:' });
  try {
    const session = await fetch(`${running.url}/api/session`); const { csrf } = await session.json();
    const headers = { 'Content-Type': 'application/json', Cookie: session.headers.get('set-cookie')!.split(';')[0], 'x-relay-csrf': csrf };
    const repair = running.store.cases().find(item => item.reference === 'DEMO-1042')!; const before = running.store.brief(repair.id);
    const ask = (text: string) => fetch(`${running.url}/api/agent`, { method: 'POST', headers, body: JSON.stringify({ caseId: repair.id, text, allowCloud: false }), signal: AbortSignal.timeout(15000) });
    for (const text of ['What is the next step?', 'Help me understand what is holding up this repair.', 'Export my case history']) {
      const response = await ask(text); assert.equal(response.status, 200);
      const reply = await response.json() as AgentReply; assert.ok(reply.traces.every(trace => trace.ok));
      if (text.startsWith('Export')) {
        assert.ok(reply.packet); assert.equal(reply.packet.mime, 'text/html'); assert.equal(reply.packet.content.includes(repair.person), false);
        assert.deepEqual(reply.traces.map(trace => trace.tool), ['get_repair_brief', 'export_repair_packet']);
      } else { assert.ok(reply.reply.startsWith(before.reportedStage)); assert.deepEqual(reply.traces.map(trace => trace.tool), ['get_repair_brief']); }
    }
    if (mode === 'bedrock') for (const text of ['Why is that?', 'Show my case status and remind me tomorrow', 'Export my case history as JSON', 'Prepare a request to the supplier']) {
      const response = await ask(text); assert.equal(response.status, 403); assert.match((await response.json()).error, /Consent/);
    }
    const reports = await ask('Compare the supplier and insurer reports'); assert.equal(reports.status, 200);
    const comparison = await reports.json() as AgentReply;
    assert.ok(comparison.spokenText); assert.ok(comparison.spokenText.length < comparison.reply.length);
    const history = await (await fetch(`${running.url}/api/cases/${repair.id}/chat`, { headers })).json() as ChatMessage[];
    assert.equal(history.at(-1)?.text, comparison.reply); assert.equal(history.at(-1)?.spokenText, comparison.spokenText);
    assert.deepEqual(running.store.brief(repair.id), before);
  } finally { await running.close(); }
});

test('concurrent host reads share MCP discovery but never cache case data', async () => {
  const running = await startServer(config, { mode: 'capture', send: async () => { throw new Error('Read checks must not send.'); } }, { frontend: false, database: ':memory:' });
  const methods: string[] = [];
  running.server.on('request', request => {
    if (request.url !== '/mcp' || request.method !== 'POST') return;
    let body = ''; request.on('data', chunk => { body += String(chunk); });
    request.once('end', () => { methods.push(JSON.parse(body).method); });
  });
  try {
    const repair = running.store.cases()[0];
    const pending = Array.from({ length: 5 }, () => running.mcp.call<Brief>('get_repair_brief', { caseId: repair.id }));
    for (const read of pending) assert.equal((await read).repairCase.id, repair.id);
    assert.equal(methods.filter(method => method === 'initialize').length, 1);
    assert.equal(methods.filter(method => method === 'tools/list').length, 1);
    assert.equal(methods.filter(method => method === 'tools/call').length, 5);
    const before = running.store.brief(repair.id).events.length;
    await running.mcp.call('record_repair_event', { caseId: repair.id, requestId: randomUUID(), party: 'user', source: 'Fictional performance regression', channel: 'Personal note', occurredAt: new Date().toISOString(), text: 'A new attributed update.', stage: 'other', reference: '', supersedesId: null });
    const refreshed = await running.mcp.call<Brief>('get_repair_brief', { caseId: repair.id });
    assert.equal(refreshed.events.length, before + 1);
    assert.equal(methods.filter(method => method === 'initialize').length, 1);
    assert.equal(methods.filter(method => method === 'tools/list').length, 1);
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

for (const host of ['localhost', '::1']) test(`${host} binding uses a reachable loopback origin for internal MCP`, async () => {
  const running = await startServer({ ...config, host }, { mode: 'capture', send: async () => '' }, { frontend: false, database: ':memory:' });
  try {
    const session = await fetch(`${running.url}/api/session`, { signal: AbortSignal.timeout(10000) });
    const cookie = session.headers.get('set-cookie')!.split(';')[0]; const headers = { Cookie: cookie };
    const cases = await (await fetch(`${running.url}/api/cases`, { headers })).json();
    const response = await fetch(`${running.url}/api/cases/${cases[0].id}`, { headers, signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200); assert.equal((await response.json()).traces[0].ok, true);
  } finally { await running.close(); }
});

test('authenticated MCP reads survive a small concurrent burst without changing case state', { timeout: 60000 }, async context => {
  const running = await startServer(config, { mode: 'capture', send: async () => { throw new Error('Read checks must not send.'); } }, { frontend: false, database: ':memory:' });
  try {
    const session = await fetch(`${running.url}/api/session`); const headers = { Cookie: session.headers.get('set-cookie')!.split(';')[0] };
    const repair = running.store.cases()[0]; const before = running.store.brief(repair.id); const timings: number[] = [];
    for (let batch = 0; batch < 5; batch++) {
      await Promise.all(Array.from({ length: 5 }, async () => {
        const started = performance.now();
        const response = await fetch(`${running.url}/api/cases/${repair.id}`, { headers, signal: AbortSignal.timeout(15000) });
        assert.equal(response.status, 200); const result = await response.json();
        assert.equal(result.data.repairCase.id, repair.id); assert.equal(result.traces[0].ok, true);
        timings.push(performance.now() - started);
      }));
    }
    const after = running.store.brief(repair.id);
    assert.deepEqual(after, before); timings.sort((a, b) => a - b);
    context.diagnostic(`25 local HTTP-to-MCP reads, concurrency 5: median ${Math.round(timings[12])} ms, p95 ${Math.round(timings[23])} ms; not a production or native Alexa latency benchmark.`);
  } finally { await running.close(); }
});

test('login rate limiting and logout invalidate access without trusting forwarded addresses', async () => {
  const password = 'fictional-auth-qa-password';
  const running = await startServer({ ...config, password, seed: false }, { mode: 'capture', send: async () => '' }, { frontend: false, database: ':memory:' });
  try {
    const post = (body: object, forwarded = '') => fetch(`${running.url}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwarded }, body: JSON.stringify(body) });
    const login = await post({ password }); assert.equal(login.status, 200); const { csrf } = await login.json();
    const headers = { Cookie: login.headers.get('set-cookie')!.split(';')[0], 'X-Relay-CSRF': csrf };
    assert.equal((await fetch(`${running.url}/api/cases`, { headers })).status, 200);
    assert.equal((await fetch(`${running.url}/api/logout`, { method: 'POST', headers })).status, 200);
    assert.equal((await fetch(`${running.url}/api/cases`, { headers })).status, 401);
    for (let attempt = 0; attempt < 10; attempt++) assert.equal((await post({ password: 'wrong' }, `192.0.2.${attempt + 1}`)).status, 401);
    assert.equal((await post({ password }, '192.0.2.250')).status, 429);
  } finally { await running.close(); }
});

test('all MCP response paths use consistent parseable wire framing', { timeout: 30000 }, async () => {
  const running = await startServer({ ...config, seed: false }, { mode: 'capture', send: async () => { throw new Error('Wire checks must not send.'); } }, { frontend: false, database: ':memory:' });
  const initialize = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fictional-framing-check', version: '1' } } });
  const scenarios: { name: string; method: string; body?: string; headers?: Record<string, string>; status: number }[] = [
    { name: 'initialize', method: 'POST', body: initialize, status: 200 },
    { name: 'notification', method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), status: 202 },
    { name: 'optional SSE unavailable', method: 'GET', status: 405 },
    { name: 'unauthorized', method: 'POST', body: initialize, headers: { Authorization: 'Bearer invalid' }, status: 401 },
    { name: 'blocked origin', method: 'POST', body: initialize, headers: { Origin: 'https://untrusted.example' }, status: 403 },
    { name: 'malformed JSON', method: 'POST', body: '{', status: 400 },
  ];
  try {
    for (const scenario of scenarios) {
      const result = await new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
        const request = httpRequest(`${running.url}/mcp`, { method: scenario.method, agent: false, headers: { Authorization: `Bearer ${config.mcpToken}`, Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json', ...scenario.headers } }, response => {
          const chunks: Buffer[] = []; response.on('data', chunk => chunks.push(chunk)); response.on('error', reject);
          response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }));
        });
        request.setTimeout(5000, () => request.destroy(new Error(`Wire response timed out: ${scenario.name}`))); request.on('error', reject); request.end(scenario.body);
      });
      assert.equal(result.status, scenario.status, scenario.name); assert.equal(result.headers['transfer-encoding'], 'chunked'); assert.equal(result.headers['content-length'], undefined);
      if (scenario.status === 202) assert.equal(result.body, '');
      else assert.ok(JSON.parse(result.body));
    }
  } finally { await running.close(); }
});
