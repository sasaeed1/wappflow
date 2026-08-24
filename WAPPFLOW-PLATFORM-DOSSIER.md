# WappFlow — Complete Platform Dossier

> **What this is.** An exhaustive, code-grounded description of the WappFlow platform:
> every module, its architecture, its security posture, its user experience, what is
> genuinely shipped versus stubbed, and where it could go. Written to be read by someone
> — human or model — who has **no access to the codebase**, as the basis for further
> analysis and product planning.
>
> **How it was produced.** Eighteen independent agents each read one slice of the source
> and wrote it up under a shared rule set: cite `file:line`, never invent, and classify
> every feature as SHIPPED / PARTIAL / STUB / SOLD-NOT-BUILT. An adversarial critic then
> re-read the whole thing against the repository hunting for omissions and false claims;
> the six addenda at the end are what it found missing, and four factual corrections were
> applied to the sections themselves.
>
> **Read section 00 first.** The survey was written while Phase 8 was landing, and Phase 9
> landed after it. Section 00 lists exactly what moved, so you do not plan work that is
> already done.
>
> **Trust the code, not the older docs.** Several documents in the repository (notably
> `PRODUCT-AUDIT.md`) predate phases 1–9 of remediation and are stale in places. Where
> this dossier and an older document disagree, this one was written against the source.


*Generated 2026-08-24 · ~105,480 words across 25 sections.*


---


<!-- ── 00-what-changed-since.md ─────────────────────────────────────────── -->

## READ THIS FIRST — what changed after the sections below were written

The eighteen survey sections in this dossier were written by agents reading the
source **while Phase 8 was being implemented**, and **Phase 9 landed entirely
afterwards**. Everything else in this document is accurate as written; the areas
listed here moved under it. Where a later section contradicts this one, believe
this one.

This matters because several of the defects the sections describe — and reasonably
present as open problems — are now closed, and a plan built on them would be
planning work that is already done.

### Phase 8 — the studio's identity on public pages (commit `e2f2eec`)

| The sections may say | What is now true |
|---|---|
| `company_logo` is never rendered on any public page | `backend/public-brand.js` is a single resolver used by **all eight** public surfaces (gallery, contract, shop, pay, booking, booking-manage, portal, portfolio). It returns `{name, logo, accent, website, email, phone, tagline}` with the logo absolutised. |
| Public endpoints answer "who is the studio?" inconsistently — three return a bare name string that falls back to the literal `'WappFlow'`, two return nothing | Every one returns the same `brand` **object**. A studio that has filled in nothing renders **no mark at all**, never a placeholder identity. |
| Shared links preview as generic WappFlow marketing | Each public route has a server `layout.js` with `generateMetadata` (`wappflow-web/src/lib/publicMeta.js`). Token pages are `noindex`; `/book` and `/folio` are indexable. |
| The portal lists what happened but offers no next step; the gallery is a dead end | `journeyLinks()` returns only destinations that exist; `PublicNextSteps` renders them at all four conversion points (sign, pay, book, order). The gallery links back to the portal. |
| The portal link is buried in the Contracts vault and never auto-created | `ensureClientPortal()` runs on `Closed - Won` in **both** the single and bulk status routes, and records the link on the client's timeline. |

**A trap worth knowing about**, because it shapes any future work on public pages:
`GET /api/cs/public/:token` marks a contract **viewed** and notifies the studio;
the gallery route logs an access; the portfolio route increments a view counter.
A server-side metadata fetch would fire all three on every link *preview*. The
frontend's preview fetch therefore sends `X-WF-Preview: 1` and those three
endpoints skip their side effect for it. Anything that adds server-side fetching
of a public endpoint must do the same.

### Phase 9 — correctness (commit `c6854e7`)

| The sections may say | What is now true |
|---|---|
| The double-booking guard checks exact start only, so overlapping bookings of differing durations both succeed | Both the create and reschedule guards apply the **same interval test the slot list uses**, plus opening-hours, blackout and lead-time validation. Check-and-claim is one **transaction**, so concurrent bookers serialise. |
| `availability.toMs` parses a naive booking stamp as server-local and an ISO meeting stamp as an instant | `backend/studio-time.js` puts both on one instant scale. A booking and a meeting at the same real moment now compare equal — previously they sat the studio's whole UTC offset apart on the shared busy calendar. |
| `booking_settings.timezone` is a display label that nothing applies | It is **validated and load-bearing**: slots, the collision guard, confirmation messages, reminders and the Google Calendar push all read it. With none set, behaviour is unchanged (naive stamps read as UTC). |
| Booking times render in the viewer's or the server's timezone | One formatter, `formatStudioTime` (backend) / `formatAppointment` (frontend). The confirmation message previously rendered in the **Node process's** zone — a Karachi studio on a UTC box was texting clients times five hours out. |
| There is no password reset of any kind | `backend/account-recovery.js`: hashed single-use tokens, 60-minute expiry, no account enumeration, and **session revocation** via `users.token_version` (JWTs here are signed without expiry, so a reset previously could not invalidate a stolen token). Impersonation tokens carry the claim too. |
| "Overdue" is never computed | Derived on read in `parseInvoice`, so every invoice response carries `is_overdue`. Not a stored status: a cron would race the payments ledger and go stale when a due date changed. |
| `sent` has no colour in the invoice list | `sent` is in the status registry. `Outstanding` now counts every unpaid non-draft invoice, not only `pending` — contract- and store-generated invoices are written as `sent` and were excluded from the studio's own receivables figure. |
| The owner cannot cancel or reschedule a booking | Both exist (`POST /api/booking/:id/cancel`, `POST /api/booking/:id/reschedule`), the client is notified, and the calendar entry moves or is deleted with it. |
| The store page never surfaces the shop link | `GET /api/store/links` returns one copyable link per published gallery. |

### Design decisions recorded, not just changes

Two are worth carrying into any plan because the obvious alternative was
deliberately rejected:

1. **Bookings keep wall-clock storage rather than migrating to stored UTC.** An
   appointment means "2pm at the studio", not an instant — wall clock plus a zone
   survives a government changing its DST rules. And converting existing rows
   would mean guessing the timezone of every booking already taken, for studios
   that mostly never set one. There is no safe migration, so there was no
   migration.

2. **The Google Calendar push is a deliberate no-op unless a studio has set a
   timezone.** A calendar full of events at the wrong hour is worse than no
   events. It switches itself on when they configure one.

### What is still open

Phases 1–9 of `PRODUCT-AUDIT.md` are done. **Phase 10** (named intelligence and
advanced features — Studio/Creator/Video Intelligence wired to real surfaces,
Gallery Expiry, lead follow-up and duplicate detection, the Command Center health
dashboard, workspace branding, keyboard shortcuts, drafts, multi-account
WhatsApp) was the remaining roadmap phase at the time this dossier was assembled.

The **accessibility** item from Phase 9 was NOT done: the audit's count of ~19
aria-labels against ~1074 `onClick` handlers still stands, and section 16 (UI/UX)
should be read as current on that point.

Separately, and unrelated to the roadmap: a set of API credentials (five AI
provider keys, a Google OAuth client secret, a LiveKit secret) were exposed in
plain text during development and **have not been rotated**. Any security
analysis should treat them as compromised.


---


<!-- ── 01-executive-summary.md ─────────────────────────────────────────── -->

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


---


<!-- ── 02-product-overview.md ─────────────────────────────────────────── -->

## Product overview, personas and the business model

> **Line-citation snapshot note (added 2026-08-24).** This section's `backend/server.js` citations were
> written against an earlier snapshot than the one §14/§15 were pinned to. Measured against the current
> file (**6,595 lines**), they run low by roughly **+20 lines below ~line 2,000 and up to +50 lines above it**
> — beyond the dossier-wide ±25 tolerance stated in §01. The endpoints named below have been re-pinned to the
> current file; for any other `server.js:NNNN` reference in this section, grep for the quoted code rather than
> trusting the number.

### What this part of the product is for

WappFlow is a multi-tenant SaaS whose stated purpose is to be the single operating system a small
photography/videography studio runs its whole business on: capturing a lead from WhatsApp, talking to that
lead, sending them a contract, booking the shoot, ingesting and sorting the photos, delivering them in a
client-facing gallery, and getting paid — all against one customer record. The repo's own canonical statement
is `PRODUCT-BIBLE.md`: *"WappFlow is the Creative Business Operating System… one place where a photo/video
studio runs its entire business"*, with the explicit non-goal of competing on feature count and a north-star
test of *"Does this make WappFlow feel more like one operating system?"*.

The business model layer — plans, limits, entitlements, metering — is the machinery that decides which parts
of that OS a given workspace may use and how much of it they may consume. This section documents that
machinery as it actually exists in code, and it is blunt about a large gap: **the plan catalog is elaborate
and almost entirely unenforced, and there is no way for a customer to pay WappFlow any money.**

---

### Who it is for

**Primary persona (from code, not from a persona doc).** There is no persona document in the repo, so the
target user has to be inferred from hard-coded defaults and copy. The evidence is consistent and points at a
**Pakistani / South-Asian photography or video studio**:

| Signal | Evidence |
|---|---|
| Subscription currency is Pakistani Rupees | `backend/entitlements.js:123` — `const PLAN_CURRENCY = 'PKR'` |
| Phone matching is written around Pakistani numbers | `backend/server.js:1099-1110` normalises `+92` vs leading `0`; the duplicate-check comments use `"+92 310 154 7564"` (`server.js:1813`, `server.js:2093`) |
| AI prompt examples are priced in PKR | `backend/server.js:4336`, `backend/server.js:4374` — example knowledge values are `"45,000 PKR"`, `"45,000 PKR for 3 months"` |
| Marketing testimonial anchors to Karachi | `wappflow-web/src/app/page.js:1739` — *"Owner, Karachi real estate agency"* |
| WhatsApp is the assumed primary channel, not email | whole architecture; see below |

**Secondary/aspirational persona.** The landing page is fighting itself. The hero (`page.js:180-196`) sells a
generic B2B sales tool — *"Close every lead that touches your WhatsApp"*, *"The AI-powered CRM built for the
way modern teams actually sell"* — and the trust bar says *"Built for sales teams that actually live in
WhatsApp"* (`page.js:374`). The pricing section 1,500 lines later sells something else entirely: *"Built for
photographers, videographers, studios & agencies"* (`page.js:1861`), with plan tiers literally named Creator /
Studio / Studio+. The testimonials mix a real-estate agency, a SaaS company, an e-commerce brand and a B2B
services founder (`page.js:1736-1753`) — none of them studios. **This is a real positioning conflict a planner
must resolve**: the pricing, the module names, the entitlement keys (`media_studio`, `contracts_studio`,
`print_store`) and the PRODUCT-BIBLE all say "creative studio OS"; the top half of the landing page says
"WhatsApp CRM for sales teams".

### Jobs to be done

Derived from the `signature workflow` in `PRODUCT-BIBLE.md` and confirmed by the module wiring in
`backend/server.js:6237-6430`, the jobs are:

1. **Never lose a WhatsApp lead.** Inbound WhatsApp messages auto-create leads
   (`backend/whatsapp-service.js:348`, `:955`), so the conversation *is* the CRM record.
2. **Get the client signed without paper.** Contracts Studio: template → draft → send over WhatsApp + email →
   e-sign → vault (`backend/contracts-studio.js`, 41 routes under `/api/cs/*`).
3. **Put the shoot on the calendar without a phone call.** A public booking page creates the lead and the
   booking (`backend/booking.js`, `/api/booking/public/:slug`).
4. **Cull and deliver thousands of photos.** Media Studio, 115 routes under `/api/media/*`.
5. **Get paid.** Invoices (in `server.js`), a payments ledger with Stripe checkout
   (`backend/payments.js:110-130`), and a print store (`backend/print-store.js`).
6. **Give the client one link for everything.** Client Portal (`server.js:6272-6324`).

**Domain vocabulary for a reader who has never seen this product:**

- **Lead** — a person who contacted the studio. Auto-created from an inbound WhatsApp/Instagram/Facebook
  message, a website form, a booking, or manual entry. Becomes a **client** via an `is_client` flag on the
  same `leads` row (see `command-center.js:365-366`, which counts clients as `leads WHERE is_client = 1`).
- **Project / shoot** — `ms_projects`. The unit of photographic work attached to a lead.
- **Cull** — the photographer's triage pass over the raw take: keep / reject / maybe, a 0–5 star rating, a
  colour label, a flag. Stored one row per asset in `ms_cull_decisions` (`media-studio.js:122-133`). Note
  `user_id TEXT NOT NULL, -- a real human always owns the decision`, which is the code-level expression of the
  Bible's "control-first intelligence" principle: AI scores, humans decide.
- **Gallery** — the *client-facing delivery surface* (`ms_galleries`, `media-studio.js:1284`). Has a
  `share_token`, a `visibility` of `public|private|password|client_portal`, a publish `status`, and settings
  for watermarking and download policy. This is what the client is sent a link to (`/g/:token`).
- **Album** — a *print/layout artefact* (`ms_albums`, `media-studio.js:1380`): a page-by-page design with
  physical dimensions (`spec` = `{ w_mm, h_mm, margin_mm }`) that renders to a PDF. A gallery is for viewing
  and choosing; an album is for printing.
- **Portfolio** — the studio's own public marketing site (`ms_portfolios` / `ms_portfolio_items`, route
  `/folio`), unrelated to any one client.

---

### Why WhatsApp-first matters for this market

In Pakistan and much of South Asia, small-business commerce runs on WhatsApp, not email. A studio's enquiries
arrive as DMs and voice notes at unpredictable hours — the landing page states the thesis directly:
*"Traditional CRMs were built for email and forms. But customers DM you. They voice-note you. They go quiet
for three days and then ask for pricing at 11pm"* (`page.js:420-422`). Three architectural consequences follow
in the code:

1. **No Meta Business API dependency.** WappFlow drives WhatsApp Web through `whatsapp-web.js` with a
   Puppeteer-controlled browser session (`backend/whatsapp-service.js:1`, `LocalAuth`, QR pairing). The FAQ
   sells this as the feature: *"No. WappFlow connects directly to WhatsApp Web via a QR code — no API
   approval, no Meta paperwork"* (`page.js:2072`). For a studio with no company registration and no Meta
   Business verification, this is the difference between usable and not.
   **Risk, stated plainly:** this is unofficial automation of a consumer WhatsApp session. It is a ban/ToS
   exposure, it needs a headless Chrome per connected number (`browserPid` is tracked at
   `whatsapp-service.js:37`), and it is why `whatsapp_accounts` is a metered, priced resource.
2. **Multi-number is a first-class plan dimension.** `whatsapp_accounts` is one of only five metered limits
   (1 / 2 / 5 / unlimited across the tiers) because each connected number costs real server resources.
3. **Delivery rides the same channel.** Contracts, galleries, bookings and print orders are all sent to the
   client through the same WhatsApp send path (`server.js:6318-6323`, `bookingSend`; and the `sendClientMessage`
   seam injected into media-studio, booking, print-store and contracts-studio). The client never leaves
   WhatsApp; they just receive links.

---

### The module surface

| Module | Entitlement key | Backend | Route prefix | Client-facing route | Maturity |
|---|---|---|---|---|---|
| CRM (leads, pipeline, inbox, invoices, reports) | `crm` | `server.js` (184 routes) | `/api/leads`, `/api/invoices`, `/api/reports`, … | — | SHIPPED |
| Media Studio (projects, cull, galleries, albums, portfolio) | `media_studio` | `media-studio.js` (115 routes) | `/api/media/*` | `/g/:token`, `/folio` | SHIPPED |
| Contracts Studio | `contracts_studio` | `contracts-studio.js` (41 routes) | `/api/cs/*` | `/d/:token` | SHIPPED |
| Booking | `booking` | `booking.js` (10 routes) | `/api/booking/*` | `/book/:slug` | SHIPPED |
| Invoices / Payments / Store | `print_store`, `payments` | `server.js` + `payments.js` (6) + `print-store.js` (8) | `/api/payments/*`, `/api/store/*` | `/pay/:token`, `/shop/:token` | PARTIAL — Stripe checkout only, no local (PKR) rail |
| Client Portal | `client_portal` | `server.js:6262-6324` | `/api/client-portal/*` | `/client/:token` | SHIPPED |
| Communications (chat, threads, presence, huddles) | *(none)* | `comms.js` (24 routes) | `/api/comms/*` | — | PARTIAL — huddles require LiveKit env; unconfigured ⇒ dead |
| Command Center (internal control plane) | *(separate identity)* | `command-center.js` (37) + `cc-*.js` | `/api/cc/*` | `/control/*` | SHIPPED (internal) |
| Studio AI / Video AI / Reel / Brains / Style | *(none)* | `studio-ai.js`, `video-ai.js`, `reel-engine.js`, `brains.js` | `/api/studio-ai/*`, `/api/video-ai/*`, `/api/media/*` | — | PARTIAL |
| Flux (sibling Instagram content engine) | `flux` | separate repo | — | external URL | PARKED — `wappflow-web/src/lib/flux.js` forces `FLUX_PARKED = true` |

**Stale-doc note.** `DESKTOP-FINAL-VISION.md` records Command Center as unmounted dead code. That is no longer
true: it is mounted at `server.js:6426` and has a complete Next.js surface at `wappflow-web/src/app/control/`
(overview, customers, plans, flags, audit, storage, support, adoption, timemachine, desktop). **Believe the
code.** Likewise the FAQ claims huddles run on Jitsi (`page.js:2104`); the code migrated to self-hosted
LiveKit (`comms.js:423`, `components/HuddleModal.js:8-9`) — the FAQ is stale.

**Frontend module surface is narrower than the backend.** The app switcher knows only three modules — CRM,
Media Studio, Contracts Studio (`wappflow-web/src/components/shell/modules.js:20-92`, `MODULE_ORDER`).
Booking, Invoices and Communications are *nav items inside CRM*; Client Portal, Print Store, Portfolio,
Gallery and Pay are unauthenticated client-facing pages; Command Center is a separate `/control` app with its
own identity tier (`cc_admins`, `command-center.js:65`, seeded from `CC_FOUNDER_EMAIL` /
`CC_FOUNDER_PASSWORD`, optionally IP-restricted by `CC_IP_ALLOWLIST`).

---

### The plan catalog

Four tiers, defined as data in `backend/entitlements.js:94-117` and seeded into SQLite tables on boot
(`seed()`, `entitlements.js:202`).

| Plan key | Display name | List price | Founding-100 price | users | leads/mo | WhatsApp accts | storage_gb | contract_sends/mo |
|---|---|---|---|---|---|---|---|---|
| `creator` | Creator | PKR 7,999 | PKR 3,999 | 1 | 200 | 1 | 50 | 25 |
| `studio` | Studio | PKR 14,999 | PKR 7,499 | 5 | 500 | 2 | 250 | 100 |
| `studio_plus` | Studio+ | PKR 29,999 | PKR 14,999 | 15 | 5,000 | 5 | 1,024 | 500 |
| `enterprise` | Enterprise | Custom (`null`) | — | −1 | −1 | −1 | −1 | −1 |

`-1` means unlimited (`entitlements.js:114`). Prices: `PLAN_MONTHLY_PRICE` (`:119`), `PLAN_FOUNDING_PRICE`
(`:122`), currency `'PKR'` (`:123`), entry plan `DEFAULT_PLAN = 'creator'` (`:124`).

**Feature sets use inheritance:** `CREATOR_FEATURES` (`:29`) → `+ STUDIO_ADD` (`:65`) → `+ STUDIO_PLUS_ADD`
(`:81`) → `+ ENTERPRISE_ADD` (`:89`). Roughly 60 boolean keys in total.

**Which modules can each plan see? All of them.** Every module key — `crm`, `contracts_studio`, `booking`,
`media_studio`, `portfolio`, `client_portal`, `print_store` — is `true` in `CREATOR_FEATURES`
(`entitlements.js:31-32`). No tier removes a module. What the tiers gate is *depth*:

- **Creator** gets the modules plus WhatsApp, email, shared inbox, voice notes and `basic_ai`; it explicitly
  loses Instagram/Facebook/website capture, all team/reporting/knowledge features, all AI depth (reply
  suggestions, lead intelligence, next-best-actions, Studio Brain, asset scoring, hero-shot, culling),
  contract depth (clause library, versioning, redline, approvals, bulk send), gallery depth (collections,
  story sections, advanced proofing, portfolio management), automation and calendar integrations.
- **Studio** adds all of the above plus Desktop Beta (`desktop_access`).
- **Studio+** adds `white_label`, `priority_support`, `desktop_sync`, `local_ai`, `style_profiles`,
  `story_engine`, `reel_engine`, `ai_editing`, `flux`.
- **Enterprise** adds `api_access`, `byok`, `sso`, `audit_logs`, `dedicated_support`, `custom_integrations`,
  `custom_branding`.

**Sold-but-unbuilt guard.** `UNBUILT_FEATURES = new Set(['ai_editing'])` (`entitlements.js:135`) is forced off
at the resolver regardless of plan/flag/override and stripped from the advertised catalog by `getAllPlans()`
(`:333`). The comment records that `reel_engine`, `story_engine`, `style_profiles` and `desktop_sync` were
removed from this set as they shipped. This is an honest, well-designed mechanism — and it is the *only* place
in the codebase where "we sold it but haven't built it" is handled deliberately.

### Founding 100

Marketing promise (`page.js:1861`, `:1870`, FAQ `:2126`): the first 100 paying studios lock 50% off
permanently, plus founder access, roadmap input, beta features, early desktop access.

Implementation: table `founding_program (workspace_id PK, slot, plan, joined_at, active)`
(`pricing.js:49-52`); `foundingStatus()` (`pricing.js:166`) reads `pricing_config.founding_slots` (default
`'100'`, `pricing.js:62`) and counts `founding_program WHERE active=1`; `/api/plans` (`server.js:5566`, public,
unauthenticated) surfaces it to the landing page.

**Classification: STUB.** Nothing in the codebase ever writes a row into `founding_program` (verified by grep:
the only references are the `CREATE TABLE` and the `COUNT(*)`). `taken` is therefore permanently 0, so the
banner permanently renders *"100 of 100 spots left"* and `open` is permanently `true`. There is also no
mechanism to *hold* a founding price against a workspace — `plan_prices.is_founding` is a catalog row, not a
per-customer contract, so the "locked permanently" promise has no data model behind it.

---

### How entitlements resolve at runtime

The resolver is `getEntitlements(db, workspaceId)` (`entitlements.js:273`). Precedence, lowest to highest:

1. **Plan tables.** `plan_features` / `plan_limits` for `workspace_plan.plan`; falls back to the embedded
   `PLAN_DEFINITIONS` if unseeded (`:284-295`).
2. **Per-workspace JSON blob.** `workspace_plan.features` / `.limits` are `Object.assign`-ed over the plan
   (`:297-299`).
3. **Feature flags.** `applyFlags()` (`:236`) — precedence within flags: workspace assignment > global
   assignment > `default_state` > deterministic percentage rollout. The rollout bucket is a stable string hash
   of `workspaceId + ':' + flagKey` (`bucket()`, `:147`), so a 25% rollout always hits the same workspaces.
4. **Entitlement overrides.** `applyOverrides()` (`:258`) — time-windowed, non-revoked rows in
   `entitlement_overrides`, `kind ∈ {limit, feature, module}`.
5. **Unbuilt guard.** Forced off (`:306`).

Results are cached 30 s per workspace (`CACHE_TTL_MS`, `:137`); `invalidate(workspaceId)` clears it. Every
resolved value carries a `sources[key]` provenance string (`flag:workspace`, `override:limit`, `unbuilt`, …)
so Command Center can answer "why does this workspace have this?".

**Schema (config-as-data, all created by `ensureSchema`, `entitlements.js:154`):**

| Table | Key columns |
|---|---|
| `plans` | `key` (unique), `name`, `status`, `visibility`, `sort_order`, `is_default` |
| `plan_prices` | `plan_key`, `interval`, `region`, `currency`, `amount`, `is_founding`, `active` |
| `plan_limits` | PK (`plan_key`, `key`), `value` INTEGER (−1 = unlimited) |
| `plan_features` | PK (`plan_key`, `feature_key`), `enabled` (JSON-encoded) |
| `feature_flags` | `key` PK, `default_state`, `rollout_pct`, `status` |
| `flag_assignments` | `flag_key`, `scope` (`workspace`\|`global`), `scope_id`, `state`, `starts_at`, `ends_at` |
| `entitlement_overrides` | `workspace_id`, `kind`, `key`, `value`, `reason`, `admin_id`, `starts_at`, `ends_at`, `revoked_at` |
| `workspace_plan` | `workspace_id` PK, `plan`, `features` (JSON), `limits` (JSON), `trial_ends_at` (`server.js:803`) |
| `workspace_usage` / `workspace_usage_history` | period snapshots (`pricing.js:36-48`) |
| `founding_program` | `workspace_id` PK, `slot`, `plan`, `active` |
| `pricing_config` | `key`/`value`; seeded `founding_slots='100'`, `enforcement='on'` (`pricing.js:61-63`) |

### Usage metering

`backend/pricing.js` computes usage **live from source tables** rather than from counters, so it cannot drift
(`computeUsage`, `pricing.js:97`):

| Metric | Source query | Window |
|---|---|---|
| `leads` | `COUNT(*) FROM leads WHERE workspace_id=? AND created_at >= month_start` | calendar month |
| `users` | `COUNT(*) FROM workspace_members WHERE workspace_id=?` | current |
| `whatsapp_accounts` | `COUNT(*) FROM platform_accounts WHERE platform='whatsapp'` | current |
| `contract_sends` | `COUNT(*) FROM cs_documents WHERE sent_at IS NOT NULL AND sent_at >= month_start` | calendar month |
| `storage_gb` | `SUM(size_bytes)` over `ms_assets` + `ms_exports` | current |

Soft-limit bands (`levelFor`, `pricing.js:110`): `ok` → `warn` at 80% → `critical` at 90% → `reached` at 100%.
Month boundaries are UTC-naive strings matching SQLite `CURRENT_TIMESTAMP` (`monthBounds`, `:25`). A master
kill switch `pricing_config.enforcement` can be flipped to `'off'` (`enforcementOn`, `:89`).

The payload the UI consumes is `GET /api/workspace/plan-info` (`server.js:5555` → `getPlanInfo`, `:5527`),
returning `{ plan, name, features, limits, usage, quota, trial_ends_at, sources, all_plans, founding }`. The
React side is `wappflow-web/src/lib/plan.js` (`PlanProvider` / `usePlan`), which refreshes every 5 minutes and
exposes `hasFeature`, `hasLimit`, `quotaFor`, `atLimit`. `components/UsageWarnings.js` renders a global banner
for the most severe metric ≥80%; `components/PlanLock.js` provides the lock overlays and upgrade CTAs.

### What is actually enforced

**Server-side hard stops (HTTP 402) — five sites total:**

| Metric | Site | Behaviour |
|---|---|---|
| `leads` | `server.js:2095` (`POST /api/leads`) | 402 when the monthly allowance is reached |
| `leads` | `server.js:1796` (`POST /api/leads/bulk-upload`) | caps the import to the remaining allowance |
| `users` | `server.js:3474` (team invite) | 402 on seat limit |
| `whatsapp_accounts` | `server.js:5010` (`POST /api/platform-accounts`) | 402 on number limit |
| `contract_sends` | `contracts-studio.js:949` | 402 on monthly send limit |

**Storage** is enforced separately by `backend/storage-enforce.js`: `gate(db, ws, incomingBytes)` blocks an
upload that would push the workspace over `storage_gb` (used by `media-studio.js:257`), and `warn()` fires one
notification per upward threshold crossing, deduped in `storage_warn_state`.

**Module-level gate:** `MODULE_GATES` middleware (`server.js:6209-6233`) 403s requests under
`/api/media/`, `/api/studio-ai/`, `/api/video-ai/`, `/api/cs/`, `/api/booking/`, `/api/store/`,
`/api/payments/` when the resolved feature is **exactly `false`**, with tokenised client routes exempted by
regex. Since no plan sets any module key to `false`, this only ever fires from a Command Center override.

**Everything else is client-side only.** A repo-wide grep of `wappflow-web/src` finds exactly five feature
keys ever consumed: `analytics`, `reports`, `team_collaboration`, `google_calendar`, `calendly`
(`app/reports/page.js:85`, `app/knowledge/page.js:235`, `app/team/page.js:506`, `app/settings/page.js:1000-1001`,
plus `lockFeature: 'analytics'` on the Analytics nav item in `components/shell/modules.js:46`). The matching
backend endpoints (`GET /api/reports/overview` at `server.js:2900`, `GET /api/knowledge` at `server.js:4518`)
carry only `auth` — no entitlement check.

**Consequence, stated plainly:** of ~60 advertised feature keys, **five** have any gate at all and all five are
cosmetic UI locks bypassable with `curl`. The genuinely enforced difference between Creator (PKR 7,999) and
Enterprise is five integers.

### Grandfathering

`grandfatherExisting()` (`pricing.js:67`) is a one-time boot migration guarded by
`pricing_config.grandfathered='1'`:
1. any `workspace_plan` row on a plan key not in `['creator','studio','studio_plus','enterprise']` → set to
   `studio_plus`;
2. any workspace with users but no plan row → insert `studio_plus`.

New signups after that migration get `creator` — but note `POST /api/auth/register` (`server.js:1231-1262`)
**never inserts a `workspace_plan` row**. The row is created lazily on first read (`server.js:5390`,
`server.js:5525`) using `DEFAULT_PLAN`. The column default is the dead legacy value `'starter'`
(`server.js:805`), which resolves to empty feature/limit sets and falls back to Creator — safe, but by
accident rather than design.

### How money actually flows (and doesn't)

**Two distinct money rails must not be confused:**

- **Studio → its client (BUILT).** `payments.js` maintains a `payments` ledger (`kind` = `invoice` |
  `print_order`), mints public pay links (`/pay/:token`), calls Stripe Checkout over raw REST with
  `STRIPE_SECRET_KEY` (`payments.js:110-130`), verifies a webhook with `STRIPE_WEBHOOK_SECRET`, and settles by
  flipping the invoice/order to `paid` (`settle`, `:132`). Manual mark-as-paid also writes a ledger row so no
  path bypasses it (`markPaidByInvoice`, `:163`).
- **Customer → WappFlow (NOT BUILT).** There is no subscription billing anywhere. The upgrade button in
  Settings → Plan & Billing shows a toast: *"Contact us to switch to {plan}. Self-serve checkout is coming
  soon."* (`wappflow-web/src/app/settings/page.js:1347`). Enterprise routes to
  `mailto:sales@wappflow.app`, as do both Enterprise CTAs on the landing page (`page.js:1894`, `:1926`).
  Command Center admits it in its own payload: `note: 'Implied from plan list price — real MRR requires live
  subscription billing (not built).'` (`command-center.js:309`), rendered as a warning card at
  `app/control/page.js:32`.

**So the operating reality is:** a new workspace lands on Creator, is never asked for payment, has no trial
clock (the `trial_ends_at` column is only ever set by the manual `PUT /api/workspace/plan`), and can use the
product indefinitely for free within Creator's five limits. Revenue today can only be collected out-of-band
and applied by hand.

---

### Bugs, security weaknesses and architectural smells

Read-only observations. Nothing here was changed.

1. **Any authenticated user can grant themselves Enterprise, for free, in one request.**
   `PUT /api/workspace/plan` (`server.js:5403-5411`) is protected by `auth` alone — no role check, no admin
   check — and writes `plan`, plus arbitrary `features` and `limits` JSON into `workspace_plan`. The resolver
   applies that JSON *over* the plan tables at `entitlements.js:297-299`, above flags and below only
   admin overrides. `POST /api/workspace/plan {"plan":"enterprise","limits":{"leads":-1}}` defeats the entire
   pricing system. This is the single most severe finding in this section. It is **not** listed in
   `PRODUCT-AUDIT.md`.
2. **The lead limit is bypassable by the product's own primary channel.** There are seven
   `INSERT INTO leads` sites; only two are gated (`server.js:1817` bulk upload, `server.js:2107` manual
   create). Inbound WhatsApp (`whatsapp-service.js:348`, `:955`) and the Meta webhook handlers
   (`server.js:5110`, `:5172`, `:5222`) create leads with no check. The landing FAQ frames this as a feature
   (*"Inbound customer messages are never dropped, even at the limit"*, `page.js:2108`), but it means the
   headline metered resource cannot be enforced for the channel the product is named after.
3. **`white_label` is sold as Studio+ and shipped to everyone.** The key exists only in `entitlements.js:54`
   and `:82`; `backend/public-brand.js` applies the studio's own name, logo, accent and contact details to
   every public surface unconditionally, with no `hasFeature('white_label')` check anywhere in the repo. A
   Creator-plan studio already gets the Studio+ differentiator.
4. **Two different definitions of "storage used".** `pricing.computeUsage` sums `ms_assets.size_bytes`
   including soft-deleted rows (`pricing.js:105`), while `storage-enforce.usedBytes` sums
   `COALESCE(storage_size, size_bytes)` and excludes `deleted_at IS NOT NULL` (`storage-enforce.js:37-39`).
   The number shown in the Plan tab and the number that actually blocks an upload can disagree.
5. **Dead legacy plan catalog in `server.js`.** `const PLAN_DEFINITIONS` (`server.js:5419-5520`) still defines
   `free` / `starter` / `growth` / `enterprise` with USD-era limits (`carousels_monthly`, `brand_profiles`).
   Grep confirms it is referenced nowhere. It is a trap for the next reader and directly contradicts the live
   catalog. Related: `workspace_plan.plan DEFAULT 'starter'` (`server.js:805`) names a tier that no longer
   exists.
6. **`payments` is a module gate key that no plan defines.** `MODULE_GATES` (`server.js:6215`) gates
   `/api/payments/` on feature `payments`, but that key appears in no plan feature set — so it resolves to
   `undefined`, never `false`, and the gate is inert unless an admin creates an override.
7. **Client Portal hands out signing tokens to anyone with the link.** `GET /api/client-portal/public/:token`
   (`server.js:6272`) is unauthenticated; the 36-hex token is the only credential, and the response includes
   `/d/:token` links for every contract on the lead (`server.js:6320`). Anyone who receives a forwarded portal
   link can open — and sign — the studio's contracts. The code already hardened the *cross-tenant* half of
   this (`:6280-6286`); the capability-leak half remains by design.
8. **Founding 100 has no write path** (see above): permanently 0 taken, permanently "100 of 100 spots left",
   and no per-workspace price lock behind the "locked permanently" promise.
9. **Unverifiable testimonials presented as customer quotes.** `page.js:1736-1753` renders four five-star
   testimonials with invented, unattributable bylines on a product with zero recorded paying customers.
   Whatever the intent, shipping these on a live marketing page is a reputational and (in some jurisdictions)
   regulatory risk.
10. **Landing-page claims that the code contradicts.** *"WappFlow is self-hosted on your own server. Your
    conversations, leads, and files never leave your infrastructure"* (`page.js:2076`) — the deployed product
    is a shared multi-tenant SQLite instance with cross-tenant Command Center admin access. (Files do stay
    on the studio's — rather, the vendor's — single VPS disk: the Cloudflare R2 path in
    `backend/storage/providers/r2.js` is unreachable, because the AWS SDK it requires is not a dependency
    of `backend/package.json`. The claim is false on multi-tenancy, not on object storage.) *"All plans include… audit logs"*
    (`page.js:1932`) — the catalog makes `audit_logs` Enterprise-only (`entitlements.js:90`), while the code
    gates it for nobody. *"Huddles run on Jitsi Meet… no API keys needed"* (`page.js:2104`) — it is LiveKit,
    and it needs three env vars or the huddle modal reports `unconfigured`.
11. **No AI cost ceiling on any plan.** `METRICS` (`pricing.js:18`) has no AI dimension, `byok` is
    Enterprise-only, and `ai_usage` (`command-center.js:84`) records `est_cost` for observability only. A
    PKR 7,999/month Creator workspace can consume unbounded Groq/OpenAI/Anthropic spend on the vendor's keys.
12. **The studio's own invoices default to USD.** `company_settings.currency DEFAULT 'USD'` /
    `currency_symbol DEFAULT '$'` (`server.js:359-361`, `:398-399`), and every invoice, payment and print
    order inherits it (`server.js:2596`, `payments.js:63`). A Pakistani studio billing a Pakistani client gets
    `$` until they find the setting — in a product that prices *itself* in PKR.

### Configuration reference

Backend env vars observed in code: `PORT`, `NODE_ENV`, `JWT_SECRET`, `DATA_DIR`, `WAPPFLOW_DB`, `UPLOADS_DIR`,
`FRONTEND_URL`, `BASE_URL`, `TRUST_PROXY`, `DEMO_PASSWORD`;
AI — `AI_PROVIDER`, `AI_PROVIDERS`, `GROQ_API_KEY`/`GROQ_MODEL`, `OPENAI_API_KEY`/`OPENAI_MODEL`,
`ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`, `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`,
`CEREBRAS_API_KEY`/`CEREBRAS_MODEL`;
money — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`;
comms — `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`;
Google — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`;
storage — `STORAGE_PROVIDER`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE`;
media tooling — `FFMPEG_PATH`, `FFPROBE_PATH`, `EXIFTOOL_PATH`, `DCRAW_PATH`, `MS_FACE_MODELS`, `MS_FONT_*`;
Command Center — `CC_FOUNDER_EMAIL`, `CC_FOUNDER_PASSWORD`, `CC_IP_ALLOWLIST`;
Flux — `FLUX_URL`, `FLUX_SSO_SECRET`.
Frontend: `NEXT_PUBLIC_API_URL` (defaults `http://localhost:3001/api`), `NEXT_PUBLIC_FLUX_URL`,
`NEXT_PUBLIC_FLUX_PARKED` (defaults to parked).

### Unknowns

- **UNKNOWN: how many real paying customers exist.** No production data is in the repo; `founding_program` is
  never written, and there is no billing table. Nothing in the code can answer this.
- **UNKNOWN: whether Founding-100 pricing was ever honoured for anyone**, since there is no per-workspace
  price-lock record — only a catalog-level `plan_prices.is_founding` row.
- **UNKNOWN: whether the PKR prices reflect a validated willingness-to-pay** or are a first guess. No
  research artefact, no experiment, no analytics event exists in the repo.
- **UNKNOWN: the intended resolution of the sales-CRM vs studio-OS positioning conflict.** Both narratives
  are live on the same page; no ADR or RFC in `adr/` or `rfc/` decides between them.
- **UNKNOWN: how upgrades are meant to be applied operationally today** — presumably a founder runs the
  Command Center `PUT /api/cc/plans/:key` or an entitlement override by hand, but no runbook exists.


---


<!-- ── 03-crm.md ─────────────────────────────────────────── -->

## CRM — leads, pipeline, clients and contact intelligence

> **Line-citation snapshot note (added 2026-08-24).** This section's `backend/server.js` citations were
> written against an earlier snapshot than the one §14/§15 were pinned to. Measured against the current
> file (**6,595 lines**), they run low by roughly **+20 lines below ~line 2,000 and up to +50 lines above it**
> — beyond the dossier-wide ±25 tolerance stated in §01. The endpoints named below have been re-pinned to the
> current file; for any other `server.js:NNNN` reference in this section, grep for the quoted code rather than
> trusting the number.

### What this part of the product is for

WappFlow is sold as a "Creative Business Operating System" for photo/video studios, and the CRM is
the room where a stranger becomes a paying customer. Somebody messages the studio on WhatsApp (or
Instagram, Facebook, a website form, or a public booking page); WappFlow turns that first message
into a **lead** — a single row that holds the person's name, phone, email, pipeline stage, money
estimate, tags, owner, and every message ever exchanged. The studio moves that lead through six
pipeline stages, sets follow-up reminders, writes notes, sends invoices, and eventually marks it
**Closed - Won**, at which point the same row is re-labelled a **client** and moves to a separate
Clients page. It never becomes a different record — a client *is* a lead with `is_client = 1`. This
matters more than it sounds: it means the whole product has exactly one contact table, and every
other module (Contracts, Bookings, Media Studio, Invoices, Print Store) hangs off `leads.id` via a
`lead_id` foreign key.

Almost the entire CRM lives in one file: `backend/server.js` (~6,500 lines), which also owns auth,
the SSE bus, invoices, and the mounting of every other module. The frontend is Next.js App Router:
`wappflow-web/src/app/leads-list/page.js` (the list), `app/leads/[id]/page.js` (the contact record,
~2,960 lines), `app/clients/page.js`, `app/dashboard/page.js` (a Kanban board), and `app/trash/page.js`.

---

### The data model

#### `leads` — the contact spine

Created at `backend/server.js:275` with only eleven columns; everything since has been bolted on
with `safeAlter('ALTER TABLE leads ADD COLUMN …')` (lines 633–705). The live column set (verified
against `backend/wappflow.db`) is:

| Column | Type | Meaning / notes |
|---|---|---|
| `id` | TEXT PK | UUID-ish string from `generateId()` (`server.js:1091`) — `Math.random()`-based, **not** crypto-random |
| `user_id` | TEXT | The creating user. Legacy; **not** the tenant key |
| `workspace_id` | TEXT | **The tenant key.** Added at `server.js:688`, backfilled from `user_id` at `server.js:933` |
| `customer_name`, `customer_phone` | TEXT | For Instagram/Facebook leads `customer_phone` holds the platform sender id, not a phone |
| `wa_username` | TEXT | WhatsApp push-name, captured on ingest (`whatsapp-service.js:348`) |
| `email`, `address`, `date_of_birth` | TEXT | Optional contact detail |
| `status` | TEXT, default `'New'` | Pipeline stage — see below |
| `first_message` | TEXT | The inbound text that created the lead |
| `total_messages` | INTEGER | Denormalised counter, incremented on every send/receive |
| `estimated_value` / `actual_sale` | REAL | Pipeline forecast vs. the single closed deal amount |
| `assigned_to` | TEXT | A `workspace_members.user_id` |
| `lead_source` | TEXT | Free text (manual/CSV only) |
| `platform_source` | TEXT | `whatsapp` \| `instagram` \| `facebook` \| `website` |
| `platform_account_id` | TEXT | Which connected inbox it arrived on |
| `is_client` / `client_since` | INTEGER / TIMESTAMP | Client promotion flag + first-promotion date |
| `closed_at`, `lost_reason` | TIMESTAMP / TEXT | Stamped when moved to a Closed stage |
| `last_message_at`, `last_contacted_at` | TIMESTAMP | Any activity vs. **outbound** activity |
| `lead_score`, `sentiment`, `urgency`, `intent_category`, `ai_last_analyzed_at` | — | Written only by the AI analyze route (`server.js:4163`) |
| `is_deleted`, `deleted_at`, `deleted_by` | — | Recycle bin |

#### Related tables

| Table | Key columns | Purpose |
|---|---|---|
| `notes` (`server.js:290`) | `id, lead_id, user_id, content, created_at` | Free-text notes. No `workspace_id` |
| `reminders` (`server.js:300`) | `id, lead_id, user_id, title, message, due_date, reminder_date, completed, is_completed` | Follow-up alarms. **Four columns for two concepts** — see Risks |
| `tags` (`server.js:321`) | `id, user_id, name, color` | Workspace-wide labels, keyed by *workspace owner's* user id |
| `lead_tags` (`server.js:330`) | `(lead_id, tag_id)` PK, `ON DELETE CASCADE` | Many-to-many join |
| `contact_history` (`server.js:435`) | `id, lead_id, user_id, type, description, metadata` | Legacy per-lead event log; still written, no longer read by the timeline |
| `activity_timeline` (`server.js:792`) | `id, lead_id, workspace_id, user_id, actor_name, activity_type, platform, title, body, metadata` | **The activity spine** — see below |
| `lead_channels` (`server.js:768`) | `id, lead_id, platform, identifier`, `UNIQUE(lead_id, platform, identifier)` | Extra handles for the same person |
| `lead_relations` (`server.js:781`) | `id, lead_id_a, lead_id_b, relation_type`, `UNIQUE(a,b)` | "These two records are the same person / related" |
| `messages` (`server.js:338`) | `id, lead_id, body, from_me, media_url, media_type, platform, wa_message_id, timestamp` | Conversation history |
| `lead_emails` (`server.js:558`) | `id, lead_id, workspace_id, direction, from_email, to_email, subject, body` | SMTP/IMAP email thread |
| `meetings` (`server.js:851`) | `id, workspace_id, lead_id, provider, starts_at, meet_link, event_id` | Google Meet events |
| `saved_views` (`backend/saved-views.js:26`) | `id, workspace_id, user_id, entity, name, filters`, `UNIQUE(ws,user,entity,name)` | Per-user saved filter combos |

Hot-path indexes are created idempotently at `server.js:875-908` (`idx_leads_ws`, `idx_leads_ws_phone`,
`idx_leads_ws_deleted`, `idx_messages_lead_ts`, `idx_activity_timeline_lead`, …).

---

### Multi-tenancy and per-member visibility

Every request passes through the `auth` middleware (`server.js:190`). It resolves three things onto
`req`:

* `req.workspaceId` — from `users.workspace_id`, falling back to the user's own id for legacy accounts.
* `req.workspaceOwnerId` — the `super_admin` member's user id, used for *shared* data that was never
  re-keyed (tags, message presets, company settings, email templates).
* `req.canViewAllLeads` (`server.js:216`) — a per-member permission. `DEFAULT_ROLE_PERMISSIONS`
  (`server.js:184`) grants `view_all_leads` to `super_admin`, `admin` and `manager`, and denies it to
  `user`. A JSON `permissions` blob on `workspace_members` overrides the role default.

The single authorization helper is **`getScopedLead(req, leadId)`** (`server.js:250`): it selects the
lead `WHERE id = ? AND workspace_id = ?` and then returns `null` if `!req.canViewAllLeads &&
lead.assigned_to !== req.userId`. Every sub-resource route (messages, notes, reminders, tags,
channels, timeline, AI, emails, meetings) calls it and 404s when it returns null. This is the
correct pattern and it is applied consistently on **reads**. It is **not** applied on several
top-level lead mutations (see Risks).

---

### How a lead is created (capture routes)

| Path | Where | Dedupe? | Plan limit? | Maturity |
|---|---|---|---|---|
| Inbound WhatsApp | `whatsapp-service.js:330-352` — atomic `upsertLead` transaction; digit-normalised exact match then last-10-digit suffix match | Yes | **No** | SHIPPED |
| Manual `POST /api/leads` | `server.js:2089` | Yes (`findLeadByPhone`, `server.js:1111`) | Yes (`pricing.canCreate`, 402 on breach) | SHIPPED |
| CSV bulk `POST /api/leads/bulk-upload` | `server.js:1793`; frontend parses CSV in `app/dashboard/page.js:115` | Yes; reports `skipped` | Yes; reports `limitSkipped` + warning | SHIPPED |
| Instagram webhook | `server.js:5139` | Matches on sender id | **No** | PARTIAL — no signature verification, cross-tenant fallback (see Risks) |
| Facebook webhook | `server.js:5201` | Matches on sender id | **No** | PARTIAL — same issues |
| Website form `POST /api/website-form/:formToken/submit` | `server.js:5254` | **No** — every submission creates a new lead | **No** | PARTIAL |
| Public booking `POST /api/booking/public/:slug` | `backend/booking.js:246-253` | Exact phone, then exact email | **No** | SHIPPED |
| Print store checkout | `backend/print-store.js:127` | Exact phone/email | **No** | SHIPPED |

`findLeadByPhone` (`server.js:1111`) is the canonical resolver: strip all non-digits, try an exact
match, then a `LIKE '%<last 10 digits>'` suffix match so `+92 310…` and `0310…` collapse to one lead.
Deleted leads are excluded, so a merged/trashed duplicate will not swallow future inbound traffic.

---

### The pipeline

Six stages, hard-coded in three places that must be kept in sync:

* Backend allow-list for bulk moves: `BULK_STATUSES` at `server.js:5758`.
* Frontend registry: `wappflow-web/src/lib/leadStatus.js` — `LEAD_STATUS` maps the stable **DB key**
  to `{ label, tone, order }`, deliberately separating domain keys from presentation.
* Legacy per-page colour maps that still exist alongside the registry: `STATUS_META` in
  `app/leads-list/page.js:30` and `app/leads/[id]/page.js:106`, plus `COLUMNS`/`STATUS_COLORS` in
  `app/dashboard/page.js:26` and `STATUS_COLOR` in `app/trash/page.js:10`.

Stages: `New → Contacted → Interested → Negotiating → Closed - Won | Closed - Lost`.

`PUT /api/leads/:id/status` (`server.js:2165`) is the transition endpoint and encodes the side effects:

* `Closed - Won` / `Closed - Lost` stamp `closed_at`; Won optionally stores `actual_sale`, Lost stores
  `lost_reason`.
* `Contacted`/`Interested`/`Negotiating` stamp `last_contacted_at`.
* **`Closed - Won` also sets `is_client = 1, client_since = COALESCE(client_since, CURRENT_TIMESTAMP)`.**
  The inline comment is explicit that this was added because studios won deals and watched the
  Clients page stay empty.
* Writes a `status_change` history row, emits a workspace-wide `lead_updated` SSE frame, and calls
  `logAudit`.

The list UI drives this three ways: a per-lead stepper (`app/leads/[id]/page.js:1450`), drag-and-drop
between Kanban columns (`app/dashboard/page.js:823`), and a bulk "Move to stage…" select
(`app/leads-list/page.js:1073`) that calls the transactional `POST /api/leads/bulk-status`
(`server.js:5759`) — chunked at 500 ids to stay under SQLite's bound-parameter cap, and correctly
filtered by `assigned_to` for members without `view_all_leads`.

**Won/Lost modals.** `WonModal` collects the sale amount; `LostModal` (`app/leads/[id]/page.js:252`)
offers a reason. It tries to load workspace-configured reasons from `lostReasonsAPI.getAll()` →
`GET /api/lost-reasons`. **That endpoint does not exist anywhere in the backend** (grep of
`backend/*.js` returns nothing). The modal silently falls back to the six hard-coded `LOST_REASONS`
at `app/leads/[id]/page.js:115`. The Settings page (`app/settings/page.js:383-405`) renders a full
"Lost Reasons" management card — add, list, delete — against the same missing endpoints.
**SOLD-NOT-BUILT.**

---

### Clients and lifetime revenue

`GET /api/leads` (`server.js:1713`) takes an opt-in `client` query param: `client=1` → only clients,
`client=0` → only leads, omitted → everything. `app/clients/page.js:51` asks for `client: 1`;
`app/leads-list/page.js:759` asks for `client: 0`; the dashboard Kanban asks for neither.

The same query attaches a correlated subquery:

```sql
(SELECT COALESCE(SUM(i.total), 0) FROM invoices i
   WHERE i.lead_id = leads.id AND i.status = 'paid'
     AND (i.is_deleted = 0 OR i.is_deleted IS NULL)) AS lifetime_revenue
```

so `lifetime_revenue` is **money actually collected via paid invoices**, not `actual_sale` (which
holds one deal). The Clients page sums it into a "Lifetime revenue" stat and shows "Paid to date" per
card, falling back to `actual_sale` labelled "Deal value" when nothing has been paid.

Promotion is reversible: `PUT /api/leads/:id/client` (`server.js:2146`) toggles `is_client`, writes a
`client` history entry, and never clears `client_since` (`COALESCE`), so a repeat client's join date
survives a second win. Status: **SHIPPED**, with one design consequence worth naming — because Won
now auto-promotes and the Leads list filters `client=0`, a lead vanishes from the Leads list the
moment it is won. The list still renders a "Closed - Won" filter tab whose count comes from that
already-filtered array (`app/leads-list/page.js:926`), so post-change it reads 0 for everyone.

---

### Assignment and team visibility

* `POST /api/leads/bulk-assign` (`server.js:1669`) — set `assigned_to` on many leads, audited.
* `POST /api/leads/round-robin` (`server.js:1685`) — distribute evenly across active
  `workspace_members`, optionally a caller-supplied subset (validated against the workspace).
* `PUT /api/leads/:id` with `assigned_to` writes an `assignment` history row (`server.js:2135`).

The UI is `BulkAssignModal` in `app/leads-list/page.js:85` with Manual/Round-Robin tabs. Members
without `view_all_leads` are filtered out of the list, trash, search (`backend/search.js:42`),
notification counts (`server.js:3202`) and bulk-status — a consistent rule with the gaps listed below.

---

### The lead detail page

`app/leads/[id]/page.js` renders a left contact card with click-to-edit fields (`InlineEditField`,
line 35), the pipeline stepper and Won/Lost/Move-to-Clients buttons, a full chat pane with per-platform
tabs, and a tab strip defined at line 1225:

| Tab | Data source | Maturity |
|---|---|---|
| Timeline | `GET /api/leads/:leadId/timeline` | SHIPPED (auto-loads on tab open, `useEffect` at line 654) |
| Notes | `notes` from `GET /api/leads/:id` | SHIPPED |
| Reminders | `reminders` | SHIPPED |
| Invoices | `invoices` | SHIPPED |
| Emails | `GET /api/leads/:id/emails` | PARTIAL — requires SMTP configured in Settings, else 400 |
| Email Flow | `email_workflows` | **STUB** — rows are created and can be manually marked sent; no dispatcher exists anywhere in `backend/` |
| Related | `GET /api/leads/:leadId/related` | SHIPPED |
| 💬 Team Room | `RoomPanel` (comms module) | Out of scope here |
| ✨ AI Assistant | `POST /api/leads/:id/ai/summary`, `…/reply-suggestions`, `…/analyze` | SHIPPED (needs an LLM key) |
| 🏭 Industry AI | `GET /api/leads/:id/industry`, `POST …/vertical-action`, `…/vertical-suggest` | PARTIAL / legacy — see Smells |

Real-time is handled by `useRealtime(['new_message','lead_updated','email_received'], …)` (line 732)
over the shell's single SSE connection, with an 8-second visibility-gated poll as a fallback.

---

### Notes, reminders and the reminder cron

Notes: `GET/POST /api/leads/:leadId/notes` (`server.js:2390`, `:2398`), `DELETE /api/notes/:id`
(`:2409`, scoped `AND user_id = ?` — you can only delete your own note, and a manager cannot delete
anyone else's).

Reminders: `POST /api/leads/:leadId/reminders` (`server.js:2424`) writes `reminder_date`, `message`,
`title` *and* `due_date` (the same value twice, because the schema drifted).
`GET /api/reminders/upcoming` (`:2436`) returns the caller's incomplete reminders joined to lead name.
`PUT /api/reminders/:id/toggle` (`:2450`) flips **both** `is_completed` and `completed`.

The cron is `node-cron` at `server.js:3949`, running `* * * * *`. It selects reminders with
`is_completed = 0 AND reminder_date <= now AND reminder_date >= now - 2 minutes`, then for each one
sends a Web Push (`sendPushToUser`), a per-user SSE `reminder_due` frame, and a `notifications` row.
Status: **SHIPPED**, with a real caveat — the ±2-minute window means any minute the process is down
or the event loop is blocked permanently drops those reminders; there is no "fired" flag and no catch-up.
A second cron at `server.js:3989` (`0 0 * * *`) sweeps expired bin rows via `softDeleteLib.purgeExpired`.

---

### Tags, channels and relations

Tags are workspace-wide but stored against `req.workspaceOwnerId` (`server.js:3002-3040`), assigned
via `POST/DELETE /api/leads/:leadId/tags/:tagId`. `attachTags` (`server.js:1150`) batch-loads tags for
a whole list in one query (previously N+1).

`lead_channels` lets one contact carry several handles (`GET/POST/DELETE /api/leads/:leadId/channels`,
`server.js:5254-5285`). `lead_relations` links two lead rows without merging them
(`POST /api/lead-relations` at `:5332`, which correctly `getScopedLead`s **both** sides).
`GET /api/leads/:leadId/related` (`:5291`) returns already-linked records plus up to 10 heuristic
suggestions matched by last-10-digit phone, exact email, or case-insensitive exact name.

---

### Duplicates and merge

`GET /api/leads/duplicates` (`server.js:2309`) groups live leads by normalised phone (≥6 digits),
then by normalised name (≥3 chars) for anything not already phone-grouped.

`POST /api/leads/merge` (`server.js:2333`) is genuinely careful: it discovers every table carrying a
`lead_id` column via `PRAGMA table_info`, re-points those rows at the primary with `UPDATE OR IGNORE`,
backfills blank fields on the survivor from the duplicates, soft-deletes the duplicates (restorable),
refreshes `last_message_at`, writes history + audit, and broadcasts both `lead_deleted` and a full
`lead_updated`. The UI (`MergeDuplicatesModal`, `app/leads-list/page.js:604`) requires typing `MERGE`
and warns that the survivor keeps only one routing phone.

**The detection half does not work.** `GET /api/leads/duplicates` is registered at `server.js:2309`,
*after* `GET /api/leads/:id` at `server.js:2048`. Express matches in registration order, so the
request is served by the `:id` handler with `req.params.id === 'duplicates'`, `getScopedLead` returns
null, and the response is `404 {"error":"Lead not found"}`. I verified this behaviour with a minimal
Express reproduction. The modal's `.catch(() => setGroups([]))` (`app/leads-list/page.js:619`)
converts that into a confident "No duplicates found". Merge itself is fine and reachable if the caller
supplies ids by other means. **Duplicate detection: STUB (dead by route shadowing). Merge: SHIPPED.**

---

### Recycle bin, saved views, bulk actions, pagination

**Recycle bin.** `DELETE /api/leads/:id` (`server.js:2251`) soft-deletes; `POST /api/leads/:id/restore`
(`:2260`) restores and broadcasts `lead_restored`. `DELETE /api/leads/:id/permanent` (`:2271`) is
**guarded, not cascading**: `softDeleteLib.attachmentsForLead` (`backend/soft-delete.js:123`) counts
live invoices, contracts and bookings and returns `409` with a human-readable message if any exist.
Only `notes`, `reminders`, `messages` and `contact_history` cascade. `DELETE /api/leads/trash`
(`:2214`) applies the same guard per lead and returns a `skipped[]` array. Retention is 90 days for
leads, `null` (never auto-purged) for invoices (`soft-delete.js:28-42`).

**Saved views.** `backend/saved-views.js` stores `(workspace_id, user_id, entity, name) → filters` JSON
(≤4 KB, name ≤60 chars), exposed at `GET/POST /api/views` and `DELETE /api/views/:id`
(`server.js:5817-5850`). The frontend (`app/leads-list/page.js:833`) migrates legacy `wf_lead_views`
localStorage entries one at a time and falls back to localStorage only on a 404. SHIPPED.

**Bulk actions.** `bulk-assign`, `round-robin`, `bulk-status`, `bulk-trash` are all server-side and
audited. The one exception is bulk **Move to Clients**, still a sequential client-side loop with
`catch {}` per item (`app/leads-list/page.js:1106`) — PARTIAL.

**Pagination.** `backend/pagination.js` implements opt-in paging: pass `?limit=&offset=` and
`GET /api/leads` returns `{ leads, total, limit, offset, hasMore }`; omit it and the response is
byte-identical to before. **No frontend caller passes `limit`.** `app/leads-list/page.js:759` sends
only `{ client: 0 }` and then filters, searches and sorts entirely client-side (`applyFilters`, line
783) before handing the result to a `VirtualList` (line 1264). So the server-side pagination is built
and unused: the wire still carries every lead in the workspace on every page load.
**Backend: SHIPPED. End-to-end: PARTIAL.**

---

### The Universal Timeline (the activity spine)

`activity_timeline` is intended to be the single answer to "what has ever happened with this contact".
The mechanism is deliberately indirect: modules keep calling `addContactHistory(leadId, userId, type,
description, metadata)` (`server.js:1203`), which writes the legacy `contact_history` row **and** calls
`logActivity` (`server.js:1189`), which resolves the lead's `workspace_id` and inserts into
`activity_timeline`. Both writes are wrapped in `try {} catch {}` — "the timeline is a record, never a
reason to fail the action".

A marker-gated, `NOT EXISTS`-guarded boot backfill (`server.js:736-756`, marker key
`backfill_history_to_activity` in `app_meta`) folds pre-existing `contact_history` into the spine, so
old contacts are not blank.

`GET /api/leads/:leadId/timeline` (`server.js:5361`) reads **only** `activity_timeline` (fixing an
earlier double-listing bug), then folds in the last 50 `messages` as synthetic `message_in`/`message_out`
items and the last 30 `notes`, sorts descending, and caps at 100 items.

Writers confirmed by grep: `server.js` (17 call sites — created, message, note, reminder, status_change,
assignment, client, merge, invoice, email-received, AI), `contracts-studio.js` (8),
`booking.js` (5), `media-studio.js` (7 + the media worker), `payments.js` (2), `print-store.js` (2),
plus a direct insert for `meeting_scheduled` at `server.js:6165`. This is the single most convincing
"one operating system" claim in the codebase, and it substantially holds up. **SHIPPED**, with named
gaps: outbound email via `POST /api/leads/:id/email` (`server.js:3763`) never calls
`addContactHistory`, so sent emails are absent from the spine; and the 50-message fold means a long
conversation crowds out older non-message events under the 100-item cap.

---

### Endpoint inventory (CRM surface)

| Method | Path | File:line | Notes |
|---|---|---|---|
| GET | `/api/leads` | `server.js:1713` | Filters: `status, assigned_to, source, platform, account_id, client`; opt-in `limit/offset`; adds `lifetime_revenue`, `assigned_name`, `account_display_name` |
| POST | `/api/leads` | `server.js:2089` | Dedupe + plan gate (402) |
| GET | `/api/leads/:id` | `server.js:2048` | Returns `{lead, notes, reminders, history, invoices, emailWorkflows, assignee}` |
| PUT | `/api/leads/:id` | `server.js:2120` | Field allow-list of 11 columns |
| PUT | `/api/leads/:id/status` | `server.js:2165` | Stage transition + Won→client |
| PUT | `/api/leads/:id/client` | `server.js:2146` | Promote/demote |
| DELETE | `/api/leads/:id` | `server.js:2251` | Soft delete |
| POST | `/api/leads/:id/restore` | `server.js:2260` | |
| DELETE | `/api/leads/:id/permanent` | `server.js:2271` | 409 when attachments exist |
| GET / DELETE | `/api/leads/trash` | `server.js:1781` / `2214` | List / empty (guarded) |
| DELETE | `/api/leads/trash/cleanup` | `server.js:2297` | 90-day purge |
| POST | `/api/leads/bulk-upload` | `server.js:1793` | CSV import |
| POST | `/api/leads/bulk-assign`, `/round-robin`, `/bulk-trash`, `/bulk-status` | `1669`, `1685`, `5735`, `5759` | |
| GET | `/api/leads/duplicates` | `server.js:2309` | **Shadowed — always 404** |
| POST | `/api/leads/merge` | `server.js:2333` | |
| GET/POST | `/api/leads/:leadId/notes` | `2390` / `2398` | |
| DELETE | `/api/notes/:id` | `2409` | |
| GET/POST | `/api/leads/:leadId/reminders` | `2416` / `2424` | |
| GET | `/api/reminders/upcoming` | `2436` | |
| PUT | `/api/reminders/:id/toggle` | `2450` | |
| POST/DELETE | `/api/leads/:leadId/tags/:tagId` | `3028` / `3037` | |
| GET/POST/PUT/DELETE | `/api/tags[/:id]` | `3002`–`3024` | |
| GET/POST/DELETE | `/api/leads/:leadId/channels[/:channelId]` | `5254`–`5285` | |
| GET | `/api/leads/:leadId/related` | `5291` | |
| POST/DELETE | `/api/lead-relations[/:id]` | `5332` / `5350` | |
| GET | `/api/leads/:leadId/timeline` | `5361` | |
| GET | `/api/leads/:leadId/history` | `1983` | Legacy `contact_history` read |
| GET/POST | `/api/views`, DELETE `/api/views/:id` | `5817`–`5841` | |
| GET | `/api/analytics` | `2847` | Pipeline + ledger stats |
| GET | `/api/reports/overview` | `2900` | Time series, funnel, agent perf, lost reasons, platforms |
| GET | `/api/search?q=` | `backend/search.js:32` | Cross-entity, honours `view_all_leads` |
| GET | `/api/notifications/summary` | `3197` | Badge counts |
| POST | `/api/leads/:id/ai/{summary,reply-suggestions,analyze}` | `4087`, `4118`, `4163` | |
| GET/POST | `/api/leads/:id/industry`, `/vertical-action`, `/vertical-suggest` | `4859`, `4921`, `4944` | Legacy verticals |
| GET/POST | `/api/leads/:leadId/meetings` | `6190` / `6110` | Google Meet |
| POST | `/api/website-form/:formToken/submit` | `5254` | **Public, unauthenticated** |

**SSE event names** (unnamed frames; consumers switch on `data.type`): `lead_created`, `lead_updated`,
`lead_deleted`, `lead_restored`, `new_message`, `email_received`, `reminder_due`, `notification`,
`connected`. Fan-out helpers: `broadcastToUser` (`server.js:978`), `broadcastToWorkspace`
(`server.js:1010`, 15-second member cache), `notify` (`server.js:1071`, writes a `notifications` row
then pushes a `notification` frame whose category travels as `kind`, not `type`).

**Plan limits** (`backend/entitlements.js:98-114`): new leads per calendar month — Creator 200,
Studio 500, Studio+ 5000, Enterprise unlimited (`-1`). Metric names in `backend/pricing.js:18`.

---

### Bugs, security weaknesses, data-integrity risks and smells

*(Read-only observations. Nothing was changed.)*

1. **`GET /api/leads/duplicates` is dead** — registered after `GET /api/leads/:id`
   (`server.js:2309` vs `2048`), so Express serves it with the `:id` handler and returns 404.
   Verified by reproduction. The UI swallows it as "No duplicates found"
   (`app/leads-list/page.js:619`). A user-visible feature that silently does nothing.

2. **Cross-tenant lead injection via Instagram/Facebook webhooks.** When the incoming page id does not
   match a stored `account_handle`, the handler falls back to
   `SELECT * FROM platform_accounts WHERE platform = 'instagram' ORDER BY created_at ASC LIMIT 1`
   (`server.js:5097`, mirrored for Facebook at `:5159`) — with **no workspace clause**. Any DM whose
   page id is unrecognised is written into the oldest workspace on the platform. Both webhooks also
   perform **no `X-Hub-Signature` verification**, so the endpoints accept forged payloads from anyone.

3. **Per-member visibility is enforced on reads but not on writes.** `PUT /api/leads/:id`
   (`server.js:2120`), `PUT /api/leads/:id/status` (`:2165` — it calls `getScopedLead` for the *prior*
   row but never 404s when it is null), `DELETE /api/leads/:id` (`:2251`), and
   `POST /api/leads/:id/restore` (`:2260`) all guard on `workspace_id` only. A `user`-role member
   without `view_all_leads` can edit, re-stage, reassign, or trash any lead in the workspace by id,
   including ones they cannot see.

4. **SSE fan-out ignores assignment.** `broadcastToWorkspace` (`server.js:1010`) pushes to every
   member. `lead_created` / `lead_updated` / merge frames carry the **full lead row**, so a member
   restricted to their own leads receives the names, phones and deal values of everyone else's.

5. **Inbound lead creation bypasses the plan limit entirely.** Only `POST /api/leads` and
   `bulk-upload` call `pricing.canCreate` / `checkLimit`. WhatsApp, Instagram, Facebook, website form,
   booking and print-store lead creation are ungated, so the metered "leads per month" limit is
   trivially exceeded by the product's own primary intake channel.

6. **Public website form is unauthenticated, undeduplicated and unthrottled** (`server.js:5254`,
   `Access-Control-Allow-Origin: *`). Anyone with the form token can create unlimited leads. It also
   writes `user_id = account.workspace_id`, i.e. a workspace id in a user-id column.

7. **Reminders schema has four columns for two concepts** — `title`/`message` and
   `due_date`/`reminder_date`, plus `completed`/`is_completed`. Writers set both, but the cron reads
   only `reminder_date`+`is_completed` (`server.js:3956`) while `/api/reminders/upcoming` orders by
   `COALESCE(due_date, reminder_date)`. A row written with only `due_date` never fires.

8. **Reminder badge count is broken.** `GET /api/notifications/summary` (`server.js:3215`) queries
   `reminders … WHERE (is_done = 0 OR is_done IS NULL)`. There is **no `is_done` column** (verified via
   `PRAGMA table_info(reminders)`); the statement throws and the surrounding `try/catch` returns `0`,
   so the bell's reminder count is permanently zero.

9. **Reminder cron drops missed reminders.** The `>= now - 2 minutes` window (`server.js:3957`) with no
   "fired" flag means any restart, deploy, or blocked event loop permanently loses those alarms.

10. **`assignee` on `GET /api/leads/:id` is almost always `null`.** It looks the assignee up in the
    legacy `team_members` table by id (`server.js:2078`), but `assigned_to` is populated with
    `workspace_members.user_id` by every writer. The list endpoint gets this right (it builds a map
    from `workspace_members` first, `server.js:1753`); the detail endpoint does not.

11. **Meetings use a non-existent column.** `server.js:6148`/`:6144` read `lead.name` for the calendar
    summary and attendee name; the column is `customer_name`, so every auto-titled event reads
    "Meeting with lead" and invitees get no name.

12. **Trash UI copy contradicts the backend guard.** `app/trash/page.js:55` and `:66` tell the user
    permanent delete removes "messages, notes and invoices". The backend refuses with 409 when
    invoices/contracts/bookings exist (`server.js:2280`) and never deletes invoices.

13. **`INSERT OR IGNORE INTO messages` in the IG/FB webhooks is a no-op guard** (`server.js:5126`,
    `:5188`) — the id is freshly random and no other column is unique, so a webhook replay duplicates
    the message. WhatsApp does this properly via `wa_message_id` lookup.

14. **Weak id generation.** `generateId()` (`server.js:1091`) builds UUID-shaped strings from
    `Math.random()`. These ids are used as lead ids, note ids, and — elsewhere in the codebase — as
    invite tokens and webhook verify tokens. Not cryptographically random.

15. **Two phone normalisations coexist.** `normalizePhone` (`server.js:1101`) strips non-digits;
    `normPhone` in the duplicates route (`server.js:2305`) additionally strips leading zeros. They can
    disagree about whether two records are the same person.

16. **Legacy verticals are still shipped in the UI.** `INDUSTRY_WORKFLOWS` (`server.js:4778`) covers
    `training_institute`, `real_estate`, `clinic`, `general` — a pre-pivot market. The lead page still
    exposes them as an "🏭 Industry AI" tab with canned messages about course fees and admissions,
    which is meaningless for a photography studio.

17. **Presentation duplication.** Despite the `lib/leadStatus.js` registry (which the leads list *does*
    use for its `Badge`), four separate colour maps for the same six statuses remain in
    `leads-list/page.js:30`, `leads/[id]/page.js:106`, `dashboard/page.js:26/35`, `trash/page.js:10`.

18. **`notes` and `lead_tags` carry no `workspace_id`.** They are reachable only through
    `getScopedLead`-guarded routes today, but the tables themselves have no tenant column, so any
    future direct query is one missing join away from a cross-tenant leak.

19. **Server-side pagination is built and unused** (see above) — the leads list still downloads the
    whole workspace and filters in the browser, which also means every client-side filter is computed
    over "leads minus clients" only.

20. **`GET /api/leads` fires four extra queries per request** to build assignee/account maps
    (`server.js:1755-1762`) even when paginating, so paging reduces the row transfer but not the
    enrichment work.

---

### What I could not determine

* **UNKNOWN: whether the shadowed `/api/leads/duplicates` route is also broken in production.** The
  reproduction was against a local Express instance mirroring the two registrations; I did not have
  access to the deployed server to confirm the live 404.
* **UNKNOWN: whether the Instagram/Facebook webhooks are actually reachable in production.** Their
  security weaknesses only matter if Meta apps are configured and the endpoints are publicly routed; I
  found no deployment config in the repo that confirms either way.
* **UNKNOWN: the real distribution of `permissions` overrides on `workspace_members`.** The default
  role matrix is in code, but how many live workspaces use custom per-member `view_all_leads` values
  cannot be read from the source.
* **UNKNOWN: whether anything outside this repo dispatches `email_workflows`.** Inside it, nothing
  does — grepping `email_workflows` across every file in `backend/` returns only `server.js` (schema,
  the two CRUD routes, the workspace-id backfill) and `test-batch5-scope.js`. So the "Email Flow" tab
  creates a `pending` row with a `scheduled_at` that no cron or poller ever acts on; `PUT
  /api/email-workflows/:id/status` (`server.js:2038`) exists purely so someone can mark it sent by
  hand. Treat it as **STUB** unless an external scheduler is proven to exist.
* **UNKNOWN: the intended semantics of `lead_relations.merged_into`.** The column exists
  (`server.js:785`) but no code reads or writes it.


---


<!-- ── 04-whatsapp-comms.md ─────────────────────────────────────────── -->

## WhatsApp engine, messaging and internal Comms

### Orientation: what this part of the product is for

WappFlow is a CRM for small service businesses (photography studios in particular) whose customers arrive over **WhatsApp**, not over email or a web form. Everything in this section exists to serve two very different conversations:

1. **The conversation with the customer.** WappFlow logs into the studio's *real, personal WhatsApp account* — the same one on their phone — and turns every incoming chat into a CRM record. A stranger messages the studio's number; a `leads` row appears; every message thereafter is stored against that lead; the team can reply from inside the CRM (text, files, voice notes) and the reply lands in the customer's ordinary WhatsApp thread. There is no WhatsApp Business API, no Meta app review, no per-message fee. The mechanism is **browser automation**: the backend runs a headless Chromium via Puppeteer, drives `web.whatsapp.com` through the `whatsapp-web.js` library, and pairs by showing the user a QR code to scan with their phone's "Linked Devices" screen. This is the product's single biggest technical asset and its single biggest operational liability, and the document is blunt about both.

2. **The conversation inside the team.** A separate, unrelated subsystem (`backend/comms.js` plus the `chat_*` tables in `server.js`) is a Slack-shaped internal messenger: public channels, private channels, direct messages, threads, @mentions, reactions, pins, presence, typing indicators, unread counts, and voice/video "huddles" over LiveKit. It also provides **project rooms** — a private channel automatically bound to a business object (a lead, a shoot, a gallery, a contract, a booking) so the team can discuss *this specific job* next to the job itself.

The two share only a transport (the Server-Sent Events bus) and a vocabulary. They do not share tables, code, or concepts. Do not confuse `messages` (customer conversations) with `chat_messages` (internal team chat) — they are different tables with different owners.

---

## Part A — The WhatsApp engine (`backend/whatsapp-service.js`, 1,582 lines)

### A.1 Two classes: a manager and per-account services

`whatsapp-service.js` exports two classes (`whatsapp-service.js:1582`):

* **`WhatsAppService`** — one instance = one logged-in WhatsApp number = one headless Chromium process. Owns the client, the QR, the status, the message listener, media download, sends, sync, and auto-reply.
* **`WhatsAppManager`** — a registry of `WhatsAppService` instances keyed by `platform_accounts.id`, plus the special key `'__legacy__'` for installs that predate multi-account. All of `server.js` talks to the manager, never to a service directly.

`server.js:1241` constructs exactly one manager for the whole process:

```js
const whatsappService = new WhatsAppManager(db, broadcastToUser, broadcastToWorkspace, notify);
```

and `whatsappService.loadAccounts()` runs at boot (`server.js:1248`). `loadAccounts` (`whatsapp-service.js:1380-1397`) selects **every** `platform_accounts` row where `platform='whatsapp'` — across all tenants — and starts each one, staggered 12 seconds apart (`whatsapp-service.js:1388-1393`) because launching N Chromiums simultaneously thrashes CPU/RAM and trips "browser is already running" races. If there are zero rows it falls back to `_startLegacy()` (`whatsapp-service.js:1400-1406`), a service with `accountId = null` and no `clientId`.

**Consequence worth stating plainly:** the backend must be a **single process on a single machine with a persistent disk**. It cannot be horizontally scaled, and a restart costs one Chromium cold-start per connected number. `DEPLOYMENT.md:40` says the same thing.

### A.2 Session lifecycle and QR pairing

`initialize()` (`whatsapp-service.js:214-501`) constructs the client:

```js
this.client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.NODE_ENV === 'production' ? '/data/.wwebjs_auth' : './.wwebjs_auth',
    ...(this.sessionName ? { clientId: this.sessionName } : {}),
  }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox',
    '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run',
    '--no-zygote', '--disable-gpu'] }
});
```

Status is an **accessor**, not a plain field (`whatsapp-service.js:56-72`). Every assignment resolves the owning workspace and pushes an SSE frame named `whatsapp_status` carrying `{account_id, status, phone, has_qr}`. That is why the frontend can drop its 2-second poll to a 20-second safety net.

| Status | Set at | Meaning |
|---|---|---|
| `initializing` | `whatsapp-service.js:215` | Chromium starting; watchdog armed |
| `qr_ready` | `whatsapp-service.js:245` | QR available as a data-URL PNG in `this.qrCode` |
| `authenticated` | `whatsapp-service.js:279` | Phone scanned; session handshaking |
| `connected` | `whatsapp-service.js:263` | Ready; `isReady=true`; heartbeat started |
| `auth_failure` → `auth_failed` | `whatsapp-service.js:284` | Pairing rejected |
| `disconnected` | `whatsapp-service.js:290`, `:701` | Dropped, or user logged out |
| `unhealthy` | `whatsapp-service.js:616` | 3 consecutive heartbeat failures |
| `error` | `whatsapp-service.js:497`, `:551` | `client.initialize()` threw, or 60s init watchdog fired |
| `reconnect_failed` | `whatsapp-service.js:575` | 3 auto-reconnect attempts exhausted |
| `not_initialized` | `whatsapp-service.js:1437` | Manager has no instance for that account id |

The QR is rendered to a PNG data-URL with the `qrcode` package (`whatsapp-service.js:248`) and stamped with `qrTimestamp`. `getStatus()` (`whatsapp-service.js:670-682`) returns `{status, isReady, qrCode, qrTimestamp, qrAgeSeconds, phoneNumber, initAgeSeconds}` — `initAgeSeconds` is what lets the Settings UI show a "Reset" button after 40 seconds of a stuck init.

On `ready` the service records `client.info.wid.user` as `phoneNumber`, resets counters, starts the heartbeat, and schedules a missed-message sync 4 seconds later (`whatsapp-service.js:240-255`).

### A.3 The session store on disk

`LocalAuth` writes a full Chromium user-data directory per session. Path (`whatsapp-service.js:139-141`, `:226`):

* production: `/data/.wwebjs_auth/session-acct-<accountId>` (or `/data/.wwebjs_auth/session` for the legacy session)
* dev: `./.wwebjs_auth/...` relative to CWD

The `clientId` is `acct-<accountId>` (`whatsapp-service.js:1415`) — deliberately keyed on the globally unique account id rather than `slot_index`, because `slot_index` is only unique *within* a workspace and two tenants' "slot 0" would otherwise collide on the same profile directory.

**Configuration smell:** the session store is the one thing in the codebase that does **not** honour `DATA_DIR`. `server.js:38` and `server.js:61` define `DATA_DIR`/`DATA_ROOT` as `process.env.DATA_DIR || (NODE_ENV==='production' ? '/data' : __dirname)`, and inbound media *does* honour it (`whatsapp-service.js:415`). The auth path hardcodes the `NODE_ENV` ternary with no env override. Point `DATA_DIR` somewhere else and the DB, the uploads and the WhatsApp sessions live in two different places.

Environment variables that matter here: `NODE_ENV`, `DATA_DIR`, `PUPPETEER_SKIP_DOWNLOAD` (documented in `backend/.env.example:10`), `PUPPETEER_EXECUTABLE_PATH` (only referenced in `DEPLOYMENT.md:552`, never read by application code — Puppeteer itself reads it). `backend/nixpacks.toml` provisions `chromium`, `nss`, `freetype`, `harfbuzz`, `ca-certificates`, `ttf-dejavu`. Note `puppeteer` is **not** a direct dependency in `backend/package.json` — it arrives transitively under `whatsapp-web.js ^1.34.7`.

### A.4 The reliability machinery (and what it tells you)

Roughly 40% of `whatsapp-service.js` is defence against Puppeteer misbehaviour. That proportion is itself the honest summary of this integration's maturity.

* **`_cleanLocks()`** (`whatsapp-service.js:138-210`) runs before every `initialize()`. On Linux it `pgrep`s for `--user-data-dir=<profile>`, then **re-reads `/proc/<pid>/cmdline` to confirm an exact argument match** before killing — because `pgrep`'s substring match would make `session` a prefix of `session-wf-1` and cleaning one account would kill every other tenant's Chromium. On Windows it uses `wmic`/`taskkill` and only for the legacy session. Then it unlinks `SingletonLock`, `SingletonCookie`, `SingletonSocket`, `.lock`, `lockfile`.
* **Init watchdog** (`whatsapp-service.js:546-563`): if status is still `initializing` after 60s, force status to `error` and tear the client down so the next `/connect` can start clean.
* **Heartbeat** (`whatsapp-service.js:593-621`): every 60s, `client.getState()` raced against an 8s timeout; 3 consecutive failures → `unhealthy` → reconnect.
* **Auto-reconnect with backoff** (`whatsapp-service.js:571-589`): delays `[10s, 30s, 90s]`, max 3 attempts, then `reconnect_failed` and manual intervention required. Skipped entirely when the disconnect reason matches `/LOGOUT|NAVIGATION/i` or the user logged out deliberately (`whatsapp-service.js:295`).
* **Idempotent `reconnect()`** (`whatsapp-service.js:507-541`): a no-op if a healthy QR is <45s old or an init started <20s ago, unless `{force:true}`. Tearing down a working Chromium is described in the comment as "the exact bug that traps the next init in `initializing` forever". Teardown removes listeners, calls `destroy()`, SIGKILLs the lingering browser PID, and waits **3 seconds** before starting a new instance.
* **`_resolveChatId()`** (`whatsapp-service.js:714-720`): constructs `<digits>@c.us` directly instead of calling `client.getNumberId()`, because that call queries WhatsApp's servers from inside the browser page and "intermittently hangs (`Runtime.callFunctionOn timed out`), which wedges the whole request".
* **Voice notes are deliberately not sent as PTT** (`whatsapp-service.js:804-809`): passing `sendAudioAsVoice:true` "wedges the WhatsApp Web page, which then breaks every other send (text included) on the account".

### A.5 Inbound ingestion: message → lead

The whole pipeline is the `client.on('message')` handler (`whatsapp-service.js:300-493`).

**Filtering.** Group chats (`@g.us`) are dropped at `whatsapp-service.js:303`. Then `WhatsAppService.isIngestableChat(jid, chat)` (`whatsapp-service.js:87-95`):

```js
if (id.includes('@newsletter')) return false;
if (id.includes('broadcast')) return false;
if (chat && (chat.isChannel === true || chat.isNewsletter === true || chat.isBroadcast === true)) return false;
```

`@newsletter` JIDs are **WhatsApp Channels** — one-way publisher feeds the user follows. `status@broadcast` and other `broadcast` JIDs are Status updates and broadcast lists. Without this filter every channel the studio owner follows became a "customer" in their CRM and every channel post became that customer's message. It is a static method precisely so the missed-message sync can apply the same rule (`whatsapp-service.js:1248`).

Finally, messages with no body and no media are skipped (`whatsapp-service.js:306`), and a 1000-entry in-memory `processedMessages` Set suppresses same-process duplicates (`whatsapp-service.js:308-315`).

**Identity resolution.** `contact.pushname || contact.name || phone` becomes the lead name. Phone derivation handles WhatsApp's newer privacy JIDs: for a `@lid` sender the code tries `contact.id._serialized`, then `contact.number`, and only if both fail stores the raw `@lid` JID as the "phone" (`whatsapp-service.js:323-334`). WhatsApp usernames are read defensively from `contact.username || contact.handle || contact.pushname_username` and stored in `leads.wa_username` as a *second* identifier — the number stays authoritative (`whatsapp-service.js:322`).

**Tenant attribution.** `_resolveOwner()` (`whatsapp-service.js:116-135`) maps `accountId → platform_accounts.workspace_id → the earliest-created user in that workspace`. For the legacy session (no `accountId`) it falls back to the first user in the whole database. This is the multi-tenancy hinge: an inbound message creates its lead in the workspace whose connected account received it.

**Lead upsert.** Wrapped in a `better-sqlite3` transaction (`whatsapp-service.js:353-374`) so two simultaneous messages from the same number cannot create two leads. Matching is by digits-only phone with a SQL `REPLACE` chain stripping ` +-().`, first exact, then a `LIKE '%<last 10 digits>'` suffix match to survive `+92` vs `0` country-code swaps. A new lead is inserted with `status='New'`, `platform_source='whatsapp'`, `platform_account_id=<accountId>`.

**Side effects on a new lead:** a `notifications` row via `notify()` (`whatsapp-service.js:382-388`), an SSE `lead_created` frame, and `_maybeAutoAnalyze()` (`whatsapp-service.js:629-668`) which — 5 seconds later, and only if `workspace_ai_profile.auto_analyze` is set — feeds up to 30 messages plus AI memories to `ai-engine.analyzeLeadIntelligence` and writes back `lead_score`, `sentiment`, `urgency`, `intent_category`, then pushes `lead_updated`.

**Message persistence.** After a `wa_message_id` uniqueness check (`whatsapp-service.js:458-461`, backed by `idx_messages_wa_id`, `server.js:917`) the row is inserted with `from_me=0`, `platform='whatsapp'`, `platform_account_id`, and a placeholder body (`[Voice Note]` / `[Image]` / `[Video]` / `[File]`) when the message is media-only.

**Fan-out.** `_emit(user, 'new_message', {...})` (`whatsapp-service.js:480-486`) sends to the whole workspace when a workspace broadcaster is available, else to the resolved owner. Identity (`customer_name`, `customer_phone`, `wa_username`) travels *with* the frame — previously it carried only `lead_id`, so every notification read "New message from Unknown".

Then `checkAutoReply()` runs.

### A.6 Media handling, and where ffmpeg is needed

Inbound media (`whatsapp-service.js:396-455`) maps `message.type` to a coarse `media_type` (`voice` for `ptt`/`audio`, `image`, `video`, else `media`), calls `message.downloadMedia()`, and writes the base64 payload to disk under `<DATA_DIR>/uploads/{voices|images|videos|files}` with a timestamp-derived filename (`voice-<ms>.ogg`, `img-<ms>.jpg`, `video-<ms>.mp4`, `<ms>-<sanitised original>`). The stored `media_url` is the relative path `/uploads/<subdir>/<file>`, served by `express.static` at `server.js:116-120`.

**ffmpeg is required only on the outbound voice path.** `sendVoiceNote()` (`whatsapp-service.js:734-815`) transcodes anything that is not already OGG:

```js
execFile('ffmpeg', ['-y','-i', filePath, '-vn','-c:a','libopus','-b:a','32k','-ar','48000','-ac','1', oggPath], { timeout: 25000 }, ...)
```

It uses `execFile` (async) rather than `execSync`, with an explicit comment that a synchronous spawn in a request path "blocks the entire Node event loop and freezes every other API call". If ffmpeg is missing or fails, it logs and **sends the original file anyway** — degrade, don't fail. `ffmpeg` is not declared anywhere in `package.json` or `nixpacks.toml`; it is an undeclared host dependency.

### A.7 Outgoing sends

| Method | Line | Behaviour |
|---|---|---|
| `sendMessage(phone, text)` | `whatsapp-service.js:722` | Throws if `!isReady`; `client.sendMessage(_resolveChatId(phone), text)` |
| `sendMedia(phone, path, mime, name, caption)` | `whatsapp-service.js:727` | Reads file → base64 → `MessageMedia` |
| `sendVoiceNote(phone, path, mime)` | `whatsapp-service.js:734` | ffmpeg transcode → plain audio attachment (never PTT) |
| `saveOutgoingMessage(leadId, userId, body)` | `whatsapp-service.js:1063` | Inserts `from_me=1` row only — does not send |
| `fetchHistory(phone, limit=200)` | `whatsapp-service.js:1072` | `chat.fetchMessages()`; here it *does* call `getNumberId()`, the call the send path deliberately avoids |

Outbound sends never receive a delivery receipt: there is no `message_ack` listener anywhere in the file. There is also no `message_create` listener, which means **messages the studio owner sends from their own phone are never captured** — the CRM thread is missing half of any conversation the owner had on mobile.

### A.8 Missed-message sync

`syncMissedMessages()` (`whatsapp-service.js:1209-1334`) runs automatically 4s after every `ready`, and can be triggered by `POST /api/whatsapp/sync-missed`. It:

1. Resolves the owner workspace, then finds the newest `messages.timestamp` for that workspace (any lead) and converts it to Unix seconds; defaults to 24 hours ago when the workspace has no messages.
2. Iterates `client.getChats()`, skipping groups and non-ingestable chats, and skipping any chat whose `lastMessage.timestamp <= sinceSec`.
3. Fetches up to 100 messages per chat, keeps only `!m.fromMe && m.timestamp > sinceSec`, finds-or-creates the lead with the same phone-matching strategy, and inserts each message (deduping on `wa_message_id`).
4. Emits `missed_sync_complete` with `{totalImported, leadsCreated}`.

**Named gaps (this is PARTIAL, not SHIPPED):**
* **Media is not downloaded during sync.** Rows are inserted with `media_type` set but `media_url` NULL (`whatsapp-service.js:1302-1305`). A photo received while the server was down is permanently a `[Image]` placeholder.
* **Leads created by sync do not get `platform_account_id`** (`whatsapp-service.js:1276-1279`), unlike the live path. Per-account attribution is silently lost for anything imported after downtime.
* **The watermark is workspace-wide, not per-chat.** One busy chat advances `sinceSec` past quiet chats' unread messages.
* **No `new_message` frames and no `notify()` rows per synced message** — only the aggregate `missed_sync_complete`. The bell never learns about catch-up messages.
* **`_maybeAutoAnalyze` is not called** for leads created by sync.

### A.9 Auto-reply rules

`checkAutoReply(userId, lead, body)` (`whatsapp-service.js:1336-1361`) loads `SELECT * FROM auto_reply_rules WHERE user_id = ? AND is_active = 1`, parses `keywords` as a JSON array (falling back to treating the raw column as a single keyword), lowercases both sides, and matches by `match_type` (`'exact'` → equality, anything else → `includes`). On the first match it waits 1500ms, sends, saves the outgoing row, bumps `total_messages`, and `break`s.

CRUD lives at `GET/POST/PUT/DELETE /api/auto-reply[/:id]` (`server.js:2765` onward) and writes/reads with `req.workspaceOwnerId`.

**Gaps.** `auto_reply_rules` (`server.js:459-469`) has **no `workspace_id` column** — it is scoped only by `user_id`. Worse, the writer uses `req.workspaceOwnerId` (the `workspace_members` row with `role='super_admin'`) while the reader uses `_resolveOwner()`'s "earliest-created user in the workspace". These are normally the same person but are not guaranteed to be, and when they diverge auto-reply silently stops matching. There is no loop guard beyond `break`, no per-lead cooldown, no business-hours gate, and no entitlement check — even though `auto_reply` is `false` on the Free and Creator plans (`server.js:5445` and the equivalent in `entitlements.js`).

### A.10 Groups

`createGroup(name, phones, description)` (`whatsapp-service.js:964-1004`) resolves each phone through `_resolveParticipants` (`whatsapp-service.js:936-960`, which *does* use `getNumberId` and reports per-number skip reasons), calls `client.createGroup`, optionally sets the description, and best-effort fetches an invite code to build `https://chat.whatsapp.com/<code>`. `setGroupSubject`, `setGroupDescription`, `setGroupPicture` follow.

The HTTP surface is `POST /api/whatsapp/groups` (`server.js:5620`) — body `{name, description?, lead_ids[], account_id?}`, capped at 256 leads, filtering to leads in the caller's workspace with a plausible phone or a JID — and `PATCH /api/whatsapp/groups/:groupId` (`server.js:5694`) for name/description/icon. Results are mirrored into a `whatsapp_groups` table that is created lazily inside the request handler (`server.js:5664-5675`), columns: `id, workspace_id, group_id, platform_account_id, name, description, invite_link, created_by, created_at`, `UNIQUE(workspace_id, group_id)`.

**This is create-and-forget.** There is no `GET /api/whatsapp/groups`, so the persisted rows are never listed back to the user; the invite link is shown once in the create response and then only findable in the database. Inbound group messages are dropped at `whatsapp-service.js:303`, so there is no group inbox, no group broadcast send, and no group membership management. Classification: **PARTIAL** — creation and rename work end to end; everything after creation does not exist.

### A.11 Multi-account

`WhatsAppManager` proxies every operation with an optional `accountId`. Account slots are created through `POST /api/platform-accounts` (`server.js:5010`), which enforces a hard cap of 5 per platform plus the plan limit via `pricing.canCreate(db, workspaceId, 'whatsapp_accounts')` (Creator 1 / Studio 2 / Studio+ 5 / Enterprise unlimited, `entitlements.js:98-114`), then calls `whatsappService.addAccount(id, slot_index)` to boot a session immediately. Deleting the row calls `removeAccount`.

`listReadyAccounts()` (`whatsapp-service.js:1559-1580`) enumerates connected instances with `{accountId, key, phoneNumber, account_name, nickname, slot_index}` for the group-creation account picker.

**The routing hole.** `getReadyService(accountId)` (`whatsapp-service.js:1464-1475`) falls through: try the requested account, then the legacy instance, then **any ready instance in the whole process**. Every outbound call site in `server.js` passes no `accountId` at all — `server.js:1896` (lead reply), `server.js:3185` (`/api/whatsapp/send`), `server.js:4984` (vertical action), and the `sendClientMessage` seams injected into Media Studio (`server.js:6341`), Booking/Print Store (`server.js:6464`) and Contracts Studio (`server.js:6498`). If workspace A's number is disconnected and workspace B's is live, **workspace A's message is sent from workspace B's WhatsApp number.** This is the most serious defect in this section.

### A.12 HTTP surface

All routes are `auth`-guarded (JWT via `Authorization: Bearer` **or** `?token=`, `server.js:194`). None are behind a `MODULE_GATES` entry (`server.js:6222-6230` covers only media/cs/booking/store/payments), and none check the declared `manage_whatsapp` permission.

| Method | Path | Line | Notes |
|---|---|---|---|
| GET | `/api/whatsapp/status` | `server.js:3085` | Primary account = lowest `slot_index` (`resolveWorkspaceWaAccount`, `server.js:3081`) |
| GET | `/api/whatsapp/accounts/:id/status` | `server.js:3092` | Workspace-scoped by id |
| POST | `/api/whatsapp/accounts/:id/connect` | `server.js:3099` | Calls `reconnect(id)` **without options** |
| POST | `/api/whatsapp/accounts/:id/disconnect` | `server.js:3106` | |
| POST | `/api/whatsapp/reconnect` | `server.js:3120` | Responds first, reconnects after |
| POST | `/api/whatsapp/disconnect` | `server.js:3113` | |
| POST | `/api/whatsapp/sync-missed` | `server.js:3130` | Uses the account-scoped `syncMissedForAccount` |
| POST | `/api/whatsapp/send` | `server.js:3140` | `{phone, message}` — **no workspace scoping, no lead, no logging** |
| GET | `/api/whatsapp/ready-accounts` | `server.js:5602` | Filters to caller's workspace; legacy session always allowed through |
| POST | `/api/whatsapp/groups` | `server.js:5620` | |
| PATCH | `/api/whatsapp/groups/:groupId` | `server.js:5694` | multipart for icon |
| GET | `/api/leads/:leadId/messages` | `server.js:1844` | `?platform=` filter + `platform_counts` |
| POST | `/api/leads/:leadId/messages` | `server.js:1864` | Only `platform='whatsapp'` actually delivers; others persist as drafts (`delivered:false`) |
| POST | `/api/leads/:leadId/messages/voice` | `server.js:1893` | field `audio`, 16 MB cap; 502 on delivery failure with the file still saved |
| POST | `/api/leads/:leadId/messages/media` | `server.js:2473` | field `file`, 16 MB cap |
| POST | `/api/leads/:leadId/messages/sync` | `server.js:1937` | 5-minute per-lead cooldown via an in-memory `syncCooldowns` Map (`server.js:1226`) |
| GET/POST/PUT/DELETE | `/api/auto-reply[/:id]` | `server.js:2765`+ | |
| GET/POST/PUT/DELETE | `/api/platform-accounts[/:id]` | `server.js:4995`+ | |

### A.13 Data model touched by WhatsApp

| Table | Key columns | Notes |
|---|---|---|
| `leads` | `id`, `user_id`, `workspace_id`, `customer_name`, `customer_phone`, `wa_username`, `first_message`, `total_messages`, `status`, `platform_source`, `platform_account_id`, `last_message_at`, `is_deleted` | Base at `server.js:275`; the WhatsApp-relevant columns are all `ALTER`s (`server.js:662`, `:688`, `:704-705`) |
| `messages` | `id`, `lead_id`, `user_id`, `body`, `from_me`, `media_url`, `media_type`, `timestamp`, `wa_message_id`, `platform`, `platform_account_id` | Base at `server.js:338`; `wa_message_id`/`platform`/`platform_account_id` added at `server.js:696-699`. Indexes: `idx_messages_lead`, `idx_messages_wa_id`, `idx_messages_lead_ts` (`server.js:878`, `:897`, `:899`) |
| `platform_accounts` | `id`, `workspace_id`, `platform`, `account_name`, `nickname`, `account_handle`, `credentials`, `webhook_verify_token`, `status`, `slot_index` | `server.js:611`. **`status` is never written by the WhatsApp engine** — live status lives only in process memory |
| `auto_reply_rules` | `id`, `user_id`, `name`, `keywords` (JSON), `reply_message`, `is_active`, `match_type` | `server.js:459`. No `workspace_id` |
| `whatsapp_groups` | `id`, `workspace_id`, `group_id`, `platform_account_id`, `name`, `description`, `invite_link`, `created_by` | Created lazily at `server.js:5664` |
| `lead_channels` | `id`, `lead_id`, `workspace_id`, `platform`, `identifier`, `platform_account_id`, `display_name` | `server.js:768` — links one human's identities across platforms |

### A.14 Operational fragility — the honest assessment

A Puppeteer-driven WhatsApp integration is not an API integration. It is a robot pretending to be a browser pretending to be a phone. Concretely:

* **It is against WhatsApp's Terms of Service.** Any account paired this way can be banned without notice or appeal, and the ban falls on the *customer's personal number*, not on WappFlow. Nothing in the code or the UI warns the user of this.
* **It breaks on WhatsApp's schedule.** `whatsapp-web.js` reverse-engineers the web client's internal JS. A silent WhatsApp Web deployment can break sends, media, or pairing overnight, and the fix is upstream. The pinned range is `^1.34.7`.
* **Memory and CPU scale linearly with connected numbers.** `DEPLOYMENT.md:396` budgets ~500 MB per active session. Five numbers on one box is ~3.5 GB before the app itself.
* **State is on local disk and is not replicated.** Losing `/data/.wwebjs_auth` means every tenant re-scans a QR. There is no backup path in the code.
* **A single process serves all tenants.** One wedged Chromium can starve the event loop for everyone; the codebase's own comments (`whatsapp-service.js:709-713`, `:737-738`, `:804-808`) document three separate incidents where exactly that happened.
* **Recovery is manual past three attempts.** After `reconnect_failed` a human must click Connect.
* **No delivery guarantees.** No acks, no retries, no outbound queue. `DEPLOYMENT.md:3` advertises an "outbound message queue"; there is no such thing in the code (a dead `outbound_message_queue` table is a known finding from a prior audit).

---

## Part B — Internal Comms (`backend/comms.js`, 617 lines + chat routes in `server.js`)

### B.1 Shape

The base tables (`chat_channels`, `chat_messages`, `chat_reactions`) and the CRUD routes under `/api/chat/*` live in `server.js` and predate `comms.js`. `comms.js` mounts at `server.js:6430` and adds everything else, additively, under `/api/comms/*`. It returns `{afterMessage, mintLivekitToken, broadcastToChannel, canSee, channelMemberIds}`; `server.js` stores that as `commsApi` (`server.js:1037`) and delegates authorization (`canSeeChannel`, `server.js:1028`) and channel fan-out (`broadcastToChannel`, `server.js:1017`) to it.

Three default public channels — `general`, `leads`, `random` — are auto-created on first listing (`server.js:3282-3288`).

### B.2 Data model

| Table | Owner | Key columns |
|---|---|---|
| `chat_channels` | `server.js:481` | `id`, `workspace_id`, `name`, `description`, `is_private`, `created_by` |
| `chat_messages` | `server.js:491` | `id`, `channel_id`, `user_id`, `sender_name`, `body`, `media_url`, `media_type`, `reply_to`, `is_edited` |
| `chat_reactions` | `server.js:505` | `id`, `message_id`, `user_id`, `emoji`, `UNIQUE(message_id,user_id,emoji)` |
| `chat_members` | `comms.js:52` | `(channel_id, user_id)` PK, `last_read_at`, `muted`, `joined_at` |
| `chat_pins` | `comms.js:58` | `id`, `channel_id`, `message_id`, `pinned_by`, `UNIQUE(channel_id,message_id)` |
| `chat_mentions` | `comms.js:63` | `id`, `message_id`, `channel_id`, `user_id`, `author_id`, `read_at` |
| `project_rooms` | `comms.js:68` | `id`, `workspace_id`, `entity_type`, `entity_id`, `channel_id`, `UNIQUE(workspace_id,entity_type,entity_id)` |
| `user_presence` | `comms.js:73` | `(workspace_id, user_id)` PK, `state` ∈ `online|away|dnd` |
| `call_sessions` | `comms.js:79` | `id`, `workspace_id`, `channel_id`, `room`, `started_by`, `started_at`, `ended_at`, `duration_s` |
| `call_events` | `comms.js:84` | `id`, `call_id`, `user_id`, `name`, `type` ∈ `started|joined|left|screenshare|raise_hand|lower_hand|ended` |

Channel ids encode their kind: DMs are `dm_<sha1(workspaceId + ':' + sorted user pair)[0:24]>` (`comms.js:234-235`); rooms are `room_<type>_<entityId>` (`comms.js:580`); ordinary channels are UUIDs.

### B.3 Authorization and fan-out

`canSee(channelId, userId, workspaceId)` (`comms.js:141-146`): the channel must belong to the caller's workspace; public channels are visible to all members; private channels require a `chat_members` row.

`channelMemberIds` (`comms.js:101-105`) resolves public channels to *all* `workspace_members` and private/DM/room channels to their explicit members. `broadcastToChannel` (`comms.js:115-123`) fans a frame to exactly those users — and on any error **drops the frame rather than falling back to a workspace-wide send**, with the comment "Losing a live update is recoverable; leaking a private message is not." The code carries an explicit note (`comms.js:107-114`) that private-channel and DM bodies used to be written to every workspace member's SSE stream and hidden only by client-side filtering.

A one-time boot backfill (`server.js:6434-6460`) reconstructs membership for legacy private channels from `created_by` plus everyone who ever posted in them.

### B.4 `afterMessage` — the hook that makes chat feel live

`server.js:3361` (text) and `server.js:3382` (media) insert the row and then call `commsApi.afterMessage(message, mentions)` (`comms.js:150-224`), which:

1. Fans `chat_message` to the channel's members.
2. If the channel id matches `^room_([a-z]+)_(.+)$`, resolves the entity to its lead (`lead` → itself; `project`/`contract`/`booking` carry `lead_id`; `gallery` → `ms_projects` → `lead_id`) and writes an `activity_timeline` row of type `room_message`, so team discussion shows up on the customer's timeline.
3. Persists a `chat_mentions` row per mentioned user, pushes `chat_mention`, sends a Web Push, and writes a `notifications` row — all suppressed when the recipient's presence is `dnd`. `@channel`, `@everyone` and `@here` expand to full channel membership (`comms.js:179-181`).
4. For a threaded reply, notifies the root author with `chat_thread_reply` + push + notification, unless they were already mentioned or are the sender.

**Mention resolution is client-side and fragile.** `app/chat/page.js:564-567` scans the typed plain text for `@<member display name>` with a regex and posts the resulting `user_id[]` as `mentions`. The server trusts that array verbatim — so a caller can post arbitrary user ids and generate mention rows/pushes for anyone in the workspace, and a name containing regex-hostile characters or a nickname mismatch silently fails to mention.

### B.5 `/api/comms/*` surface

| Method | Path | Line | Purpose |
|---|---|---|---|
| POST | `/api/comms/dm/:userId` | `comms.js:228` | Find-or-create a 1:1 DM channel |
| GET | `/api/comms/dms` | `comms.js:247` | My DMs with counterpart + last message |
| POST | `/api/comms/channels/:id/read` | `comms.js:264` | Stamp `last_read_at`, clear that channel's mentions |
| GET | `/api/comms/unread` | `comms.js:275` | `{unread: {channelId: n}, mentions: n}` |
| GET | `/api/comms/mentions` | `comms.js:294` | Last 50 mentions (mentions inbox) |
| POST/DELETE | `/api/comms/messages/:id/pin` | `comms.js:308`/`:317` | Pin/unpin |
| GET | `/api/comms/channels/:id/pins` | `comms.js:325` | |
| GET | `/api/comms/messages/:id/thread` | `comms.js:339` | `{root, replies}` via `reply_to` |
| PUT | `/api/comms/messages/:id` | `comms.js:349` | Edit own message, sets `is_edited` |
| GET | `/api/comms/search` | `comms.js:363` | `LIKE` search across visible channels, escaped, LIMIT 50 |
| GET | `/api/comms/presence` | `comms.js:382` | Online = live SSE connection AND not away/dnd |
| POST | `/api/comms/presence/state` | `comms.js:394` | Set `online|away|dnd` |
| GET | `/api/comms/messages/:id/receipts` | `comms.js:405` | Derived from members' `last_read_at` — no extra writes |
| POST | `/api/comms/typing` | `comms.js:414` | Ephemeral `chat_typing` frame |
| POST | `/api/comms/livekit/token` | `comms.js:424` | Mint a LiveKit JWT; `503 {configured:false}` when unset |
| GET | `/api/comms/livekit/config` | `comms.js:441` | Capability probe |
| POST | `/api/comms/calls/start` | `comms.js:460` | Create-or-rejoin a `call_sessions` row; first start rings members |
| POST | `/api/comms/calls/:id/event` | `comms.js:497` | Allowlisted event types only |
| POST | `/api/comms/calls/:id/end` | `comms.js:512` | Duration, timeline, missed-call pings |
| GET | `/api/comms/calls/:id` | `comms.js:538` | Detail + derived roster + raised hands |
| GET | `/api/comms/channels/:id/active-call` | `comms.js:555` | |
| POST/GET | `/api/comms/rooms/:type/:id` | `comms.js:583`/`:601` | Project rooms; `type` ∈ `lead\|project\|gallery\|contract\|booking` (`comms.js:568-574`) |

Legacy chat routes: `GET/POST /api/chat/channels` (`server.js:3296`/`:3315`), `DELETE /api/chat/channels/:id` (`server.js:3332`), `GET/POST /api/chat/channels/:channelId/messages` (`server.js:3341`/`:3361`), `POST .../messages/media` (`server.js:3382`), `DELETE /api/chat/messages/:id` (`server.js:3400`), `POST /api/chat/messages/:id/react` (`server.js:3414`).

### B.6 The video story — LiveKit, not Jitsi

**This is where the repo docs are stale and the code is the truth.** `DESKTOP-FINAL-VISION.md:33` and `:48` describe Comms as "Web-only, async, public-Jitsi" and list "rip Jitsi out" as pending work. That is out of date — later lines in the same file (`:135`, `:346`) record the migration as done, and the code confirms it: **there is no Jitsi anywhere in the codebase.** `HuddleModal.js` is built on `livekit-client` (declared in `wappflow-web/package.json` at `^2.19.2`), and `comms.js:25-37` hand-rolls the LiveKit access token rather than adding the `livekit-server-sdk` dependency:

```js
const payload = { iss: LIVEKIT_API_KEY, sub: identity, nbf: now, exp: now + 6*3600,
  name: name || identity,
  video: { room, roomJoin: true, canPublish, canSubscribe, canPublishData: true } };
return jwt.sign(payload, LIVEKIT_API_SECRET, { algorithm: 'HS256' });
```

Rooms are namespaced per workspace: `ws_<workspaceId>_<rawRoom>`, sanitised to `[A-Za-z0-9_-]` and truncated to 96 chars (`comms.js:432`). Identity is the user id. Token TTL is 6 hours.

Config is three environment variables — `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (`comms.js:19-21`) — and when any is missing the token route returns `503 {configured:false}` and the client shows "Calls aren't enabled yet." `LIVEKIT-SETUP.md` is the deployment runbook (Docker `livekit/livekit-server`, host networking, TCP 7880/7881 + UDP 50000–50200, a wss reverse proxy). **These three variables are absent from both `backend/.env.example` and the `DEPLOYMENT.md` environment table**, and `LIVEKIT-SETUP.md` targets a Hetzner box while `DEPLOYMENT.md` describes the current host as OVH. Whether LiveKit is actually running in production is **UNKNOWN from the code alone** — nothing in the repo pins the deployed env.

### B.7 Real-time transport and event names

One SSE endpoint serves everything: `GET /api/events` (`server.js:951`), authenticated by `?token=<jwt>` because `EventSource` cannot set headers. `sseClients` is a `Map<userId, res[]>`; `broadcastToUser` (`server.js:978`) writes `data: {...payload, type}` with **no `event:` line** — the frames are unnamed, so `addEventListener('lead_created', …)` receives nothing and consumers must use `onmessage` plus a switch on `data.type`. The frontend enforces this in one place (`components/shell/realtime.js:73-84`). Note that `type` is spread **last** so a payload carrying its own `type` cannot rename the event.

| Event | Emitted by | Consumed by |
|---|---|---|
| `whatsapp_status` | `whatsapp-service.js:64` | `app/whatsapp/page.js:31` |
| `lead_created`, `lead_updated` | `whatsapp-service.js:390`, `:663` | dashboard / leads list |
| `new_message` | `whatsapp-service.js:480` | `components/FloatingChat.js:69`, lead detail |
| `missed_sync_complete` | `whatsapp-service.js:1323` | **nothing** |
| `notification` | `server.js:1082-1083` | notification bell |
| `chat_message`, `chat_edit`, `chat_delete`, `chat_reaction`, `chat_typing`, `chat_presence`, `chat_pin`, `chat_unpin`, `chat_mention`, `chat_thread_reply` | `comms.js` / `server.js` chat routes | `app/chat/page.js:423-425` |
| `call_invite`, `call_event`, `call_missed` | `comms.js:477`, `:484`, `:505`, `:521`, `:529` | **nothing** |

---

## Part C — The frontend surfaces

### `app/whatsapp/page.js` (323 lines) — the connection screen

A single-account status page for the workspace's **primary** number (lowest `slot_index`). It polls `GET /api/whatsapp/status` every 20 s as a safety net and refetches immediately on a `whatsapp_status` SSE frame (`app/whatsapp/page.js:25`, `:31`). It renders one of four states: QR (with a five-step "Linked Devices" walkthrough), Connected (shows `+<phoneNumber>`, offers Disconnect), Error/Disconnected (offers Reconnect), Initializing. Three static marketing cards at the bottom claim "Auto Lead Capture", "Real-time Sync" and "24/7 Active".

**Gap:** the page has no way to *create* a WhatsApp account slot. If the workspace has no `platform_accounts` row, `/status` returns `{status:'disconnected'}` and the Reconnect button 404s with "No WhatsApp account for this workspace". Slot creation exists only in Settings. Classification: **PARTIAL**.

### Settings → connections (`app/settings/page.js:1886`+, `WhatsAppAccountCard`)

The real multi-account console: list accounts per platform, add one (gated by plan limit and a 5-per-platform cap), rename inline, delete, and per-card Connect / Refresh QR / Reset / Disconnect with a 5-second status poll and an inline QR image.

**Bug:** the card calls `POST /api/whatsapp/accounts/:id/connect?force=true` (`app/settings/page.js:1917`) but the route (`server.js:3144`) calls `whatsappService.reconnect(req.params.id)` with **no options object**, so `force` is dropped. The "Refresh QR" and "Reset" buttons therefore hit the idempotency guards in `reconnect()` (`whatsapp-service.js:509-516`) and do nothing when the session is in the exact state the user is trying to escape.

### `app/chat/page.js` (1260 lines) — Team Chat

A dense Slack clone. Sidebar: presence selector (`online`/`away`/`dnd`), channel search, channel list with unread badges, a DM section with a member picker and online dots. Main pane: channel header with message search, pins panel, and **Huddle** / **Video call** buttons; a date-grouped message list; per-message hover actions (react, reply, open thread, pin, edit own, delete own); a right-hand thread drawer.

The composer is a `contentEditable` with an execCommand formatting toolbar (bold/italic/underline/strike/lists/quote/code), an emoji picker with ~280 emoji across 7 categories, @-mention autocomplete, paste-as-plain-text, file upload, and MediaRecorder voice notes uploaded through the media route. Outgoing HTML passes a strict allowlist sanitiser (`app/chat/page.js:46-79`: 18 tags, all attributes stripped except `http(s)`/`mailto` `href`, forced `target=_blank rel=noreferrer noopener`); incoming bodies are rendered with `dangerouslySetInnerHTML` after the same sanitiser, with a legacy `*bold*` markdown fallback.

Real-time comes from a single subscription to ten event types (`app/chat/page.js:423-482`). A `pollRef` and `lastMsgIdRef` survive from the pre-SSE polling implementation; `pollRef` is now unused.

**The huddle room-name mismatch (bug).** `startHuddle` (`app/chat/page.js:728-732`) opens `HuddleModal` with `roomName = "huddle_" + activeChannel.id`, which the server namespaces to `ws_<wsId>_huddle_<channelId>`. In parallel it calls `POST /api/comms/calls/start`, which stores `room = channelId` (`comms.js:469`) and rings other members with that value. Since nothing in the frontend consumes `call_invite`, the mismatch is currently invisible — but the invite payload advertises a room nobody joins.

### `components/FloatingChat.js` (346 lines) — the customer-conversation FAB

A persistent floating WhatsApp panel mounted at shell level for every CRM page (`components/shell/modules.js:28`). Green FAB → lead picker (recent 5, searchable across all leads) → a 340×520 chat window with WhatsApp-styled bubbles, emoji picker, file attach, and Enter-to-send. The active lead is persisted in `localStorage` under `wf_floating_chat_lead` and restored on mount; any page can open it with `window.dispatchEvent(new CustomEvent('wf:open-chat', {detail: lead}))` (`components/FloatingChat.js:342-346`).

It subscribes to `new_message` and refetches when `data.lead_id === activeLead.id` (`components/FloatingChat.js:69-71`). The source comment records two prior bugs fixed here: it used to open a *second* EventSource on top of the page's, and it compared `data.leadId` against a backend that sends `lead_id`, so incoming replies never appeared.

It has no per-platform selector — it always posts on the default (`whatsapp`) — and re-fetches the entire message list after every send rather than appending.

### `components/HuddleModal.js` (236 lines) — the call UI

Mints a token, lazily `import('livekit-client')` (keeping it out of the main bundle), connects, and attaches tracks **imperatively** into a tiles container to survive React reconciliation. Controls: mic, camera, screenshare, raise hand (broadcast over LiveKit's data channel as `{kind:'hand', raised, identity}`), participant roster, leave. Phases: `idle | connecting | live | error | unconfigured`; `unconfigured` renders "Calls aren't enabled yet — an admin needs to configure LiveKit (see LIVEKIT-SETUP.md)."

It never calls `commsAPI.callEvent(...)`, so `joined`, `left`, `screenshare` and `raise_hand` **never reach the server**. The consequence is that `GET /api/comms/calls/:id` always reports a roster of one (only the starter's implicit `joined` from `calls/start`), and every non-starter is flagged as a **missed call** when the call ends (`comms.js:526-531`) even if they were in the room the whole time.

### `components/RoomPanel.js` (111 lines) — contextual team rooms

Dropped into `app/leads/[id]/page.js:2440`, `app/studio/[id]/page.js:569` and `app/contracts/[id]/page.js:170`. Find-or-creates the entity's room, shows the last 50 messages, sends with optimistic append, and offers a Call button. It **polls every 6 seconds** rather than subscribing to SSE, even though `chat_message` frames already reach it. Its call button opens `HuddleModal` with `roomName = channelId` and never calls `calls/start`, so a room call rings nobody.

---

## Maturity ledger

| Capability | Status | The named gap |
|---|---|---|
| QR pairing + session lifecycle | **SHIPPED** | — |
| Inbound message → lead ingestion | **SHIPPED** | — |
| Newsletter/broadcast/channel exclusion | **SHIPPED** | — |
| Inbound media capture (image/video/file/voice) | **SHIPPED** | — |
| Outbound text / media / voice | **SHIPPED** | No delivery acks; voice sent as plain audio, not PTT |
| Multi-account (N numbers per workspace) | **PARTIAL** | `getReadyService` falls through to *any* ready instance across tenants; no call site passes `accountId` |
| Per-lead history sync (`/messages/sync`) | **PARTIAL** | Uses `getNumberId()`, the hanging call the send path avoids; 5-min cooldown is per-process memory |
| Missed-message sync | **PARTIAL** | No media, no `platform_account_id`, workspace-wide watermark, no per-message notifications |
| Auto-reply rules | **PARTIAL** | No `workspace_id`; reader/writer user-id mismatch; no loop guard or cooldown; plan flag unenforced |
| WhatsApp groups | **PARTIAL** | Create + rename only; no list endpoint, no group inbox, no broadcast |
| Messages sent from the owner's own phone | **NOT BUILT** | No `message_create` listener |
| Delivery/read receipts on customer messages | **NOT BUILT** | No `message_ack` listener |
| Outbound message queue | **SOLD-NOT-BUILT** | Advertised in `DEPLOYMENT.md:3`; no implementation |
| Non-WhatsApp send (Instagram/Facebook/Website) | **STUB** | `server.js:1875` — only `whatsapp` delivers; everything else persists a draft with `delivered:false` |
| `manage_whatsapp` role permission | **STUB** | Declared at `server.js:185-188`, never read anywhere |
| Team channels + messages + reactions | **SHIPPED** | — |
| DMs, threads, pins, edit, search, unread, receipts, typing, presence | **SHIPPED** | — |
| @mentions | **PARTIAL** | Client-side name-regex resolution; server trusts the supplied id array |
| Project rooms | **PARTIAL** | Polls instead of subscribing; no membership management; no room list |
| LiveKit voice/video/screenshare | **PARTIAL** | Backend + client complete and degrade cleanly; env vars undocumented, deployment unverified |
| Call lifecycle / roster / missed calls | **PARTIAL** | `callEvent` never called by any client → roster always 1, everyone marked missed |
| Incoming-call UI | **SOLD-NOT-BUILT** | `call_invite` / `call_event` / `call_missed` are emitted and consumed by nothing |
| Mentions inbox | **STUB** | `GET /api/comms/mentions` exists and is wrapped in `lib/api.js`; no UI calls it |
| Channel mute | **STUB** | `chat_members.muted` column exists; nothing reads or writes it |

---

## Bugs, security weaknesses, data-integrity risks and architectural smells

*(read-only observations — nothing here was changed)*

**Security / multi-tenancy**

1. **Cross-tenant WhatsApp send.** `getReadyService()` (`whatsapp-service.js:1464-1475`) falls back to *any* ready instance; no call site passes an `accountId`. Workspace A's messages can go out over workspace B's number. Highest-severity item in this section.
2. **`POST /api/whatsapp/send` is an unscoped send primitive** (`server.js:3140`). Any authenticated user of any workspace can send arbitrary text to an arbitrary phone number. No lead binding, no ownership check, no `messages` row, no audit entry.
3. **`DELETE /api/chat/channels/:id` deletes messages before authorizing** (`server.js:3332-3338`): `DELETE FROM chat_messages WHERE channel_id = ?` runs with no `canSeeChannel` and no workspace clause. Any authenticated user who knows or guesses a channel id can wipe **another tenant's** channel history. The channel row itself is protected by `created_by = ?`, which makes the outcome worse — the messages are gone and the channel remains.
4. **`DELETE /api/comms/messages/:id/pin`** (`comms.js:317-324`) deletes by `message_id` with no `canSee` check.
5. **`/uploads` is unauthenticated static** (`server.js:116-120`) with `Access-Control-Allow-Origin: *`. Every customer photo, document and voice note received over WhatsApp is world-readable at a guessable path (`/uploads/images/img-<epoch-ms>.jpg`, `/uploads/voices/voice-<epoch-ms>.ogg`). Filenames carry no random component.
6. **JWT accepted from the query string** (`server.js:194`) for every route, not just SSE. Tokens end up in access logs, proxy logs and `Referer` headers.
7. **`mentions` is caller-supplied and untrusted** (`server.js:3370` → `comms.js:178`). A crafted request can fabricate mention rows and push notifications for any workspace member.
8. **`manage_whatsapp` is never enforced** — any workspace member can pair, disconnect or send from the studio's WhatsApp number.
9. **LiveKit tokens are HS256-signed with `LIVEKIT_API_SECRET`**, valid 6 hours, and carry `canPublish`/`canSubscribe`/`canPublishData` unconditionally. A leaked secret mints tokens for any room. Room namespacing correctly prevents cross-workspace collisions; there is no per-channel authorization on the token route beyond "is authenticated" — a member can mint a token for a room string of their choosing, including a private channel they are not a member of.

**Data integrity**

10. **Duplicate inbound message inflates `total_messages`.** The lead upsert transaction increments the counter (`whatsapp-service.js:363`) *before* the `wa_message_id` duplicate check (`whatsapp-service.js:458-461`), which `return`s without rolling back.
11. **Filename collisions.** Both inbound media (`whatsapp-service.js:416`) and outbound voice (`server.js:150-165`) name files from `Date.now()` alone and share `uploads/voices`. Two files in the same millisecond overwrite each other.
12. **`platform_accounts.status` is never written by the engine.** Live connection state exists only in process memory, so a restart makes the DB's view of "connected" meaningless and any reporting built on that column is wrong.
13. **Media dropped by the missed-message sync** (`whatsapp-service.js:1302-1305`) is unrecoverable — the placeholder body is all that survives.
14. **`syncCooldowns`** (`server.js:1226`) is an unbounded in-memory `Map` keyed by lead id with no eviction. It grows for the life of the process.
15. **Auto-reply owner mismatch:** rules are written under `req.workspaceOwnerId` but read under `_resolveOwner()`'s earliest-created user. When those differ, rules silently never fire.
16. **Inbound leads bypass plan limits.** `pricing.canCreate(db, ws, 'leads')` is checked only on the manual `POST /api/leads` route (`server.js:2100`); WhatsApp ingestion inserts directly. Lead caps are unenforceable for the product's primary acquisition channel.
17. **`auto_reply` is a paid feature flag with no gate.** `MODULE_GATES` (`server.js:6222-6230`) covers media/cs/booking/store/payments only; `/api/whatsapp/*`, `/api/chat/*` and `/api/comms/*` are ungated despite `auto_reply` and `team_collaboration` being `false` on lower plans.

**Correctness**

18. **`?force=true` is dropped** by `POST /api/whatsapp/accounts/:id/connect` (`server.js:3144`), defeating the Refresh QR / Reset buttons.
19. **Huddle room mismatch** between `HuddleModal` (`ws_<ws>_huddle_<channelId>`) and `call_sessions.room` (`<channelId>`) — `app/chat/page.js:730` vs `comms.js:469`.
20. **Everyone is a missed call.** `HuddleModal` never posts `joined`, so `comms.js:526-531` flags every invited member as missed on every call.
21. **`RoomPanel` calls open a room nobody is invited to** — it never calls `calls/start` (`components/RoomPanel.js:107`).
22. **Busy-wait loop on Windows.** `_cleanLocks` spins `while (Date.now() < end) {}` for a full second (`whatsapp-service.js:156-157`), blocking the event loop.

**Architectural smells**

23. **Two message models with one name.** `messages` (customer) and `chat_messages` (team) share nothing, including the timestamp column name (`timestamp` vs `created_at`).
24. **`server.js` owns the chat tables and the legacy routes; `comms.js` owns the semantics.** Authorization is delegated back through a mutable module-level `commsApi` binding (`server.js:1037`) with a "if comms somehow has not mounted" fallback path that should be impossible.
25. **A DDL statement inside a request handler** — `whatsapp_groups` is `CREATE TABLE IF NOT EXISTS`-ed on every group creation (`server.js:5664`).
26. **The whole WhatsApp engine is a per-process singleton with no persisted state machine**, so the system cannot be restarted without a visible outage per tenant and cannot be scaled at all.
27. **`RoomPanel` polls at 6 s** while every other surface is SSE-driven — a leftover from the pre-Phase-5 transport.

---

## Where the repo docs disagree with the code

* `DESKTOP-FINAL-VISION.md:33` / `:48` describe Comms as "public-Jitsi" and list ripping Jitsi out as pending. **Stale.** There is no Jitsi in the codebase; `HuddleModal.js` is pure `livekit-client` and `comms.js` mints LiveKit tokens. Later lines in the same document (`:135`, `:346`) agree with the code.
* `DEPLOYMENT.md:3` advertises "an outbound message queue". **No such thing exists** in the WhatsApp path — sends are synchronous and unqueued.
* `DEPLOYMENT.md:634` instructs the user to "Visit `/settings/connections`". **That route does not exist**; `wappflow-web/src/app/settings/` is a single `page.js` with in-page tabs.
* `DEPLOYMENT.md`'s environment table contains no `LIVEKIT_*` rows, and `backend/.env.example` omits them entirely, even though `comms.js` requires all three for calls to work at all. `LIVEKIT-SETUP.md` documents them but targets a Hetzner host that `DEPLOYMENT.md` says has been replaced by OVH.

---

## Unknowns

* **UNKNOWN: whether LiveKit is actually deployed and configured in production.** The code degrades correctly when it is not (`503 {configured:false}` → hidden call buttons), and no file in the repo pins the live environment. `DESKTOP-FINAL-VISION.md:346` claims "DEPLOYED to prod (LiveKit live on Hetzner)" while `DEPLOYMENT.md` says prod moved to OVH; these cannot both be current.
* **UNKNOWN: whether `ffmpeg` is present on the production host.** It is invoked by path (`whatsapp-service.js:765`) and declared nowhere — not in `package.json`, not in `nixpacks.toml`, not in `DEPLOYMENT.md`'s dependency list. Outbound voice notes silently fall back to the untranscoded original if it is missing, so the failure is invisible until a recipient cannot play a file.
* **UNKNOWN: the exact `whatsapp-web.js` version resolved in production.** `package.json` pins `^1.34.7`; the resolved version in `package-lock.json` was not read.
* **UNKNOWN: real-world reconnect success rate and Chromium memory profile.** No telemetry, metrics or structured logs exist for the WhatsApp engine — only `console.log` with emoji prefixes (`DEPLOYMENT.md:723-724` documents grepping for them).
* **UNKNOWN: whether any workspace currently runs more than one WhatsApp number.** The multi-account code paths (staggered boot, per-account profiles, account picker) are written but their production exercise cannot be determined from the repository.
* **Note on line numbers (re-pinned 2026-08-24).** Every `whatsapp-service.js` and `server.js` citation in this
  section has been re-verified against `whatsapp-service.js` at **1,582 lines** and `server.js` at **6,595 lines**.
  The section was first written against a 1,257-line snapshot of `whatsapp-service.js`; the 325 lines added since
  pushed citations out of true by roughly +20 lines in the first third of the file, growing to +325 inside
  `WhatsAppManager` (which now starts at `:1364`, with `WhatsAppService` spanning `:8-1361`). `comms.js`
  citations are unchanged (617 lines, matching the original read).


---


<!-- ── 05-media-studio.md ─────────────────────────────────────────── -->

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
| Direct-to-R2 signed upload | NOT REACHABLE | Requires `STORAGE_PROVIDER=r2`, which cannot be activated — the AWS SDK the R2 provider requires is not a dependency of `backend/package.json` |
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
9. **ZIP and PDF export are broken on R2.** `processZipExport` (`media-worker.js:527`) and `processPdfExport` (`media-worker.js:604`) both source images with `path.join(uploadsDir, key)` + `fs.existsSync`, skipping anything missing — with no `storage.getBuffer` fallback, unlike every other worker path. On `STORAGE_PROVIDER=r2` a gallery ZIP would silently ship **zero files** and an album PDF would render **blank pages**, while both still report `status = 'ready'`. **Reachability:** none today — the R2 provider cannot be activated at all (its AWS SDK dependency is absent from `backend/package.json`; see the resolved UNKNOWN below), so this is a trap armed for the day R2 is wired, not a live defect. Backlog priority should reflect that: fix it *with* the R2 rollout, not before.
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

- **RESOLVED (was “UNKNOWN: whether R2 is in use in production”): it cannot be.** `STORAGE_PROVIDER` defaults to `local`, but the decisive fact is that setting it to `r2` changes nothing. `storage/providers/r2.js:11` lazily `require`s `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` inside a `try/catch` and the factory returns `null` if either is absent — and **neither package is in `backend/package.json`** (dependencies, devDependencies or optionalDependencies), nor present in `backend/node_modules/`. `storage/index.js:20-24` therefore logs `⚠️ STORAGE_PROVIDER=r2 but R2 SDK/config missing — falling back to local disk` and installs the local provider. `deploy.sh:27` builds the backend with `npm install --omit=dev`, so no deploy from this repo can activate R2 either. Consequence: every R2 code path in this section — including defect #9 — is **unreachable dead code today**, not a latent production risk.
- **UNKNOWN: whether the desktop Local AI Engine is producing `vision-v1` scores against any live workspace.** The ingestion API exists and is exercised by tests, but the producer lives in `wappflow-desktop/`, outside this section's scope.
- **UNKNOWN: real-world scale behaviour.** `GET /api/media/projects/:id/assets` allows `limit=10000` and both the library and cull pages request 5,000 assets in one call, with a correlated subquery per score type per row. No load testing or production timing data was available.
- **UNKNOWN: whether `ms_audio_tracks`, `ms_luts` and `ms_video_templates` are seeded with built-ins on a fresh install** — the `workspace_id IS NULL` "system" rows are read by the video routes but I did not locate a seeder.
- **UNKNOWN: how `client_portal` visibility differs from `private`** — it is an accepted enum value but no route branches on it; only `password` is treated specially by `portalAllowed`.
- Note on line numbers: `media-studio.js` was being actively edited during this documentation pass (2,871 → 2,882 lines). Citations reflect the file at ~180,831 bytes; references beyond line ~2,400 may drift by a few lines.


---


<!-- ── 06-video-reels.md ─────────────────────────────────────────── -->

## Video, Reels and the Rendering Pipeline

### What this part of the product is for

WappFlow's core customer is a photo/video studio (weddings, real estate, restaurants, fashion). After a shoot, the studio has hundreds of photos and a handful of video clips sitting in a Media Studio **project** (also called a "shoot"). Photos get delivered as galleries; but the studio also wants a **reel** — a short, vertical, music-backed social video (Instagram Reel / TikTok / YouTube Shorts) cut from that same shoot, to post as marketing and to hand the client as a bonus deliverable.

The Video Studio is the subsystem that produces that reel. It is a genuine non-linear video editor built into the web app: a three-pane editor (media rail / preview stage / property inspector) over a scrubbable timeline, backed by a server-side **ffmpeg** render farm-of-one. On top of the hand-editing path sit three separate "AI" on-ramps that pre-build a timeline from the shoot's media so the user starts from something rather than a blank canvas.

Vocabulary you need before the mechanics:

- **Asset** — one uploaded file (photo, video, or audio) belonging to a project. Rows in `ms_assets`.
- **Cull** — the human act of marking each photo keep / reject / maybe with a star rating. Stored in `ms_cull_decisions`. The video subsystem *reads* cull decisions to rank media but never writes them.
- **Track-0 scores** — advisory computer-vision numbers about an asset (sharpness, aesthetic, composition, face count, a composite "hero" score). Rows in `ms_asset_scores`. Produced by the ingest worker on the server and/or by a separate desktop app. Always advisory — no AI path writes a decision.
- **Timeline / EDL** — the reel itself, stored as ONE JSON document (an Edit Decision List) in `ms_timelines.document`. Every reel-generation path in the product converges on this one artifact.
- **Export** — a queued request to compile a timeline into an MP4. Rows in `ms_video_exports`.
- **LUT** — a colour "look" (a 3D lookup table, `.cube` file) baked into the render by ffmpeg's `lut3d` filter.
- **Ken Burns** — the slow zoom/pan applied to a still photo so it feels like motion footage.

---

### The timeline document model (the EDL)

`backend/video-engine.js` is the shared, mostly-pure heart of the subsystem. Both the API (`media-studio.js`) and the render worker (`media-worker.js`) import it. `buildExportCommand()` is deliberately a pure function — no spawning, no filesystem — so the whole render graph is unit-testable on a machine with no ffmpeg installed (`video-engine.js:15-18`).

A timeline document is `{ version, aspect, width, height, fps, duration, safeArea, tracks[] }`. Each track is `{ id, type, clips[] }` where `type ∈ {video, audio, text, overlay}`. A `video` track holds clips whose own `kind` is `video` or `photo`.

`sanitizeTimeline(doc)` (`video-engine.js:179-198`) is the single validation gate. Everything that writes a timeline calls it. It whitelists enums, clamps every numeric, drops malformed clips, sorts clips by start, recomputes duration as the max clip end, and derives `width`/`height` from aspect + quality. Hard caps: **12 tracks, 400 clips per track**, clip `start` ≤ 3,600,000 ms, clip `duration` clamped to 10 ms – 600,000 ms.

Per-clip fields after sanitisation (`sanitizeClip`, `video-engine.js:66-149`):

| Clip kind | Fields |
|---|---|
| `video` / `photo` | `assetId`, `in`, `out`, `speed` (0.25–4), `reverse`, `freeze`, `freezeAtMs`, `transform{x,y,scale,rotation,flipH,flipV,opacity,fit}`, `kenBurns{fromScale,toScale,fromX,toX,fromY,toY}`, `motionKeys[≤8]{t,scale,x,y}`, `opacityKeys[≤8]{t,v}`, `transitionIn/Out`, `effects[≤6]`, `lut`, `color{brightness,contrast,saturation,temperature,tint}` |
| `text` | `text{content≤280, type, font, size, weight, color, opacity, align, letterSpacing, animation}`, `transform{x,y,scale,opacity}` |
| `audio` | `assetId`, `trackId`, `in`, `audio{volume 0–2, mute, fadeIn, fadeOut}` |
| `overlay` | `assetId`, `transform{x,y,scale,opacity}` — **STUB**: sanitised and stored, but `buildExportCommand` never reads overlay tracks, so an overlay clip renders as nothing. |

Vocabularies (`video-engine.js:22-45`):

- `ASPECTS`: `16:9, 9:16, 1:1, 4:5, 21:9, 3:2`
- `QUALITIES` (short edge): `720, 1080, 1440, 2160`
- `TRANSITIONS`: `none, fade, crossDissolve, slide, push, zoom, blur, dipToBlack, dipToWhite`
- `EFFECTS`: `filmGrain, letterbox, lightLeak, glow, pan, zoom, shake, blur, softFocus, vignette, kenBurns`
- `TEXT_TYPES`: `heading, subheading, caption, lowerThird, cta`; `TEXT_ANIM`: `none, fade, slide, scale, typewriter, pop, zoom`

**Export presets** (`video-engine.js:28-39`) map a platform to an aspect + a safe-area key: `ig_reel`, `tiktok`, `yt_shorts`, `fb_reel` (all 9:16), `ig_feed` (4:5), `square` (1:1), `yt_16x9`, `website` (16:9), `cinematic` (21:9), `custom` (keeps the timeline's own aspect). `dimsFor(aspect, quality)` derives even-numbered W×H from the short edge (`video-engine.js:54-61`).

#### The transition alias resolver

The AI planners in `video-ai.js` speak a different transition vocabulary from the renderer — they emit `cut`, `whip`, `dissolve`. `sanitizeTransition` used to return `null` for anything unrecognised, which reads downstream as "no transition", so a user who chose "whip" silently got a hard cut. `TRANSITION_ALIASES` + `resolveTransitionType` (`video-engine.js:157-168`) now map `cut → none`, `whip → slide`, `dissolve → crossDissolve`, and return `null` only for genuinely unknown names. Status: **PARTIAL** — the alias table resolves, but see the defects section: `slide` is itself not drawable by the renderer, so `whip` still renders as a cut.

---

### Templates: two independent template systems

There are **two** unrelated "template" engines, with different data models and different consumers. This is one of the clearest architectural smells in the module.

**(A) Creative Packs** — `backend/video-templates.js`. A hardcoded array of 12 packs (`wedding_luxury`, `wedding_emotional`, `wedding_cinematic`, `realestate_luxury`, `restaurant_premium`, `travel_story`, `corporate_brand`, `fitness_energy`, `fashion_campaign`, `education_showcase`, `agency_portfolio`, `social_premium`). Each carries a LUT id, `slotMs` pacing, a motion mode (`alt|zoomIn|zoomOut|pan`), a transition + duration, effects, a two-colour poster palette, and a mood line. `buildTimeline(pack, media, {aspect, durationSec, title})` (`video-templates.js:65-110`) computes `slotCount = round(targetMs / pack.slotMs)` clamped to 3–80, cycles the supplied media into that many equal slots (the last slot absorbs rounding so the total is *exactly* 15/30/45/60 s), attaches Ken Burns to photos, and optionally adds a title-card text track. **SHIPPED** — this is the path behind both the "Templates" gallery and the "AI drafts" modal.

**(B) `ms_template_library`** — `backend/video-ai.js:36-40, 57-72`. A *data-driven* slot spec (`{role, min_ms, max_ms, media, motion, transition_in}`) seeded idempotently with 7 system rows keyed by niche (`wedding, real_estate, restaurant, fitness, travel, corporate, commercial`) and marketed in the file header as "Marketplace-ready". **PARTIAL/STUB** — there is no endpoint to list, create, edit, or share these templates; the only consumer is `POST /api/video-ai/projects/:id/reel`, which picks one by `project_type`. `workspace_id` is always `'system'`.

---

### The three-and-a-half reel-generation paths

All of them now converge on a single artifact — an `ms_timelines` row that opens in the one editor that can export. That convergence was a deliberate Phase-6 fix and is enforced by `backend/test-phase6-one-reel-path.js`.

| Path | Endpoint | Module | Ranking input | Status |
|---|---|---|---|---|
| Blank reel | `POST /api/media/projects/:id/timelines` | media-studio.js:2336 | none | SHIPPED |
| Creative Pack ("Templates") | `POST /api/media/projects/:id/templates/:templateId/apply` | media-studio.js:2219 | explicit `asset_ids`, else keepers-first by capture time | SHIPPED |
| AI Draft | `POST /api/media/projects/:id/ai-drafts` (+ `GET .../ai-drafts/styles`) | media-studio.js:2269 | `quality`, `sharpness`, `faces`, `smile`, cull decision + rating, duplicate-group dedup (`video-ai-drafts.js:39-55`) | SHIPPED |
| Auto-reel | `POST /api/media/projects/:id/reel-render` | reel-engine.js:154 | `hero`, `aesthetic`, `composition`, `face_count`, `scene_class` → story-arc roles | SHIPPED (renders) |
| Auto-reel plan (advisory) | `POST /api/media/projects/:id/reel-plan` | reel-engine.js:137 | same | SHIPPED but **has no UI** — `reelAPI.plan` exists in `lib/api.js:526` and is never called |
| Story Engine | `POST /api/video-ai/projects/:id/reel` | video-ai.js:117 | `hook`, `emotion`, `quality` on videos + `highlights`/`best_of` selection or `hero` on photos | PARTIAL (see below) |

**AI Drafts** rank media (`rankMedia`), order it (chronological for story-ish categories, best-first otherwise), then pour it into the matching Creative Pack. The result is stored with `source='ai_draft'`, an `ai_style` (the pack id) and an `ai_signature` (sha1 of the media set). Uploading new assets to the project sets `ai_stale = 1` on every `ai_draft` timeline (`media-studio.js:649`), and `POST /api/media/timelines/:id/refresh` rebuilds it from current media and clears the flag. This staleness loop is a genuinely nice piece of design and it is **SHIPPED**.

**Auto-reel** (`backend/reel-engine.js`) is the story-structured planner. `buildPlan` (`reel-engine.js:91-134`) computes an `energy` score (`aesthetic*0.5 + composition*0.2 + min(1, faces/3)*0.3`), picks the highest-energy shot as the **hook**, the highest-hero shot as the **climax**, a landscape/faceless shot as the **outro**, then fills the **build** body by round-robining scenes ordered by group size. `planToTimeline` (`reel-engine.js:40-74`) turns that into a 9:16 EDL: per-role durations (`hook 2800 ms, build 2200, climax 3000, outro 3400`), a 350 ms `crossDissolve` overlap between every cut, alternating Ken Burns on photos, an optional title text track and an optional music track. It optionally bakes a house-style colour grade per clip by comparing each asset's measured look (from the `aesthetic` score's `reasons` JSON) against the workspace `style_profiles` row via `style-apply.js` — on by default, `auto_style:false` opts out, silently skipped when no profile exists.

**Story Engine** (`backend/video-ai.js`) generates a narrative spec (`hook → establish → build → peak → resolve`) into `ms_story_specs`, fills the matching `ms_template_library` slots to a target length (15/30/60/90 s), and then converts the plan into an `ms_timelines` row. It is surfaced only as a small "Reel (Story Engine)" control inside the Studio AI modal on the project page (`wappflow-web/src/app/studio/[id]/page.js:738-743`), which then links to the real timeline editor. Rated **PARTIAL** because its ranking depends on `hook` and `emotion` scores that nothing in this repo ever writes (see Concerns).

#### The ownership assertion in reel-engine

`reel-engine.js:27-31` runs at mount:

```js
for (const t of ['ms_timelines', 'ms_video_exports', 'ms_jobs']) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t)) {
    throw new Error(`${t} must be created by media-studio before reel-engine mounts`);
  }
}
```

Why it exists: reel-engine **writes** three tables whose DDL and semantics are owned by `media-studio.js`. That only works because `server.js` happens to `require('./media-studio')` at line 6255 and `require('./reel-engine')` at line 6469 — an ordering dependency that nothing declared. The guard converts a silent, far-away failure (a 500 at the first render request, or worse, SQLite creating a *different* table shape) into a loud boot crash. `video-ai.js:31-33` carries the same guard for `ms_timelines`, and `studio-ai.js` for `ms_albums`. `backend/test-phase6-video-truth.js` asserts both guards survive and that **every table has exactly one DDL owner** across the whole backend.

---

### Schema

| Table | Owner | Key columns |
|---|---|---|
| `ms_timelines` | media-studio.js:1428 | `id`, `workspace_id`, `project_id`, `name`, `source` (`manual\|template\|ai_draft\|ai_reel`), `template_id`, `aspect_ratio`, `width`, `height`, `fps`, `duration_ms`, `document` (the EDL JSON), `status` (`draft\|ready`), `ai_style`, `ai_signature`, `ai_stale`, `created_by`, timestamps. Index on `project_id`. |
| `ms_video_exports` | media-studio.js:1451 | `id`, `workspace_id`, `timeline_id`, `project_id`, `preset`, `width`, `height`, `fps`, `quality`, `status` (`pending\|rendering\|done\|failed`), `progress` 0–100, `storage_key`, `size_bytes`, `error_message`, `created_by`, `created_at`, `finished_at`. Index on `timeline_id`. |
| `ms_jobs` | media-studio.js:141 | `id`, `workspace_id`, `type`, `asset_id`, `project_id`, `status`, `progress`, `payload` (JSON), `error_message`, `retry_count`, `next_retry_at`, `lease_until`, `finished_at`. Video job types: `video_probe`, `video_poster`, `video_proxy`, `video_export`. |
| `ms_luts` | media-studio.js:1475 | `id`, `workspace_id`, `name`, `category`, `cube_path`, `thumbnail_url` |
| `ms_video_clips` | media-studio.js:1412 | `id`, `workspace_id`, `project_id`, `asset_id`, `label`, `in_ms`, `out_ms`, `sort_order` — sub-clip markers on a source video. **STUB**: 5 CRUD endpoints exist, nothing in the render path reads them, no client method, no UI. |
| `ms_audio_tracks` | media-studio.js:1470 | built-in/custom music library — **SOLD-NOT-BUILT**: table created, never inserted into, never read. The editor's music picker uses project audio assets instead. |
| `ms_video_templates` | media-studio.js:1480 | **SOLD-NOT-BUILT**: created, never touched by any code path. |
| `ms_story_specs` | video-ai.js:41 | `id`, `workspace_id`, `project_id`, `spec` (JSON) — written and read by the Story Engine. |
| `ms_reel_plans` | video-ai.js:45 | **DEAD**: created at boot, never inserted into, never selected from. Residue of the removed private-plan editor. |
| `ms_template_library` | video-ai.js:36 | `id`, `workspace_id`, `kind`, `niche`, `name`, `def` (JSON slot spec), `is_system` |

Assets carry video metadata as columns added by `safeAlter` (`media-studio.js:178-182`): `v_duration_ms, v_width, v_height, v_fps, v_codec, v_has_audio, proxy_url, poster_url`.

---

### Endpoint inventory

All authenticated routes sit behind the standard bearer `auth` middleware and are scoped to `req.workspaceId`. `/api/media/*` and `/api/video-ai/*` additionally sit behind the `media_studio` module gate (`server.js:6222-6249`), which 403s if a workspace has the module explicitly disabled.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/media/video/presets` | Aspects, qualities, presets, transitions, effects, text types/animations, font families, **detected font paths**, LUTs, and `ffmpeg: {ffmpeg:bool, ffprobe:bool}` |
| GET | `/api/media/video/luts` | Built-in looks + workspace custom LUTs (each with a CSS-filter approximation for preview) |
| POST | `/api/media/video/luts` | Upload a `.cube` (multipart field `file`, ≤8 MB, validated for `LUT_3D_SIZE`) |
| DELETE | `/api/media/video/luts/:lutId` | Remove a custom LUT + its file |
| GET | `/api/media/video/templates` | The 12 Creative Packs, enriched with the look's CSS hint |
| POST | `/api/media/projects/:id/templates/:templateId/apply` | Pack → new timeline. Body `{asset_ids?, aspect?, duration_sec?, name?}` |
| GET | `/api/media/projects/:id/ai-drafts/styles` | Recommended + all draft styles for the shoot type |
| POST | `/api/media/projects/:id/ai-drafts` | Score-ranked media → new timeline (`source='ai_draft'`) |
| POST | `/api/media/timelines/:id/refresh` | Rebuild an `ai_draft` from current media; clears `ai_stale` |
| GET | `/api/media/projects/:id/audio` | Audio assets in the shoot (music picker) |
| GET/POST | `/api/media/projects/:id/timelines` | List / create |
| GET/PUT/DELETE | `/api/media/timelines/:id` | Read / save (full-document replace) / hard-delete (cascades `ms_video_exports`) |
| POST | `/api/media/timelines/:id/export` | Enqueue an MP4 render. Body `{preset?, quality?}` → 202 + the export row |
| GET | `/api/media/timelines/:id/exports` | Last 20 exports for this timeline (with `url`) |
| GET | `/api/media/video/exports/:exportId` | Poll one export (status/progress/url) |
| GET | `/api/media/projects/:id/videos` | Video assets + `clip_count` |
| GET/POST | `/api/media/assets/:id/clips`, PUT `/api/media/assets/:id/clips/order`, PUT/DELETE `/api/media/clips/:clipId` | `ms_video_clips` CRUD — **STUB**, no UI |
| POST | `/api/media/projects/:id/reel-plan` | Advisory story-arc shot list (writes nothing) |
| POST | `/api/media/projects/:id/reel-render` | Plan → timeline → export job. 202 with `{timeline_id, export_id, segments, duration_ms, structure, preset, auto_style}` |
| POST | `/api/video-ai/projects/:id/reel` | Story Engine. Body `{length_s?, story_id?, template_id?, mode?}` → `{reel_id, timeline_id, story_id, template, plan}` |

---

### How a render job is queued and executed

1. **Queue.** `POST /api/media/timelines/:id/export` resolves the preset → aspect → `dimsFor(aspect, quality)`, inserts a row into `ms_video_exports` with `status='pending'`, then inserts an `ms_jobs` row `{type:'video_export', payload:{export_id}}` and returns 202 (`media-studio.js:2379-2399`). `reel-render` does the same two inserts inline (`reel-engine.js:199-203`).

2. **Drain.** `createMediaWorker(db, {...})` is constructed and started from inside `media-studio.js:2877-2878` (a `setInterval` every 5000 ms, `unref`'d). `processOnce(batch=10)` reaps stale leases, selects due `pending` jobs oldest-first, and claims each with an atomic conditional `UPDATE ... SET status='running', lease_until=now+10min WHERE id=? AND status='pending'` — only one worker's update can win (`media-worker.js:833-841, 874-888`). Failures retry up to `MAX_RETRIES=3` with a `retry * 30 s` backoff.

3. **Compile.** `processVideoExport` (`media-worker.js:752-830`):
   - bails with a user-readable failure if `detectFfmpeg().ffmpeg` is false (`"FFmpeg is not installed on the server. Run: apt install ffmpeg"`);
   - loads the timeline, parses `document`;
   - if storage is remote (R2), pre-downloads every referenced asset to `uploads/media/tmp/` because the `resolve` callback handed to the pure builder is synchronous — **a dead branch today**, since the R2 provider cannot be activated (its AWS SDK dependency is absent from `backend/package.json`; see §14 §7 and §05's resolved UNKNOWN), so `storage.isRemote` is always false;
   - materialises the built-in `.cube` files on disk via `videoLuts.ensureCubeFiles` and merges workspace custom LUTs;
   - detects fonts;
   - calls `videoEngine.buildExportCommand(document, {width, height, fps}, resolve, lutPath, fontFile)`.

4. **The render graph** (`video-engine.js:236-382`). The first `video` track is the spine. Per clip, an ordered list of filter atoms is assembled onto `[i:v]`:
   - **source**: photos → `-loop 1 -t <dur> -i <file>`; video → `-ss <in> -to <in+dur*speed> -i <file>`; freeze-frame → `-ss <in> -i <file>` + `loop=loop=-1:size=1` + `setpts=N/FRAME_RATE/TB`; a missing file → an `lavfi color=0x111114` grey placeholder;
   - **geometry**: `scaleCover` (`scale=W:H:force_original_aspect_ratio=increase,crop=W:H`) for video, or `scale=2W:2H` + `zoompan` for Ken Burns / motion keyframes;
   - **grade**: `eq` (brightness/contrast/saturation) + `colorbalance` (temperature/tint) → `lut3d=<cube>` → effect atoms (`vignette`, `noise` for film grain, `gblur` for blur/soft focus, `drawbox` bars for letterbox);
   - **compositing effects**: `glow` (`split` + `gblur sigma=18` + `blend=screen@0.45`) and `lightLeak` (a generated `gradients` source blended `screen@0.32`) get their own sub-graphs;
   - **opaque transitions**: `dipToBlack` / `dipToWhite` become `fade=t=in|out` with an optional `:color=white`;
   - **alpha stage**: `fade` / `crossDissolve` become `format=yuva420p` + `fade=...:alpha=1`; keyframed opacity becomes a `geq` alpha expression built by `pwl()` (`video-engine.js:418-429`), a piecewise-linear ffmpeg expression generator;
   - **placement**: `setpts=PTS-STARTPTS+<start>/TB`.

   All layers are then overlaid one by one onto a full-length black `color` canvas, each gated by `overlay=eof_action=pass:enable='between(t,start,end)'`. Gaps show the base through; overlaps let the top clip win, and alpha makes overlaps crossfade. Text clips become `drawtext` atoms appended to the composite. The first clip of the first audio track becomes `volume` + `afade in/out` + `atrim`. Encode is fixed at `libx264`, `-preset medium`, `-crf 20`, `yuv420p`, `+faststart`, AAC 192 k with `-shortest` when audio exists.

5. **Execute + report.** The worker prefixes `-progress pipe:1 -nostats`, appends the output path, and spawns ffmpeg with `windowsHide`. It parses `out_time_ms=` from stdout and converts to a percentage (`media-worker.js:645-659`) — note ffmpeg emits that key in *microseconds*, and the `/1000` in the code correctly compensates. Each tick writes `ms_video_exports.progress` and broadcasts.

6. **Output.** The MP4 lands at `<uploadsDir>/media/exports/<export_id>.mp4`. On R2 it is additionally uploaded to the bucket (local copy kept as a dual-read fallback). The row is set to `status='done', progress=100, storage_key, size_bytes, finished_at`, and the URL is `storage.getPublicUrl(key)` — for local storage that is `/uploads/media/exports/<id>.mp4`, served by the plain `express.static` mount at `server.js:116-120`.

#### Progress reporting over SSE

The worker calls `broadcastToWorkspace(workspace_id, 'ms_video_export', {...})` on start, on every progress tick, on failure and on completion. `broadcastToUser` (`server.js:978-988`) writes **unnamed** SSE frames with the event name folded into the payload as `type`, so consumers must use `es.onmessage` + `switch (data.type)`.

**Nothing consumes `ms_video_export` in the web client.** The frontend's single shared `EventSource` router (`wappflow-web/src/components/shell/realtime.js`) has no handler for it, and the export modal instead polls `GET /api/media/video/exports/:id` every 1500 ms (`video/[timelineId]/page.js:900-906`). The SSE channel is therefore write-only today. Completion *does* now create a durable notification row via `notify()` (`media-worker.js:762, 825`), so closing the modal no longer loses the render entirely — this contradicts `PRODUCT-AUDIT.md`, which still lists "Global Notifications on render completion" as missing.

---

### The editor (frontend)

- `wappflow-web/src/app/studio/[id]/video/page.js` — the Reels list. Four creation entry points (Auto-reel, AI drafts, Templates, blank), a poster-art template gallery, per-card source badges (`ai_draft` / `ai_reel` / `template`), a stale-draft refresh button, and delete.
- `wappflow-web/src/app/studio/[id]/video/[timelineId]/page.js` (974 lines) — the editor. Media rail → click to append; a preview stage that reproduces transform + Ken Burns + motion/opacity keyframes + colour + LUT (as CSS filters) + text overlays + safe-area guides; a `requestAnimationFrame` playhead that seeks a `<video>` element and a music `<audio>` element; a draggable multi-track timeline with move/trim-left/trim-right handles and zoom; split at playhead; per-kind inspectors (clip / text / audio); debounced 800 ms autosave with saved/saving/dirty state; keyboard shortcuts (Space, S, Del, arrows); and the export modal.
- `wappflow-web/src/app/studio/video-constants.js` — a hand-mirrored copy of the engine's aspects, presets, qualities, safe areas, transitions, text types/animations, font families, effects and the CSS colour-preview approximation.

Status: **SHIPPED** as an editor. Known gaps it does not attempt: no undo/redo, no exports-history surface (`mediaAPI.listVideoExports` exists in `lib/api.js:398` and is never called), no export cancel, and no mobile layout for the three-pane shell.

---

### Concerns: bugs, security weaknesses, data-integrity risks and smells

*Read-only observations. Nothing here was changed.*

**S1 — Cross-tenant asset read through the render path (security, high).** `resolveAssetPath` (`media-worker.js:635-644`) and `localizeRenderAsset` (`media-worker.js:728-750`) both do `SELECT * FROM ms_assets WHERE id = ?` with **no workspace clause**. `PUT /api/media/timelines/:id` accepts an arbitrary document and `sanitizeClip` only truncates `assetId` to 64 chars — it never verifies the asset belongs to the caller. An authenticated user who learns (or guesses) another workspace's asset id can place it in their own timeline, export, and download another studio's photo or video inside their MP4. The LUT resolution on the same code path *is* correctly scoped by `exp.workspace_id` (`media-worker.js:786`), which makes the omission look accidental rather than intentional.

**S2 — Rendered MP4s are served unauthenticated.** Output lands under `/uploads/media/exports/` behind `express.static` with `Access-Control-Allow-Origin: *` (`server.js:116-120`). Access control is "know the UUID". Acceptable as capability-URL design, but it is not stated anywhere and differs from the tokenised gallery routes.

**S3 — `reel_engine` / `story_engine` entitlements are declared but never enforced.** `entitlements.js:56` sets both to `false` on the Creator plan and `:84` to `true` on higher tiers, and `:131` documents them as shipped. No code anywhere reads either flag — the only gate on the reel routes is the coarse `media_studio` module gate. A Creator-plan workspace can use Auto-reel and the Story Engine freely.

**S4 — Video exports are invisible to the storage quota.** `storage-enforce.js:37-42` sums `ms_assets` + `ms_exports` (the gallery ZIP table) and **never** `ms_video_exports`. 4K renders are the largest single artifacts a workspace produces and they do not count against `storage_gb`. Nothing ever deletes old MP4s either — deleting a timeline removes the `ms_video_exports` rows (`media-studio.js:2372`) but leaves the files on disk.

**B1 — Four of the nine transitions render as nothing.** `buildExportCommand` only draws `fade`/`crossDissolve` (alpha) and `dipToBlack`/`dipToWhite` (opaque fade). `slide`, `push`, `zoom` and `blur` are accepted by `sanitizeTransition`, stored, offered in the editor picker (`video-constants.js:44-53`) and produce **no filter at all** — I verified this by running `buildExportCommand` on a `slide` transition and inspecting the generated `filter_complex`: the graph contains only `overlay`, no `xfade` or equivalent. This also undermines the alias fix: `whip → slide` maps a legacy name onto a transition the renderer still cannot draw, despite the comment at `video-engine.js:159` claiming slide is "the closest thing the renderer can actually draw".

**B2 — Ken Burns distorts the photo's aspect ratio.** The Ken Burns and motion-keyframe branches use `scale=${W*2}:${H*2}` with no `force_original_aspect_ratio` (`video-engine.js:269, 273`), so a 3:2 landscape photo is squashed into the 9:16 canvas before `zoompan` crops it. The non-motion branch correctly uses `scaleCover`. Because every template, AI draft and Auto-reel attaches Ken Burns to photos by default, this affects nearly every generated reel. Generated graph for a 9:16 export: `scale=2160:3840,zoompan=z='min(zoom+0.002000,1.12)':d=60:s=1080x1920:fps=30`.

**B3 — Ken Burns ignores pan, and "zoom out" is a no-op.** The same `zoompan` expression sets only `z` — no `x`/`y` — so `fromX/toX/fromY/toY` (set by every pack with `motion:'pan'` and by the editor's "Pan ▸" preset) do nothing, and `zoompan`'s default `x=0:y=0` anchors the zoom at the **top-left** corner rather than the centre. It also ignores `fromScale`: `zoompan.zoom` always starts at 1, so a zoom-out (`fromScale 1.16 → toScale 1`, used by `corporate_brand` and the editor's "Zoom out" chip) computes `min(zoom - 0.0027, 1)`, which clamps to a static frame. The browser preview *does* honour `fromScale`, `fromX` and `toX` correctly (`video/[timelineId]/page.js:318-320`), so preview and render disagree.

**B4 — Crossfades dip toward black.** Overlaps are composited by chaining `overlay` calls onto a black base, with both clips carrying alpha. At the midpoint of a 50/50 crossfade the arithmetic is `out = 0.5·B + (1−0.5)·(0.5·A) = 0.5B + 0.25A` — total weight 0.75, i.e. a ~25 % luminance dip. A proper `xfade` would sum to 1. Since Auto-reel puts a `crossDissolve` on *every* cut (`reel-engine.js:52-53`), this affects the default output.

**B5 — Text silently vanishes when no font is found.** `drawtextAtom` is only emitted when `fontFile(family)` resolves (`video-engine.js:351-353`); `detectFonts` probes a fixed list of DejaVu/Liberation/Arial/Times paths (`video-engine.js:468-479`). On a slim container with no fonts installed, every text clip — including template title cards — is dropped from the render with no error, while still appearing in the preview. `GET /api/media/video/presets` returns the detected font paths and the ffmpeg presence flags, but the editor reads only `luts` from that response (`video/[timelineId]/page.js:95`), so neither condition is surfaced before the user clicks Render.

**B6 — Missing media becomes a silent grey card.** `buildExportCommand` counts unresolvable assets in `built.missing`, but `processVideoExport` drops that field from its result (`media-worker.js:827`), so a reel that rendered half its clips as grey `0x111114` placeholders reports `status='done'` with no warning.

**B7 — `-shortest` lets a short music track truncate the reel.** With audio present the encoder gets `-shortest` (`video-engine.js:377`). `atrim=duration=<total>` caps the audio but cannot extend it, so a 20 s music file under a 60 s reel likely ends the output at 20 s. *UNKNOWN: not verified against a real ffmpeg run — I could not execute a render in this environment.*

**D1 — `reel-plan` and `reel-render` disagree about deleted assets.** The plan query has no `deleted_at` filter (`reel-engine.js:141`); the render query has `AND deleted_at IS NULL` (`reel-engine.js:158`). The advisory plan a user reviews can include trashed photos that the render will then drop.

**D2 — reel-engine persists an unsanitised document.** It computes `san = sanitizeTimeline(doc)` for the row's dimension columns but stores `JSON.stringify(doc)` — the raw plan output (`reel-engine.js:191`). `video-ai.js:173` and `media-studio.js` both store the sanitised form. The render re-sanitises so output is unaffected, but the editor loads a document missing defaulted fields.

**D3 — Cross-workspace template lookup.** `video-ai.js:128` fetches `SELECT * FROM ms_template_library WHERE id = ?` with no `workspace_id` clause. Harmless today because every row is `'system'`, but it becomes an IDOR the moment workspace-owned templates ship (which the "Marketplace-ready" header explicitly plans).

**D4 — `ms_jobs.type` no longer declares what is written to it.** The column comment says `ingest|transcode|score|zip_export|watermark` (`media-studio.js:144`) while the worker actually writes `video_probe`, `video_poster`, `video_proxy`, `video_export`, `pdf_export` and `render_edits`. `test-phase6-video-truth.js` enforces exactly this discipline for `ms_timelines.source` but not here.

**A1 — The render graph is O(clips × duration).** Every clip becomes a full-length `overlay` pass over the whole canvas, chained serially. A 60 s reel with 40 clips runs 40 full-duration compositing passes instead of decoding 60 s of footage once. With the sanitiser's 400-clip ceiling, a maximal timeline produces 400 `-i` inputs and a filtergraph likely beyond practical argv/ffmpeg limits. There is no guard between the sanitiser's cap and what the encoder can survive.

**A2 — One worker, one process, serialised.** `processOnce` awaits each job in turn behind a `busy` flag, so a long 4K render blocks *all* media work — photo ingest, ZIP exports, album PDFs — for its duration. The 10-minute job lease plus `reapStale()` also means that if the worker were ever run in more than one process, a render exceeding 10 minutes would be re-claimed and rendered twice concurrently to the same output path. There is no export cancel and no concurrency limit.

**A3 — Server-side video intelligence does not exist.** `analyzers/index.js:50` registers the `video` analyzer with `where: 'client'` — its score types (`shake, motion, quality, speech, emotion, scene_cut, action`) are only ever produced by an external desktop/cloud analyzer POSTing to the score-ingestion endpoint. Worse, the ingest worker short-circuits video and audio assets straight to `video_probe` before the Jimp-based vision pass (`media-worker.js:235-241`), so on a server-only deployment **video assets receive no scores at all**. The composite formula (`analyzers/index.js:143-186`) writes `hero`, `portfolio`, `album`, `storytelling` — it never writes `hook`, `story` or `social` despite declaring them. The Story Engine ranks video clips by `hook + emotion` (`video-ai.js:101-102`) and Auto-reel's `energy` leans on `aesthetic`/`composition`; on a server-only install those are all zero for video, so the "AI" ordering for clips degrades to insertion order. Classify the *P8 Video Culling* layer as **SOLD-NOT-BUILT**: `VKIND` (`video-ai.js:81-88`) defines six culling profiles (`best_moments`, `best_clips`, `best_reactions`, `best_action`, `best_interviews`, `best_drone`) and is referenced by nothing.

**A4 — Two template systems, one product surface.** Creative Packs (hardcoded, no persistence, drives the UI) and `ms_template_library` (persisted, seeded, marketplace-shaped, drives one hidden endpoint) solve the same problem with different data models. Neither can consume the other.

**Doc drift worth flagging to the reader.** `PRODUCT-AUDIT.md`'s "Media Studio — Video & Reel" section is materially stale against the code: it describes the Story Engine as writing `ms_reel_plans` and opening a dead-end editor at `/studio/[id]/reel/[reelId]` (that route no longer exists; `video-ai.js:170-176` writes `ms_timelines`), lists render-completion notifications as missing (they exist), lists `ms_timelines.source` without `ai_reel`, and cites `server.js:5434-5442` for the module gates that are now at `6222-6249`. `backend/MEDIA-STUDIO-API.md` still says "no worker runs yet". The code is the truth in all four cases.


---


<!-- ── 07-contracts-studio.md ─────────────────────────────────────────── -->

## Contracts Studio — documents, e-signature and automations

### What this is for

Contracts Studio is WappFlow's answer to DocuSign, PandaDoc and HoneyBook's proposal builder, aimed squarely at the creative studio that has just talked a couple through a wedding package on WhatsApp and now needs them to *commit*. The product bet, stated at the top of `CONTRACTS-STUDIO-DESIGN.md:3-6`, is that a contract is not an isolated PDF but a moment in a relationship: the studio builds a beautiful interactive document, the client picks a package and signs it on their phone, and the act of signing then **does things** — moves the lead to Closed-Won, raises the invoice for exactly what the client chose, opens the shoot in Media Studio, and texts them the booking link. That last chain is the differentiator; the e-signature itself is table stakes.

Vocabulary a reader needs, because the code invents some of it:

- **Document** — the unit of work. One row in `cs_documents`. Its `type` is one of `contract | proposal | quote | nda | sow | retainer | agreement | hybrid`; the type is only a label, it changes no behaviour anywhere in the codebase.
- **Block** — the document is not a Word file or a PDF template. It is a JSON array of typed blocks (`heading`, `text`, `pricing_table`, `package`, `addons`, `signature`, …) rendered by one React component. Think Notion, not Word.
- **Pack** — a hard-coded, curated starter document (a Wedding Photography Proposal, an NDA) shipped in the source so a new user never faces a blank page.
- **Template** — the workspace's *own* saved block array, created by pressing "save as template" in the builder.
- **Signer** — a named party expected to sign (`client | company | witness | cosigner`), with a `sign_order`.
- **Token** — a 36-hex-character capability string on the document. Whoever holds it can read, sign or decline. There is no password, no OTP, no email verification.
- **Vault** — a read-only view that regroups every document by client.

### Code map and mount

| File | Lines | Owns |
|---|---|---|
| `backend/contracts-studio.js` | 1,135 | Everything server-side: the seven `cs_*` tables, 41 routes, packs, PDF generation, automations, reminder/expiry cron. |
| `backend/public-brand.js` | 123 | `publicBrand()` — the studio identity shown on the public signing page; `journeyLinks()` — where the client goes after signing. |
| `wappflow-web/src/app/contracts/page.js` | 330 | Overview: status lanes, stats, activity feed, New-document modal, Bulk-send modal. |
| `wappflow-web/src/app/contracts/[id]/page.js` | 618 | The block builder plus every modal: Send, Settings/Automations, AI, People/Signers, Versions, Clauses. |
| `wappflow-web/src/app/contracts/blocks.js` | 321 | `BLOCK_TYPES`, `defaultData()`, `BlockView` (one renderer for both edit and view), `DocFrame`, `computeTotals`. |
| `wappflow-web/src/app/d/[token]/page.js` | 256 | The public client-facing document and the signing ceremony. |
| `wappflow-web/src/app/contracts/{vault,analytics,settings,help}/page.js` | 92 / 87 / 114 / 113 | Vault, analytics, workspace settings + clause library, and an in-app help guide. |

`server.js:6407-6427` mounts the module with injected `auth`, `generateId`, `logAudit`, `broadcastToWorkspace`, `addContactHistory`, `notify`, multer/fs/path, `clientBaseUrl` (from `FRONTEND_URL`), a `sendClientMessage` closure onto the WhatsApp rail, a `sendEmail` closure that reads the workspace owner's row in `email_smtp_settings` and builds a nodemailer transport per send, and — importantly — the **shared** `createInvoiceForLead` (`server.js:2580`) and `mediaStudioApi.createProject`. The module's own comment at `contracts-studio.js:307-309` records why: the automation used to hand-roll a fourth copy of invoice creation that inserted no `workspace_id` at all.

A module gate at `server.js:6229` returns 403 on `/api/cs/*` when the `contracts_studio` entitlement is explicitly false, exempting `^/api/cs/public\b` so a client is never locked out of a document they were sent.

### The block document model

`cs_documents.blocks` is a JSON array of `{ id, type, data }`. Nineteen block types are declared in `blocks.js:12-32`, grouped for the inserter into Basic (`heading`, `text`, `callout`, `divider`, `button`), Media (`image`, `gallery`, `video`, `embed`), Pricing (`pricing_table`, `package`, `addons`), Content (`timeline`, `checklist`, `faq`, `testimonial`, `custom_section`) and Action (`signature`, `approval`). `BlockView` renders each type in both modes off a single `editing` flag, which is why the builder's Preview is a genuinely faithful preview.

The builder autosaves on a 1,100 ms debounce (`contracts/[id]/page.js:47-54`), PUTting `title`, `blocks`, `theme`, `settings` and a recomputed `totals` on every change. There is no schema validation of block `data` on the server — `PUT /api/cs/documents/:id` (`:568`) simply `JSON.stringify`s whatever arrives.

Two of the nineteen block types are decoration only. The `signature` block (`blocks.js:258-267`) renders a dashed box reading "The client signs here in the portal" — it places no field, gates nothing, and the sticky **Review & sign** bar on the public page appears whether or not a signature block exists. The `approval` block (`blocks.js:268-277`) renders Approve/Decline as `<span>` elements with no handlers. There is no field-placement model of any kind: you cannot say "initial here, date there" the way DocuSign does.

### Packs, templates and the clause library

Four packs are hard-coded in the source at `contracts-studio.js:22-88`: `wedding-proposal`, `portrait-agreement`, `commercial-sow` and `nda`, each a full block array with real prose, prices and a signature block. `GET /api/cs/packs` (`:810`) returns only their metadata; the blocks are copied server-side when `pack_id` is passed to `POST /api/cs/documents` (`:536`). Packs are not stored in the database and cannot be edited or added without a deploy.

Templates (`cs_templates`) are workspace-scoped saved block arrays. They are created from the builder toolbar (`contracts/[id]/page.js:60`) and consumed in the New-document and Bulk-send modals. There is no templates *page* — the design doc's "Templates" section (`CONTRACTS-STUDIO-DESIGN.md:15`) does not exist as a route; `modules.js:86-90` shows the module's whole navigation is Overview / Client Vault / Analytics, plus Studio settings and Help in the overflow menu.

The clause library (`cs_clauses`, routes at `:755-772`) is a flat list of `{title, body}` edited on the settings page. Inserting one from the builder appends a `heading` + `text` pair (`contracts/[id]/page.js:175`) — it is a snippet paste, not a linked clause.

### Themes and letterhead

Three themes — `monochrome`, `editorial`, `executive` — are whitelisted server-side (`:541`, `:576`) and implemented purely as CSS custom properties in `contracts.css` under `.cs-theme-*`, plus a different page background chosen in JS (`d/[token]/page.js:13`). `cs_settings.letterhead_url` holds one uploaded image per workspace, rendered full-width above the blocks by `DocFrame` and toggled per document via `settings.letterhead !== false`.

### Interactive pricing: packages, add-ons and totals

Three block types carry money. `pricing_table` is a fixed list of rows. `package` is a set of tiers, one of which may be `featured`, and if `selectable` is true the client can pick one. `addons` is a checkbox list with per-item prices.

On the public page the client's selections live in React state (`d/[token]/page.js:19-20`), the total recomputes live in a `useMemo` (`:44-52`), and the sticky bottom bar shows it. On submit, the page posts a `selection` payload of `{ packages: {blockIdx: packageIdx}, addons: {blockIdx: [itemIdx]}, total, currency }` (`:141`).

The server does **not** trust the client's `total`. `selectionToInvoice()` (`contracts-studio.js:255-273`) walks the stored blocks and re-derives prices from them, using the client's payload only to choose *which* package index and *which* add-on indices. That is the right design. But `POST /sign` then stores `totals = { ...totals, selection }` (`:1055`) without recomputing `totals.total` — so the document's recorded value stays whatever the builder last autosaved (the featured package plus default-on add-ons), while the invoice bills the client's actual choice. Overview "Revenue impact" (`:492`), Analytics "Signed revenue" (`:917`) and the Vault's per-client value (`:943`) all read `totals.total`, so **reported revenue silently diverges from invoiced revenue whenever a client picks a non-default option.**

### The signer model and sign order

`cs_signers` carries `role`, `name/email/phone`, `sign_order`, `mode`, `status`, and the signature evidence columns. A client signer is seeded automatically from the linked lead at document creation (`:544-548`), at send time if none exists (`:980-986`), and per-lead during bulk send (`:792`). Further signers are added through `POST /api/cs/documents/:id/signers` (`:647`) from the People modal.

Three things in that table are declared and never used:

- `cs_signers.token` — a per-signer capability — is **never written and never read**. Every signer shares the one document token.
- `cs_signers.mode` (`sequential|parallel`) is written on insert and update but **read nowhere**. There is no parallel signing.
- Because there is no per-signer token, `POST /api/cs/public/:token/sign` cannot know *who* is signing. It takes the lowest-`sign_order` row still `pending` and stamps the submitted name and signature onto it (`:1049-1051`). Anyone holding the link can therefore sign as the next expected party, whoever they are.

**Multi-party signing is broken end to end.** `POST /sign` rejects the request when the document status is already `signed` or `completed` (`:1043`). After the first of two signers signs, `remaining` is 1, so `status` is set to `'signed'` (`:1052-1054`) — and the second signer is refused with "Already signed." The reminder route blocks on the same statuses (`:688`), so you cannot even nudge them. The public page compounds it: it sets `done = true` for status `signed`, so signer two sees "Signed — thank you" (`d/[token]/page.js:31`). The in-app help states the opposite — "Signing proceeds in order; the document completes when everyone has signed" (`contracts/help/page.js:51`) — as does the landing page's "multi-party signing" bullet (`app/page.js:1161`). Believe the code.

### Approvals

`POST /api/cs/documents/:id/request-approval` (`:612`) inserts a `pending` row in `cs_approvals` and flips the document to `pending_approval`. `POST .../decide-approval` (`:626`) resolves the newest pending row (or inserts an already-decided one, explicitly to cover "solo approve") and returns the document to `draft`. `POST .../send` refuses with 409 when `settings.require_approval` is on and the latest approval is not `approved` (`:962-965`).

There is no role check, no check that the approver is the requested `approver_user_id`, and no chain — `cs_approvals.sign_order` exists and is never used. The Settings modal's "Approve now" button (`contracts/[id]/page.js:518`) lets the author approve their own document in one click. This is a speed bump, not a control.

### Sending and the public token capability model

`POST /api/cs/documents/:id/send` (`:950`) is the pivot. It (1) charges the plan's `contract_sends` meter, but only when `sent_at` is null so re-sends are free (`:955-960`); (2) enforces the approval gate; (3) mints `crypto.randomBytes(18).toString('hex')` as `token` if the document has none, and moves `draft → sent`; (4) sets `expires_at` from `expire_days`; (5) snapshots the current blocks into `cs_versions` labelled `Sent · v{n}` and increments `version` (`:972-977`); (6) ensures a signer exists; (7) delivers `${FRONTEND_URL}/d/${token}` over WhatsApp and/or email to the *first* signer only; (8) records a `sent` event, a contact-history entry, an audit row and a `cs_updated` broadcast.

The token is the entire access-control model for the client side. It is 144 bits of CSPRNG output — cryptographically fine — but it is a bearer capability with no second factor and no per-recipient scoping. Forwarding the WhatsApp message forwards the ability to sign the contract.

`GET /api/cs/public/:token` (`:1008`) returns title, type, theme, blocks, settings, totals, status, a redacted signer list, letterhead and the resolved studio brand. Its one clever detail: the Next.js `generateMetadata` server-side fetch (`d/[token]/layout.js`) sends `x-wf-preview: 1`, and `isPreview()` (`:95`) suppresses the `sent → viewed` transition for it, so an Open-Graph link preview does not falsely tell the studio the client opened the document (`:1013-1017`).

`POST /api/cs/public/:token/track` (`:1117`) accepts `time_on_page` and `block_viewed` beacons from the client page for read-depth analytics.

### The signing ceremony

The `SignSheet` component (`d/[token]/page.js:192-251`) is a bottom sheet requiring three things before it will submit:

1. a typed **full legal name**;
2. a **drawn signature** on an HTML canvas, exported with `toDataURL('image/png')` and posted as a base64 data URI (`:219`);
3. a ticked consent checkbox reading, verbatim: *"I agree to sign electronically; my e-signature is the legal equivalent of my handwritten signature (ESIGN/UETA). I consent to my IP, timestamp and device being recorded."* (`:240`).

The server revalidates all three (`:1045-1047`) and then writes to the signer row: `typed_name` (truncated to 120 chars), `signature_data`, `consent = 1`, `ip`, `user_agent`, `signed_at` (`:1050-1051`). It writes a `signed` event carrying the same IP and user agent, computes `doc_hash = sha256(id :: blocks :: typed_name :: signature_data :: signed_at)` (`:1056`), notifies the workspace, broadcasts `cs_signed`, sends the client a WhatsApp "thank you", and returns `journeyLinks()` so the response can offer the client their portal and booking page instead of a dead end (`:1077`).

There is **no typed-signature and no upload-signature option** despite the design doc promising "draw / type / upload" (`CONTRACTS-STUDIO-DESIGN.md:25`) — the typed name and the drawn ink are both mandatory, and there is no third mode.

Declining (`POST .../decline`, `:1081`) sets status `declined`, records the reason, and notifies.

### The audit trail and document hashing

`cs_events` is append-only and never deleted, even when the document is binned. Event types actually emitted: `created`, `sent`, `viewed`, `signed`, `declined`, `reminded`, `approval_requested`, `approved`, `rejected`, `automation`, `automation_error`, `ai_assist`, `client_question`, `file_uploaded`, `version_restored`, `time_on_page`, `block_viewed`. Each row carries `actor` (a user id, the literal `'client'`, or `'system'`), `ip`, `user_agent` and a JSON `meta`. The trail is surfaced in the People modal (`contracts/[id]/page.js:336-347`) and printed into the signed PDF's certificate page.

`doc_hash` is written once, at completion. Nothing ever verifies it: there is no verification endpoint, and no code path recomputes it. Since `PUT /api/cs/documents/:id` accepts a new `blocks` array at any status — including `completed` — a studio can rewrite a signed contract's text after the fact, and the only thing that breaks is a hash nobody checks.

### The signed PDF and certificate of completion

On full completion the server generates a PDF with `pdfkit` (`generateSignedPdf`, `:398-439`): letterhead, title, type and completion timestamp, a note of any attached file, the blocks flattened by `renderBlocksToPdf` (`:377-397`), then a **Signatures** page listing each signed party with name, role, `signed_at`, IP and the embedded signature image, then a **Certificate of Completion** page carrying document id, version, the SHA-256 hash, and the full chronological event trail.

It is written to `uploads/cs/signed-{documentId}.pdf` and its URL stored in `settings.signed_pdf`. Both the studio (People modal) and the client (post-sign banner) link straight to it. Note what this means: the signed record is a **statically served file on the API origin with no authentication** — the document id is the only secret. Generation is best-effort inside a `try/catch` (`:1064-1070`); if `pdfkit` throws, the document still completes and simply has no PDF, silently.

The block renderer is lossy. Images, galleries, video, embed, button and approval blocks emit nothing at all (`:393` `default: break`). A proposal whose terms live in an image would produce a signed PDF missing those terms.

### Reminders and expiry

`sendReminder()` (`:442-453`) re-delivers the link to every `pending` signer over the requested channels. Two callers: `POST /api/cs/documents/:id/remind` (manual, `:683`) and `autoReminderSweep()` (`:456-478`), which is opt-in per document via `settings.auto_remind = { enabled, every_days, max, channels }`, counts prior auto-reminders by pattern-matching `meta LIKE '%"auto":true%'` on `cs_events`, and stops at `max`.

A single `node-cron` job at `0 8 * * *` (`:1128-1134`) marks documents expired (`expires_at < CURRENT_TIMESTAMP` and status in `sent|viewed`) and then runs the reminder sweep. `node-cron` is loaded in an optional `try/catch` (`:15`) — if it is not installed, expiry and auto-reminders silently never run.

Expiry is enforced on `GET /api/cs/public/:token` (410, `:1012`) but **not** on `POST .../sign`, which checks only for `voided`, `signed` and `completed`. An expired, declined, or binned document is still signable.

### Post-signature automations

`runAutomations()` (`:276-356`) runs only when every signer has signed, reads `settings.automations`, and isolates each step in its own `try/catch` that records an `automation_error` event rather than aborting the signature. It acts as a synthetic owner principal `{ workspaceId, workspaceOwnerId, userId: created_by, canViewAllLeads: true }` (`:295`).

| Automation | Setting key | What it does | Status |
|---|---|---|---|
| Move pipeline | `move_pipeline` + `pipeline_stage` | Sets `leads.status`; for `Closed - Won` also fills `actual_sale` with the derived total. Writes contact history. (`:283-291`) | SHIPPED |
| Create invoice | `create_invoice` | Calls the shared `createInvoiceForLead` with re-derived line items, status `sent`. Honours `payment.type === 'deposit'` by replacing the items with a single deposit line (percent or fixed) and noting the balance. (`:298-321`) | PARTIAL — only `deposit` is special-cased; `full`, `milestone`, `plan`, `retainer` all produce a plain full-amount invoice. No payment link is minted (`createInvoiceForLead` at `server.js:2580` creates no `payments` row), so the client is never given a way to pay. |
| Create project | `create_project` + `project_type` | Calls the shared `mediaStudioApi.createProject`. (`:323-334`) | SHIPPED |
| Send booking link | `send_booking_link` | Looks up `booking_settings.slug`, WhatsApps the client `${FRONTEND_URL}/book/{slug}`, writes contact history. (`:339-352`) | PARTIAL — **no UI toggle exists.** The Settings modal (`contracts/[id]/page.js:496-504`) exposes only the first three. The only way to enable it is to PUT the settings JSON directly; it is exercised by `backend/test-phase7-contract-chain-e2e.js:59`. |

A successful run writes one `automation` event with `{ ran, invoiceId, total }` and an audit row.

### Endpoint inventory

All routes are mounted in `backend/contracts-studio.js`. `auth` = requires a workspace JWT; `public` = token is the only credential.

| Method | Path | Auth | Line | Notes |
|---|---|---|---|---|
| GET | `/api/cs/overview` | auth | 481 | Status counts, 8 recent docs, 12 recent events, signed revenue. |
| GET | `/api/cs/documents` | auth | 498 | `?status`, `?type`, `?lead_id`, `?bin=1`; opt-in pagination via `?limit`. |
| POST | `/api/cs/documents` | auth | 524 | Accepts `template_id` or `pack_id`; validates `lead_id` ownership. |
| GET | `/api/cs/documents/:id` | auth | 556 | Blocks + signers + events + approvals. |
| PUT | `/api/cs/documents/:id` | auth | 568 | Whitelisted fields; **no status lock**. |
| DELETE | `/api/cs/documents/:id` | auth | 598 | Soft-delete to the bin. |
| POST | `/api/cs/documents/:id/restore` | auth | 588 | Un-bin. No UI calls it. |
| POST | `/api/cs/documents/:id/request-approval` | auth | 612 | |
| POST | `/api/cs/documents/:id/decide-approval` | auth | 626 | Any member; self-approval allowed. |
| POST | `/api/cs/documents/:id/signers` | auth | 647 | |
| PUT / DELETE | `/api/cs/signers/:id` | auth | 660 / 673 | |
| POST | `/api/cs/documents/:id/remind` | auth | 683 | `channels: ['whatsapp','email']`. |
| POST | `/api/cs/documents/:id/send` | auth | 950 | Meters `contract_sends`; mints the token. |
| GET/POST/DELETE | `/api/cs/templates[/:id]` | auth | 700-720 | |
| GET | `/api/cs/documents/:id/versions[/:vid]` | auth | 723 / 732 | Version detail returns flattened text for both sides. |
| POST | `/api/cs/documents/:id/versions/:vid/restore` | auth | 741 | |
| GET/POST/PUT/DELETE | `/api/cs/clauses[/:id]` | auth | 755-772 | |
| POST | `/api/cs/bulk-send` | auth | 775 | Creates + sends N documents in one loop. |
| GET | `/api/cs/packs` | auth | 810 | |
| GET/PUT | `/api/cs/settings` | auth | 817 / 822 | |
| POST/DELETE | `/api/cs/settings/letterhead` | auth | 833 / 844 | multipart, 50 MB cap. |
| POST/DELETE | `/api/cs/documents/:id/upload` | auth | 850 / 863 | Attach a PDF/image to sign. |
| POST | `/api/cs/ai/assist` | auth | 874 | `draft \| improve \| explain \| summarize \| risks`. |
| GET | `/api/cs/analytics` | auth | 909 | |
| GET | `/api/cs/vault` | auth | 935 | |
| GET | `/api/cs/public/:token` | public | 1008 | 410 when expired; flips `sent → viewed`. |
| POST | `/api/cs/public/:token/sign` | public | 1039 | |
| POST | `/api/cs/public/:token/decline` | public | 1081 | |
| POST | `/api/cs/public/:token/ask` | public | 1095 | Unmetered LLM call. |
| POST | `/api/cs/public/:token/track` | public | 1117 | |

Realtime: the backend broadcasts `cs_updated` and `cs_signed` frames on the workspace SSE bus. **No frontend component subscribes to either** — a repo-wide grep for `cs_updated`/`cs_signed` in `wappflow-web/src` returns nothing, even though the shared `RealtimeProvider` (`components/shell/realtime.js`) exists and its own header comment names Contracts as the module it was built to serve. The Contracts UI never live-updates.

### Schema inventory

All created idempotently at mount (`contracts-studio.js:131-225`).

| Table | Key columns |
|---|---|
| `cs_documents` | `id`, `workspace_id`, `lead_id`, `type`, `title`, `status` (`draft\|pending_approval\|sent\|viewed\|signed\|completed\|declined\|expired`), `blocks` JSON, `theme`, `settings` JSON, `totals` JSON, `token` UNIQUE, `version`, `doc_hash`, `created_by`, `sent_at`, `viewed_at`, `completed_at`, `expires_at`, `is_deleted`/`deleted_at`/`deleted_by` |
| `cs_signers` | `id`, `document_id`, `workspace_id`, `role`, `name/email/phone`, `sign_order`, `mode` (unused), `status`, `token` (unused), `typed_name`, `signature_data`, `consent`, `ip`, `user_agent`, `signed_at` |
| `cs_events` | `id`, `document_id`, `workspace_id`, `type`, `actor`, `ip`, `user_agent`, `meta` JSON, `created_at` |
| `cs_approvals` | `id`, `document_id`, `workspace_id`, `approver_user_id`, `role`, `sign_order` (unused), `status`, `note`, `decided_at` |
| `cs_templates` | `id`, `workspace_id`, `type`, `industry`, `title`, `blocks` JSON, `created_by` |
| `cs_versions` | `id`, `document_id`, `workspace_id`, `version`, `title`, `blocks`, `theme`, `settings`, `label`, `created_by` |
| `cs_clauses` | `id`, `workspace_id`, `title`, `body` |
| `cs_settings` | `workspace_id` PK, `letterhead_url`, `settings` JSON (`default_theme`, `default_expire_days`, `sender_name`) |

Indexes: `idx_cs_docs_ws`, `idx_cs_docs_token`, `idx_cs_docs_ws_deleted`, `idx_cs_docs_lead`, `idx_cs_signers_doc`, `idx_cs_events_doc`, `idx_cs_versions_doc`. `soft-delete.js:31` registers `cs_documents` for retention sweeps and `:129` counts live contracts per lead as a guard on lead deletion.

Config surface: `FRONTEND_URL` (every client link), `TRUST_PROXY`, `DATA_DIR` (uploads root), the workspace-owner row in `email_smtp_settings`, and whatever `ai-engine` needs. `pdfkit`, `node-cron` and `pricing` are all optional `require`s that degrade silently.

### Maturity assessment

| Capability | Status | Gap |
|---|---|---|
| Block builder, 19 block types, 3 themes, autosave | SHIPPED | `image`/`gallery`/`video` take pasted URLs only — no picker into Media Studio. |
| Industry packs, workspace templates | SHIPPED | Packs are source-code constants, not data. |
| Interactive pricing, package/add-on selection, live total | SHIPPED | `totals.total` is not updated from the client's selection (see below). |
| Upload a PDF/image and send it for signature | PARTIAL | Renders via `<object>`; signing is still the global sheet, no fields on the file; the file's content is not in the signed PDF, only its filename. |
| Single-party e-signature | SHIPPED | |
| Multi-party / sequential / parallel signing | STUB | Second signer is always refused (`:1043`). `mode` and per-signer `token` unused. |
| Public token viewer, view tracking, decline | SHIPPED | |
| Reminders (manual + scheduled) | SHIPPED | Depends on optional `node-cron`. |
| Expiry | PARTIAL | Not enforced on the sign action; JS date comparison is timezone-naive. |
| Internal approvals | PARTIAL | No roles, no chain, self-approval in one click. |
| Signed PDF + certificate of completion | PARTIAL | Media/button/approval blocks silently dropped; generation is best-effort. |
| Automations: pipeline, invoice, project | SHIPPED | |
| Automation: booking link | PARTIAL | No UI toggle. |
| Payments | PARTIAL | Only `deposit` changes the invoice; no pay link, no checkout, no milestones/plan/retainer logic. |
| Version history + compare | PARTIAL | Snapshots only on send; "compare" is two flattened-text panes side by side. |
| Redline comparison | SOLD-NOT-BUILT | Sold on the pricing table (`app/page.js:1959`) and gated as `redline_comparison` in `entitlements.js:47/72`. No implementation. |
| Revocation / void | SOLD-NOT-BUILT | `status === 'voided'` is guarded in three places (`:1011`, `:1042`, `:1099`) and set by nothing. Design doc promises revocation (`CONTRACTS-STUDIO-DESIGN.md:46`). |
| Tamper detection | STUB | A hash is computed and printed; nothing verifies it and the content stays mutable. |
| Download tracking | SOLD-NOT-BUILT | Promised at `CONTRACTS-STUDIO-DESIGN.md:46`. PDFs are served by `express.static` with no hook. |
| AI draft / improve / summarize / risks | SHIPPED | `explain` exists server-side but is not exposed in the AI modal. |
| Client Q&A on the public page | SHIPPED | Unmetered and unattributed (below). |
| Analytics | PARTIAL | Funnel, acceptance, revenue, views, time-on-page, time-to-sign, top-viewed. Per-block drop-off and package popularity are collected (`block_viewed`, `deepest_block`) but never surfaced. |
| Client Vault | PARTIAL | Aggregates `cs_documents` only; design doc promises contracts + invoices + files + deliverables (`:37-38`). |
| Recycle bin | PARTIAL | Backend soft-deletes and `?bin=1` + `/restore` exist; **no UI reaches them**, and the delete dialog tells the user the opposite: "The contract and its signing links will be permanently deleted" (`contracts/page.js:117`). |
| Live UI updates | STUB | Frames broadcast, nothing listens. |
| Plan gating of contract depth | SOLD-NOT-BUILT | `clause_library`, `version_history`, `redline_comparison`, `approval_workflows`, `bulk_send` are priced as Studio-tier features but a repo-wide grep finds zero enforcement — Creator-plan workspaces get all of them. |

### How legally defensible is this e-signature?

Honestly: it would probably survive an uncontested dispute and would struggle badly against a determined challenge.

**What it captures well.** Intent to sign is explicit and separately affirmed: a ticked consent box naming ESIGN/UETA, a typed legal name, and a drawn mark — three deliberate acts, all required. Attribution to the record is captured: `signed_at`, `ip`, `user_agent`, the signer's role, and an immutable append-only event log that also records when the document was sent, when it was first opened, every reminder, and every question the signer asked. A SHA-256 hash over document id + block JSON + name + signature + timestamp is stored, and a certificate page reproduces the full trail alongside the executed text. That is meaningfully more than a scanned wet signature.

**What a court would want and would not find.**

- *Identity.* Nothing authenticates the signer. The link is a shared bearer token with no per-signer scoping, no email confirmation, no SMS OTP, no knowledge-based questions. Anyone the client forwards the WhatsApp message to can sign in their name, and the system cannot tell. Under UETA §9 / ESIGN, attribution must be shown "by any manner, including a showing of the efficacy of any security procedure" — the security procedure here is a URL.
- *The IP is spoofable.* `clientIp()` (`:117`) reads the first element of `X-Forwarded-For`, not `req.ip`. The documented nginx config uses `$proxy_add_x_forwarded_for` (`DEPLOYMENT.md:479`), which **appends** the real address to whatever the caller sent. A signer who sets their own `X-Forwarded-For` header controls the IP recorded against their signature. The single most-cited piece of location evidence in the audit trail cannot be relied upon.
- *Consent-to-electronic-records disclosure.* ESIGN §101(c) requires, for consumer transactions, a disclosure covering the right to a paper copy, the right to withdraw consent and its consequences, hardware/software requirements, and whether consent covers future records. The one-sentence checkbox covers none of that.
- *Record integrity is not enforced.* `PUT /api/cs/documents/:id` accepts a new `blocks` array with no status check, so the executed text of a completed contract can be edited afterwards by any workspace member. The hash that would expose it is never verified by any code path, and there is no read-only signed snapshot in the database — only a PDF file on disk at a predictable path, generated by a best-effort routine that drops image, gallery, video, embed, button and approval blocks entirely. If the terms lived in an image, the "signed record" does not contain them.
- *Retention and reproducibility.* The signed PDF is a single file at `uploads/cs/signed-{id}.pdf`, served unauthenticated by `express.static`, with no immutability, no checksum-on-read and no second copy.
- *Tenant-side tampering.* Every automation and every event is written by the same process that the studio controls; nothing is countersigned, timestamped by a third party, or written to append-only storage outside the tenant's reach.

Practical read: this is adequate for low-value photography retainers where the counterparty will not litigate and the WhatsApp thread corroborates intent. It is **not** adequate for anything where a signature might be repudiated. The cheapest material improvements, in order, are: use `req.ip` instead of the raw header; issue per-signer tokens and require an emailed one-time code; freeze `blocks` on completion and store an immutable signed snapshot row; verify `doc_hash` on read; and expand the consent copy to a compliant ESIGN §101(c) disclosure.

### Bugs, security weaknesses and architectural smells

Flagged, not fixed.

1. **Multi-party signing is dead** (`:1043` vs `:1052-1054`). The second signer of any document is refused. Sold on the landing page and in the in-app help.
2. **A binned document is still publicly signable.** `loadByToken()` (`:1006`) does not filter `is_deleted`. "Deleting" a contract in the UI removes it from the list and leaves the signing link live — and signing it will still fire the invoice/project/pipeline automations.
3. **Expiry is not enforced at signing.** `POST .../sign` checks only `voided`/`signed`/`completed`. An expired or `declined` document can still be signed by anyone with the link.
4. **Signing IP is attacker-controlled** (`:117` + `DEPLOYMENT.md:479`) — see above.
5. **Revenue vs invoice divergence.** `totals.total` is never recomputed from the client's selection (`:1055`), so Overview, Analytics and Vault report a different number from the invoice actually raised.
6. **Bulk send bypasses the paid meter.** `POST /api/cs/bulk-send` (`:775`) inserts documents with `status='sent'` and `sent_at` set, without ever calling `pricing.canCreate(..., 'contract_sends')` — the exact metric the pricing page bills. It also writes no `logAudit` row.
7. **A completed contract remains editable.** `PUT /api/cs/documents/:id` (`:568`) has no status guard.
8. **Self-approval.** `decide-approval` (`:626`) accepts any authenticated workspace member, including the author, and the UI ships a one-click "Approve now" button.
9. **Unauthenticated, unmetered LLM endpoint.** `POST /api/cs/public/:token/ask` (`:1095`) calls `ai.callLLM` for anyone holding a link, throttled only by the global 500-req/15-min per-IP limiter (`server.js:82`). It passes no `ctx`, so `recordAiUsage` (`server.js:4034`) files the spend under `workspace_id = null` — the same is true of the authenticated `/api/cs/ai/assist`. **All Contracts Studio AI cost is invisible to Command Center metering and to plan enforcement.**
10. **Unrestricted upload type.** `csUpload` (`:122-128`) sets a 50 MB limit and no `fileFilter`. Uploads land in `uploads/cs/` and are served by `express.static` with `Access-Control-Allow-Origin: *` and helmet's CSP disabled (`server.js:74-78, 117-121`). An uploaded `.html`/`.svg` is stored XSS on the API origin. Filenames are `{Date.now()}-{6 hex}-{name}` — only ~24 bits of entropy beyond a millisecond timestamp, materially weaker than the UUID used for document ids.
11. **Signed PDFs and attachments are unauthenticated static files** with no expiry, and the certificate page inside them prints every signer's IP address — so anyone who obtains the URL obtains the audit trail.
12. **The client portal leaks binned contracts.** `server.js:6325` lists `cs_documents` for a lead with no `is_deleted` filter and hands over each document's `token`. `GET /api/cs/vault` (`:935`) and `GET /api/cs/analytics` (`:909`) likewise ignore the bin flag, unlike `/documents` and `/overview`.
13. **Dead columns and dead states.** `cs_signers.token`, `cs_signers.mode`, `cs_approvals.sign_order` are written or declared and never read; `status = 'voided'` is guarded three times and set nowhere.
14. **Stored settings that do nothing.** `cs_settings.settings.sender_name` and `.default_theme` are written by the settings page and read by no code — outgoing mail always uses `smtpRow.from_name || 'WappFlow'` (`server.js:6424`), and new documents always start `monochrome` (`:541`). Only `default_expire_days` is actually honoured, and only by the frontend.
15. **Timezone-naive expiry comparison.** `new Date(d.expires_at) < new Date()` (`:1012`) parses a space-separated UTC timestamp as local time; the cron sweep uses SQL `CURRENT_TIMESTAMP` (UTC). The two disagree by the server's UTC offset.
16. **Auto-reminder bookkeeping by string match.** `meta LIKE '%"auto":true%'` (`:464`) counts prior reminders by pattern-matching a JSON blob.
17. **Fragile optional dependencies.** `pdfkit`, `node-cron`, `pricing` and `ai-engine` are all wrapped in silent `try/catch` requires; missing any of them removes a headline feature with no log, no alert and no user-visible error.
18. **Two decorative blocks.** `signature` and `approval` render UI that does nothing (`blocks.js:258-277`) — the client can click "Approve" and nothing happens.
19. **Fan-out of status vocabulary.** Document status labels are re-declared independently in `contracts/page.js:13`, `contracts/vault/page.js:9` and `contracts/[id]/page.js:266`, with different colours and wording for the same key — precisely the pattern the design-system work (PROP-002 registries) was meant to eliminate.

### Where the repo's own docs disagree with the code

- `CONTRACTS-STUDIO-DESIGN.md:51` lists `approved` as a document status. The code uses `pending_approval` and never writes `approved` to `cs_documents`.
- `CONTRACTS-STUDIO-DESIGN.md:15` lists eight studio sections (Contracts · Templates · Approvals · Signatures · Proposals · Client Vault · Analytics · Settings). Three routes exist.
- `CONTRACTS-STUDIO-DESIGN.md:25` promises draw / type / **upload** signatures and initials. Only draw exists, and it is mandatory.
- `CONTRACTS-STUDIO-DESIGN.md:37` promises payments (deposit / milestone / full / plan / retainer). Only deposit alters anything, and no payment is ever collectable from the document.
- `contracts/help/page.js:51` and `app/page.js:1161` both advertise working multi-party signing. It does not work.
- `app/page.js:1959` sells "redline" as a Studio-tier feature. There is no redline code.
- `contracts/page.js:117` tells the user deletion is permanent. It is a soft-delete, and the signing link survives it.

### UNKNOWNs

- **UNKNOWN: whether any of this has been exercised against production data.** `backend/test-phase7-contract-chain-e2e.js` covers the sign → invoice/project/booking chain against a scratch server, but it forces `status='sent'` and the token directly in SQLite (`:66`) and uses a single signer, so it would not detect the multi-party break. No test covers expiry, the bin, approvals or the PDF.
- **UNKNOWN: whether `pdfkit` is installed in production.** It is required lazily inside `generateSignedPdf` (`:400`) and I did not verify the deployed `package.json`/`node_modules`; if absent, every completed document silently has no signed record.
- **UNKNOWN: the real-world reliability of email delivery.** `sendEmail` builds a fresh nodemailer transport per message from the owner's `email_smtp_settings` row and returns `{skipped:true}` when unconfigured; the send route records `delivery.email = 'no_email'` or `'failed'` but nothing retries or alerts.
- **UNKNOWN: whether `settings.upload` files are ever included in the legal record.** The signed PDF names the attachment (`:415`) but does not embed it; whether the uploaded original is retained beyond the uploads directory's own lifecycle is a storage question outside this module.
- **UNKNOWN: the intended semantics of `cs_documents.type = 'hybrid'`.** Declared in the schema comment (`:136`) and offered nowhere in the UI's type list (`contracts/page.js:12`).


---


<!-- ── 08-booking-scheduling.md ─────────────────────────────────────────── -->

## Booking, scheduling and calendar

> **Reading note.** Every claim below is read from the code, not from the repo's own documents; where a document disagrees, the code wins and the disagreement is called out explicitly. `backend/booking.js`, `backend/availability.js`, `backend/studio-time.js` and `wappflow-web/src/lib/datetime.js` were being actively rewritten *while this section was written* — a timezone-correctness fix the code calls "Phase 9 (audit gap-4)" landed mid-read. Everything here is verified against the files as they stood at **2026-08-24 ~04:12 local**, with mtimes cited where the state is fresh. `backend/server.js` is ~6,470 lines and its line numbers drift with every edit.

### What this part of the product is for

WappFlow is a business operating system for photography and video studios. This part of it answers one question: *when is the studio busy, and how does a client get onto that calendar without a phone call?*

It is two features that were retrofitted to share one definition of "busy":

1. **Public self-booking** ("Booking"). The studio configures the sessions it sells, the hours it works, and any questions it wants answered up front. It gets a public link — `/book/<slug>` — for its Instagram bio. A stranger picks a service, a day and a time, leaves a name and a phone number, and is booked. The booking lands in the CRM as a **lead** (an unconverted contact record), plus a reminder, a timeline entry, a workspace notification and a WhatsApp confirmation. The client keeps a secret link they can use to move or cancel the appointment themselves.
2. **Internal meetings.** From inside a lead's profile a studio member schedules a Google Meet call with that lead: a real Google Calendar event with a video link, optionally emailing the lead an invite. No public surface, no self-service.

They remain distinct flows with distinct tables and distinct UI. The only thing they share is `backend/availability.js`, whose entire purpose is that a client can no longer self-book the exact hour the studio blocked for an internal call.

### Data model

| Table | Owner | Key columns | Notes |
|---|---|---|---|
| `booking_settings` | `booking.js:35-40` (created at mount) | `workspace_id` PK, `slug` UNIQUE, `settings` TEXT (JSON), `updated_at` | One row per workspace. `slug` is the public URL segment. The whole configuration is a JSON blob; only `timezone` is validated. |
| `bookings` | `booking.js:41-52` | `id` PK, `workspace_id`, `lead_id`, `service`, `start_at` TEXT, `duration_min`, `name`, `phone`, `email`, `notes`, `status` (`'confirmed'` → `'cancelled'`), `is_deleted`/`deleted_at`/`deleted_by`, `created_at` | Plus idempotent `ALTER`-added columns (`booking.js:62,66`): `token`, `intake` (JSON answers), `project_id`, `invoice_id`, `calendar_event_id`, `calendar_html_link`. Indexes `idx_bookings_ws`, `idx_bookings_lead`, `idx_bookings_ws_deleted`, declared in the module that owns the table so a fresh install cannot race the central index list. |
| `meetings` | `server.js:852-867` | `id` PK, `workspace_id`, `lead_id`, `user_id`, `provider` (`'google'`), `title`, `starts_at`, `ends_at`, `meet_link`, `event_id`, `html_link`, `notes`, `status` (`'scheduled'`), `created_at` | No indexes. `status` is written once and never updated by any code path. |
| `workspace_integrations` | `server.js:843-850` | `workspace_id` PK, `calendly_url`, `google_calendar_refresh_token`, `google_calendar_email`, `google_calendar_connected_at`, `updated_at` | The Google refresh token is stored **in plaintext** (`readIntegrations`, `server.js:5907`). |

`bookings.start_at` and `meetings.starts_at` deliberately store **different kinds of thing** — see "The timezone situation", which is the single most important subsection here.

### Configuration: settings, slug and services

`GET`/`PUT /api/booking/settings` (`booking.js:204`, `:210`) read and write the JSON blob merged over defaults at `booking.js:69-77`:

- `services`: `[{ name, duration (minutes), price, creates_shoot }]`. Default: one 30-minute "Consultation".
- `availability`: `{ 0..6: [startHour, endHour] }` keyed by JS day-of-week (0 = Sunday). Default Mon–Fri 9–17.
- `slot_min` (30) — the grid offered times sit on; `days_ahead` (21) — how far forward to offer.
- `buffer_min` (0) — dead time enforced after every appointment.
- `blackout`: `['YYYY-MM-DD', …]` closed days.
- `intake`: `[{ label, required }]` — free-text questions on the public form.
- `timezone`: an **IANA zone name**. Since the Phase 9 change it is load-bearing rather than decorative, and `PUT` now **rejects an unusable value with 400** (`booking.js:217-219`, via `studioTime.isValidZone`). The admin UI offers a populated `<select>` built from `Intl.supportedValuesOf('timeZone')` with the viewer's own zone first (`app/bookings/page.js:15-22`), replacing what was a free-text input.

The **slug** is derived once from the studio's `company_name` via `slugify()` (`booking.js:99`) and de-duplicated with a random 2-byte suffix on collision (`booking.js:222-223`). After the first save it can never change: `let slug = (cur && cur.slug) || slugify(...)` (`booking.js:220`) ignores any `slug` a caller later sends, and the admin page never sends one (`app/bookings/page.js:72`).

`creates_shoot` is the one flag on a service that changes what a booking *does*: when set, a successful public booking immediately creates a Media Studio project (a "shoot" — the container for a session's photographs) linked to the same lead (`booking.js:363-371`). It is opt-in on purpose so a 15-minute discovery call does not manufacture a shoot.

### Slot computation

`computeSlots(ws, cfg, serviceDuration)` (`booking.js:135-160`) walks forward `days_ahead` days from the studio's *own* today, skips blackout dates and days with no configured hours, then steps across the day's open window in `slot_min` increments, emitting a slot only if the whole service duration fits before closing, the slot is at least an hour away (`LEAD_MS`, `booking.js:101`), and it does not overlap anything in the shared busy calendar including the buffer.

The day loop is now deliberately Date-object-free: `addDays`/`dowOf` (`booking.js:118-127`) do calendar arithmetic on the `'YYYY-MM-DD'` string via `Date.UTC`, and "today" comes from `studioTime.msToWallClock(Date.now(), tz)` (`booking.js:142`) rather than the server's `new Date()`. Each candidate is converted to a true instant with `wallClockToMs` before any comparison. Output shape: `[{ date: 'YYYY-MM-DD', times: ['YYYY-MM-DD HH:MM:SS', …] }]`.

**A live gap that survived the fix:** the public listing endpoint still calls `computeSlots(row.workspace_id, cfg)` with **no service duration** (`booking.js:314`), so `dur` falls back to `slot_min`. One slot list is computed for the page and reused whichever service the visitor clicks (`app/book/[slug]/page.js:32` reads `data.slots` once and never refetches). A 90-minute wedding session is therefore *offered* on the 30-minute grid. The write guard now uses the real service duration, so the booking will be **refused** rather than silently overbooked — but the client is shown times that cannot be booked and gets an error on submit. The manage/reschedule endpoint does not have this problem; it passes `b.duration_min` (`booking.js:403`).

### The public booking flow

`POST /api/booking/public/:slug` (`booking.js:318`), unauthenticated:

1. Resolve the workspace from the slug; 404 if unknown.
2. Require `start_at`, and a name plus a phone **or** an email (`booking.js:324-325`).
3. Enforce `required` intake questions (`booking.js:327`).
4. Resolve the service by name, falling back to the first configured service (`booking.js:328`).
5. **Open a transaction** (`booking.js:336`) and inside it: run `slotProblem()`; **find-or-create the lead** — match on `customer_phone`, then `email`, within the workspace, else insert with `status='New'` and `first_message='Booked: <service>'` (`booking.js:341-347`), owned by the workspace's `super_admin` (`owner()`, `booking.js:78`); insert the booking with a 24-hex-char `token` from `crypto.randomBytes(12)`.
6. Insert a `reminders` row writing **both** `due_date` and `reminder_date` — the reminder cron fires on `reminder_date` only (`booking.js:357`).
7. Write a `booking`-typed activity entry via `addContactHistory` (`server.js:1204`), which double-writes to `contact_history` *and* the unified `activity_timeline` spine.
8. Send a WhatsApp confirmation containing the manage link — **only if the lead has a phone number** (`booking.js:359`).
9. If `creates_shoot`, create the Media Studio project (`booking.js:363-371`).
10. Best-effort push to Google Calendar (`booking.js:374-386`); a failure is `console.warn`ed and swallowed so a client's booking never fails on it.
11. Broadcast SSE `booking_created` and raise a workspace notification (`booking.js:387-388`).
12. Respond with `manage_url` and `next` — `journeyLinks()` (`public-brand.js:106-121`) returns the client's portal link and the booking link so the success screen is not a dead end.

The public GET (`booking.js:309`) returns `{ brand, services, slots, intake, timezone }`. `brand` comes from `publicBrand()` (`public-brand.js:55`), the single resolver every public surface uses; it deliberately carries no ids or counts because a capability token is the only credential on those pages, and it validates `brand_accent` against a hex pattern (`public-brand.js:42-45`) because that value is interpolated into inline CSS on a page a stranger can reach.

`app/book/[slug]/layout.js:14` marks this the **one** client-facing surface set `robots: { index: true, follow: true }`; the token pages are not indexable.

### The shared busy calendar and the double-booking guard

`backend/availability.js` is the single answer to "is this time taken?". `busyIntervals(db, workspaceId, opts)` returns `[[startMs, endMs], …]` merging two sources: non-cancelled, non-binned `bookings` from the last day forward extended by `duration_min` plus `bufferMin`; and all `meetings` from the last day forward using `ends_at` when sane and a default duration otherwise. It accepts `excludeBookingId`/`excludeMeetingId` so a row does not clash with itself on reschedule, and `timeZone` so the two stamp shapes land on the same scale. `clashes(busy, s, e)` is a half-open overlap test (`s < be && e > bs`), so abutting appointments are legal. Unparseable timestamps are dropped rather than treated as busy at epoch zero. `backend/test-phase6-scheduling.js` exercises all of this against a real in-memory SQLite database, including cross-workspace leakage, buffers, and the "both callers actually use it" assertions.

**The write guard, as of the Phase 9 change**, is `slotProblem(ws, cfg, startStamp, serviceDuration, excludeBookingId)` (`booking.js:177-201`). It returns `null` or a human sentence, and checks: parseable time; at least `LEAD_MS` in the future; not a blackout date; the day is open; the whole duration fits inside opening hours; and no interval overlap against the shared busy calendar with the buffer applied. It is called from create (`booking.js:337`) and reschedule (`booking.js:414`), each **inside a `db.transaction`** that checks and claims atomically — the comment at `booking.js:332-334` names the race the old code left open.

What this replaced is worth recording, because it is exactly the class of defect a planner should expect elsewhere in this codebase: until minutes before this was written, both guards were `WHERE start_at = ?` — exact string equality. A four-hour session at 09:00 did not collide with a session at 10:00; a booking never collided with an internal meeting at all; and nothing checked that the submitted `start_at` had ever been *offered*, so any string (3 a.m., a blackout date, a closed Sunday) was accepted. The 409 message *"That time was just taken"* asserted a guarantee the query could not make.

### Self-serve reschedule and cancel

Three unauthenticated token routes (`booking.js:397`, `:406`, `:445`). `GET /api/booking/manage/:token` returns the brand, a slim booking summary, a fresh slot list computed with the booking's own duration, and the studio timezone. Reschedule runs `slotProblem` (excluding this booking) inside a transaction, updates `start_at`, forces `status` back to `'confirmed'`, moves the Google event, writes history, WhatsApps the client the new time, broadcasts `booking_updated` and notifies the studio. Cancel flips `status` to `'cancelled'`, deletes the Google event and nulls the stored event ids, messages the client, broadcasts `booking_cancelled` and notifies.

Both are guarded only by the 24-hex token, which is the right design for a login-less client link (96 bits). The frontend requires the client to type `CANCEL` before cancelling (`app/booking/manage/[token]/page.js:35`).

### The studio-side console

`/bookings` (`app/bookings/page.js`) is one page carrying both configuration and the booking list: services (including the "Is a shoot" checkbox), weekly availability, buffer, timezone select, blackout dates, intake questions, then the public link with copy/open affordances. The list subscribes to SSE — `useRealtime(['booking_created','booking_updated','booking_cancelled'])` (`app/bookings/page.js:69`) — so bookings taken while the page is open appear live. Each row offers **Shoot**, **Invoice**, an **open on Google Calendar** link when one exists, **Cancel**, and **Open lead →**.

Two honest weaknesses remain. The list is headed "Upcoming" but the query is `ORDER BY start_at DESC LIMIT 200` with **no date floor** (`booking.js:233`), so past bookings sort to the top. And there is no studio-side *reschedule*: the owner can cancel, but moving an appointment is only possible through the client's own token link.

### Handoffs into the rest of the OS

`POST /api/booking/:id/handoff` with `{ target: 'shoot' | 'invoice' }` (`booking.js:243-281`). Both go through the same shared creators the rest of the app uses — `mediaStudioApi.createProject` (`media-studio.js:432`) and `createInvoiceForLead` (`server.js:2580`) — so a shoot booked from the calendar is not a second kind of shoot. The resulting id is written back onto the booking (`project_id`/`invoice_id`), making the handoff idempotent: a second click opens the first record rather than creating a duplicate.

The invoice handoff is **PARTIAL in a way worth planning around**: it creates one line item at `rate: 0, amount: 0`, with subtotal, tax, discount and total all zero (`booking.js:270-271`). The service's configured `price` — displayed to the client on the public page — is never stored on the booking row (there is no price column) and never reaches the invoice. Nothing anywhere collects a deposit at booking time; `payments.js:62` names `booking` as a payment `kind` in a schema comment, but no code path creates one.

### Internal meetings and the Google Calendar integration

**OAuth.** `POST /api/integrations/google-calendar/connect` (`server.js:6107`) exchanges a popup-flow authorization code (`redirect_uri: 'postmessage'`) for a refresh token, decodes the `id_token` for the account email, and stores both; it refuses when Google returns no refresh token, with instructions to revoke and retry. `DELETE /api/integrations/google-calendar` (`server.js:6142`) clears the row. `GET /api/integrations/status` (`server.js:6072`) reports `googleCalendar.{connected,email,connected_at,configured}` and `calendly.{configured,url}`.

**Event helpers** (`server.js:5981`, `:6010`, `:6024`) create, PATCH and DELETE against `calendars/primary/events`, with `conferenceDataVersion=1` and `sendUpdates=all` when a Meet link is wanted. Delete tolerates 404/410 as already-gone.

**Meetings.** `POST /api/leads/:leadId/meetings` (`server.js:6160`) validates the lead through `getScopedLead`, refuses any provider but `google`, checks the shared busy calendar (409 on clash, `server.js:6176-6183`), refreshes the access token, creates the event with `timezone: 'UTC'` hardcoded (`server.js:6203`, comment: *"could store per-workspace tz"*), extracts the Meet link, inserts the `meetings` row and writes a `meeting_scheduled` activity entry. `GET /api/leads/:leadId/meetings` (`server.js:6240`) lists them. **There is no update, cancel or delete route** — a meeting created by mistake stays in the busy calendar forever with no UI to remove it, and a Google-side cancellation never syncs back (no watch channel, no webhook).

**Calendly** is a stored URL only (`PUT /api/integrations/calendly`, `server.js:6093`, validated against `https://calendly.com/`). The UI sends it to a lead as a WhatsApp message (`components/ScheduleMeetingModal.js:92-107`). No availability, no booking data, no callback.

**`bookingCalendar`** (`server.js:6041-6067`) is the seam booking uses. `create`/`move`/`remove` each return `null` immediately unless a timezone is supplied, and again unless the workspace has a refresh token. Public-booking events are created with `withMeet: false` — a portrait session needs no video link.

### The timezone situation

This is the sharpest correctness hazard in the module. It was, until this week, a live defect; a fix has just landed on the booking side and **not** on the meetings side.

**Two timestamp shapes, one number line.**

- `bookings.start_at` is a **naive wall-clock string**, `'YYYY-MM-DD HH:MM:SS'`, no zone. It means "2 p.m. *at the studio*". The reasoning is written out at `studio-time.js:19-31`: an appointment is a wall-clock commitment, so a government changing its DST rules must not move a real shoot; and converting the existing rows to instants would mean *guessing* the zone of every booking already taken, which has no safe migration.
- `meetings.starts_at` is a **true ISO instant** (`…T…Z`). Its only writer is `ScheduleMeetingModal.js:61-67`, which builds a `Date` from the admin's browser-local inputs and calls `.toISOString()`.
- `availability.busyIntervals` merges both onto one millisecond scale.

**The defect.** `availability.toMs` was a bare `Date.parse`, which reads a zone-less string as **server-local** and an ISO string as a true instant. When the Node process's zone was not the studio's wall clock, every booking sat the studio's entire UTC offset away from every meeting — five hours for Karachi — and the double-booking guard, the slot list and the calendar push all read that skewed calendar (`studio-time.js:5-17` states this precisely).

**The fix, `backend/studio-time.js`** (137 lines, unit-tested by `backend/test-phase9-studio-time.js`): `wallClockToMs(stamp, tz)` passes anything already carrying a zone straight through as an instant, and converts a naive stamp by computing the zone's offset *at that instant* through `Intl.DateTimeFormat` — applied twice, because near a DST jump the first correction can land on the other side of the transition (`studio-time.js:78-82`). `msToWallClock` is the inverse. `formatStudioTime` renders a stamp in the studio's zone regardless of where the code is running. **With no configured zone everything falls back to UTC**, which is what a UTC box already did, so an unconfigured studio sees no behaviour change and a configured one becomes correct.

**What is now wired up:** `availability.js` takes `opts.timeZone`; `computeSlots` and `slotProblem` both pass it (`booking.js:137,193`); `PUT /api/booking/settings` rejects an invalid zone; `GET /api/booking/list` and the two public GETs return the zone so the frontend can label times; and every server-side rendering of a booking time — the WhatsApp confirmation, the reschedule message, the notification body, the contact-history line — now uses `formatStudioTime` instead of `new Date(stamp.replace(' ','T')).toLocaleString()`, which had been rendering in the *server's* zone and texting clients times offset by the studio's own UTC offset (`booking.js:358,359,388,433,435,439`).

**What is still wrong, right now:**

- **The meetings route was not migrated.** `server.js:6176-6179` still calls `availability.toMs(starts_at)` and `busyIntervals(db, req.workspaceId, { defaultDurationMin: 30 })` with **no `timeZone`**. The ISO meeting stamps are fine either way, but the booking wall-clocks in that call are read as UTC. So for a studio that *has* configured a non-UTC zone, the two directions now disagree: the public booker checks meetings correctly, while creating a meeting checks bookings offset by the studio's UTC offset. The asymmetry is new and is a direct consequence of a half-applied fix.
- **Silent Google Calendar no-op.** `bookingCalendar.create`/`move` return `null` when no timezone is set (`server.js:6043`, `:6054`). The rationale is sound and stated at `server.js:6037-6040` — *"a missing event is recoverable; a calendar full of events at the wrong hour is not"* — and `calTime` (`server.js:5970-5983`) implements the other half by passing a naive stamp through as `{dateTime, timeZone}` rather than through `toISOString()`. But a studio that connects Google Calendar and leaves the zone blank gets **no events at all**, with nothing logged, no error and no UI hint: `create` returns `null` and the `if (ev)` at `booking.js:384` simply skips the write.
- **`now`-relative SQL still mixes frames.** The analytics "upcoming bookings" count compares the naive `start_at` against SQLite's UTC `datetime('now')` (`server.js:2844-2845`), as does the `-1 day` window inside `busyIntervals` (`availability.js:55`). The one-day slack absorbs the second; the first is off by the studio's offset.
- **The two public client pages are only half migrated** (both mtime 04:13). The summary lines now use `formatAppointment` plus a `zoneLabel` suffix — the booking-confirmed screen (`app/book/[slug]/page.js:51-52`) and the manage card (`app/booking/manage/[token]/page.js:18,61`) — while the day and time *buttons* still hand-roll `new Date(s.replace(' ','T')).toLocale*` (`fmtDate`/`fmtTime`, `app/book/[slug]/page.js:13-14`). Worth being precise, because the new helper's own comment (`lib/datetime.js:112-116`) overstates the problem: parsing a zone-less string as browser-local and then formatting in browser-local is an **identity** — the reader sees the stored digits, i.e. the studio's clock, wherever they are. What the un-migrated call sites actually lack is the zone *label* and robustness against anyone later routing them through a helper that appends `Z`. `formatAppointment` (`lib/datetime.js:120`) reaches the same output deliberately: read the digits as UTC, format as UTC, append `zoneLabel()`.

`addMinutes` (`booking.js:90-97`) deserves a mention as the pattern to copy: it computes a booking's end time by doing its own UTC arithmetic on the naive string, precisely so a `new Date()` round-trip cannot shift it.

### Endpoint inventory

| Method | Path | Auth | Source | Purpose |
|---|---|---|---|---|
| GET | `/api/booking/settings` | JWT | `booking.js:204` | Settings + slug + public URL |
| PUT | `/api/booking/settings` | JWT | `booking.js:210` | Save settings; mints slug on first save; 400 on an invalid IANA zone |
| GET | `/api/booking/list` | JWT | `booking.js:231` | Non-cancelled bookings, `start_at DESC`, LIMIT 200, plus `timezone` |
| POST | `/api/booking/:id/handoff` | JWT | `booking.js:243` | `target: shoot \| invoice`; idempotent |
| POST | `/api/booking/:id/cancel` | JWT | `booking.js:283` | Studio-side cancel + calendar remove + client message |
| GET | `/api/booking/public/:slug` | none | `booking.js:309` | Brand, services, slots, intake, timezone |
| POST | `/api/booking/public/:slug` | none | `booking.js:318` | Take a booking (transactional check-and-claim) |
| GET | `/api/booking/manage/:token` | token | `booking.js:397` | Booking summary + fresh slots + timezone |
| POST | `/api/booking/manage/:token/reschedule` | token | `booking.js:406` | Move it (transactional) |
| POST | `/api/booking/manage/:token/cancel` | token | `booking.js:445` | Cancel it |
| GET | `/api/integrations/status` | JWT | `server.js:6072` | Google + Calendly connection state |
| PUT | `/api/integrations/calendly` | JWT | `server.js:6093` | Store a Calendly URL |
| POST | `/api/integrations/google-calendar/connect` | JWT | `server.js:6107` | OAuth code → refresh token |
| DELETE | `/api/integrations/google-calendar` | JWT | `server.js:6142` | Disconnect |
| POST | `/api/leads/:leadId/meetings` | JWT | `server.js:6160` | Create Google Meet event + row |
| GET | `/api/leads/:leadId/meetings` | JWT | `server.js:6240` | List a lead's meetings |

SSE events broadcast to the workspace: `booking_created`, `booking_updated`, `booking_cancelled`, plus a `notification` frame from `notify()` (`server.js:1072`). Frames are unnamed on the wire; the category travels in the payload as `kind`, because `type` is the SSE event name.

### Configuration and gating

**Env vars.** `FRONTEND_URL` becomes `clientBaseUrl`; every public and manage link is built from it, so an empty value yields relative, unusable links in WhatsApp messages. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (`server.js:182`, `:5904`) — both required or the OAuth exchange throws. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on the frontend. `backend/.env.example` lists `GOOGLE_CLIENT_ID` only.

**Entitlements.** `booking: true` on every plan (`entitlements.js:31`) — it is a core module. The module gate at `server.js:6259` maps `/api/booking/` to the `booking` feature key and exempts `/api/booking/(public|manage)` so client links never break when a workspace is disabled. `google_calendar` and `calendly` are **false on Creator** and true from Studio up (`entitlements.js:75`). That gate is enforced **only in the UI** (`app/settings/page.js`, `PlanLockBadge` plus disabled buttons); no `/api/integrations/*` route consults entitlements.

### Cross-module touchpoints

Bookings appear in global search (`search.js:73-79`, filters `is_deleted`, returns cancelled rows), the offline desktop sync delta (`sync.js:46`), saved views (`saved-views.js:22`), Comms project rooms (`comms.js:573`), the workspace JSON export (`server.js:2993`), the analytics tile "Upcoming Bookings" (`server.js:2844`, rendered at `app/reports/page.js:373`), and Command Center metering and per-workspace counts (`cc-metering.js:29,57`; `command-center.js:300,371,758`). The lead activity timeline renders `booking` with its own Calendar icon and colour (`app/leads/[id]/page.js:2627,2636`). Contracts Studio has a post-signature automation that WhatsApps the booking link (`contracts-studio.js:339-352`), and `journeyLinks` offers it from every public success screen.

Bookings are registered in the recycle bin with 90-day retention (`soft-delete.js:32`) and counted by the lead-deletion guard (`soft-delete.js:130`), but **no code anywhere sets `bookings.is_deleted = 1`** outside tests — bin plumbing with no producer.

### Maturity ledger

| Capability | Status | Gap |
|---|---|---|
| Public booking page, services, weekly hours, buffers, blackout, intake | **SHIPPED** | — |
| Find-or-create lead, reminder, timeline entry, notification | **SHIPPED** | — |
| Self-serve reschedule / cancel by token | **SHIPPED** | — |
| Handoff → Media Studio shoot; `creates_shoot` auto-project | **SHIPPED** | — |
| Interval double-booking guard (overlap, hours, blackout, lead time, transactional) | **SHIPPED** (landed 2026-08-24) | Booking side only; see meetings row |
| Studio-zone slot generation and server-side time formatting | **SHIPPED** (landed 2026-08-24) | Falls back to UTC when unconfigured |
| WhatsApp confirmation / reschedule / cancel messages | **PARTIAL** | Fires only when the lead has a phone; the success screen unconditionally claims "A confirmation has been sent" (`app/book/[slug]/page.js:50`). No email path exists — `booking.js` is never given a `sendEmail` dep. |
| Per-service duration in public slots | **PARTIAL** | Public GET omits the duration; long services are offered on the short grid and then refused at submit. |
| Handoff → invoice | **PARTIAL** | Always zero-value; the service `price` never travels. |
| Google Calendar push for bookings | **PARTIAL** | Silently disabled without a configured zone; failures only `console.warn`. |
| Shared busy calendar from the meetings side | **PARTIAL** | `server.js:6179` never passes `timeZone`; half-migrated. |
| Google Meet meetings from a lead | **PARTIAL** | Create + list only. No cancel, move or delete; `status` never changes; no sync back from Google. |
| Calendly | **PARTIAL** | A stored URL sent as a message. No availability or booking data. |
| Booking deposits / payment at booking | **SOLD-NOT-BUILT** | `services[].price` is shown to the client as `$X` (`app/book/[slug]/page.js:75`) and `payments.js:62` names a `booking` kind; nothing charges anything. |
| Studio-side reschedule | **SOLD-NOT-BUILT** | No route, no UI. |
| Recycle bin for bookings | **SOLD-NOT-BUILT** | Registered, swept, guarded — but nothing sets the flag. |
| `.ics` / add-to-calendar for the client | **SOLD-NOT-BUILT** | No code. |
| Booking analytics (no-show, conversion, popular service) | **SOLD-NOT-BUILT** | Only a raw "upcoming" count. |
| Audit logging of booking actions | **SOLD-NOT-BUILT** | `booking.js` is never given `logAudit`; create/cancel/reschedule/handoff are untracked, unlike Contracts Studio. |

### Bugs, security weaknesses, data-integrity risks and smells

1. **Half-migrated busy calendar.** `server.js:6176-6179` (meeting creation) does not pass `timeZone` to `availability`, while `booking.js` now does. For a studio with a configured non-UTC zone the two guards disagree by that offset, so a meeting can be booked on top of an existing booking even though the reverse is now correctly prevented.
2. **Offered-but-unbookable slots.** The public GET's missing service duration (`booking.js:314`) means the client is shown times the write guard will reject. Not a data-integrity risk any more, but a conversion-killing UX defect on exactly the surface that is meant to convert strangers.
3. **Silent Google Calendar no-op** when no timezone is configured. No log, no error, no UI hint.
4. **`now`-relative SQL mixes frames** (`server.js:2845`, `availability.js:55`), comparing naive wall-clock strings against SQLite's UTC `datetime('now')`.
5. **Booking-created reminders and the reminder cron.** `booking.js:357` stores the naive stamp in `reminder_date`; the cron (`server.js:3957-3967`) selects `WHERE reminder_date <= ?` binding `new Date().toISOString()`. That is a *string* comparison between `'2026-08-24 23:00:00'` and `'2026-08-24T09:00:30.000Z'`; because `' '` (0x20) sorts before `'T'` (0x54) under SQLite's default BINARY collation, any same-date naive stamp compares as already due. The only effective constraint is the `datetime(?, '-2 minutes')` lower bound, and the cron never marks a reminder complete — so a booking reminder for later today can fire hours early and repeat every minute. (Mechanism read from the code and SQLite's collation rules; not observed running.)
6. **Authorization is coarse.** Every `/api/booking/*` admin route uses bare `auth`. There is no `requirePermission` helper anywhere in `server.js`. A member with the `user` role — defaults `manage_settings: false`, `view_all_leads: false` (`server.js:189`) — can rewrite the public booking page, change the studio's opening hours, and read every booking's name, phone, email and intake answers, bypassing the lead-visibility scoping the Leads list enforces.
7. **`GET /api/leads/:leadId/meetings` does not scope the lead** (`server.js:6240`): it queries by `workspace_id + lead_id` without `getScopedLead`, unlike the POST on the same resource. Any member can list any lead's meetings.
8. **Plaintext OAuth refresh token** in `workspace_integrations.google_calendar_refresh_token` (`server.js:846`). A database read is a persistent grant on the studio's Google Calendar.
9. **The `google_calendar`/`calendly` entitlement gate is UI-only.** No backend check on `/api/integrations/*`, so a Creator-plan workspace can connect Google Calendar by calling the API directly.
10. **Public-endpoint abuse surface.** The only protection on `POST /api/booking/public/:slug` is the global 500-requests-per-15-minutes-per-IP limiter (`server.js:82-92`). No CAPTCHA, honeypot, duplicate suppression or per-slug limit. Each accepted booking inserts a lead *and* sends a WhatsApp message from the studio's own account, so this is a data-pollution vector and a cost/reputation vector at once.
11. **Mostly-unvalidated settings blob.** `PUT /api/booking/settings` merges `req.body.settings` wholesale; only `timezone` is checked. `days_ahead`, `slot_min` and the hour pairs are unbounded server-side, and a large `days_ahead` makes every public page load an expensive loop that now also runs `wallClockToMs` (an `Intl.DateTimeFormat` construction) per candidate slot.
12. **Meetings are immortal.** No cancel/delete route; `meetings.status` is written `'scheduled'` and never changed; `busyIntervals` therefore treats a mistaken meeting as permanently busy with no way to release the slot.
13. **`is_deleted` plumbing with no producer** — a recycle bin that can never receive a booking, while `GET /api/booking/list` does not filter the flag it nonetheless has.
14. **Slug immutability is silent.** A studio that renames itself keeps the old public URL and is never told why.
15. **Hardcoded `$`** for the service price on the public page (`app/book/[slug]/page.js:75`) while the rest of the product resolves a per-workspace `currency_symbol`; the product's live pricing is in PKR.
16. **Dead / stale code:** a second, obsolete `PLAN_DEFINITIONS` (`free`/`starter`/`growth`/`enterprise`) at `server.js:5432` that nothing references — the live matrix is `creator`/`studio`/`studio_plus`/`enterprise` at `entitlements.js:94`; and an unused `HISTORY_ICONS`/`HISTORY_COLORS` map at `app/leads/[id]/page.js:1238-1239`, superseded by `TIMELINE_ICONS`.
17. **No audit trail** for any booking action.
18. **An overstated code comment.** `lib/datetime.js:112-116` claims the hand-rolled `new Date(s.replace(' ','T'))` pattern "silently shifts every appointment" for a reader outside the studio's zone. For the parse-local-then-format-local pattern actually used on the two public pages it does not — it is an identity. The comment is right about helpers that append `Z`; taken literally it would send someone hunting a bug that is not there.

### Where the repo's own documents disagree with the code

`PRODUCT-AUDIT.md` §"Booking & Scheduling" (lines 240–257, dated 2026-07-01) contains several findings that are now **fixed** — the code is the truth:

- *"no frontend subscribes to `booking_created`"* — fixed (`app/bookings/page.js:69`).
- *"the owner literally cannot cancel or reschedule"* — half fixed: cancel exists (`POST /api/booking/:id/cancel`, wired at `app/bookings/page.js:52`); studio-side reschedule still does not.
- *"no project is created or linked when a booking is made"*, *"no invoice/deposit handoff"* — the handoffs now exist, though the invoice is zero-value and no deposit is collected.
- *"bookings are not indexed in global search"* — fixed (`search.js:73`).
- *"`booking` is absent from `HISTORY_ICONS`"* — the timeline has a Calendar icon for it; the map the audit cites is now dead code.
- *"a clean ~212-line additive module"* — `booking.js` is now ~470 lines.
- *"per-service duration is dropped when computing public slots… and can be double-booked into the following slot"* — the double-booking half is fixed by `slotProblem`; the dropped-duration half is still true.

Still accurate: the "Upcoming" heading over a `DESC`, no-floor query; the unconditional "A confirmation has been sent" for email-only clients; no `.ics`; no booking analytics; no audit logging; no restore UI for cancelled bookings; and the observation that the two scheduling systems remain disjoint at the UX level even though they now share a busy calendar.

`PRODUCT-BIBLE.md:41` describes Booking as *"Public booking page → scheduling → manage/reschedule"* — accurate as far as it goes, and silent on everything in the ledger above. `booking.js:76` still carries a stale comment describing `timezone` as a *"display label … slots are studio-local"*; since the Phase 9 change that field is load-bearing and validated.

### UNKNOWN

- **UNKNOWN: the timezone of the production Node process.** This determined the real-world magnitude of the pre-fix defect and still governs item 4 above. `deploy.sh`, `backend/package.json`, `nixpacks.toml` and `.env.example` set no `TZ`, and no pm2 ecosystem file is present in the repo.
- **UNKNOWN: whether the Phase 9 edits are tested end-to-end or deployed.** `test-phase9-studio-time.js` unit-tests the helper only; there is no integration test covering `slotProblem` or the transactional claim. This checkout is not a git working tree, so no diff, branch or commit history was available — only file mtimes.
- **UNKNOWN: whether any live workspace has a `timezone` configured.** Behaviour still differs sharply between configured and unconfigured studios and cannot be determined from code.
- **UNKNOWN: real-world Google API behaviour.** No request logs or fixtures exist in the repo; every statement about what Google accepts is read from the request bodies the code constructs.
- **UNKNOWN: whether `POST /api/booking/public/:slug` is reachable cross-origin in production.** CORS is `origin: process.env.FRONTEND_URL || '*'` (`server.js:107`), which would block an embedded or white-label booking page served from another domain; whether that is intended was not determinable.


---


<!-- ── 09-money.md ─────────────────────────────────────────── -->

## Invoices, payments, the print store and the money ledger

### What this part of the product is for

WappFlow is a CRM and delivery platform for small creative studios (photographers, videographers,
event shooters). The "money" domain is the part that turns a conversation with a prospect into a bill,
gets that bill in front of the client, records when the client actually paid, and lets the studio sell
extra goods — prints, albums, digital files — off the back of work it has already delivered.

Four things live here, and they are deliberately layered:

1. **Invoices** — the *claim*. A row in `invoices` saying "you owe us this much, for these line items."
2. **The payments ledger** — the *cash truth*. A row in `payments` saying "this much money actually
   arrived, on this date, recorded by this person, through this provider." The ledger, not the invoice
   status, is what Analytics reports as revenue.
3. **The pay rail** — how a client hands money over. Either a Stripe Checkout session (code exists,
   **not configured in production**) or a manual "the studio marks it paid" fallback (what runs today).
4. **The print store** — a public catalogue attached to a delivered photo gallery, where a client can
   order prints; an order auto-raises an invoice and a pay link through the same shared creators.

There is a *fifth* money concept in the repo that is **not** this domain and should not be confused
with it: `backend/pricing.js` and `backend/entitlements.js` handle WappFlow's own subscription plans
(PKR-denominated Creator / Studio / Studio+ / Enterprise tiers). That is the studio paying *WappFlow*.
No code in the repo actually charges a workspace for its plan — plan state is set administratively.
Everything below is about the studio billing *its own clients*.

---

### 1. The invoice model

**Table `invoices`** (`backend/server.js:384-407`, plus later `safeAlter` columns):

| Column | Notes |
|---|---|
| `id` TEXT PK | app-generated |
| `user_id` TEXT | always the **workspace owner's** user id, not the acting member (`server.js:2600`) |
| `workspace_id` TEXT | added later by `safeAlter` (`server.js:717`) and backfilled from `users.workspace_id` (`server.js:722`) |
| `lead_id` TEXT | the CRM contact this bills; nullable |
| `invoice_number` TEXT NOT NULL | e.g. `INV-1001`; **no UNIQUE constraint** |
| `customer_name/_email/_phone/_address` | denormalised snapshot of the client at issue time |
| `items` TEXT (JSON) | array of `{description, qty, rate, amount}` |
| `subtotal`, `tax_rate`, `tax_amount`, `discount`, `total` REAL | all supplied by the client, never recomputed server-side |
| `currency`, `currency_symbol` | copied from `company_settings` at creation |
| `status` TEXT default `'draft'` | `draft` → `pending` → `paid`; `overdue` exists in the UI only |
| `due_date`, `notes`, `created_at` | |
| `is_deleted`, `deleted_at`, `deleted_by` | soft-delete columns added by `backend/soft-delete.js` |

Indexes: `idx_invoices_user`, `idx_invoices_lead`, `idx_invoices_ws`, `idx_invoices_ws_deleted`
(`server.js:885-903`).

**Numbering** is a per-workspace counter held on the owner's `company_settings` row
(`invoice_prefix TEXT DEFAULT 'INV'`, `invoice_counter INTEGER DEFAULT 1000` — `server.js:363-364`).
Creation reads the counter, adds one, formats `${prefix}-${counter}`, then writes the counter back
(`server.js:2588-2596`). The first invoice a studio issues is therefore `INV-1001`.

**Status semantics.** `draft` is the default. Emailing a draft flips it to `pending`
(`server.js:2716-2718`). `paid` is only ever written by `settle()` in the payments module
(`backend/payments.js:135`) — there is no other `UPDATE invoices SET status='paid'` anywhere in the
backend. `overdue` is a presentation key in `wappflow-web/src/lib/invoiceStatus.js:11` and a filter
button on the invoices page, but **no code ever sets it** — see the defects section.

**Soft delete is a hard guarantee.** `soft-delete.js:30` registers `invoices` with
`retentionDays: null`, and `purgeExpired()` skips any table with a null retention (`soft-delete.js:99-113`),
so a binned invoice is never swept on a timer. Permanently deleting a lead used to cascade
`DELETE FROM invoices WHERE lead_id` — it now refuses with HTTP 409 and names what is attached
(`server.js:2286-2292`, `soft-delete.js:117-143`). Emptying the whole lead trash applies the same guard
and reports skipped leads (`server.js:2233-2243`).

---

### 2. `createInvoiceForLead` — one creator, five callers

`createInvoiceForLead(req, body)` (`server.js:2580-2612`) is a plain function, not a route. It exists
because invoices are raised from five different places, and each of them previously hand-rolled its own
`INSERT` — with drifting results. The header comment at `server.js:2575-2579` says it plainly: a store
order that skipped the counter would hand two customers the same invoice number. The contracts module's
copy inserted **no `workspace_id` at all**, so contract-generated invoices landed with a null tenant
(`backend/contracts-studio.js:307-310`).

The function does five things no caller may skip: validates `lead_id` is in the caller's workspace via
`getScopedLead`, allocates the next number from the counter, inserts with both `user_id` (owner) and
`workspace_id`, writes a CRM timeline entry via `addContactHistory`, and writes an audit row
(`logAudit(..., 'create_invoice', ...)`).

Callers, all injected at mount time:

| Caller | Site | Status it creates |
|---|---|---|
| `POST /api/invoices` | `server.js:2614` | whatever the client sends (UI sends `draft`) |
| Booking handoff (`POST /api/booking/:id/handoff` with `target:'invoice'`) | `backend/booking.js:185-197` | `draft`, **total 0**, one zero-rate line item |
| Contract signing automation (`a.create_invoice`) | `backend/contracts-studio.js:311-318` | `sent` — note `sent` is **not** in the status registry |
| Contract deposit variant (`pay.type === 'deposit'`) | `contracts-studio.js:302-306` | `sent`, single "Deposit — <title>" line, balance stated in notes |
| Public print-store order | `backend/print-store.js:145-151` | `sent` |

The takeaway for planning: `createInvoiceForLead` is the *only* correct way to raise an invoice, and it
is passed by dependency injection into `booking.js`, `print-store.js` and `contracts-studio.js` at
`server.js:6419-6448`.

---

### 3. Invoice HTTP surface

All authed unless noted. `auth` sets `req.workspaceId`, `req.workspaceOwnerId`, `req.userId`,
`req.canViewAllLeads`. Every query carries the legacy dual predicate
`(workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))` so pre-workspace rows still resolve.

| Method + path | File:line | Purpose | UI? |
|---|---|---|---|
| `GET /api/invoices` | `server.js:2531` | list, newest first; opt-in pagination via `?limit&offset` (`backend/pagination.js:28`) | yes — `/invoices` |
| `GET /api/invoices/bin` | `server.js:2544` | soft-deleted invoices | **no UI, no api.js client** |
| `POST /api/invoices/:id/restore` | `server.js:2554` | un-delete | **no UI** |
| `GET /api/invoices/:id` | `server.js:2567` | single | not used by the page |
| `POST /api/invoices` | `server.js:2614` | create via `createInvoiceForLead` | yes — lead detail modal |
| `PUT /api/invoices/:id` | `server.js:2620` | field update; `status:'paid'` is intercepted and delegated | not used by the page |
| `DELETE /api/invoices/:id` | `server.js:2649` | soft delete to the bin | yes |
| `POST /api/invoices/:id/email` | `server.js:2686` | SMTP-send the rendered document | yes |
| `GET /api/leads/:leadId/invoices` | `server.js:2000` | invoices for one contact | yes — lead detail |

`PUT /api/invoices/:id` deserves attention. It computes `wantsPaid = status === 'paid' && current.status !== 'paid'`,
writes every other field with the *old* status preserved, then calls
`paymentsApi.markPaidByInvoice(...)` — and returns HTTP 503 if the payments module is not mounted
(`server.js:2626-2643`). This is the mechanism that makes "the ledger is the only door to paid" true
for legacy clients as well as the new one.

---

### 4. The shared invoice document (`wappflow-web/src/lib/invoiceDoc.js`)

`buildInvoiceHTML(invoice, company, baseUrl)` returns a complete branded HTML document — logo,
company block, billed-to block, striped line-item table, subtotal/discount/tax/total, notes, footer.

It is **deliberately dependency-free** so that the Node backend can `import()` it directly across the
frontend/backend boundary: `renderInvoiceEmailHTML` resolves
`wappflow-web/src/lib/invoiceDoc.js` by path, converts it with `pathToFileURL`, dynamic-imports it once
and caches the module (`server.js:2674-2682`). The only environment-specific input, the logo base URL,
is a parameter rather than an env read. That is why "no imports" is a load-bearing constraint here, not
a style preference.

**The XSS history.** The file's own header (`invoiceDoc.js:1-16`) records that there were once *three*
invoice templates: this escaped one, a hand-maintained copy inside `server.js` for emailing, and a
thinner third one inside the lead page's Create Invoice modal. The third interpolated the customer name,
every line-item description and the notes field **raw** into a `document.write` on a same-origin window.
A lead's name is attacker-supplied — the public booking form creates leads from whatever a stranger
types — so booking under a crafted name and waiting for the studio to hit Print was a path to running
script with access to `localStorage`, where the auth token lives. Consolidating to one `esc()`-ing
builder is what makes that bug class impossible rather than merely absent. Both remaining call sites
now use it: `wappflow-web/src/app/invoices/page.js:44` (Print/PDF) and the lead-page draft print
(`wappflow-web/src/app/leads/[id]/page.js:333-346`).

**But the shared module is currently broken.** `invoiceDoc.js:69` calls `displayPhone(...)`, which is
defined in `wappflow-web/src/lib/api.js:634` and **is not imported by `invoiceDoc.js`** — the file has
zero import statements. Any invoice whose `customer_phone` is truthy will throw `ReferenceError:
displayPhone is not defined` at render time, in the browser print path *and* in the backend email path.
See defects.

---

### 5. The payments ledger — the source of cash truth

**Table `payments`** (`backend/payments.js:59-73`):

| Column | Notes |
|---|---|
| `id` TEXT PK, `workspace_id` TEXT NOT NULL | |
| `kind` TEXT, `ref_id` TEXT | schema comment lists `invoice \| contract_deposit \| print_order \| booking`; **only `'invoice'` is ever written by any code path** |
| `lead_id`, `amount` REAL, `currency`, `currency_symbol` | |
| `description`, `status` (`pending\|paid\|failed\|refunded`) | only `pending` and `paid` are ever written |
| `provider` (`manual\|stripe`), `provider_ref`, `checkout_url` | `provider_ref='backfill'` marks synthetic rows |
| `public_token` TEXT UNIQUE | 32-hex from `crypto.randomBytes(16)`; the credential for `/pay/<token>` |
| `created_by`, `created_at`, `paid_at` | |

Plus `payments_meta(key, value)` — a one-row-per-marker table used to gate one-time migrations, and
`idx_payments_ws`.

**The idempotency guard.** `payments.js:80`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_invoice_paid
  ON payments(workspace_id, kind, ref_id) WHERE status='paid' AND kind='invoice'
```

A *partial* unique index: at most one PAID ledger row per invoice per workspace, enforced by SQLite
rather than by remembering to check. It is created **before** the backfill so even the backfill inserts
are constrained, and wrapped in try/catch so a pre-existing duplicate logs loudly instead of aborting
boot (`payments.js:79-83`).

**The backfill.** Marker-gated on `payments_meta.backfill_invoice_payments` *and*
`NOT EXISTS`-guarded, so it is idempotent twice over (`payments.js:92-108`). Every invoice already
sitting at `status='paid'` before the ledger existed gets a synthetic `paid` row with
`provider_ref='backfill'` and `paid_at = invoice.created_at` (best-effort timing), so `payments`
becomes the complete historical record of cash rather than a record that starts mid-history.

**Mark-paid converges on one function.** `markPaidByInvoice(invoiceId, {workspaceId, workspaceOwnerId, userId, note})`
(`payments.js:164-193`) is the single door:

1. loads the invoice with the dual workspace predicate — 404 if not yours;
2. pre-checks for an existing paid row → returns `{ok:true, already:true}` (idempotent, no error);
3. inserts a `pending` manual ledger row carrying who marked it and an optional 300-char note;
4. calls `markPaid(p)` which flips the row to `paid`, sets `paid_at`, calls `settle(p)`, broadcasts the
   SSE event `payment_paid`, and fires an in-app notification;
5. if the partial index throws UNIQUE (a concurrent settle won), deletes its own pending row and returns
   the winner's id;
6. re-reads the invoice and, if it did *not* become `paid`, returns a `warning` string and logs an error —
   because `settle()` swallows its exceptions (`payments.js:138`) and a silent failure here means the
   ledger and the invoice disagree;
7. writes an `invoice_mark_paid` audit row.

Three entry points reach it: `POST /api/payments/invoice/:invoiceId/mark-paid` (`payments.js:196`, what
the UI calls — `wappflow-web/src/lib/api.js:546`), the legacy `PUT /api/invoices/:id` delegate
(`server.js:2639-2642`), and the Stripe webhook via `markPaid` (not `markPaidByInvoice`).

**Payments HTTP surface:**

| Method + path | File:line | Auth | Notes |
|---|---|---|---|
| `POST /api/payments/invoice/:invoiceId/mark-paid` | `payments.js:196` | authed | ledger-truth manual settle |
| `POST /api/payments/link` | `payments.js:222` | authed | mints `public_token`, optionally a Stripe session |
| `GET /api/payments` | `payments.js:231` | authed | last 200 rows + `provider` — **no frontend consumes this** |
| `POST /api/payments/:id/mark-paid` | `payments.js:237` | authed | settle any payment row directly |
| `GET /api/payments/public/:token` | `payments.js:246` | **public** | pay-page data + `brand` + `next` journey links |
| `POST /api/payments/webhook` | `payments.js:267` | **public, signature-verified** | Stripe |

---

### 6. Stripe — implemented, unconfigured

`payments.js` has **no Stripe SDK dependency**. `configured = !!process.env.STRIPE_SECRET_KEY`
(`payments.js:52-54`). Checkout sessions are created by `fetch`-ing
`https://api.stripe.com/v1/checkout/sessions` with a URL-encoded body: `mode=payment`, success/cancel
URLs pointing back at `/pay/<token>`, `client_reference_id = payment.id`, and one inline
`price_data` line item in minor units (`payments.js:111-130`). On success the payment row stores
`checkout_url` and `provider_ref = session.id`.

**Webhook verification** (`payments.js:18-37`, `267-302`) is a hand-rolled HMAC of Stripe's
`t=<ts>,v1=<sig>` scheme: parse the header, reject if `|now - t| > 300s` (replay window), HMAC-SHA256
`"${t}."` + the **raw body buffer**, compare with `crypto.timingSafeEqual` against every `v1` entry.
The raw bytes are available because `server.js:114` registers a path-scoped
`express.raw({type: () => true})` on `/api/payments/webhook` **before** the global
`express.json` at `server.js:115` — the comment there explicitly says DO NOT reorder.

Behaviour: 400 when `STRIPE_WEBHOOK_SECRET` is unset (a manual-only deployment gets no webhooks, so any
POST is a forgery attempt), 400 on non-Buffer body / bad signature / unparseable JSON; 200 for accepted,
duplicate, and post-verification errors (so Stripe stops retrying). Idempotency is
`webhook_events UNIQUE(platform, event_id)` (`server.js:835-841`) and the insert happens **only inside
the handled `checkout.session.completed` branch**, so a future handler for another event type is not
pre-marked processed. `verifyStripeSignature` is exported as a pure function for the harness
(`payments.js:310`); `backend/test-batch2-stripe.js` exercises valid / tampered / wrong-secret / stale /
multi-`v1` / malformed / non-Buffer / empty-secret cases plus a live SQL dedupe proof.

**Configuration state.** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` appear in **neither**
`backend/.env.example` **nor** the environment-variable table in `DEPLOYMENT.md:306-327`. `ROADMAP.md:30`
records payments as "manual now; set `STRIPE_SECRET_KEY` to enable Checkout" and `ROADMAP.md:64` marks
Stripe go-live as *deferred until further notice*. **UNKNOWN: whether the live OVH host has these vars
set — the deployed `.env` is not in the repo. Every in-repo signal says no.** If unset, `createPaymentLink`
returns `provider:'manual'` and the pay page shows the "online payment isn't enabled yet" panel.

---

### 7. The public pay page (`/pay/[token]`)

`GET /api/payments/public/:token` (`payments.js:246-260`) returns only what a stranger should see:
amount, currency, description, status, provider, `checkout_url`, plus `brand` (resolved by
`backend/public-brand.js:55` from the workspace owner's `company_settings`) and `next` — journey links
to the client portal and booking page (`public-brand.js:107-122`). `workspace_id` and `lead_id` are
destructured away before responding.

The page (`wappflow-web/src/app/pay/[token]/page.js`) renders three states: **paid** (green tick,
receipt line, next-steps), **payable** (big amount + a "Pay securely →" anchor to `checkout_url`), and
**manual fallback** — literally "Online payment isn't enabled yet. Please complete payment with the
studio directly — they'll mark this as paid." (`page.js:53`). It also honours `?status=success` /
`?status=cancelled` from the Stripe redirect. This fallback panel is what a real client sees today.

---

### 8. The print store

**Domain terms** (needed to read this): a *project* is one job for one client. A *gallery* is a
published set of delivered photos with a `share_token`, reachable at `/g/<token>`. An *album* is a
designed print product (page layouts) — different thing. A *cull* is the photographer's keep/reject pass.
The print store hangs off the **gallery**: the client is looking at their photos, and the shop link is
right there.

**Tables** (`backend/print-store.js:27-45`):

- `ms_print_products(id, workspace_id, name, kind, description, options JSON, active, sort_order, created_at)`
  — `kind` is one of print/album/digital/frame (UI list at `wappflow-web/src/app/studio/store/page.js:8`);
  `options` is `[{label, price}]`, so "8×10 → 25" is an option, not a separate product.
- `ms_print_orders(id, workspace_id, gallery_id, lead_id, items JSON, total, currency_symbol,
  customer_name/_phone/_email, note, status, created_at)` + three columns added later by ALTER:
  `invoice_id`, `payment_id`, `pay_url` (`print-store.js:45`).

**Admin surface** — `/studio/store` (a single 93-line page): `GET|POST /api/store/products`,
`PUT|DELETE /api/store/products/:id`, `GET /api/store/orders`,
`POST /api/store/orders/:id/status` (`print-store.js:53-92`).

**Public surface** — keyed by the gallery share token, no auth:

- `GET /api/store/public/:token` (`print-store.js:95`) → brand, currency symbol, gallery title, active products.
- `POST /api/store/public/:token` (`print-store.js:105`) → place an order.

The ordering flow is the interesting one (`print-store.js:105-176`), and it is a full chain:

1. resolve the gallery by `share_token`; 404 if unknown;
2. require a name and at least one of phone/email;
3. **re-price every line server-side from the catalogue** — the client's prices are ignored entirely
   (`print-store.js:115-121`). Unknown product ids are silently dropped;
4. resolve or create the CRM lead: prefer the gallery's project's `lead_id`, else match an existing lead
   by phone then email, else insert a new `New`-status lead with `first_message = 'Print order'`;
5. insert the order and a `contact_history` line;
6. **raise an invoice** through `createInvoiceForLead` (status `sent`) and **mint a pay link** through
   `createPaymentLink` (kind `'invoice'`, ref the invoice), storing `invoice_id`, `payment_id`, `pay_url`
   on the order (`print-store.js:142-162`). The comment there is explicit that the store used to price an
   order and then never bill anybody;
7. WhatsApp the client the pay link via the injected `sendClientMessage`;
8. broadcast `print_order_created` and return `{ok, total, currency_symbol, pay_url, next}`.

**Gallery entry point.** `store_enabled` is not a per-gallery setting — it is computed as
"does this workspace have ≥1 active product?" (`backend/media-studio.js:2700`), and if true the
"🛍️ Order prints" button appears on **every** published gallery
(`wappflow-web/src/app/g/[token]/page.js:214-216`).

**Wiring order matters.** `print-store` mounts *before* `payments` (`server.js:6428` vs `6439`), so
`createPaymentLink` is injected as a thunk `(args) => paymentsApi.createPaymentLink(args)` that resolves
at call time (`server.js:6433`).

---

### 9. What Analytics counts as revenue — and how that changed

This is one of the clearest before/after stories in the codebase, and the code comments state it
outright (`server.js:2822-2831`).

**Before:** `GET /api/analytics` reported `total_sales = SUM(leads.actual_sale)` — a number a human typed
into the deal record. A studio could collect a year of real money and see zero, or see a figure nobody
ever received.

**Now** (`server.js:2833-2845`), the ledger is reported *beside* the estimate, not instead of it:

| Field | Query | Meaning |
|---|---|---|
| `collected` | `SUM(amount) FROM payments WHERE workspace_id=? AND status='paid'` | cash actually received, all time |
| `collected_this_month` | same, `strftime('%Y-%m', COALESCE(paid_at, created_at)) = this month` | |
| `outstanding` | `SUM(total) FROM invoices WHERE status != 'paid' AND not deleted` | claims not yet settled |
| `invoices_raised` | count of non-deleted invoices | |
| `contracts_signed` / `contracts_awaiting` | `cs_documents` by status | |
| `bookings_upcoming` | future non-cancelled bookings | |
| `total_sales` (kept) | `SUM(leads.actual_sale)` | now labelled **"Pipeline Value"** in the UI |

The Reports page renders `collected` as the headline "Collected" KPI with `collected_this_month` as its
subtitle, and moves the old estimate down to a second row as "Pipeline Value"
(`wappflow-web/src/app/reports/page.js:355-370`).

**Two places did not follow.** `GET /api/reports/overview`'s "Revenue over time" chart still sums
`leads.actual_sale` grouped by `closed_at` (`server.js:2884-2890`), and the Dashboard's six-month
"won revenue" trend and per-column pipeline value still use `actual_sale || estimated_value`
(`wappflow-web/src/app/dashboard/page.js:853, 975, 1052`). So "Collected" and "revenue over time" on the
same screen answer different questions from different sources.

One more ledger-derived number: the leads list now computes `lifetime_revenue` per contact as the sum of
their **paid invoices** via a correlated subquery, replacing `actual_sale` which reported a repeat
client's fifth booking as their entire history (`server.js:1721-1725`).

---

### 10. Maturity assessment

| Feature | Status | Named gap |
|---|---|---|
| Invoice create / list / edit / soft-delete | **SHIPPED** | — |
| Invoice numbering (per-workspace counter) | **SHIPPED** | no UNIQUE on `invoice_number`; single-process assumption |
| Shared invoice document (print + email) | **PARTIAL** | `displayPhone` is undefined in `invoiceDoc.js` — throws for any invoice with a phone |
| Invoice email via SMTP | **SHIPPED** | requires per-workspace SMTP in Settings; 400 otherwise |
| Invoice bin / restore | **PARTIAL** | backend routes exist and work; **no UI and no `api.js` client** — unreachable for users |
| Payments ledger + partial UNIQUE idempotency | **SHIPPED** | — |
| Manual mark-as-paid through the ledger | **SHIPPED** | — |
| Payment links (`public_token` + `/pay/<token>`) | **SHIPPED** | manual-settlement mode only in practice |
| Stripe Checkout | **PARTIAL / not live** | code complete and tested; `STRIPE_SECRET_KEY` unset — see §6 |
| Stripe webhook + signature verification | **SHIPPED (dormant)** | 400s everything until `STRIPE_WEBHOOK_SECRET` is set |
| Payments list screen | **STUB** | `GET /api/payments` returns data; nothing in `wappflow-web/src/app` calls it. The ledger has no UI |
| Print store admin (products, orders) | **SHIPPED** | no per-gallery enable/disable; no image per product |
| Public shop + server-side re-pricing | **SHIPPED** | — |
| Order → invoice → pay link → WhatsApp chain | **SHIPPED** | see the `kind` mismatch defect below |
| Print-order fulfilment states | **PARTIAL** | `status` column doubles as payment state and fulfilment state |
| `overdue` invoice status | **SOLD-NOT-BUILT** | filter button, badge tone and document colour exist; nothing ever sets it |
| Payment kinds `contract_deposit`, `print_order`, `booking` | **SOLD-NOT-BUILT** | declared in the schema comment; no code writes them |
| `manage_invoices` permission | **SOLD-NOT-BUILT** | defined in `ROLE_PERMISSIONS` and shown in the Team UI; enforced on zero routes |
| Refunds / partial payments / payment plans | **not built** | `status` allows `refunded`/`failed`; no code path writes either |

---

### 11. Defects, security weaknesses and data-integrity risks

Read-only observations. Nothing here was changed.

**D1 — `invoiceDoc.js` throws on any invoice with a phone number (BUG, user-visible).**
`wappflow-web/src/lib/invoiceDoc.js:69` calls `displayPhone(...)`; the function lives at
`wappflow-web/src/lib/api.js:634` and the document module has **no imports at all**. Both consumers
break: the browser Print/PDF path (`app/invoices/page.js:44`) and, because the backend dynamic-imports
the same file (`server.js:2678`), `POST /api/invoices/:id/email` → HTTP 500. Since the modal prefills
`customer_phone` from the lead (`app/leads/[id]/page.js:317`), most real invoices carry one. This also
silently violates the "deliberately dependency-free" invariant the file's own header depends on.

**D2 — `settle()` writes across tenants (SECURITY / data integrity).**
`payments.js:135-136` runs `UPDATE invoices SET status='paid' WHERE id = ?` and
`UPDATE ms_print_orders SET status='paid' WHERE id = ?` with **no `workspace_id` predicate**. Meanwhile
`POST /api/payments/link` (`payments.js:222-229`) accepts `ref_id` straight from the request body and
never checks it belongs to `req.workspaceId`. An authenticated user in workspace A can therefore mint a
payment for `ref_id` = an invoice in workspace B, call `POST /api/payments/:id/mark-paid` (which only
verifies the *payment* row is theirs, `payments.js:239`), and flip another tenant's invoice to paid.
`markPaidByInvoice` is correctly scoped; the link + generic mark-paid pair is the hole. Note the partial
UNIQUE index is keyed `(workspace_id, kind, ref_id)`, so it does not block this either.

**D3 — the print-store pay link settles the invoice but never the order.**
`print-store.js:154` mints the link with `kind: 'invoice'`. `settle()` only touches `ms_print_orders`
when `kind === 'print_order'` — a value nothing in the codebase ever writes. So a client who pays for
prints marks the *invoice* paid while the order sits at `status='new'` forever. The `settle()`
print-order branch is dead code.

**D4 — `ms_print_orders.status` conflates payment and fulfilment.**
Default `'new'`; the admin dropdown offers `new | in_production | fulfilled | cancelled`
(`app/studio/store/page.js:9`); `settle()` would write `'paid'`. Even if D3 were fixed, marking an order
"in production" would erase the record that it was paid, and a `'paid'` value renders as an
out-of-range `<select>` value in the admin UI.

**D5 — invoice totals are client-supplied and never validated.**
`createInvoiceForLead` inserts `subtotal`, `tax_rate`, `tax_amount`, `discount` and `total` exactly as
received (`server.js:2599-2606`); all arithmetic happens in the browser
(`app/leads/[id]/page.js:300-302`). Nothing checks that `total == subtotal + tax - discount`, or that
`total` matches the line items. Contrast the print store, which re-prices server-side
(`print-store.js:115-121`) — the correct pattern already exists in the repo.

**D6 — `manage_invoices` is defined but never enforced.**
`ROLE_PERMISSIONS` grants it to super_admin/admin/manager and denies it to `user`
(`server.js:186-189`), and the Team page presents it as a real toggle
(`wappflow-web/src/app/team/page.js:32`). No invoice or payment route reads it. Any authenticated member
of a workspace can create, edit, delete and mark-paid invoices.

**D7 — the payments ledger has no UI and is not exportable.**
`GET /api/payments` has no caller in `wappflow-web/src`. The workspace data export
(`server.js:2975-3004`) includes `invoices` but **not** `payments`, `ms_print_orders` or
`ms_print_products`. The table the product treats as cash truth cannot be read or exported by the person
whose cash it is.

**D8 — public store POST is a lightly-rate-limited write amplifier (ABUSE).**
The only limiter is global: 500 requests / 15 min / IP (`server.js:82-92`). Each anonymous
`POST /api/store/public/:token` can create a lead, an order, an invoice (burning an invoice number), a
payment row, and **send a WhatsApp message from the studio's number to an attacker-supplied phone**
(`print-store.js:169`). There is no CAPTCHA, no per-token throttle, and no dedupe.

**D9 — `outstanding` includes drafts.**
`server.js:2837` sums every invoice with `status != 'paid'`, which includes `draft`. A studio drafting
quotes inflates its own receivables figure. Note also that booking handoff creates zero-total drafts
(`booking.js:188-195`) — harmless for the sum, but they count toward `invoices_raised`.

**D10 — multi-currency sums are unguarded.**
`collected` sums `payments.amount` regardless of `payments.currency` (`server.js:2834`). Invoices copy
`currency` from `company_settings` at creation, so changing the workspace currency later leaves old rows
in the old currency and the SUM silently mixes units.

**D11 — a Stripe settlement on an already-manually-paid invoice is swallowed.**
If an invoice is marked paid manually and a Stripe session for it later completes, `markPaid` violates
`uq_payments_invoice_paid`, the webhook's outer catch returns `200 {received:true, note}`
(`payments.js:301`), and that payment row stays `pending` — so real money received via Stripe is never
counted in `collected`. Correct at the invoice level, wrong at the cash level.

**D12 — invoice numbering is safe only by accident.**
The read-modify-write of `invoice_counter` (`server.js:2588-2596`) is not wrapped in a transaction and
`invoice_number` has no UNIQUE constraint. `createInvoiceForLead` is fully synchronous and
better-sqlite3 is synchronous, so a single-process pm2 fork deployment cannot interleave — but a second
worker, a cluster-mode restart, or any future `await` inserted into that function produces duplicate
invoice numbers with no error. Separately, if the owner has no `company_settings` row the `UPDATE`
affects zero rows and *every* invoice becomes `INV-1001`; the row is created at signup
(`server.js:1255`, `1407`) so this is a legacy-data risk, not a fresh-signup one.

**D13 — `status: 'sent'` is not a known invoice status.**
Contract automations and print-store orders create invoices with `status:'sent'`
(`contracts-studio.js:317`, `print-store.js:149`), but the registry only knows
`draft|pending|paid|overdue` (`lib/invoiceStatus.js:8-12`). `makeStatusLookup` deliberately renders an
unknown value as a neutral humanised badge rather than pretending it is a draft — so these render as a
grey "Sent" pill and are invisible to every status filter button on `/invoices`.

**D14 — small dead code in the notification path.**
`payments.js:149` reads `p.customer_name || p.payer_name`; the `payments` table has neither column, so
the "who paid" clause in every payment notification is always the empty branch.

**D15 — the module gate for payments cannot fire from any plan.**
`MODULE_GATES` includes `{prefix:'/api/payments/', key:'payments'}` (`server.js:6266`), but no plan in
`backend/entitlements.js` defines a `payments` feature key (`print_store` does exist, `entitlements.js:32`).
`ent.features.payments` is therefore `undefined`, never `=== false`, so the gate is inert unless someone
sets a per-workspace override. Not a bug today; a trap for anyone who assumes payments are plan-gated.

**D16 — copy/behaviour mismatch on delete.**
The invoices page confirm dialog says the invoice "will be permanently deleted"
(`app/invoices/page.js:282`), but `DELETE /api/invoices/:id` soft-deletes to a bin the UI does not
expose (D7's sibling). The user is told something false in the more alarming direction.

---

### 12. Configuration reference for this domain

| Variable | Read at | Effect if unset |
|---|---|---|
| `STRIPE_SECRET_KEY` | `payments.js:52` | `provider='manual'`; no Checkout session; `/pay` shows the manual panel |
| `STRIPE_WEBHOOK_SECRET` | `payments.js:53` | webhook 400s every POST; boot warns if the secret key *is* set (`payments.js:55-57`) |
| `FRONTEND_URL` | `server.js:6433-6448` → `clientBaseUrl` | pay/shop/portal links become relative and useless off-site; also the CORS origin (`server.js:106`) |

Per-workspace settings that shape money behaviour live on the owner's `company_settings` row:
`invoice_prefix`, `invoice_counter`, `currency`, `currency_symbol`, `currency_position`, `tax_name`,
`tax_rate`, `company_logo`/`company_name`/`brand_accent` (the last three feed `publicBrand`).
SMTP for invoice email is a separate per-owner table, `email_smtp_settings` (`server.js:2696`).

**SSE events emitted here:** `payment_paid` (`payments.js:143`), `print_order_created`
(`print-store.js:171`), and `notification` frames with `kind:'payment'` (`server.js:1072-1085`). Note
that **no frontend code subscribes to `payment_paid` or `print_order_created`** — the invoices page and
store page update optimistically or on manual reload only.

**Audit actions written:** `create_invoice`, `invoice_mark_paid`, `invoice_emailed`, `soft_delete`,
`restore` (all on the `invoices`/`invoice` entity).

---

### 13. Open questions

- **UNKNOWN: whether Stripe is configured on the live OVH host.** The deployed `.env` is not in the
  repo, and neither `backend/.env.example` nor `DEPLOYMENT.md:306-327` documents the two Stripe
  variables at all. Every in-repo signal (`ROADMAP.md:30`, `ROADMAP.md:64`) says manual-only.
- **UNKNOWN: whether the `uq_payments_invoice_paid` index actually created successfully on the
  production database.** Creation is wrapped in try/catch and only logs on failure
  (`payments.js:81-83`); verifying requires reading the live DB at `/data/wappflow.db`.
- **UNKNOWN: how many production invoices carry `status='sent'`** (D13) — i.e. how much money is
  currently invisible to the `/invoices` status filters. Requires a live query.
- **UNKNOWN: whether pm2 runs the API in fork or cluster mode in production**, which decides whether
  D12's invoice-number race is theoretical or live. `DEPLOYMENT.md:454` shows a plain
  `pm2 start backend/server.js` (fork), but the deployed ecosystem config is not in the repo.
- **Deferred to other sections:** the subscription/plan side of money (`backend/pricing.js`,
  `backend/entitlements.js`, `plan_prices`, the Founding 100 programme) — enforcement and limits, not
  client billing. Also the contract-signing automation engine itself (`contracts-studio.js`), covered in
  the Contracts Studio section; only its invoice/deposit hand-off is documented here.


---


<!-- ── 10-public-journey.md ─────────────────────────────────────────── -->

## The public client journey and the Client Portal

*Observation timestamp: this section describes the code as it stood on **2026-08-24**, on branch `main`
at commit `c23c7af`. This area was rewritten four days earlier by commit `e2f2eec` ("Phase 8: the
studio's identity on every page their clients see"), and two of the pages described here
(`app/book/[slug]/page.js`, `app/booking/manage/[token]/page.js`) plus `backend/booking.js` have
**uncommitted working-tree changes** at the time of reading — a Phase-9 timezone/booking-integrity
effort in progress (`backend/studio-time.js` is untracked). Anything about booking times below is a
snapshot of work mid-flight.*

---

### What this part of the product is for

WappFlow is sold to small creative studios — wedding and event photographers, videographers. The
studio logs in; **its clients never do**. Everything a client of the studio touches lives in a set of
eight login-less web pages, each addressed by a random token (or, for two of them, a human-readable
slug). The studio pastes those URLs into WhatsApp, and the client taps them from a phone.

This is commercially the most important surface in the product: it is the only part a *paying
customer's customer* ever sees, so it doubles as the studio's shop window. Until Phase 8 it was
branded WappFlow — a bride opened her own wedding photographs on a page that named nobody, above a
footer crediting the software vendor. Phase 8 introduced a single brand resolver
(`backend/public-brand.js`) and per-page link previews (`wappflow-web/src/lib/publicMeta.js`) so the
studio's own identity leads on every one of them.

Some domain vocabulary used below, because it is photography-trade jargon:

- **Shoot / project** (`ms_projects`) — one job: "Hina — mehndi". Everything hangs off it.
- **Cull** — the studio's private act of triaging thousands of raw frames down to keepers. Clients
  never see a cull; it happens inside the app.
- **Gallery** (`ms_galleries`) — a *published, client-facing* set of finished photographs from one
  shoot. This is the delivery. A gallery has a `share_token`; that token is the whole URL.
- **Album** (`ms_albums`) — a physical printed book laid out page by page. Distinct from a gallery:
  a gallery is a web page, an album is a product. The portal only *lists* albums; it cannot show them.
- **Proofing / selection set** (`ms_proofing_sets`) — a formal round where the client is asked to pick
  N photographs (for the album, for retouching) with a quota, which the studio then approves or sends
  back for revision.
- **Portfolio** (`ms_portfolios`) — the studio's own public shop window at a vanity handle. Not tied
  to any client.

---

### 1. The eight public surfaces

| Route (frontend) | Public API it reads | What the client sees | What the client can *do* | Maturity |
|---|---|---|---|---|
| `/client/[token]` | `GET /api/client-portal/public/:token` | Unified hub for one CRM contact: progress milestones, documents, galleries, albums, invoices, print orders, projects | Follow links out; pay an invoice if a pay link exists; book again; order prints | **SHIPPED** (read-only hub) |
| `/g/[token]` | `GET /api/media/portal/:token` (+ 7 sub-routes) | Dark, editorial photo gallery, masonry grid, optional named "story sections" | Favourite, comment, save a named collection, download one or all (ZIP), run a slideshow, submit proofing selections, jump to the shop or the portal | **SHIPPED** |
| `/d/[token]` | `GET /api/cs/public/:token` | A block-built contract / proposal / quote, in one of 3 themes | Pick a package + add-ons (live total), ask an AI question about the document, draw + type a signature and sign, or decline | **SHIPPED** |
| `/shop/[token]` | `GET /api/store/public/:token` | Print/album/digital catalogue for the studio, framed as "from *gallery title*" | Add to cart, set quantities, check out with name + phone/email | **SHIPPED** |
| `/pay/[token]` | `GET /api/payments/public/:token` | One amount due, a description, the studio's mark | Click through to Stripe Checkout — *if* Stripe is configured; otherwise a "pay the studio directly" message | **PARTIAL** — see §6 |
| `/book/[slug]` | `GET /api/booking/public/:slug` | Service picker, day strip, time grid, intake questions | Book a slot; receives a `manage_url` | **SHIPPED** (timezone work in flight) |
| `/booking/manage/[token]` | `GET /api/booking/manage/:token` | The one booking, its status | Reschedule to another offered slot, or cancel (type-to-confirm) | **PARTIAL** — no metadata/noindex, see §5 |
| `/folio/[handle]` | `GET /api/media/public/portfolio/:handle` | The studio's portfolio in one of 10 themes, hero + about + grid + lightbox | Browse; email/call/Instagram/website links | **PARTIAL** — Phase 8 skipped its UI, see §4 |

Two of these are *meant* to be found: `/book/[slug]` and `/folio/[handle]` explicitly set
`robots: { index: true, follow: true }` (`app/book/[slug]/layout.js:14`,
`app/folio/[handle]/layout.js:13`). The six token pages are `index: false, follow: false`
(`lib/publicMeta.js:53`).

---

### 2. The capability-token security model

**The token is the credential.** There is no login, no password (except one optional per-gallery
password), no session, and no rate limit beyond the global one. Whoever holds the URL *is* the client,
with all of that client's rights. Every backend handler in this domain is mounted with no `auth`
middleware and resolves the row directly from the token.

| Token | Table.column | Entropy | Minted where | Revocable? |
|---|---|---|---|---|
| Portal | `client_portals.token` | `crypto.randomBytes(18)` = 36 hex chars | `ensureClientPortal()`, `server.js:6316-6328` (idempotent) | **No** — no revoke/expiry column or endpoint |
| Gallery | `ms_galleries.share_token` | `randomBytes(16)` = 32 hex | on publish, `media-studio.js:1717` — **reused** if already present | Indirectly: set `status` back to `draft` |
| Document | `cs_documents.token` | `randomBytes(18)` | on create/send, `contracts-studio.js:789,966` | Yes: `status='voided'`, or `expires_at` |
| Payment | `payments.public_token` | `randomBytes(16)` | `createPaymentLink()`, `payments.js:213` | No |
| Booking | `bookings.token` | `randomBytes(12)` = 24 hex | on public booking, `booking.js:390` | No |
| Portfolio | `ms_portfolios.token` *or* `handle` | `randomBytes(8)` = 16 hex; **handle is a slug of the user's name** | `getOrCreatePortfolio()`, `media-studio.js:2427-2438` | `is_public = 0` |

The implications a reader planning work should hold on to:

1. **Tokens are forwarded.** Clients paste gallery links into family WhatsApp groups. Every capability
   attached to that token travels with it. On `/g` that means anyone in the group can favourite,
   comment as any name they type, download the whole shoot as a ZIP, and submit the proofing round.
2. **The portal token is a super-token.** `/client/[token]` returns, among other things, `/d/<token>`
   links for every one of that contact's contracts — i.e. the **signing** capability. Hand someone the
   portal link and you have handed them the ability to sign your contracts. It also never expires.
3. **Photo files themselves are not gated at all.** Images resolve to `/uploads/...` served by
   `express.static` with `Access-Control-Allow-Origin: *` and no auth (`server.js:114-121`); the
   gallery password only guards the JSON *listing*, not the JPEGs.
4. **The brand payload is a deliberate public contract.** `public-brand.js:24-26` restricts the shape
   to `{name, logo, accent, website, email, phone, tagline}` with an explicit comment that anything
   added there is effectively public, and `safeColor()` (`public-brand.js:42-45`) whitelists
   `#rgb`/`#rrggbb` because `accent` is interpolated into inline CSS on a stranger-reachable page.
5. **Cross-tenant hardening exists in exactly one place and is worth copying.** The portal handler
   scopes *every* child query to the portal's own `workspace_id`, with a comment explaining that
   filtering by `lead_id` alone would let a rival tenant attach a contract to your lead id and have
   your portal hand strangers its signing token (`server.js:6341-6353`).

---

### 3. Branding and link metadata

`backend/public-brand.js` is the single resolver. It reads the **workspace owner's** `company_settings`
row — found via `workspace_members WHERE role='super_admin'` — and returns:

| Field | Source column | Notes |
|---|---|---|
| `name` | `company_settings.company_name` | falls back to `null`, never to the literal "WappFlow" |
| `logo` | `company_settings.company_logo` | absolutised against `FRONTEND_URL` — **see §7, this is wrong** |
| `accent` | `company_settings.brand_accent` | column added by `ensureBrandColumns()`; **no writer exists** |
| `website` / `email` / `phone` | `company_website` / `company_email` / `company_phone` | rendered in `PublicFooter` |
| `tagline` | `company_settings.brand_tagline` | column exists; **no writer, no reader in any page** |

Three shared React components consume it:

- **`components/PublicBrandMark.js`** — the logo `<img>`, or a coloured square with the studio's
  initial, or **nothing**. The refusal to render a placeholder is explicit and deliberate: "a
  placeholder mark asserts an identity that isn't the studio's" (`PublicBrandMark.js:11-12`). Used by
  `/client`, `/g`, `/shop`, `/pay`, `/book`, `/booking/manage`.
- **`components/PublicBrandHeader.js`** — a sticky bar version (mark + name + page title + a meta
  slot), with `light`/`dark` tones. Used only by `/d`.
- **`components/PublicFooter.js`** — studio name, website, email, then a de-emphasised "Powered by
  WappFlow" second line. The two lines are deliberately separate so a white-label entitlement could
  suppress one — but see §7, no such check exists.

A fourth, **`components/PublicNextSteps.js`**, is the anti-dead-end component: after a client signs,
pays, orders or books, the success screen renders whatever `journeyLinks()`
(`public-brand.js:106-121`) found — a portal link and/or a booking link — instead of terminating.

**`components/PublicScope.js`** solves a narrower problem: the app is dark-themed by default, but the
public pages are fixed-light. It adds `wf-public` to `<html>` on mount and removes it on unmount,
because `confirm`/`Toast`/`Modal` render through `createPortal(children, document.body)` and a wrapper
class would never reach them. `/g` and the executive `/d` theme deliberately do *not* use it — they
are dark by design.

**Link previews.** `lib/publicMeta.js` gives each token route a thin server `layout.js` exporting
`generateMetadata`, which server-side-fetches the same public endpoint and builds a per-studio
OpenGraph/Twitter card. Two details are load-bearing:

- The fetch sends `X-WF-Preview: 1` (`publicMeta.js:24`). Backends check `isPreview(req)`
  (`contracts-studio.js:95`, `media-studio.js:39`) so a crawler rendering a link preview does **not**
  flip a contract to `viewed`, does **not** log a gallery access, and does **not** inflate the
  portfolio `view_count`. Without it, sending a contract would immediately report it as opened.
- `/pay` deliberately omits the amount from its title — "a payment link previewed in a group chat
  should not announce what somebody owes" (`app/pay/[token]/layout.js:8-9`).

`/booking/manage/[token]` has **no `layout.js` and therefore no metadata** — it inherits the root
layout's "WappFlow — AI-powered customer operations" OpenGraph card *and* is indexable, since the root
layout sets no `robots`.

---

### 4. How the surfaces connect to each other

Before Phase 8 these were eight microsites. The current wiring:

```
/g  ──"Order prints"──▶ /shop/<same gallery token>      (g/page.js:215; only if store_enabled)
/g  ──"Everything else from X"──▶ /client/<portal token> (media-studio.js:2723-2730)
/client ──rows──▶ /g/<token>, /d/<token>, /pay/<token>   (server.js:6409-6410, 6394)
/client ──CTAs──▶ /book/<slug>, /shop/<gallery token>    (server.js:6415-6432)
/d  ──after signing──▶ PublicNextSteps{portal, book}     (contracts-studio.js:1077)
/shop ──after ordering──▶ pay_url + PublicNextSteps      (print-store.js:172-175)
/pay ──always──▶ PublicNextSteps{portal, book}           (payments.js:257)
/book ──after booking──▶ manage_url + PublicNextSteps    (booking.js:449-452)
/folio ──▶ nothing                                        (isolated)
```

`journeyLinks()` returns only links that exist, so a studio with no booking slug simply gets one
button rather than a broken one.

**`/folio` is the outlier.** Its `layout.js` was added on 2026-08-24 for metadata, and
`shapePublicPortfolio()` now returns a `brand` object (`media-studio.js:2471-2478`) — but the renderer,
`app/folio/portfolio-view.js`, was last touched **2026-06-15** and ignores it entirely. It still hard-codes
`Made with WappFlow Studio` in its footer (`portfolio-view.js:83`) and uses its own separate identity
system (`pf.avatar_url`, `pf.title`, `settings.accent`, 10 themes in `pf-theme-*` CSS). Portfolios are
also **per-user, not per-workspace** (`ms_portfolios.user_id`), so a three-person studio has three
portfolios. Classify: **PARTIAL** — the brand payload is on the wire and unused.

---

### 5. Per-page mechanics worth knowing

**`/client/[token]`** (`app/client/[token]/page.js`, 132 lines). Purely a reader. Sections render
conditionally, so an empty studio sees a short page. Invoice rows show a "Pay now" button only when a
`payments` row with a `public_token` already exists for that invoice and is unpaid
(`server.js:6363-6372`) — pay links are **not** minted automatically when an invoice is sent; a human
must click "💳 Payment link" in `app/invoices/page.js:36`. Classify the "pay from the portal" feature
as **PARTIAL** with that named gap.

**`/g/[token]`** — the richest surface. Public sub-routes, all gated by the same
`portalAllowed(gallery, pw)` check (`media-studio.js:1533-1537`) except where noted:

| Method + path | Effect |
|---|---|
| `GET /api/media/portal/:token?pw=` | gallery payload; 401 + `needs_password` if gated; logs an `ms_gallery_access` row unless preview |
| `POST …/favorite` | toggles `ms_client_favorites`, SSE `ms_client_favorited` |
| `POST …/collection` | saves the client's favourites as a named `ms_fav_collections` row + notifies the studio |
| `POST …/comment` | `ms_client_comments`, capped at 2000 chars, SSE + notify |
| `POST …/export` | queues a ZIP job; 403 if `download_policy === 'none'` |
| `GET …/export/:exportId` | poll status — **no password check** |
| `POST …/proofing/:setId/select` | toggle one selection; 409 if the set is closed; validates the asset belongs to the gallery |
| `POST …/proofing/:setId/submit` | closes the round, emits `ms_proofing_submitted` |

`download_policy` (`'none' | 'web' | 'high-res'`) is enforced server-side in `shapePublicAsset()`
(`media-studio.js:1540-1558`): the full-resolution original is only ever put in `download_url` when
the policy is `high-res`. Gallery-level `settings.watermark` burns a tiled text watermark into the
**ZIP export's** web variant (`startGalleryExport`, `media-studio.js:1756-1772`); the *on-page*
watermark is a separate, project-level "apply watermark" operation that writes `variants.watermarked`
(`media-studio.js:669-718`). The `/g` page never reads the `watermark` boolean it is sent. Classify
watermarking as **PARTIAL** — two mechanisms, one toggle, easy to believe you are protected when you
are not.

Client identity in the gallery is a free-text "Your name (optional)" box persisted to
`localStorage['wf_gallery_contact']`, sent as `contact_identifier`, defaulting to `'guest'`.

**`/d/[token]`** — renders `blocks` (a JSON array of editor blocks) through the shared `BlockView`
from `app/contracts/blocks.js`, so the client sees exactly the editor's output. Interactive pricing:
`package` blocks are single-select, `addons` are multi-select, and a live total is computed
client-side and posted back as `selection` on signing (`d/page.js:44-52, 141`). The sign sheet
requires all three of typed legal name, a drawn canvas signature, and an explicit ESIGN/UETA consent
checkbox that names IP/timestamp/device capture (`d/page.js:213-241`); the server re-checks all three
(`contracts-studio.js:1044-1047`) and stores IP, user-agent and a SHA-256 `doc_hash` over
`id::blocks::name::signature::timestamp`. Two client-facing extras: an **AI "Ask a question" widget**
(`POST /api/cs/public/:token/ask`, answered strictly from the document text), and a **silent analytics
beacon** that reports time-on-page and the deepest block scrolled into view via `IntersectionObserver`
and `navigator.sendBeacon` (`d/page.js:56-73`).

**`/book/[slug]`** — `booking_settings` has only `workspace_id`, `slug`, `settings` JSON. There is **no
enabled/published flag**: the page is live the moment a slug exists. Slots come from `computeSlots()`
(`booking.js:136-161`), which honours weekly `availability`, `slot_min`, `buffer_min`, a `blackout`
date list, `days_ahead`, and a hard `LEAD_MS` of one hour. Creation checks and claims the slot inside
a single `db.transaction` (`booking.js:333-355`) — the comment notes that checking outside it left the
exact race the "just taken" 409 pretends to prevent. Booking find-or-creates a `leads` row by phone,
then email.

---

### 6. Configuration and environment

| Variable | Consumed by | Effect on this domain |
|---|---|---|
| `FRONTEND_URL` | backend, passed to every module as `clientBaseUrl` | builds every `/g`, `/d`, `/pay`, `/client`, `/book`, `/booking/manage` absolute link, and absolutises `brand.logo` |
| `NEXT_PUBLIC_BASE_URL` | `lib/api.js:4`, `lib/publicMeta.js:16` | the **API** origin; used for `<img src>` on `/uploads/*` and for the server-side metadata fetch. Defaults to `http://localhost:3001` / `http://127.0.0.1:3001` |
| `NEXT_PUBLIC_API_URL` | `lib/api.js` | API base *including* `/api` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | `backend/payments.js` | when absent, `provider` is `manual`, `checkout_url` is null, and `/pay` degrades to "Online payment isn't enabled yet… they'll mark this as paid" (`pay/page.js:53`). **UNKNOWN: whether Stripe is configured in the live OVH deployment — the repo contains no `.env`.** |
| `STORAGE_PROVIDER` | `backend/storage/index.js` | `local` (default) serves `/uploads/<key>`; `r2` returns bucket URLs and presigns ZIP downloads |
| `TRUST_PROXY` | `server.js:37` | makes `req.ip` (and therefore signature IP capture and rate limiting) reflect the real client behind nginx |

---

### 7. Bugs, security weaknesses, data-integrity risks and smells

Read-only observations; nothing here was changed.

1. **`brand.logo` is built against the wrong host.** `absolute()` (`public-brand.js:30-37`) prefixes
   the stored `/uploads/logos/…` path with `FRONTEND_URL`, which `DEPLOYMENT.md:312` defines as the
   **Next.js app origin** (`https://app.example.com`), while `/uploads` is served by the **API**
   origin (`server.js:121`). `wappflow-web/next.config.ts` has no rewrites. An uploaded logo therefore
   resolves to a 404 in the header, the footer and the OpenGraph image on every public page. This is
   the headline feature of Phase 8 and it appears broken in any split-host deployment. (It works in
   dev only because both fall back to localhost.)
2. **The logo upload writes to the wrong row.** `POST /api/settings/logo` stores against
   `req2.userId` (`server.js:1605-1607`) whereas the settings PUT beside it uses
   `req.workspaceOwnerId`, and `publicBrand()` reads the `super_admin`'s row. A team member uploading
   a logo silently changes nothing a client will ever see.
3. **`brand_accent` and `brand_tagline` have no writer.** The columns are created
   (`public-brand.js:87-91`) and read, but nothing in `backend/` or `wappflow-web/src/` ever sets
   them except the Phase-8 test. Studio accent colour on public pages is **STUB**.
4. **White-label is SOLD-NOT-BUILT.** `entitlements.js:82` grants `white_label: true` to Studio+ and
   Enterprise, the landing page sells it (`app/page.js:1815, 1964`), and `PublicFooter.js:37` renders
   "Powered by WappFlow" unconditionally. Nothing anywhere reads the `white_label` key. Unlike
   `ai_editing` it is *not* in `UNBUILT_FEATURES` (`entitlements.js:135`), so the resolver reports it
   as an available feature of a paid plan.
5. **A signed-but-expired or declined contract can still be signed.**
   `POST /api/cs/public/:token/sign` blocks only `voided`, `signed` and `completed`
   (`contracts-studio.js:1042-1043`). The nightly sweep sets `status='expired'`
   (`contracts-studio.js:1130`) and the GET returns 410 for expiry — but the POST does not check
   `expires_at` or `expired`/`declined` status at all. A client who kept the tab open, or who
   re-declines and re-signs, can execute an expired document.
6. **Soft-deleted contracts and bookings stay live at their public links.** `cs_documents` and
   `bookings` both carry `is_deleted` (`soft-delete.js:31-32`), but `loadByToken()`
   (`contracts-studio.js:1006`), the booking-manage lookups (`booking.js:459, 468, 505`) and the
   portal's document query (`server.js:6382`) none of them filter it. "Delete" in the studio's UI does
   not withdraw the client's link.
7. **The print shop bypasses both the publish gate and the gallery password.**
   `GET/POST /api/store/public/:token` resolves `ms_galleries WHERE share_token = ?` with no
   `status='published'` and no `portalAllowed()` check (`print-store.js:97, 107`), unlike
   `loadPublishedGallery()` (`media-studio.js:2668-2670`). A draft or password-protected gallery's
   token opens the shop, and the anonymous `POST` creates a `leads` row, a `ms_print_orders` row, an
   **invoice** and a **payment link** in the studio's ledger with no rate limiting beyond the global
   500-per-15-min-per-IP. That is an unauthenticated write path into the studio's books.
8. **Gallery favourites never hydrate.** The `faved` Set in `app/g/[token]/page.js:21` starts empty on
   every page load and is only ever mutated by clicks; the server returns aggregate `favorites` counts
   but never "which ones are mine". A client who favourites 40 photos, closes the tab and returns sees
   zero hearts and an absent "My favourites" toggle, while their rows still exist in
   `ms_client_favorites`.
9. **Favourites identity is a free-text box.** `contact_identifier` defaults to `'guest'`
   (`media-studio.js:2745`), and the uniqueness key is
   `(gallery_id, asset_id, contact_identifier)`. Every visitor who leaves the name blank shares one
   favourites set and can toggle off each other's picks. Typing another guest's name impersonates them.
10. **`/booking/manage/[token]` leaks into search and previews as WappFlow marketing.** No
    `layout.js` ⇒ no `generateMetadata`, no `robots: noindex`, and the root layout's OpenGraph card
    (`app/layout.js:13-19`) applies. Cancel/reschedule also have no confirmation of identity beyond
    the 24-hex token.
11. **The public AI endpoint is unmetered and ungated.** `POST /api/cs/public/:token/ask` calls
    `ai.callLLM(prompt, { temperature, maxTokens })` with **no `ctx`**
    (`contracts-studio.js:1109`), and `ai-engine.js:194` spreads `ctx` into the meter call — so spend
    is recorded with `workspace_id: null`, invisible to the Command Center's AI ledger and to plan
    enforcement. There is no per-token or per-document quota; the only limit is the global rate limiter.
12. **`ms_gallery_access` grows unbounded.** Every non-preview page load inserts a fresh row
    (`media-studio.js:2686-2689`) with no dedupe and no retention. Its `lead_id`/`email` columns are
    never populated, so the table is write-only noise today.
13. **Gallery expiry is declared and never implemented.** `ms_galleries.expires_at` exists with a
    comment reserving it for a named roadmap feature (`media-studio.js:1301`); it is never written,
    never read, and `loadPublishedGallery()` ignores it. A delivered gallery link is permanent.
    **SOLD-NOT-BUILT** relative to the roadmap.
14. **Architectural smell — public pages ride the whole app.** Root `layout.js` registers a service
    worker and mounts `ConfirmProvider / SoundProvider / PlanProvider / RealtimeProvider /
    UsageWarnings / ImpersonationBanner` on *every* route, public ones included. The SSE connection is
    correctly guarded on a stored token (`components/shell/realtime.js:61`), but a bride opening her
    gallery still gets a WappFlow-branded PWA service worker installed on her phone.
15. **Booking-time formatting is correct only by cancellation.** Slot times render via
    `new Date(iso.replace(' ','T')).toLocaleTimeString()` (`app/book/[slug]/page.js:14`,
    `app/booking/manage/[token]/page.js:14`) — parsed as *visitor-local* and formatted as
    *visitor-local*, so the studio's wall-clock digits survive by accident, while the confirmation
    line uses the deliberate `formatAppointment()` helper (`lib/datetime.js:120-138`), which formats
    as UTC on purpose. Two opposite strategies on one page. This is the exact area under active
    uncommitted edit, so it may be mid-repair.
16. **`X-WF-Preview` is a self-asserted header.** Any caller can send it to read a contract without
    marking it viewed, or to browse a gallery without leaving an access trail. That is a low-severity
    integrity issue for the studio's "has the client opened it?" signal, not a confidentiality one.

### Where the existing docs are stale

`PRODUCT-AUDIT.md` §"Client Portal & the public client journey" (lines 276-286 and the findings table)
is **out of date as of commit `e2f2eec`**. Specifically, findings `client-portal-2` (gallery shows no
studio name), `client-portal-3` (links preview as generic WappFlow marketing), `client-portal-5`
(unpaid invoices not clickable), and `client-portal-6` (conversion dead ends) are all now implemented
in code, and its claim that "the studio's real uploaded logo … is displayed on NONE of them" and that
there is "no `generateMetadata` on any public route" is contradicted by
`components/PublicBrandMark.js` and the six `layout.js` files. Its statement that the hub "never
surfaces booking, pay links, or the shop" is contradicted by `server.js:6371, 6392-6408`. What *does*
still hold from that audit: `client-portal-7` (no shared cross-surface navigation — the links are
one-directional CTAs, not a shell), `client-portal-9` (grid actions are hover-only; the lightbox is
the acknowledged touch fallback, `g/page.js:312-313`), and `client-portal-10` (only `/d` distinguishes
"expired" from "not available"). Believe the code.


---


<!-- ── 11-ai.md ─────────────────────────────────────────── -->

## The AI layer — engine, providers, surfaces and intelligence

> **Line-citation snapshot note (added 2026-08-24).** This section's `backend/server.js` citations were
> written against an earlier snapshot than the one §14/§15 were pinned to. Measured against the current
> file (**6,595 lines**), they run low by roughly **+20 lines below ~line 2,000 and up to +50 lines above it**
> — beyond the dossier-wide ±25 tolerance stated in §01. The endpoints named below have been re-pinned to the
> current file; for any other `server.js:NNNN` reference in this section, grep for the quoted code rather than
> trusting the number.

WappFlow is a business operating system for small creative studios and SME sales teams: a WhatsApp-first CRM bolted to a photography/video production suite (Media Studio), a contract/proposal builder (Contracts Studio), booking, invoicing and a print store. The "AI layer" is not one feature — it is two entirely separate lanes that share a name and almost nothing else:

* **The LLM lane** — text generation and classification against a hosted large-language-model provider. This is what powers lead scoring, reply suggestions, conversation summaries, the natural-language command bar, contract drafting, and the two chat assistants. Everything in this lane funnels through one file, `backend/ai-engine.js`.
* **The CV lane** — deterministic computer-vision scoring of uploaded photos and video: sharpness, exposure, duplicate detection, composition, face/smile counts. No LLM, no API key, no network. It writes numbers into one advisory table (`ms_asset_scores`) which every "AI" feature in Media Studio then reads. This lane is the actual intelligence behind culling, hero-shot picking, album generation and reel drafts.

Conflating the two is the single easiest way to misread this product. The LLM lane needs a third-party key and can fail; the CV lane runs on the server's CPU at ingest and cannot. A studio can have zero AI provider keys configured and still get automatic photo scoring, selections, albums and reels — but the Copilot, the command bar and every CRM AI button will return HTTP 503 or 500.

A governing design rule is stated in the code repeatedly and is genuinely enforced: **the AI lane is advisory and control-first**. `backend/media-studio.js:17` and `backend/analyzers/index.js:19` state that AI/CV may write only `ms_asset_scores`, never a cull decision or a gallery; `backend/media-studio.js:1204` restricts the Copilot to three suggestable action types which the *human* must click.

---

### 1. The engine — `backend/ai-engine.js` (541 lines)

One module owns every LLM call in the product. Its header (`ai-engine.js:1-6`) declares itself "the single source of truth", and as of the current code that is true: `server.js:4057-4059` reduced the old `callGemini` (a function that did not call Gemini, had a hardcoded model id, one key and no failover) to a three-line delegation to `aiEngine.callLLM`. Every other consumer — `media-studio.js:57`, `contracts-studio.js:14` — receives the module by injection.

#### 1.1 Providers and configuration

Five providers are supported. Four are OpenAI-compatible chat-completions endpoints; Anthropic uses its own `/v1/messages` shape (`ai-engine.js:331-353`).

| Provider | Endpoint | Key env var | Model env var | Default model (`ai-engine.js:23-32`) |
|---|---|---|---|---|
| `cerebras` | `https://api.cerebras.ai/v1/chat/completions` | `CEREBRAS_API_KEY` | `CEREBRAS_MODEL` | `gemma-4-31b` |
| `groq` | `https://api.groq.com/openai/v1/chat/completions` | `GROQ_API_KEY` | `GROQ_MODEL` | `openai/gpt-oss-20b` |
| `openrouter` | `https://openrouter.ai/api/v1/chat/completions` | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | `z-ai/glm-5.2:free` |
| `openai` | `https://api.openai.com/v1/chat/completions` | `OPENAI_API_KEY` | `OPENAI_MODEL` | `gpt-4o-mini` |
| `anthropic` | `https://api.anthropic.com/v1/messages` | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` |

Two more env vars control routing: `AI_PROVIDER` (the nominal default, `ai-engine.js:8`, defaults to `cerebras`) and `AI_PROVIDERS` — an ordered comma-separated failover chain, defaulting to `${AI_PROVIDER},cerebras,groq,openrouter` (`ai-engine.js:50-52`). The chain is deduped and then filtered to providers that actually have a key (`ai-engine.js:174-176`); with no key at all, `callLLM` throws `No AI provider configured — set CEREBRAS_API_KEY, ...` (`ai-engine.js:178`).

Note that `backend/.env.example` lists only `GROQ_API_KEY`. The other four key names and both routing vars are undocumented there — a deployment trap.

#### 1.2 Multi-key rotation with per-key cooldowns

Each key env var is parsed as a **comma-separated list**, not a single key (`ai-engine.js:15-22`). The stated rationale (`ai-engine.js:10-14`) is that free tiers are metered per account, so stacking several accounts of the same provider multiplies the quota. Cooldowns are keyed by `provider#index` (`ai-engine.js:54-56`) so one exhausted key does not sideline its siblings, and `_liveKeyIndex(p)` (`ai-engine.js:58-65`) returns the first key of a provider not currently cooling down, or `-1`.

The failover algorithm (`callLLM`, `ai-engine.js:149-251`) runs in two passes:

* **Pass 1** (`184-223`) walks the candidate providers in order. For each, it drains that provider's *own* keys first (`while ((idx = _liveKeyIndex(p)) !== -1)`), on the reasoning that a second account of the same provider is a fresh quota and switching provider unnecessarily can mean a worse model. A rate-limit error (detected by string matching on `rate limit`, `429`, `tokens per minute`, `quota`, `too many requests`, `capacity`, `overloaded` — `ai-engine.js:141-146`) puts that one key on a 60-second cooldown (`COOLDOWN_MS`, `ai-engine.js:53`) and moves to the next key. Any other error breaks out to the next provider.
* **Pass 2** (`226-245`) runs when everything is cooling or failing: three attempts with exponential backoff (2s, 4s, 8s, capped at 20s), re-walking the whole chain each time.

If every attempt fails, exactly one failure row is written to the metering ledger and the last error is rethrown (`ai-engine.js:247-250`).

#### 1.3 Self-healing model discovery

The most distinctive part of the engine. Model ids expire; a retired id returns 404 with valid credentials, and the comment at `ai-engine.js:37-42` records a real incident on 2026-08-21 when all three configured defaults were retired simultaneously and the whole chain went down while nothing was actually broken.

The recovery path: `_isModelMissing(e)` (`ai-engine.js:115-121`) string-matches `does not exist`, `model_not_found`, `unknown model`, `not a valid model`, `no such model`, or `model` + (`404`|`unavailable`). On a match, and only if nothing has been discovered for that provider yet, `_discoverModel()` (`ai-engine.js:124-139`) issues a `GET` to the provider's `/models` endpoint (`MODELS_URL`, `ai-engine.js:104-109` — groq, cerebras, openrouter, openai only), filters out non-chat models via the `NOT_CHAT` regex (`whisper|tts|embed|guard|safety|safeguard|moderation|rerank|vision-only`, `ai-engine.js:112`), keeps only `:free` ids for OpenRouter when the configured model was free, prefers an id matching `instruct|chat|gpt-oss|glm|qwen|llama|gemma|mistral`, caches the result in the module-level `_discovered` map (`ai-engine.js:113`) and retries. The healed id is then used by every subsequent call for that provider (`_discovered['groq'] || GROQ_MODEL`, `ai-engine.js:298`). Verified by `backend/test-phase6-model-healing.js`.

**Gap:** `_callAnthropic` (`ai-engine.js:331-353`) never consults `_discovered`, and Anthropic has no entry in `MODELS_URL`. Anthropic is the one provider that cannot self-heal.

#### 1.4 The token floor and the prompt cap

Two small guards that are load-bearing:

* **Token floor** (`ai-engine.js:151-159`): `maxTokens = Math.max(requested, 256)`. The comment explains why — reasoning models (gpt-oss and friends) spend tokens *thinking* before emitting content, and that spend counts against `max_tokens`. Asking for 64 lets the model burn all 64 reasoning, return `finish_reason: 'length'` and an **empty string** — no error, just nothing, which callers treat as a valid answer. `detectSentiment` asked for exactly 64 (`ai-engine.js:436`) and "would have silently reported 'neutral' forever".
* **Prompt cap** (`ai-engine.js:162-170`): prompts over 12,000 characters have their *middle* removed (first 2,600 chars + last 9,200 chars, joined by `…[earlier conversation trimmed to fit AI limits]…`) so instructions at the start and recent context at the end both survive. Sized for the smallest free tier (Groq, ~6K tokens/min).

#### 1.5 Prompt construction and shared helpers

| Export | What it does |
|---|---|
| `callLLM(prompt, {maxTokens, temperature, system, provider, ctx})` | The low-level call (`149`) |
| `extractJSON(raw, 'object'\|'array')` | Strips ``` fences, slices from first `{`/`[` to last `}`/`]`, `JSON.parse`, returns `null` on failure (`356-369`) |
| `buildConversationContext(messages, lead, limit=30)` | Renders `Staff`/`Customer` transcript plus lead name/status/phone/platform/value (`372-386`) |
| `formatMemoryContext(memories)` | `Business Knowledge:` + `- key: value` lines from `ai_memories` (`506-509`) |
| `formatProfileContext(profile)` | Renders `workspace_ai_profile` into `About the business / Preferred tone / Respond in / DO / DO NOT / Sign off with` (`513-523`) |
| `analyzeLeadIntelligence` | One call returning `intent, intent_category, lead_score (1-10), lead_score_reason, temperature, sentiment, urgency, next_action, key_entities`; falls back to a hardcoded neutral object if JSON parsing fails (`393-426`) |
| `detectSentiment`, `summarizeConversation`, `suggestReplies`, `rewriteMessage`, `translateMessage`, `shortenMessage` | Small one-shot transforms (`429-503`) |
| `getActiveProvider()` | Returns `DEFAULT_PROVIDER` — see §7 |

Temperatures are deliberate and low: 0.1 for sentiment, 0.2 for lead analysis and translation, 0.3 for summaries, 0.4 for Copilot, 0.5 for reply drafting and contract improvement.

---

### 2. LLM surfaces — endpoint inventory

| Method + path | File:line | What it does | Status |
|---|---|---|---|
| `POST /api/leads/:id/ai/summary` | `server.js:4118` | 2–3 sentence conversation summary; logs a contact-history entry | SHIPPED |
| `POST /api/leads/:id/ai/reply-suggestions` | `server.js:4149` | 3 ready-to-send WhatsApp replies, seeded with company name + up to 5 message presets | SHIPPED |
| `POST /api/leads/:id/ai/analyze` | `server.js:4194` | Full lead intelligence; **persists** `lead_score`, `sentiment`, `urgency`, `intent_category`, `ai_last_analyzed_at` onto the lead row | SHIPPED |
| `POST /api/ai/rewrite` | `server.js:4208` | Tone rewrite; falls back to the workspace's preferred tone | SHIPPED |
| `POST /api/ai/translate` | `server.js:4223` | Translate to `target_lang` | SHIPPED |
| `POST /api/ai/shorten` | `server.js:4233` | Compress a draft | SHIPPED |
| `GET /api/ai/status` | `server.js:4243` | Returns `{provider}` — see bug list | PARTIAL |
| `GET/PUT /api/ai/profile` | `server.js:4248/4259` | Read/write `workspace_ai_profile` | SHIPPED |
| `POST /api/ai/command` | `server.js:4643` | Natural-language command bar (below) | PARTIAL |
| `GET /api/memories`, `POST`, `PUT /:id`, `DELETE /:id` | `server.js:4471-4513` | CRUD over `ai_memories` | SHIPPED |
| `GET /api/knowledge`, `POST /api/knowledge/upload`, `DELETE /:id`, `GET /:id/memories` | `server.js:4518-4604` | PDF/DOCX/TXT upload → background text extraction → LLM fact extraction into `ai_memories` | SHIPPED (with an IDOR — §7) |
| `POST /api/knowledge/learn-from-messages` | `server.js:4607` | Mines the last 100 outgoing staff replies (filtering `[media]` placeholders and bare URLs) for reusable facts; needs ≥5 usable messages | SHIPPED |
| `GET /api/leads/:id/industry` | `server.js:4890` | Keyword detection first; if confidence < 30 and > 2 messages, an LLM second pass | SHIPPED |
| `GET /api/workspace/industry` | `server.js:4936` | Keyword-only detection over the workspace's last 100 messages | SHIPPED |
| `POST /api/leads/:id/vertical-action` | `server.js:4952` | Sends a canned industry-specific WhatsApp message | SHIPPED |
| `POST /api/leads/:id/vertical-suggest` | `server.js:4975` | LLM next-action + ready-to-send message + buying stage | SHIPPED |
| `POST /api/cs/ai/assist` | `contracts-studio.js:874` | `draft` (generates a JSON block array for a contract), `improve`, `explain`, `summarize`, `risks` | SHIPPED |
| `POST /api/cs/public/:token/ask` | `contracts-studio.js:1095` | **Unauthenticated** client Q&A grounded in the document text | SHIPPED (abuse risk — §7) |
| `POST /api/media/copilot` | `media-studio.js:1206` | Studio Copilot (below) | SHIPPED |
| `GET /api/cc/ai` | `command-center.js:810` | Platform-admin AI Control Center over `ai_usage` | PARTIAL |

#### 2.1 The AI Command Center (`POST /api/ai/command`)

A two-step pattern: an LLM classifies the typed sentence into one of ten intents (`show_leads`, `show_stats`, `show_reminders`, `summarize_today`, `find_lead`, `show_hot_leads`, `show_won_leads`, `show_lost_leads`, `show_recent`, `unknown`) with extracted params, and then **hand-written SQL** executes it (`server.js:4643-4780`). Parameters are bound, not interpolated. `show_stats` and `summarize_today` make a *second* LLM call to narrate the numbers; `unknown` falls through to a free-form answer with workspace stats and memory context in the prompt.

The UI is `wappflow-web/src/components/AICommandCenter.js` — a floating action button in the CRM shell (`shell/modules.js:28`) with six quick-command chips. It gave up Ctrl+K to the deterministic command palette (`AICommandCenter.js:41-49`).

**Critically: every intent is read-only.** There is no mutation branch. The landing page advertises "AI commands — *"Mark all hot leads as interested"*" (`wappflow-web/src/app/page.js:572`), which no code path can execute. That specific claim is **SOLD-NOT-BUILT**.

#### 2.2 Studio Copilot (`POST /api/media/copilot`)

The Media Studio assistant. It builds a grounded context block from real SQL — cull decision counts, sharpness/quality aggregates, duplicate-group count, five best and five weakest filenames by AI quality, gallery/favourite/comment counts, proofing-set state, recent client comments, edited count (`media-studio.js:1216-1240`) — or, with no project in scope, a list of the workspace's twelve most recent shoots. Up to six turns of history are included. The system prompt (`media-studio.js:1251-1257`) demands strict JSON `{"reply": "...", "actions": [...]}` and allows only three action types: `navigate`, `create_gallery_from_keepers`, `preset_keepers`. The server then re-validates every returned action against `COPILOT_ACTIONS` (`media-studio.js:1204`), the allowed navigation targets, and the preset ids the client actually sent (`media-studio.js:1265-1267`). The frontend (`wappflow-web/src/components/StudioCopilot.js:52-72`) renders surviving actions as buttons the photographer clicks; the assistant itself performs nothing. If no provider key is configured, the endpoint returns 503 with a message naming the cause (`media-studio.js:1208`).

---

### 3. The CV lane — scoring without an LLM

#### 3.1 The analyzer abstraction (`backend/analyzers/index.js`)

Business logic never computes scores; it only reads `ms_asset_scores`. Two write paths converge on `recordScores()` (`analyzers/index.js:103-120`): server analyzers running inside `media-worker.js`, and external analyzers (the desktop Electron app's local ONNX engine, or a cloud worker) POSTing to `/api/media/assets/:id/scores` (`media-studio.js:796`) or `/api/media/projects/:id/scores` (`media-studio.js:809`).

The registry (`analyzers/index.js:46-53`) declares five analyzers with model versions: `technical` (tech-v1, server), `dedup` (phash-v1, server), `vision` (vision-v1, client), `video` (video-v1, client), `composite` (comp-v1, server). "Analyze once" is enforced by a ledger table `ms_asset_analysis (asset_id, analyzer_id)` storing the model version; `needsAnalysis()` (`analyzers/index.js:129-134`) returns true only when absent, failed, or version-drifted.

`computeComposites()` (`analyzers/index.js:146-186`) derives four transparent composite scores from whatever primitives exist — `hero` (technical excellence + eyes/smile bonus, ×0.85 if a near-duplicate), `portfolio` (aesthetic/craft, penalised by noise), `album` (hero ×0.7 if duplicate, so spreads do not repeat), `storytelling` (composition + people + aesthetic) — each carrying a human-readable `reasons` array like `sharp:0.82`.

#### 3.2 Server CPU vision (`backend/vision-cpu.js`)

A jimp-only fallback (113 lines) so workspaces with no desktop install still get vision primitives. `cpuMetrics()` downsamples to a 1024px long edge and computes luminance mean/std, a colourfulness metric from R−G and ½(R+G)−B moments, variance-of-Laplacian sharpness, and an edge-energy centroid distance to the rule-of-thirds lines. `computeVisionCpu()` (`vision-cpu.js:94`) emits `composition`, `aesthetic` (0.40·sharp + 0.25·exposure-quality + 0.20·contrast + 0.15·colour) and `scene_class` (portrait/group/landscape/scene × indoor/outdoor from blue/green pixel ratio). It writes under `model_version: 'vision-cpu-v1'` (`vision-cpu.js:20`) precisely so a desktop's richer `vision-v1` pass supersedes it — the ledger version differs, so analyze-once stays pending until a desktop runs. Wired at `media-worker.js:338`. **SHIPPED** (jimp is a hard dependency in `backend/package.json`).

#### 3.3 Server face/smile detection (`backend/face-detect.js`)

Optional. Requires `@vladmandic/face-api` (+ `@tensorflow/tfjs-node`), listed under `optionalDependencies` in `backend/package.json` and **not installed in this checkout**. `require('./face-detect')` throws and the worker's seam silently no-ops (`media-worker.js:319-326`), so `face_count` and `smile` are simply absent server-side. **PARTIAL — off by default.**

#### 3.4 What the CV lane feeds

* **`backend/studio-ai.js`** — five selection kinds with declared weights over composites: `best_of` (hero, 8% of shoot, 8–40), `highlights` (0.7 hero + 0.3 storytelling, 15%, 12–60), `portfolio` (5%, 6–30), `album` (20%, 20–80), `delivery` (0.5 hero + 0.3 portfolio, threshold 0.32) — `studio-ai.js:62-68`. Niche nudges per `project_type` (wedding/portrait/commercial/product/real_estate/event) add weight on top (`studio-ai.js:70-77`). Within a duplicate cluster only the best survives (`studio-ai.js:103-106`). Every chosen asset carries a `rationale` with score and reasons. `POST /api/studio-ai/projects/:id/gallery-from-selection` turns a selection into a private gallery; `POST .../album` (`studio-ai.js:159`) generates spreads ordered by capture time and — since Phase 6 — materialises real `ms_album_pages` rows rather than only a private spec blob, because the previous version produced albums that showed "0 pages" and exported a blank PDF (`studio-ai.js:179-187`). `GET/POST/PUT/DELETE /api/studio-ai/styles` is CRUD over manual editing presets (`ms_style_profiles`) — note this is a *different* table from the learned `style_profiles`.
* **`backend/video-ai.js`** — seven data-driven system reel templates seeded once (`video-ai.js:57-72`), a Story Engine that assembles a hook→establish→build→peak→resolve beat list from video hook/emotion scores and the best photo selection (`video-ai.js:98-114`), and `POST /api/video-ai/projects/:id/reel` (`video-ai.js:117`) which fills a template to a 15/30/60/90-second target and writes a canonical `ms_timelines` row — again because the previous private plan store dead-ended with no render and no export (`video-ai.js:142-146`).
* **`backend/video-ai-drafts.js`** + `POST /api/media/projects/:id/ai-drafts` (`media-studio.js:2279`) — the "creative pack" draft path: ranks media by CV quality plus cull signals plus a per-pack face weight, drops rejects, one shot per duplicate group, pours the result into a pack recipe, writes an editable timeline. Explicitly "No LLM key needed".
* **`backend/reel-engine.js`** and `POST /api/media/projects/:id/reel-render` — builds a plan and enqueues a real ffmpeg export, auto-applying the learned house style unless `auto_style:false` (`reel-engine.js:168-183`).
* **`backend/studio-experience.js:110`** — `GET /api/media/projects/:id/print-recommendations` counts hero ≥0.7, album ≥0.5, portfolio ≥0.7 and matches print products by name regex.

---

### 4. Brains and Style — `backend/brains.js` (167 lines)

The learning layer. It infers habits from behaviour already captured, and it stores nothing an LLM produced.

* **Creator Brain** (`deriveCreatorBrain`, `brains.js:40-60`) reads `ms_cull_decisions` for one `(workspace_id, user_id)` and derives `cull_keep_rate`, `decisiveness` (1 − share of "maybe" decisions), `decisions_count` and `avg_rating`. Confidence ramps linearly to 1.0 at 300 decisions (200 for ratings).
* **Style Engine** (`deriveStyle`, `brains.js:63-93`) joins `ms_asset_scores` to `ms_cull_decisions` where `decision = 'keep'`, averaging the `exposure`, `contrast`, `colourfulness` fields out of the aesthetic score's `reasons` JSON plus the `composition` value — i.e. *the house style is the average look of the work this studio actually keeps*. Scope is `workspace` or `creator`. Confidence ramps to 1.0 at 200 samples.
* **`backend/style-apply.js`** is the pure consumer: `styleAdjust(measured, target)` produces a bounded grade (delta × 1.4, clamped to ±0.5) in the video engine's −1..1 range plus a `style_match` score where 1 means already on-style.

| Method + path | File:line | Status |
|---|---|---|
| `GET /api/media/creator-brain` | `brains.js:96` | SHIPPED |
| `POST /api/media/creator-brain/derive` | `brains.js:103` | SHIPPED |
| `GET /api/media/style-profile?scope=workspace\|creator` | `brains.js:107` | SHIPPED |
| `POST /api/media/style-profile/derive` | `brains.js:115` | SHIPPED |
| `GET /api/media/recommendations` | `brains.js:123` | PARTIAL — only two recommendation kinds exist (`cull`, `style`), and only the cull tip is consumed by the UI (`studio/[id]/cull/page.js:98`) |
| `GET /api/media/projects/:id/style-suggestions` | `brains.js:142` | STUB-ish — no frontend caller found; the same computation is reached through `auto-edit` instead |
| `POST /api/media/projects/:id/auto-edit` | `media-studio.js:1157` | SHIPPED — grades each photo toward the learned style through the real non-destructive edit pipeline; 400s with a plain-English message if no style has been learned yet |
| `GET/PUT/POST /api/media/brain[/derive]` | `media-studio.js:852-854` | SHIPPED — the older workspace-level Studio Brain (`cull_keep_rate`, `avg_delivery_count`) |

---

### 5. Metering and cost — `ai_usage` and `backend/cc-metering.js`

`server.js:4044` wires `aiEngine.setMeter(recordAiUsage)` at boot, so every successful `callLLM` writes one row and every fully-failed call writes exactly one failure row. `recordAiUsage` (`server.js:4057`) prices the call from a static rate table `AI_RATES` (`server.js:4043-4055`, USD per 1M tokens) with a flat `{in: 0.1, out: 0.1}` fallback for unknown models, and inserts into `ai_usage`.

`ai_usage` (created by `command-center.js:84-88`): `id, ts, workspace_id, user_id, feature, provider, model, prompt_tokens, completion_tokens, latency_ms, est_cost, success`, indexed on `workspace_id`.

`backend/cc-metering.js` rolls this up nightly at 02:00 UTC (plus once ~8s after boot) into `workspace_usage_daily (workspace_id, date, leads, messages, ai_calls, ai_cost, storage_bytes, active_users, contracts, bookings, galleries)` and computes `workspace_scores (health, churn, expansion, activity, risk_factors)`. `no_ai` is one of the risk factors and AI usage is one of six modules in the adoption score (`cc-metering.js:77-92`).

`GET /api/cc/ai` (`command-center.js:810`) serves the platform-admin AI Control Center at `wappflow-web/src/app/control/ai/page.js`: totals, cost, tokens, average latency, success rate, breakdown by provider and by feature, and the last 60 calls.

**The attribution is empty.** `callAI` accepts a `ctx` (`server.js:4057`) and `callLLM` spreads it into the meter payload (`ai-engine.js:194`), but **no call site anywhere passes one** — verified by grep across `backend/*.js`. Consequently `workspace_id`, `user_id` and `feature` are always `NULL`: the "By feature" panel shows only `(unattributed)`, and `cc-metering.js:25`'s per-workspace `ai_calls`/`ai_cost` rollup and `cc-metering.js:59`'s `no_ai` risk factor are computed from `WHERE workspace_id IS NOT NULL` and therefore always see zero. The UI already admits this in a footnote (`control/ai/page.js:60-62`). **PARTIAL.**

---

### 6. Schema inventory

| Table | Owner | Key columns |
|---|---|---|
| `ai_memories` | `server.js:586` | `id, workspace_id, memory_type, key, value, confidence, source ('manual'\|'document'\|'staff_replies'), document_id` |
| `knowledge_documents` | `server.js:600` | `id, workspace_id, document_name, file_path, file_type, extracted_text (first 10k chars), memory_count, processed (0\|1\|2=failed)` |
| `workspace_ai_profile` | `server.js:673` | `workspace_id PK, business_description, tone, language, signature, dos, donts, auto_analyze` |
| `leads` (AI columns) | `server.js:668-672` | `lead_score, sentiment, urgency, intent_category, ai_last_analyzed_at` |
| `ai_usage` | `command-center.js:84` | see §5 |
| `ms_asset_scores` | `media-studio.js:114` | `id, workspace_id, asset_id, score_type, value REAL, group_key, model_version, source ('ai'\|'server'\|'desktop'\|'cloud'), reasons JSON` |
| `ms_asset_analysis` | `analyzers/index.js:66` | `(asset_id, analyzer_id) PK, model_version, source, status, analyzed_at` |
| `ms_feedback` | `analyzers/index.js:76` | `workspace_id, user_id, entity, entity_id, action, before, after, meta` — captured now for future learning; nothing reads it yet |
| `workspace_brain` | `analyzers/index.js:86` | `(workspace_id, key) PK, value JSON, confidence, source ('explicit'\|'inferred')` |
| `creator_brain` | `brains.js:24` | `(workspace_id, user_id, key) PK, value, confidence` |
| `style_profiles` | `brains.js:29` | `id, workspace_id, scope ('workspace'\|'creator'), scope_id, profile JSON, confidence, sample_n` — UNIQUE on `(workspace_id, scope, scope_id)` |
| `ms_selections` | `studio-ai.js:28` | `id, workspace_id, project_id, kind, asset_ids JSON, rationale JSON, params, created_by` |
| `ms_style_profiles` | `studio-ai.js:33` | `id, workspace_id, name, params JSON, is_default` — manual editing presets, **not** the learned style |
| `ms_template_library`, `ms_story_specs`, `ms_reel_plans` | `video-ai.js:36-49` | reel templates (`is_system=1` for the 7 built-ins), story beat specs, legacy plan rows |

Broadcast events emitted on the SSE bus by this layer: `ms_selection`, `ms_gallery_created` (`studio-ai.js:125,153`), `ms_scored` (`media-studio.js:804,829`). Per the repo's own SSE convention, the backend emits **unnamed** frames — consume via `es.onmessage` and switch on `data.type`.

---

### 7. Maturity ledger

| Feature | Status | Named gap |
|---|---|---|
| Provider chain + multi-key rotation + cooldowns | SHIPPED | Anthropic excluded from self-healing |
| Self-healing model discovery | SHIPPED | No Anthropic; discovered model ids always price at the flat fallback rate |
| Token floor / prompt cap | SHIPPED | — |
| Lead summary / reply suggestions / analyze | SHIPPED | — |
| Auto-analyze on new WhatsApp lead | SHIPPED | Push update goes to only one workspace user (`whatsapp-service.js:663`) |
| Rewrite / translate / shorten | SHIPPED | — |
| AI Command Center | PARTIAL | Read-only; no mutating intent exists despite marketing |
| Knowledge base (PDF/DOCX/TXT → memories) | SHIPPED | Cross-tenant delete IDOR (below) |
| Learn-from-staff-replies | SHIPPED | — |
| Website crawl into knowledge | **SOLD-NOT-BUILT** | `wappflow-web/src/app/knowledge/page.js:118` POSTs `/api/knowledge/crawl`; **no such route exists in the backend** |
| Industry / vertical intelligence | SHIPPED | Only 4 verticals (`training_institute`, `real_estate`, `clinic`, `general`); confidence = matched keywords ÷ total keywords, which caps low |
| Contracts AI assist + client Q&A | SHIPPED | Public Q&A endpoint is unauthenticated |
| Studio Copilot | SHIPPED | 3 action types only (by design) |
| Studio AI selections / gallery / album / styles | SHIPPED | `studioAiAPI.albums()` in `lib/api.js:518` points at a route deleted in Phase 6 — dead client method, no caller |
| Video AI reel / story engine | SHIPPED | — |
| AI reel drafts (creative packs) | SHIPPED | — |
| Creator Brain / Style Engine / auto-edit | SHIPPED | Advisory; nothing auto-applies except the opt-out reel grade |
| Server CPU vision | SHIPPED | Heuristic, not a model |
| Server face/smile detection | PARTIAL | Optional dependency not installed |
| Desktop local ONNX AI engine | UNKNOWN | Out of this repo (`wappflow-desktop/`); the *seam* here (`/api/media/*/scores`, `analyzers` registry `where: 'client'`) is SHIPPED and testable |
| AI usage metering | PARTIAL | No workspace/user/feature attribution |
| Per-plan AI feature gating | **SOLD-NOT-BUILT** | See below |
| `ai_editing` entitlement | Honestly gated | `entitlements.js:135` forces it OFF as unbuilt |
| BYOK (bring your own LLM key) | **SOLD-NOT-BUILT** | Flag exists (`entitlements.js:90`); keys are process-wide env vars, no per-workspace key storage anywhere |

---

### 8. Bugs, security weaknesses, data-integrity risks and architectural smells

**Do not fix these — they are recorded for planning.**

1. **Cross-tenant delete (IDOR) in knowledge documents.** `app.delete('/api/knowledge/:id')` (`server.js:4584`) looks the document up with `SELECT * FROM knowledge_documents WHERE id = ?` — **no `workspace_id` filter** — then unlinks the file from disk and deletes both the row and `ai_memories WHERE document_id = ?`. Any authenticated user of any workspace who learns or guesses a document id can destroy another tenant's knowledge base and its derived memories. Every sibling route in the same block *is* scoped, which makes this look like an oversight rather than a design.

2. **Path traversal in knowledge uploads.** `knowledgeUpload` (`server.js:4320`) builds the filename as `knowledge-${Date.now()}-${file.originalname}` with no sanitisation. `originalname` is attacker-controlled; a name containing `../` can write outside `uploadsDir`.

3. **Unauthenticated, uncapped LLM spend.** `POST /api/cs/public/:token/ask` (`contracts-studio.js:1095`) calls the LLM for anyone holding a document link, with no per-document or per-token throttle beyond the global 500-requests-per-15-minutes-per-IP limiter (`server.js:82-92`). A leaked contract link is a metered cost vector.

4. **Metering attribution is dead.** As detailed in §5 — `ctx` is plumbed end to end but never populated. The Command Center's AI cost-per-workspace, the `no_ai` churn risk factor, and the "By feature" panel are all structurally empty. Anything built on top of per-workspace AI cost today would be building on zeros.

5. **`GET /api/ai/status` reports a provider that may never run.** It returns `aiEngine.getActiveProvider()` (`ai-engine.js:540`), which is just `DEFAULT_PROVIDER` = `process.env.AI_PROVIDER || 'cerebras'`. If `CEREBRAS_API_KEY` is unset, the string `cerebras` is still reported while Groq actually serves every request. The Settings screen shows this value to the user (`settings/page.js:2939`).

6. **A settings toggle that does nothing.** `AICommandTab` writes `wf_ai_command_enabled` to localStorage (`settings/page.js:2943-2946`), but the shell renders `<Fab key={i} />` with no props (`shell/AppShell.js:189`), so `AICommandCenter`'s `enabled` prop always defaults to `true` (`AICommandCenter.js:31`). Turning the AI Command Center "off" has no effect.

7. **AI plan features are advertised but not enforced.** `entitlements.js` defines `basic_ai`, `ai_reply_suggestions`, `ai_lead_intelligence`, `next_best_actions`, `studio_brain`, `ai_asset_scoring`, `ai_hero_shot`, `ai_culling`, `ai_project_intelligence` and prices them into tiers (Creator = all off, Studio = all on), and the landing page and pricing table sell them (`page.js:1803-1806`, `1956-1957`). Grepping the whole backend and frontend, **none of these keys is ever read outside `entitlements.js` itself.** `MODULE_GATES` (`server.js:6282-6290`) gates only `/api/media/`, `/api/studio-ai/`, `/api/video-ai/`, `/api/cs/`, `/api/booking/`, `/api/store/`, `/api/payments/` — there is no `/api/ai/` prefix and no per-route feature check. A Creator-plan workspace gets every AI feature. `pricing.js:18` likewise meters only `leads, users, whatsapp_accounts, storage_gb, contract_sends` — **there is no AI call or token quota of any kind.**

8. **Two divergent score vocabularies.** `analyzers/index.js:27-42` declares the canonical `SCORE_TYPES`, and `recordScores` silently drops anything not in it (`analyzers/index.js:105`). But `media-worker.js:284-296` writes `quality`, `clipping`, `high_clip`, `shadow_clip` and `duplicate_group` through **raw INSERTs that bypass `recordScores` entirely** — none of those five types exists in `SCORE_TYPES`. Downstream code compensates by checking both names (`dupKey()` in `studio-ai.js:59` accepts `dup_cluster` *or* `duplicate_group`; `computeComposites` does the same at `analyzers/index.js:163`). Worse, because `quality` and `duplicate_group` are not owned by any analyzer, the delete-then-insert idempotency of `recordScores` never covers them; they are only cleared by the `source = 'ai'` sweep at `media-worker.js:284`.

9. **Unvalidated external score ingestion.** `POST /api/media/assets/:id/scores` (`media-studio.js:796`) accepts any `analyzer_id` and `model_version` from any authenticated workspace member. For an unrecognised `analyzer_id`, `ownedTypes()` returns `[]`, so the "replace this analyzer's scores" delete never fires and repeated posts **append duplicate rows** to `ms_asset_scores` indefinitely. It also writes a ledger row for an analyzer that does not exist.

10. **Duplicated helpers.** `extractJSON` and `buildConversationContext` exist twice — once in `ai-engine.js:356/372` and again inline in `server.js:4076/4093` — with different behaviour (`server.js`'s version has no message limit). `getMemoryContext` (`server.js:4434`) re-implements `formatMemoryContext` rather than calling it. Prompts in `server.js` (summary at 4118, reply-suggestions at 4149) are near-copies of `ai-engine.js`'s `summarizeConversation` and `suggestReplies` but do not use them, so tuning one leaves the other stale. The "one AI path" consolidation reached the *transport* but not the *prompts*.

11. **Fragile string-matching for error classification.** Rate limits and retired models are both detected by lowercasing the error message and searching for substrings (`ai-engine.js:115-121`, `141-146`). Any provider that rewords its errors, or localises them, silently loses failover and self-healing. Only OpenRouter's wrapper explicitly injects the HTTP status into the message (`_callOpenRouter`, `ai-engine.js:273`) so that 429s classify correctly; the other four wrappers throw the provider's `error.message` and may or may not contain a status.

12. **Silent failure modes by design.** `analyzeLeadIntelligence` returns a hardcoded neutral object (score 5, sentiment neutral, "Unable to analyze") when JSON parsing fails (`ai-engine.js:415-425`), and `detectSentiment` returns `{sentiment:'neutral', confidence:0}` on any throw (`ai-engine.js:438-440`). Those values are then **persisted onto the lead row** by `POST /api/leads/:id/ai/analyze` (`server.js:4200-4210`), so an LLM outage writes plausible-looking neutral intelligence into the CRM that is indistinguishable from a real result.

13. **Module-level mutable state.** `_discovered` and `_cooldownUntil` (`ai-engine.js:55,113`) live in process memory. They reset on every restart and are not shared across workers, so a multi-process deploy would re-discover models and re-hit rate limits per worker.

14. **Cost table drift.** `AI_RATES` (`server.js:4043`) hardcodes rates for eleven model ids. Any model reached via self-healing discovery — which is the whole point of the mechanism — will not be in the table and prices at the flat `0.1/0.1` fallback, so `est_cost` becomes progressively more fictional the more the healing works.

15. **Stale documentation.** Repo docs disagree with the code in at least two places worth noting: the section header in `server.js:4036` still reads `AI ASSISTANT (GEMINI)` although no Gemini code remains, and prior planning notes describing Command Center as unmounted dead code are wrong — it is mounted at `server.js:6521` and its AI Control Center route is live.

---

### 9. What a studio actually experiences

**A photographer with no AI keys configured.** They upload a shoot. The worker generates variants and, within seconds per photo, writes sharpness, exposure, blur, clipping, quality, duplicate groups and — via `vision-cpu` — composition, aesthetic and scene class, then derives hero/portfolio/album/storytelling. In the cull view they can sort and filter by those scores and see a tip like "You keep about 34% of shots — auto-flag the bottom 66% by hero score for a faster first pass" once they have culled enough for the Creator Brain to have confidence. One click generates a "Best Of" or "Highlights" selection with a per-photo rationale; another turns it into a gallery; another produces a 30-page album draft with real pages that export to PDF; another builds a 30-second reel timeline they can edit and render. After a few hundred keeps, "Auto-edit to house style" grades a whole shoot toward the average look of the work they keep. **None of this touches an LLM.** The only thing they cannot do is talk to the Copilot — its button is there, and pressing it returns "AI is not configured on this server (set an AI provider key)."

**A sales team with keys configured.** New WhatsApp leads are auto-analyzed five seconds after they land if `auto_analyze` is on, stamping a 1–10 score, sentiment, urgency and intent category onto the lead. On the lead page, three buttons produce a summary, three drafted replies and a full intelligence read. A message-composer menu rewrites in five tones, shortens, or translates. A sparkle FAB opens the command bar for questions like "show hot leads" or "summarize today". Uploading a pricing PDF to Knowledge extracts up to 20 structured facts, and those facts, plus the workspace tone/language/dos/don'ts profile, are injected into every subsequent prompt — which is the mechanism behind the marketing claim that replies "sound like you". When the provider rate-limits, the engine rotates keys, fails over, backs off and retries; the user sees latency, not an error. When a model id is retired, the engine asks the provider what it has and carries on. When *everything* fails, the button shows the raw provider error message.


---


<!-- ── 12-platform-core.md ─────────────────────────────────────────── -->

## Platform core — auth, workspaces, roles, permissions and multi-tenancy

> **Read date / volatility note.** Everything below was read from the working tree on **2026-08-24**
> (`C:/Users/DELL/Desktop/Sami/wappflow`, branch tip `c23c7af`, with uncommitted modifications in
> `backend/server.js` and friends). `backend/server.js` was **6,587 lines and being actively edited
> while this section was written** — a password-reset module (`backend/account-recovery.js`) landed
> mid-read and shifted line numbers by ~19. Line citations are against the file as of that read; treat
> them as ±25 lines and search for the quoted code rather than trusting the number blindly.

### What this layer is *for*

WappFlow is sold to photo/video **studios**. A studio is a small business — an owner plus zero to a
handful of staff — and everything the product does (leads, WhatsApp conversations, contracts, shoots,
galleries, invoices) belongs to that business, not to the individual who typed it in. The platform
core is the machinery that answers three questions on every single request:

1. **Who are you?** (a `users` row, proven by a JWT)
2. **Whose business are you acting inside?** (a `workspaces` row — the tenant)
3. **How much of that business are you allowed to see and change?** (a `workspace_members.role` plus a
   permissions blob)

A **workspace** is the tenant boundary and the unit of billing. A **member** is a person's seat in a
workspace. Almost every business table in the database carries a `workspace_id` column, and the
promise of the system is that no query ever crosses that column. This section documents how well that
promise is actually kept.

There is one important architectural limit to state up front: **a user belongs to exactly one
workspace at a time.** `users.workspace_id` is a single scalar column (server.js:289–294), and the
auth middleware reads the caller's workspace from it. `workspace_members` *looks* like a many-to-many
join table, but the login path never consults it to choose a workspace. There is no workspace switcher
anywhere in the product — a repo-wide grep for `switchWorkspace` / "Switch workspace" returns nothing
in `backend/` or `wappflow-web/src`. An agency running two studios cannot do so in one account.

---

### The identity model (tables)

| Table | Key columns | Purpose / notes |
|---|---|---|
| `users` | `id` (TEXT PK), `email` (UNIQUE), `password` (bcrypt), `business_name`, `role` (default `'owner'`), **`workspace_id`**, `full_name`, `profile_picture`, `phone`, `bio`, `google_id`, `token_version` (added by account-recovery.js:58), `created_at` | The person. `users.role` is **vestigial** — it holds `'owner'`/`'member'` and is never read for authorization; the real role lives in `workspace_members.role`. `/api/auth/me` even overwrites it in the response (server.js:1333). |
| `workspaces` | `id` (TEXT PK), `name`, `owner_id`, `status` (added lazily by command-center.js:133–134, `'active'`/`'suspended'`), `created_at` | The tenant. `owner_id` is informational; the *effective* owner is resolved from `workspace_members` instead (see `req.workspaceOwnerId`). |
| `workspace_members` | `id`, **`workspace_id`**, `user_id` (NULLable while an invite is pending), `role`, `permissions` (JSON TEXT), `invite_email`, `invite_token` (UNIQUE), `invite_status` (`'active'` / `'pending'`), `full_name`, `created_at` | The seat, the invite record, and the authorization record all in one row. Indexed by `idx_workspace_members_ws`. |
| `workspace_role_permissions` | `id`, `workspace_id`, `role`, `permissions` (JSON), UNIQUE(`workspace_id`,`role`) | Per-workspace override of the role→permission matrix. **Written and displayed but never enforced** — see Concerns. |
| `team_members` | `id`, `workspace_id`, `name`, `email`, `role` (default `'agent'`), `status`, `invite_token`, `user_id` | **Legacy, superseded, and buggy.** Predates `workspace_members`. Still written by `POST /api/team` and still read in two hot paths. |
| `workspace_plan` | `workspace_id` (PK), `plan`, `features` (JSON), `limits` (JSON), `trial_ends_at` | Billing tier. Feeds `entitlements.getEntitlements()`. |
| `audit_logs` | `id`, `workspace_id`, `user_id`, `user_name`, `action`, `entity_type`, `entity_id`, `details` (JSON), `ip_address`, `created_at` | Per-tenant audit spine, written by `logAudit()` (server.js:1189). Indexed `(workspace_id, created_at)`. |
| `password_resets` | `id`, `user_id`, `token_hash` (sha256, UNIQUE), `expires_at`, `used_at`, `requested_ip` | New (account-recovery.js:44–56). Only the hash is stored; 60-minute TTL; single use. |
| `cc_admins` | `id`, `email`, `password_hash`, `cc_role`, `cc_permissions`, `status` | A **separate identity tier** for platform staff. Not a `users` row. See "Command Center" below. |

Two more tables carry platform-admin state: `cc_audit` (every admin action, with before/after and IP)
and `cc_impersonations` (one row per impersonation session).

---

### JWT issuance, expiry and revocation — **PARTIAL**

Tokens are HS256 JWTs signed with `JWT_SECRET`, which falls back to the literal string
`'your-secret-key-change-in-production'` when the env var is unset (server.js:180). Sessions are minted
by `signSession(userId, extra)` (server.js:196–200):

```js
function signSession(userId, extra = {}) {
  let tv = 0;
  try { tv = db.prepare('SELECT token_version FROM users WHERE id = ?').get(userId)?.token_version || 0; } catch {}
  return jwt.sign({ userId, tv, ...extra }, JWT_SECRET);
}
```

**There is no `expiresIn`.** A workspace-user token is valid forever. The only two token types with an
expiry are Command Center admin tokens (`12h`, command-center.js:256), the step-up token (`5m`,
command-center.js:272) and the impersonation token (`30m`, command-center.js:457).

The `tv` (token version) claim is the *only* revocation mechanism, added very recently. The middleware
refuses any token whose `tv` is lower than `users.token_version` (server.js:222–224). A completed
password **reset** bumps that version (account-recovery.js:169). A password **change** via
`PUT /api/auth/password` does **not** (server.js:1307–1325) — so changing your password in-app leaves
every other stolen session alive. There is no logout-everywhere, no refresh-token rotation, and no
server-side session store; "sign out" is `localStorage.removeItem` on four keys
(`components/shell/session.js:15,35`).

The frontend stores the raw JWT in `localStorage` under `token`. A "remember me" checkbox writes
`wf_persist` = `'forever'` | `'session'`; an inline `<head>` script in `app/layout.js:46–57` clears the
token on a genuinely fresh visit when the mode is `'session'`. This is a client-side convenience only —
the token itself remains valid server-side.

`auth` also accepts the token via **query string** (`req.query.token`), because `EventSource` cannot set
headers (server.js:203). That is how `GET /api/events` (the SSE bus, server.js:971) authenticates. It
means non-expiring bearer tokens travel in URLs, and therefore into nginx access logs and browser
history.

---

### The `auth` middleware — the single choke point

Every authenticated route in the product goes through the one `auth` function at **server.js:201–262**,
which is passed by dependency injection into every mounted module (`require('./booking')(app, db, { auth, ... })`,
server.js:6461, and the same for media-studio, contracts-studio, payments, comms, print-store, search,
sync, reel-engine, brains, studio-ai, video-ai, studio-experience). There is exactly one implementation.
It sets, in order:

| Property | Source | Meaning |
|---|---|---|
| `req.userId` | `decoded.userId` | The person. |
| `req.impersonation` / `req.impersonatedBy` | `decoded.imp` claim | Present only on Command Center impersonation tokens. |
| `req.workspaceId` | `users.workspace_id` **`|| decoded.userId`** | **The tenant key.** The fallback is load-bearing — see below. |
| `req.senderName` | `users.full_name || business_name || 'Team Member'` | Display name on outbound messages. |
| `req.userRole` | `workspace_members.role` **`|| 'super_admin'`** | Fails **open** when no member row exists. |
| `req.userPermissions` | `JSON.parse(workspace_members.permissions)` **or** `DEFAULT_ROLE_PERMISSIONS[role]` | Note: a custom blob **replaces** the role defaults, it does not merge with them. |
| `req.canViewAllLeads` | `userPermissions.view_all_leads ?? DEFAULT_ROLE_PERMISSIONS[role].view_all_leads` | The one permission that is genuinely enforced. |
| `req.workspaceOwnerId` | `SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1` | The user id that owner-keyed legacy tables are filed under. |

It then applies two Command Center rules before calling `next()`:

* **Read-only impersonation** — if `req.impersonation.mode === 'read'` and the method is not
  GET/HEAD/OPTIONS, return `403 { impersonation_readonly: true }` (server.js:246–248).
* **Suspended workspace** — if `workspaces.status === 'suspended'` and this is *not* an impersonated
  session, return `403 { suspended: true }` (server.js:250–258). Note this contradicts the message the
  Command Center suspend endpoint still returns ("Login enforcement for suspended workspaces is a
  follow-up rewire", command-center.js:398) — **the code is ahead of that string; believe the code.**

---

### The roles and the permission matrix — **PARTIAL, mostly decorative**

Four roles are hard-coded in `DEFAULT_ROLE_PERMISSIONS` (server.js:184–189) with nine boolean keys:

| Role | view_all_leads | create_lead | edit_lead | delete_lead | view_reports | manage_settings | manage_team | manage_invoices | manage_whatsapp |
|---|---|---|---|---|---|---|---|---|---|
| `super_admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `manager` | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ |
| `user` | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**Of these nine keys, exactly two are enforced anywhere in the backend.**

* `view_all_leads`, via `req.canViewAllLeads`, which appends `AND assigned_to = ?` to the leads list
  (server.js:1752), the trash list (server.js:1806), bulk-status (server.js:2247), the dashboard
  aggregate (server.js:3252–3253), the reminders feed (server.js:5864) and universal search
  (search.js:42–43); and which gates `getScopedLead()`.
* `manage_settings`, in exactly one place: `canManage(req)` in media-studio.js:353–359, guarding
  archive/delete of media projects.

`create_lead`, `edit_lead`, `delete_lead`, `view_reports`, `manage_team`, `manage_invoices` and
`manage_whatsapp` are **never read by any server-side check** (verified by grepping `req.userPermissions`
across `backend/*.js` — the only hits are the middleware itself, media-studio.js:358, and test files).
The frontend does not gate on them either: the only file in `wappflow-web/src` that mentions
`manage_team` / `manage_invoices` is `app/team/page.js`, which uses them purely to render toggle labels.

Where role checks *do* exist they are coarse, literal `['super_admin','admin'].includes(req.userRole)`
string tests, at: `PUT /api/workspace` (3504), `POST /api/workspace/invite` (3516),
`PUT /api/workspace/members/:id` (3629), `DELETE /api/workspace/members/:id` (3645),
`PUT /api/settings/email-smtp` (3712), `PUT /api/settings/email-imap` (3763), and
`PUT /api/workspace/role-permissions` (super_admin only, 3685).

**Classification:** the four-role model is SHIPPED at the "who can manage the team and settings" level;
the nine-permission matrix is **SOLD-NOT-BUILT** for seven of its nine switches, and the per-workspace
role customisation stored in `workspace_role_permissions` is **STUB** (written, read back for display,
never consulted by `auth`).

---

### Multi-tenancy: how isolation is actually enforced

There is no ORM, no row-level security, and no query builder that injects a tenant clause. Isolation is
**per-query, by hand**, and rests on four conventions.

**1. The `workspace_id` column convention.** Business tables carry `workspace_id TEXT` and every read
adds `WHERE workspace_id = ?` bound to `req.workspaceId`. Usage density gives a rough map of how
consistently each module follows it:

| Module | `req.workspaceId` refs | `req.workspaceOwnerId` refs | `req.userId` refs |
|---|---|---|---|
| `server.js` | 198 | 69 | 118 |
| `media-studio.js` | 193 | 0 | 49 |
| `contracts-studio.js` | 65 | 1 | 29 |
| `comms.js` | 38 | 0 | 32 |
| `booking.js` | 21 | 0 | 2 |
| `print-store.js` | 8 | 0 | 0 |
| `payments.js` | 4 | 1 | 2 |

**2. `getScopedLead(req, leadId)`** (server.js:270–278). The CRM's lead record is the hub every other
object hangs off, so sub-resource routes were the leak-prone surface. This helper is the single fix:

```js
const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(leadId, req.workspaceId);
if (!lead) return null;
if (!req.canViewAllLeads && lead.assigned_to !== req.userId) return null;
return lead;
```

It is called **41 times** in server.js (messages, notes, reminders, history, invoices-of-lead, merge,
status changes, media upload…). It deliberately collapses "wrong tenant" and "not yours" into the same
`null`, so callers return a uniform 404 and the API does not leak record existence. It is **not** used
by media-studio.js, contracts-studio.js or booking.js, which do their own `AND workspace_id = ?` joins.

**3. `req.workspaceOwnerId` — the owner-keyed legacy tables.** A set of tables was built before
workspaces existed and is still keyed by a **user id**, specifically the workspace's super_admin. Those
tables are: `company_settings`, `tags`, `message_presets`, `email_templates`, `auto_reply_rules`,
`email_smtp_settings`, `email_imap_settings`, and legacy `team_members`. Every read/write against them
binds `req.workspaceOwnerId`, e.g. `SELECT * FROM tags WHERE user_id = ?` (server.js:3034). This works,
but it means "the workspace's tags" is defined as "the tags belonging to whichever super_admin the
database returns first" — see Concerns.

**4. The legacy dual-read predicate.** `invoices` and `email_workflows` were re-keyed from user to
workspace in the Foundation Sprint (PROP-001, batch 5). The migration is *additive*: the columns were
added by `safeAlter` (server.js:730–731), an index created, and an **idempotent boot backfill** runs on
every start (server.js:735–744):

```sql
UPDATE invoices SET workspace_id = COALESCE(
  (SELECT u.workspace_id FROM users u WHERE u.id = invoices.user_id), user_id
) WHERE workspace_id IS NULL OR workspace_id = ''
```

Until `user_id` is retired, every read of those two tables uses the dual predicate:

```sql
(workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
```

bound `(req.workspaceId, req.workspaceOwnerId)`. It appears **13 times** — server.js:2003, 2018, 2044,
2073, 2076, 2556, 2570, 2581, 2592, 2647, 2657, 2679, 2714, 2740 — plus once in payments.js:165. A
regression test (`test-batch5-scope.js:75,133,135`) asserts the shape and a minimum occurrence count, so
anyone who "simplifies" one of these will fail CI.

**Anyone planning work here must know why this predicate exists**: legacy workspaces were created by the
boot migration at server.js:934–955 with `const wsId = user.id` — *the workspace id literally equals the
owner's user id*. For those tenants `req.workspaceId === req.workspaceOwnerId` and both arms of the
predicate coincide. For workspaces created by `POST /api/auth/register` (server.js:1259) the workspace
id is a fresh UUID **distinct** from the user id, and the two arms diverge. Invoices are written with
both (`.run(id, req.workspaceOwnerId, req.workspaceId, ...)`, server.js:2625). So the codebase contains
two structurally different generations of tenant, and code that assumes `workspaceId === ownerId` will
work in dev against a migrated database and silently break for new signups.

---

### Sign-in surfaces

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | none | Creates `workspaces` → `users` (role `'owner'`) → `workspace_members` (`super_admin`, `active`) → `company_settings`, then returns a session. **No email format check, no password length check, no dedicated rate limiter.** Every failure is reported as `400 "Email already exists"` (server.js:1282). |
| POST | `/api/auth/login` | none, `loginLimiter` | 20 failed attempts / 15 min / IP, `skipSuccessfulRequests: true` (server.js:93–101). Email match is **case-sensitive** (`WHERE email = ?`). |
| POST | `/api/auth/google` | none | Verifies a Google **ID token** via `google-auth-library` against `GOOGLE_CLIENT_ID`. Matches on `google_id` then falls back to `email`. New users get a bcrypt hash of a random `generateId()` as an unusable password. Legacy users without a workspace get one created inline with `wsId = user.id`. Frontend uses `@react-oauth/google`'s `<GoogleLogin>` on `app/login/page.js:156` and `app/signup/page.js:152`, gated on `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; when unset it renders a disabled "Google sign-in not configured" button. **SHIPPED.** |
| POST | `/api/auth/forgot-password` | none, `loginLimiter` | Neutral response always; sha256-hashed single-use token, 60 min TTL; supersedes outstanding links; sends via platform `SMTP_*` env, falling back to the workspace owner's SMTP. **SHIPPED (new).** |
| GET | `/api/auth/reset-password/:token` | none | `{ valid: bool }` pre-check for the UI. |
| POST | `/api/auth/reset-password` | none, `loginLimiter` | ≥8 chars, bumps `users.token_version` (revoking old sessions), deliberately does *not* log the user in. |
| GET | `/api/auth/me` | `auth` | Returns `{ user, company, workspace, memberRole, impersonation }`. |
| PUT | `/api/auth/password` | `auth` | Requires current password; ≥6 chars; **does not bump `token_version`**. |
| POST | `/api/sso/flux-token` | `auth` | Mints a 60-second HS256 token for the sibling "Flux" product, signed with `FLUX_SSO_SECRET` (≥16 chars required). Claims: `iss:'wappflow'`, `aud:'flux'`, `wf_workspace_id`, `wf_user_id`, `email`, `name`, `plan`. Unlock tiers checked against `workspace_plan.plan` ∈ {growth, enterprise, pro, business} — **note these keys do not match the live plan catalog** (`creator`/`studio`/`studio_plus`/`enterprise`), so `unlocked` is false for almost every real workspace. |

Frontend `lib/api.js` wraps these as `authAPI` (line 31) and `inviteAPI` (line 171); an axios response
interceptor (lib/api.js:17–28) clears the session and hard-redirects to `/login` on any 401 outside the
auth pages.

---

### Invitations and team management

| Method | Endpoint | Guard | Behaviour |
|---|---|---|---|
| GET | `/api/workspace` | `auth` | Workspace row + all members (ordered super_admin→admin→manager→user) + `rolePermissions` map + `currentUserRole`. |
| PUT | `/api/workspace` | super_admin/admin | Rename. |
| POST | `/api/workspace/invite` | super_admin/admin | Role must be `admin`\|`manager`\|`user`. Seat limit checked via `pricing.canCreate(db, ws, 'users')` → `402 {upgrade:true}` when exceeded. |
| PUT | `/api/workspace/members/:id` | super_admin/admin | Change `role` and/or `permissions`. Cannot modify or assign `super_admin` unless you are one. **`role` is not validated against an allow-list.** |
| DELETE | `/api/workspace/members/:id` | super_admin/admin | **Hard delete, deliberately** — the code comment (server.js:3650–3657) argues that soft-deleting an auth table would let a removed member keep authenticating. Also sets `users.workspace_id = NULL`. Cannot remove a super_admin or yourself. |
| GET/PUT | `/api/workspace/role-permissions` | any / super_admin | Read merges `DEFAULT_ROLE_PERMISSIONS` with saved rows; write upserts into `workspace_role_permissions`. **Never enforced.** |
| GET | `/api/auth/invite-info/:token` | none | `{ email, workspace_name, role }` for a `pending` invite. |
| POST | `/api/auth/accept-invite` | none | Creates the user (or resets an existing one's password), flips the member row to `active`, nulls the token, sets `users.workspace_id`, returns a session. |
| GET | `/api/team` … DELETE `/api/team/:id` | `auth`, **no role check** | Legacy shim. GET returns `workspace_members` as `members` plus `team_members` as `legacyMembers`. |
| GET | `/api/audit-logs` | `auth`, **no role check** | Workspace-scoped audit feed with `limit`/`offset`. |
| GET | `/api/workspace/export` | `auth`, **no role check** | Full JSON dump of the tenant: leads, notes, reminders, contact_history, messages, invoices, tags, bookings… |

Two invite paths exist inside `POST /api/workspace/invite` (server.js:3524–3536):

* **Email not yet registered** → a `pending` member row with `invite_token = generateId() + generateId()`
  and an emailed link `${FRONTEND_URL}/accept-invite?token=…`. The email is sent through the *workspace
  owner's* SMTP settings; if none are configured the endpoint still returns `invite_link` and the UI
  shows a copyable link instead (`app/team/page.js` InviteModal). Invite tokens have **no expiry**.
* **Email already has an account** → the user is added as an `active` member immediately **and**
  `UPDATE users SET workspace_id = ? WHERE id = ?` is executed. See Concerns — this is a tenant-takeover
  primitive.

The Team UI (`wappflow-web/src/app/team/page.js`, 722 lines) has three tabs — Members, Role Permissions,
Audit — and is itself gated behind the `team_collaboration` plan feature via `usePlan()` +
`<LockedOverlay>` (page.js:502–512). It loads `workspaceAPI.get()`, `auditAPI.getLogs()` and
`workspaceAPI.getRolePermissions()` with `Promise.allSettled` so one failure doesn't blank the page.

---

### Impersonation and the Command Center identity tier

`backend/command-center.js` (916 lines) is a **platform-scoped** control plane that deliberately reads
across all tenants. It is mounted last, at **server.js:6544**. (The note in the older
`DESKTOP-FINAL-VISION.md` that Command Center is unmounted dead code is **STALE** — the mount call is
right there; `PRODUCT-AUDIT.md:307` already corrects it, though it cites the pre-growth line 5594.)

It does *not* use the `auth` middleware. It has:

* **Its own identity table** `cc_admins`, seeded on first boot from `CC_FOUNDER_EMAIL` /
  `CC_FOUNDER_PASSWORD` (command-center.js:136–143), or via `scripts/cc-create-admin.js`.
* **A distinct JWT audience** `'command-center'` verified in `platformAuth` (command-center.js:185–201).
* **An IP allowlist** from `CC_IP_ALLOWLIST` (comma-separated). **When unset it allows everything** —
  `if (!allow.length) return true; // unset = allow (dev)` (command-center.js:177).
* **Six platform roles** (`founder`, `ops`, `finance`, `support`, `cs`, `readonly`) mapping to eleven
  granular permissions: `view`, `manage_plans`, `manage_flags`, `manage_overrides`, `manage_billing`,
  `impersonate`, `impersonate_write`, `run_sql`, `manage_support`, `bulk_actions`, `manage_admins`
  (command-center.js:27–40), enforced by `requirePerm(perm)`.
* **Step-up auth** — `POST /api/cc/step-up` re-verifies the password for a 5-minute `elevated: true`
  token used by the SQL console.
* **A full audit spine** `ccAudit()` writing `cc_audit` rows with before/after JSON, reason, IP and UA.

**Impersonation flow (SHIPPED, read-only by default):**

1. `POST /api/cc/workspaces/:id/impersonate` (command-center.js:438, `requirePerm('impersonate')`)
   resolves the workspace's super_admin, writes a `cc_impersonations` row and a `cc_audit` entry, then
   mints a **30-minute** token signed with the *same* `JWT_SECRET` as normal user tokens so the core
   `auth` accepts it. Write mode requires the separate `impersonate_write` permission; otherwise
   `mode: 'read'`.
2. The token is delivered to `/impersonate?token=…` (`wappflow-web/src/app/impersonate/page.js`). That
   page stashes the admin's own session under `cc_prev_token` / `cc_prev_user` / `cc_prev_workspace`,
   installs the impersonation token as `token`, calls `/auth/me` to populate `user` + `workspace`, sets
   `cc_impersonating='1'`, `cc_imp_name`, `cc_imp_mode`, and redirects to `/dashboard`.
3. `components/ImpersonationBanner.js` renders a fixed bottom bar — purple for read mode, **red for
   write mode** — with an "Exit impersonation" button that restores the stashed session and returns to
   `/control/customers`. It is mounted globally at `app/providers.js:23`. (`PRODUCT-AUDIT.md:307` calls
   this banner "unmounted" — **STALE; the code disagrees.**)
4. Server-side, `auth` blocks all non-GET methods when `mode === 'read'` (server.js:246–248) and lets
   impersonated sessions through the suspended-workspace gate so support can investigate.

`backend/grant-master.js` (99 lines) is the deliberate counterpart: a **CLI-only** escalation. It
resolves the same database the server uses (parsing `backend/.env` itself so `NODE_ENV` is right, then
`DATA_DIR || (production ? '/data' : __dirname)` + `wappflow.db`), looks up the account by
`lower(email)`, prints a dry-run diff, and only with `--apply` upserts `workspace_plan.plan =
'enterprise'`. Its header states the design rule explicitly: *"Deliberately a script, not an API route:
nothing reachable over HTTP should be able to hand out unlimited entitlements."* That rule is currently
violated — see the first item under Concerns.

---

### Configuration surface

| Variable | Consumer | Default / effect if unset |
|---|---|---|
| `JWT_SECRET` | all token signing/verification | falls back to a **hard-coded literal** |
| `DATA_DIR` | SQLite path + uploads root | `'/data'` in production, `__dirname` otherwise |
| `FRONTEND_URL` | CORS origin, invite links, reset links, module `clientBaseUrl` | CORS becomes `'*'`; links become `http://localhost:3000` |
| `TRUST_PROXY` | `app.set('trust proxy', …)` | `1` (one nginx hop) |
| `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google sign-in (server verify / client button) | button renders disabled |
| `GOOGLE_CLIENT_SECRET` | Google **Calendar** OAuth only (server.js:5946) | calendar connect throws |
| `FLUX_SSO_SECRET` / `FLUX_URL` | cross-product SSO | mint throws; base defaults to `https://flux.remoteops.co` |
| `CC_FOUNDER_EMAIL` / `CC_FOUNDER_PASSWORD` | first `cc_admins` seed | no admin is created |
| `CC_IP_ALLOWLIST` | Command Center network gate | **allows every IP** |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | platform mail for password resets | falls back to the studio's own SMTP, else logs an operator error |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | web push | **hard-coded keys are committed as the default** (server.js:22–23) |

---

### Concerns — bugs, security weaknesses, data-integrity risks and smells

*Read-only observations. Nothing here was fixed.*

**S1 — Any workspace member can grant themselves any plan (privilege/billing bypass).**
`PUT /api/workspace/plan` (server.js:5453) is guarded by `auth` alone: no role check, no ownership
check, no platform-admin check. Its body is written straight into `workspace_plan`, including the
free-form `features` and `limits` JSON, which `entitlements.getEntitlements()` merges *over* the plan
tables (entitlements.js:298–299). A `user`-role member can `PUT {"plan":"enterprise"}` and unlock every
paid feature and limit. It is exposed on the client as `planAPI.update` (lib/api.js:227). This directly
contradicts grant-master.js's stated invariant.

**S2 — Inviting an existing user hijacks them out of their own workspace.**
`POST /api/workspace/invite` runs `UPDATE users SET workspace_id = ? WHERE id = ?` for any email that
already has an account (server.js:3530). There is no consent step, no notification, and no check that
the target isn't already the owner of another tenant. Consequences: (a) the victim's next request
resolves `req.workspaceId` to the attacker's workspace; (b) the victim's own workspace becomes
unreachable — all of their leads, invoices and media are orphaned behind a `workspace_id` nobody can
authenticate into; (c) `DELETE /api/workspace/members/:id` then sets their `workspace_id` to NULL, at
which point `auth`'s fallback (`|| decoded.userId`) drops them into an empty phantom workspace with
`req.userRole` defaulting to `'super_admin'`. This is the single highest-severity defect in this layer.

**S3 — Security tokens come from `Math.random()`.**
`generateId()` (server.js:1111) is the classic `'xxxxxxxx-xxxx-4xxx-…'.replace(/[xy]/g, …Math.random()…)`
UUID-v4 shim. It is used for `workspace_members.invite_token` (`generateId()+generateId()`,
server.js:3521) and `team_members.invite_token` (server.js:3658), as well as every entity id. V8's
`Math.random` is xorshift128+ — an attacker who harvests a handful of ids the API hands them back (their
own lead/invoice ids) can recover the generator state and predict subsequent invite tokens, then accept
an invite to a workspace they were never sent one for. `crypto.randomBytes` is already imported in this
file (server.js:1434) and *is* used correctly by account-recovery.js:124. Invite tokens additionally
have **no expiry** and no `expires_at` column.

**S4 — Role-permission customisation is unenforced.**
`workspace_role_permissions` is written by `PUT /api/workspace/role-permissions` (server.js:3683) and read
back by two GET routes for display, but the `auth` middleware never queries it (server.js:231–237 reads
only the per-member blob and the hard-coded `DEFAULT_ROLE_PERMISSIONS`). A super_admin who turns off
"Delete leads" for managers in the Team UI gets a success toast and zero behavioural change.

**S5 — Seven of nine permissions are never checked at all.** See the matrix section above. Any
authenticated member — including role `user` — can call `GET /api/workspace/export` (a complete JSON dump
of the tenant, server.js:3017) and `GET /api/audit-logs` (server.js:3002), neither of which has a role
check. `manage_invoices` does not protect any invoice route; `delete_lead` does not protect
`DELETE /api/leads/:id`.

**S6 — A custom permissions blob silently erases the role defaults.**
`req.userPermissions = member.permissions ? JSON.parse(member.permissions) : DEFAULT_ROLE_PERMISSIONS[role]`
(server.js:233) is a replace, not a merge. The moment an admin toggles one switch for a member, every
other key becomes `undefined`. `canViewAllLeads` survives this by an explicit `??` fallback
(server.js:236–237); nothing else does.

**S7 — `req.workspaceOwnerId` is non-deterministic with two super_admins.**
`SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1` has no
`ORDER BY` (server.js:240). Since `company_settings`, `tags`, `message_presets`, `email_templates`,
`auto_reply_rules` and the SMTP/IMAP credentials are all filed under that id, promoting a second
super_admin — or deleting rows in a way that changes SQLite's scan order — can make an entire workspace's
tags, presets, branding and mail credentials appear to vanish. It also means `PUT /api/workspace/members/:id`
promoting someone to super_admin is a *data-visibility* operation, not just an authorization one.

**S8 — No member row means `super_admin`.** `req.userRole = member?.role || 'super_admin'`
(server.js:232) fails **open**. Any authenticated user whose `workspace_members` row is missing —
because they were removed, because a migration didn't write one, or because `users.workspace_id` points
somewhere with no matching seat — is treated as the owner of whatever `req.workspaceId` resolves to.

**S9 — Non-expiring tokens in query strings.** `auth` accepts `?token=` (server.js:203) and workspace
tokens have no `exp`. A single leaked nginx log line or shared SSE URL is a permanent credential. The new
`token_version` mechanism helps only if the user performs a *reset*; the in-app password **change**
(server.js:1307) does not bump it.

**S10 — Committed default secrets.** `JWT_SECRET` falls back to `'your-secret-key-change-in-production'`
(server.js:180) and both VAPID keys are hard-coded literals (server.js:22–23). `CC_IP_ALLOWLIST` unset
means the Command Center is reachable from anywhere.

**S11 — Case-sensitive email identity.** `POST /api/auth/login` and `POST /api/auth/google` match
`WHERE email = ?` (server.js:1290, 1394) while `account-recovery.js:117` uses `lower(email) = ?` and
`grant-master.js:64` uses `lower(email) = lower(?)`, and `users.email` is a plain `TEXT UNIQUE` (SQLite
default = case-sensitive). `Sami@x.com` and `sami@x.com` are two separate accounts; register with one
casing and sign in with the other and you get "Invalid credentials" forever, while password reset would
find you.

**S12 — The `team_members` legacy table is wired to the wrong key.**
`POST /api/team` inserts with `workspace_id = req.userId` (server.js:1660) — the *caller's user id*, not
the workspace — while `GET /api/team` (server.js:1655) and the leads-list assignee join (server.js:1757)
read it with `workspace_id = req.workspaceOwnerId`. For legacy tenants (workspace id == owner id) these
coincide by accident; for post-migration tenants, or when a non-owner adds a "team member", the row is
written where nothing will ever read it. `PUT`/`DELETE /api/team/:id` have the same mismatch, and none of
the four routes has a role check. The frontend Team page does not use `teamAPI` at all — only
`app/leads/[id]/page.js:830` and `app/settings/page.js:15` still import it.

**S13 — `PUT /api/workspace/members/:id` does not validate `role`.** Any string is accepted
(server.js:3636). Unknown roles fail closed at authorization time (`DEFAULT_ROLE_PERMISSIONS[unknown]` is
`undefined` → `{}`, and the literal `includes()` checks reject it), but they corrupt the UI's role
ordering and produce a member nobody can restore without a database edit.

**S14 — `POST /api/auth/register` swallows every error as "Email already exists"** (server.js:1282), and
performs no email-format or password-strength validation. A disk error, a constraint violation on
`workspaces`, and a genuine duplicate are indistinguishable to the caller and to the operator.

**S15 — Architectural smell: one user, one workspace.** `users.workspace_id` being scalar makes
`workspace_members` a lie about the model's expressiveness. Any future work on agencies, multi-brand
studios, or contractors serving several studios is a schema change plus a token change (the workspace
would have to move into the JWT or a switcher endpoint), not a feature.

**S16 — Stale doc references to correct here.** `PRODUCT-AUDIT.md:307` cites `server.js:5594` for the
Command Center mount (now 6544) and calls the impersonation banner "unmounted" (it is mounted at
`app/providers.js:23`). `command-center.js:30` claims per-workspace modules are gated "via the
moduleGate middleware in server.js" — **no `moduleGate` exists anywhere in the repo**, so the
Command Center's per-workspace module toggles are written to `entitlement_overrides` and never enforced
at the route level. `command-center.js:398` still tells the admin that suspended-workspace login
enforcement is a follow-up; `auth` (server.js:250–258) already enforces it.

### UNKNOWNs

* **UNKNOWN: whether `JWT_SECRET`, `CC_IP_ALLOWLIST` and the VAPID keys are actually set in
  production.** `backend/.env` is gitignored and not present in the tree; `backend/.env.example` lists
  `JWT_SECRET=CHANGE_THIS_TO_LONG_RANDOM_SECRET` but does not mention `CC_*`, `SMTP_*`, `FLUX_SSO_SECRET`
  or `TRUST_PROXY` at all. The example file is itself stale relative to the code.
* **UNKNOWN: how many production workspaces are "legacy" (workspace_id == owner user_id) versus
  "modern" (fresh UUID).** This determines how much of the dual-read predicate and the
  `workspaceOwnerId` convention can safely be retired, and cannot be answered without the live database
  at `/data/wappflow.db`.
* **UNKNOWN: whether the account-recovery module and `token_version` are deployed.** Both are
  **untracked/uncommitted** in the working tree as of this read (`?? backend/account-recovery.js`,
  `M backend/server.js`), and the repo's deploy story is a manual `pm2` step by the owner.
* **UNKNOWN: whether any rate limiting protects `/api/auth/register` or `/api/workspace/invite`.**
  Only the global 500-requests-per-15-min-per-IP limiter applies; there is no per-account or
  per-workspace throttle on invite creation.


---


<!-- ── 13-command-center.md ─────────────────────────────────────────── -->

## Command Center — the platform control plane

### What this is for

Every other module in WappFlow serves a *studio* — a photography or creative business that logs in, manages leads, sends contracts, delivers galleries. The Command Center serves the **operator of the platform itself**: the founder and whoever does ops, support, and finance for WappFlow the company. It is the internal back office. From it you can see every workspace on the system at once, look inside any one of them, change what plan they are on, turn individual product modules on or off for one customer, flip a feature flag for a percentage of the fleet, log in *as* a customer to reproduce a bug, browse the raw SQLite database read-only, and read an append-only audit trail of everything any admin did.

It is deliberately walled off from the product. It lives on the URL prefix `/control` in the Next.js app (`wappflow-web/src/app/control/**`), talks to a separate API namespace `/api/cc/*`, and authenticates against its **own identity table** (`cc_admins`) that has no relationship to `users` or `workspace_members`. A studio owner has no route into it and no credential that works there.

Two domain words used throughout: a **workspace** is one customer tenant (a studio) — nearly every product table carries a `workspace_id`; an **entitlement** is the resolved answer to "is feature X on, and what is limit Y" for a given workspace, computed by `backend/entitlements.js` from the plan catalog plus per-workspace overrides plus feature flags.

### Is it actually live? Yes — the "dead code" claim is stale

`PRODUCT-AUDIT.md` and the older `DESKTOP-FINAL-VISION.md` note both record a period when the Command Center was unmounted dead code. **That is no longer true, and the audit itself already corrects it** (`PRODUCT-AUDIT.md:307`). Verified against the current code:

- `backend/server.js:6571` calls `require('./command-center')(app, db, { auth, generateId, broadcastToUser, broadcastToWorkspace, logAudit, JWT_SECRET, sendEmail })`. It is mounted **last**, just before the 404 handler and `app.listen` (server.js is 6595 lines total), specifically so every `ms_*` / `cs_*` table already exists when its `ensureSchema` runs.
- `backend/command-center.js:879-893` mounts six sub-modules inside itself: `cc-explorer`, `cc-desktop`, `cc-storage`, `cc-support`, `cc-timemachine`, `cc-reports`. Each is wrapped in `try/catch` so a broken sub-module logs and is skipped rather than taking the server down.
- 58 `/api/cc/*` routes plus 2 desktop-facing `/api/desktop/*` routes are registered.
- The frontend has 18 pages under `app/control/` plus a login page, all wrapped by `ControlShell` (`wappflow-web/src/components/control/ControlShell.js`), which enforces the client-side auth guard.

**Status: SHIPPED and reachable.** The one true statement in the "dead code" family is that `/control` is *unlinked* from the product — no NavBar entry, no link anywhere in `wappflow-web/src` outside the control tree itself. You reach it by typing the URL, or from the Electron desktop shell, which has a founder-gated nav entry (`wappflow-desktop/src/renderer/shell.js:26`, `{ id: 'command', route: '/control', founderOnly: true }`). UNKNOWN: whether a Command Center admin account currently exists in the production database — that requires DB access I do not have.

### The `cc_admins` identity model, and how it differs from workspace auth

| Dimension | Workspace auth (`auth` in server.js:202) | Platform auth (`platformAuth` in command-center.js:185) |
|---|---|---|
| Identity table | `users` + `workspace_members` | `cc_admins` |
| JWT claims | `{ userId, tv }` (`tv` = token_version, for revocation) | `{ adminId, aud: 'command-center', elevated? }` |
| Signing secret | `JWT_SECRET` | **the same `JWT_SECRET`** — separation is by the `aud` claim only |
| Expiry | none (revoked via `token_version`) | 12h (`command-center.js:257`); step-up token 5m |
| Network restriction | none | `CC_IP_ALLOWLIST` env, checked on login *and* every request |
| Roles | `super_admin` / `admin` / `user` + per-member permission JSON | `founder` / `ops` / `finance` / `support` / `cs` / `readonly` |
| Browser storage | `localStorage.token` | `localStorage.cc_token` (deliberately a different key so the two sessions never collide — `lib/ccApi.js:14`) |

Roles map to a flat permission set (`command-center.js:27-40`). The declared permissions are `view, manage_plans, manage_flags, manage_overrides, manage_billing, impersonate, impersonate_write, run_sql, manage_support, bulk_actions, manage_admins`; `founder` gets all of them. A per-admin `cc_permissions` JSON column can override the role defaults (`permsFor`, :43).

Bootstrap has two paths: `scripts/cc-create-admin.js <email> <password> [role]` (the documented way), or auto-seeding a founder from `CC_FOUNDER_EMAIL` + `CC_FOUNDER_PASSWORD` on first boot when `cc_admins` is empty (`command-center.js:138-143`).

A **step-up** flow exists (`POST /api/cc/step-up`, :268): re-enter your password, get a 5-minute token carrying `elevated: true`. Only the read-only SQL console consumes it.

### Tables it owns

`ensureSchema` (command-center.js:62-146) creates the whole namespace, and also calls `entitlements.ensureSchema(db)` first, so the plan/flag tables exist too.

| Table | Key columns | Purpose | Reality check |
|---|---|---|---|
| `cc_admins` | id, email (unique), password_hash (bcrypt-10), cc_role, cc_permissions, mfa_secret, status, last_login_at | Platform identity | `mfa_secret` column exists; **no MFA code anywhere** |
| `cc_audit` | id, admin_id, action, target_type, target_id, workspace_id, **before**, **after**, reason, ip, ua | The audit spine, with JSON before/after diffs | SHIPPED — written on every mutating route |
| `cc_impersonations` | id, admin_id, workspace_id, audit_id, mode, started_at, **ended_at**, reason | Impersonation session log | `ended_at` is never written — sessions are never closed |
| `platform_events` | id, ts, workspace_id, actor_type, actor_id, type, entity_type, entity_id, payload, source | The event spine feeding the live stream | Only `emit()` inside command-center.js writes it — **no product module emits** |
| `ai_usage` | id, ts, workspace_id, user_id, feature, provider, model, prompt_tokens, completion_tokens, latency_ms, est_cost, success | AI metering ledger | Written by `recordAiUsage` at server.js:4076-4083 — genuinely live |
| `workspace_usage_daily` | (workspace_id, date) PK, leads, messages, ai_calls, ai_cost, storage_bytes, active_users, contracts, bookings, galleries | Daily usage rollup | **Write-only — no endpoint reads it** |
| `workspace_scores` | workspace_id PK, health, churn, expansion, activity, risk_factors (JSON), computed_at | Health scoring | SHIPPED, feeds Health/Adoption/Inbox |
| `cc_tickets` / `cc_ticket_comments` | id, workspace_id, kind, priority, status, subject, body / ticket_id, body, internal | Internal ticketing | SHIPPED but internal-only |
| `cc_notes` | id, workspace_id, admin_id, body, pinned | Per-workspace admin notes | API exists; **no UI renders or writes them** |
| `cc_inbox` | id, kind, workspace_id, severity, title, body, status, link | Persisted founder-inbox items | **Nothing ever INSERTs into it** |
| `cc_reports` | id, name, definition (JSON), schedule, recipients (JSON), last_run_at | Saved/scheduled reports | SHIPPED |
| `cc_saved_views` | id, admin_id, surface, name, query | Saved filter sets | **Created and never touched again — dead table** |
| `cc_grace_periods` | id, workspace_id, days, reason, starts_at, ends_at, status | Temporary limit reprieve | Created, displayed, auto-expired — but **no enforcement path reads it** |
| `cc_desktops` / `cc_desktop_policy` | device_id, workspace_id, version, platform, last_sync / latest_version, min_version, blocked_versions | Desktop fleet + version governance | Created in `cc-desktop.js:25-37` |

Plus a guarded `ALTER TABLE workspaces ADD COLUMN status TEXT DEFAULT 'active'` (:133-134) for suspend/restore.

### Endpoint inventory

All routes below sit behind `platformAuth`. Where a permission is listed, `requirePerm(...)` gates it as well.

| Method + path | Perm | Notes |
|---|---|---|
| `POST /api/cc/login` | — | bcrypt compare, 12h token, audited as `admin_login` |
| `GET /api/cc/me` | — | returns role + resolved permissions |
| `POST /api/cc/step-up` | — | 5-min `elevated` token |
| `GET /api/cc/overview` | view | totals + **implied** MRR/ARR from plan list price |
| `GET /api/cc/workspaces` | view | q/plan/status filters, whitelisted sort column, limit≤200 + offset |
| `GET /api/cc/workspaces/:id` | view | Workspace 360: owner, members, plan, entitlements, counts, overrides, grace, notes, scores, last 50 events |
| `POST /api/cc/workspaces/:id/suspend` · `/restore` | manage_overrides | flips `workspaces.status` |
| `POST /api/cc/workspaces/:id/notes` | *(none)* | any admin, incl. `readonly`, can write |
| `POST /api/cc/workspaces/:id/plan` | manage_plans | validates against `plans`, invalidates resolver, broadcasts `plan_updated` |
| `POST /api/cc/workspaces/:id/impersonate` | impersonate | mints a **normal user JWT** with an `imp` claim, 30 min |
| `GET/POST /api/cc/plans`, `PUT /api/cc/plans/:key` | manage_plans | config-as-data; PUT replaces limits/features/prices in one transaction |
| `GET/POST /api/cc/flags`, `PUT /api/cc/flags/:key`, `POST /api/cc/flags/:key/assign` | manage_flags | assign scope = `global` \| `workspace` \| user |
| `GET/POST /api/cc/workspaces/:id/overrides`, `DELETE /api/cc/overrides/:id` | manage_overrides | override `kind` ∈ limit \| feature \| module |
| `POST /api/cc/workspaces/:id/grace` | manage_overrides | writes `cc_grace_periods` |
| `POST /api/cc/workspaces/:id/modules/:module` | manage_overrides | module ∈ media_studio, contracts_studio, booking, print_store, payments |
| `GET /api/cc/events` · `GET /api/cc/events/stream` | view | SSE, **unnamed frames** (`data: {type,…}`) matching the platform-wide pattern |
| `GET /api/cc/audit` · `GET /api/cc/audit/:id` | view | filters: admin_id, action, target_type, workspace_id |
| `GET/PUT /api/cc/config/:namespace` | — / manage_plans | key-value store in `cc_config` |
| `GET /api/cc/search?q=` | view | cross-tenant search over workspaces, users, leads, contracts, projects |
| `POST /api/cc/rollup/run` | *(none)* | forces the metering rollup + scoring |
| `GET /api/cc/health` · `GET /api/cc/adoption` | view | scores table; module-adoption percentages |
| `GET /api/cc/inbox` · `POST /api/cc/inbox/:id/dismiss` | view | computed signals + (unreachable) persisted items |
| `GET /api/cc/ai` | view | totals, by-provider, by-feature, 60 most recent calls |
| `GET /api/cc/export?dataset=&format=` | view | datasets: customers, health, audit, ai_usage; CSV or JSON, capped 10 000, **auth via `?token=`** |
| `GET /api/cc/db/tables` · `/db/tables/:name` | *(none beyond platformAuth)* | full row browsing of any table |
| `POST /api/cc/db/query` | run_sql **+ elevated** | read-only SQL console |
| `GET/POST /api/cc/tickets`, `GET/PUT /api/cc/tickets/:id`, `POST /api/cc/tickets/:id/comment`, `GET /api/cc/support/stats` | manage_support on writes | internal ticketing |
| `GET /api/cc/timemachine?type=workspace&id=&as_of=` | view | best-effort reconstruction |
| `GET/POST /api/cc/reports`, `DELETE /api/cc/reports/:id`, `POST /api/cc/reports/:id/run` | manage_support on create/delete | saved + scheduled reports |
| `GET /api/cc/storage/{overview,workspaces,by-plan,fastest-growing,workspace/:id}` | view | storage dashboards |
| `GET /api/cc/desktop/fleet` · `POST /api/cc/desktop/policy` | — / manage_flags | fleet + version governance |
| `POST /api/desktop/report` · `GET /api/desktop/update-policy` | *workspace* `auth` | the desktop client's own check-in pair |

### Surface-by-surface maturity

| Surface | Page | Verdict |
|---|---|---|
| Login + session | `control/login/page.js` | **SHIPPED** |
| Executive Overview | `control/page.js` | **PARTIAL** — real counts, but "Implied MRR" is `Σ plan list price × workspaces` with no billing behind it (the endpoint says so in its own `note` field, :311). Prices are PKR (`entitlements.js`, `PLAN_MONTHLY_PRICE = { creator: 7999, … }`) rendered with a `$` sign by `fmtMoney` (`ccApi.js:110`) |
| Customers list | `control/customers/page.js` | **PARTIAL** — search/filter/sort/paginate/export all work, but the plan filter dropdown offers `free/starter/growth/enterprise` (:40), tiers that no longer exist; the live catalog is `creator/studio/studio_plus/enterprise`. Those filters silently return nothing |
| Workspace 360 | `control/customers/[id]/page.js` | **PARTIAL** — rich and genuinely wired (plan change, suspend/restore, grace, module toggles, overrides, impersonate). But it destructures `notes` (:26) and never renders them, and every destructive action is driven by `window.prompt` (:44, :45, :112-118) with no confirm dialog and no step-up |
| Customer Health | `control/health/page.js` | **SHIPPED** — scores, risk-factor chips, sort, on-demand recompute, CSV export |
| Adoption | `control/adoption/page.js` | **SHIPPED** (thin: 5 module bars + top-10 by health) |
| Founder Inbox | `control/inbox/page.js` | **PARTIAL** — computed signals (suspended, churn ≥70, expansion ≥60, 7-day AI spend) work; the persisted-item half is dead because nothing writes `cc_inbox` |
| Plans editor | `control/plans/page.js` | **SHIPPED** — edits flow into `plan_limits`/`plan_features`/`plan_prices` and take effect immediately via `entitlements.invalidate()` |
| Feature Flags | `control/flags/page.js` | **SHIPPED** backend (flags resolve inside `getEntitlements`, :238-250). The page's own copy still warns that app-wide enforcement is pending (:34) — **that copy is stale**; the resolver is live |
| Desktop Fleet | `control/desktop/page.js` | **SHIPPED** as plumbing; UNKNOWN whether any desktop has ever checked in |
| Storage | `control/storage/page.js` | **PARTIAL** — see the column-mismatch bug below |
| AI Center | `control/ai/page.js` | **SHIPPED** — real ledger, per-provider/per-feature cost, latency, success rate |
| Support | `control/support/page.js` | **PARTIAL** — a complete internal ticket tool (list, filters, detail modal, comments, stats), but there is **no customer-facing side at all**: no way for a studio to file a ticket, and no notification out |
| Reports | `control/reports/page.js` | **SHIPPED** — saved definitions, on-demand run, daily cron `0 3 * * *` drives `runDue()` |
| Event Stream | `control/events/page.js` | **PARTIAL** — SSE tail works, but the spine is nearly empty (only admin actions), and the UI exposes none of the backend's filters |
| Audit Center | `control/audit/page.js` | **SHIPPED** — expandable before/after diff per row, plus export. No filter UI despite backend support |
| Database + SQL | `control/database/page.js` | **SHIPPED** — table browser plus a genuinely hardened read-only console |
| Time Machine | `control/timemachine/page.js` | **PARTIAL by design** — only `type=workspace`, and only `status`/`plan` can roll back (`ROLLBACK_FIELDS`, cc-timemachine.js:27-31). The UI says so loudly |
| System Health (infra) | — | **SOLD-NOT-BUILT** — spec §20 promises CPU/RAM/disk/queues/cron/backups; there is no `control/system/` page and no `/api/cc/system/*` endpoint |

### The audit spine — the strongest thing here

`ccAudit(req, {...})` (command-center.js:210) writes one row per admin action with the actor, target, workspace, IP, user-agent, a free-text reason, and JSON `before`/`after` snapshots. Every mutating route calls it. The SQL console audits *rejected* attempts too (`sql_query_rejected`, cc-explorer.js:117, :149). The Audit Center renders the diff inline. This is the single best-implemented cross-cutting concern in the module, and the rest of the codebase's `logAudit` (server.js:1189, plain `audit_logs`, no before/after) is measurably weaker.

### Read-only SQL console — four independent guard layers

`cc-explorer.js` opens a **second better-sqlite3 connection with `{ readonly: true }`** against `db.name` (:31), so writes are impossible at the SQLite level. On top of that: `run_sql` permission, an `elevated` step-up token, a whitelist that the statement must *start* with (`select|with|explain|pragma|analyze`, :102), a word-boundary denylist of every write/DDL verb (:104), `.prepare()` (which rejects multi-statement input), and a `stmt.reader` check. Results capped at 1000 rows. Table names are validated against `sqlite_master` before interpolation and then double-quoted (:40-48). This is careful work.

### Metering and scoring (`cc-metering.js`)

Two idempotent derivations, cron-scheduled at `0 2 * * *` and also fired ~8s after boot (:103-107):

- `runRollup()` — per-workspace snapshot into `workspace_usage_daily`.
- `computeScores()` — writes `workspace_scores`. The formula is transparent: `activity = clamp(100 − daysSinceLastActivity × 5)`; `adoption` = fraction of 6 modules used (CRM always counts); `volume = clamp(log10(1 + leads + messages) × 33)`; `health = 0.4·activity + 0.35·adoption + 0.25·volume`; `churn = 0.6·(100−activity) + 0.4·(100−adoption)`, +10 on a low plan idle >14 days; `expansion = volume × (lowPlan ? 1 : 0.4) × (adoption/100 + 0.3)`. Risk factors are named strings (`inactive_30d`, `no_messages`, `no_contracts`, `no_projects`, `no_ai`, `low_adoption`).

### Storage: dashboard vs. enforcement

`cc-storage.js` is the founder-facing view (global bytes, by-provider, by-plan, top-20 largest, fastest-growing, per-workspace drilldown with used-vs-limit). It hardcodes Cloudflare R2 economics: `R2_RATE = 0.015` USD/GB-month and `FREE_GB = 10` (:13-14), and linearly forecasts next month's invoice from trailing-30-day growth.

`storage-enforce.js` is the enforcement half, consumed by `media-studio.js:264`. `gate(db, ws, incomingBytes)` blocks an upload that would push a workspace over its resolved `storage_gb` limit — but only when `pricing_config.enforcement != 'off'`, and it **fails open** on any error (:96-98). `warn(db, ws, notify)` fires exactly one notification per upward threshold crossing (80% → 90% → 100%), deduped in a `storage_warn_state` table. Because the limit comes from the entitlements resolver, changing a plan in the Command Center changes enforcement with no code change — the resolver-first architecture actually paying off.

### AI metering

`ai_usage` is populated by `recordAiUsage` in server.js:4076-4083, which is also handed to the central engine via `aiEngine.setMeter(recordAiUsage)` (server.js:4086) so the provider-failover path is covered. Cost is estimated from a hardcoded `AI_RATES` table of USD-per-million-token rates keyed by model id, with a flat `{in: 0.1, out: 0.1}` fallback for unknown models. Retired model ids are deliberately kept in the table so historical rows still price correctly. The write is wrapped in a bare `try/catch` — metering never breaks an AI call.

### What the spec promised and the code does not have

`COMMAND-CENTER-SPEC.md` enumerates 30 sections. Sections with **no implementation at all** today:

- **§7 Billing Control** — `/workspaces/:id/billing`, credit/adjust/pause/resume. Absent. `manage_billing` is a permission nothing checks.
- **§17 Message Explorer** — cross-workspace message search. Absent.
- **§19 Media Ops** — `/media/{storage,jobs,workers,failures}`, retry-failed. Absent (partly superseded by the storage dashboard).
- **§20 System Health** — absent.
- **§30 Automation Center** — typed bulk jobs. Absent. `bulk_actions` is a permission nothing checks.
- Admin management (create/disable other admins from the UI) — `manage_admins` is declared and checked nowhere; the only path is the CLI script.
- `POST /logout`, `POST /plans/:id/clone`, `POST /flags/:key/kill`, `POST /workspaces/bulk`, `GET /audit/entity/:type/:id`, `GET /overview/forecast` — all specced, none implemented.

---

### Bugs, security weaknesses, data-integrity risks, and smells

*(Read-only observation. Nothing here was changed.)*

1. **Database Explorer has no permission gate.** `GET /api/cc/db/tables` and `GET /api/cc/db/tables/:name` (cc-explorer.js:57, :72) require only `platformAuth`. A `readonly` or `support` admin can page through *every row of every table* — including `users.password_hash`, WhatsApp session material, and all customer message content — without `run_sql` and without step-up. The SQL console next to it is gated three ways; the row browser that reaches the same data is gated none.

2. **IP allowlist is trivially spoofable and its matching is too loose.** `ipAllowed` (command-center.js:177-183) reads the raw `X-Forwarded-For` header and takes its **first** entry — the one furthest from the server and entirely client-supplied. The app already solves this properly elsewhere: `app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1))` at server.js:37 exists so `req.ip` resolves the real client through one proxy hop, and the Command Center bypasses it. An attacker sets `X-Forwarded-For: <allowlisted-ip>` and passes. Separately, matching uses `ip.endsWith(a)` (:182) — allowlisting `1.2.3.4` also admits `11.2.3.4` and `201.2.3.4`. Note the allowlist defaults to *allow* when `CC_IP_ALLOWLIST` is unset (:179), which is the likely production state.

3. **Platform tokens ride in query strings.** `platformAuth` accepts `req.query.token` (:187), and both the export button (`ExportButton.js:23-25`) and the SSE stream use it. `window.open('…/api/cc/export?…&token=…')` puts a 12-hour cross-tenant admin token into browser history, the referrer chain, and every access log in the path.

4. **The suspend endpoint's own response is stale and wrong.** command-center.js:398 returns `note: 'Login enforcement for suspended workspaces is a follow-up rewire'`. Enforcement *was* implemented: server.js:251-258 returns 403 `{ suspended: true }` for any request from a suspended workspace. The message tells an operator the button does nothing when it does.

5. **The Flags page carries the same stale disclaimer.** `flags/page.js:34` says app-wide enforcement "lands when plan-info is migrated to the resolver". `getEntitlements` already resolves flags (entitlements.js:238-250) and server.js:5586 uses it. The UI understates a shipped capability.

6. **Grace periods are decorative.** `cc_grace_periods` is written (:616), surfaced in Workspace 360 (:376), and swept to `expired` nightly (:896). No enforcement path anywhere reads it — `entitlements.js:266` explicitly says grace is "consumed elsewhere", and grep shows there is no elsewhere. Granting grace to a customer over their limit changes nothing.

7. **The Founder Inbox's persisted half is unreachable.** There is no `INSERT INTO cc_inbox` in the codebase. The read query (:795) and the dismiss endpoint (:806) can only ever operate on rows that cannot exist.

8. **`workspace_usage_daily` is write-only.** The nightly rollup fills it; no endpoint reads it. Every trend view in the Command Center recomputes from live tables instead.

9. **The rollup captures the wrong day.** `runRollup` queries `date(created_at) = date('now')` but the cron fires at `0 2 * * *` (02:00 UTC). Each daily row therefore records only the first two hours of that day and is never revisited — a systematic undercount baked into the one historical table the system keeps.

10. **Two incompatible definitions of "storage used".** `command-center.js:307` and `:335` sum `ms_assets.size_bytes`; `cc-storage.js` sums `ms_assets.storage_size` with no fallback; `storage-enforce.js:39` sums `COALESCE(storage_size, size_bytes)` *plus* `ms_exports`. `storage_size` was added later by an un-backfilled `ALTER TABLE` (media-studio.js:275), so it is NULL on legacy rows — meaning the Storage dashboard reports **0 bytes** for pre-migration assets that the Overview tile counts in full. Three surfaces, three numbers.

11. **`/api/cc/events` applies filters to only half its result.** The `type` / `workspace_id` filters are applied to `platform_events`, then an *unfiltered* page of `audit_logs` from every workspace is merged in and re-sorted (:653-668). Filtering by one workspace still shows other workspaces' rows.

12. **The event spine has one writer.** `emit()` is defined in command-center.js and `platform_events` is written nowhere else. The module returns `{ platformAuth, emit, ccAudit, ensureSchema }`, but server.js:6571 discards the return value, so no product module *can* emit. The "Live Event Stream" is really an admin-action stream with a legacy-audit tail.

13. **Impersonation sessions are never closed.** `cc_impersonations.ended_at` is declared and never updated. The exit path (`ImpersonationBanner.js:28-37`) is entirely client-side — it swaps `localStorage` back and navigates; the 30-minute token remains valid. Read-only mode *is* enforced server-side (server.js:246-248), and the banner **is** mounted now (`app/providers.js:23`), which retires the `command-center-1` CRIT finding in PRODUCT-AUDIT. But "exit" means "stop using the token", not "revoke it".

14. **Impersonation tokens are signed with the product secret.** By design — the core `auth` must accept them (:451-455). The consequence is that a leaked Command Center `JWT_SECRET` mints valid *customer* sessions, and vice-versa; the two tiers share one blast radius.

15. **Destructive cross-tenant actions use `window.prompt` with no confirm and no step-up.** Suspend reason (`customers/[id]:44`), grace days (:45), and a three-prompt override sequence (:112-118) are native prompts; plan change is an instant `<select>` (:36) that fires on change. Step-up exists server-side and is wired into the SQL console but nowhere else — the lowest-stakes action is the best protected.

16. **Role permissions are fetched and ignored by the UI.** `GET /api/cc/me` returns the resolved permission map and `ControlShell` stores it, but no page reads it. A `readonly` admin sees every button and discovers the 403 via `alert()`.

17. **Several write-ish routes have no permission gate:** `POST /workspaces/:id/notes` (:383), `POST /rollup/run` (:735), `POST /inbox/:id/dismiss` (:806), `POST /reports/:id/run` (cc-reports.js:141 — which can *email* a full customer/audit CSV to the report's stored recipients), and `GET /config/:namespace` (:699, reads whatever is stashed in `cc_config`).

18. **Scheduled reports borrow an arbitrary studio's SMTP.** `runReport` picks *any* `workspace_members` row with `role='super_admin'` as the sender identity (cc-reports.js:77) and mails platform-wide data through that customer's SMTP credentials. Customer data leaves via a customer's own mail server, and the choice of which customer is a `LIMIT 1` with no `ORDER BY`.

19. **Report emails carry the CSV as plain body text**, `.slice(0, 100000)` (cc-reports.js:82) — silently truncated, no attachment, no indication of truncation.

20. **The SQL denylist produces false rejections.** `WRITE_WORDS` matches anywhere in the statement, so a legitimate `SELECT … WHERE name LIKE '%update%'` is refused. Harmless, but it will confuse an operator.

21. **`roDb` can silently fall back to the writable connection.** cc-explorer.js:34 assigns `roDb = db` if the read-only open fails, dropping the strongest of the four layers with only a `console.error`.

22. **Stale plan vocabulary throughout the UI.** `planTone()` in `control/page.js:63` and `customers/page.js:93` and the plan Pill in `health/page.js:60` all key off `free/starter/growth`. The live catalog is `creator/studio/studio_plus/enterprise`. Combined with `fmtMoney`'s hardcoded `$` over PKR amounts, the operator's headline revenue number is both mis-currencied and mis-tiered.

23. **`cc_saved_views` is a dead table** — created by `ensureSchema` and referenced by nothing.

24. **`mfa_secret` is a dead column** — the spec's §27 promises MFA for platform admins; nothing implements it. A single bcrypt password plus a spoofable IP check is the entire barrier to a cross-tenant control plane.

25. **The brute-force guard is not applied to the platform login.** `loginLimiter` (server.js:96-104 — 20 *failed* attempts per IP per 15 minutes) is attached to `/api/auth/login` (:1288) and to one account-recovery route (:6487), but **not** to `POST /api/cc/login`. Only the global `limiter` (server.js:82-93, 500 requests per IP per 15 minutes) applies, so the cross-tenant control plane tolerates ~500 password guesses per quarter-hour where the customer login tolerates 20. With no MFA (item 24) this is the weakest link in the whole surface.


---


<!-- ── 14-architecture.md ─────────────────────────────────────────── -->

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


---


<!-- ── 15-security.md ─────────────────────────────────────────── -->

## Security posture — threat model, controls, and known weaknesses

### What this system is guarding

WappFlow is a multi-tenant SaaS for photography and creative studios. A single Node/Express process (`backend/server.js`, ~6,450 lines, plus ~20 sibling modules) and a single SQLite file (`wappflow.db`, opened at `backend/server.js:39`) hold **every tenant's data together**: the studio's leads and clients, the full text of their WhatsApp/Instagram/Facebook/email conversations, their invoices and revenue, their signed contracts, and their clients' photographs. There is no per-tenant database, no row-level security in the engine, and no separate schema — isolation is entirely a property of the `WHERE workspace_id = ?` clauses that application code remembers to write.

The product also deliberately exposes a large **unauthenticated public surface**, because that is the business: a client must be able to open a gallery, sign a contract, pay an invoice and book a shoot without an account. Every one of those pages is protected by a *capability token* — a random string in the URL, no login. So the realistic threat model has four distinct planes, each with a different trust boundary:

| Plane | Who can reach it | Credential | Blast radius if broken |
|---|---|---|---|
| Tenant API (`/api/*` with `auth`) | Any registered user | JWT bearer token | One workspace (or all, if isolation fails) |
| Public capability surfaces (`/api/*/public/*`, `/api/media/portal/*`, `/api/booking/*`, `/api/client-portal/public/*`) | Anyone on the internet | An unguessable URL token | Everything that token unlocks — no second factor |
| Platform control plane (`/api/cc/*`, `backend/command-center.js`) | Platform staff | Separate `cc_admins` identity + 12h JWT + optional IP allowlist | **Every tenant on the platform** |
| Machine-to-machine (Stripe, Meta, website forms) | Anyone who knows the URL | Signature (Stripe) or nothing (Meta) | Data injection / forged settlement |

### Authentication and session handling

Sessions are JWTs signed HS256 with `jsonwebtoken`. The signing helper is `signSession()` at `backend/server.js:199` and verification happens in the `auth` middleware at `backend/server.js:202-262`.

Three properties matter:

1. **Tokens carry no expiry.** `signSession` calls `jwt.sign({ userId, tv, ...extra }, JWT_SECRET)` with no `expiresIn`. A token issued today is valid forever. `DEPLOYMENT.md:48` and `:244` both claim "JWT (HS256, 7-day)" — **the documentation is wrong and the code is right**; there is no expiry anywhere on the tenant plane. (The Command Center's own admin tokens *do* expire — 12h at `command-center.js:256`, 5m for step-up at `:272`, 30m for impersonation at `:457`.)
2. **Revocation exists but only fires on password *reset*.** Phase 9 added `users.token_version`; `auth` rejects any token whose `tv` claim is lower than the user's current version (`backend/server.js:222`). `POST /api/auth/reset-password` bumps it (`backend/account-recovery.js:168`). **`PUT /api/auth/password` — the ordinary "change my password" route — does not** (`backend/server.js:1313-1325`). A user who changes their password because they suspect compromise does not log the attacker out.
3. **Tokens are accepted from the query string.** `auth` reads `req.query.token` as a fallback (`backend/server.js:205`) so `EventSource` can subscribe to the SSE bus at `GET /api/events` (`backend/server.js:971`). A never-expiring bearer credential therefore lands in nginx access logs, proxy logs and browser history.

On the client the token is stored in `localStorage` and attached by an axios interceptor (`wappflow-web/src/lib/api.js:11-15`). That makes any same-origin XSS on the app a full, permanent account takeover.

**The JWT_SECRET question.** The code still reads `const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'` at `backend/server.js:181`, and the identical literal appears again at `backend/command-center.js:169` and `backend/_audit_setup.js:7`. That string is committed to the repository. If the env var is unset, every session token on the platform — and every Command Center admin token, since both planes share one secret — is forgeable by anyone reading the source. **The fallback was never removed from the code.** What was actually done is operational: `DEPLOYMENT.md:312` marks `JWT_SECRET` as required and instructs `openssl rand -hex 64`, `backend/.env.example:4` ships `CHANGE_THIS_TO_LONG_RANDOM_SECRET`, `.env` is git-ignored, `DEPLOYMENT.md:807` documents rotation, and the `token_version` mechanism makes a rotation survivable. There is **no boot-time guard that refuses to start without a real secret**. UNKNOWN: whether the live OVH deployment currently has `JWT_SECRET` set — `.env` is not in the repo and cannot be read from here.

Password hashing is `bcryptjs` at cost 10 throughout (`server.js:1257`, `:1293`, `:1320`, `:1355`; `command-center.js:149`). Reset tokens are `crypto.randomBytes(32)` and only their SHA-256 hash is stored (`account-recovery.js:31`, `:124-127`), single-use, 60-minute TTL, with a deliberately neutral response to avoid account enumeration (`account-recovery.js:110-137`). That flow is the best-built security surface in the codebase.

**Password policy is effectively absent.** `POST /api/auth/register` (`server.js:1254`) validates nothing — no email format check, no minimum length. `POST /api/auth/accept-invite` (`server.js:1349`) also accepts any password. Only `PUT /api/auth/password` (min 6) and the reset flow (min 8) impose anything.

### Authorization inside a tenant

Roles live in `workspace_members.role` with a default permission matrix at `server.js:186-190` (`super_admin`, `admin`, `manager`, `user`) and per-member JSON overrides. The one rule that is genuinely centralised is lead visibility: `req.canViewAllLeads` (`server.js:236`) and the `getScopedLead()` helper (`server.js:270-279`), which returns a lead only if it is in the caller's workspace *and* visible to them. `backend/test-batch1-security.js` statically asserts that every `/api/leads/:leadId/*` route references a guard — a useful regression net, though it checks spelling, not behaviour.

Everything else is ad-hoc `if (!['super_admin','admin'].includes(req.userRole))` checks written inline per route. Two of them are missing entirely (see Findings).

### Multi-tenant isolation, per table

There are roughly 120 tables. They fall into three isolation classes:

| Class | Examples | How isolation is enforced | Risk |
|---|---|---|---|
| Carries `workspace_id` | `leads`, `invoices`, `bookings`, `cs_documents`, `ms_projects`, `ms_assets`, `ms_galleries`, `payments`, `activity_timeline`, `notifications`, `audit_logs`, `meetings`, `lead_channels` | Every query filters on it | Low — a forgotten filter is one bug, not a class |
| Child table, **no** tenant column | `messages`, `notes`, `reminders`, `contact_history`, `lead_tags`, `lead_relations`, `cs_signers`, `ms_gallery_assets`, `ms_cull_decisions`, `ms_album_pages`, `ms_proofing_selections` | Only by joining/guarding the parent (`getScopedLead`) | **Structural** — every current and future reader must remember |
| Keyed to `user_id` = workspace owner | `tags`, `company_settings`, `email_smtp_settings`, `email_imap_settings`, `message_presets` | `req.workspaceOwnerId` | Medium — mixes two identity concepts |

The second class is what caused the **recently-closed cross-tenant leak on the public client portal**. `GET /api/client-portal/public/:token` used to resolve the portal's `lead_id` and then read every child table by `lead_id` alone. Because two writers — contract creation and invoice creation — stored a caller-supplied `lead_id` without checking it belonged to the caller's workspace, a rival tenant could attach a document to *your* lead id, and your client's portal would then publish that document's **signing token** to whoever opened the link. The fix (commit `09975fb`) is defence in depth at three layers, and all three are present in the code today:

* the reader now scopes every child query to the portal's own `workspace_id` (`server.js:6390-6421`), with the reasoning written into the comment at `:6386-6392`;
* `POST /api/cs/documents` rejects a foreign `lead_id` (`contracts-studio.js:531-532`);
* `createInvoiceForLead()` calls `getScopedLead()` before inserting (`server.js:2626-2627`).

### The capability-token model and its blast radius

| Surface | Route(s) | Token source | Entropy | Expiry / revocation |
|---|---|---|---|---|
| Photo gallery | `GET/POST /api/media/portal/:token/*` | `ms_galleries.share_token`, `crypto.randomBytes(16)` (`media-studio.js:1717`) | 128-bit | **None.** `ms_galleries.expires_at` exists but is explicitly marked "RESERVED … not dead" (`media-studio.js:1301`) — gallery expiry is SOLD-NOT-BUILT |
| Contract signing | `GET/POST /api/cs/public/:token/*` | `cs_documents.token`, `randomBytes(18)` (`contracts-studio.js:789`) | 144-bit | Optional `expires_at`, enforced at `contracts-studio.js:1012` + a daily sweep at `:1127` |
| Unified client portal | `GET /api/client-portal/public/:token` | `client_portals.token`, `randomBytes(18)` (`server.js:6364`) | 144-bit | **None** |
| Pay page | `GET /api/payments/public/:token` | `payments.public_token`, `randomBytes(16)` (`payments.js:213`) | 128-bit | None |
| Booking manage | `/api/booking/manage/:token/*` | `bookings.token`, `randomBytes(12)` (`booking.js:390`) | 96-bit | None |
| Print shop | `/api/store/public/:token` | reuses the gallery share token | 128-bit | None |
| Portfolio | `GET /api/media/public/portfolio/:handle` | handle or `randomBytes(8)` | 64-bit | None (intentionally public) |
| Export ZIP | `GET /api/media/exports/:id/file` | `generateId()` — **`Math.random`** (`server.js:1111`) | Not cryptographic | None; no workspace check (`media-studio.js:1786-1795`) |
| Team invite | `/api/auth/accept-invite` | `generateId()+generateId()` — **`Math.random`** (`server.js:3534`) | Not cryptographic | No expiry check anywhere |

Blast radius if a token leaks (a forwarded WhatsApp message, a screenshot, a shared browser): the **client portal token is the worst**, because it is an index of every other token. Opening it returns the share tokens of every published gallery, the `token` of every contract — which is the *signing* capability, not just a read capability — and pay links for unpaid invoices. There is no per-token password, no expiry, no revoke button, and no rate limit distinct from the global one.

Gallery passwords, where used, are `sha256(galleryId + '::' + pw)` (`media-studio.js:1529-1531`) — a single unsalted fast hash compared with `===` (non-constant-time), with no attempt throttling.

### Input validation and SQL

There is **no schema validation library** anywhere — no zod, joi or express-validator. Validation is hand-written per route, and coverage is uneven: Contracts Studio and Media Studio clamp string lengths and whitelist enums (`contracts-studio.js:573-579`, `media-studio.js:2512-2526`); the CRM and auth routes largely do not.

SQL parameterisation, however, is in good shape. I grepped every `db.prepare(\`…${…}\`)` in the backend (51 sites outside tests). All of them interpolate one of: generated `?` placeholder lists, a hardcoded column allowlist, or a module-level constant. **The `reports/overview` SQL-injection the earlier audit flagged is fixed** — `GET /api/reports/overview` (`server.js:2900`) now binds `period` and `start_date`/`end_date` as parameters and carries the comment "Use bound parameters (?) — never interpolate req.query into SQL" (`server.js:2906`). I found **no remaining injectable interpolation** in application code.

LIKE-wildcard escaping is correct in the tenant search module — `search.js:25` escapes `%`, `_` and `\` and every query uses `ESCAPE '\\'` — but is **missing everywhere else**: `command-center.js:325`, `:720-724`, `:840`, `cc-reports.js:34`, and `server.js:4757`. A search for `%` there matches every row (a performance/DoS nuisance, not an injection).

### XSS surfaces

The **invoice document** path is fixed. There were three invoice templates; the dangerous one interpolated the customer name, line-item descriptions and notes raw into a same-origin `document.write` — and lead names are attacker-supplied because the public booking form creates leads from whatever a stranger types. All three collapsed into one escaped builder, `wappflow-web/src/lib/invoiceDoc.js`, whose `esc()` (line 23) escapes `& < > " '` and is applied to every free-text field. `backend/test-phase6-invoice-doc.js` runs hostile input through the real template and asserts no raw payload survives, with a positive control.

Two `dangerouslySetInnerHTML` sites remain:

* `wappflow-web/src/app/chat/page.js:98` renders through `sanitizeHtml()` (`:47-77`), a tag/attribute allowlist. It is a reasonable design, but it builds the DOM with `tmp.innerHTML = html` on a `div` attached to the live document, which is the classic pitfall: `<img src=x onerror=…>` fires *while parsing*, before the sanitizer strips the attribute. Unverified by execution here, but the mitigation (parse into a `<template>` or an inert document) is absent.
* `wappflow-web/src/app/leads/[id]/page.js:146` renders `em.body` with **no sanitisation at all**. That body comes from the IMAP ingester at `server.js:3904`, which stores `parsed.text || parsed.html` — so an email with no plaintext part is stored as raw attacker HTML and later injected into the studio's authenticated page.

`helmet` is configured with `contentSecurityPolicy: false` (`server.js:75`) and the Next.js frontend sets no headers at all (`wappflow-web/next.config.ts` has none, and there is no `middleware.js`). There is therefore **no CSP, no `X-Frame-Options`, and no frame-ancestors policy** on the app the studio logs into.

### File upload and storage

Four multer instances in `server.js` (general 16 MB, logo 5 MB image-only, voice 16 MB, avatar 5 MB image-only) plus `mediaUpload` in `media-studio.js:280` (200 MB, **no `fileFilter`**). Filenames are sanitised (`.normalize('NFKD').replace(/[^\w.\-]/g,'_').slice(0,100)`) and prefixed with a timestamp, so filename-based traversal is closed. Everything lands under `DATA_DIR/uploads` and is served by `express.static` with `Access-Control-Allow-Origin: *` (`server.js:117-122`). Because there is no MIME allowlist on the general and media uploaders and no CSP, an authenticated user can upload `.html` or `.svg` and get stored script execution on the API origin.

Far more serious is `GET /api/storage/file/:key` (`backend/storage/index.js:58-69`, mounted at `server.js:6564`) — see Finding 1.

### Rate limiting, CORS, helmet

* Global limiter: 500 requests / 15 min / IP, `/uploads/*` exempt (`server.js:82-93`). `trust proxy` is 1 (`server.js:37`), so `req.ip` is the real client behind nginx.
* Login limiter: 20 **failed** attempts / 15 min / IP on `POST /api/auth/login` only (`server.js:96-104`). `POST /api/cc/login` — the platform-admin login — is **not** covered by it.
* No dedicated limiter on any public token surface: contract signing, gallery password attempts, booking submission, the LLM-backed `/api/cs/public/:token/ask`, or gallery export.
* CORS: `origin: process.env.FRONTEND_URL || '*'`, `credentials: true` (`server.js:106-109`). The `*` fallback is unsafe-by-default; auth is bearer-token so it is not a classic CSRF hole, but it does open every unauthenticated endpoint to arbitrary origins.
* helmet is on with defaults except CSP off and `crossOriginResourcePolicy: 'cross-origin'`; HSTS is therefore sent.
* `express.json({ limit: '50mb' })` (`server.js:115`) — a large, cheap memory-amplification target on a synchronous SQLite process.

### Webhook verification

**Stripe: correct.** `payments.js:18-36` hand-rolls `Stripe-Signature` verification — parses `t`/`v1`, enforces a 300-second replay window, HMACs `t + '.' + rawBody`, compares with `crypto.timingSafeEqual`. `server.js:114` registers a path-scoped `express.raw` *before* `express.json` so the bytes are exact. Handling is idempotent via `webhook_events UNIQUE(platform, event_id)` (`payments.js:290-296`), and the module refuses outright if `STRIPE_WEBHOOK_SECRET` is unset (`payments.js:270`). This is SHIPPED and well done.

**Meta (Instagram + Facebook): absent.** `POST /api/webhooks/instagram` (`server.js:5139`) and `POST /api/webhooks/facebook` (`server.js:5201`) perform **no `X-Hub-Signature-256` check**. The GET verification handshake checks a per-account `webhook_verify_token`, but that only guards subscription setup, not delivery. See Finding 2.

### Secrets management

`.env` is git-ignored; `.env.example` ships placeholders. But:

* The committed JWT fallback (above).
* **VAPID push keys are hardcoded in the repository** — `server.js:21-22` embeds a real-looking public *and private* key pair as the default. Anyone can send push notifications to any subscriber of a deployment that did not override them.
* Tenant **SMTP and IMAP passwords are stored in plaintext** in `email_smtp_settings.smtp_pass` and `email_imap_settings.imap_pass` (`server.js:571`, `:600`). They are masked on read (`server.js:3705`, `:3757`) but sit in cleartext in the DB file.
* Both mail clients set `tlsOptions: { rejectUnauthorized: false }` (`server.js:3787`, `:3882`) — TLS certificate validation is disabled, so those credentials are MITM-able on a hostile network.
* AI provider keys are platform-level env vars (`ai-engine.js:17-31`). BYOK is advertised as an Enterprise feature (`entitlements.js:90`) but **SOLD-NOT-BUILT** — no code path reads a per-workspace key. The same applies to `sso: true` and `api_access: true` in that block.

### Audit logging

Two independent trails:

* **Tenant:** `audit_logs(id, workspace_id, user_id, user_name, action, entity_type, entity_id, details, ip_address, created_at)` (`server.js:466-477`), written by `logAudit()` (`server.js:1189`). Coverage is thin — roughly 59 call sites platform-wide (23 in `server.js`, 23 in `media-studio.js`, 7 in `contracts-studio.js`, the rest scattered). `logAudit` never populates `user_name` or `ip_address` even though the columns exist. **Login, logout, failed login, permission change, SMTP-credential change and data export-by-token are not audited.** Read endpoint: `GET /api/audit-logs` (`server.js:3002`) — see Finding 6.
* **Platform:** `cc_audit` (`command-center.js:210-222`) is much better — it records admin id, action, target, before/after JSON, reason, IP and user-agent, and it does log admin login, step-up and impersonation start.

### Soft delete and the recycle bin

`backend/soft-delete.js` is the single registry (`ENTITIES`, line 27). One 90-day window for `leads`, `cs_documents`, `bookings` and `ms_assets`; **`invoices` are `retentionDays: null`** — soft-deleted but never swept, because a financial record must not vanish on a timer. Deleting a lead that still has live invoices, contracts or bookings is *refused* with an explanatory message rather than cascaded (`attachmentsForLead`, `:117-143`) — this replaced a `DELETE FROM invoices WHERE lead_id` that destroyed financial records as a side effect of tidying a pipeline. `workspace_members` is deliberately excluded and stays a hard delete, with the reasoning written out at `:33-37`: it is an auth table, and a soft-deleted member would keep authenticating with their old permissions unless all ~10 readers filtered the flag. That is the right call, and the reasoning is sound.

---

### Findings — bugs, weaknesses and smells (read-only; nothing was changed)

**1. Unauthenticated arbitrary file read (path traversal) — CRITICAL, confirmed by execution.**
`storage/index.js:58-69` registers `GET /api/storage/file/:key` with no `auth`. It does `decodeURIComponent(req.params.key)`, and the local provider's `localPath()` is a bare `path.join(uploadsDir, key)` with no containment check (`storage/providers/local.js:9`, `:36`). Express 5 already URL-decodes route params, so `%2F` arrives as `/`; `path.join` then normalises the `..` away, so `send`'s up-path guard never trips. I reproduced this against the real module: a request for `/api/storage/file/..%2Fwappflow.db` returned the file contents with HTTP 200.

**2. Meta webhooks are unauthenticated *and* fall back across tenants — HIGH.**
`server.js:5145-5147` and `:5207-5209`: if `entry.id` matches no `account_handle`, the handler falls back to `SELECT * FROM platform_accounts WHERE platform='instagram' ORDER BY created_at ASC LIMIT 1` — **with no workspace filter**. Combined with the missing signature check, any unauthenticated POST writes leads and messages into whichever tenant happens to own the oldest social account on the platform.

**3. The public booking form hands out a client's portal token — HIGH.**
`booking.js:400-403` finds an existing lead by exact `customer_phone` or `email`; `booking.js:449` returns `next: journeyLinks(...)`, and `public-brand.js:109-111` puts the `client_portals.token` in that payload. So an unauthenticated stranger who knows a studio's public slug and a client's phone number receives that client's portal link — which then lists their galleries, their invoices' pay links, and their contracts' **signing** tokens.

**4. Any authenticated user can grant their workspace any plan — HIGH (authorization/monetisation).**
`PUT /api/workspace/plan` (`server.js:5453`) has `auth` but **no role or permission check**, and writes `plan`, `features` and `limits` straight into `workspace_plan`. `entitlements.getEntitlements` merges those JSON columns over the plan defaults (`entitlements.js:279`, `:297-299`). A `user`-role seat can self-upgrade to `enterprise` with unlimited limits.

**5. Full workspace export ignores the lead-visibility rule — HIGH (insider).**
`GET /api/workspace/export` (`server.js:3017`) is gated on `auth` alone and never consults `req.canViewAllLeads`. A `user`-role member who is supposed to see only their assigned leads can dump every lead, message, note, invoice, booking and contract in the workspace as one JSON file.

**6. `GET /api/audit-logs` has no permission gate — MEDIUM.** `server.js:3002` — any member reads the whole workspace audit trail.

**7. Cross-tenant destructive write on tag deletion — MEDIUM.**
`server.js:3072`: `DELETE FROM lead_tags WHERE tag_id = ?` runs with **no ownership check at all**, before the scoped delete on line 3073. Any authenticated user can strip a foreign tenant's tag from every lead it is on. Line 3068 (`PUT /api/tags/:id`) additionally returns `SELECT * FROM tags WHERE id = ?` regardless of whether the scoped UPDATE matched, leaking a foreign tag's name and colour.

**8. Stored XSS from inbound email — HIGH.** `server.js:3904` stores raw email HTML; `wappflow-web/src/app/leads/[id]/page.js:146` injects it unsanitised. Token lives in `localStorage`, never expires.

**9. Security-relevant tokens generated from `Math.random`.** `generateId()` (`server.js:1111`) is a `Math.random` UUIDv4. It is used for workspace invite tokens (`server.js:3534`), legacy team invites (`:1658`), Meta webhook verify tokens (`:5072`), and export-ZIP ids that `media-studio.js:1786` treats as a capability. V8's PRNG state is recoverable from a handful of outputs.

**10. Password change does not revoke sessions.** `server.js:1313-1325` omits the `token_version` bump that `account-recovery.js:168` performs — the only "log everyone out" lever is not wired to the button users press for that purpose.

**11. `POST /api/cc/login` has no brute-force limiter** (`command-center.js:248`), and both planes share one `JWT_SECRET`, so a single secret compromise yields platform-wide admin.

**12. Unmetered LLM spend on a public route.** `POST /api/cs/public/:token/ask` (`contracts-studio.js:1095`) calls `ai.callLLM` with no auth, no rate limit and no workspace attribution. Likewise `POST /api/media/portal/:token/export` (`media-studio.js:2801`) enqueues a full-gallery ZIP per call with no cooldown.

**13. Architectural smell — isolation by convention.** Eleven-plus child tables have no `workspace_id`. The portal leak was the symptom; the disease is that correctness depends on every reader remembering to join through a guarded parent. A `workspace_id` column plus a covering index on those tables would convert a class of bugs into a class of impossible states.

**14. Doc/code disagreements to correct downstream.** `DEPLOYMENT.md` claims 7-day JWTs (false — no expiry) and a `change-me` default (the real literal is `your-secret-key-change-in-production`). `DESKTOP-FINAL-VISION.md` describes Command Center as unmounted dead code — it **is** mounted, at `server.js:6571`, and its impersonation endpoint mints working tenant tokens.

### Prioritised risk list with attack narratives

1. **Total data breach via `/api/storage/file`.** No account needed. `curl https://api.example.com/api/storage/file/..%2Fwappflow.db` downloads the SQLite file containing every tenant's leads, message bodies, invoices, bcrypt hashes, plaintext SMTP/IMAP passwords, and every live capability token. Confirmed working against the real handler.
2. **Client-relationship takeover from a phone number.** Attacker opens the studio's public `/book/<slug>` page, submits a booking using the target client's phone, and reads `next.portal` from the JSON response. That portal lists the client's contract signing tokens — the attacker can then execute a legally-styled signature (`POST /api/cs/public/:token/sign` accepts any `typed_name` with no identity check), download the client's private photographs, and view their invoices.
3. **Forged inbound leads and messages into a stranger's tenant.** Unsigned Meta webhook + the tenant-blind `LIMIT 1` fallback. Also a fine delivery vehicle for #4.
4. **Session theft via emailed HTML.** Attacker learns a lead's email address (often public), sends an HTML-only email, waits for the studio to expand it in the lead's Emails tab, and exfiltrates `localStorage.token` — a token that never expires and that changing the password will not revoke.
5. **Insider exfiltration.** A junior seat restricted to their own leads calls `GET /api/workspace/export` once and walks out with the entire book of business — an action that is audited only as a single `export` row with no IP.
6. **Revenue leakage.** Any seat calls `PUT /api/workspace/plan` and unlocks every paid module and limit.
7. **Offline cracking after any DB read.** Gallery passwords are one unsalted SHA-256; mail passwords are plaintext.
8. **Forever-tokens.** No gallery expiry, no portal revocation, no token rotation UI — a link forwarded once is a permanent grant.


---


<!-- ── 16-ui-ux.md ─────────────────────────────────────────── -->

## UI/UX — design system, interaction patterns and the experience

### What this part of the product is for

WappFlow's interface has to do something unusual: it is a single web application that a small photography or creative studio lives inside all day, and it has to switch between three completely different kinds of work without feeling like three different products. In the morning the owner is running a **CRM** — chasing leads that arrived over WhatsApp, moving them through a pipeline, raising invoices. In the afternoon they are a **photographer** — reviewing thousands of frames from a shoot, choosing keepers, building a gallery, sending it to the client. In between they are a **business** — sending a proposal or contract that the client signs in the browser. Each of those users has different taste: a CRM wants dense, high-contrast, information-first chrome; a photographer wants the UI to disappear so the photographs are the only thing with colour; a contract has to look like a document, not like software.

The interface answers this with **one shell and several deliberate dialects**: a shared token substrate and a shared set of primitives, plus scoped CSS "identities" (`.ms-root`, `.cs-doc`, `.pf-root`, `.wf-public`) that remap the tokens so the same components wear a different face depending on where they render. That is the good idea at the centre of the front end. The honest counterweight, documented in detail below, is that the idea was ratified and only partially executed: only **8 of 69 `page.js` files** actually import the shared primitives, the app still contains **76 hand-rolled fixed-position overlays**, **~2,226 raw hex colours** in `app/`, and **12 `aria-*` attributes against 915 `onClick` handlers** in the page layer.

Frontend stack: **Next.js 16 App Router + React 19**, all under `wappflow-web/src`. Styling is **CSS custom properties in `app/globals.css` plus inline `style={{}}` objects** — Tailwind directives are present at `app/globals.css:1-3` but essentially unused as a utility system; the real styling language is `var(--token)` inside inline styles (3,909 occurrences across `src/`). Icons are `lucide-react` throughout. Charts are `recharts`. Drag-and-drop is `@hello-pangea/dnd` (dashboard Kanban).

---

### 1. Domain vocabulary the interface assumes

The reader needs these to follow the screens:

| Term | What it means here | Where it lives |
|---|---|---|
| **Lead** | An inbound prospect, usually auto-created from a first WhatsApp/Instagram/Facebook message. Has a `status` on a six-stage pipeline. | `/leads-list`, `/leads/[id]`, `/dashboard` |
| **Client** | A lead that reached `Closed - Won` and was converted. Leaves the Leads list but keeps its chat and history. | `/clients` |
| **Shoot / Project** | One photography job. Holds every asset, gallery, album and reel for that job. The UI calls it a "shoot"; the API calls it a project (`mediaAPI.createProject`, `app/studio/page.js:36`). | `/studio`, `/studio/[id]` |
| **Cull** | The photographer's review pass over the raw take: each frame is marked **Keep / Maybe / Reject** and optionally star-rated 1–5, so thousands of frames become a few dozen deliverables. | `/studio/[id]/cull` |
| **Gallery** | A password-protectable, shareable, client-facing set of selected photographs, reachable by token at `/g/[token]`. | `app/studio/[id]/page.js:73` (`CreateGalleryModal`), `app/g/[token]/page.js` |
| **Album** | An internal print/layout construct (a physical album's page plan), distinct from a gallery. Can be auto-filled from cull "keep" decisions (`mediaAPI.autofillAlbum`, `app/studio/[id]/albums/[albumId]/page.js:95`). | `/studio/[id]/albums` |
| **Proofing request** | A client-side selection task inside a gallery ("pick 40 favourites") with a quota. | `app/studio/[id]/page.js:115` |
| **Document / Contract** | A block-based proposal or contract built in Contracts Studio and signed by the client at `/d/[token]`. | `/contracts/[id]`, `/d/[token]` |
| **Client portal** | A per-client hub at `/client/[token]` collecting their galleries, documents and invoices. | `app/client/[token]/page.js` |

---

### 2. The design token system

`app/globals.css` (522 lines) is the whole system. It is layered, and the layering is deliberate and well-commented.

**Tier 0 — the original palette** (`globals.css:5-25` for dark, `:28-48` for light). Dark is the default; light is opt-in via a `light` class on `<html>`.

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0f1117` | `#f1f5f9` |
| `--surface` / `--surface2` | `#1a1d27` / `#222536` | `#ffffff` / `#f8fafc` |
| `--border` | `#2a2d3e` | `#e2e8f0` |
| `--text` / `--text-dim` / `--text-muted` | `#e2e8f0` / `#9ca3af` / `#6b7280` | `#0f172a` / `#94a3b8` / `#64748b` |
| `--accent` / `--accent-hover` | `#6366f1` / `#4f46e5` | same |
| `--success` / `--warning` / `--danger` | `#10b981` / `#f59e0b` / `#ef4444` | `#059669` / `#d97706` / `#dc2626` |

**Tier 1/2 — the PROP-002 "Batch A" substrate** (`globals.css:57-102`), added purely additively so the ~5,000 existing inline `var(--*)` styles keep resolving identically. It introduces a 4px spacing scale (`--space-1..12`), a radius scale (`--radius-sm|md|lg|xl|pill`), a type scale (`--fs-caption` 11px → `--fs-h1` 28px), weights (`--fw-normal|medium|semibold|bold`), motion (`--dur-fast|dur|dur-slow`, `--ease`, `--ease-spring`), an elevation scale (`--elev-1..3`), semantic status pairs (`--success-bg/--success-fg`, `--danger-bg/--danger-fg`, `--info-bg/--info-fg`, `--warning-bg/--warning-fg`, `--accent-bg/--accent-fg`), and a **z-index ladder** replacing an ad-hoc 1–99999 sprawl:

`--z-base: 1 · --z-dropdown: 1000 · --z-sticky: 1100 · --z-overlay: 1200 · --z-modal: 1300 · --z-toast: 1400 · --z-banner: 1500`

Two tokens are load-bearing beyond styling. `--shell-h: 58px` (`globals.css:79`) publishes the app-bar height because full-bleed pages compute against it. `--focus-ring` (`globals.css:83`) plus the global `:focus-visible` rule at `globals.css:110-119` gives *every* focusable element a visible keyboard ring via `box-shadow`, which is a genuinely smart move: it coexists with the app's pervasive `outline: none` and therefore retro-fitted focus indication to hundreds of unmigrated inputs with zero per-file edits.

**Maturity: SHIPPED.** The token layer is real, coherent, commented, and resolves correctly in both modes.

#### Theming mechanics

- Light/dark is a class on `<html>` set by a pre-hydration inline script in `app/layout.js:42-45` (`localStorage.getItem('theme') || 'dark'`), so there is no flash of wrong theme. `suppressHydrationWarning` on `<html>` is correctly applied.
- The **only** place to change it is Settings → Appearance (`app/settings/page.js:2832-2841`), rendered as two preview cards. There is no toggle in the shell. **PARTIAL** — the feature works, but it is three clicks and a tab away from anywhere a user would look for it, and the Studio-only toggle that used to exist (`app/studio/StudioThemeToggle.js`) is now **dead code, imported by nothing**.
- Public token pages (booking, print shop, pay, client portal, contract) are seen by *the studio's clients*, who have no theme preference, so `.wf-public` (`globals.css:484-522`) pins the light palette absolutely. The class is applied to `document.documentElement` by `components/PublicScope.js`, not to a wrapper — correct, because `Modal`/`Toast`/`confirm` portal to `document.body` and a wrapper would never reach them. The file also correctly restates derived tokens (`--focus-ring`, `--accent-bg`, `--warning-fg`) rather than relying on `var()` re-resolution, and raises the focus-ring alpha from 15% to 28% because indigo at 15% is invisible on white. This is unusually careful CSS.

---

### 3. The visual identities — why the product looks like several products

There are **five** scoped identities, not three.

| Scope | File | Sub-themes | Character |
|---|---|---|---|
| **Core app** | `app/globals.css` | light / dark | Indigo accent, Inter, 10px radii, dense information UI |
| **Media Studio** | `app/studio/studio.css` (689 lines) | `monochrome` (default), `editorial`, `cinema` | Gallery-wall photography UI; type, spacing, shape, motion and atmosphere all change per theme |
| **Contracts Studio** | `app/contracts/contracts.css` (50 lines) | `monochrome`, `editorial`, `executive` | A **document canvas**: an 860px-max paper surface with its own type and its own selection colour |
| **Portfolio (public)** | `app/folio/portfolio.css` (169 lines) | 10 themes (`noir`, and nine others) | Full-bleed public marketing site: Ken-Burns hero, masonry work grid |
| **Public token pages** | `.wf-public` in globals | — | Fixed light, brand-headed |

**Media Studio** is the most ambitious. `.ms-root` declares ~40 `--ms-*` tokens and then *remaps the core tokens onto them* (`studio.css:60-63`: `--bg: var(--ms-paper); --surface: var(--ms-surface); --text: var(--ms-ink); --accent: var(--ms-accent)` …). That single trick is why a `<Button>` or `<Badge>` rendered inside Studio automatically wears the Studio look without knowing Studio exists. Themes are switched by `html[data-ms-theme="…"]` and are genuinely different worlds, not colour swaps:

- **monochrome** — Bodoni Moda display, 2px radii, 3px grid gap, `--ms-shadow` almost nil, `--ms-accent: #101010`. The photographs are the only colour.
- **editorial** — Fraunces serif body, Jost labels, cream `#fbfaf6` paper, `--ms-pad-y` up to 100px, pill buttons, centred masthead.
- **cinema** — Anton condensed caps, `#0a0a0b` black, radial-gradient backdrop, 40px/100px shadows, slower `--ms-speed: 0.4s`.

Theme choice persists in `localStorage['ms-theme']` and is applied pre-paint by an inline script in `app/studio/layout.js:17`, whose retired-id migration map (`dark-pro→cinema`, `airy→editorial`, `bold→monochrome`) is duplicated in `components/shell/StudioThemeSwitch.js:24`. The duplication is called out in both files and the two currently agree.

**Contracts Studio's** `.cs-doc` is applied to the *document*, not to the page, so the builder and the client's signing view render byte-identical output — "what you build is exactly what the client sees" (`contracts.css:3-4`). The `executive` theme is deliberately dark (`#0f1420` with `#c8a35b` gold), which is why `.wf-public` is explicitly *not* applied to `/d/[token]` under that theme.

**Maturity: SHIPPED**, and this is the strongest part of the product's design work. It is also where the most CSS lives that nothing uses any more — see §11.

---

### 4. The shell and navigation model

`components/shell/AppShell.js` (205 lines) is one sticky top bar for every authenticated module, mounted from **route layouts**, not from pages. That is the important architectural fact: `app/dashboard/layout.js`, `app/leads/layout.js`, `app/studio/layout.js`, `app/contracts/layout.js` and 14 others each render `<AppShell module="…">{children}</AppShell>`, so the chrome persists across navigation instead of remounting. The file's own comment records what it replaced: three per-page shells wrapped by 36 pages across 45 JSX call sites, where a page's loading branch and its loaded branch each mounted the chrome separately.

Left → right the bar is: **module switcher (waffle) · module mark + wordmark · module nav · spacer · page actions · module actions · notification bell · command palette · mobile burger · account avatar menu**.

The nav comes from a single registry, `components/shell/modules.js`:

| Module | `home` | Nav items | Menu | FABs | Dialect |
|---|---|---|---|---|---|
| `crm` | `/dashboard` | Dashboard, Leads (prefix-match), Clients, Communications (unread badge), Invoices, Bookings, Analytics (`lockFeature: 'analytics'`, Studio plan) | Settings, Team, Knowledge, Help | `AICommandCenter`, `FloatingChat` | — |
| `studio` | `/studio` | Shoots, Portfolio | Studio settings, Help center, Trash | `StudioCopilot` | `.ms-root` |
| `contracts` | `/contracts` | Overview, Client Vault, Analytics | Studio settings, Help & guide | — | — (`.cs-doc` travels with content) |

Active state is computed by `isNavActive` (`modules.js:96-102`): exact match by default, prefix match where a module owns a subtree. Locked items swap their icon for a padlock and get a `title` explaining the required plan (`AppShell.js:60-64`), and the lock is suppressed while `plan.loading` so the UI never flashes a lock and then snaps open (`AppShell.js:48`).

Mobile: below **860px** the nav and wordmark are hidden and a burger appears (`AppShell.js:198-201`), opening a `Drawer` that contains the same nav buttons. The drawer is a real dialog with focus trap, Escape and scroll lock (`components/ui/Drawer.js`).

`components/shell/Breadcrumbs.js` exists and is well-reasoned — it is deliberately *not* `router.back()`, because deep-links between related leads and the command palette pollute the history stack — but it is mounted through `AppShell`'s `subHeader` slot and **no layout in the repo currently passes one**. **Maturity: STUB.** The component works; nothing renders it.

Auth is guarded once by `useAuthGuard()` at `AppShell.js:43`, which redirects to `/login?next=…`. **PARTIAL:** 24 page files still perform their own `localStorage.getItem('token')` redirect (e.g. `app/clients/page.js:37`, `app/studio/page.js`, `app/contracts/[id]/page.js:40`), so the duplication the guard was built to remove is still largely present.

---

### 5. The module switcher

`components/shell/ModuleSwitcher.js` renders a 248px dropdown listing CRM, Media Studio, Contracts Studio and (disabled) Flux. Each row has the module's gradient mark; the current module gets `--accent-bg` and a check. Switching is an in-app `router.push(m.home)` — the file records that it used to be `target="_blank"`, which the product audit named as the root cause of the "not one product" feeling, and which only worked because of a same-origin-referrer session-inheritance trick still visible in `app/layout.js:47-53`.

Flux is the one genuine external link and is hard-parked: `FLUX_PARKED` from `lib/flux.js` disables the anchor, halves its opacity and prints "Coming soon". **Maturity: SHIPPED (CRM/Studio/Contracts), SOLD-NOT-BUILT (Flux — visibly advertised in the switcher, intentionally inert).**

On phones the panel is repositioned to fixed 12px gutters via `.as-panel` (`globals.css:431-437`) because the trigger sits ~169px in and neither left- nor right-anchoring fits a 375px screen.

---

### 6. The command palette (Ctrl/Cmd+K)

`components/shell/CommandPalette.js` (179 lines), mounted by the shell so it exists in every module. The binding is `(ctrlKey || metaKey) && k` (`:52`) and it **toggles**.

Two result classes in one list, deliberately:
1. **Navigation** — every destination flattened out of `MODULES` once at construction (`:41-47`), matched locally, so the palette is useful before any request returns. With an empty query it shows the first six destinations.
2. **Records** — `GET /api/search` via `searchAPI.global`, debounced 180ms, with a request-id guard so a slow response cannot overwrite a newer one (`:70-80`). Types rendered: lead, client, contract, invoice, booking, project ("Shoot"), message, team member.

Keyboard: ↑/↓ move, Enter opens, Escape closes (through the overlay stack), and the active row is scrolled into view with `scrollIntoView({block:'nearest'})`. A footer strip prints the shortcuts. `role="listbox"` / `role="option"` / `aria-selected` are correctly applied (`:128-138`) — one of the few places in the codebase where ARIA is done properly.

**Maturity: SHIPPED.** Two honest gaps: it is **navigate-only** (no commands — you cannot "create invoice" from it despite the name), and the shortcut is **not documented anywhere in the in-app help** (`app/help/page.js` has a "Keyboard Shortcuts & Tips" section at `:151` whose only entry is about Enter/Shift+Enter in chat). A discoverable feature nobody is told about is close to no feature.

---

### 7. Notifications, the bell, and realtime

`components/shell/ShellNotifications.js` (255 lines) owns the bell. It merges three sources into one list: the **persistent feed** (`GET /api/notifications`), **today's new leads**, and **reminders due within 24 hours**, de-duplicating derived lead cards when the feed already points at the same `/leads/{id}` URL. Locally dismissed ids persist in `localStorage['wf_dismissed_notifications']`.

Counting is cheap: a 60s poll of `GET /api/notifications/summary` (`:32`, `:61`) which returns `{ todayLeads, reminders, unread, comms, total }`. Those counts are re-published through a tiny module-level pub/sub (`components/shell/summary.js`) so the Communications nav badge reads the same fetch instead of polling again — a neat, small solution.

Realtime rides one app-wide `EventSource` from `components/shell/realtime.js`, mounted in `app/providers.js` *above* the shell so it survives navigation. Two contracts are documented there and matter: the backend emits **unnamed SSE frames** (`data: {"type":"lead_created",…}` with no `event:` line), so `addEventListener('lead_created')` silently receives nothing and the only correct consumption is `onmessage` + a switch on `data.type` (`realtime.js:20-25`); and `BASE_URL` must be imported rather than re-derived, because `NEXT_PUBLIC_API_URL` already ends in `/api` in production and produced `/api/api/events` (`realtime.js:29-35`). Reconnect is exponential 1s→30s with a visibility-change wake and a 3s localStorage reconcile that opens the stream after sign-in and closes it on sign-out. The bell subscribes to `notification` for an instant badge bump and to `chat_message|chat_mention|chat_thread_reply` (debounced 1.5s) for the comms count.

Toasts are a separate, better system: `components/ui/Toast.js` is a module-level store with an importable `toast.success/error/warning/info` API, one `<ToastViewport />` mounted in `app/providers.js`, bottom-right on `--z-toast`, max 4 visible with the rest queued, `aria-live="polite"`, `role="alert"` for danger, and pause-on-hover/focus with correct remaining-time arithmetic.

**Maturity: SHIPPED with named gaps.** Three:
- Opening the bell calls `loadPanelData()`, which fetches **the entire leads table** (`leadsAPI.getAll(null)`, `ShellNotifications.js:84`) purely to count today's arrivals. Phase 4 removed this from the 60s poll but left it on the click path.
- Toast adoption is thin: **27** `toast.*` calls exist while **25** page-local `showToast`/`setToast` implementations remain (`app/dashboard`, `app/settings`, `app/leads/[id]`, `app/leads-list`, `app/profile`, `app/knowledge`, `app/clients`).
- Sound is a full five-profile Web Audio service (`lib/sounds.js`: `reminder`, `whatsapp`, `team`, `newLead`, `system`, per-channel mute, volume) — but `app/dashboard/page.js:46-80` *also* hand-rolls its own `playNewLeadSound` / `playNewMessageSound` oscillators that bypass the service's mute and volume preferences entirely.

---

### 8. The registry pattern — domain keys vs display labels (PROP-002 D3)

This is the most conceptually valuable piece of the design system and worth the reader's attention.

The rule: **a status registry maps a stable domain key (the literal DB value, which drives logic, API, filtering and analytics) to presentation metadata only.** Colours are never values; components never learn domains.

`lib/statusRegistry.js` defines the contract. `makeStatusLookup(name, map)` returns a lookup that, for an unknown key, must: never crash, never silently normalise an invalid value into a valid-looking one, render a **neutral** badge, humanise the real value for display, and emit a one-shot `console.warn` so bad data is visible. That last set of rules is unusually mature thinking — most codebases quietly coerce an unknown status to "Draft" and hide a data bug forever.

| Registry | Keys | Tones |
|---|---|---|
| `lib/leadStatus.js` | `New`, `Contacted`, `Interested`, `Negotiating`, `Closed - Won`, `Closed - Lost` | accent, info, warning, warning, success, danger |
| `lib/invoiceStatus.js` | `draft`, `sent`, `pending`, `paid`, `overdue` (derived, never stored) | neutral, info, warning, success, danger |
| `lib/plan.js` `PLAN_META` | `creator`, `studio`, `studio_plus`, `enterprise` | labels + `crown` flag |

`displayInvoiceStatus(inv)` (`lib/invoiceStatus.js:24`) encodes the one rule that matters — show `overdue` when the backend's derived `is_overdue` is set, otherwise the stored status. The file also carries a comment recording a real shipped bug: `sent` was missing from the registry, so *every invoice the product raised on its own* (contract automation, print store) rendered with an unknown-status badge on the screen the studio uses to chase money.

**Maturity: PARTIAL, and this is the single largest gap between the ratified design and the code.** The registries exist and are correct, but only **two** files consume `leadStatusMeta` (`app/leads-list/page.js:26`, `components/AddLeadModal.js:8`) and **one** consumes `invoiceStatusMeta` (`app/invoices/page.js`). Meanwhile **six** independent lead-status colour maps are still live and can drift:

| File | Symbol | Note |
|---|---|---|
| `app/dashboard/page.js:35` | `STATUS_COLORS` | plus a separate `COLUMNS` array at `:27` with emoji labels `🏆 Won` / `❌ Lost` |
| `app/leads/[id]/page.js:106` | `STATUS_META` | its own emoji labels again |
| `app/leads-list/page.js:30` | `STATUS_META` | *coexists* with the registry import in the same file |
| `app/reports/page.js:24` | `STATUS_COLORS` | chart colours |
| `app/trash/page.js:12` | inline map | |
| `components/AICommandCenter.js:17` | `STATUS_COLORS` | |

The same status therefore renders as five different greens across the product, and "Won" is labelled `Closed - Won`, `🏆 Won`, and `Won` on three different screens.

---

### 9. Component primitives

`src/components/ui/**` is small, well-documented and mostly excellent.

| Primitive | File | What it gives you | Adoption (files importing) |
|---|---|---|---|
| `overlay.js` | 146 ln | `Portal`, `useOverlayStack` (registration order = stacking order, answers "am I top?"), `useEscape` (top-only, so nested overlays peel one at a time), `useScrollLock` (reference-counted), `useFocusTrap` (Tab cycle + focus restore, takes the *element* via callback ref because portal content mounts a tick late) | 4 primitives + `lib/confirm` |
| `Modal.js` | 205 ln | Centred dialog on `--z-modal`; `role="dialog"`, `aria-modal`, generated `aria-labelledby`/`describedby`; `dismissable={false}` kills backdrop *and* Escape; `useModal()` returns a promise resolving `'confirmed'\|'cancelled'\|'dismissed'` | 5 |
| `Drawer.js` | 95 ln | Edge panel on `--z-overlay` (below modal, so a modal opened from a drawer still covers it) | 1 (AppShell) |
| `Dropdown.js` | 94 ln | Anchored menu on `--z-dropdown`, `aria-haspopup`/`aria-expanded`/`aria-controls`, outside-mousedown + Escape. Explicitly *not* portaled. Replaced seven hand-rolled copies | 4 |
| `Button.js` | 61 ln | 4 variants (`primary`/`secondary`/`ghost`/`danger`), 2 sizes, `loading` → spinner + `aria-busy`. **No domain props** — no `whatsapp`, no `gradient` | 2 |
| `Badge.js` | 44 ln | 6 tones mapped to Batch-A status tokens, optional `dot`, plus a `color` escape hatch for arbitrary tag chips via `color-mix` | 2 |
| `Field.js` | 159 ln | `Field` (label/required/error/hint + id wiring) + `Input`/`Textarea`/`Select`/`Checkbox`/`Switch`. Controls carry `data-ui`, which opts them out of the legacy global `input {…!important}` override | 5 |
| `Toast.js` | 190 ln | see §7 | 7 |
| `Spinner.js` | 62 ln | The one loading indicator; `role="status"` + `aria-label`, ring is `aria-hidden` | 2 |
| `Skeleton.js` | 131 ln | `Skeleton` + `SkeletonRow` with **three real measured variants** (`leads`, `invoice`, `vaultCard`), heights matching the taller real row so the table shrinks rather than grows on load, rows fading with depth | 3 |
| `EmptyState.js` | 86 ln | Distinguishes an empty **list** from an empty **filter result** (`filtered` prop swaps copy and offers "Clear filters" instead of a create CTA) | 3 |
| `ErrorState.js` | 80 ln | `role="alert"`, human sentence + de-emphasised technical `detail` + retry | 3 |
| `VirtualList.js` | 82 ln | Window-scroll virtualization with spacer blocks (no inner scroll container, so the page scrollbar stays honest). Renders everything below `threshold: 120`. `setTimeout` throttle rather than rAF, because rAF never fires in a hidden document | 1 |

Two design decisions deserve praise. `EmptyState`'s `filtered` flag exists because "Add your first client" is *wrong and slightly insulting* when the user has 400 clients and mistyped a search — that's a real product insight encoded in an API. And `ErrorState` exists to close a defect class where a `catch {}` fell through to the empty state, so a backend outage rendered as "No clients yet" — a confident lie about the user's data that invites them to re-create records they already have.

**Maturity: SHIPPED as components, PARTIAL as a system.** Only **8 of 69** `page.js` files import any of them: `accept-invite`, `clients`, `contracts/vault`, `invoices`, `leads-list`, `profile`, `settings`, `team`. Concretely:

- `app/leads/[id]/page.js:190` defines its **own local `Modal`** with `zIndex: 200`, no focus trap, no Escape, no scroll lock — inside the same app that ships one.
- **76** sites across `app/` use raw `position: 'fixed', inset: 0` overlays; `app/contracts/[id]/page.js` alone has seven at `zIndex: 600`.
- The z-index ladder is referenced **6 times** total, all inside the primitives. Raw `zIndex:` literals include `9999` (×4), `9000` (×2), `850`, `700` (×3), `600` (×13), `510`, `500`, `380`…
- **20+** call sites still use native `window.confirm` / `window.alert` / `window.prompt` despite `lib/confirm.js` providing a styled, focus-trapped, typed-confirmation dialog (`requireTyped: 'DELETE'`) — including client-facing surfaces: `app/g/[token]/page.js:81` names a client's photo selection with a browser `prompt()`, and `app/d/[token]/page.js:222` collects a contract-decline reason the same way.
- `components/SidePanel.js` — a full right-rail Calendar/Tasks/Notes dock with its own local `Spinner` and `Empty` — is **imported by nothing**. Dead.

---

### 10. Loading, empty and error states

- **Route error boundaries: SHIPPED.** 19 `error.js` files plus `app/error.js`, `app/global-error.js` and `app/not-found.js`. `components/shell/RouteError.js` documents the Next 16 rule that an `error.js` wraps its segment's page but *not* its own segment's layout — which is why per-module boundaries render inside `AppShell` (user keeps navigation) while `app/error.js` must stay shell-free (it catches throws *from* `AppShell`). It also uses `unstable_retry` rather than `reset()`, because `reset()` re-renders without re-fetching and, on the dominant failure (a failed API call), would look like a dead button. The 404 page deliberately offers both "Go to WappFlow" and "Sign in" rather than bouncing a studio's client to a login screen for a product they have no account for.
- **Loading: PARTIAL.** There are **zero** `loading.js` files, so navigation has no route-level suspense fallback; each page owns a `loading` boolean (42 of 69 pages have one). Studio pages render a bare `<p className="ms-loading">Loading…</p>` (`app/studio/[id]/cull/page.js:412`).
- **Error swallowing: a live defect class.** 101 empty `catch {}` blocks remain in `app/`. `app/clients/page.js:43-46` carries the fix and the confession in one comment; most pages have not received it.

---

### 11. Mobile responsiveness

The approach is pragmatic: because the app is styled with inline `style={{}}` objects, media queries cannot override them normally — so `globals.css:397-442` defines a library of **`r-*` utility classes using `!important` at ≤640px**, applied as `className` to the inline-styled container.

| Class | Effect |
|---|---|
| `r-stack` / `r-stack-2` | collapse a grid to 1 or 2 columns, using `minmax(0,1fr)` not `1fr` so a nowrap child cannot force the track past the viewport |
| `r-col`, `r-wrap`, `r-full`, `r-actions`, `r-toolbar` | flex reflow |
| `r-scroll-x` + `r-tw` | wide data tables scroll horizontally inside their own container (`min-width: 760px`) |
| `r-kanban` / `r-kanban-col` | swipe sideways through pipeline columns (250px each) instead of squeezing them |
| `r-modal` | full-width, `max-height: 92vh`, 16px radius |
| `r-chat-side` | channel list becomes a ≤40vh strip above the conversation |
| `r-panel`, `as-panel` | right-anchored fixed panels inset to 12px gutters |
| `wf-fab`, `wf-fab-chat/ai/studio`, `wf-page` | scale the floating buttons to 0.85 and add `padding-bottom: 132px` to the page so the last row clears both stacked FABs |
| `r-stack-tablet`, `r-stack-tablet-2` | a 900px tablet step |

The comments record the two traps that were actually hit: grid items default to `min-width: auto` and refuse to shrink below intrinsic content width (fixed by `min-width: 0` on children, `globals.css:363-366`), and a `position: fixed` element inside a transformed ancestor is positioned against that ancestor, not the viewport.

Module-specific mobile blocks exist too: `.cs-header`/`.cs-wordmark`/`.cs-nav` at `globals.css:453-458` for Contracts, and `studio.css:196-211` which hides the Studio theme switcher, drops the wordmark text, and strips the keyboard-shortcut chips off the cull decision dock (useless on touch, and they made the bar wider than a 375px phone).

**Maturity: PARTIAL.** The utilities work and the reasoning is sound, but only **28 files** use any `r-*` class, and usage is thin: `r-modal` ×25, `r-stack` ×21, `r-wrap` ×11, `r-scroll-x` ×4, `r-kanban` ×1. The largest screens — `app/leads/[id]/page.js` (2,961 lines), `app/settings/page.js` (3,106 lines) — are essentially untouched by it apart from the bespoke `.lead-grid` / `.lead-subnav` rules at `globals.css:340-378`.

---

### 12. Accessibility posture — the honest picture

This is the weakest dimension of the product and it is not close.

| Measure | Count |
|---|---|
| `onClick` handlers, whole `src/` | **1,014** |
| `onClick` in `app/` (the page layer) | **915** |
| `aria-*` attributes in `app/` | **12** |
| `aria-*` attributes in `components/` | 58 |
| `role=` attributes, whole `src/` | 25 |
| `tabIndex` occurrences | **0** |
| `onKeyDown` handlers | 23 |
| `<div>` with an `onClick` in `app/` | ~98 |
| `<main>` landmarks | 9 (across 69 pages) |
| `<h1>` elements | 75 |
| `prefers-reduced-motion` blocks | **1** |
| Skip-to-content link | **none** |

What that means in practice: the **shell and the primitives are accessible** — `aria-current="page"` on nav, `aria-label` on every icon button, `aria-haspopup`/`aria-expanded` on dropdowns, `role="dialog"`+`aria-modal` on modals and drawers, a real focus trap with restore, `role="listbox"`/`option`/`aria-selected` in the palette, `role="switch"`+`aria-checked` on `Field`'s `Switch`, `role="status"` on `Spinner`, `role="alert"` on `ErrorState` and danger toasts, `aria-busy` on loading buttons. Someone who knows accessibility built that layer.

The **page layer is not accessible**. ~98 clickable `<div>`s with zero `tabIndex` are unreachable by keyboard and unannounced to screen readers — including notification rows (`ShellNotifications.js:224`, which navigates on click from a plain `<div>`) and gallery tiles. The single `prefers-reduced-motion` block (`globals.css:294-299`) covers only `.wf-skeleton` and `.spin`; it does not cover the modal pop (`--ease-spring` scale+translate), the toast spring-in, the `wf-shake` bell animation (`globals.css:302-311`), Studio's `ms-rise` entrance, or the portfolio hero's 30-second Ken-Burns zoom (`portfolio.css:21`). Colour contrast was not systematically audited here — **UNKNOWN: no contrast measurements exist in the repo and none were run for this document**, but `--text-muted: #6b7280` on `--surface2: #222536` is visibly marginal and appears throughout as metadata text.

**Maturity: PARTIAL — accessible shell over an inaccessible body.**

---

### 13. The actual journeys

**Onboarding a new studio — PARTIAL, arguably the product's biggest experience gap.**
`/signup` is a two-panel auth screen: a gradient promo aside on the left and a three-field form (email, password, business name) plus Google OAuth on the right. Password rules are enforced client-side (≥8 chars, one uppercase, one special — `app/signup/page.js:42-46`). On success the page writes `token`/`user`/`workspace` to localStorage, sets `wf_persist: 'forever'`, and **hard-navigates** (`window.location.replace('/dashboard')`) so the plan context initialises for the new account.

Then: nothing. The user lands on an empty Kanban board. There is **no onboarding wizard, no setup checklist, no product tour, no empty-state first-run sequence anywhere in the codebase** — `grep -rn "onboard"` over `src/` returns exactly one hit, an unrelated string in `app/control/adoption/page.js:38`. Worse, `app/signup/page.js:34` and `app/login/page.js:40` both set `sessionStorage['wf_just_logged_in']` with the comment *"Triggers the per-tier welcome modal on the next page after signup"* — and **no code anywhere reads that key**. The welcome modal does not exist. **Classification: SOLD-NOT-BUILT (a welcome/onboarding moment is written into the code as if it shipped).** The nearest substitute is `/help`, a static accordion of ~10 sections of hand-written articles — whose "Getting Started" copy tells the user to "go to the WhatsApp page **from the sidebar**" (8 mentions of a sidebar), while the app has been a top-bar shell since Phase 2 and `.sidebar`, `.app-layout` and `.main-content` in `globals.css:268-289` are now **dead CSS with zero call sites**.

**Working a lead to a won deal — SHIPPED, and the most polished flow in the product.**
A WhatsApp message auto-creates a lead. It surfaces in three places at once: a Kanban card on `/dashboard` (drag between six columns to change status, via `@hello-pangea/dnd`), a row on `/leads-list`, and a bell notification. `/leads-list` is the workhorse: search, status tabs, bulk selection with an action bar (bulk status, bulk assign, round-robin, bulk trash, bulk convert-to-client), saved views persisted per browser (`app/leads-list/page.js:47`, named through a `window.prompt`), and `VirtualList` for large tables. `/leads/[id]` is a 2,961-line two-column workspace: identity sidebar left, a multi-platform chat thread over a **ten-tab** panel right (notes, reminders, invoices, emails, email-flow, vertical, room, ai, timeline, related). Marking a lead `Closed - Won` opens a modal that captures the actual sale amount (`:920-932`) — a small, correct piece of product design that keeps revenue reporting honest. `/clients` then holds the converted record with an "undo conversion" affordance.

**Delivering a shoot — SHIPPED end to end, with the strongest craft in the product.**
Create a shoot on `/studio` (name, type chip row, date, location, optional lead link) → upload → **cull** at `/studio/[id]/cull`. The cull viewer is a genuine professional tool: a full-bleed image with a decision dock (Reject / Maybe / Keep), non-destructive edit sliders (exposure, contrast, temperature, tint, saturation, fade, vignette, grain, b&w, rotate), crop with pointer-drag handles, film-style presets, compare mode, 100% zoom, and copy/paste of edit settings between frames. It is driven by a proper photographer's keyboard map (`app/studio/[id]/cull/page.js:383-409`): `→`/`space` next, `←` prev, `P` keep, `X` reject, `M` maybe, `U`/`backspace` undecided, `1`–`5` star rating, `0` clear, `Z` 100%, `C` compare, `E` edit, `F` presets, `I` info, `B` before/after, `shift+C`/`shift+V` copy/paste edits, Escape peels one layer at a time. Input elements are correctly excluded from the handler. AI hints are advisory-only and say so on screen: *"AI focus & duplicate hints are advisory only — they never select, hide, or deliver a photograph. You stay in control."* (`app/studio/[id]/page.js:549`) — a defensible, well-stated stance. From there: select photos → create a gallery (optional password) → publish → share link → the client opens `/g/[token]`, a deliberately dark masonry gallery with a lightbox, favourites with counts, and story sections; or a proofing request with a quota. Album layouts and reels branch off the same shoot.

**Sending a contract — SHIPPED.** `/contracts/[id]` is a block builder over `.cs-doc` with 19 block types across five groups (Basic, Media, Pricing, Content, Action — including `pricing_table`, `package`, `addons`, `signature`, `approval`; `app/contracts/blocks.js:12-32`), three document themes, autosave with a `saved` indicator, version history with restore, an AI panel, a clause library, a people/room panel, and preview. The client receives a link, opens `/d/[token]`, and signs.

---

### 14. Specific praise

- **The comments are the best documentation in the repo.** Nearly every primitive explains not just what it does but the bug it closes and the alternative that was rejected — `VirtualList`'s "rAF never fires while a document is hidden", `realtime.js`'s `/api/api/events` post-mortem, `Breadcrumbs`' refusal to use `router.back()`, `globals.css:496-503` on `var()` not re-resolving in a nested custom-property scope. An external reader can reconstruct the reasoning without asking anyone.
- **`useSignOut` (`session.js:34-40`)** removes only session keys instead of `localStorage.clear()`, because clearing also wiped `theme`, `ms-theme` and the dismissed-notification set — signing out silently reset the user's light/dark and Studio-theme choices. A one-line fix for a genuinely annoying bug.
- **The `.wf-public` scope** is the most careful CSS in the codebase.
- **The Studio identities** are real design, not theming. Three distinct products' worth of taste in 689 lines.
- **The status-registry fallback contract** (never crash, never normalise, neutral badge, one-shot telemetry) is better thinking than most production design systems ship with.

### 15. Specific criticism

- **The design system was ratified and then not rolled out.** 8 of 69 pages use it. The result is worse than either extreme: a reader of the code cannot tell which pattern is current, and two competing patterns render side by side inside single files (`app/leads-list/page.js` imports `leadStatusMeta` *and* defines `STATUS_META`; `app/clients/page.js` imports `Spinner`/`EmptyState`/`ErrorState` *and* keeps a local `toast` state with a `setTimeout`).
- **Typography is not systematised.** `--fw-bold` is documented as "the only bold in Core", yet `fontWeight: 900` and `800` appear all over the page layer (`app/invoices/page.js:61`, `app/leads/[id]/page.js:1466`, …). `app/chat/page.js:796` sets `fontFamily: 'system-ui, -apple-system, sans-serif'` on the whole chat pane, overriding Inter.
- **Gradients are the unmanaged accent.** `linear-gradient(135deg, #6366f1, #8b5cf6)` and friends are hardcoded at ~235 sites (`linear-gradient` occurrences in `app/` + `components/`); there is no gradient token.
- **The bell's information design is muddled.** One badge fuses server notifications, today's leads and due reminders, with a client-side dedupe rule and a localStorage dismissal set — so the number on the bell is not a number the server can ever confirm, and "Mark all read" clears three different kinds of state through two different mechanisms.
- **Native browser dialogs on client-facing pages** (`window.prompt` in `/g/[token]` and `/d/[token]`) break the studio's brand in front of the studio's own customer, which is the exact place the product least affords it.

---

### 16. Bugs, data-integrity risks and architectural smells

*(Read-only observations. Nothing was changed.)*

1. **Shell-height drift the token was created to prevent.** `--shell-h` is `58px` (`globals.css:79`) and `AppShell.js:106` uses it — but `app/chat/page.js:796` still hardcodes `height: calc(100vh - 60px)`. The chat pane is 2px short of the viewport (or overflows, depending on rounding). `AppShell.js:33` even *describes* chat as computing `calc(100vh - 60px)` as if that were still correct.
2. **Dead focus-ring declaration in Studio.** `studio.css:406` sets `.ms-root :focus-visible { outline-color: var(--ms-spark) }` (per-theme cobalt/terracotta/amber), then `studio.css:435` sets `.ms-root :focus-visible { outline: 2px solid var(--ms-accent) }` — same specificity, later wins. The themed focus colour never renders. Compounding this, `globals.css:126` suppresses the global ring inside `.ms-root` on the assumption that Studio's own outline is the single indicator, so Studio's focus indication depends entirely on the rule that clobbered the intended one.
3. **Dead onboarding hook.** `sessionStorage['wf_just_logged_in']` is written by `app/signup/page.js:34` and `app/login/page.js:40` and read by nothing. Either the welcome modal was removed or never built; the code claims it exists.
4. **Dead code with maintenance cost.** `components/SidePanel.js` (imported nowhere), `app/studio/StudioThemeToggle.js` (imported nowhere), and the entire old Studio shell CSS — `.ms-shell`, `.ms-shell-content`, `.ms-shell-link`, `.ms-wordmark`, `.ms-waffle` (`studio.css:173-215`) — have zero JS call sites since `AppShell` replaced `StudioShell`. `globals.css:266-289` (`.app-layout`, `.sidebar`, `.main-content`) and `.table-row`, `.input-field`, `.btn-secondary` are likewise unreferenced.
5. **Stale in-product help is a support liability.** `app/help/page.js` instructs users to use a sidebar that no longer exists (8 references) and documents a bulk-upload path on the dashboard. This is user-facing documentation shipped inside the product, so it is worse than a stale README.
6. **Full-table fetch on a UI interaction.** Opening the notification bell triggers `leadsAPI.getAll(null)` (`ShellNotifications.js:84`) — the entire leads table over the wire — to count today's arrivals. On a workspace with thousands of leads this is a multi-megabyte response per bell click.
7. **Accessibility regressions are structural, not incidental.** Zero `tabIndex`, ~98 clickable `<div>`s, no skip link, 9 `<main>` landmarks across 69 pages. Any keyboard-only or screen-reader user can reach the shell and then go no further. If the product ever needs a VPAT or a public-sector customer, this is a rewrite of the page layer, not a patch.
8. **Overlay stacking is unenforced outside the primitives.** 76 raw fixed overlays with literal z-indexes up to `99999` (`ImpersonationBanner.js:39`) coexist with a `--z-*` ladder used 6 times. A `Modal` (`--z-modal` = 1300) opened over a page that hand-rolls `zIndex: 9999` will render *behind* it.
9. **Multiple sources of truth for lead status.** Six colour maps plus the registry (§8). Status is a DB value that drives filtering, analytics and revenue reporting; three different display labels for `Closed - Won` across three screens is a reporting-consistency risk as much as a cosmetic one.
10. **101 empty `catch {}` blocks in `app/`** keep the "outage renders as empty state" defect class alive on most pages, despite `ErrorState` existing specifically to close it.
11. **Two competing sound paths.** `lib/sounds.js` implements per-channel mute and volume; `app/dashboard/page.js:46-80` hand-rolls oscillators that ignore both. A user who mutes new-lead sounds will still hear them on the dashboard.
12. **Theme migration duplicated in two places.** The `dark-pro/airy/bold` → `cinema/editorial/monochrome` map lives in `app/studio/layout.js:17` (pre-paint inline script) and `components/shell/StudioThemeSwitch.js:24` (runtime). Both files say they must stay in agreement; nothing enforces it.
13. **`useFocusTrap` filters focusables by `el.offsetParent !== null`** (`overlay.js:130`), which returns `null` for `position: fixed` elements even when visible. A fixed-position control inside a modal would be skipped by the Tab cycle. Not observed failing in practice — flagged as a latent risk.


---


<!-- ── 17-gaps-and-risks.md ─────────────────────────────────────────── -->

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


---


<!-- ── 18-potential.md ─────────────────────────────────────────── -->

## 18. Strategic potential — where this can go

Everything in the preceding sections describes what WappFlow *does*. This section is about what it could be *worth*, and what stands between it and that. The product's stated ambition — set out in `PRODUCT-BIBLE.md` — is to be "the Creative Business Operating System": the single place a photo/video studio finds a client, signs them, schedules the shoot, culls and delivers the photographs, and gets paid, with every one of those objects hanging off the same customer record. That is a genuinely large prize, because the studio software market is fragmented into single-purpose tools (a gallery host, a CRM, a contract signer, a booking page) that each own a slice of one workflow and none of the relationship.

The honest headline is this: **the software mostly exists, the connective tissue mostly exists now too, and the business around it does not exist at all.** WappFlow can run a studio end to end. It cannot currently charge that studio a rupee for doing so. That asymmetry is the single most important strategic fact in this document, and everything below should be read against it.

---

### 18.1 The "one OS" thesis — how close is it, really?

Two internal documents make competing claims. `PRODUCT-AUDIT.md` (2026-07-01) concluded that WappFlow "has won the feature race and lost the cohesion race" and was "roughly one focused quarter of foundational work away from feeling like one operating system," naming three specific gaps: four divergent app shells, no contact-centric data graph, and no shared primitive layer. `ECOSYSTEM.md` (2026-06-16) already described the modules as one system.

**The code says the audit was right then and is now substantially out of date.** Since that audit, Phases 2–9 landed (see `git log`, commits `ce2e36a` through `e2f2eec`):

- The four shells collapsed into one: `wappflow-web/src/components/shell/AppShell.js` plus `ModuleSwitcher.js`, `CommandPalette.js`, `Breadcrumbs.js`, `ShellNotifications.js` and a single `realtime.js` SSE bus.
- The shared primitive layer exists: `wappflow-web/src/components/ui/` now holds `Badge`, `Button`, `Modal`, `Toast`, `EmptyState`, `ErrorState`, `Skeleton`, `Field`, `Drawer`, `Dropdown`, `Spinner`, `VirtualList`.
- The contact graph was wired in Phase 7 (five commits, `fdff6b0` → `6609afd`). Winning a deal converts the lead to a client; signing a contract fires `runAutomations` (`backend/contracts-studio.js:276`) which moves the pipeline (`:283`), raises an invoice (`:298`), opens a Media Studio shoot (`:323`) and messages the client a booking link (`:339`) — all through *shared* creators (`mediaStudioApi.createProject`, `createInvoiceForLead`, `paymentsApi.createPaymentLink`) rather than the near-copies that used to exist. `backend/server.js:6461-6476` shows those creators being dependency-injected into `booking` and `print-store` so a booking and a store order reach the same invoice sequence and the same payment ledger.

So the "OS" thesis is closer to true than any document in the repo states. What follows is my classification of each pillar as it exists in code today.

| Pillar | Status | Grounding |
|---|---|---|
| CRM + WhatsApp inbox, pipeline, clients | **SHIPPED** | `backend/whatsapp-service.js` (74 KB), `backend/server.js` (43 `CREATE TABLE` statements) |
| Media Studio (ingest → cull → gallery → deliver) | **SHIPPED** | `backend/media-studio.js` (180 KB, 25 tables) |
| Contracts Studio (build → send → e-sign → automate) | **SHIPPED** | `backend/contracts-studio.js:276` `runAutomations` |
| Booking + Google Calendar two-way | **SHIPPED** | `backend/booking.js`; OAuth at `backend/server.js:5946-6010`, calendar injected at `:6468`. *Both `ROADMAP.md` and `DESKTOP-FINAL-VISION.md` still call GCal sync "gated-but-unbuilt" — the code disagrees; it is built.* |
| Print store | **SHIPPED** | `backend/print-store.js:53-127`, order → invoice → pay link |
| Client-facing payments (client → studio) | **PARTIAL** | `backend/payments.js:52` — real Stripe Checkout only if `STRIPE_SECRET_KEY` is set; otherwise a manual "mark paid" record |
| Team comms / huddles | **PARTIAL** | `backend/comms.js:19-21,423` mints LiveKit tokens, but is inert unless `LIVEKIT_URL`/`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` are set. No LiveKit deployment is evidenced in the repo |
| Command Center (internal control plane) | **PARTIAL** | Now genuinely mounted at `backend/server.js:6571` (the "dead code" claim in `DESKTOP-FINAL-VISION.md` is stale). Metering and entitlements are live; billing is not |
| Desktop app + local AI | **PARTIAL** | `wappflow-desktop/` v0.1.0 — real ONNX engine, offline store, watch-folder. No packaged installers, no distribution channel, ONNX models not committed |
| **Subscription billing** | **SOLD-NOT-BUILT** | `backend/command-center.js:309` states it outright: *"real MRR requires live subscription billing (not built)"* |
| Public/partner API (`api_access`) | **SOLD-NOT-BUILT** | The flag appears only in `backend/entitlements.js` and the Command Center plans screen. No API-key table, no key auth middleware anywhere |
| SSO, BYOK, custom integrations (Enterprise) | **SOLD-NOT-BUILT** | Same — catalog entries with no enforcement point and no implementation |
| White-label | **PARTIAL** | `backend/public-brand.js` genuinely puts the *studio's* logo/accent/name on every client-facing page (Phase 8, commit `e2f2eec`). But there is no custom-domain support, and the `white_label` entitlement is never checked — the branding applies on every plan |
| Marketplace | **STUB** | `backend/studio-experience.js:20` creates `ms_pack` with `price`/`is_public` columns; `:36-69` is plain CRUD. No storefront, no purchase, no payout |
| Mobile native app | **STUB (abandoned)** | Repo-root `App.js` is a three-screen React Native skeleton (Login / Dashboard / LeadDetail) untouched since the initial commit. The real mobile story is the PWA (`wappflow-web/public/sw.js`, `app/manifest.js`) |
| Flux (sibling content engine) | **PARKED** | `wappflow-web/src/lib/flux.js` — `FLUX_PARKED` defaults true |

---

### 18.2 The moat: a WhatsApp-native workflow, and the graph now wired around it

Two things are defensible here, and they are different in kind.

**The WhatsApp workflow is a distribution moat.** `backend/whatsapp-service.js:1` imports `whatsapp-web.js` (`^1.34.7`, `backend/package.json`) — a Puppeteer-driven automation of *WhatsApp Web*, not Meta's official Cloud API. The strategic consequences are large and cut both ways:

- **Upside:** the studio connects the number it already uses, by scanning a QR code. There is no Meta Business verification, no template pre-approval, no per-conversation fee, and no 24-hour customer-service window. Outbound contract links, gallery links and booking links go out as ordinary WhatsApp messages. For a Pakistani or Indian or Middle Eastern studio whose entire client acquisition happens on WhatsApp, this is not a feature — it is the reason to switch. No Western competitor (Pixieset, HoneyBook, Dubsado, ShootProof) offers anything comparable, because they are built for the email-first US/EU market.
- **Downside:** it is unofficial. It runs a headless Chromium per connected number on the server (`DEPLOYMENT.md` §7 installs Chromium *and* ffmpeg for exactly this), it breaks whenever WhatsApp Web changes (see commits `e8e28e7`, `8223d3e`, `d2a7755`, `f90dfb0` — four separate breakage fixes in recent history), and it is against Meta's terms of service. This is a moat built on sand, and it is section 18.8's first problem.

**The integration graph is a switching-cost moat.** Section 18.1 lists the edges; the point is that they are one-directional value accretion. A studio that has signed forty contracts through WappFlow has forty invoices, forty shoots, forty galleries and forty client timelines that only exist here. `backend/sync.js:32` (`GET /api/workspace/sync`) and the full JSON export make the data portable in principle, but the *graph* — which shoot came from which contract, which invoice from which store order — does not export into any competitor's import format. That is the real lock-in, and Phase 7 is what created it.

---

### 18.3 The desktop app and the local-AI ambition

`wappflow-desktop/` is the most strategically interesting unbuilt-out asset in the repo. What is actually there:

- An Electron shell with one-login token injection into cloud modules (`src/renderer/shell.js`, `src/main/auth.js`).
- A working ONNX inference engine (`src/main/ai/onnx.js`, `engine.js`, `preprocess.js`) that reports its execution provider (DirectML or CPU), plus `scores-client.js` to POST results back.
- Offline-first plumbing: `src/main/offline/store.js` + `sync.js` pull the `/api/workspace/sync` delta into a local cache and flush queued mutations on reconnect.
- Watch-folder ingestion (`src/main/watcher.js`) — point it at a card-reader export folder and photos upload themselves.
- Fleet management on the server side: `backend/cc-desktop.js:48-89` (`POST /api/desktop/report`, `GET /api/desktop/update-policy`, plus admin fleet/policy routes).

The architecture that makes this valuable is the analyzer registry at `backend/analyzers/index.js:47-51`. Each analyzer declares *where* it runs:

| Analyzer | `where` | `modelVersion` | Score types |
|---|---|---|---|
| `technical` | server | `tech-v1` | sharpness, blur, exposure, contrast, noise |
| `dedup` | server | `phash-v1` | dup_cluster, similar_cluster |
| `vision` | **client** | `vision-v1` | composition, aesthetic, face_count, eyes_open, smile, subject, scene_class |
| `video` | **client** | `video-v1` | shake, motion, quality, speech, emotion, scene_cut, action |
| `composite` | server | `comp-v1` | hero, portfolio, album, storytelling, hook, story, social |

Business logic only ever reads `ms_asset_scores`; it never knows who computed a row. That means the heaviest, most expensive computation in the product — running a vision model over ten thousand wedding photographs — can be pushed onto the customer's own GPU at **zero marginal cost to WappFlow**, while a competitor doing the same in the cloud pays for every frame. `backend/vision-cpu.js` provides a degraded jimp-only fallback (`vision-cpu-v1`) so no-desktop workspaces still get composition/aesthetic/scene_class, and it is deliberately versioned so a desktop's `vision-v1` supersedes it cleanly.

**What it would unlock:** RAW culling without uploading 40 GB; culling on a plane; per-studio style models trained on that studio's own keeps; and a cost structure competitors cannot match. **What stands in the way:** the app is version `0.1.0`, `package.json` notes that ONNX model files "are NOT committed", there is no code-signing certificate or update feed hosted anywhere in the repo, and nothing has ever been packaged (the notes say packaging "cannot launch/sign Electron in a headless CI sandbox"). This is a fully-designed, partially-built asset with **zero distribution**. It is the largest gap between the product's ambition and its reality.

---

### 18.4 Flux — the parked sibling

Flux (`Desktop/Sami/flux-content-engine`) is a separate AI Instagram content engine: pick a topic, it researches, scripts, designs, captions and queues. It is not dead code inside WappFlow — the integration is genuinely built. `backend/server.js:1470` exposes `POST /api/sso/flux-token`, which mints an HS256 token (`aud: 'flux'`) and returns an `ssoUrl` at `FLUX_URL`. `backend/entitlements.js` grants `flux: true` on Studio+ and Enterprise.

But `wappflow-web/src/lib/flux.js` sets `FLUX_PARKED` true by default, the landing page renders the Flux CTA greyed to "SOON" (`app/page.js:110,147`), and the Flux repo's last two commits are `f0b5edb` "park n8n container to free server RAM + disk" and `119d949` "pause Flux sign-in while parked".

Strategically this is a **held option, not a liability** — reviving it is two feature flags and a container, not a rebuild. The one live inconsistency: Studio+ advertises `flux: true` in the entitlements catalog while the product is unreachable, which is precisely the "sold-but-unbuilt" class the `UNBUILT_FEATURES` guard (`backend/entitlements.js:135`) was created to prevent. `flux` is not in that set.

---

### 18.5 Market position

| Competitor | What they own | WappFlow's actual position |
|---|---|---|
| **Pixieset / Pic-Time** | Beautiful delivery galleries, print store, client-facing polish | Feature parity is close (galleries, favourites, collections, story sections, proofing, print store, portfolio). They win on gallery craft and CDN maturity; WappFlow wins because the gallery hangs off a CRM record and a signed contract |
| **ShootProof** | Proofing + contracts + invoicing for photographers | WappFlow matches (`ms_proofing_sets`, Contracts Studio, invoices) and adds WhatsApp delivery and AI culling |
| **HoneyBook / Dubsado** | Client-flow CRM, proposals, invoicing, scheduling — US-market, email-first | WappFlow matches the workflow and beats them decisively on WhatsApp; loses badly on payments (they have Stripe + ACH + bank rails baked in; WappFlow has no subscription billing at all) |
| **AfterShoot / Narrative Select** | Desktop AI culling | The `vision`/`video` analyzers are aimed here but the desktop app is undistributed, so today WappFlow's culling AI is materially weaker |

The credible wedge is *not* "better galleries than Pixieset." It is: **the only studio OS whose client conversation, contract, shoot, gallery and invoice all live on WhatsApp, priced for a market Pixieset does not serve.** Plan prices are PKR-denominated (`backend/entitlements.js:119-123`: Creator ₨7,999 / Studio ₨14,999 / Studio+ ₨29,999, with a "Founding 100" half-price tier), which is roughly a tenth of Western SaaS pricing. That is a deliberate geographic bet, and it is the right one *if* the payment rails exist — see 18.8.

---

### 18.6 Plausible expansion paths

- **Marketplace (cheapest).** `ms_pack` already has `kind`, `def`, `author`, `price`, `is_public`. Gallery themes, contract starter packs, LUTs, reel templates and album layouts are all already data. A storefront over this table is mostly UI plus a payout rail. It also creates a supply side (photographers selling to photographers) that no competitor in this segment has.
- **Multi-vertical beyond photography (moderate).** The vertical assumption is thinner than it looks. `backend/media-studio.js:69` types a project as `wedding|event|real_estate|commercial|portrait|product|general` — a *column*, not a hardcoded workflow. Contracts, booking, invoicing, WhatsApp and the client portal are vertical-agnostic. The credible adjacent markets are event planners, real-estate agencies, and videographers — all of whom already appear in the taxonomy. A weaker version of the same argument extends to any WhatsApp-first service business (salons, tutors, clinics); that would require dropping Media Studio from the bundle, which the entitlements engine already supports per-module (`MODULE_GATES`).
- **White-label (moderate).** `backend/public-brand.js` already resolves and applies the studio's identity to every public page. The missing pieces are custom domains (nothing in code), removing WappFlow marks from `PublicFooter.js`, and actually *enforcing* the `white_label` entitlement. This is a plausible price-ladder step, not a new product.
- **Public API (expensive).** Genuinely nothing exists. `api_access` is a catalog string. Building it means an API-key table, key auth middleware alongside the JWT `auth`, rate limiting, versioning and docs. Worth doing only when a partner is asking.

---

### 18.7 AI differentiation the current engine makes cheap

The AI plumbing is unusually good relative to the rest of the product, and it changes the cost of experiments.

- **`backend/ai-engine.js:16-22,50`** — every provider (Cerebras, Groq, OpenAI, Anthropic, OpenRouter) accepts a *comma-separated list of keys*, and `PROVIDER_CHAIN` fails over on rate-limit with a per-key cooldown. Stacking free-tier accounts multiplies quota. In practice the marginal cost of an LLM feature here is near zero.
- **`backend/analyzers/index.js`** — adding a score type is one line in `SCORE_TYPES`; the ledger, idempotency, explainability (`reasons`) and desktop ingestion all come free.
- **`backend/brains.js:96-142`** — `creator_brain` and `style_profiles` already infer per-user keep-rate and per-studio "house style" from real cull decisions and the *scores of what was kept*. This is a proprietary data asset that compounds and that no competitor can copy, because it is derived from behaviour inside the product.
- **Metering exists** — `ai_usage` is written from `callLLM` (`backend/server.js:4080-4086`).

The obvious cheap wins on top of this: AI-drafted WhatsApp follow-ups keyed to the contact timeline; a "what should I do today" queue that reads the whole graph rather than just leads; auto-drafted gallery/album layouts from `style_profiles`; and per-studio pricing recommendations from won/lost history. All are days of work, not months, because the context and the plumbing are there.

---

### 18.8 Hard constraints that must be solved first

**1. There is no way to charge anyone.** `PUT /api/workspace/plan` (`backend/server.js:5453`) is authenticated but has *no role check and no payment gate*. Any member of any workspace can set `plan: 'enterprise'` — and can also inject arbitrary `features` and `limits` JSON that override the resolver. Command Center's revenue figure is explicitly labelled implied (`backend/command-center.js:309`). Until subscription billing exists and this endpoint is locked down, the entire pricing engine is decoration.

**2. Payments for the Pakistani market.** `backend/payments.js` supports exactly one processor — Stripe, called over raw `fetch` (`:123`). Stripe does not serve Pakistan. So the product prices in PKR (`entitlements.js:123`) using a rail that cannot collect PKR. The client-facing side degrades gracefully to "manual mark-paid," which is honest but means WappFlow touches none of the money and earns no payment margin. Local rails (JazzCash, Easypaisa, Safepay, PayFast, 1LINK) are not present in any form. Because `createPaymentLink` is already a single seam, adding a provider is contained work — but it is *required* work, not optional.

**3. SQLite and the single process.** `backend/server.js:41` opens one `better-sqlite3` file; `:44-57` sets WAL, `busy_timeout=5000`, `synchronous=NORMAL`, `foreign_keys=ON`. Crucially, the media worker runs **inside the API process** (`backend/media-studio.js:2877-2878`), so jimp/exifr image work competes with the Express event loop, and every connected WhatsApp number runs a headless Chromium on the same box. The worker uses lease-based job claiming (`media-worker.js:834-841`) so it is *designed* to be multi-process, but is not deployed that way. SQLite's single-writer model plus in-process CPU work is fine for tens of workspaces and will not survive hundreds. Postgres migration is named in `MEDIA-STUDIO-DESIGN.md` §8 as a Phase-3 item and has not started.

**4. Storage is local disk only — R2 is accepted-but-unimplemented.** ADR-0001 is marked *Accepted* and `backend/storage/index.js:15` implements the provider abstraction, but the dependency was never added: `storage/providers/r2.js:11` requires `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` inside a `try/catch`, and **neither package appears in `backend/package.json` or `backend/node_modules/`**. Setting `STORAGE_PROVIDER=r2` therefore falls back to local disk with a warning (`storage/index.js:20-24`), and `deploy.sh:27`'s `npm install --omit=dev` cannot change that. The ADR also states there is deliberately **no auto-migration**. So a media-heavy product on a single VPS disk does have a hard ceiling — but the escape hatch is *one npm dependency plus credentials*, not an architecture rewrite, which makes this a far cheaper unlock than its placement on this list implies. Worth pairing with the fact that `command-center/cc-storage.js:13-14` already forecasts a monthly bill against hardcoded R2 economics (`R2_RATE = 0.015` USD/GB-month, `FREE_GB = 10`) for a provider that is not wired.

**5. The WhatsApp dependency.** Covered in 18.2. The mitigation path (Meta Cloud API as a second provider behind the existing `sendClientMessage` seam) exists architecturally but not in code, and it would forfeit the very properties that make the current approach attractive.

**6. Reach.** No i18n framework exists in `wappflow-web/src/lib/` — the UI is English-only (there is an AI `translate` endpoint for *messages*, which is not the same thing). Invoice currency is per-workspace (`server.js:379-381`, default USD) while plan pricing is hardcoded PKR.

---

### 18.9 Bugs, security weaknesses and architectural smells noted while writing this section

*Read-only observations. Nothing was changed.*

- **Plan self-escalation (security / revenue).** `PUT /api/workspace/plan` (`backend/server.js:5453`) has no role guard and accepts caller-supplied `features` and `limits` JSON. Any authenticated user can grant their workspace Enterprise and arbitrary entitlement overrides. Compare `:3506`, `:3516`, `:3629`, where team endpoints *do* check `['super_admin','admin']`.
- **Unverified Meta webhooks (data integrity).** `POST /api/webhooks/instagram` (`server.js:5139`) and `POST /api/webhooks/facebook` (`:5201`) have no `X-Hub-Signature-256` verification. Anyone who learns the URL can inject leads into a workspace.
- **`flux: true` is sold and unreachable.** Studio+/Enterprise advertise Flux while `FLUX_PARKED` blocks every entry point. `flux` is absent from `UNBUILT_FEATURES` (`entitlements.js:135`), which is exactly the guard designed to prevent this.
- **`white_label` is never enforced.** The entitlement exists in the catalog; no code reads it. Studio branding via `public-brand.js` applies on every plan, so the Studio+ differentiator is already free.
- **Stale documentation contradicting code.** `DEPLOYMENT.md` §5's env table omits ~30 variables the backend actually reads (`STORAGE_PROVIDER`, `R2_*`, `LIVEKIT_*`, `STRIPE_*`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `DATA_DIR`, `GOOGLE_CLIENT_SECRET`, `FLUX_SSO_SECRET`, `CC_*`, `TRUST_PROXY`, …) and still lists `AI_PROVIDER` as one of three when the code chains five. `DESKTOP-FINAL-VISION.md` still lists Command Center as dead code (it mounts at `server.js:6571`) and GCal sync as unbuilt (it is built).
- **Worker co-located with the API.** `media-studio.js:2878` starts the media worker in the API process despite lease-based claiming that was explicitly built for multi-worker safety.
- **Server face/smile scores are wired but inert.** `backend/face-detect.js` requires `@vladmandic/face-api` + `@tensorflow/tfjs-node`; neither is installed (`node_modules/onnxruntime-node` is absent). The web cull UI can show score columns the server cannot populate for no-desktop workspaces beyond the `vision-cpu-v1` subset.
- **No AI cost governor.** `ai_usage` records `est_cost` but nothing caps spend per workspace. Free-tier key pooling masks this today; a paid provider and one runaway loop would not be masked.
- **Abandoned React Native app** at the repo root (`App.js`, `android/`, `ios/`, `src/screens/`) — dead weight that implies a mobile app that does not exist.

---

### 18.10 The three things that would most increase this product's value

**1. Build the money rail — both directions.** Subscription billing (studio → WappFlow) does not exist, and `PUT /api/workspace/plan` lets anyone self-upgrade. Client-facing payments work only through a processor unavailable in the market the product is priced for. Nothing else on this list matters commercially until a customer can pay and cannot un-pay. This is also the cheapest of the three: `createPaymentLink` is already a single provider-agnostic seam, and the entitlements resolver is already data-driven — the work is a local processor integration, a subscription table, and a role guard.

**2. Ship the desktop app.** It is the only durable technical moat in the product. The engine works, offline sync works, the watch-folder works, the fleet-management endpoints exist, and the analyzer registry means desktop-computed scores flow into the same store the web already reads. What is missing is entirely non-algorithmic: package it, sign it, host an update feed, commit or fetch the models, and put a download link behind the `desktop_access` entitlement. Until that happens, `local_ai` and `desktop_sync` are features customers are billed for and cannot install, and AfterShoot keeps the culling market.

**3. Pick the wedge and say it out loud.** The landing page headline is *"Close every lead that touches your WhatsApp"* (`app/page.js:187-190`) — a CRM pitch. The Product Bible says "Creative Business Operating System." The pricing page bundles seven modules. These are three different products. The code supports the strongest of the three: *the studio OS that runs on WhatsApp*. Narrowing the story to that would sharpen onboarding, cut the surface area that has to be maintained at parity, and make the Pakistani/South-Asian geographic bet legible rather than accidental. Feature breadth is no longer the constraint here; positioning is.


---


<!-- ── 19-addendum-1.md ─────────────────────────────────────────── -->

## Addendum 1 — Backup, restore and disaster recovery

### Why this needs its own section

Section 17.8 of this dossier disposes of backups in two sentences: a shell cron in `DEPLOYMENT.md`,
plus "UNKNOWN whether that cron is installed." That framing is too generous, and it is also slightly
unfair to the script. The truth is more specific and more actionable, and an analyst pricing an SLA,
underwriting insurance, selling to an enterprise buyer, or diligencing an acquisition cannot work from
"unknown."

The stakes are unusual for a CRM. WappFlow does not merely hold contact records. It is the custodian of
**other people's wedding photographs** (Media Studio originals, `ms_assets`), of **legally executed
contracts with drawn signatures and IP/user-agent evidence trails** (`cs_documents`, `cs_signers`,
`cs_events`), and of **the entire WhatsApp conversation history** between a studio and its clients. A
photographer whose shoot originals are gone has lost a wedding that cannot be reshot. That is a
liability event, not a support ticket.

This addendum documents what the backup procedure actually covers, what the restore procedure actually
restores, and what the real Recovery Point Objective (RPO — how much data you lose) and Recovery Time
Objective (RTO — how long you are down) are. Everything below is read out of the code and the committed
deployment guide; where they disagree, the code wins.

---

### 1. The real persistence inventory

The backend resolves two identical constants at boot — `DATA_DIR` (`backend/server.js:38`, used for the
database) and `DATA_ROOT` (`backend/server.js:61`, used for the upload tree) — both defaulting to `/data`
when `NODE_ENV=production`. Section 14 covers this seam. What matters here is the **complete** list of
what lives under it, because the deployment guide's own list is incomplete.

| Path under `/data` | Written by | Referenced from the DB by | Regenerable? |
|---|---|---|---|
| `wappflow.db` (+ `-wal`, `-shm`) | `server.js:41` | — | **No** |
| `uploads/images`, `uploads/videos`, `uploads/voices`, `uploads/files` | `whatsapp-service.js:415-450` (inbound WhatsApp media) | `messages.media_url` | **No** |
| `uploads/avatars/*` | `server.js:1542` | `users.profile_picture` | No (cosmetic) |
| `uploads/logos/*` | `server.js:1621` | `company_settings.company_logo` | No (cosmetic) |
| `uploads/<file>` (bare root) | `server.js:2510` (outbound lead media), `server.js:3433` (team-chat attachments), `server.js:4341` (AI knowledge-base documents) | `messages.media_url`, `chat_messages.media_url` | **No** |
| `uploads/media/<basename>` | `media-studio.js:615-631` | `ms_assets.storage_key` | **No — these are the client originals** |
| `uploads/media/variants/<id>-{thumb,web,poster}.jpg`, `<id>-proxy.mp4` | `media-worker.js:248-254, 692, 708` | `ms_assets.variants` JSON | Yes, from originals |
| `uploads/media/edits/<id>-r<rev>-{full,web,thumb}.jpg` | `media-worker.js:447-457` | `ms_assets.variants.full_edit` | Yes, from originals + stored edit params |
| `uploads/media/wm-<id>.jpg` (watermarked) | `media-studio.js:705-710` | `ms_assets.variants.watermarked` | Yes |
| `uploads/media/exports/<exportId>.zip` | `media-worker.js:517-545` | `ms_exports.storage_key` | Only if originals survive |
| `uploads/media/exports/album-<albumId>.pdf` | `media-worker.js:585-587` | `ms_albums.pdf_storage_key` | Only if originals survive |
| `uploads/media/exports/<exportId>.mp4` (rendered reels) | `media-worker.js:800-802` | `ms_video_exports` | Only if source media survives |
| `uploads/media/luts/custom/*` | `media-studio.js:2181-2182` | `ms_luts.storage_key` | **No** (customer-uploaded colour grades) |
| `uploads/media/tmp/*` | `media-worker.js:56-57` | — | Yes (scratch) |
| `uploads/cs/*` — client-uploaded contract attachments, workspace letterheads, and `signed-<docId>.pdf` | `contracts-studio.js:120-129, 404, 435, 836, 856` | `cs_documents.settings` JSON (`upload.url`, `signed_pdf`), `cs_settings.letterhead_url` | **No** |
| `.wwebjs_auth/session-acct-<accountId>/` | `whatsapp-service.js:226` via `LocalAuth` | `platform_accounts` rows (`whatsapp-service.js:1381`) | Only by re-scanning a QR on every tenant's phone |

Two clarifications the code forces:

* **Drawn signatures are not files.** `cs_signers.signature_data` (`contracts-studio.js:164`) stores the
  signature as a `data:image/...;base64` string *inside the database* (`contracts-studio.js:1044-1051`),
  which the PDF generator decodes at render time (`contracts-studio.js:422`). So signatures survive a
  database-only restore; the executed PDF under `uploads/cs/` does not.
* **`uploads/audit/`** exists in the working tree but is produced by `backend/_audit_setup.js:72`, a local
  scratch helper explicitly `.gitignore`d at repo root. It is not production state.

---

### 2. The documented backup, read literally

`DEPLOYMENT.md:666-706` (§12) opens with a "**What must persist** (the backend writes here, losing it =
losing data)" tree at `:668-684`. That tree lists `uploads/{voices,images,videos,files,logos,avatars}`
and **omits `uploads/media/` and `uploads/cs/` entirely** — the whole of Media Studio and the whole of
Contracts Studio. It is a tree that was accurate before those two modules existed and was never revised.

The script itself (`DEPLOYMENT.md:690-704`, installed as `/etc/cron.daily/wappflow-backup`) is better than
the tree above it. Verbatim behaviour:

1. `set -e`
2. `sqlite3 /data/wappflow.db ".backup $DEST/wappflow-$TODAY.db"` — a genuine SQLite online-backup-API
   snapshot, which **is** internally consistent against a live WAL database. This part is correct.
3. `tar czf $DEST/uploads-$TODAY.tar.gz -C /data uploads` — this tars the **whole** `uploads` tree, so it
   does in fact capture `media/` and `cs/`. **§17.8 of this dossier understates the script here.**
4. `find $DEST -type f -mtime +14 -delete` — 14-day retention.
5. `DEST=/var/backups/wappflow`.

What the script does **not** do:

* **It never touches `.wwebjs_auth/`.** The deployment guide's own "losing it = losing data" tree lists
  `.wwebjs_auth/session-*/` at `:682-683`, and then the backup below it silently excludes it.
* **It is not atomic across the two artefacts.** The DB is snapshotted at T0 and the uploads tar is written
  from T0+seconds to T0+minutes. The harmless direction is a file created after T0 (an orphan in the tar,
  wasted bytes). The harmful direction is a file **deleted** between T0 and the tar — the restored DB has a
  live `ms_assets` row whose file is absent from both the tar and the disk. `media-studio.js:950` runs
  `purgeExpiredTrash()` unconditionally on every boot, hard-deleting rows *and* unlinking files
  (`media-studio.js:920-932`), so deletions during the window are a real event, not a hypothetical.
* **`DEST` is on the same machine as `/data`.** There is no off-host copy anywhere in the repository. Host
  loss, volume loss, or ransomware takes the primary and the backup together.
* **Nothing verifies a backup.** No checksum, no `PRAGMA integrity_check`, no test restore, no size floor,
  no success notification. `set -e` means a failure aborts silently into cron's mail spool.
* **`sqlite3` — the CLI — may not exist on the host.** `backend/package.json` depends on `better-sqlite3`,
  a native Node module that ships no CLI. `DEPLOYMENT.md:403-416` installs `curl git build-essential nginx
  ufw`, Node 20, Chromium libs, ffmpeg and pm2 — **not** `sqlite3`. The guide later assumes the binary
  exists (`DEPLOYMENT.md:842-843`), but never installs it. If it is absent, `set -e` aborts at step 2 and
  **the uploads tar is never written either** — a total, silent backup failure.
* **`deploy.sh` takes no pre-deploy snapshot.** It pulls, installs, builds and `pm2 restart`s
  (`deploy.sh:17-49`). Every boot re-runs the whole schema installer, including guarded `ALTER`s and
  `entitlements.js:203-212`, which `DELETE FROM plans / plan_limits / plan_features / plan_prices` and
  reseed whenever the current default plan key is absent. A schema change ships with no rollback point.

The only other backup mechanism mentioned anywhere is one line at `DEPLOYMENT.md:706`: "For Railway: enable
Volume Backups." Production is not on Railway.

---

### 3. The documented restore, and why it does not restore the product

`DEPLOYMENT.md:708-717` is four commands: `pm2 stop`, `cp` the `.db` back, `rm` the `-wal`/`-shm`
sidecars, `pm2 start`. It **never untars `uploads-$TODAY.tar.gz`** and never mentions `.wwebjs_auth`.

Following the documented procedure exactly yields a database full of asset rows pointing at files that are
not there. The application has no idea. Concretely:

* **The API reports success.** `shapeAsset()` (`media-studio.js:363-372`) composes `url` and `thumb_url`
  from the `variants` JSON or `publicUrl(storage_key)` with **no existence check**. Gallery and project
  endpoints return HTTP 200 with a full asset list; the browser then 404s on each image individually. A
  studio owner sees a grid of broken thumbnails and a working UI insisting the photos are there.
* **Re-exporting silently produces a truncated deliverable.** The export worker skips missing files —
  `if (!fs.existsSync(abs)) continue;` (`media-worker.js:528`) — then records `file_count` from what it
  actually added (`media-worker.js:533-535`) and marks the export `ready`. A client download that should
  contain 800 photos succeeds with 0.
* **Album PDFs render grey rectangles.** `media-worker.js:605` returns from the slot on a missing file,
  leaving the `#eef0f3` placeholder painted at `:599`. The PDF completes and is marked `pdf_status='ready'`.
* **Signed contract PDFs vanish, but the evidence survives.** `cs_documents.settings.signed_pdf`
  (`contracts-studio.js:1068`) points into `uploads/cs/`; the file is gone. The signature image, typed
  name, consent flag, IP, user-agent, timestamp and hash (`contracts-studio.js:1044-1056`) are all in the
  DB, so the PDF is in principle regenerable — but nothing in the codebase offers a regenerate action.
* **Storage analytics over-report.** `cc-storage.js:23-30` sums `ms_assets.storage_size` from the database,
  so the Command Center would confidently show terabytes that no longer exist on disk.
* **Team-chat attachments break across a hostname change.** `server.js:3433` stores
  `${BASE_URL}/uploads/<file>` — an **absolute** URL — into `chat_messages.media_url`. Restoring onto a new
  host leaves every historical chat attachment pointing at the old origin. Every other upload path stores a
  relative `/uploads/...` and is unaffected.

Even a *correct* restore (DB + untarred uploads) still omits the WhatsApp session store.

---

### 4. WhatsApp: the re-pair tax

`WhatsAppManager.loadAccounts()` (`whatsapp-service.js:1380-1392`) reads `platform_accounts WHERE platform
= 'whatsapp'` and starts one Chromium-backed `WhatsAppService` per row, keyed by `session-acct-<accountId>`
(`whatsapp-service.js:1408-1417`) under `LocalAuth({ dataPath: '/data/.wwebjs_auth' })`
(`whatsapp-service.js:226`). Note that this path is hardcoded and does **not** honour `DATA_DIR`, unlike
inbound media at `whatsapp-service.js:415` — a discrepancy §14 already flags.

Consequences for DR:

* Without `.wwebjs_auth`, the restored `platform_accounts` rows are orphaned credentials. **Every tenant
  must physically pick up their phone and scan a QR code** before a single message sends or arrives. For a
  multi-tenant host this is not a runbook step; it is a coordinated customer-support campaign.
* Startup is deliberately staggered 12 seconds per account (`whatsapp-service.js:1387-1391`) to avoid
  Chromium thrash. Even with sessions intact, RTO for the messaging spine is at least `12 × N` seconds
  plus per-session initialisation.
* Message *history* is in the database and survives. Continuity of the linked device does not.

Related state that is neither backed up nor under `/data`: `.wwebjs_cache/` (listed in
`backend/.gitignore`), which `whatsapp-web.js` writes relative to the process working directory because no
`webVersionCache` is configured in `whatsapp-service.js:225-241`. It is regenerable cache, so this is a
tidiness issue rather than a data one.

---

### 5. What the RPO and RTO actually are

| Asset class | RPO (data lost) | RTO (time down) | Basis |
|---|---|---|---|
| Database | up to ~24 h | minutes | `/etc/cron.daily` runs once daily; restore is a `cp` |
| Uploads (all modules) | up to ~24 h | **effectively ∞ as documented** | tar exists (`DEPLOYMENT.md:701`); restore procedure never extracts it |
| WhatsApp sessions | **total loss, always** | hours-to-days, gated on customers | not in the backup at all |
| Host / disk loss | **total loss of everything** | — | `DEST=/var/backups` is on the same machine |
| `.env` (incl. `JWT_SECRET`) | **total loss** | minutes, if the secret is recorded elsewhere | `backend/.gitignore` excludes `.env`; the backup script never touches it. A new `JWT_SECRET` invalidates every session — recoverable, but every user is logged out |
| nginx config, pm2 process list, TLS certs | **total loss** | hours | outside `/data`; not in any backup |

Retention is 14 days with no long-term or monthly tier, so a corruption discovered on day 15 is
unrecoverable. Note the interaction with the daily purge cron at `server.js:4039-4050`, which sweeps every
registered soft-delete bin past its 90-day window (`soft-delete.js:23`) — and, for media, unlinks the files
too. A record deleted 90 days ago is purged permanently and its last live copy expired from backups 76 days
earlier.

---

### 6. Mitigations that exist in the code — and why none of them help today

**The storage abstraction is real but not deployable.** `backend/storage/index.js:15-30` selects a provider
from `STORAGE_PROVIDER`, and `backend/storage/providers/r2.js` implements Cloudflare R2 over the AWS SDK
v3. Moving originals to R2 would give genuine off-host, replicated durability. Three blockers:

1. **`@aws-sdk/client-s3` is not a dependency.** It is absent from `backend/package.json` entirely — not in
   `dependencies`, not in `optionalDependencies` — and absent from `node_modules`. `r2.js:10` try-requires
   it and returns `null` on failure, so `storage/index.js:22-25` logs a warning and **silently falls back
   to local disk**. As shipped, `STORAGE_PROVIDER=r2` does nothing.
2. **Only Media Studio uses the abstraction.** `require('./storage')` appears in `media-studio.js:259`,
   `media-worker.js:91` and `server.js:6563`. Contracts (`contracts-studio.js:404` writes with raw `fs`),
   inbound WhatsApp media (`whatsapp-service.js:448`), avatars, logos, voice notes and knowledge documents
   all bypass it. R2 would cover one module.
3. **None of `DATA_DIR`, `STORAGE_PROVIDER` or `R2_*` appear in the deployment guide's environment table**
   (`DEPLOYMENT.md:311-330`), so an operator following the documentation would never find the lever.

**The workspace JSON export is a portability feature, not a backup.** `GET /api/workspace/export`
(`server.js:3016-3045`) emits leads, notes, reminders, contact history, messages, invoices, tags, bookings
and *summary* rows for contracts, media projects and galleries. It exports **no files**, and it exports
contracts and media as id/title/status only — no blocks, no signatures, no asset rows. Useful for GDPR
portability; useless for recovery.

**Soft-delete bins are not backups.** `soft-delete.js` gives 90-day recoverability for user error
(`soft-delete.js:23`), which is a different failure mode from media loss and is itself erased by the purge
cron.

---

### 7. Maturity classification

| Capability | Status | Named gap |
|---|---|---|
| Database backup | **PARTIAL** | Correct `.backup` snapshot, but daily, unverified, same-host, 14-day, and dependent on an uninstalled `sqlite3` CLI |
| Uploads backup | **PARTIAL** | The tar is correct and complete; the guide's own inventory omits two modules and the restore never extracts it |
| Restore procedure | **STUB** | Documented at `DEPLOYMENT.md:708-717`; restores only the `.db`, producing a silently broken product |
| WhatsApp session backup | **SOLD-NOT-BUILT** | `DEPLOYMENT.md:682-683` declares the session store critical; nothing backs it up |
| Off-site / off-host copy | **SOLD-NOT-BUILT** | No implementation anywhere in the repo |
| Backup verification / restore drill | **SOLD-NOT-BUILT** | No checksum, no test restore, no alert |
| Point-in-time recovery | **SOLD-NOT-BUILT** | No WAL archiving; no `wal_checkpoint` call exists in the codebase |
| Provider-level durability (R2) | **PARTIAL** | Code is complete and tested (`backend/test-storage.js`); SDK not installed, one module wired, undocumented |
| Command Center "backups" monitoring | **SOLD-NOT-BUILT** | `COMMAND-CENTER-SPEC.md` §20 promises it; §13 of this dossier confirms no page and no endpoint |

---

### 8. Bugs, risks and smells found while researching this

1. **The restore procedure is wrong, not merely incomplete** (`DEPLOYMENT.md:708-717`). An operator
   following it in an outage will believe they have recovered. Highest-severity item in this addendum.
2. **`set -e` turns a missing `sqlite3` binary into a total silent backup failure** — the uploads tar is
   never reached. The failure surface is cron mail nobody reads.
3. **The application cannot detect a DB/file mismatch.** No route calls `storage.fileExists()` on read;
   `media-studio.js:566` is the only existence check, and it guards a presigned-upload completion. There is
   no integrity sweep, no "N assets missing files" health metric.
4. **Silent truncation on export** (`media-worker.js:528`, `:605`) — missing sources are skipped and the
   export is still marked `ready`. Under normal operation this masks disk problems; after a partial restore
   it ships a corrupt deliverable to a paying client.
5. **`chat_messages.media_url` bakes `BASE_URL` into stored rows** (`server.js:3433`), breaking on any host
   or domain change. Inconsistent with every other upload path.
6. **`purgeExpiredTrash()` runs unconditionally at boot** (`media-studio.js:950`), hard-deleting rows and
   unlinking files with no dry-run, no audit gate and no backup precondition.
7. **`entitlements.js:203-212` deletes and reseeds the entire plan catalogue** whenever the default plan key
   is missing — a boot-time destructive write to billing configuration, with no snapshot taken by
   `deploy.sh`.
8. **The backup contains everything in plaintext.** No encryption at rest exists anywhere in the codebase
   (no `createCipheriv`, no `ENCRYPTION_KEY`). `/var/backups/wappflow/*.db` is a world-readable-by-root copy
   of bcrypt password hashes, `google_calendar_refresh_token` (`server.js:865`), gallery capability tokens
   (`ms_gallery_access.access_token`, `media-studio.js:1314-1320`), every client's contact details and every drawn
   signature. The backup directory has a materially larger blast radius than the app.
9. **`.wwebjs_auth` ignores `DATA_DIR`** (`whatsapp-service.js:139, 226` vs `:415`), so a
   `DATA_DIR`-relocated deployment scatters state across two roots — and any backup written against
   `DATA_DIR` would miss the sessions by construction.

---

### 9. What could not be determined

* **UNKNOWN: whether `/etc/cron.daily/wappflow-backup` is installed on the production host.** It exists
  only as a fenced code block in `DEPLOYMENT.md`; there is no copy of it in the repository, no installer
  in `deploy.sh`, and no host access from here.
* **UNKNOWN: whether `sqlite3` (the CLI) is installed on production.** The guide neither installs it nor
  flags the dependency.
* **UNKNOWN: whether `/data` and `/var` are separate block devices on the OVH host.** They are certainly
  on the same machine, so host loss is total regardless; disk-level independence would only mitigate a
  single-volume failure.
* **UNKNOWN: whether any restore has ever been performed or rehearsed.** No runbook artefact, no drill log,
  no `scripts/verify-*` harness covers restore.
* **UNKNOWN: current production data volume** (`ms_assets` count / total `storage_size`), which would set
  the real tar duration and therefore the width of the non-atomic window. The dev tree's `uploads/` is
  empty apart from `uploads/audit/` fixtures.
* **UNKNOWN: whether Railway Volume Backups were ever enabled historically**, and whether any artefact from
  that era still exists. Production has since moved to OVH.


---


<!-- ── 19-addendum-2.md ─────────────────────────────────────────── -->

## 19. Data Protection, Retention, Erasure — and the Account That Cannot Be Closed

This section covers a domain the rest of the dossier does not touch: what personal data WappFlow holds, about whom, for how long, who can get it out, and who can get it *deleted*. It matters disproportionately because WappFlow is not a tool that stores its users' own data — it is a tool whose entire value is storing **third parties' data**. The photographer signs up; the photographer's clients, and every stranger who WhatsApps the studio's number, are the people whose names, phone numbers, message bodies, dates of birth, signatures, IP addresses and photographs end up in the database. Those people never visited wappflow.remoteops.co and never agreed to anything.

The one-line summary: **the platform can collect and retain third-party personal data but has no mechanism to erase a person, and no mechanism to close an account — while shipping a live public privacy policy that promises both.**

### 19.1 Whose personal data is stored, and where

WappFlow's SQLite schema declares roughly 130 tables (counted by `grep -o "CREATE TABLE IF NOT EXISTS [a-z_]*" backend/*.js | sort -u`). These are the ones holding identifiable data about people who are *not* WappFlow users:

| Table | File:line | Personal data it holds | Data subject |
|---|---|---|---|
| `leads` | `backend/server.js:295-308`, cols added at `:672-691` | `customer_name`, `customer_phone`, `email`, `address`, **`date_of_birth`** (`:677`), `wa_username`, plus AI profiling columns `sentiment`, `urgency`, `intent_category`, `lead_score` (`:687-691`) | Anyone who messages the business |
| `messages` | `backend/server.js:358-368` | Full message `body`, `media_url`, direction, timestamp | Same |
| `lead_emails` | `backend/server.js:578-591` | `from_email`, `to_email`, `subject`, full `body` | Email correspondents |
| `contact_history` | `backend/server.js:455-464` | Free-text `description` + JSON `metadata` per interaction | Leads |
| `activity_timeline` | `backend/server.js:812-826` | `actor_name`, `title`, `body`, `metadata` — the canonical per-contact story | Leads |
| `notes`, `reminders` | `backend/server.js:310-330` | Staff free text *about* a person | Leads |
| `bookings` | `backend/booking.js:42-53` | `name`, `phone`, `email`, `notes`, plus a JSON `intake` blob | Anyone using the public `/book` form |
| `cs_signers` | `backend/contracts-studio.js:154-166` | `name`, `email`, `phone`, `typed_name`, **`signature_data`** (a base64 PNG of the drawn signature), **`ip`**, `user_agent`, `signed_at` | Contract signatories |
| `cs_events` | `backend/contracts-studio.js:168-175` | `ip`, `user_agent` per view/open/sign event | Signatories |
| `ms_assets` | `backend/media-studio.js:90-111` | The actual photograph and video files of clients, plus EXIF `camera_meta` and `capture_time` | Photographed subjects |
| `ms_asset_scores` | `backend/media-studio.js:114-123` | Derived `face_count` / `smile` values from face detection (see §19.7) | Photographed subjects |
| `ms_gallery_access` | `backend/media-studio.js:1314-1321` | Client `email` + `access_token` + `last_viewed_at` | Gallery viewers |
| `ms_client_favorites` / `ms_client_comments` / `ms_proofing_selections` | `1322`, `1330`, `1373` | `contact_identifier` + free-text `body` | Gallery viewers |
| `ms_print_orders` | `backend/print-store.js:34-40` | `customer_name`, `customer_phone`, `customer_email`, order items | Print buyers |
| `audit_logs` | `backend/server.js:466-477` | `user_id`, `entity_id`, JSON `details` (which frequently contains a lead id or a member's email — see `server.js:3659-3660`) | Staff and leads |

Crucially, most of these people are enrolled *automatically*. Inbound WhatsApp messages create leads without any human action, including a backfill sweep that imports everything missed while the connection was down (`backend/whatsapp-service.js:1208-1325`). A person who sends "how much for a wedding shoot?" becomes a permanent CRM record with a sentiment label attached.

One genuine positive: video calls store only session metadata and participation events — `call_sessions` / `call_events` (`backend/comms.js:79-88`) have no recording or transcript columns, and grepping `comms.js` for "recording" or "transcript" returns nothing.

### 19.2 The public legal pages — live, binding, and full of placeholders

Both `/privacy` and `/terms` are real Next.js routes rendering a hard-coded `SECTIONS` array (`wappflow-web/src/app/privacy/page.js:8-24`, `wappflow-web/src/app/terms/page.js:8-24`). Both are dated "Last updated: May 2026" (`:36`). Both still carry unreplaced placeholders:

- `[Company Legal Name]` — `privacy/page.js:9`, `terms/page.js:9`
- `[privacy@yourcompany.com]` — `privacy/page.js:23`
- `[legal@yourcompany.com]` — `terms/page.js:23`
- `[jurisdiction]`, twice in one sentence — `terms/page.js:22` (governing law)

And both render their own disclaimer to the reader, in a warning-coloured box above the text (`privacy/page.js:38-42`, `terms/page.js:38-42`):

> "This is a starting-point draft. Replace the bracketed placeholders with your company details and have it reviewed by a qualified lawyer before publishing."

That banner is visible to end users in production. Meanwhile the signup and login pages bind users to these documents: *"By creating an account you agree to our Terms and Privacy Policy"* (`wappflow-web/src/app/signup/page.js:246`; the same at `login/page.js:238`). So the product's contractual terms name no legal entity, no contact address and no governing jurisdiction, and tell the reader they have not been lawyered.

Separately, the marketing landing page's footer links to neither: `wappflow-web/src/app/page.js:2250-2251` renders `<a href="#">Privacy</a>` and `<a href="#">Terms</a>` — dead anchors. The only paths to the policies are the signup/login microcopy.

#### Promises the code does not keep

| Policy text | Where | What the code does |
|---|---|---|
| "After account closure we delete or anonymize data within a reasonable period" | `privacy/page.js:18` (§10) | **There is no account closure.** No endpoint deletes a workspace, a user, or an account (§19.3). No code path anonymises anything — grep for `anonymi[sz]` across `backend/` returns zero hits. |
| "You may... close your account at any time" | `terms/page.js:20` (§12) | Same. The only self-service exit is to stop logging in. |
| "You can exercise many of these rights [access, correct, export, **delete**] directly in the Service" | `privacy/page.js:19` (§11) | Settings → Data & Privacy offers exactly two controls: an "Export all data (JSON)" button and a read-only audit log list (`wappflow-web/src/app/settings/page.js:1202-1258`). No delete. No erase. No rectify-on-request. |
| "Deleted leads are kept in Trash for a limited period before permanent removal" | `privacy/page.js:18` (§10) | True of the `leads` *row*. False of that person's messages, emails and timeline, which survive the purge (§19.5). |
| "Your data is not used to train third-party public models" | `privacy/page.js:14` (§6) | Nothing in code enforces or can verify this; the default OpenRouter model id ends in `:free` (§19.8). |
| "We share data only with service providers... under appropriate confidentiality and data-protection commitments" | `privacy/page.js:15` (§7) | No sub-processor list, DPA template or vendor register exists anywhere in the repo (grep for "sub-processor", "subprocessor", "data processing agreement" across `*.md` and `*.js`: zero hits). |

### 19.3 There is no account or workspace deletion — SOLD-NOT-BUILT

Exhaustive search of every `app.delete(` / `router.delete(` in `backend/*.js` matching account/workspace/user/profile terms returns exactly two endpoints:

- `DELETE /api/workspace/members/:id` — `backend/server.js:3643`
- `DELETE /api/platform-accounts/:id` — `backend/server.js:5113` (disconnects a WhatsApp/Meta channel)

There is no `DELETE /api/workspace`, no `DELETE /api/users/me`, no "Danger Zone", no deactivation flag. Searching the whole frontend for "delete account", "close account", "danger zone" or "deactivate" returns nothing. The Settings tab list (`wappflow-web/src/app/settings/page.js:50-73`) has thirteen tabs and none of them is account termination.

What member removal *does* do is instructive: it hard-deletes the `workspace_members` row (`server.js:3657`) — deliberately, with the reasoning written out at `:3650-3656` (it is an auth table; soft-deleting would leave a removed member authenticating with stale permissions) — and then nulls `users.workspace_id` (`:3664`). The `users` row itself, with `email`, `password` hash and `business_name` (`server.js:285-293`), persists forever. A removed colleague is not erased; they are orphaned.

### 19.4 What retention actually exists: one registry, five entities

`backend/soft-delete.js` is the platform's only retention policy, and it is genuinely well-built for what it covers. `RETENTION_DAYS = 90` (`:23`), and `ENTITIES` (`:28-42`) is the single registry:

| Entity | Retention | Flag | Notes |
|---|---|---|---|
| `leads` | 90 days | `is_deleted` | Swept by cron |
| `invoices` | **`null` — never purged** | `is_deleted` | Deliberate: `purgeExpired` skips null-retention tables (`:101`) so a financial record cannot vanish on a timer |
| `cs_documents` | 90 days | `is_deleted` | Contracts. **Note:** the framing that contracts are "retained forever by design" is wrong — the code gives them the standard 90-day window (`soft-delete.js:31`) |
| `bookings` | 90 days | `is_deleted` | Registered but **no producer** — nothing outside tests ever sets `bookings.is_deleted = 1` |
| `ms_assets` | 90 days | (own column) | `externalPurge: true`; the sweep lives in `media-studio.js` because files must leave storage too |

`workspace_members` is explicitly excluded, with the security rationale in a comment at `:33-37`.

The sweep runs nightly: `cron.schedule('0 0 * * *', …)` → `softDeleteLib.purgeExpired(db)` (`backend/server.js:4039-4041`), which issues one `DELETE FROM <table> WHERE <flag> = 1 AND deleted_at < datetime('now','-90 days')` per registered entity (`soft-delete.js:105-108`).

Notice what is *not* in the registry: `messages`, `lead_emails`, `contact_history`, `activity_timeline`, `notes`, `reminders`, `audit_logs`, `cs_signers`, `cs_events`, `ms_print_orders`, `ms_gallery_access`, `payments`, `ai_memories`, `password_resets` — 125 of the 130 tables have no retention policy at all. Classification: **PARTIAL** — a real, well-reasoned recycle bin covering 5 entities, mistaken for a retention policy.

### 19.5 The orphan problem: purging the parent does not purge the person

This is the most consequential technical finding in this section. The nightly sweep deletes the `leads` row and nothing else.

The interactive delete paths *do* cascade. `DELETE /api/leads/:id/permanent` removes `notes`, `reminders`, `messages`, `contact_history` before deleting the lead (`server.js:2314-2318`), and the bulk `DELETE /api/leads/trash` does the same over a list (`:2264-2266`). But:

1. **The cron purge does not cascade.** `purgeExpired` is generic table-by-table SQL (`soft-delete.js:105-108`). A lead binned and forgotten for 91 days has its row deleted while every message body, email, contact-history entry and timeline row keyed to its `lead_id` remains — permanently, now unreachable through any UI and undiscoverable by any query the app makes.
2. **Neither path ever touches `lead_emails` or `activity_timeline`** — they are absent from both cascade lists, so even a deliberate permanent delete leaves the person's email bodies and activity story behind.
3. **A second, older cleanup endpoint still exists**: `DELETE /api/leads/trash/cleanup` (`server.js:2324-2327`) runs the raw 90-day `DELETE FROM leads` with *no* cascade and *no* attachment guard, bypassing the Phase-3 safety net entirely.
4. **Contracts have the same shape.** `DELETE /api/cs/documents/:id` bins the document and deliberately leaves signers and events intact so a restore is complete (`contracts-studio.js:598-609`, comment at `:602-604`) — correct for restore. But at day 91 `purgeExpired` deletes the `cs_documents` row and nothing else, leaving `cs_signers` rows containing a named person's email, phone, **drawn signature image and IP address** dangling against a `document_id` that no longer exists, forever.
5. **Media Studio is the good citizen.** `purgeAsset` (`media-studio.js:924-932`) deletes the asset row, its scores, its cull decisions, its portfolio references *and* the original plus derived files from local disk or R2. It is the only cascade in the codebase that also handles blobs. It still does not clear `ms_gallery_assets` (`:1307`), `ms_client_favorites` (`:1322`), `ms_client_comments` (`:1330`) or `ms_proofing_selections` (`:1373`).

### 19.6 No per-data-subject access or erasure path

There is no endpoint anywhere that accepts a phone number or email address and returns, or erases, everything about that person. Erasure is only ever expressible as "delete this lead", and as §19.5 shows that is not erasure.

Access/portability is served by one endpoint: `GET /api/workspace/export` (`backend/server.js:3016-3046`). It is **workspace-scoped, not subject-scoped** — a data subject request would require exporting the whole workspace and manually filtering. And the UI's claim that it downloads "everything in this workspace" (`settings/page.js:1228`) is not accurate:

| In the export | Omitted |
|---|---|
| `leads` (all columns) | `lead_emails` (email bodies) |
| `notes`, `reminders`, `contact_history` | `activity_timeline` |
| `messages` — but only `id, lead_id, body, from_me, media_type, platform, timestamp` (no `media_url`) | `cs_signers` / `cs_events` (signatures, IPs) |
| `invoices`, `tags`, `bookings` | `ms_assets` file list and the files themselves |
| `contracts` — metadata only, **no `blocks`**, so the contract text is absent | `ms_print_orders`, `payments`, `ai_memories`, `notifications`, `chat_messages` |
| `media_projects`, `galleries` — titles only | `ms_gallery_access`, favorites, comments, proofing selections |
| `audit_logs`, capped at the newest 2000 rows | Everything in the other ~100 tables |

Classification: export is **PARTIAL** (works, incomplete, mislabelled); per-subject access and erasure are **SOLD-NOT-BUILT**.

### 19.7 Consent, profiling, and face detection

**Consent.** Exactly one surface in the product captures an informed consent from a third party: the public contract signing page, where an unticked checkbox gates signing and states *"I agree to sign electronically; my e-signature is the legal equivalent of my handwritten signature (ESIGN/UETA). I consent to my IP, timestamp and device being recorded."* (`wappflow-web/src/app/d/[token]/page.js:239-240`), enforced server-side at `contracts-studio.js:1044-1045` before the IP and user-agent are written at `:1050`. That is a well-done consent capture. Every other public surface — `/book`, `/g` (galleries), `/shop`, `/pay`, `/client`, `/chat`, `/folio` — collects personal data with **no privacy notice and no consent control**; grepping those route directories for "privacy", "consent" or "terms" returns nothing.

**Profiling.** `leads` carries `sentiment`, `urgency`, `intent_category` and `lead_score` (`server.js:687-691`), written by `POST /api/leads/:id/ai/analyze` (`server.js:4213`). These are automated inferences about an identified natural person, persisted indefinitely, with no notice to that person and no way for them to see or contest them. `leads.date_of_birth` (`:677`) is also collected.

**Face detection.** `backend/face-detect.js` runs `@vladmandic/face-api`'s TinyFaceDetector plus the expression net over every ingested photo (`:51-52`, `:83-88`), invoked through an optional seam in the ingest worker (`backend/media-worker.js:36-37`, `:321-341`). Be precise about what it does and does not do:

- It persists **only two numbers per photo**: `face_count` and a `smile` score 0–1 (the max "happy" expression probability), written as advisory rows in `ms_asset_scores` (`media-worker.js:340-341`; schema `media-studio.js:114-123`). It does **not** compute, store or compare face *embeddings* or geometry templates, and there is no identity matching anywhere in the codebase.
- It is off unless someone installs the optional packages on the server; `require('./face-detect')` throws otherwise and the seam silently no-ops (`face-detect.js:21-23`, `media-worker.js:37`).
- It is per-*server*, not per-workspace and not per-subject: there is no toggle a studio can flip, and certainly none the photographed person can.

Whether "run a face detector over a client's wedding photos" is regulated processing is a legal question the code cannot answer — statutes differ sharply on whether detection without a stored template counts. **UNKNOWN:** no legal analysis of this exists in the repo, and the privacy policy never mentions image analysis at all — §6 (`privacy/page.js:14`) describes AI only as analysing "conversations".

### 19.8 Transfers, sub-processors and what leaves the building

`backend/ai-engine.js` maintains an ordered failover chain, default `cerebras,groq,openrouter` (`:50`), with per-provider keys read from `CEREBRAS_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY` (`:17-21`). What is sent is not a redacted digest: `buildConversationContext` (`server.js:4121-4133`) assembles the lead's **name, phone number, estimated value and every message body** into the prompt, which `POST /api/leads/:id/ai/summary` (`:4136`) then ships to whichever provider answers first. The default OpenRouter model is `z-ai/glm-5.2:free` (`ai-engine.js:32`), and the runtime model-discovery path explicitly filters to ids ending in `:free` when free models are preferred (`:133`). Free aggregator tiers commonly carry different data-use terms from paid ones; the policy's flat assurance at `privacy/page.js:14` is not something the code establishes.

Other data egress points: Cloudflare R2 when `STORAGE_PROVIDER=r2` (`media-studio.js:256`, `:610`) for client photographs; Stripe (`STRIPE_SECRET_KEY`); the workspace's own SMTP/IMAP servers with credentials stored in `email_smtp_settings` / `email_imap_settings` (`server.js:578-604`); Meta/WhatsApp. There is no region selection, no residency control, no sub-processor register, and no DPA template in the repo — which makes privacy §12 ("International Transfers", `privacy/page.js:20`) unbacked.

### 19.9 Operator access to customer data

The Command Center control plane is mounted unconditionally at `backend/server.js:6571`, contradicting older internal notes that call it dead code. It grants platform staff, under a separate `cc_admins` identity, the permissions `impersonate`, `impersonate_write`, `run_sql` and `bulk_actions` (`backend/command-center.js:28`; role presets at `:36-38`). `POST /api/cc/workspaces/:id/impersonate` (`:438-458`) mints a session token for the workspace owner, recording the session in `cc_impersonations` (`:75-78`) and emitting an audit event — but **the customer is never notified**, before or after. `POST /api/cc/db/query` (`backend/cc-explorer.js:106`) allows arbitrary read SQL across all tenants behind the `run_sql` permission and a step-up token. This is normal for a SaaS control plane and is properly audited; it is nonetheless the single largest disclosure any enterprise security questionnaire will ask about, and nothing in the privacy policy mentions it.

### 19.10 Backups

`DEPLOYMENT.md:688-703` documents a daily `sqlite3 .backup` plus an uploads tarball into `/var/backups/wappflow`, pruned with `find … -mtime +14 -delete` — a 14-day window, unencrypted, on the same host. **UNKNOWN:** whether this cron is actually installed on the OVH production box; the repo only contains the instructions. Either way, any erasure that *were* implemented would remain incomplete for up to 14 days, and that gap is not disclosed anywhere.

### 19.11 Licensing

There is no `LICENSE` file at the repo root or one level down (`find . -maxdepth 2 -iname "LICENSE*"` → no matches). The root `package.json` has `"private": true` and no `license` field; `backend/package.json:13` declares `"license": "ISC"`, which is an open-source licence applied to a commercial closed product with no licence text to back it. Under default copyright, absent-licence code is all-rights-reserved, so this is a labelling inconsistency rather than an inadvertent giveaway — but it will fail any diligence checklist.

### 19.12 Bugs, security weaknesses and data-integrity risks

Read-only observations; nothing here was changed.

1. **`GET /api/workspace/export` has no role gate and no lead scoping** (`server.js:3017`). It is protected by `auth` only. The `user` role defaults to `view_all_leads: false` (`server.js:189`) and every list endpoint honours that (`:1752`, `:1806`, `:2247`, `:3252`), but the export query is a bare `SELECT * FROM leads WHERE workspace_id = ?` (`:3021`). A restricted junior member can download every lead, every message body, every invoice and 2000 audit rows in the workspace in one request. Bulk-exfiltration risk, and it defeats the permission model everywhere else.
2. **`GET /api/audit-logs` has no role gate either** (`server.js:3002`), exposing who did what to whom, including other members' emails embedded in `details` (`:3659-3660`).
3. **Orphaned personal data after every cron purge** — §19.5. Rows containing names, phone numbers, message bodies, signature images and IP addresses survive their parent indefinitely and are invisible to the app. This is both a retention defect and a silent data-integrity problem (dangling foreign keys with no `ON DELETE` anywhere; `PRAGMA foreign_keys` is not enabled).
4. **`DELETE /api/leads/trash/cleanup`** (`server.js:2324-2327`) is a surviving pre-Phase-3 endpoint that hard-deletes leads with no attachment guard and no child cascade — the exact behaviour Phase 3 was written to remove.
5. **`audit_logs.ip_address` is declared (`server.js:475`) and never written.** `logAudit` (`:1189-1196`) inserts seven columns and omits it. Every audit row's IP is NULL, so the audit trail cannot answer "from where". Dead column, false sense of coverage.
6. **`softDelete()` / `restore()` in `soft-delete.js:71-91` are exported but never called** — every producer is hand-written SQL (`server.js:2280`, `:2393`, `:2697`, `:5826`; `contracts-studio.js:605`). The registry is authoritative for the *sweep* but not for the *writes*, so a future entity can be registered and still never enter the bin — which is already true of `bookings` (registered at `soft-delete.js:32`, zero producers).
7. **IMAP passwords are stored in plaintext.** `email_imap_settings.imap_pass` (`server.js:600`) is written raw (`:3768`, `:3771`) and read raw for connections (`:3785`, `:3878`). The API masks it on read (`:3757`) but the database holds the credential to the workspace owner's mailbox in the clear. The same pattern applies to `email_smtp_settings`. No encryption-at-rest exists — the SQLite file is unencrypted, as are the 14-day backups.
8. **`/uploads` is world-readable** — `express.static` with `Access-Control-Allow-Origin: *` and no auth (`server.js:117-121`). Covered in §15 and §17; restated here because in data-protection terms it means WhatsApp media, voice notes and avatars of third parties are retrievable by anyone with the URL, which is an unauthorised-disclosure exposure, not merely a hardening gap.
9. **`password_resets` rows are never cleaned up.** The table stores `requested_ip` per attempt (`account-recovery.js:45-53`, IP captured at `:128`); no `DELETE FROM password_resets` exists anywhere. An unbounded IP log accumulates forever.
10. **Placeholder legal text is live in production** — §19.2. `[Company Legal Name]`, `[jurisdiction]` and the "have it reviewed by a qualified lawyer before publishing" banner are all rendered to real users who are told they agree to them at signup.

### 19.13 Maturity summary

| Capability | Status |
|---|---|
| Soft-delete recycle bin for 5 entities, 90-day sweep, invoice exemption, attachment guard | **SHIPPED** |
| E-signature consent capture with ESIGN/UETA wording and IP/UA recording | **SHIPPED** |
| Media asset purge that also removes files from storage | **SHIPPED** |
| Workspace JSON export | **PARTIAL** — works, but omits ~8 PII-bearing tables and has no role gate |
| Audit log | **PARTIAL** — real trail, but `ip_address` never populated and no role gate on reads |
| Retention policy | **PARTIAL** — covers 5 of ~130 tables; purge does not cascade |
| Account / workspace closure | **SOLD-NOT-BUILT** — promised in privacy §10 and terms §12; no endpoint, no UI |
| Right to erasure / per-data-subject deletion | **SOLD-NOT-BUILT** — promised in privacy §11; no code path |
| Right of access / rectification on request | **SOLD-NOT-BUILT** — promised in privacy §11; only workspace-wide export exists |
| Anonymisation | **SOLD-NOT-BUILT** — promised in privacy §10; zero occurrences in code |
| Consent capture on public forms (booking, gallery, shop, chat) | **SOLD-NOT-BUILT** — privacy §3 makes the operator responsible for lawful basis and gives them no tool |
| Sub-processor register / DPA / data residency | **SOLD-NOT-BUILT** — referenced in privacy §7 and §12, exists nowhere |
| Encryption at rest | Not implemented, and not claimed — privacy §9 (`privacy/page.js:17`) carefully claims only HTTPS, access controls and workspace isolation |
| Repository licence | Absent; `backend/package.json` says ISC with no licence file |

For anyone scoping EU/UK expansion, an enterprise DPA, or a security questionnaire: the honest position is that WappFlow today has a well-engineered *undo* system and no *data-protection* system. Those are different products, and the privacy policy currently sells the second.


---


<!-- ── 19-addendum-3.md ─────────────────────────────────────────── -->

## Addendum 3 — Email as a Second Communication Channel (SMTP out, IMAP in)

WappFlow's marketing calls it a unified inbox for studios: WhatsApp, Instagram, Facebook, website forms —
and email. Email is the only one of those channels the platform runs *itself*, with its own credentials,
its own background process, and its own tables. Nowhere else in this dossier is it described as a
subsystem, so this addendum does that: what exists, how it behaves at runtime, and where it stops.

The short version: **outbound email is SHIPPED and used by six different features; inbound email is
PARTIAL and quietly destructive; email automation (templates with triggers, workflows) is
SOLD-NOT-BUILT.**

---

### 1. What "email" means here

A WappFlow tenant is a *workspace* owned by one user (the studio owner). Email is configured **per
workspace, on the owner's user row** — not per team member and not per workspace id. Every email
read/write resolves credentials with `req.workspaceOwnerId` (e.g. `backend/server.js:3819`), so a
five-person studio shares one sending identity and one receiving mailbox.

WappFlow is not a mail server. It borrows the studio's existing mailbox:

* **Outbound** — the studio pastes SMTP host/port/user/password (Gmail app password, SendGrid key, etc.)
  into Settings, and WappFlow opens a `nodemailer` connection per message.
* **Inbound** — the studio pastes IMAP credentials for the *same* mailbox, and a background loop inside
  the API process logs into it every two minutes, reads unread messages, and files matching ones onto
  lead records.

There is no shared platform mail domain for tenant mail, no sending reputation owned by WappFlow, and no
webhook-based provider (no SES/Postmark/Mailgun). Dependencies are `nodemailer ^8.0.7`, `imap ^0.8.19`
and `mailparser ^3.9.8` (`backend/package.json:26,29,33`).

---

### 2. The five tables

All are created in the one big `db.exec` schema block in `server.js`.

| Table | Line | Key columns | Purpose |
|---|---|---|---|
| `email_smtp_settings` | `server.js:564` | `user_id` **UNIQUE**, `smtp_host`, `smtp_port` (default 587), `smtp_secure`, `smtp_user`, `smtp_pass`, `from_name`, `from_email` | One outbound identity per workspace owner |
| `email_imap_settings` | `server.js:593` | `user_id` **UNIQUE**, `imap_host`, `imap_port` (default 993), `imap_secure` (default 1), `imap_user`, `imap_pass`, `is_enabled` (default 0) | One inbound mailbox per workspace owner |
| `lead_emails` | `server.js:578` | `id`, `lead_id`, `workspace_id`, `user_id`, `direction` (`sent`/`received`), `from_email`, `to_email`, `subject`, `body`, `status`, `created_at` | The per-lead email thread, both directions |
| `email_templates` | `server.js:428` | `id`, `user_id`, `name`, `subject`, `body`, `delay_days`, `trigger_event` (default `manual`) | Reusable follow-up copy |
| `email_workflows` | `server.js:440` | `id`, `user_id`, `workspace_id`, `lead_id`, `template_id`, `template_name`, `template_subject`, `status` (default `pending`), `scheduled_at`, `sent_at` | A template "queued" against a lead |

Notes on shape:

* `lead_emails` has **no `message_id`, no `in_reply_to`, no `thread_id`, no attachment columns and no
  `read_at`**. Threading, attachments and read state simply do not exist in the data model.
* `email_workflows.workspace_id` was added later by a migration (`server.js:737`) with a backfill from
  `users.workspace_id` (`server.js:742`) — the same owner-id-vs-workspace-id confusion documented in
  §15. Reads still carry the dual predicate `(workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))`
  (`server.js:2035`).
* The only index is `idx_lead_emails_lead ON lead_emails(lead_id)` (`server.js:906`). There is no index
  on `workspace_id`, `direction`, or `created_at`, and the inbound dedup query filters on
  `(lead_id, direction, from_email, subject, created_at)`.

---

### 3. Endpoint inventory

| Method | Path | Line | Auth / role | Notes |
|---|---|---|---|---|
| GET | `/api/settings/email-smtp` | `3701` | `auth` only | Password masked to `••••••••`; host/port/user returned to **any** member |
| PUT | `/api/settings/email-smtp` | `3710` | `auth` + `super_admin\|admin` | Masked value round-trips and preserves the stored password (`3715`) |
| POST | `/api/settings/email-smtp/test` | `3729` | `auth` only | `transporter.verify()` then sends a test mail to `from_email` |
| GET | `/api/settings/email-imap` | `3753` | `auth` only | Password masked |
| PUT | `/api/settings/email-imap` | `3761` | `auth` + `super_admin\|admin` | Sets `is_enabled`, which is what enrols the mailbox in the global poller |
| POST | `/api/settings/email-imap/test` | `3779` | `auth` only | Opens a real IMAP connection with the owner's stored credentials; `connTimeout 10s`, `authTimeout 8s` |
| POST | `/api/settings/email-imap/poll-now` | `3859` | `auth` only | `await triggerEmailPoll(req.workspaceOwnerId)` — the HTTP request blocks on a full mailbox poll |
| GET | `/api/leads/:id/emails` | `3804` | `auth`, lead scoped via `getScopedLead` | Full thread, newest first |
| POST | `/api/leads/:id/email` | `3813` | `auth`, lead scoped | Compose + send; 400 if SMTP unconfigured |
| POST | `/api/invoices/:id/email` | `2728` | `auth` | Renders the invoice document and mails it; flips a `draft` invoice to `pending` (`2764`) |
| GET/POST/PUT/DELETE | `/api/email-templates[/:id]` | `2773`–`2799` | `auth`, keyed to `workspaceOwnerId` | Plain CRUD |
| GET/POST | `/api/leads/:leadId/email-workflows` | `2028`, `2042` | `auth`, lead scoped | Creates a row with `status='pending'` |
| PUT | `/api/email-workflows/:id/status` | `2060` | `auth` | Manual status flip only |

Frontend bindings live in `wappflow-web/src/lib/api.js`: `settingsAPI.getEmailSmtp/updateEmailSmtp/testEmailSmtp`
(`:128-130`), `leadEmailsAPI.getAll/send/pollNow` (`:133-137`), `emailTemplatesAPI` (`:189`),
`emailWorkflowsAPI.updateStatus` (`:196`). The IMAP settings tab bypasses the api client entirely and
uses raw `fetch` against `NEXT_PUBLIC_BASE_URL` (`settings/page.js:2617`, `:2635`, `:2650`).

---

### 4. Outbound — SMTP. **SHIPPED**, with no delivery infrastructure

Every send follows the same three lines: read the owner's `email_smtp_settings` row, build a *fresh*
`nodemailer.createTransport({host, port, secure, auth})`, call `sendMail`. That pattern is copy-pasted at
six sites:

| Sender | Line | Trigger |
|---|---|---|
| Lead compose | `server.js:3822` | Studio clicks Compose Email on a lead |
| Invoice email | `server.js:2740` | Studio emails an invoice |
| SMTP self-test | `server.js:3733` | Settings → Email Sending → Test |
| Team invite | `server.js:3564` | Inviting a member; falls back to returning a copyable link when SMTP is absent |
| `sendEmail` seam → Contracts Studio | `server.js:6504` | Send-for-signature and 8am reminders (`contracts-studio.js:450`, `:799`, `:995`) |
| `sendEmail` seam → Command Center | `server.js:6574` | Scheduled platform reports (`cc-reports.js:73-78`) |

Password reset is a seventh path with its own precedence: platform `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`
env vars first, then the workspace owner's row, then a loud operator error and silent failure
(`account-recovery.js:63-92`).

What is missing on this side, in code terms:

* **No queue and no retry.** `await transporter.sendMail(...)` inside the request handler. A transient
  SMTP failure returns 500 to the browser (`server.js:3844`) and the message is gone. The `sendEmail`
  seam swallows failures into `delivery.email = 'failed'` (`contracts-studio.js:995`) and never retries.
* **No bounce, complaint or unsubscribe handling anywhere.** A repo-wide grep for
  `unsubscribe|bounce|dkim|spf|dmarc` in `backend/` matches only the *web-push* unsubscribe route
  (`server.js:3218`). `lead_emails.status` is written as the literal `'sent'` at insert time and never
  updated.
* **No SPF/DKIM guidance in the product.** The Email Sending tab offers host presets for Gmail, Office
  365, Yahoo, Zoho and SendGrid (`settings/page.js:2521-2527`) and stops there.
* **No transport reuse or pooling** — a new TCP+TLS+AUTH handshake per message.
* **Attachments are a UI lie.** The compose modal has a paperclip button, a hidden multi-file input and
  a chip list of chosen files (`leads/[id]/page.js:2902-2909`, `:2925-2938`), but `handleSend` posts only
  `{to_email, subject, body}` (`:2826`) and the backend never reads attachments. Selected files are
  silently discarded. **STUB.**
* The body is `contentEditable` `innerHTML`; the backend sets `html: body.replace(/\n/g,'<br>')` and
  `text: body` (`server.js:3831-3832`) — so the plaintext alternative part of every outgoing mail
  contains raw HTML markup.

---

### 5. Inbound — the IMAP poller. **PARTIAL**, and it changes state in the studio's real mailbox

`startEmailPoller()` is defined at `server.js:3870` and **called unconditionally at module load**
(`server.js:3990`), inside the same process that serves every HTTP request, the SSE bus, the WhatsApp
Puppeteer sessions and the crons. It does `pollAll()` immediately, then `setInterval(pollAll, 2*60*1000)`
(`:3985-3986`).

`pollAll(filterUserId)` (`:3961`) selects every enabled mailbox platform-wide:

```
SELECT i.*, u.workspace_id
FROM email_imap_settings i
JOIN users u ON u.id = i.user_id
WHERE i.is_enabled = 1 AND i.imap_host != '' AND i.imap_user != '' AND i.imap_pass != ''
```

then loops **sequentially, awaiting each one**: `for (const config of configs) { await pollWorkspace(config); }`
(`:3975-3977`).

`pollWorkspace(config)` (`:3874`) then, per mailbox:

1. Connects with `tls: !!imap_secure`, **`tlsOptions: { rejectUnauthorized: false }`**, `connTimeout: 20000`,
   `authTimeout: 10000` (`:3880-3884`).
2. `imap.openBox('INBOX', false, …)` — read-write (`:3888`).
3. `imap.search(['UNSEEN'], …)` — **the entire unread backlog, with no date window and no result cap**
   (`:3890`).
4. `imap.fetch(results, { bodies: '', markSeen: true })` (`:3893`) — fetches full raw messages and
   **marks them Seen on the studio's real Gmail/Exchange/Zoho mailbox**.
5. Buffers each raw message into a JS string, `simpleParser`s it (`:3901`), and takes
   `parsed.from.value[0].address.toLowerCase()`, `parsed.subject`, and `parsed.text || parsed.html`
   (`:3902-3904`).
6. **Match or discard** (`:3908-3917`):
   ```
   SELECT * FROM leads
   WHERE LOWER(email) = ? AND workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) LIMIT 1
   ```
   No lead → `console.log('No lead found for: …')` and `return`. The message is dropped.
7. Dedup: skip if a `received` row exists for the same `lead_id + from_email + subject` within
   `datetime('now','-10 minutes')` (`:3919-3927`).
8. Insert into `lead_emails` with `direction='received'`, `to_email = config.imap_user`
   (`:3930-3935`), write `addContactHistory(lead.id, lead.user_id, 'email', 'Email received: …')`
   (`:3936`) — which also writes the unified activity spine via `logActivity` (`server.js:1231`) — and
   broadcast `email_received` with `{lead_id, from_email, subject, preview}` (`:3937-3941`).

The SSE event goes through `broadcastToWorkspace` (`server.js:1030`), i.e. an unnamed frame carrying
`data.type`. The lead page subscribes via `useRealtime(['new_message','lead_updated','email_received'])`
and refetches on receipt (`leads/[id]/page.js:732`, `:740`).

**The consequences of step 6 are the important part.** Email is the *only* channel that never creates a
contact. WhatsApp (`whatsapp-service.js:370`, `:1276`), Instagram (`server.js:5160`), Facebook
(`server.js:5222`), the website form (`server.js:5272`), the public booking page (`booking.js:405`) and
the print store (`print-store.js:150`) all `INSERT INTO leads` for an unknown sender. Inbound email does
not. A first-contact enquiry by email is marked read in the studio's inbox and then thrown away by
WappFlow — no lead, no notification, no record. The "unified inbox" claim only holds for people already
in the CRM *whose `leads.email` matches the sender address exactly* (case-insensitively). A reply from
`jane@work.com` when the lead row says `jane.doe@gmail.com` is discarded; so is any `+tag` alias, any
forwarded thread, and any reply from a colleague on the same booking.

Note also that email never becomes a *message*: it lands in `lead_emails`, not `messages`, and the lead
page's platform tab bar has exactly four tabs — WhatsApp, Instagram, Facebook, Website
(`leads/[id]/page.js:1658-1662`). Email lives in two separate lead tabs, `emails` and `email-flow`
(`:1230-1231`).

---

### 6. Templates and workflows — **SOLD-NOT-BUILT**

The Email Templates tab is titled "Email Follow-up Templates … for automated follow-up workflows"
(`settings/page.js:483`) and offers a `trigger_event` dropdown with `manual`, `on_contacted`,
`on_interested`, `on_negotiating`, `on_won` plus a "Send After (days)" field (`:477-481`, `:501-509`).
It also advertises `{name} {phone} {email} {company}` substitution variables (`:519`).

None of it runs. A repo-wide grep for `trigger_event` and `delay_days` returns only the schema
(`server.js:434-435`), the two CRUD handlers (`server.js:2782-2794`) and the settings form itself. **No
cron, no scheduler and no status-change hook ever reads either column.** The six `cron.schedule` calls in
the backend are metering, CC reports, grace sweeps, contract reminders, the per-minute reminder push and
a midnight job (`cc-metering.js:104`, `command-center.js:889`/`:905`, `contracts-studio.js:1128`,
`server.js:3999`/`:4039`) — none touch `email_templates` or `email_workflows`. There is no variable
substitution code anywhere.

`email_workflows` is the same story one level down: `POST /api/leads/:leadId/email-workflows` inserts a
row with `status='pending'` and a `scheduled_at` (`server.js:2049-2053`), and nothing ever sends it. The
UI's only affordance for a pending row is a **"Mark Sent"** button that calls
`emailWorkflowsAPI.updateStatus(wf.id,'sent')` (`leads/[id]/page.js:2262-2264`) — a human marking their
own manual work as done. `email_workflows` is a to-do list rendered as an automation.

---

### 7. Plan gating — declared, never enforced

`entitlements.js:35` and the plan matrix in `server.js:5483-5558` define four flags: `email_integration`,
`email_templates`, `email_sending`, `email_receiving`. All four are `false` on the free tier
(`server.js:5483-5486`) and `true` from Studio upward (`:5514-5517`). Outside those definitions the
strings appear **nowhere** in the backend — no route checks them. SMTP and IMAP configuration, sending
and polling are all reachable on any plan. (For contrast, the frontend does not gate the three Settings
tabs either: `settings/page.js:61-63` lists them unconditionally.)

---

### 8. Bugs, security weaknesses, data-integrity risks and smells

1. **`markSeen: true` mutates a third-party system irreversibly** (`server.js:3893`). Enabling Email
   Receiving hands WappFlow the power to mark the owner's real mail read, and it exercises it on *every*
   unread message — including the ones it then discards for having no matching lead. The first poll after
   enabling processes the entire UNSEEN backlog at once. Nothing in the UI warns about this; the "How it
   works" panel says only that matching replies get filed (`settings/page.js:2799-2804`). This is the
   single most user-hostile behaviour in the email subsystem.
2. **No re-entrancy guard on the poller.** `setInterval(pollAll, 120000)` (`:3986`) fires on a wall clock
   while `pollAll` is an un-awaited async function that walks every enabled mailbox **sequentially**
   (`:3975`). With ~7 mailboxes at the 20s connect + 10s auth ceiling, a single run can exceed the
   interval and runs begin to overlap and stack, multiplying concurrent IMAP connections against the same
   accounts (Gmail caps simultaneous IMAP connections). This is a hard scaling ceiling on the number of
   tenants that can have Email Receiving on at once — §17 never names it.
3. **A hung mailbox can kill the poller permanently.** `connTimeout`/`authTimeout` only cover connect and
   auth. If `openBox` or `fetch` never calls back after `ready`, the promise returned by `pollWorkspace`
   never resolves, the `await` in the loop never returns, and every mailbox behind it stops being polled
   until the process restarts. There is no overall timeout, no `Promise.race`, and no `imap.end()` on a
   stall.
4. **`rejectUnauthorized: false` on both IMAP paths** (`server.js:3785`, `:3882`) disables TLS
   certificate verification, so the mailbox password is offered to whatever answers on that host:port.
   §15 flags this; it is worth restating that it applies to the *live poller*, not just the test button.
5. **Plaintext credentials.** `email_smtp_settings.smtp_pass` and `email_imap_settings.imap_pass` are
   stored unencrypted (`server.js:571`, `:600`); masking happens only on read (`:3705`, `:3757`). Combined
   with the `/api/storage/file` traversal in §15, a DB read hands over every tenant's mailbox password.
6. **Un-role-gated capability endpoints.** `PUT` on both settings routes requires `super_admin|admin`
   (`:3712`, `:3763`), but `GET` (`:3701`, `:3753`), `POST …/test` (`:3729`, `:3779`) and
   `POST …/poll-now` (`:3859`) require only `auth`. Any member — including the lowest role — can read the
   owner's SMTP/IMAP hostnames and account addresses, cause a test mail to be sent, and trigger a poll of
   the owner's mailbox. `poll-now` has no rate limit and blocks the request thread on a full poll, so it
   is also a cheap way to pile up IMAP connections.
7. **Stored XSS from inbound mail.** The ingester stores `parsed.text || parsed.html` (`:3904`), so a
   message with no plaintext part is stored as attacker-controlled HTML, and `EmailBodyRow` renders
   `em.body` with `dangerouslySetInnerHTML` and no sanitiser (`leads/[id]/page.js:146`). An unsolicited
   email from an address that matches a lead is a direct injection vector into the studio's authenticated
   session. (Also raised in §15; it belongs to this subsystem.)
8. **Data loss in the dedup window.** Two genuinely different emails from the same address with the same
   subject inside 10 minutes — "Re: Wedding" sent twice with new information — collapse to one stored row
   (`:3919-3927`). Because no `Message-ID` is stored, correct dedup is impossible and re-ingestion after
   any manual "mark unread" is equally impossible to detect beyond 10 minutes.
9. **Silent loss on parse/insert failure.** `markSeen` happens at fetch time, before parsing. If
   `simpleParser` rejects (`.catch(e => console.error(...))` at `:3945`) or the insert throws, the message
   is already read in the real mailbox and was never stored. There is no dead-letter path.
10. **Unbounded memory on first run.** Each message body is accumulated into a JS string (`:3898-3899`)
    and every parse promise is pushed into an array held until `Promise.all` (`:3947`). A mailbox with
    thousands of unread messages, or a few large ones, is fetched whole into the API process's heap.
11. **A race at `fetch.once('end')`.** The `promises` array is appended inside the per-message body
    `stream.once('end')` handler; `fetch.once('end')` resolves on `Promise.all(promises)` (`:3947`). If
    the fetch-level `end` can fire before the last body stream's `end`, that message's promise is not
    awaited before `imap.end()`. Not proven to fire in practice — see UNKNOWN below.
12. **Six copies of the transport-building code.** `nodemailer.createTransport` appears at
    `server.js:2740`, `:3564`, `:3733`, `:3822`, `:6507`, `:6577` plus `account-recovery.js:93`, each
    with slightly different `from` fallbacks (`from_name || 'WappFlow'` in most places, `smtp_user`
    directly in the team invite at `:3574`). The `sendEmail` seam injected into Contracts Studio and
    Command Center is the right abstraction; the other five sites predate it and were never migrated.
13. **Inbound email is invisible to universal search.** `search.js` queries leads, members and other
    entities but never `lead_emails` — an email body is not findable from the global search bar.
14. **The poller writes `lead.user_id` as the row's `user_id`** (`:3934`) while outbound writes
    `req.userId` (`:3838`), so `lead_emails.user_id` means two different things depending on direction.

---

### 9. Maturity verdicts

| Capability | Verdict | Named gap |
|---|---|---|
| SMTP config + test + per-lead compose/send | **SHIPPED** | 400s until configured; no retry |
| Invoice email, contract-for-signature email, team invite, password reset | **SHIPPED** | all depend on the tenant's own SMTP; contract/report senders swallow failures |
| Outbound attachments | **STUB** | UI collects files, request drops them |
| Delivery health (bounces, complaints, unsubscribes, auth guidance) | **SOLD-NOT-BUILT** | zero code |
| IMAP config + test + manual poll | **SHIPPED** | no role gate on test/poll |
| Inbound ingestion into a lead thread | **PARTIAL** | exact-address match only; unmatched mail marked read and discarded; no attachments, no threading |
| Email as a lead source | **NOT BUILT** | every other channel creates leads; email never does |
| Email templates with `trigger_event` / `delay_days` / variables | **SOLD-NOT-BUILT** | columns stored, never read |
| Email workflows (scheduled sends) | **SOLD-NOT-BUILT** | rows created, only a manual "Mark Sent" |
| Per-plan email entitlements | **SOLD-NOT-BUILT** | four flags defined, zero enforcement sites |

---

### 10. Unknowns

* **UNKNOWN: real-world delivery success.** No logging, metrics or status column tracks whether a
  `sendMail` that resolved was actually delivered; `lead_emails.status` is a constant.
* **UNKNOWN: how many tenants have `is_enabled = 1`.** This is a production-data question; the code
  imposes no cap and the deployment docs (`DEPLOYMENT.md:454`) start a single non-clustered pm2 process,
  so the failure mode is one shared serial loop for the whole platform.
* **UNKNOWN: whether the `fetch.once('end')` / body-stream race (finding 11) actually fires** with
  `imap@0.8.19`'s event ordering — establishing that needs a runtime test, not a read.
* **UNKNOWN: behaviour against non-Gmail servers** (Exchange folder layouts, servers that reject
  `markSeen` on a read-only-ish INBOX). Only `INBOX` is ever opened (`:3888`); no folder is configurable.


---


<!-- ── 19-addendum-4.md ─────────────────────────────────────────── -->

## 19.4 Addendum 4 — Operator Runbook: From `git clone` to a Working System

The rest of this dossier describes what WappFlow *is*. This section describes how you *start* it: what you need installed, what boots, how the first account and the first platform administrator come into being, how to fill the system with realistic data, and how to run the tests. Everything here is read off the executables in the repository — none of it is documented in a single place inside the product, which is itself the first finding.

There **is** a `DEPLOYMENT.md` at the repo root (~38 KB, 12 numbered sections, including a VPS bootstrap at §7.2–7.4 and a first-run checklist at §10). It is genuinely useful and it is genuinely **stale** — the gaps are itemised in §19.4.9 below. Where it disagrees with the code, believe the code.

---

### 19.4.1 What is actually in the repository

The repo root is a **React Native scaffold** — `package.json` at the root declares `react-native`, `@react-navigation/*`, and scripts `android`/`ios`/`start`. That mobile app is not the product; `App.js` and `src/` are the untouched CLI template. The real product is three subtrees, each with its own independent `npm` dependency tree:

| Tree | Path | What it is | Install |
|---|---|---|---|
| Root | `package.json` | React Native template, effectively vestigial. Declares `"engines": { "node": ">= 22.11.0" }` — the **only** engines field in the repo. | not needed for the web product |
| Backend | `backend/package.json` | Express 5 + better-sqlite3 12 API. `start` = `node server.js`; `dev` = `nodemon server.js`. | `cd backend && npm install` |
| Frontend | `wappflow-web/package.json` | Next.js 16.2.4 + React 19.2.4 + Tailwind 3. | `cd wappflow-web && npm install` |
| Desktop | `wappflow-desktop/package.json` | Electron 33 shell + local ONNX AI engine. | `cd wappflow-desktop && npm install` |

Neither `backend/package.json` nor `wappflow-web/package.json` declares an `engines` constraint. **UNKNOWN: the true minimum Node version for the backend and frontend.** The root engines field (`>= 22.11.0`) governs the React Native template only; `backend/nixpacks.toml:2` pins `nodejs_20`; `DEPLOYMENT.md:405` installs Node 20 LTS. Three different answers in one repo. The dependency set (Next 16, React 19, `better-sqlite3` ^12.9) is modern enough that Node 20 is the pragmatic floor and Node 22+ the safe choice.

---

### 19.4.2 Prerequisites beyond Node

The backend hard-depends on a **native module**: `better-sqlite3` compiles or downloads a prebuilt binary at install time, so a C++ toolchain must be available if no prebuild matches the platform.

Two categories of external binary matter, and the system fails differently for each:

**Chromium (required for WhatsApp).** `whatsapp-web.js` ^1.34.7 pulls `puppeteer@24.38.0` transitively (`backend/package-lock.json:5967`). The client is launched with `headless: true` and a fixed arg list at `backend/whatsapp-service.js:229-241` — with **no `executablePath`**, so puppeteer resolves a browser from its own download cache. `backend/.env.example:10` sets `PUPPETEER_SKIP_DOWNLOAD=true`, which suppresses that download. `PUPPETEER_EXECUTABLE_PATH` appears exactly once in the repo, inside the Dockerfile at `DEPLOYMENT.md:558`, and is absent from the env table at `DEPLOYMENT.md:304-326`. Note also that `backend/.env` is loaded by `dotenv` at `backend/server.js:1` — i.e. at *server boot*. Puppeteer reads `PUPPETEER_SKIP_DOWNLOAD` during `npm install`, long before that. Putting it in `.env` cannot affect the install; it has to be exported in the installing shell.

**Media binaries (optional, degrade silently).** `ffmpeg`/`ffprobe` (`backend/media-worker.js:38-39`, `backend/video-engine.js:206`), `exiftool` (`media-worker.js:121`) and `dcraw` (`media-worker.js:126`) are each resolved from an env override or the bare name on `PATH`. Without ffmpeg, voice-note sending fails outright (`DEPLOYMENT.md:413-416`) and video probing/poster/proxy generation stops. `@vladmandic/face-api` is an `optionalDependency`; `backend/face-detect.js:33` throws if absent and the worker's `require` seam at `media-worker.js:36` swallows it, so face/smile scoring simply never runs and nothing is faked.

---

### 19.4.3 Cold start — the backend

```
cd backend
npm install
cp .env.example .env        # then EDIT IT — see the trap below
node server.js              # or: npm run dev
```

The database path is `path.join(DATA_DIR, 'wappflow.db')` where `DATA_DIR = process.env.DATA_DIR || (NODE_ENV === 'production' ? '/data' : __dirname)` (`server.js:38`). The same expression is repeated as `DATA_ROOT` at `server.js:61`, and `server.js:62-63` `mkdir -p`s the literal `/data` plus seven upload subdirectories under `DATA_ROOT` (`uploads/{logos,voices,avatars,images,videos,files}`), each wrapped in a swallowing `catch {}`.

**Trap:** `backend/.env.example:2` sets `NODE_ENV=production`. Copying it verbatim on a laptop makes the server open `/data/wappflow.db` — an absolute path that does not exist on a dev box (and becomes `C:\data` on Windows). Set `NODE_ENV=development` or an explicit `DATA_DIR` for local work.

**There is no schema migration step.** All DDL runs inside `server.js` and the mounted modules as `CREATE TABLE IF NOT EXISTS` plus guarded `safeAlter` `ALTER TABLE` calls. First boot creates everything. Pragmas set at `server.js:41-56`: `journal_mode=WAL`, `busy_timeout=5000`, `synchronous=NORMAL`, `foreign_keys=ON`.

**WhatsApp starts unconditionally.** `server.js:1248` calls `whatsappService.loadAccounts()` at module scope. With zero `platform_accounts` rows, `whatsapp-service.js:1394-1396` falls through to `_startLegacy()`, which immediately calls `initialize()` and tries to launch Chromium. On a machine with no browser this fails, but the failure is caught at `whatsapp-service.js:495` and the process survives — reinforced by the global `unhandledRejection`/`uncaughtException` guards at `server.js:25-30`. This is why the e2e harness can boot a real server in a sandbox: **the HTTP API works fine without Chromium; only WhatsApp is dead.**

**There is no health endpoint.** No `/health`, no `/api/health`, no root route. `server.js:6587` is a catch-all 404. A liveness probe must hit a real route. The server listens on `PORT || 3001` (`server.js:6590`).

---

### 19.4.4 Cold start — the frontend

```
cd wappflow-web
npm install
npm run dev            # or: npm run build && npm run start
```

`wappflow-web` contains **no `.env.example` and no `.env.local.example`** — despite `DEPLOYMENT.md:442` instructing `cp .env.local.example .env.local`. Five env vars are read across `wappflow-web/src` and `next.config.ts`:

| Var | Default | Source |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api` | `src/lib/api.js:3` |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:3001` | `src/lib/api.js:4` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | — | Google sign-in button |
| `NEXT_PUBLIC_FLUX_URL` | — | Flux cross-product link |
| `NEXT_PUBLIC_FLUX_PARKED` | — | greys out Flux entry points |
| `NEXT_DIST` | `.next` | build-output dir, used by `deploy.sh` for the staging swap |

The localhost defaults mean a local `npm run dev` front end talks to a local backend with **zero configuration** — the fastest path to a running system.

---

### 19.4.5 Creating the first accounts

There are two entirely separate identity systems, and they are bootstrapped differently.

**(a) The first tenant (studio) account — self-service, no gate.** `POST /api/auth/register` (`server.js:1254`) takes `{ email, password, businessName }` and, in one shot, inserts a `workspaces` row, a `users` row with `role='owner'`, a `workspace_members` row with `role='super_admin'`, and a `company_settings` row, then returns a JWT. There is **no invite code, no email verification, no admin approval, and no password-strength check** on this route. Whoever registers first is simply the first tenant. No `workspace_plan` row is created here; `getPlanInfo()` at `server.js:5578-5581` lazily inserts one at `entitlements.DEFAULT_PLAN` (`creator`, `entitlements.js:124`) the first time plan info is read.

**(b) The first Command Center administrator — the platform control plane.** `cc_admins` is a separate table with its own JWT audience and its own login at `POST /api/cc/login` (`command-center.js:248`), reachable from the UI at `<frontend>/control/login`. There are exactly two ways a first row appears:

1. **Env seed on boot.** `command-center.js:138-143`: if `SELECT COUNT(*) FROM cc_admins` is 0 **and** both `CC_FOUNDER_EMAIL` and `CC_FOUNDER_PASSWORD` are set, a `founder` admin is created and the credentials are echoed to stdout (`🛡️ Command Center founder seeded from env: <email>`). This runs only while the table is empty.
2. **The shell script.** `node backend/scripts/cc-create-admin.js <email> <password> [role]` (`scripts/cc-create-admin.js:20`). Roles are `founder | ops | finance | support | cs | readonly`, default `founder` (`:18`). It calls `cc.ensureSchema(db)` then `cc.createOrUpdateAdmin(db, {...})` (`:25-26`), which upserts by lowercased email and **resets an existing admin's password and role** (`command-center.js:150-155`).

The Command Center is genuinely mounted — `server.js:6571` calls `require('./command-center')(app, db, {...})` at boot, after every `ms_*`/`cs_*` table exists. (Older internal notes describing it as unmounted dead code are stale; the code disagrees.)

---

### 19.4.6 Granting yourself everything — `grant-master.js`

```
node backend/grant-master.js you@example.com            # dry run
node backend/grant-master.js you@example.com --apply    # do it
```

`backend/grant-master.js` resolves the user by case-insensitive email, then upserts `workspace_plan.plan = 'enterprise'` for their workspace (`:22`, `:87-91`). The `enterprise` tier in `entitlements.js:110-115` has every feature `true` and every limit `-1` (unlimited). The design note at `:9-15` is explicit and correct in intent: it reuses the real plan rather than a bypass flag, so the account exercises the same enforcement path as a paying customer; and it is *deliberately* a script and not an HTTP route, "because nothing reachable over HTTP should be able to hand out unlimited entitlements."

It re-reads `backend/.env` itself (`:31-45`) because pm2 loads that file for the app but a bare `node grant-master.js` does not — without it the script would silently open the *development* database and report success against an empty file. It refuses to run if the resolved DB does not exist (`:52-57`).

It does **not** invalidate the entitlements cache. `entitlements.js:137` caches resolved entitlements for 30 s per workspace; the script's closing advice is to `pm2 restart wappflow-api --update-env` or wait out the TTL (`:97-99`).

The security consequence is worth stating plainly: **anyone with shell access to the server can grant any workspace unlimited entitlements, and nothing records that they did.** Contrast the HTTP equivalent, `POST /api/cc/workspaces/:id/plan` (`command-center.js:421-434`), which requires a Command Center session, requires the `manage_plans` permission, writes a `cc_audit` row with before/after, emits a `workspace_plan_changed` platform event, and calls `entitlements.invalidate(wid)`. The script does none of the four.

---

### 19.4.7 Seeding demo data

Three seeders exist, all undocumented outside their own headers, all with different DB-resolution conventions.

| Script | What it does | DB resolution |
|---|---|---|
| `backend/seed-leads.js` | 14 leads across all four platforms (6 WhatsApp with real-looking PK numbers, 3 Instagram, 3 Facebook, 2 website — `:263-268`), each with `lead_score`/`sentiment`/`urgency`/`intent_category` populated and 1–2 sample messages, plus nicknamed `platform_accounts` so the "WhatsApp · Admissions" chip renders. `--clean` first deletes rows whose `first_message LIKE '[SEED]%'`. | `DATA_DIR` → `/data` if prod → `__dirname` (`:14`) |
| `backend/scripts/seed-media-demo.js` | 5 demo shoots (wedding, portrait, engagement, lookbook, real-estate listing — `:126-137`) totalling 52 photographs **downloaded live from `picsum.photos`** (`:140`) into `<uploads>/media`. Idempotent: every seeded `ms_projects` row carries `settings.demo = true`, and `--clean`/`--remove` only ever touch tagged rows. `--workspace <id>` targets a specific tenant. | `WAPPFLOW_DB` → `/data/wappflow.db` if it exists → `backend/wappflow.db` (`:30-33`) |
| `backend/scripts/clean_and_seed_demo.js` | Destructive tenant reset. Keeps one hardcoded user (`wappflow@aitech.edu.pk`, `:25`) and their workspace, **deletes every other user, workspace, and every row in every table whose `workspace_id`/`user_id` doesn't match**, then seeds three demo accounts. Backs up to `/tmp/wappflow.db.bak-<ts>` first (`:36`); `--dry-run` prints counts only. Demo password `DEMO_PASSWORD` or `Demo1234!` (`:27`). | `WAPPFLOW_DB` → `/data/wappflow.db` (`:24`) |

`seed-leads.js` requires that the server has booted at least once: it asserts `lead_channels` exists and exits with an instruction to boot first (`:61-63`), deliberately refusing to re-`CREATE` a table the server owns.

---

### 19.4.8 The desktop app and its ONNX models

```
cd wappflow-desktop && npm install
npm run fetch-models        # node scripts/fetch-models.js
npm run test:vision <photo.jpg>
npm run dev                 # cross-env WAPPFLOW_ENV=development electron .
```

Model weights are **not committed**. `scripts/fetch-models.js` downloads the two registered models into `src/main/ai/models/`, following redirects, skipping files already >1 KB, and printing a manual ONNX Model Zoo path on failure (`:41-48`). The registry (`src/main/ai/models.js`) declares:

- `ultraface-rfb-320.onnx` — UltraFace RFB-320 face detector, input 1×3×240×320 RGB, `(px-127)/128`, score threshold 0.7.
- `emotion-ferplus.onnx` — FER+ expression net, input 1×1×64×64 grayscale, 8-class softmax; smile = `happiness` at index 1.
- `VISION_MODEL_VERSION = 'vision-v1'`, which the file comment says **must equal** the server registry's vision `modelVersion` for the analyze-once ledger to work.

`onnxruntime-node` and `jimp` are `optionalDependencies` so a sandboxed `npm install` never hard-fails; the package's own notes warn that a real GUI machine is required to run or package Electron.

---

### 19.4.9 Configuration reference — the real env surface

Excluding test files, backend code reads **57 distinct environment variables** (47 in `backend/*.js`, plus 6 `R2_*` under `backend/storage/providers/`, plus `DEMO_PASSWORD`/`WAPPFLOW_DB`/`UPLOADS_DIR` in the seeders). `backend/.env.example` contains **9 keys**, of which 8 are read by app code. `DEPLOYMENT.md:304-326` documents 20. Roughly two-thirds of the configuration surface is discoverable only by grepping.

| Group | Vars | Notes |
|---|---|---|
| Core | `PORT`, `NODE_ENV`, `DATA_DIR`, `JWT_SECRET`, `FRONTEND_URL`, `BASE_URL`, `TRUST_PROXY` | `JWT_SECRET` falls back to the literal `'your-secret-key-change-in-production'` (`server.js:181`) |
| AI | `AI_PROVIDER`, `AI_PROVIDERS`, `{GROQ,OPENAI,ANTHROPIC,CEREBRAS,OPENROUTER}_API_KEY`, `*_MODEL` | Default provider is **`cerebras`** (`ai-engine.js:8`), not groq as `.env.example`/`DEPLOYMENT.md` imply. The chain `cerebras,cerebras,groq,openrouter` (`:50`) is why a groq-only install still works. |
| Command Center | `CC_FOUNDER_EMAIL`, `CC_FOUNDER_PASSWORD`, `CC_IP_ALLOWLIST` | Empty allowlist = allow all (`command-center.js:178-180`) |
| Storage | `STORAGE_PROVIDER`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_BASE`, `UPLOADS_DIR` | `r2` silently falls back to local disk if the SDK/config is missing (`storage/index.js:20-23`) |
| Media | `FFMPEG_PATH`, `FFPROBE_PATH`, `EXIFTOOL_PATH`, `DCRAW_PATH`, `MS_FACE_MODELS`, `MS_FONT_{SANS,SERIF,MONO}` | all optional, all degrade quietly |
| Money | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | key without secret logs a warning and rejects webhooks (`payments.js:52-56`) |
| Email / push / auth | `SMTP_{HOST,PORT,USER,PASS,FROM,SECURE}`, `VAPID_{PUBLIC,PRIVATE}_KEY`, `GOOGLE_CLIENT_{ID,SECRET}` | VAPID keys have **hardcoded defaults** at `server.js:21-22` |
| Realtime / other | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `FLUX_URL`, `FLUX_SSO_SECRET` | LiveKit unset ⇒ video calls report `configured: false` (`comms.js:442`) |

---

### 19.4.10 Running the tests

`backend/package.json:9` defines `"test": "echo \"Error: no test specified\" && exit 1"`. **There is no test runner and no aggregate command.** The suite is 43 standalone scripts in `backend/` plus 10 in `backend/scripts/` plus 15 static frontend verifiers in the repo-root `scripts/`, each run as `node <file>`, each printing its own `✓`/`✗` tally. They fall into three classes:

**Class A — boot-free.** Static source assertions and/or a real `:memory:` SQLite. No server, no network. Example: `test-batch1-security.js:20-22`, `test-phase4-dataperf.js` (asserts `EXPLAIN QUERY PLAN` actually uses the new indexes, not that `CREATE INDEX` appears in source). Just `node test-batch1-security.js`.

**Class B — in-process mount.** Mount one module on a throwaway Express app with an in-memory DB and a fake auth, then drive it over HTTP on an ephemeral port. `server.js` is never loaded, so WhatsApp/puppeteer never starts (`scripts/test-media-studio.js:3-7`). Covers `test-brains`, `test-comms`, `test-cc-desktop`, `test-cc-storage`, `test-reel-engine`, `test-sync`, and all ten `scripts/test-media-*.js`.

**Class C — live server, the `WF_*` contract.** Nine files drive the **real** API because the property under test is what the API accepts, not what one line says. The contract, documented only in per-file header comments:

- `WF_API` — base URL including `/api`; each file has its own port default.
- `WF_DB` — path to the scratch `wappflow.db`, opened directly for out-of-band assertions.
- `WF_SQLITE` — module path to `better-sqlite3` (typically `./node_modules/better-sqlite3`), so the harness binds the *same* native module the server is using.

The recipe (from `test-phase9-booking-integrity-e2e.js:19-26`):

```
DATA_DIR=<scratch> PORT=3017 node server.js &
WF_API=http://127.0.0.1:3017/api WF_DB=<scratch>/wappflow.db \
  WF_SQLITE=./node_modules/better-sqlite3 node test-phase9-booking-integrity-e2e.js
```

Each file owns a distinct port so several can run against separate scratch servers:

| Port | Test | Note |
|---|---|---|
| — | `test-phase5-search-e2e.js` | uses `WF_DB`/`WF_SQLITE` only; header says `PORT=3001` + fresh DB (`:5-6`) |
| 3011 | `test-phase7-action-hub-e2e.js` | |
| 3012 | `test-phase7-booking-handoff-e2e.js` | |
| 3013 | `test-phase7-store-billing-e2e.js` | |
| 3014 | `test-phase7-activity-spine-e2e.js` | |
| 3015 | `test-phase7-contract-chain-e2e.js` | |
| 3016 | `test-phase8-public-brand-e2e.js` | also needs `FRONTEND_URL=https://studio.test` (`:19`) |
| 3017 | `test-phase9-booking-integrity-e2e.js` | |
| 3018 | `test-phase9-account-recovery-e2e.js` | |

Fixtures are made unique per run — `RUN = process.pid.toString(36) + Math.random().toString(36).slice(2,8)` (`test-phase9-booking-integrity-e2e.js:38`) — so re-runs against the same scratch DB don't collide.

**Frontend verifiers.** `node scripts/verify-batchA.js` … `verify-batchF.js` (PROP-002 design system) and `verify-shell-batch1.js` … `verify-shell-batch9.js` (PROP-003 one-shell) are boot-free static reads of `wappflow-web/src`, run from the repo root. They assert things like "all 25 original CSS tokens still defined" (`verify-batchA.js:22-25`) and z-index ladder ordering.

**Deploying to the already-running host** is `bash deploy.sh` from the repo root: it discards regenerable churn, `git pull`s, `npm install --omit=dev` in backend, builds the frontend into `.next.staging` and only swaps it in on success, then `pm2 restart wappflow-api wappflow-web --update-env`.

---

### 19.4.11 Bugs, security weaknesses, data-integrity risks, and smells

1. **A fresh `git clone` will not boot.** `backend/account-recovery.js` and `backend/studio-time.js` are **untracked** in git (`git ls-files` returns nothing for either) but are hard-required at `server.js:6485`, `booking.js:15`, and `availability.js:16`. A clone produces `MODULE_NOT_FOUND` on startup. Three Phase-9 tests (`test-phase9-account-recovery-e2e.js`, `test-phase9-booking-integrity-e2e.js`, `test-phase9-studio-time.js`) are likewise untracked. **This is the single largest obstacle to an outside evaluator.**
2. **`grant-master.js` is an unaudited privilege escalation.** Shell access ⇒ unlimited entitlements on any workspace, with no `cc_audit` row, no `platform_events` row, and no cache invalidation — versus the fully-audited `POST /api/cc/workspaces/:id/plan`. The script's own rationale (keep it off HTTP) is sound; the missing audit trail is not a consequence of that choice.
3. **`clean_and_seed_demo.js` seeds plan keys that no longer exist.** It writes `free`/`starter`/`growth` into `workspace_plan` (`:133-137`), but the catalog is `creator`/`studio`/`studio_plus`/`enterprise` (`entitlements.js:99-116`). `getEntitlements` finds no `plan_features`/`plan_limits` rows for `free`, falls back at `:291` to `PLAN_DEFINITIONS['free'] || PLAN_DEFINITIONS['creator']`, yet still reports `plan: 'free'` and `name: 'free'` (`:309-310`). All three "tier gate" demo accounts therefore get **identical Creator entitlements while displaying three different plan names** — the seeder no longer tests what it claims to test.
4. **`cc-create-admin.js` ignores `DATA_DIR`.** `:12` resolves the DB from `NODE_ENV` alone, unlike `grant-master.js:51` and `seed-leads.js:14`. It also has **no existence check** before `new Database(...)`, which creates an empty file. Run with the wrong `NODE_ENV` and it silently creates a fresh `wappflow.db` and writes the founder row into a database nothing reads. `seed-leads.js:15` has the same missing-existence-check pattern.
5. **`cc-create-admin.js` silently resets an existing admin.** `createOrUpdateAdmin` upserts on email and overwrites `password_hash`, `cc_role` and `status` (`command-center.js:150-155`). A typo'd re-run is a password reset, not an error.
6. **Command Center credentials land in shell history and process listings.** The password is `argv[3]`; the env alternative (`CC_FOUNDER_EMAIL`/`CC_FOUNDER_PASSWORD`) additionally echoes the founder email to stdout at `command-center.js:142`, and if left set in `.env` the plaintext platform-admin password persists on disk indefinitely (it is inert after the first admin exists, but nothing removes it).
7. **`CC_IP_ALLOWLIST` fails open.** Unset ⇒ every IP allowed (`command-center.js:179`). Defensible for dev, dangerous as a production default for a cross-tenant control plane.
8. **Hardcoded fallback secrets.** `JWT_SECRET` defaults to `'your-secret-key-change-in-production'` (`server.js:181`) and both VAPID keys have literal defaults (`server.js:21-22`). Nothing refuses to boot on the default.
9. **`backend/.env.example:2` sets `NODE_ENV=production`.** Copying it as instructed points a local install at `/data`.
10. **The documented Chromium setup does not match the code.** `.env.example` sets `PUPPETEER_SKIP_DOWNLOAD=true` in a file `npm install` never reads, and `PUPPETEER_EXECUTABLE_PATH` — the variable that makes a system Chromium usable — is documented only inside a Dockerfile snippet.
11. **No health/readiness endpoint.** Nothing to probe; pm2 and any load balancer are blind to a server that is up but broken.
12. **Committed cache artifacts.** `backend/.wwebjs_cache/` contains 21 tracked WhatsApp-Web HTML snapshots despite `backend/.gitignore:6` listing that directory — they were committed before the ignore rule and remain in the tree.
13. **`clean_and_seed_demo.js` disables foreign keys and deletes by non-match.** `:42` sets `foreign_keys = OFF`, then `:104-122` issue `DELETE FROM <every table> WHERE <scope_col> != ?` across every table discovered via `sqlite_master`. The `/tmp` backup and the keep-user guard (`:47-51`) are real safeguards, but the blast radius is the entire database and the kept identity is a hardcoded email address from one specific tenant.
14. **`seed-media-demo.js` requires outbound internet** to `picsum.photos` and writes real files into the live uploads tree; an air-gapped or firewalled evaluation host will produce shoots with no photographs (each failure prints an `x` and continues, `:181`).
15. **`DEPLOYMENT.md` is stale in at least five specific ways:** it instructs `cp .env.local.example .env.local` for a file that does not exist (`:442`); it installs Node 20 against a root `engines` of `>= 22.11.0`; it names groq as the default AI provider when the code defaults to cerebras; its env table covers 20 of 57 variables; and it omits every seeder except `seed-leads.js` (`:648-651`, `:842`), `grant-master.js`, `cc-create-admin.js`, and the entire `WF_*` test contract.


---


<!-- ── 19-addendum-5.md ─────────────────────────────────────────── -->

## Addendum 5 — The embeddable website capture widget (`widget.js`) and its spam surface

WappFlow ships a **drop-in JavaScript widget** that a studio pastes onto its own marketing
website. It renders a floating "Contact Us" bubble in the bottom-right corner; a visitor who
fills it in becomes a lead inside the studio's WappFlow CRM. The file is
`wappflow-web/public/widget.js` — 174 lines, plain ES5-style IIFE, no build step, no
dependencies — served by Next.js from the frontend origin at `/widget.js`.

This is the only piece of WappFlow that is *designed to run on somebody else's domain*. Section
03 of this dossier lists the receiving endpoint (`POST /api/website-form/:formToken/submit`) as
one of several capture routes; section 15 never mentions it. That is a material omission,
because the widget's design **requires publishing a workspace-scoped bearer-ish token in public
HTML**, and the endpoint that consumes it has no origin check, no CAPTCHA, no honeypot and no
per-token rate limit.

---

### What a studio actually gets

Settings → Connections → **Website** is one of four "platform" tabs (`wappflow-web/src/app/settings/page.js:1656-1691`).
The Website platform is `type: 'widget'` and offers three integration modes, chosen by a local
`website_type` field stored in the account's `credentials` JSON (`settings/page.js:2172-2181`):

| Mode | What Settings shows | Instructions | Where |
|---|---|---|---|
| `widget` (default) | A copy-paste `<script>` snippet | 5 steps: paste before `</body>`, a floating button appears, customise with `data-color` / `data-title` | `settings/page.js:1663-1669`, snippet built at `:2088`, rendered `:2237-2251` |
| `webhook` | The raw submit URL, to POST JSON at from the studio's own form handler | "No authentication needed — the unique token in the URL authenticates the submission" (`:1676`) | `settings/page.js:1670-1677`, URL at `:2259` |
| `formspree` | The same URL, to paste into Formspree → Integrations → Webhooks | Formspree forwards each submission | `settings/page.js:1678-1685` |

All three modes point at the **same token and the same endpoint**. The generated snippet is:

```html
<script src="{frontendOrigin}/widget.js"
        data-form="{webhook_verify_token}"
        data-api="{NEXT_PUBLIC_BASE_URL}"
        data-title="{account_name}"></script>
```

(`settings/page.js:2086-2088`; `frontendOrigin` is `window.location.origin`, i.e. whatever host
the studio owner happened to open Settings on, and `data-api` is the frontend's build-time
`NEXT_PUBLIC_BASE_URL`, `wappflow-web/src/lib/api.js:4`.)

### The token *is* the Meta webhook verify token

There is no separate "form token" concept in the schema. `POST /api/platform-accounts`
(`backend/server.js:5055-5083`) mints one value per account slot:

```js
const verifyToken = generateId().replace(/-/g, '').slice(0, 24);   // server.js:5072
```

and stores it in `platform_accounts.webhook_verify_token` (table DDL `server.js:631-643`:
`id, workspace_id, platform, account_name, account_handle, credentials, webhook_verify_token,
status, slot_index, created_at`). For Instagram/Facebook that column is the Meta subscription
verify token, which Meta treats as a shared secret. For `platform = 'website'` the *identical*
column is the public form token, and the product tells the studio to publish it in its page
source. `generateId()` is a `Math.random()` UUIDv4 (`server.js:1111-1116`) — already flagged as
§15 Finding 9 for invite tokens; here the weakness is almost beside the point, because the
design gives the token away. There is **no UNIQUE index** on `webhook_verify_token` (only
`idx_platform_accounts_ws` on `workspace_id`, verified against the schema of the shipped
`backend/wappflow.db`), and the lookup is an unindexed scan.

### The widget's client behaviour

| Concern | Behaviour | Line |
|---|---|---|
| Bootstrap | Reads `data-form`, `data-title`, `data-color`, `data-api` off its own `<script>` tag; `data-api` falls back to `script.src` minus `/widget.js` | `widget.js:4-12` |
| Missing token | `console.warn` and return — silent for the visitor | `widget.js:14` |
| UI | Injects a `<style>` block and two elements into `document.body`; 4 fields — name, phone, email, message (textarea) | `widget.js:16-113` |
| Client validation | Requires **at least one** of name/phone/email; email/phone format never checked | `widget.js:135-139` |
| Submit | `fetch(apiBase + '/api/website-form/' + formToken + '/submit')`, `Content-Type: application/json`, body `{name, phone, email, message}` | `widget.js:146-150` |
| Success | Replaces the form body with a "Message sent!" panel | `widget.js:153-159` |
| Failure | Renders `data.error` **verbatim** to the visitor | `widget.js:160-165` |
| Anti-spam | None — no honeypot field, no CAPTCHA, no timing check, no client throttle beyond disabling the button | whole file |

A repo-wide grep for `captcha|hcaptcha|turnstile|honeypot` across `backend/`,
`wappflow-web/src` and `wappflow-web/public` returns **zero hits**.

### The receiving endpoint

`backend/server.js:5254-5290`. Public, no `auth` middleware. It sets
`Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: Content-Type` on the response,
looks the account up by token, normalises a Formspree-compatible field grab-bag, inserts a lead
(+ optional message row), and broadcasts one SSE frame.

| Canonical field | Accepted aliases | Line |
|---|---|---|
| `name` | `name`, `full_name`, `_name`, `your_name`, else the literal `'Website Visitor'` | `5263` |
| `phone` | `phone`, `telephone`, `mobile`, `phone_number` | `5264` |
| `email` | `email`, `_replyto`, `your_email` | `5265` |
| `message` | `message`, `comments`, `comment`, `msg` | `5266` |

Written rows: `leads(id, user_id, workspace_id, customer_name, customer_phone, email,
status='New', first_message, platform_source='website', platform_account_id, created_at,
last_message_at)` (`5271-5275`) and, if a message was supplied,
`messages(id, lead_id, user_id, body, from_me=0, timestamp)` (`5278`). Response body is
`{ ok: true, lead_id }` — the internal lead UUID is handed to an anonymous submitter.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/website-form/:formToken/submit` | none | `server.js:5254`; ACAO `*`; 404 `{error:'Form not found'}` on unknown token |
| OPTIONS | `/api/website-form/:formToken/submit` | none | `server.js:5292-5297` — **dead code**, see below |

---

### Maturity verdict

| Piece | Status | Why |
|---|---|---|
| `widget.js` asset + Settings snippet generator | **SHIPPED** | The file exists, is self-contained, and the snippet/URL/copy buttons all work (`settings/page.js:2237-2270`) |
| Webhook / Formspree modes | **SHIPPED (as documentation)** | They are just the same URL with different instructions; nothing mode-specific runs server-side — `website_type` is never read by the backend |
| End-to-end website→lead capture | **PARTIAL, and probably BROKEN in production** | Two independent blockers, both confirmed below: the CORS preflight and a foreign-key violation |
| Plan gating for website capture | **SOLD-NOT-BUILT** | The landing page sells it as a paid tier feature (`wappflow-web/src/app/page.js:1801`, comparison row `:1952` — off for Creator, on for Studio+) but no limit key exists and no server check runs |
| Spam / abuse controls | **NOT BUILT** | No origin allowlist, no CAPTCHA, no honeypot, no per-token limiter |
| Lead attribution (which page/campaign) | **NOT BUILT** | Nothing captures referrer, page URL or UTM; `leads.lead_source` is left NULL on this path |

---

### Bugs, security weaknesses and data-integrity risks

**W-1. The published token is a lead-injection credential — HIGH.**
Anyone who views source on a WappFlow customer's website reads `data-form="…"`, and can then
`curl` unlimited leads into that customer's CRM. There is no origin allowlist (ACAO is a flat
`*`, `server.js:5255`), no signature, no nonce, no proof-of-work. The only throttle is the
**global** limiter — `windowMs: 15 min, max: 500` per IP (`server.js:82-92`) — which is
per-IP, shared with every other route, and trivially spread across hosts. This is a cheaper and
more reliable attack than the unauthenticated Meta webhooks that §15 ranks as Finding 2: it
needs no guesswork about `entry.id`, and it deterministically targets a *chosen* tenant rather
than "whichever workspace owns the oldest social account".

**W-2. The "at least one contact field" guard is dead code — MEDIUM (data integrity).**
`server.js:5263` defaults `name` to the literal `'Website Visitor'`, so `name` is always truthy;
the very next check `if (!name && !phone && !email)` at `:5267` can never fire. `POST {}` with an
empty JSON body therefore creates a contactless lead. The widget's own client-side guard
(`widget.js:135`) is the *only* place that rule is enforced, and an attacker does not use the widget.

**W-3. No dedupe on this path.** Unlike manual creation (`findLeadByPhone`, `server.js:1131`,
called at `:2117`), inbound WhatsApp (`whatsapp-service.js` upsert), public booking
(`booking.js:405`) or the print store (`print-store.js:150`), the website path never checks for
an existing lead. Ten submissions from the same phone number produce ten leads.

**W-4. No plan metering.** `pricing.canCreate(db, ws, 'leads')` gates manual creation
(`server.js:2122`) and returns 402 at the monthly cap (Creator 200 / Studio 500 / Studio+ 5000,
`backend/entitlements.js:98-108`). The website path calls nothing, so the monthly lead
allocation — a core billing lever — is bypassable by anyone on the internet, and the usage
counter (`pricing.js:100`, a live `COUNT(*)` over `leads`) is inflatable by a stranger.

**W-5. Website leads are silent.** The handler broadcasts `broadcastToWorkspace(ws,
'lead_created', {lead})` (`server.js:5283`) and nothing else. It never calls `notify()`
(`server.js:1091`), so no bell entry and no push; and it never calls `addContactHistory()`
(`server.js:1223`), so the lead has no timeline entry. *Correction to the brief that prompted
this addendum:* the Instagram and Facebook handlers **do** call `notify()`
(`server.js:5172`, `:5234`) but they also skip `addContactHistory()`. The public booking route
does both (`booking.js:448`), and the print store writes history (`print-store.js:155`). So the
website path is the least instrumented capture route in the product: if the operator's tab is
closed when the SSE frame fires, the lead appears silently in a list with no history row.

**W-6. CONFIRMED BUG — the insert violates a foreign key on any modern workspace.**
The handler writes `account.workspace_id` into `leads.user_id` (`server.js:5273-5275`), but
`leads` declares `FOREIGN KEY (user_id) REFERENCES users(id)` (`server.js:295-308`, present
since the first commit of `server.js`, `d8dfb37`), and `db.pragma('foreign_keys = ON')` has been
set since the Phase 4 concurrency work (`server.js:57`, commit `c2f43f5`). Signup mints a
workspace id and a user id independently (`server.js:1259-1267`), so a workspace id is not a
user id. I reproduced this against a `VACUUM INTO` copy of the shipped `backend/wappflow.db`:
inserting a workspace-created account's row with the exact column list from `:5273` raises
`FOREIGN KEY constraint failed`. The `catch` at `:5289` turns that into
`HTTP 500 {"error":"FOREIGN KEY constraint failed"}`, which `widget.js:161` then renders to the
website visitor verbatim. It only succeeds on **legacy** accounts where `workspace_id` falls
back to the user id (`server.js:226`, `const workspaceId = user?.workspace_id || decoded.userId`)
— which is exactly the shape of the seeded demo data in the dev database (`user_id = workspace_id
= 'u_demo'`, the only rows with `platform_source='website'` that exist). The Instagram and
Facebook handlers have the identical defect (`:5158`, `:5220`); `booking.js` and
`print-store.js` do it correctly by resolving a real owner user id first (`booking.js:79`).

**W-7. CONFIRMED BUG — the CORS preflight is answered by the wrong middleware.**
`Content-Type: application/json` (`widget.js:148`) is not a CORS-safelisted content type, so the
browser sends an `OPTIONS` preflight. The global `cors()` middleware is mounted at
`server.js:106-109` with `origin: process.env.FRONTEND_URL || '*'`, and the `cors` package
answers preflights itself and ends the response (`preflightContinue` defaults to `false`,
`backend/node_modules/cors/lib/index.js:8-13`, `:163-176`). Therefore the hand-written
`app.options` at `server.js:5292-5297` **never executes**, and on any deployment that follows the
documented instruction to set `FRONTEND_URL` in production (`DEPLOYMENT.md:313`, "✅ in prod";
`.env.example:8` sets `https://wappflow.remoteops.co`) the preflight replies with
`Access-Control-Allow-Origin: <the dashboard origin>`. A browser on `https://customer-studio.com`
rejects that and the fetch fails before the POST is ever sent — the visitor sees
`Network error. Please try again.` (`widget.js:167-171`). Notably this blocker only affects
**browsers**; a scripted attacker (`curl`) is unaffected, so the spam surface in W-1 is live even
where the legitimate widget is not.

**W-8. Snippet injection via an unescaped account name — LOW/MEDIUM.**
`settings/page.js:2088` interpolates `account_name` into an HTML attribute with no escaping, and
`widget.js:87` injects the resulting `data-title` into `panel.innerHTML`. `PUT
/api/platform-accounts/:id` (`server.js:5087-5111`) is gated on `auth` **only** — no role check —
so any workspace member, including a low-privilege seat, can set the account name to a string
containing `"` plus markup. The owner copies the snippet and pastes it into the studio's public
website, where it executes on every visitor. `data-color` lands in a `<style>` block
(`widget.js:20`, `:39`, `:52-59`) — CSS injection, lower impact. The same GET route also returns
every account's `webhook_verify_token` to any authenticated member (`server.js:5040-5050`),
including the Meta verify tokens.

**W-9. Unbounded payload stored on a public route.** `express.json({ limit: '50mb' })`
(`server.js:112`) applies here. `message` is stored whole into `leads.first_message` and
`messages.body` with no truncation, where the Instagram/Facebook handlers at least
`.slice(0, 200)` (`server.js:5162`). A single anonymous POST can write tens of megabytes into a
tenant's database; the global limiter allows 500 of them per IP per 15 minutes.

**W-10. Plan gating for this feature does not exist.** `settings/page.js:1699` computes
`plan.limits['website_forms']` — a key that appears in **no** plan definition
(`entitlements.js:94-115` defines `users, leads, whatsapp_accounts, storage_gb, contract_sends,
ig_accounts, facebook_accounts`). `undefined` means `platformLocked()` is false and
`platformAtLimit()` returns false (`:1700-1710`), so every plan can create website forms. The
same line mis-derives Instagram's key as `instagram_accounts` while entitlements define
`ig_accounts`, so the IG lock is equally inert. Server-side, `POST /api/platform-accounts`
gates **only** WhatsApp (`server.js:5063-5070`). The landing page sells "Instagram, Facebook &
Website lead capture" as a Studio-tier upgrade (`page.js:1801`, `:1952`); nothing enforces it.

**W-11. Minor inconsistencies.** `total_messages` is left at its `0` default even when a message
row is written (contrast `:5164` for Instagram, which sets `1`); the message insert here is a
plain `INSERT` while IG/FB use `INSERT OR IGNORE`; deleting the account slot
(`server.js:5113-5124`) hard-deletes the row, so a widget already live on a customer's website
starts 404-ing with no signal to anyone.

### Cross-references and doc drift

* §03 cites this endpoint as `server.js:5204`; in the current tree it is **5254**, and the
  Instagram/Facebook handlers it cites as `5090`/`5155` are at **5139**/**5201**. §15's citations
  (`5139`, `5201`) match the current code, so §03's numbers are the stale ones — roughly 50 lines
  of drift. Believe the code.
* §15 Finding 2 (unauthenticated Meta webhooks) should be read alongside W-1: the website form is
  the same class of defect with a lower attack cost and precise tenant targeting.
* §15 Finding 9 (`Math.random` tokens) covers `server.js:5072` as "Meta webhook verify tokens" —
  the same line is also the website form token.
* `backend/test-phase5-realtime.js:115-121` is the only test that touches this path, and it is a
  **source-text assertion** (it greps `server.js` for three `broadcastToWorkspace(account.workspace_id,
  'lead_created', …)` call sites). No test issues an HTTP request to the endpoint, which is why
  W-6 and W-7 survive a green suite.

### UNKNOWNs

* **UNKNOWN:** whether the production OVH deployment actually sets `FRONTEND_URL`. The repo
  contains only `backend/.env.example`; the live `.env` is not in the tree. If it is unset, W-7
  does not bite and W-6 does; if it is set (as `DEPLOYMENT.md:313` instructs), the widget fails at
  the preflight for every visitor.
* **UNKNOWN:** whether any real website lead has ever been captured on a non-legacy workspace.
  The only `platform_source='website'` rows in the dev database are two seeded demo leads
  (`lead_4`, `lead_8`, both `user_id = workspace_id = 'u_demo'`, created 2026-06). I have no
  access to the production database.
* **UNKNOWN:** whether `widget.js` is actually reachable in production. It lives in Next.js
  `public/`, so it should be served at `{frontendOrigin}/widget.js`, but nothing in the repo
  pins or tests that URL, and the snippet hard-codes whichever origin the owner's browser was on
  when they opened Settings.


---


<!-- ── 19-addendum-6.md ─────────────────────────────────────────── -->

## 19.6 Addendum 6 — What a Deploy Actually Costs: the 12·N-Second WhatsApp Blackout

### 19.6.1 Why this section exists

Two facts already appear in this dossier, in different sections, and neither points at the other.

* §04 describes the WhatsApp boot path: at process start, `loadAccounts()` selects **every** WhatsApp account row in the database — across all tenants — and starts each one **staggered 12 seconds apart**.
* §17.7 describes the operational reality of the WhatsApp engine: one headless Chromium per connected number, an unofficial library that breaks whenever WhatsApp ships a change, and a "permanent maintenance tax" of continuous upstream breakage.

Joining them produces the single most important operational number in this business, and it is written down nowhere: **shipping any backend change takes every customer's WhatsApp offline, and the last number in the queue stays offline for roughly 12 × N seconds**, where N is the number of WhatsApp account rows in the whole database. There is no drain, no blue-green, no per-tenant restart, and no way to deploy a backend fix without paying this cost in full.

This matters beyond the outage itself. It caps how often the team can deploy. Deploy frequency caps how fast they can respond to the upstream breakage §17.7 warns is permanent. The cost of a fix and the frequency of needing one are coupled, and the coupling is invisible in the current docs.

Everything below is read off the executables. Where `DEPLOYMENT.md` disagrees, the code wins and the disagreement is named.

---

### 19.6.2 The deploy script, step by step

The production deploy is a single shell script at the repo root, run by hand on the server (`deploy.sh:6` — "Run from the repo root: `bash deploy.sh`"). It has seven visible steps:

| # | Line | What it does | Live impact |
|---|---|---|---|
| 1 | `deploy.sh:16-17` | `git checkout --` on `package-lock.json` ×2 and `wappflow-web/tsconfig.json` to clear build-artifact churn | none |
| 2 | `deploy.sh:19-20` | `git pull` | **Replaces `backend/*.js` on disk under the running process** (see §19.6.8) |
| 3 | `deploy.sh:22-24` | Prints `df -h` and `free -h` | none |
| 4 | `deploy.sh:26-27` | `cd backend && npm install --omit=dev` | Rewrites `backend/node_modules` under the running process |
| 5 | `deploy.sh:29-38` | Full `npm install` in `wappflow-web`, then `NEXT_DIST=.next.staging npm run build` | CPU/RAM pressure on the same box that is running N Chromiums |
| 6 | `deploy.sh:40-45` | `rm -rf .next.old`; `mv .next .next.old`; `mv .next.staging .next` | Atomic **artifact** swap |
| 7 | `deploy.sh:47-49` | `pm2 restart wappflow-api wappflow-web --update-env`; `pm2 save` | **The blackout starts here** |

Step 6 is the script's headline safety property, and its header comment states it precisely (`deploy.sh:3-5`): "A failed / OOM-killed frontend build can NEVER replace the live build." That is real and it works. But it protects the **artifact**, not **availability** — it guarantees a bad build never goes live, not that a good one goes live without downtime. Step 7 hard-restarts both processes regardless.

The asymmetry the reader needs: the frontend is stateless, so its restart costs a few seconds of 502s and nothing more. The backend is not stateless. It holds the SQLite handle, the SSE bus, and — the expensive part — N live headless Chromium browsers, each holding one customer's authenticated WhatsApp Web session. `DEPLOYMENT.md:38` states the constraint plainly: "The backend must be a **single instance** because WhatsApp Web sessions and the SQLite database live on disk." A single stateful instance cannot be reloaded without being restarted, and `pm2 restart` (not `pm2 reload`) is what the script uses.

---

### 19.6.3 What "restart" does to WhatsApp

The process boots. `server.js` runs top to bottom: schema creation, `safeAlter` migrations, index creation (`server.js:896-922`), boot backfills (`server.js:720`, `:733-743`, `:757-774`). At `server.js:1240` it constructs the manager and at **`server.js:1248`** it calls:

```js
console.log('🔄 Initializing WhatsApp...');
whatsappService.loadAccounts();
```

`loadAccounts()` is fifteen lines (`whatsapp-service.js:1380-1398`):

```js
const accounts = this.db.prepare(
  `SELECT * FROM platform_accounts WHERE platform = 'whatsapp' ORDER BY slot_index ASC`
).all();
accounts.forEach((account, i) => {
  setTimeout(() => {
    try { this._startAccount(account.id, account.slot_index); }
    catch (e) { console.error('⚠️ Staggered account start failed:', e.message); }
  }, i * 12000);
});
```

Five properties of that query and loop decide the shape of every deploy:

1. **No workspace filter.** One global queue across all tenants. A customer's downtime depends on how many *other* customers exist and where their rows sort.
2. **No status filter.** The `platform_accounts` table has a `status` column defaulting to `'disconnected'` (`server.js:639`), and it is not consulted. A row created by a trial user who never scanned a QR code, or a churned customer whose row was never deleted, still consumes a full 12-second slot and still launches a Chromium. **N is the row count, not the connected-number count.** Rows are only removed by an explicit `DELETE /api/platform-accounts/:id` (`server.js:5113-5124`); nothing prunes them on churn, downgrade, or non-payment.
3. **`ORDER BY slot_index ASC`, globally.** `slot_index` is only unique *within* a workspace — the code says so at `whatsapp-service.js:1410-1412`. Ordering by it across all tenants means every workspace's slot-0 number is scheduled before any workspace's slot-1 number. That is accidentally the fair ordering (primary numbers first), but it is not stated as intent anywhere, and within a slot tier the order is whatever SQLite returns — effectively arbitrary and not stable across deploys. **A given tenant cannot predict its position in the queue.**
4. **Fire-and-forget `setTimeout`.** The delays are computed once at boot. Nothing rebalances if an early account hangs; slot 40 fires at t+468s whether slot 3 succeeded or is still spinning.
5. **`i * 12000`, unconditional.** No cap, no batching, no concurrency ceiling. The window grows linearly and forever with customer count.

**The formula.** The last account's start is *triggered* at `12 × (N − 1)` seconds. It then has to actually reach `connected`, which is bounded above by the 60-second init watchdog (`whatsapp-service.js:546-563`). So the worst-case time-to-restored-service for the unluckiest tenant is `12(N − 1) + T_init`, with `T_init ≤ 60s` before the session is instead marked `error`.

| N (WhatsApp rows) | Last start triggered at | Realistic worst-case restore |
|---|---|---|
| 2 | 12 s | ~30–70 s |
| 5 | 48 s | ~1–2 min |
| 10 | 1 m 48 s | ~2–3 min |
| 25 | 4 m 48 s | ~5–6 min |
| 50 | 9 m 48 s | ~10–11 min |
| 100 | 19 m 48 s | ~20–21 min |
| 200 | 39 m 48 s | ~40–41 min |

**A hardware caveat that cuts the other way, and is just as important.** `DEPLOYMENT.md:395-396` recommends "2 vCPU, 2 GB RAM" and notes that each Chromium session "wants ~500 MB". On the recommended box, N ≈ 2. The 20-minute figure at N = 100 therefore assumes a machine roughly 25× the documented spec (~51 GB RAM by that formula), and no such machine is described anywhere in the repo. So the architecture is bounded from two directions at once: **RAM caps how many numbers one box can hold, and the 12-second stagger caps how fast it can bring them back.** Neither bound is mitigated, and there is no sharding, no second backend instance, and no way to have one — the single-instance constraint at `DEPLOYMENT.md:38` forbids it.

Plan limits set the per-customer multiplier: Creator 1, Studio 2, Studio+ 5, Enterprise unlimited (`entitlements.js:98`, `:103`, `:108`, `:114`), with a hard ceiling of 5 per platform per workspace enforced at `server.js:5060`. So N grows at roughly 1–5 rows per paying customer.

---

### 19.6.4 What is actually unavailable during the window

| Capability | State during the window | Where |
|---|---|---|
| Inbound WhatsApp messages | Not received. The `message` handler only exists on a live client (`whatsapp-service.js:299`). Recovery depends entirely on the missed-message sync — see §19.6.5 | `whatsapp-service.js:299-493` |
| Outbound send (lead reply) | `sendMessage` throws `'WhatsApp not connected'` when no instance is ready; the endpoint returns **HTTP 500** with that string as the error body | `whatsapp-service.js:1481-1485`, `server.js:1884-1908` |
| Outbound send (`POST /api/whatsapp/send`) | Same 500 | `server.js:3185-3192` |
| Voice notes / media send | Same guard, same failure | `whatsapp-service.js:728`, `:735` |
| Automated client messages (Media Studio, Booking, Print Store, Contracts) | Same — they use injected `sendMessage` seams | `server.js:6343`, `:6457`, `:6500` |
| Auto-replies | Not sent — `checkAutoReply` only runs from the inbound handler | `whatsapp-service.js:1334` |
| WhatsApp page status | `GET /api/whatsapp/status` returns `{ status: 'not_initialized', isReady: false }` for any account whose instance is not yet in the map | `whatsapp-service.js:1433-1437` |
| What the customer sees | A **red "Disconnected"** chip, and `isError === true`, which surfaces the retry CTA | `wappflow-web/src/app/whatsapp/page.js:80`, `:89` |
| Reminders | Any reminder due inside the restart gap is **silently lost forever** — the cron selects a two-minute window and nothing marks a reminder as fired (cross-ref §17) | `server.js:3999-4009` |
| SSE / real-time | All `/api/events` connections drop and the browser `EventSource` reconnects | `wappflow-web/src/components/shell/realtime.js:63` |

The customer-visible summary: for up to 12·N seconds after every deploy, a studio's WhatsApp page says **Disconnected in red**, their replies fail with a 500, and messages their clients send arrive nowhere.

---

### 19.6.5 The recovery path, and its two failure modes

When a session finally reaches `ready`, the handler schedules a catch-up (`whatsapp-service.js:260-275`):

```js
// Auto-sync any messages missed during downtime (wait 4s for connection to stabilise)
setTimeout(() => this.syncMissedMessages(), 4000);
```

`syncMissedMessages()` (`whatsapp-service.js:1209-1328`) reads the newest message timestamp for the owning workspace, converts it to epoch seconds, then scrapes the WhatsApp Web page's in-memory chat models for inbound messages newer than that watermark (`_collectMissedFromPage`, `whatsapp-service.js:1130-1206`), de-duplicating on `messages.wa_message_id`.

This is the **only** thing standing between a deploy and permanent message loss. Two problems:

**(a) It is one day old, and §17.7 says it had never worked.** The commit is dated 2026-08-24 and titled, verbatim, *"Fix missed-message sync, which had never once succeeded"* (`git log`). Everything the current code does — page-context scraping, backwards paging, the `NON_CONTENT_TYPES` filter, the `keyOf` id extraction — is a same-day rewrite. It is **PARTIAL**: the implementation is thorough and plainly written by someone who understood the failure, but it has one day of production exposure. Every deploy before 2026-08-24 lost every message that arrived during its window, with no record that it happened.

**(b) The watermark is per-workspace, not per-account.** The lookup joins `messages → leads` filtered by `workspace_id` only (`whatsapp-service.js:1216-1222`), and it does not filter `from_me`. Two consequences for a workspace with two numbers, which is the default Studio plan: whichever account becomes ready first imports up to "now" and advances the shared watermark, so the second account's sync computes `sinceSec ≈ now` and imports nothing — its own missed messages are silently skipped. An outbound message sent from the dashboard also advances the watermark past inbound messages that were never imported. The `messages` table does carry `platform_account_id` (written at `whatsapp-service.js:1302-1306`), so the per-account watermark is available; the query simply does not use it.

There is also **no boot-time retry**. If `client.initialize()` rejects — plausible when N Chromiums are launching on a memory-constrained box — the handler is explicit (`whatsapp-service.js:495-500`):

```js
this.status = 'error';
this.isReady = false;
// No auto-retry — user clicks "Reconnect WhatsApp" button which calls reconnect()
```

The exponential backoff at `whatsapp-service.js:569-589` (10s → 30s → 90s, then permanent `reconnect_failed`) is wired to the `disconnected` event and to heartbeat failure — **not** to the boot path. So a tenant whose session fails to come up during a deploy is offline until a human notices and clicks a button. That is the exact failure the 12-second stagger exists to prevent, which makes the stagger load-bearing rather than cosmetic.

One genuinely positive side effect, for honesty: `reconnectAttempts` is per-instance and starts at 0 in a fresh process, so a number that had exhausted its three retries and parked in `reconnect_failed` gets a free retry on every deploy.

---

### 19.6.6 Why the 12 seconds cannot simply be lowered — and why the number is still wrong

The comment above the loop states the rationale (`whatsapp-service.js:1384-1387`):

> Launching every account's Chromium at the same instant thrashes CPU/RAM and trips "browser is already running" races where a slow-to-start browser collides with a watchdog-triggered re-init. Spacing each launch ~12s apart lets every session reach QR/ready before the next.

The first half is well-evidenced. `_cleanLocks()` (`whatsapp-service.js:134-208`) exists solely to clean up after those races — killing Chromium processes whose `--user-data-dir` exactly matches this session's profile and deleting `SingletonLock` / `SingletonCookie` / `SingletonSocket` / `.lock` / `lockfile`. Its own comment calls it "the single most important reliability primitive." Cutting the stagger to zero re-creates the failure that primitive was written for, and per §19.6.5 a failed boot start is never retried.

The second half is **contradicted by the code's own constants**. 12 seconds does not let a session "reach QR/ready before the next" — the init watchdog budgets **60 seconds** for exactly that transition before declaring failure (`whatsapp-service.js:546-563`). At 12-second spacing, up to five Chromiums can legitimately be in `initializing` at once. So the stagger is simultaneously **too long for availability** (it is the entire blackout) and **too short for its stated purpose** (it does not serialize what it claims to serialize). Nothing in the repo records how 12 was chosen or measures whether it is enough. There is no boot log line reporting total time-to-all-connected; the only per-account evidence is scattered `console.log` lines.

---

### 19.6.7 The compounding problem: deploy frequency vs. upstream breakage

§17.7 warns that WhatsApp breakage from upstream is "a permanent maintenance tax, not a backlog item." The git history supports it: on **2026-08-24 alone**, 25 commits landed, four of them WhatsApp repairs — *"Fix missed-message sync, which had never once succeeded"*, *"Voice notes: stop sending a format WhatsApp always rejects"*, *"Stop asking WhatsApp for a chat model it can no longer build"*, *"Stop reporting a group edit as done when WhatsApp refused it."*

Each of those fixes reaches customers only through `deploy.sh`, and therefore only by taking every customer's WhatsApp offline for up to 12·N seconds. The loop closes badly: the component most likely to break is the one whose repair is most expensive to ship, and the cost scales with exactly the thing the business is trying to grow.

`DEPLOYMENT.md` makes the trap explicit without noticing it. Its documented remedy for *one* stuck account (`DEPLOYMENT.md:771-776`) is:

```bash
rm -rf /data/.wwebjs_auth/session-<account-slot>
pm2 restart wappflow-api
```

The prescribed fix for a single tenant's broken session is a restart that blacks out **every** tenant. (That snippet is also stale on its own terms: profiles are named `session-acct-<accountId>` — `whatsapp-service.js:1414` — not `session-<account-slot>`. The slot-based naming was the collision bug the account-id keying was introduced to fix.) Its maintenance section (`DEPLOYMENT.md:756-763`) lists the manual deploy sequence ending in `pm2 restart wappflow-api wappflow-web` and says nothing about WhatsApp downtime at all.

---

### 19.6.8 Things that make the window worse

**`execSync` on the event loop, N times per boot.** `_cleanLocks()` runs synchronously inside `initialize()` and shells out on the main thread: `pgrep -af …` with a 5-second timeout (`whatsapp-service.js:174`), `kill -9` per PID (`:189`), and a literal `execSync('sleep 0.5')` (`:192`); the Windows branch even spins a busy-wait loop (`:157`). Every one of the N staggered starts therefore freezes the entire API — HTTP, SSE, and SQLite writes — for at least half a second, and up to several seconds if `pgrep` is slow. The file itself knows better: the comment at `whatsapp-service.js:754` reads "never use execSync in a request path, it blocks the" event loop. The boot path was not held to the same rule.

**A panicking customer defeats the stagger.** During the window a tenant sees the red Disconnected state and a retry button. Clicking it calls `POST /api/whatsapp/reconnect` (`server.js:3167-3175`) → `WhatsAppManager.reconnect(accountId)`, which finds no instance in the map and calls `_startAccount` **immediately** (`whatsapp-service.js:1445-1454`), jumping the queue. `_startAccount` is idempotent within a process (`whatsapp-service.js:1409`), so the later scheduled timer becomes a no-op — but the launch itself is now concurrent with whatever the stagger was carefully spacing. With several impatient customers, the deploy degenerates into precisely the simultaneous-launch thrash the 12 seconds exists to prevent.

**The cross-tenant send hole is maximally live during this window.** §04 documents it: `getReadyService(accountId)` (now at `whatsapp-service.js:1464-1476`; §04's citation of `:1139-1150` predates a subsequent revision of the file) falls through to *any* ready instance in the process, and no `server.js` call site passes an `accountId`. That fallback only fires when the requested account is not ready — which is the *definition* of the deploy window. During those 12·N seconds most accounts are not ready and a few are, so this is the period in which workspace A's message is most likely to be delivered from workspace B's WhatsApp number. The deploy does not create the bug, but it maximizes the exposure, on a schedule.

**A mixed-version execution window.** `git pull` (`deploy.sh:20`) and `npm install --omit=dev` (`deploy.sh:27`) rewrite `backend/*.js` and `backend/node_modules` while the old process is still serving traffic, and the restart does not happen until after the frontend build — typically minutes later. Most backend requires are resolved at boot, but at least one is lazy: `whatsapp-service.js:636` does `require('./ai-engine')` inside `_maybeAutoAnalyze`, called on lead creation. An inbound message in that window on an auto-analyze workspace loads the **new** `ai-engine.js` into the **old** process. The window is narrow and the blast radius small, but it is real mixed-version execution and nothing guards it.

**No graceful shutdown at all.** `grep` for `SIGTERM`/`SIGINT` across `backend/` returns nothing; the only process handlers are `unhandledRejection` and `uncaughtException` (`server.js:26-31`), both of which deliberately keep the process alive. So `pm2 restart` kills Node with no chance to `destroy()` the N Chromium browsers, no chance to flush anything, and no chance to tell connected clients why. Orphaned Chromiums and stale `SingletonLock` files are cleaned up *after the fact*, on the next boot, by `_cleanLocks()` — which is why that function is load-bearing and why it is on the event loop.

---

### 19.6.9 What does not exist

Searching the repository for `blue-green`, `zero-downtime`, `drain`, and `graceful` returns only Media Studio job-queue drains and unrelated prose. Specifically, **none of the following exist anywhere in the codebase or the docs**:

* Any second backend instance, load balancer, or connection drain. The single-instance constraint (`DEPLOYMENT.md:38`) rules it out by construction.
* Any way to restart or hot-reload one tenant's WhatsApp session without restarting the process. The per-account `connect`/`disconnect`/`reconnect` endpoints (`server.js:3144-3165`) restart a *session*, not the code — they cannot deploy a fix.
* Any pre-deploy notice, maintenance banner, or status page. Customers discover the outage by seeing a red chip.
* Any post-deploy verification that all N sessions came back. `DEPLOY-CHECKS.md` is a careful 5-section manual checklist covering the membership backfill, chat authorization, real-time, notifications and search — and it contains **no item for WhatsApp reconnection**.
* Any metric, log line, or DB row recording blackout duration or per-account time-to-ready.
* Any queueing of outbound sends attempted while disconnected. `outbound_message_queue` exists as a table and is documented in `DEPLOYMENT.md`, but §17/`wappflow-findings` records it as dead — the send path throws rather than enqueues (`whatsapp-service.js:1483`).

---

### 19.6.10 Maturity classification

| Thing | Verdict | Named gap |
|---|---|---|
| `deploy.sh` as a deploy mechanism | **SHIPPED** | Works, is idempotent, and its atomic `.next` swap genuinely prevents a bad build going live |
| Backend deploy without customer impact | **SOLD-NOT-BUILT** | No drain, no blue-green, no per-tenant restart. Every backend deploy is a full WhatsApp outage; nothing in the product or docs acknowledges it |
| Staggered WhatsApp boot | **PARTIAL** | Prevents launch thrash, but 12 s is unjustified against the code's own 60 s watchdog, uncapped, and applied to dead rows as well as live ones |
| Missed-message recovery after a restart | **PARTIAL** | One day old (2026-08-24); per-workspace watermark silently skips the second account in a multi-number workspace |
| Post-deploy WhatsApp verification | **STUB** | `DEPLOY-CHECKS.md` exists and is thorough about everything except the component most likely to break |
| Graceful shutdown | **SOLD-NOT-BUILT** | No signal handler exists; N Chromiums are killed mid-flight every deploy |
| Outbound send during downtime | **STUB** | Throws a 500; the queue table that would fix it is dead code |

---

### 19.6.11 Bugs, risks and smells found while researching this

1. **`loadAccounts` starts disconnected and abandoned accounts.** No `status` filter at `whatsapp-service.js:1382`. Churned and never-scanned rows each burn a 12-second slot and launch a Chromium, inflating the blackout for paying customers and wasting ~500 MB apiece. *Data-integrity adjacent:* nothing prunes `platform_accounts` on churn or downgrade.
2. **Per-workspace missed-message watermark.** `whatsapp-service.js:1216-1222` filters on `workspace_id` and ignores both `platform_account_id` and `from_me`. In a two-number workspace the second account to become ready imports nothing. **Message loss, silent, no error surfaced.**
3. **`execSync` on the event loop in the boot path.** `whatsapp-service.js:174`, `:189`, `:192` (and the busy-wait at `:157`) stall the whole API once per account start, contradicting the file's own rule at `:754`.
4. **No boot-time init retry.** `whatsapp-service.js:495-500` leaves a failed start permanently in `error` with no reschedule; the backoff at `:569-589` never covers this path. A tenant can stay offline indefinitely after a deploy with no alert.
5. **Customer-triggered stagger bypass.** `whatsapp-service.js:1445-1454` starts an account immediately on manual reconnect, defeating the spacing precisely when spacing matters most.
6. **Cross-tenant send fallback peaks during deploys.** `whatsapp-service.js:1464-1476` plus zero `accountId`-passing call sites. Already documented in §04 as the section's most serious defect; this addendum adds that the deploy window is its highest-probability trigger.
7. **Unstable queue order.** `ORDER BY slot_index ASC` across tenants is not a total order; ties resolve arbitrarily, so a tenant's blackout duration varies deploy to deploy with nothing controlling it.
8. **Mixed-version window.** `deploy.sh:20`/`:27` mutate the running process's source tree and `node_modules` minutes before the restart; the lazy `require('./ai-engine')` at `whatsapp-service.js:636` can cross the version boundary.
9. **Reminder loss on every restart.** `server.js:3999-4009` selects a two-minute window and never marks a reminder as fired; a restart inside that window drops it permanently. Already in §17 — noted here because **every deploy triggers it deterministically**, which §17 does not say.
10. **Stale runbook path.** `DEPLOYMENT.md:773` tells operators to `rm -rf /data/.wwebjs_auth/session-<account-slot>`; the code writes `session-acct-<accountId>` (`whatsapp-service.js:1414`). Following the doc deletes nothing, or the wrong thing.
11. **The documented single-tenant remedy is a global outage.** `DEPLOYMENT.md:774` prescribes `pm2 restart wappflow-api` to fix one broken session.

---

### 19.6.12 What could not be determined

* **UNKNOWN: N in production.** The number of `platform_accounts` rows with `platform='whatsapp'` on the live host cannot be read from the repository. §04 already records that it is unknown whether *any* workspace runs more than one number. Every duration in §19.6.3 is therefore a formula applied to a hypothetical N, not a measurement.
* **UNKNOWN: real time-to-`ready` per session.** Bounded above by the 60-second watchdog, but no telemetry, log line, or benchmark records the actual distribution. The `+ T_init` term in the formula is a bound, not a number.
* **UNKNOWN: the live host's actual RAM/CPU.** `DEPLOYMENT.md:395` recommends 2 vCPU / 2 GB, and memory notes record the live host as an OVH box at `/var/www/wappflow`, but the repository contains no evidence of its specification. Whether the box could even hold N = 50 Chromiums is undetermined.
* **UNKNOWN: real deploy frequency.** 25 commits landed on 2026-08-24, but commits are not deploys — `deploy.sh` is run manually and leaves no artifact in the repo. How many of those 25 became separate restarts, versus one batched deploy, cannot be recovered from the code.
* **UNKNOWN: whether customers have ever noticed.** No status page, no incident log, no support-ticket record exists in the repository.


---
