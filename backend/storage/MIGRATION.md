# Storage Abstraction & Cloudflare R2 — Migration Strategy

WappFlow storage is provider-agnostic. Business logic never knows the provider — it
calls the abstraction (`backend/storage/`) and `publicUrl()` only.

## Providers

| File | Provider | Notes |
|---|---|---|
| `storage/providers/local.js` | Local disk | **default + permanent fallback**; served by `/uploads` static |
| `storage/providers/r2.js` | Cloudflare R2 | S3-compatible (AWS SDK v3); additive, opt-in |
| `storage/signed-urls.js` | — | presigned PUT/GET helpers (direct-to-R2) |
| `storage/index.js` | selector | picks via `STORAGE_PROVIDER`; exposes the unified API |

**API:** `uploadFile · deleteFile · getPublicUrl · fileExists · generateSignedUploadUrl
· generateSignedDownloadUrl · getBuffer`.

## Configuration

```
STORAGE_PROVIDER=local        # default — nothing changes
# or
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=...
R2_BUCKET=...
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com   # optional (derived from account id)
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_PUBLIC_BASE=                # optional: public bucket / CDN base (else presign-redirect)
```

If `STORAGE_PROVIDER=r2` but the SDK/config is missing, the layer **falls back to local**
with a warning — it never crashes.

## Backward compatibility (the rules)

1. **No automatic migration.** Existing files stay exactly where they are.
2. **Existing uploads keep working** — every asset carries `storage_provider` (default
   `local`); old rows resolve through the local provider regardless of `STORAGE_PROVIDER`.
3. **Only new writes** use the active provider. Flipping to `r2` does not touch a single
   existing file.
4. **`publicUrl()` is the single URL implementation.** Serving is automatically correct
   per asset (local → `/uploads`, R2 → CDN/public base or the `/api/storage/file/:key`
   presign-redirect).

## Per-asset tracking

`ms_assets` now records: `storage_provider`, `storage_key`, `storage_size`, `uploaded_at`.
This makes migrations, backups, desktop sync, and the Command Center storage dashboard
trivial.

## Staged rollout

- **Stage 1 — export ZIPs → R2** ✅ *(shipped)*. Large, transient, regenerable delivery
  artifacts move off the server disk first (lowest risk). Dual-read download:
  `GET /api/media/exports/:id/file` serves the local file if present, else presign-redirects
  to R2.
- **Stage 2 — new uploads + variants → R2** (when `STORAGE_PROVIDER=r2`). The intake stores
  the original to R2 and stamps `storage_provider=r2`; the worker writes variants to R2 and
  stores their URLs via `publicUrl()`. Existing `local` assets are untouched.
- **Stage 3 — desktop direct-to-R2** (future). Desktop requests a signed PUT URL, uploads
  straight to R2 (no API passthrough — server is never the bottleneck), then notifies the
  API to register + ingest the asset:
  `Desktop → generateSignedUploadUrl → R2 → POST /complete → API`.
- **Stage 4 — backfill (optional, manual)** existing local files into R2 via a one-off
  script (`local.getBuffer` → `r2.uploadFile` → flip `storage_provider`). **Never automatic.**

## Custom CDN (later, not now)

Point `cdn.wappflow.com` (or `media.wappflow.remoteops.co`) at the R2 bucket and set
`R2_PUBLIC_BASE` — `getPublicUrl()` then returns CDN URLs directly (fastest gallery loads,
zero egress). Until then, private-bucket presign-redirect is used.

## Verify

```bash
cd backend && node -e "require('dotenv').config(); const s=require('./storage')({uploadsDir:'./uploads'}); console.log('provider =', s.provider);"
node test-storage.js   # local roundtrip + provider selection + fallback
```
