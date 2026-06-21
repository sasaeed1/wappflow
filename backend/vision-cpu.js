'use strict';

// ── Server-side CPU vision fallback ──────────────────────────────────────────
// Gives workspaces with NO desktop install real vision primitives (composition,
// aesthetic, scene_class) so the cull UI + composites (hero/portfolio/album) work
// without anyone running the desktop Local AI Engine. jimp-only — no native build,
// no ONNX. Mirrors the desktop vision analyzer's CPU pass.
//
// Written under model_version 'vision-cpu-v1'. The desktop's richer 'vision-v1'
// pass (which adds face_count/smile/eyes_open) ALWAYS supersedes it because the
// version differs — so analyze-once stays "pending" until a desktop runs, then the
// desktop's recordScores('vision', 'vision-v1', …) deletes + replaces these.
//
// face_count/smile server-side need onnxruntime-node + models on the host (see
// ./face-detect.js); when present, fold them into the same vision recordScores.

let Jimp = null; try { Jimp = require('jimp'); } catch { /* optional — fallback disabled */ }

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const MODEL_VERSION = 'vision-cpu-v1';

// CPU image metrics on a downscaled pass (clones — never mutates the caller's image).
function cpuMetrics(img) {
  const work = img.clone();
  const longEdge = Math.max(work.bitmap.width, work.bitmap.height);
  if (longEdge > 1024) work.resize(...(work.bitmap.width >= work.bitmap.height ? [1024, Jimp.AUTO] : [Jimp.AUTO, 1024]));
  const { data, width: W, height: H } = work.bitmap;
  const N = W * H;
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
  const mRG = sumRG / N, mYB = sumYB / N;
  const sdRG = Math.sqrt(Math.max(0, sumRG2 / N - mRG * mRG));
  const sdYB = Math.sqrt(Math.max(0, sumYB2 / N - mYB * mYB));
  const colourfulness = Math.sqrt(sdRG * sdRG + sdYB * sdYB) + 0.3 * Math.sqrt(mRG * mRG + mYB * mYB);
  let lapSum = 0, lapSum2 = 0, lapN = 0, eTot = 0, eX = 0, eY = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const lap = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - W] - lum[i + W];
      lapSum += lap; lapSum2 += lap * lap; lapN++;
      const e = Math.abs(lap); eTot += e; eX += e * x; eY += e * y;
    }
  }
  const sharpness = lapN ? (lapSum2 / lapN - (lapSum / lapN) ** 2) : 0;
  let thirds = 0.5;
  if (eTot > 0) {
    const cx = eX / eTot, cy = eY / eTot;
    const dx = Math.min(Math.abs(cx - W / 3), Math.abs(cx - 2 * W / 3)) / (W / 3);
    const dy = Math.min(Math.abs(cy - H / 3), Math.abs(cy - 2 * H / 3)) / (H / 3);
    thirds = clamp01(1 - 0.5 * (clamp01(dx) + clamp01(dy)));
  }
  return { sharpness, meanL, stdL, colourfulness, thirds };
}

// Coarse scene taxonomy (portrait/group/landscape/scene + indoor/outdoor). No model.
function sceneClass(img, faceCount) {
  const W = img.bitmap.width, H = img.bitmap.height;
  const aspect = W / Math.max(1, H);
  const t = img.clone().resize(32, Jimp.AUTO);
  const d = t.bitmap.data, N = t.bitmap.width * t.bitmap.height;
  let blueish = 0, greenish = 0;
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    if (b > r + 18 && b > 90) blueish++;
    if (g > r + 12 && g > b + 4) greenish++;
  }
  const outdoorSignal = N ? (blueish + greenish) / N : 0;
  const indoorOutdoor = outdoorSignal > 0.18 ? 'outdoor' : 'indoor';
  let label;
  if (faceCount >= 3) label = 'group';
  else if (faceCount >= 1) label = 'portrait';
  else if (aspect >= 1.4) label = 'landscape';
  else label = 'scene';
  const confidence = faceCount >= 1 ? 0.7 : (outdoorSignal > 0.18 || aspect >= 1.4 ? 0.6 : 0.5);
  return { score_type: 'scene_class', value: +confidence.toFixed(3), reasons: {
    label, indoor_outdoor: indoorOutdoor, aspect: +aspect.toFixed(2), faces: faceCount,
    outdoor_signal: +outdoorSignal.toFixed(3), method: 'cpu-heuristic', engine: 'server',
  } };
}

// computeVisionCpu(jimpImage, { faceCount }) → [composition, aesthetic, scene_class]
// Pass an already-decoded jimp image (the worker decodes once for variants/CV).
function computeVisionCpu(img, { faceCount = 0 } = {}) {
  if (!Jimp || !img) return [];
  const m = cpuMetrics(img);
  const sharpN = clamp01(m.sharpness / 240);
  const expoQ = clamp01(1 - Math.abs(m.meanL / 255 - 0.5) * 2);
  const contrastN = clamp01(m.stdL / 64);
  const colourN = clamp01(m.colourfulness / 110);
  const aesthetic = clamp01(0.40 * sharpN + 0.25 * expoQ + 0.20 * contrastN + 0.15 * colourN);
  const composition = clamp01(m.thirds);
  return [
    { score_type: 'composition', value: +composition.toFixed(3), reasons: { thirds: +m.thirds.toFixed(3), engine: 'server-cpu' } },
    { score_type: 'aesthetic', value: +aesthetic.toFixed(3), reasons: {
      sharpness: Math.round(m.sharpness), exposure: +(m.meanL / 255).toFixed(3),
      contrast: +contrastN.toFixed(3), colourfulness: +colourN.toFixed(3), engine: 'server-cpu',
    } },
    sceneClass(img, faceCount),
  ];
}

module.exports = { available: () => !!Jimp, computeVisionCpu, MODEL_VERSION };
