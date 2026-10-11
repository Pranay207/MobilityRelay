import { randomUUID, randomBytes } from 'node:crypto';
import type { Contact, Draft, Followup, Question, RepairEvent } from '../shared/types.js';
import { Store, AppError, hash, now } from './store.js';
import { toolSchemas, type ToolName } from './schemas.js';

export interface MailDelivery { mode: 'capture' | 'smtp'; send: (draft: Draft) => Promise<string> }
export class RepairService {
  constructor(public store: Store, public mail: MailDelivery) {}
  async run(name: ToolName, args: unknown): Promise<unknown> {
    switch (name) {
      case 'get_repair_brief': return this.store.brief(toolSchemas[name].parse(args).caseId);
      case 'record_repair_event': return this.store.recordEvent(toolSchemas[name].parse(args));
      case 'prepare_repair_request': return this.prepare(toolSchemas[name].parse(args));
      case 'send_approved_request': return this.send(toolSchemas[name].parse(args));
      case 'manage_repair_followup': return this.followup(toolSchemas[name].parse(args));
      case 'export_repair_packet': return this.export(toolSchemas[name].parse(args));
    }
  }
  prepare(input: ReturnType<typeof toolSchemas.prepare_repair_request.parse>): Draft {
    const c = this.store.case(input.caseId);
    const contact = this.store.get<Contact>('contact', input.recipientId, input.caseId);
    const questions = input.questionIds.map(id => this.store.get<Question>('question', id, input.caseId));
    if (questions.some(q => q.resolved || q.active === false)) throw new AppError('A selected question has been answered or no longer applies. Refresh the case.', 409);
    return this.store.idempotent('draft', input.caseId, input.requestId, input, () => {
      const sourceIds = [...new Set(questions.flatMap(q => q.sourceIds))];
      const sources = sourceIds.map(id => this.store.get<RepairEvent>('event', id, input.caseId));
      const subject = input.subject ?? `Repair ${c.reference || c.title}: clarification requested`;
      if (/[\r\n]/.test(subject)) throw new AppError('The subject must be a single line.');
      const body = input.body ?? `Hello ${contact.name},\n\nI am following up on ${c.equipment}, reference ${c.reference || 'not provided'}.\n\nMy record contains these reported updates:\n${sources.map(e => `- ${e.occurredAt.slice(0, 10)} | ${e.source}: "${e.text}" [source ${e.id}]`).join('\n')}\n\nPlease clarify:\n${questions.map((q, i) => `${i + 1}. ${q.title} ${q.explanation}`).join('\n')}\n\nPlease include a named contact and the date of the next update. These are attributed reports; I am seeking clarification, not assigning fault.\n\nThank you,\n${c.person}`;
      const value: Draft = { id: randomUUID(), caseId: c.id, caseVersion: c.version, recipientId: contact.id, recipient: contact.email, subject, body, sourceIds, questionIds: questions.map(q => q.id), hash: hash(JSON.stringify({ recipient: contact.email, subject, body, sourceIds, version: c.version })), status: 'draft', createdAt: now(), deliveryId: null };
      this.store.put('draft', value); return value;
    });
  }
  issueApproval(caseId: string, draftId: string, expectedHash: string): string {
    const draft = this.store.get<Draft>('draft', draftId, caseId);
    this.validateDraft(draft);
    if (draft.hash !== expectedHash) throw new AppError('The reviewed message does not match this draft.', 409);
    const token = randomBytes(32).toString('hex');
    this.store.db.prepare('INSERT INTO approvals (tokenHash,caseId,draftId,draftHash,expires) VALUES (?,?,?,?,?)').run(hash(token), caseId, draftId, draft.hash, Date.now() + 120_000);
    return token;
  }
  validateDraft(draft: Draft) {
    if (draft.status !== 'draft') throw new AppError(`This request is ${draft.status}; it cannot be sent again.`, 409);
    if (draft.caseVersion !== this.store.case(draft.caseId).version) throw new AppError('The case changed after this draft was prepared. Prepare and review a fresh draft.', 409);
    if (draft.questionIds.some(id => { const q = this.store.get<Question>('question', id, draft.caseId); return q.resolved || q.active === false; })) throw new AppError('The questions changed. Prepare and review a fresh draft.', 409);
    const contact = this.store.get<Contact>('contact', draft.recipientId, draft.caseId);
    if (contact.email !== draft.recipient) throw new AppError('The recipient changed. Prepare a fresh draft.', 409);
    if (this.mail.mode === 'smtp' && (!contact.verified || /\.(example|invalid|test|localhost)$/i.test(contact.email))) throw new AppError('Confirm a real recipient address in Contacts before sending externally.');
  }
  async send(input: ReturnType<typeof toolSchemas.send_approved_request.parse>): Promise<Draft> {
    const draft = this.store.get<Draft>('draft', input.draftId, input.caseId);
    this.store.transaction(() => {
      this.validateDraft(draft);
      const approval = this.store.db.prepare('SELECT * FROM approvals WHERE tokenHash=? AND caseId=? AND draftId=?').get(hash(input.approvalToken), input.caseId, input.draftId);
      if (!approval || approval.consumed || Number(approval.expires) < Date.now() || approval.draftHash !== draft.hash) throw new AppError('A fresh approval of this exact message is required.', 403);
      this.store.db.prepare('UPDATE approvals SET consumed=1 WHERE tokenHash=?').run(hash(input.approvalToken));
      this.store.put('draft', { ...draft, status: 'sending' });
    });
    let deliveryId: string;
    try { deliveryId = await this.mail.send(draft); }
    catch {
      this.store.put('draft', { ...draft, status: 'unknown' });
      throw new AppError('Delivery could not be confirmed. Check the mail provider before creating another request. No automatic retry was made.', 502);
    }
    const result: Draft = { ...draft, status: this.mail.mode === 'capture' ? 'captured' : 'sent', deliveryId };
    this.store.transaction(() => {
      this.store.put('draft', result);
      this.store.put('event', { id: randomUUID(), caseId: draft.caseId, party: 'user', source: this.mail.mode === 'capture' ? 'MobilityRelay local outbox' : 'MobilityRelay - SMTP acceptance', channel: this.mail.mode === 'capture' ? 'Local capture' : 'Email', occurredAt: now(), recordedAt: now(), text: this.mail.mode === 'capture' ? `Saved locally, not delivered: ${draft.subject}` : `Mail provider accepted a request to ${draft.recipient}: ${draft.subject}. This does not confirm receipt or a response.`, stage: 'other', reference: deliveryId, supersedesId: null } satisfies RepairEvent);
      this.store.bump(draft.caseId);
    });
    return result;
  }
  followup(input: ReturnType<typeof toolSchemas.manage_repair_followup.parse>): Followup {
    this.store.case(input.caseId);
    try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { throw new AppError('Choose a valid IANA time zone.'); }
    if (input.questionId) this.store.get<Question>('question', input.questionId, input.caseId);
    if (input.action === 'create' || input.action === 'reschedule') {
      if (!input.dueAt || Date.parse(input.dueAt) <= Date.now()) throw new AppError('Choose a future follow-up time.');
    }
    return this.store.idempotent('followup', input.caseId, input.requestId, input, () => {
      if (input.action === 'create') {
        if (!input.title) throw new AppError('A follow-up title is required.');
        const value: Followup = { id: randomUUID(), caseId: input.caseId, questionId: input.questionId ?? null, title: input.title, dueAt: input.dueAt!, timezone: input.timezone, status: 'scheduled', createdAt: now() };
        this.store.put('followup', value); return value;
      }
      if (!input.followupId) throw new AppError('Choose an existing follow-up.');
      const prior = this.store.get<Followup>('followup', input.followupId, input.caseId);
      const value: Followup = { ...prior, dueAt: input.dueAt ?? prior.dueAt, timezone: input.timezone, ...(input.action === 'reschedule' ? { title: input.title ?? prior.title, questionId: input.questionId === undefined ? prior.questionId : input.questionId } : {}), status: input.action === 'cancel' ? 'cancelled' : input.action === 'complete' ? 'completed' : 'scheduled' };
      this.store.put('followup', value); return value;
    });
  }
  export(input: ReturnType<typeof toolSchemas.export_repair_packet.parse>) {
    const brief = this.store.brief(input.caseId);
    const replacements = [brief.repairCase.person, brief.repairCase.reference, ...brief.contacts.flatMap(c => [c.name, c.email])].filter(Boolean).sort((a, b) => b.length - a.length);
    const redact = (s: string) => input.redact ? replacements.reduce((value, token) => value.split(token).join('[redacted]'), s).replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email redacted]').replace(/(?:\+\d[\d .()-]{8,}\d)/g, '[phone redacted]') : s;
    const data = { generatedAt: now(), fictional: brief.repairCase.fictional, redacted: input.redact, note: 'User-maintained attributed reports. Not independently verified. Review for personal information before sharing. No medical or legal advice.', repairCase: { title: redact(brief.repairCase.title), person: redact(brief.repairCase.person), equipment: redact(brief.repairCase.equipment), reference: redact(brief.repairCase.reference) }, events: brief.events.map(e => ({ ...e, source: redact(e.source), text: redact(e.text), reference: redact(e.reference) })), questions: brief.questions.map(q => ({ ...q, answer: redact(q.answer) })), followups: brief.followups.map(f => ({ ...f, title: redact(f.title) })), messages: brief.drafts.map(d => ({ status: d.status, createdAt: d.createdAt, subject: redact(d.subject), body: redact(d.body), recipient: redact(d.recipient), sourceIds: d.sourceIds })) };
    if (input.format === 'json') return { filename: 'repair-history.json', mime: 'application/json', content: JSON.stringify(data, null, 2) };
    const esc = (s: string) => s.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
    const content = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MobilityRelay case history</title><style>body{font:16px/1.6 system-ui;max-width:850px;margin:40px auto;padding:24px;color:#203029}h1,h2{line-height:1.2}article{border-top:1px solid #ccc;padding:20px 0;break-inside:avoid}blockquote{margin:12px 0;white-space:pre-wrap}small{color:#52665b}li{margin:12px 0}@media print{body{margin:0}button{display:none}}</style><h1>MobilityRelay case history</h1><p>${esc(data.repairCase.title)} | ${esc(data.repairCase.equipment)} | ${esc(data.repairCase.reference)}</p><p>${data.fictional ? 'FICTIONAL DEMONSTRATION CASE. ' : ''}${esc(data.note)}</p><small>Exported ${esc(data.generatedAt)}. ${input.redact ? 'Identity redaction enabled.' : 'Identity redaction disabled.'}</small><h2>Open questions and answers</h2><ul>${data.questions.map(q => `<li><strong>${esc(q.title)}</strong> - ${q.resolved ? `Answered: ${esc(q.answer)}` : 'Unresolved'}<br><small>Sources: ${esc(q.sourceIds.join(', '))}</small></li>`).join('')}</ul><h2>Attributed history</h2>${data.events.map(e => `<article><strong>${esc(e.occurredAt.slice(0, 10))} | ${esc(e.source)}</strong><br><small>${esc(e.party)} / ${esc(e.channel)} / Source ${esc(e.id)}${e.supersedesId ? ` / Corrects source ${esc(e.supersedesId)}` : ''}</small><blockquote>${esc(e.text)}</blockquote></article>`).join('')}<h2>Message history</h2>${data.messages.map(m => `<article><strong>${esc(m.subject)} | ${esc(m.status)}</strong><p>${esc(m.recipient)}</p><blockquote>${esc(m.body)}</blockquote></article>`).join('')}<h2>Follow-ups</h2><ul>${data.followups.map(f => `<li>${esc(f.title)} | ${esc(f.dueAt)} | ${esc(f.status)}</li>`).join('')}</ul></html>`;
    return { filename: 'repair-history.html', mime: 'text/html', content };
  }
}
