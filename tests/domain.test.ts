import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Store, hash } from '../server/store.js';
import { RepairService } from '../server/service.js';
import { toolSchemas } from '../server/schemas.js';
import type { Stage, Draft, Followup } from '../shared/types.js';

function setup(mode: 'capture' | 'smtp' = 'capture') {
  const store = new Store(':memory:');
  const c = store.createCase({ title: 'Repair', person: 'Maya', equipment: 'Power chair', reference: 'CASE-TEST', category: 'Test', fictional: true });
  const contact = store.saveContact({ caseId: c.id, name: 'Test Supplier', role: 'supplier', email: 'repairs@example.com', verified: true });
  let deliveries = 0;
  const service = new RepairService(store, { mode, send: async () => { deliveries++; return 'test-delivery'; } });
  const event = (stage: Stage, text = 'Reported update', extra = {}) => store.recordEvent({ caseId: c.id, requestId: randomUUID(), party: 'supplier', source: 'Supplier email', channel: 'Email', occurredAt: new Date(Date.now() - 60000).toISOString(), text, stage, reference: '', supersedesId: null, ...extra });
  const draft = () => service.prepare({ caseId: c.id, requestId: randomUUID(), recipientId: contact.id, questionIds: store.brief(c.id).questions.filter(q => !q.resolved).map(q => q.id) });
  return { store, c, contact, service, event, draft, deliveries: () => deliveries };
}

test('all difficult case types produce a bounded administrative question', () => {
  const s = setup();
  for (const stage of ['coverage_refused', 'parts_delayed', 'technician_unavailable', 'assessment_needed', 'provider_silent', 'loaner_needed'] as Stage[]) s.event(stage);
  const kinds = s.store.brief(s.c.id).questions.map(q => q.kind);
  for (const kind of ['coverage', 'parts', 'technician', 'assessment', 'response', 'loaner']) assert.ok(kinds.includes(kind));
  s.store.close();
});
test('conflicting reports yield receipt uncertainty, not a fault verdict', () => {
  const s = setup(); s.event('paperwork_sent'); s.event('paperwork_requested', 'Estimate not found', { party: 'insurer' });
  const q = s.store.brief(s.c.id).questions.find(q => q.kind === 'receipt')!;
  assert.equal(q.sourceIds.length, 2); assert.match(q.explanation, /do not establish fault/); s.store.close();
});
test('event retries are idempotent and reject reusing a key for different content', () => {
  const s = setup(); const id = randomUUID(); const e = s.event('other', 'First', { requestId: id, occurredAt: '2026-01-01T10:00:00Z' });
  const repeat = s.event('other', 'First', { requestId: id, occurredAt: '2026-01-01T10:00:00Z' });
  assert.equal(e.id, repeat.id); assert.equal(s.store.brief(s.c.id).events.length, 1);
  assert.throws(() => s.event('other', 'Changed', { requestId: id, occurredAt: '2026-01-01T10:00:00Z' }), /different content/); s.store.close();
});
test('corrections preserve originals and cannot cross case boundaries', () => {
  const s = setup(); const e = s.event('parts_delayed'); const correction = s.event('other', 'Corrected report', { supersedesId: e.id });
  assert.equal(s.store.brief(s.c.id).events.length, 2); assert.deepEqual(s.store.activeEvents(s.c.id).map(e => e.id), [correction.id]);
  const other = s.store.createCase({ ...s.c, title: 'Other' });
  assert.throws(() => s.store.get('event', e.id, other.id), /not found/);
  assert.throws(() => s.event('other', 'Second correction', { supersedesId: e.id }), /already been corrected/); s.store.close();
});
test('preparing a request never delivers it and keeps readable source references', () => { const s = setup(); s.event('parts_delayed'); const d = s.draft(); assert.equal(d.status, 'draft'); assert.equal(s.deliveries(), 0); assert.match(d.body, /\[source 1\]/); assert.ok(d.sourceIds.length); assert.ok(d.sourceIds.every(id => !d.body.includes(id))); s.store.close(); });

test('corrected sources replace current question citations without erasing history', () => {
  const s = setup(); const old = s.event('parts_delayed', 'Old unconfirmed date');
  const correction = s.event('parts_delayed', 'Corrected availability report', { supersedesId: old.id });
  const question = s.store.brief(s.c.id).questions[0];
  assert.deepEqual(question.sourceIds, [correction.id]);
  assert.match(s.draft().body, /Corrected availability report/); assert.ok(!s.draft().body.includes('Old unconfirmed date'));
  s.event('other', 'The delay classification was incorrect', { supersedesId: correction.id });
  assert.equal(s.store.brief(s.c.id).questions.length, 0); assert.equal(s.store.brief(s.c.id).events.length, 3);
  assert.throws(() => s.service.prepare({ caseId: s.c.id, requestId: randomUUID(), recipientId: s.contact.id, questionIds: [question.id] }), /no longer applies/);
  s.store.close();
});

test('a new source reopens an answered question and preserves the previous answer as evidence', () => {
  const s = setup(); s.event('parts_delayed'); const question = s.store.brief(s.c.id).questions[0];
  s.store.resolveQuestion(s.c.id, question.id, 'Supplier reported Friday by email.');
  const fresh = s.event('parts_delayed', 'Friday is no longer confirmed.'); const brief = s.store.brief(s.c.id);
  assert.equal(brief.questions[0].resolved, false); assert.deepEqual(brief.questions[0].sourceIds, [fresh.id]);
  assert.ok(brief.events.some(e => e.text.includes('Supplier reported Friday by email.'))); s.store.close();
});

test('later pending reports are not suppressed by an older approval', () => {
  const s = setup(); s.event('authorization_approved', 'Previous approval', { occurredAt: '2026-01-01T10:00:00Z' });
  s.event('authorization_pending', 'A revised request is pending', { occurredAt: '2026-01-02T10:00:00Z' });
  assert.ok(s.store.brief(s.c.id).questions.some(q => q.kind === 'approval'));
  s.event('authorization_approved', 'Revised request approved', { occurredAt: '2026-01-03T10:00:00Z' });
  assert.ok(!s.store.brief(s.c.id).questions.some(q => q.kind === 'approval')); s.store.close();
});

test('appointment reports keep the reported date separate from the future visit date', () => {
  const s = setup(); assert.throws(() => s.event('appointment_scheduled', 'A visit was offered next week', { occurredAt: new Date(Date.now() + 86400000).toISOString() }), /date this update was reported/); s.store.close();
});
test('send requires a host-issued exact-message approval', async () => {
  const s = setup(); s.event('parts_delayed'); const d = s.draft();
  await assert.rejects(s.service.send({ caseId: s.c.id, draftId: d.id, approvalToken: 'x'.repeat(64) }), /approval/);
  assert.throws(() => s.service.issueApproval(s.c.id, d.id, hash('different body')), /does not match/); assert.equal(s.deliveries(), 0); s.store.close();
});
test('any case change invalidates old draft approval', async () => {
  const s = setup(); s.event('parts_delayed'); const d = s.draft(); const token = s.service.issueApproval(s.c.id, d.id, d.hash); s.event('other');
  await assert.rejects(s.service.send({ caseId: s.c.id, draftId: d.id, approvalToken: token }), /case changed/); assert.equal(s.deliveries(), 0); s.store.close();
});
test('capture is not delivery, approval is single-use, questions stay unresolved', async () => {
  const s = setup(); s.event('parts_delayed'); const d = s.draft(); const token = s.service.issueApproval(s.c.id, d.id, d.hash);
  const result = await s.service.send({ caseId: s.c.id, draftId: d.id, approvalToken: token }); assert.equal(result.status, 'captured');
  await assert.rejects(s.service.send({ caseId: s.c.id, draftId: d.id, approvalToken: token }), /cannot be sent again/);
  assert.equal(s.deliveries(), 1); assert.equal(s.store.brief(s.c.id).questions.filter(q => !q.resolved).length, 1); s.store.close();
});
test('expired approvals do not deliver', async () => {
  const s = setup(); s.event('provider_silent'); const d = s.draft(); const token = s.service.issueApproval(s.c.id, d.id, d.hash);
  s.store.db.prepare('UPDATE approvals SET expires=0').run();
  await assert.rejects(s.service.send({ caseId: s.c.id, draftId: d.id, approvalToken: token }), /fresh approval/); assert.equal(s.deliveries(), 0); s.store.close();
});

test('overlapping send attempts cannot deliver the same draft twice', async () => {
  const s = setup(); s.event('parts_delayed'); const draft = s.draft();
  const firstToken = s.service.issueApproval(s.c.id, draft.id, draft.hash);
  const secondToken = s.service.issueApproval(s.c.id, draft.id, draft.hash);
  let release!: () => void; let attempts = 0;
  s.service.mail.send = async () => { attempts++; await new Promise<void>(resolve => { release = resolve; }); return 'controlled-capture'; };
  const first = s.service.send({ caseId: s.c.id, draftId: draft.id, approvalToken: firstToken });
  try {
    await assert.rejects(s.service.send({ caseId: s.c.id, draftId: draft.id, approvalToken: secondToken }), /cannot be sent again/);
    assert.equal(attempts, 1);
  } finally { release(); await first; s.store.close(); }
});
test('SMTP rejects unconfirmed and fictional recipients', () => {
  const s = setup('smtp'); s.store.saveContact({ ...s.contact, verified: false }); s.event('parts_delayed');
  const d = s.draft(); assert.throws(() => s.service.issueApproval(s.c.id, d.id, d.hash), /Confirm a real recipient/);
  s.store.saveContact({ ...s.contact, email: 'repairs@fake.example', verified: true }); const fresh = s.draft(); assert.throws(() => s.service.issueApproval(s.c.id, fresh.id, fresh.hash), /real recipient/); s.store.close();
});
test('uncertain delivery is persisted and cannot be blindly retried', async () => {
  const s = setup('smtp'); s.event('parts_delayed'); const d = s.draft(); const token = s.service.issueApproval(s.c.id, d.id, d.hash);
  s.service.mail.send = async () => { throw new Error('Lost SMTP connection'); };
  await assert.rejects(s.service.send({ caseId: s.c.id, draftId: d.id, approvalToken: token }), /could not be confirmed/);
  assert.equal(s.store.get<Draft>('draft', d.id, s.c.id).status, 'unknown'); assert.throws(() => s.service.issueApproval(s.c.id, d.id, d.hash), /cannot be sent again/); s.store.close();
});
test('answering a question does not mark a repair complete', () => {
  const s = setup(); s.event('parts_delayed'); const q = s.store.brief(s.c.id).questions[0]; s.store.resolveQuestion(s.c.id, q.id, 'Supplier says Friday, source: phone note.');
  assert.equal(s.store.brief(s.c.id).questions[0].resolved, true); assert.equal(s.store.brief(s.c.id).reportedStage, 'Parts delayed'); s.store.close();
});
test('follow-ups persist actions, validate time zones, and never send', () => {
  const s = setup(); const f = s.service.followup({ caseId: s.c.id, requestId: randomUUID(), action: 'create', title: 'Ask for an ETA', dueAt: new Date(Date.now() + 86400000).toISOString(), timezone: 'Asia/Kolkata' });
  assert.equal(s.store.get<Followup>('followup', f.id, s.c.id).timezone, 'Asia/Kolkata');
  const completed = s.service.followup({ caseId: s.c.id, requestId: randomUUID(), action: 'complete', followupId: f.id, timezone: 'Asia/Kolkata' }); assert.equal(completed.status, 'completed');
  assert.throws(() => s.service.followup({ caseId: s.c.id, requestId: randomUUID(), action: 'create', title: 'Bad', dueAt: '2020-01-01T00:00:00Z', timezone: 'Not/AZone' }), /valid IANA/); assert.equal(s.deliveries(), 0); s.store.close();
});

test('rescheduling preserves edited follow-up details and can clear a related question', () => {
  const s = setup();
  try {
    s.event('parts_delayed'); s.event('loaner_needed');
    const questions = s.store.brief(s.c.id).questions;
    const parts = questions.find(q => q.kind === 'parts')!;
    const loaner = questions.find(q => q.kind === 'loaner')!;
    const f = s.service.followup({ caseId: s.c.id, requestId: randomUUID(), action: 'create', title: 'Ask about parts', questionId: parts.id, dueAt: new Date(Date.now() + 86400000).toISOString(), timezone: 'Asia/Kolkata' });
    const input = { caseId: s.c.id, requestId: randomUUID(), action: 'reschedule' as const, followupId: f.id, title: 'Ask about temporary equipment', questionId: loaner.id, dueAt: new Date(Date.now() + 172800000).toISOString(), timezone: 'America/New_York' };
    const edited = s.service.followup(input);
    assert.equal(edited.title, input.title); assert.equal(edited.questionId, loaner.id); assert.equal(edited.timezone, input.timezone);
    assert.deepEqual(s.service.followup(input), edited);
    const unchanged = s.service.followup({ caseId: s.c.id, requestId: randomUUID(), action: 'reschedule', followupId: f.id, dueAt: new Date(Date.now() + 259200000).toISOString(), timezone: 'America/New_York' });
    assert.equal(unchanged.title, input.title); assert.equal(unchanged.questionId, loaner.id);
    const cleared = s.service.followup({ caseId: s.c.id, requestId: randomUUID(), action: 'reschedule', followupId: f.id, questionId: null, dueAt: new Date(Date.now() + 345600000).toISOString(), timezone: 'America/New_York' });
    assert.equal(cleared.questionId, null); assert.equal(s.store.get<Followup>('followup', f.id, s.c.id).title, input.title);
    assert.equal(s.deliveries(), 0);
  } finally { s.store.close(); }
});
test('HTML escapes imported markup, exports redact known identity', () => {
  const s = setup(); s.event('provider_silent', 'Maya contacted Test Supplier. <script>alert(1)</script> repairs@example.com CASE-TEST');
  const html = s.service.export({ caseId: s.c.id, format: 'html', redact: true }).content; assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'));
  const json = s.service.export({ caseId: s.c.id, format: 'json', redact: true }).content;
  for (const identity of ['Maya', 'Test Supplier', 'repairs@example.com', 'CASE-TEST']) assert.ok(!json.includes(identity)); s.store.close();
});

test('exports distinguish stale drafts without changing stored message status or content', () => {
  const s = setup();
  try {
    s.event('parts_delayed'); const draft = s.draft();
    const packet = () => JSON.parse(s.service.export({ caseId: s.c.id, format: 'json', redact: false }).content);
    assert.equal(packet().messages[0].stale, false); assert.equal(packet().messages[0].displayStatus, 'draft');
    s.event('other', 'A new update arrived.');
    const before = s.store.brief(s.c.id); const message = packet().messages[0];
    assert.equal(message.status, 'draft'); assert.equal(message.stale, true); assert.equal(message.displayStatus, 'Stale draft');
    assert.equal(message.body, draft.body); assert.deepEqual(message.sourceIds, draft.sourceIds);
    const html = s.service.export({ caseId: s.c.id, format: 'html', redact: false }).content;
    assert.match(html, /Stale draft/); assert.match(html, /Historical request/); assert.match(html, /Prepare and review a fresh request before acting/);
    assert.deepEqual(s.store.brief(s.c.id), before); assert.equal(s.deliveries(), 0);
  } finally { s.store.close(); }
});

test('exported completed or uncertain message attempts never acquire a stale-draft label', () => {
  const s = setup();
  try {
    s.event('parts_delayed'); const draft = s.draft(); s.event('other');
    for (const status of ['sending', 'sent', 'captured', 'unknown', 'failed'] as const) {
      s.store.put('draft', { ...draft, status });
      const message = JSON.parse(s.service.export({ caseId: s.c.id, format: 'json', redact: false }).content).messages[0];
      assert.equal(message.status, status); assert.equal(message.displayStatus, status); assert.equal(message.stale, false);
      assert.ok(!s.service.export({ caseId: s.c.id, format: 'html', redact: false }).content.includes('Stale draft'));
    }
  } finally { s.store.close(); }
});

test('exports keep numbered sources stable across backdated updates and corrections while retaining record IDs', () => {
  const s = setup();
  try {
    const original = s.event('parts_delayed', 'Original report.'); const old = s.draft();
    const backdated = s.event('other', 'An older reported update.', { occurredAt: '2025-01-01T10:00:00Z' });
    const correction = s.event('parts_delayed', 'Corrected report.', { supersedesId: original.id });
    const current = s.draft(); const before = s.store.brief(s.c.id);
    const data = JSON.parse(s.service.export({ caseId: s.c.id, format: 'json', redact: false }).content);
    assert.deepEqual(data.events.map((e: { id: string; sourceLabel: string }) => [e.id, e.sourceLabel]), [[original.id, 'Source 1'], [backdated.id, 'Source 2'], [correction.id, 'Source 3']]);
    assert.deepEqual(data.questions[0].sourceIds, [correction.id]); assert.deepEqual(data.questions[0].sourceLabels, ['Source 3']);
    assert.deepEqual(data.messages[0].sourceLabels, ['Source 1']); assert.deepEqual(data.messages[1].sourceLabels, ['Source 3']);
    assert.equal(data.messages[0].body, old.body); assert.equal(data.messages[1].body, current.body);
    const html = s.service.export({ caseId: s.c.id, format: 'html', redact: false }).content;
    for (const [index, event] of [original, backdated, correction].entries()) {
      assert.ok(html.includes(`id="source-${event.id}"`)); assert.ok(html.includes(`Source ${index + 1} |`)); assert.ok(html.includes(`Record ID: ${event.id}`));
    }
    assert.ok(html.includes(`Corrects <a href="#source-${original.id}">Source 1</a>`));
    assert.ok(html.includes(`href="#source-${correction.id}">Source 3</a>`));
    assert.deepEqual(s.store.brief(s.c.id), before);
  } finally { s.store.close(); }
});

test('export source links come from recorded provenance and never rewrite arbitrary message citations', () => {
  const s = setup();
  try {
    s.event('parts_delayed');
    const body = 'User wording [source 99]. <script>unsafe()</script>';
    s.service.prepare({ caseId: s.c.id, requestId: randomUUID(), recipientId: s.contact.id, questionIds: s.store.brief(s.c.id).questions.map(q => q.id), body });
    const data = JSON.parse(s.service.export({ caseId: s.c.id, format: 'json', redact: false }).content);
    assert.equal(data.messages[0].body, body); assert.deepEqual(data.messages[0].sourceLabels, ['Source 1']);
    const html = s.service.export({ caseId: s.c.id, format: 'html', redact: false }).content;
    assert.ok(html.includes('[source 99]')); assert.ok(html.includes('&lt;script&gt;unsafe()&lt;/script&gt;')); assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('>Source 99</a>'));
  } finally { s.store.close(); }
});
test('deleting a case removes events, requests, approvals and chats', () => {
  const s = setup(); s.event('parts_delayed'); const d = s.draft(); s.service.issueApproval(s.c.id, d.id, d.hash); s.store.chat(s.c.id, 'user', 'Private text'); s.store.deleteCase(s.c.id);
  for (const table of ['records', 'requests', 'approvals']) assert.equal(s.store.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n, 0); s.store.close();
});

test('redaction covers known identity in the equipment description too', () => {
  const s = setup(); const repairCase = s.store.createCase({ title: 'Repair', person: 'Test Identity', equipment: "Test Identity's wheelchair", reference: '', category: 'Other', fictional: true });
  for (const format of ['html', 'json'] as const) {
    const packet = s.service.export({ caseId: repairCase.id, format, redact: true });
    assert.ok(!packet.content.includes('Test Identity')); assert.match(packet.content, /redacted/);
  }
  s.store.close();
});
test('SQLite survives restart; interrupted sends become unknown', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mobility-test-')); const file = join(directory, 'cases.sqlite'); let store = new Store(file);
  try { const c = store.createCase({ title: 'Stored', person: 'Test', equipment: 'Chair', reference: '', category: 'Other', fictional: true }); store.put('draft', { id: randomUUID(), caseId: c.id, status: 'sending' }); store.close(); store = new Store(file); assert.equal(store.case(c.id).title, 'Stored'); assert.equal(store.list<Draft>('draft', c.id)[0].status, 'unknown'); } finally { store.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(directory.includes('mobility-test-')); rmSync(directory, { recursive: true, force: true }); }
});
test('tool schemas reject invalid timestamps and arbitrary imported fields', () => {
  assert.equal(toolSchemas.record_repair_event.safeParse({ caseId: randomUUID(), requestId: randomUUID(), party: 'supplier', source: 'email', channel: 'Email', occurredAt: 'yesterday', text: 'Reported', stage: 'other' }).success, false);
  assert.equal(toolSchemas.send_approved_request.safeParse({ caseId: randomUUID(), draftId: randomUUID(), approvalToken: 'x'.repeat(64), autoApprove: true }).success, false);
});
