'use client';
import { useEffect, useState } from 'react';

// The launch intro: six seconds of brand on the first app screen of a launch.
//
// WHEN it plays is decided before paint by the inline script in app/layout.js,
// which sets <html data-wf-intro="1"> only for a signed-in user, on an app route
// (never a client-facing gallery/contract/booking/payment page), once per launch
// (sessionStorage). The overlay markup is always rendered but hidden by CSS unless
// that attribute is set, so server and client render the same thing and nothing
// flashes. The choreography is pure CSS (globals.css, .wf-intro*) timed from first
// paint; this component only ends it at the 6s mark. There is deliberately no skip:
// it plays once per app start, as part of opening the app, not as an interruption.
// prefers-reduced-motion users get a short, still version.
const LINES = ['Your clients are waiting ✨', 'Turning chats into bookings ⚡', 'Let’s make today a big one 🚀'];
const WORD = 'WappFlow';
const DURATION = 6000;

export default function LaunchIntro() {
  const [line, setLine] = useState(0);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.wfIntro !== '1') return undefined;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const total = still ? 1200 : DURATION;
    const end = () => { root.dataset.wfIntro = 'done'; };
    // Count from navigation start, so the CSS (which started at first paint) and
    // this timer agree even when hydration was slow.
    const left = Math.max(0, total - (performance.now() || 0));
    const t = setTimeout(end, left);
    const lines = [setTimeout(() => setLine(1), Math.max(0, 3300 - performance.now())), setTimeout(() => setLine(2), Math.max(0, 4500 - performance.now()))];
    return () => { clearTimeout(t); lines.forEach(clearTimeout); };
  }, []);

  return (
    <div
      className="wf-intro"
      role="status"
      aria-live="polite"
      aria-label="Opening WappFlow"
    >
      <div className="wf-intro__aurora" aria-hidden="true"><span /><span /><span /></div>
      <div className="wf-intro__sparks" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => <span key={i} style={{ '--i': i }} />)}
      </div>
      <div className="wf-intro__center">
        <div className="wf-intro__mark" aria-hidden="true">
          <span className="wf-intro__halo" />
          <span className="wf-intro__ring" />
          <span className="wf-intro__tile">
            <svg width="44" height="44" viewBox="0 0 64 64" fill="none">
              <path className="wf-intro__bolt" d="M35 12 L18 36 H30 L27 52 L46 26 H34 Z" fill="#fff" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
        <h1 className="wf-intro__word" aria-label={WORD}>
          {WORD.split('').map((ch, i) => <span key={i} aria-hidden="true" style={{ '--i': i }}>{ch}</span>)}
        </h1>
        <p key={line} className="wf-intro__line" style={{ animationDelay: line === 0 ? '2s' : '0s' }}>{LINES[line]}</p>
        <div className="wf-intro__bar" aria-hidden="true"><span /></div>
      </div>
    </div>
  );
}
