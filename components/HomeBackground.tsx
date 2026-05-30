'use client';
import { useEffect, useState } from 'react';

// Subtle looping video behind the main panel. Muted/looping/inline so it
// autoplays everywhere; a dark overlay keeps text readable. `mode` controls how
// dark the overlay is: 'hero' = bright (empty greeting), 'chat' = darker so chat
// text/answers stay legible over the scene. Honors prefers-reduced-motion.
export function HomeBackground({ mode = 'hero' }: { mode?: 'hero' | 'chat' }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(m.matches);
    update();
    m.addEventListener('change', update);
    return () => m.removeEventListener('change', update);
  }, []);

  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0, background: 'var(--base)' }}>
      {reduced ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/bg-poster.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.95 }} />
      ) : (
        <video
          autoPlay muted loop playsInline preload="metadata" poster="/bg-poster.jpg"
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.95 }}
        >
          <source src="/bg.mp4" type="video/mp4" />
        </video>
      )}
      {/* Contrast overlay. 'hero' keeps the scene bright with just a soft pool
          behind the centered text; 'chat' darkens more so messages stay legible. */}
      <div style={{
        position: 'absolute', inset: 0, transition: 'background 0.4s ease',
        background: mode === 'chat'
          ? 'linear-gradient(to bottom, rgba(26,25,23,0.62), rgba(26,25,23,0.72))'
          : 'radial-gradient(ellipse 56% 44% at 50% 46%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 72%),' +
            'linear-gradient(to bottom, rgba(26,25,23,0.22), rgba(26,25,23,0.12) 40%, rgba(26,25,23,0.28))',
      }} />
    </div>
  );
}
