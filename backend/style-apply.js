'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  STYLE AUTO-APPLY  (Final Vision · Phase 9 — the consumer of the Style Engine)
//  PURE. Given an asset's MEASURED look + the house-style TARGET (both 0..1, from
//  the aesthetic-score reasons + style_profiles), compute a SUBTLE, bounded colour
//  grade in the video-engine's -1..1 range that nudges the asset toward the house
//  style, plus a `style_match` (1 = already on-style). Never an extreme change.
//
//  Advisory by default (surfaced as suggestions); the reel renderer opts IN to
//  actually bake the grade onto each clip. Non-destructive: it grades a render,
//  never the original.
// ════════════════════════════════════════════════════════════════════════════

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// measured/target: { exposure, contrast, colourfulness } (each 0..1, optional)
function styleAdjust(measured = {}, target = {}) {
  // delta toward target, scaled into the grade range and capped so it stays subtle
  const d = (t, m, k = 1.4, cap = 0.5) => (t == null || m == null) ? 0 : +clamp((t - m) * k, -cap, cap).toFixed(3);
  const adjust = {
    brightness: d(target.exposure, measured.exposure),
    contrast: d(target.contrast, measured.contrast),
    saturation: d(target.colourfulness, measured.colourfulness),
  };
  const diffs = [];
  for (const k of ['exposure', 'contrast', 'colourfulness']) {
    if (target[k] != null && measured[k] != null) diffs.push(Math.abs(target[k] - measured[k]));
  }
  const style_match = diffs.length ? +clamp(1 - (diffs.reduce((s, x) => s + x, 0) / diffs.length) * 1.5, 0, 1).toFixed(3) : null;
  return { adjust, style_match };
}

// Has the grade got any non-zero component worth applying?
function hasGrade(adjust) { return !!adjust && (adjust.brightness || adjust.contrast || adjust.saturation); }

module.exports = { styleAdjust, hasGrade };
