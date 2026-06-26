'use strict';

// ── Inference client (main process) ──────────────────────────────────────────
// Drives the inference utilityProcess so the heavy, blocking ONNX/jimp work runs
// off the main thread. Degrades gracefully: if utilityProcess is unavailable (e.g.
// not running under Electron, or a spawn failure), or the child dies mid-run, it
// transparently falls back to in-process analysis — so analysis never breaks, it
// just blocks like before in that rare case.

const path = require('path');
let utilityProcess = null;
try { ({ utilityProcess } = require('electron')); } catch { /* not under Electron */ }
const analyzers = require('./analyzers'); // in-process fallback

let child = null;
let nextId = 1;
const pending = new Map();

function spawn() {
  if (child || !utilityProcess) return child;
  try {
    child = utilityProcess.fork(path.join(__dirname, 'inference-host.js'), [], { serviceName: 'wappflow-ai' });
    child.on('message', (msg) => {
      if (!msg || !msg.id) return;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error));
      else p.resolve(msg.type === 'status' ? msg.runtime : (msg.type === 'warmup' ? { ok: true } : msg.res));
    });
    child.on('exit', () => { child = null; for (const p of pending.values()) p.reject(new Error('inference process exited')); pending.clear(); });
  } catch { child = null; }
  return child;
}

// Run an analyzer over a buffer in the child; falls back to in-process on any failure.
// The bytes are sent as a cloneable Uint8Array (Electron's utilityProcess MessagePort
// structured-clones the message; an ArrayBuffer transfer list is NOT accepted here).
async function run(analyzer, buffer, meta) {
  const c = spawn();
  if (!c) return analyzers.runAnalyzer(analyzer, buffer, meta);
  const bytes = new Uint8Array(buffer); // plain, cloneable copy
  try {
    return await new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      try { c.postMessage({ type: 'run', id, analyzer, buffer: bytes, meta: cloneable(meta) }); }
      catch (e) { pending.delete(id); reject(e); }
    });
  } catch {
    return analyzers.runAnalyzer(analyzer, buffer, meta); // child died / send failed → degrade
  }
}

// Strip anything non-cloneable from meta (the asset row is plain JSON, but be safe).
function cloneable(m) { try { return JSON.parse(JSON.stringify(m || {})); } catch { return {}; } }

// Pre-create the model sessions in the child (off the main thread) so the user's
// first analyze starts instantly. Fire-and-forget; safe to call on app launch.
function warmup() {
  const c = spawn();
  if (!c) return Promise.resolve({ ok: false, reason: 'no-child' });
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve, reject: () => resolve({ ok: false }) });
    try { c.postMessage({ type: 'warmup', id }); } catch { pending.delete(id); resolve({ ok: false }); }
  });
}

module.exports = { run, warmup, spawn };
