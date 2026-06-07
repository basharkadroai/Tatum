'use client';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import type { UploadStep } from '@/lib/upload';

// Lean, monochrome pipeline timeline — a thin chain of nodes, each showing a
// live spinner while running then a quiet checkmark when done.
// `continues` keeps the connector flowing past the last step (so a following
// chain node — e.g. a human-interaction prompt — joins the same thread).
export function UploadSteps({ steps, continues }: { steps: UploadStep[]; continues?: boolean }) {
  if (!steps.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', margin: '0 0 6px' }}>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const done = s.status === 'done';
        const error = s.status === 'error';
        const running = s.status === 'running';
        return (
          <div key={i} style={{ display: 'flex', gap: '11px', animation: 'fadeUp 0.25s ease' }}>
            {/* node + connector */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '16px' }}>
              <div
                style={{
                  width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, color: error ? 'var(--error)' : running ? 'var(--text-1)' : 'var(--text-3)',
                  transition: 'color 0.25s ease',
                }}
              >
                {running && <Loader2 size={13} className="lucide-spin" strokeWidth={2.25} />}
                {done && <span style={{ display: 'inline-flex', animation: 'pop 0.25s ease' }}><Check size={13} strokeWidth={2.5} /></span>}
                {error && <AlertCircle size={13} strokeWidth={2.25} />}
              </div>
              {(!last || continues) && (
                <div style={{ width: '1px', flex: 1, minHeight: '15px', margin: '3px 0', background: 'var(--border)' }} />
              )}
            </div>
            {/* label + detail */}
            <div style={{ paddingBottom: last && !continues ? 0 : '11px', minWidth: 0 }}>
              <div style={{
                fontSize: '13px', lineHeight: '16px', fontWeight: 450,
                color: error ? 'var(--error)' : running ? 'var(--text-1)' : 'var(--text-2)',
                transition: 'color 0.25s ease',
              }}>
                {s.label}
              </div>
              {s.detail && (
                <div style={{ fontSize: '11px', lineHeight: '1.5', color: 'var(--text-3)', marginTop: '3px', animation: 'fadeUp 0.25s ease' }}>
                  {s.detail}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
