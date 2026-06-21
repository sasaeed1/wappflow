'use strict';

// ONNX Runtime seam. onnxruntime-node is an optionalDependency — lazy-required so
// the app still installs/runs (CPU analyzers only) where a prebuilt binary can't
// be fetched. Vision/video models drop into ../models and load through here with
// GPU acceleration when available, CPU fallback otherwise.

const fs = require('fs');
const path = require('path');
const config = require('../config');

let ort = null;
let triedLoad = false;
const sessions = new Map();

function runtime() {
  if (triedLoad) return ort;
  triedLoad = true;
  try { ort = require('onnxruntime-node'); }
  catch { ort = null; } // no prebuilt binary → vision models unavailable; CPU analyzers still run
  return ort;
}

function available() { return !!runtime(); }

// Models are not committed; they live in src/main/ai/models/<file>.onnx and are
// registered against a modelVersion in the analyzer registry.
function modelPath(file) { return path.join(config.modelsDir(), file); }
function hasModel(file) { try { return fs.existsSync(modelPath(file)); } catch { return false; } }

async function session(file) {
  const rt = runtime();
  if (!rt) throw new Error('onnxruntime-node not available');
  if (sessions.has(file)) return sessions.get(file);
  if (!hasModel(file)) throw new Error(`model not found: ${file} (drop it in ai/models/)`);
  // GPU first (DirectML on Windows, CUDA on Linux), then CPU.
  const providers = process.platform === 'win32' ? ['dml', 'cpu'] : ['cuda', 'cpu'];
  const s = await rt.InferenceSession.create(modelPath(file), { executionProviders: providers });
  sessions.set(file, s);
  return s;
}

function status() {
  return {
    available: available(),
    provider: available() ? (process.platform === 'win32' ? 'dml/cpu' : 'cuda/cpu') : 'none',
    modelsDir: config.modelsDir(),
  };
}

module.exports = { available, session, hasModel, modelPath, status, get ort() { return runtime(); } };
