'use client';
import { useEffect, useState } from 'react';

const LOADED_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'dev';

export function UpdateBanner() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Skip polling in local dev
    if (LOADED_VERSION === 'dev') return;

    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const { version } = await res.json();
        if (version && version !== LOADED_VERSION) setReady(true);
      } catch {
        // ignore network errors silently
      }
    };

    const id = setInterval(check, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!ready) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: 'linear-gradient(90deg, var(--purple), var(--mint-dark, #0d9488))',
      color: 'white', padding: '10px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
      fontSize: '14px', fontWeight: 500, boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    }}>
      <span>✦ A new version of ChainMind is available</span>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: 'white', color: 'var(--purple)', border: 'none',
          borderRadius: '6px', padding: '4px 14px', fontWeight: 700,
          fontSize: '13px', cursor: 'pointer',
        }}
      >
        Refresh
      </button>
    </div>
  );
}
