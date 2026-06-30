# ADR-0001: Object storage on Cloudflare R2 behind a provider abstraction

- **Status:** Accepted
- **Date:** 2026-06-19 (backfilled 2026-07-01)
- **Deciders:** sasaeed1
- **Related:** implemented in `backend/storage/` (see `backend/storage/MIGRATION.md`)

## Context
WappFlow is media-heavy: Media Studio ingests full-resolution photos and video, generates
variants (web/thumb/proxy/poster) and exports (gallery ZIPs, album PDFs, rendered reels), and
serves delivery galleries + a public portfolio to clients. Storing and **serving** that volume from
the application server's local disk does not scale: disk fills, backups balloon, and — most costly —
client downloads of large galleries incur egress. We needed durable, scalable object storage without
(a) coupling business logic to a specific provider, (b) breaking local development, or (c) forcing a
risky migration of existing on-disk uploads.

## Decision
We will store objects in **Cloudflare R2** (S3-compatible) in production, behind a single
**provider-agnostic storage abstraction** (`backend/storage/index.js`). Business logic never touches
`/uploads` or a provider SDK directly — it calls the abstraction's canonical methods only:
`uploadFile · deleteFile · getPublicUrl · fileExists · generateSignedUploadUrl ·
generateSignedDownloadUrl · getBuffer`.

- Provider is selected at runtime via `STORAGE_PROVIDER=local|r2` (default `local`). If `r2` is set
  but the SDK/config is missing, it **falls back to local** with a warning.
- **Local stays the default and the fallback.** R2 is purely additive: each asset records its own
  `storage_provider`, so existing local files keep working untouched. **No auto-migration** of
  existing uploads.
- A provider-agnostic file route (`GET /api/storage/file/:key`) 302-redirects private R2 objects to
  short-lived presigned URLs (or serves the local file), so a private bucket needs no public CDN and
  the same URL works regardless of provider.
- R2 credentials live only in the server's `.env` — never in git or memory.

## Alternatives considered
- **Stay on local disk** — simplest, but doesn't scale and makes the server stateful/hard to back up;
  egress and capacity become operational pain as media grows. Rejected.
- **AWS S3** — the obvious S3-compatible default, but R2 has **zero egress fees**, which dominates
  cost for a product whose core loop is clients downloading large galleries/video. Rejected on cost.
- **Public CDN bucket (objects world-readable)** — simplest delivery, but client galleries and
  originals must stay private. The presign-redirect route gives us private storage with simple URLs
  instead. Rejected.

## Consequences
- **Positive:** scales with the media workload; near-zero egress cost; server becomes closer to
  stateless; business logic is provider-agnostic so a future provider swap is one module; local dev
  needs no cloud account; existing installs keep working (additive).
- **Negative / trade-offs:** a layer of indirection between code and bytes; private objects cost one
  presign + redirect per fetch (mitigated by short-lived URL caching); a dual-provider window means
  asset URLs must always go through the abstraction, never be hand-built; secrets management is now
  operationally required in prod `.env`.
- **Neutral:** the same abstraction makes signed direct-to-R2 uploads and background variant/export
  work portable; migrating legacy local assets later is an opt-in batch, not a prerequisite.

## References
- `backend/storage/index.js` (the abstraction + `mountRoutes` presign-redirect)
- `backend/storage/providers/local.js`, `backend/storage/providers/r2.js`
- `backend/storage/MIGRATION.md`
- Consumers: `backend/media-studio.js`, `backend/media-worker.js`, `backend/storage-enforce.js`
