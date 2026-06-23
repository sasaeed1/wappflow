'use strict';

// Native uploads (Phase 10): push local files straight to the workspace's storage.
// On R2 it asks the API for a presigned PUT and uploads direct-to-bucket (the server
// never proxies the bytes), then registers the asset. On a local-storage workspace it
// falls back to the multipart /assets route. Dependency-free multipart (no form-data).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const auth = require('./auth');

const apiBase = () => auth.getServer().api.replace(/\/$/, '');

const TYPE_MAP = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
  cr2: 'image/x-canon-cr2', cr3: 'image/x-canon-cr3', nef: 'image/x-nikon-nef',
  arw: 'image/x-sony-arw', raf: 'image/x-fuji-raf', rw2: 'image/x-panasonic-rw2',
  dng: 'image/x-adobe-dng', orf: 'image/x-olympus-orf', srw: 'image/x-samsung-srw', pef: 'image/x-pentax-pef',
};
const guessType = (name) => TYPE_MAP[(name.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';

// Build a multipart/form-data body by hand (Buffer) so we don't need form-data.
function buildMultipart(fields, file) {
  const boundary = '----wappflow' + crypto.randomBytes(12).toString('hex');
  const parts = [];
  for (const [k, v] of Object.entries(fields || {})) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.filename}"\r\nContent-Type: ${file.content_type}\r\n\r\n`));
  parts.push(file.buffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { boundary, body: Buffer.concat(parts) };
}

async function uploadFile(projectId, filePath) {
  if (!auth.getSession()) throw new Error('not signed in');
  if (!projectId) throw new Error('projectId required');
  const filename = path.basename(filePath);
  const stat = fs.statSync(filePath);
  const content_type = guessType(filename);
  const headers = auth.authHeader();

  // 1) ask for a signed URL (also enforces the storage quota gate server-side)
  const sign = await axios.post(`${apiBase()}/media/projects/${projectId}/uploads/sign`,
    { filename, content_type, size: stat.size }, { headers, timeout: 20000 });
  const { provider, key, upload_url } = sign.data || {};

  if (provider === 'r2' && upload_url) {
    // 2) PUT bytes straight to the bucket — the API is never the bottleneck.
    const body = fs.readFileSync(filePath);
    await axios.put(upload_url, body, { headers: { 'Content-Type': content_type }, maxBodyLength: Infinity, maxContentLength: Infinity, timeout: 600000 });
    // 3) register the asset + enqueue ingest
    const done = await axios.post(`${apiBase()}/media/projects/${projectId}/uploads/complete`,
      { key, filename, content_type, size: stat.size }, { headers, timeout: 20000 });
    return { ok: true, via: 'r2', asset: done.data && done.data.asset };
  }

  // local-storage workspace → multipart through the API
  const { boundary, body } = buildMultipart({}, { filename, content_type, buffer: fs.readFileSync(filePath) });
  const res = await axios.post(`${apiBase()}/media/projects/${projectId}/assets`, body, {
    headers: Object.assign({}, headers, { 'Content-Type': `multipart/form-data; boundary=${boundary}` }),
    maxBodyLength: Infinity, maxContentLength: Infinity, timeout: 600000,
  });
  return { ok: true, via: 'multipart', asset: (res.data && res.data.assets && res.data.assets[0]) || null };
}

// Upload many; returns per-file results (never throws for one bad file).
async function uploadFiles(projectId, filePaths, onProgress) {
  const results = [];
  for (let i = 0; i < filePaths.length; i++) {
    try { const r = await uploadFile(projectId, filePaths[i]); results.push(r); if (onProgress) onProgress({ done: i + 1, total: filePaths.length, file: path.basename(filePaths[i]), ok: true }); }
    catch (e) { results.push({ ok: false, error: e.message, file: filePaths[i] }); if (onProgress) onProgress({ done: i + 1, total: filePaths.length, file: path.basename(filePaths[i]), ok: false, error: e.message }); }
  }
  return results;
}

module.exports = { uploadFile, uploadFiles, guessType, buildMultipart };
