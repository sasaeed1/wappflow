'use strict';

// Watch-folder ingestion (Phase 10): point the desktop at a folder; new photos/videos
// dropped in by a camera card / Lightroom export auto-upload to a chosen project.
// Dependency-free (fs.watch). Debounced so a file is uploaded once it stops growing.

const fs = require('fs');
const path = require('path');
const uploader = require('./uploader');

const MEDIA_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'tif', 'tiff',
  'mp4', 'mov', 'm4v', 'webm', 'cr2', 'cr3', 'nef', 'arw', 'raf', 'rw2', 'dng', 'orf', 'srw', 'pef']);
const isMedia = (f) => MEDIA_EXT.has((String(f).split('.').pop() || '').toLowerCase());

let watcher = null;
let cfg = null;            // { folder, projectId }
let emit = () => {};
const pending = new Map(); // fullPath → debounce timer
const seen = new Set();    // already-uploaded this session

async function onSettled(full, projectId) {
  pending.delete(full);
  try {
    if (!fs.existsSync(full) || seen.has(full)) return;
    seen.add(full);
    emit({ type: 'ingesting', file: path.basename(full) });
    const r = await uploader.uploadFile(projectId, full);
    emit({ type: 'ingested', file: path.basename(full), via: r.via, asset: r.asset });
  } catch (e) { emit({ type: 'error', file: path.basename(full), error: e.message }); }
}

function start(config, onEvent) {
  stop();
  emit = onEvent || (() => {});
  if (!config || !config.folder || !config.projectId) return { ok: false, error: 'folder + projectId required' };
  if (!fs.existsSync(config.folder)) return { ok: false, error: 'folder not found' };
  cfg = { folder: config.folder, projectId: config.projectId };
  try {
    // recursive watch on win/mac; linux falls back to top-level only
    watcher = fs.watch(cfg.folder, { recursive: process.platform !== 'linux' }, (_evt, file) => {
      if (!file || !isMedia(file)) return;
      const full = path.join(cfg.folder, file);
      if (pending.has(full)) clearTimeout(pending.get(full));
      pending.set(full, setTimeout(() => onSettled(full, cfg.projectId), 1500)); // settle 1.5s
    });
    emit({ type: 'watching', folder: cfg.folder, project_id: cfg.projectId });
    return { ok: true, folder: cfg.folder, project_id: cfg.projectId };
  } catch (e) { return { ok: false, error: e.message }; }
}

function stop() {
  try { watcher && watcher.close(); } catch {}
  watcher = null;
  for (const t of pending.values()) clearTimeout(t);
  pending.clear();
  return { ok: true };
}

const status = () => ({ watching: !!watcher, folder: cfg && cfg.folder, project_id: cfg && cfg.projectId });

module.exports = { start, stop, status, isMedia };
