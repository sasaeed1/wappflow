# 🌙 Night-shift build log — 2026-06-24

Autonomous run working through the entire remaining roadmap surface (per the verified
"where we stand" table). Each wave: **build → test → commit**. Constraints held the
whole way: no WhatsApp-flow changes · additive only · no auto-migration of uploads ·
native comms (no Slack) · no new infra · local storage stays the default fallback.

Verification reality: backend can't be booted here (WhatsApp `loadAccounts`), so every
backend wave is proven with a node test harness + `node --check`; frontend with
`next build`; desktop with `node --check` (no Electron/GUI here).

---

## ✅ Wave 1 — Storage governance (roadmap R2)  · committed

**Goal:** the highest-leverage backend gaps — quota enforcement, threshold warnings,
finish R2 for the last local-only writes, and richer founder analytics.

- **`backend/storage-enforce.js` (new)** — upload-time quota gate + 80/90/100% warnings.
  - `gate(db, ws, incomingBytes)` blocks an upload that would push a workspace **over**
    its plan `storage_gb`. Fail-open; only fires when the master `pricing_config.enforcement`
    switch is on and the limit is finite. Unlimited plans + founder overrides never block.
  - `warn(db, ws, notify)` fires **one** notification per threshold crossing (dedup in a
    new `storage_warn_state` table) → feeds the existing unified `notify()` center.
  - Usage computed live from `ms_assets` + `ms_exports` (matches the CC dashboard).
- **`media-studio.js`** — gate wired into `/uploads/sign` + multipart `/assets` (with
  temp-file cleanup on block) + `/uploads/complete`; `warn()` after every successful
  upload. New **workspace-facing** `GET /api/media/storage` (used/limit/pct/level +
  by-type + largest projects) for the in-app Settings → Storage panel. **Watermark
  apply/remove made R2-aware** (read original via `storage.getBuffer`, write variant via
  `storage.uploadFile`, delete via `storage.deleteFile`).
- **`media-worker.js`** — new `localizeOriginal()` / `persistVariant()` helpers; **video
  probe + poster + proxy are now R2-aware** (download R2 original to a temp for ffmpeg,
  upload the result back to R2, clean up). Previously these silently skipped R2-stored
  videos with `file-missing`.
- **`cc-storage.js`** — overview now returns `growth_rate_gb_per_day`,
  `projected_30d_bytes`, `projected_r2_gb`, `projected_monthly_cost_usd`. New founder
  endpoints **`/api/cc/storage/by-plan`** and **`/api/cc/storage/fastest-growing`**.

**Verified:** `test-storage-enforce.js` (new) — 27 checks incl. threshold bands, gate
allow/block, warn dedup + re-crossing, enforcement master-switch, unlimited bypass, and
all CC analytics endpoints. No regression in `test-storage.js` / `test-cc-storage.js`.
All five files pass `node --check`.

**Left for the frontend wave:** the in-app Settings → Storage page (endpoint is ready);
surfacing by-plan / fastest-growing / projection on `/control/storage`.

---

## ✅ Wave 2 — Communications depth (roadmap R3, native)  · committed

**Goal:** the net-new comms features the roadmap asks for, all additive on `comms.js`,
all real-time over the existing SSE (no Slack, no new infra).

- **@channel / @everyone / @here** — `afterMessage` now expands these tokens to the
  whole channel membership (public → all workspace members; private/room → explicit
  members), minus the author, creating mention records + pings for each.
- **Thread-reply notifications** — replying (`reply_to`) now pings the root author with
  a `chat_thread_reply` event + push, when they're not the replier or already @-mentioned.
- **AWAY / DND presence** — new `user_presence` table + `POST /api/comms/presence/state`;
  `GET /api/comms/presence` returns `{ online, states, connected }`. **DND suppresses**
  push + the in-app feed everywhere (mentions, threads, calls) while still writing the
  in-app record.
- **Per-message read receipts** — `GET /api/comms/messages/:id/receipts`, derived from
  members' `last_read_at` (no new writes, author excluded).
- **Calls lifecycle + event log** — new `call_sessions` + `call_events` tables and:
  - `POST /api/comms/calls/start` — find-or-create a call on a channel; the first start
    **rings every other member** (targeted `call_invite` SSE + in-app `notify` + push,
    DND-suppressed) and logs to the lead timeline for rooms.
  - `POST /api/comms/calls/:id/event` — joined / left / **screenshare** / **raise_hand** /
    lower_hand → live roster broadcast.
  - `POST /api/comms/calls/:id/end` — duration, timeline entry, and a **missed-call**
    ping to every invited member who never joined.
  - `GET /api/comms/calls/:id` (roster + raised hands reconstructed from events) and
    `GET /api/comms/channels/:id/active-call` (join affordance).
- **server.js** — passes `notify` into the comms mount.

**Verified:** `test-comms-depth.js` (new) — 18 checks across presence/DND, @channel
expansion, thread-reply, receipts, and the full call lifecycle incl. missed-call
detection. No regression in `test-comms.js`. Fixed one bug pre-commit (receipts SELECT
omitted `user_id`, so the author-exclusion filtered every row).

**Voice notes** need no backend change — the existing chat media-send carries any audio
blob; the recorder is a frontend item (next wave). **Raise-hand** signalling is wired
here (`raise_hand`/`lower_hand` events); the in-call hand UI is frontend.

**Left for the frontend wave:** call roster + raise-hand + ringing UI, presence
state picker, receipts ticks, voice-note recorder, @-autocomplete incl. @channel.

---

## ✅ Wave 3 — Desktop native shell + offline-first (Phases 2/6/7/10)  · committed

**Goal:** close the single biggest gap — the desktop was webview-only with ~0% of the
offline-first value prop. Built the whole native layer, dependency-free (no native DB to
rebuild), with the load-bearing logic genuinely unit-tested headlessly.

**Pure, unit-tested core (`test-native.js`, 23 checks):**
- **`offline/store.js`** — JSON-backed, atomic-write local store: server-replica cache,
  local **work queue**, sync **cursor**, cached **entitlements**. Documented conflict
  policy — **LWW scalars + append-merged lists** — plus queue **reconcile** (drops a
  local write once the server record is newer than the mutation). `can()` for offline
  feature gating.
- **`offline/sync.js`** — pulls the `/workspace/sync` delta into the store and **flushes
  queued mutations** on reconnect (4xx → drop, 5xx/network → retry later); network-state
  aware with state-change emitter.
- **`reporter.js`** — fleet self-registration (`POST /api/desktop/report`) + version
  policy (`force`/`block`) matching the server contract; pure `interpretPolicy`/`cmpVer`.
- **`device.js`** — stable per-install device id + non-identifying machine facts.
- **`uploader.js`** — **direct-to-R2** via presigned PUT (server never proxies bytes) +
  a **dependency-free multipart** fallback for local-storage workspaces.
- **`watcher.js`** — debounced **watch-folder** ingestion (camera-card / Lightroom export
  → auto-upload to a project).

**Electron glue (syntax-checked; needs a GUI machine to run):**
- **`notifications.js`** (native OS toasts) · **`tray.js`** (background presence + live
  Online/Offline + queued-count + Open/Sync/Quit).
- **`main.js`** — `initServices()`: tray, report-on-launch + 30-min re-report + policy,
  sync-on-launch + 2-min sync, close-to-tray (keeps background sync alive), and IPC for
  fleet/sync/notify/watch/upload/folder-picker. `before-quit` tears down cleanly.
- **`preload.js`** — exposes `fleet` / `sync` / `notifications` / `watch` / `upload`.
- **`renderer/native.js` + `index.html`** — offline **banner**, **drag-drop** ingest
  overlay (Electron file `.path` → direct upload), upload/sync/watch **toasts**, and a
  **forced-update / blocked-version** modal.

This turns the desktop from a webview wrapper into a real native shell: works offline,
queues + syncs, reports to the fleet, ingests by watch-folder + drag-drop, uploads
straight to R2, and shows native notifications.

**Verified:** `test-native.js` (23 checks) + `npm run lint:syntax` (whole `src` tree) +
`node --check` on every new/changed file. **Cannot** boot Electron here (no GUI) — the
glue is structurally verified only; first launch on a GUI machine is the live check.

**Left:** desktop video ffmpeg analysis (Wave 5) + a tray.png asset (falls back to an
empty image today). Offline-gating of specific cloud-module routes is seamed (`can()`)
but the webview modules don't consult it yet — a follow-up.

---

## ✅ Wave 4 — Web frontend (storage UI, CC analytics, P5 rooms)  · committed

**Goal:** surface the new backends in the web app. Verified end-to-end with
`next build` → **"✓ Compiled successfully"**.

- **API clients** — `commsAPI`: `setPresence` · `receipts` · `callStart/Event/End/call/
  activeCall`. New **`storageAPI.usage`**. `ccApi`: `storageByPlan` · `storageFastestGrowing`.
- **Workspace storage page** (`/settings/storage`, new) — plan-limit meter (colour by
  level), level badge, "uploads blocked" notice at 100%, by-type + largest-projects
  breakdown. This is where the 80/90/100% notifications now deep-link.
- **Command Center storage** (`/control/storage`) — added a **projected-invoice** stat
  (+ GB/day growth rate) and two new cards: **By plan** and **Fastest growing (30d)**.
- **`RoomPanel` component** (new) — reusable contextual collaboration panel for any
  entity (find-or-create room → live discussion poll + composer + **Call** button reusing
  `HuddleModal`). Wired into the **lead detail page** as a "💬 Team Room" tab.

**Left for follow-up (component is reusable, backend supports all types):** wiring
`RoomPanel` into the project/gallery/contract/booking detail pages (their layouts differ
from the lead page's tab system — bespoke placement, deferred to avoid blind edits to
700+-line pages); deep chat-page polish (edit button, search/pins/thread panels,
@-autocomplete, presence picker, call roster UI) — the "polish later" bucket.

---

## ✅ Wave 5 — Desktop video analysis (Phase 8, the last analyzer)  · committed

**Goal:** turn the desktop VIDEO analyzer from a `return []` stub into real local video
analysis, completing the Track-0 analyzer set.

- **`ai/video-frames.js` (new, pure + unit-tested)** — deterministic aggregation of
  per-frame metrics → registry-valid video scores: **quality** (mean aesthetic),
  **motion** (mean inter-frame luma delta), **scene_cut** (density of large transitions
  + cut count), **shake** (coefficient-of-variation of motion = jitter). Plus
  `sampleTimestamps`.
- **`analyzers/index.js`** — `VIDEO.run` is now real: writes the clip to a temp file,
  extracts frames at 1 fps (capped) with **ffmpeg**, runs the same CPU vision metrics per
  frame, aggregates. **Returns `[]` without ffmpeg / on any failure — never blocks.**
  Version bumped `video-v0 → video-v1`.
- **`backend/analyzers/index.js`** — `ANALYZERS.video.modelVersion` bumped to `video-v1`
  **in sync** so analyze-once re-runs cleanly (vision path untouched).
- **`ai/engine.js`** — added `'video'` to `CLIENT_TIER` + a **guarded video pass**: fetch
  video assets, run the analyzer, upload scores. Per-asset try/catch; a missing ffmpeg
  just yields no scores. Zero impact on the working photo/vision pass (separate code).

**Verified:** `test-native.js` §7 (6 video checks: sampling, empty-safe, static→zero,
hard-cuts→high motion/scene_cut, registry-valid types) + `npm run lint:syntax` +
`node --check` on all touched files + `backend` analyzers/worker compile + reel-engine
regression still passes. **Cannot** verify the ffmpeg extraction headlessly (no ffmpeg
+ no sample video here) — the pure aggregation is fully tested; live extraction is the
on-hardware check. `speech`/`emotion`/`action` (need audio + ML) remain for a later pass.

---

## ✅ Wave 6 — Rooms in more entities + presence picker (next build ✓)  · committed

- **Contract Team Room** — added a toolbar **room button** + side-drawer modal rendering
  `RoomPanel type="contract"` on the contract builder (idiomatic with its existing
  People/Versions modals). Contract-room messages mirror to the lead timeline server-side.
- **Chat presence picker** — a 🟢 Active / 🟡 Away / 🔴 Do-not-disturb selector in the
  Team Chat sidebar header → `commsAPI.setPresence`. Added a `chat_presence` SSE case so
  the online roster updates live when teammates change state. This activates the Wave-2
  DND backend (DND already suppresses mention/thread/call pings).

**Verified:** `next build` → "✓ Compiled successfully" (`/contracts/[id]` + `/chat`).
Also added the **project** Team Room (studio detail hero button + drawer, `type="project"`)
— `next build` ✓. RoomPanel now lives on **lead + contract + project** entities.

**Still tracked (polish bucket):** RoomPanel on project/gallery detail pages (non-tab
layouts); chat edit-button / search / pins / thread panels / @-autocomplete / call
roster + raise-hand UI / receipts ticks / voice-note recorder; reel **render** (video
engine); P9 auto-apply style; entitlement un-gates (desktop_sync now shippable once the
desktop is verified on a GUI machine); video speech/emotion/action sub-scores.
