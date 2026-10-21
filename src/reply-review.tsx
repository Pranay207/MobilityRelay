import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FileText, LoaderCircle } from 'lucide-react';
import type { Brief, Party, RepairEvent, ReplyPreview, Stage, ToolTrace, UpdateProposal } from '../shared/types';
import { stages, stageLabels } from '../shared/types';
import { api } from './api';

const localDate = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function ReplyReview({ brief, proposal, busy, onTraces, onSave }: { brief: Brief; proposal?: UpdateProposal; busy: boolean; onTraces: (traces: ToolTrace[]) => void; onSave: (data: Record<string, unknown>) => void }) {
  const [input, setInput] = useState({ party: proposal?.party ?? '' as Party | '', source: proposal?.source ?? '', channel: proposal?.channel ?? 'Email', date: localDate(), text: proposal?.text ?? '', reference: '', stage: '' as Stage | '' });
  const [preview, setPreview] = useState<ReplyPreview | null>(null); const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null); const requestId = useRef(crypto.randomUUID());
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => {
    if (!preview) return;
    reviewHeading.current?.closest('dialog')?.scrollTo({ top: 0 });
    reviewHeading.current?.focus({ preventScroll: true });
  }, [preview]);
  useEffect(() => { setConfirmed(false); }, [brief.repairCase.version]);
  const changed = (data: Partial<typeof input>) => { setInput(current => ({ ...current, ...data })); setConfirmed(false); };
  const stale = !!preview && preview.caseVersion !== brief.repairCase.version;
  const remaining = preview?.afterRecord.questions.filter(q => !q.resolved && !selected.includes(q.id)) ?? [];
  const edit = () => { controller.current?.abort(); setPreview(null); setSelected([]); setConfirmed(false); setError(''); };
  const preparePreview = async () => {
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setLoading(true); setError(''); setConfirmed(false);
    try {
      const result = await api<{ data: ReplyPreview; traces: ToolTrace[] }>('/api/replies/preview', { method: 'POST', signal: current.signal, body: JSON.stringify({ caseId: brief.repairCase.id, party: input.party, source: input.source, channel: input.channel, occurredAt: new Date(input.date).toISOString(), text: input.text, reference: input.reference, ...(input.stage ? { stage: input.stage } : {}) }) });
      if (current.signal.aborted) return;
      requestId.current = crypto.randomUUID(); setPreview(result.data); setSelected([]); onTraces(result.traces);
    } catch (err) { if (!current.signal.aborted) setError(err instanceof Error ? err.message : 'Preview unavailable. Nothing was saved.'); }
    finally { if (!current.signal.aborted) setLoading(false); }
  };
  return <div className="reply-review">{error && <p role="alert" className="dialog-error">{error}</p>}{!preview ? <form className="dialog-form" onSubmit={e => { e.preventDefault(); void preparePreview(); }}>
    <div className="form-grid"><label>Reply from<select value={input.party} required disabled={loading} onChange={e => changed({ party: e.target.value as Party })}><option value="" disabled>Choose source role</option>{(['supplier', 'insurer', 'user', 'caregiver', 'advocate'] as Party[]).map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}</select></label><label>Channel<select value={input.channel} disabled={loading} onChange={e => changed({ channel: e.target.value as typeof input.channel })}>{['Email', 'Phone', 'Letter', 'Voice note', 'Web portal', 'Personal note'].map(c => <option key={c}>{c}</option>)}</select></label></div>
    <label>Source name<input value={input.source} onChange={e => changed({ source: e.target.value })} maxLength={150} required disabled={loading} /></label>
    <div className="form-grid"><label>Reported at<input type="datetime-local" value={input.date} onChange={e => changed({ date: e.target.value })} required disabled={loading} /></label><label>Reply reference<input value={input.reference} onChange={e => changed({ reference: e.target.value })} maxLength={100} disabled={loading} /></label></div>
    <label>Reply text<textarea value={input.text} onChange={e => changed({ text: e.target.value })} rows={6} maxLength={8000} required disabled={loading} /></label>
    <label>Reported situation<select value={input.stage} disabled={loading} onChange={e => changed({ stage: e.target.value as Stage | '' })}><option value="">Conservative suggestion</option>{stages.map(s => <option key={s} value={s}>{stageLabels[s]}</option>)}</select></label>
    <div className="form-footer"><button className="primary" disabled={loading || busy} type="submit">{loading ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}Preview changes</button></div>
  </form> : <div className="dialog-form">
    <h3 ref={reviewHeading} tabIndex={-1}>Review proposed changes</h3>
    <p className="reply-source">{preview.event.source} / {preview.event.party} / {preview.event.channel}<br /><time dateTime={preview.event.occurredAt}>{new Date(preview.event.occurredAt).toLocaleString('en-IN')}</time>{preview.event.reference && <> / {preview.event.reference}</>}</p>
    <blockquote className="reply-quote">{preview.event.text}</blockquote>
    <fieldset className="reply-answers"><legend>Answers to record</legend>{preview.answers.length ? preview.answers.map(a => <div className="reply-answer" key={a.questionId}><label className="checkline"><input type="checkbox" checked={selected.includes(a.questionId)} disabled={busy || stale} onChange={e => { setSelected(ids => e.target.checked ? [...ids, a.questionId] : ids.filter(id => id !== a.questionId)); setConfirmed(false); requestId.current = crypto.randomUUID(); }} /><span>{a.title}</span></label><blockquote>{a.quote}</blockquote></div>) : <p>No supported answer proposed. This reply can be recorded without answering a question.</p>}</fieldset>
    <section className="reply-comparison" aria-label="Before and after preview"><div><h4>Before</h4><strong>{preview.before.openCount} open</strong><p>{preview.before.stage}</p><p>Next: {preview.before.nextStep}</p></div><div><h4>After confirmation</h4><strong>{remaining.length} open</strong><p>{preview.afterRecord.stage}</p><p>Next: {remaining[0]?.title ?? 'Record the next update or review the case history.'}</p></div></section>
    {remaining.length > 0 && <section className="reply-remaining"><h4>Still unanswered</h4><ul>{remaining.map(q => <li key={q.id}>{q.title}</li>)}</ul></section>}
    <p className="mode-notice">{preview.invalidatedDraftIds.length ? `${preview.invalidatedDraftIds.length} current draft(s) will need fresh review. ` : ''}{preview.event.stage === 'appointment_scheduled' ? 'A confirmed appointment time does not confirm parts, accessibility arrangements or repair completion.' : 'Receipt is not authorization or a completed repair.'} Nothing has been saved or sent.</p>
    {stale && <p role="alert" className="mode-notice warning">The case changed. Return to the reply and preview again.</p>}
    <label className="checkline"><input type="checkbox" checked={confirmed} disabled={busy || stale} onChange={e => setConfirmed(e.target.checked)} /> I reviewed the source and selected answers.</label>
    <div className="reply-footer"><button className="secondary" disabled={busy} onClick={edit}><ArrowLeft size={16} />Edit reply</button><button className="primary" disabled={busy || stale || !confirmed} onClick={() => onSave({ ...preview.event, requestId: requestId.current, replyReview: { expectedVersion: preview.caseVersion, previewHash: preview.previewHash, answeredQuestionIds: selected, confirmed: true } })}>{busy ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Record reviewed reply</button></div>
  </div>}</div>;
}

export function ReplyChangesPanel({ event, onSource, onPrepare, canPrepare }: { event: RepairEvent; onSource: () => void; onPrepare: () => void; canPrepare: boolean }) {
  const review = event.review!;
  return <section className="reply-changes" aria-label="What changed"><div className="section-title"><h2>What changed?</h2><button className="text-button" onClick={onSource}><FileText size={14} />View reply source</button></div><p className="reply-source">At the review on {new Date(event.recordedAt).toLocaleString('en-IN')}</p><p><strong>{review.answeredTitles.length ? review.answeredTitles.join(' / ') : 'No questions answered'}</strong>{review.answeredTitles.length ? ' Answer recorded from the selected quotation.' : ' The reply was added as evidence only.'}</p><div className="reply-change-line"><span>{review.beforeOpenCount} open</span><ArrowRight size={16} aria-hidden="true" /><strong>{review.afterOpenCount} open</strong></div><p>{review.beforeStage} <ArrowRight size={14} aria-hidden="true" /> {review.afterStage}</p><p>Next at this review: <strong>{review.nextStep}</strong></p>{review.invalidatedDraftIds.length > 0 && <p>{review.invalidatedDraftIds.length} draft(s) required fresh review. Nothing was sent.</p>}<button className="text-button" disabled={!canPrepare} onClick={onPrepare}><ArrowRight size={16} />Prepare next request</button></section>;
}
