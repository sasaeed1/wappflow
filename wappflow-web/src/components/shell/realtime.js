'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

// Realtime — ONE SSE connection for the whole app (Phase 5).
//
// Before this, five components each opened their own EventSource: dashboard,
// chat, lead detail, FloatingChat and the admin events page. Because each lived
// in a page component, every navigation tore its stream down and opened a new
// one, and any CRM page could easily hold two at once (FloatingChat persists at
// shell level and kept a second connection open on top of the page's). Studio
// and Contracts had none at all, so every ms_* and cs_* frame the backend sent
// was thrown away platform-wide.
//
// The shell mounts this once, so the connection survives navigation, and any
// component subscribes to the event types it cares about.
//
//   const status = useRealtime('whatsapp_status', (data) => setStatus(data.status));
//   useRealtime(['lead_created', 'lead_updated'], onLeadChange);
//
// FRAMING CONTRACT (learned the hard way, keep it): the backend writes UNNAMED
// frames — `data: {"type":"lead_created",...}` with no `event:` line. So
// addEventListener('lead_created', …) silently receives NOTHING; the only thing
// that works is onmessage plus a switch on data.type. That routing lives here
// once, which is the point: no consumer can get it wrong again.

const RealtimeContext = createContext(null);

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function RealtimeProvider({ children }) {
  // handlers: Map<eventType, Set<fn>> — a plain ref, so subscribing never re-renders.
  const handlers = useRef(new Map());
  const esRef = useRef(null);
  const retryRef = useRef(null);
  const attemptRef = useRef(0);
  const [connected, setConnected] = useState(false);

  const subscribe = useCallback((types, fn) => {
    const list = Array.isArray(types) ? types : [types];
    for (const t of list) {
      if (!handlers.current.has(t)) handlers.current.set(t, new Set());
      handlers.current.get(t).add(fn);
    }
    return () => { for (const t of list) handlers.current.get(t)?.delete(fn); };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      retryRef.current = null; // a scheduled retry has now fired (or we are connecting fresh)
      if (cancelled) return;
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) return; // logged out: nothing to listen to
      let es;
      try { es = new EventSource(`${BASE_URL}/api/events?token=${encodeURIComponent(token)}`); }
      catch { return; }
      esRef.current = es;

      es.onopen = () => {
        if (cancelled) return;
        attemptRef.current = 0;
        setConnected(true);
      };

      es.onmessage = (e) => {
        let data;
        try { data = JSON.parse(e.data); } catch { return; }
        if (!data || !data.type) return;
        // A handler that throws must not take the others down with it.
        for (const fn of handlers.current.get(data.type) || []) {
          try { fn(data); } catch (err) { console.error(`realtime handler for ${data.type} failed`, err); }
        }
        for (const fn of handlers.current.get('*') || []) {
          try { fn(data); } catch {}
        }
      };

      es.onerror = () => {
        if (cancelled) return;
        setConnected(false);
        // The browser retries on its own, but silently and forever. Reconnect on
        // our own terms so a dead token or a restarted server backs off instead
        // of hammering, and so `connected` reflects reality for the UI.
        try { es.close(); } catch {}
        if (esRef.current === es) esRef.current = null;
        const attempt = Math.min(++attemptRef.current, 6);
        const delay = Math.min(1000 * 2 ** (attempt - 1), 30000); // 1s → 30s
        clearTimeout(retryRef.current);
        retryRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    // A tab that was asleep can hold a connection the server already dropped.
    const onWake = () => {
      if (document.visibilityState === 'visible' && !esRef.current) {
        clearTimeout(retryRef.current);
        attemptRef.current = 0;
        connect();
      }
    };
    document.addEventListener('visibilitychange', onWake);

    // This provider lives above the shell (the shell still remounts per route),
    // so it is mounted on public pages and on the login screen too — before any
    // token exists. This tick reconciles the connection with the session: it
    // opens one after sign-in without a reload, and drops it on sign-out instead
    // of streaming to a page that is no longer authenticated. No network cost —
    // it only reads localStorage.
    const reconcile = setInterval(() => {
      if (cancelled) return;
      const token = localStorage.getItem('token');
      if (token && !esRef.current && !retryRef.current) connect();
      else if (!token && esRef.current) {
        try { esRef.current.close(); } catch {}
        esRef.current = null;
        attemptRef.current = 0;
        clearTimeout(retryRef.current);
        retryRef.current = null;
        setConnected(false);
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(reconcile);
      document.removeEventListener('visibilitychange', onWake);
      clearTimeout(retryRef.current);
      try { esRef.current?.close(); } catch {}
      esRef.current = null;
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ subscribe, connected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Subscribe to one or more event types for the life of the component.
 *
 * The handler is kept in a ref, so it always sees fresh props/state without
 * needing to be memoised at the call site — passing an inline arrow is fine and
 * will not churn the subscription.
 *
 * Returns the live connection state, for components that show it.
 */
export function useRealtime(types, handler) {
  const ctx = useContext(RealtimeContext);
  const saved = useRef(handler);
  saved.current = handler;

  const key = Array.isArray(types) ? types.join('|') : types;

  useEffect(() => {
    if (!ctx || !key) return;
    return ctx.subscribe(Array.isArray(types) ? types : [types], (data) => saved.current?.(data));
    // `types` is intentionally not a dep: the joined key already captures it, and
    // a fresh array literal on every render would otherwise resubscribe forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, key]);

  return ctx ? ctx.connected : false;
}

/** Connection state on its own, for status dots. */
export function useRealtimeStatus() {
  const ctx = useContext(RealtimeContext);
  return ctx ? ctx.connected : false;
}
