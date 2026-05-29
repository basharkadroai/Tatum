export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4f46e5" />
          <stop offset="50%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      {/* Background */}
      <rect width="32" height="32" rx="9" fill="url(#logoGrad)" />
      {/* Outer ring */}
      <line x1="16" y1="4" x2="27" y2="10" stroke="white" strokeWidth="1.1" strokeOpacity="0.45" />
      <line x1="27" y1="10" x2="27" y2="22" stroke="white" strokeWidth="1.1" strokeOpacity="0.45" />
      <line x1="27" y1="22" x2="16" y2="28" stroke="white" strokeWidth="1.1" strokeOpacity="0.45" />
      <line x1="16" y1="28" x2="5" y2="22" stroke="white" strokeWidth="1.1" strokeOpacity="0.45" />
      <line x1="5" y1="22" x2="5" y2="10" stroke="white" strokeWidth="1.1" strokeOpacity="0.45" />
      <line x1="5" y1="10" x2="16" y2="4" stroke="white" strokeWidth="1.1" strokeOpacity="0.45" />
      {/* Spokes */}
      <line x1="16" y1="16" x2="16" y2="4" stroke="white" strokeWidth="1.4" strokeOpacity="0.9" />
      <line x1="16" y1="16" x2="27" y2="10" stroke="white" strokeWidth="1.4" strokeOpacity="0.9" />
      <line x1="16" y1="16" x2="27" y2="22" stroke="white" strokeWidth="1.4" strokeOpacity="0.9" />
      <line x1="16" y1="16" x2="16" y2="28" stroke="white" strokeWidth="1.4" strokeOpacity="0.9" />
      <line x1="16" y1="16" x2="5" y2="22" stroke="white" strokeWidth="1.4" strokeOpacity="0.9" />
      <line x1="16" y1="16" x2="5" y2="10" stroke="white" strokeWidth="1.4" strokeOpacity="0.9" />
      {/* Outer nodes */}
      <circle cx="16" cy="4" r="2" fill="white" />
      <circle cx="27" cy="10" r="2" fill="white" />
      <circle cx="27" cy="22" r="2" fill="white" />
      <circle cx="16" cy="28" r="2" fill="white" />
      <circle cx="5" cy="22" r="2" fill="white" />
      <circle cx="5" cy="10" r="2" fill="white" />
      {/* Center */}
      <circle cx="16" cy="16" r="3.5" fill="white" />
    </svg>
  );
}

export function LogoFull({ size = 32 }: { size?: number }) {
  const textSize = size * 0.5;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size * 0.28 }}>
      <LogoMark size={size} />
      <span style={{
        fontSize: textSize,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        color: 'var(--text-1)',
        lineHeight: 1,
      }}>
        ChainMind
      </span>
    </div>
  );
}
