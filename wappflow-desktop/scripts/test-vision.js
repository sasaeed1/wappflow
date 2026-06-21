'use strict';

// Headless self-test for the local vision pipeline — runs the SAME analyzer the
// app uses on one local image and prints the scores. Use it to verify the ONNX
// model decode on your machine before trusting it on a whole library:
//
//   npm run test:vision C:\path\to\a-photo.jpg
//
// Runs in plain Node (no Electron). Needs jimp installed; face_count/smile also
// need onnxruntime-node + the models (run `npm run fetch-models` first).

const fs = require('fs');
const analyzers = require('../src/main/ai/analyzers');

(async () => {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/test-vision.js <image.jpg>'); process.exit(1); }
  if (!fs.existsSync(file)) { console.error('file not found:', file); process.exit(1); }

  console.log('Runtime:', JSON.stringify(analyzers.runtimeStatus(), null, 2));
  const buf = fs.readFileSync(file);
  const t0 = Date.now();
  const res = await analyzers.runAnalyzer('vision', buf, {});
  const ms = Date.now() - t0;
  console.log(`\nVision scores for ${file}  (${ms} ms):`);
  for (const s of (res && res.scores) || []) {
    console.log(`  ${s.score_type.padEnd(12)} ${String(s.value).padStart(8)}   ${s.reasons ? JSON.stringify(s.reasons) : ''}`);
  }
  const hasFace = (res.scores || []).some(s => s.score_type === 'face_count');
  console.log(hasFace
    ? '\n✓ ONNX face pipeline ran (face_count present). If face_count looks right on a photo with known faces, the decode is correct.'
    : '\nℹ Only CPU primitives (composition/aesthetic). Install models + onnxruntime-node for face_count/smile: npm run fetch-models');
})();
