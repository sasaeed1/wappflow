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
const pre = require('../preprocess');
const models = require('../models');
const videoFrames = require('../video-frames');
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const VIDEO_MODEL_VERSION = 'video-v1'; // keep in sync with backend/analyzers ANALYZERS.video.modelVersion

let Jimp = null, jimpTried = false;
function jimp() {
  if (jimpTried) return Jimp;
  jimpTried = true;
  try { Jimp = require('jimp'); } catch { Jimp = null; }
  return Jimp;
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

// Compute CPU image metrics on a downscaled greyscale/RGB pass. Takes an already-
// decoded jimp image and clones before resizing (never mutates the caller's image).
function cpuMetrics(img) {
  const J = jimp();
  const work = img.clone();
  const longEdge = Math.max(work.bitmap.width, work.bitmap.height);
  if (longEdge > 1024) work.resize(...(work.bitmap.width >= work.bitmap.height ? [1024, J.AUTO] : [J.AUTO, 1024]));
  const { data, width: W, height: H } = work.bitmap; // RGBA
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
  model_version: models.VISION_MODEL_VERSION, // matches the server registry so analyze-once clears `pending`
  async run(buffer /*, meta */) {
    const J = jimp();
    if (!J) throw new Error('jimp not available (CPU image analysis disabled)');
    const img = await J.read(buffer); // decode once, share with CPU + ONNX passes
    const m = cpuMetrics(img);
    const sharpN = clamp01(m.sharpness / 240);
    const expoQ = clamp01(1 - Math.abs(m.meanL / 255 - 0.5) * 2);
    const contrastN = clamp01(m.stdL / 64);
    const colourN = clamp01(m.colourfulness / 110);
    const aesthetic = clamp01(0.40 * sharpN + 0.25 * expoQ + 0.20 * contrastN + 0.15 * colourN);
    const composition = clamp01(m.thirds);
    const scores = [
      { score_type: 'composition', value: +composition.toFixed(3), reasons: { thirds: +m.thirds.toFixed(3) } },
      { score_type: 'aesthetic', value: +aesthetic.toFixed(3), reasons: {
        sharpness: Math.round(m.sharpness), exposure: +(m.meanL / 255).toFixed(3),
        contrast: +contrastN.toFixed(3), colourfulness: +colourN.toFixed(3), engine: 'cpu-vision',
      } },
    ];
    // ONNX vision (face_count + smile + eyes_open) — only when models are present.
    let faceCount = 0;
    try {
      const extra = await onnxVision(img);
      if (extra && extra.length) {
        scores.push(...extra);
        const fc = extra.find(s => s.score_type === 'face_count');
        if (fc) faceCount = fc.value;
      }
    } catch { /* model absent / load failed → CPU primitives only */ }
    // scene_class (CPU heuristic; always emitted, no model required).
    scores.push(sceneClass(img, m, faceCount));
    return scores;
  },
};

// ONNX face pipeline: UltraFace (face_count) → FER+ on each face crop (smile).
// Returns [] when ORT/models are unavailable (CPU primitives stand alone).
async function onnxVision(img) {
  if (!onnx.available()) return [];
  const faces = await detectFaces(img);
  if (faces === null) return []; // no face-detect model installed
  const out = [{ score_type: 'face_count', value: faces.length, reasons: { detector: 'ultraface-rfb-320' } }];
  if (faces.length) {
    const expr = await scoreExpression(img, faces);
    if (expr && expr.smile != null) {
      // `smile` stays the headline score; the full FER+ emotion distribution +
      // dominant emotion ride in reasons (explainability; no registry change).
      out.push({ score_type: 'smile', value: +expr.smile.toFixed(3), reasons: { faces: faces.length, model: 'ferplus', dominant: expr.dominant, emotions: expr.emotions } });
    }
    const eo = eyeOpenness(img, faces);
    if (eo != null) out.push({ score_type: 'eyes_open', value: +eo.toFixed(3), reasons: { faces: faces.length, method: 'eyeband-detail', confidence: 'low' } });
  }
  return out;
}

// Heuristic eye-openness from each detected face's eye band. Open eyes carry more
// high-frequency structure (iris/sclera/lash edges) than closed lids. Advisory +
// low-confidence — it correlates with eye-region detail, so a dedicated eye-state
// model would supersede it. Returns mean openness 0..1 across faces, or null.
function eyeOpenness(img, faces) {
  let sum = 0, count = 0;
  for (const f of faces) {
    const fw = f.x2 - f.x1, fh = f.y2 - f.y1;
    if (fw < 12 || fh < 12) continue;
    const ex = Math.max(0, Math.round(f.x1 + 0.12 * fw));
    const ey = Math.max(0, Math.round(f.y1 + 0.22 * fh));
    const ew = Math.min(img.bitmap.width - ex, Math.round(0.76 * fw));
    const eh = Math.min(img.bitmap.height - ey, Math.round(0.26 * fh));
    if (ew < 6 || eh < 4) continue;
    const band = img.clone().crop(ex, ey, ew, eh).greyscale();
    const { data, width: W, height: H } = band.bitmap;
    let s = 0, s2 = 0, n = 0;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      const lap = 4 * data[i] - data[i - 4] - data[i + 4] - data[((y - 1) * W + x) * 4] - data[((y + 1) * W + x) * 4];
      s += lap; s2 += lap * lap; n++;
    }
    const varL = n ? (s2 / n - (s / n) ** 2) : 0;
    sum += clamp01(varL / 180);
    count++;
  }
  return count ? sum / count : null;
}

// Coarse CPU scene taxonomy (no model): portrait / group / landscape / scene,
// plus an indoor/outdoor signal from sky/foliage colour. Advisory + organizational
// (low risk); value is heuristic confidence, the label rides in reasons.
function sceneClass(img, m, faceCount) {
  const J = jimp();
  const W = img.bitmap.width, H = img.bitmap.height;
  const aspect = W / Math.max(1, H);
  const t = img.clone().resize(32, J.AUTO);
  const d = t.bitmap.data, N = t.bitmap.width * t.bitmap.height;
  let blueish = 0, greenish = 0;
  for (let p = 0; p < d.length; p += 4) {
    const r = d[p], g = d[p + 1], b = d[p + 2];
    if (b > r + 18 && b > 90) blueish++;       // sky-ish
    if (g > r + 12 && g > b + 4) greenish++;    // foliage-ish
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
    outdoor_signal: +outdoorSignal.toFixed(3), method: 'cpu-heuristic',
  } };
}

// → array of {x1,y1,x2,y2,score} in pixel coords, or null if the model is absent.
async function detectFaces(img) {
  const spec = models.FACE_DETECT;
  if (!onnx.hasModel(spec.file)) return null;
  const ort = onnx.ort;
  const s = await onnx.session(spec.file);
  const t = pre.toCHW(img, spec.input.w, spec.input.h, spec.input);
  const res = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', t.data, t.dims) });
  // Identify outputs by trailing dim: 2 → scores [1,N,2], 4 → boxes [1,N,4].
  let scores = null, boxes = null;
  for (const name of s.outputNames) { const o = res[name]; const last = o.dims[o.dims.length - 1]; if (last === 2) scores = o; else if (last === 4) boxes = o; }
  if (!scores || !boxes) return [];
  const W = img.bitmap.width, H = img.bitmap.height;
  const n = scores.dims[1];
  const dets = [];
  for (let i = 0; i < n; i++) {
    const p = scores.data[i * 2 + 1]; // face probability
    if (p < spec.scoreThresh) continue;
    const b = i * 4;
    dets.push({ x1: boxes.data[b] * W, y1: boxes.data[b + 1] * H, x2: boxes.data[b + 2] * W, y2: boxes.data[b + 3] * H, score: p });
  }
  return pre.nms(dets, 0.4);
}

// FER+ across all faces → { smile, dominant, emotions }, or null if no model.
//   smile    = max happiness probability across faces (0..1)
//   emotions = mean distribution across faces over the 8 FER+ classes
//   dominant = highest-mean emotion label
async function scoreExpression(img, faces) {
  const spec = models.FACE_EXPRESSION;
  if (!onnx.hasModel(spec.file)) return null;
  const ort = onnx.ort;
  const s = await onnx.session(spec.file);
  const labels = spec.emotions || [];
  const agg = new Array(labels.length).fill(0);
  let best = 0, count = 0;
  for (const f of faces) {
    const t = pre.cropGray(img, f, spec.input.size);
    const res = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', t.data, t.dims) });
    const probs = pre.softmax(Array.from(res[s.outputNames[0]].data));
    for (let i = 0; i < probs.length && i < agg.length; i++) agg[i] += probs[i];
    best = Math.max(best, probs[spec.happyIndex] || 0);
    count++;
  }
  if (!count) return null;
  const emotions = {};
  for (let i = 0; i < labels.length; i++) emotions[labels[i]] = +(agg[i] / count).toFixed(3);
  let dominant = labels[0] || null, domV = -1;
  for (const k of Object.keys(emotions)) if (emotions[k] > domV) { domV = emotions[k]; dominant = k; }
  return { smile: best, dominant, emotions };
}

// ── VIDEO analyzer (client tier) — ffmpeg frame extraction + CPU metrics ──────
// Writes the clip to a temp file, samples frames at 1fps (capped), runs the same
// CPU vision metrics per frame, and aggregates to clip-level Track-0 video scores
// (quality/motion/scene_cut/shake). Returns [] without ffmpeg → never blocks.
function runFfmpeg(args) {
  return new Promise((resolve) => {
    let p;
    try { p = spawn('ffmpeg', args, { windowsHide: true }); }
    catch { return resolve(false); }
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

// frame metric used by the aggregator: { aesthetic, sharpness, meanL }
function frameMetric(img) {
  const m = cpuMetrics(img);
  const sharpN = clamp01(m.sharpness / 240);
  const expoQ = clamp01(1 - Math.abs(m.meanL / 255 - 0.5) * 2);
  const contrastN = clamp01(m.stdL / 64);
  const colourN = clamp01(m.colourfulness / 110);
  const aesthetic = clamp01(0.40 * sharpN + 0.25 * expoQ + 0.20 * contrastN + 0.15 * colourN);
  return { aesthetic, sharpness: m.sharpness, meanL: m.meanL };
}

async function extractVideoFrameMetrics(buffer, maxFrames = 15) {
  const J = jimp();
  if (!J || !buffer || !buffer.length) return [];
  let dir;
  try { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-vid-')); } catch { return []; }
  const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
  try {
    const inPath = path.join(dir, 'clip');
    fs.writeFileSync(inPath, buffer);
    const ok = await runFfmpeg(['-y', '-i', inPath, '-vf', 'fps=1', '-frames:v', String(maxFrames), '-vsync', 'vfr', path.join(dir, 'f_%03d.png')]);
    if (!ok) { cleanup(); return []; }
    const files = fs.readdirSync(dir).filter(f => f.startsWith('f_') && f.endsWith('.png')).sort();
    const out = [];
    for (const f of files) {
      try { out.push(frameMetric(await J.read(path.join(dir, f)))); } catch { /* skip bad frame */ }
    }
    cleanup();
    return out;
  } catch { cleanup(); return []; }
}

const VIDEO = {
  id: 'video',
  model_version: VIDEO_MODEL_VERSION,
  async run(buffer /*, meta */) {
    const frames = await extractVideoFrameMetrics(buffer);
    if (!frames.length) return []; // no ffmpeg / undecodable → never blocks the run
    return videoFrames.aggregate(frames);
  },
};

const ANALYZERS = { vision: VISION, video: VIDEO };

function runtimeStatus() {
  return {
    cpu: !!jimp(),
    onnx: onnx.status(),
    models: {
      face_detect: onnx.hasModel(models.FACE_DETECT.file),
      face_expression: onnx.hasModel(models.FACE_EXPRESSION.file),
    },
  };
}

// Run a single analyzer over an asset buffer → score objects (or [] on failure).
async function runAnalyzer(analyzerId, buffer, meta) {
  const a = ANALYZERS[analyzerId];
  if (!a) return null;
  const scores = await a.run(buffer, meta);
  return { analyzer_id: a.id, model_version: a.model_version, scores: scores || [] };
}

module.exports = { ANALYZERS, runAnalyzer, runtimeStatus };
