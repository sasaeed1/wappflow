'use client';

// InstallAppBanner — offers the install ONCE, then never nags again.
//
// Shown only when the browser has actually said the app is installable (or on
// iOS, where installation is manual and the browser says nothing). Dismissing it
// is permanent for that browser: an install prompt that reappears every session
// is the thing everybody hates about install prompts.
//
// Deliberately mobile-only. On a desktop the app is already a tab the user
// chose to open; the offer belongs where a home-screen icon is worth something.
// Settings → General carries the same action for anyone who wants it later.

import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { initInstallPrompt, useInstallPrompt, dismissInstall, wasDismissed } from '@/lib/installPrompt';

export default function InstallAppBanner() {
  const { canInstall, installed, iosManual, prompt } = useInstallPrompt();
  const [hidden, setHidden] = useState(true);   // assume hidden until we have checked
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    initInstallPrompt();
    // localStorage is only readable on the client, so the first paint must not
    // depend on it — otherwise the banner flashes in and out on every load.
    setHidden(wasDismissed());
  }, []);

  const close = () => { dismissInstall(); setHidden(true); };

  if (hidden || installed) return null;
  if (!canInstall && !iosManual) return null;

  return (
    <div className="wf-install-banner" role="complementary" aria-label="Install WappFlow">
      <div className="wf-ib-icon"><Download size={16} /></div>
      <div className="wf-ib-text">
        <strong>Install WappFlow</strong>
        <span>
          {iosManual
            ? 'Add it to your home screen for full-screen access and notifications.'
            : 'Get a home-screen icon, full-screen app and push notifications.'}
        </span>
        {showIosHelp && (
          <span className="wf-ib-ios">
            Tap <Share size={12} aria-hidden="true" /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
          </span>
        )}
      </div>
      <button
        className="wf-ib-cta"
        onClick={async () => {
          // iOS has no programmatic install — showing instructions is the only
          // honest action, so the button says what it will do rather than
          // pretending to install and doing nothing.
          if (iosManual) { setShowIosHelp(true); return; }
          const outcome = await prompt();
          if (outcome !== 'dismissed') close();
        }}
      >
        {iosManual ? (showIosHelp ? 'Got it' : 'How') : 'Install'}
      </button>
      <button className="wf-ib-x" onClick={close} aria-label="Don't show this again"><X size={15} /></button>

      <style>{`
        .wf-install-banner {
          position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 9200;
          display: flex; align-items: center; gap: 11px; padding: 11px 12px;
          background: var(--surface); color: var(--text);
          border: 1px solid var(--border); border-radius: 14px;
          box-shadow: 0 18px 44px rgba(0,0,0,0.34);
          animation: wf-ib-up .28s cubic-bezier(.2,.8,.3,1);
        }
        @keyframes wf-ib-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .wf-install-banner { animation: none; } }

        /* Desktop already has the app open in a tab the user chose. */
        @media (min-width: 768px) { .wf-install-banner { display: none; } }

        .wf-ib-icon {
          width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
          display: grid; place-items: center;
          background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff;
        }
        .wf-ib-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .wf-ib-text strong { font-size: 13.5px; font-weight: 700; }
        .wf-ib-text span { font-size: 11.5px; color: var(--text-muted); line-height: 1.4; }
        .wf-ib-ios { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 3px; }
        .wf-ib-cta {
          flex-shrink: 0; padding: 8px 14px; border-radius: 9px; border: none;
          background: var(--accent); color: #fff;
          font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
        }
        .wf-ib-x {
          flex-shrink: 0; width: 26px; height: 26px; display: grid; place-items: center;
          background: none; border: none; border-radius: 7px;
          color: var(--text-dim); cursor: pointer;
        }
        .wf-ib-x:hover { background: var(--surface2); color: var(--text); }
      `}</style>
    </div>
  );
}
