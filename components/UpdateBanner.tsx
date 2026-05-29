'use client';
import { useEffect } from 'react';

const LOADED_VERSION = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? 'dev';

export function UpdateBanner() {
  useEffect(() => {
    if (LOADED_VERSION === 'dev') return;

    const id = setInterval(async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const { version } = await res.json();
        if (version && version !== LOADED_VERSION) window.location.reload();
      } catch {
        // ignore
      }
    }, 60_000);

    return () => clearInterval(id);
  }, []);

  return null;
}
