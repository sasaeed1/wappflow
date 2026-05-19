import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #6366f1, #a855f7)',
          borderRadius: 38,
        }}
      >
        <svg width="110" height="110" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M35 12 L18 36 H30 L27 52 L46 26 H34 Z"
            fill="#ffffff"
            stroke="#ffffff"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    size
  );
}
