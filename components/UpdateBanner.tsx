'use client';
import { useEffect } from 'react';

const LOADED_VERSION = process.env.NEXT_PUBLIC_DEPLOYMENT_VERSION ?? '';
const RELOAD_ATTEMPT_KEY = 'chainmind:deployment-reload-attempt';

export function UpdateBanner() {
  useEffect(() => {
    if (!LOADED_VERSION) return;

    const checkForNewDeployment = async () => {
      try {
        const res = await fetch('/api/version', {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (!res.ok) return;

        const { version } = (await res.json()) as { version?: unknown };
        if (typeof version !== 'string' || !version || version === LOADED_VERSION) {
          return;
        }

        if (sessionStorage.getItem(RELOAD_ATTEMPT_KEY) === version) return;

        sessionStorage.setItem(RELOAD_ATTEMPT_KEY, version);
        window.location.reload();
      } catch {
        // ignore network blips
      }
    };

    const id = setInterval(checkForNewDeployment, 120_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
