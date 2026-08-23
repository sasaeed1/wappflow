## Media Studio — library, culling, galleries, albums and delivery

### What this is for

Media Studio is WappFlow's attempt to be the whole back-office of a photography or video studio, from the moment the shutter stops clicking to the moment the client downloads their pictures. It competes with Pixieset, Pic-Time, ShootProof and CloudSpot. A working photographer's job after a wedding looks like this: dump 3,000 raw frames off the cards, throw away the blinks and the misfires, colour-correct the survivors, put the best 400 on a private web page for the couple, let the couple pick 40 for a printed book, build the book, export a print-ready PDF, and hand over a ZIP of the finals. Media Studio implements that entire chain as one module.

Domain vocabulary, because none of it is obvious:

- **Shoot / project** — one job (a wedding, a product session). Everything hangs off it. In the code it is `ms_projects`; the UI calls it a "shoot."
- **Library** — the raw dump of every file from that shoot, browsable as a grid.
- **Culling** — the brutal first pass where the photographer marks each frame *keep*, *reject* or *maybe*, and optionally stars it 0–5. Of 3,000 frames maybe 400 survive. Culling is the single most time-expensive task in the business, which is why the product's whole "AI" story is aimed at it.
- **Gallery** — a curated, client-facing web page built from a *subset* of the library, published behind a share link. This is the delivery surface.
- **Album** — a *printed book* layout: ordered pages, each page holding 1–4 photos in a named layout, exported as a print-ready PDF. Not the same thing as a gallery.
- **Proofing / selection set** — "pick your favourite 40" — a quota-bounded selection task the client completes inside the gallery, with revision rounds.
- **Portfolio** — the studio's own public marketing showcase at a vanity URL, fed from published client work.
- **Variant** — a derived rendition of an original file (thumbnail, web-size JPEG, watermarked copy, edited render). The original is never modified.

### Code map and mount

| File | Lines | Owns |
|---|---|---|
| `backend/media-studio.js` | ~2,880 | Projects, folders, ingest, culling, edits, galleries, proofing, albums, video-timeline routes, portfolio, public client portal. 115 route registrations. |
| `backend/media-worker.js` | ~1,000 | The async job runner draining `ms_jobs`. |
| `backend/analyzers/index.js` | 372 | The Analyzer abstraction — the single write path into `ms_asset_scores`, plus the Learning System and Workspace Brain. |
| `backend/vision-cpu.js` | 113 | Pure-CPU vision fallback (composition / aesthetic / scene class) using jimp only. |
| `backend/album-model.js` | 66 | The canonical album page model, shared so two generators cannot disagree. |
| `backend/studio-ai.js` | 234 | Generative selection/album/gallery drafting (`/api/studio-ai/*`). |
| `backend/brains.js` | 167 | Creator Brain + Style Engine (learned house style). |
| `backend/studio-experience.js` | 125 | Marketplace packs, project milestones, print recommendations. |
| `backend/storage/index.js` | 71 | Local-disk ↔ Cloudflare R2 provider abstraction. |
| `backend/storage-enforce.js` | 133 | Plan storage quota gate + 80/90/100% warnings. |
| `backend/print-store.js` | ~300 | Print products and orders (`/api/store/*`). |

`server.js:6242` mounts media-studio with injected `auth`, `generateId`, `logAudit`, `broadcastToWorkspace`, `addContactHistory`, `notify`, `multer/path/fs/uploadsDir`, the `aiEngine` (for Studio Copilot) and a `sendClientMessage` closure that routes gallery notifications through the existing WhatsApp rail. `studio-ai`, `studio-experience`, `print-store`, `reel-engine` and `brains` mount after it (`server.js:6361–6442`). A module gate at `server.js:6209–6237` returns 403 on `/api/media/*` when the `media_studio` entitlement is explicitly false, exempting `/api/media/(portal|public|gallery)` so clients are never locked out. `media-studio.js` hard-fails at mount if the CRM `leads` table is absent (`media-studio.js:330`), because a project joins `leads` for the client's name.

### The shoot model

`ms_projects` (`media-studio.js:63`) holds `id, workspace_id, lead_id, title, project_type (wedding|event|real_estate|commercial|portrait|product|general), shoot_date, location, status (planning|shooting|culling|delivery|delivered|archived), cover_asset_id, settings JSON`. `lead_id` is the only CRM link — there is deliberately no second contact store. `createProject()` (`media-studio.js:429`) is shared by the REST route, the contact action hub and the booking handoff, so a shoot created from a calendar booking is the same object as a hand-made one. `DELETE /api/media/projects/:id` **archives** rather than deletes (`:490`); there is no hard-delete path for a project.

`ms_folders` gives an optional in-project hierarchy. `POST /api/media/projects/:id/auto-folders` (`:743`) clusters photos into folders by EXIF capture-time gaps (default 90 minutes) and names each `"Mar 3, 4:15 PM · 214"`. Those folders later become the *story sections* rendered as chapters in the client gallery.

### Ingest and variants

Two upload paths exist:

1. **Multipart** — `POST /api/media/projects/:id/assets` (`:592`), 200 files max, 200 MB per file, multer disk storage into `uploads/media/`. When `STORAGE_PROVIDER=r2` each original is pushed to the bucket and the temp deleted, falling back to local on any R2 error.
2. **Direct-to-bucket** — `POST .../uploads/sign` then `POST .../uploads/complete` (`:544`, `:560`). Sign returns `{provider, key, upload_url}`; complete verifies `storage.fileExists(key)` and registers the row. On the local provider `upload_url` is null, so this path is R2-only in practice. A third, older route `POST .../assets/sign` (`:527`) is a forward-compatible stub that just echoes the multipart target.

`ms_assets` columns of note: `type (photo|video|raw|audio|file)`, `storage_key`, `mime`, `size_bytes`, `width/height`, `capture_time`, `camera_meta` (EXIF JSON), `phash`, `variants` (JSON `{original, web, thumb, watermarked, full_edit, edited}`), `edits` (JSON), `deleted_at`, `storage_provider/storage_size/uploaded_at`, and video columns `v_duration_ms, v_width, v_height, v_fps, v_codec, v_has_audio, proxy_url, poster_url`.

Every upload enqueues an `ingest` job. The worker (`media-worker.js:212`) reads EXIF via `exifr`, writes a 400 px thumb and a ≤2048 px web JPEG, computes a perceptual aHash, runs the CPU CV pass, and clusters near-duplicates within the project (Hamming distance ≤6 on the 64-bit hash, `media-worker.js:97`). RAW files (`cr2/cr3/nef/arw/raf/rw2/dng/orf/srw/pef`) get their *embedded* JPEG preview extracted by shelling out to `exiftool` then `dcraw` (`media-worker.js:120`) — there is no RAW decoder. Video and audio fall through to a `video_probe` job. All image libraries are optional requires: if `jimp` is missing the job still completes, marked `degraded-no-jimp`.

Deletion is soft (`DELETE /api/media/assets/:id`, `:953`) into a Trash with a 90-day window from the shared registry (`soft-delete.js:23`), swept on boot and on every Trash listing. `purgeAsset` (`:924`) removes the row, scores, cull decision, portfolio items and the files from both providers.

### The media-worker job queue

`ms_jobs` (`media-studio.js:137`) is `{id, workspace_id, type, asset_id, project_id, status (pending|running|done|failed), progress, payload JSON, error_message, retry_count, next_retry_at, finished_at, lease_until}`. The worker polls every 5 s, reaps stale `running` rows whose lease expired, claims a batch of 10 and runs them (`media-worker.js:874`). Failures retry up to 3 times with a `retry_count × 30 s` backoff, then mark the job *and* the asset `failed`. Job types actually implemented: `ingest`, `render_edits`, `zip_export`, `pdf_export`, `video_probe`, `video_poster`, `video_proxy`, `video_export`. Operators see queue health at `GET /api/media/jobs` (`:857`) and can requeue everything failed with `POST /api/media/jobs/retry-failed`.

### Culling

The architectural promise here is "control-first": **AI writes advice, humans write decisions, and there is no code path from one to the other.** Advisory output lives in `ms_asset_scores`; human decisions live in `ms_cull_decisions` (`asset_id UNIQUE`, `user_id NOT NULL`, `decision keep|reject|maybe`, `rating 0..5`, `color_label`, `flagged`). Only three authed routes write it: `PUT /api/media/assets/:id/cull` (`:1029`), `POST /api/media/projects/:id/cull/bulk` (`:1043`), and the shared `upsertCull` (`:1006`). Every write also drops a row into `ms_feedback` so future models can learn from real human choices.

The cull UI (`wappflow-web/src/app/studio/[id]/cull/page.js`, 873 lines) is a full-screen single-frame reviewer with Lightroom-style keys: `P` keep, `X` reject, `M` maybe, `U`/Backspace undecide, `1`–`5` rate, `Z` 100 % zoom, `C` compare, `E` edit panel, `F` presets, `I` info, `B` before/after, arrows/space to advance. It loads up to 5,000 assets at once plus the per-asset score map from `GET /api/media/projects/:id/intelligence` (`:835`).

### Non-destructive editing

Edit parameters are stored as JSON on the asset and re-rendered by the worker from the untouched original. `sanitizeEdits` (`:1082`) validates `exposure/contrast/temperature/tint/saturation` in −1..1, `fade/vignette/grain` in 0..1, `bw`, `rotate` −360..360 and a relative `crop {x,y,w,h}`. Each save bumps a `rev` counter so rendered filenames (`media/edits/{assetId}-r{rev}-{full|web|thumb}.jpg`) bust browser caches, and older revisions are deleted. 24 film presets ship client-side in `app/studio/presets.js` with a CSS approximation for instant preview. `POST .../edits/batch` (`:1136`) applies one edit to up to 500 photos.

`POST /api/media/projects/:id/auto-edit` (`:1157`) is the genuinely "AI" edit: it reads the workspace's learned `style_profiles` row, computes a per-photo grade toward that house style via `style-apply.js`, and pushes it through the same edit pipeline. It refuses with a 400 if no style has been learned yet.

### AI scoring — Track 0

`analyzers/index.js` is the seam. Business logic only ever *reads* `ms_asset_scores`; whether a score came from the server CPU, a desktop ONNX runtime or a cloud worker is invisible. The registry declares five analyzers with a `where` tier and a `modelVersion`: `technical` (server, `tech-v1`), `dedup` (server, `phash-v1`), `vision` (client, `vision-v1`), `video` (client, `video-v1`), `composite` (server, `comp-v1`). An "analyze once" ledger `ms_asset_analysis (asset_id, analyzer_id, model_version, source, status)` prevents re-runs until a version bumps.

The server writes technical primitives — `sharpness` (Laplacian variance), `blur`, `exposure` (0..1 mean luminance), `high_clip`, `shadow_clip`, `clipping`, `quality` — plus a `duplicate_group` grouping key. `vision-cpu.js` then supplies `composition` (rule-of-thirds via an edge-energy centroid), `aesthetic` (weighted sharpness/exposure/contrast/colourfulness) and a heuristic `scene_class` (portrait/group/landscape/scene, indoor/outdoor) under model version `vision-cpu-v1` — deliberately different from the desktop's `vision-v1`, so a real desktop pass supersedes it. `face_count` and `smile` only appear when an optional `face-detect.js` (ONNX) is installed on the host. `computeComposites` (`analyzers/index.js:146`) derives four explainable composites — `hero`, `portfolio`, `album`, `storytelling` — each carrying a `reasons` array the UI can cite.

External analyzers post results to `POST /api/media/assets/:id/scores` or the batch `POST /api/media/projects/:id/scores`. `POST /api/media/projects/:id/analyze` recomputes composites cheaply from whatever primitives exist.

### Studio Brain vs Studio AI vs Brains & Style — three different things

These are routinely conflated and should not be:

1. **Studio Brain** (`workspace_brain` table; `GET/PUT /api/media/brain`, `POST /api/media/brain/derive`, `media-studio.js:852–854`) is a **key/value store of the studio's preferences**, part explicit (the owner types them into Studio Settings) and part inferred by `deriveBrain()` from behaviour — e.g. `cull_keep_rate`, `avg_delivery_count`, each with a confidence. It is memory, not a model.
2. **Studio AI** (`backend/studio-ai.js`, `/api/studio-ai/*`) is **generative tooling**: it reads composites and produces named *selections* (`best_of`, `highlights`, `portfolio`, `album`, `delivery`) with per-kind weights re-weighted by project type, deduplicates within near-duplicate clusters, then can turn a selection into a draft gallery or a draft album. It writes `ms_selections`, `ms_style_profiles`, and draft rows — never a cull decision, never a publish.
3. **Brains & Style** (`backend/brains.js`) is the **learning layer**: `creator_brain` infers per-user habits (keep rate, decisiveness, average rating) and `style_profiles` derives a *house style* (mean exposure / contrast / colourfulness / composition) from the `reasons` of the aesthetic scores on photos the studio actually **kept**. That profile is what `auto-edit` and the reel renderer grade toward. Confidence scales with sample size (`n/200`).

A fourth surface, **Studio Copilot** (`POST /api/media/copilot`, `:1206`), is a chat assistant grounded in real project SQL (cull counts, best/worst by quality, duplicate groups, gallery favourites, proofing state, recent client comments). It may return at most three *suggested* actions from a hard allowlist (`navigate`, `create_gallery_from_keepers`, `preset_keepers`) which the UI renders as buttons — the model itself changes nothing.

### Galleries and the client portal

`ms_galleries` (`:1289`): `visibility (public|private|password|client_portal)`, `password_hash`, `share_token UNIQUE`, `status (draft|published|archived)`, `version`, `settings JSON {watermark, download_policy, layout_theme}`, `expires_at`, `published_at`. Membership is `ms_gallery_assets (gallery_id, asset_id, sort_order, is_hidden)`.

`POST /api/media/projects/:id/galleries/from-cull` (`:1582`) is the bridge from culling to delivery — one click builds a gallery pre-filled with every `keep` in capture order. `POST /api/media/galleries/:id/publish` (`:1710`) is the only route that mints a share token (`crypto.randomBytes(16)`), bumps the version, WhatsApps the link to the linked lead, writes a CRM timeline entry, optionally feeds the creator's portfolio, and broadcasts `ms_gallery_published`.

The public portal is `GET /api/media/portal/:token` (`:2672`) — unauthenticated, the token *is* the capability. It returns the studio's branding, the asset list shaped by `shapePublicAsset` (`:1540`), the active proofing set, story sections derived from folders, whether a print store is enabled, and a link to the client's unified portal. An `x-wf-preview: 1` header (set only by the frontend's own metadata fetch) suppresses view counting so a link preview does not register as the client opening their gallery. Clients can favourite (`/favorite`), save a named collection (`/collection` → `ms_fav_collections`), comment (`/comment`), and trigger a "download all" (`/export`). Password check is `sha256(galleryId + '::' + pw)`.

**Proofing** is `ms_proofing_sets` (`quota`, `instructions`, `status open|submitted|revision|approved`, `revision_round`, `due_at`) plus `ms_proofing_selections`. The client toggles picks and submits; the photographer approves or requests changes, each of which WhatsApps the client and bumps the round.

**Delivery** is a `zip_export` job. `startGalleryExport` (`:1756`) creates an `ms_exports` row and enqueues the job; the worker bundles either the `web` variant (burning a tiled semi-transparent text watermark when `settings.watermark` is set) or the clean `original`, and writes `media/exports/{id}.zip`. The client's own "download all" maps the gallery's `download_policy` (`none` → 403, `high-res` → originals, anything else → web).

**Watermarking** has two independent implementations. The gallery-level one is the worker's tiled burn during ZIP export. The library-level one is `POST /api/media/projects/:id/watermark/apply` (`:669`), which uses jimp to composite a text or uploaded-logo mark at a chosen position/opacity/size (including `tiled`), writes `media/wm-{assetId}.jpg` into `variants.watermarked`, persists the config onto the project, and runs asynchronously in the background after responding 200. Because `shapePublicAsset` prefers `variants.watermarked` for both thumb and web, a watermarked asset is protected everywhere the client sees it while high-res downloads stay clean.

### Albums and the page model

`album-model.js` exists because there used to be two incompatible definitions of an album page. `media-studio.js` stores real pages in `ms_album_pages (album_id, page_no, layout_template, slots JSON)`; `studio-ai.js`'s generator used to write only `ms_albums.spec.spreads`, so AI-generated albums showed "0 pages", opened empty, and exported a blank PDF. The shared module now defines four canonical layouts — `single(1)`, `two-h(2)`, `two-v(2)`, `three(3)`, `grid4(4)` — and both `pagesFromAssetIds` and `pagesFromSpreads`. A boot-time backfill (`media-studio.js:1500`) materialises pages for albums stranded by the old behaviour.

Album editing is manual and control-first: create pages, set the layout, drop assets into slots, reorder. `POST .../autofill` (`:2017`) seeds one keeper per single-image page as a starting draft. `POST .../export` (`:2036`) enqueues a `pdf_export` job; the worker lays out `spec.w_mm × h_mm` with a `margin_mm` using pdfkit, drawing a grey placeholder for empty slots, and fills `pdf_status/pdf_storage_key/pdf_size/pdf_pages`. `page_count` is deliberately never a column — it is derived live from `ms_album_pages`.

### Portfolio

One `ms_portfolios` row per user per workspace, auto-created on first read (`:2492`). It carries a vanity `handle` (slugified from the user's name, uniqueness-checked), an opaque `token` fallback, `title/tagline/bio`, one of ten themes (`atelier, noir, editorial, gallery, film, brut, luxe, vivid, mono, frame`), `is_public`, `auto_include` and a `view_count`. Items in `ms_portfolio_items` come from four sources: `manual` picks from published galleries, `gallery` (auto-fed on publish when `auto_include` is on), direct `upload`, or `reel`. `GET /api/media/public/portfolio/:handle` (`:2657`) serves it unauthenticated at `/folio/:handle`, resolving by handle *or* token, and only when `is_public = 1`.

### Print store, recommendations, milestones, storage

`print-store.js` owns `ms_print_products (name, kind, description, options JSON [{label, price}], active)` and `ms_print_orders`. The public shop hangs off the gallery share token (`GET/POST /api/store/public/:token`), prices the cart **server-side** from the catalogue, finds-or-creates a CRM lead, writes the order, and then raises an invoice plus a payment link through the same creators the rest of the app uses. `studio-experience.js` adds `GET /api/media/projects/:id/print-recommendations`, which turns composite scores into copy ("3 standout hero shots — perfect for wall art") matched against the workspace's active products by a regex on kind/name.

`ms_milestones (title, status pending|in_progress|done, due_date, sort_order)` with CRUD at `/api/media/projects/:id/milestones` powers the delivery-progress strip in the client portal (`server.js:6312`).

Storage quota lives in `storage-enforce.js`. Usage is computed **live** from `ms_assets` (non-deleted) plus `ms_exports`, never from a counter, so it cannot drift. The limit comes from the entitlements resolver's `storage_gb` (Creator 50, Studio 250, Studio+ 1024, Enterprise unlimited). `gate()` blocks an upload with a 413 `{storage_limit: true}` before multer's temp files are kept — both upload routes call it. `warn()` fires exactly one notification per upward threshold crossing (80 % → 90 % → 100 %), deduped in `storage_warn_state`. Both fail **open** on any error. `GET /api/media/storage` (`:581`) backs `app/settings/storage`.

### Realtime events

All emitted through `broadcastToWorkspace` as unnamed SSE frames carrying a `type`: `ms_project_created`, `ms_project_updated`, `ms_assets_added`, `ms_asset_processed`, `ms_scored`, `ms_watermark_done`, `ms_gallery_created`, `ms_gallery_published`, `ms_export_ready`, `ms_album_pdf_ready`, `ms_client_favorited`, `ms_client_commented`, `ms_collection`, `ms_proofing_submitted`, `ms_selection`, `ms_milestone`.

### Frontend surface

| Route | File | Notes |
|---|---|---|
| `/studio` | `app/studio/page.js` | Shoot list + create (with CRM lead picker) |
| `/studio/[id]` | `app/studio/[id]/page.js` (763 lines) | Library grid, upload, watermark, auto-folders, auto-edit, galleries panel, publish, export, proofing, Studio AI modal |
| `/studio/[id]/cull` | `.../cull/page.js` (873) | The culling reviewer |
| `/studio/[id]/albums`, `/albums/[albumId]` | 104 + 193 | Album list and page editor |
| `/studio/[id]/video`, `/video/[timelineId]` | 342 + 974 | Reel/timeline editor (adjacent domain) |
| `/studio/portfolio`, `/studio/settings`, `/studio/store`, `/studio/trash`, `/studio/help` | 354 / 324 / 93 / 98 / 252 | Settings hosts the Studio Brain editor and the job-queue panel |
| `/g/[token]` | `app/g/[token]/page.js` (359) | Public client gallery: favourites, collections, comments, lightbox slideshow, proofing, download-all, store link |
| `/folio/[handle]` | `app/folio/*` | Public portfolio |

### Maturity assessment

| Feature | Status | Named gap |
|---|---|---|
| Projects, folders, library browsing | SHIPPED | No project hard-delete; folders can be created but never renamed or deleted via the API |
| Multipart upload + variants + EXIF + dedup | SHIPPED | — |
| Direct-to-R2 signed upload | PARTIAL | Only functional when `STORAGE_PROVIDER=r2`; unverifiable here |
| RAW support | PARTIAL | Embedded-preview extraction only, needs `exiftool`/`dcraw` on the host, and is skipped entirely for R2-stored RAW (`media-worker.js:228`) |
| Culling (decisions, ratings, bulk, summary) | SHIPPED | `color_label` and `flagged` are stored but have no UI |
| Non-destructive edits + 24 presets | SHIPPED | — |
| Auto-edit to house style | SHIPPED | Requires a learned style profile; silently a no-op for new workspaces |
| Track-0 scoring (technical/dedup/CPU vision/composites) | SHIPPED | `face_count`/`smile`/`eyes_open` need an optional ONNX detector that is not installed by default |
| Desktop ONNX analyzer ingestion | PARTIAL | The API seam exists and works; the producer lives in `wappflow-desktop` and is out of scope here |
| Studio Brain | SHIPPED | — |
| Studio AI selections / gallery-from-selection / album draft | SHIPPED | — |
| Studio Copilot | PARTIAL | Requires an AI provider key (503 otherwise); no AI metering |
| Galleries + publish + share link + WhatsApp delivery | SHIPPED | **No delete-gallery route exists at all** |
| Gallery password protection | PARTIAL | Protects the listing only, not the files (see below) |
| `is_hidden` on gallery assets | STUB | Column read by four queries, written by nothing |
| Gallery expiry (`expires_at`) | SOLD-NOT-BUILT | Column declared and explicitly labelled a roadmap feature (`media-studio.js:1301`); never written, never read, never enforced |
| Client favourites / comments | SHIPPED | — |
| Client named collections | PARTIAL | Saved and notified, but `GET /api/media/galleries/:id/collections` has **no frontend consumer** — the photographer can never open one |
| Story sections | SHIPPED | Derived from folders; only appear if the photographer used folders |
| Proofing / selection sets | PARTIAL | The `quota` is displayed but **never enforced** on the select route (`:2827`) |
| ZIP export + watermark burn | PARTIAL | Reads sources from local disk only — broken on R2 (see below) |
| Library watermarking | SHIPPED | Lost on edit (see below) |
| Albums + PDF export | SHIPPED | Local-disk-only image sourcing, same R2 gap |
| Portfolio + vanity handle + 10 themes | SHIPPED | — |
| Print store | SHIPPED | — |
| Print recommendations | SHIPPED | — |
| Milestones | PARTIAL | Full CRUD API, rendered in the client portal, but **no photographer-facing UI** creates them |
| Marketplace packs (`ms_pack`) | STUB | CRUD exists, self-described as "architecture only, no store UI"; nothing in `/studio` reads it |
| Storage quota enforcement + warnings | SHIPPED | — |
| Media worker queue + observability | SHIPPED | Single-process; the lease column anticipates multi-worker but only one runs |

### Concerns — bugs, security weaknesses, data-integrity risks, smells

**Security**

1. **Every media file is world-readable.** `server.js:116-120` serves `/uploads` as unauthenticated static with `Access-Control-Allow-Origin: *`. Originals, thumbs, web variants, watermarked variants, edit renders and **album PDFs** all live there. A password-protected gallery therefore protects only the *listing*; anyone with a file URL bypasses the password entirely. `variants.original` is handed to the browser in `shapeAsset` for authed users, and to the public portal whenever the download policy is `high-res`.
2. **`generateId()` uses `Math.random()`** (`server.js:1091`), not a CSPRNG. Those ids are used as capabilities: `GET /api/media/exports/:id/file` (`media-studio.js:1786`) has **no `auth` middleware** and its comment states "the id is the capability." Asset ids also form public variant filenames. Gallery share tokens and portfolio tokens correctly use `crypto.randomBytes`, so this is inconsistent as well as weak.
3. **Weak gallery password hashing** — `pwHash` (`:1530`) is a single unsalted-except-for-gallery-id SHA-256 with no work factor, trivially brute-forced offline if the DB leaks.
4. **`portalAllowed` fails open** (`:1533`): a gallery whose `visibility = 'password'` but whose `password_hash` is NULL returns `true` and is fully public. Setting `visibility` without a password via `PUT /api/media/galleries/:id` (`:1652`) produces exactly that state.
5. **Unauthenticated export amplification** — `POST /api/media/portal/:token/export` (`:2801`) lets anyone with a share link enqueue an unbounded number of full-gallery ZIP builds. There is no rate limit, no dedupe against an existing ready export, and every ZIP counts against the workspace's storage quota. This is a cheap DoS and a billing-impact vector.
6. **Path traversal in watermark apply** — `keyToPath` (`:294`) does `path.join(uploadsDir, userInput)` after stripping only a leading origin and `uploads/`. `req.body.config.logo_url = '../../../some/file.png'` escapes the uploads root and is read by `Jimp.read`, then composited onto client photos. Authed-only and limited to decodable images, but real.
7. **Studio sub-features are sold but never gated.** `entitlements.js:45,49,71,73` sells `studio_brain`, `ai_asset_scoring`, `ai_hero_shot`, `ai_culling`, `ai_project_intelligence`, `gallery_collections`, `story_sections`, `advanced_proofing`, `portfolio_management` as Studio-tier-and-above, and the landing page advertises exactly that (`wappflow-web/src/app/page.js:1805-1806,1957,1961`). A repo-wide search finds these keys **nowhere except the plan matrix** — no backend check, no UI lock. Creator-plan customers get all of it.

**Correctness / data integrity**

8. **The exposure composite is inverted for dark frames.** The worker writes `exposure` as 0..1 mean luminance (`media-worker.js:175`), but `computeComposites` treats it as a signed deviation: `expo = clamp01(1 - Math.abs(v('exposure')))` (`analyzers/index.js:153`, whose own comment says "expects −1..1 deviation"). A correctly exposed frame (0.5) scores 0.5; a **pitch-black** frame (0.0) scores a perfect 1.0. Every `hero`/`portfolio`/`album` composite inherits the error, which means the AI selections and print recommendations promote underexposed frames.
9. **ZIP and PDF export are broken on R2.** `processZipExport` (`media-worker.js:527`) and `processPdfExport` (`media-worker.js:604`) both source images with `path.join(uploadsDir, key)` + `fs.existsSync`, skipping anything missing — with no `storage.getBuffer` fallback, unlike every other worker path. On `STORAGE_PROVIDER=r2` a gallery ZIP silently ships **zero files** and an album PDF renders **blank pages**, while both still report `status = 'ready'`.
10. **Editing a photo silently strips its watermark.** `processRenderEdits` rebuilds `variants` from scratch (`media-worker.js:459`) and never carries `watermarked` forward. An edited photo in a watermarked gallery reverts to an unprotected web render. The same happens on edit-reset.
11. **`download_url` can leak the full-res original.** In `shapePublicAsset` (`:1540`) the `web` policy falls back `watermarked || web || original`. Any asset whose ingest degraded (no jimp, RAW without a preview, video) has no `web` variant, so a "web only" gallery hands out the untouched original.
12. **`purgeAsset` leaves orphans** (`:924`). It deletes from `ms_assets`, `ms_asset_scores`, `ms_cull_decisions` and `ms_portfolio_items`, but not from `ms_gallery_assets`, `ms_client_favorites`, `ms_client_comments`, `ms_proofing_selections`, `ms_fav_collections`, `ms_album_pages.slots`, `ms_video_clips` or `ms_asset_analysis`. Published galleries keep joining rows that no longer exist and album pages keep dead slot references.
13. **`ms_gallery_access` grows without bound** — `GET /api/media/portal/:token` (`:2672`) INSERTs a fresh row on every non-preview page load. It is never read by any query and never pruned.
14. **`canManage` fails open on role** (`:348`): `const role = req.userRole || 'super_admin'`. `server.js:212` also defaults a missing workspace-member row to `super_admin`. Anyone whose membership row is absent gets destructive-op rights.
15. **Proofing quota is decorative.** `ms_proofing_sets.quota` is surfaced in the portal payload and the copilot context but the selection route (`:2827`) never compares `count` against it, so a client asked for 40 can select 400.
16. **Worker scores bypass the score vocabulary.** `processIngest` INSERTs `quality`, `clipping`, `high_clip`, `shadow_clip` directly (`media-worker.js:287-293`) rather than through `intel.recordScores`, so they are not in `SCORE_TYPES` and are not deleted when the `technical` analyzer is re-run by an external producer. A desktop re-analysis leaves stale `quality` values behind.

**Smells**

17. `POST /api/media/galleries/:id/album-from-favorites` (`:778`) creates a **gallery**, not an album — the name lies, and the created gallery gets no `lead_id` and no `created_by`.
18. `media-studio.js` is a 2,880-line module that also owns the entire video-timeline surface (`ms_timelines`, `ms_video_exports`, LUTs, templates, AI drafts) despite its header describing a "vertical slice: Projects → Ingest → Library."
19. Two watermarking implementations with different rendering (`media-studio.js:308` vs `media-worker.js:485`) and two independent `settings.watermark` interpretations (a project-level config object vs a gallery-level string).
20. The `notify` dependency is shadowed by a local boolean inside the publish handler (`:1729`).
21. Album `pdf_url` is a raw `/uploads` path (`:1897`) while gallery ZIPs go through a route — two different download models for the same class of artifact.

### Where the repo's own docs disagree with the code

`MEDIA-STUDIO-COMPLETE.md` opens with "Status (2026-06-06): feature-complete" and a metrics table claiming **1,423 LOC**, **17 tables**, **60 endpoints**, **3 worker job types** and **7 web pages**. The code today is ~2,880 LOC in `media-studio.js` alone, **37 tables** across the module family, **115 route registrations** in that one file, **8 worker job types**, and 22 studio-related frontend files. Believe the code. `PRODUCT-AUDIT.md:917` independently records that the client gallery is hardcoded to a gold accent with a "WappFlow Media Studio" footer — that is now stale too: `/api/media/portal/:token` returns a `brand` object from `public-brand.js` and the page renders `PublicBrandMark`/`PublicFooter`.

### UNKNOWNs

- **UNKNOWN: whether R2 is actually in use in production.** `STORAGE_PROVIDER` defaults to `local`; no deployment config was inspected. The R2-specific defects (#9) are latent-or-live depending on that value.
- **UNKNOWN: whether the desktop Local AI Engine is producing `vision-v1` scores against any live workspace.** The ingestion API exists and is exercised by tests, but the producer lives in `wappflow-desktop/`, outside this section's scope.
- **UNKNOWN: real-world scale behaviour.** `GET /api/media/projects/:id/assets` allows `limit=10000` and both the library and cull pages request 5,000 assets in one call, with a correlated subquery per score type per row. No load testing or production timing data was available.
- **UNKNOWN: whether `ms_audio_tracks`, `ms_luts` and `ms_video_templates` are seeded with built-ins on a fresh install** — the `workspace_id IS NULL` "system" rows are read by the video routes but I did not locate a seeder.
- **UNKNOWN: how `client_portal` visibility differs from `private`** — it is an accepted enum value but no route branches on it; only `password` is treated specially by `portalAllowed`.
- Note on line numbers: `media-studio.js` was being actively edited during this documentation pass (2,871 → 2,882 lines). Citations reflect the file at ~180,831 bytes; references beyond line ~2,400 may drift by a few lines.
