'use client';
// ChainMind's agent character — an original blocky-green pixel creature, animated
// frame-by-frame (a real sprite/flipbook advanced with CSS steps()).
//   • idle    → breathes/blinks (front view — DO NOT change, this look is approved)
//   • working → the SAME creature turns left through in-between frames, then types
//               at a (big) laptop, then turns back. One continuous, connected motion.
// 16×16 maps. G green · E face(dark) · S screen · W glow · K keyboard
type State = 'idle' | 'working';

// ── Front view (approved look) ──
const NEUTRAL = [
  '   GG      GG   ',
  '   GG      GG   ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGEEGGGGEEGG  ',
  '  GGEEGGGGEEGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGEEGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGG      GGG  ',
  '  GGG      GGG  ',
  '                ',
  '                ',
];
const BLINK = NEUTRAL.map((r, i) => (i === 5 ? '  GGGGGGGGGGGG  ' : r));

// ── Turn frames: SAME creature, eyes/mouth shift left as it rotates ──
const TURN1 = [
  '   GG      GG   ',
  '   GG      GG   ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GEEGGGGEEGGG  ',
  '  GEEGGGGEEGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGEEGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGG      GGG  ',
  '  GGG      GGG  ',
  '                ',
  '                ',
];
const TURN2 = [
  '   GG     GG    ',
  '   GG     GG    ',
  '  GGGGGGGGGGG   ',
  '  GGGGGGGGGGG   ',
  '  GGGGGGGGGGG   ',
  '  GEEGGEEGGGG   ',
  '  GEEGGEEGGGG   ',
  '  GGGGGGGGGGG   ',
  '  GGGEEGGGGGG   ',
  '  GGGGGGGGGGG   ',
  '  GGGGGGGGGGG   ',
  '  GGGGGGGGGGG   ',
  '  GGG     GGG   ',
  '  GGG     GGG   ',
  '                ',
  '                ',
];

// ── Working: same (turned) creature behind a big laptop, typing ──
const WORK_A = [
  '   GG     GG    ',
  '   GG     GG    ',
  '  GGGGGGGGGGG   ',
  '  GGGGGGGGGGG   ',
  '  GEEGGEEGGGG   ',
  '  GGGGGGGGGGG   ',
  '  GGGGGGGGGGG   ',
  ' SSSSSSSGGGGG   ',
  ' SSSSSSSGGGGG   ',
  ' SSSSSSSGGGGG   ',
  'KKKKKKKKKGGGG   ',
  'KKKKKKKKKGGGG   ',
  '  GG      GGG   ',
  '  GG      GGG   ',
  '                ',
  '                ',
];
const WORK_B = WORK_A.map((r, i) => (i === 8 ? ' SWWWWWSGGGGG   ' : r));

const IDLE = [NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL, BLINK];
// Turn in → type → turn back, looping from the exact front pose (connected motion).
const WORK = [NEUTRAL, TURN1, TURN2, WORK_A, WORK_B, WORK_A, WORK_B, WORK_A, WORK_B, TURN2, TURN1];

export default function AgentMascot({
  size = 28,
  state = 'idle',
  color = '#65ca9d',
}: {
  size?: number;
  state?: State;
  color?: string;
}) {
  const P: Record<string, string> = {
    G: color,
    E: '#15201b',
    S: '#20302a',
    W: '#c5f3da',
    K: '#2f7d5e',
  };
  const working = state === 'working';
  const frames = working ? WORK : IDLE;
  const N = frames.length;

  const rects = frames.flatMap((f, fi) =>
    f.flatMap((row, y) =>
      [...row].map((ch, x) => (ch === ' ' ? null : <rect key={`${fi}-${x}-${y}`} x={x + fi * 16} y={y} width={1} height={1} fill={P[ch]} />)),
    ),
  );

  const dur = working ? (WORK.length * 0.32).toFixed(2) : '2.6';
  const animName = working ? 'cmm-work' : 'cmm-idle';

  return (
    <span style={{ display: 'inline-block', lineHeight: 0 }} role="img" aria-label="ChainMind agent">
      <style>{`
        @keyframes cmm-idle{from{transform:translateX(0)}to{transform:translateX(-${16 * IDLE.length}px)}}
        @keyframes cmm-work{from{transform:translateX(0)}to{transform:translateX(-${16 * WORK.length}px)}}
        @media (prefers-reduced-motion: reduce){.cmm-strip{animation:none!important}}
      `}</style>
      <svg width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" style={{ overflow: 'hidden' }}>
        <g className="cmm-strip" style={{ animation: `${animName} ${dur}s steps(${N}) infinite` }}>{rects}</g>
      </svg>
    </span>
  );
}
