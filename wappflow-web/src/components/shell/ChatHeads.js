'use client';

// Chat bubbles — Messenger-style chat heads (PROP-007).
//
// A customer message pops a round bubble onto the screen, wherever you are in
// WappFlow. Drag it anywhere (it snaps to the nearest side and remembers where
// you left it), drop it on the ✕ to close, tap it to read and reply in a mini
// chat without leaving the page. One bubble per conversation, up to four.
//
// • The mini chat is the existing FloatingChat in its embedded mode — no
//   second chat implementation.
// • Messages arrive over the shell's one realtime connection (`new_message`).
//   A bubble appears only for a lead this user can open (the lead is fetched
//   through the normal, permission-scoped route first).
// • With WappFlow closed, the server sends a push instead (backend/chat-bubbles.js);
//   tapping it lands here with ?bubble=<leadId>, or — if WappFlow is open in
//   another tab — the service worker posts 'wf-open-bubble'.
// • Settings → Notifications → Chat bubbles turns all of it off (per user).

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import FloatingChat from '@/components/FloatingChat';
import { useRealtime } from '@/components/shell/realtime';
import { leadsAPI, profileAPI } from '@/lib/api';

const SIZE = 56;          // bubble diameter
const GAP = 10;           // space between stacked bubbles
const EDGE = 12;          // distance from the screen edge when snapped
const MAX_HEADS = 4;
const DRAG_START = 6;     // px of movement before a press becomes a drag
const HEADS_KEY = 'wf_chat_heads';
const POS_KEY = 'wf_chat_heads_pos';

const PLATFORM = {
  whatsapp: { bg: 'linear-gradient(135deg, #25d366, #128c7e)', label: 'WhatsApp' },
  instagram: { bg: 'linear-gradient(135deg, #f58529, #dd2a7b 55%, #8134af)', label: 'Instagram' },
  facebook: { bg: 'linear-gradient(135deg, #3b82f6, #1877f2)', label: 'Facebook' },
};
const platformOf = (p) => PLATFORM[p] || { bg: 'linear-gradient(135deg, #6366f1, #8b5cf6)', label: 'Message' };

const read = (store, key, fallback) => { try { const v = store.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const write = (store, key, value) => { try { store.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

function previewOf(m) {
  const body = String(m?.body || '').replace(/\s+/g, ' ').trim();
  if (body && !/^\[(image|video|audio|document|sticker|media)\]$/i.test(body)) return body.length > 90 ? body.slice(0, 89) + '…' : body;
  const kind = String(m?.media_type || '').split('/')[0];
  return { image: '📷 Photo', video: '🎥 Video', audio: '🎤 Voice message', ptt: '🎤 Voice message', document: '📄 Document' }[kind] || 'New message';
}

export default function ChatHeads() {
  const pathname = usePathname() || '';
  // Nothing renders until the setting has loaded (enabled === null), so reading
  // browser storage in these initialisers cannot cause a hydration mismatch.
  const browser = typeof window !== 'undefined';
  const [enabled, setEnabled] = useState(null);
  const [heads, setHeads] = useState(() => (browser ? read(sessionStorage, HEADS_KEY, []) : [])); // [{ id, name, phone, platform, unread, preview }]
  const [openId, setOpenId] = useState(null);
  const [pos, setPos] = useState(() => (browser ? read(localStorage, POS_KEY, { side: 'right', y: 0.38 }) : { side: 'right', y: 0.38 })); // y: fraction of window height
  const [view, setView] = useState(() => (browser ? { w: window.innerWidth, h: window.innerHeight } : { w: 1024, h: 768 }));
  const [drag, setDrag] = useState(null);                 // { x, y } while dragging
  const [overClose, setOverClose] = useState(false);
  const [toast, setToast] = useState(null);               // { id, text } — the speech preview
  const [popId, setPopId] = useState(null);

  const leads = useRef(new Map());                        // id → lead | false (not visible to me)
  const press = useRef(null);
  const toastTimer = useRef(null);
  const enabledRef = useRef(enabled);
  const openRef = useRef(openId);
  const pathRef = useRef(pathname);
  useEffect(() => { enabledRef.current = enabled; openRef.current = openId; pathRef.current = pathname; });

  // ── Setup: the setting and the window size ─────────────────────────────────
  useEffect(() => {
    const size = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', size);
    // Turning bubbles off also clears any that are showing.
    const apply = (on) => { setEnabled(on); if (!on) { setHeads([]); setOpenId(null); } };
    profileAPI.getPreferences().then((r) => apply(r.data?.chat_bubbles !== false)).catch(() => apply(true));
    const onPrefs = (e) => { if (typeof e.detail?.chat_bubbles === 'boolean') apply(e.detail.chat_bubbles); };
    window.addEventListener('wf:prefs', onPrefs);
    return () => { window.removeEventListener('resize', size); window.removeEventListener('wf:prefs', onPrefs); clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => { write(sessionStorage, HEADS_KEY, heads); }, [heads]);

  // Only leads this user can open become bubbles: the normal lead route is
  // permission-scoped, so a lead they cannot see answers 404 and is skipped.
  const resolveLead = useCallback(async (id) => {
    if (leads.current.has(id)) return leads.current.get(id);
    try {
      const r = await leadsAPI.getById(id);
      const l = r.data?.lead;
      const lead = l ? { id: l.id, customer_name: l.customer_name, customer_phone: l.customer_phone, platform_source: l.platform_source } : false;
      leads.current.set(id, lead);
      return lead;
    } catch { leads.current.set(id, false); return false; }
  }, []);

  const addHead = useCallback((lead, preview, { open = false, count = true } = {}) => {
    setHeads((prev) => {
      const was = prev.find((h) => h.id === lead.id);
      const unread = open || openRef.current === lead.id ? 0 : (was?.unread || 0) + (count ? 1 : 0);
      const head = { id: lead.id, name: lead.customer_name || lead.customer_phone || 'Customer', phone: lead.customer_phone || '', platform: lead.platform_source || 'whatsapp', unread, preview: preview || was?.preview || '' };
      return [head, ...prev.filter((h) => h.id !== lead.id)].slice(0, MAX_HEADS);
    });
    if (open) setOpenId(lead.id);
  }, []);

  // ── A customer message arrives ─────────────────────────────────────────────
  useRealtime('new_message', async (d) => {
    if (enabledRef.current === false) return;
    const m = d.message || {};
    if (m.from_me === 1 || m.from_me === true) return;           // the studio's own message
    const id = d.lead_id || m.lead_id;
    if (!id) return;
    const path = pathRef.current;
    if (path.startsWith('/chat') || path === `/leads/${id}`) return; // already looking at it
    const lead = await resolveLead(id);
    if (!lead) return;
    const preview = previewOf(m);
    addHead(lead, preview);
    if (openRef.current !== id) {
      setPopId(id); setTimeout(() => setPopId((p) => (p === id ? null : p)), 700);
      setToast({ id, text: preview, name: lead.customer_name || lead.customer_phone || 'Customer' });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 4500);
      try { navigator.vibrate?.(30); } catch { /* not supported */ }
    }
  });

  // ── Opened from a push notification ────────────────────────────────────────
  const openFromPush = useCallback(async (id) => {
    if (!id) return;
    const lead = await resolveLead(id);
    if (lead) addHead(lead, '', { open: true, count: false });
  }, [resolveLead, addHead]);

  useEffect(() => {
    if (enabled === null) return;
    const url = new URL(window.location.href);
    const id = url.searchParams.get('bubble');
    if (id) {
      url.searchParams.delete('bubble');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      if (enabled) openFromPush(id);
    }
    const onSw = (e) => { if (e.data?.type === 'wf-open-bubble' && enabledRef.current !== false) openFromPush(e.data.lead_id); };
    navigator.serviceWorker?.addEventListener('message', onSw);
    return () => navigator.serviceWorker?.removeEventListener('message', onSw);
  }, [enabled, openFromPush]);

  // Esc closes the open chat back to its bubble.
  useEffect(() => {
    if (!openId) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpenId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  const removeHead = useCallback((id) => {
    setHeads((prev) => prev.filter((h) => h.id !== id));
    setOpenId((o) => (o === id ? null : o));
  }, []);

  const toggle = useCallback((id) => {
    setToast(null);
    setOpenId((o) => (o === id ? null : id));
    setHeads((prev) => prev.map((h) => (h.id === id ? { ...h, unread: 0 } : h)));
  }, []);

  // ── Geometry ───────────────────────────────────────────────────────────────
  const stackH = heads.length * SIZE + Math.max(0, heads.length - 1) * GAP;
  const topMin = 70;
  const topMax = Math.max(topMin, view.h - stackH - 110); // clear of the AI / chat buttons
  const restTop = Math.min(topMax, Math.max(topMin, pos.y * view.h));
  const restLeft = pos.side === 'left' ? EDGE : view.w - SIZE - EDGE;
  const closeAt = { x: view.w / 2, y: view.h - 76 };

  // ── Dragging (mouse and touch alike, via Pointer Events) ───────────────────
  const onPointerDown = (e, id) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press.current = { id, x0: e.clientX, y0: e.clientY, dx: e.clientX - restLeft, dy: e.clientY - restTop, moved: false };
  };
  const onPointerMove = (e) => {
    const p = press.current;
    if (!p) return;
    if (!p.moved && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < DRAG_START) return;
    if (!p.moved) { p.moved = true; setToast(null); setOpenId(null); }
    const x = e.clientX - p.dx, y = e.clientY - p.dy;
    setDrag({ x, y });
    setOverClose(Math.hypot(x + SIZE / 2 - closeAt.x, y + SIZE / 2 - closeAt.y) < 72);
  };
  const onPointerUp = (e) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    if (!p.moved) { toggle(p.id); return; }
    const x = e.clientX - p.dx, y = e.clientY - p.dy;
    if (Math.hypot(x + SIZE / 2 - closeAt.x, y + SIZE / 2 - closeAt.y) < 72) {
      setHeads([]); setOpenId(null);                       // dropped on ✕: close them all
    } else {
      const next = { side: x + SIZE / 2 < view.w / 2 ? 'left' : 'right', y: Math.min(topMax, Math.max(topMin, y)) / view.h };
      setPos(next); write(localStorage, POS_KEY, next);
    }
    setDrag(null); setOverClose(false);
  };

  if (!enabled || heads.length === 0 || pathname.startsWith('/chat')) return null;

  const left = drag ? drag.x : restLeft;
  const top = drag ? drag.y : restTop;
  const phone = view.w < 640;
  const openLead = openId ? heads.find((h) => h.id === openId) : null;
  const panelStyle = phone
    ? { left: 8, right: 8, top: 'auto', bottom: 8, width: 'auto', height: 'min(72vh, 560px)', zIndex: 9060 }
    : {
        top: Math.max(70, Math.min(restTop, view.h - 540)), bottom: 'auto', zIndex: 9060,
        ...(pos.side === 'left' ? { left: EDGE + SIZE + 14, right: 'auto' } : { right: EDGE + SIZE + 14, left: 'auto' }),
      };

  return (
    <>
      <div
        className={`wf-heads${drag ? ' is-dragging' : ''}${phone && openLead ? ' is-hidden' : ''}`}
        style={{ left, top, gap: GAP }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { press.current = null; setDrag(null); setOverClose(false); }}
        role="region" aria-label="Chat bubbles"
      >
        {heads.map((h) => {
          const pl = platformOf(h.platform);
          return (
            <div key={h.id} className={`wf-head${popId === h.id ? ' is-pop' : ''}${openId === h.id ? ' is-open' : ''}`}>
              <button
                type="button"
                className="wf-head__face"
                style={{ background: pl.bg }}
                onPointerDown={(e) => onPointerDown(e, h.id)}
                onClick={(e) => { if (e.detail === 0) toggle(h.id); /* keyboard "click" only; pointer handled above */ }}
                aria-label={`${h.name}${h.unread ? `, ${h.unread} unread message${h.unread === 1 ? '' : 's'}` : ''} on ${pl.label}. Open chat`}
                aria-expanded={openId === h.id}
              >
                <span aria-hidden="true">{(h.name || '?').trim()[0]?.toUpperCase() || '?'}</span>
              </button>
              {h.unread > 0 && <span className="wf-head__badge" aria-hidden="true">{h.unread > 9 ? '9+' : h.unread}</span>}
              <button type="button" className="wf-head__x" onClick={() => removeHead(h.id)} aria-label={`Close ${h.name}'s bubble`}><X size={11} /></button>
            </div>
          );
        })}
      </div>

      {toast && !drag && !openLead && (
        <button
          type="button"
          className={`wf-head-toast wf-head-toast--${pos.side}`}
          style={{ top: restTop + 4, ...(pos.side === 'left' ? { left: EDGE + SIZE + 12 } : { right: EDGE + SIZE + 12 }) }}
          onClick={() => toggle(toast.id)}
        >
          <b>{toast.name}</b>
          <span>{toast.text}</span>
        </button>
      )}

      {drag && (
        <div className={`wf-heads-close${overClose ? ' is-over' : ''}`} style={{ left: closeAt.x - 30, top: closeAt.y - 30 }} aria-hidden="true">
          <X size={24} />
        </div>
      )}

      {openLead && (
        <FloatingChat
          key={openLead.id}
          lead={{ id: openLead.id, customer_name: openLead.name, customer_phone: openLead.phone, platform_source: openLead.platform }}
          onClose={() => removeHead(openLead.id)}
          onMinimize={() => setOpenId(null)}
          panelStyle={panelStyle}
        />
      )}
    </>
  );
}
