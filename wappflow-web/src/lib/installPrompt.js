'use client';

// ════════════════════════════════════════════════════════════════════════════
//  PWA install — one captured event, shared by everything that offers to install.
//
//  `beforeinstallprompt` fires ONCE, early, on the browser's own schedule. If
//  nothing calls preventDefault() and keeps the event, it is gone — which is why
//  this has to be a module-level singleton listening from app start rather than
//  a hook inside whichever component happens to be mounted at the time. A
//  component that mounts later (the Settings page, say) would otherwise find
//  nothing to prompt with.
//
//  HONEST LIMITS, because this is easy to get wrong:
//    • iOS Safari never fires the event. There is no programmatic install on
//      iOS at all — the only route is Share → Add to Home Screen — so callers
//      get `iosManual: true` and should show instructions, not a dead button.
//    • Chrome only fires it when the app meets its installability criteria
//      (manifest + service worker + a 192px and a 512px raster icon). The
//      manifest was SVG-only until this shipped, so it never fired here.
//    • The event can only be used once. After prompt() resolves it is spent and
//      the browser will not hand over another.
// ════════════════════════════════════════════════════════════════════════════

import { useSyncExternalStore, useCallback } from 'react';

const DISMISS_KEY = 'wf_install_dismissed';

let deferred = null;          // the captured BeforeInstallPromptEvent
let installed = false;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

// One snapshot object per state change. useSyncExternalStore compares by
// identity, so returning a fresh object every call would loop forever.
let snapshot = { canInstall: false, installed: false };
const refresh = () => {
  snapshot = { canInstall: !!deferred, installed };
  emit();
};

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;   // iOS
}

export function isIOS() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Call once, from a client component mounted at app root. Idempotent. */
export function initInstallPrompt() {
  if (typeof window === 'undefined' || window.__wfInstallInit) return;
  window.__wfInstallInit = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();       // without this Chrome shows its own mini-infobar
    deferred = e;
    refresh();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch {}
    refresh();
  });

  if (isStandalone()) { installed = true; refresh(); }
}

/** Fire the browser's install dialog. Returns 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  if (!deferred) return 'unavailable';
  const e = deferred;
  // Spent either way: the browser will not hand the same event over twice, so
  // clearing it up front stops a second click prompting into the void.
  deferred = null;
  refresh();
  try {
    e.prompt();
    const { outcome } = await e.userChoice;
    return outcome;
  } catch {
    return 'unavailable';
  }
}

export const dismissInstall = () => { try { localStorage.setItem(DISMISS_KEY, '1'); } catch {} };
export const wasDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };

/**
 * @returns {{canInstall:boolean, installed:boolean, iosManual:boolean, prompt:Function}}
 *   `iosManual` = installable, but only by hand through the Share sheet.
 */
export function useInstallPrompt() {
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const prompt = useCallback(() => promptInstall(), []);
  const iosManual = typeof window !== 'undefined' && isIOS() && !state.installed && !isStandalone();
  return { ...state, iosManual, prompt };
}
