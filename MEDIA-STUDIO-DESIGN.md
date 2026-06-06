# 📸 WappFlow Media Studio — Product & System Design

**A control-first creative production & delivery layer inside WappFlow.**
Competes with and surpasses Pixieset, Pic-Time, ShootProof, CloudSpot, SmugMug, Pixpa, Zenfolio.

> Design doctrine: **WappFlow = Business OS · Media Studio = Creative production + delivery layer · AI = assistive intelligence only (never autonomous).**

This document is grounded in the *actual* WappFlow codebase (`backend/server.js`, `backend/ai-engine.js`, `wappflow-web` Next.js app, `src` React Native app), not a generic template. Every integration point references a table or module that already exists.

---

## 0. Grounded findings that shaped this design

These are facts read from the codebase; they change the design materially.

| # | Finding (from code) | Design consequence |
|---|---------------------|--------------------|
| 1 | `leads` is both the **client and the deal** — it carries `customer_name/phone/email`, `status` (pipeline stage), `estimated_value`, `assigned_to`, tags, `activity_timeline`. | Media Studio **Projects link to `lead_id`**. No second CRM, no duplicate contact store. The shoot lifecycle reuses lead status / pipeline. |
| 2 | File uploads use **local disk**: `multer.diskStorage` → `express.static('/uploads')` (`server.js:80–129`). | **The one hard pivot.** RAW/video/high-res/ZIP cannot live on the app server's disk. Net-new: object storage (Cloudflare R2 recommended) + CDN + presigned direct-to-bucket uploads. |
| 3 | The AI layer is **text-only**: `ai-engine.js` exposes `callLLM()` over a provider chain (Cerebras/Groq/OpenRouter/OpenAI/Anthropic) with functions like `analyzeLeadIntelligence`, `suggestReplies`, `rewriteMessage`. **No vision model.** | Image/video quality scoring is a **separate, new CV lane**. The existing text lane is reused only for *assistive copy* (titles, delivery messages, captions). |
| 4 | Control-first is **already the house style**: `suggestReplies` suggests but never sends; `workspace_ai_profile.auto_analyze` defaults to `0` (off); `audit_logs` already records actions. | The control-first doctrine is enforced with primitives that already ship — not a new philosophy bolted on. |
| 5 | Delivery + automation rails exist: `outbound_message_queue` + per-minute `node-cron` (`server.js:3053`) + `activity_timeline` + `messages` (WhatsApp via `whatsapp-web.js`) + `email_workflows`. | "Gallery ready → WhatsApp/email the client" reuses **100%** of existing rails. Media Studio enqueues; existing cron delivers. |
| 6 | Multi-tenancy is `workspace_id` on every table; RBAC via `DEFAULT_ROLE_PERMISSIONS` + `workspace_members.permissions` (JSON); gating via `workspace_plan.features/limits` (JSON) + web `PlanLock`. | Media Studio = a **plan feature flag** with new permission keys and scoped roles (second shooter, editor, retoucher). Reuses RBAC + billing wholesale. |
| 7 | DB is `better-sqlite3` (single file), but `pg` is **already a dependency**. Schema evolves via idempotent `CREATE TABLE IF NOT EXISTS` + `safeAlter()`. | New `ms_*` tables follow the exact convention (TEXT PKs, `workspace_id`, JSON-in-TEXT, `safeAlter` migrations). Flag: media-metadata scale + concurrency is the moment to consider the Postgres path. |
| 8 | Stack: Express 5 backend; **Next.js 16** web (note `wappflow-web/AGENTS.md` — newer/breaking Next, read its docs before coding) + Tailwind 3 + lucide + recharts + `@hello-pangea/dnd`; React Native 0.85 mobile (thin: 3 screens). | Reuse the web stack; `@hello-pangea/dnd` already powers kanban and will power the **album builder / gallery reorder**. The cinematic gallery UI is the main net-new front-end surface. |

---

## 1. Product architecture

### 1.1 System context

```
                         ┌─────────────────────────────────────────────┐
                         │                 WappFlow OS                  │
                         │  (existing — DO NOT DISTURB)                 │
                         │                                              │
   WhatsApp / Email ─────┤  CRM(leads) · Pipeline(status) · Messages    │
   Web (Next 16) ────────┤  Automation(cron+queue) · Invoices · Meetings│
   Mobile (RN) ──────────┤  RBAC(workspace_members) · Plans · AuditLog  │
                         │  AI text layer (callLLM) · Knowledge/Memory  │
                         └───────────────┬──────────────────────────────┘
                                         │  integrates via lead_id, queue,
                                         │  activity_timeline, audit_logs,
                                         │  permissions, plan features
                         ┌───────────────┴──────────────────────────────┐
                         │            MEDIA STUDIO (new module)          │
                         │                                              │
                         │  Projects → Library → Culling → Galleries →   │
                         │  Proofing → Delivery → Albums → Video         │
                         │                                              │
                         │  ── new infra ──                              │
                         │  Object storage (R2) + CDN                    │
                         │  Media worker (ingest/transcode/zip)          │
                         │  CV scoring lane (advisory only)              │
                         └──────────────────────────────────────────────┘
```

### 1.2 The three net-new infrastructure pieces

Everything else reuses WappFlow. These three are the only genuinely new infra:

1. **Object storage + CDN + presigned uploads.**
   - Bucket layout: `ws/{workspace_id}/proj/{project_id}/{asset_id}/{variant}.ext`.
   - Variants generated on ingest: `thumb` (≈400px), `web` (≈2048px, watermarkable), `original/high-res` (gated). RAW stored as `original`, never browser-served.
   - **Recommendation: Cloudflare R2** — S3-compatible, **zero egress fees** (decisive for a download-heavy product where Pixieset-style ZIP delivery would bankrupt you on S3 egress). Backblaze B2 is the budget alternative; S3 only if already committed.
   - Uploads go **browser → bucket directly** via presigned URLs. The Express server issues the signed URL and records metadata; it never proxies the bytes (today's `/uploads` proxy model would melt under a 60GB wedding).

2. **Media worker (async job runner).** A queue table `ms_jobs` (mirrors the proven `outbound_message_queue` pattern) processed by a worker. Jobs: `ingest` (read EXIF, checksum, make variants), `transcode` (video proxies), `score` (CV lane), `zip_export`, `watermark`. Can run in-process behind the same cron at MVP; split into a separate worker process when volume grows. **Keep it off the request path** so the existing API stays responsive.

3. **CV scoring lane (advisory).** A vision inference path — **completely separate from `callLLM`**. See §6. Produces numbers into `ms_asset_scores`; it has **no write access** to human-decision or publish tables.

### 1.3 Module boundary (the contract with WappFlow)

Media Studio **reads/links**: `leads`, `tags`/`lead_tags`, `workspace_members`, `workspace_role_permissions`, `workspace_plan`, `workspace_ai_profile`, `company_settings` (branding/currency).
Media Studio **writes to existing tables only via additive, intended seams**: `activity_timeline` (events), `outbound_message_queue` (client comms), `audit_logs` (control trail), `invoices`/`meetings` (optional booking/payment). It **never alters** core CRM/messaging logic — it appends rows the existing systems already understand.
Media Studio **owns** the new `ms_*` namespace exclusively.

> Routing: mount the module under `app.use('/api/media', mediaRouter)` in `server.js` and a `wappflow-web/src/app/studio/*` route group. The 249KB monolith is not refactored; Media Studio is bolted on as a router + a web route group. **Core WappFlow files are not modified beyond one `app.use` line and additive migrations.**

---

## 2. Feature breakdown by module

Each module lists: **purpose · reuses · net-new · AI boundary.**

### 2.1 Project System (shoot backbone)
- **Purpose:** A shoot/project (wedding, event, real estate, commercial, portrait, product) is the container for all media + workflows, linked to a CRM client.
- **Reuses:** `leads` as the client (`lead_id` FK); `leads.status` *or* a project lifecycle that mirrors the pipeline; `tags`; `assigned_to`/`workspace_members` for crew; `meetings`/`invoices` for booking & payment already present.
- **Net-new:** `ms_projects`, `ms_folders`.
- **AI boundary:** none. Pure human structure.

### 2.2 Media Library
- **Purpose:** Bulk upload photos + videos, folder/shoot organization, RAW + JPG, **manual tagging first-class**.
- **Reuses:** tag vocabulary concept; `activity_timeline` for "120 photos uploaded".
- **Net-new:** `ms_assets`, presigned ingest, variant generation, EXIF/capture-time/checksum, `ms_jobs(ingest)`.
- **AI boundary:** **none here.** No auto-tagging that mutates data. (AI may *suggest* tags later as dismissible chips — never apply.)

### 2.3 Culling Workspace (control-first core)
- **Purpose:** Side-by-side compare, keep/reject, 0–5 star rating, color labels, duplicate grouping, zoom/loupe inspection.
- **Reuses:** keyboard-driven UX patterns; audit trail.
- **Net-new:** `ms_cull_decisions` (the **human** decision store), compare/loupe UI, perceptual-hash duplicate grouping.
- **AI boundary (advisory ONLY):** sharpness (Laplacian/Tenengrad variance), exposure (histogram clipping), blur, duplicate-group suggestion, face/eyes-open detection. Results render as **sortable/filterable badges and an optional "AI suggests keep/reject" overlay**. AI **cannot** write `ms_cull_decisions`. The photographer presses the key; the human row is created.

### 2.4 Gallery System (Pixieset + Pic-Time level)
- **Purpose:** Public / private / password-protected / client-portal galleries; multiple galleries per shoot; client favorites, comments, selective download; mobile-first cinematic browsing. Photographer controls reorder, visibility, gallery versioning.
- **Reuses:** `@hello-pangea/dnd` for reorder; `company_settings` for branding; `workspace_plan` to gate gallery count.
- **Net-new:** `ms_galleries`, `ms_gallery_assets`, `ms_gallery_access`, `ms_client_favorites`, `ms_client_comments`; public client portal (no-login, tokenized).
- **AI boundary (optional, opt-in):** "suggest a highlight set" → produces a **pre-selection the photographer must accept** before it becomes a gallery. Never auto-creates or auto-publishes a gallery.

### 2.5 Proofing System (ShootProof-level)
- **Purpose:** Client selection workflow ("pick your 40"), approve/reject, revision cycles, per-image status tracking.
- **Reuses:** `outbound_message_queue` to notify the client per round; `activity_timeline` for status history.
- **Net-new:** `ms_proofing_sets`, `ms_proofing_items` (per-asset client decision + revision round).
- **AI boundary:** none on the client's decisions. AI may *summarize* "client favorited 38, commented on 6" for the photographer — read-only insight.

### 2.6 Delivery System (core differentiator)
- **Purpose:** Downloadable sets (web / high-res), ZIP export, watermark control, selective downloads, **delivery packages** (bundled outputs), expiring links.
- **Reuses:** `outbound_message_queue` + `messages` to deliver via **WhatsApp** (the unfair advantage — see §9) and `email_workflows` for email; `invoices` to gate delivery on payment if desired; `audit_logs` for "client X downloaded high-res at T".
- **Net-new:** `ms_delivery_packages`, `ms_jobs(zip_export | watermark)`, signed time-limited download URLs.
- **AI boundary:** none. Delivery is always a human "Send" action.

### 2.7 Album System
- **Purpose:** Drag-&-drop album builder, page templates, manual layout control, print-ready **PDF export**.
- **Reuses:** `@hello-pangea/dnd`; existing PDF tooling pattern (backend already uses `pdf-parse`; export adds a PDF *writer*).
- **Net-new:** `ms_albums`, `ms_album_pages` (slots/layout JSON), spread renderer.
- **AI boundary (optional):** layout *suggestions* only — proposed spreads the user can accept, tweak, or ignore. No auto-built albums.

### 2.8 Video System
- **Purpose:** Video upload + organization, clip viewer, **manual selection timeline** editor.
- **Reuses:** `ms_assets` (type=video), `ms_jobs(transcode)` for web proxies.
- **Net-new:** `ms_video_clips` (in/out points, labels), timeline UI.
- **AI boundary (advisory ONLY):** clip scoring — shake/motion/face/quality — surfaced as markers on the timeline. **No auto-reel generation.** The editor sets in/out points; AI only highlights candidate moments.

### 2.9 AI Assistance Layer
Cross-cutting; fully specified in **§6**. Two lanes (CV-advisory + text-assistive), hard-walled from all decision/publish tables, opt-in, fully audited.

---

## 3. Workflow diagrams (text form)

### 3.1 Ingest pipeline (browser → bucket → metadata → variants → scores)
```
Photographer selects 800 files
   │
   ├─ web requests presigned PUT URLs (batch)            [Express /api/media/ingest/sign]
   ├─ browser uploads directly to R2 (parallel, resumable)   [bytes never touch app server]
   ├─ on each completion → POST metadata                 [creates ms_assets row, status=ingesting]
   │
   └─ ms_jobs(ingest) per asset  ──► worker:
            read EXIF + capture_time + checksum
            generate thumb / web / (high-res ref)
            enqueue ms_jobs(score)  ──► CV lane ──► ms_asset_scores   (ADVISORY)
            set ms_assets.status = ready
   │
   └─ activity_timeline: "800 photos added to <project>"   (feeds CRM lead timeline)
```

### 3.2 Culling (control-first)
```
Grid/Compare/Loupe view
   badges from ms_asset_scores  (sharpness, exposure, dup-group, faces)   ◄── AI: advisory
   photographer presses  P(keep) / X(reject) / 1–5(stars) / color
        │
        └─► ms_cull_decisions  (HUMAN row; AI has no write path here)
   filter: "show AI-flagged blur"  → human reviews → human decides
```

### 3.3 Gallery publish + deliver
```
Select assets (from keeps) → ms_gallery_assets (ordered, visibility set by photographer)
   set visibility: public | private | password | client-portal
   set policy: watermark on web? downloads allowed? high-res gated?
        │
   PUBLISH (human action; logged to audit_logs)  → ms_galleries.status=published, version++
        │
   "Notify client" (human clicks)
        └─► outbound_message_queue (WhatsApp + email)   ◄── existing cron delivers
        └─► activity_timeline + CRM lead updated
   Client opens tokenized link → ms_gallery_access session
        favorites → ms_client_favorites ;  comments → ms_client_comments
        downloads → ms_jobs(zip_export) → signed URL ; audit_logs("downloaded")
```

### 3.4 Proofing / selection + revision cycles
```
Photographer creates selection set: quota=40, due=+7d  → ms_proofing_sets
   notify client (queue) → client picks in portal → ms_proofing_items(approve/reject)
   client submits round 1 → status=submitted → notify photographer
   photographer requests changes → revision_round++ → notify client (queue)
   ... loop until status=approved → flows into Album/Delivery
```

### 3.5 Automation hooks (reusing the existing engine)
```
Media Studio EVENT            →  writes                    →  existing engine reacts
─────────────────────────────────────────────────────────────────────────────────
gallery.published             →  outbound_message_queue    →  cron sends WhatsApp/email
client.favorited_complete     →  activity_timeline         →  lead timeline / notify owner
selection.approved            →  outbound_message_queue     →  "thanks + next steps"
delivery.downloaded           →  audit_logs + timeline      →  trigger invoice reminder
project.delivered             →  (optional) leads.status     →  pipeline → "Delivered"
```
No new automation engine. Media Studio is a **producer of events** the existing per-minute cron + queue already consume.

---

## 4. Data model overview

**Conventions matched:** TEXT primary keys, `workspace_id TEXT NOT NULL` on every owned table, JSON stored as TEXT, timestamps `DEFAULT CURRENT_TIMESTAMP`, additive `safeAlter()` migrations, `better-sqlite3` today (Postgres-ready).

### 4.1 Reused (no schema change)
`leads` (client + deal), `tags`/`lead_tags`, `workspace_members` + `workspace_role_permissions` (RBAC), `workspace_plan` (gating), `workspace_ai_profile` (tone/opt-in), `company_settings` (branding/currency), `activity_timeline`, `outbound_message_queue`, `messages`, `email_workflows`/`email_templates`, `audit_logs`, `invoices`, `meetings`.

### 4.2 New `ms_*` tables (column sketches)

```sql
-- Project backbone: links a shoot to a CRM client (lead)
ms_projects(
  id TEXT PK, workspace_id TEXT NOT NULL,
  lead_id TEXT,                         -- FK leads(id) — the client. No second CRM.
  title TEXT, project_type TEXT,        -- wedding|event|real_estate|commercial|portrait|product
  shoot_date TEXT, location TEXT,
  status TEXT DEFAULT 'planning',       -- mirrors pipeline lifecycle
  cover_asset_id TEXT, settings TEXT,   -- JSON
  created_by TEXT, created_at TS )

ms_folders( id PK, workspace_id, project_id, parent_id, name, sort_order )

-- Core media row (one per photo/video/raw)
ms_assets(
  id TEXT PK, workspace_id, project_id, folder_id,
  type TEXT,                            -- photo|video|raw
  storage_key TEXT, filename TEXT, mime TEXT, size_bytes INTEGER,
  width INTEGER, height INTEGER, duration_ms INTEGER,
  capture_time TS, camera_meta TEXT,    -- JSON EXIF
  checksum TEXT, phash TEXT,            -- perceptual hash for dedup
  variants TEXT,                        -- JSON { thumb, web, original keys }
  status TEXT DEFAULT 'ingesting',
  uploaded_by TEXT, created_at TS )

-- AI advisory scores — SEPARATE from assets so AI never mutates the asset row
ms_asset_scores(
  id PK, asset_id, workspace_id,
  score_type TEXT,                      -- sharpness|exposure|blur|aesthetic|face|eyes_open|duplicate_group|clip_quality
  value REAL, group_key TEXT,           -- dup-group id when applicable
  model_version TEXT, source TEXT DEFAULT 'ai', created_at TS )

-- HUMAN cull decisions — AI has NO write path here
ms_cull_decisions(
  id PK, asset_id, project_id, user_id,
  decision TEXT,                        -- keep|reject|maybe
  rating INTEGER, color_label TEXT, flagged INTEGER,
  decided_at TS )

ms_galleries(
  id PK, workspace_id, project_id, lead_id,
  title TEXT, slug TEXT, visibility TEXT,   -- public|private|password|client_portal
  password_hash TEXT, status TEXT DEFAULT 'draft', version INTEGER DEFAULT 1,
  settings TEXT,                        -- JSON: watermark, download_policy, layout_theme, branding
  expires_at TS, published_at TS, created_by TEXT, created_at TS )

ms_gallery_assets( gallery_id, asset_id, sort_order, is_hidden, variant_policy,
                   PRIMARY KEY(gallery_id, asset_id) )
ms_gallery_access( id PK, gallery_id, lead_id, email, access_token UNIQUE, last_viewed_at TS )
ms_client_favorites( id PK, gallery_id, asset_id, contact_identifier, created_at TS )
ms_client_comments( id PK, gallery_id, asset_id, contact_identifier, body, created_at TS )

ms_proofing_sets( id PK, workspace_id, project_id, gallery_id, lead_id,
                  type TEXT,            -- selection|approval
                  quota INTEGER, status TEXT, revision_round INTEGER DEFAULT 1, due_at TS, created_at TS )
ms_proofing_items( id PK, set_id, asset_id, client_decision TEXT, revision_round INTEGER, status TEXT, decided_at TS )

ms_albums( id PK, workspace_id, project_id, title, spec TEXT, status TEXT, created_at TS )  -- spec JSON: size/bleed
ms_album_pages( id PK, album_id, page_no, layout_template TEXT, slots TEXT )                 -- slots JSON: asset placements

ms_delivery_packages( id PK, workspace_id, project_id, lead_id, gallery_id,
                      name TEXT, contents TEXT,    -- JSON: sets/variants
                      download_policy TEXT, watermark INTEGER, status TEXT, expires_at TS, created_at TS )

ms_video_clips( id PK, asset_id, in_ms INTEGER, out_ms INTEGER, label TEXT, selected_by TEXT, sort_order )

-- Async media work (mirrors outbound_message_queue)
ms_jobs( id PK, workspace_id, type TEXT,         -- ingest|transcode|score|zip_export|watermark
         asset_id, project_id, status TEXT DEFAULT 'pending',
         progress INTEGER DEFAULT 0, payload TEXT, error_message TEXT,
         retry_count INTEGER DEFAULT 0, created_at TS, next_retry_at TS, finished_at TS )
```

**Storage limits** ride on the existing `workspace_plan.limits` JSON (e.g. `{ "storage_gb": 100, "active_galleries": 25 }`), enforced the same way `PlanLock` already gates features.

---

## 5. UX flows

### 5.1 Photographer journey (one OS, no app-switching)
```
Lead books (existing CRM) ─► create Media Studio Project off the lead ─► (meeting/invoice already in WappFlow)
   ─► Ingest shoot (drag 800 files, direct-to-bucket)
   ─► Cull (compare/loupe; AI badges advise; human keys decide)
   ─► Build Gallery (reorder, brand, set watermark/download policy)
   ─► PUBLISH ─► "Notify client on WhatsApp" (one click; reuses messaging)
   ─► Proofing round(s) if selection shoot
   ─► Deliver package (web + high-res ZIP, expiring link)
   ─► Invoice/payment status already tracked in WappFlow ─► pipeline → Delivered
```
Single context, single client record, single inbox. That continuity is the product.

### 5.2 Client journey (frictionless, WhatsApp-native)
```
Receives WhatsApp: "Your wedding gallery is ready 💍 <link>"
   ─► Opens tokenized portal (no account) on phone ─► cinematic full-bleed browsing
   ─► Hearts favorites ─► comments ─► (selection shoot) picks 40 ─► submits
   ─► Downloads selected / full set ─► (optional Phase 3) orders prints
   ─► Every action flows back to the photographer's CRM timeline
```

### 5.3 Crew journey (second shooter / editor / retoucher)
```
Invited as workspace_member with a scoped Media Studio role
   editor: cull + gallery build, no delivery/publish
   retoucher: see assigned project, upload finals, no client comms
   second_shooter: upload only
Roles = new permission keys in DEFAULT_ROLE_PERMISSIONS; enforced by existing middleware.
```

---

## 6. AI role definition (strict, control-first)

### 6.1 Two lanes, hard-walled
**Lane A — CV/vision (NEW, advisory):** sharpness, exposure, blur, aesthetic, face/eyes-open, perceptual-hash duplicate grouping, video clip quality (shake/motion/face). Runs in the media worker (`ms_jobs.type='score'`). **Writes only to `ms_asset_scores`.**

**Lane B — Text (REUSE `callLLM`):** drafts gallery titles, delivery/WhatsApp/email copy, captions, alt-text, client-favorite summaries. **Writes only to draft/editable fields** that require a human Send/Publish — exactly like the existing `suggestReplies`.

### 6.2 Hard guardrails (enforced in code, not just policy)
- **No write path to decisions or publishing.** AI can write `ms_asset_scores` and draft text. It **cannot** write `ms_cull_decisions`, set `ms_gallery_assets`, flip `ms_galleries.status='published'`, or `ms_delivery_packages.status='sent'`. Those are human-only actions behind role-gated endpoints. The separation is *structural* (different tables, different endpoints), so "AI auto-delivers" has no code path to exist.
- **Everything is audited.** Each suggestion and each human accept/override writes `audit_logs` (`entity_type='ms_ai_suggestion'`), reusing the table that already exists.
- **Opt-in, off by default.** Extends the `workspace_ai_profile.auto_analyze=0` precedent. AI assistance is a toggle; the product is fully usable with it off.
- **Suggest, never apply.** Highlights/groupings/copy appear as dismissible overlays, sort orders, and editable drafts — never as committed state.

### 6.3 Explicitly forbidden (no implementation)
Auto gallery creation · auto album build · auto reel generation · auto-cull/auto-select finals · auto-edit · auto-deliver · overriding a human selection. These are absent by design — there is no endpoint for them.

> **Why this is credible here:** WappFlow's existing AI already *suggests replies a human sends* and *analyzes only when opted in*. Control-first isn't aspirational — it's the pattern the codebase already follows.

---

## 7. Competitor analysis & gap resolution

| Competitor | Signature strength | Media Studio coverage | WappFlow edge |
|---|---|---|---|
| **Pixieset** | Galleries + delivery + light CRM | §2.4 Galleries, §2.6 Delivery | CRM/pipeline/invoicing/WhatsApp **already native** — not a bolt-on |
| **Pic-Time** | Gallery experience + print store + marketing automation | §2.4, §2.7 Albums, P3 store, §3.5 automation | Marketing automation **reuses the real automation engine** + WhatsApp |
| **ShootProof** | Contracts + proofing + business workflow | §2.5 Proofing + revision cycles; invoices/meetings exist | Contracts/payment live in the same OS as delivery |
| **CloudSpot** | Modern UX + studio tools + AI culling | §2.3 Culling (advisory), §2.4 | AI is **control-first & audited**, not opaque auto-cull |
| **SmugMug** | Storage scale + reliability | §1.2 R2 + CDN + worker | Zero-egress storage → cheaper downloads at scale |
| **Pixpa / Zenfolio** | All-in-one website + galleries | §2.4 portals + branding | Unified with messaging/CRM; client portal over WhatsApp |

**Gap audit — no major competitor workflow is missing:**
client galleries ✅ · favorites/comments ✅ · selective + ZIP download ✅ · watermarks ✅ · password/private/portal ✅ · proofing + revisions ✅ · albums + print-ready PDF ✅ · print store (P3) ✅ · video + clip selection ✅ · culling + AI scoring (advisory) ✅ · branding/white-label (P2/P3) ✅ · storage scale ✅ · client comms (WhatsApp+email, **improved**) ✅ · contracts/invoicing/booking (**already in WappFlow**) ✅.
**Intentional improvement over all of them:** delivery and proofing happen over **WhatsApp inside a CRM**, not email inside a silo.

---

## 8. Roadmap

### MVP — "Pixieset core, unified" (validate the wedge)
Projects (lead-linked) · object-storage ingest + variants (R2) · Media Library · **basic Culling** (manual keep/reject/rate + AI **sharpness + duplicate** advisory) · Galleries (public/private/password + client favorites/comments/selective download) · Delivery (web + ZIP + watermark, expiring links) · **WhatsApp/email delivery via existing queue** · plan gating + RBAC roles · audit trail.
*Outcome:* a photographer can shoot → cull → publish → WhatsApp-deliver entirely inside WappFlow.

### Phase 2 — "Pro studio" (depth + differentiation)
Proofing/selection + revision cycles (ShootProof parity) · Album builder + **print-ready PDF** · advanced Culling (faces/eyes-open/aesthetic, compare view, color labels) · gallery themes/branding/white-label slug · Video upload + **manual clip selection** + clip scoring · **mobile cull/gallery** in the RN app · client-favorite AI summaries (read-only).

### Phase 3 — "Revenue + scale"
Print store + price lists + lab fulfillment + client print orders (Pic-Time/ShootProof revenue) · AI **album-layout suggestions** (human-approved) · advanced delivery analytics · white-label custom domains for portals · storage tiers/archival · optional Postgres migration for metadata scale.

---

## 9. Why this beats Pixieset + competitors combined

Every competitor is a **silo that bolts a thin CRM onto galleries and delivers over email.** WappFlow inverts it: it is **already the business OS** (CRM, pipeline, WhatsApp + multi-channel messaging, invoicing, meetings, automation, RBAC, plans, audit) — verified in the schema. Media Studio adds the *only missing layer*: media production + delivery. So the wedge is structural, not feature-by-feature:

1. **WhatsApp-native delivery & proofing.** "Your gallery is ready" arrives where clients actually read — WhatsApp — with replies landing in the same CRM thread. No competitor has this; they email into a void.
2. **One client record, end to end.** Booking → contract → shoot → cull → gallery → proof → deliver → invoice → repeat-business, all on the same `lead`. Competitors force a second CRM and manual reconciliation.
3. **Automation that already exists.** Drip follow-ups, delivery reminders, review requests reuse the live cron + queue — not a separate marketing tool.
4. **Control-first AI as a trust feature.** In a market nervous about "AI replacing the photographer," WappFlow's AI *demonstrably* only assists and is fully audited — a differentiator, not just a constraint.
5. **Unit economics.** Zero-egress storage (R2) + reused infra means delivery-heavy usage doesn't erode margin the way S3-egress would.

**Thesis:** competitors sell *galleries with a little business software attached.* WappFlow sells *a business OS with world-class galleries built in.* For a working photographer that difference is the whole job.

---

## 10. Open decisions & risks (need a human call)

| Decision | Options | Recommendation |
|---|---|---|
| Object storage vendor | Cloudflare R2 · Backblaze B2 · AWS S3 | **R2** (zero egress, S3-compatible) |
| Metadata DB at scale | Stay `better-sqlite3` · migrate to `pg` (already a dep) | SQLite for MVP; plan the `pg` cutover before heavy multi-user concurrency |
| CV inference location | On-device (browser WASM) for instant cull-assist · server worker · hybrid | **Hybrid**: fast on-device sharpness/blur in the cull UI + authoritative server scores in `ms_asset_scores` |
| Video transcode | ffmpeg in worker · managed (Mux/Cloudflare Stream) | Managed for P2 to avoid running a transcode farm |
| Watermark/ZIP cost | On-demand vs pre-generated | On-demand via `ms_jobs`, cached |

**Risk to manage:** the only place Media Studio touches WappFlow core is one `app.use` mount + additive `ms_*` migrations + appending rows to `activity_timeline`/`outbound_message_queue`/`audit_logs`. **No existing table is altered and no existing logic is modified** — honoring "do not disturb any core features of WappFlow."

---

*Grounded in: `backend/server.js` (schema, RBAC `DEFAULT_ROLE_PERMISSIONS`, cron `server.js:3053`, uploads `server.js:80–129`), `backend/ai-engine.js` (`callLLM` provider chain, text-only), `wappflow-web` (Next 16 + Tailwind + `@hello-pangea/dnd`), `src` (React Native).*
