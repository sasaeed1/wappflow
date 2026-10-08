'use strict';

// ── Desktop chat bubbles (PROP-007 step 3) ──────────────────────────────────
// When WappFlow is closed to the tray (or minimised) and a customer messages,
// a Messenger-style bubble floats over the desktop: always on top, draggable,
// snaps to the nearest screen edge, ✕ to close, click to open that chat.
//
// The main process listens on the same live-update stream the web app uses
// (/api/events, unnamed frames, switch on data.type) — independent of the
// hidden window, which browsers throttle. A bubble appears only when:
//   • the message is from the customer (not the studio's own),
//   • the user has chat bubbles on (Settings → Notifications, per user),
//   • the lead is one this user can open (checked through the normal,
//     permission-scoped lead route),
//   • and the WappFlow window is not already in front (then the in-app bubble
//     handles it).
// The pure parts (stream parsing, the decision, edge snapping) are exported
// for tests; the Electron parts load lazily so the module can be required
// outside Electron.

const path = require('path');
const fs = require('fs');

const HEAD = 56;           // bubble diameter (matches the web app)
const GAP = 10;
const PAD = 10;            // transparent margin around the stack, for the shadow
const MAX_HEADS = 4;
const EDGE = 8;            // gap to the screen edge when snapped

// ── Pure helpers ────────────────────────────────────────────────────────────

/** Split an SSE text buffer into complete frames. Returns { frames, rest }. */
function parseSse(buffer) {
  const frames = [];
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop();
  for (const block of parts) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data) continue;
    try { frames.push(JSON.parse(data)); } catch { /* not JSON: ignore */ }
  }
  return { frames, rest };
}

/** Should this frame become a desktop bubble right now? */
function wantsBubble(frame, { enabled, appInFront }) {
  if (!frame || frame.type !== 'new_message' || !enabled || appInFront) return false;
  const m = frame.message || {};
  if (m.from_me === 1 || m.from_me === true) return false;
  return !!(frame.lead_id || m.lead_id);
}

/** Window size for n heads. */
function sizeFor(n) {
  const k = Math.max(1, Math.min(MAX_HEADS, n));
  return { width: HEAD + PAD * 2, height: k * HEAD + (k - 1) * GAP + PAD * 2 };
}

/** Snap a window to the nearer left/right edge of a work area, clamped vertically. */
function snapToEdge(bounds, work) {
  const centre = bounds.x + bounds.width / 2;
  const left = centre < work.x + work.width / 2;
  const x = left ? work.x + EDGE : work.x + work.width - bounds.width - EDGE;
  const y = Math.min(work.y + work.height - bounds.height - EDGE, Math.max(work.y + EDGE, bounds.y));
  return { x: Math.round(x), y: Math.round(y), side: left ? 'left' : 'right' };
}

// ── Electron side ───────────────────────────────────────────────────────────

function create({ auth, config, notifications, showWindow, openChat, isAppInFront }) {
  let BrowserWindow, screen, ipcMain;
  try { ({ BrowserWindow, screen, ipcMain } = require('electron')); } catch { return { start() {}, stop() {} }; }

  let bubbleWin = null;
  let heads = [];              // [{ id, name, platform, unread }]
  let stream = null;           // AbortController
  let retry = null;
  let attempt = 0;
  let prefs = { enabled: true, at: 0 };
  const leadCache = new Map(); // id → lead | false
  const lastToast = new Map(); // id → ms
  let drag = null;             // { dx, dy, moved }

  const posFile = () => config.userDataPath('chat-bubble.json');
  const savedPos = () => { try { return JSON.parse(fs.readFileSync(posFile(), 'utf8')); } catch { return null; } };
  const savePos = (p) => { try { fs.writeFileSync(posFile(), JSON.stringify(p)); } catch {} };

  const api = () => (auth.getSession()?.api || auth.getServer().api || '').replace(/\/$/, '');
  const headers = () => ({ ...auth.authHeader(), Accept: 'application/json' });

  async function bubblesEnabled() {
    if (Date.now() - prefs.at < 60 * 1000) return prefs.enabled;
    try {
      const r = await fetch(`${api()}/me/preferences`, { headers: headers() });
      if (r.ok) prefs = { enabled: (await r.json()).chat_bubbles !== false, at: Date.now() };
    } catch { /* keep the last answer */ }
    return prefs.enabled;
  }

  async function resolveLead(id) {
    if (leadCache.has(id)) return leadCache.get(id);
    let lead = false;
    try {
      const r = await fetch(`${api()}/leads/${encodeURIComponent(id)}`, { headers: headers() });
      if (r.ok) { const l = (await r.json()).lead; if (l) lead = { id: l.id, name: l.customer_name || l.customer_phone || 'Customer', platform: l.platform_source || 'whatsapp' }; }
    } catch { /* offline: no bubble */ }
    leadCache.set(id, lead);
    return lead;
  }

  function ensureWindow() {
    if (bubbleWin && !bubbleWin.isDestroyed()) return bubbleWin;
    const work = screen.getPrimaryDisplay().workArea;
    const sz = sizeFor(heads.length);
    const p = savedPos();
    const start = p ? snapToEdge({ x: p.side === 'left' ? work.x : work.x + work.width, y: p.y, ...sz }, work)
      : { x: work.x + work.width - sz.width - EDGE, y: Math.round(work.y + work.height * 0.3) };
    bubbleWin = new BrowserWindow({
      ...sz, x: start.x, y: start.y,
      frame: false, transparent: true, resizable: false, movable: true, minimizable: false, maximizable: false,
      fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false,
      backgroundColor: '#00000000',
      webPreferences: { preload: path.join(__dirname, 'bubble-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    bubbleWin.setAlwaysOnTop(true, 'floating');
    bubbleWin.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    bubbleWin.loadFile(path.join(__dirname, '..', 'renderer', 'bubble.html'));
    bubbleWin.webContents.on('did-finish-load', push);
    bubbleWin.on('closed', () => { bubbleWin = null; });
    return bubbleWin;
  }

  function push() {
    if (!bubbleWin || bubbleWin.isDestroyed()) return;
    if (!heads.length) { bubbleWin.hide(); return; }
    const b = bubbleWin.getBounds();
    const sz = sizeFor(heads.length);
    const work = screen.getDisplayMatching(b).workArea;
    const snapped = snapToEdge({ ...b, ...sz }, work);
    bubbleWin.setBounds({ x: snapped.x, y: snapped.y, ...sz });
    bubbleWin.webContents.send('bubble:state', { heads, side: snapped.side });
    if (!bubbleWin.isVisible()) bubbleWin.showInactive();
  }

  async function onFrame(frame) {
    const appInFront = !!(isAppInFront && isAppInFront());
    if (frame?.type === 'new_message' && appInFront && bubbleWin?.isVisible()) bubbleWin.hide();
    if (!wantsBubble(frame, { enabled: true, appInFront })) return;
    if (!(await bubblesEnabled())) return;
    const id = frame.lead_id || frame.message.lead_id;
    const lead = await resolveLead(id);
    if (!lead) return;
    const was = heads.find((h) => h.id === id);
    heads = [{ ...lead, unread: (was?.unread || 0) + 1 }, ...heads.filter((h) => h.id !== id)].slice(0, MAX_HEADS);
    ensureWindow();
    if (bubbleWin.webContents.isLoading()) bubbleWin.webContents.once('did-finish-load', push); else push();
    // The words themselves arrive as an ordinary desktop notification, at most
    // once every 30 s per conversation.
    const now = Date.now();
    if (now - (lastToast.get(id) || 0) > 30 * 1000) {
      lastToast.set(id, now);
      const body = String(frame.message?.body || '').trim() || 'New message';
      notifications.notify({ title: lead.name, body: body.length > 120 ? body.slice(0, 119) + '…' : body, data: { lead_id: id } });
    }
  }

  // ── Live stream (fetch + manual SSE parsing; reconnects with backoff) ──────
  async function connect() {
    retry = null;
    const s = auth.getSession();
    if (!s || !s.token) return;
    stream = new AbortController();
    try {
      const r = await fetch(`${api()}/events?token=${encodeURIComponent(s.token)}`, { headers: { Accept: 'text/event-stream' }, signal: stream.signal });
      if (!r.ok || !r.body) throw new Error('stream ' + r.status);
      attempt = 0;
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const { frames, rest } = parseSse(buf);
        buf = rest;
        for (const f of frames) onFrame(f).catch(() => {});
      }
    } catch { /* dropped or aborted */ }
    if (stream && !stream.signal.aborted) schedule();
  }
  function schedule() {
    clearTimeout(retry);
    const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5));
    retry = setTimeout(connect, delay);
  }

  // ── IPC from the bubble window ─────────────────────────────────────────────
  function wireIpc() {
    ipcMain.on('bubble:open', (_e, id) => {
      heads = heads.filter((h) => h.id !== id);
      push();
      showWindow();
      openChat(id);
    });
    ipcMain.on('bubble:close', (_e, id) => { heads = id ? heads.filter((h) => h.id !== id) : []; push(); });
    ipcMain.on('bubble:drag-start', () => {
      if (!bubbleWin) return;
      const c = screen.getCursorScreenPoint(); const b = bubbleWin.getBounds();
      drag = { dx: c.x - b.x, dy: c.y - b.y };
    });
    ipcMain.on('bubble:drag-move', () => {
      if (!drag || !bubbleWin) return;
      const c = screen.getCursorScreenPoint();
      bubbleWin.setPosition(Math.round(c.x - drag.dx), Math.round(c.y - drag.dy));
    });
    ipcMain.on('bubble:drag-end', () => {
      if (!drag || !bubbleWin) return;
      drag = null;
      const b = bubbleWin.getBounds();
      const s = snapToEdge(b, screen.getDisplayMatching(b).workArea);
      bubbleWin.setPosition(s.x, s.y);
      savePos({ side: s.side, y: s.y });
      bubbleWin.webContents.send('bubble:state', { heads, side: s.side });
    });
  }

  let wired = false;
  return {
    start() {
      if (!wired) { wireIpc(); wired = true; }
      if (!stream || stream.signal.aborted) connect();
    },
    stop() {
      try { stream && stream.abort(); } catch {}
      stream = null; clearTimeout(retry); heads = []; leadCache.clear();
      if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.hide();
    },
    // The app came to the front: its own in-app bubbles take over.
    appShown() { if (bubbleWin && !bubbleWin.isDestroyed()) bubbleWin.hide(); heads = []; },
  };
}

module.exports = { create, parseSse, wantsBubble, sizeFor, snapToEdge, HEAD, MAX_HEADS };
