'use client';
// ChainMind's agent character — an original full-body pixel creature working at a
// laptop. Boxy head (not a circle), 2-tone eyes, arms with hands, legs with feet.
// Articulated rig: the head nods, the laptop screen folds UP, glows while typing,
// then folds back DOWN. No full-width "bar" — the laptop is a small held object.
//   • idle    → calm; runs the ~5s open→work→close loop every ~16s
//   • working → laptop open, types continuously while the agent runs
type State = 'idle' | 'working';

// Head (nods independently). G green · H highlight · D shade · E eye · W eye-shine
const HEAD = [
  '                ',
  '     HGGGGG     ',
  '     GWGGWG     ',
  '     GEGGEG     ',
  '     GGGGGD     ',
  '      GGGG      ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
];

// Body: torso, arms, hands (H), legs, feet (D). Static so hands stay on the laptop.
const BODY = [
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '                ',
  '   GGGGGGGGGG   ',
  '   GGGGGGGGGG   ',
  '   GGGGGGGGGG   ',
  '   HGGGGGGGGH   ',
  '    GGGGGGGG    ',
  '     GG  GG     ',
  '     GG  GG     ',
  '     GG  GG     ',
  '    DD    DD    ',
  '                ',
];

export default function AgentMascot({
  size = 28,
  state = 'idle',
  color = '#65ca9d',
}: {
  size?: number;
  state?: State;
  color?: string;
}) {
  const working = state === 'working';
  const PALETTE: Record<string, string> = {
    G: color,
    H: '#93e3bd', // highlight / hands
    D: '#3a9b74', // shade / feet
    E: '#18241f', // eye
    W: '#ecfff7', // eye shine
  };
  const kb = '#2f7d5e';      // laptop keyboard
  const screen = '#20302a';  // laptop screen
  const glow = '#c5f3da';
  const cell = 1.04;

  const pixels = (map: string[]) => {
    const out: React.ReactNode[] = [];
    map.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === ' ') return;
        out.push(<rect key={`${x}-${y}`} x={x} y={y} width={cell} height={cell} fill={PALETTE[ch]} />);
      }),
    );
    return out;
  };

  const headAnim = working ? 'cmm-bob .85s ease-in-out infinite' : 'cmm-bob-idle 16s ease-in-out infinite';
  const lidAnim = working ? 'none' : 'cmm-lid 16s cubic-bezier(.45,0,.25,1) infinite';
  const glowAnim = working ? 'cmm-glow .9s ease-in-out infinite' : 'cmm-glow-idle 16s ease-in-out infinite';

  return (
    <span style={{ display: 'inline-block', lineHeight: 0 }} role="img" aria-label="ChainMind agent">
      <style>{`
        @keyframes cmm-lid{0%,8%{transform:scaleY(0)}17%,42%{transform:scaleY(1)}51%,100%{transform:scaleY(0)}}
        @keyframes cmm-glow-idle{0%,16%{opacity:0}20%{opacity:1}29%{opacity:.4}38%{opacity:1}43%,100%{opacity:0}}
        @keyframes cmm-bob-idle{0%,17%{transform:translateY(0)}21%{transform:translateY(-.7px)}25%{transform:translateY(0)}29%{transform:translateY(-.7px)}33%{transform:translateY(0)}37%{transform:translateY(-.7px)}41%,100%{transform:translateY(0)}}
        @keyframes cmm-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.7px)}}
        @keyframes cmm-glow{0%,100%{opacity:.3}50%{opacity:1}}
        .cmm-lid{transform-box:fill-box;transform-origin:50% 100%}
        .cmm-head{transform-box:fill-box;transform-origin:50% 100%}
        @media (prefers-reduced-motion: reduce){.cmm-lid{transform:scaleY(${working ? 1 : 0})!important;animation:none!important}.cmm-head,.cmm-glow{animation:none!important}}
      `}</style>
      <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" style={{ overflow: 'visible' }}>
        {/* head (nods) */}
        <g className="cmm-head" style={{ animation: headAnim }}>{pixels(HEAD)}</g>
        {/* body: torso, arms, hands, legs, feet (static) */}
        {pixels(BODY)}
        {/* laptop keyboard — small held base, not a full-width bar */}
        <rect x="4.7" y="9.9" width="6.6" height="1.5" rx="0.3" fill={kb} />
        {/* screen — folds up/down from the keyboard */}
        <g className="cmm-lid" style={{ animation: lidAnim, transform: working ? 'scaleY(1)' : undefined }}>
          <rect x="5" y="5" width="6" height="5" fill={screen} />
          <rect className="cmm-glow" x="5.7" y="6.6" width="4.6" height="0.9" fill={glow} style={{ animation: glowAnim }} />
          <rect x="5.7" y="8.2" width="3" height="0.8" fill={glow} opacity="0.4" />
        </g>
      </svg>
    </span>
  );
}
