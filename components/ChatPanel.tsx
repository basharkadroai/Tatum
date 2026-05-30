'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, RotateCcw, Square, ArrowUp, ArrowUpRight } from 'lucide-react';
import { MotionIcon } from './MotionIcon';
import { FormattedText } from './FormattedText';

export type ChatMessage = { role: 'user' | 'ai'; text: string };

interface Props {
  resetKey: string;
  endpoint: string;
  buildBody: (question: string, history: ChatMessage[]) => Record<string, unknown>;
  suggestions: string[];
  placeholder: string;
  aiLabel?: string;
  onToast?: (msg: string) => void;
  greeting?: string;          // shown centered above the input on the empty state
  greetingIcon?: string;      // optional logo image shown beside the greeting
  centered?: boolean;         // center the empty state vertically (home/new-chat look)
  leftAction?: ReactNode;     // e.g. an upload "+" rendered inside the input row
  disabled?: boolean;         // disable sending (e.g. no docs yet)
}

export function ChatPanel({
  resetKey, endpoint, buildBody, suggestions, placeholder,
  aiLabel = 'ChainMind AI', onToast, greeting, greetingIcon, centered, leftAction, disabled,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setMessages([]); setInput(''); abortRef.current?.abort(); }, [resetKey]);
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
  async function copyMsg(text: string) {
    try { await navigator.clipboard.writeText(text); onToast?.('Answer copied'); }
    catch { onToast?.('Copy failed'); }
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
      {leftAction}
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
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-2)', cursor: disabled ? 'default' : 'pointer', transition: 'all 0.15s',
            opacity: disabled ? 0.5 : 1,
          }}
          onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.color = 'var(--text-1)'; } }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
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
            <h1 style={{ fontSize: '30px', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)', textAlign: 'center' }}>{greeting}</h1>
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
                  {m.role === 'ai' ? <FormattedText text={m.text} /> : m.text}
                  {m.role === 'ai' && streaming && i === messages.length - 1 && (
                    <span style={{ display: 'inline-block', width: '8px', height: '15px', background: 'var(--text-2)', marginLeft: '2px', borderRadius: '1px', animation: 'blink 1s step-start infinite', verticalAlign: 'text-bottom' }} />
                  )}
                </div>
                {m.role === 'ai' && !(streaming && i === messages.length - 1) && (
                  <div style={{ display: 'flex', gap: '14px', marginTop: '4px' }}>
                    <button onClick={() => copyMsg(m.text)} style={actionBtn}><Copy size={12} strokeWidth={2} /> Copy</button>
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
