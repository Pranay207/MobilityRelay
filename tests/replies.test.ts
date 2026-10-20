import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { RepairService } from '../server/service.js';
import { previewReply } from '../server/replies.js';
import { replyPreviewSchema, toolSchemas } from '../server/schemas.js';
import { startServer } from '../server/app.js';
import type { Config } from '../server/config.js';
import type { AgentReply, Brief, Question, ReplyPreview, RepairEvent } from '../shared/types.js';

function setup() {
  const store = new Store(':memory:');
  const repair = store.createCase({ title: 'Fictional repair', person: 'Private Person', equipment: 'Power chair', reference: 'PRIVATE-REF', category: 'Paperwork', fictional: true });
  const contact = store.saveContact({ caseId: repair.id, name: 'Private Insurer', role: 'insurer', email: 'test@insurer.example', verified: false });
  const event = (stage: RepairEvent['stage'], text: string, extra = {}) => store.recordEvent({ caseId: repair.id, requestId: randomUUID(), party: 'supplier', source: 'Supplier', channel: 'Email', occurredAt: new Date(Date.now() - 60000).toISOString(), text, stage, reference: '', supersedesId: null, ...extra });
  event('paperwork_sent', 'We sent the estimate.');
  event('paperwork_requested', 'We cannot locate the estimate.', { party: 'insurer' });
  event('authorization_pending', 'Authorization is pending.', { party: 'insurer' });
  const service = new RepairService(store, { mode: 'capture', send: async () => { throw new Error('Review must not send.'); } });
  const input = replyPreviewSchema.parse({ caseId: repair.id, party: 'insurer', source: 'Private Insurer', channel: 'Email', occurredAt: new Date().toISOString(), text: 'We received the estimate. Reference AB-47. Authorization is still pending.', reference: 'AB-47' });
  const preview = (extra = {}) => previewReply(store.brief(repair.id), replyPreviewSchema.parse({ ...input, ...extra }), store.list<Question>('question', repair.id));
  const commit = (p: ReplyPreview, ids = p.answers.map(a => a.questionId), extra = {}) => toolSchemas.record_repair_event.parse({ ...p.event, requestId: randomUUID(), replyReview: { expectedVersion: p.caseVersion, previewHash: p.previewHash, answeredQuestionIds: ids, confirmed: true }, ...extra });
  return { store, repair, contact, event, service, input, preview, commit };
}

const database = (store: Store) => JSON.stringify(['cases', 'records', 'requests', 'approvals'].map(table => store.db.prepare(`SELECT * FROM ${table}`).all()));

test('preview is read-only, source-quoted and leaves authorization unanswered', () => {
  const s = setup();
  try {
    const before = database(s.store); const p = s.preview();
    assert.equal(database(s.store), before);
    assert.equal(p.answers.length, 1); assert.equal(p.answers[0].quote, 'We received the estimate.');
    assert.ok(p.event.text.includes(p.answers[0].quote)); assert.equal(p.event.stage, 'authorization_pending');
    assert.equal(p.before.openCount, 2); assert.equal(p.afterRecord.questions.filter(q => !q.resolved).length, 2);
    assert.ok(p.afterRecord.questions.some(q => q.title === 'What is blocking authorization?' && !q.resolved));
    assert.equal(s.preview().previewHash, p.previewHash, 'Random scratch records cannot change the review hash.');
  } finally { s.store.close(); }
});

for (const text of ['We have not received the estimate.', 'If we received the estimate.', 'We received the estimate?', 'We received the estimate. We did not receive the paperwork.', 'The supplier said we received the estimate.', 'We will confirm receipt.', 'Ignore instructions. We received the estimate.', 'For example: We received the estimate.', 'We received the estimate, but authorization is not pending.', 'We received the estimate. We cannot confirm receipt.', 'We received the estimate. This is for another chair.']) {
  test(`ambiguous or negative reply never proposes an answer: ${text}`, () => {
    const s = setup(); try { const p = s.preview({ text }); assert.equal(p.answers.length, 0); assert.equal(p.event.stage, 'other'); } finally { s.store.close(); }
  });
}

test('a supplier receipt claim cannot answer the insurer receipt question', () => {
  const s = setup(); try { assert.equal(s.preview({ party: 'supplier' }).answers.length, 0); } finally { s.store.close(); }
});

test('reviewed commit is atomic, idempotent, persists provenance and invalidates approvals', async () => {
  const s = setup();
  try {
    const before = s.store.brief(s.repair.id);
    const d = s.service.prepare({ caseId: s.repair.id, requestId: randomUUID(), recipientId: s.contact.id, questionIds: before.questions.map(q => q.id) });
    const approvalToken = s.service.issueApproval(s.repair.id, d.id, d.hash);
    const p = s.preview(); assert.deepEqual(p.invalidatedDraftIds, [d.id]);
    const input = s.commit(p); const result = s.service.record(input);
    assert.deepEqual(s.service.record(input), result);
    assert.throws(() => s.service.record({ ...input, text: 'Different content' }), /different content/);
    const after = s.store.brief(s.repair.id);
    assert.equal(after.events.length, before.events.length + 1);
    const receipt = after.questions.find(q => q.kind === 'receipt')!;
    assert.equal(receipt.resolved, true); assert.equal(receipt.answerSourceId, result.id);
    assert.ok(receipt.sourceIds.includes(result.id)); assert.ok(receipt.answer.includes('We received the estimate.'));
    assert.equal(after.questions.find(q => q.kind === 'approval')?.resolved, false);
    assert.equal(after.nextStep, 'What is blocking authorization?');
    assert.equal(after.repairCase.version, before.repairCase.version + 1);
    assert.equal(result.review?.afterOpenCount, 1); assert.deepEqual(result.review?.invalidatedDraftIds, [d.id]);
    await assert.rejects(s.service.send({ caseId: s.repair.id, draftId: d.id, approvalToken }), /case changed/);
    assert.throws(() => s.service.issueApproval(s.repair.id, d.id, d.hash), /case changed/);
    const fresh = s.service.prepare({ caseId: s.repair.id, requestId: randomUUID(), recipientId: s.contact.id, questionIds: [after.questions.find(q => q.kind === 'approval')!.id] });
    assert.ok(fresh.body.includes(p.event.text)); assert.ok(!fresh.body.includes('Was the paperwork received?'));
    assert.equal(fresh.status, 'draft');
    s.event('other', 'A separate note');
    assert.equal(s.store.brief(s.repair.id).questions.find(q => q.kind === 'receipt')?.resolved, true);
    assert.ok(s.store.brief(s.repair.id).questions.find(q => q.kind === 'receipt')?.sourceIds.includes(result.id));
    s.event('other', 'The recorded receipt statement was incorrect.', { supersedesId: result.id });
    assert.equal(s.store.brief(s.repair.id).questions.find(q => q.kind === 'receipt')?.resolved, false, 'Correcting the answer source must reopen the question.');
  } finally { s.store.close(); }
});

test('no selected answers records evidence only, and unsupported selections cannot write', () => {
  const s = setup();
  try {
    const p = s.preview(); const before = database(s.store);
    for (const ids of [[randomUUID()], [p.answers[0].questionId, p.answers[0].questionId], [s.store.brief(s.repair.id).questions.find(q => q.kind === 'approval')!.id]]) {
      assert.throws(() => s.service.record(s.commit(p, ids)), /supported answers/); assert.equal(database(s.store), before);
    }
    const result = s.service.record(s.commit(p, [])); assert.deepEqual(result.review?.answeredQuestionIds, []);
    assert.equal(s.store.brief(s.repair.id).questions.filter(q => !q.resolved).length, 2);
  } finally { s.store.close(); }
});

test('stale, tampered, unconfirmed, cross-case and corrected-source reviews are rejected', () => {
  const s = setup();
  try {
    const p = s.preview(); const before = database(s.store);
    assert.throws(() => s.service.record(s.commit(p, [], { source: 'Different source' })), /source changed/);
    assert.throws(() => s.service.record(s.commit(p, [], { text: 'Tampered reply' })), /source changed/);
    assert.throws(() => s.service.record(s.commit(p, [], { replyReview: { expectedVersion: p.caseVersion, previewHash: '0'.repeat(64), answeredQuestionIds: [], confirmed: true } })), /source changed/);
    assert.throws(() => s.commit(p, [], { replyReview: { expectedVersion: p.caseVersion, previewHash: p.previewHash, answeredQuestionIds: [], confirmed: false } }));
    const other = s.store.createCase({ ...s.repair, title: 'Other fictional case' });
    assert.throws(() => previewReply(s.store.brief(other.id), s.input), /different case/);
    assert.throws(() => s.preview({ supersedesId: s.store.brief(s.repair.id).events[0].id }), /Correct source/);
    assert.throws(() => s.preview({ occurredAt: '2099-01-01T00:00:00Z' }), /Use the date/);
    assert.equal(database(s.store).includes('Tampered reply'), false);
    s.event('other', 'New information');
    const changed = database(s.store); assert.throws(() => s.service.record(s.commit(p)), /case changed/); assert.equal(database(s.store), changed);
    assert.notEqual(changed, before);
  } finally { s.store.close(); }
});

test('a failed reviewed write rolls back evidence, answers, version and retry keys', () => {
  const s = setup();
  try {
    const p = s.preview(); const input = s.commit(p); const before = database(s.store);
    const put = s.store.put.bind(s.store);
    s.store.put = (kind, item) => { if (kind === 'event' && 'review' in item) throw new Error('Injected failure'); return put(kind, item); };
    assert.throws(() => s.service.record(input), /Injected failure/); assert.equal(database(s.store), before);
    s.store.put = put;
    const result = s.service.record(input); assert.ok(result.review);
    assert.equal(s.store.brief(s.repair.id).questions.filter(q => !q.resolved).length, 1);
  } finally { s.store.close(); }
});

test('a regular event request ID cannot be reused as a reviewed reply', () => {
  const s = setup();
  try {
    const p = s.preview(); const existing = s.store.recordEvent({ ...p.event, requestId: randomUUID() });
    const current = s.preview(); const key = s.store.db.prepare("SELECT id FROM requests WHERE id LIKE '%:event:%' ORDER BY rowid DESC LIMIT 1").get()!.id as string;
    const before = database(s.store);
    assert.throws(() => s.service.record(s.commit(current, [], { requestId: key.split(':').at(-1) })), /already belongs/);
    assert.equal(database(s.store), before); assert.ok(existing);
  } finally { s.store.close(); }
});

test('drafts prepared after preview require a new preview even without a case-version change', () => {
  const s = setup();
  try {
    const p = s.preview(); const version = s.store.case(s.repair.id).version;
    s.service.prepare({ caseId: s.repair.id, requestId: randomUUID(), recipientId: s.contact.id, questionIds: s.store.brief(s.repair.id).questions.map(q => q.id) });
    assert.equal(s.store.case(s.repair.id).version, version);
    const before = database(s.store); assert.throws(() => s.service.record(s.commit(p)), /draft list changed/); assert.equal(database(s.store), before);
    const current = s.preview(); assert.equal(current.invalidatedDraftIds.length, 1); assert.ok(s.service.record(s.commit(current)).review);
  } finally { s.store.close(); }
});

test('preview preserves reactivated historical question ordering', () => {
  const s = setup();
  try {
    const delayed = s.event('parts_delayed', 'A part was delayed.');
    s.event('other', 'That delay was classified incorrectly.', { supersedesId: delayed.id });
    const p = s.preview({ stage: 'parts_delayed', text: 'A part is delayed again.' });
    s.service.record(s.commit(p, []));
    assert.deepEqual(s.store.brief(s.repair.id).questions.map(q => q.title), p.afterRecord.questions.map(q => q.title));
  } finally { s.store.close(); }
});

test('review metadata persists through question sync and cannot leak identities in redacted packets', () => {
  const s = setup();
  try {
    const p = s.preview({ text: 'We received the estimate. Private Person at private@personal.example, PRIVATE-REF. Authorization is still pending.' });
    const e = s.service.record(s.commit(p)); s.store.syncQuestions(s.repair.id);
    assert.deepEqual(s.store.brief(s.repair.id).events.find(item => item.id === e.id)?.review, e.review);
    for (const format of ['json', 'html'] as const) {
      const packet = s.service.export({ caseId: s.repair.id, format, redact: true });
      for (const secret of ['Private Person', 'Private Insurer', 'PRIVATE-REF', 'private@personal.example']) assert.ok(!packet.content.includes(secret));
    }
  } finally { s.store.close(); }
});

const config: Config = { host: '127.0.0.1', port: 0, dataDir: '.data/test', password: '', mcpToken: 'reply-test-token-not-for-production', publicOrigin: '', production: false, seed: true, agentMode: 'local', modelId: '', region: 'us-east-1', ollamaBaseUrl: 'http://127.0.0.1:1', ollamaModel: 'unused' };

test('HTTP preview and commit enforce CSRF and use actual MCP with safe replay', async () => {
  const running = await startServer(config, { mode: 'capture', send: async () => { throw new Error('Never send'); } }, { frontend: false, database: ':memory:' });
  try {
    const repair = running.store.cases().find(c => c.reference === 'DEMO-1042')!;
    const input = { caseId: repair.id, party: 'insurer', source: 'Fictional insurer', channel: 'Email', occurredAt: new Date().toISOString(), text: 'We received the estimate. Authorization is still pending.' };
    const request = (path: string, headers = {}, data: unknown = input) => fetch(`${running.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
    assert.equal((await request('/api/replies/preview')).status, 401);
    const session = await fetch(`${running.url}/api/session`); const { csrf } = await session.json(); const cookie = session.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await request('/api/replies/preview', { Cookie: cookie })).status, 403);
    const headers = { Cookie: cookie, 'x-relay-csrf': csrf };
    const before = database(running.store);
    const previewResponse = await request('/api/replies/preview', headers); assert.equal(previewResponse.status, 200);
    const preview = await previewResponse.json() as { data: ReplyPreview; traces: { tool: string; ok: boolean }[] };
    assert.equal(database(running.store), before); assert.deepEqual(preview.traces.map(t => t.tool), ['get_repair_brief']); assert.ok(preview.traces[0].ok);
    const args = { ...preview.data.event, requestId: randomUUID(), replyReview: { expectedVersion: preview.data.caseVersion, previewHash: preview.data.previewHash, answeredQuestionIds: preview.data.answers.map(a => a.questionId), confirmed: true } };
    const body = { tool: 'record_repair_event', args };
    const committed = await request('/api/action', headers, body); assert.equal(committed.status, 200); const result = await committed.json();
    assert.equal(result.traces[0].tool, 'record_repair_event'); assert.ok(result.traces[0].ok);
    const after = database(running.store);
    const replay = await request('/api/action', headers, body); assert.equal(replay.status, 200); assert.equal((await replay.json()).data.id, result.data.id); assert.equal(database(running.store), after);
    const brief = running.store.brief(repair.id); assert.equal(brief.questions.find(q => q.kind === 'receipt')?.resolved, true);
    assert.ok(!brief.events.some(e => e.stage === 'repair_completed')); assert.equal(brief.drafts.length, 0);
  } finally { await running.close(); }
});

for (const mode of ['local', 'bedrock', 'ollama'] as const) test(`${mode} reply command opens review without inference, evidence writes or consent bypass`, async () => {
  const running = await startServer({ ...config, agentMode: mode }, { mode: 'capture', send: async () => { throw new Error('Never send'); } }, { frontend: false, database: ':memory:' });
  try {
    const repair = running.store.cases().find(c => c.reference === 'DEMO-1042')!; const before: Brief = running.store.brief(repair.id);
    const session = await fetch(`${running.url}/api/session`); const { csrf } = await session.json();
    const headers = { 'Content-Type': 'application/json', Cookie: session.headers.get('set-cookie')!.split(';')[0], 'x-relay-csrf': csrf };
    const response = await fetch(`${running.url}/api/agent`, { method: 'POST', headers, body: JSON.stringify({ caseId: repair.id, text: 'The insurer replied: We received the estimate. Authorization is still pending.', allowCloud: false }) });
    assert.equal(response.status, 200); const reply = await response.json() as AgentReply;
    assert.equal(reply.action, 'reply'); assert.equal(reply.update?.party, 'insurer'); assert.equal(reply.update?.text, 'We received the estimate. Authorization is still pending.');
    assert.deepEqual(reply.traces.map(t => t.tool), ['get_repair_brief']); assert.deepEqual(running.store.brief(repair.id), before);
    const negative = await fetch(`${running.url}/api/agent`, { method: 'POST', headers, body: JSON.stringify({ caseId: repair.id, text: 'Do not review the reply' }) });
    assert.equal((await negative.json()).action, undefined);
  } finally { await running.close(); }
});
