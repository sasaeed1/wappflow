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
