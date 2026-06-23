'use strict';

// ── Local-disk storage provider ──────────────────────────────────────────────
// The default + permanent fallback. Files live under uploadsDir and are served by
// the existing /uploads static route. Never removed — R2 is purely additive.

module.exports = function localProvider({ uploadsDir, path = require('path'), fs = require('fs') } = {}) {
  const root = uploadsDir || path.join(process.cwd(), 'uploads');
  const abs = (key) => path.join(root, String(key));

  return {
    name: 'local',

    async uploadFile(key, buffer, contentType) {
      const p = abs(key);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, buffer);
      return { key, size: buffer.length, provider: 'local', content_type: contentType || null };
    },

    async getBuffer(key) { return fs.readFileSync(abs(key)); },

    async deleteFile(key) { try { fs.unlinkSync(abs(key)); } catch { /* already gone */ } },

    // The single source of truth for a local object's URL — served by /uploads static.
    getPublicUrl(key) { return '/' + ['uploads', String(key)].join('/').replace(/\/+/g, '/'); },

    async fileExists(key) { try { return fs.existsSync(abs(key)); } catch { return false; } },

    // Local has no presigned PUT — the desktop/web uploads via the API multipart route.
    async generateSignedUploadUrl() { return null; },

    async generateSignedDownloadUrl(key) { return this.getPublicUrl(key); },

    localPath(key) { return abs(key); },
  };
};
