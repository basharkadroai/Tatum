'use client';
// ChainMind's agent character — a pixel-art CHAIN LINK creature (on-brand: a single
// chunky link with a face). Same green + pixel style. Articulated motion: it hangs
// and sways like a real link — a slow gentle sway when idle, a livelier sway plus a
// pulsing glow when the agent is working.
type State = 'idle' | 'working';

// 16×16 link. G green · H highlight · D shade · E eye · W eye-shine
const LINK = [
  '                ',
  '      GGGG      ',
  '    HGGGGGGD    ',
  '    GWGGGGWG    ',
  '    GEGGGGEG    ',
  '    GGGGGGGG    ',
  '    GG    GD    ',
  '    GG    GD    ',
  '    GG    GD    ',
  '    GGGGGGGG    ',
  '     GGGGGG     ',
  '      GGGG      ',
  '                ',
  '                ',
  '                ',
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
    H: '#93e3bd',
    D: '#3a9b74',
    E: '#18241f',
    W: '#ecfff7',
  };
  const glow = '#c5f3da';

  const pixels = LINK.flatMap((row, y) =>
    [...row].map((ch, x) => (ch === ' ' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.04} height={1.04} fill={PALETTE[ch]} />)),
  );

  const swayAnim = working ? 'cmm-sway-fast 1s ease-in-out infinite' : 'cmm-sway 4.2s ease-in-out infinite';

  return (
    <span style={{ display: 'inline-block', lineHeight: 0 }} role="img" aria-label="ChainMind agent">
      <style>{`
        @keyframes cmm-sway{0%,100%{transform:rotate(-3.5deg)}50%{transform:rotate(3.5deg)}}
        @keyframes cmm-sway-fast{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
        @keyframes cmm-glow{0%,100%{opacity:0}50%{opacity:.9}}
        .cmm-link{transform-box:fill-box;transform-origin:50% 6%}
        @media (prefers-reduced-motion: reduce){.cmm-link{animation:none!important}.cmm-glow{animation:none!important}}
      `}</style>
      <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" style={{ overflow: 'visible' }}>
        <g className="cmm-link" style={{ animation: swayAnim }}>
          {pixels}
          {/* working glow — a soft pulse across the link's brow */}
          <rect className="cmm-glow" x="4" y="2" width="8" height="1" fill={glow} opacity="0" style={{ animation: working ? 'cmm-glow .9s ease-in-out infinite' : 'none' }} />
        </g>
      </svg>
    </span>
  );
}
