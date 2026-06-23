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
