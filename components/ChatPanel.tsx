'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, RotateCcw, Square, ArrowUp, ArrowUpRight, Check, Plus } from 'lucide-react';
import { MotionIcon } from './MotionIcon';
import { FormattedText } from './FormattedText';
import { UploadSteps } from './UploadSteps';
import type { VaultItem } from '@/types/vault';
import type { UploadEvent, UploadStep } from '@/lib/upload';

export type ChatMessage = { role: 'user' | 'ai'; text: string; steps?: UploadStep[] };

interface Props {
  resetKey: string;
  endpoint: string;
  buildBody: (question: string, history: ChatMessage[]) => Record<string, unknown>;
  suggestions: string[];
  placeholder: string;
  aiLabel?: string;
  greeting?: string;          // shown centered above the input on the empty state
  greetingIcon?: string;      // optional logo image shown beside the greeting
  centered?: boolean;         // center the empty state vertically (home/new-chat look)
  disabled?: boolean;         // disable sending text (e.g. no docs yet)
  // Attach + narrate an upload inside the chat
  uploadRunner?: (file: File, emit: (e: UploadEvent) => void) => Promise<VaultItem | null>;
  onUploaded?: (item: VaultItem) => void;
  onEmptyChange?: (empty: boolean) => void;   // fires when the empty/greeting state toggles
}

export function ChatPanel({
  resetKey, endpoint, buildBody, suggestions, placeholder,
  aiLabel = 'ChainMind AI', greeting, greetingIcon, centered, disabled,
  uploadRunner, onUploaded, onEmptyChange,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setMessages([]); setInput(''); abortRef.current?.abort(); }, [resetKey]);
  useEffect(() => { onEmptyChange?.(messages.length === 0 && !loading && !streaming); }, [messages.length, loading, streaming, onEmptyChange]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px';
  }, [input]);

  async function runCompletion(question: string, history: ChatMessage[]) {
    setLoading(true);
    setStreaming(false);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(question, history)),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        setMessages(m => [...m, { role: 'ai', text: 'Failed to reach AI. Please retry.' }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      let started = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        if (!started) {
          started = true;
          setLoading(false);
          setStreaming(true);
          setMessages(m => [...m, { role: 'ai', text: acc }]);
        } else {
          setMessages(m => { const c = [...m]; c[c.length - 1] = { role: 'ai', text: acc }; return c; });
        }
      }
      if (!started) setMessages(m => [...m, { role: 'ai', text: 'No answer.' }]);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setMessages(m => [...m, { role: 'ai', text: 'Failed to reach AI.' }]);
      }
    } finally {
      setLoading(false);
      setStreaming(false);
      abortRef.current = null;
      setTimeout(() => taRef.current?.focus(), 50);
    }
  }

  function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || loading || streaming || disabled) return;
    const history = messages.slice(-6);
    setMessages(m => [...m, { role: 'user', text: q }]);
    setInput('');
    runCompletion(q, history);
  }
  function stop() { abortRef.current?.abort(); setStreaming(false); setLoading(false); }
  function regenerate() {
    if (loading || streaming) return;
    const msgs = [...messages];
    while (msgs.length && msgs[msgs.length - 1].role === 'ai') msgs.pop();
    const lastUser = msgs.length ? msgs[msgs.length - 1].text : '';
    if (!lastUser) return;
    setMessages(msgs);
    runCompletion(lastUser, msgs.slice(0, -1).slice(-6));
  }
  async function copyMsg(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(c => (c === idx ? null : c)), 1600);
    } catch { /* ignore */ }
  }

  // Attach a file from the chat and narrate the upload pipeline as an animated
  // chain of steps (each step: spinner → checkmark), with the AI summary below.
  async function handleAttach(file: File) {
    if (!uploadRunner || busy) return;
    setMessages(m => [...m, { role: 'user', text: `📎 ${file.name}` }, { role: 'ai', text: '', steps: [] }]);
    setStreaming(true);
    const emit = (e: UploadEvent) => {
      setMessages(m => {
        const c = [...m];
        const last = { ...c[c.length - 1] };
        const steps = [...(last.steps ?? [])];
        if (e.kind === 'start') {
          steps.push({ label: e.label, status: 'running' });
        } else if (e.kind === 'done' || e.kind === 'error') {
          for (let i = steps.length - 1; i >= 0; i--) {
            if (steps[i].status === 'running') {
              steps[i] = { ...steps[i], status: e.kind === 'done' ? 'done' : 'error', detail: e.detail };
              break;
            }
          }
        } else if (e.kind === 'summary') {
          last.text = e.text;
        }
        last.steps = steps;
        c[c.length - 1] = last;
        return c;
      });
    };
    try {
      const item = await uploadRunner(file, emit);
      if (item) onUploaded?.(item);
    } catch (err) {
      emit({ kind: 'error', detail: String(err).slice(0, 120) });
      emit({ kind: 'summary', text: 'Something went wrong during upload. Please try again.' });
    } finally {
      setStreaming(false);
      setTimeout(() => taRef.current?.focus(), 50);
    }
  }

  const isEmpty = messages.length === 0 && !loading && !streaming;
  const busy = loading || streaming;

  // ── Input box (shared between centered + bottom layouts) ──
  const inputBox = (
    <div style={{
      display: 'flex', gap: '8px', alignItems: 'flex-end',
      border: '1px solid var(--border)', borderRadius: '16px', padding: '8px 8px 8px 8px',
      background: 'var(--off-white)',
    }}>
      {uploadRunner && (
        <>
          <input ref={fileRef} type="file" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleAttach(f); e.target.value = ''; }} />
          <button
            onClick={() => !busy && fileRef.current?.click()}
            disabled={busy}
            title="Upload a file"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
              background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)',
              cursor: busy ? 'default' : 'pointer',
            }}
            onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; } }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </>
      )}
      <textarea
        ref={taRef}
        value={input}
        rows={1}
        disabled={disabled}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
        placeholder={placeholder}
        style={{
          flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent',
          fontSize: '14px', lineHeight: '1.5', color: 'var(--text-1)', fontFamily: 'inherit',
          maxHeight: '160px', padding: '7px 4px',
        }}
      />
      {busy ? (
        <button onClick={stop} title="Stop generating" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
          background: 'var(--off-white)', color: 'var(--text-1)', border: '1px solid var(--border)', cursor: 'pointer',
        }}><Square size={13} strokeWidth={2.5} fill="currentColor" /></button>
      ) : (
        <button onClick={() => send()} disabled={!input.trim() || disabled} title="Send" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
          background: 'var(--purple)', color: 'var(--base)', border: 'none',
          cursor: input.trim() && !disabled ? 'pointer' : 'default',
          opacity: input.trim() && !disabled ? 1 : 0.4, transition: 'opacity 0.15s',
        }}><MotionIcon icon={ArrowUp} mode="bob" size={17} strokeWidth={2.5} color="currentColor" /></button>
      )}
    </div>
  );

  const chips = (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: centered && isEmpty ? 'center' : 'flex-start' }}>
      {suggestions.map(q => (
        <button key={q} onClick={() => send(q)} disabled={disabled} className="chip"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            fontSize: '13px', padding: '9px 13px', borderRadius: '12px', textAlign: 'left',
            background: 'rgba(20,19,17,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid var(--border)',
            color: 'var(--text-2)', cursor: disabled ? 'default' : 'pointer', transition: 'all 0.15s',
            opacity: disabled ? 0.5 : 1,
          }}
          onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = 'rgba(42,41,38,0.8)'; e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.color = 'var(--text-1)'; } }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(20,19,17,0.55)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
        >
          <span>{q}</span>
          <ArrowUpRight size={14} strokeWidth={2} style={{ opacity: 0.45, flexShrink: 0 }} />
        </button>
      ))}
    </div>
  );

  // ── Centered "home" layout when empty ──
  if (centered && isEmpty) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '24px' }}>
        {greeting && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {greetingIcon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={greetingIcon} alt="ChainMind" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
            )}
            <h1 style={{ fontSize: '30px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)', textAlign: 'center', textShadow: '0 2px 22px rgba(0,0,0,0.55)' }}>{greeting}</h1>
          </div>
        )}
        <div style={{ width: '100%', maxWidth: '720px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {inputBox}
          {chips}
        </div>
      </div>
    );
  }

  // ── Normal chat layout ──
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {isEmpty ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px', maxWidth: '760px', marginInline: 'auto' }}>
            {chips}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', maxWidth: '760px', margin: '0 auto' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px', animation: 'fadeUp 0.2s ease' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.03em', color: m.role === 'user' ? 'var(--text-3)' : 'var(--text-2)' }}>
                  {m.role === 'user' ? 'You' : aiLabel}
                </span>
                <div style={{
                  fontSize: '14px', lineHeight: '1.7', color: 'var(--text-1)',
                  background: m.role === 'user' ? 'var(--off-white)' : 'transparent',
                  border: m.role === 'user' ? '1px solid var(--border)' : 'none',
                  borderRadius: m.role === 'user' ? '12px' : 0,
                  padding: m.role === 'user' ? '10px 14px' : 0,
                }}>
                  {m.role === 'ai' && m.steps && m.steps.length > 0 && <UploadSteps steps={m.steps} />}
                  {m.role === 'ai' ? (m.text ? <FormattedText text={m.text} /> : null) : m.text}
                  {m.role === 'ai' && streaming && i === messages.length - 1 && !(m.steps && m.steps.length) && (
                    <span style={{ display: 'inline-block', width: '8px', height: '15px', background: 'var(--text-2)', marginLeft: '2px', borderRadius: '1px', animation: 'blink 1s step-start infinite', verticalAlign: 'text-bottom' }} />
                  )}
                </div>
                {m.role === 'ai' && !(m.steps && m.steps.length) && !(streaming && i === messages.length - 1) && (
                  <div style={{ display: 'flex', gap: '14px', marginTop: '4px' }}>
                    <button onClick={() => copyMsg(m.text, i)} style={copiedIdx === i ? { ...actionBtn, color: '#65ca9d' } : actionBtn}>
                      {copiedIdx === i ? <><Check size={12} strokeWidth={2.5} /> Copied</> : <><Copy size={12} strokeWidth={2} /> Copy</>}
                    </button>
                    {i === messages.length - 1 && <button onClick={regenerate} style={actionBtn}><RotateCcw size={12} strokeWidth={2} /> Regenerate</button>}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-2)' }}>{aiLabel}</span>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  {[0, 200, 400].map(d => (<div key={d} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-3)', animation: `dotpulse 1.2s ease ${d}ms infinite` }} />))}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div style={{ padding: '8px 24px 18px', flexShrink: 0 }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          {inputBox}
          <p style={{ marginTop: '8px', fontSize: '10.5px', color: 'var(--text-3)', textAlign: 'center' }}>
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>
      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}

const actionBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '4px',
  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
  fontSize: '11px', fontWeight: 600, padding: 0,
};
