import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../server/store.js';
import { RepairService } from '../server/service.js';
import { readReply } from '../server/conversation.js';
import type { Party, Stage } from '../shared/types.js';

function setup() {
  const store = new Store(':memory:');
  const repair = store.createCase({ title: 'Fictional offset case', person: 'Fictional person', equipment: 'Chair', reference: 'OFFSET-QA', category: 'Paperwork', fictional: true });
  const contact = store.saveContact({ caseId: repair.id, name: 'Fictional supplier', role: 'supplier', email: 'supplier@example.invalid', verified: false });
  const service = new RepairService(store, { mode: 'capture', send: async () => { throw new Error('Timestamp checks must never deliver email.'); } });
  const event = (stage: Stage, occurredAt: string, party: Party = 'supplier') => store.recordEvent({ caseId: repair.id, requestId: randomUUID(), party, source: `Fictional ${party}`, channel: 'Email', text: `Reported ${stage}`, stage, occurredAt, reference: '', supersedesId: null });
  return { store, repair, contact, service, event };
}

test('different UTC offsets order reports by actual instant, not timestamp spelling', () => {
  const s = setup();
  try {
    const approved = s.event('authorization_approved', '2026-01-02T00:30:00+05:30');
    const pending = s.event('authorization_pending', '2026-01-01T23:30:00Z');
    const brief = s.store.brief(s.repair.id);
    assert.deepEqual(s.store.activeEvents(s.repair.id).map(event => event.id), [approved.id, pending.id]);
    assert.equal(brief.reportedStage, 'Authorization pending'); assert.ok(brief.questions.some(question => question.kind === 'approval'));
    assert.match(readReply(brief, { view: 'supplier' }).reply, /Reported authorization_pending/);
  } finally { s.store.close(); }
});

test('equal report instants use recorded time as the chronological tie breaker', () => {
  const s = setup();
  try {
    const approved = s.event('authorization_approved', '2026-01-02T00:00:00+05:30');
    const pending = s.event('authorization_pending', '2026-01-01T18:30:00Z');
    s.store.put('event', { ...approved, recordedAt: '2026-01-01T19:00:00Z' });
    s.store.put('event', { ...pending, recordedAt: '2026-01-01T20:00:00Z' }); s.store.syncQuestions(s.repair.id);
    assert.deepEqual(s.store.activeEvents(s.repair.id).map(event => event.id), [approved.id, pending.id]);
    assert.equal(s.store.brief(s.repair.id).reportedStage, 'Authorization pending');
  } finally { s.store.close(); }
});

test('next follow-up uses the earliest instant even when UTC-offset text sorts differently', () => {
  const s = setup();
  try {
    const early = new Date(Date.now() + 86400000); early.setUTCHours(22, 30, 0, 0);
    const earlier = early.toISOString(); const laterInstant = new Date(early.getTime() + 3600000);
    const later = `${new Date(laterInstant.getTime() + 5.5 * 3600000).toISOString().slice(0, -1)}+05:30`;
    for (const [title, dueAt] of [['Earlier UTC check', earlier], ['Later offset check', later]]) s.service.followup({ caseId: s.repair.id, requestId: randomUUID(), action: 'create', title, dueAt, timezone: 'Asia/Kolkata' });
    // Reverse spelling: put the earlier instant in the larger positive offset.
    const brief = s.store.brief(s.repair.id);
    brief.followups[0].dueAt = `${new Date(early.getTime() + 14 * 3600000).toISOString().slice(0, -1)}+14:00`;
    assert.match(readReply(brief, { view: 'followups' }).reply, /Next: Earlier UTC check/);
  } finally { s.store.close(); }
});

test('UTC source labels normalize offset dates while raw evidence timestamps remain unchanged', () => {
  const s = setup();
  try {
    const sent = s.event('paperwork_sent', '2026-01-02T00:15:00+05:30');
    s.event('paperwork_requested', '2026-01-02T01:00:00+05:30', 'insurer');
    const brief = s.store.brief(s.repair.id); const receipt = brief.questions.find(question => question.kind === 'receipt')!;
    assert.match(readReply(brief, { view: 'question', questionId: receipt.id }).reply, /Source 1, 2026-01-01 UTC/);
    const draft = s.service.prepare({ caseId: s.repair.id, requestId: randomUUID(), recipientId: s.contact.id, questionIds: [receipt.id] });
    assert.match(draft.body, /2026-01-01 UTC \| Fictional supplier/);
    const html = s.service.export({ caseId: s.repair.id, format: 'html', redact: true });
    assert.match(html.content, /Source 1 \| 2026-01-01 UTC/);
    const json = JSON.parse(s.service.export({ caseId: s.repair.id, format: 'json', redact: true }).content);
    assert.equal(json.events[0].occurredAt, sent.occurredAt); assert.equal(s.store.brief(s.repair.id).events[0].occurredAt, sent.occurredAt);
  } finally { s.store.close(); }
});
