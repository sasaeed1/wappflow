# WappFlow Command Center — Implementation Specification

> The platform control plane: one operating system to run WappFlow itself.
> **Status: PLAN — nothing built yet.** This is the file-by-file build spec for review before code.
> Last updated: 2026-06-21.

Companion to `ECOSYSTEM.md` (product modules) and `ROADMAP.md` (intelligence roadmap). Where those describe the customer-facing product, this describes the **internal** control plane the founder/ops/finance/support/CS teams use to operate the whole platform.

---

## 0. Locked architecture decisions

1. **Additive platform module.** Backend mounts as `require('./command-center')(app, db, deps)` in `server.js`, same pattern as `media-studio`/`contracts-studio`. Routes under `/api/cc/*`.
2. **It inverts the tenant invariant.** Every other module is scoped to one `workspace_id` via the `auth` middleware. Command Center reads **across all workspaces** and therefore does **not** use `auth`; it uses a new `platformAuth` middleware over a new identity tier (`cc_admins`). This is the single biggest difference and the reason it needs its own hardened access path.
3. **Same Next app, separate surface.** Frontend lives at `wappflow-web/src/app/control/*` with its own login (`/control/login`) and its own JWT audience (`aud: "command-center"`). Not a separate deploy.
4. **Configuration as data.** Plans, pricing, limits, features, flags, overrides, grace periods, defaults, and templates move out of code into tables, read through **one** resolver. No business rule stays hardcoded.
5. **Event-first + everything audited.** One append-only `platform_events` spine + one diff-capable `cc_audit` spine. Every admin write is attributable (who/what/when/before/after/why).
6. **Read-first, write-gated.** Observe surfaces ship first and are safe. Writes are role-gated, step-up-authed for destructive ops, and always audited. Command Center never mutates business tables ad hoc — writes go through typed, audited service functions.
7. **IP allowlist + short tokens.** `/api/cc/*` is IP-restricted (env `CC_IP_ALLOWLIST`); platform tokens are short-lived with refresh.

### Honest dependency callouts (do not fake these)
- **Real revenue (MRR/ARR/churn/expansion/refunds/coupons) is blocked** — there is no live subscription billing; `payments.js`/Stripe is a manual seam. We compute **implied MRR** from `workspace_plan` only, clearly labelled, until billing ships.
- **Desktop Control Center is blocked** — the desktop app doesn't exist yet (ONNX seam only).
- **System Health CPU/RAM/disk** needs host integration (pm2 API + `os` module), not app data — partial only.

---

## 1. The five foundation substrates (Phase 0 — build before any section)

~22 of the 30 spec sections are impossible or fake without these. Build them first; most sections then become thin UI over solid rails.

### 1.1 Platform identity & access
- **`cc_admins`** — platform admins, fully separate from `users`. The existing per-workspace `super_admin` role is **not** platform god-mode and must not be reused.
- New `platformAuth(req,res,next)` middleware: verifies JWT `aud:"command-center"`, loads the admin, enforces `cc_role` + granular `cc_permissions`, checks IP allowlist, attaches `req.admin`.
- **Step-up auth** for destructive actions (delete/suspend/SQL/bulk): re-enter password or TOTP, mint a 5-min `elevated` claim.
- **Impersonation reuses the existing auth path** (no parallel app): `POST /api/cc/workspaces/:id/impersonate` mints a *normal* workspace JWT for the owner with an extra claim `imp:{admin_id, audit_id, expires}`. The existing `auth` middleware reads `imp`, sets `req.impersonatedBy`, and `logAudit` tags every resulting action. Frontend shows a persistent "Impersonating — exit" banner. Time-boxed, fully audited.

### 1.2 Config-as-data + the entitlement resolver — the make-or-break refactor
Today plans/limits/features are expressed in code: `GET /api/workspace/plan-info` (hardcoded tiers), `lib/plan.js`, `settings` `TAB_GATING`, `PlanLock`, and inline `['super_admin','admin'].includes(req.userRole)`. **Flags and overrides are meaningless until one server-side function is the single source of truth.**

- Tables: `plans`, `plan_prices`, `plan_limits`, `plan_features`, `feature_flags`, `flag_assignments`, `entitlement_overrides`, `cc_config`.
- One resolver (`backend/entitlements.js`):

```
getEntitlements(workspaceId) -> { plan, limits:{...}, features:{...}, sources:{...} }
  base   = plan_limits + plan_features for the workspace's plan
  flags  = feature_flags (default + rollout%) ∪ flag_assignments (global|workspace|user)
  ovr    = entitlement_overrides for workspace, where now ∈ [starts_at, ends_at]
  result = base, with flags then overrides layered on top (override wins)
  cache per-request (and a short TTL process cache, invalidated on config write)
```

- **Migration strategy that minimizes churn:** keep the existing frontend contract. `GET /api/workspace/plan-info` keeps its response shape but is **re-implemented on top of `getEntitlements()`**, plus a new `flags` field. `lib/plan.js` `hasFeature`/`hasLimit` keep working unchanged; they just now reflect data + flags + overrides. Then add admin CRUD endpoints to edit the underlying tables. See the full gate checklist in §6.

### 1.3 Event spine
- **`platform_events`** append-only + `backend/events.js` `emit({workspace_id, actor, type, entity_type, entity_id, payload, source})`.
- Modules adopt `emit()` incrementally; for read-back now, UNION the legacy event sources (`activity_timeline`, `audit_logs`, `cs_events`, `ms_jobs`, `notifications`).
- Live stream: reuse the SSE pattern (unnamed frames via `broadcastToWorkspace`), plus a new `broadcastToAdmins()` for the Command Center live feed.

### 1.4 Audit spine
- Extend the existing `audit_logs` into a platform-wide, diff-capable **`cc_audit`** (actor_admin_id, action, target_type/id, workspace_id, before JSON, after JSON, reason, ip, ua). Every `/api/cc/*` write calls `ccAudit(...)`. This *is* Section 14.

### 1.5 Metering
Nothing is metered today, so all AI/cost/adoption/health numbers must be created:
- **`ai_usage`** — instrument **both** `ai-engine.js` `callLLM` *and* the inline `callGemini` in `server.js`: log workspace, user, feature, provider, model, prompt/completion tokens, latency, est_cost, success.
- **`workspace_usage_daily`** — nightly rollup: leads, messages, ai_calls, storage_bytes (`SUM(ms_assets.size_bytes)`), active_users, contracts, bookings, galleries.
- **`workspace_scores`** — periodic snapshot of health/churn/expansion/activity scores derived from the rollups + recency + adoption.

---

## 2. Full table catalog (new)

All `CREATE TABLE IF NOT EXISTS`, self-creating on boot like `ms_*`/`cs_*`. SQLite types.

### Identity & governance
```
cc_admins(id, email UNIQUE, password_hash, name, cc_role TEXT,        -- founder|ops|finance|support|cs|readonly
          cc_permissions TEXT JSON, mfa_secret, status, last_login_at, created_at)
cc_admin_sessions(id, admin_id, token_hash, ip, ua, expires_at, created_at, revoked)
cc_audit(id, admin_id, action, target_type, target_id, workspace_id,
         before TEXT JSON, after TEXT JSON, reason, ip, ua, created_at)
cc_impersonations(id, admin_id, workspace_id, audit_id, started_at, ended_at, reason)
```

### Config-as-data
```
plans(id, key UNIQUE, name, description, status,                      -- active|archived|retired
      visibility, sort_order, is_default, created_at, updated_at)
plan_prices(id, plan_id, interval, region, currency, amount, is_founding, active)  -- month|year|lifetime|custom
plan_limits(id, plan_id, key, value)                                 -- value NULL = unlimited
plan_features(id, plan_id, feature_key, enabled)
feature_flags(key PK, description, default_state, rollout_pct, status, created_at)
flag_assignments(id, flag_key, scope, scope_id, state, starts_at, ends_at, set_by, created_at)  -- global|workspace|user
entitlement_overrides(id, workspace_id, key, value, kind, reason,    -- kind: limit|feature|module|grace
                      admin_id, starts_at, ends_at, created_at, revoked_at)
cc_config(namespace, key, value TEXT JSON, updated_by, updated_at, PRIMARY KEY(namespace,key))
```

### Events & metering
```
platform_events(id, ts, workspace_id, actor_type, actor_id, type,
                entity_type, entity_id, payload TEXT JSON, source)    -- idx: ts, workspace_id, type
ai_usage(id, ts, workspace_id, user_id, feature, provider, model,
         prompt_tokens, completion_tokens, latency_ms, est_cost, success)
workspace_usage_daily(workspace_id, date, leads, messages, ai_calls, ai_cost,
                      storage_bytes, active_users, contracts, bookings, galleries,
                      PRIMARY KEY(workspace_id, date))
workspace_scores(workspace_id PK, health, churn, expansion, activity,
                 risk_factors TEXT JSON, computed_at)
```

### Support & ops
```
cc_tickets(id, workspace_id, admin_id, kind, priority, status, subject,
           body, source, created_at, resolved_at)                    -- kind: bug|feature|escalation|question
cc_ticket_comments(id, ticket_id, admin_id, body, internal, created_at)
cc_notes(id, workspace_id, admin_id, body, pinned, created_at)        -- customer notes
cc_inbox(id, kind, workspace_id, severity, title, body, status, link, created_at)  -- founder inbox items
cc_reports(id, name, definition TEXT JSON, schedule, recipients TEXT JSON, last_run_at, created_by)
cc_saved_views(id, admin_id, surface, name, query TEXT JSON, created_at)
cc_grace_periods(id, workspace_id, days, reason, admin_id, starts_at, ends_at, status, notified TEXT JSON)
```

---

## 3. Backend file plan

```
backend/
  command-center.js          # mount: routes, wires submodules, platformAuth, IP allowlist
  platform-auth.js           # platformAuth middleware, login, step-up, impersonation mint
  entitlements.js            # getEntitlements() resolver + cache + invalidate  (USED APP-WIDE)
  events.js                  # emit(), broadcastToAdmins(), legacy-source UNION reader
  cc-audit.js                # ccAudit(before/after diff)
  cc-metering.js             # ai_usage logger, daily rollup cron, score computation
  cc-services/
    customers.js             # workspace list, 360 aggregation, bulk actions
    plans.js                 # plans/prices/limits/features CRUD + "apply to" scopes
    flags.js                 # feature flags + assignments + rollout
    overrides.js             # entitlement_overrides + grace periods + module control
    billing.js               # implied MRR now; Stripe seam stubs for later
    health.js                # scores, risk factors, adoption
    support.js               # tickets, notes, inbox
    search.js                # global cross-entity search
    explorer.js              # DB introspection (read-only) + sandboxed SELECT runner
    messages.js              # cross-workspace message explorer (privacy-gated)
    ai-center.js             # provider health, cost, consumption from ai_usage
    media-ops.js             # ms_jobs/ms_assets/exports/worker stats
    system.js                # pm2/os metrics (partial)
    release.js               # rollout lifecycle on top of flags
    timemachine.js           # state reconstruction from platform_events + cc_audit
    automation.js            # bulk/mass actions (each item audited)
    exporter.js              # CSV/XLSX/PDF/JSON for any result set
```

`server.js` change: one mount line + pass deps `{ db, generateId, broadcastToWorkspace, sendEmail, notify, path, fs }`. Also: `auth` middleware gains `imp` claim handling; `ai-engine.js` + `callGemini` gain a `cc-metering` hook; new cron entries (daily rollup, score compute, grace-period sweep).

### Endpoint surface (`/api/cc/*`, all `platformAuth`)

**Auth/session:** `POST /login`, `POST /logout`, `GET /me`, `POST /step-up`.

**Executive (Section 1):** `GET /overview` (workspace/usage/AI/storage metrics + **implied** MRR), `GET /overview/forecast`.

**Customers (2,3):** `GET /workspaces` (search/filter/sort/paginate/columns), `GET /workspaces/:id` (360), `GET /workspaces/:id/{timeline,activity,billing,overrides,support}`, `POST /workspaces/:id/{suspend,restore,pause,delete,credits,tags,notes,impersonate}`, `POST /workspaces/bulk`.

**Plans (4):** `GET/POST /plans`, `GET/PUT/DELETE /plans/:id`, `POST /plans/:id/clone`, `PUT /plans/:id/{prices,limits,features}`, `POST /plans/:id/apply` (scope: new|existing|selected).

**Flags (5) & Release (21):** `GET/POST /flags`, `PUT /flags/:key`, `POST /flags/:key/assign`, `POST /flags/:key/rollout`, `POST /flags/:key/kill`.

**Modules (6) & Overrides (9) & Grace (8):** `POST /workspaces/:id/modules/:module/{enable,disable,suspend,schedule}`, `GET/POST /workspaces/:id/overrides`, `DELETE /overrides/:id`, `POST /workspaces/:id/grace`, `GET /grace`.

**Billing (7):** `GET /workspaces/:id/billing`, `POST /workspaces/:id/billing/{credit,adjust,pause,resume}` (manual now; Stripe-gated later).

**Adoption (10) & Health (11):** `GET /adoption`, `GET /health`, `GET /workspaces/:id/health`.

**Support (12):** `GET/POST /tickets`, `PUT /tickets/:id`, `POST /tickets/:id/comment`, `GET/POST /workspaces/:id/notes`.

**Events (13) & Audit (14):** `GET /events` (filter/search) + `GET /events/stream` (SSE), `GET /audit`, `GET /audit/:id` (diff), `GET /audit/entity/:type/:id`.

**Explorer (15) & SQL (16):** `GET /db/tables`, `GET /db/tables/:name` (schema/indexes/stats/rows), `POST /db/query` (read-only `SELECT`/`EXPLAIN`/`ANALYZE`, founder + step-up, audited).

**Messages (17):** `GET /messages` (cross-workspace, filter, privacy-gated, audited).

**AI (18):** `GET /ai/{overview,providers,costs,consumption}`.

**Media Ops (19):** `GET /media/{storage,jobs,workers,failures}`, `POST /media/jobs/retry-failed`.

**System (20):** `GET /system/{health,queues,cron,sse,backups}`.

**Founder Inbox (25):** `GET /inbox`, `PUT /inbox/:id`.

**Time Machine (26):** `GET /timemachine/:type/:id?as_of=...`.

**Config (28):** `GET/PUT /config/:namespace`.

**Search (29):** `GET /search?q=`.

**Automation (30):** `POST /automation/run` (typed bulk jobs, each item audited).

**Export (23) & Reports (24):** `POST /export` (any result set → CSV/XLSX/PDF/JSON), `GET/POST /reports`, `POST /reports/:id/run`.

---

## 4. Frontend file plan (`wappflow-web/src/app/control/*`)

```
control/
  layout.js                  # ControlShell wrapper, platform-admin theme, auth guard
  login/page.js              # platform-admin login (separate from /login)
  page.js                    # Executive Overview (1)
  customers/page.js          # Customer Management (2)
  customers/[id]/page.js     # Workspace 360 (3)
  plans/page.js              # Plans Engine (4)
  flags/page.js              # Feature Flags + Release (5,21)
  overrides/page.js          # Overrides + Grace + Module Control (6,8,9)
  billing/page.js            # Billing Control (7) — implied MRR + manual credits
  adoption/page.js           # Feature Adoption (10)
  health/page.js             # Customer Health (11)
  support/page.js            # Support Ops (12)
  events/page.js             # Live Event Stream (13)
  audit/page.js              # Audit Center (14)
  database/page.js           # DB Explorer (15)
  sql/page.js                # SQL Console (16)
  messages/page.js           # Message Explorer (17)
  ai/page.js                 # AI Control Center (18)
  media/page.js              # Media Ops (19)
  system/page.js             # System Health (20)
  inbox/page.js              # Founder Inbox (25)
  timemachine/page.js        # Time Machine (26)
  config/page.js             # Configuration Center (28)
  reports/page.js            # Report Engine (24)
src/components/control/
  ControlShell.js            # sidebar nav, global search bar, admin menu, impersonation banner
  DataTable.js               # reusable: columns/sort/filter/select/bulk/export (used everywhere)
  ExportButton.js, FilterBar.js, ChartCard.js, DiffViewer.js, ImpersonationBanner.js, StepUpModal.js
src/lib/
  ccApi.js                   # axios instance, aud:"command-center" token, /api/cc/* helpers
  cc-permissions.js          # client-side cc_role gating
```

Reuse existing libs where possible: `recharts`, `@hello-pangea/dnd`, `lucide-react`, the confirm/sound/toast patterns. `DataTable` + `ExportButton` are the workhorses — Sections 23 (Export everywhere) is satisfied by making every table use them.

---

## 5. Section → build mapping (all 30)

| # | Section | Tables / services | Phase | Status |
|---|---|---|---|---|
| 1 | Executive Overview | usage_daily, ai_usage, workspace_plan | 1 | Implied MRR only |
| 2 | Customer Management | workspaces, users, +scores | 1 | ✅ |
| 3 | Workspace 360 | aggregate all + scores | 1 | ✅ |
| 4 | Plans Engine | plans/prices/limits/features | 2 | needs foundation |
| 5 | Feature Flags | feature_flags, flag_assignments | 2 | needs foundation |
| 6 | Module Control | entitlement_overrides + module gates | 2 | needs foundation |
| 7 | Billing Control | billing.js, payments | 4 | ⛔ partial (manual only) |
| 8 | Grace Periods | cc_grace_periods + cron | 2 | ✅ on foundation |
| 9 | Overrides Engine | entitlement_overrides | 2 | foundation |
| 10 | Feature Adoption | usage_daily | 3 | needs metering |
| 11 | Customer Health | workspace_scores | 3 | needs metering |
| 12 | Support Ops | cc_tickets/notes | 3 | ✅ |
| 13 | Live Event Stream | platform_events + SSE | 1 | needs event spine |
| 14 | Audit Center | cc_audit | 1 | ✅ |
| 15 | DB Explorer | SQLite introspection | 4 | ✅ |
| 16 | SQL Console | sandboxed SELECT | 4 | ✅ (read-only) |
| 17 | Message Explorer | messages (cross-ws) | 1/4 | ✅ privacy-gated |
| 18 | AI Control Center | ai_usage | 3 | needs metering |
| 19 | Media Ops | ms_jobs/assets/exports | 1/3 | ✅ |
| 20 | System Health | pm2/os | 3 | ⛔ partial (host) |
| 21 | Release Mgmt | feature_flags | 2 | foundation |
| 22 | Desktop Control | — | — | ⛔ blocked (no desktop) |
| 23 | Export Engine | exporter.js + DataTable | 1→ | cross-cutting |
| 24 | Report Engine | cc_reports + cron + email | 4 | needs metrics |
| 25 | Founder Inbox | cc_inbox + alert rules | 3 | needs event spine |
| 26 | Time Machine | platform_events + cc_audit | 4 | best-effort |
| 27 | Security & Governance | cc_admins/audit/impersonations | 0 | substrate |
| 28 | Configuration Center | cc_config + all config tables | 2 | foundation |
| 29 | Global Search | search.js | 1 | ✅ |
| 30 | Automation Center | automation.js + audit | 4 | after write APIs |

---

## 6. The entitlement-gate migration checklist (the critical refactor)

Every current hardcoded gate must read from `getEntitlements()`. Enumerated from the codebase:

**Backend (`server.js`):**
- [ ] `GET /api/workspace/plan-info` — re-implement on `getEntitlements()`, keep response shape, add `flags`.
- [ ] `GET/PUT /api/workspace/plan` — write to `plans`/`workspace_plan` via plans service; emit + audit.
- [ ] Inline `['super_admin','admin'].includes(req.userRole)` checks (workspace/team/settings/role-permissions) — leave as **workspace RBAC** (unchanged); these are not platform gates.
- [ ] Lead-cap enforcement + platform-account slot caps (whatsapp/instagram/facebook/website) — source limits from `getEntitlements().limits`, not hardcoded tiers.
- [ ] **Module access gates (Section 6):** add an entitlement check to module route groups (`media-studio`, `contracts-studio`, `booking`, `print-store`, `payments`) so a workspace with the module disabled gets 403 — today they're globally mounted with no per-workspace gate. Implement via a `requireModule('media')` wrapper that calls `getEntitlements()`.
- [ ] `auth` middleware — add `imp` claim handling for impersonation + tag audit.

**Frontend:**
- [ ] `lib/plan.js` `usePlan/hasFeature/hasLimit` — no logic change; now reflects data/flags/overrides via plan-info.
- [ ] `settings/page.js` `TAB_GATING` — keep, but feature keys now resolve through entitlements.
- [ ] `PlanLock.js`, NavBar nav gating, `AppSwitcher` Flux (`FLUX_PARKED`) — optionally fold `FLUX_PARKED` into the flag system (`feature_flags.flux`) so it's controllable from Config Center.

**Invalidation:** any config write (`/api/cc/plans|flags|overrides|config`) calls `entitlements.invalidate(workspaceId?)` to bust the process cache. SSE-notify affected workspaces so open tabs refresh `usePlan`.

---

## 7. Cross-cutting engines

- **Export (23):** `exporter.js` takes a result set + format; every `DataTable` wires an `ExportButton`. Respects active filters/search/sort/date-range.
- **Global Search (29):** `search.js` runs scoped LIKE/FTS across workspaces, users, leads, contracts, projects, galleries, messages, invoices, bookings, events, audit. Phase 1 = LIKE; later = SQLite FTS5 index.
- **Report Engine (24):** `cc_reports` stores a saved query definition; cron runs scheduled reports; delivery via existing `sendEmail` seam.
- **Time Machine (26):** reconstruct an entity's state at `as_of` by folding `platform_events` + `cc_audit` before/after diffs. **Best-effort, improving as event coverage grows** — say so in the UI.
- **Automation (30):** typed bulk jobs (mass plan migration, mass flag enable, mass credits, mass notify) — chunked, each item emits an event + audit row, with a dry-run preview.

---

## 8. Security & governance model (Section 27)

- Separate identity (`cc_admins`), separate JWT audience, IP allowlist, short tokens + refresh, optional MFA.
- `cc_role` × granular `cc_permissions` (finance can't run SQL; support can't edit plans; readonly observes only).
- Step-up auth for: delete/suspend workspace, SQL console, bulk actions, plan apply-to-existing, billing adjustments.
- **Everything audited:** every admin action, every impersonation (start/end), every export, every SQL query, every config change → `cc_audit` with before/after.
- Impersonation is time-boxed, banner-flagged, and read-careful; consider a "read-only impersonation" default.
- Message Explorer + DB Explorer are privacy-sensitive: gated to high roles, every access audited, PII-aware.

---

## 9. Phased roadmap with rough effort

Effort sizing for AI-assisted solo dev: **S** ≤1d · **M** 2–4d · **L** 1–2w · **XL** 2–4w. Rough.

### Phase 0 — Foundation (XL total ≈ 3–5 weeks) — invisible, essential
- Platform identity + `platformAuth` + login + step-up + impersonation — **L**
- Config-as-data tables + `getEntitlements()` + cache/invalidate — **L**
- **Entitlement-gate migration** (§6) — **L** (the risky part; do behind a flag, verify parity)
- Event spine (`platform_events` + `emit` + legacy UNION + admin SSE) — **M**
- Audit spine (`cc_audit` + diff) — **M**
- Metering (`ai_usage` instrumentation + daily rollup + scores) — **M**

### Phase 1 — Observe (L–XL ≈ 2–3 weeks) — read-only, high value, low risk
- ControlShell + `ccApi` + `DataTable`/`ExportButton`/`FilterBar` — **M**
- Executive Overview (honest metrics) — **M**
- Customer Management + Workspace 360 — **L**
- Global Search — **M**
- Live Event Stream + Audit Center — **M**
- Media Ops (read) + Message Explorer (read, gated) — **M**

### Phase 2 — Control (L–XL ≈ 2–4 weeks) — gated, audited writes
- Plans Engine + apply-to scopes — **L**
- Feature Flags + rollout + kill switch + Release Mgmt — **M**
- Module Control + Overrides + Grace Periods — **M**
- Configuration Center — **M**
- Customer bulk actions (suspend/restore/credits/tags/notes) — **M**
- Impersonation UI + banner — **S**

### Phase 3 — Operate (L ≈ 2–3 weeks)
- AI Control Center (post-metering) — **M**
- Customer Health + Feature Adoption — **M**
- Support Ops (tickets/notes) — **M**
- Founder Inbox + alert rules — **M**
- System Health (pm2/os partial) — **M**

### Phase 4 — Advanced (XL ≈ 3–5 weeks)
- DB Explorer + SQL Console (read-only, audited) — **M**
- Time Machine — **L**
- Report Engine + scheduling — **M**
- Automation/Bulk Center — **L**
- Billing Control (real) — **L** *(blocked on live Stripe billing)*
- Desktop Control — *(blocked on desktop app)*

**Total rough order: ~3–4 months focused build**, foundation-first. Phases 1–2 deliver ~70% of day-to-day founder value.

---

## 10. First slice (proves the rails end-to-end)
Foundation-lite + one vertical loop: **`/control/login` → Customer Management list (cross-tenant) → Workspace 360 (read) → toggle one feature flag (through `getEntitlements`) → it appears in Audit Center + Live Event Stream, and the affected workspace's `usePlan` updates.** If that loop is clean, every other section is repetition.

## 11. Open decisions for review
1. **MFA on `cc_admins`** at launch, or password + IP allowlist first? (Recommend: TOTP from day one for founder.)
2. **Impersonation default**: read-only vs full write? (Recommend: read-only default, explicit elevation to write.)
3. **Fold `FLUX_PARKED` into the flag system** now, or leave the env flag? (Recommend: fold it — makes it controllable from Config Center.)
4. **`workspaceOwnerId` vs `workspace_id` keying** — Command Center should standardize reads; some core tables key shared data on the owner user id. Worth a small normalization pass.
5. **Implied-MRR formula** — surface as "implied" everywhere until Stripe subscriptions are live and `billing.js` can compute real MRR/churn.
