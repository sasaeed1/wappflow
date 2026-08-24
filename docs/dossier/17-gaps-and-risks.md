## Gaps, risks, technical debt and the maturity picture

### What this section is for

Every earlier section of this dossier describes a *capability* — what CRM does, what Media Studio does, how money moves. This section describes the **distance between the capability and a product a paying studio can be left alone with**. It answers three questions a planner has to answer before allocating a single week of work: what is genuinely broken *today*, what is advertised but does not exist, and what will break first as usage grows.

It matters because WappFlow's own documentation cannot answer those questions. The repository contains a 515 KB self-audit (`PRODUCT-AUDIT.md`, 221 findings, generated 2026-07-01) that has been *substantially remediated* in the eight weeks since — and a scattering of older design documents that were never revised. Reading them at face value produces a wildly pessimistic picture of a product that has, in fact, closed most of its critical defects. Reading only the commit log produces the opposite error: several phases are declared "COMPLETE" when only their *foundation* was built and adoption stalled at two files.

Everything below was verified against the working tree on **2026-08-24**. Where a document and the code disagree, the code wins and the disagreement is stated.

---

### 1. Where the maturity programme actually stands

The audit proposed an 11-phase roadmap (Phase 0 through Phase 10, `PRODUCT-AUDIT.md:775-905`) governed by an `ENGINEERING-CONSTITUTION.md` that requires a written proposal before any significant change. That process was followed: `proposals/PROP-001` (Foundation Sprint) and `proposals/PROP-002` (design system, batches A–F) exist, each with a machine-checkable verification script in `scripts/verify-*.js`.

| Phase | Intent | Actual state (verified) |
|---|---|---|
| 0 — Truth & Integrity | Kill phantom UI; fix security/money spine | **SHIPPED.** Stripe webhook now HMAC-verified with idempotency (`payments.js:267-295`); WhatsApp status/disconnect authenticated (`server.js:3130,3158`); SQL injection in `/api/reports/overview` replaced with bound params (`server.js:2900-2920`); Mark-as-Paid routed through the ledger (`paymentsAPI.markInvoicePaid` → `payments.js`); `ms_albums` has one schema owner. |
| 1 — Design system | One primitive library, adopted everywhere | **PARTIAL — the big one.** Primitives all exist (`wappflow-web/src/components/ui/`). Adoption did not happen. See §3. |
| 2 — One shell | Collapse four app shells into one `layout.js` | **SHIPPED.** All four legacy shells deleted (commit `d15f314`); `components/shell/AppShell.js` + `ModuleSwitcher` + `Breadcrumbs` + App Router `error.js`/`not-found.js` boundaries are live. `NavBar.js` no longer exists. |
| 3 — Safety net | One recycle bin + undo + audit | **PARTIAL.** Backend registry is real (`soft-delete.js`, 90-day retention, invoices never auto-purged). UI covers **leads only**. See §5. |
| 4 — List infra & DB perf | Pagination, virtualization, saved views, indexes | **PARTIAL.** Indexes + `busy_timeout`/`synchronous` pragmas landed (`server.js:44-57`). Pagination is *opt-in* (`pagination.js`) and **no frontend caller opts in**. See §7. |
| 5 — Realtime, notifications, search | One SSE bus, one bell, Ctrl+K | **SHIPPED.** One `/api/events` stream (`server.js:971`), ~33 event types, `notifications` table + bell, `search.js` universal search, `CommandPalette.js`. |
| 6 — Subsystem consolidation | One reel engine, album editor, scheduler, invoice doc, AI path | **SHIPPED (mostly).** One busy-calendar (`availability.js`), one album model (`album-model.js`), one invoice document, one LLM path (`ai-engine.js`; `server.js` no longer calls any provider directly — pinned by `test-phase6-one-ai-path.js`, which passes). Two AI FABs remain but are now registered in one place (`components/shell/modules.js:28,60`). |
| 7 — Contact-centric chain | Lead→client→contract→booking→invoice propagation | **SHIPPED.** Five commits (`fdff6b0`…`6609afd`) wired win→client, the action hub, store/booking→invoice, and one activity spine. |
| 8 — Branded public journey | Studio identity on client-facing pages | **SHIPPED** (commit `e2f2eec`). `public-brand.js` + `PublicBrandHeader/Mark/Footer` + per-studio Open Graph via `lib/publicMeta.js` (which sends an `X-WF-Preview: 1` header so crawler fetches don't mark contracts viewed). |
| 9 — Correctness & standards | Timezones, slot integrity, lifecycle, a11y, first-run | **IN PROGRESS AND UNCOMMITTED.** See §2 and §6. |
| 10 — Named intelligence | Creator Brain, Gallery Expiry, follow-up, keyboard shortcuts, drafts | **NOT STARTED.** |

> **Stale-doc warning for the reader:** `DESKTOP-FINAL-VISION.md` states the Command Center is unmounted dead code. It is not — `command-center.js` is mounted at `server.js:6571` with its own identity tier (`cc_admins`, an `aud` JWT claim, `platformAuth` at `command-center.js:185`). `DEPLOYMENT.md` is likewise stale: it documents a `NavBar` that no longer exists, says the default `JWT_SECRET` is `change-me` (it is not), and omits every environment variable added since May — `DATA_DIR`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STORAGE_PROVIDER` and the R2 credentials, `SMTP_*`, `FFMPEG_PATH`, `CC_FOUNDER_EMAIL`/`CC_FOUNDER_PASSWORD`, `CC_IP_ALLOWLIST`, `TRUST_PROXY`.

---

### 2. Phase 9 is real work sitting in an uncommitted working tree

`git status` shows 15 modified files and 5 untracked ones that constitute most of Phase 9, none of it committed:

- `backend/studio-time.js` (new) — one interpretation of an appointment clock. Bookings keep **wall-clock** storage (`'2026-08-25 14:00:00'` means 2 p.m. *at the studio*) and gain a real IANA timezone; `wallClockToMs`/`msToWallClock`/`formatStudioTime` do the conversion with a double DST correction. The rationale is documented in the file header and is sound: converting existing rows would mean guessing the zone of every booking already taken.
- `backend/availability.js` (modified) — the shared busy-calendar now parses both timestamp shapes on one instant scale. Previously `bookings.start_at` (naive) and `meetings.starts_at` (ISO) sat the studio's whole UTC offset apart — five hours for Karachi — on the calendar that the double-booking guard reads.
- `backend/booking.js` (modified) — the double-booking guard was `WHERE start_at = ?`, an exact match, so a four-hour wedding at 09:00 did not collide with a 10:00 session. It is now interval overlap (`availability.clashes`) executed **inside** the same `db.transaction` as the insert (`booking.js:396-412`), closing the check-then-insert race. Admin cancel/reschedule endpoints were added (`booking.js:294,346`).
- `backend/account-recovery.js` (new) + `app/forgot-password/`, `app/reset-password/` — the missing self-service password reset, sending through platform SMTP with a fallback to the workspace's own.
- Overdue invoices are now **derived on read** rather than stored (`isOverdue`, `server.js:2555-2562`, applied in `parseInvoice`). Nothing in the backend had ever written `status='overdue'`, so the Overdue KPI and filter on the invoices screen were permanently zero.

**Risk:** this is a meaningful body of correctness work with no commit, no branch, and no deployment. It is one `git checkout` away from being lost.

---

### 3. The single largest live gap: a design system nobody uses

PROP-002 is recorded as "COMPLETE" (commit `efafb12`). What completed was the *primitive library*. Adoption did not happen, and the verification scripts cannot see that because their grep gates are explicitly **scoped to the four files that were migrated** (`scripts/verify-batchC.js:146-153`).

Measured across the 182 `.js` files (37,965 lines) in `wappflow-web/src`:

| Primitive | Files importing it |
|---|---|
| `ui/Toast` | 7 |
| `ui/Modal` | 5 |
| `ui/Field` | 5 |
| `ui/Dropdown` | 4 |
| `ui/EmptyState`, `ui/ErrorState`, `ui/Skeleton` | 3 each |
| `ui/Button`, `ui/Badge`, `ui/Spinner` | 2 each |
| `ui/Drawer`, `ui/VirtualList` | 1 each |

- **93 of 182 files still contain raw hex colours** — 2,982 occurrences — against a token substrate that exists and works.
- **34 hand-rolled `position:'fixed', inset:0` overlays across 14 files** remain (chat, contracts, contracts/[id], control/reports, control/support, d/[token], dashboard, g/[token], leads/[id], leads-list, studio/portfolio, studio/[id], studio/[id]/albums, studio/[id]/cull), plus styled-jsx overlays in `HuddleModal`. The Batch C inventory documented that **not one** hand-rolled overlay implements focus trap, focus restore, scroll lock, or `role="dialog"`.
- **Raw z-index values still run to 99999.** The Batch A ladder (`--z-base` … `--z-banner`) has essentially one consumer.
- **Six independent lead-status colour maps** still exist (`app/dashboard`, `app/leads/[id]`, `app/leads-list`, `app/reports`, `app/trash`, `components/AICommandCenter`) despite `lib/leadStatus.js` being the designated registry — and `leads-list` contains both.

This is the cheapest large win available: the foundation is paid for, the migration is not.

---

### 4. Sold but not built

The plan matrix in `entitlements.js` advertises feature keys that no code ever checks. The engine has an honest guard for this — `UNBUILT_FEATURES` (`entitlements.js:135`) forces a key off and hides it from the public catalogue — but it currently contains only `ai_editing`. These keys appear in `PLAN_DEFINITIONS`, are surfaced to `usePlan()`, and are printed on the landing page's plan comparison (`app/page.js`), yet grep across both trees finds **zero** references outside `entitlements.js` itself:

| Advertised on | Feature key | Verdict |
|---|---|---|
| Studio+ / Enterprise | `white_label` | **SOLD-NOT-BUILT** (public-brand chrome exists; nothing gates on this key and nothing removes WappFlow identity from the app) |
| Studio | `redline_comparison` | **SOLD-NOT-BUILT** (version history and restore are real at `contracts-studio.js:723-750`; diff/redline is not) |
| Enterprise | `sso`, `api_access`, `byok`, `custom_integrations`, `dedicated_support` | **SOLD-NOT-BUILT.** Google OAuth sign-in exists; SAML/OIDC SSO, a public API with keys, and BYOK do not. |
| Studio+ | `local_ai` | **PARTIAL.** Real ONNX inference exists in `wappflow-desktop/`, but the desktop app has not been touched since 2026-06-27 (commit `a113aea`) — before the entire maturity programme. |
| Studio | `multi_pipeline`, `advanced_proofing`, `story_sections`, `bulk_send`, `approval_workflows` | Mixed: story sections (`media-studio.js:2701`), proofing, bulk send (`contracts-studio.js:775`) and approvals (`cs_approvals`) are **SHIPPED** but ungated; **`multi_pipeline` is SOLD-NOT-BUILT** — there is no `pipelines` table and no `pipeline_id` column anywhere. |

Separately, features that are **built on the backend and unreachable from the UI** — the most wasteful category, because the expensive half is already paid for:

| Capability | Backend | Frontend |
|---|---|---|
| Bulk cull ("keep the AI's top picks") | `POST /api/media/projects/:id/cull/bulk`, wrapper `mediaAPI.bulkCull` | **zero call sites** — the UI teases the recommendation and offers no button |
| Invoice editing | `PUT /api/invoices/:id`, wrapper `invoicesAPI.update` | **zero call sites** — a typo still requires delete-and-recreate, burning an invoice number |
| Invoice recycle bin | `GET /api/invoices/bin`, `POST /api/invoices/:id/restore` | **no API wrapper, no UI** — soft-deleted invoices are invisible and unrecoverable without SQL |
| Contract recycle bin | `GET /api/cs/documents?bin=1`, `POST /api/cs/documents/:id/restore` | **no caller** |
| Gallery editing | `PUT /api/media/galleries/:id`, wrapper `mediaAPI.updateGallery` | **zero call sites** |
| Mentions inbox | `GET /api/comms/mentions`, wrapper `commsAPI.mentions` | **zero call sites** — "what mentioned me?" is unreachable |
| Join a call in progress | `GET /api/comms/channels/:id/active-call`, wrapper `commsAPI.activeCall` | **zero call sites**; the `call_invite` SSE frame is handled nowhere in the web app |
| Creator Brain / Style Engine | `brains.js` — `/api/media/creator-brain`, `/api/media/style-profile`, `/api/media/projects/:id/style-suggestions`, all with `lib/api.js` wrappers | **zero call sites** (only `recommendations()` is consumed, on the cull page) |
| Gallery Expiry | `ms_galleries.expires_at` column, annotated "RESERVED … do not purge" (`media-studio.js:1301`) | never written, never read — **STUB** |

---

### 5. Duplication and dead code that remains

- **A second, contradictory plan matrix.** `server.js:5474-5575` declares a ~100-line `const PLAN_DEFINITIONS` for the *removed* tiers `free`/`starter`/`growth`/`enterprise`. It is **never read** — `getPlanInfo` (`server.js:5577`) delegates entirely to `entitlements.js`. The Foundation Sprint purged the dead tiers from the frontend and left the backend copy in place.
- **Dead tiers still on screen in the Command Center.** `app/control/customers/page.js:40` offers a plan filter with `free`/`starter`/`growth`/`enterprise` options; `app/control/health/page.js:60` colours a pill by `plan === 'growth'`. None of those values can occur.
- **A dead message queue.** `outbound_message_queue` is created at `server.js:837` and exposed by two endpoints (`GET /api/message-queue` at `:5629`, `POST /api/message-queue/:id/retry` at `:5636`). **Nothing ever inserts a row and no worker drains it.** The retry endpoint also updates by id with no workspace clause — a latent IDOR on a permanently empty table.
- **Unused soft-delete scaffolding on bookings.** `bookings` is registered in `soft-delete.js` with `is_deleted`/`deleted_at`/`deleted_by` and an index, but `booking.js` exposes no delete route and `/api/booking/list` filters on `status != 'cancelled'`, not `is_deleted`.
- **A doubled column pair on `reminders`.** The table carries both `title`/`message`, `due_date`/`reminder_date`, and `completed`/`is_completed`, reconciled by a one-time backfill at `server.js:784`. Writers must remember to set both halves; `booking.js:417` does, and the code comment explains why the cron would otherwise never fire.
- **An abandoned React Native app at the repository root.** `App.js`, `src/screens/`, `android/`, `ios/`, `__tests__/`, `Gemfile`, `metro.config.js`, `babel.config.js`, `app.json`, `render.yaml`, `.watchmanconfig` — and the root `package.json` is a React Native manifest whose `npm test` runs a jest preset against one placeholder test. Nothing in the live product imports any of it. Article 11's "provably dead" exemption applies.
- **Two AI copilots** (`AICommandCenter` for CRM modules, `StudioCopilot` for Studio). Defensible as domain-specific, but they are two implementations of the same affordance, now merely registered in one table.

---

### 6. Correctness hazards still live

**Meta webhooks are unauthenticated.** `POST /api/webhooks/instagram` (`server.js:5139`) and `POST /api/webhooks/facebook` (`:5201`) perform no `X-Hub-Signature-256` verification — grep finds no HMAC anywhere in the tree, and the raw-body parser is scoped only to the Stripe path (`server.js:114`), so the bytes needed to verify are not even retained. Worse, when the incoming page id does not match a stored account the handler falls back to `SELECT … ORDER BY created_at ASC LIMIT 1` (`server.js:5147`) — **an arbitrary workspace**. Any unauthenticated caller can inject leads and messages into a tenant's CRM.

**Non-expiring JWTs and a published default secret.** `signSession` (`server.js:196-199`) calls `jwt.sign` with no `expiresIn`; tokens are valid forever, revocable only by a `token_version` bump on password reset. `JWT_SECRET` falls back to the literal string `'your-secret-key-change-in-production'` (`server.js:181`) with no boot-time refusal — a deployment that forgets the variable is trivially forgeable by anyone who has read the repository. Tokens are also accepted from `req.query.token` (needed for `EventSource`), which puts them in access logs and referrers.

**Auth fails open on role.** `req.userRole = member?.role || 'super_admin'` (`server.js:232`). A user with no `workspace_members` row is granted the highest role rather than the lowest.

**`/uploads` is world-readable.** `server.js:117-121` serves the directory statically with `Access-Control-Allow-Origin: *` and no auth; filenames are `${Date.now()}-${sanitizedOriginalName}`. WhatsApp media, voice notes and attachments are therefore retrievable by anyone who knows or guesses the URL. (Media Studio assets are separate — they go through `storage/` and can use presigned R2 URLs.)

**Money is stored as floating point.** `invoices.subtotal/tax_amount/discount/total` and `payments.amount` are SQLite `REAL` (`server.js:413-417`, `payments.js:63`), and totals are summed in JavaScript with `parseFloat` (`app/invoices/page.js:311`). Both tables also default `currency` to `'USD'` and `currency_symbol` to `'$'` while the pricing engine is PKR-only (`entitlements.js:123`) — the "PKR rendered with a $" root cause survives in the schema defaults.

**The reminder cron can permanently drop a reminder.** `server.js:3999-4008` fires every minute and selects reminders whose `reminder_date` falls in a **two-minute window** ending now. Nothing marks a reminder as fired. A restart, a deploy, or any event-loop stall longer than two minutes silently loses every reminder due in that gap. The query also compares a space-separated wall-clock stamp against an ISO `toISOString()` string, and `server.js` does **not** import `studio-time` — so the Phase 9 timezone work does not reach reminders, contract expiry sweeps, or the `isOverdue` "today" computation (which uses UTC, flipping at 05:00 local for a Karachi studio).

**Silent caps.** `/api/booking/list` hard-codes `LIMIT 200` (`booking.js:238`) with no pagination and no indication to the user; a busy studio simply stops seeing older bookings.

**The backend imports a frontend source file at runtime.** `renderInvoiceEmailHTML` (`server.js:2716-2723`) does a dynamic `import()` of `../wappflow-web/src/lib/invoiceDoc.js` by relative filesystem path. The intent (one invoice document, no drift) is right; the coupling means a backend deployed without the frontend tree beside it returns 500 on invoice email.

**Accessibility is effectively absent.** 38 `aria-label` attributes and 25 `role=` attributes against **1,014 `onClick` handlers**; only 54 of 182 files carry any a11y attribute at all. The audit's `gap-10` is essentially untouched.

---

### 7. Operational fragility and scaling limits

**WhatsApp is the product's spine and its most fragile component.** `whatsapp-service.js` (74 KB) drives `whatsapp-web.js` — an unofficial library automating headless Chrome via puppeteer with `--no-sandbox` (`:229-232`). Sessions live on disk in `.wwebjs_auth/`. There is an entire module, `wa-errors.js`, whose only job is to make minified FBLOGGER objects legible after they cross the puppeteer boundary as `e.message === 'r'`. On 2026-08-24 alone, four separate WhatsApp breakages were fixed — missed-message sync "which had never once succeeded", a voice-note format WhatsApp always rejects, a chat model it can no longer build, and a group edit reported as done after WhatsApp refused it. **Assume continuous breakage from upstream changes; this is a permanent maintenance tax, not a backlog item.**

**Media work runs inside the API process.** `media-worker.js:894` starts a `setInterval` in the same Node process as every HTTP request, draining up to 10 `ms_jobs` serially every 5 s. Jimp image processing is CPU-bound and synchronous, ffmpeg is spawned as a child process, and `better-sqlite3` is synchronous by design — so a batch of photo ingests or a video render blocks the event loop that serves the API and the SSE bus. ADR-0002 explicitly says "long work belongs in the worker/queue, not a request handler"; the worker *is* the request handler's process.

**ffmpeg is optional at runtime.** `videoEngine.detectFfmpeg()` gates every video path; without the binary, exports fail with a message naming it (`media-worker.js:768`). Degradation is graceful — but a deployment can silently be "video-capable" in the UI and not on the box.

**There is no horizontal scale story, by decision.** `DEPLOYMENT.md:40` states it plainly: "The backend must be a **single instance** because WhatsApp Web sessions and the SQLite database live on disk." ADR-0002 accepts this. The concrete ceilings:

- **One SQLite file, one writer.** WAL + `busy_timeout=5000` + `synchronous=NORMAL` are set (`server.js:44-57`), which is the right configuration, but the write path is one process wide.
- **The booking race is closed by single-threadedness, not by the database.** There is no `UNIQUE` constraint on `(workspace_id, start_at)`; the guard holds because `db.transaction` runs synchronously in one process. A second process would change that property.
- **SSE state is in-process memory.** `sseClients` is a `Map` (`server.js:969`). Two instances would each see half the connections and neither would fan out correctly.
- **Universal search is `LIKE '%q%'`** (`search.js:24-25`), leading wildcard, no FTS5 — a full scan per entity type per query. `DEPLOY-CHECKS.md:58-60` flags this honestly as unverified at real volume and names FTS5 as the fix.
- **Server-side pagination exists and is unused.** `pagination.js` is deliberately opt-in so a silent `LIMIT` cannot produce "wrong answers presented confidently". No frontend caller passes `limit` — `leads-list` fetches every lead and filters client-side (`app/leads-list/page.js:763`), and only that one list uses `VirtualList`. Invoices, contracts and messages fetch whole.
- **God-files persist.** `server.js` 6,595 lines / 184 routes; `media-studio.js` 2,882 lines / 115 routes; `app/page.js` 3,495 lines; `app/settings/page.js` 3,106 lines with 18 tabs; `app/leads/[id]/page.js` 2,961 lines. Total: 518 route registrations, 129 distinct tables.
- **Auth costs four DB queries per request** (`server.js:215,231,240,253`), uncached. Cheap against in-process SQLite; a hard floor if the DB ever moves over a network.

---

### 8. The verification story

There is **no CI**. No `.github/workflows`, no `npm test` that runs anything real. Testing is 43 standalone `backend/test-*.js` scripts plus 10 in `backend/scripts/` and 15 `scripts/verify-*.js`, each launched by hand — several requiring a scratch server started with `DATA_DIR=<tmp> PORT=3017 node server.js` first. Of the backend harnesses, 16 drive HTTP, 34 open the database directly, and 8 are pure source-text assertions.

Those source-text harnesses are *invariant pins* — `test-phase6-one-ai-path.js` asserts that `server.js` contains no provider hostname and no pinned model id. They are genuinely valuable against regression and they pass today (spot-checked: `test-phase6-one-ai-path.js` 7/7, `test-phase9-studio-time.js` 13/13, `verify-batchB` 19/19, `verify-batchC` 19/19, `verify-shell-batch7` 10/10). But they prove absence of a string, not correctness of behaviour, and — as §3 showed — their scoping can make a stalled migration read as a passing suite.

`DEPLOY-CHECKS.md` is the most honest document in the repository and should be read in full by anyone planning: it states that everything since Phase 3 "has been verified by harness and … against a **freshly created local database**. None of it has been exercised against the real production database, real WhatsApp sessions, or real traffic." It names the highest-risk item — a boot-time backfill of private-channel membership that can make a channel *disappear* for someone who never posted in it — and notes that query plans were checked with `EXPLAIN QUERY PLAN` against fixtures, not production volumes.

Backups are a shell cron in `DEPLOYMENT.md:688-706` (`sqlite3 … ".backup"`), not part of the application. **UNKNOWN: whether that cron is actually installed on the production host, and whether any restore has ever been tested — neither is verifiable from the repository.**

---

### 9. Prioritised backlog

1. **Sign and verify the Meta webhooks, or disable the routes.** Unauthenticated cross-tenant write. Hours of work.
2. **Refuse to boot on the default `JWT_SECRET`; add token expiry; stop defaulting an unknown member to `super_admin`.** All three are small and all three are live.
3. **Commit the Phase 9 working tree.** Real correctness work with no version control behind it.
4. **Finish the design-system migration.** 93 files, 34 overlays, 6 status maps. This is the largest ratio of value to unknowns in the repository, because the primitives already exist and the inventory (`proposals/PROP-002-batch-c-inventory.md`) already names every site.
5. **Move the media worker out of the API process**, or at minimum behind a `utilityProcess`/child process. Everything else about performance is theoretical until the event loop stops being shared with ffmpeg and Jimp.
6. **Wire the ten built-but-unreachable capabilities** in §4. Each is a frontend-only change against an endpoint that already works and already has an `api.js` wrapper.
7. **Delete the dead tranche**: `server.js:5474-5575`, the `outbound_message_queue` endpoints, the Command Center's dead tier options, the root React Native app.
8. **Make the reminder cron durable** (a `fired_at` column and a catch-up window), and route `server.js`'s time handling through `studio-time.js`.
9. **Adopt `pagination.js` on the four core lists**, then reconsider FTS5 for search.
10. **Decide, explicitly, what to do about the desktop app** — it is two months behind the shell and design-system it wraps, and `local_ai` is being sold on Studio+.

### 10. What could not be determined

- **UNKNOWN: the production deployment's actual configuration.** Whether `JWT_SECRET`, `STRIPE_WEBHOOK_SECRET`, `CC_IP_ALLOWLIST` and the R2 credentials are set on the live host cannot be read from the repository; `DEPLOYMENT.md` is stale enough that it is not evidence.
- **UNKNOWN: real data volumes.** Every performance claim here is structural. The checked-in dev database is 1 MB; no production row counts are available.
- **UNKNOWN: whether the Phase 3 private-channel membership backfill has run against production data**, and whether anyone lost access as `DEPLOY-CHECKS.md` warns they might.
- **UNKNOWN: whether the daily SQLite backup cron exists on the server**, and whether a restore has ever been rehearsed.
- **UNKNOWN: how much of the audit's 221 findings remain open in total.** This section verified a representative sample of roughly 40 across every theme; a full re-audit was out of scope.
