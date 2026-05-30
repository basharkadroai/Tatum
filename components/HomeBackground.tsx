'use client';
import { useEffect, useState } from 'react';

// Subtle looping video behind the home chat. Muted/looping/inline so it
// autoplays everywhere; a dark radial overlay keeps the centered text readable.
// Honors prefers-reduced-motion by showing the static poster instead.
export function HomeBackground() {
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
      {/* Contrast: keep the bright scene vivid, but darken a soft pool behind the
          centered text + a gentle global tint so the white heading stays crisp. */}
      <div style={{
        position: 'absolute', inset: 0,
        background:
          'radial-gradient(ellipse 56% 44% at 50% 46%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 72%),' +
          'linear-gradient(to bottom, rgba(26,25,23,0.22), rgba(26,25,23,0.12) 40%, rgba(26,25,23,0.28))',
      }} />
    </div>
  );
}
