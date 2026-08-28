'use client';

// ════════════════════════════════════════════════════════════════════════════
//  PushEnroll — two jobs, mounted app-wide.
//
//  1. SILENT RE-SYNC. If permission is already granted, make sure the server has
//     this browser's current endpoint. No prompt, no UI. This is what makes
//     notifications "already on" for anyone who said yes before — and it repairs
//     the desync found in production, where the browser held a subscription the
//     server had no record of, so Settings read "Active" while nothing could be
//     delivered.
//
//  2. THE SOFT ASK, once, after install. An in-app card that explains what they
//     get, with a button. The browser's own prompt fires only when that button is
//     pressed.
//
//  WHY NOT JUST PROMPT ON LOAD: a denied permission is close to permanent. The
//  browser stops asking, and the user must find it in site settings to undo. So a
//  badly timed prompt does not merely fail — it permanently costs that user every
//  future notification. Asking right after someone chose to install is the
//  highest-intent moment available, and asking in our own UI first means a "no"
//  costs nothing: they can say yes later from Settings, because the real browser
//  prompt was never spent.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { Bell, X } from 'lucide-react';
import { pushSupported, syncPushSubscription, requestPushPermission, pushAsked, markPushAsked } from '@/lib/push';
import { isStandalone } from '@/lib/installPrompt';

export default function PushEnroll() {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    let cancelled = false;

    (async () => {
      // Always try the silent path first — for a returning user this is the whole
      // feature, and it costs one request.
      const r = await syncPushSubscription();
      if (cancelled) return;

      // Offer the soft ask only when there is a real decision to make: the app is
      // installed (so notifications can actually arrive when it is closed), we are
      // signed in, permission has never been answered, and we have not asked.
      const signedIn = (() => { try { return !!localStorage.getItem('token'); } catch { return false; } })();
      if (r === 'not-granted' && Notification.permission === 'default' && signedIn && isStandalone() && !pushAsked()) {
        // A beat after load: arriving into a fresh app and being asked something
        // immediately reads as a pop-up, and gets dismissed as one.
        setTimeout(() => { if (!cancelled) setAsk(true); }, 2500);
      }
    })();

    // A subscription can be revoked or rotated while the app sits open for days.
    const onVisible = () => { if (document.visibilityState === 'visible') syncPushSubscription(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    markPushAsked();
    await requestPushPermission();   // the real prompt — from this tap
    setBusy(false);
    setAsk(false);
  }, []);

  const dismiss = () => { markPushAsked(); setAsk(false); };

  if (!ask) return null;

  return (
    <div className="wf-push-ask" role="dialog" aria-label="Turn on notifications">
      <div className="wf-push-icon"><Bell size={16} /></div>
      <div className="wf-push-text">
        <strong>Get notified when a lead messages</strong>
        <span>New leads, replies and reminders — even when WappFlow is closed.</span>
      </div>
      <button className="wf-push-yes" onClick={enable} disabled={busy}>{busy ? 'Enabling…' : 'Turn on'}</button>
      <button className="wf-push-no" onClick={dismiss} aria-label="Not now">
        <X size={15} />
      </button>

      <style>{`
        .wf-push-ask {
          position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 9150;
          display: flex; align-items: center; gap: 11px; padding: 12px 13px;
          background: var(--surface); color: var(--text);
          border: 1px solid var(--border); border-radius: 14px;
          box-shadow: 0 18px 44px rgba(0,0,0,0.34);
          animation: wf-push-up .28s cubic-bezier(.2,.8,.3,1);
        }
        @keyframes wf-push-up { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .wf-push-ask { animation: none; } }
        /* Sits above the install banner rather than fighting it for the same spot. */
        @media (min-width: 768px) { .wf-push-ask { left: auto; right: 16px; width: 360px; } }
        .wf-push-icon {
          width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center;
          background: linear-gradient(135deg, #6366f1, #a855f7); color: #fff;
        }
        .wf-push-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .wf-push-text strong { font-size: 13.5px; font-weight: 700; }
        .wf-push-text span { font-size: 11.5px; color: var(--text-muted); line-height: 1.4; }
        .wf-push-yes {
          flex-shrink: 0; padding: 8px 14px; border-radius: 9px; border: none;
          background: var(--accent); color: #fff;
          font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
        }
        .wf-push-yes:disabled { opacity: .6; cursor: wait; }
        .wf-push-no {
          flex-shrink: 0; width: 26px; height: 26px; display: grid; place-items: center;
          background: none; border: none; border-radius: 7px; color: var(--text-dim); cursor: pointer;
        }
        .wf-push-no:hover { background: var(--surface2); color: var(--text); }
      `}</style>
    </div>
  );
}
