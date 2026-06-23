'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  STORAGE ABSTRACTION  (Final Vision · Phase 10)
//  One provider-agnostic interface over Local disk and Cloudflare R2. Business
//  logic NEVER touches /uploads or a provider directly — it calls these methods +
//  getPublicUrl() only. Selected via STORAGE_PROVIDER=local|r2 (default local).
//
//  Methods: uploadFile · deleteFile · getPublicUrl · fileExists ·
//           generateSignedUploadUrl · generateSignedDownloadUrl · getBuffer.
//  Backward-compatible: local stays the default + fallback; R2 is purely additive
//  (per-asset storage_provider — existing local files keep working untouched).
// ════════════════════════════════════════════════════════════════════════════

const PROVIDER = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();

module.exports = function createStorage({ uploadsDir, path = require('path'), fs = require('fs') } = {}) {
  let active;
  if (PROVIDER === 'r2') {
    active = require('./providers/r2')();
    if (!active) {
      console.warn('⚠️  STORAGE_PROVIDER=r2 but R2 SDK/config missing — falling back to local disk.');
      active = require('./providers/local')({ uploadsDir, path, fs });
    } else {
      console.log('🗄️  Storage provider: Cloudflare R2');
    }
  } else {
    active = require('./providers/local')({ uploadsDir, path, fs });
  }

  return {
    provider: active.name,                 // 'local' | 'r2' — the active default
    isRemote: active.name === 'r2',

    // ── canonical API (spec) ──
    uploadFile: (key, buf, ct) => active.uploadFile(key, buf, ct),
    deleteFile: (key) => active.deleteFile(key),
    getPublicUrl: (key) => active.getPublicUrl(key),
    publicUrl: (key) => active.getPublicUrl(key),               // alias — THE single URL impl
    fileExists: (key) => active.fileExists(key),
    generateSignedUploadUrl: (key, ct, exp) => active.generateSignedUploadUrl(key, ct, exp),
    generateSignedDownloadUrl: (key, exp) => active.generateSignedDownloadUrl(key, exp),
    getBuffer: (key) => active.getBuffer(key),
    localPath: (key) => active.localPath(key),

    // ── back-compat aliases (export-ZIP code wired earlier) ──
    putBuffer: (key, buf, ct) => active.uploadFile(key, buf, ct),
    presignGet: (key) => active.generateSignedDownloadUrl(key),
    remove: (key) => active.deleteFile(key),
  };
};

// Provider-agnostic file route: getPublicUrl() points private-R2 objects here, and
// this 302-redirects to a short-lived presigned URL (or serves the local file). So a
// private bucket needs no public CDN, and the same URL works whatever the provider.
module.exports.mountRoutes = function mountStorageRoutes(app, storage) {
  const fs = require('fs');
  app.get('/api/storage/file/:key', async (req, res) => {
    try {
      const key = decodeURIComponent(req.params.key);
      if (storage.isRemote) {
        const url = await storage.generateSignedDownloadUrl(key);
        if (url) return res.redirect(302, url);
      }
      const lp = storage.localPath(key);
      if (lp && fs.existsSync(lp)) return res.sendFile(lp);
      return res.status(404).json({ error: 'Not found' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
};
