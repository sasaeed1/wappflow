# WappFlow — Complete Feature & Architecture Reference

> The AI-native, self-hosted WhatsApp-first CRM — with a built-in creative production suite (Media Studio + Video Studio). One server, one database, your data.

This document covers **everything**: architecture, infrastructure, security, the data model, every CRM module, the Media Studio, the Video Studio, the AI layer, real-time, and the deployment/ops story.

---

## 1. Product, in one line
A unified inbox for **WhatsApp + Instagram + Facebook + Web**, an **AI sales brain** that scores, summarizes and drafts replies, a full **CRM** (leads, invoices, email, reminders, team), and — built on the same workspace — a **Media Studio** (cull → edit → galleries → delivery) and a **Video Studio** (timeline editor + AI reel drafts + per-platform MP4 export). Self-hosted, control-first AI.

---

## 2. Architecture

**Monorepo, two deployables:**
- **`backend/`** — Node.js + **Express 5** REST API (single process), port **3001**.
- **`wappflow-web/`** — **Next.js 16 (React 19, App Router, Turbopack)** front-end, port **3000**.

**Database:** **SQLite** via **better-sqlite3** (synchronous, single file `wappflow.db` in the data dir). One database, ~40 tables, all multi-tenant by `workspace_id`. (`pg` is present as a dependency but the live store is SQLite — "your data, your server.")

**Auth:** JWT (`jsonwebtoken`) bearer tokens + Google OAuth (`google-auth-library` / `@react-oauth/google`). Middleware injects `req.userId` / `req.workspaceId` / role + permissions on every request.

**Real-time:** Server-Sent Events at `/api/events` with a `broadcastToWorkspace()` fan-out — live message arrival, status changes, media-processing events, etc.

**Background work:** `node-cron` schedulers (per-minute + daily) drive reminders, the outbound message queue, IMAP polling, and maintenance. The Media/Video worker drains an `ms_jobs` queue.

**AI:** a provider-agnostic engine (`ai-engine.js`) with an automatic fallback chain across **OpenRouter → Cerebras → Groq → OpenAI → Anthropic** (first configured key wins; rate-limit-aware failover). JSON-extraction helpers make outputs structured and safe.

**Front-end stack:** Next.js + React, `axios` API client, `lucide-react` icons, `recharts` (analytics), `@hello-pangea/dnd` (drag-and-drop), inline styles + CSS variables for theming.

```
┌─────────────── Next.js 16 web (3000) ───────────────┐
│  CRM UI · Unified inbox · Studio (own shell, new tab)│
└───────────────┬─────────────────────────────────────┘
                │  REST (axios)  +  SSE (/api/events)
┌───────────────▼─────────── Express 5 API (3001) ─────┐
│  Auth · Leads · Inbox · AI · Email · Invoices · Team │
│  WhatsApp service (multi-account) · Webhooks (IG/FB) │
│  Media Studio (mounted) · Video Studio · Worker      │
└───────────────┬─────────────────────────────────────┘
        better-sqlite3 (wappflow.db)  ·  /uploads (disk)
        whatsapp-web.js (Chromium)    ·  ffmpeg/tfjs (Studio)
```

---

## 3. Infrastructure & deployment

- **Host:** Hetzner VPS, **Ubuntu 22.04**, self-hosted (no third-party SaaS for data).
- **Process manager:** **pm2** — `wappflow-api` (port 3001) + `wappflow-web` (port 3000), saved process list, log rotation (`pm2-logrotate`).
- **Transport:** HTTPS at `wappflow.remoteops.co`.
- **Storage:** local disk under `/uploads` (served statically); designed with a single **storage seam** to swap to object storage (Cloudflare R2) later.
- **System binaries used by Studio:** **FFmpeg + ffprobe** (video render/probe), open fonts (DejaVu/Liberation, for text overlays), optional **@tensorflow/tfjs-node + @vladmandic/face-api** (face/smile detection).
- **Deploy:** `git pull` → `npm install` (omit dev) → `next build` → `pm2 restart` → `pm2 save`. No auto-deploy; manual and deliberate.
- **WhatsApp runtime:** `whatsapp-web.js` drives a headless **Chromium** session per connected account (QR pairing, persisted auth).

---

## 4. Security, privacy & multi-tenancy
- **Multi-tenant by `workspace_id`** on every table and query.
- **RBAC:** workspace roles with a granular **`workspace_role_permissions`** matrix (9+ permissions: messaging, leads, settings, team, billing, etc.); round-robin lead assignment respects roles.
- **Hardening:** `helmet` security headers, `cors` (origin-locked to `FRONTEND_URL`), `express-rate-limit`, bcrypt password hashing (`bcryptjs`), JWT expiry.
- **Audit trail:** `audit_logs` records sensitive actions (who/what/when) across CRM and Studio.
- **Privacy posture:** self-hosted, HTTPS, no third-party data sharing; AI calls go only to the provider key you configure.

---

## 5. Data model (≈40 tables, all `workspace_id`-scoped)

**Identity & tenancy:** `users`, `workspaces`, `workspace_members`, `workspace_role_permissions`, `team_members`, `workspace_plan`, `workspace_integrations`, `workspace_ai_profile`.

**CRM core:** `leads`, `lead_channels`, `lead_relations`, `lead_tags`, `tags`, `notes`, `reminders`, `meetings`, `activity_timeline`, `contact_history`, `message_presets`.

**Messaging:** `messages`, `platform_accounts` (WhatsApp/IG/FB/Web channels), `outbound_message_queue`, `webhook_events`, `auto_reply_rules`, `whatsapp_groups`.

**Email:** `email_smtp_settings`, `email_imap_settings`, `lead_emails`, `email_templates`, `email_workflows`.

**AI & knowledge:** `ai_memories`, `knowledge_documents`, `workspace_ai_profile`.

**Internal chat:** `chat_channels`, `chat_messages`, `chat_reactions`.

**Finance:** `invoices`.

**Ops:** `company_settings`, `audit_logs`, `push_subscriptions`.

**Media Studio (`ms_*`, 20+ tables):** `ms_projects`, `ms_assets`, `ms_asset_scores`, `ms_cull_decisions`, `ms_galleries`, `ms_gallery_assets`, `ms_client_favorites`, `ms_client_comments`, `ms_proofing_sets`, `ms_proofing_selections`, `ms_albums`, `ms_album_pages`, `ms_exports`, `ms_jobs`, `ms_video_clips`, `ms_timelines`, `ms_video_exports`, `ms_audio_tracks`, `ms_luts`, `ms_video_templates`, plus audit.

---

# PART A — WappFlow CRM (Core)

## 6. Auth & onboarding
- Email/password **register + login**, password change, `auth/me` session.
- **Google OAuth** sign-in.
- **Workspace invitations** — invite by email, `invite-info` preview, `accept-invite` flow with role assignment.
- **SSO bridge** to the sibling **Flux** app (`/api/sso/flux-token`) — one identity across the product family.

## 7. Workspaces, team & roles
- Multiple **workspaces** per account; switchable.
- **Team management** — add/edit/remove members, assign roles.
- **Granular role-permission matrix** (`workspace/role-permissions`) — fine-grained control over who can message, edit leads, manage settings/team/billing.
- **Workspace settings**, plan, and integration config.

## 8. Unified inbox & omnichannel
One thread per lead, across every channel:
- **WhatsApp** — multi-account connect via QR (`whatsapp-web.js`), status, disconnect/reconnect, **sync missed messages**, send text + media, **WhatsApp Groups** (create/manage), and **ready-account** routing.
- **Instagram DM** — Messenger webhook ingestion (`/api/webhooks/instagram`).
- **Facebook Messenger** — webhook ingestion (`/api/webhooks/facebook`).
- **Website forms** — inbound web leads (`/api/website-form`) drop straight into the inbox.
- **`platform_accounts`** ties each channel to the workspace; `lead_channels` maps a lead's identities across platforms.
- **Real-time delivery** to the UI via SSE; **outbound message queue** for scheduled/bulk/throttled sending.
- **Auto-reply rules** — keyword/trigger-based automatic responses.
- **Web push notifications** (`web-push`, VAPID) for new messages.

## 9. Leads / CRM
- Full **lead CRUD**, rich detail view, search & filter.
- **Bulk operations** — bulk upload (CSV import), bulk-assign, **round-robin** distribution, bulk-trash.
- **Trash & restore** (soft delete) with a dedicated trash view.
- **Lead relations** — link related leads (referrals, family, company).
- **Tags** (CRUD + per-lead tagging), **message presets** (quick replies).
- **Notes** per lead, **reminders** (with an upcoming-reminders feed), **meetings**.
- **Activity timeline** + **contact history** — a unified, auditable record per lead (calls, messages, media delivered, status changes; Media Studio events mirror here too).

## 10. AI Sales Brain
Control-first AI woven through the inbox (all via the multi-provider engine):
- **Lead intelligence / scoring** — `analyzeLeadIntelligence` reads the conversation (+ AI memory) and scores intent/quality.
- **Sentiment detection** — per-message tone.
- **Conversation summarization** — instant thread recap.
- **3 ready-to-send reply suggestions** — `suggestReplies`, tuned by business name, presets, memory, and detected intent.
- **Message tools** — **rewrite** (tone), **translate** (any language), **shorten**.
- **Industry auto-detect** — infers the business's industry to tune AI behavior.
- **AI command / agent** (`/api/ai/command`) — natural-language actions over CRM data.
- **AI status** endpoint — which provider/keys are live.

## 11. AI memory & persona
- **Long-term AI memory** (`ai_memories`) — durable facts the assistant recalls across conversations (CRUD).
- **Workspace AI profile** (`workspace_ai_profile`) — the business's persona/voice/rules that shape every AI output.

## 12. Knowledge base (RAG-style grounding)
- **Document upload** — PDFs (`pdf-parse`) and Word docs (`mammoth`) are parsed into `knowledge_documents`.
- **Learn from messages** — turn past conversations into knowledge.
- AI replies and the command agent draw on this knowledge for grounded, on-brand answers.

## 13. Email (two-way)
- **Outbound SMTP** (`nodemailer`) — per-workspace SMTP settings with a **test-send** validator.
- **Inbound IMAP** (`imap` + `mailparser`) — poll a mailbox, parse messages, attach `lead_emails` to the right lead (email becomes a channel in the unified timeline).
- **Email templates** (CRUD) and **email workflows** (sequences/automation).

## 14. Invoices
- **Invoice CRUD** with line items and statuses.
- **PDF generation** (`pdfkit`) for client-ready invoices.

## 15. Internal team chat
- **Channels** (`chat_channels`), **messages**, and **reactions** — a built-in Slack-style space for the team, separate from client conversations.

## 16. Reminders, meetings & calendar integrations
- **Reminders** with an upcoming feed and completion.
- **Meetings** record.
- **Integrations:** **Calendly** link config + **Google Calendar** connect/disconnect (`/api/integrations/*`), integration status surface.

## 17. Analytics, reports & audit
- **Analytics** and a **reports overview** (funnels, volumes, response metrics) visualized with `recharts`.
- **Audit logs** view — full accountability trail.

## 18. Settings & branding
- **Company settings** + **logo upload**, **user profile** + **avatar**.
- **Plans/billing scaffolding** (`workspace_plan`, plan-info).
- **Help / Privacy / Terms** pages; **accept-invite** onboarding page.

---

# PART B — Media Studio (photography production & delivery)

A control-first creative platform built additively on the same workspace (Pixieset/Pic-Time/ShootProof class). **AI only suggests/scores; humans decide.** Opens as a separate module in its own tab via the app-switcher, with its own shell + three switchable themes.

## 19. Shoots, library & ingestion
- **Shoots (projects)** with type, date, location, **linked CRM client**; cinematic home (hero + stats + gallery-wall cards with derived covers).
- **Bulk upload** of photos/videos/audio; background worker generates **thumb/web/full** variants.
- **Library** with Small/Medium/Large grids **+ collage (masonry)**, full-screen **lightbox**, delete (single + bulk), and live client ♥/💬 counts.

## 20. On-device AI analysis (advisory)
- **Sharpness** (focus), **exposure** + shadow/highlight clipping, **composite quality** score, **duplicate detection** (perceptual hash). Optional **face/smile detection** (face-api). All advisory — surfaced as hints in `ms_asset_scores`.

## 21. Culling workspace
- Immersive dark canvas; **Keep / Maybe / Reject** + 1–5 stars; filters with counts; filmstrip with decision badges.
- **Scroll-wheel zoom** to true 100% + pan; **compare** (duplicate-group aware, "Keep this" rejects the rest).
- **Copy/paste edits** and full keyboard flow.

## 22. Non-destructive editing & presets
- Tone (exposure/contrast/warmth/tint/saturation), film finish (fade/vignette/grain/**B&W**), geometry (rotate/straighten/**drag-crop**), live preview; **AI auto-enhance** (explainable, sets sliders only).
- **24 film presets** previewed on the actual photo; apply to one or **all keepers** (batch). Edits flow into galleries, ZIPs and album PDFs automatically (originals untouched, re-rendered from source).

## 23. Galleries & client delivery
- **One-click gallery from keepers**; visibility **Private / Password / Public**; shareable signed link.
- **WhatsApp delivery** through the client's existing thread.
- **Client portal** (`/g/[token]`) — browse, **favorite**, **comment**; engagement surfaces back in Studio.

## 24. Proofing, albums & export
- **Proofing sets** with selection **quota** + **revision rounds**.
- **Album builder** (layout templates, reorder, autofill keepers) → **print-ready PDF**.
- **ZIP export** (original or watermarked-web), background job.

## 25. Studio Copilot
- Floating AI assistant on every Studio page, **grounded in real shoot data** (cull counts, quality ranks, galleries, proofing, comments). Answers questions and **suggests one-click actions** (open cull, build gallery, apply preset) — executes nothing itself.

## 26. Theming
- **Three full identities** — **Bold** (glass/gold/aurora, default), **Dark-pro** (dense/sharp/grain), **Airy** (light/editorial serif) — switchable and remembered across all Studio pages.

---

# PART C — Video Studio (Reels)

A creator-grade timeline editor + AI reel drafts + per-platform export, on the same shoots. Architecture: **one JSON timeline (EDL) drives both an in-browser preview and a server-side FFmpeg render.** Verified rendering real MP4s in production.

## 27. Reels & the editor
- **6 aspect ratios** (9:16, 1:1, 4:5, 16:9, 21:9, 3:2), one-click switching with platform **safe-area guides**.
- **Immersive editor** — media rail, preview stage with live player, multi-track timeline, inspector, autosave.
- **Timeline editing** — drag move/reorder, edge-handle **trim**, **split**, duplicate, delete, zoom; per-clip **speed (0.25–4×)**, **reverse**, **freeze-frame**; photo **Ken Burns** + **N-point motion keyframes**.

## 28. The compositor
- Clips are **composited onto a base canvas at absolute positions** (not concatenated): supports **gaps, overlapping clips, true alpha crossfades** (Fade/Dissolve), dip-to-black/white, and **opacity keyframes**.

## 29. Look, text, music
- **Color grade** per clip + **8 built-in cinematic LUTs** (generated `.cube`) + **custom `.cube` upload**.
- **Effects** — vignette, film grain, **glow**, blur, soft focus, letterbox, **light-leak**.
- **Text overlays** (FFmpeg drawtext) — 5 styles, 3 font families, size/color/align/position, **fade/slide** animation.
- **Music** — upload a licensed track, volume/fade/trim/mute, synced preview.

## 30. Templates & AI Reel Drafts
- **10 one-click reel templates** by category (Wedding, Real Estate, Restaurant, Travel, Corporate, Social, Fitness, Fashion, Product) — auto-fill from the shoot's media.
- **AI Reel Drafts** (control-first) — **6 styles** recommended by shoot type; selects + orders the best shots from CV scores + cull data (+ faces/smiles when enabled). **Refresh system** flags drafts stale on new uploads. AI drafts, you decide.

## 31. Export
- **MP4 / H.264**, **720p–4K**, **9 platform presets** (IG Reel, TikTok, YT Shorts, FB Reel, IG Feed, Square, YT 16:9, Website, Cinematic 21:9). Background render with live progress → inline preview + download.

---

# PART D — Platform layer

## 32. AI provider architecture
- Single `callLLM()` with a **5-provider fallback chain** (OpenRouter → Cerebras → Groq → OpenAI → Anthropic), rate-limit-aware. `extractJSON()` guarantees structured outputs. The same engine powers CRM replies, summaries, scoring, the AI command agent, and the Studio Copilot.

## 33. Real-time & notifications
- **SSE** (`/api/events`) for live inbox/Studio updates; **web push** for new messages; cron-driven reminders.

## 34. Linked sibling: Flux
- **Flux** (a separate "cinematic AI content engine" app) is linked from the Studio/CRM **app-switcher** and shares identity via **SSO** (`/api/sso/flux-token`). Separate product/repo — out of scope for this document beyond the integration point.

## 35. Testing & quality
- Media/Video Studio ship with **isolated integration suites** — **249 assertions across 10 suites** (studio, worker, galleries, cull, export, proofing, albums, video, edits, video-studio), all green. Graceful degradation everywhere (missing ffmpeg/fonts/face-api never crash the host).

---

# PART E — Status & roadmap

**Live & verified in production:** the entire CRM inbox/leads/AI surface, and the full Media + Video Studio (including end-to-end MP4 render and the grounded AI Copilot).

**Open / deliberate next steps:**
- **R2 (object storage) migration** — disk is the current bottleneck as shoots grow.
- **RAW preview** decoding.
- **Multi-track text/overlay** beyond the single text track; richer audio mixing.
- **Face/smile detector** is opt-in (installed) — re-score pass for older assets.
- Deeper reporting, billing/plans productization.

---

*Self-hosted. Control-first AI. One workspace from first WhatsApp message to delivered reel.*
