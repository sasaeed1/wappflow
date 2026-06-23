'use strict';

// Offline sync driver (Phase 6): pulls the /workspace/sync delta into the local store
// and flushes queued local mutations back when online. Network-state aware — emits
// state changes so the shell can show an offline banner + queued-write count.

const axios = require('axios');
const auth = require('../auth');
const config = require('../config');
const createStore = require('./store');

let store = null;
const getStore = () => (store || (store = createStore(config.userDataPath('offline.json'))));
const apiBase = () => auth.getServer().api.replace(/\/$/, '');

let online = true;
const listeners = new Set();
const onState = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
function state() { return Object.assign({ online }, getStore().stats()); }
function emit() { const s = state(); for (const cb of listeners) { try { cb(s); } catch {} } }
function setOnline(v) { if (online !== v) { online = v; emit(); } }
const isOnline = () => online;

// Pull the server delta since our cursor and merge it into the cache.
async function pull() {
  if (!auth.getSession()) return { skipped: 'no-auth' };
  const s = getStore();
  try {
    const since = s.getCursor();
    const res = await axios.get(`${apiBase()}/workspace/sync`, { params: since ? { since } : {}, headers: auth.authHeader(), timeout: 30000 });
    s.applyDelta(res.data);
    setOnline(true); emit();
    return { ok: true, cursor: s.getCursor() };
  } catch (e) { setOnline(false); emit(); return { ok: false, error: e.message }; }
}

// Replay queued local mutations. Network error → stop + retry later; 4xx → drop (it
// will never succeed); 5xx → treat as transient and stop.
async function flush() {
  if (!auth.getSession()) return { skipped: 'no-auth' };
  const s = getStore();
  let sent = 0;
  for (const q of s.pending()) {
    try {
      await axios({ method: q.method, url: `${apiBase()}${q.path}`, data: q.body, headers: auth.authHeader(), timeout: 30000 });
      s.markDone(q.id); sent++;
    } catch (e) {
      const code = e.response && e.response.status;
      if (code && code >= 400 && code < 500) { s.markFailed(q.id, `http ${code}`); s.markDone(q.id); } // unrecoverable → drop
      else { s.markFailed(q.id, e.message); setOnline(false); break; }                                  // transient → stop
    }
  }
  s.purgeDone(); emit();
  return { ok: true, sent };
}

async function syncNow() { const p = await pull(); const f = await flush(); return Object.assign({ pull: p, flush: f }, state()); }

// Renderer enqueues a mutation when offline (or always, for write-behind reliability).
function enqueue(mutation) { const id = getStore().enqueue(mutation, Date.now()); emit(); return id; }

module.exports = { getStore, pull, flush, syncNow, enqueue, isOnline, setOnline, onState, state };
