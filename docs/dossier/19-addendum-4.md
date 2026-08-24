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
