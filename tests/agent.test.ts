import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ConverseCommandOutput, Message } from '@aws-sdk/client-bedrock-runtime';
import { respond, type AgentDependencies } from '../server/agent.js';
import { localIntent, proposeUpdate, proposesTomorrow } from '../server/intents.js';
import { Store, AppError } from '../server/store.js';
import { RepairService } from '../server/service.js';
import type { Config } from '../server/config.js';
import type { ToolCaller } from '../server/mcp.js';
import type { ToolName } from '../server/schemas.js';
import type { Draft, Followup, ToolTrace } from '../shared/types.js';

const config: Config = { host: '127.0.0.1', port: 0, dataDir: '.data/test', password: '', mcpToken: 'test-only', publicOrigin: '', production: false, seed: false, agentMode: 'local', modelId: 'test-model', region: 'us-east-1' };

function setup() {
  const store = new Store(':memory:');
  const c = store.createCase({ title: 'Test repair', person: 'Test person', equipment: 'Chair', reference: 'TEST-101', category: 'Parts delay', fictional: true });
  const contact = store.saveContact({ caseId: c.id, name: 'Test Mobility', role: 'supplier', email: 'test@supplier.example', verified: false });
  store.recordEvent({ caseId: c.id, requestId: randomUUID(), party: 'supplier', source: 'Test Mobility', channel: 'Email', text: 'The part is delayed.', stage: 'parts_delayed', occurredAt: new Date(Date.now() - 60000).toISOString(), reference: '', supersedesId: null });
  const service = new RepairService(store, { mode: 'capture', send: async () => { throw new Error('Assistant must not send.'); } });
  const call: ToolCaller = async <T>(name: ToolName, args: Record<string, unknown>, traces: ToolTrace[] = []) => {
    let ok = false;
    try { const data = await service.run(name, args); ok = true; return data as T; }
    finally { traces.push({ tool: name, durationMs: 0, ok }); }
  };
  const local = (text: string) => respond({ caseId: c.id, text, allowCloud: false }, config, call, 'http://unused.test/mcp');
  const catalog: NonNullable<AgentDependencies['catalog']> = async () => ['get_repair_brief', 'prepare_repair_request', 'manage_repair_followup', 'export_repair_packet', 'send_approved_request', 'record_repair_event'].map(name => ({ name, inputSchema: { type: 'object' as const, properties: {}, required: [] } }));
  const cloud = (converse: NonNullable<AgentDependencies['converse']>, allowCloud = true, text = 'Prepare a request to the supplier') => respond({ caseId: c.id, text, allowCloud }, { ...config, agentMode: 'bedrock' }, call, 'http://unused.test/mcp', { converse, catalog });
  return { store, c, contact, call, local, cloud, catalog };
}

const output = (content: NonNullable<Message['content']>): ConverseCommandOutput => ({ $metadata: {}, output: { message: { role: 'assistant', content } }, stopReason: content.some(block => block.toolUse) ? 'tool_use' : 'end_turn', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 } });

test('questions and negative commands never become local writes', async () => {
  const s = setup();
  try {
    for (const text of ['What reminders are due tomorrow?', 'What did my insurer request?', 'How can my advocate get the history?', "Don't remind me tomorrow", 'Please do not prepare a request', 'Please could you not schedule a reminder', 'Could you show my repair status?']) {
      const reply = await s.local(text);
      assert.deepEqual(reply.traces.map(t => t.tool), ['get_repair_brief']); assert.equal(reply.action, undefined);
    }
    assert.equal(s.store.list<Followup>('followup', s.c.id).length, 0); assert.equal(s.store.list<Draft>('draft', s.c.id).length, 0);
  } finally { s.store.close(); }
});

test('only explicit supported reminder wording creates a due item', async () => {
  const s = setup();
  try {
    for (const text of ['Remind me Friday, not tomorrow', 'Remind me tomorrow or next week', 'Remind me to call the supplier tomorrow']) {
      assert.equal(proposesTomorrow(text), false); await s.local(text);
    }
    assert.equal(s.store.list<Followup>('followup', s.c.id).length, 0);
    const reply = await s.local('Relay, please remind me tomorrow.');
    assert.match(reply.reply, /24 hours/); assert.equal(s.store.list<Followup>('followup', s.c.id).length, 1);
  } finally { s.store.close(); }
});

test('source-backed voice proposals preserve wording and require a form, not a write', async () => {
  const s = setup();
  try {
    const text = 'Test Mobility said by phone that the replacement part is delayed.';
    const reply = await s.local(`Record: ${text}`);
    assert.equal(reply.action, 'record'); assert.equal(reply.update?.text, text);
    assert.equal(reply.update?.source, 'Test Mobility'); assert.equal(reply.update?.party, 'supplier');
    assert.equal(reply.update?.channel, 'Phone'); assert.equal(reply.update?.stage, 'parts_delayed');
    assert.equal(s.store.brief(s.c.id).events.length, 1); assert.deepEqual(reply.traces.map(t => t.tool), ['get_repair_brief']);
  } finally { s.store.close(); }
});

test('ambiguous or negated reports do not acquire confident stage or source hints', () => {
  const s = setup();
  try {
    const brief = s.store.brief(s.c.id);
    assert.equal(proposeUpdate('Record: The supplier says the part is not delayed.', brief).stage, undefined);
    assert.equal(proposeUpdate('Record: No part is delayed.', brief).stage, undefined);
    assert.equal(proposeUpdate('Record: The part is delayed and I need a loaner.', brief).stage, undefined);
    const ambiguous = proposeUpdate('Record: The supplier and insurer gave different answers.', brief);
    assert.equal(ambiguous.party, undefined); assert.equal(ambiguous.source, undefined);
    assert.equal(localIntent('What was recorded yesterday?'), 'read');
  } finally { s.store.close(); }
});

test('missing question or ambiguous recipient does not produce a guessed draft', async () => {
  const s = setup();
  try {
    const missing = await s.local('Prepare a request about a loaner'); assert.match(missing.reply, /no matching/i);
    assert.equal(s.store.list<Draft>('draft', s.c.id).length, 0);
    s.store.saveContact({ caseId: s.c.id, name: 'Other supplier', role: 'supplier', email: 'other@supplier.example', verified: false });
    const ambiguous = await s.local('Prepare a request to the supplier'); assert.equal(ambiguous.action, 'prepare');
    assert.equal(s.store.list<Draft>('draft', s.c.id).length, 0);
  } finally { s.store.close(); }
});

test('Bedrock consent is required before any model request', async () => {
  const s = setup(); let requests = 0;
  try { await assert.rejects(s.cloud(async () => { requests++; return output([{ text: 'unused' }]); }, false), /Consent/); assert.equal(requests, 0); }
  finally { s.store.close(); }
});

test('Bedrock cannot access record/send tools or escape the host-selected case', async () => {
  const s = setup(); let turn = 0;
  try {
    const reply = await s.cloud(async request => {
      assert.ok(!request.toolConfig?.tools?.some(t => ['send_approved_request', 'record_repair_event'].includes(t.toolSpec?.name ?? '')));
      if (++turn === 1) return output([
        { toolUse: { toolUseId: 'unsafe-send', name: 'send_approved_request', input: {} } },
        { toolUse: { toolUseId: 'draft', name: 'prepare_repair_request', input: { caseId: randomUUID(), recipientId: s.contact.id, questionIds: [s.store.brief(s.c.id).questions[0].id] } } },
      ]);
      return output([{ text: 'A draft is ready for review. Nothing was sent.' }]);
    });
    assert.equal(s.store.get<Draft>('draft', reply.draftId!, s.c.id).caseId, s.c.id);
    assert.ok(!reply.traces.some(t => t.tool === 'send_approved_request')); assert.equal(s.store.list<Draft>('draft', s.c.id)[0].status, 'draft');
  } finally { s.store.close(); }
});

test('a recognized cloud read request cannot create a model-requested reminder', async () => {
  const s = setup(); let turn = 0;
  try {
    await respond({ caseId: s.c.id, text: 'What reminders are due tomorrow?', allowCloud: true }, { ...config, agentMode: 'bedrock' }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async request => {
      assert.deepEqual(request.toolConfig?.tools?.map(t => t.toolSpec?.name), ['get_repair_brief']);
      return ++turn === 1 ? output([{ toolUse: { toolUseId: 'unrequested-write', name: 'manage_repair_followup', input: { action: 'create', title: 'Should not be saved', dueAt: new Date(Date.now() + 86400000).toISOString() } } }]) : output([{ text: 'No new reminder was created.' }]);
    } });
    assert.equal(s.store.list<Followup>('followup', s.c.id).length, 0);
  } finally { s.store.close(); }
});

test('repeated equivalent model writes reuse one idempotency key', async () => {
  const s = setup(); let turn = 0;
  try {
    await s.cloud(async () => {
      if (++turn > 1) return output([{ text: 'Reminder saved.' }]);
      const dueAt = new Date(Date.now() + 86400000).toISOString();
      return output([
        { toolUse: { toolUseId: 'first', name: 'manage_repair_followup', input: { title: 'Ask for an ETA', dueAt, action: 'create', timezone: 'Asia/Kolkata' } } },
        { toolUse: { toolUseId: 'second', name: 'manage_repair_followup', input: { action: 'create', timezone: 'Asia/Kolkata', dueAt, title: 'Ask for an ETA' } } },
      ]);
    }, true, 'Remind me tomorrow');
    assert.equal(s.store.list<Followup>('followup', s.c.id).length, 1);
  } finally { s.store.close(); }
});

test('cloud failure after a saved draft returns its review handle and successful trace', async () => {
  const s = setup(); let turn = 0;
  try {
    const reply = await s.cloud(async () => {
      if (++turn > 1) throw new Error('Simulated cloud timeout');
      return output([{ toolUse: { toolUseId: 'draft', name: 'prepare_repair_request', input: { recipientId: s.contact.id, questionIds: [s.store.brief(s.c.id).questions[0].id] } } }]);
    });
    assert.match(reply.reply, /stopped before completing/); assert.ok(reply.draftId);
    assert.equal(s.store.get<Draft>('draft', reply.draftId!, s.c.id).status, 'draft');
    assert.ok(reply.traces.some(t => t.ok && t.tool === 'prepare_repair_request'));
  } finally { s.store.close(); }
});

test('initial cloud failure is sanitized and does not silently switch to local success', async () => {
  const s = setup();
  try {
    await assert.rejects(s.cloud(async () => { throw new Error('PRIVATE provider diagnostics'); }), (error: unknown) => error instanceof AppError && error.status === 502 && !error.message.includes('PRIVATE'));
    assert.equal(s.store.list<Draft>('draft', s.c.id).length, 0);
  } finally { s.store.close(); }
});

test('model tool batches are capped at eight attempted calls', async () => {
  const s = setup(); let turn = 0;
  try {
    const reply = await s.cloud(async () => ++turn === 1 ? output(Array.from({ length: 12 }, (_, i) => ({ toolUse: { toolUseId: `read-${i}`, name: 'get_repair_brief', input: {} } }))) : output([{ text: 'Review complete.' }]));
    assert.equal(reply.traces.filter(t => t.tool === 'get_repair_brief').length, 9);
  } finally { s.store.close(); }
});

test('an empty model reply is a recoverable failure, not a blank success', async () => {
  const s = setup();
  try { await assert.rejects(s.cloud(async () => output([])), (error: unknown) => error instanceof AppError && error.status === 502); }
  finally { s.store.close(); }
});
