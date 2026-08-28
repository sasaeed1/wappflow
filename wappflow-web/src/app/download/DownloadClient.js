'use client';

// ════════════════════════════════════════════════════════════════════════════
//  DOWNLOAD — WappFlow Desktop.
//
//  The landing page has been SELLING the desktop app (it is named in a plan tier
//  and in the FAQ) while there was nowhere to get it. This is that page.
//
//  DESIGN DECISIONS, stated:
//
//  • THE BUILDS ARE UNSIGNED, AND THE PAGE SAYS SO. Windows will show
//    "Unknown publisher" and ask the user to click through SmartScreen. A
//    download button that leads to a scary warning nobody was warned about is
//    how a real product loses a first-time user's trust in one click — so the
//    warning is explained here, before they click, in plain words.
//
//  • WHAT IS ACTUALLY AVAILABLE IS WHAT IS OFFERED. The manifest is fetched at
//    runtime rather than hardcoded, so a platform with no build yet is shown as
//    "coming soon" instead of a 404. A dead download link is worse than an
//    honest absence.
//
//  • THE VISITOR'S OWN PLATFORM LEADS. Everything else stays available below —
//    detection is a convenience, never a restriction, because it is wrong often
//    enough (a Mac user downloading for a Windows machine, a locked-down work
//    laptop) that hiding the others would strand people.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import Link from 'next/link';
import LandingStyles from '@/components/landing/LandingStyles';

const PLATFORMS = [
  { id: 'win', name: 'Windows', hint: 'Windows 10 or later · 64-bit', ext: '.exe' },
  { id: 'mac', name: 'macOS', hint: 'macOS 11 or later', ext: '.dmg' },
  { id: 'linux', name: 'Linux', hint: 'AppImage · most distributions', ext: '.AppImage' },
];

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'win';
  const p = `${navigator.userAgentData?.platform || navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
  if (p.includes('mac')) return 'mac';
  if (p.includes('linux') || p.includes('android')) return 'linux';
  return 'win';
}

export default function DownloadClient() {
  const [mine, setMine] = useState(null);
  const [manifest, setManifest] = useState(null);   // null = loading, {} = none published

  useEffect(() => {
    setMine(detectPlatform());
    // Which builds actually exist. Served from the same place the installers are,
    // so the page can never advertise a file that is not there.
    fetch('/desktop/builds.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setManifest)
      .catch(() => setManifest({}));
  }, []);

  const build = (id) => manifest?.[id] || null;
  const ordered = mine ? [...PLATFORMS].sort((a, b) => (a.id === mine ? -1 : b.id === mine ? 1 : 0)) : PLATFORMS;

  return (
    <div className="lp">
      <LandingStyles />
      <div className="dl-page">
        <header className="dl-hero">
          <Link href="/" className="dl-back">← WappFlow</Link>
          <p className="dl-kicker">Desktop</p>
          <h1 className="dl-h1">WappFlow on your own machine</h1>
          <p className="dl-lede">
            Everything the web app does, plus the things a browser cannot: AI scoring that runs on
            your hardware instead of a server, watched folders that upload a shoot as it lands, and
            work that keeps going when the connection does not.
          </p>
        </header>

        <div className="dl-grid">
          {ordered.map((p) => {
            const b = build(p.id);
            const isMine = p.id === mine;
            return (
              <div key={p.id} className={`dl-card${isMine ? ' is-mine' : ''}`}>
                {isMine && <span className="dl-tag">Your system</span>}
                <h2 className="dl-name">{p.name}</h2>
                <p className="dl-hint">{p.hint}</p>
                {manifest === null ? (
                  <span className="dl-btn dl-btn--wait">Checking…</span>
                ) : b ? (
                  <>
                    <a className="dl-btn" href={b.url} download>Download {p.ext}</a>
                    <p className="dl-meta">
                      Version {b.version}{b.size ? ` · ${b.size}` : ''}{b.released ? ` · ${b.released}` : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="dl-btn dl-btn--soon">Coming soon</span>
                    <p className="dl-meta">Not published yet for {p.name}.</p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Said before they click, not after. */}
        <section className="dl-note">
          <h3 className="dl-note-h">A note on the install warning</h3>
          <p>
            These builds are not code-signed yet, so your operating system will not recognise the
            publisher. Nothing is wrong with the download — it simply means we have not bought a
            signing certificate.
          </p>
          <ul>
            <li><b>Windows:</b> SmartScreen shows “Windows protected your PC”. Click <b>More info</b>, then <b>Run anyway</b>.</li>
            <li><b>macOS:</b> Gatekeeper refuses the first launch. Right-click the app, choose <b>Open</b>, then confirm.</li>
            <li><b>Linux:</b> make the AppImage executable — <code>chmod +x WappFlow-*.AppImage</code> — and run it.</li>
          </ul>
          <p className="dl-quiet">
            The app updates itself once installed, so this is a one-time step.
          </p>
        </section>

        <p className="dl-foot">
          Prefer the browser? <Link href="/login">Use WappFlow on the web</Link> — same account, same data.
        </p>
      </div>

      <style>{`
        .dl-page { max-width: 980px; margin: 0 auto; padding: clamp(28px, 6vw, 72px) 20px 90px; }
        .dl-back { color: var(--lp-text-muted); font-size: 13px; text-decoration: none; }
        .dl-back:hover { color: var(--lp-text); }
        .dl-hero { text-align: center; margin-bottom: clamp(28px, 5vw, 52px); }
        .dl-kicker { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--lp-accent); font-weight: 700; margin: 26px 0 12px; }
        .dl-h1 { font-size: clamp(28px, 5vw, 46px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.08; margin: 0; color: var(--lp-text); }
        .dl-lede { max-width: 620px; margin: 16px auto 0; color: var(--lp-text-dim); font-size: clamp(14.5px, 1.6vw, 16.5px); line-height: 1.65; }

        .dl-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
        .dl-card {
          position: relative; padding: 24px 22px; border-radius: 18px; text-align: center;
          background: var(--lp-surface); border: 1px solid var(--lp-border);
          backdrop-filter: blur(12px);
        }
        .dl-card.is-mine { border-color: var(--lp-accent); background: var(--lp-surface-2); }
        .dl-tag {
          position: absolute; top: -10px; left: 50%; transform: translateX(-50%);
          font-size: 10px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
          padding: 4px 11px; border-radius: 999px; background: var(--lp-grad); color: #fff; white-space: nowrap;
        }
        .dl-name { font-size: 19px; font-weight: 700; margin: 6px 0 4px; color: var(--lp-text); }
        .dl-hint { font-size: 12.5px; color: var(--lp-text-muted); margin: 0 0 18px; }
        .dl-btn {
          display: inline-block; width: 100%; box-sizing: border-box; padding: 12px 18px; border-radius: 12px;
          background: var(--lp-grad); color: #fff; font-size: 14px; font-weight: 700;
          text-decoration: none; border: none; cursor: pointer;
        }
        .dl-btn--soon, .dl-btn--wait {
          background: transparent; border: 1px solid var(--lp-border-strong);
          color: var(--lp-text-muted); cursor: default;
        }
        .dl-meta { font-size: 11.5px; color: var(--lp-text-muted); margin: 10px 0 0; }

        .dl-note {
          margin-top: clamp(30px, 5vw, 52px); padding: 24px 26px; border-radius: 18px;
          background: var(--lp-surface); border: 1px solid var(--lp-border);
        }
        .dl-note-h { font-size: 15px; font-weight: 700; margin: 0 0 10px; color: var(--lp-text); }
        .dl-note p { color: var(--lp-text-dim); font-size: 14px; line-height: 1.7; margin: 0 0 12px; }
        .dl-note ul { margin: 0 0 12px; padding-left: 20px; color: var(--lp-text-dim); font-size: 14px; line-height: 1.9; }
        .dl-note b { color: var(--lp-text); }
        .dl-note code { background: rgba(255,255,255,0.06); padding: 2px 7px; border-radius: 6px; font-size: 13px; }
        .dl-quiet { color: var(--lp-text-muted) !important; font-size: 13px !important; margin: 0 !important; }

        .dl-foot { text-align: center; margin-top: 30px; color: var(--lp-text-muted); font-size: 13.5px; }
        .dl-foot a { color: var(--lp-accent); }
      `}</style>
    </div>
  );
}
