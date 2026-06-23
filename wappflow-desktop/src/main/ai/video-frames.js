'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  VIDEO FRAME AGGREGATION  (Final Vision · Phase 8 — desktop video analysis)
//  Pure, dependency-free aggregation of per-frame metrics into clip-level Track-0
//  video scores. The ffmpeg frame extraction + per-frame CPU metrics live in the
//  analyzer (I/O); this module is the deterministic, unit-tested math.
//
//  Emits ONLY registry-valid video score_types (backend/analyzers SCORE_TYPES):
//    • quality   — mean per-frame aesthetic (how good the footage looks)
//    • motion    — mean inter-frame luma change (amount of movement/cuts)
//    • scene_cut — density of large frame-to-frame changes (0..1) + cut_count
//    • shake     — instability: variability of inter-frame motion (jitter)
//  speech / emotion / action need audio + ML and are left for a later pass.
// ════════════════════════════════════════════════════════════════════════════

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const SCENE_CUT_THRESHOLD = 0.18; // normalized luma delta that counts as a cut

// Evenly-spaced sample timestamps (ms), trimming the first/last 5% (titles/black).
function sampleTimestamps(durationMs, n) {
  const d = Math.max(0, Number(durationMs) || 0);
  const count = Math.max(1, Math.min(60, n | 0 || 1));
  if (d === 0) return Array.from({ length: count }, () => 0);
  const lo = d * 0.05, hi = d * 0.95;
  if (count === 1) return [Math.round((lo + hi) / 2)];
  const step = (hi - lo) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(lo + i * step));
}

// frames: ordered array of { aesthetic (0..1), sharpness (raw), meanL (0..255) }.
// Returns Track-0 score objects ({ score_type, value, reasons }).
function aggregate(frames) {
  const fs = (frames || []).filter(Boolean);
  if (fs.length === 0) return [];

  const quality = clamp01(fs.reduce((s, f) => s + (f.aesthetic || 0), 0) / fs.length);

  // inter-frame luma deltas (0..1) → motion / scene-cut / shake
  const deltas = [];
  for (let i = 1; i < fs.length; i++) {
    deltas.push(clamp01(Math.abs((fs[i].meanL || 0) - (fs[i - 1].meanL || 0)) / 255));
  }
  const meanDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  // motion: scale the mean luma delta into a useful 0..1 band (×3, capped)
  const motion = clamp01(meanDelta * 3);

  const cutCount = deltas.filter(d => d > SCENE_CUT_THRESHOLD).length;
  const sceneCut = deltas.length ? clamp01(cutCount / deltas.length) : 0;

  // shake: coefficient-of-variation of the deltas (jittery motion → high)
  let shake = 0;
  if (deltas.length > 1 && meanDelta > 0) {
    const varD = deltas.reduce((s, d) => s + (d - meanDelta) ** 2, 0) / deltas.length;
    shake = clamp01(Math.sqrt(varD) / meanDelta);
  }

  return [
    { score_type: 'quality', value: +quality.toFixed(3), reasons: { frames: fs.length, engine: 'cpu-video' } },
    { score_type: 'motion', value: +motion.toFixed(3), reasons: { mean_luma_delta: +meanDelta.toFixed(4) } },
    { score_type: 'scene_cut', value: +sceneCut.toFixed(3), reasons: { cut_count: cutCount, sampled_transitions: deltas.length, threshold: SCENE_CUT_THRESHOLD } },
    { score_type: 'shake', value: +shake.toFixed(3), reasons: { engine: 'cpu-video' } },
  ];
}

module.exports = { sampleTimestamps, aggregate, SCENE_CUT_THRESHOLD };
