'use client';
// ChainMind's agent character — an original blocky-green pixel creature, animated
// frame-by-frame (a real sprite/flipbook, not a tweened static icon). Frames are
// laid out as a horizontal strip and advanced with CSS steps(), the standard 2026
// technique for pixel-art character animation.
//   • idle    → breathes/blinks (alive)
//   • working → hops like it got a notification, then turns to its LEFT side and
//               types at a laptop (screen flickers)
// Each frame is a 16×16 pixel map. G green · E face(dark) · S screen · W glow · K keys
type State = 'idle' | 'working';

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

// Blink: top half of the eyes filled in (eyes look shut for one frame).
const BLINK = NEUTRAL.map((r, i) => (i === 5 ? '  GGGGGGGGGGGG  ' : r));

// Hop: raised, eyes wide, mouth open — startled by a "notification".
const HOP = [
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGEEGGGGEEGG  ',
  '  GGEEGGGGEEGG  ',
  '  GGEEGGGGEEGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGEEEEGGGG  ',
  '  GGGGGGGGGGGG  ',
  '  GGGGGGGGGGGG  ',
  '   GG      GG   ',
  '   GG      GG   ',
  '                ',
  '                ',
  '                ',
  '                ',
];

// Left profile, typing at a laptop on its left side.
const LEFT_A = [
  '                ',
  '         GGGG   ',
  '        GGGGGG  ',
  '        EGGGGG  ',
  '        GGGGGG  ',
  '   SSSSS GGGGG  ',
  '   SSSSS GGGGG  ',
  '   SSSSS GGGGG  ',
  '  KKKKKKGGGGGG  ',
  '        GGGGGG  ',
  '        GG  GG  ',
  '        GG  GG  ',
  '                ',
  '                ',
  '                ',
  '                ',
];
// Typing frame B: screen glows + body bobs up a pixel.
const LEFT_B = LEFT_A.map((r, i) => (i === 6 ? '   SWWWS GGGGG  ' : r));

const IDLE = [NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL, NEUTRAL, BLINK];
const WORK = [HOP, LEFT_A, LEFT_B, LEFT_A, LEFT_B];

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
    E: '#15201b', // face (dark)
    S: '#20302a', // laptop screen
    W: '#c5f3da', // screen glow
    K: '#2f7d5e', // keyboard
  };
  const working = state === 'working';
  const frames = working ? WORK : IDLE;
  const N = frames.length;

  const rects = frames.flatMap((f, fi) =>
    f.flatMap((row, y) =>
      [...row].map((ch, x) => (ch === ' ' ? null : <rect key={`${fi}-${x}-${y}`} x={x + fi * 16} y={y} width={1} height={1} fill={P[ch]} />)),
    ),
  );

  const dur = working ? 1.6 : 2.6;
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
