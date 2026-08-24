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
