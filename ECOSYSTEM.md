# WappFlow Ecosystem — Features & Architecture

*A complete reference for the WappFlow product ecosystem: the **CRM**, **Media Studio**, and **Contracts Studio**. (Flux, the sibling AI content engine, is intentionally excluded here.)*

Last updated: 2026-06-16.

---

## 1. What WappFlow is

WappFlow started as a WhatsApp-first CRM and grew into a **single operating system for a creative service business** — the kind of studio that finds a client on WhatsApp, sends a proposal, signs a contract, shoots the work, delivers a gallery, and gets paid. Everything is built around **one client record** and **one inbox**, so a lead you chat with is the same lead you send a contract to, shoot for, and invoice — no second CRM, no copy-paste between tools.

Three first-class modules sit on that spine, reachable from the in-app **app-switcher**:

| Module | What it does | Lives at |
|---|---|---|
| **CRM** | Leads, WhatsApp inbox, pipeline, clients, invoices, automations, analytics, team | `/dashboard`, `/leads`, `/clients`, `/invoices`, `/whatsapp` |
| **Media Studio** | Ingest → AI culling → galleries → proofing → delivery → portfolio → video → watermark | `/studio` |
| **Contracts Studio** | Block-based proposals & contracts → interactive signing → automations → analytics | `/contracts` |

The design language across the studios is intentionally premium — closer to Apple / Stripe / Notion than to legacy SaaS.

---

## 2. Architecture

### 2.1 Stack
- **Frontend:** Next.js 16 (App Router, React 19, Turbopack). Styling is inline styles + CSS variables (no Tailwind at runtime); each studio defines its own theme tokens. Client pages are `'use client'` and talk to the API via a shared `axios` instance (`src/lib/api.js`).
- **Backend:** Node.js + Express, single process, **better-sqlite3** (synchronous, file-backed SQLite). Real-time updates via Server-Sent Events (SSE) broadcast helpers.
- **Background work:** `node-cron` schedules (reminders, trash cleanup, contract expiry sweep) and a media worker loop for heavy media jobs.
- **AI:** a centralized `ai-engine.js` with a **provider-failover chain** (Cerebras → Groq → OpenRouter → OpenAI → Anthropic) — any configured key works; rate-limited providers cool down and the next takes over.

### 2.2 The additive module pattern
Media Studio and Contracts Studio are **mounted, self-contained modules**, not edits to the core:

```js
require('./media-studio')(app, db, { auth, generateId, logAudit, broadcastToWorkspace,
  addContactHistory, multer, path, fs, uploadsDir, sendClientMessage, clientBaseUrl, ai });
require('./contracts-studio')(app, db, { auth, generateId, logAudit, broadcastToWorkspace,
  addContactHistory, path, fs, uploadsDir, multer, clientBaseUrl, sendClientMessage, sendEmail });
```

Each module:
- **Owns its own tables** (`ms_*` for Media Studio, `cs_*` for Contracts Studio), created idempotently with `CREATE TABLE IF NOT EXISTS` on boot — no migrations to run.
- **Reads core tables** (`leads`, `invoices`, `company_settings`, `workspace_members`) but never alters them.
- Receives **dependency-injected seams** for the things only the core can do: authentication, audit logging, SSE broadcast, CRM timeline writes, WhatsApp/email delivery, and file storage. Swapping the delivery or storage implementation never touches module code.

This is why new modules ship without risk to the working WhatsApp inbox.

### 2.3 Multi-tenancy
Every record is scoped by `workspace_id`. `auth` middleware resolves, per request: `req.workspaceId`, `req.workspaceOwnerId` (the super-admin user that owns billing/settings), `req.userId`, and the member's role/permissions. Invoices and company settings are keyed to the workspace owner; module data is keyed to the workspace.

### 2.4 Storage
A **storage seam**: files are written to `uploads/` and served at `/uploads/...` today; the `publicUrl(key)` / upload helpers are the single point to swap for S3/R2 + a CDN later. Media assets keep a `variants` JSON (`original` / `web` / `thumb` / `watermarked`); contract files and letterheads live under `uploads/cs/`.

### 2.5 Real-time & delivery seams
- **SSE:** `broadcastToWorkspace(wsId, event, payload)` pushes live updates (new media, a signed contract, watermark completion) to every open tab in the workspace.
- **WhatsApp:** `sendClientMessage({ lead, userId, text })` wraps the existing WhatsApp service + logs the outgoing message to the lead's thread.
- **Email:** `sendEmail({ workspaceOwnerId, to, subject, html, text })` reads per-workspace SMTP from `email_smtp_settings` via nodemailer.

### 2.6 Deploy
Atomic, zero-downtime-ish deploy via `deploy.sh`: drop regenerable build-artifact churn (lockfiles, `tsconfig.json`) → `git pull` → install → **build the frontend into `.next.staging`** → only swap it into `.next` on success → restart `pm2` services. A failed/OOM build can never replace the live build.

---

## 3. The CRM (the spine)

- **WhatsApp inbox:** real-time conversations, outgoing message logging, message presets/templates, media messages.
- **Leads & pipeline:** Kanban stages — **New → Contacted → Interested → Negotiating → Closed-Won / Closed-Lost** — with drag-and-drop, estimated value and actual sale, tags, notes, reminders, and a per-lead **activity timeline** that every module writes into.
- **Clients:** won deals convert to clients (`is_client` / `client_since`); a dedicated `/clients` view; the inbox and analytics still see everyone. Conversion is reversible and logged.
- **Invoices:** line-item invoices with tax/discount, auto-numbered from `company_settings` (`INV-####`), currency-aware, statuses (draft/sent/paid). Contracts Studio creates these automatically.
- **AI lead intelligence:** scoring, sentiment, urgency, intent, reply suggestions, conversation summaries, and reusable business-memory extraction — all through `ai-engine.js`.
- **Automations & email workflows:** scheduled email sequences (`email_workflows`) and event triggers; per-minute cron processes due reminders + push notifications.
- **Team & workspace:** members, roles (`super_admin`/`admin`/`manager`/…), permissions, plan/billing tier.
- **Analytics & reports:** pipeline value, conversion, activity.

---

## 4. Media Studio

A control-first creative workspace for photographers and studios. **The AI advises; the human decides** — nothing destructive happens automatically.

### 4.1 Capabilities
- **Projects (`ms_projects`):** a shoot, linked to the same CRM lead/client. Types: wedding / event / real-estate / commercial / portrait / product / general. Lifecycle: planning → shooting → culling → delivery → delivered → archived.
- **Ingest:** drag-drop upload (multer, 200 MB/file local cap), RAW + photo + video + audio detection; downstream jobs (`ms_jobs`) enqueue variant/EXIF/CV work.
- **AI-assisted culling:** keyboard-first cull view with **advisory** focus/sharpness, duplicate (perceptual-hash), and quality hints. Before/after + reset. Decisions (`pick`/`reject`) are the photographer's.
- **Galleries & proofing:** client galleries (`ms_galleries`) with visibility/password control, favourites, comments, **proofing/selection requests**, and ZIP export with a configurable download policy (none / web / high-res).
- **Watermark (non-destructive):** bulk-apply a **text or logo** watermark (position, opacity, size, tiled) to client previews using `jimp`. **Originals are never modified** — a separate `watermarked` variant is generated; the client gallery serves the protected image while the studio library keeps clean files (with a "WM" badge). High-res downloads (when allowed) bypass the watermark.
- **Slideshow:** library lightbox + client gallery slideshow (auto-advance, video play-through).
- **Portfolio:** a public, themed portfolio (vanity link, 10 themes) that pulls from delivered work.
- **Video studio:** templates, AI reel drafts, colour grading (LUT/`.cube` upload), one-click export.
- **Trash:** soft-delete with 30-day restore; auto-purge on a daily cron.
- **Studio Copilot:** an in-app assistant that analyzes real project data and suggests (never performs) actions.

### 4.2 Data
`ms_projects`, `ms_folders`, `ms_assets` (with `variants` JSON incl. `watermarked`), `ms_asset_scores`, `ms_jobs`, `ms_galleries`, `ms_gallery_assets`, `ms_gallery_access`, `ms_timelines` (video), plus LUT/audio tables. Public gallery access is a tokenized, no-auth capability (`/g/[token]`).

---

## 5. Contracts Studio

Client-centric proposals, contracts and e-signing. **Not a DocuSign clone, not a standalone PDF tool** — the contract is part of the relationship: the workflow, the signing experience, and the automations *are* the product. Built in seven phases.

### 5.1 Documents & the block builder
- **Document model (`cs_documents`):** types contract / proposal / quote / NDA / SOW / retainer / agreement; statuses draft → pending_approval → sent → viewed → signed → completed → declined → expired; a tokenized public link; version + `doc_hash`; timestamps for sent/viewed/completed/expires.
- **Block builder (`/contracts/[id]`):** ~19 block types — heading, text, callout, divider, button, image, gallery, video, embed, pricing table, **packages**, **optional add-ons**, timeline, checklist, FAQ, testimonial, custom section, **signature**, **approval**. Add/reorder/delete inline; everything autosaves. One `BlockView` renders both the editor and the client view, so preview is truth.
- **Three themes:** Monochrome / Editorial / Executive — full restyles, not colour swaps. A workspace default is set in Settings.
- **Starter packs:** curated, ready-to-edit templates (Wedding Proposal, Portrait Agreement, Commercial SOW, Mutual NDA) so the studio is never a blank page.
- **Upload-to-sign:** attach an existing **PDF or image** and send it for signing — rendered in the builder and the client portal via a shared `DocFrame`.
- **Letterhead:** an optional workspace letterhead image (uploaded in Settings) shown at the top of every document, toggleable per document.

### 5.2 The client experience (`/d/[token]`)
A fast, mobile-first, themed page — no login, the link is the key:
- **Interactive proposals:** clients select a package and toggle add-ons; a sticky **live total** updates in real time.
- **Client Q&A:** an "Ask a question" widget answers in plain language, **grounded only in the document** (declines to guess).
- **Signing:** type a legal name + draw a signature on a retina canvas + an **ESIGN/UETA consent** checkbox. IP, timestamp, and device are recorded; a **SHA-256 hash** seals the signed document.
- **Multi-party:** client / company / witness / co-signer, signed in order; the document completes when all have signed.

### 5.3 Sending, reminders, expiry
- **Send** generates the secure link and delivers over **WhatsApp and/or email**, or copy-to-share.
- **Expiry:** 3/7/14/30 days or never; a daily cron flips expired sent/viewed docs to `expired` (status only — it never sends anything).
- **Manual reminders:** re-deliver the link to whoever hasn't signed (kept manual by design, so outbound messages are always an explicit action).

### 5.4 Approvals, automations, payments
- **Approvals:** require internal sign-off before a document can be sent; sending is gated until approved (`cs_approvals`).
- **Automations on signature** (`runAutomations`, each step isolated): **move the pipeline** (updates the linked lead's stage + actual sale), **create an invoice** from the client's actual selection (real `invoices` row, auto-numbered), and **create a Media Studio project**. Each fires once the document is fully signed.
- **Payments:** terms of deposit (% or fixed) / full / milestones / plan / retainer; the auto-invoice bills the right amount and notes the balance.

### 5.5 AI, analytics, vault
- **AI assistant:** draft a whole document from a one-line brief (returns real blocks), improve a block, summarize, or flag risky/missing clauses.
- **Analytics (`/contracts/analytics`):** funnel (sent → viewed → signed), acceptance rate, signed revenue, total views, **average time-on-page and read depth (drop-off)** via portal beacons, time-to-sign, and most-viewed documents.
- **Client Vault (`/contracts/vault`):** every client's documents filed together with counts, signed totals, and contact info.
- **Settings & Help:** dedicated `/contracts/settings` (letterhead, default theme, default expiry, sender name) and a comprehensive `/contracts/help`.

### 5.6 Data
`cs_documents`, `cs_signers`, `cs_events` (audit + analytics), `cs_approvals`, `cs_templates`, `cs_settings`. Public portal endpoints (`/api/cs/public/:token` + `/sign` `/decline` `/ask` `/track`) are tokenized and no-auth.

---

## 6. How the modules connect

The whole point is that the modules are one system. The clearest example is a signed contract:

```
Client picks a package on /d/[token] and signs
        │
        ▼
Contracts Studio: status → completed, SHA-256 hash, audit event
        │  runAutomations()
        ├─▶ CRM: lead.status → "Closed - Won", actual_sale set, timeline updated
        ├─▶ Invoices: INV-#### created from the client's selection (+ deposit terms)
        └─▶ Media Studio: ms_projects row created (status: planning), linked to the same lead
        │
        ▼
WhatsApp + email: client notified; studio notified of the signature
```

Other seams: Media Studio writes shoot events onto the CRM lead timeline; Contracts Studio files documents under the same lead (Client Vault) and can be created automatically from a won deal; invoices created by contracts appear in the normal Invoices view. **One client, one timeline, three studios.**

---

## 7. Reference

### 7.1 Tables by module
- **Core/CRM:** `users`, `workspace_members`, `leads`, `notes`, `reminders`, `tags`, `lead_tags`, `invoices`, `company_settings`, `email_templates`, `email_workflows`, `email_smtp_settings`, `activity_timeline`, `message_presets`.
- **Media Studio:** `ms_projects`, `ms_folders`, `ms_assets`, `ms_asset_scores`, `ms_jobs`, `ms_galleries`, `ms_gallery_assets`, `ms_gallery_access`, `ms_timelines` (+ LUT/audio).
- **Contracts Studio:** `cs_documents`, `cs_signers`, `cs_events`, `cs_approvals`, `cs_templates`, `cs_settings`.

### 7.2 Key API surface
- **CRM:** `/api/leads*`, `/api/invoices*`, `/api/auth*`, `/api/workspace*`, `/api/analytics*`.
- **Media Studio:** `/api/media/projects*`, `/api/media/assets*`, `/api/media/galleries*`, `/api/media/projects/:id/watermark/{apply,remove,logo}`; public `/api/media/gallery/:token`.
- **Contracts Studio:** `/api/cs/documents*` (+ `/send` `/remind` `/upload` `/signers` `/request-approval` `/decide-approval`), `/api/cs/{overview,analytics,vault,packs,templates,settings}`; public `/api/cs/public/:token` (+ `/sign` `/decline` `/ask` `/track`).

### 7.3 Frontend routes
- CRM: `/dashboard`, `/leads-list`, `/leads/[id]`, `/clients`, `/invoices`, `/whatsapp`, `/reports`, `/team`, `/settings`.
- Media Studio: `/studio`, `/studio/[id]` (+ `/cull` `/albums` `/video`), `/studio/portfolio`, `/studio/settings`, `/studio/help`, `/studio/trash`; public `/g/[token]`, `/folio/[handle]`.
- Contracts Studio: `/contracts`, `/contracts/[id]`, `/contracts/analytics`, `/contracts/vault`, `/contracts/settings`, `/contracts/help`; public `/d/[token]`.

---

## 8. Operating principles (the through-line)

1. **One client, one inbox, one timeline** — every module hangs off the same lead record.
2. **Additive, never invasive** — modules own their tables and read the core; the WhatsApp inbox is sacred.
3. **Control-first AI** — AI advises and drafts; the human approves and clicks. Outbound messages are explicit.
4. **Non-destructive by default** — watermarks, culling, and trash never touch originals irreversibly.
5. **The premium feel is the product** — the client-facing surfaces (galleries, proposals, signing) are designed to sell on sight.
