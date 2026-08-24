## What WappFlow is

WappFlow is a multi-tenant web application that a small photography or video studio runs its entire
business on. A stranger messages the studio on WhatsApp; that message automatically becomes a **lead** — one
row in one table with the person's name, phone, pipeline stage, and every message ever exchanged. The studio
sends that lead a proposal built from content blocks, which the client opens on a link and signs by drawing a
signature in the browser. Signing the document automatically moves the lead down the pipeline, raises an
invoice, opens a shoot record, and WhatsApps the client a booking link. The client picks a slot on a public
booking page. After the shoot the photographer uploads thousands of photographs, triages them (keep / reject /
maybe, star ratings) with AI scores shown as *advice only*, and publishes the survivors as a client-facing
gallery. The client favourites images, orders prints, and pays — all from links, with no account and no
password. Every one of those objects hangs off the same contact record.

The product is aimed, on the evidence of the code rather than any persona document, at **Pakistani and
South-Asian studios**: subscription prices are denominated in Pakistani Rupees (`backend/entitlements.js:123`,
`PLAN_CURRENCY = 'PKR'`), phone matching is written around `+92` numbers (`backend/server.js:1099-1110`), and
the AI prompt examples quote fees in PKR (`backend/server.js:4336`). That market choice drives the single most
unusual technical decision in the system: WappFlow does not use Meta's official WhatsApp Business API. It
drives **WhatsApp Web through a headless Chromium browser** using the unofficial `whatsapp-web.js` library
(`backend/whatsapp-service.js`, `whatsapp-web.js ^1.34.7`), paired by scanning a QR code with the owner's own
phone. There is no template approval, no per-message fee, no Meta business verification — a studio with no
company registration can connect the number it already uses. That is a genuine competitive advantage in a
market where email is not the channel, and it is also a permanent constraint: one Chromium process per
connected number, a single stateful backend that cannot be scaled horizontally, and terms-of-service exposure.

What makes WappFlow unusual as a *product* is the combination. Gallery hosts (Pixieset, ShootProof), studio
CRMs (HoneyBook, Dubsado), contract signers and booking pages all exist separately; WappFlow attempts all of
them against one contact spine, WhatsApp-first, priced for a market the incumbents do not serve. What makes it
unusual as a *codebase* is the deliberate smallness of the machinery: one Node process, one SQLite file, one
filesystem tree, no ORM, no migration tool, no message broker, no Redis, no separate worker fleet. Modules are
plain functions handed the same `app` and the same `db` and asked to add routes and tables to them. The
software mostly works. The business around it does not exist: **there is no subscription billing of any kind**,
and `backend/command-center.js:309` says so in its own source — "real subscription billing (not built)".

---

## How to read this document

This dossier is seventeen sections written by seventeen readers who each took one domain and read the code
directly. It is written for someone with **no access to the repository**, so every claim is grounded in a
`file:line` citation you can quote back at whoever does have access.

**Three conventions matter throughout.**

1. **Maturity labels are load-bearing.** Every feature is rated **SHIPPED** (works end to end), **PARTIAL**
   (works, with a named gap), **STUB** (an endpoint or UI exists but does nothing useful), or
   **SOLD-NOT-BUILT** (marketing, pricing, or UI promises it; no implementation exists). A feature list that
   blurred those four would be actively misleading for planning. Roughly a fifth of the advertised surface is
   SOLD-NOT-BUILT.
2. **`UNKNOWN:` means exactly that.** Nobody had access to the production host, its `.env`, or its database.
   Whether Stripe, LiveKit, Cloudflare R2, or the Meta webhooks are actually configured in production is
   unknown from the repository; every such gap is stated rather than guessed.
3. **The repository's own documents are stale in both directions and the code is the arbiter.** This is not a
   minor caveat — it is the most common way a reader will go wrong. `PRODUCT-AUDIT.md` (2026-07-01, 221
   findings) has been *substantially remediated* and reads far too pessimistically. `DESKTOP-FINAL-VISION.md`
   calls the Command Center unmounted dead code; it is mounted at `backend/server.js:6571` with 18 live admin
   pages. `ROADMAP.md` calls Google Calendar sync unbuilt; the OAuth flow is at `backend/server.js:5946-6010`.
   The landing-page FAQ claims Jitsi video (the code is LiveKit, `backend/comms.js:423`) and claims
   self-hosting (the product is shared multi-tenant). `DEPLOYMENT.md` claims 7-day JWTs (they never expire) and
   omits roughly thirty environment variables the backend reads.

**A note on volatility.** All sections were read from the working tree on 2026-08-24 at commit `c23c7af`, with
`backend/server.js` (6,595 lines) being actively edited *during* the read. Line citations are accurate to
within about ±25 lines; grep for the quoted code rather than trusting the number. Fifteen modified and five
untracked files — the whole of "Phase 9" (timezones, booking integrity, password reset) — were uncommitted and
undeployed at read time.

| # | Section | What it covers |
|---|---|---|
| 02 | Product overview, personas, business model | Who it is for, the four PKR plan tiers, the entitlements resolver, and why nobody can pay for it |
| 03 | CRM — leads, pipeline, clients | The one `leads` table every other module hangs off; stages, assignment, the activity spine |
| 04 | WhatsApp engine, messaging, internal Comms | Puppeteer-driven WhatsApp, inbound ingest, the Slack-shaped team chat, LiveKit huddles |
| 05 | Media Studio — library, culling, galleries, albums | Ingest → cull → gallery → deliver; the 37 `ms_*` tables and the control-first AI invariant |
| 06 | Video, reels and the rendering pipeline | The JSON EDL, the pure ffmpeg-argv builder, four reel-generation paths, and the render bugs |
| 07 | Contracts Studio — documents, e-signature, automations | Block documents, the signing ceremony, the audit trail, and the four post-signature automations |
| 08 | Booking, scheduling and calendar | The public booking page, the shared busy calendar, timezones, and Google Meet meetings |
| 09 | Invoices, payments, print store, money ledger | Invoice numbering, the `payments` ledger as cash truth, Stripe (dormant), the print shop |
| 10 | The public client journey and Client Portal | The eight login-less surfaces and the capability-token security model that guards them |
| 11 | The AI layer — engine, providers, surfaces | Two disjoint lanes: the LLM provider chain, and the deterministic computer-vision scoring |
| 12 | Platform core — auth, workspaces, roles, tenancy | JWTs, the single `auth` middleware, and how tenant isolation is actually (not) enforced |
| 13 | Command Center — the platform control plane | The separate `cc_admins` identity tier, impersonation, the audit spine, the SQL console |
| 14 | Architecture — runtime, data, realtime, jobs, deploy | Two pm2 processes, `DATA_DIR`, the SSE bus, `ms_jobs`, and the horizontal-scaling ceiling |
| 15 | Security posture | Four trust planes, the confirmed arbitrary-file-read, and the isolation-by-convention model |
| 16 | UI/UX — design system, patterns, experience | CSS custom properties, five scoped visual identities, one shell, and the a11y picture |
| 17 | Gaps, risks, technical debt, maturity | Where the 11-phase maturity programme actually stands, and what breaks first under growth |
| 18 | Strategic potential | The moats (WhatsApp, desktop AI, the contact graph), the expansion paths, ranked by cost |

---

## The system at a glance

**Stack.** Backend: Node.js, **Express 5.2**, **better-sqlite3 12.9** against a single SQLite file in WAL mode,
`jsonwebtoken` (HS256), `bcryptjs`, `helmet`, `express-rate-limit`, `multer`, `jimp` + `exifr` for images,
`pdfkit` for signed PDFs and album exports, `nodemailer` + `imap` + `mailparser` for email, `node-cron`,
`web-push`, `adm-zip`, and **`whatsapp-web.js ^1.34.7`** (Puppeteer). **`ffmpeg` is required for video and voice
notes and is an undeclared host binary** — it appears in no `package.json`. Frontend: **Next.js 16.2.4** App
Router with **React 19.2.4**, `axios`, `lucide-react`, `recharts`, `@hello-pangea/dnd`, `livekit-client`.
Tailwind is installed and its directives are present, but the design system is CSS custom properties consumed
through inline `style={{}}` objects — 3,909 `var(--*)` uses across `src/`.

**Scale (measured 2026-08-24).**

| Metric | Value |
|---|---|
| Non-test backend JavaScript | ~21,400 lines across `backend/*.js` |
| Largest module | `backend/server.js` — 6,595 lines, **184 routes**, 43 `CREATE TABLE`s (auth, CRM, invoices, SSE bus, and mounts everything else) |
| Second largest | `backend/media-studio.js` — 2,882 lines, **115 routes**, 25 tables |
| Others of note | `whatsapp-service.js` 1,582 · `contracts-studio.js` 1,135 (41 routes) · `command-center.js` 916 (37 routes + 6 sub-modules) · `media-worker.js` 906 · `comms.js` 617 (24) · `ai-engine.js` 541 · `booking.js` 521 (12) · `video-engine.js` 486 · `entitlements.js` 352 · `payments.js` 310 (6) · `print-store.js` 198 (9) |
| Database | **141 `CREATE TABLE IF NOT EXISTS` statements, ~132 distinct tables** — 36 `ms_*` (Media Studio), 13 `cc_*` (Command Center), 8 `cs_*` (Contracts), 6 `chat_*` (Comms). No migration tool, no schema-version table |
| Frontend | ~38,000 lines in `wappflow-web/src`, **69 `page.js` route files**, 13 UI primitives in `components/ui/`, 18 admin pages under `/control` |
| God-pages | `app/page.js` (landing) 3,495 · `app/settings/page.js` 3,106 (18 tabs) · `app/leads/[id]/page.js` 2,961 |
| Realtime | One SSE stream `GET /api/events`, ~33 event types, **unnamed frames** (consumers must use `onmessage` + switch on `data.type`) |

**Deployment shape.** Two pm2 processes on one VPS behind nginx + certbot, single origin: `wappflow-api`
(`node backend/server.js`, port 3001) carries *all* REST routes, the SSE bus, the media job worker, the
WhatsApp browser sessions, the IMAP poller and every cron; `wappflow-web` (`next start`, port 3000) serves the
UI. All state lives under `DATA_DIR` (default `/data` in production): `wappflow.db` plus an `uploads/` tree.
`deploy.sh` builds into `.next.staging` and only swaps it in on a clean build, then `pm2 restart`. **There is
no migration step** — the schema installs itself on API boot. UNKNOWN: the actual host; nothing in the repo
records it, and `DEPLOYMENT.md` documents platforms that are demonstrably not what is running.

**Modules.** CRM (`server.js`) · WhatsApp engine (`whatsapp-service.js`) · Internal Comms + huddles
(`comms.js`) · Media Studio (`media-studio.js`, `media-worker.js`, `analyzers/`, `brains.js`,
`studio-ai.js`, `studio-experience.js`, `storage/`) · Video/Reels (`video-engine.js`, `reel-engine.js`,
`video-ai.js`, `video-templates.js`) · Contracts Studio (`contracts-studio.js`) · Booking
(`booking.js`, `availability.js`, `studio-time.js`) · Money (`payments.js`, `print-store.js`) · Public journey
(`public-brand.js`) · AI (`ai-engine.js`, `vision-cpu.js`) · Platform (`entitlements.js`, `pricing.js`,
`soft-delete.js`, `pagination.js`, `search.js`, `account-recovery.js`) · Command Center (`command-center.js` +
`cc-explorer`, `cc-desktop`, `cc-storage`, `cc-support`, `cc-timemachine`, `cc-reports`, `cc-metering`).

---

## The ten things that matter most

**1. WappFlow cannot take money, and any user can give themselves the top plan.** There is no subscription
billing at all — the upgrade button reads "Self-serve checkout is coming soon"
(`wappflow-web/src/app/settings/page.js:1347`) and `backend/command-center.js:309` labels its own MRR figure
as implied, "real subscription billing (not built)". Worse, `PUT /api/workspace/plan`
(`backend/server.js:5453`) is guarded by `auth` with **no role check** and accepts caller-supplied `features`
and `limits` JSON that the resolver merges *above* the plan tables — any seat, including role `user`, can
self-grant Enterprise in one request. And the plans are priced in PKR while the only payment rail is Stripe
(`backend/payments.js:52`), which does not serve Pakistan. *Why it matters: the entire monetisation layer is
greenfield, not a fix.*

**2. There is a confirmed unauthenticated arbitrary file read.** `GET /api/storage/file/:key`
(`backend/storage/index.js:58-69`, mounted at `server.js:6564`) has no auth, and
`backend/storage/providers/local.js:36` does a bare `path.join` with no containment check. Express 5 decodes
`%2F` into the parameter. A test executed against the real module returned a file outside the uploads root with
HTTP 200 — meaning `/api/storage/file/..%2Fwappflow.db` downloads the entire multi-tenant SQLite database:
bcrypt hashes, plaintext SMTP passwords, and every live capability token. *Why it matters: this is a
platform-ending single request and it should be treated as the first item of work.*

**3. Tenant isolation is hand-written convention, and it has already failed in at least seven places.** There
is no ORM, no row-level security, and no automatic tenant filter — isolation is whatever `WHERE workspace_id =
?` clauses developers remembered to type, driven by one `auth` middleware (`server.js:201-262`) that **fails
open on role** (`member?.role || 'super_admin'`, `:232`). About eleven child tables carry no `workspace_id` at
all. Confirmed cross-tenant defects: the WhatsApp send path falls back to any ready account
(`whatsapp-service.js:1139-1160`), `settle()` updates invoices by id with no workspace predicate
(`payments.js:135`), `DELETE /api/knowledge/:id` deletes another tenant's files (`server.js:4565`), the video
renderer resolves assets by id with no workspace clause (`media-worker.js:635`), `DELETE /api/tags/:id` runs an
unscoped `DELETE FROM lead_tags` (`server.js:3072`), `DELETE /api/chat/channels/:id` wipes messages before
authorising (`server.js:3332`), and the Meta webhooks fall back to the globally-oldest social account
(`server.js:5146`, `:5208`) with no signature verification. *Why it matters: each fix is local; the class of
defect is systemic and will recur until the pattern changes.*

**4. WhatsApp is unofficial browser automation — simultaneously the moat and the ceiling.** `whatsapp-web.js`
drives one headless Chromium per connected number, paired by QR against a personal WhatsApp account. About 40%
of `whatsapp-service.js` is failure recovery: zombie-Chromium cleaning that re-reads `/proc` cmdline to avoid
killing other tenants' browsers, a 60s init watchdog, a 3-strike heartbeat, capped exponential backoff. Four
separate "this never worked" breakages were fixed on 2026-08-24 alone. *Why it matters: it removes the Meta
approval barrier that blocks every competitor in this market, and it permanently prevents the backend from
being stateless.*

**5. One process, one SQLite file — and no document in the repo says the API cannot be scaled.** `sseClients`,
the Command Center's SSE map, the WhatsApp sessions, the IMAP poller, the media worker's `setInterval` and
every `node-cron` schedule are process-local. A second pm2 instance would split realtime delivery and
double-fire every cron. The media worker's ffmpeg and synchronous Jimp work runs **on the same event loop that
serves every HTTP request** (`media-worker.js:894`), so one 4K render stalls the whole API. *Why it matters:
this is the structural growth ceiling and it is documented nowhere else.*

**6. The pricing engine is an elaborate catalog wired to almost nothing.** Four PKR tiers and ~60 feature keys
are defined as data with a good resolver (`entitlements.js:273`, layering plan tables → workspace blob →
feature flags → overrides, cached 30s with provenance). But **no plan gates any module**; only *five* feature
keys are consumed anywhere and all five are client-side UI locks; there are exactly five server-side `402`
enforcement sites; and the monthly lead limit is bypassable through the product's own primary acquisition
channel because inbound WhatsApp, Instagram, Facebook, website forms, bookings and store orders all create
leads ungated. *Why it matters: the plan table is a marketing artefact, not a control system.*

**7. The public surface is guarded entirely by capability tokens that never expire and leak sideways.** Eight
login-less client pages (`/client`, `/g`, `/d`, `/shop`, `/pay`, `/book`, `/booking/manage`, `/folio`) are
protected by a random string in the URL and nothing else. `client_portals` has no revoke or expiry column;
`ms_galleries.expires_at` is declared as a roadmap feature and never written. Worse, `POST
/api/booking/public/:slug` matches an existing lead by phone and returns that lead's **portal token**
(`booking.js:400-403`, `public-brand.js:109-111`) — so a stranger who knows a client's phone number receives
that client's portal, and with it their contract *signing* tokens. Separately, `/uploads` is unauthenticated
static with `Access-Control-Allow-Origin: *` (`server.js:116-120`), so gallery passwords protect the JSON
listing but not the JPEGs. *Why it matters: the client-facing half of the product has no revocation story.*

**8. There is a large, expensive inventory of work that was built and never wired up.** Server-side pagination
exists and is correct (`backend/pagination.js`) with **zero frontend callers** — every core list still
downloads the whole workspace. Thirteen UI primitives exist; 8 of 69 pages import any of them, while 93 files
still contain 2,982 raw hex colours and 76 hand-rolled overlays. Invoice and contract recycle bins work on the
backend and are unreachable in the UI. Ten backend capabilities have `api.js` wrappers and no call sites (bulk
cull, invoice edit, gallery edit, mentions inbox, Creator Brain, Style Engine, and more). The `PROP-002`
verification scripts pass 19/19 only because their grep gates are scoped to the four already-migrated files
(`scripts/verify-batchC.js:146-153`). *Why it matters: much of the roadmap is adoption work, not construction
work — cheaper than it looks, but it will not happen by itself.*

**9. "AI" is two unrelated systems, and only the unsold one actually works reliably.** The **CV lane** is
deterministic Jimp/pHash scoring at ingest — no API key, no network — and it is what genuinely powers culling,
hero picking, album drafts and reel selection, writing advisory rows into `ms_asset_scores`. The **LLM lane**
funnels through `ai-engine.js` (5 providers, comma-separated multi-key rotation, per-key cooldowns,
self-healing model discovery). But `callLLM` accepts an optional `ctx` that **no call site anywhere passes**,
so `ai_usage.workspace_id` is always NULL: no per-workspace cost attribution, no quota, no AI dimension in the
metering at all — while `POST /api/cs/public/:token/ask` lets anyone holding a contract link spend LLM budget
unauthenticated. Nine AI entitlement keys are priced and enforced nowhere. *Why it matters: AI is an
uncapped, unattributed cost centre sold as a tiered feature.*

**10. The dominant failure mode is a confident wrong answer, not an error.** This is the single most important
thing to understand about the codebase's quality profile. `computeComposites` treats a 0..1 mean-luminance
value as a signed -1..1 deviation (`analyzers/index.js:153`), so **a pitch-black frame scores a perfect
exposure of 1.0** — silently corrupting every AI selection, hero shot and print recommendation. On
`STORAGE_PROVIDER=r2`, gallery ZIPs ship zero files and album PDFs render blank pages while both report
`status='ready'` (`media-worker.js:527`, `:604`). `GET /api/leads/duplicates` is registered *after* `GET
/api/leads/:id` and is permanently shadowed into a 404, which the UI reports as a confident "No duplicates
found". When the LLM is down, `analyzeLeadIntelligence` returns a hardcoded neutral object that is then
*persisted onto the lead row*, indistinguishable from real analysis. And 101 empty `catch {}` blocks in
`app/` mean an outage renders as "No clients yet". *Why it matters: you cannot trust the absence of an error
as evidence that anything worked.*

---

## Maturity summary

| Module / capability | Rating | Justification |
|---|---|---|
| CRM — leads, pipeline, clients, activity timeline | **SHIPPED** | One `leads` table, six stages, win→client auto-promotion, one activity spine written by every module |
| WhatsApp engine (pair, ingest, send, reconnect) | **PARTIAL** | Works end to end; `getReadyService()` can send from another workspace's number and no caller passes an accountId |
| Internal Comms (channels, DMs, threads, mentions) | **SHIPPED** | Membership-scoped SSE fan-out, pins, presence, receipts, search |
| Video huddles (LiveKit) | **PARTIAL** | Tokens minted correctly; call lifecycle half-wired (no join/leave events, every call reports one participant); LiveKit deployment UNKNOWN |
| Media Studio — ingest → cull → gallery → deliver | **SHIPPED** | The most complete module in the product; 115 routes, 37 tables, real job queue |
| Gallery expiry / `is_hidden` / marketplace packs | **SOLD-NOT-BUILT / STUB** | Columns declared, read by nothing, written by nothing |
| Video / reels rendering | **PARTIAL** | One EDL, real ffmpeg render, four generation paths; but 4 of 9 transitions render as hard cuts, Ken Burns distorts aspect ratio, cross-tenant asset render |
| Contracts Studio (single-party) | **SHIPPED** | Block builder, ceremony, ESIGN consent, hash, audit trail, certificate PDF |
| Contracts Studio (multi-party signing) | **STUB** | The first signer sets `status='signed'` and `:1043` then refuses every subsequent signer — advertised on the landing page |
| Contract automations (pipeline, invoice, project) | **SHIPPED** | `runAutomations` (`contracts-studio.js:276`) through shared creators |
| Contract payments / redline / void / download tracking | **SOLD-NOT-BUILT** | Only `deposit` alters the invoice; no pay link is ever minted; `voided` is guarded and set by nothing |
| Booking — public page, slots, handoffs | **SHIPPED** | Find-or-create lead, reminder, timeline entry, WhatsApp confirmation, shoot creation |
| Booking deposits, studio-side reschedule, `.ics`, analytics | **SOLD-NOT-BUILT** | Prices are shown to clients; nothing charges anything |
| Meetings / Google Calendar | **PARTIAL** | OAuth and push are built; create + list only, no cancel or delete, and push is a silent no-op without a configured timezone |
| Invoices | **PARTIAL** | Create/list/edit/soft-delete work; `invoiceDoc.js:69` calls an unimported `displayPhone` and throws for any invoice with a phone number |
| Payments ledger | **SHIPPED** | Partial UNIQUE idempotency index, one `markPaidByInvoice` path, guarded backfill — but it has no UI |
| Stripe checkout + webhook | **PARTIAL (dormant)** | Code complete, timing-safe HMAC, replay window, idempotency; `STRIPE_SECRET_KEY` appears in no config the repo can see |
| Print store | **PARTIAL** | Public shop, server-side re-pricing and the invoice chain all work; pay links are minted with the wrong `kind`, so paid orders stay "new" forever |
| Client Portal + public journey | **SHIPPED** | Eight surfaces, per-studio branding, OpenGraph previews, conversion links |
| Portfolio (`/folio`) | **PARTIAL** | Phase 8 branding never reached the page; still hard-codes "Made with WappFlow Studio", and portfolios are per-user not per-workspace |
| AI — CV lane (Track 0 scoring) | **SHIPPED** | Deterministic, key-free, versioned, supersedable by a desktop ONNX pass — with the exposure inversion bug |
| AI — LLM lane | **PARTIAL** | Provider chain, failover and self-healing all work; zero metering attribution, zero quota, zero plan gating |
| AI mutating commands / knowledge crawl / BYOK | **SOLD-NOT-BUILT** | Advertised on the landing page; every `/api/ai/command` intent is read-only, `/api/knowledge/crawl` does not exist, no per-workspace key store |
| Auth, workspaces, multi-tenancy | **PARTIAL** | Works; JWTs never expire, role check fails open, a user belongs to exactly one workspace (no switcher) |
| Roles and permissions | **SOLD-NOT-BUILT** | 2 of 9 declared permissions are enforced anywhere; `workspace_role_permissions` is written, displayed, and never read by `auth` |
| Entitlements resolver | **SHIPPED** | The resolver itself is genuinely good: layered sources, hash-bucket flags, 30s cache with provenance |
| Plan metering + enforcement | **PARTIAL** | 5 live metrics computed from source tables; 5 hard enforcement sites; bypassable on every inbound channel |
| Subscription billing / Founding 100 | **SOLD-NOT-BUILT** | No checkout, no subscription table; `founding_program` is created, counted, and never written |
| Command Center | **PARTIAL** | 58 routes and 18 pages genuinely live with the best audit spine in the codebase; grace periods are decorative, `cc_inbox` has no writer, spec §7/§17/§19/§20/§30 absent |
| Realtime SSE bus | **SHIPPED** | One stream, unnamed frames, `type` spread last so payloads cannot rename their own event |
| Job queue (`ms_jobs`) | **SHIPPED** | Atomic claim, 10-minute lease, stale reaper, retries — the only multi-worker-safe component, running single-process |
| Soft delete / recycle bin | **PARTIAL** | Retention registry is real (90 days, invoices never purged); the UI covers leads only |
| Universal search + Ctrl+K palette | **PARTIAL** | Both work; search is `LIKE '%q%'` with no FTS5 index |
| Pagination | **STUB** | Correct and opt-in; no frontend caller opts in |
| Design system | **PARTIAL** | Tokens and 13 primitives exist; adoption stalled at ~8 of 69 pages |
| Accessibility | **SOLD-NOT-BUILT** | 915 `onClick` vs 12 `aria-*` in `app/`, zero `tabIndex`, no skip link, 9 `<main>` landmarks across 69 pages |
| Onboarding / first-run | **SOLD-NOT-BUILT** | No wizard, checklist or tour; login writes a `wf_just_logged_in` flag that nothing reads |
| White-label, SSO, API access, custom integrations, multi-pipeline | **SOLD-NOT-BUILT** | Catalog strings only; `white_label` is never read and studio branding already applies on every tier |
| Flux integration | **SOLD-NOT-BUILT** | SSO bridge is genuinely built, but `FLUX_PARKED` blocks every entry point while plans still advertise `flux: true` |
| Desktop app / local ONNX engine | **UNKNOWN** | Lives in a separate repo; the server-side seam (`analyzers` registry `where:'client'`, score-ingest routes) is SHIPPED and testable |
| CI / automated testing | **SOLD-NOT-BUILT** | No CI of any kind; 68 hand-run scripts, 8 of which are pure source-text invariant pins |

---

## Glossary

| Term | Meaning in WappFlow |
|---|---|
| **Workspace** | The tenant. Every row of business data carries a `workspace_id`. A user belongs to exactly one (`users.workspace_id` is a scalar column) — there is no workspace switcher |
| **Lead** | A person who contacted the studio. The one contact record; auto-created from WhatsApp, Instagram, Facebook, a web form, a booking, or manual entry |
| **Client** | Not a separate record — the same `leads` row with `is_client = 1`, set automatically when the deal reaches "Closed - Won" |
| **Pipeline stage** | One of six status values (New, Contacted, Interested, Negotiating, Closed - Won, Closed - Lost) stored as a stable DB key and mapped to a display label by a frontend registry |
| **Project / shoot** | `ms_projects` — the unit of photographic work attached to a lead |
| **Cull** | The photographer's triage pass over the raw take: keep / reject / maybe, a 0–5 star rating, a colour label. One row per photo in `ms_cull_decisions`, always owned by a human user id |
| **Gallery** | The *client-facing delivery surface* (`ms_galleries`): a share token, a visibility mode, a download policy. This is what the client is sent a link to (`/g/:token`) |
| **Album** | A *print/layout artefact* (`ms_albums` + `ms_album_pages`): a page-by-page book design with physical millimetre dimensions that exports to PDF. A gallery is for viewing; an album is for printing |
| **Portfolio** | The studio's own public marketing site (`/folio/:handle`), unrelated to any one client |
| **Proofing / selection set** | A gallery mode where the client must pick a bounded number of images (a quota) for retouching, with revision rounds |
| **Collection** | A client-created named subset of a gallery's favourites |
| **Story section** | A titled chapter within a gallery, derived from the photographer's upload folder names |
| **Timeline** | A video edit stored as one `ms_timelines` row whose `document` column holds a JSON **EDL** |
| **EDL** | Edit Decision List — the declarative description of a video (tracks → clips → transitions/effects) that a pure function turns into ffmpeg arguments |
| **Reel** | A short vertical social video produced from an EDL, generated by one of four paths (blank, template pack, AI draft, auto-reel) |
| **Ken Burns** | The slow pan-and-zoom applied to a still photograph in a video clip |
| **Track 0** | The baseline, deterministic computer-vision scoring pass run at ingest (sharpness, exposure, duplicates, composition) — no LLM, no API key |
| **Analyzer** | A pluggable scorer in a registry, marked `where: 'server'` or `where: 'client'`, so heavy vision work can move to a desktop app later |
| **Composite score** | A weighted blend of Track-0 scores (hero, portfolio, album fitness) used to rank photos for AI selections |
| **Studio Brain / Creator Brain / Style Profile** | Three different learning systems: workspace preferences, a per-user culling behaviour profile, and a measured "house look" derived from the photos a studio actually keeps |
| **Capability token** | A random string in a URL that *is* the credential — no login, no password, no expiry. Guards all eight public client surfaces |
| **Share token** | The specific capability token on a gallery (`ms_galleries.share_token`) |
| **Entitlement** | A resolved boolean feature key or numeric limit for a workspace, produced by layering plan tables → workspace blob → feature flags → overrides |
| **Feature flag** | A percentage rollout resolved by deterministic hash bucketing inside the entitlements resolver |
| **Module gate** | Middleware that would 403 a whole route prefix for a workspace — currently inert because it only fires on an explicit `false` no plan sets |
| **Metric / meter** | One of exactly five live usage dimensions (leads/month, users, WhatsApp accounts, storage GB, contract sends/month), computed live from source tables |
| **Spine** | A single shared table or code path that every module writes through — e.g. the *activity spine* (`activity_timeline`), the *money spine* (`payments`), the *audit spine* (`cc_audit`) |
| **Handoff** | An automatic cross-module creation: signing a contract raises an invoice and opens a shoot; a booking creates a lead and a project; a store order raises an invoice and a pay link |
| **Pay link** | A `payments` row with a `public_token`, surfaced at `/pay/:token` |
| **Soft delete / recycle bin** | `is_deleted` flags governed by a retention registry (90 days for most objects; invoices never auto-purged) |
| **`getScopedLead`** | The one helper that resolves a lead id under both tenant and per-member visibility rules, collapsing "wrong tenant" and "not assigned to you" into the same null |
| **`safeAlter`** | The homegrown migration primitive: run an `ALTER TABLE`, swallow only "duplicate column" errors. There is no migration tool and no schema-version table |
| **Marker-gated backfill** | A one-time data migration guarded by a row in `app_meta` or `payments_meta` so it runs once, ever |
| **Dual-read predicate** | The legacy clause `(workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))`, needed because invoices and email workflows were re-keyed from user to workspace |
| **Command Center (`/control`)** | The internal platform control plane, with its own `cc_admins` identity tier, its own JWT audience, impersonation, and a hardened read-only SQL console |
| **Impersonation** | A Command Center admin minting a 30-minute customer-scoped token, optionally in a server-enforced read-only mode |
| **Founding 100** | An advertised half-price early-customer programme whose table exists, is counted, and is never written to |
| **The Canon** | The repo's governance documents — `ENGINEERING-CONSTITUTION.md`, `PRODUCT-BIBLE.md`, and the numbered `proposals/`, `adr/` and `rfc/` directories that require a written proposal before significant change |
