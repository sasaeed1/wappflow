'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Backfill subject points for assets analysed before reel framing existed.
//
//  vision-cpu.js now keeps the edge-energy centroid it always computed, and the
//  reel builder uses it to decide where a 9:16 crop should sit. Assets analysed
//  BEFORE that change have every other vision score but no `subject_point`, so
//  their clips would keep being centre-cropped — and nothing would re-analyse
//  them, because analyze-once treats them as already done.
//
//  This walks them, decodes the smallest variant that exists (the point is
//  normalised, so a thumbnail gives the same answer as the original for a
//  fraction of the work), and writes the missing score.
//
//  Dry by default. Pass --apply to write.
//
//    node backfill-subject-points.js            # report only
//    node backfill-subject-points.js --apply
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const crypto = require('crypto');

let Jimp = null;
try { Jimp = require('jimp'); } catch { console.error('jimp is not installed — cannot backfill.'); process.exit(1); }

const APPLY = process.argv.includes('--apply');
const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : __dirname);
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'wappflow.db');
const clamp01 = (n) => Math.max(0, Math.min(1, n));

// The same centroid vision-cpu.js derives, on a small pass. Kept here rather than
// imported because that module's entry point wants a decoded image plus the full
// score set, and this only needs one number pair.
function subjectOf(img) {
  const work = img.clone();
  const longEdge = Math.max(work.bitmap.width, work.bitmap.height);
  if (longEdge > 512) work.resize(...(work.bitmap.width >= work.bitmap.height ? [512, Jimp.AUTO] : [Jimp.AUTO, 512]));
  const { data, width: W, height: H } = work.bitmap;
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) lum[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  let eTot = 0, eX = 0, eY = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const e = Math.abs(4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - W] - lum[i + W]);
      eTot += e; eX += e * x; eY += e * y;
    }
  }
  if (!eTot) return null;
  return { x: +clamp01((eX / eTot) / W).toFixed(4), y: +clamp01((eY / eTot) / H).toFixed(4) };
}

const db = new Database(DB_PATH);
const rows = db.prepare(`
  SELECT a.id, a.workspace_id, a.storage_key, a.variants
  FROM ms_assets a
  WHERE a.type = 'photo' AND (a.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM ms_asset_scores s WHERE s.asset_id = a.id AND s.score_type = 'subject_point')
`).all();

console.log(`${rows.length} photo(s) without a subject point in ${DB_PATH}`);
if (!APPLY) console.log('DRY RUN — pass --apply to write.\n');

const ins = db.prepare(`INSERT INTO ms_asset_scores (id, workspace_id, asset_id, score_type, value, model_version, source, reasons)
                        VALUES (?, ?, ?, 'subject_point', ?, 'vision-cpu-v1', 'server', ?)`);

let done = 0, skipped = 0;
(async () => {
  for (const r of rows) {
    // Prefer the smallest variant that exists: the point is normalised, so a
    // thumbnail answers the same question as a 40MP original far more cheaply.
    let variants = {}; try { variants = JSON.parse(r.variants || '{}'); } catch {}
    const candidate = [variants.thumb, variants.web, r.storage_key].find(Boolean);
    if (!candidate) { skipped++; continue; }
    const abs = path.join(DATA_DIR, 'uploads', String(candidate).replace(/^\/?uploads\/?/, ''));
    if (!fs.existsSync(abs)) { skipped++; continue; }
    try {
      const img = await Jimp.read(abs);
      const s = subjectOf(img);
      if (!s) { skipped++; continue; }
      console.log(`  → ${r.id}  subject (${s.x}, ${s.y})`);
      if (APPLY) ins.run(crypto.randomUUID(), r.workspace_id, r.id, s.x, JSON.stringify({ ...s, method: 'edge-centroid', engine: 'server-cpu', backfilled: true }));
      done++;
    } catch (e) {
      console.log(`  ? ${r.id} — ${e.message.slice(0, 60)}`);
      skipped++;
    }
  }
  console.log(`\n${APPLY ? 'Wrote' : 'Would write'}: ${done} · skipped (no readable file): ${skipped}`);
  db.close();
})();
