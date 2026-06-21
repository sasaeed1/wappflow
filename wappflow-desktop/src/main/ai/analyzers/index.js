'use strict';

// ── Local analyzers ─────────────────────────────────────────────────────────
// Mirrors the server's Analyzer abstraction (backend/analyzers + media-worker):
// each analyzer owns a set of score_types from the canonical registry and emits
// { score_type, value, group_key?, reasons? } objects that the server's
// recordScores() accepts verbatim. The desktop fulfils the WHERE:'client'
// analyzers (vision, video).
//
// MVP: a real CPU "vision" analyzer (composition + aesthetic) via pure-JS jimp —
// no native build, runs anywhere. Face/eye/smile/scene + video come from ONNX
// models dropped into ../models (seam wired in ./onnx). value is normalized 0..1
// (except counts); send model_version === the server registry's modelVersion so
// the analyze-once ledger clears `pending`.

const onnx = require('../onnx');

let Jimp = null, jimpTried = false;
function jimp() {
  if (jimpTried) return Jimp;
  jimpTried = true;
  try { Jimp = require('jimp'); } catch { Jimp = null; }
  return Jimp;
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

// Decode + compute CPU image metrics on a downscaled greyscale/RGB pass.
async function cpuMetrics(buffer) {
  const J = jimp();
  if (!J) throw new Error('jimp not available (CPU image analysis disabled)');
  const img = await J.read(buffer);
  const longEdge = Math.max(img.bitmap.width, img.bitmap.height);
  if (longEdge > 1024) img.resize(...(img.bitmap.width >= img.bitmap.height ? [1024, J.AUTO] : [J.AUTO, 1024]));
  const { data, width: W, height: H } = img.bitmap; // RGBA
  const N = W * H;

  // luminance + colour accumulators
  const lum = new Float32Array(N);
  let sumL = 0, sumRG = 0, sumYB = 0, sumRG2 = 0, sumYB2 = 0;
  for (let i = 0, p = 0; i < N; i++, p += 4) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[i] = l; sumL += l;
    const rg = r - g, yb = 0.5 * (r + g) - b;
    sumRG += rg; sumYB += yb; sumRG2 += rg * rg; sumYB2 += yb * yb;
  }
  const meanL = sumL / N;
  let varL = 0;
  for (let i = 0; i < N; i++) { const d = lum[i] - meanL; varL += d * d; }
  const stdL = Math.sqrt(varL / N);

  // Hasler–Süsstrunk colourfulness
  const mRG = sumRG / N, mYB = sumYB / N;
  const sdRG = Math.sqrt(Math.max(0, sumRG2 / N - mRG * mRG));
  const sdYB = Math.sqrt(Math.max(0, sumYB2 / N - mYB * mYB));
  const colourfulness = Math.sqrt(sdRG * sdRG + sdYB * sdYB) + 0.3 * Math.sqrt(mRG * mRG + mYB * mYB);

  // Laplacian (4-neighbour) → sharpness variance + per-pixel gradient energy for composition
  let lapSum = 0, lapSum2 = 0, lapN = 0;
  let eTot = 0, eX = 0, eY = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const lap = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - W] - lum[i + W];
      lapSum += lap; lapSum2 += lap * lap; lapN++;
      const e = Math.abs(lap);
      eTot += e; eX += e * x; eY += e * y;
    }
  }
  const sharpness = lapN ? (lapSum2 / lapN - (lapSum / lapN) ** 2) : 0; // variance of Laplacian

  // Rule-of-thirds: distance of the gradient-energy centroid to the nearest third line
  let thirdsScore = 0.5;
  if (eTot > 0) {
    const cx = eX / eTot, cy = eY / eTot;
    const dx = Math.min(Math.abs(cx - W / 3), Math.abs(cx - 2 * W / 3)) / (W / 3);
    const dy = Math.min(Math.abs(cy - H / 3), Math.abs(cy - 2 * H / 3)) / (H / 3);
    thirdsScore = clamp01(1 - 0.5 * (clamp01(dx) + clamp01(dy)));
  }

  return { sharpness, meanL, stdL, colourfulness, thirds: thirdsScore };
}

// ── VISION analyzer (client tier) ───────────────────────────────────────────
const VISION = {
  id: 'vision',
  model_version: 'vision-v0', // MUST match the server registry so analyze-once clears `pending`
  async run(buffer /*, meta */) {
    const m = await cpuMetrics(buffer);
    const sharpN = clamp01(m.sharpness / 240);
    const expoQ = clamp01(1 - Math.abs(m.meanL / 255 - 0.5) * 2);
    const contrastN = clamp01(m.stdL / 64);
    const colourN = clamp01(m.colourfulness / 110);
    const aesthetic = clamp01(0.40 * sharpN + 0.25 * expoQ + 0.20 * contrastN + 0.15 * colourN);
    const composition = clamp01(m.thirds);
    const reasons = {
      sharpness: Math.round(m.sharpness), exposure: +(m.meanL / 255).toFixed(3),
      contrast: +contrastN.toFixed(3), colourfulness: +colourN.toFixed(3),
      engine: 'cpu-vision-v0',
    };
    const scores = [
      { score_type: 'composition', value: +composition.toFixed(3), reasons: { thirds: +m.thirds.toFixed(3) } },
      { score_type: 'aesthetic', value: +aesthetic.toFixed(3), reasons },
    ];
    // ONNX vision (face/eye/smile/scene/subject) — only when a model is present.
    try {
      const extra = await onnxVision(buffer);
      if (extra && extra.length) scores.push(...extra);
    } catch { /* model absent / load failed → CPU primitives only */ }
    return scores;
  },
};

// Seam: when an ONNX face/scene model is dropped into ai/models/ and registered,
// produce face_count/eyes_open/smile/scene_class/subject here. Returns [] today.
async function onnxVision(/* buffer */) {
  if (!onnx.available() || !onnx.hasModel('vision.onnx')) return [];
  // TODO: preprocess (resize/normalize via jimp) → InferenceSession.run → map
  // outputs to { score_type, value } using exactly the vision score_types:
  // face_count, eyes_open, smile, subject, scene_class.
  return [];
}

// ── VIDEO analyzer (client tier) — ONNX/ffmpeg required; stub until wired ─────
const VIDEO = {
  id: 'video',
  model_version: 'video-v0',
  async run(/* buffer, meta */) {
    // Needs frame extraction (ffmpeg) + ML; produces shake/motion/quality/
    // speech/emotion/scene_cut/action. Deferred — returns [] so it never blocks.
    return [];
  },
};

const ANALYZERS = { vision: VISION, video: VIDEO };

function runtimeStatus() {
  return { cpu: !!jimp(), onnx: onnx.status() };
}

// Run a single analyzer over an asset buffer → score objects (or [] on failure).
async function runAnalyzer(analyzerId, buffer, meta) {
  const a = ANALYZERS[analyzerId];
  if (!a) return null;
  const scores = await a.run(buffer, meta);
  return { analyzer_id: a.id, model_version: a.model_version, scores: scores || [] };
}

module.exports = { ANALYZERS, runAnalyzer, runtimeStatus };
