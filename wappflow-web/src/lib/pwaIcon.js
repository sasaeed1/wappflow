import { ImageResponse } from 'next/og';

// The PWA mark, rendered to PNG at whatever size the manifest asks for.
//
// WHY PNG AT ALL: the manifest previously listed only /icon.svg, and Chrome's
// installability criteria require a raster icon of at least 192x192 plus one of
// 512x512. With SVG alone the browser never considers the app installable, so
// `beforeinstallprompt` never fires — an install prompt written against that
// manifest would have been dead code that silently did nothing.
//
// Generated rather than committed as binary, using the same ImageResponse path
// apple-icon.js already proves works in this deployment, so the mark has exactly
// one definition and cannot drift between sizes.
export function renderPwaIcon(size) {
  // The glyph sits on ~57% of the tile, matching apple-icon's 110/180.
  const glyph = Math.round(size * 0.61);
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
        }}
      >
        <svg width={glyph} height={glyph} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
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
    { width: size, height: size }
  );
}
