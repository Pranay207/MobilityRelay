import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Accessibility, X, Mic, MicOff, Send, Volume2, VolumeX, AudioLines, LoaderCircle, Terminal, FileText, Clock, Download } from 'lucide-react';
import type { ChatMessage, Settings, ToolTrace } from '../shared/types';

export function Brand({ children }: { children?: ReactNode }) {
  return <div className="brand"><span className="brand-mark" aria-hidden="true"><Accessibility size={27} /></span><span className="brand-copy"><span className="brand-name">MobilityRelay</span><span className="brand-description">Wheelchair repair coordination</span></span>{children}</div>;
}

export function IconButton({ label, children, onClick, disabled = false, className = '' }: { label: string; children: ReactNode; onClick: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" className={`icon-button ${className}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}>{children}</button>;
}
export const FeedbackContext = createContext({ error: '', busy: false });
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const { error, busy } = useContext(FeedbackContext);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const el = dialog.current!; const previous = document.activeElement as HTMLElement | null;
    el.showModal(); const cancel = (e: Event) => { e.preventDefault(); close.current(); };
    const wrapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = [...el.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], summary, [tabindex]')]
        .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0);
      const first = controls[0]; const last = controls.at(-1);
      if (!first || !last) { event.preventDefault(); el.focus(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    el.addEventListener('cancel', cancel);
    el.addEventListener('keydown', wrapFocus);
    return () => { el.removeEventListener('cancel', cancel); el.removeEventListener('keydown', wrapFocus); el.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className={`modal ${wide ? 'wide' : ''}`} aria-label={title} onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }}><div className="modal-header"><h2>{title}</h2><IconButton label="Close dialog" onClick={onClose} disabled={busy}><X size={20} /></IconButton></div>{error && <p className="dialog-error" role="alert">{error}</p>}{children}</dialog>;
}

interface RecognitionResult { results: ArrayLike<{ isFinal?: boolean; [index: number]: { transcript: string } }>; resultIndex: number }
interface Recognition { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void; abort(): void }
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
const cancelSpeech = () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); };
export const agentLabel = (settings: Settings | null) => settings?.agentMode === 'bedrock' ? 'Amazon Bedrock' : settings?.agentMode === 'ollama' ? `Ollama / ${settings.model || 'local model'}` : 'Local command simulator';
function WaitingStatus() {
  const started = useRef(performance.now()); const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds(Math.floor((performance.now() - started.current) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className="working" role="status"><LoaderCircle className="spin" size={18} /><div><span>Waiting for a response</span><time role="timer" aria-label="Request elapsed time" aria-live="off">{seconds}s elapsed</time></div></div>;
}
export function Assistant({ messages, busy, suspended = false, settings, onSend, onError }: { messages: ChatMessage[]; busy: boolean; suspended?: boolean; settings: Settings | null; onSend: (text: string, cloud: boolean) => Promise<void>; onError: (text: string) => void }) {
  const [text, setText] = useState(''); const [listening, setListening] = useState(false); const [sound, setSound] = useState(false); const [cloud, setCloud] = useState(false);
  const recognition = useRef<Recognition | null>(null); const end = useRef<HTMLDivElement>(null); const lastSpoken = useRef(messages.at(-1)?.id ?? '');
  const speaking = useRef<SpeechSynthesisUtterance | null>(null);
  const stopSpeech = useCallback(() => { speaking.current = null; cancelSpeech(); }, []);
  const panel = useRef<HTMLElement>(null);
  const Voice = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
  const canSpeak = typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function';
  const cancelVoice = useCallback(() => {
    const voice = recognition.current; recognition.current = null;
    if (!voice) return;
    // Detach first: browsers may deliver queued callbacks even after cancellation.
    voice.onresult = null; voice.onerror = null; voice.onend = null;
    try { voice.abort(); } catch { /* The browser may already have ended this session. */ }
  }, []);
  useEffect(() => {
    const log = end.current?.parentElement;
    if (!log) return;
    const anchor = busy ? log.querySelector('.working') : [...log.querySelectorAll('.message')].at(-1);
    if (anchor) log.scrollTop += anchor.getBoundingClientRect().top - log.getBoundingClientRect().top - 12;
    else log.scrollTop = 0;
  }, [messages.length, busy]);
  useEffect(() => {
    const element = panel.current;
    if (!element || element.closest('dialog')) return;
    // Fit the composer below the actual header, including wrapped titles or notices.
    const fit = () => element.style.setProperty('--relay-height', `${Math.max(200, Math.min(560, innerHeight - Math.max(12, element.getBoundingClientRect().top) - 16))}px`);
    const observer = new ResizeObserver(fit);
    for (const target of document.querySelectorAll('.workspace, .case-heading, .case-metrics, .topbar, .alert')) observer.observe(target);
    window.addEventListener('resize', fit); window.addEventListener('scroll', fit, { passive: true }); fit();
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); window.removeEventListener('scroll', fit); };
  }, []);
  useEffect(() => { if (busy || suspended) { cancelVoice(); setListening(false); } }, [busy, suspended, cancelVoice]);
  useEffect(() => { if (!sound || busy || suspended || listening) stopSpeech(); }, [sound, busy, suspended, listening, stopSpeech]);
  useEffect(() => {
    const last = messages.at(-1);
    if (busy || !last || last.id === lastSpoken.current) return;
    lastSpoken.current = last.id;
    if (sound && !suspended && !listening && !document.hidden && last.role === 'assistant' && canSpeak) {
      stopSpeech();
      try {
        const utterance = new SpeechSynthesisUtterance(last.spokenText ?? last.text); utterance.lang = 'en-IN'; speaking.current = utterance;
        utterance.onend = () => { if (speaking.current === utterance) speaking.current = null; };
        utterance.onerror = event => {
          if (speaking.current !== utterance) return;
          speaking.current = null;
          if (event.error === 'canceled' || event.error === 'interrupted') return;
          setSound(false); onError('Spoken response could not play. The reply is still available in the conversation.');
        };
        window.speechSynthesis.speak(utterance);
      } catch { stopSpeech(); setSound(false); onError('Spoken response could not start. The reply is still available in the conversation.'); }
    }
  }, [messages, sound, busy, suspended, listening, canSpeak, stopSpeech, onError]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { cancelVoice(); setListening(false); stopSpeech(); } };
    document.addEventListener('visibilitychange', hide);
    return () => { document.removeEventListener('visibilitychange', hide); cancelVoice(); stopSpeech(); };
  }, [cancelVoice, stopSpeech]);
  const toggleVoice = () => {
    if (busy || suspended) return;
    if (listening) { try { recognition.current?.stop(); } catch { cancelVoice(); setListening(false); onError('Recording stopped. Your transcript is still available to review.'); } return; }
    if (!Voice) { onError('Voice input is unavailable in this browser. Text input remains available.'); return; }
    cancelVoice(); stopSpeech();
    try {
      const voice = new Voice(); voice.lang = 'en-IN'; voice.continuous = true; voice.interimResults = true;
      const prefix = text.trimEnd();
      voice.onresult = event => {
        if (recognition.current !== voice) return;
        // Results contain the whole recording, including revised interim words.
        const transcript = Array.from(event.results, result => result[0]?.transcript.trim() ?? '').filter(Boolean).join(' ');
        if (transcript) {
          const combined = prefix ? `${prefix} ${transcript}` : transcript;
          setText(combined.slice(0, 4000));
          if (combined.length > 4000) { cancelVoice(); setListening(false); onError('The voice transcript reached the 4000-character limit. Review it before sending.'); }
        }
      };
      voice.onerror = event => {
        if (recognition.current !== voice) return; cancelVoice(); setListening(false);
        const errors: Record<string, string> = {
          'not-allowed': 'Microphone access was denied. You can use text instead.',
          'service-not-allowed': 'Voice input is blocked by the browser or speech service. You can use text instead.',
          'audio-capture': 'No microphone is available. Connect a microphone or use text instead.',
          'no-speech': 'No speech was detected. Try again or use text instead.',
          network: 'The speech service could not connect. Your typed text is unchanged; try again or use text.',
        };
        if (event.error !== 'aborted') onError(errors[event.error] ?? 'Voice input stopped. Try again or use text instead.');
      };
      voice.onend = () => { if (recognition.current !== voice) return; recognition.current = null; setListening(false); }; recognition.current = voice;
      voice.start(); setListening(true);
    } catch { cancelVoice(); setListening(false); onError('The microphone could not start. Try again or use text.'); }
  };
  const submit = async (value: string) => { if (!value.trim() || busy || suspended) return; cancelVoice(); setListening(false); stopSpeech(); const prior = text; setText(''); try { await onSend(value.trim(), cloud); } catch { setText(prior || value); } };
  return <aside ref={panel} className="assistant" aria-label="Simulated Alexa+ repair conversation"><div className="assistant-heading"><div className="relay-icon"><AudioLines size={22} /></div><div><h2>Relay</h2><span className="simulator-label">Alexa+ experience simulator</span><span>{agentLabel(settings)}</span></div><IconButton label={!canSpeak ? 'Spoken responses unavailable' : sound ? 'Mute spoken responses' : 'Enable spoken responses'} disabled={!canSpeak} onClick={() => { if (sound) stopSpeech(); setSound(!sound); }}><span>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</span></IconButton></div>
    <div className={`conversation ${!messages.length && !busy ? 'is-empty' : ''}`} role="log" aria-label="Repair conversation" aria-live="polite">
      {!messages.length && !busy && <p className="assistant-empty">No messages yet</p>}
      {messages.map(message => <div key={message.id} className={`message message-${message.role}`}><span className="message-author">{message.role === 'assistant' ? 'Relay' : 'You'}</span><p>{message.text}</p>{message.traces.length > 0 && <details className="tool-trace"><summary><Terminal size={12} /> {message.traces.length} MCP {message.traces.length === 1 ? 'call' : 'calls'}</summary>{message.traces.map((t, i) => <div key={i}><span>{t.tool}</span><span>{t.ok ? `${t.durationMs} ms` : 'Failed'}</span></div>)}</details>}</div>)}
      {busy && <WaitingStatus />}<div ref={end} />
    </div>
    <div className="assistant-commands"><button disabled={busy} onClick={() => void submit('What is the next step?')}><FileText size={14} /> Case brief</button><button disabled={busy} onClick={() => void submit('Remind me tomorrow')}><Clock size={14} /> Tomorrow</button><button disabled={busy} onClick={() => void submit('Export my case history')}><Download size={14} /> Case packet</button></div>
    {settings?.agentMode === 'bedrock' && <label className="checkline cloud-consent"><input type="checkbox" checked={cloud} onChange={e => setCloud(e.target.checked)} /> Share this case text with Amazon Bedrock</label>}
    <form className="composer" onSubmit={e => { e.preventDefault(); void submit(text); }}><textarea aria-label="Message to Relay" placeholder="Ask about this repair..." value={text} onChange={e => { if (listening) { cancelVoice(); setListening(false); } setText(e.target.value); }} maxLength={4000} rows={2} disabled={busy} /><div className="composer-bottom"><IconButton label={listening ? 'Stop recording' : Voice ? 'Start voice input' : 'Voice input unavailable'} onClick={toggleVoice} disabled={!Voice || busy} className={listening ? 'listening' : ''}>{listening ? <MicOff size={19} /> : <Mic size={19} />}</IconButton><span role="status">{listening ? 'Listening...' : 'English'}</span><button className="send-button" aria-label="Send message" title="Send message" disabled={!text.trim() || busy}><Send size={18} /></button></div></form>
  </aside>;
}
export function Traces({ traces }: { traces: ToolTrace[] }) { return <div className="trace-list">{traces.length ? traces.map((t, i) => <div key={i}><Terminal size={15} /><span>{t.tool}</span><strong className={t.ok ? 'good' : 'bad'}>{t.ok ? `${t.durationMs} ms` : 'Failed'}</strong></div>) : <p>No tool calls recorded in this browser session.</p>}</div>; }
