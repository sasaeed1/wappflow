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
