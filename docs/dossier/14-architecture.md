## Architecture — runtime, data layer, realtime, jobs and deployment

> **Read date / volatility note.** Read from the working tree on **2026-08-24**
> (`C:/Users/DELL/Desktop/Sami/wappflow`, branch `main`, tip `c23c7af`, with uncommitted modifications
> in `backend/server.js`, `backend/booking.js`, `backend/command-center.js` and several frontend files).
> `backend/server.js` was **6,595 lines and being actively edited during this read**. Treat every line
> citation as ±25 lines and grep for the quoted code rather than trusting the number.

### What this layer is *for*

WappFlow is a single-tenant-per-workspace business operating system for photo/video studios: leads and
WhatsApp conversations, contracts, shoots and galleries, bookings, invoices and payments, all in one
product. The architecture exists to make that feel like **one** application rather than seven, on a
budget that a two-person company can actually run.

The shape that follows from that goal is deliberately old-fashioned and deliberately small: **one Node
process, one SQLite file, one filesystem tree, one long-lived browser connection, one React shell.**
There is no message broker, no Redis, no separate worker fleet, no ORM, no migration tool. Modules are
plain functions that are handed the same `app` and the same `db` and asked to add routes and tables to
them. Everything in this section is a consequence of that choice — including its hard ceiling, which is
that **the API is not horizontally scalable as written** (see *Risks*).

---

### 1. Process model and topology

Two long-running Node processes under **pm2**, behind **nginx** with **certbot**-issued TLS, on a single
VPS. `deploy.sh` restarts exactly two pm2 apps by name:

```
pm2 restart wappflow-api wappflow-web --update-env        # deploy.sh
```

| pm2 app | What it runs | Port | Source |
|---|---|---|---|
| `wappflow-api` | `node backend/server.js` — Express 5, all REST, the SSE bus, the media job worker, the WhatsApp Puppeteer sessions, the IMAP poller, and every cron | 3001 (`PORT`) | server.js:6590–6595 |
| `wappflow-web` | `npm --prefix wappflow-web run start` — `next start`, Next.js 16 App Router | 3000 | DEPLOYMENT.md:454–455 |

```
                      Internet (HTTPS, certbot certs)
                                  │
                        ┌─────────▼─────────┐
                        │       nginx       │  proxy_buffering off;
                        │  wappflow.remote  │  proxy_read_timeout 86400;  ← SSE needs both
                        │      ops.co       │  client_max_body_size 16M;
                        └────┬─────────┬────┘
                   /api/*, /uploads/*  │  everything else
                             │         │
            ┌────────────────▼───┐  ┌──▼──────────────────┐
            │ pm2: wappflow-api  │  │ pm2: wappflow-web   │
            │ 127.0.0.1:3001     │  │ 127.0.0.1:3000      │
            │ Express 5 monolith │  │ next start (.next)  │
            └───┬────────┬───────┘  └─────────────────────┘
                │        │
      ┌─────────▼──┐  ┌──▼─────────────────────────────────┐
      │ SQLite WAL │  │ DATA_DIR filesystem                │
      │ wappflow.db│  │  uploads/{logos,voices,avatars,    │
      │ (+ -wal,   │  │          images,videos,files,      │
      │    -shm)   │  │          media/{variants,tmp}}     │
      └────────────┘  │  .wwebjs_auth/session-*  (Chromium)│
                      └────────────────────────────────────┘
```

Production is a **single origin** — `https://wappflow.remoteops.co` — with nginx routing `/api/` to
:3001 and everything else to :3000 (evidenced by the desktop app's baked defaults,
`wappflow-desktop/src/main/config.js:16–17`, and `wappflow-web/src/app/layout.js:12`). The nginx block in
`DEPLOYMENT.md:465–507` shows a *two-subdomain* variant (`api.` + `app.`); both work, but the single-origin
form is what production actually uses.

Nginx must set `proxy_buffering off` and a long `proxy_read_timeout`, or the SSE stream (§4) is buffered
into uselessness. The backend also sends `X-Accel-Buffering: no` on the stream as a belt-and-braces
measure (server.js:978). `app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1))` (server.js:37) so
`express-rate-limit` and `req.ip` see the real client rather than 127.0.0.1.

**UNKNOWN:** the exact host/paths of the live server. Repo memory says OVH at `/var/www/wappflow` as user
`ubuntu`, but no file in the repo records the hostname, IP, or system paths — `DEPLOYMENT.md` documents
Railway/Hetzner/DigitalOcean/Docker options that are *not* what is running. Nothing in the code confirms
the host.

**Middleware order matters and is load-bearing** (server.js:74–120):

1. `helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: 'cross-origin' })` — CSP is **off**
   because the UI is built almost entirely from inline styles; CORP is relaxed so `<img src>` on :3000 can
   load `/uploads/*` from :3001.
2. Global rate limit: 500 requests / 15 min per IP, `skip`ping `/uploads/` so an image-heavy chat does not
   429 itself (server.js:82–93). A separate `loginLimiter` (20 *failed* attempts / 15 min,
   `skipSuccessfulRequests: true`) is applied to the password login route and handed to
   `account-recovery` (server.js:96–104, 6485–6489).
3. `cors({ origin: process.env.FRONTEND_URL || '*', credentials: true })`.
4. `express.raw()` scoped to `/api/payments/webhook` **before** `express.json()` — Stripe signature
   verification needs the untouched bytes; reordering these two lines silently breaks webhook auth
   (server.js:114–115).
5. `express.json({ limit: '50mb' })`.
6. `/uploads` static with explicit `Access-Control-Allow-Origin: *`.

At the very bottom: a catch-all 404 and a single error handler that logs and returns
`{"error":"Internal server error"}` (server.js:6587–6588). Two global guards —
`process.on('unhandledRejection')` and `process.on('uncaughtException')` — swallow errors and **keep the
process alive** (server.js:25–30).

---

### 2. `DATA_DIR` — where state lives

```js
const DATA_DIR = process.env.DATA_DIR || (NODE_ENV === 'production' ? '/data' : __dirname);  // server.js:38
const db = new Database(path.join(DATA_DIR, 'wappflow.db'));                                  // server.js:41
```

`DATA_ROOT` (server.js:61) is a duplicate of the same expression, used for the upload tree. On boot the
process `mkdir -p`s `/data`, `DATA_ROOT`, and `uploads/{logos,voices,avatars,images,videos,files}`
(server.js:62–64). The worker later adds `uploads/media/variants` and `uploads/media/tmp`
(media-worker.js:54–57).

SQLite pragmas, set once at open (server.js:44–57):

| Pragma | Value | Why |
|---|---|---|
| `journal_mode` | `WAL` | concurrent readers while a writer holds the DB |
| `busy_timeout` | `5000` | without it SQLite returns `SQLITE_BUSY` *immediately*; the WhatsApp worker writes while HTTP requests read |
| `synchronous` | `NORMAL` | the standard WAL companion — durable across app crashes, at risk only on OS/power loss |
| `foreign_keys` | `ON` | cascade/guard logic now depends on declared FKs |

**WhatsApp sessions are the one thing that does not honour `DATA_DIR`.** `whatsapp-service.js:139` and
`:226` hardcode `process.env.NODE_ENV === 'production' ? '/data/.wwebjs_auth' : './.wwebjs_auth'`. Setting
`DATA_DIR` to a non-`/data` path (which the test harness does routinely) moves the database and uploads but
**not** the Chromium session store. `whatsapp-service.js:415` reads `DATA_DIR` correctly for media, so the
inconsistency is within one file.

`backend/.gitignore` excludes `wappflow.db*`, `.wwebjs_auth/`, `.wwebjs_cache/`, `uploads/` and `.env`, so
none of the live state is in git.

---

### 3. Schema installation and migration strategy

**There is no migration tool and no version table.** The schema is (re)installed by running idempotent DDL
on every boot, in mount order. The rules, as actually practised:

1. **`CREATE TABLE IF NOT EXISTS` at module mount.** server.js declares the core CRM tables inline
   (server.js:284–644); every additive module declares its own namespace inside its `module.exports =
   function mount…` body — `ms_*` in media-studio.js:63–155, `cs_*` in contracts-studio.js, `booking_*`/
   `bookings` in booking.js:35–60, `cc_*` in command-center.js:65+, `chat_*` in comms.js.
2. **Idempotent `ALTER TABLE` for every column added after the fact.** `safeAlter(sql)` (server.js:647–651)
   runs the DDL and swallows only `duplicate column` errors — anything else rethrows. media-studio.js:164–169
   defines its own identical copy. `CREATE TABLE IF NOT EXISTS` is a **no-op on an existing table**, so a
   column added to a `CREATE` statement after first deploy *also* needs a `safeAlter`; the comment at
   server.js:779–783 records exactly that bug being fixed for `reminders`.
3. **The module that creates a table owns its columns and its indexes.** Stated explicitly in
   booking.js:56–59: indexes for `bookings` live in booking.js, *not* in server.js's central index list,
   "or a fresh install races the central index list against the mount." The central list at
   server.js:886–926 carries the same caveat in a comment (server.js:923–925). Ordering also bites within a
   file: `idx_ms_assets_deleted` must run *after* the `safeAlter` that adds `deleted_at`, because on a fresh
   DB the column does not exist in the `CREATE` (media-studio.js:174–177).
4. **Cross-module columns go through a helper owned by the reader.** `soft-delete.js` `installSchema(db,
   safeAlter)` (soft-delete.js:53–62) adds `is_deleted`/`deleted_at`/`deleted_by` to registered tables, and
   **skips tables that do not exist yet** — `cs_documents` and `bookings` mount later and ship the columns
   in their own `CREATE`. Similarly `public-brand.js` exports `ensureBrandColumns(db)`, called beside its
   reader (server.js:748).
5. **One-time backfills are gated by marker rows.** Two patterns coexist:
   - `app_meta(key, value)` — the contact-history → activity-spine fold (server.js:757–777) checks
     `app_meta.backfill_history_to_activity`, and is *additionally* `NOT EXISTS`-guarded so re-running is
     harmless.
   - `payments_meta(key, value)` — the invoice → payment-ledger backfill (payments.js:70–108) checks
     `payments_meta.backfill_invoice_payments`, tagging synthetic rows `provider_ref='backfill'`.
   Other backfills are **not** marker-gated and rely on being naturally idempotent: the workspace re-key of
   `invoices`/`email_workflows` (`WHERE workspace_id IS NULL`, server.js:738–744), the per-user workspace
   creation (server.js:934–955), and the legacy private-channel membership rebuild, which runs *after* the
   comms mount and reconstructs membership from `created_by` + anyone who has posted (server.js:6521–6547).

Every backfill is wrapped in `try/catch` with a `console.error(... 'non-fatal')` — **a failed migration does
not stop the server**. Boot prints `✅ Database schema ready` (server.js:957) then `✅ Pricing/plan engine
ready` (`pricing.ensurePricing(db)` seeds the four PKR plans + Founding 100, server.js:962).

Approximately **120 tables** exist across the codebase. Namespaces: core CRM (`leads`, `messages`, `notes`,
`reminders`, `invoices`, `contact_history`, `activity_timeline`, `notifications`, `audit_logs`, `users`,
`workspaces`, `workspace_members`), `ms_*` (Media Studio, ~35 tables), `cs_*` (Contracts, 8), `cc_*`
(Command Center, 13), `chat_*` (comms, 6), `plan_*`/`workspace_usage*` (pricing), plus singletons
(`bookings`, `payments`, `client_portals`, `webhook_events`, `app_meta`, `payments_meta`).

---

### 4. Module mount order — and why it now matters

Modules are mounted as `require('./module')(app, db, deps)`. Order used to be cosmetic; it is now a
**dependency graph**, because modules inject shared *creators* into each other rather than duplicating
business logic.

| # | Line | Module | Receives | Exports upward |
|---|---|---|---|---|
| 0 | 6301–6327 | `MODULE_GATES` middleware | — | must precede all module routes |
| 1 | 6334 | `media-studio` | `ai`, `sendClientMessage`, `notify`, uploads deps | `createProject` |
| 2 | 6461 | `booking` | `createProject` (from #1), `createInvoiceForLead`, `calendar` | — |
| 3 | 6470 | `print-store` | `createInvoiceForLead`, `createPaymentLink` (**late-bound**) | — |
| 4–6 | 6478–6480 | `studio-ai`, `video-ai`, `studio-experience` | `auth`, `broadcastToWorkspace` | — |
| 7 | 6481 | `payments` | `notify`, `logAudit` | `paymentsApi.createPaymentLink` |
| 8 | 6485 | `account-recovery` | `bcrypt`, `nodemailer`, `loginLimiter` | — |
| 9 | 6491 | `contracts-studio` | `createInvoiceForLead`, `createProject`, `sendEmail` | — |
| 10 | 6517 | `comms` | `broadcastToUser`, `onlineUsers`, `sendPushToUser` | `commsApi.canSee`, `commsApi.broadcastToChannel` |
| 11 | 6550–6559 | `search`, `sync`, `reel-engine`, `brains` | `auth` | — |
| 12 | 6563–6564 | `storage` | `uploadsDir` | `/api/storage/file/:key` |
| 13 | 6571 | `command-center` | `JWT_SECRET`, `sendEmail` | — mounted **last**, "so every `ms_*`/`cs_*` table already exists" |

Two ordering idioms are worth naming because they are the seam that makes the graph tractable:

- **Eager injection** — `createProject: mediaStudioApi.createProject` at server.js:6467 works only because
  media-studio mounted at 6334. The comment says so out loud (server.js:6465).
- **Late binding** — print-store mounts *before* payments, so it receives
  `createPaymentLink: (args) => paymentsApi.createPaymentLink(args)` (server.js:6474–6476), resolving through
  a module-scope `let paymentsApi = null` (server.js:1058) at **call** time. The same trick covers `commsApi`
  (server.js:1057): the legacy chat routes defined earlier in server.js call `canSeeChannel()`
  (server.js:1046–1054) and `broadcastToChannel()` (server.js:1035–1037), both of which delegate to
  `commsApi` if it has mounted and otherwise fall back to a *deny*, never a workspace-wide send.

The `MODULE_GATES` middleware (server.js:6301–6327) sits ahead of every module's routes and returns
`403 {module, disabled:true}` when the entitlements resolver reports `features[key] === false`. It is
default-ON (only an explicit `false` blocks) and exempts tokenised public routes via a per-gate `publicRe`,
so a client opening a delivered gallery or a signing link is never gated.

Also note that `createInvoiceForLead(req, body)` (server.js:2622) is a *request-shaped* function — it reads
`req.workspaceId`/`req.userId`/`req.workspaceOwnerId`. Callers in other modules must synthesise a `req`-like
object. It exists so the invoice counter, workspace keys, CRM history line and audit row cannot drift between
the three places invoices are raised.

---

### 5. The realtime bus (SSE)

**One endpoint, one connection, unnamed frames.**

- `GET /api/events` (server.js:971–996), authenticated by `Authorization: Bearer` **or** `?token=` —
  EventSource cannot set headers, so the query-string path exists for it (server.js:204). Headers:
  `text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`. A
  `{"type":"connected"}` frame is written immediately; a `: heartbeat` comment every 25 s keeps proxies from
  reaping the socket.
- Registry: `const sseClients = new Map()  // userId -> res[]` (server.js:969). **In-process memory.**
- `broadcastToUser(userId, type, data)` (server.js:998–1008) writes
  ``data: ${JSON.stringify({ ...data, type })}\n\n``. **The `type` key is spread LAST on purpose** — a payload
  carrying its own `type` must not be able to rename the event. `notify()` used to do exactly that (its rows
  carry a category under `type`), so every notification frame went out named after the category and the
  `notification` event nobody could subscribe to never existed on the wire.
- `broadcastToWorkspace(workspaceId, type, data)` (server.js:1030–1032) fans out to member ids from a 15-second
  `memberCache` (server.js:1015–1027) — added because the raw `SELECT` ran on *every* frame, including once per
  ffmpeg progress tick during a video export. `invalidateWorkspaceMembers()` makes it exact on member mutations.
- `broadcastToChannel()` delegates to comms; `onlineUsers()` (server.js:1056) is presence, derived from who has
  a live stream.

**Framing contract (the rule the frontend enforces):** frames are written with **no `event:` line**, so
`addEventListener('lead_created', …)` receives *nothing*. Consumers must use `es.onmessage` and switch on
`data.type`. That routing lives in exactly one place — `wappflow-web/src/components/shell/realtime.js:73–86`
— which is the point.

`RealtimeProvider` is mounted in `app/providers.js:20`, **above** `AppShell`, because the shell remounts per
route and the stream must survive navigation. It reconnects with exponential backoff 1 s → 30 s
(realtime.js:88–100), reconnects on `visibilitychange` (realtime.js:104–111), and runs a 3-second
`localStorage` reconcile tick that opens a stream after sign-in and drops it on sign-out without a reload
(realtime.js:119–133). Components subscribe with `useRealtime(types, handler)`; the handler is held in a ref so
inline arrows do not churn the subscription (realtime.js:159–175). A `'*'` subscription receives everything.

Observed event names (from broadcast call sites):

| Scope | Names |
|---|---|
| Workspace | `lead_created`, `lead_updated`, `lead_deleted`, `lead_restored`, `whatsapp_status`, `email_received`, `notification`, `plan_updated`, `booking_created`/`_updated`/`_cancelled`, `payment_paid`, `print_order_created`, `cs_updated`, `cs_signed`, `chat_presence`, and the `ms_*` family (`ms_asset_processed`, `ms_scored`, `ms_gallery_created`/`_published`, `ms_assets_added`, `ms_selection`, `ms_video_export`, `ms_export_ready`, `ms_album_pdf_ready`, `ms_client_favorited`, `ms_client_commented`, `ms_proofing_submitted`, `ms_milestone`, `ms_watermark_done`, `ms_collection`, `ms_project_created`/`_updated`) |
| User | `notification`, `reminder_due`, `chat_message`, `chat_mention`, `chat_thread_reply`, `call_invite`, `call_missed` |
| Via WhatsApp `_emit` | `new_message`, `lead_created`, `lead_updated`, `missed_sync_complete` (whatsapp-service.js:76–80 routes to workspace when possible, else user) |

There is a **second, separate** SSE stream for the platform control plane: `GET /api/cc/events/stream`
(command-center.js:669–675), guarded by `platformAuth` over the `cc_admins` identity tier, with its own
`ccSse` set of responses.

**The notification bus.** `notify(workspaceId, {type, title, body, url, icon, userId})` (server.js:1091–1108)
inserts into `notifications(id, workspace_id, user_id, type, title, body, url, icon, is_read, created_at)` and
then pushes a live frame. Two rules are encoded: the row's category travels on the wire as **`kind`**, never
`type` (because `type` is the event name); and a `userId`-targeted row goes to **that user only** — previously
the DB insert was user-scoped while the live frame still went workspace-wide, so a private alert or an
incoming-call ring was pushed to everyone. Modules receive `notify` through the DI seam. Read side:
`GET /api/notifications`, `GET /api/notifications/summary`, `POST /api/notifications/read-all`,
`POST /api/notifications/:id/read` (server.js:3236–3312). The shell polls `/summary` once a minute and
republishes the counts through a tiny in-memory pub/sub (`components/shell/summary.js`) so the nav badge and
the bell share one request.

Web Push is a parallel path: `sendPushToUser()` (server.js:1061–1080) fans out over `push_subscriptions`,
deleting subscriptions on HTTP 410.

---

### 6. Background work

There is **no separate worker process**. Everything runs inside `wappflow-api`.

**The media job queue** (`ms_jobs`, media-studio.js:141–155 + `lease_until` via safeAlter at :171) is the only
real queue in the system:

```
id · workspace_id · type · asset_id · project_id · status(pending|running|done|failed)
progress · payload(JSON) · error_message · retry_count · created_at · next_retry_at
finished_at · lease_until
```

- **Atomic claim** (media-worker.js:833–838): `UPDATE ms_jobs SET status='running',
  lease_until=datetime('now','+10 minutes') WHERE id=? AND status='pending'` — only one caller's conditional
  UPDATE can report `changes === 1`.
- **Lease + reaper** (media-worker.js:840–842): jobs whose `lease_until` has passed while still `running` are
  returned to `pending`, so a crashed or hung worker's job is recoverable.
- **Drain loop** (media-worker.js:874–889): `processOnce(batch = 10)` reaps, selects `pending` jobs whose
  `next_retry_at` is null or due, ordered by `created_at`, claims each, runs it. `start(intervalMs = 5000)`
  wraps it in a `setInterval` with a `busy` re-entrancy guard and `timer.unref()` so it never keeps the process
  alive on its own (media-worker.js:891–903). Tests pass `startWorker:false` and drive `processOnce()` directly
  (media-studio.js:2877–2878).
- **Retry** (media-worker.js:858–868): `MAX_RETRIES = 3`, linear backoff `+retry*30 seconds`; on final failure
  the job goes `failed` and the asset goes `status='failed'`.
- Job types: `ingest`, `zip_export`, `pdf_export`, `render_edits`, `video_probe`, `video_poster`,
  `video_proxy`, `video_export`.
- **Control-first invariant:** the worker writes only `ms_asset_scores` and the asset's own technical metadata.
  It has *no* write path to `ms_cull_decisions`, galleries, or delivery (media-worker.js:9–14).
- Every heavy dependency (`jimp`, `exifr`, `adm-zip`, `pdfkit`, `face-detect`, `ffmpeg`/`ffprobe`) is loaded
  defensively; a missing one degrades the job, never crashes the host.

**Cron and timers** (`node-cron`, in-process):

| Schedule | Job | Where |
|---|---|---|
| `* * * * *` | Due reminders → web push + `reminder_due` SSE + bell entry | server.js:3999–4032 |
| `0 0 * * *` | `softDeleteLib.purgeExpired(db)` — the one recycle-bin sweep | server.js:4039–4050 |
| `0 8 * * *` | Contracts follow-ups | contracts-studio.js:1128 |
| `0 2 * * *` | Command Center AI metering rollup | cc-metering.js:104 |
| `0 3 * * *` / `5 3 * * *` | CC scheduled reports / expired-grace sweep | command-center.js:889, :905 |
| every 2 min | IMAP email poller (`setInterval`, DB-driven per workspace) | server.js:3986 |
| every 5 s | Media job drain | media-worker.js:894 |
| every 25 s | SSE heartbeat per connection | server.js:986 |

---

### 7. Cross-cutting data helpers

**`backend/soft-delete.js` — one recycle bin.** A registry (`ENTITIES`, soft-delete.js:28–42) declares, per
table, a label, a `flag` column and a retention window:

| Table | Label | Retention | Notes |
|---|---|---|---|
| `leads` | Lead | 90 days | |
| `invoices` | Invoice | **`null`** | never auto-purged — a financial record must not vanish on a timer |
| `cs_documents` | Contract | 90 days | |
| `bookings` | Booking | 90 days | |
| `ms_assets` | Media asset | 90 days | `externalPurge: true` — media-studio.js owns the purge because blobs must be removed from storage too |
| `workspace_members` | — | **deliberately excluded** | it is an *auth* table; a soft-deleted member would keep authenticating unless all ~10 read sites filter the flag, and missing one is privilege escalation |

API: `notDeleted(table)` returns the `WHERE` fragment; `softDelete()`/`restore()` are workspace-scoped
UPDATEs that also write an audit row; `purgeExpired()` skips `retentionDays === null`;
`attachmentsForLead()` (soft-delete.js:123–146) powers a **guard, not a cascade** — deleting a lead with live
invoices/contracts/bookings is refused with a sentence naming what is in the way, because permanently deleting
a lead used to run `DELETE FROM invoices WHERE lead_id`.

**`backend/pagination.js` — opt-in server-side paging.** `pageParams(req)` returns `null` unless `?limit` is
present, so responses stay a bare array by default; with a limit the route returns
`{items, total, limit, offset, hasMore}`. `MAX_LIMIT = 500`, negative offsets clamped. The design note
(pagination.js:12–18) explains *why* opt-in: the frontend filters and sorts client-side, so a silent default cap
would make a 3,000-lead workspace quietly filter within 500 — "wrong answers presented confidently."
`toCountSql()` derives the COUNT twin using `topLevelIndex()`, which finds `FROM`/`ORDER BY` at paren-depth 0 so
a correlated subquery cannot hijack the count.

**`backend/storage/` — provider abstraction with local/R2 dual-read.** `STORAGE_PROVIDER=local|r2` (default
`local`). `createStorage()` (storage/index.js:17–51) selects a provider and **falls back to local with a warning
if the R2 SDK or config is missing**. **In this repo that fallback is unconditional:** `storage/providers/r2.js:11`
requires `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` inside a `try/catch`, and neither package is
declared in `backend/package.json` (dependencies, devDependencies or optionalDependencies) or present in
`backend/node_modules/`. So `STORAGE_PROVIDER=r2` logs the warning at `storage/index.js:20-24` and runs on local
disk, and `deploy.sh:27`'s `npm install --omit=dev` cannot change that. **ADR-0001 is accepted but unimplemented:
the abstraction was written, the dependency was never added.** Everything below describes the R2 side of the
seam as designed — none of it executes today. Canonical API: `uploadFile · getBuffer · deleteFile · getPublicUrl ·
fileExists · generateSignedUploadUrl · generateSignedDownloadUrl · localPath`. The dual-read is *per asset*:
`ms_assets.storage_provider` defaults to `'local'` (media-studio.js:275), and code branches on it — e.g. the
worker's `localizeOriginal()` materialises an R2 object into `uploads/media/tmp` so ffmpeg/ffprobe can run
identically on either provider (media-worker.js:62–73), and `persistVariant()` uploads a freshly written variant
back and frees the local temp (media-worker.js:77–84). URLs: local → `/uploads/<key>`; R2 with `R2_PUBLIC_BASE`
→ CDN URL; R2 without it → `/api/storage/file/<key>`, a route that **302-redirects to a short-lived presigned
URL** (storage/index.js:54–68), so a private bucket needs no public CDN.

`backend/storage-enforce.js` layers plan quota on top: `gate(db, ws, incomingBytes)` blocks uploads that would
exceed `storage_gb` from the entitlements resolver (fail-open on any error), and `warn()` fires exactly one
notification per threshold crossing (80 % → 90 % → 100 %), deduped in `storage_warn_state`. Usage is computed
live from `ms_assets` + `ms_exports` — no counter to drift.

---

### 8. Frontend shell architecture

`wappflow-web/src` — Next.js 16 App Router, React 19, Tailwind 3 for layout utilities plus **inline styles
reading CSS custom properties** for everything themed. No CSS-in-JS.

- **`app/layout.js`** — a pre-hydration inline script sets the `light` class on `<html>` before first paint,
  implements "session-only persistence" (a genuinely fresh visit clears `token`/`user`/`workspace` when
  `wf_persist === 'session'`, while a tab opened *from* the app inherits it), and registers `/sw.js`.
- **`app/providers.js`** — the provider stack, in order: `ConfirmProvider → SoundProvider → PlanProvider →
  RealtimeProvider → {PlanLockStyles, UsageWarnings, ImpersonationBanner, ToastViewport, children}`. The SSE
  provider sits here, above the shell, deliberately.
- **`components/shell/AppShell.js`** (205 lines) — **one** shell for every authenticated module, mounted from a
  route `layout.js` rather than wrapped by each page. It replaced three per-page shells imported at 45 JSX call
  sites, where a page's loading branch and its loaded branch each mounted the chrome separately. Nineteen route
  layouts mount it (`app/dashboard/layout.js`, `app/studio/layout.js`, `app/contracts/layout.js`, …).
- **`components/shell/modules.js`** — the module registry: the single place that knows what modules exist.
  `MODULES.{crm, studio, contracts}` each declare `home`, `icon`, `mark`, `nav[]`, `menu[]`, `fabs[]`,
  `notifications`, optional `actions`, and optional **`dialectClass`**. `dialectClass: 'ms-root'` is how Studio
  keeps its own look inside the shared shell: `.ms-root` is a **token-remap scope**, so any shared primitive
  rendered inside it wears the Studio palette. Contracts' dialect (`.cs-doc`) lives in page content, so it needs
  no class. `nav` items may carry `lockFeature`/`requiredPlan` (Analytics is gated to plan *Studio*) and
  `badge: 'comms'`. `isNavActive()` is the single active-state rule (exact by default, `match: 'prefix'` where a
  module owns a subtree).
- **`components/shell/session.js`** — one `useSession()`, one `useSignOut()` (removes only
  `token/user/workspace/wf_persist`, because the old `localStorage.clear()` also wiped the user's theme), one
  `useAuthGuard()` that redirects to `/login?next=…`.
- **UI primitives** (`components/ui/`, 13 files, ~1,435 lines): `overlay.js` is the shared foundation — `Portal`,
  `useOverlayStack` (registration order = stacking order; Escape and backdrop-close act only on the **top**
  overlay), `useEscape`, reference-counted `useScrollLock`, `useFocusTrap`. `Modal` (centred dialogs only),
  `Drawer`, `Dropdown` + `MenuItem` (anchored, deliberately **not** portaled — it replaced seven hand-rolled
  copies), `Toast`, `Button` (4 variants, token-driven, no domain props), `Badge` (6 tones), `Field`,
  `EmptyState`, `ErrorState`, `Skeleton`, `Spinner`, `VirtualList`.
- **Design tokens** (`app/globals.css`): dark is the default `:root`; `html.light` overrides. Layered on top is
  the PROP-002 substrate — a 4 px spacing scale, a radius scale, a type scale, weights, motion durations/easings,
  a **z-index ladder** (`--z-base:1 · --z-dropdown:1000 · --z-sticky:1100 · --z-overlay:1200 · --z-modal:1300 ·
  --z-toast:1400 · --z-banner:1500`) replacing an ad-hoc 1…99999 sprawl, `--shell-h: 58px` (published as a token
  because chat computes `calc(100vh - var(--shell-h))` and the Studio canvases pin below it — three shells used
  to hardcode 60/58/58 independently), `--focus-ring`, elevation and semantic status pairs.
- **`lib/api.js`** — one axios instance, `baseURL = API_URL`, a request interceptor attaching the bearer token
  from `localStorage`, and a response interceptor that on 401 clears the session and hard-navigates to `/login`
  (unless already on an auth page). Public/tokenised endpoints use bare `fetch` against `API_URL`.

---

### 9. Deploy and the env-var contract

`deploy.sh` (repo root, run as `bash deploy.sh` from the server):

1. `git checkout --` the three regenerable files that the *server* rewrites and that would otherwise block a
   pull: `wappflow-web/package-lock.json`, `backend/package-lock.json`, `wappflow-web/tsconfig.json` (Next's TS
   plugin appends build globs to it). `package.json` is never touched.
2. `git pull`; print `df -h` / `free -h`.
3. `cd backend && npm install --omit=dev`.
4. `cd wappflow-web && npm install` — a **full** install including devDependencies, because the Next build needs
   tailwind/postcss/autoprefixer/typescript/eslint. A `--omit=dev` install here prunes them, the build fails
   mid-write, and `next start` serves a corrupt `.next` as 500s.
5. **`NEXT_DIST=.next.staging npm run build`.** `next.config.ts` sets `distDir: process.env.NEXT_DIST || ".next"`.
   `set -euo pipefail` means a failed or OOM-killed build aborts here — **the live `.next` is untouched, nothing
   restarts, the site keeps serving the previous good build.**
6. **Atomic swap:** `rm -rf .next.old; mv .next .next.old; mv .next.staging .next; rm -rf .next.old`.
7. `pm2 restart wappflow-api wappflow-web --update-env && pm2 save`.

There is no migration step — the schema installs itself on API boot (§3).

**Backend env vars** (47 distinct `process.env.*` reads):

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3001` | |
| `NODE_ENV` | `development` | `production` flips `DATA_DIR` to `/data` |
| `DATA_DIR` | `/data` (prod) / `__dirname` | DB + uploads. **Not** honoured by the WhatsApp session store |
| `JWT_SECRET` | `'your-secret-key-change-in-production'` | see *Risks* |
| `FRONTEND_URL` | `*` | CORS origin **and** the base for every client-facing link (portal, pay, gallery, booking) |
| `BASE_URL` | `http://localhost:3001` | invite emails / webhook payloads |
| `TRUST_PROXY` | `1` | proxy hops |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | **hardcoded fallbacks in source** | see *Risks* |
| `AI_PROVIDER` / `AI_PROVIDERS`, `GROQ_*`, `OPENAI_*`, `ANTHROPIC_*`, `CEREBRAS_*`, `OPENROUTER_*` | — | ai-engine.js owns every LLM call |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | — | payments.js |
| `STORAGE_PROVIDER`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE` | `local` | storage/ |
| `FFMPEG_PATH`, `FFPROBE_PATH`, `EXIFTOOL_PATH`, `DCRAW_PATH` | binary names | media-worker.js |
| `SMTP_HOST/PORT/USER/PASS/SECURE/FROM` | — | fallback mailer; per-workspace SMTP lives in `email_smtp_settings` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | — | sign-in + Calendar |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | — | comms voice/video |
| `CC_FOUNDER_EMAIL`, `CC_FOUNDER_PASSWORD`, `CC_IP_ALLOWLIST` | — | Command Center bootstrap |
| `FLUX_URL`, `FLUX_SSO_SECRET` | — | SSO to the sibling Flux product |
| `MS_FACE_MODELS`, `MS_FONT_SANS/SERIF/MONO` | — | worker assets |
| `PUPPETEER_SKIP_DOWNLOAD` | — | Chromium already present |

**Frontend env vars** — and the rule that has caused a real production bug:

```js
export const API_URL  = process.env.NEXT_PUBLIC_API_URL  || 'http://localhost:3001/api'; // lib/api.js:3
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';     // lib/api.js:4
```

> **`NEXT_PUBLIC_API_URL` ends in `/api`. `NEXT_PUBLIC_BASE_URL` does not.** Anything that appends its own
> `/api/...` path must use `BASE_URL`; anything that appends a bare resource path must use `API_URL`.

`realtime.js` briefly got this wrong: it derived the stream URL from `NEXT_PUBLIC_API_URL` and appended
`/api/events`, producing `…/api/api/events`, and **the SSE stream 404'd in production only**. It looked fine
locally because with no env vars set both constants fall back to the same localhost origin — the two values
differ *only* in production, which is the one place it mattered. The fix (realtime.js:29–35) is to import
`BASE_URL` from `lib/api.js` rather than re-deriving it, and the comment is preserved as a tripwire. Note that
several pages still read the raw env vars directly rather than importing the constants
(`app/knowledge/page.js:14`, `app/leads/[id]/page.js:1087`, `app/settings/page.js:800–836`,
`components/AICommandCenter.js:11`), so the same class of mistake remains available. `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
and `NEXT_PUBLIC_FLUX_URL` are the other two public vars. Because these are inlined at build time, changing them
requires a **rebuild**, not a restart — which is exactly what `deploy.sh` does.

---

### 10. Risks, bugs and architectural smells

*Read-only observations. Nothing here was changed.*

- **Committed VAPID private key.** `server.js:21–22` hardcodes both the public *and* the **private** VAPID key
  as `||` fallbacks. Anyone with the repo can sign push messages for any deployment that has not set the env
  vars. Security weakness.
- **Default `JWT_SECRET`.** `server.js:181` falls back to `'your-secret-key-change-in-production'`. Nothing
  refuses to boot without a real secret, so a misconfigured deploy silently accepts forged tokens for every
  workspace *and* for Command Center impersonation (`JWT_SECRET` is handed to command-center.js at :6572).
- **Sessions never expire.** `signSession()` (server.js:198–201) calls `jwt.sign()` with **no `expiresIn`**. The
  only revocation is `users.token_version`, bumped on password reset. `DEPLOYMENT.md:238` claims "JWT (HS256,
  7-day)" — **the doc is wrong; believe the code.**
- **The API cannot be scaled horizontally or run in pm2 cluster mode.** `sseClients` is a process-local `Map`
  (server.js:969), so a second instance would deliver realtime frames to only the subset of users connected to
  it. The same applies to `ccSse`, the WhatsApp Puppeteer sessions, the IMAP poller, and the `node-cron`
  schedules (every job would double-fire). The `ms_jobs` claim/lease *is* multi-worker safe — it is the only
  component that is. This is the single largest structural constraint in the system and it is not stated in any
  doc I found.
- **Global crash guards mask corruption.** `uncaughtException`/`unhandledRejection` handlers (server.js:25–30)
  log and continue. A half-applied `db.transaction` or a half-written file will not take the process down, so it
  will not be noticed either.
- **`DATA_DIR` is not honoured for WhatsApp sessions.** `whatsapp-service.js:139, 226` hardcode `/data/.wwebjs_auth`
  in production. Data-integrity/ops risk: moving `DATA_DIR` moves the DB and uploads but strands the sessions.
- **`outbound_message_queue` is dead.** The table is created (server.js:837–852) and two endpoints read/retry it
  (`GET /api/message-queue`, `POST /api/message-queue/:id/retry`, server.js:5627–5639) — but **nothing anywhere
  inserts a row and no drainer exists**. Classify as **STUB**. `DEPLOYMENT.md:240` lists an "Outbound Queue
  Processor (every 30 s)" in its architecture diagram; **that processor does not exist in the code.**
- **`POST /api/message-queue/:id/retry` has no workspace scope** — the UPDATE is `WHERE id = ?` only
  (server.js:5636). Harmless today only because the table is never populated; it is a cross-tenant write waiting
  for the feature to be built.
- **CORS `origin: '*'` with `credentials: true`** (server.js:106–109) when `FRONTEND_URL` is unset. Browsers
  reject that combination, so it fails closed rather than open — but it means an unconfigured deploy has a
  subtly broken auth surface rather than an obviously broken one.
- **CSP is disabled entirely** (`contentSecurityPolicy: false`, server.js:75) because the UI is inline-style
  heavy, and the root layout injects `dangerouslySetInnerHTML` scripts. Any XSS anywhere has no second line of
  defence.
- **`express.json({ limit: '50mb' })`** globally (server.js:115) while nginx caps bodies at 16 MB
  (DEPLOYMENT.md:471). The mismatch means a large request fails at the proxy with a generic 413 rather than at
  the app with a useful message.
- **No schema-version table.** Migration state is inferred from `duplicate column` errors and two ad-hoc marker
  tables (`app_meta`, `payments_meta`) with different names for the same idea. There is no way to ask the
  database what schema generation it is on, no down-migrations, and no ordering guarantee beyond mount order.
- **Backfills are individually `try/catch`ed as "non-fatal".** A silently failed backfill leaves the DB in a
  half-migrated state that later code assumes is complete.
- **Duplicated `safeAlter`.** server.js:647 and media-studio.js:164 define byte-identical copies; other modules
  have their own. Rule-of-Three violation by the repo's own constitution.
- **Duplicated `DATA_DIR` expression.** `server.js:38` and `:61` compute the same value into two constants
  (`DATA_DIR`, `DATA_ROOT`); `whatsapp-service.js:415`, `seed-leads.js:14` and `grant-master.js:51` each inline a
  fourth and fifth copy.
- **Stale-doc corrections** (code is truth): the previously-reported *double-declared `ms_albums`* is **fixed** —
  there is exactly one `CREATE TABLE IF NOT EXISTS ms_albums`, in media-studio.js:1385. The previously-reported
  *dual SSE event names* problem is **fixed** — the `{...data, type}` ordering rule at server.js:1002 and the
  `kind`-not-`type` convention in `notify()` resolve it. `DEPLOYMENT.md` remains stale on the JWT lifetime, the
  outbound queue processor, and the deployment target (it documents Railway/Hetzner/Vercel/Docker; the actual
  production host is not recorded anywhere in the repo).
- **`foreign_keys = ON` was turned on late** (server.js:57) over a schema whose FK declarations predate the
  workspace re-key and which contains historically un-scoped rows. `purgeExpired()`'s hard `DELETE`s
  (soft-delete.js:98–114) and the lead permanent-delete path now run under real FK enforcement; whether every
  legacy row satisfies those constraints is **UNKNOWN** — it can only be answered against the production
  database, which was not available for this read.
