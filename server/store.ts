import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Brief, ChatMessage, Contact, Draft, Question, RepairCase, RepairEvent } from '../shared/types.js';
import { stageLabels } from '../shared/types.js';

export const now = () => new Date().toISOString();
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export type NewEvent = Omit<RepairEvent, 'id' | 'recordedAt'> & { requestId: string };

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, caseId TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_case ON records(caseId,kind);
      CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, caseId TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE, fingerprint TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS approvals (tokenHash TEXT PRIMARY KEY, caseId TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE, draftId TEXT NOT NULL, draftHash TEXT NOT NULL, expires INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0);`);
    // Interrupted deliveries must never silently become eligible for automatic retry.
    for (const row of this.db.prepare("SELECT payload FROM records WHERE kind='draft'").all()) {
      const draft = JSON.parse(String(row.payload)) as Draft;
      if (draft.status === 'sending') this.put('draft', { ...draft, status: 'unknown' });
    }
    for (const repairCase of this.cases()) this.syncQuestions(repairCase.id);
  }
  close() { this.db.close(); }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  cases(): RepairCase[] { return this.db.prepare('SELECT payload FROM cases').all().map(row => JSON.parse(String(row.payload))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  case(id: string): RepairCase {
    const row = this.db.prepare('SELECT payload FROM cases WHERE id=?').get(id);
    if (!row) throw new AppError('Case not found.', 404);
    return JSON.parse(String(row.payload));
  }
  createCase(data: Pick<RepairCase, 'title' | 'person' | 'equipment' | 'reference' | 'category' | 'fictional'>): RepairCase {
    const value = { ...data, id: randomUUID(), version: 1, createdAt: now(), updatedAt: now() };
    this.db.prepare('INSERT INTO cases VALUES (?,?)').run(value.id, JSON.stringify(value));
    return value;
  }
  bump(caseId: string) {
    const value = this.case(caseId); value.version++; value.updatedAt = now();
    this.db.prepare('UPDATE cases SET payload=? WHERE id=?').run(JSON.stringify(value), caseId);
  }
  list<T>(kind: string, caseId: string): T[] {
    this.case(caseId);
    return this.db.prepare('SELECT payload FROM records WHERE kind=? AND caseId=? ORDER BY rowid').all(kind, caseId).map(row => JSON.parse(String(row.payload)));
  }
  get<T>(kind: string, id: string, caseId: string): T {
    this.case(caseId);
    const row = this.db.prepare('SELECT payload FROM records WHERE id=? AND kind=? AND caseId=?').get(id, kind, caseId);
    if (!row) throw new AppError('Record not found in this case.', 404);
    return JSON.parse(String(row.payload));
  }
  put<T extends { id: string; caseId: string }>(kind: string, item: T) {
    this.db.prepare('INSERT INTO records VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(item.id, kind, item.caseId, JSON.stringify(item));
  }
  idempotent<T>(kind: string, caseId: string, requestId: string, input: unknown, fn: () => T): T {
    const id = `${caseId}:${kind}:${requestId}`;
    const fingerprint = hash(JSON.stringify(input));
    const prior = this.db.prepare('SELECT fingerprint,payload FROM requests WHERE id=?').get(id);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw new AppError('This request ID was already used with different content.', 409);
      return JSON.parse(String(prior.payload));
    }
    return this.transaction(() => {
      const result = fn();
      this.db.prepare('INSERT INTO requests VALUES (?,?,?,?)').run(id, caseId, fingerprint, JSON.stringify(result));
      return result;
    });
  }
  recordEvent(input: NewEvent): RepairEvent {
    this.case(input.caseId);
    return this.idempotent('event', input.caseId, input.requestId, input, () => {
      if (Date.parse(input.occurredAt) > Date.now() + 300_000) throw new AppError('Use the date this update was reported. Put any future appointment date in the statement itself.');
      if (input.supersedesId) {
        this.get<RepairEvent>('event', input.supersedesId, input.caseId);
        if (this.list<RepairEvent>('event', input.caseId).some(event => event.supersedesId === input.supersedesId)) throw new AppError('That source has already been corrected. Correct its latest replacement instead.', 409);
      }
      const { requestId: _, ...data } = input;
      const value: RepairEvent = { ...data, id: randomUUID(), recordedAt: now() };
      this.put('event', value); this.bump(input.caseId); this.syncQuestions(input.caseId);
      return value;
    });
  }
  activeEvents(caseId: string): RepairEvent[] {
    const all = this.list<RepairEvent>('event', caseId);
    const superseded = new Set(all.map(event => event.supersedesId));
    return all.filter(event => !superseded.has(event.id)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.recordedAt.localeCompare(b.recordedAt));
  }
  syncQuestions(caseId: string) {
    const events = this.activeEvents(caseId);
    const latest = (stage: RepairEvent['stage']) => events.findLast(event => event.stage === stage);
    const applicable = new Set<string>();
    const add = (kind: string, title: string, explanation: string, sources: (RepairEvent | undefined)[]) => {
      applicable.add(kind);
      const ids = sources.filter(Boolean).map(event => event!.id);
      const existing = this.list<Question>('question', caseId).find(q => q.kind === kind);
      if (existing) {
        const changed = ids.some(id => !existing.sourceIds.includes(id));
        this.put('question', { ...existing, sourceIds: ids, active: true, resolved: changed ? false : existing.resolved, answer: changed ? '' : existing.answer });
        return;
      }
      this.put('question', { id: randomUUID(), caseId, kind, title, explanation, sourceIds: ids, resolved: false, answer: '', createdAt: now(), active: true } satisfies Question);
    };
    const requested = latest('paperwork_requested'); const sent = latest('paperwork_sent'); const pending = latest('authorization_pending');
    if (sent && (requested || pending)) add('receipt', 'Was the paperwork received?', 'Sent and received are different steps. Ask for the submission date, recipient, and receipt reference. These updates do not establish fault.', [sent, requested, pending]);
    else if (requested) add('paperwork', 'Which document is still needed?', 'Ask for the exact document, who must provide it, and where it should be sent.', [requested]);
    const approved = latest('authorization_approved'); const ordered = latest('part_ordered');
    if (pending && (!approved || events.indexOf(pending) > events.indexOf(approved))) add('approval', 'What is blocking authorization?', 'Ask whether the request is received, complete, or under review. Pending does not identify the responsible party.', [pending]);
    if (approved && (!ordered || events.indexOf(approved) > events.indexOf(ordered))) add('order', 'Have the parts been ordered?', 'Ask for an order reference and expected arrival date.', [approved]);
    if (latest('coverage_refused')) add('coverage', 'Why was coverage refused?', 'Request the written reason and the available review process. This is a clarification request, not an insurance decision or legal appeal.', [latest('coverage_refused')]);
    if (latest('parts_delayed')) add('parts', 'When will the part be available?', 'Request the part reference, availability, expected arrival, and next update date.', [latest('part_ordered'), latest('parts_delayed')]);
    if (latest('technician_unavailable')) add('technician', 'What assessment or repair arrangements are available?', 'Ask for the next available professional, alternative arrangements, and a named coordinator.', [latest('technician_unavailable')]);
    if (latest('assessment_needed')) add('assessment', 'Who can arrange a professional assessment?', 'Describe the reported problem and request an assessment. Do not attempt mechanical diagnosis or repairs.', [latest('assessment_needed')]);
    if (latest('appointment_scheduled')) add('appointment', 'Is the repair visit confirmed?', 'Confirm the date, accessibility needs, and whether required parts will be ready.', [latest('appointment_scheduled')]);
    if (latest('provider_silent')) add('response', 'Who can respond to this request?', 'Ask for a named contact and a response date. A case history can be shared with a chosen advocate.', [latest('provider_silent')]);
    if (latest('loaner_needed')) add('loaner', 'Is suitable temporary equipment available?', 'Ask about availability, professional suitability assessment, and any cost or funding requirements.', [latest('loaner_needed')]);
    // Retain question history without treating corrected reports as current evidence.
    for (const question of this.list<Question>('question', caseId)) if (!applicable.has(question.kind) && question.active !== false) this.put('question', { ...question, active: false });
  }
  saveContact(input: Omit<Contact, 'id'> & { id?: string }): Contact {
    this.case(input.caseId);
    if (input.id) this.get<Contact>('contact', input.id, input.caseId);
    const contact = { ...input, id: input.id ?? randomUUID() };
    this.transaction(() => { this.put('contact', contact); this.bump(input.caseId); });
    return contact;
  }
  resolveQuestion(caseId: string, id: string, answer: string): Question {
    const question = this.get<Question>('question', id, caseId);
    if (question.active === false) throw new AppError('This question no longer applies to the current reports. Refresh the case.', 409);
    const value = { ...question, resolved: true, answer };
    this.transaction(() => {
      this.put('question', value);
      this.put('event', { id: randomUUID(), caseId, party: 'user', source: 'User-recorded answer', channel: 'Personal note', occurredAt: now(), recordedAt: now(), text: `${question.title}\n${answer}`, stage: 'other', reference: question.id, supersedesId: null } satisfies RepairEvent);
      this.bump(caseId);
    });
    return value;
  }
  brief(caseId: string): Brief {
    const repairCase = this.case(caseId);
    const events = this.list<RepairEvent>('event', caseId);
    const questions = this.list<Question>('question', caseId).filter(q => q.active !== false);
    const last = this.activeEvents(caseId).findLast(event => event.stage !== 'other');
    return { repairCase, events, questions, contacts: this.list('contact', caseId), drafts: this.list('draft', caseId), followups: this.list('followup', caseId), reportedStage: last ? stageLabels[last.stage] : 'Awaiting first update', nextStep: questions.find(q => !q.resolved)?.title ?? 'Record the next update or review the case history.' };
  }
  chat(caseId: string, role: ChatMessage['role'], text: string, traces: ChatMessage['traces'] = []): ChatMessage {
    const message = { id: randomUUID(), caseId, role, text, traces, createdAt: now() }; this.put('chat', message); return message;
  }
  deleteCase(id: string) { this.case(id); this.db.prepare('DELETE FROM cases WHERE id=?').run(id); }
}
