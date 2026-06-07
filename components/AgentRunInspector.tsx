'use client';

import { ShieldCheck, ShieldAlert, Gauge, Wrench, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { CSSProperties } from 'react';

export type AgentRunEvent = {
  type: string;
  id?: string;
  tool?: string;
  label?: string;
  detail?: string;
  durationMs?: number;
  permission?: string;
  automatic?: boolean;
};

type TraceSummary = {
  runId?: string;
  durationMs?: number;
  tools?: string[];
  ok?: boolean;
};

function permissionLabel(permission?: string) {
  if (permission === 'approval_required') return 'Approval';
  if (permission === 'guardrail') return 'Guardrail';
  if (permission === 'external') return 'External';
  if (permission === 'write_offer') return 'Store offer';
  if (permission === 'internal') return 'Internal';
  return 'Read';
}

function permissionStyle(permission?: string): CSSProperties {
  if (permission === 'approval_required') return { color: 'var(--error)', borderColor: 'var(--error-border)', background: 'var(--error-bg)' };
  if (permission === 'guardrail') return { color: 'var(--purple)', borderColor: 'var(--purple-bg)', background: 'var(--purple-bg)' };
  if (permission === 'external') return { color: 'var(--text-2)', borderColor: 'rgba(255, 184, 107, 0.38)', background: 'rgba(255, 184, 107, 0.12)' };
  if (permission === 'write_offer') return { color: 'var(--mint-dark)', borderColor: 'var(--success-border)', background: 'var(--success-bg)' };
  return { color: 'var(--text-3)', borderColor: 'var(--border)', background: 'var(--off-white)' };
}

export function AgentRunInspector({ events, trace }: { events?: AgentRunEvent[]; trace?: TraceSummary }) {
  const [open, setOpen] = useState(false);
  const finished = (events || []).filter(e => e.type === 'tool_done' || e.type === 'tool_error' || e.type === 'permission_gate');
  if (!finished.length && !trace) return null;
  const failed = finished.filter(e => e.type === 'tool_error').length;
  const permissions = Array.from(new Set(finished.map(e => e.permission || 'read')));
  const automatic = finished.filter(e => e.automatic).length;
  const totalMs = typeof trace?.durationMs === 'number'
    ? trace.durationMs
    : finished.reduce((sum, e) => sum + (e.durationMs || 0), 0);

  return (
    <div style={{ margin: '8px 0 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'rgba(255,255,255,0.42)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: 'none', background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', textAlign: 'left' }}
      >
        {failed ? <ShieldAlert size={14} color="var(--error)" /> : <ShieldCheck size={14} color="var(--mint-dark)" />}
        <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Run</span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{finished.length} events</span>
        {automatic > 0 && <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>{automatic} automatic</span>}
        {typeof totalMs === 'number' && totalMs > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', color: 'var(--text-3)' }}>
            <Gauge size={11} /> {totalMs}ms
          </span>
        )}
        <span style={{ display: 'inline-flex', gap: '4px', marginLeft: 'auto', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {permissions.slice(0, 4).map(permission => (
            <span key={permission} style={{ ...permissionStyle(permission), fontSize: '10px', fontWeight: 800, padding: '2px 6px', border: '1px solid', borderRadius: '999px' }}>
              {permissionLabel(permission)}
            </span>
          ))}
        </span>
        <ChevronDown size={13} style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.18s ease', flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px 10px', display: 'grid', gap: '7px' }}>
          {trace?.runId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-3)' }}>
              <Wrench size={12} /> Trace {trace.runId.slice(0, 8)} - {trace.ok === false ? 'finished with issue' : 'finished'}
            </div>
          )}
          {finished.map((event, index) => (
            <div key={`${event.id || event.tool || event.label}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px', alignItems: 'start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: event.type === 'tool_error' ? 'var(--error)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {event.label || event.tool || 'Tool'}
                </div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {event.tool || (event.type === 'permission_gate' ? 'permission_gate' : 'tool')}{event.automatic ? ' - automatic' : ''}{event.detail ? ` - ${event.detail}` : ''}
                </div>
              </div>
              <span style={{ ...permissionStyle(event.permission), fontSize: '10px', fontWeight: 800, padding: '2px 6px', border: '1px solid', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                {permissionLabel(event.permission)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
