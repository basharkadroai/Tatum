export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background — solid deep indigo, no gradient */}
      <rect width="32" height="32" rx="8" fill="#4338ca" />

      {/*
        C arc: center (16,16), radius 8.5
        Start (22, 10) = 16 + 8.5·cos(-45°), 16 + 8.5·sin(-45°)
        End   (22, 22) = 16 + 8.5·cos(45°),  16 + 8.5·sin(45°)
        large-arc=1, sweep=0 → goes counterclockwise through left side
      */}
      <path
        d="M 22 10 A 8.5 8.5 0 1 0 22 22"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Terminal dots — chain link endpoints */}
      <circle cx="22" cy="10" r="1.9" fill="white" />
      <circle cx="22" cy="22" r="1.9" fill="white" />

      {/* Mind dot — subtle node in the gap */}
      <circle cx="22" cy="16" r="1.1" fill="white" fillOpacity="0.35" />
    </svg>
  );
}

export function LogoFull({ size = 32 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(size * 0.3) }}>
      <LogoMark size={size} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
        <span style={{
          fontSize: size * 0.5,
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: 'var(--text-1)',
          lineHeight: 1,
        }}>
          Chain
        </span>
        <span style={{
          fontSize: size * 0.5,
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: 'var(--text-2)',
          lineHeight: 1,
        }}>
          Mind
        </span>
      </div>
    </div>
  );
}
