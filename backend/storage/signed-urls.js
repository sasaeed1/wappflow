'use strict';

// ── Presigned-URL helpers (S3/R2, AWS SDK v3) ────────────────────────────────
// Direct PUT/GET URLs so bytes never pass through the API server:
//   • generateSignedUploadUrl → desktop/client uploads straight to R2.
//   • generateSignedDownloadUrl → client downloads straight from R2.
// Used by the r2 provider; the local provider returns null / a /uploads path.

module.exports = function makeSigners({ S3, presigner, client, bucket }) {
  return {
    uploadUrl: (key, contentType, expiresIn = 900) =>
      presigner.getSignedUrl(
        client,
        new S3.PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType || 'application/octet-stream' }),
        { expiresIn }
      ),
    downloadUrl: (key, expiresIn = 3600) =>
      presigner.getSignedUrl(
        client,
        new S3.GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn }
      ),
  };
};
