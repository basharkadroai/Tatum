'use client';
import { useEffect, useRef, useState } from 'react';
import { Copy, RotateCcw, Square, ArrowUp, ArrowUpRight, Check, Plus } from 'lucide-react';
import { MotionIcon } from './MotionIcon';
import { FormattedText } from './FormattedText';
import { UploadSteps } from './UploadSteps';
import { ModelMenu } from './ModelMenu';
import AgentMascot from './AgentMascot';
import type { VaultItem } from '@/types/vault';
import type { UploadEvent, UploadStep } from '@/lib/upload';
import type { AiConfig } from '@/lib/aiConfig';

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
  mobile?: boolean;           // Claude-style empty state: greeting centered, input pinned bottom
  disabled?: boolean;         // disable sending text (e.g. no docs yet)
  // Attach + narrate an upload inside the chat
  uploadRunner?: (file: File, emit: (e: UploadEvent) => void) => Promise<VaultItem | null>;
  onUploaded?: (item: VaultItem) => void;
  onEmptyChange?: (empty: boolean) => void;   // fires when the empty/greeting state toggles
  onCitation?: (label: string) => void;        // open a file when a [citation] pill is clicked
  aiConfig?: AiConfig | null;                   // BYOK: provider/model/key for chat
  onAiConfigChange?: (c: AiConfig | null) => void;  // in-prompt model switcher
  agent?: boolean;                              // route through the LangChain agent (/api/agent) + show its activity chain
}

export function ChatPanel({
  resetKey, endpoint, buildBody, suggestions, placeholder,
  aiLabel = 'ChainMind AI', greeting, greetingIcon, centered, mobile, disabled,
  uploadRunner, onUploaded, onEmptyChange, onCitation, aiConfig, onAiConfigChange, agent,
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
    // Grow with content (Claude-style) up to ~45% of the viewport before scrolling,
    // so the user always sees what they're typing instead of it hiding behind a scroll.
    const cap = Math.round(window.innerHeight * 0.45);
    ta.style.height = Math.min(ta.scrollHeight, cap) + 'px';
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
        body: JSON.stringify({ ...buildBody(question, history), ai: aiConfig || undefined }),
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
    (agent ? runAgent : runCompletion)(q, history);
  }

  // Agent mode: stream the agent's activity chain (/api/agent NDJSON) and render
  // each action as a live step in the same chain the uploads use, then the answer.
  async function runAgent(question: string, history: ChatMessage[]) {
    setLoading(true);
    setStreaming(false);
    const ac = new AbortController();
    abortRef.current = ac;
    let holderAdded = false;
    const markPrevDone = (steps: UploadStep[]) => {
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].status === 'running') { steps[i] = { ...steps[i], status: 'done' }; break; }
      }
    };
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(question, history)),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        setMessages(m => [...m, { role: 'ai', text: 'Failed to reach the agent. Please retry.' }]);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let ev: { type: string; label?: string; text?: string; message?: string };
          try { ev = JSON.parse(trimmed); } catch { continue; }
          const isFirst = !holderAdded;
          holderAdded = true;
          if (isFirst) { setLoading(false); setStreaming(true); }
          setMessages(m => {
            const c = [...m];
            if (isFirst) c.push({ role: 'ai', text: '', steps: [] });
            const last = { ...c[c.length - 1] };
            const steps = [...(last.steps ?? [])];
            if (ev.type === 'step') { markPrevDone(steps); steps.push({ label: ev.label ?? 'Working', status: 'running' }); }
            else if (ev.type === 'answer') { markPrevDone(steps); last.text = ev.text ?? ''; }
            else if (ev.type === 'error') { markPrevDone(steps); last.text = `The agent hit an error: ${ev.message ?? ''}`; }
            last.steps = steps;
            c[c.length - 1] = last;
            return c;
          });
        }
      }
      // Finalize: close any still-running step; ensure there's an answer.
      setMessages(m => {
        if (!holderAdded) return [...m, { role: 'ai', text: 'No answer.' }];
        const c = [...m];
        const last = { ...c[c.length - 1] };
        const steps = [...(last.steps ?? [])];
        markPrevDone(steps);
        if (!last.text) last.text = 'Done.';
        last.steps = steps;
        c[c.length - 1] = last;
        return c;
      });
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setMessages(m => [...m, { role: 'ai', text: 'Failed to reach the agent.' }]);
      }
    } finally {
      setLoading(false);
      setStreaming(false);
      abortRef.current = null;
      setTimeout(() => taRef.current?.focus(), 50);
    }
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

  const fileInput = uploadRunner && (
    <input ref={fileRef} type="file" className="hidden"
      onChange={e => { const f = e.target.files?.[0]; if (f) handleAttach(f); e.target.value = ''; }} />
  );
  const plusBtn = (sz: number) => uploadRunner && (
    <button onClick={() => !busy && fileRef.current?.click()} disabled={busy} title="Upload a file"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: `${sz}px`, height: `${sz}px`, borderRadius: '10px', flexShrink: 0,
        background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)',
        cursor: busy ? 'default' : 'pointer',
      }}
      onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-1)'; } }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}
    ><Plus size={Math.round(sz / 2)} strokeWidth={2.5} /></button>
  );
  const sendBtn = (sz: number, radius: string) => busy ? (
    <button onClick={stop} title="Stop generating" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: `${sz}px`, height: `${sz}px`, borderRadius: radius, flexShrink: 0,
      background: 'var(--off-white)', color: 'var(--text-1)', border: '1px solid var(--border)', cursor: 'pointer',
    }}><Square size={13} strokeWidth={2.5} fill="currentColor" /></button>
  ) : (
    <button onClick={() => send()} disabled={!input.trim() || disabled} title="Send" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: `${sz}px`, height: `${sz}px`, borderRadius: radius, flexShrink: 0,
      background: 'var(--purple)', color: 'var(--base)', border: 'none',
      cursor: input.trim() && !disabled ? 'pointer' : 'default',
      opacity: input.trim() && !disabled ? 1 : 0.4, transition: 'opacity 0.15s',
    }}><MotionIcon icon={ArrowUp} mode="bob" size={Math.round(sz / 2.3)} strokeWidth={2.5} color="currentColor" /></button>
  );
  const textarea = (rows: number, fontSize: string, minHeight: string) => (
    <textarea
      ref={taRef} value={input} rows={rows} disabled={disabled}
      onChange={e => setInput(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
      placeholder={placeholder}
      style={{
        display: 'block', width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent',
        fontSize, lineHeight: '1.5', color: 'var(--text-1)', fontFamily: 'inherit',
        minHeight, maxHeight: '45vh', padding: '7px 4px', boxSizing: 'border-box',
        // Native auto-grow (2026 baseline: Chrome/Edge/Safari); JS effect below covers the rest.
        fieldSizing: 'content',
      } as React.CSSProperties}
    />
  );

  // Menu drops DOWN only on the centered home (input sits mid-screen); everywhere
  // the input is pinned to the bottom (any chat, file detail, mobile) it opens UP
  // so the prompt box never shifts.
  const menuOpensUp = mobile || !(centered && isEmpty);
  const modelMenu = onAiConfigChange ? <ModelMenu config={aiConfig ?? null} onChange={onAiConfigChange} openUp={menuOpensUp} /> : null;

  // ── Input box. Mobile = bigger Claude-style card (textarea on top, controls below). ──
  const inputBox = mobile ? (
    <div style={{ border: '1px solid var(--border)', borderRadius: '24px', padding: '14px 16px 10px', background: 'var(--off-white)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {fileInput}
      {textarea(2, '16px', '48px')}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          {plusBtn(40)}
          {modelMenu}
        </div>
        {sendBtn(44, '50%')}
      </div>
    </div>
  ) : (
    // Desktop: Claude-style stacked card — textarea spans full width on top, controls
    // sit on a row below so long, wrapping text never collides with the buttons.
    <div style={{ border: '1px solid var(--border)', borderRadius: '16px', padding: '10px 14px 8px', background: 'var(--off-white)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {fileInput}
      {textarea(1, '15px', 'auto')}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          {plusBtn(36)}
          {modelMenu}
        </div>
        {sendBtn(36, '10px')}
      </div>
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

  // Mobile: suggestions sit beside each other in a horizontal scroll row.
  const chipsMobile = (
    <div className="tag-strip" style={{ display: 'flex', gap: '8px', overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: '2px' }}>
      {suggestions.map(q => (
        <button key={q} onClick={() => send(q)} disabled={disabled}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px', flexShrink: 0, whiteSpace: 'nowrap',
            fontSize: '13px', padding: '9px 14px', borderRadius: '14px',
            background: 'rgba(20,19,17,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
            border: '1px solid var(--border)', color: 'var(--text-2)', cursor: disabled ? 'default' : 'pointer',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <span>{q}</span>
          <ArrowUpRight size={13} strokeWidth={2} style={{ opacity: 0.45, flexShrink: 0 }} />
        </button>
      ))}
    </div>
  );

  // Greeting + logo block (shared between layouts)
  const greetingBlock = greeting && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 2vw, 12px)' }}>
      {greetingIcon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={greetingIcon} alt="ChainMind" style={{ width: 'clamp(26px, 6vw, 40px)', height: 'clamp(26px, 6vw, 40px)', objectFit: 'contain', flexShrink: 0 }} />
      )}
      <h1 style={{ fontSize: 'clamp(20px, 5vw, 30px)', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)', textAlign: 'center', textShadow: '0 2px 22px rgba(0,0,0,0.55)' }}>{greeting}</h1>
    </div>
  );

  // ── Centered "home" layout when empty ──
  if (centered && isEmpty) {
    // Mobile (Claude-style): greeting floats center, input pinned to bottom with
    // the suggestions just above it.
    if (mobile) {
      return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '12px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {greeting && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                {greetingIcon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={greetingIcon} alt="ChainMind" style={{ width: 'clamp(44px, 13vw, 58px)', height: 'clamp(44px, 13vw, 58px)', objectFit: 'contain' }} />
                )}
                <h1 style={{ fontSize: 'clamp(26px, 7vw, 32px)', fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)', textAlign: 'center', textShadow: '0 2px 22px rgba(0,0,0,0.55)' }}>{greeting}</h1>
              </div>
            )}
          </div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: 'env(safe-area-inset-bottom, 6px)' }}>
            {chipsMobile}
            {inputBox}
          </div>
        </div>
      );
    }
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', gap: '24px' }}>
        {greetingBlock}
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
                  {m.role === 'ai' ? (m.text ? <FormattedText text={m.text} onCitation={onCitation} /> : null) : m.text}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <AgentMascot state="working" size={46} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-2)' }}>
                  {agent ? 'On it…' : 'Thinking…'}
                </span>
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
