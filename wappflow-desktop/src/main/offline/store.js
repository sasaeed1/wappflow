'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  OFFLINE STORE  (Final Vision · Phase 6 — desktop offline-first)
//  Dependency-free, JSON-backed local store with atomic writes. Holds:
//   • cache        — a read-replica of server entities (leads/projects/assets/…),
//                    keyed by id, updated from the /workspace/sync delta.
//   • queue        — ordered local mutations made while offline, replayed on
//                    reconnect against the same REST routes the web app uses.
//   • cursor       — last server sync cursor (the delta's `now`).
//   • entitlements — cached plan/flags/brain for OFFLINE feature gating.
//
//  Conflict policy (documented + tested): scalar fields → last-write-wins by
//  updated_at; array/list fields → append-merge (union, deduped by id or value).
//  A queued local write that the server has since superseded (its record's
//  updated_at ≥ the queued mutation's timestamp) is dropped on the next applyDelta.
//  No native deps, so it runs in Electron without a rebuild and is unit-testable.
// ════════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const tsOf = (r) => { try { return Date.parse((r && (r.updated_at || r.created_at)) || 0) || 0; } catch { return 0; } };

function unionList(a, b) {
  const out = []; const seen = new Set();
  for (const x of [...(a || []), ...(b || [])]) {
    const key = (x && typeof x === 'object' && x.id != null) ? 'id:' + x.id : JSON.stringify(x);
    if (!seen.has(key)) { seen.add(key); out.push(x); }
  }
  return out;
}

// LWW scalars (newer updated_at wins) + append-merged arrays.
function mergeRecord(local, incoming) {
  if (!local) return { ...incoming };
  if (!incoming) return { ...local };
  const localNewer = tsOf(local) > tsOf(incoming);
  const base = localNewer ? incoming : local;   // older record as the base
  const top = localNewer ? local : incoming;    // newer record's scalars win
  const out = { ...base, ...top };
  for (const k of new Set([...Object.keys(local), ...Object.keys(incoming)])) {
    if (Array.isArray(local[k]) || Array.isArray(incoming[k])) out[k] = unionList(local[k] || [], incoming[k] || []);
  }
  return out;
}

module.exports = function createStore(filePath) {
  const empty = () => ({ cursor: null, cache: {}, queue: [], entitlements: null });
  let state = (() => { try { return Object.assign(empty(), JSON.parse(fs.readFileSync(filePath, 'utf8'))); } catch { return empty(); } })();
  let seq = state.queue.reduce((m, q) => Math.max(m, q.seq || 0), 0);

  function save() {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
      fs.renameSync(tmp, filePath);   // atomic replace
    } catch { /* best-effort persistence */ }
  }

  // ── sync cursor ─────────────────────────────────────────────────────────────
  const getCursor = () => state.cursor;
  function setCursor(c) { state.cursor = c || state.cursor; save(); }

  // ── work queue ──────────────────────────────────────────────────────────────
  // mutation: { method, path, body, entity, entity_id }. ts is a caller-supplied
  // monotonic timestamp (ms) — passed in so the module stays time-source agnostic.
  function enqueue(mutation, ts) {
    const item = {
      seq: ++seq,
      id: 'q_' + seq + '_' + (mutation.entity_id || ''),
      ts: ts || 0,
      method: (mutation.method || 'POST').toUpperCase(),
      path: mutation.path,
      body: mutation.body || null,
      entity: mutation.entity || null,
      entity_id: mutation.entity_id || null,
      status: 'pending',
      tries: 0,
    };
    state.queue.push(item);
    save();
    return item.id;
  }
  const pending = () => state.queue.filter(q => q.status === 'pending');
  function markDone(id) { const q = state.queue.find(x => x.id === id); if (q) { q.status = 'done'; q.done_at = Date.now ? undefined : undefined; } save(); }
  function markFailed(id, err) { const q = state.queue.find(x => x.id === id); if (q) { q.tries = (q.tries || 0) + 1; q.last_error = String(err || '').slice(0, 200); } save(); }
  function purgeDone() { state.queue = state.queue.filter(q => q.status !== 'done'); save(); }

  // ── cache + delta application ───────────────────────────────────────────────
  function applyDelta(delta) {
    const changes = (delta && delta.changes) || {};
    for (const table of Object.keys(changes)) {
      const recs = Array.isArray(changes[table]) ? changes[table] : [];
      state.cache[table] = state.cache[table] || {};
      for (const r of recs) { if (r && r.id != null) state.cache[table][r.id] = mergeRecord(state.cache[table][r.id], r); }
    }
    reconcileQueue();
    if (delta && delta.now) state.cursor = delta.now;
    // plan + brain ride the delta too — cache them for offline gating.
    if (delta && (delta.plan || delta.brain)) {
      state.entitlements = Object.assign({}, state.entitlements, delta.plan ? { plan: delta.plan } : {}, delta.brain ? { brain: delta.brain } : {});
    }
    save();
    return true;
  }

  // Drop pending writes the server has already caught up to (LWW): if the cached
  // record for the same entity is at/after the queued mutation's timestamp, our
  // write was superseded and must not be replayed.
  function reconcileQueue() {
    for (const q of state.queue) {
      if (q.status !== 'pending' || !q.entity || q.entity_id == null) continue;
      const rec = state.cache[q.entity] && state.cache[q.entity][q.entity_id];
      if (rec && tsOf(rec) >= q.ts && q.ts > 0) q.status = 'superseded';
    }
  }

  const getTable = (table) => Object.values((state.cache && state.cache[table]) || {});
  const getRecord = (table, id) => (state.cache[table] || {})[id] || null;

  // ── entitlements cache (offline gating) ─────────────────────────────────────
  function cacheEntitlements(ent) { state.entitlements = Object.assign({}, state.entitlements, ent); save(); }
  const getEntitlements = () => state.entitlements;
  function can(feature) {
    const e = state.entitlements; if (!e || !e.features) return true; // unknown → allow (online check governs)
    return e.features[feature] !== false;
  }

  function stats() {
    return {
      cursor: state.cursor,
      queued: pending().length,
      queue_total: state.queue.length,
      tables: Object.fromEntries(Object.keys(state.cache).map(t => [t, Object.keys(state.cache[t]).length])),
      has_entitlements: !!state.entitlements,
    };
  }

  return {
    getCursor, setCursor,
    enqueue, pending, markDone, markFailed, purgeDone,
    applyDelta, reconcileQueue, getTable, getRecord,
    cacheEntitlements, getEntitlements, can,
    stats, _raw: () => state,
    mergeRecord, // exposed for tests
  };
};

module.exports.mergeRecord = mergeRecord;
module.exports.unionList = unionList;
