'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA STUDIO — FACE / SMILE DETECTOR  (optional, opt-in)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Powers people-aware AI reel drafts: writes advisory `faces` + `smile` scores
 *  to ms_asset_scores during photo ingest, which the draft ranker boosts for
 *  people-centric styles (Emotional Story, Wedding…). Control-first — still just
 *  advisory: a human edits every draft.
 *
 *  ENABLE IT (on the server, one time):
 *      cd backend && npm install @vladmandic/face-api @tensorflow/tfjs-node
 *      pm2 restart wappflow-api
 *  BOTH are required — face-api's Node build externalises @tensorflow/tfjs-node
 *  and requires it at load. Model weights ship INSIDE @vladmandic/face-api
 *  (no separate download); confirmed loading from
 *  node_modules/@vladmandic/face-api/model. (If a native tfjs-node build is not
 *  possible, switch to the WASM backend: @tensorflow/tfjs + tfjs-backend-wasm
 *  with face-api/dist/face-api.node-wasm.js.)
 *
 *  Until the package is installed, requiring this file throws and the worker's
 *  `require('./face-detect')` seam silently no-ops — ingest is unaffected and no
 *  face scores are written. Nothing here is faked.
 *
 *  Cost: ~100-500 ms of CPU per photo at ingest (background job, non-blocking).
 *  Override the model directory with MS_FACE_MODELS if your weights live elsewhere.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const path = require('path');

// Throws if not installed → caught by the worker seam (feature simply stays off).
const faceapi = require('@vladmandic/face-api');
// Optional faster backend; ignored if absent (face-api falls back to CPU tfjs).
try { require('@tensorflow/tfjs-node'); } catch { /* optional speed-up */ }

const MAX_EDGE = 640; // downscale before detection — plenty for face finding, far cheaper

function modelDir() {
  if (process.env.MS_FACE_MODELS) return process.env.MS_FACE_MODELS;
  // @vladmandic/face-api bundles its weights under <pkg>/model
  try { return path.join(path.dirname(require.resolve('@vladmandic/face-api/package.json')), 'model'); }
  catch { return path.join(__dirname, 'models'); }
}

let ready = null;
function init() {
  if (!ready) {
    ready = (async () => {
      const dir = modelDir();
      await faceapi.nets.tinyFaceDetector.loadFromDisk(dir);
      await faceapi.nets.faceExpressionNet.loadFromDisk(dir);
    })();
  }
  return ready;
}

/**
 * Detect faces + the strongest smile in a Jimp image.
 * @param {object} jimpImage - a Jimp instance (has .clone()/.resize()/.bitmap)
 * @returns {Promise<{faces:number, smile:number}>} smile is 0..1 (max "happy" across faces)
 */
async function detect(jimpImage) {
  await init();
  const tf = faceapi.tf;
  const src = jimpImage.bitmap;
  if (!src || !src.width || !src.height) return { faces: 0, smile: 0 };

  // downscale a clone for speed/memory (keep aspect)
  let img = jimpImage;
  const longEdge = Math.max(src.width, src.height);
  if (longEdge > MAX_EDGE) {
    const r = MAX_EDGE / longEdge;
    img = jimpImage.clone().resize(Math.max(1, Math.round(src.width * r)), Math.max(1, Math.round(src.height * r)));
  }
  const { width, height, data } = img.bitmap; // RGBA

  // RGBA → RGB tensor [h, w, 3]
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) { rgb[j] = data[i]; rgb[j + 1] = data[i + 1]; rgb[j + 2] = data[i + 2]; }
  const input = tf.tensor3d(rgb, [height, width, 3]);
  try {
    const results = await faceapi
      .detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 }))
      .withFaceExpressions();
    let smile = 0;
    for (const r of results) smile = Math.max(smile, (r.expressions && r.expressions.happy) || 0);
    return { faces: results.length, smile: Math.round(smile * 1000) / 1000 };
  } finally {
    input.dispose();
  }
}

module.exports = { detect, init, _modelDir: modelDir };
