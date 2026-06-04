'use client';
// ChainMind's agent character — original pixel-art creature that works at a laptop.
// Drawn as crisp pixels from a 16×16 map (shaded green, shiny eyes) with an
// articulated rig: the head bobs, the screen folds UP, glows while "typing", then
// folds back DOWN.
//   • idle    → calm; runs the ~5s open→work→close loop every ~16s
//   • working → laptop open, types continuously while the agent runs
type State = 'idle' | 'working';

// 16×16 pixel map (head + keyboard). The screen is a separate scaling layer.
// G green · H highlight · D shade · E eye · W eye-shine · K keyboard · space empty
const ART = [
  '                ',
  '     HGGGGG     ',
  '    HGGGGGGG    ',
  '   HGGGGGGGGD   ',
  '   GGWEGGWEGD   ',
  '   GGEEGGEEGD   ',
  '   GGGGGGGGGD   ',
  '   GGGGGGGGGD   ',
  '    GGGGGGGD    ',
  '     GGGGDD     ',
  '                ',
  '                ',
  '  KKKKKKKKKKKK  ',
  '  KKKKKKKKKKKK  ',
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
    H: '#93e3bd', // top-left highlight
    D: '#3a9b74', // bottom-right shade
    E: '#18241f', // eye
    W: '#ecfff7', // eye shine
    K: '#2f7d5e', // keyboard
  };
  const screen = '#20302a';
  const glow = '#c5f3da';
  const cell = 1.04; // slight overlap to avoid hairline seams between pixels

  const pixels = (keep: (c: string) => boolean) => {
    const out: React.ReactNode[] = [];
    ART.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === ' ' || !keep(ch)) return;
        out.push(<rect key={`${x}-${y}-${ch}`} x={x} y={y} width={cell} height={cell} fill={PALETTE[ch]} />);
      }),
    );
    return out;
  };

  const lidAnim = working ? 'none' : 'cmm-lid 16s cubic-bezier(.45,0,.25,1) infinite';
  const bodyAnim = working ? 'cmm-bob .85s ease-in-out infinite' : 'cmm-bob-idle 16s ease-in-out infinite';
  const glowAnim = working ? 'cmm-glow .9s ease-in-out infinite' : 'cmm-glow-idle 16s ease-in-out infinite';

  return (
    <span style={{ display: 'inline-block', lineHeight: 0 }} role="img" aria-label="ChainMind agent">
      <style>{`
        @keyframes cmm-lid{0%,8%{transform:scaleY(0)}17%,42%{transform:scaleY(1)}51%,100%{transform:scaleY(0)}}
        @keyframes cmm-glow-idle{0%,16%{opacity:0}20%{opacity:1}29%{opacity:.4}38%{opacity:1}43%,100%{opacity:0}}
        @keyframes cmm-bob-idle{0%,17%{transform:translateY(0)}21%{transform:translateY(-.7px)}25%{transform:translateY(0)}29%{transform:translateY(-.7px)}33%{transform:translateY(0)}37%{transform:translateY(-.7px)}41%,100%{transform:translateY(0)}}
        @keyframes cmm-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.8px)}}
        @keyframes cmm-glow{0%,100%{opacity:.3}50%{opacity:1}}
        .cmm-lid{transform-box:fill-box;transform-origin:50% 100%}
        .cmm-body{transform-box:fill-box;transform-origin:50% 100%}
        @media (prefers-reduced-motion: reduce){.cmm-lid{transform:scaleY(${working ? 1 : 0})!important;animation:none!important}.cmm-body,.cmm-glow{animation:none!important}}
      `}</style>
      <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" style={{ overflow: 'visible' }}>
        {/* head + eyes (bobs) */}
        <g className="cmm-body" style={{ animation: bodyAnim }}>{pixels(c => c !== 'K')}</g>
        {/* keyboard (static) */}
        {pixels(c => c === 'K')}
        {/* screen — folds up/down from the base */}
        <g className="cmm-lid" style={{ animation: lidAnim, transform: working ? 'scaleY(1)' : undefined }}>
          <rect x="3" y="6" width="10" height="6.1" fill={screen} />
          <rect className="cmm-glow" x="4" y="8" width="8" height="1" fill={glow} style={{ animation: glowAnim }} />
          <rect x="4" y="10" width="5" height="1" fill={glow} opacity="0.4" />
        </g>
      </svg>
    </span>
  );
}
