'use client';
import { useEffect } from 'react';

const LOADED_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'dev';

// Silently reloads when a new deployment is detected. The wallet reconnects
// via dApp Kit autoConnect after the reload. Polls infrequently so it only
// fires on a genuine new version (rare in production).
export function UpdateBanner() {
  useEffect(() => {
    if (LOADED_VERSION === 'dev') return;
    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const { version } = await res.json();
        if (version && version !== LOADED_VERSION) window.location.reload();
      } catch {
        // ignore network blips
      }
    }, 120_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
