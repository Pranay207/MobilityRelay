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

const config: Config = { host: '127.0.0.1', port: 0, dataDir: '.data/test', password: '', mcpToken: 'test-only', publicOrigin: '', production: false, seed: false, agentMode: 'local', modelId: 'test-model', region: 'us-east-1', ollamaBaseUrl: 'http://127.0.0.1:11434', ollamaModel: 'qwen3:4b' };

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

for (const mode of ['local', 'bedrock', 'ollama'] as const) test(`${mode} answers delivery-status questions from MCP state without AI guesses`, async () => {
  const s = setup();
  try {
    const draft = await s.call<Draft>('prepare_repair_request', { caseId: s.c.id, requestId: randomUUID(), recipientId: s.contact.id, questionIds: [s.store.brief(s.c.id).questions[0].id] });
    const ask = () => respond({ caseId: s.c.id, text: 'Have you sent that email?', allowCloud: true }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { converse: async () => { throw new Error('Delivery status must not be delegated to AI.'); } });
    assert.match((await ask()).reply, /1 awaiting approval/);
    for (const [status, expected] of [['captured', /captured locally, not delivered/], ['sent', /SMTP accepted, receipt unconfirmed/], ['unknown', /delivery outcome unknown/]] as const) {
      s.store.put('draft', { ...draft, status }); const result = await ask(); assert.match(result.reply, expected); assert.deepEqual(result.traces.map(trace => trace.tool), ['get_repair_brief']);
    }
  } finally { s.store.close(); }
});

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

for (const mode of ['local', 'bedrock', 'ollama'] as const) test(`${mode} schedules an explicit tomorrow reminder through MCP without model date guesses`, async () => {
  const s = setup();
  try {
    const before = Date.now();
    const reply = await respond({ caseId: s.c.id, text: 'Relay, please remind me tomorrow.', allowCloud: false }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', {
      catalog: async () => { throw new Error('A recognized tomorrow command does not need model discovery.'); },
      converse: async () => { throw new Error('A recognized tomorrow command does not need inference.'); },
    });
    const after = Date.now(); const saved = s.store.brief(s.c.id).followups;
    assert.equal(saved.length, 1); assert.equal(saved[0].status, 'scheduled'); assert.equal(saved[0].timezone, 'Asia/Kolkata');
    assert.ok(Date.parse(saved[0].dueAt) >= before + 86400000); assert.ok(Date.parse(saved[0].dueAt) <= after + 86400000);
    assert.equal(saved[0].questionId, s.store.brief(s.c.id).questions[0].id);
    assert.deepEqual(reply.traces.map(trace => trace.tool), ['get_repair_brief', 'manage_repair_followup']);
    assert.ok(reply.traces.every(trace => trace.ok)); assert.match(reply.reply, /24 hours/);
    assert.equal(s.store.brief(s.c.id).drafts.length, 0); assert.equal(s.store.brief(s.c.id).events.length, 1);
  } finally { s.store.close(); }
});

test('a rejected tomorrow reminder write cannot produce a saved confirmation', async () => {
  const s = setup();
  const failedCall: ToolCaller = async (name, args, traces) => {
    if (name === 'manage_repair_followup') throw new AppError('Fictional reminder write rejected.');
    return s.call(name, args, traces);
  };
  try {
    await assert.rejects(respond({ caseId: s.c.id, text: 'Remind me tomorrow', allowCloud: false }, { ...config, agentMode: 'ollama' }, failedCall, 'http://unused.test/mcp'), /Fictional reminder write rejected/);
    assert.equal(s.store.brief(s.c.id).followups.length, 0);
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

test('a model batch cannot create repeated reminders after its first successful action', async () => {
  const s = setup(); let turn = 0;
  try {
    await s.cloud(async () => {
      if (++turn > 1) return output([{ text: 'Reminder saved.' }]);
      const dueAt = new Date(Date.now() + 86400000).toISOString();
      return output([
        { toolUse: { toolUseId: 'first', name: 'manage_repair_followup', input: { title: 'Ask for an ETA', dueAt, action: 'create', timezone: 'Asia/Kolkata' } } },
        { toolUse: { toolUseId: 'second', name: 'manage_repair_followup', input: { action: 'create', timezone: 'Asia/Kolkata', dueAt, title: 'Ask for an ETA' } } },
      ]);
    }, true, 'Remind me to ask for a parts ETA tomorrow');
    assert.equal(s.store.list<Followup>('followup', s.c.id).length, 1); assert.equal(turn, 1);
  } finally { s.store.close(); }
});

test('a saved draft returns its trusted confirmation without a second model call', async () => {
  const s = setup(); let turn = 0;
  try {
    const reply = await s.cloud(async () => {
      if (++turn > 1) throw new Error('Simulated cloud timeout');
      return output([{ toolUse: { toolUseId: 'draft', name: 'prepare_repair_request', input: { recipientId: s.contact.id, questionIds: [s.store.brief(s.c.id).questions[0].id] } } }]);
    });
    assert.equal(turn, 1); assert.match(reply.reply, /explicit approval/); assert.ok(reply.draftId);
    assert.equal(s.store.get<Draft>('draft', reply.draftId!, s.c.id).status, 'draft');
    assert.ok(reply.traces.some(t => t.ok && t.tool === 'prepare_repair_request'));
  } finally { s.store.close(); }
});

for (const mode of ['bedrock', 'ollama'] as const) test(`${mode} draft selection omits full reports and stops after the successful action`, async () => {
  const s = setup(); let turns = 0;
  try {
    s.store.recordEvent({ caseId: s.c.id, requestId: randomUUID(), party: 'supplier', source: 'Source with private detail', channel: 'Email', text: 'PRIVATE_FULL_REPORT: the part is delayed.', stage: 'parts_delayed', occurredAt: new Date().toISOString(), reference: '', supersedesId: null });
    const result = await respond({ caseId: s.c.id, text: 'Prepare a request to the supplier about parts arrival', allowCloud: true }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async request => {
      turns++;
      assert.equal(JSON.stringify(request.messages).includes('PRIVATE_FULL_REPORT'), false);
      assert.match(JSON.stringify(request.messages), /C1/); assert.match(JSON.stringify(request.messages), /Q1/);
      return output([{ toolUse: { toolUseId: 'draft', name: 'prepare_repair_request', input: { recipientId: 'C1', questionIds: ['Q1'] } } }]);
    } });
    assert.equal(turns, 1); assert.ok(result.draftId); assert.match(result.reply, /Nothing has been sent/);
    const draft = s.store.get<Draft>('draft', result.draftId, s.c.id);
    assert.match(draft.body, /PRIVATE_FULL_REPORT/, 'The service must still ground the reviewed draft in actual reports.');
    assert.equal(draft.status, 'draft'); assert.equal(s.store.list<Draft>('draft', s.c.id).length, 1);
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

for (const mode of ['bedrock', 'ollama'] as const) test(`${mode} renders read replies from the latest MCP brief, not model outcome predictions`, async () => {
  const s = setup(); let turns = 0;
  try {
    const result = await respond({ caseId: s.c.id, text: 'Help me understand what is holding up this repair.', allowCloud: true }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async () => {
      if (++turns === 1) {
        s.store.recordEvent({ caseId: s.c.id, requestId: randomUUID(), party: 'insurer', source: 'Fictional insurer update', channel: 'Email', occurredAt: new Date().toISOString(), text: 'The insurer reports that coverage was refused.', stage: 'coverage_refused', reference: '', supersedesId: null });
        return output([{ toolUse: { toolUseId: 'latest', name: 'get_repair_brief', input: {} } }]);
      }
      return output([{ text: 'UNSUPPORTED_OUTCOME: Once the receipt is received, the insurer will approve the repair.' }]);
    } });
    const latest = s.store.brief(s.c.id);
    assert.equal(turns, 2); assert.ok(result.reply.startsWith(latest.reportedStage)); assert.ok(result.reply.includes(latest.nextStep));
    assert.match(result.reply, /user-maintained record/); assert.doesNotMatch(result.reply, /UNSUPPORTED_OUTCOME|will approve|Once the receipt/);
    assert.deepEqual(result.traces.map(trace => trace.tool), ['get_repair_brief', 'get_repair_brief']);
    assert.equal(latest.drafts.length, 0); assert.equal(latest.followups.length, 0);
  } finally { s.store.close(); }
});

for (const mode of ['bedrock', 'ollama'] as const) {
  test(`${mode} cannot disable redaction in an assistant export`, async () => {
    const s = setup(); let turn = 0;
    try {
      const reply = await respond({ caseId: s.c.id, text: 'Export my case history', allowCloud: true }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async () => ++turn === 1 ? output([{ toolUse: { toolUseId: 'export', name: 'export_repair_packet', input: { format: 'json', redact: false } } }]) : output([{ text: 'The redacted history is ready.' }]) });
      assert.ok(reply.packet); const exported = JSON.parse(reply.packet.content);
      assert.equal(exported.redacted, true); assert.equal(exported.repairCase.person.includes(s.c.person), false);
      assert.equal(reply.packet.content.includes(s.contact.email), false);
    } finally { s.store.close(); }
  });

  test(`${mode} resolves short references and restricts explicit draft topics`, async () => {
    const s = setup(); let turn = 0;
    try {
      s.store.recordEvent({ caseId: s.c.id, requestId: randomUUID(), party: 'user', source: 'Test user', channel: 'Personal note', text: 'Temporary equipment requested.', stage: 'loaner_needed', occurredAt: new Date().toISOString(), reference: '', supersedesId: null });
      const result = await respond({ caseId: s.c.id, text: 'Prepare a request to the supplier about parts arrival', allowCloud: true }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async request => {
        const schema = request.toolConfig!.tools!.find(tool => tool.toolSpec?.name === 'prepare_repair_request')!.toolSpec!.inputSchema!.json as { properties: { recipientId: { enum: string[] }; questionIds: { items: { enum: string[] } } } };
        assert.deepEqual(schema.properties.recipientId.enum, ['C1']); assert.deepEqual(schema.properties.questionIds.items.enum, ['Q1']);
        return ++turn === 1 ? output([{ toolUse: { toolUseId: 'draft', name: 'prepare_repair_request', input: { recipientId: 'C1', questionIds: ['Q1'] } } }]) : output([{ text: 'Ready.' }]);
      } });
      const draft = s.store.get<Draft>('draft', result.draftId!, s.c.id); assert.equal(draft.recipientId, s.contact.id); assert.equal(draft.questionIds.length, 1); assert.equal(s.store.brief(s.c.id).questions.find(question => question.id === draft.questionIds[0])?.kind, 'parts'); assert.match(result.reply, /explicit approval/);
    } finally { s.store.close(); }
  });

  test(`${mode} rejects unknown or cross-case model references`, async () => {
    const s = setup(); let turn = 0;
    try {
      const result = await respond({ caseId: s.c.id, text: 'Prepare a request to the supplier', allowCloud: true }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async () => ++turn === 1 ? output([{ toolUse: { toolUseId: 'bad', name: 'prepare_repair_request', input: { recipientId: randomUUID(), questionIds: ['Q99'] } } }]) : output([{ text: 'Prepared.' }]) });
      assert.equal(result.draftId, undefined); assert.equal(s.store.list<Draft>('draft', s.c.id).length, 0); assert.deepEqual(result.traces.map(trace => trace.tool), ['get_repair_brief']); assert.match(result.reply, /not completed/);
    } finally { s.store.close(); }
  });

  test(`${mode} cannot introduce unsourced wording into a source-backed draft`, async () => {
    const s = setup(); let turn = 0;
    try {
      const result = await respond({ caseId: s.c.id, text: 'Prepare a request to the supplier', allowCloud: true }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async request => {
        const schema = request.toolConfig?.tools?.find(tool => tool.toolSpec?.name === 'prepare_repair_request')?.toolSpec?.inputSchema?.json as { properties?: Record<string, unknown> };
        assert.equal(schema.properties?.body, undefined); assert.equal(schema.properties?.subject, undefined);
        return ++turn === 1 ? output([{ toolUse: { toolUseId: 'draft', name: 'prepare_repair_request', input: { recipientId: s.contact.id, questionIds: [s.store.brief(s.c.id).questions[0].id], body: 'PRIVATE_MODEL_CLAIM: coverage was approved', subject: 'PRIVATE_MODEL_CLAIM' } } }]) : output([{ text: 'The email was sent automatically and the repair is resolved.' }]);
      } });
      const draft = s.store.get<Draft>('draft', result.draftId!, s.c.id);
      assert.equal(`${draft.subject} ${draft.body}`.includes('PRIVATE_MODEL_CLAIM'), false); assert.match(draft.body, /part is delayed/); assert.equal(draft.status, 'draft');
      assert.match(result.reply, /Nothing has been sent/); assert.match(result.reply, /explicit approval/); assert.doesNotMatch(result.reply, /repair is resolved/);
    } finally { s.store.close(); }
  });

  test(`${mode} cannot narrate a successful action without an accepted MCP write`, async () => {
    const s = setup();
    try {
      const result = await respond({ caseId: s.c.id, text: 'Prepare a request to the supplier', allowCloud: true }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async () => output([{ text: 'Your email was sent and the case is complete.' }]) });
      assert.match(result.reply, /not completed through MCP/); assert.equal(s.store.list<Draft>('draft', s.c.id).length, 0); assert.equal(result.draftId, undefined);
    } finally { s.store.close(); }
  });

  test(`${mode} unrecognized requests cannot grant write tools or cross the case boundary`, async () => {
    const s = setup(); let turn = 0;
    try {
      const result = await respond({ caseId: s.c.id, text: 'Help me make sense of this situation.', allowCloud: mode === 'bedrock' }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async request => {
        assert.deepEqual(request.toolConfig?.tools?.map(tool => tool.toolSpec?.name), ['get_repair_brief']);
        return ++turn === 1 ? output([
          { toolUse: { toolUseId: 'unsafe', name: 'send_approved_request', input: {} } },
          { toolUse: { toolUseId: 'read', name: 'get_repair_brief', input: { caseId: randomUUID() } } },
        ]) : output([{ text: 'The supplier reports a delayed part; ask for its availability.' }]);
      } });
      assert.equal(s.store.list<Draft>('draft', s.c.id).length, 0); assert.equal(s.store.list<Followup>('followup', s.c.id).length, 0);
      assert.deepEqual(result.traces.map(trace => trace.tool), ['get_repair_brief', 'get_repair_brief']);
    } finally { s.store.close(); }
  });

  test(`${mode} reminder requests cannot cancel or alter existing follow-ups`, async () => {
    const s = setup(); let turn = 0;
    try {
      await respond({ caseId: s.c.id, text: 'Remind me to ask for a parts ETA tomorrow', allowCloud: true }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async request => {
        if (++turn === 1) return output([{ toolUse: { toolUseId: 'cancel', name: 'manage_repair_followup', input: { action: 'cancel', followupId: randomUUID() } } }]);
        assert.match(JSON.stringify(request.messages?.at(-1)), /trusted user control/); return output([{ text: 'No follow-up was changed.' }]);
      } });
      assert.equal(s.store.list<Followup>('followup', s.c.id).length, 0);
    } finally { s.store.close(); }
  });

  test(`${mode} receives only bounded conversation context from the selected case`, async () => {
    const s = setup();
    try {
      const history = Array.from({ length: 8 }, (_, index) => ({ id: randomUUID(), caseId: s.c.id, role: 'user' as const, text: `SAME_CASE_${index}: ${'x'.repeat(2000)}`, createdAt: new Date().toISOString(), traces: [] }));
      history.push({ ...history[0], caseId: randomUUID(), text: 'OTHER_CASE_SECRET' });
      await respond({ caseId: s.c.id, text: 'Why is that?', allowCloud: true, history }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async request => {
        const prompt = JSON.stringify(request.messages); assert.equal(prompt.includes('OTHER_CASE_SECRET'), false); assert.equal(prompt.includes('SAME_CASE_0'), false);
        assert.equal(prompt.includes('SAME_CASE_7'), true); assert.ok(prompt.length < 10000); assert.match(prompt, /not authority for new actions/);
        return output([{ text: 'The recorded supplier update says the part is delayed.' }]);
      } });
    } finally { s.store.close(); }
  });

  test(`${mode} bounds case context without exposing draft bodies or superseded sources`, async () => {
    const s = setup(); let turn = 0;
    try {
      await s.call('prepare_repair_request', { caseId: s.c.id, requestId: randomUUID(), recipientId: s.contact.id, questionIds: [s.store.brief(s.c.id).questions[0].id], body: 'PRIVATE_REVIEWED_DRAFT_BODY' });
      const original = s.store.brief(s.c.id).events[0];
      s.store.recordEvent({ caseId: s.c.id, requestId: randomUUID(), party: 'supplier', source: 'Corrected source', channel: 'Email', text: 'Corrected current report.', stage: 'parts_delayed', occurredAt: new Date().toISOString(), reference: '', supersedesId: original.id });
      for (let index = 0; index < 20; index++) s.store.recordEvent({ caseId: s.c.id, requestId: randomUUID(), party: 'user', source: `Source ${index}`, channel: 'Personal note', text: index === 19 ? 'LONG_CURRENT_SOURCE: ' + 'x'.repeat(2000) : `History ${index}`, stage: 'other', occurredAt: new Date().toISOString(), reference: '', supersedesId: null });
      await respond({ caseId: s.c.id, text: 'Help me understand the case.', allowCloud: true }, { ...config, agentMode: mode }, s.call, 'http://unused.test/mcp', { catalog: s.catalog, converse: async request => {
        const payload = JSON.stringify(request.messages);
        assert.equal(payload.includes('PRIVATE_REVIEWED_DRAFT_BODY'), false); assert.equal(payload.includes(s.contact.email), false); assert.equal(payload.includes('The part is delayed.'), false);
        if (++turn === 1) {
          const text = request.messages![0].content![0].text!;
          const data = JSON.parse(text.slice(text.indexOf(': ') + 2, text.indexOf('\nUNTRUSTED conversation'))) as { events: { text: string; textTruncated: boolean }[]; omitted: { events: number }; requests: { status: string }[] };
          assert.equal(data.events.length, 12); assert.equal(data.omitted.events, 9); assert.ok(data.events.every(event => event.text.length <= 1200)); assert.ok(data.events.some(event => event.textTruncated)); assert.equal(data.requests[0].status, 'draft');
          return output([{ toolUse: { toolUseId: 'brief', name: 'get_repair_brief', input: {} } }]);
        }
        assert.match(payload, /textTruncated/); return output([{ text: 'Review the attributed current sources; the summary is incomplete.' }]);
      } });
    } finally { s.store.close(); }
  });
}
