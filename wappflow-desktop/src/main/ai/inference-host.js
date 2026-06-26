'use strict';

// ── Inference utilityProcess (child) ─────────────────────────────────────────
// A stateless ONNX/CPU inference worker. The model session-create + first inference
// block synchronously inside Electron's MAIN process (measured: ~6–15s/model create
// in Electron, which freezes the window). Running them here, in a dedicated Node
// utilityProcess, keeps the main process — and the UI — fully responsive during
// analysis. The protocol is tiny: { type:'run', id, analyzer, buffer, meta } in →
// { type:'result', id, res|error } out.

const analyzers = require('./analyzers');

const port = process.parentPort;
if (port) {
  port.on('message', async (e) => {
    const msg = (e && e.data) || e;
    if (!msg || !msg.type) return;
    if (msg.type === 'run') {
      try {
        const buf = Buffer.from(msg.buffer);
        const res = await analyzers.runAnalyzer(msg.analyzer, buf, msg.meta || {});
        port.postMessage({ type: 'result', id: msg.id, res });
      } catch (err) {
        port.postMessage({ type: 'result', id: msg.id, error: (err && err.message) || String(err) });
      }
    } else if (msg.type === 'status') {
      try { port.postMessage({ type: 'status', id: msg.id, runtime: analyzers.runtimeStatus() }); }
      catch (err) { port.postMessage({ type: 'status', id: msg.id, error: (err && err.message) || String(err) }); }
    } else if (msg.type === 'warmup') {
      // touch the runtime so the heavy session-create happens here, not on first run
      try { analyzers.runtimeStatus(); } catch {}
      port.postMessage({ type: 'warmup', id: msg.id, ok: true });
    }
  });
  try { port.postMessage({ type: 'ready' }); } catch {}
}
