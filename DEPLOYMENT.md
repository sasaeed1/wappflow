# WappFlow CRM — Complete Deployment Guide

> A unified multi-platform customer-communication CRM with WhatsApp, Instagram, Facebook, and Website lead capture; per-lead conversations; AI lead intelligence; team workspaces; and an outbound message queue.
>
> This document is a single source of truth for product features, system architecture, environment variables, deployment options, and post-launch operations. Paste it into ChatGPT, give it to your DevOps engineer, or follow it yourself.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Complete Feature Inventory](#2-complete-feature-inventory)
3. [System Architecture](#3-system-architecture)
4. [Tech Stack](#4-tech-stack)
5. [Environment Variables](#5-environment-variables)
6. [Deployment Option A — Railway (recommended)](#6-deployment-option-a--railway-recommended)
7. [Deployment Option B — Single VPS (DigitalOcean / Hetzner / AWS Lightsail)](#7-deployment-option-b--single-vps-digitalocean--hetzner--aws-lightsail)
8. [Deployment Option C — Vercel (frontend) + Railway (backend)](#8-deployment-option-c--vercel-frontend--railway-backend)
9. [Deployment Option D — Docker Compose (self-host)](#9-deployment-option-d--docker-compose-self-host)
10. [Post-Deployment: First-Run Checklist](#10-post-deployment-first-run-checklist)
11. [Domain, SSL, and CORS](#11-domain-ssl-and-cors)
12. [Persistent Storage and Backups](#12-persistent-storage-and-backups)
13. [Monitoring, Logs, and Alerting](#13-monitoring-logs-and-alerting)
14. [Maintenance & Common Operations](#14-maintenance--common-operations)
15. [Troubleshooting Cheat Sheet](#15-troubleshooting-cheat-sheet)

---

## 1. Product Overview

**WappFlow** is a unified communication CRM aimed at SMBs (real-estate brokerages, agencies, support teams, edtech, e-commerce DM teams).

It is **two deployable services**:

| Service | Description | Port |
|---|---|---|
| **Backend API** (`backend/`) | Express.js REST + SSE server. Owns the SQLite database, all uploaded files, the WhatsApp Web automation, the email IMAP poller, the AI engine, and all cron jobs. | 3001 |
| **Web frontend** (`wappflow-web/`) | Next.js 16 app (App Router). Pure UI — calls the backend. | 3000 |

**Cardinality:** one backend (long-lived stateful process) and one frontend (stateless, scalable). The backend must be a **single instance** because WhatsApp Web sessions and the SQLite database live on disk.

---

## 2. Complete Feature Inventory

### 2.1 Identity, Auth, and Workspaces

- Email/password signup and login with bcrypt-hashed credentials and JWT sessions (7-day expiry).
- Google Sign-In (OAuth via `@react-oauth/google` + `google-auth-library` verification).
- Multi-tenant **workspaces** — one per organisation; every record (lead, message, tag, channel, plan, etc.) is workspace-scoped.
- **Team management**: invite by email, role-based access (`super_admin`, `admin`, `manager`, `user`), per-member custom permission overrides.
- **Per-workspace plan tiers** (`starter | growth | business | enterprise`) with feature flags and resource limits stored in `workspace_plan`.
- **Audit logs**: every team-management action recorded in `audit_logs`.

### 2.2 Lead Management

- Add leads manually, via CSV bulk-upload (`leads/bulk-upload`), or auto-created from incoming messages on any platform.
- Soft delete + restore (`is_deleted`, 90-day Trash retention).
- **Bulk operations**:
  - Assign to a team member.
  - **Round-robin** assignment across selected members.
  - **Move to Trash** (multi-select).
  - **Create WhatsApp Group** from selected leads (see 2.7).
  - Export to CSV.
- **Tags** with colour coding, multi-assign per lead, filter by tag.
- **Pipeline** with 6 statuses: `New → Contacted → Interested → Negotiating → Closed-Won/Lost`.
- **Custom fields**: name, phone, email, date of birth, address, lead source, estimated value, actual sale, lost reason.
- **Search + filters**: by name, phone, status, assignee, tags, platform, date range.

### 2.3 Multi-Platform Communications

- **Source platform** tracked per lead (`platform_source`: `whatsapp | instagram | facebook | website`).
- **Connected channels** (`lead_channels`): a lead can have multiple linked identities across platforms (e.g. one person reaches you on WhatsApp AND Instagram — link them, never auto-merge).
- **Platform tabs** above the chat box in the lead profile:
  - WhatsApp, Instagram, Facebook, Website — each with an unlock state, message count, and unread badge.
  - Tabs unlock when the platform is the lead's source, has any message, or appears in their `lead_channels`.
  - Switching tabs swaps the visible conversation; sending a message routes to that platform.
- **Per-account routing**: every WhatsApp account (`platform_accounts`) gets its own isolated Puppeteer session, nickname, and slot index. Messages stay bound to the account they came in on (`messages.platform_account_id`).
- **Account nicknames** ("Admissions Team", "Sales Team") — shown everywhere the platform chip renders.

### 2.4 WhatsApp Integration

- **Library**: `whatsapp-web.js` with `LocalAuth` and per-account `clientId`s.
- **Multi-number**: up to N WhatsApp accounts per workspace (plan-limited).
- **Sending**: text, voice notes, images, videos, documents.
- **Voice note pipeline**: browser records WebM/Opus → backend stores with the correct extension → sent to WhatsApp with the right MIME (`audio/webm; codecs=opus` or `audio/ogg; codecs=opus`).
- **Media pipeline**: all incoming media types (`ptt`/`audio`/`image`/`video`/`document`) downloaded and saved to `uploads/voices`, `uploads/images`, `uploads/videos`, `uploads/files`.
- **WhatsApp call deep-link** on the lead profile (`https://wa.me/{phone}`) — only shown for real phone numbers.
- **Group creation from CRM** (new): select leads → pick a connected WA account → enter name/description/icon → backend calls `client.createGroup`, sets the description, fetches the invite link, persists to `whatsapp_groups`.
- **Reliability**:
  - Per-account **heartbeat** (`client.getState()` every 60 s, 8 s timeout).
  - **Auto-reconnect** on unexpected disconnect with exponential backoff (10 s, 30 s, 90 s, max 3 attempts).
  - Manual `disconnect()` sets `userLoggedOut` so reconnect doesn't loop.
- **Catch-up sync**: missed-message import on reconnect (rate-limited per lead to prevent Puppeteer thrashing).

### 2.5 Instagram, Facebook, Website

- Webhook handlers with **idempotency** (`webhook_events` table, UNIQUE constraint on `(platform, event_id)`).
- Async processing: webhooks acknowledge immediately, processing happens in `setImmediate` to keep Meta from retrying.
- Website widget (`wappflow-web/public/widget.js`) for embedding a chat trigger on any site.

### 2.6 Conversations and Chat UX

- **Per-lead chat** in the lead profile with:
  - Message grouping (consecutive messages from same sender within 2 min get tight spacing).
  - Date separators ("Today", "Yesterday", or full date).
  - **Jump-to-latest** pill when scrolled away from the bottom.
  - Smart auto-scroll (only scrolls if user is already near bottom).
  - Image lightbox with `onError` fallback to a file-chip if the URL 404s.
  - Voice note player (HTML5 `<audio>`).
  - File attachment chips with sanitised filenames.
- **Live updates** via Server-Sent Events (`/api/events`) — new messages, lead updates, and missed-sync events stream to all open clients.
- **Floating chat bar** (NavBar global): quick switch to any lead's WhatsApp without leaving the page you're on.

### 2.7 AI Engine (`backend/ai-engine.js`)

- **Provider abstraction** — Groq (default, free, `llama-3.1-8b-instant`), OpenAI, or Anthropic. Picked by `AI_PROVIDER` env var.
- **Lead intelligence** (`POST /api/leads/:id/ai/analyze`): single LLM call returns score (1-10), sentiment (positive/neutral/negative/frustrated), urgency (low/medium/high/critical), intent category, temperature, next recommended action, and key entities. Persisted to the lead row.
- **Visible badges**: dashboard cards and leads-list rows show `✨ 8/10 😊 high` chips automatically.
- **Auto-analyze**: if `workspace_ai_profile.auto_analyze = 1`, new leads are analysed 5 s after first message arrives.
- **Workspace AI Profile** (Settings → AI Command): business description, preferred tone, language, do's/don'ts, signature, auto-analyze toggle. Every AI prompt receives this context.
- **Inline conversation tools** (✨ AI dropdown on the chat composer):
  - Rewrite — professional / friendly / empathetic / casual / formal / concise.
  - Shorten.
  - Translate to any language.
- **Chat summary** (`/ai/summary`) — 2-3-sentence summary of the conversation.
- **Reply suggestions** (`/ai/reply-suggestions`) — 3 ready-to-send drafts. User must click "Use" to populate the composer (never auto-sends).
- **Workspace memory** (`ai_memories`) — extracted from uploaded knowledge documents, injected into every prompt as `Business Knowledge:`.
- **AI Safety**: no AI-generated content is ever auto-sent. Auto-analysis writes lead fields only.

### 2.8 Notes, Reminders, Timeline, History

- **Notes**: per-lead free text, timestamped.
- **Reminders**: per-lead with due date, push notification (VAPID), web notification, and a "complete" toggle.
- **Activity Timeline** (`activity_timeline`): unified feed showing messages, status changes, assignments, channel adds, relations, invoices — sortable, filterable.
- **Contact history** (`contact_history`): everything that happened to the lead, immutable, used for audit.

### 2.9 Invoices

- Create invoices per lead, multi-line items, custom tax rate, currency picker (USD/EUR/GBP/PKR/INR + symbol position).
- Invoice statuses: `draft | sent | paid`.
- Print preview (server-rendered HTML, opens in new window).
- Auto-numbering with configurable prefix.

### 2.10 Email

- **Outbound** (Settings → Email Sending): configurable SMTP server, test connection, send single emails per lead, **email templates** with variables, **email workflows** (scheduled sends).
- **Inbound** (Settings → Email Receiving): IMAP poller runs every 2 minutes, attaches incoming emails to matching leads by email address.

### 2.11 Auto-Reply Rules

- Keyword-matched auto-responses (`auto_reply_rules`), match type `exact | contains`, per workspace, only triggers on real user-configured rules — never AI-driven.

### 2.12 Knowledge Engine

- Upload documents (PDF, DOCX, TXT) to extract business knowledge.
- `mammoth` for DOCX, custom PDF parser, text extraction.
- AI extracts key/value memories, stores in `ai_memories`, injected into all AI prompts as workspace knowledge.

### 2.13 Internal Team Chat

- Workspace-wide channels (`chat_channels`, `chat_messages`, `chat_reactions`).
- Real-time via SSE.
- Media uploads, emoji reactions, channel admin.

### 2.14 Reports & Analytics

- Dashboard stat cards (Total / Conversion / New Today).
- Revenue insights (Won / Projected / Lost) with composition bar.
- Per-stage funnel chart (`recharts`).
- Activity feed, today's leads, upcoming reminders, live events.
- Reports page with date-range filters and per-period rollups.

### 2.15 Dark Mode + Design System

- CSS variables in `app/globals.css`: `--bg`, `--surface`, `--surface2`, `--border`, `--text`, `--text-muted`, `--text-dim`, `--accent`, `--warning-*`, `--danger-*`.
- Default theme: dark. `html.light` class overrides for light mode (theme picker in Settings → Appearance).
- All pages, modals, tabs, inputs, dropdowns, and toast notifications adapt automatically.

### 2.16 Responsive Layouts

- Lead profile: 3-column at >1180px (sidebar / chat / tabs), 2-column at 760-1180px (tabs collapse under chat), 1-column on mobile (everything stacks, chat becomes 60vh).
- Dashboard grid: 3-col → 2-col below 900px → 1-col below 540px.
- NavBar: full horizontal on desktop, hamburger drawer on mobile.

### 2.17 Real-Time Events (SSE)

`GET /api/events?token={jwt}` streams per-user events:

| Event | Triggered by |
|---|---|
| `new_message` | Incoming WhatsApp/Instagram/Facebook/Website message |
| `lead_created` | Any incoming first message or manual create |
| `lead_updated` | Status change, AI analysis, edits |
| `lead_deleted` | Soft-delete or bulk-trash |
| `missed_sync_complete` | Catch-up sync finished after a WhatsApp reconnect |

### 2.18 Outbound Message Queue

- `outbound_message_queue` table: queued sends with exponential-backoff retry, max 3 retries per item.
- Background processor runs every 30 s (`processMessageQueue`), silent on failure (queue errors never crash the server).
- Manual retry endpoint: `POST /api/message-queue/:id/retry`.

### 2.19 Plans, Limits, and Billing-Aware Middleware

- `requireFeature(name)` middleware returns HTTP 402 (Payment Required) when a feature is gated.
- `checkPlatformLimit(workspaceId, platform)` enforces per-plan platform account counts.
- Plan structure stored in `PLAN_DEFAULTS` constant: `starter | growth | business | enterprise`, each with own feature set and limits.

### 2.20 Notifications

- Web push (VAPID) for reminders.
- In-app notification bell with unread badge.
- Reminder cron — checks every minute, fires push at the due time.

### 2.21 Internationalisation Hooks

- Currency picker with symbol + position.
- Language field in workspace AI profile — AI replies in the configured language.
- Date formatting via `toLocaleDateString` (respects user locale).

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (any device)                                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js frontend (wappflow-web/)                           │
│  - App Router pages: /dashboard /leads-list /leads/[id] etc │
│  - Calls backend over REST + SSE                            │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS (CORS-enabled)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend API (backend/server.js)                            │
│  - Express + helmet + rate-limit + CORS                     │
│  - REST routes + SSE stream (/api/events)                   │
│  - Static /uploads (CORP=cross-origin)                      │
│  - Auth: JWT (HS256, 7-day)                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ WhatsAppManager → N × WhatsAppService (Puppeteer)   │    │
│  │ Email Poller (cron, every 2 min)                    │    │
│  │ Reminder Cron (every minute → web-push)             │    │
│  │ Trash Cleanup (daily)                               │    │
│  │ Outbound Queue Processor (every 30 s)               │    │
│  │ AI Engine (ai-engine.js → Groq/OpenAI/Anthropic)    │    │
│  └─────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
  ┌──────────────────┐         ┌────────────────────────┐
  │ SQLite DB        │         │ Filesystem             │
  │ wappflow.db      │         │ uploads/voices         │
  │ (WAL mode)       │         │ uploads/images         │
  │                  │         │ uploads/videos         │
  │                  │         │ uploads/files          │
  │                  │         │ .wwebjs_auth/session-* │
  └──────────────────┘         └────────────────────────┘
            │
            ▼ Outbound only
  ┌─────────────────────────┐
  │ External services:      │
  │ • Groq / OpenAI / Anth. │
  │ • WhatsApp Web (browser)│
  │ • SMTP (Gmail, SES…)    │
  │ • Meta Graph (IG/FB)    │
  │ • Google OAuth          │
  └─────────────────────────┘
```

---

## 4. Tech Stack

**Backend** (`backend/`):
- Runtime: **Node.js 20+** (tested on 20 and 24).
- Framework: **Express 5**.
- Database: **SQLite 3** via `better-sqlite3` (WAL mode, synchronous, single-file).
- Auth: `bcryptjs` + `jsonwebtoken` (HS256).
- WhatsApp: `whatsapp-web.js` (Puppeteer/Chromium-based).
- Email: `nodemailer` (SMTP), `imap` + `mailparser` (IMAP).
- Cron: `node-cron`.
- Push: `web-push` (VAPID).
- Document parsing: `mammoth` (DOCX), built-in PDF text extraction.
- Security: `helmet` (CSP off, CORP cross-origin for `/uploads`), `express-rate-limit`.

**Frontend** (`wappflow-web/`):
- **Next.js 16** (App Router, Turbopack).
- **React 19**.
- HTTP: `axios`.
- Drag/drop: `@hello-pangea/dnd`.
- Charts: `recharts`.
- Icons: `lucide-react`.
- Styling: Tailwind 3 utility classes + inline-style CSS variables. No CSS-in-JS library; theme handled via `:root` and `html.light` overrides.

---

## 5. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | ❌ | `3001` | HTTP port to bind. |
| `NODE_ENV` | ✅ in prod | `development` | `production` switches data dir to `/data`, enables file-based session storage. |
| `JWT_SECRET` | ✅ | `change-me` | HS256 secret. **Generate a long random string** (`openssl rand -hex 64`). |
| `FRONTEND_URL` | ✅ in prod | `*` | Allowed CORS origin. Set to your full frontend URL, e.g. `https://app.example.com`. Use `*` only for dev. |
| `BASE_URL` | optional | `http://localhost:3001` | Used in invite emails and absolute URLs in webhook payloads. |
| `GROQ_API_KEY` | ✅ for AI | — | Free tier at https://console.groq.com. Default AI provider. |
| `GROQ_MODEL` | ❌ | `llama-3.1-8b-instant` | Override Groq model. |
| `AI_PROVIDER` | ❌ | `groq` | One of `groq | openai | anthropic`. |
| `OPENAI_API_KEY` | optional | — | If `AI_PROVIDER=openai`. |
| `OPENAI_MODEL` | ❌ | `gpt-4o-mini` | OpenAI model override. |
| `ANTHROPIC_API_KEY` | optional | — | If `AI_PROVIDER=anthropic`. |
| `ANTHROPIC_MODEL` | ❌ | `claude-haiku-4-5-20251001` | Anthropic model override. |
| `VAPID_PUBLIC_KEY` | optional | (dev key embedded) | Web push public key. **Generate your own in prod:** `npx web-push generate-vapid-keys`. |
| `VAPID_PRIVATE_KEY` | optional | (dev key embedded) | Web push private key. |
| `GOOGLE_CLIENT_ID` | optional | — | Google OAuth client ID — enables "Sign in with Google". |
| `PUPPETEER_SKIP_DOWNLOAD` | ❌ | — | Set `true` if Chromium is already installed (e.g. on Railway/Docker images). |

### Frontend (`wappflow-web/.env.local`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | `http://localhost:3001/api` | Full base URL for API calls. Include `/api`. |
| `NEXT_PUBLIC_BASE_URL` | ✅ | `http://localhost:3001` | Same host without `/api` — used for `<img>` sources to load `/uploads/*` directly. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | optional | — | Mirror of `GOOGLE_CLIENT_ID` so the frontend can render the Google button. |

---

## 6. Deployment Option A — Railway (recommended)

Railway gives you a persistent volume (needed for SQLite and WhatsApp sessions), simple env-var management, automatic HTTPS, and zero-config Node deploys. Total cost: ~$5–10/month for low traffic.

### 6.1 Create a Railway project

1. Sign up at https://railway.app and connect your GitHub.
2. Push the repo to GitHub if you haven't already.
3. **New Project → Deploy from GitHub repo → select your fork**.

### 6.2 Backend service

1. **Add a service** → **GitHub repo** → set root directory to `backend`.
2. **Settings → Build** — Railway auto-detects Node; no config needed.
3. **Settings → Start Command**: `node server.js`
4. **Settings → Volumes** → **Create new volume** → mount at `/data` (1 GB is plenty to start).
5. **Variables** — paste these:
   ```
   NODE_ENV=production
   PORT=3001
   JWT_SECRET=<paste output of: openssl rand -hex 64>
   FRONTEND_URL=https://<your-frontend-url>.up.railway.app
   GROQ_API_KEY=<your groq key>
   VAPID_PUBLIC_KEY=<generated>
   VAPID_PRIVATE_KEY=<generated>
   GOOGLE_CLIENT_ID=<optional>
   ```
6. **Settings → Networking → Generate Domain** — note the URL.

### 6.3 Frontend service

1. **Add another service** → same GitHub repo → root directory `wappflow-web`.
2. **Settings → Start Command**: `npm run start`
3. **Settings → Build Command**: `npm run build`
4. **Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://<backend-domain>/api
   NEXT_PUBLIC_BASE_URL=https://<backend-domain>
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=<optional>
   ```
5. **Settings → Networking → Generate Domain**.

### 6.4 Wire frontend ↔ backend

Go back to the backend service variables and **set `FRONTEND_URL` to the frontend's full URL**. Redeploy.

### 6.5 First boot

The backend will auto-run all migrations on first boot. Watch the deploy logs for `✅ Database schema ready`.

---

## 7. Deployment Option B — Single VPS (DigitalOcean / Hetzner / AWS Lightsail)

For one server hosting both services. Cheapest option (~$6/month Hetzner CX22). Requires more setup.

### 7.1 Provision the VPS

- **Recommended specs**: 2 vCPU, 2 GB RAM, 40 GB SSD, Ubuntu 22.04 LTS.
- WhatsApp Web (Chromium under Puppeteer) wants ~500 MB per active session, so size for `(#wa accounts × 500 MB) + 1 GB headroom`.

### 7.2 System dependencies

```bash
ssh root@<your-ip>
apt update && apt upgrade -y
apt install -y curl git build-essential nginx ufw

# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Chromium dependencies (whatsapp-web.js needs these)
apt install -y chromium-browser libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libgbm1 libgtk-3-0 libxshmfence1 libasound2

# ffmpeg — REQUIRED for voice notes. Browsers record webm/opus, which WhatsApp
# Web rejects outright (InvalidMediaCheckRepairFailedType); ffmpeg transcodes it
# to ogg/opus. Without ffmpeg, every voice-note send fails.
apt install -y ffmpeg

# PM2 for process management
npm install -g pm2

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

### 7.3 Deploy the code

```bash
adduser --disabled-password --gecos "" wappflow
su - wappflow

git clone https://github.com/<you>/wappflow.git
cd wappflow

# Backend
cd backend
npm ci --omit=dev
mkdir -p data uploads/voices uploads/images uploads/videos uploads/files uploads/logos uploads/avatars
cp .env.example .env
nano .env   # paste your real values

# Frontend
cd ../wappflow-web
npm ci
cp .env.local.example .env.local 2>/dev/null || nano .env.local
npm run build
```

### 7.4 Run with PM2

```bash
cd ~/wappflow
pm2 start backend/server.js --name wappflow-api -- --update-env
pm2 start "npm --prefix wappflow-web run start" --name wappflow-web

pm2 save
pm2 startup systemd -u wappflow --hp /home/wappflow
# Run the printed command as root, e.g.
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u wappflow --hp /home/wappflow
```

### 7.5 Nginx reverse proxy

`/etc/nginx/sites-available/wappflow`:

```nginx
# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;

    client_max_body_size 16M;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE needs these
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}

# Frontend
server {
    listen 80;
    server_name app.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
ln -s /etc/nginx/sites-available/wappflow /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 7.6 HTTPS with Let's Encrypt

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d api.yourdomain.com -d app.yourdomain.com --agree-tos --email you@yourdomain.com -n
```

Auto-renewal is installed as a systemd timer; nothing else to do.

---

## 8. Deployment Option C — Vercel (frontend) + Railway (backend)

Same as Option A but the frontend goes on Vercel instead of Railway. Marginally faster for frontend (Vercel's edge), but you pay $20/mo for Vercel Pro if you exceed the free tier.

1. **Backend on Railway**: exactly as in §6.2.
2. **Frontend on Vercel**:
   - Sign in at https://vercel.com, import the GitHub repo.
   - **Root directory**: `wappflow-web`.
   - Environment variables (Production scope):
     ```
     NEXT_PUBLIC_API_URL=https://<railway-backend>/api
     NEXT_PUBLIC_BASE_URL=https://<railway-backend>
     NEXT_PUBLIC_GOOGLE_CLIENT_ID=<optional>
     ```
   - Deploy.
3. **Update backend `FRONTEND_URL`** to your Vercel URL (or custom domain).

---

## 9. Deployment Option D — Docker Compose (self-host)

Create `Dockerfile.backend` in `backend/`:

```dockerfile
FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    chromium chromium-sandbox \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 \
    fonts-liberation libasound2 libxshmfence1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

EXPOSE 3001
CMD ["node", "server.js"]
```

Create `Dockerfile.frontend` in `wappflow-web/`:

```dockerfile
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "run", "start"]
```

Create `docker-compose.yml` in the repo root:

```yaml
version: "3.9"

services:
  api:
    build: { context: ./backend, dockerfile: Dockerfile.backend }
    restart: unless-stopped
    ports: ["3001:3001"]
    volumes:
      - api-data:/data
    environment:
      NODE_ENV: production
      PORT: 3001
      JWT_SECRET: ${JWT_SECRET}
      FRONTEND_URL: ${FRONTEND_URL}
      GROQ_API_KEY: ${GROQ_API_KEY}
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}

  web:
    build: { context: ./wappflow-web, dockerfile: Dockerfile.frontend }
    restart: unless-stopped
    ports: ["3000:3000"]
    depends_on: [api]
    environment:
      NEXT_PUBLIC_API_URL: ${NEXT_PUBLIC_API_URL}
      NEXT_PUBLIC_BASE_URL: ${NEXT_PUBLIC_BASE_URL}

volumes:
  api-data:
```

Run:

```bash
cp .env.example .env
nano .env   # fill in secrets
docker compose up -d --build
docker compose logs -f
```

Put Nginx/Caddy in front for HTTPS (see §7.5–7.6 — same config, just point `proxy_pass` at `127.0.0.1:3001` and `:3000`).

---

## 10. Post-Deployment: First-Run Checklist

1. **Open the frontend URL** in a browser → you should land on the login page.
2. **Sign up** with your email + a strong password.
3. **Visit `/settings/connections`** and click **Connect WhatsApp**.
4. **Scan the QR** with your phone (WhatsApp → Settings → Linked Devices → Link a Device).
5. **Wait for the "Connected" badge** — backend logs will print `✅ WhatsApp Client is ready!`.
6. **Send a test message** from the lead profile to verify outbound works.
7. **Have someone message your WA number** to verify inbound — the lead should auto-appear in the dashboard within ~3 s (via SSE).
8. **Settings → AI Command** → enter your business description, tone, do's/don'ts. Save.
9. **Settings → Notifications** → allow web push if you want reminder alerts.
10. **Optional: seed sample data** for demo:
    ```bash
    cd backend && node seed-leads.js
    ```

---

## 11. Domain, SSL, and CORS

| Concern | Setting |
|---|---|
| Custom domain (Railway) | Service → Settings → Custom Domain → CNAME `app.yourdomain.com → <railway domain>`. |
| Custom domain (VPS) | Point DNS A record to VPS IP, then `certbot --nginx` (see §7.6). |
| HSTS | Helmet sends `Strict-Transport-Security: max-age=31536000`. Make sure all your traffic is HTTPS first. |
| CORS | Backend sets `Access-Control-Allow-Origin: <FRONTEND_URL>`. Set `FRONTEND_URL` exactly (no trailing slash). For multiple frontends, comma-split in code (small patch needed). |
| Static file CORS | `/uploads/*` is explicitly `Cross-Origin-Resource-Policy: cross-origin` + `Access-Control-Allow-Origin: *`, so images load on any frontend host. |

---

## 12. Persistent Storage and Backups

**What must persist** (the backend writes here, losing it = losing data):

```
/data/
├── wappflow.db              # SQLite — all leads, messages, users
├── wappflow.db-wal          # SQLite write-ahead log
├── wappflow.db-shm          # SQLite shared memory
├── uploads/
│   ├── voices/*.{ogg,webm}  # voice notes
│   ├── images/*             # received WhatsApp images
│   ├── videos/*             # received WhatsApp videos
│   ├── files/*              # received WhatsApp documents
│   ├── logos/*              # workspace company logos
│   └── avatars/*            # user profile pictures
└── .wwebjs_auth/
    └── session-*/           # WhatsApp Web session per account
```

In production (`NODE_ENV=production`) the backend uses `/data` as the root. In dev it uses `backend/`.

### Daily backup (VPS)

Add to `/etc/cron.daily/wappflow-backup` (chmod +x):

```bash
#!/bin/bash
set -e
DEST=/var/backups/wappflow
TODAY=$(date +%Y-%m-%d)
mkdir -p $DEST
# SQLite hot backup (safe even while server is running)
sqlite3 /data/wappflow.db ".backup $DEST/wappflow-$TODAY.db"
# Uploads tarball
tar czf $DEST/uploads-$TODAY.tar.gz -C /data uploads
# Keep last 14 days
find $DEST -type f -mtime +14 -delete
```

For Railway: enable **Volume Backups** in the volume settings (paid tier feature).

### Restore

Stop the server, drop the file in place, restart:

```bash
pm2 stop wappflow-api
cp /var/backups/wappflow/wappflow-2026-05-17.db /data/wappflow.db
rm /data/wappflow.db-wal /data/wappflow.db-shm   # forces clean reopen
pm2 start wappflow-api
```

---

## 13. Monitoring, Logs, and Alerting

### Application logs

- Railway: built-in log viewer in the service dashboard.
- VPS / Docker: `pm2 logs wappflow-api` or `docker compose logs -f api`.
- Key strings to watch for:
  - `✅ Database schema ready` — successful boot.
  - `✅ WhatsApp Client is ready!` — WA connected.
  - `⚠️ WhatsApp disconnected:` — heartbeat detected drop.
  - `🔄 Scheduling auto-reconnect` — recovery in progress.
  - `❌ Auto-reconnect ... failed` — manual reconnect required.
  - `⚠️ Auto-analyze skipped:` — AI quota / network issue (non-fatal).

### Uptime monitoring

Point a free uptime monitor (UptimeRobot, BetterStack, Hetzner status, etc.) at:

- `GET /api/auth/me` with `Authorization: Bearer <a long-lived token>` — expects 200 with `{user, workspace, ...}`.
- `GET /uploads/health.txt` after creating `health.txt` in `/data/uploads/`.

### Health beacons (optional patch)

Add a `/api/health` route that returns:
```json
{ "ok": true, "db": "ok", "wa": ["connected", "disconnected"], "uptime": 12345 }
```
Then alert on `wa[].includes("disconnected")` for 5+ minutes.

---

## 14. Maintenance & Common Operations

### Update to a new version

```bash
ssh wappflow@your-vps
cd ~/wappflow
git pull
cd backend && npm ci --omit=dev
cd ../wappflow-web && npm ci && npm run build
pm2 restart wappflow-api wappflow-web
```

On Railway: push to GitHub, redeploy triggers automatically.

### Reset a stuck WhatsApp account

1. Settings → Connections → click the broken account → **Disconnect**.
2. Re-click **Connect** → scan QR again.
3. If even that fails:
   ```bash
   rm -rf /data/.wwebjs_auth/session-<account-slot>
   pm2 restart wappflow-api
   ```
   Then re-scan.

### Reset a user's password (no email yet)

```bash
node -e "
  const db = require('better-sqlite3')('/data/wappflow.db');
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('NewPassword123', 10);
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hash, 'user@example.com');
  console.log('Done');
"
```

### Wipe the database (start fresh)

```bash
pm2 stop wappflow-api
rm /data/wappflow.db /data/wappflow.db-wal /data/wappflow.db-shm
rm -rf /data/.wwebjs_auth /data/uploads
pm2 start wappflow-api
```

### Seed demo data

```bash
cd backend
node seed-leads.js           # adds 14 dummy leads across all platforms
node seed-leads.js --clean   # wipe previous seed first
```

### Rotate JWT secret

Changing `JWT_SECRET` invalidates all sessions. Plan it:
1. Email all users telling them they'll be logged out at HH:MM.
2. Update the env var.
3. Restart the backend.
4. Users log in again.

---

## 15. Troubleshooting Cheat Sheet

| Symptom | Likely cause | Fix |
|---|---|---|
| Images render as broken icons | `Cross-Origin-Resource-Policy` blocked the load | Confirm the backend sends `CORP: cross-origin` on `/uploads/*` (header check: `curl -I https://api.../uploads/anything.jpg`). The default `helmet({})` would block; our config sets it explicitly. |
| Login works but every request returns 401 | `FRONTEND_URL` mismatch breaks CORS preflight | Set `FRONTEND_URL` to the **exact** origin the user is on (incl. scheme, no trailing slash). Restart backend. |
| WhatsApp QR never appears | Chromium failed to start (missing libs) | On VPS, install the libs in §7.2. In Docker, use the slim images from §9. |
| "Number ... is not on WhatsApp" when sending | Lead's `customer_phone` is a platform ID (Instagram/Facebook), not a real phone | This is expected — the lead profile's WhatsApp tab should be locked. If it's unlocked, link a real WhatsApp identity via the Connected Channels card. |
| AI features fail with "No AI provider configured" | `GROQ_API_KEY` (or the alternate provider's key) is missing | Set the env var, restart backend. |
| Voice send returns HTTP 502 | `WhatsApp send failed: ...` — error in the response body tells you which side broke | Read the body. Usually "WhatsApp client is not ready" (reconnect) or "Number ... is not on WhatsApp" (wrong contact). |
| Reminders don't fire | VAPID keys not set OR user never granted notification permission | Set VAPID keys, restart, re-subscribe in Settings → Notifications. |
| Static files 404 even though file is on disk | Filename contains spaces and the URL isn't URL-encoded | Already handled in current code — frontend `encodeURIComponent`s each path segment. If you're hitting a manually-built URL, encode it. |
| `lead_channels has no column named …` after deploy | DB migrated to a partial state | Backend's `safeAlter` + `CREATE TABLE IF NOT EXISTS` are idempotent — restart the backend and it will run the missing migrations. |
| Dashboard chart shows nothing | No leads with `created_at` in the date range | Use the seed script or wait for real traffic. |
| 429 Too Many Requests on `/uploads/*` | Old build still had upload paths going through the rate-limiter | Current code excludes `/uploads/*` from the limiter. Confirm you're running the latest. |

---

## Quick Reference

- **Backend boot**: `cd backend && node server.js`
- **Frontend dev**: `cd wappflow-web && npm run dev`
- **Frontend build**: `cd wappflow-web && npm run build && npm run start`
- **Seed demo data**: `cd backend && node seed-leads.js --clean`
- **Syntax check backend**: `node -c server.js && node -c whatsapp-service.js && node -c ai-engine.js`
- **SQL console**: `sqlite3 /data/wappflow.db` (use `.tables`, `.schema leads`, etc.)
- **Inspect a lead**: `sqlite3 /data/wappflow.db "SELECT * FROM leads WHERE id = '<uuid>'"`
