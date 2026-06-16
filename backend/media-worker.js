'use strict';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA STUDIO — WORKER  (drains ms_jobs)
 * ─────────────────────────────────────────────────────────────────────────────
 *  For each `ingest` job: read EXIF, generate thumb/web variants, and compute
 *  ADVISORY CV scores (sharpness, exposure, perceptual-hash dedup).
 *
 *  Control-first by construction: the worker writes ONLY
 *    • ms_asset_scores  (advisory AI/CV output)
 *    • the asset's own technical metadata (variants/width/height/capture_time/phash)
 *  It has NO write path to ms_cull_decisions / galleries / delivery. Scores inform
 *  the human; they never become a decision.
 *
 *  Image libs (jimp, exifr) are OPTIONAL and loaded defensively: if either is
 *  missing, jobs still drain — variant/score steps are skipped and the job is
 *  marked done with a `degraded` note. A missing dependency must NEVER crash the
 *  host server. RAW/video are passed through (no preview) for a later specialist.
 * ─────────────────────────────────────────────────────────────────────────────
 */

let Jimp = null, exifr = null, AdmZip = null, PDFDocument = null;
try { Jimp = require('jimp'); } catch { /* optional */ }
try { exifr = require('exifr'); } catch { /* optional */ }
try { AdmZip = require('adm-zip'); } catch { /* optional — zip export degrades */ }
try { PDFDocument = require('pdfkit'); } catch { /* optional — album pdf degrades */ }

const { spawn } = require('child_process');
const videoEngine = require('./video-engine');
const videoLuts = require('./video-luts');
// Optional face/smile detector. Drop in a ./face-detect.js exporting
// async detect(jimpImage) → { faces:number, smile:0..1 } to enable people-aware
// AI reel drafts. Absent by default → no face scores, ranking unaffected.
let faceDetect = null;
try { faceDetect = require('./face-detect'); } catch { /* optional */ }
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

module.exports = function createMediaWorker(db, deps = {}) {
  const {
    uploadsDir,
    path = require('path'),
    fs = require('fs'),
    generateId = () => require('crypto').randomUUID(),
    broadcastToWorkspace = () => {},
  } = deps;

  const variantsDir = path.join(uploadsDir, 'media', 'variants');
  try { fs.mkdirSync(variantsDir, { recursive: true }); } catch {}

  // Media Intelligence — same Analyzer abstraction the API uses. The worker is just
  // one execution tier (server CPU); the ledger + composites flow through here too.
  const intel = require('./analyzers')(db, { generateId });
  try { intel.ensureSchema(); } catch { /* media-studio mount already ensured it */ }

  const MAX_RETRIES = 3;
  const PHASH_DUP_DISTANCE = 6; // ≤6 bits different on a 64-bit aHash ≈ near-duplicate

  // ── small helpers ──────────────────────────────────────────────────────────
  function publicUrl(relUnderUploads) {
    return '/' + ['uploads', relUnderUploads].join('/').replace(/\/+/g, '/');
  }
  const RAW_EXTS = ['cr2', 'cr3', 'nef', 'arw', 'raf', 'rw2', 'dng', 'orf', 'srw', 'pef'];
  const isRawFile = (filename = '') => RAW_EXTS.includes((filename.split('.').pop() || '').toLowerCase());
  function isProcessableImage(mime = '', filename = '') {
    if (isRawFile(filename)) return false;          // RAW → handled by the RAW pipeline
    return mime.startsWith('image/');
  }

  // Run a binary and capture stdout as a Buffer (null on any failure). Used to
  // shell out to exiftool/dcraw for RAW preview extraction — both OPTIONAL.
  function runCapture(cmd, args) {
    return new Promise((resolve) => {
      try {
        const p = spawn(cmd, args); const chunks = [];
        p.stdout.on('data', d => chunks.push(d)); p.stderr.on('data', () => {});
        p.on('error', () => resolve(null));
        p.on('close', (code) => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null));
      } catch { resolve(null); }
    });
  }
  // RAW → JPEG preview buffer. Prefers the embedded full-size preview (instant,
  // no decode): exiftool → dcraw → exifr thumbnail. Returns null if none work.
  async function extractRawPreview(absPath) {
    const EXIFTOOL = process.env.EXIFTOOL_PATH || 'exiftool';
    for (const tag of ['-PreviewImage', '-JpgFromRaw', '-ThumbnailImage']) {
      const buf = await runCapture(EXIFTOOL, ['-b', tag, absPath]);
      if (buf && buf.length > 2000) return buf;
    }
    const DCRAW = process.env.DCRAW_PATH || 'dcraw';
    try {
      await new Promise((res) => { const p = spawn(DCRAW, ['-e', absPath]); p.on('error', res); p.on('close', res); });
      const thumb = absPath.replace(/\.[^.]+$/, '.thumb.jpg');
      if (fs.existsSync(thumb)) { const b = fs.readFileSync(thumb); try { fs.unlinkSync(thumb); } catch {} if (b.length > 2000) return b; }
    } catch { /* dcraw absent */ }
    if (exifr && exifr.thumbnail) { try { const b = await exifr.thumbnail(absPath); if (b && b.length > 1000) return Buffer.from(b); } catch {} }
    return null;
  }
  function hamming(a, b) {
    if (!a || !b || a.length !== b.length) return 64;
    let d = 0;
    for (let i = 0; i < a.length; i++) {
      let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
      while (x) { d += x & 1; x >>= 1; }
    }
    return d;
  }

  // ── CV: average-hash + sharpness (Laplacian variance) + exposure ────────────
  async function analyze(image) {
    // aHash (perceptual) on an 8×8 grayscale
    const small = image.clone().greyscale().resize(8, 8);
    const sd = small.bitmap.data;
    let mean = 0;
    for (let i = 0; i < 64; i++) mean += sd[i * 4];
    mean /= 64;
    let bits = '';
    for (let i = 0; i < 64; i++) bits += (sd[i * 4] >= mean) ? '1' : '0';
    let phash = '';
    for (let i = 0; i < 64; i += 4) phash += parseInt(bits.slice(i, i + 4), 2).toString(16);

    // sharpness + exposure on a grayscale capped at 1024px wide (speed)
    const g = image.clone().greyscale();
    if (g.bitmap.width > 1024) g.resize(1024, Jimp.AUTO);
    const { data, width, height } = g.bitmap;
    const L = (x, y) => data[(y * width + x) * 4];
    let sum = 0, sumSq = 0, n = 0, shadowClip = 0, highClip = 0, lumSum = 0, lumN = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const lap = 4 * L(x, y) - L(x - 1, y) - L(x + 1, y) - L(x, y - 1) - L(x, y + 1);
        sum += lap; sumSq += lap * lap; n++;
      }
    }
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i]; lumSum += v; lumN++;
      if (v <= 4) shadowClip++; else if (v >= 251) highClip++;
    }
    const variance = n ? (sumSq / n) - Math.pow(sum / n, 2) : 0;
    const exposure = (lumSum / lumN) / 255;                   // 0..1 mean luminance
    const shadow = shadowClip / lumN, high = highClip / lumN, clipping = shadow + high;
    // composite "keepability" hint (0..1): focus + tonal balance, penalised for heavy clipping
    const focusScore = Math.min(1, variance / 220);
    const tonalScore = 1 - Math.min(1, Math.abs(exposure - 0.5) * 2);
    const quality = Math.max(0, Math.min(1, focusScore * 0.55 + tonalScore * 0.30 + (1 - Math.min(1, clipping * 6)) * 0.15));
    return {
      phash,
      sharpness: Math.round(variance * 100) / 100,           // raw Laplacian variance (higher = sharper)
      exposure: Math.round(exposure * 1000) / 1000,          // 0..1 mean luminance
      shadow_clip: Math.round(shadow * 1000) / 1000,         // fraction crushed (underexposed)
      high_clip: Math.round(high * 1000) / 1000,             // fraction blown (overexposed)
      clipping: Math.round(clipping * 1000) / 1000,
      quality: Math.round(quality * 100) / 100,
    };
  }

  // ── EXIF (best-effort) ──────────────────────────────────────────────────────
  async function readExif(filePath) {
    if (!exifr) return {};
    try {
      const t = await exifr.parse(filePath, { tiff: true, exif: true, ifd0: true }) || {};
      const capture = t.DateTimeOriginal || t.CreateDate || null;
      return {
        capture_time: capture ? new Date(capture).toISOString() : null,
        camera_meta: {
          make: t.Make || null, model: t.Model || null, lens: t.LensModel || null,
          iso: t.ISO || null, f: t.FNumber || null, exposure: t.ExposureTime || null,
          focal: t.FocalLength || null,
        },
      };
    } catch { return {}; }
  }

  // ── process a single ingest job ─────────────────────────────────────────────
  async function processIngest(job) {
    const asset = db.prepare('SELECT * FROM ms_assets WHERE id = ?').get(job.asset_id);
    if (!asset) return { note: 'asset-gone' };
    const absPath = path.join(uploadsDir, asset.storage_key);

    // Acquire a Jimp image: a normal raster directly, or a RAW's embedded preview.
    let image = null, rawDerived = false;
    if (Jimp && fs.existsSync(absPath)) {
      if (isProcessableImage(asset.mime, asset.filename)) {
        try { image = await Jimp.read(absPath); } catch { image = null; }
      } else if (isRawFile(asset.filename)) {
        const buf = await extractRawPreview(absPath);
        if (buf) { try { image = await Jimp.read(buf); rawDerived = true; } catch { image = null; } }
      }
    }

    if (!image) {
      // video/audio/missing-lib/undecodable RAW → keep original as-is.
      db.prepare("UPDATE ms_assets SET status = 'ready' WHERE id = ?").run(asset.id);
      if (['video', 'audio'].includes(asset.type) || /^(video|audio)\//.test(asset.mime || '')) {
        enqueue('video_probe', { asset_id: asset.id, project_id: asset.project_id, workspace_id: asset.workspace_id });
        return { note: 'media-queued' };
      }
      return { note: Jimp ? (isRawFile(asset.filename) ? 'raw-no-preview' : 'no-preview') : 'degraded-no-jimp' };
    }

    const width = image.bitmap.width, height = image.bitmap.height;

    // variants
    const thumbRel = `media/variants/${asset.id}-thumb.jpg`;
    const webRel = `media/variants/${asset.id}-web.jpg`;
    await image.clone().resize(400, Jimp.AUTO).quality(72).writeAsync(path.join(uploadsDir, thumbRel));
    await image.clone().resize(Math.min(2048, width), Jimp.AUTO).quality(82).writeAsync(path.join(uploadsDir, webRel));
    const variants = {
      original: publicUrl(asset.storage_key),
      web: publicUrl(webRel),
      thumb: publicUrl(thumbRel),
      ...(rawDerived ? { raw_preview: true } : {}),
    };

    // exif + cv
    const exif = await readExif(absPath);
    const cv = await analyze(image);

    // update the asset's OWN technical metadata (never a decision)
    db.prepare(`
      UPDATE ms_assets
      SET width = ?, height = ?, capture_time = COALESCE(?, capture_time),
          camera_meta = ?, phash = ?, variants = ?, status = 'ready'
      WHERE id = ?
    `).run(width, height, exif.capture_time || null,
           JSON.stringify(exif.camera_meta || {}), cv.phash, JSON.stringify(variants), asset.id);

    // advisory scores — idempotent (clear previous AI scores for this asset first)
    db.prepare("DELETE FROM ms_asset_scores WHERE asset_id = ? AND source = 'ai'").run(asset.id);
    const addScore = db.prepare(`
      INSERT INTO ms_asset_scores (id, workspace_id, asset_id, score_type, value, group_key, model_version, source)
      VALUES (?, ?, ?, ?, ?, ?, 'cv-v0', 'ai')
    `);
    addScore.run(generateId(), asset.workspace_id, asset.id, 'sharpness', cv.sharpness, null);
    addScore.run(generateId(), asset.workspace_id, asset.id, 'exposure', cv.exposure, null);
    addScore.run(generateId(), asset.workspace_id, asset.id, 'clipping', cv.clipping, null);
    addScore.run(generateId(), asset.workspace_id, asset.id, 'quality', cv.quality, null);
    addScore.run(generateId(), asset.workspace_id, asset.id, 'high_clip', cv.high_clip, null);
    addScore.run(generateId(), asset.workspace_id, asset.id, 'shadow_clip', cv.shadow_clip, null);

    // duplicate grouping via perceptual hash, within the same project
    const others = db.prepare(
      "SELECT id, phash FROM ms_assets WHERE project_id = ? AND id != ? AND phash IS NOT NULL"
    ).all(asset.project_id, asset.id);
    let groupKey = null;
    for (const o of others) {
      if (hamming(cv.phash, o.phash) <= PHASH_DUP_DISTANCE) {
        const existing = db.prepare(
          "SELECT group_key FROM ms_asset_scores WHERE asset_id = ? AND score_type = 'duplicate_group' LIMIT 1"
        ).get(o.id);
        groupKey = existing?.group_key || generateId();
        // make sure the matched asset is tagged into the group too
        if (!existing) {
          addScore.run(generateId(), asset.workspace_id, o.id, 'duplicate_group', 1, groupKey);
        }
        break;
      }
    }
    if (groupKey) addScore.run(generateId(), asset.workspace_id, asset.id, 'duplicate_group', 1, groupKey);

    // optional face/smile signal (advisory; powers people-aware AI drafts when a detector is installed)
    if (faceDetect && typeof faceDetect.detect === 'function') {
      try {
        const fd = await faceDetect.detect(image);
        if (fd && fd.faces) addScore.run(generateId(), asset.workspace_id, asset.id, 'faces', fd.faces, null);
        if (fd && fd.smile != null) addScore.run(generateId(), asset.workspace_id, asset.id, 'smile', fd.smile, null);
      } catch { /* detector failure must never break ingest */ }
    }

    // Record the ledger for the server analyzers (so "analyze once" holds) and
    // derive composite scores (hero/portfolio/album/storytelling) from primitives.
    try {
      intel.markAnalyzed(asset.id, 'technical', intel.ANALYZERS.technical.modelVersion, 'server');
      intel.markAnalyzed(asset.id, 'dedup', intel.ANALYZERS.dedup.modelVersion, 'server');
      intel.computeComposites(asset.workspace_id, asset.id);
    } catch { /* intelligence is advisory — never break ingest */ }

    return { note: 'ok', variants, scores: { ...cv }, group: groupKey };
  }

  // ── non-destructive edit rendering ───────────────────────────────────────────
  // Re-renders thumb/web/full variants from the untouched original with the
  // asset's edit params applied (rotate → crop → tone). Clearing edits restores
  // the plain variants. Rev-suffixed filenames bust browser caches.
  async function processRenderEdits(job) {
    const asset = db.prepare('SELECT * FROM ms_assets WHERE id = ?').get(job.asset_id);
    if (!asset) return { note: 'asset-gone' };
    if (!Jimp) return { note: 'degraded-no-jimp' };
    const absPath = path.join(uploadsDir, asset.storage_key);
    if (!fs.existsSync(absPath)) return { note: 'file-gone' };

    let edits = {}; try { edits = JSON.parse(asset.edits || '{}'); } catch {}
    const hasEdits = ['exposure', 'contrast', 'temperature', 'tint', 'saturation', 'fade', 'vignette', 'grain', 'bw', 'rotate', 'crop'].some(k => edits[k]);

    const img = await Jimp.read(absPath);

    if (!hasEdits) {
      // restore plain variants from the original
      const thumbRel = `media/variants/${asset.id}-thumb.jpg`;
      const webRel = `media/variants/${asset.id}-web.jpg`;
      await img.clone().resize(400, Jimp.AUTO).quality(72).writeAsync(path.join(uploadsDir, thumbRel));
      await img.clone().resize(Math.min(2048, img.bitmap.width), Jimp.AUTO).quality(82).writeAsync(path.join(uploadsDir, webRel));
      const variants = { original: publicUrl(asset.storage_key), web: publicUrl(webRel), thumb: publicUrl(thumbRel) };
      db.prepare('UPDATE ms_assets SET variants = ?, width = ?, height = ? WHERE id = ?')
        .run(JSON.stringify(variants), img.bitmap.width, img.bitmap.height, asset.id);
      if (asset.workspace_id) broadcastToWorkspace(asset.workspace_id, 'ms_asset_processed', { asset_id: asset.id, project_id: asset.project_id });
      return { note: 'reset' };
    }

    // 1. rotate (CSS-clockwise positive → jimp counter-clockwise)
    if (edits.rotate) img.rotate(-edits.rotate);
    // 2. crop (relative coords on the post-rotate frame)
    if (edits.crop) {
      const W = img.bitmap.width, H = img.bitmap.height;
      const x = Math.max(0, Math.round(edits.crop.x * W));
      const y = Math.max(0, Math.round(edits.crop.y * H));
      const w = Math.min(W - x, Math.max(8, Math.round(edits.crop.w * W)));
      const h = Math.min(H - y, Math.max(8, Math.round(edits.crop.h * H)));
      img.crop(x, y, w, h);
    }
    // 3. tone
    if (edits.bw) img.greyscale();
    if (edits.exposure) img.brightness(Math.max(-1, Math.min(1, edits.exposure * 0.6)));
    if (edits.contrast) img.contrast(Math.max(-1, Math.min(1, edits.contrast * 0.6)));
    const colorOps = [];
    if (edits.temperature && !edits.bw) {
      const t = Math.round(edits.temperature * 28);
      colorOps.push({ apply: 'red', params: [t] }, { apply: 'blue', params: [-t] });
    }
    if (edits.tint && !edits.bw) {
      // +tint → magenta, −tint → green
      colorOps.push({ apply: 'green', params: [Math.round(-edits.tint * 26)] });
    }
    if (edits.saturation && !edits.bw) {
      colorOps.push(edits.saturation >= 0
        ? { apply: 'saturate', params: [Math.round(edits.saturation * 40)] }
        : { apply: 'desaturate', params: [Math.round(-edits.saturation * 40)] });
    }
    if (colorOps.length) img.color(colorOps);

    // 4. film finish: fade (lifted blacks), vignette, grain — single pixel pass
    const fade = Math.max(0, Math.min(1, edits.fade || 0));
    const vig = Math.max(0, Math.min(1, edits.vignette || 0));
    const grain = Math.max(0, Math.min(1, edits.grain || 0));
    if (fade || vig || grain) {
      const { width: W2, height: H2, data } = img.bitmap;
      const cx = W2 / 2, cy = H2 / 2;
      const maxD2 = cx * cx + cy * cy;
      for (let y = 0; y < H2; y++) {
        for (let x = 0; x < W2; x++) {
          const i = (y * W2 + x) * 4;
          let vMul = 1;
          if (vig) {
            const dx = x - cx, dy = y - cy;
            vMul = 1 - vig * 0.8 * Math.pow((dx * dx + dy * dy) / maxD2, 1.25);
          }
          const n = grain ? (Math.random() - 0.5) * grain * 34 : 0;
          for (let c = 0; c < 3; c++) {
            let v = data[i + c];
            if (fade) v = v + (118 - v) * 0.32 * fade * (v < 118 ? 1 : 0.25); // lift shadows, gently milk highlights
            v = v * vMul + n;
            data[i + c] = v < 0 ? 0 : v > 255 ? 255 : v;
          }
        }
      }
    }

    const rev = edits.rev || 1;
    const editsDir = path.join(uploadsDir, 'media', 'edits');
    try { fs.mkdirSync(editsDir, { recursive: true }); } catch {}
    const fullRel = `media/edits/${asset.id}-r${rev}-full.jpg`;
    const webRel = `media/edits/${asset.id}-r${rev}-web.jpg`;
    const thumbRel = `media/edits/${asset.id}-r${rev}-thumb.jpg`;
    await img.clone().quality(88).writeAsync(path.join(uploadsDir, fullRel));
    await img.clone().resize(Math.min(2048, img.bitmap.width), Jimp.AUTO).quality(82).writeAsync(path.join(uploadsDir, webRel));
    await img.clone().resize(400, Jimp.AUTO).quality(72).writeAsync(path.join(uploadsDir, thumbRel));

    const variants = {
      original: publicUrl(asset.storage_key),
      full_edit: publicUrl(fullRel),
      web: publicUrl(webRel),
      thumb: publicUrl(thumbRel),
      edited: true,
    };
    db.prepare('UPDATE ms_assets SET variants = ?, width = ?, height = ? WHERE id = ?')
      .run(JSON.stringify(variants), img.bitmap.width, img.bitmap.height, asset.id);

    // clean older revisions so disk doesn't accumulate stale renders
    try {
      fs.readdirSync(editsDir).forEach(f => {
        if (f.startsWith(`${asset.id}-r`) && !f.includes(`-r${rev}-`)) fs.unlinkSync(path.join(editsDir, f));
      });
    } catch {}

    if (asset.workspace_id) broadcastToWorkspace(asset.workspace_id, 'ms_asset_processed', { asset_id: asset.id, project_id: asset.project_id });
    return { note: 'ok', rev };
  }

  // ── watermark (burned-in, tiled, semi-transparent) ──────────────────────────
  let _wmFont = null;
  async function watermarkBuffer(absPath, text) {
    const img = await Jimp.read(absPath);
    if (!_wmFont) _wmFont = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const W = img.bitmap.width, H = img.bitmap.height;
    const layer = new Jimp(W, H, 0x00000000);
    const stepX = Math.max(240, Math.floor(W / 3));
    const stepY = Math.max(140, Math.floor(H / 5));
    let r = 0;
    for (let y = 0; y < H; y += stepY) {
      const offset = (r % 2) ? Math.floor(stepX / 2) : 0;
      for (let x = -stepX; x < W; x += stepX) layer.print(_wmFont, x + offset, y, text);
      r++;
    }
    img.composite(layer, 0, 0, { mode: Jimp.BLEND_SOURCE_OVER, opacitySource: 0.28 });
    return img.quality(82).getBufferAsync(Jimp.MIME_JPEG);
  }

  // ── zip export: bundle a gallery into a ZIP (web=watermarked, original=clean) ─
  async function processZipExport(job) {
    const payload = (() => { try { return JSON.parse(job.payload || '{}'); } catch { return {}; } })();
    const exp = db.prepare('SELECT * FROM ms_exports WHERE id = ?').get(payload.export_id);
    if (!exp) return { note: 'export-gone' };
    try {
      if (!AdmZip) throw new Error('zip library not installed');
      const variant = exp.variant === 'original' ? 'original' : 'web';
      const wmText = (variant === 'web' && payload.watermark) ? String(payload.watermark) : null;
      const assets = db.prepare(`
        SELECT a.* FROM ms_gallery_assets ga JOIN ms_assets a ON a.id = ga.asset_id
        WHERE ga.gallery_id = ? AND ga.is_hidden = 0 ORDER BY ga.sort_order
      `).all(exp.gallery_id);

      const zip = new AdmZip();
      const exportsDir = path.join(uploadsDir, 'media', 'exports');
      try { fs.mkdirSync(exportsDir, { recursive: true }); } catch {}
      let count = 0;
      for (const a of assets) {
        let variants = {}; try { variants = JSON.parse(a.variants || '{}'); } catch {}
        // edited assets deliver their edited render; originals stay untouched on disk
        const fullKey = variants.full_edit ? variants.full_edit.replace(/^\/?uploads\//, '') : a.storage_key;
        const rel = (variant === 'original' || !variants.web)
          ? fullKey
          : variants.web.replace(/^\/?uploads\//, '');
        const abs = path.join(uploadsDir, rel);
        if (!fs.existsSync(abs)) continue;
        let buf;
        if (wmText && Jimp) { try { buf = await watermarkBuffer(abs, wmText); } catch { buf = fs.readFileSync(abs); } }
        else buf = fs.readFileSync(abs);
        const safe = `${String(count + 1).padStart(3, '0')}-${(a.filename || a.id).replace(/[^\w.\-]/g, '_')}`;
        zip.addFile(safe, buf);
        count++;
      }

      const outRel = `media/exports/${exp.id}.zip`;
      zip.writeZip(path.join(uploadsDir, outRel));
      const size = fs.statSync(path.join(uploadsDir, outRel)).size;
      db.prepare(`UPDATE ms_exports SET status = 'ready', storage_key = ?, size_bytes = ?, file_count = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(outRel, size, count, exp.id);
      if (exp.workspace_id) broadcastToWorkspace(exp.workspace_id, 'ms_export_ready', { export_id: exp.id, gallery_id: exp.gallery_id });
      return { note: 'ok', files: count, size };
    } catch (e) {
      db.prepare("UPDATE ms_exports SET status = 'failed', error_message = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(e.message, exp.id);
      return { note: 'export-failed: ' + e.message };
    }
  }

  // ── album PDF export (manual layout → print-ready PDF) ───────────────────────
  function layoutRects(template, b, g) {
    const { x, y, w, h } = b;
    switch (template) {
      case 'two-h': { const cw = (w - g) / 2; return [{ x, y, w: cw, h }, { x: x + cw + g, y, w: cw, h }]; }
      case 'two-v': { const ch = (h - g) / 2; return [{ x, y, w, h: ch }, { x, y: y + ch + g, w, h: ch }]; }
      case 'three': { const cw = (w - 2 * g) / 3; return [0, 1, 2].map(i => ({ x: x + i * (cw + g), y, w: cw, h })); }
      case 'grid4': { const cw = (w - g) / 2, ch = (h - g) / 2; return [
        { x, y, w: cw, h: ch }, { x: x + cw + g, y, w: cw, h: ch },
        { x, y: y + ch + g, w: cw, h: ch }, { x: x + cw + g, y: y + ch + g, w: cw, h: ch }]; }
      default: return [{ x, y, w, h }];
    }
  }

  async function processPdfExport(job) {
    const payload = (() => { try { return JSON.parse(job.payload || '{}'); } catch { return {}; } })();
    const album = db.prepare('SELECT * FROM ms_albums WHERE id = ?').get(payload.album_id);
    if (!album) return { note: 'album-gone' };
    try {
      if (!PDFDocument) throw new Error('pdf library not installed');
      let spec = {}; try { spec = JSON.parse(album.spec || '{}'); } catch {}
      const MM = 2.834645669; // mm → pt
      const W = (spec.w_mm || 300) * MM, H = (spec.h_mm || 300) * MM, margin = (spec.margin_mm ?? 12) * MM, gutter = 6;
      const pages = db.prepare('SELECT * FROM ms_album_pages WHERE album_id = ? ORDER BY page_no, created_at').all(album.id);

      const exportsDir = path.join(uploadsDir, 'media', 'exports');
      try { fs.mkdirSync(exportsDir, { recursive: true }); } catch {}
      const outRel = `media/exports/album-${album.id}.pdf`;
      const outAbs = path.join(uploadsDir, outRel);

      const doc = new PDFDocument({ size: [W, H], margin: 0, autoFirstPage: false });
      const stream = fs.createWriteStream(outAbs);
      doc.pipe(stream);
      for (const p of pages) {
        doc.addPage({ size: [W, H], margin: 0 });
        let slots = []; try { slots = JSON.parse(p.slots || '[]'); } catch {}
        const rects = layoutRects(p.layout_template, { x: margin, y: margin, w: W - margin * 2, h: H - margin * 2 }, gutter);
        rects.forEach((r, i) => {
          const slot = slots[i];
          if (!slot || !slot.asset_id) { doc.save().rect(r.x, r.y, r.w, r.h).fill('#eef0f3').restore(); return; }
          const asset = db.prepare('SELECT storage_key, variants FROM ms_assets WHERE id = ?').get(slot.asset_id);
          if (!asset) return;
          let av = {}; try { av = JSON.parse(asset.variants || '{}'); } catch {}
          const key = av.full_edit ? av.full_edit.replace(/^\/?uploads\//, '') : asset.storage_key;
          const abs = path.join(uploadsDir, key);
          if (!fs.existsSync(abs)) return;
          try { doc.image(abs, r.x, r.y, { cover: [r.w, r.h], align: 'center', valign: 'center' }); }
          catch { try { doc.image(abs, r.x, r.y, { fit: [r.w, r.h], align: 'center', valign: 'center' }); } catch {} }
        });
      }
      doc.end();
      await new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); });

      const size = fs.statSync(outAbs).size;
      db.prepare("UPDATE ms_albums SET pdf_status = 'ready', pdf_storage_key = ?, pdf_size = ?, pdf_pages = ?, pdf_built_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(outRel, size, pages.length, album.id);
      if (album.workspace_id) broadcastToWorkspace(album.workspace_id, 'ms_album_pdf_ready', { album_id: album.id });
      return { note: 'ok', pages: pages.length, size };
    } catch (e) {
      db.prepare("UPDATE ms_albums SET pdf_status = 'failed' WHERE id = ?").run(album.id);
      return { note: 'pdf-failed: ' + e.message };
    }
  }

  // ── VIDEO STUDIO (ffmpeg) ────────────────────────────────────────────────────
  // All video work is gated on detectFfmpeg(): without the binary, jobs degrade
  // gracefully (probe → no metadata, export → 'failed' with a clear message) and
  // NEVER crash the host. On the VPS where ffmpeg is installed, they run for real.
  function enqueue(type, { asset_id = null, project_id = null, workspace_id = null, payload = {} }) {
    db.prepare("INSERT INTO ms_jobs (id, workspace_id, type, asset_id, project_id, status, payload) VALUES (?, ?, ?, ?, ?, 'pending', ?)")
      .run(generateId(), workspace_id, type, asset_id, project_id, JSON.stringify(payload));
  }
  function resolveAssetPath(assetId) {
    const a = db.prepare('SELECT * FROM ms_assets WHERE id = ?').get(assetId);
    if (!a) return null;
    let variants = {}; try { variants = JSON.parse(a.variants || '{}'); } catch {}
    let rel;
    if ((a.type === 'video') || (a.mime || '').startsWith('video/')) rel = a.storage_key;
    else rel = (variants.full_edit || variants.web || '').replace(/^\/?uploads\//, '') || a.storage_key;
    const abs = path.join(uploadsDir, rel);
    return fs.existsSync(abs) ? abs : null;
  }
  function runFfmpeg(args, { onProgress, totalMs } = {}) {
    return new Promise((resolve, reject) => {
      const p = spawn(FFMPEG, args, { windowsHide: true });
      let err = '';
      p.stderr.on('data', d => { err += d.toString(); if (err.length > 16000) err = err.slice(-16000); });
      if (onProgress && totalMs) {
        p.stdout.on('data', d => {
          const m = /out_time_ms=(\d+)/.exec(d.toString());
          if (m) onProgress(Math.max(0, Math.min(99, Math.round((Number(m[1]) / 1000 / totalMs) * 100))));
        });
      }
      p.on('error', reject);
      p.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exited ' + code + (err ? ': ' + err.slice(-400) : ''))));
    });
  }

  async function processVideoProbe(job) {
    const asset = db.prepare('SELECT * FROM ms_assets WHERE id = ?').get(job.asset_id);
    if (!asset) return { note: 'asset-gone' };
    if (!videoEngine.detectFfmpeg().ffprobe) return { note: 'no-ffprobe' };
    const abs = path.join(uploadsDir, asset.storage_key);
    if (!fs.existsSync(abs)) return { note: 'file-missing' };
    const out = await new Promise((resolve) => {
      const p = spawn(FFPROBE, ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', abs], { windowsHide: true });
      let buf = ''; p.stdout.on('data', d => buf += d.toString());
      p.on('error', () => resolve('')); p.on('close', () => resolve(buf));
    });
    const meta = videoEngine.parseFfprobe(out);
    db.prepare(`UPDATE ms_assets SET v_duration_ms=?, v_width=?, v_height=?, v_fps=?, v_codec=?, v_has_audio=? WHERE id=?`)
      .run(meta.v_duration_ms || 0, meta.v_width || 0, meta.v_height || 0, meta.v_fps || 0, meta.v_codec || null, meta.v_has_audio || 0, asset.id);
    // only video gets a poster + proxy; audio-only stops at the duration probe
    if ((meta.v_width || 0) > 0) {
      enqueue('video_poster', { asset_id: asset.id, project_id: asset.project_id, workspace_id: asset.workspace_id });
      enqueue('video_proxy', { asset_id: asset.id, project_id: asset.project_id, workspace_id: asset.workspace_id });
    }
    return { note: 'ok', meta };
  }

  async function processVideoPoster(job) {
    const asset = db.prepare('SELECT * FROM ms_assets WHERE id = ?').get(job.asset_id);
    if (!asset || !videoEngine.detectFfmpeg().ffmpeg) return { note: 'skip' };
    const abs = path.join(uploadsDir, asset.storage_key);
    if (!fs.existsSync(abs)) return { note: 'file-missing' };
    const rel = `media/variants/${asset.id}-poster.jpg`;
    const at = Math.max(0, ((asset.v_duration_ms || 2000) / 1000) * 0.25).toFixed(2);
    await runFfmpeg(['-y', '-ss', at, '-i', abs, '-frames:v', '1', '-vf', 'scale=640:-2', path.join(uploadsDir, rel)]);
    db.prepare('UPDATE ms_assets SET poster_url = ? WHERE id = ?').run(publicUrl(rel), asset.id);
    if (asset.workspace_id) broadcastToWorkspace(asset.workspace_id, 'ms_asset_processed', { asset_id: asset.id, project_id: asset.project_id });
    return { note: 'ok' };
  }

  async function processVideoProxy(job) {
    const asset = db.prepare('SELECT * FROM ms_assets WHERE id = ?').get(job.asset_id);
    if (!asset || !videoEngine.detectFfmpeg().ffmpeg) return { note: 'skip' };
    const abs = path.join(uploadsDir, asset.storage_key);
    if (!fs.existsSync(abs)) return { note: 'file-missing' };
    const rel = `media/variants/${asset.id}-proxy.mp4`;
    // 720p H.264 proxy for smooth browser scrubbing — keep audio for preview
    await runFfmpeg(['-y', '-i', abs, '-vf', 'scale=-2:720', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
      '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', path.join(uploadsDir, rel)]);
    db.prepare('UPDATE ms_assets SET proxy_url = ? WHERE id = ?').run(publicUrl(rel), asset.id);
    if (asset.workspace_id) broadcastToWorkspace(asset.workspace_id, 'ms_asset_processed', { asset_id: asset.id, project_id: asset.project_id });
    return { note: 'ok' };
  }

  async function processVideoExport(job) {
    const payload = (() => { try { return JSON.parse(job.payload || '{}'); } catch { return {}; } })();
    const exp = db.prepare('SELECT * FROM ms_video_exports WHERE id = ?').get(payload.export_id);
    if (!exp) return { note: 'export-gone' };
    const fail = (msg) => {
      db.prepare("UPDATE ms_video_exports SET status='failed', error_message=?, finished_at=CURRENT_TIMESTAMP WHERE id=?").run(msg, exp.id);
      if (exp.workspace_id) broadcastToWorkspace(exp.workspace_id, 'ms_video_export', { export_id: exp.id, status: 'failed' });
      return { note: 'export-failed: ' + msg };
    };
    try {
      if (!videoEngine.detectFfmpeg().ffmpeg) return fail('FFmpeg is not installed on the server. Run: apt install ffmpeg');
      const t = db.prepare('SELECT * FROM ms_timelines WHERE id = ?').get(exp.timeline_id);
      if (!t) return fail('timeline gone');
      let document = {}; try { document = JSON.parse(t.document || '{}'); } catch {}
      // ensure the built-in LUT .cube files exist on disk, then resolve id → path
      const lutMap = videoLuts.ensureCubeFiles(fs, path, path.join(uploadsDir, 'media', 'luts'));
      const customLuts = {};
      try {
        for (const row of db.prepare('SELECT id, cube_path FROM ms_luts WHERE workspace_id = ?').all(exp.workspace_id)) {
          const abs = row.cube_path ? path.join(uploadsDir, row.cube_path) : null;
          if (abs && fs.existsSync(abs)) customLuts[row.id] = abs;
        }
      } catch {}
      const fonts = videoEngine.detectFonts();
      const built = videoEngine.buildExportCommand(
        document, { width: exp.width, height: exp.height, fps: exp.fps },
        resolveAssetPath,
        (id) => lutMap[id] || customLuts[id] || null,
        (fam) => fonts[fam] || fonts.sans || null,
      );
      if (!built.args) return fail(built.note === 'empty-timeline' ? 'Add at least one clip before exporting.' : built.note);

      const exportsDir = path.join(uploadsDir, 'media', 'exports');
      try { fs.mkdirSync(exportsDir, { recursive: true }); } catch {}
      const outRel = `media/exports/${exp.id}.mp4`;
      const outAbs = path.join(uploadsDir, outRel);

      db.prepare("UPDATE ms_video_exports SET status='rendering', progress=1 WHERE id=?").run(exp.id);
      if (exp.workspace_id) broadcastToWorkspace(exp.workspace_id, 'ms_video_export', { export_id: exp.id, status: 'rendering', progress: 1 });

      const args = ['-progress', 'pipe:1', '-nostats', ...built.args, outAbs];
      await runFfmpeg(args, {
        totalMs: t.duration_ms || 1,
        onProgress: (pct) => {
          db.prepare("UPDATE ms_video_exports SET progress=? WHERE id=?").run(pct, exp.id);
          if (exp.workspace_id) broadcastToWorkspace(exp.workspace_id, 'ms_video_export', { export_id: exp.id, status: 'rendering', progress: pct });
        },
      });

      const size = fs.existsSync(outAbs) ? fs.statSync(outAbs).size : 0;
      db.prepare("UPDATE ms_video_exports SET status='done', progress=100, storage_key=?, size_bytes=?, finished_at=CURRENT_TIMESTAMP WHERE id=?")
        .run(outRel, size, exp.id);
      if (exp.workspace_id) broadcastToWorkspace(exp.workspace_id, 'ms_video_export', { export_id: exp.id, status: 'done', progress: 100, url: publicUrl(outRel) });
      return { note: 'ok', size, segments: built.segments };
    } catch (e) { return fail(e.message); }
  }

  // ── job runner (claim → run → done/retry) ───────────────────────────────────
  function claim(jobId) {
    // atomic: only one worker's conditional UPDATE can win. Sets a 10-min lease so
    // a crashed worker's job is reclaimable by the reaper.
    const r = db.prepare("UPDATE ms_jobs SET status = 'running', lease_until = datetime('now','+10 minutes') WHERE id = ? AND status = 'pending'").run(jobId);
    return r.changes === 1;
  }
  // Reaper — return jobs orphaned by a crashed/hung worker back to the queue.
  function reapStale() {
    try { db.prepare("UPDATE ms_jobs SET status = 'pending' WHERE status = 'running' AND lease_until IS NOT NULL AND lease_until < datetime('now')").run(); } catch {}
  }

  async function runJob(job) {
    try {
      let result = {};
      if (job.type === 'ingest') result = await processIngest(job);
      else if (job.type === 'zip_export') result = await processZipExport(job);
      else if (job.type === 'pdf_export') result = await processPdfExport(job);
      else if (job.type === 'render_edits') result = await processRenderEdits(job);
      else if (job.type === 'video_probe') result = await processVideoProbe(job);
      else if (job.type === 'video_poster') result = await processVideoPoster(job);
      else if (job.type === 'video_proxy') result = await processVideoProxy(job);
      else if (job.type === 'video_export') result = await processVideoExport(job);
      // (future: ai_reel_draft | score)
      db.prepare("UPDATE ms_jobs SET status = 'done', progress = 100, finished_at = CURRENT_TIMESTAMP, error_message = ? WHERE id = ?")
        .run(result.note || null, job.id);
      if (job.workspace_id) broadcastToWorkspace(job.workspace_id, 'ms_asset_processed', { asset_id: job.asset_id, project_id: job.project_id });
      return result;
    } catch (e) {
      const retry = (job.retry_count || 0) + 1;
      if (retry >= MAX_RETRIES) {
        db.prepare("UPDATE ms_jobs SET status = 'failed', retry_count = ?, error_message = ? WHERE id = ?").run(retry, e.message, job.id);
        try { db.prepare("UPDATE ms_assets SET status = 'failed' WHERE id = ?").run(job.asset_id); } catch {}
      } else {
        db.prepare("UPDATE ms_jobs SET status = 'pending', retry_count = ?, error_message = ?, next_retry_at = datetime('now', ?) WHERE id = ?")
          .run(retry, e.message, `+${retry * 30} seconds`, job.id);
      }
      return { error: e.message };
    }
  }

  /** Drain up to `batch` due jobs once. Returns the number processed. Used by the timer AND tests. */
  async function processOnce(batch = 10) {
    reapStale();
    const due = db.prepare(`
      SELECT * FROM ms_jobs
      WHERE status = 'pending' AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
      ORDER BY created_at LIMIT ?
    `).all(batch);
    let done = 0;
    for (const job of due) {
      if (!claim(job.id)) continue;           // someone else grabbed it
      await runJob({ ...job, status: 'running' });
      done++;
    }
    return done;
  }

  let timer = null, busy = false;
  function start(intervalMs = 5000) {
    if (timer) return;
    if (!Jimp) console.warn('⚠️  Media worker: jimp not installed — ingest will run in degraded (no-preview) mode.');
    timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try { await processOnce(); } catch (e) { console.error('Media worker error:', e.message); }
      finally { busy = false; }
    }, intervalMs);
    if (timer.unref) timer.unref();           // don't keep the process alive on its own
    console.log('🛠️  Media Studio worker started (drains ms_jobs)');
  }
  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  return { processOnce, start, stop, get hasImageLib() { return !!Jimp; }, get hasFfmpeg() { return videoEngine.detectFfmpeg().ffmpeg; } };
};
