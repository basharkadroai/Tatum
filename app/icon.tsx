import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 45%, #10b981 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          {/* Outer ring connections */}
          <line x1="11" y1="2.5" x2="19" y2="7" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />
          <line x1="19" y1="7" x2="19" y2="15" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />
          <line x1="19" y1="15" x2="11" y2="19.5" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />
          <line x1="11" y1="19.5" x2="3" y2="15" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />
          <line x1="3" y1="15" x2="3" y2="7" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />
          <line x1="3" y1="7" x2="11" y2="2.5" stroke="white" strokeWidth="1.2" strokeOpacity="0.5" />
          {/* Spokes to center */}
          <line x1="11" y1="11" x2="11" y2="2.5" stroke="white" strokeWidth="1.4" strokeOpacity="0.85" />
          <line x1="11" y1="11" x2="19" y2="7" stroke="white" strokeWidth="1.4" strokeOpacity="0.85" />
          <line x1="11" y1="11" x2="19" y2="15" stroke="white" strokeWidth="1.4" strokeOpacity="0.85" />
          <line x1="11" y1="11" x2="11" y2="19.5" stroke="white" strokeWidth="1.4" strokeOpacity="0.85" />
          <line x1="11" y1="11" x2="3" y2="15" stroke="white" strokeWidth="1.4" strokeOpacity="0.85" />
          <line x1="11" y1="11" x2="3" y2="7" stroke="white" strokeWidth="1.4" strokeOpacity="0.85" />
          {/* Outer nodes */}
          <circle cx="11" cy="2.5" r="1.8" fill="white" />
          <circle cx="19" cy="7" r="1.8" fill="white" />
          <circle cx="19" cy="15" r="1.8" fill="white" />
          <circle cx="11" cy="19.5" r="1.8" fill="white" />
          <circle cx="3" cy="15" r="1.8" fill="white" />
          <circle cx="3" cy="7" r="1.8" fill="white" />
          {/* Center node */}
          <circle cx="11" cy="11" r="3" fill="white" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
