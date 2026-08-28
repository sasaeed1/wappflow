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

  if (installed) return null;
  if (!canInstall && !iosManual) return null;

  if (iosHelp) {
    return <span style={{ opacity: 0.75 }}>Share → Add to Home Screen</span>;
  }

  return (
    <a
      href="#install"
      onClick={(e) => { e.preventDefault(); if (iosManual) setIosHelp(true); else prompt(); }}
    >
      Get the app
    </a>
  );
}
