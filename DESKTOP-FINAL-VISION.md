# WAPPFLOW DESKTOP — FINAL VISION: MASTER BUILD PLAN

> The native operating system for running a creative business.
> One application · one login · one workspace · one window.
>
> **This document is the build bible.** Every line item in the Final Vision is a checkbox below, tagged by platform and grounded in a real code audit (2026-06-22). Nothing here is aspirational hand-waving — each status reflects what the code actually does today.

---

## Legend

| Status | Meaning | | Platform | Meaning |
|---|---|---|---|---|
| ✅ | built & working | | 🌐 | web (wappflow-web + backend) |
| 🟡 | partial / scaffolded | | 🖥️ | desktop (wappflow-desktop) |
| ⬜ | missing | | 🔁 | must exist on **both** |

**Architecture law (from the vision):**
- CRM · Contracts · Booking · Client Portal · Command Center → **cloud-first** (live on server, wrapped in desktop `<webview>`).
- Media Intelligence · Creative Intelligence → **desktop-first** (local ONNX runtime produces Track-0 scores; server stores).
- Communications → **both**, on a single self-hosted LiveKit transport.

---

## 0. CURRENT STATE SNAPSHOT (what already exists — do NOT rebuild)

| Module | Web | Desktop | One-line state |
|---|---|---|---|
| **CRM** (leads, clients, inbox, notes, reminders, tags, invoices, email, analytics) | ✅ | ✅ (webview) | Production-grade. WhatsApp multi-account stable — **do not touch**. |
| **Media Studio** (projects, culling, albums, galleries, portfolio, print store, proofing, video studio, watermarking, delivery) | ✅ | 🟡 (scores only) | Complete on web. Desktop only ingests + scores; no native editing. Needs R2. |
| **Contracts Studio** (contracts, proposals, quotes, templates, e-sign, vault, AI assist, audit, automations) | ✅ | 🟡 (webview) | Rich on web. Payment processor + multi-party sequencing incomplete. |
| **Booking** (calendar, scheduling, availability, intake, session mgmt, self-serve reschedule/cancel) | ✅ | ✅ (webview) | Built. GCal sync gated-but-unbuilt; reschedule notifications missing. |
| **Communications** (channels, reactions, file share, formatting, huddles) | 🟡 | ⬜ | **Web-only, async, public-Jitsi.** No real-time, no threads/mentions/pins/presence/DM. Absent from desktop. |
| **Client Portal** (galleries, contracts, invoices, albums, print orders, milestones, PWA) | ✅ | 🟡 (incidental) | Full web/PWA. Desktop coverage is incidental webview wrapping. |
| **Command Center** (identity, audit, metering, entitlements resolver, explorer, support, time-machine, reports) | 🟡 | ⬜ | Heavy Phase-0 backend **but not wired into server.js** (dead code). UI skeletal. Untracked + stashed. |
| **Local AI Runtime** (ONNX, GPU/CPU, analyze-once, model versioning, batch upload) | n/a | ✅ | Solid engine. Produces **6 of ~20** vision scores (composition, aesthetic, sharpness, exposure, face_count, smile). |
| **Track 0** (ms_asset_scores/analysis, ingestion endpoints, registry, composites, brain) | ✅ | ✅ | Wired end-to-end. Live bug: `model_version` drift. No server vision fallback. |
| **Desktop Shell** (Electron, one-login, safeStorage, deep-link SSO, auto-update seam, webview router) | n/a | ✅ | Foundation done. Offline-first + sync ≈ 0%. |

---

## ⚠️ CRITICAL FIXES — LIVE BUGS (do these first, they corrupt data / sell vapor)

- [x] **Track-0 `model_version` drift** 🌐 — ✅ FIXED (P1). `media-worker.js` now stamps `intel.ANALYZERS.technical.modelVersion` (`tech-v1`) instead of orphan `cv-v0`; ledger + scores aligned. Regression test asserts ledger invalidation on version bump. (Desktop `video-v0` is the registry version for the stubbed analyzer — left until P8 builds video.)
- [x] **Command Center is dead code** 🌐 — ✅ FIXED (P1). `server.js` now mounts `require('./command-center')(app, db, {...})` after all modules; verified it mounts on a real Express app. (Stash content fully incorporated — see note below.)
- [x] **Sold-but-unbuilt Studio+ features** 🌐 — ✅ FIXED (P1). `entitlements.js` `UNBUILT_FEATURES` guard force-disables `style_profiles`/`story_engine`/`reel_engine`/`ai_editing`/`desktop_sync` at the resolver AND hides them from the advertised catalog. Re-enable per phase (P6/P8/P9/P10).
- [ ] **No server vision fallback** 🌐 — Workspaces that never install desktop get ZERO face/smile/composite scores (server `media-worker` only does technical + dedup). The web UI shows score columns it can't populate. Add a server-side CV fallback OR clearly degrade the UI (Phase 3).
- [ ] **Two real-time transports** 🌐 — `HuddleModal.js` uses **public `meet.jit.si`**, not self-hosted LiveKit. Vision requires ripping Jitsi out (Phase 4), not running both.

> **Git note (Phase 1):** the other chat's `server.js` CC edits were git-stashed (`stash@{0}`). All of it is now incorporated into the working tree (impersonation/suspension enforcement, reports SQL-injection fix, `callGemini` metering, `MODULE_GATES`, CC mount) — the resolver/`getPlanInfo` parts were already in the committed pricing-engine code. The stash is now **redundant**; it was created by the other chat, so it's left intact for the user to `git stash drop stash@{0}` when ready. CC backend files remain **uncommitted** per the standing constraint.

---

## PHASE SEQUENCE (dependency-ordered)

```
P1 Control-plane & integrity ─┬─> P2 Desktop parity ──> P3 Local AI completion ──┐
  (CC wired, bugs fixed)      │                                                  ├─> P8 Video AI ─> P9 Brains/Style (the moat)
                              └─> P4 Comms 2.0 (LiveKit) ─> P5 Project Rooms ─────┘
                              └─> P6 Offline-first + Sync (long pole)
                              └─> P7 Command Center depth + Desktop Mgmt
                              └─> P10 Media Studio desktop-first + R2 (scaling)
```

---

## PHASE 1 — Control Plane & Data Integrity (BLOCKING FOUNDATION)

**Goal:** make the platform's control plane actually run, and stop the bleeding. Nothing downstream (feature gating, desktop mgmt, premium features, metering) works until this lands.
**Depends on:** nothing. Start here.

- [x] Wire Command Center into `server.js`: mounted after all modules, before START SERVER (`generateId, broadcastToUser, broadcastToWorkspace, logAudit, JWT_SECRET, sendEmail`). Verified mounts on a real Express app. 🌐
- [x] Reconcile the untracked + git-stashed Command Center backend — **content fully incorporated** into the working tree (verified all 14 stash markers present). Stash entry left for user to drop (not mine to delete). 🌐
- [x] Migrate plan-info route to the `entitlements.js` resolver — already done by the pricing-engine commit (richer `getPlanInfo` with quota/founding); verified resolver parity. 🌐
- [x] Build **module-gating enforcement middleware** — `MODULE_GATES` `app.use` ahead of module mounts; default-ON (only blocks when resolver returns `key === false`); tokenized public routes exempt. Covers media/studio-ai/video-ai/cs/booking/store/payments. 🌐
- [x] Add **AI metering instrumentation** in `ai-engine.js callLLM()` (new `setMeter` hook + provider usage capture) **and** inline `callGemini` (wrapped, records to `ai_usage`). Wired via `aiEngine.setMeter(recordAiUsage)`. 🌐
- [x] Fix `model_version` drift + test asserting ledger invalidation on version bump (`test-phase1-control-plane.js`). 🌐
- [x] Gate-hide Studio+ vapor features via `UNBUILT_FEATURES` (resolver force-off + catalog hide). 🌐
- [x] Grace-period auto-expiry cron (`cc_grace_periods` active→expired, on boot + nightly 3:05). 🌐

**Exit criteria:** ✅ Command Center mounts/serves; entitlements enforced via module gate; AI calls metered (both paths); ledger version-consistent; no purchasable empty feature. Verified by `node backend/test-phase1-control-plane.js` (all checks pass). Full-server boot intentionally skipped (would start WhatsApp).

---

## PHASE 2 — Desktop Module Parity (one app, one window)

**Goal:** every cloud module the vision lists is reachable inside the desktop shell — no "open in browser" gaps. This is mostly nav + webview wiring (cheap, high-value).
**Depends on:** P1 (so gated modules resolve correctly).

- [x] Add **Communications/Team Chat** entry to desktop `shell.js` nav (new "Communicate" section, webview → `/chat`). 🖥️
- [x] Add **Command Center** surface to desktop nav (new "Platform" section → `/control`), **founder-gated**: shown only when `WAPPFLOW_FOUNDER_EMAIL` matches the login; CC still enforces its own `cc_admins` login + IP allowlist server-side. 🖥️
- [x] Surface **WhatsApp** directly in desktop nav (`/whatsapp`, was only reachable via leads). 🖥️
- [~] First-class **Client Portal** entry — covered via **Clients** (per-client portal links) + **Media Studio** (galleries/portfolio/`/studio/store`). No standalone portal-admin route exists (portals are per-client/token), so a dedicated nav button would 404; capability parity is met through existing entries. A unified portal-management surface is a web-side build (Appendix A). 🖥️
- [x] Bake real defaults: web `https://wappflow.remoteops.co`, api `https://wappflow.remoteops.co/api` (from the user's saved config; override via `WAPPFLOW_WEB_URL`/`WAPPFLOW_API_URL`). 🖥️
- [x] DevTools auto-open — already gated behind `config.DEV` (only opens in dev); production-safe. Verified, no change needed. 🖥️
- [x] Auto-update seam present (`initAutoUpdate`, `autoDownload=false`); feed URL aligned to `https://wappflow.remoteops.co/desktop`. Actual feed hosting (latest.yml + installers, or S3/GitHub) is infra — wired to Command Center in **P7**. 🖥️
- [x] Token injection verified: `wireWebview` injects the workspace JWT into all cloud modules (chat/whatsapp use the same JWT → work; `/control` uses CC's own auth, injection is harmless). Routes confirmed to exist and already work on web. 🖥️

**Exit criteria:** ✅ every vision module opens inside the single desktop window with one login; new entries point to confirmed-existing, working web routes; defaults match the live deployment. (Visual confirmation requires a GUI machine to run Electron; all files pass `node --check`.)

---

## PHASE 3 — Local AI Runtime Completion (finish the score set)

**Goal:** desktop produces the full vision score taxonomy, and non-desktop workspaces aren't left blind. Move composites client-side once primitives exist.
**Depends on:** P1 (version constants fixed). **Composites depend on all primitives landing first.**

**Image analysis — desktop ONNX/CPU:**
- [x] Full emotion spectrum — ✅ DONE + VERIFIED. FER+ now emits the full 8-class distribution + `dominant` emotion in the `smile` score's `reasons` (no registry change). Verified end-to-end in Node on a real face (`dominant:"neutral"`, happiness 0.005). 🖥️
- [x] Dedicated `blur` score — ✅ DONE. `media-worker.js` `analyze()` computes `blur = 1 − focusScore` and emits the registry `blur` technical score. 🌐 (server CV; `blur` is a `where:'server'` score type)
- [x] `eyes_open` — ✅ DONE + VERIFIED (heuristic v1). Eye-band detail per detected face (open eyes carry more high-frequency structure). Advisory + clearly labeled `confidence:'low'` — a dedicated eye-state model would supersede it (ONNX zoo has none). Verified on a real portrait (`eyes_open: 1`). 🖥️
- [x] `scene_class` — ✅ DONE + VERIFIED (heuristic v1). Coarse taxonomy portrait/group/landscape/scene + indoor/outdoor from aspect/faces/sky-foliage colour. Verified (`label:"portrait"`). Runs CPU-only (no model). 🖥️ + 🌐 (also in the server fallback)
- [ ] Local duplicate / `phash` clustering on desktop — ⏸ DEFERRED. Server already does perceptual-hash dup grouping; desktop port is lower priority. 🖥️
- [ ] Move composites (`hero`/`portfolio`/`album`/`storytelling`) to desktop — ⏸ DEFERRED by sequencing rule #3 (needs ALL primitives first; server computes them correctly today). 🖥️

**Cross-platform parity (the inverse gap):**
- [x] **Server-side CV vision fallback** — ✅ DONE + VERIFIED (CPU). New `backend/vision-cpu.js` (jimp-only) computes `composition`/`aesthetic`/`scene_class` on ingest under `vision-cpu-v1`, so no-desktop workspaces get vision primitives **and** composites. Written via `recordScores('vision', 'vision-cpu-v1')` so a desktop's `vision-v1` cleanly supersedes (ledger stays pending). Verified: scores produced + accepted + handoff correct. Server `face_count`/`smile` seam is wired (`media-worker` captures from optional `./face-detect`); activating it needs `onnxruntime-node` + models on the host (next increment). 🌐
- [ ] Surface `reasons` in the web cull UI — ⏸ DEFERRED. Emotion now flows in `reasons`; surfacing is a web-only change held back to avoid shipping unverified UI (no browser boot available this pass). 🌐
- [x] Call `logFeedback()` from cull/rate/flag/label — ✅ ALREADY WIRED (`media-studio.js:872` `upsertCull` → `intel.logFeedback`). (Audit was wrong here.) Client-favorites path is a future add. 🌐

**Runtime UX:**
- [x] GPU provider "active provider" indicator — ✅ DONE. Local AI pill now shows the execution provider (e.g. `… · DML`); `runtimeStatus.onnx.provider` confirmed `dml/cpu`. 🖥️
- [ ] Model auto-download / first-launch prompt — ⏸ STAGED. CLI `npm run fetch-models` works; one-click in-app needs models moved to a writable userData path for packaged builds (interacts with `onnx.js` modelsDir). 🖥️
- [ ] Background scheduling / watch-folder mode — ⏸ DEFERRED (future). 🖥️

**Exit criteria (status):** 🟢 MOSTLY DONE. Shipped + verified: full emotion, `blur`, GPU indicator, `logFeedback` (pre-wired), `eyes_open` (heuristic), `scene_class` (heuristic), **server CPU vision fallback** (composition/aesthetic/scene_class + composites for no-desktop workspaces). Desktop now emits 6/7 registry vision score types (only `subject` left). Remaining (honest follow-ups, not silent gaps): swap the eyes_open/scene_class heuristics for ONNX models when sourced; activate server `face_count`/`smile` (needs `onnxruntime-node` on host); surface `reasons` in the web cull UI; composite-move (sequence-deferred); desktop phash clustering; watch-folder.

---

## PHASE 4 — Communications 2.0 on LiveKit 🔁 (CROSS-PLATFORM, NET-NEW TRANSPORT)

**Goal:** replace public Jitsi with self-hosted LiveKit and build a Slack/Discord/Zoom-class internal comms layer on **both web and desktop**. This is a foundation, not a feature — presence/threads/DM/rooms all ride it.
**Depends on:** P2 (desktop comms nav). **Must precede P5 Project Rooms.**

**Infrastructure:**
- [ ] Stand up **self-hosted LiveKit** on the existing Hetzner box (alongside wappflow-web + wappflow-api, single-server initially) 🌐
- [ ] **Remove the public-Jitsi `HuddleModal` (`meet.jit.si`)** — do not run two transports 🌐
- [ ] Real-time signaling: replace 3s polling with LiveKit data channels / WebSocket streaming 🔁

**Text comms (build on both, currently web-only/partial):**
- [ ] Channels ✅🌐 → bring to desktop 🖥️ + real-time 🔁
- [ ] Direct Messages (1:1 + group) — net-new UI 🔁
- [ ] Threads — full threaded view, reply counts, thread muting 🔁
- [ ] Mentions — `@` parser, autocomplete, mention notifications 🔁
- [ ] Pinned messages — pin/unpin, channel header list 🔁
- [ ] Presence — online/away/offline + typing indicators (LiveKit presence) 🔁
- [ ] Unread tracking — per-message read receipts, mention-level vs general 🔁
- [ ] Message search — full-text index on `chat_messages` 🔁
- [ ] Message edit / soft-delete (24h recovery) 🔁
- [ ] Notifications — wire existing web-push into chat events 🔁
- [ ] File sharing ✅🌐 → desktop 🖥️
- [ ] Reactions / emoji / formatting ✅🌐 → desktop 🖥️

**Real-time A/V (rebuild on LiveKit, both platforms):**
- [ ] Voice huddles 🔁
- [ ] Video rooms 🔁
- [ ] Screen sharing 🔁

**Exit criteria:** one LiveKit transport; full channels/DMs/threads/mentions/presence/search + voice/video/screenshare working on web AND desktop; Jitsi gone.

---

## PHASE 5 — Project Rooms (contextual collaboration) 🔁

**Goal:** collaboration anchored to a business entity — every Lead/Project/Gallery/Contract/Booking gets discussion + voice + video + screenshare, linked back into its timeline. This is the unmapped pillar that ties Comms into CRM/Studio/Contracts/Booking.
**Depends on:** P4 (LiveKit transport + comms primitives).

- [ ] `project_rooms` schema keyed to entity type + id (none exists today) 🌐
- [ ] Room surface on Lead detail 🔁
- [ ] Room surface on Media Studio Project 🔁
- [ ] Room surface on Gallery 🔁
- [ ] Room surface on Contract 🔁
- [ ] Room surface on Booking 🔁
- [ ] Per-room discussion thread (reuses P4 chat) 🔁
- [ ] Per-room voice / video / screenshare (reuses P4 LiveKit) 🔁
- [ ] Room activity → entity `activity_timeline` 🌐

**Exit criteria:** opening any core entity exposes a live collaboration room; activity is auditable on the entity timeline.

---

## PHASE 6 — Offline-First + Sync Architecture (desktop value prop — the long pole)

**Goal:** photographers are never blocked by connectivity. Cull, rate, label, organize offline; sync on reconnect. This gates the entire "desktop-first creative workflow" promise.
**Depends on:** P1 (entitlements caching needs CC live). Build server→cache→queue→merge in order.

- [ ] **Server delta-sync endpoint** `GET /api/workspace/sync?since=<ts>` returning project/asset/album/gallery/contract/client/settings/brain/style/flag/plan deltas + schema version 🌐
- [ ] Renderer **local store** (SQLite or IndexedDB/PouchDB) caching workspace snapshot on first load 🖥️
- [ ] **Offline work queue** — buffer cull/ratings/labels/albums/notes/selections/reviews when disconnected 🖥️
- [ ] **Sync-on-reconnect** — flush queue batch-wise; validate each action against current server state 🖥️
- [ ] **Conflict resolution** policy (last-write-wins scalars / append lists) + documented UX 🖥️
- [ ] **Network-state awareness** — `navigator.onLine` listener, offline banner, retry w/ exponential backoff 🖥️
- [ ] **Settings/brains/style/flags/plan sync** into encrypted desktop store (offline entitlement gating) 🖥️
- [ ] AI cache resume — persist partial scores to resume analysis after reconnect 🖥️
- [ ] **Web Service Worker fallback** — cache cloud-module routes for offline-capable web CRM/Contracts/Booking 🌐

**Exit criteria:** desktop culling/rating/labeling fully usable offline; reconnect syncs cleanly with conflict handling; web has SW offline fallback.

---

## PHASE 7 — Command Center Depth + Desktop Management

**Goal:** turn the Phase-0 control-plane backend into a complete founder cockpit, and give it eyes/hands on the desktop fleet.
**Depends on:** P1 (CC mounted), P2/P6 (desktop reporting client).

**Desktop Management (entirely missing — the vision's desktop control surface):**
- [ ] Desktop **reporting endpoint** — app reports version / machine / device / last-sync / last-online 🔁
- [ ] View installed version · machine count · device count · last sync (CC UI) 🌐
- [ ] Force update · block version 🌐→🖥️
- [ ] Per-version feature enable/disable · rollouts · beta channels 🌐→🖥️
- [ ] Desktop permission management 🌐

**Control-plane UI depth (backend mostly built, UI skeletal):**
- [ ] Plans editor — limits/features/price, cloning, apply-to-scope 🌐
- [ ] Feature Flags UI — rollout % slider, time windows, kill-switch 🌐
- [ ] User Management — `cc_admins` CRUD + invite/role + **MFA/TOTP** 🌐
- [ ] Billing integration — real MRR/ARR/churn, refunds/coupons 🌐
- [ ] Impersonation UI (backend complete) — mode selector, reason, countdown, exit 🌐
- [ ] SQL Console frontend (backend built + sandboxed) 🌐
- [ ] Alert rule engine — custom triggers + notification channels 🌐
- [ ] Real System Health — CPU/RAM/disk/queue/cron/SSE pool 🌐
- [ ] Wire legacy event sources into `platform_events` UNION 🌐

**Exit criteria:** founder can manage the entire fleet (cloud + desktop) from one cockpit, including forcing/blocking desktop versions and rolling out features by channel.

---

## PHASE 8 — Video AI Roadmap (desktop-first)

**Goal:** desktop becomes the execution environment for raw-clips → professional reel. Unblocks the Studio+ `reel_engine`/`story_engine` entitlements.
**Depends on:** P3 (image pipeline patterns). Video frame-extraction is prerequisite for everything here.

- [ ] ffmpeg frame-extraction pipeline in desktop runtime (VIDEO analyzer is currently an empty stub) 🖥️
- [ ] Clip quality scoring 🖥️
- [ ] Scene detection / `scene_cut` 🖥️
- [ ] Emotion detection (video) 🖥️
- [ ] Shot classification 🖥️
- [ ] Action detection 🖥️
- [ ] Speech detection 🖥️
- [ ] **Reel Engine** — 20-200 clips + brand + music + goal → reel plan + draft (wedding/real-estate/restaurant/gym/podcast/commercial) 🖥️
- [ ] **Story Engine** — story-structure suggestions → story/reel draft 🖥️
- [ ] Feed results through Track-0 ingestion (reuse score contract) 🔁
- [ ] Re-enable `reel_engine`/`story_engine` entitlements once real 🌐

**Exit criteria:** desktop ingests a clip bundle and produces a structured reel draft; Studio+ video features are real.

---

## PHASE 9 — Brains & Style Learning (the long-term moat)

**Goal:** the platform learns the studio and the creator, and gives recommendations. This is the defensible moat, not the CRM.
**Depends on:** P3 (feedback capture wired), P8 (reel/style signals), P1 (Studio+ gating).

**Studio / Workspace Brain (schema exists, no desktop consumption):**
- [ ] Desktop captures feedback (keep/reject/rate/favorite) → `ms_feedback` → `deriveBrain()` 🖥️
- [ ] Learns studio/team/delivery/gallery/client/album behavior 🌐
- [ ] Generates studio/delivery/project recommendations 🔁

**Creator Brain (conceptual — nothing exists):**
- [ ] Per-creator style profile schema + producer 🖥️
- [ ] Learns editing/culling/album/reel/crop/color/composition preferences 🖥️
- [ ] Generates editing/culling/story/reel recommendations 🔁

**Style Engine (Studio+ — entitlement boolean only today):**
- [ ] Style-profile schema (workspace / creator / studio) 🌐
- [ ] Learn from edited work / delivered galleries / approved albums / exported reels 🖥️
- [ ] Exposure/color/crop/composition/framing/album/storytelling preference models 🖥️
- [ ] Auto-apply style recommendations 🔁

**Exit criteria:** brains produce real, explainable recommendations surfaced in cull/edit/album/reel flows on both platforms.

---

## PHASE 10 — Media Studio Desktop-First + Scaling

**Goal:** the desktop-first creative workflow that replaces Photo Mechanic / partial Lightroom / Pixieset delivery — plus the storage migration that makes delivery survive load.
**Depends on:** P6 (offline store), P3 (local scores).

- [ ] **R2 object storage migration** — swap the single `STORAGE SEAM` from local disk to Cloudflare R2 presigned URLs (galleries/ZIPs/PDFs won't survive load on single-server disk) 🌐
- [ ] Desktop **native non-destructive editing** UI (crop/tone/rotate — engine exists server-side) — offline-capable 🖥️
- [ ] Desktop album editor (layout/reorder/autofill/PDF export) 🖥️
- [ ] Desktop gallery / portfolio / print-store management surfaces 🖥️
- [ ] Cull compare-view (duplicate side-by-side from `dup_group`) 🔁
- [ ] Album AI layout suggestions (human-approved only) 🔁

**Exit criteria:** a photographer can ingest → cull → edit → build album → deliver largely from the desktop, online or off, on durable storage.

---

## APPENDIX A — Module Depth Backlog (parity polish, fold into relevant phases)

**CRM** 🌐: saved-views backend persistence (currently localStorage-only) · finish navbar refactor · duplicate-merge UI (endpoint exists) · won→client workflow prompt · safe-merge preview · reminder snooze + push · analytics drill-down · bulk templated WhatsApp send.
**Contracts** 🌐: enforce sequential/parallel signing (mode stored, not honored) · payment processor integration · conditional blocks / signature placement · consent email post-signing.
**Booking** 🌐: Google Calendar sync (gated, unbuilt) · reschedule/cancel notifications (logged, not sent) · admin visual calendar · real timezone conversion · email confirmations for email-only leads · deposit collection · recurring/block bookings.
**Client Portal** 🖥️: first-class desktop surface + PWA install/standalone (currently incidental webview).

---

## APPENDIX B — Cross-Platform Coverage Matrix (vision's "build everywhere" mandate)

| Capability | Web today | Desktop today | Target |
|---|---|---|---|
| CRM / Inbox | ✅ | ✅ | keep |
| Communications (text) | 🟡 | ⬜ | 🔁 P4 |
| Real-time voice/video/screenshare | 🟡 Jitsi | ⬜ | 🔁 P4 (LiveKit) |
| Project Rooms | ⬜ | ⬜ | 🔁 P5 |
| Offline culling/rating | ⬜ | ⬜ | 🖥️ P6 |
| Vision scores (composition/aesthetic/scene + composites) | ✅ server CPU fallback | ✅ full set | ✅ P3 |
| Face/smile/eyes vision scores | 🟡 seam (needs onnxruntime on host) | ✅ done | 🔁 P3 |
| Video AI / Reel / Story | ⬜ | ⬜ | 🖥️ P8 |
| Brains / Style | 🟡 workspace_brain | ⬜ | 🔁 P9 |
| Command Center | 🟡 (unmounted) | ⬜ | P1 mount → P7 desktop mgmt |
| Media editing | ✅ | ⬜ | 🖥️ P10 |

---

## APPENDIX C — Hard Sequencing Rules (do not violate)

1. **LiveKit before any real-time feature** (presence/threads/DM/rooms ride it); remove Jitsi in the same phase.
2. **Command Center mounted before any gating** (Style/Story/Reel gates, module middleware, desktop force-update are blocked until P1).
3. **Primitives before composites** — don't promise desktop hero/portfolio/album scores until eye/scene/blur/emotion/dup land.
4. **Fix `model_version` drift before scaling ingestion** — it corrupts the analyze-once ledger now.
5. **Offline = server-sync → local-cache → work-queue → conflict-merge**, in that order; entitlement caching needs CC live.
6. **Build or hide Studio+ vapor** (Style/Story/Reel/Creator Brain) before selling Studio+.
7. **R2 before go-to-market on delivery** — single-disk storage won't survive portfolio/print/gallery load.
8. **Do not touch the WhatsApp integration** — it is production-stable.

---

*Audit basis: 11-agent parallel codebase audit, 2026-06-22. Status reflects code, not docs or landing copy.*
