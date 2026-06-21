'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  STORAGE ADAPTER  (Final Vision · Phase 10 — R2 object-storage migration)
//  One interface, two backends: local disk (today) and Cloudflare R2 (S3-compatible).
//  R2 activates ONLY when @aws-sdk/client-s3 is installed AND the R2_* env is set —
//  otherwise it transparently falls back to local disk, so nothing breaks before
//  the migration. Drop-in for the Media Studio STORAGE SEAM (galleries/ZIPs/PDFs/
//  variants); wiring it into media-studio's seam + provisioning R2 are the tracked
//  migration steps.
//
//  Activate: `npm i @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` and set
//  R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (+ optional
//  R2_PUBLIC_BASE for a public bucket/CDN).
// ════════════════════════════════════════════════════════════════════════════

let S3 = null, presigner = null;
try { S3 = require('@aws-sdk/client-s3'); presigner = require('@aws-sdk/s3-request-presigner'); } catch { /* optional — local fallback */ }

const R2 = {
  endpoint: process.env.R2_ENDPOINT || '',
  bucket: process.env.R2_BUCKET || '',
  accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  publicBase: process.env.R2_PUBLIC_BASE || '',
};
function r2Configured() { return !!(S3 && presigner && R2.endpoint && R2.bucket && R2.accessKeyId && R2.secretAccessKey); }

module.exports = function createStorage(opts = {}) {
  const path = opts.path || require('path');
  const fs = opts.fs || require('fs');
  const uploadsDir = opts.uploadsDir || path.join(process.cwd(), 'uploads');
  const backend = r2Configured() ? 'r2' : 'local';

  let client = null;
  if (backend === 'r2') {
    client = new S3.S3Client({ region: 'auto', endpoint: R2.endpoint, credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey } });
  }

  const localPath = (key) => path.join(uploadsDir, key);

  return {
    backend,                       // 'r2' | 'local'
    isRemote: backend === 'r2',

    async putBuffer(key, buf, contentType) {
      if (backend === 'r2') { await client.send(new S3.PutObjectCommand({ Bucket: R2.bucket, Key: key, Body: buf, ContentType: contentType })); return { key }; }
      const p = localPath(key); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, buf); return { key };
    },

    async getBuffer(key) {
      if (backend === 'r2') { const r = await client.send(new S3.GetObjectCommand({ Bucket: R2.bucket, Key: key })); return Buffer.from(await r.Body.transformToByteArray()); }
      return fs.readFileSync(localPath(key));
    },

    // Presigned direct upload/download (R2 only — offloads bytes from the API).
    async presignPut(key, contentType, expiresIn = 900) {
      if (backend !== 'r2') return null;
      return presigner.getSignedUrl(client, new S3.PutObjectCommand({ Bucket: R2.bucket, Key: key, ContentType: contentType }), { expiresIn });
    },
    async presignGet(key, expiresIn = 3600) {
      if (backend !== 'r2') return null;
      return presigner.getSignedUrl(client, new S3.GetObjectCommand({ Bucket: R2.bucket, Key: key }), { expiresIn });
    },

    async remove(key) {
      if (backend === 'r2') { try { await client.send(new S3.DeleteObjectCommand({ Bucket: R2.bucket, Key: key })); } catch {} return; }
      try { fs.unlinkSync(localPath(key)); } catch {}
    },

    exists(key) {
      if (backend === 'r2') return null;             // async on R2; callers use getBuffer
      try { return fs.existsSync(localPath(key)); } catch { return false; }
    },

    // Where a client fetches the object: signed URL on R2 (or public base), local path otherwise.
    async url(key) {
      if (backend === 'r2') return R2.publicBase ? `${R2.publicBase.replace(/\/$/, '')}/${key}` : await this.presignGet(key);
      return `/uploads/${key}`;
    },
  };
};

module.exports.r2Configured = r2Configured;
