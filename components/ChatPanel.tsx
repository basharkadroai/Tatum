'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, RotateCcw, Square, ArrowUp } from 'lucide-react';
import { MotionIcon } from './MotionIcon';
import { FormattedText } from './FormattedText';

export type ChatMessage = { role: 'user' | 'ai'; text: string };

interface Props {
  resetKey: string;                 // clears the conversation when this changes
  endpoint: string;                 // /api/ask or /api/ask-vault
  buildBody: (question: string, history: ChatMessage[]) => Record<string, unknown>;
  suggestions: string[];
  emptyHint: string;
  placeholder: string;
  aiLabel?: string;
  onToast?: (msg: string) => void;
}

export function ChatPanel({ resetKey, endpoint, buildBody, suggestions, emptyHint, placeholder, aiLabel = 'ChainMind AI', onToast }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { setMessages([]); setInput(''); abortRef.current?.abort(); }, [resetKey]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // auto-grow textarea
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
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
    if (!q || loading || streaming) return;
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
    const history = msgs.slice(0, -1).slice(-6);
    runCompletion(lastUser, history);
  }

  async function copyMsg(text: string) {
    try { await navigator.clipboard.writeText(text); onToast?.('Answer copied'); }
    catch { onToast?.('Copy failed'); }
  }

  const lastIsAi = messages.length > 0 && messages[messages.length - 1].role === 'ai';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-3)', fontWeight: 500 }}>{emptyHint}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
              {suggestions.map(q => (
                <button key={q} onClick={() => send(q)} style={{
                  fontSize: '13px', padding: '9px 14px', borderRadius: '12px', textAlign: 'left',
                  background: 'var(--off-white)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', cursor: 'pointer', transition: 'all 0.15s', maxWidth: '100%',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--purple)'; e.currentTarget.style.color = 'var(--text-1)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                >{q}</button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '760px', margin: '0 auto' }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '6px', animation: 'fadeUp 0.2s ease' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', color: m.role === 'user' ? 'var(--text-3)' : 'var(--purple)' }}>
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
                    <span style={{ display: 'inline-block', width: '8px', height: '15px', background: 'var(--purple)', marginLeft: '2px', borderRadius: '1px', animation: 'blink 1s step-start infinite', verticalAlign: 'text-bottom' }} />
                  )}
                </div>
                {/* AI message actions */}
                {m.role === 'ai' && !(streaming && i === messages.length - 1) && (
                  <div style={{ display: 'flex', gap: '14px', marginTop: '4px' }}>
                    <button onClick={() => copyMsg(m.text)} style={actionBtn}><Copy size={12} strokeWidth={2} /> Copy</button>
                    {i === messages.length - 1 && (
                      <button onClick={regenerate} style={actionBtn}><RotateCcw size={12} strokeWidth={2} /> Regenerate</button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && !lastIsAi && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--purple)' }}>{aiLabel}</span>
                <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                  {[0, 200, 400].map(d => (<div key={d} style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-3)', animation: `dotpulse 1.2s ease ${d}ms infinite` }} />))}
                  <span style={{ fontSize: '12px', color: 'var(--text-3)', marginLeft: '4px' }}>Thinking…</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '12px 24px 16px', borderTop: '1px solid var(--border)', background: 'var(--white)', flexShrink: 0 }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', gap: '8px', alignItems: 'flex-end',
          border: '1px solid var(--border)', borderRadius: '14px', padding: '8px 8px 8px 14px', background: 'var(--off-white)' }}>
          <textarea
            ref={taRef}
            value={input}
            rows={1}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={placeholder}
            style={{
              flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent',
              fontSize: '14px', lineHeight: '1.5', color: 'var(--text-1)', fontFamily: 'inherit',
              maxHeight: '140px', padding: '4px 0',
            }}
          />
          {streaming || loading ? (
            <button onClick={stop} title="Stop generating" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '9px 14px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, flexShrink: 0,
              background: 'var(--off-white)', color: 'var(--text-1)', border: '1px solid var(--border)', cursor: 'pointer',
            }}><Square size={12} strokeWidth={2.5} fill="currentColor" /> Stop</button>
          ) : (
            <button onClick={() => send()} disabled={!input.trim()} title="Send" style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: '36px', height: '36px', borderRadius: '10px', flexShrink: 0,
              background: 'var(--purple)', color: 'var(--base)', border: 'none', cursor: input.trim() ? 'pointer' : 'default',
              opacity: input.trim() ? 1 : 0.4, transition: 'opacity 0.15s',
            }}><MotionIcon icon={ArrowUp} mode="bob" size={17} strokeWidth={2.5} color="currentColor" /></button>
          )}
        </div>
        <p style={{ maxWidth: '760px', margin: '6px auto 0', fontSize: '10.5px', color: 'var(--text-3)', textAlign: 'center' }}>
          Enter to send · Shift+Enter for new line
        </p>
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
