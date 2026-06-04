'use client';
// ChainMind's agent character — an original little creature (its own design) that
// works at a laptop: the screen folds UP, it types (head bobs, screen glows), then
// the screen folds back DOWN. Articulated rig (parts move independently), not a
// static SVG being wholesale-bobbed.
//   • idle    → sits calm, then runs the ~5s open→work→close loop every ~16s
//   • working → laptop stays open, types continuously while the agent runs
// Minimal, clean, monochrome-green. Pure SVG + CSS, no deps.

type State = 'idle' | 'working';

export default function AgentMascot({
  size = 28,
  state = 'idle',
  color = '#65ca9d',
}: {
  size?: number;
  state?: State;
  color?: string;
}) {
  const shade = '#2f7d5e';   // keyboard / base
  const screen = '#21302a';  // laptop screen
  const glow = '#c5f3da';    // typing glow
  const eye = '#1b2a23';
  const working = state === 'working';

  // Animation assignments differ by state. Idle uses one shared 16s timeline so the
  // screen, head and glow stay in sync through the open→work→close sequence.
  const lidAnim = working ? 'none' : 'cmm-lid 16s cubic-bezier(.45,0,.25,1) infinite';
  const bodyAnim = working ? 'cmm-bob .85s ease-in-out infinite' : 'cmm-bob-idle 16s ease-in-out infinite';
  const glowAnim = working ? 'cmm-glow .9s ease-in-out infinite' : 'cmm-glow-idle 16s ease-in-out infinite';

  return (
    <span style={{ display: 'inline-block', lineHeight: 0 }} role="img" aria-label="ChainMind agent">
      <style>{`
        /* idle: closed → fold up → type → fold down → rest (≈5s active, then calm) */
        @keyframes cmm-lid{0%,8%{transform:scaleY(0)}17%,42%{transform:scaleY(1)}51%,100%{transform:scaleY(0)}}
        @keyframes cmm-glow-idle{0%,16%{opacity:0}20%{opacity:1}29%{opacity:.4}38%{opacity:1}43%,100%{opacity:0}}
        @keyframes cmm-bob-idle{0%,17%{transform:translateY(0)}21%{transform:translateY(-.7px)}25%{transform:translateY(0)}29%{transform:translateY(-.7px)}33%{transform:translateY(0)}37%{transform:translateY(-.7px)}41%,100%{transform:translateY(0)}}
        /* working: continuous typing */
        @keyframes cmm-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.8px)}}
        @keyframes cmm-glow{0%,100%{opacity:.3}50%{opacity:1}}
        .cmm-lid{transform-box:fill-box;transform-origin:50% 100%}
        .cmm-body{transform-box:fill-box;transform-origin:50% 100%}
        @media (prefers-reduced-motion: reduce){.cmm-lid{transform:scaleY(${working ? 1 : 0})!important;animation:none!important}.cmm-body,.cmm-glow{animation:none!important}}
      `}</style>
      <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: 'visible' }}>
        {/* head + eyes (behind the laptop, peeking over the top) */}
        <g className="cmm-body" style={{ animation: bodyAnim }}>
          <rect x="9" y="3" width="14" height="19" rx="5" fill={color} />
          <circle cx="13" cy="8" r="1.5" fill={eye} />
          <circle cx="19" cy="8" r="1.5" fill={eye} />
        </g>
        {/* keyboard base */}
        <rect x="6" y="21.4" width="20" height="3.2" rx="1.4" fill={shade} />
        {/* screen — folds up/down from the base */}
        <g className="cmm-lid" style={{ animation: lidAnim, transform: working ? 'scaleY(1)' : undefined }}>
          <rect x="8" y="10" width="16" height="12" rx="1.6" fill={screen} />
          <rect className="cmm-glow" x="10.5" y="12.4" width="11" height="1.5" rx="0.75" fill={glow} style={{ animation: glowAnim }} />
          <rect x="10.5" y="15" width="7" height="1.2" rx="0.6" fill={glow} opacity="0.45" />
        </g>
      </svg>
    </span>
  );
}
