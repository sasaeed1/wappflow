'use client';
import { useEffect, useState } from 'react';

// The one full-page loading state. It replaced a bare grey spinner with
// "Loading WappFlow...", which on Android sat underneath the OS splash screen as
// it faded out and made the whole launch look unfinished. Small mark, wordmark,
// a rotating line so a slow network still feels alive. Styles live in
// globals.css (.wf-loader*) so reduced-motion users get a still version.
const LINES = [
  'Turning chats into clients…',
  'Warming up your pipeline…',
  'Lining up today’s leads…',
  'Polishing your galleries…',
  'Getting your studio ready…',
];

export default function BrandLoader({ lines = LINES, fullScreen = true }) {
  // Start on a fixed line (index 0) so the server and client render the same text.
  const [i, setI] = useState(0);
  useEffect(() => {
    if (lines.length < 2) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % lines.length), 1800);
    return () => clearInterval(t);
  }, [lines.length]);

  return (
    <div className={`wf-loader${fullScreen ? ' wf-loader--full' : ''}`} role="status" aria-live="polite">
      <div className="wf-loader__mark" aria-hidden="true">
        <span className="wf-loader__ring" />
        <span className="wf-loader__tile">
          <svg width="32" height="32" viewBox="0 0 64 64" fill="none">
            <path d="M35 12 L18 36 H30 L27 52 L46 26 H34 Z" fill="#fff" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
      <div className="wf-loader__word">WappFlow</div>
      <p key={i} className="wf-loader__line">{lines[i]}</p>
      <div className="wf-loader__bar" aria-hidden="true"><span /></div>
    </div>
  );
}
