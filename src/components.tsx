import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Mic, MicOff, Send, Volume2, VolumeX, AudioLines, LoaderCircle, Terminal, FileText, Clock, Download } from 'lucide-react';
import type { ChatMessage, Settings, ToolTrace } from '../shared/types';

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
    el.addEventListener('cancel', cancel);
    return () => { el.removeEventListener('cancel', cancel); el.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className={`modal ${wide ? 'wide' : ''}`} aria-label={title} onClick={event => { if (!busy && event.target === event.currentTarget) onClose(); }}><div className="modal-header"><h2>{title}</h2><IconButton label="Close dialog" onClick={onClose} disabled={busy}><X size={20} /></IconButton></div>{error && <p className="dialog-error" role="alert">{error}</p>}{children}</dialog>;
}

interface RecognitionResult { results: { [index: number]: { [index: number]: { transcript: string } } }; resultIndex: number }
interface Recognition { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: RecognitionResult) => void) | null; onerror: ((event: { error: string }) => void) | null; onend: (() => void) | null; start(): void; stop(): void }
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
export function Assistant({ messages, busy, settings, onSend, onError }: { messages: ChatMessage[]; busy: boolean; settings: Settings | null; onSend: (text: string, cloud: boolean) => Promise<void>; onError: (text: string) => void }) {
  const [text, setText] = useState(''); const [listening, setListening] = useState(false); const [sound, setSound] = useState(false); const [cloud, setCloud] = useState(false);
  const recognition = useRef<Recognition | null>(null); const end = useRef<HTMLDivElement>(null); const lastSpoken = useRef('');
  const Voice = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [messages.length, busy]);
  useEffect(() => {
    const last = messages.at(-1);
    if (sound && last?.role === 'assistant' && last.id !== lastSpoken.current && 'speechSynthesis' in window) {
      speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(last.text); utterance.lang = 'en-IN'; speechSynthesis.speak(utterance); lastSpoken.current = last.id;
    }
  }, [messages, sound]);
  useEffect(() => () => { recognition.current?.stop(); if ('speechSynthesis' in window) speechSynthesis.cancel(); }, []);
  const toggleVoice = () => {
    if (listening) { recognition.current?.stop(); return; }
    if (!Voice) { onError('Voice input is unavailable in this browser. Text input remains available.'); return; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const voice = new Voice(); voice.lang = 'en-IN'; voice.continuous = false; voice.interimResults = false;
    voice.onresult = event => { const transcript = event.results[event.resultIndex][0].transcript; setText(prior => prior ? `${prior} ${transcript}` : transcript); };
    voice.onerror = event => { setListening(false); onError(event.error === 'not-allowed' ? 'Microphone access was denied. You can use text instead.' : `Voice input stopped: ${event.error}.`); };
    voice.onend = () => setListening(false); recognition.current = voice;
    try { voice.start(); setListening(true); } catch { onError('The microphone could not start. Try again or use text.'); }
  };
  const submit = async (value: string) => { if (!value.trim() || busy) return; const prior = text; setText(''); try { await onSend(value.trim(), cloud); } catch { setText(prior || value); } };
  return <aside className="assistant"><div className="assistant-heading"><div className="relay-icon"><AudioLines size={22} /></div><div><h2>Relay</h2><span>{settings?.agentMode === 'bedrock' ? 'Amazon Bedrock' : 'Local command simulator'}</span></div><IconButton label={sound ? 'Mute spoken responses' : 'Enable spoken responses'} onClick={() => { if (sound && 'speechSynthesis' in window) speechSynthesis.cancel(); setSound(!sound); }}><span>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</span></IconButton></div>
    <div className="conversation" role="log" aria-label="Repair conversation" aria-live="polite">
      {!messages.length && <div className="assistant-empty"><AudioLines size={28} /><h3>Your repair, one next step.</h3><p>Case record connected</p></div>}
      {messages.map(message => <div key={message.id} className={`message message-${message.role}`}><span className="message-author">{message.role === 'assistant' ? 'Relay' : 'You'}</span><p>{message.text}</p>{message.traces.length > 0 && <details className="tool-trace"><summary><Terminal size={12} /> {message.traces.length} MCP {message.traces.length === 1 ? 'call' : 'calls'}</summary>{message.traces.map((t, i) => <div key={i}><span>{t.tool}</span><span>{t.ok ? `${t.durationMs} ms` : 'Failed'}</span></div>)}</details>}</div>)}
      {busy && <div className="working" role="status"><LoaderCircle className="spin" size={16} /> Working on your case...</div>}<div ref={end} />
    </div>
    <div className="assistant-commands"><button disabled={busy} onClick={() => void submit('What is the next step?')}><FileText size={14} /> Case brief</button><button disabled={busy} onClick={() => void submit('Remind me tomorrow')}><Clock size={14} /> Tomorrow</button><button disabled={busy} onClick={() => void submit('Export my case history')}><Download size={14} /> Case packet</button></div>
    {settings?.agentMode === 'bedrock' && <label className="checkline cloud-consent"><input type="checkbox" checked={cloud} onChange={e => setCloud(e.target.checked)} /> Share this case text with Amazon Bedrock</label>}
    <form className="composer" onSubmit={e => { e.preventDefault(); void submit(text); }}><textarea aria-label="Message to Relay" placeholder="Ask about this repair..." value={text} onChange={e => setText(e.target.value)} maxLength={4000} rows={2} disabled={busy} /><div className="composer-bottom"><IconButton label={listening ? 'Stop recording' : Voice ? 'Start voice input' : 'Voice input unavailable'} onClick={toggleVoice} disabled={!Voice || busy} className={listening ? 'listening' : ''}>{listening ? <MicOff size={19} /> : <Mic size={19} />}</IconButton><span>{listening ? 'Listening...' : 'English'}</span><button className="send-button" aria-label="Send message" title="Send message" disabled={!text.trim() || busy || (settings?.agentMode === 'bedrock' && !cloud)}><Send size={18} /></button></div></form>
  </aside>;
}
export function Traces({ traces }: { traces: ToolTrace[] }) { return <div className="trace-list">{traces.length ? traces.map((t, i) => <div key={i}><Terminal size={15} /><span>{t.tool}</span><strong className={t.ok ? 'good' : 'bad'}>{t.ok ? `${t.durationMs} ms` : 'Failed'}</strong></div>) : <p>No tool calls recorded in this browser session.</p>}</div>; }
