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
          borderRadius: 8,
          background: '#4338ca',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path
            d="M 22 10 A 8.5 8.5 0 1 0 22 22"
            stroke="white"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
          <circle cx="22" cy="10" r="1.9" fill="white" />
          <circle cx="22" cy="22" r="1.9" fill="white" />
          <circle cx="22" cy="16" r="1.1" fill="white" fillOpacity="0.35" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
