'use client';

// InstallAppCard — the permanent home for "install the app", in Settings.
//
// The mobile banner is one-shot and dismissible by design; this is where anyone
// who dismissed it (or is on desktop, or changed their mind) can still install.
// It always renders and always tells the truth about the current state, rather
// than disappearing when it has nothing to offer — a settings row that vanishes
// is a settings row people think is broken.

import { useEffect, useState } from 'react';
import { Smartphone, Check, Share } from 'lucide-react';
import { initInstallPrompt, useInstallPrompt, isStandalone } from '@/lib/installPrompt';

export default function InstallAppCard() {
  const { canInstall, installed, iosManual, prompt } = useInstallPrompt();
  const [standalone, setStandalone] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => { initInstallPrompt(); setStandalone(isStandalone()); }, []);

  const done = installed || standalone;

  // Four honest states, because "Install" that does nothing is worse than a
  // sentence explaining why it cannot.
  const body = done
    ? 'WappFlow is installed on this device.'
    : iosManual
      ? 'On iPhone and iPad, installing is done from the browser’s Share menu.'
      : canInstall
        ? 'Install WappFlow as an app: a home-screen icon, its own window, and notifications that arrive with no tab open.'
        : 'Your browser has not offered an install for this device yet. Chrome, Edge and Android support it; on desktop, look for the install icon in the address bar.';

  return (
    <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, padding: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ width: 44, height: 44, borderRadius: 13, background: done ? '#10b981' : 'linear-gradient(135deg, #6366f1, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {done ? <Check size={20} color="white" /> : <Smartphone size={20} color="white" />}
      </div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>
          {done ? 'App installed' : 'Install the app'}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{body}</p>
        {showIosHelp && (
          <p style={{ fontSize: 13, color: 'var(--text)', margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            Tap <Share size={13} aria-hidden="true" /> <strong>Share</strong> in Safari, then <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
      {!done && (canInstall || iosManual) && (
        <button
          onClick={() => { if (iosManual) setShowIosHelp(true); else prompt(); }}
          style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', color: 'white', flexShrink: 0 }}>
          {iosManual ? 'Show me how' : 'Install'}
        </button>
      )}
    </div>
  );
}
