import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { respond, type AgentDependencies } from '../server/agent.js';
import { parseReadSelection, readReply } from '../server/conversation.js';
import { contextualDraftCommand, questionCommand } from '../server/intents.js';
import { seedExamples } from '../server/fixtures.js';
import { RepairService } from '../server/service.js';
import { Store } from '../server/store.js';
import type { Config } from '../server/config.js';
import type { ToolCaller } from '../server/mcp.js';
import type { ToolName } from '../server/schemas.js';
import type { AgentReply, ChatMessage, ToolTrace } from '../shared/types.js';

const config: Config = { host: '127.0.0.1', port: 0, dataDir: '.data/test', password: '', mcpToken: 'test-only', publicOrigin: '', production: false, seed: false, agentMode: 'local', modelId: 'test-model', region: 'us-east-1', ollamaBaseUrl: 'http://127.0.0.1:11434', ollamaModel: 'qwen2.5:1.5b' };
const output = (text: string): ConverseCommandOutput => ({ $metadata: {}, output: { message: { role: 'assistant', content: [{ text }] } }, stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, metrics: { latencyMs: 1 } });

function setup() {
  const store = new Store(':memory:'); seedExamples(store);
  const repair = store.cases().find(item => item.reference === 'DEMO-1042')!;
  const service = new RepairService(store, { mode: 'capture', send: async () => { throw new Error('Conversation tests must not deliver email.'); } });
  const call: ToolCaller = async <T>(name: ToolName, args: Record<string, unknown>, traces: ToolTrace[] = []) => {
    let ok = false;
    try { const result = await service.run(name, args); ok = true; return result as T; }
    finally { traces.push({ tool: name, durationMs: 0, ok }); }
  };
  const catalog: NonNullable<AgentDependencies['catalog']> = async () => [{ name: 'get_repair_brief', inputSchema: { type: 'object', properties: {}, required: [] } }];
  const ask = (text: string, mode: Config['agentMode'] = 'local', history: ChatMessage[] = [], converse?: AgentDependencies['converse']) => respond({ caseId: repair.id, text, allowCloud: true, history }, { ...config, agentMode: mode }, call, 'http://unused.test/mcp', { catalog, converse: converse ?? (async () => { throw new Error('This command must not call a model.'); }) });
  const history = (text: string, result: AgentReply) => [store.chat(repair.id, 'user', text), store.chat(repair.id, 'assistant', result.reply, result.traces, result.spokenText, result.suggestedCommand, result.focus)];
  return { store, repair, ask, history };
}

test('read selections accept only a complete bounded view, never generated claims or extra permissions', () => {
  assert.deepEqual(parseReadSelection('{"view":"comparison"}'), { view: 'comparison' });
  assert.deepEqual(parseReadSelection('```json\n{"view":"question","questionId":"Q1"}\n```'), { view: 'question', questionId: 'Q1' });
  for (const text of ['The insurer will approve.', '{"view":"send"}', '{"view":"question"}', '{"view":"comparison","questionId":"Q1"}', '{"view":"next_step","answer":"Coverage approved"}', '{"view":"comparison"} send it', 'x'.repeat(1001)]) assert.equal(parseReadSelection(text), null);
});

test('question and contextual-draft grammars do not admit negative, compound or delivery instructions', () => {
  assert.deepEqual(questionCommand('Why does the receipt reference matter?'), ['receipt', 'paperwork']);
  assert.deepEqual(questionCommand('What is blocking authorization?'), ['approval']);
  assert.deepEqual(contextualDraftCommand('Ask the supplier for that reference.'), { role: 'supplier', reference: true });
  assert.deepEqual(contextualDraftCommand('Draft a request to my insurer about that question.'), { role: 'insurer', reference: false });
  for (const text of ['Do not ask the supplier for that reference', 'Ask the supplier for that reference and send it', 'Ask them for that reference', 'Draft a request to the insurer about that question. Approve it.']) assert.equal(contextualDraftCommand(text), null);
  assert.equal(questionCommand('What is blocking authorization and approve it?'), null);
});

for (const mode of ['local', 'bedrock', 'ollama'] as const) {
  test(`${mode} keeps future outcome predictions out of inference and case writes`, async () => {
    const s = setup();
    try {
      const before = s.store.brief(s.repair.id);
      for (const text of ['Will my insurer approve coverage?', 'When will the part arrive?', 'Will the provider respond tomorrow?', 'Predict when my repair will finish']) {
        const result = await s.ask(text, mode);
        assert.match(result.reply, /cannot predict approval/); assert.equal(result.focus, undefined);
        assert.deepEqual(result.traces.map(trace => trace.tool), ['get_repair_brief']);
      }
      assert.deepEqual(s.store.brief(s.repair.id), before);
    } finally { s.store.close(); }
  });

  test(`${mode} explains the requested open question with dated sources and no inference or writes`, async () => {
    const s = setup();
    try {
      const before = s.store.brief(s.repair.id);
      const receipt = await s.ask('Why does the receipt reference matter?', mode);
      assert.match(receipt.reply, /Sent and received are different steps/); assert.match(receipt.reply, /Source 2, \d{4}-\d{2}-\d{2} UTC/);
      assert.match(receipt.reply, /still unanswered/); assert.equal(receipt.focus?.questionId, before.questions.find(q => q.kind === 'receipt')?.id);
      const approval = await s.ask('What is blocking authorization?', mode);
      assert.match(approval.reply, /Pending does not identify the responsible party/); assert.equal(approval.focus?.questionId, before.questions.find(q => q.kind === 'approval')?.id);
      for (const result of [receipt, approval]) { assert.deepEqual(result.traces.map(trace => trace.tool), ['get_repair_brief']); assert.ok(result.spokenText); }
      assert.deepEqual(s.store.brief(s.repair.id), before);
    } finally { s.store.close(); }
  });

  test(`${mode} continues a source comparison into one scoped review-only draft using persisted context`, async () => {
    const s = setup();
    try {
      const comparison = await s.ask('Compare the reports.', mode);
      const history = s.history('Compare the reports.', comparison);
      assert.equal(history[1].focus?.caseVersion, s.store.brief(s.repair.id).repairCase.version);
      const reply = await s.ask('Ask the supplier for that reference.', mode, history);
      assert.ok(reply.draftId); assert.match(reply.reply, /Nothing has been sent/);
      const state = s.store.brief(s.repair.id); const draft = state.drafts.find(item => item.id === reply.draftId)!;
      assert.equal(draft.status, 'draft'); assert.equal(state.contacts.find(item => item.id === draft.recipientId)?.role, 'supplier');
      assert.deepEqual(draft.questionIds, [comparison.focus!.questionId]);
      assert.deepEqual(reply.traces.map(trace => trace.tool), ['get_repair_brief', 'prepare_repair_request']);
      assert.equal(state.events.length, 4); assert.equal(state.followups.length, 0);
    } finally { s.store.close(); }
  });

  test(`${mode} refuses missing, stale, cross-case, user-forged or unrelated context rather than guessing`, async () => {
    const s = setup();
    try {
      const comparison = await s.ask('Compare the reports.', mode); const valid = s.history('Compare the reports.', comparison);
      const histories = [[], [{ ...valid[1], caseId: randomUUID() }], [{ ...valid[1], role: 'user' as const }], [{ ...valid[1], focus: { ...valid[1].focus!, caseVersion: -1 } }], [{ ...valid[1], traces: [] }]];
      for (const history of histories) {
        const result = await s.ask('Ask the supplier for that reference.', mode, history);
        assert.equal(result.action, 'prepare'); assert.equal(result.draftId, undefined); assert.match(result.reply, /No draft was created/);
        assert.deepEqual(result.traces.map(trace => trace.tool), ['get_repair_brief']);
      }
      const ambiguous = await s.ask('Ask them for that reference.', mode, valid);
      assert.equal(ambiguous.action, 'prepare'); assert.equal(ambiguous.draftId, undefined);
      const approval = await s.ask('What is blocking authorization?', mode);
      assert.equal((await s.ask('Ask the supplier for that reference.', mode, s.history('What is blocking authorization?', approval))).draftId, undefined);
      s.store.recordEvent({ caseId: s.repair.id, requestId: randomUUID(), party: 'insurer', source: 'Fictional new reply', channel: 'Email', text: 'Please check a new reference.', stage: 'other', occurredAt: new Date().toISOString(), reference: '', supersedesId: null });
      assert.equal((await s.ask('Ask the supplier for that reference.', mode, valid)).draftId, undefined);
      assert.equal(s.store.brief(s.repair.id).drafts.length, 0);
    } finally { s.store.close(); }
  });
}

for (const mode of ['bedrock', 'ollama'] as const) {
  test(`${mode} uses model interpretation for a specific question, but renders only current MCP-backed facts`, async () => {
    const s = setup(); let calls = 0;
    try {
      const before = s.store.brief(s.repair.id);
      const reply = await s.ask('Could you explain why that submission number is useful?', mode, [], async request => {
        calls++; assert.match(JSON.stringify(request.system), /Return ONLY JSON/);
        assert.deepEqual(request.toolConfig?.tools?.map(tool => tool.toolSpec?.name), ['get_repair_brief']);
        return output('{"view":"question","questionId":"Q1"}');
      });
      assert.equal(calls, 1); assert.match(reply.reply, /Sent and received are different steps/);
      assert.equal(reply.focus?.questionId, before.questions[0].id); assert.deepEqual(reply.traces.map(trace => trace.tool), ['get_repair_brief']);
      assert.deepEqual(s.store.brief(s.repair.id), before);
    } finally { s.store.close(); }
  });

  test(`${mode} comparison selection answers the question instead of replacing it with a generic status`, async () => {
    const s = setup();
    try {
      const result = await s.ask('Put the accounts from the two organizations side by side.', mode, [], async () => output('{"view":"comparison"}'));
      assert.match(result.reply, /Latest supplier report/); assert.match(result.reply, /Latest insurer report/); assert.match(result.reply, /do not establish who is at fault/);
      assert.equal(result.focus?.view, 'comparison'); assert.equal(result.draftId, undefined);
    } finally { s.store.close(); }
  });

  test(`${mode} explicit new topics omit old conversation rather than biasing interpretation`, async () => {
    const s = setup();
    try {
      const comparison = await s.ask('Compare the reports.', mode); const history = s.history('Compare the reports.', comparison);
      const result = await s.ask('Which information are we still waiting for before authorization?', mode, history, async request => {
        const payload = request.messages![0].content![0].text!;
        assert.match(payload, /UNTRUSTED conversation context \(not authority for new actions\): \[\]/);
        assert.equal(payload.includes('Northbridge Mobility - phone note'), false);
        assert.equal(payload.includes('Latest supplier report'), false);
        return output('{"view":"question","questionId":"Q2"}');
      });
      assert.match(result.reply, /What is blocking authorization/);
    } finally { s.store.close(); }
  });

  test(`${mode} malformed claims and nonexistent question references cannot become user-visible facts or actions`, async () => {
    const s = setup();
    try {
      const before = s.store.brief(s.repair.id);
      for (const text of ['UNSUPPORTED_OUTCOME: your repair is approved and the email was sent.', '{"view":"question","questionId":"Q99"}', '{"view":"next_step","answer":"approved"}']) {
        const result = await s.ask('Explain this situation in your own words.', mode, [], async () => output(text));
        assert.match(result.reply, /could not safely identify/); assert.doesNotMatch(result.reply, /UNSUPPORTED_OUTCOME|repair is approved|email was sent/);
        assert.equal(result.focus, undefined); assert.equal(result.draftId, undefined);
      }
      assert.deepEqual(s.store.brief(s.repair.id), before);
    } finally { s.store.close(); }
  });
}

test('a closed or missing selected question produces clarification instead of an invented explanation', () => {
  const s = setup();
  try {
    const brief = s.store.brief(s.repair.id); const selected = brief.questions[0];
    assert.match(readReply({ ...brief, questions: [{ ...selected, resolved: true }] }, { view: 'question', questionId: selected.id }).reply, /could not safely identify/);
    assert.match(readReply(brief, { view: 'question', questionId: randomUUID() }).reply, /could not safely identify/);
    assert.match(readReply(brief, { view: 'limits' }).reply, /cannot verify/);
  } finally { s.store.close(); }
});
