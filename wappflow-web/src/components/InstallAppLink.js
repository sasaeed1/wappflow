'use client';

// InstallAppLink — a plain footer link that installs the app.
//
// Renders NOTHING unless the browser has actually confirmed the app is
// installable (or we are on iOS, where it explains the manual route). A
// marketing page that advertises "Get the app" and then does nothing when
// clicked is worse than not mentioning it, and installability genuinely varies
// by browser, platform and whether it is already installed.

import { useEffect, useState } from 'react';
import { initInstallPrompt, useInstallPrompt } from '@/lib/installPrompt';

export default function InstallAppLink() {
  const { canInstall, installed, iosManual, prompt } = useInstallPrompt();
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => { initInstallPrompt(); }, []);

  // ALWAYS rendered. This used to hide itself unless the browser had confirmed
  // the app was installable — which meant that on a browser that had not fired
  // the event yet, or where it was already installed, the footer offered no way
  // to find the apps at all. A link nobody can find is worse than one that
  // sometimes explains itself, so it now always points at /download, which
  // handles every platform and every state honestly.
  if (iosHelp) {
    return <span style={{ opacity: 0.75 }}>Share → Add to Home Screen</span>;
  }

  return (
    <a
      href="/download"
      onClick={(e) => {
        // If this very browser can install right now, do that instead of sending
        // them to a page to read about it.
        if (canInstall && !installed) { e.preventDefault(); prompt(); }
        else if (iosManual) { e.preventDefault(); setIosHelp(true); }
      }}
    >
      Get the app
    </a>
  );
}
