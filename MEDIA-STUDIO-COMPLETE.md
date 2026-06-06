# 📸 WappFlow Media Studio — Complete Reference

**Status (2026-06-06): feature-complete.** Every module from `MEDIA-STUDIO-DESIGN.md` is built, tested, and producing a clean production build.

A control-first creative production + delivery layer for photographers/videographers, bolted onto WappFlow as an additive module. Competes with Pixieset, Pic-Time, ShootProof, CloudSpot, SmugMug, Pixpa.

| Metric | Value |
|---|---|
| Backend module | `backend/media-studio.js` (1,423 LOC) + `backend/media-worker.js` (380 LOC) |
| Database tables | **17** (`ms_*` namespace, owned exclusively) |
| HTTP endpoints | **60** (54 authed photographer/crew + 6 public client-portal) |
| Async worker jobs | **3** (`ingest`, `zip_export`, `pdf_export`) |
| Web pages | **7** (Next.js route group `studio/*` + public `g/[token]`) |
| Test suites | **8** · **143 assertions** · all green |
| Core WappFlow files touched | **1 line** (the mount in `server.js`) |
| New runtime deps | `jimp`, `exifr`, `adm-zip`, `pdfkit` (all pure-JS) |

---

## 1. Architecture

### 1.1 Where it sits

```
┌────────────────────────────── WappFlow OS (unchanged) ──────────────────────────────┐
│ CRM(leads) · Pipeline(status) · WhatsApp/messages · Automation(cron+queue)           │
│ Invoices · Meetings · RBAC(workspace_members) · Plans · audit_logs · AI text(callLLM)│
└───────────────────────────────┬──────────────────────────────────────────────────────┘
                                │  one line in server.js:
                                │  require('./media-studio')(app, db, { auth, generateId,
                                │     logAudit, broadcastToWorkspace, addContactHistory,
                                │     multer, path, fs, uploadsDir, clientBaseUrl,
                                │     sendClientMessage })
        ┌───────────────────────┴───────────────────────────────────────────────────────┐
        │                       MEDIA STUDIO MODULE                                       │
        │                                                                                 │
        │  media-studio.js (router + schema + 60 routes)                                  │
        │  media-worker.js (drains ms_jobs: variants/EXIF/CV scores, ZIP, PDF)            │
        │                                                                                 │
        │  Projects → Library → Culling → Galleries → Proofing → Delivery → Albums → Video│
        │                                                                                 │
        │  Storage: local disk /uploads/media (behind a swappable STORAGE SEAM → R2)      │
        └─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Integration contract (what it reuses vs. owns)

**Reads / links (never alters):** `leads` (the client + deal — projects/galleries carry `lead_id`), `workspace_members` + `DEFAULT_ROLE_PERMISSIONS` (RBAC), `workspace_plan` (gating), `company_settings` (branding/currency).

**Appends rows the existing systems already understand:** `activity_timeline` (project/upload/publish/proofing events on the client's CRM timeline), `audit_logs` (every create/publish/export/cull), `messages` (delivery shows in the client's WhatsApp thread via the injected `sendClientMessage`).

**Owns exclusively:** the entire `ms_*` namespace.

> Delivery uses the **real** `whatsappService.sendMessage` + `saveOutgoingMessage` (injected as `sendClientMessage` at mount), *not* `outbound_message_queue` — that queue has no consumer in the codebase.

### 1.3 The three net-new infra pieces
1. **Storage** — today: local disk under `/uploads/media`, served by the existing `express.static`. Isolated behind a single `STORAGE SEAM` block in `media-studio.js` for a clean swap to **Cloudflare R2** (presigned direct uploads + zero-egress CDN). *Not yet swapped — the one remaining infra task.*
2. **Media worker** — `media-worker.js`, drains `ms_jobs` on a 5s `setInterval` (unref'd). Started by `mountMediaStudio` unless `deps.startWorker === false` (tests drive `worker.processOnce()` deterministically).
3. **CV scoring lane** — runs inside the worker's `ingest` job, **completely separate from WappFlow's text `callLLM`**. Pure-JS (jimp): sharpness (Laplacian variance), exposure, perceptual-hash dedup. Writes **only** advisory `ms_asset_scores`.

### 1.4 File map
```
backend/
  media-studio.js        # the module: schema + 60 routes (factory, mounted with 1 line)
  media-worker.js        # the worker: ingest / zip_export / pdf_export
  server.js              # +1 mount line (before the 404 handler)
  package.json           # +jimp, exifr, adm-zip, pdfkit
  scripts/test-media-*.js (8 files)
  MEDIA-STUDIO-API.md    # quick endpoint ref (slice 1)
wappflow-web/src/
  lib/api.js             # mediaAPI (45+ methods) + mediaUrl()
  components/NavBar.js    # +Studio nav item
  app/studio/page.js                       # projects list + New Shoot
  app/studio/[id]/page.js                  # library + galleries + proofing + export
  app/studio/[id]/cull/page.js             # culling workspace
  app/studio/[id]/albums/page.js           # albums list
  app/studio/[id]/albums/[albumId]/page.js # album editor → PDF
  app/studio/[id]/video/page.js            # video clip selection
  app/g/[token]/page.js                    # PUBLIC client portal
MEDIA-STUDIO-DESIGN.md   # the original architecture/strategy doc
MEDIA-STUDIO-COMPLETE.md # this file
```

---

## 2. Tech stack

- **Backend:** Express 5, better-sqlite3 (synchronous), JWT auth (existing `auth` middleware), multer (disk). Media libs (all pure-JS, loaded **defensively** so a missing dep never crashes the host): `jimp` (decode/resize/watermark), `exifr` (EXIF), `adm-zip` (ZIP), `pdfkit` (PDF).
- **Web:** Next.js 16 + React 19, inline styles with CSS variables (`var(--text)` etc.), `lucide-react` icons, axios client. Public portal uses raw `fetch` (bypasses the auth-redirect interceptor).
- **Multi-tenancy:** every owned table carries `workspace_id`; every authed route is scoped by it. TEXT UUID PKs, JSON-in-TEXT, idempotent `CREATE TABLE IF NOT EXISTS` — matching WappFlow's exact conventions.

---

## 3. Data model (17 tables)

### Core
| Table | Purpose | Key columns |
|---|---|---|
| `ms_projects` | A shoot, linked to a CRM client | `lead_id` → leads, `title`, `project_type`, `shoot_date`, `location`, `status`, `cover_asset_id`, `settings`(JSON) |
| `ms_folders` | Organization within a project | `project_id`, `parent_id`, `name`, `sort_order` |
| `ms_assets` | One row per photo/video/raw | `type`, `storage_key`, `mime`, `size_bytes`, `width/height`, `duration_ms`, `capture_time`, `camera_meta`(JSON EXIF), `phash`, `variants`(JSON thumb/web/original), `status` |
| `ms_jobs` | Async work queue | `type`(ingest/zip_export/pdf_export), `status`, `payload`(JSON), `retry_count`, `next_retry_at` |

### AI vs Human (the control-first wall)
| Table | Written by | Purpose |
|---|---|---|
| `ms_asset_scores` | **AI/CV worker only** | Advisory scores: `score_type`(sharpness/exposure/clipping/duplicate_group/…), `value`, `group_key`, `model_version`, `source` |
| `ms_cull_decisions` | **Humans only** | `decision`(keep/reject/maybe), `rating`(0–5), `color_label`, `flagged` — one row per asset (`asset_id` UNIQUE), always owns a `user_id` |

### Galleries & delivery
| Table | Purpose |
|---|---|
| `ms_galleries` | `visibility`(public/private/password/client_portal), `password_hash`, `share_token`, `status`(draft/published/archived), `version`, `settings`(JSON: watermark, download_policy) |
| `ms_gallery_assets` | Membership + `sort_order` + `is_hidden` (PK gallery+asset) |
| `ms_gallery_access` | Tokenized view log (last_viewed_at) |
| `ms_client_favorites` | Client hearts (`gallery_id`,`asset_id`,`contact_identifier`, UNIQUE) |
| `ms_client_comments` | Client comments per asset |
| `ms_exports` | ZIP jobs: `variant`(web/original), `status`, `storage_key`, `file_count`, `size_bytes`, `watermark` |

### Proofing
| Table | Purpose |
|---|---|
| `ms_proofing_sets` | "Pick your N": `quota`, `instructions`, `status`(open/submitted/revision/approved), `revision_round`, `submitted_at` |
| `ms_proofing_selections` | Client picks (`set_id`,`asset_id`, UNIQUE), tagged by `round` |

### Albums & video
| Table | Purpose |
|---|---|
| `ms_albums` | `spec`(JSON w_mm/h_mm/margin_mm), `status`, `pdf_status`(none/pending/ready/failed), `pdf_storage_key`, `pdf_pages` |
| `ms_album_pages` | `page_no`, `layout_template`(single/two-h/two-v/three/grid4), `slots`(JSON [{asset_id}]) |
| `ms_video_clips` | Manual selections: `asset_id`, `label`, `in_ms`, `out_ms`, `sort_order` |

---

## 4. API surface (60 endpoints)

All under `/api/media`. **Authed** routes use the existing bearer `auth` middleware + workspace scoping. **Portal** routes are public, gated only by the gallery `share_token` (+ password when applicable).

### Projects & library (authed)
```
GET    /overview                          counts (mount check)
GET    /projects            ?lead_id ?status
POST   /projects                          { title*, project_type, lead_id, shoot_date, location }
GET    /projects/:id                      project + folders + counts
PUT    /projects/:id
DELETE /projects/:id                      archive (non-destructive)
GET    /projects/:id/folders
POST   /projects/:id/folders
POST   /projects/:id/assets/sign          ingest contract (multipart now → presigned R2 later)
POST   /projects/:id/assets               multipart upload (field "files"), enqueues ingest jobs
GET    /projects/:id/assets ?folder_id ?type ?decision   library (+ advisory sharpness/dup, cull state)
GET    /assets/:id                        asset detail + scores[] + cull
DELETE /assets/:id
```

### Culling (authed — human decisions)
```
PUT    /assets/:id/cull                   { decision, rating, color_label, flagged }
POST   /projects/:id/cull/bulk            { asset_ids[], decision }
GET    /projects/:id/cull/summary         { total, keep, reject, maybe, undecided }
```

### Galleries (authed)
```
POST   /projects/:id/galleries            { title*, visibility, password, settings }
POST   /projects/:id/galleries/from-cull  { decision='keep', title, visibility, password } → pre-filled gallery
GET    /projects/:id/galleries            (+ latest proofing status/quota/selected)
GET    /galleries/:id                     gallery + assets + comments + share_url
PUT    /galleries/:id
POST   /galleries/:id/assets              { asset_ids[] }
PUT    /galleries/:id/assets/order        { asset_ids[] }
DELETE /galleries/:id/assets/:assetId
POST   /galleries/:id/publish             { notify } → token + WhatsApp delivery
POST   /galleries/:id/unpublish
```

### Delivery / ZIP export (authed)
```
POST   /galleries/:id/export              { variant: web|original } → 202 + export id
GET    /exports/:id                       status + download_url when ready
```

### Proofing (authed)
```
POST   /galleries/:id/proofing            { title, quota, instructions, due_at }
GET    /galleries/:id/proofing
GET    /proofing/:setId                   + selected_asset_ids
POST   /proofing/:setId/request-changes   { note } → round++ + WhatsApp client
POST   /proofing/:setId/approve           → WhatsApp client
```

### Albums (authed)
```
POST   /projects/:id/albums               { title, spec }
GET    /projects/:id/albums
GET    /albums/:id                        + pages (slots resolved to thumbs)
PUT    /albums/:id
DELETE /albums/:id
POST   /albums/:id/pages                  { layout_template, slots }
PUT    /albums/:id/pages/order            { page_ids[] }   ← registered before :pageId
PUT    /albums/:id/pages/:pageId          { layout_template, slots, page_no }
DELETE /albums/:id/pages/:pageId
POST   /albums/:id/autofill               { decision='keep' } → one keeper per page
POST   /albums/:id/export                 → 202, worker builds PDF; poll GET /albums/:id
```

### Video (authed)
```
GET    /projects/:id/videos
PUT    /assets/:id/meta                   { duration_ms, width, height } (from browser <video>)
GET    /assets/:id/clips
PUT    /assets/:id/clips/order            { clip_ids[] }   ← registered before :clipId
POST   /assets/:id/clips                  { label, in_ms, out_ms }
PUT    /clips/:clipId
DELETE /clips/:clipId
```

### Public client portal (no auth — token is the capability)
```
GET    /portal/:token            ?pw     gallery + assets + favorites + active proofing set
POST   /portal/:token/favorite          { asset_id, contact, pw } (toggle)
POST   /portal/:token/comment           { asset_id, contact, body, pw }
POST   /portal/:token/export            { pw } → ZIP per gallery download policy
GET    /portal/:token/export/:exportId
POST   /portal/:token/proofing/:setId/select   { asset_id, selected, contact, pw }
POST   /portal/:token/proofing/:setId/submit   { pw } → notifies photographer
```

---

## 5. The worker (`media-worker.js`)

Drains `ms_jobs` (claim → run → done/retry, max 3 retries with backoff). Returns `{ processOnce, start, stop, hasImageLib }`.

| Job | What it does |
|---|---|
| `ingest` | Reads EXIF (capture time, camera) · generates `thumb` (≈400px) + `web` (≈2048px) JPEG variants · computes advisory CV scores: **sharpness** (Laplacian variance), **exposure** (mean luminance + clipping fraction), **perceptual hash** + duplicate-group linking. RAW/video pass through (no preview). Writes only `ms_assets` technical meta + `ms_asset_scores`. |
| `zip_export` | Bundles a gallery via adm-zip. `web` variant **burns a tiled, semi-transparent watermark** (from `settings.watermark`); `original` ships byte-identical full-res. → `ms_exports`. |
| `pdf_export` | Builds a print-ready album PDF via pdfkit: mm→pt page size, margins, **cover-fit** images into layout slot rectangles. → `ms_albums.pdf_*`. |

All three image libs are optional; absence degrades gracefully (e.g., no jimp → ingest marks assets ready with no preview) and never takes down the server.

---

## 6. Feature set by module

1. **Projects** — shoots typed (wedding/event/portrait/real-estate/commercial/product), linked to a CRM lead; create logs to the client's timeline. No second CRM.
2. **Media Library** — direct multipart upload (browser→server), folders, manual organization; grid shows worker thumbnails + advisory AI badges (Sharp/Soft, Dup?). RAW + video supported.
3. **Culling workspace** — keyboard-first loupe (`←/→` navigate, `P` keep, `X` reject, `M` maybe, `U` undo, `1–5` rate), filmstrip with decision overlays, filter tabs + live counts, AI advisory rail beside (never replacing) the human decision.
4. **Galleries** — public/private/password/client-portal; reorder, watermark + download policy, versioning; client favorites & comments. One-click **keepers → gallery**.
5. **Publish + delivery** — human publish generates a `share_token`, WhatsApps the client the link (lands in their conversation), logs to timeline + audit.
6. **Client portal** (`/g/[token]`) — cinematic, no-login, password-gated; masonry grid, lightbox, favorites, comments, **selection mode** (proofing), **Download all** (ZIP).
7. **Proofing / selection** — "pick your N" with quota + instructions; client selects & submits → photographer notified; **revision rounds** (request changes → re-open → approve), each transition WhatsApps the client.
8. **Delivery exports** — watermarked-web ZIP (protected previews) vs clean-original ZIP (paid finals), worker-built, expiring URLs.
9. **Album builder** — click-a-slot→click-a-photo editor, 5 layout templates, reorder/delete pages, autofill-from-keepers, **print-ready PDF** export.
10. **Video** — manual clip selection: native player, Mark In/Out at the playhead, clip list (play-to-out, label, reorder, delete). **No auto-reel.**

---

## 7. End-to-end workflows

**Photographer:** book lead (existing CRM) → create Project off the lead → upload → worker makes variants + advisory scores → **cull** (keyboard, AI-advised) → **keepers→gallery** (one click) → set watermark/downloads → **publish** → client WhatsApped → **proofing** rounds if a selection shoot → **deliver** (watermarked-web or original ZIP) → **album** → **PDF** → invoice (existing) → pipeline → Delivered. One context, one client record.

**Client (over WhatsApp):** receives link → opens tokenized portal on phone → browses/favorites/comments → (if asked) **selects their N** and submits → **downloads all** → every action flows back to the photographer's CRM timeline.

**Crew:** invited as `workspace_members` with scoped roles; destructive ops (archive/delete/export) gated to manager+ via existing role signals.

---

## 8. Control-first AI model (enforced by construction)

**Two lanes, hard-walled:**
- **CV/vision (worker):** writes **only** `ms_asset_scores` (advisory). Has **no code path** to cull, publish, or deliver.
- **Text (reuses WappFlow `callLLM`):** drafts copy into editable fields requiring human send — exactly like the existing `suggestReplies`.

**Structural guarantees (not policy):**
- Human decisions live in a **separate table** (`ms_cull_decisions`) reachable only via authed `PUT /assets/:id/cull`. AI cannot write it.
- There is **no** auto-gallery, auto-album, auto-reel, auto-cull, auto-publish, or auto-deliver endpoint — these simply don't exist.
- Every AI suggestion + human action is auditable via `audit_logs`.
- Opt-in by default (mirrors `workspace_ai_profile.auto_analyze = 0`).

**Every test asserts the wall holds** — e.g., culling never writes scores, exporting/proofing/albums never write cull decisions, the portal can't publish.

---

## 9. Test coverage (8 suites · 143 assertions)

Each test mounts the module on a throwaway Express app + in-memory SQLite with a fake `auth` — **no WhatsApp/puppeteer, no real server**. Run any with `node scripts/test-media-<name>.js`.

| Suite | Asserts | Covers |
|---|---|---|
| `studio` | 21 | projects (lead link + validation), folders, ingest, library, asset detail, control-first wall |
| `worker` | 15 | real-image variants, dimensions, sharpness/exposure scores, phash dedup, idempotency |
| `galleries` | 24 | gallery CRUD, publish + WhatsApp seam, password gate, favorites, comments, no portal-publish |
| `cull` | 17 | decision upsert, library `?decision` filter, bulk, summary, keepers→gallery, human-owned |
| `export` | 16 | ZIP build (adm-zip readback), **watermark alters pixels**, original byte-identical, portal download-all |
| `proofing` | 18 | full round-trip: select/toggle/submit → notify → lock → request-changes → re-select → approve |
| `albums` | 18 | page CRUD, layouts, reorder, autofill, **pdf-parse confirms a valid 4-page PDF** |
| `video` | 14 | video listing, duration meta, clip CRUD + reorder, validation, no AI scores |

**Web:** `npm run build` compiles all 7 routes clean under Next.js 16.

Two real bugs were caught and fixed by the tests: Express route-ordering (`/pages/order` shadowed by `/pages/:pageId`; same for `/clips/order`) and a Windows libuv teardown race in the test harness.

---

## 10. How to run

```bash
# backend (installs whatsapp-web.js etc. + the 4 media libs now in package.json)
cd backend && npm install && npm start          # worker auto-starts; serves /uploads

# web
cd wappflow-web && npm install && npm run dev    # open the "Studio" nav item
```
Env: `FRONTEND_URL` (→ `clientBaseUrl` for share links). All media libs are pure-JS — no native build, no ffmpeg.

---

## 11. What's stubbed / remaining (all intentional)

| Item | State | Note |
|---|---|---|
| **Object storage (R2)** | Local disk behind `STORAGE SEAM` | The #1 remaining task — galleries, ZIPs, PDFs accumulate on app-server disk; won't survive real load. The adapter is isolated to one block; `/assets/sign` already anticipates presigned uploads. |
| **Real video/CV scoring** (shake/motion/faces) | Table + `clip_quality` score_type ready | Needs an ffmpeg/vision worker (heavier infra). Stays advisory-only when added. |
| **Cull compare-view** for duplicates | `dup_group` computed; not yet a side-by-side UI | Small enhancement. |
| **Album AI layout suggestions** | Not built | Design says optional + human-approved only. |
| **Plan gating UI** | RBAC + role checks in place | Wire `workspace_plan.features/limits` + `PlanLock` when monetizing the module. |

---

## 12. Why it beats the competitors (recap)

Every competitor is a silo that bolts a thin CRM onto galleries and delivers over **email**. WappFlow inverts it: it's already the business OS (CRM, pipeline, **WhatsApp**, invoicing, automation, RBAC, audit), and Media Studio adds the only missing layer. The wedge is structural — **delivery and proofing happen over WhatsApp inside one client record**, with control-first AI as a trust feature and zero-egress storage (once R2 lands) protecting unit economics on a download-heavy product.
