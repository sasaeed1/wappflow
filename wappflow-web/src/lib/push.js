'use client';

// ════════════════════════════════════════════════════════════════════════════
//  Push enrolment — keeping the browser and the server agreeing.
//
//  THE BUG THIS FIXES. The app decided whether you were "subscribed" by asking
//  the BROWSER, and never checked whether the server had the subscription. Found
//  in production: this browser held a valid push subscription while the server's
//  table had ZERO rows. Settings said "Notifications Active" and not a single
//  notification could ever have been delivered — the UI was lying, and nothing
//  would have corrected it.
//
//  A browser subscription and a server row fall out of step easily and silently:
//    • the push service rotates an endpoint on its own schedule
//    • the VAPID key changes, invalidating every existing subscription
//    • the subscribe POST fails (offline, 500) after the browser half succeeded
//    • the row is deleted server-side while the browser keeps its half
//
//  So enrolment is idempotent and runs on every load: if permission is granted,
//  make sure the server has the current endpoint. POST /api/push/subscribe
//  already no-ops on a known endpoint, so this is cheap and safe to repeat.
//
//  WHAT THIS DELIBERATELY DOES NOT DO: prompt. Notification.requestPermission()
//  must come from a user gesture, and a denied permission is close to permanent —
//  the browser stops asking and the user has to dig through site settings to undo
//  it. A prompt fired on page load does not merely fail, it permanently loses
//  that user's notifications. The asking belongs to a button someone chose to
//  press; this module only handles the case where they ALREADY said yes.
// ════════════════════════════════════════════════════════════════════════════

import { BASE_URL } from './api';

const urlBase64ToUint8Array = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/**
 * Make the server's record match this browser's reality.
 *
 * Only acts when permission is ALREADY granted — never prompts.
 * @returns {Promise<'unsupported'|'not-granted'|'no-token'|'synced'|'failed'>}
 */
export async function syncPushSubscription() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission !== 'granted') return 'not-granted';

  const token = (() => { try { return localStorage.getItem('token'); } catch { return null; } })();
  if (!token) return 'no-token';   // signed out; a subscription has nobody to belong to

  try {
    const reg = await navigator.serviceWorker.ready;
    const { publicKey } = await (await fetch(`${BASE_URL}/api/push/vapid-key`)).json();
    if (!publicKey) return 'failed';

    let sub = await reg.pushManager.getSubscription();

    // An existing subscription minted against a DIFFERENT VAPID key can never be
    // pushed to — the server's signature will not verify. Compare and re-mint
    // rather than leaving a subscription that looks healthy and is not.
    if (sub) {
      const want = urlBase64ToUint8Array(publicKey);
      const have = sub.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
      const sameKey = have && have.length === want.length && have.every((b, i) => b === want[i]);
      if (!sameKey) { try { await sub.unsubscribe(); } catch {} sub = null; }
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    // Idempotent server-side: a known endpoint is a no-op. Sent on every load so
    // a desync repairs itself rather than persisting silently forever.
    const res = await fetch(`${BASE_URL}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(sub.toJSON()),
    });
    return res.ok ? 'synced' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * Ask for permission and enrol. MUST be called from a click or tap.
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'|'failed'>}
 */
export async function requestPushPermission() {
  if (!pushSupported()) return 'unsupported';
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm;              // 'denied' | 'default'
    // Register before subscribing: on a cold first visit the worker may not be
    // ready yet, and pushManager.subscribe() would throw.
    try { await navigator.serviceWorker.register('/sw.js'); } catch {}
    const r = await syncPushSubscription();
    return r === 'synced' ? 'granted' : 'failed';
  } catch {
    return 'failed';
  }
}

// Has this browser been offered the soft ask already? Asking twice is nagging,
// and the browser's own prompt can only be answered once anyway.
const ASKED_KEY = 'wf_push_asked';
export const pushAsked = () => { try { return localStorage.getItem(ASKED_KEY) === '1'; } catch { return false; } };
export const markPushAsked = () => { try { localStorage.setItem(ASKED_KEY, '1'); } catch {} };
