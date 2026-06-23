'use strict';

// ── Cloudflare R2 storage provider (S3-compatible, AWS SDK v3) ────────────────
// Returns null when the SDK or R2_* config is absent, so index.js can fall back to
// local. Config (env): R2_ACCOUNT_ID, R2_BUCKET, R2_ENDPOINT (optional — derived
// from account id), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE (optional
// public bucket / CDN base; without it, getPublicUrl() points at the /api/storage
// redirect which presigns on demand).

let S3 = null, presigner = null;
try { S3 = require('@aws-sdk/client-s3'); presigner = require('@aws-sdk/s3-request-presigner'); } catch { /* optional */ }
const makeSigners = require('../signed-urls');

module.exports = function r2Provider() {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const bucket = process.env.R2_BUCKET || '';
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const publicBase = process.env.R2_PUBLIC_BASE || '';
  if (!S3 || !presigner || !bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;

  const client = new S3.S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
  const signers = makeSigners({ S3, presigner, client, bucket });

  return {
    name: 'r2',

    async uploadFile(key, buffer, contentType) {
      await client.send(new S3.PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType || 'application/octet-stream' }));
      return { key, size: buffer.length, provider: 'r2', content_type: contentType || null };
    },

    async getBuffer(key) {
      const r = await client.send(new S3.GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await r.Body.transformToByteArray());
    },

    async deleteFile(key) { try { await client.send(new S3.DeleteObjectCommand({ Bucket: bucket, Key: key })); } catch { /* already gone */ } },

    // Public bucket/CDN → direct URL; private bucket → the /api/storage redirect that
    // presigns on demand. Either way callers get a stable, sync URL string.
    getPublicUrl(key) {
      return publicBase ? `${publicBase.replace(/\/$/, '')}/${key}` : `/api/storage/file/${encodeURIComponent(key)}`;
    },

    async fileExists(key) {
      try { await client.send(new S3.HeadObjectCommand({ Bucket: bucket, Key: key })); return true; }
      catch { return false; }
    },

    generateSignedUploadUrl(key, contentType, expiresIn = 900) { return signers.uploadUrl(key, contentType, expiresIn); },
    generateSignedDownloadUrl(key, expiresIn = 3600) { return signers.downloadUrl(key, expiresIn); },

    localPath() { return null; }, // R2 objects have no local path
  };
};
