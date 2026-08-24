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
