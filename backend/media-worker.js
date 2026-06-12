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

  const MAX_RETRIES = 3;
  const PHASH_DUP_DISTANCE = 6; // ≤6 bits different on a 64-bit aHash ≈ near-duplicate

  // ── small helpers ──────────────────────────────────────────────────────────
  function publicUrl(relUnderUploads) {
    return '/' + ['uploads', relUnderUploads].join('/').replace(/\/+/g, '/');
  }
  function isProcessableImage(mime = '', filename = '') {
    const ext = (filename.split('.').pop() || '').toLowerCase();
    const raw = ['cr2', 'cr3', 'nef', 'arw', 'raf', 'rw2', 'dng', 'orf', 'srw', 'pef'];
    if (raw.includes(ext)) return false;            // RAW → no JS preview
    return mime.startsWith('image/');
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

    if (!Jimp || !isProcessableImage(asset.mime, asset.filename) || !fs.existsSync(absPath)) {
      // RAW/video/missing-lib → keep original as-is, no preview/scores.
      db.prepare("UPDATE ms_assets SET status = 'ready' WHERE id = ?").run(asset.id);
      return { note: Jimp ? 'no-preview' : 'degraded-no-jimp' };
    }

    const image = await Jimp.read(absPath);
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

    return { note: 'ok', variants, scores: { ...cv }, group: groupKey };
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
        const rel = (variant === 'original' || !variants.web)
          ? a.storage_key
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
          const asset = db.prepare('SELECT storage_key FROM ms_assets WHERE id = ?').get(slot.asset_id);
          if (!asset) return;
          const abs = path.join(uploadsDir, asset.storage_key);
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

  // ── job runner (claim → run → done/retry) ───────────────────────────────────
  function claim(jobId) {
    const r = db.prepare("UPDATE ms_jobs SET status = 'running' WHERE id = ? AND status = 'pending'").run(jobId);
    return r.changes === 1;
  }

  async function runJob(job) {
    try {
      let result = {};
      if (job.type === 'ingest') result = await processIngest(job);
      else if (job.type === 'zip_export') result = await processZipExport(job);
      else if (job.type === 'pdf_export') result = await processPdfExport(job);
      // (future: transcode | score)
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

  return { processOnce, start, stop, get hasImageLib() { return !!Jimp; } };
};
