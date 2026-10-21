import { randomUUID } from 'node:crypto';
import type { Brief, Question, ReplyPreview } from '../shared/types.js';
import { AppError, hash, Store } from './store.js';
import { replyPreviewSchema } from './schemas.js';

type ReplyInput = ReturnType<typeof replyPreviewSchema.parse>;

// Deliberately narrow recognition: explicit source wording, not general NLP.
// Ambiguous or unsupported replies remain recordable without closing any question.
function appointmentClaim(input: ReplyInput): string | undefined {
  if (input.party !== 'supplier') return;
  const match = /^(Your repair appointment is confirmed for (\d{4}-\d{2}-\d{2}) at (\d{2}:\d{2}) UTC([+-])(\d{2}):(\d{2})\.?)(?:\s+Reference [A-Z0-9-]{1,100}\.?)?$/i.exec(input.text.trim());
  if (!match) return;
  const [, quote, date, time, sign, hours, minutes] = match;
  const calendar = new Date(`${date}T00:00:00Z`);
  const offsetHours = Number(hours); const offsetMinutes = Number(minutes);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== date || Number(time.slice(0, 2)) > 23 || Number(time.slice(3)) > 59 || offsetHours > 14 || offsetMinutes > 59 || (offsetHours === 14 && offsetMinutes !== 0)) return;
  const scheduledAt = Date.parse(`${date}T${time}:00${sign}${hours}:${minutes}`);
  if (!Number.isFinite(scheduledAt) || scheduledAt <= Date.parse(input.occurredAt)) return;
  return quote;
}

function claims(input: ReplyInput) {
  const sentences = input.text.match(/[^.!?\n]+[.!?]?/g)?.map(s => s.trim()).filter(Boolean) ?? [];
  const ambiguous = /\b(?:not|no|never|cannot|unable|unsure|unconfirmed|unverified|wrong|incorrect|different|another|if|unless|when|whether|might|may|could|would|will|ignore|instructions?|pretend|example|quoted)\b|n['\u2019]t\b|[?]/i.test(input.text);
  const receipt = !ambiguous && input.party === 'insurer' ? sentences.find(s => /^we (?:have )?(?:now )?received (?:the |your )?(?:repair )?(?:estimate|paperwork|documents)\.?$/i.test(s)) : undefined;
  const pending = !ambiguous && input.party === 'insurer' && sentences.some(s => /^(?:(?:the |your )?authorization|approval)(?: request)? (?:is (?:still )?|remains )?pending\.?$/i.test(s));
  return { receipt, pending, appointment: appointmentClaim(input) };
}

export function previewReply(brief: Brief, input: ReplyInput, questionHistory: Question[] = brief.questions): ReplyPreview {
  if (input.caseId !== brief.repairCase.id) throw new AppError('The reply belongs to a different case.', 409);
  if (input.supersedesId) throw new AppError('Use Correct source for corrections; review replies as new sources.');
  const proposed = claims(input);
  const event = { caseId: input.caseId, party: input.party, source: input.source, channel: input.channel, occurredAt: input.occurredAt, text: input.text, stage: input.stage ?? (proposed.pending ? 'authorization_pending' : proposed.appointment ? 'appointment_scheduled' : 'other'), reference: input.reference, supersedesId: input.supersedesId };
  // Run the existing stage/question rules in an isolated database, never on the case.
  const scratch = new Store(':memory:');
  let projected: Brief;
  try {
    scratch.db.prepare('INSERT INTO cases VALUES (?,?)').run(brief.repairCase.id, JSON.stringify(brief.repairCase));
    for (const item of brief.events) scratch.put('event', item);
    for (const item of questionHistory) scratch.put('question', item);
    scratch.recordEvent({ ...event, requestId: randomUUID() });
    projected = scratch.brief(input.caseId);
  } finally { scratch.close(); }
  const receipt = brief.questions.find(q => q.kind === 'receipt' && !q.resolved);
  const answers = receipt && proposed.receipt && projected.questions.some(q => q.id === receipt.id && !q.resolved)
    ? [{ questionId: receipt.id, title: receipt.title, quote: proposed.receipt }] : [];
  const appointment = brief.questions.find(q => q.kind === 'appointment' && !q.resolved);
  const newerAppointment = appointment && brief.events.some(e => appointment.sourceIds.includes(e.id) && Date.parse(e.occurredAt) > Date.parse(input.occurredAt));
  if (appointment && proposed.appointment && event.stage === 'appointment_scheduled' && !newerAppointment && projected.questions.some(q => q.id === appointment.id && !q.resolved)) answers.push({ questionId: appointment.id, title: appointment.title, quote: proposed.appointment });
  const invalidatedDraftIds = brief.drafts.filter(d => d.status === 'draft' && d.caseVersion === brief.repairCase.version).map(d => d.id);
  // Exclude random projected IDs/timestamps. Bind the source, version and allowed answers.
  const previewHash = hash(JSON.stringify({ event, version: brief.repairCase.version, answers, invalidatedDraftIds }));
  return { event, caseVersion: brief.repairCase.version, previewHash,
    before: { stage: brief.reportedStage, openCount: brief.questions.filter(q => !q.resolved).length, nextStep: brief.nextStep },
    afterRecord: { stage: projected.reportedStage, questions: projected.questions.map(({ id, title, resolved }) => ({ id, title, resolved })) },
    answers, invalidatedDraftIds };
}
