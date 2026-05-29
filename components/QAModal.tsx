'use client';
import { useState, useRef, useEffect } from 'react';
import { VaultItem } from '@/types/vault';

interface Message { role: 'user' | 'ai'; text: string; }
interface Props { item: VaultItem; onClose: () => void; }

export function QAModal({ item, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    setMessages(m => [...m, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: item.content, question: q }),
      });
      const data = await res.json();
      setMessages(m => [...m, { role: 'ai', text: data.answer || data.error }]);
    } catch {
      setMessages(m => [...m, { role: 'ai', text: 'Failed to get answer.' }]);
    } finally { setLoading(false); }
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div style={{
        width: '100%', maxWidth: '600px', maxHeight: '85vh',
        background: 'var(--white)', borderRadius: '20px',
        border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Top gradient bar */}
        <div style={{ height: '3px', background: 'linear-gradient(90deg, var(--purple), var(--mint))' }} />

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.filename}
            </p>
            <p style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--mint-dark)', marginTop: '2px' }}>
              {item.blobId.slice(0, 24)}…
            </p>
          </div>
          <button onClick={onClose} style={{ fontSize: '18px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0, marginLeft: '12px' }}>✕</button>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
          {/* Summary */}
          <div style={{ padding: '14px', borderRadius: '12px', background: '#eef2ff', border: '1px solid #c7d2fe' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--purple)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Summary</p>
            <p style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: '1.6' }}>{item.summary}</p>
          </div>

          {/* Suggestion chips */}
          {messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>Try asking:</p>
              {['What is this document about?', 'What are the key takeaways?', 'Summarize in one sentence.'].map(q => (
                <button key={q} onClick={() => setInput(q)} style={{
                  fontSize: '12px', padding: '6px 12px', borderRadius: '20px',
                  background: 'var(--off-white)', border: '1px solid var(--border)',
                  color: 'var(--text-2)', cursor: 'pointer',
                }}>{q}</button>
              ))}
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{
              padding: '12px 14px', borderRadius: '12px', fontSize: '13px', lineHeight: '1.6',
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: m.role === 'user' ? 'var(--purple)' : 'var(--off-white)',
              color: m.role === 'user' ? 'white' : 'var(--text-1)',
              border: m.role === 'ai' ? '1px solid var(--border)' : 'none',
            }}>
              {m.role === 'ai' && <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--mint-dark)', display: 'block', marginBottom: '4px' }}>AI</span>}
              {m.text}
            </div>
          ))}

          {loading && (
            <div style={{ padding: '12px 14px', borderRadius: '12px', background: 'var(--off-white)', border: '1px solid var(--border)', display: 'flex', gap: '6px', alignSelf: 'flex-start' }}>
              {[0, 150, 300].map(d => (
                <div key={d} style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--purple)', animation: `bounce 1s ease ${d}ms infinite` }} />
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask anything about this document..."
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '10px', fontSize: '13px',
              border: '1px solid var(--border)', outline: 'none', color: 'var(--text-1)',
              background: 'var(--off-white)',
            }}
            onFocus={e => (e.target.style.borderColor = 'var(--purple)')}
            onBlur={e => (e.target.style.borderColor = 'var(--border)')}
          />
          <button onClick={send} disabled={loading || !input.trim()} style={{
            padding: '10px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
            background: 'var(--purple)', color: 'white', border: 'none', cursor: 'pointer',
            opacity: loading || !input.trim() ? 0.4 : 1,
          }}>Ask</button>
        </div>
      </div>
      <style>{`@keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }`}</style>
    </div>
  );
}
