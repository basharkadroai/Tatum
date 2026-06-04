'use client';
// ChainMind's pixel-art agent mascot — an original blocky robot (NOT a copy of any
// existing brand mascot). Renders as crisp pixels from a small character map and
// animates: gentle bob + blink when idle, faster bob + pulsing antenna + scanning
// eyes when "working". Pure SVG + CSS, no deps.

type State = 'idle' | 'working';

// 16×16 pixel map. B = body, E = eye, L = antenna light, space = empty.
const ART = [
  '                ',
  '       LL       ',
  '       BB       ',
  '  BBBBBBBBBBBB  ',
  '  BBBBBBBBBBBB  ',
  '  BBBBBBBBBBBB  ',
  '  BBBBBBBBBBBB  ',
  '  BBEBBBBBBEBB  ',
  '  BBBEBBBBEBBB  ',
  '  BBEBBBBBBEBB  ',
  '  BBBBBBBBBBBB  ',
  '  BBBBBBBBBBBB  ',
  '  BBBBBBBBBBBB  ',
  '   BB      BB   ',
  '   BB      BB   ',
  '                ',
];

export default function AgentMascot({
  size = 80,
  state = 'idle',
  color = '#C27B62',
}: {
  size?: number;
  state?: State;
  color?: string;
}) {
  const eye = '#2a211b';
  const light = state === 'working' ? '#ffe39c' : '#f0c89a';

  const rects: React.ReactNode[] = [];
  ART.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === ' ') return;
      const fill = ch === 'E' ? eye : ch === 'L' ? light : color;
      const cls = ch === 'E' ? 'cm-eye' : ch === 'L' ? 'cm-light' : undefined;
      rects.push(<rect key={`${x}-${y}`} className={cls} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
    });
  });

  const working = state === 'working';
  return (
    <span style={{ display: 'inline-block', lineHeight: 0 }} aria-label="ChainMind agent" role="img">
      <style>{`
        @keyframes cm-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7%)} }
        @keyframes cm-blink { 0%,92%,100%{transform:scaleY(1)} 96%{transform:scaleY(0.1)} }
        @keyframes cm-scan { 0%,100%{transform:translateX(0)} 25%{transform:translateX(6%)} 75%{transform:translateX(-6%)} }
        @keyframes cm-pulse { 0%,100%{opacity:.55;transform:scale(0.85)} 50%{opacity:1;transform:scale(1.15)} }
        .cm-svg{animation:cm-bob ${working ? '0.8s' : '2.6s'} ease-in-out infinite;transform-origin:center}
        .cm-eye{transform-box:fill-box;transform-origin:center;animation:${working ? 'cm-scan 0.9s ease-in-out infinite' : 'cm-blink 4s ease-in-out infinite'}}
        .cm-light{transform-box:fill-box;transform-origin:center;animation:cm-pulse ${working ? '0.7s' : '2.2s'} ease-in-out infinite}
        @media (prefers-reduced-motion: reduce){.cm-svg,.cm-eye,.cm-light{animation:none}}
      `}</style>
      <svg className="cm-svg" width={size} height={size} viewBox="0 0 16 16" shapeRendering="crispEdges" style={{ overflow: 'visible' }}>
        {rects}
      </svg>
    </span>
  );
}
