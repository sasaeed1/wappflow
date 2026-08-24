## Platform core — auth, workspaces, roles, permissions and multi-tenancy

> **Read date / volatility note.** Everything below was read from the working tree on **2026-08-24**
> (`C:/Users/DELL/Desktop/Sami/wappflow`, branch tip `c23c7af`, with uncommitted modifications in
> `backend/server.js` and friends). `backend/server.js` was **6,587 lines and being actively edited
> while this section was written** — a password-reset module (`backend/account-recovery.js`) landed
> mid-read and shifted line numbers by ~19. Line citations are against the file as of that read; treat
> them as ±25 lines and search for the quoted code rather than trusting the number blindly.

### What this layer is *for*

WappFlow is sold to photo/video **studios**. A studio is a small business — an owner plus zero to a
handful of staff — and everything the product does (leads, WhatsApp conversations, contracts, shoots,
galleries, invoices) belongs to that business, not to the individual who typed it in. The platform
core is the machinery that answers three questions on every single request:

1. **Who are you?** (a `users` row, proven by a JWT)
2. **Whose business are you acting inside?** (a `workspaces` row — the tenant)
3. **How much of that business are you allowed to see and change?** (a `workspace_members.role` plus a
   permissions blob)

A **workspace** is the tenant boundary and the unit of billing. A **member** is a person's seat in a
workspace. Almost every business table in the database carries a `workspace_id` column, and the
promise of the system is that no query ever crosses that column. This section documents how well that
promise is actually kept.

There is one important architectural limit to state up front: **a user belongs to exactly one
workspace at a time.** `users.workspace_id` is a single scalar column (server.js:289–294), and the
auth middleware reads the caller's workspace from it. `workspace_members` *looks* like a many-to-many
join table, but the login path never consults it to choose a workspace. There is no workspace switcher
anywhere in the product — a repo-wide grep for `switchWorkspace` / "Switch workspace" returns nothing
in `backend/` or `wappflow-web/src`. An agency running two studios cannot do so in one account.

---

### The identity model (tables)

| Table | Key columns | Purpose / notes |
|---|---|---|
| `users` | `id` (TEXT PK), `email` (UNIQUE), `password` (bcrypt), `business_name`, `role` (default `'owner'`), **`workspace_id`**, `full_name`, `profile_picture`, `phone`, `bio`, `google_id`, `token_version` (added by account-recovery.js:58), `created_at` | The person. `users.role` is **vestigial** — it holds `'owner'`/`'member'` and is never read for authorization; the real role lives in `workspace_members.role`. `/api/auth/me` even overwrites it in the response (server.js:1333). |
| `workspaces` | `id` (TEXT PK), `name`, `owner_id`, `status` (added lazily by command-center.js:133–134, `'active'`/`'suspended'`), `created_at` | The tenant. `owner_id` is informational; the *effective* owner is resolved from `workspace_members` instead (see `req.workspaceOwnerId`). |
| `workspace_members` | `id`, **`workspace_id`**, `user_id` (NULLable while an invite is pending), `role`, `permissions` (JSON TEXT), `invite_email`, `invite_token` (UNIQUE), `invite_status` (`'active'` / `'pending'`), `full_name`, `created_at` | The seat, the invite record, and the authorization record all in one row. Indexed by `idx_workspace_members_ws`. |
| `workspace_role_permissions` | `id`, `workspace_id`, `role`, `permissions` (JSON), UNIQUE(`workspace_id`,`role`) | Per-workspace override of the role→permission matrix. **Written and displayed but never enforced** — see Concerns. |
| `team_members` | `id`, `workspace_id`, `name`, `email`, `role` (default `'agent'`), `status`, `invite_token`, `user_id` | **Legacy, superseded, and buggy.** Predates `workspace_members`. Still written by `POST /api/team` and still read in two hot paths. |
| `workspace_plan` | `workspace_id` (PK), `plan`, `features` (JSON), `limits` (JSON), `trial_ends_at` | Billing tier. Feeds `entitlements.getEntitlements()`. |
| `audit_logs` | `id`, `workspace_id`, `user_id`, `user_name`, `action`, `entity_type`, `entity_id`, `details` (JSON), `ip_address`, `created_at` | Per-tenant audit spine, written by `logAudit()` (server.js:1189). Indexed `(workspace_id, created_at)`. |
| `password_resets` | `id`, `user_id`, `token_hash` (sha256, UNIQUE), `expires_at`, `used_at`, `requested_ip` | New (account-recovery.js:44–56). Only the hash is stored; 60-minute TTL; single use. |
| `cc_admins` | `id`, `email`, `password_hash`, `cc_role`, `cc_permissions`, `status` | A **separate identity tier** for platform staff. Not a `users` row. See "Command Center" below. |

Two more tables carry platform-admin state: `cc_audit` (every admin action, with before/after and IP)
and `cc_impersonations` (one row per impersonation session).

---

### JWT issuance, expiry and revocation — **PARTIAL**

Tokens are HS256 JWTs signed with `JWT_SECRET`, which falls back to the literal string
`'your-secret-key-change-in-production'` when the env var is unset (server.js:180). Sessions are minted
by `signSession(userId, extra)` (server.js:196–200):

```js
function signSession(userId, extra = {}) {
  let tv = 0;
  try { tv = db.prepare('SELECT token_version FROM users WHERE id = ?').get(userId)?.token_version || 0; } catch {}
  return jwt.sign({ userId, tv, ...extra }, JWT_SECRET);
}
```

**There is no `expiresIn`.** A workspace-user token is valid forever. The only two token types with an
expiry are Command Center admin tokens (`12h`, command-center.js:256), the step-up token (`5m`,
command-center.js:272) and the impersonation token (`30m`, command-center.js:457).

The `tv` (token version) claim is the *only* revocation mechanism, added very recently. The middleware
refuses any token whose `tv` is lower than `users.token_version` (server.js:222–224). A completed
password **reset** bumps that version (account-recovery.js:169). A password **change** via
`PUT /api/auth/password` does **not** (server.js:1307–1325) — so changing your password in-app leaves
every other stolen session alive. There is no logout-everywhere, no refresh-token rotation, and no
server-side session store; "sign out" is `localStorage.removeItem` on four keys
(`components/shell/session.js:15,35`).

The frontend stores the raw JWT in `localStorage` under `token`. A "remember me" checkbox writes
`wf_persist` = `'forever'` | `'session'`; an inline `<head>` script in `app/layout.js:46–57` clears the
token on a genuinely fresh visit when the mode is `'session'`. This is a client-side convenience only —
the token itself remains valid server-side.

`auth` also accepts the token via **query string** (`req.query.token`), because `EventSource` cannot set
headers (server.js:203). That is how `GET /api/events` (the SSE bus, server.js:971) authenticates. It
means non-expiring bearer tokens travel in URLs, and therefore into nginx access logs and browser
history.

---

### The `auth` middleware — the single choke point

Every authenticated route in the product goes through the one `auth` function at **server.js:201–262**,
which is passed by dependency injection into every mounted module (`require('./booking')(app, db, { auth, ... })`,
server.js:6461, and the same for media-studio, contracts-studio, payments, comms, print-store, search,
sync, reel-engine, brains, studio-ai, video-ai, studio-experience). There is exactly one implementation.
It sets, in order:

| Property | Source | Meaning |
|---|---|---|
| `req.userId` | `decoded.userId` | The person. |
| `req.impersonation` / `req.impersonatedBy` | `decoded.imp` claim | Present only on Command Center impersonation tokens. |
| `req.workspaceId` | `users.workspace_id` **`|| decoded.userId`** | **The tenant key.** The fallback is load-bearing — see below. |
| `req.senderName` | `users.full_name || business_name || 'Team Member'` | Display name on outbound messages. |
| `req.userRole` | `workspace_members.role` **`|| 'super_admin'`** | Fails **open** when no member row exists. |
| `req.userPermissions` | `JSON.parse(workspace_members.permissions)` **or** `DEFAULT_ROLE_PERMISSIONS[role]` | Note: a custom blob **replaces** the role defaults, it does not merge with them. |
| `req.canViewAllLeads` | `userPermissions.view_all_leads ?? DEFAULT_ROLE_PERMISSIONS[role].view_all_leads` | The one permission that is genuinely enforced. |
| `req.workspaceOwnerId` | `SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1` | The user id that owner-keyed legacy tables are filed under. |

It then applies two Command Center rules before calling `next()`:

* **Read-only impersonation** — if `req.impersonation.mode === 'read'` and the method is not
  GET/HEAD/OPTIONS, return `403 { impersonation_readonly: true }` (server.js:246–248).
* **Suspended workspace** — if `workspaces.status === 'suspended'` and this is *not* an impersonated
  session, return `403 { suspended: true }` (server.js:250–258). Note this contradicts the message the
  Command Center suspend endpoint still returns ("Login enforcement for suspended workspaces is a
  follow-up rewire", command-center.js:398) — **the code is ahead of that string; believe the code.**

---

### The roles and the permission matrix — **PARTIAL, mostly decorative**

Four roles are hard-coded in `DEFAULT_ROLE_PERMISSIONS` (server.js:184–189) with nine boolean keys:

| Role | view_all_leads | create_lead | edit_lead | delete_lead | view_reports | manage_settings | manage_team | manage_invoices | manage_whatsapp |
|---|---|---|---|---|---|---|---|---|---|
| `super_admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `admin` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `manager` | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ |
| `user` | ✗ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**Of these nine keys, exactly two are enforced anywhere in the backend.**

* `view_all_leads`, via `req.canViewAllLeads`, which appends `AND assigned_to = ?` to the leads list
  (server.js:1752), the trash list (server.js:1806), bulk-status (server.js:2247), the dashboard
  aggregate (server.js:3252–3253), the reminders feed (server.js:5864) and universal search
  (search.js:42–43); and which gates `getScopedLead()`.
* `manage_settings`, in exactly one place: `canManage(req)` in media-studio.js:353–359, guarding
  archive/delete of media projects.

`create_lead`, `edit_lead`, `delete_lead`, `view_reports`, `manage_team`, `manage_invoices` and
`manage_whatsapp` are **never read by any server-side check** (verified by grepping `req.userPermissions`
across `backend/*.js` — the only hits are the middleware itself, media-studio.js:358, and test files).
The frontend does not gate on them either: the only file in `wappflow-web/src` that mentions
`manage_team` / `manage_invoices` is `app/team/page.js`, which uses them purely to render toggle labels.

Where role checks *do* exist they are coarse, literal `['super_admin','admin'].includes(req.userRole)`
string tests, at: `PUT /api/workspace` (3504), `POST /api/workspace/invite` (3516),
`PUT /api/workspace/members/:id` (3629), `DELETE /api/workspace/members/:id` (3645),
`PUT /api/settings/email-smtp` (3712), `PUT /api/settings/email-imap` (3763), and
`PUT /api/workspace/role-permissions` (super_admin only, 3685).

**Classification:** the four-role model is SHIPPED at the "who can manage the team and settings" level;
the nine-permission matrix is **SOLD-NOT-BUILT** for seven of its nine switches, and the per-workspace
role customisation stored in `workspace_role_permissions` is **STUB** (written, read back for display,
never consulted by `auth`).

---

### Multi-tenancy: how isolation is actually enforced

There is no ORM, no row-level security, and no query builder that injects a tenant clause. Isolation is
**per-query, by hand**, and rests on four conventions.

**1. The `workspace_id` column convention.** Business tables carry `workspace_id TEXT` and every read
adds `WHERE workspace_id = ?` bound to `req.workspaceId`. Usage density gives a rough map of how
consistently each module follows it:

| Module | `req.workspaceId` refs | `req.workspaceOwnerId` refs | `req.userId` refs |
|---|---|---|---|
| `server.js` | 198 | 69 | 118 |
| `media-studio.js` | 193 | 0 | 49 |
| `contracts-studio.js` | 65 | 1 | 29 |
| `comms.js` | 38 | 0 | 32 |
| `booking.js` | 21 | 0 | 2 |
| `print-store.js` | 8 | 0 | 0 |
| `payments.js` | 4 | 1 | 2 |

**2. `getScopedLead(req, leadId)`** (server.js:270–278). The CRM's lead record is the hub every other
object hangs off, so sub-resource routes were the leak-prone surface. This helper is the single fix:

```js
const lead = db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(leadId, req.workspaceId);
if (!lead) return null;
if (!req.canViewAllLeads && lead.assigned_to !== req.userId) return null;
return lead;
```

It is called **41 times** in server.js (messages, notes, reminders, history, invoices-of-lead, merge,
status changes, media upload…). It deliberately collapses "wrong tenant" and "not yours" into the same
`null`, so callers return a uniform 404 and the API does not leak record existence. It is **not** used
by media-studio.js, contracts-studio.js or booking.js, which do their own `AND workspace_id = ?` joins.

**3. `req.workspaceOwnerId` — the owner-keyed legacy tables.** A set of tables was built before
workspaces existed and is still keyed by a **user id**, specifically the workspace's super_admin. Those
tables are: `company_settings`, `tags`, `message_presets`, `email_templates`, `auto_reply_rules`,
`email_smtp_settings`, `email_imap_settings`, and legacy `team_members`. Every read/write against them
binds `req.workspaceOwnerId`, e.g. `SELECT * FROM tags WHERE user_id = ?` (server.js:3034). This works,
but it means "the workspace's tags" is defined as "the tags belonging to whichever super_admin the
database returns first" — see Concerns.

**4. The legacy dual-read predicate.** `invoices` and `email_workflows` were re-keyed from user to
workspace in the Foundation Sprint (PROP-001, batch 5). The migration is *additive*: the columns were
added by `safeAlter` (server.js:730–731), an index created, and an **idempotent boot backfill** runs on
every start (server.js:735–744):

```sql
UPDATE invoices SET workspace_id = COALESCE(
  (SELECT u.workspace_id FROM users u WHERE u.id = invoices.user_id), user_id
) WHERE workspace_id IS NULL OR workspace_id = ''
```

Until `user_id` is retired, every read of those two tables uses the dual predicate:

```sql
(workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))
```

bound `(req.workspaceId, req.workspaceOwnerId)`. It appears **13 times** — server.js:2003, 2018, 2044,
2073, 2076, 2556, 2570, 2581, 2592, 2647, 2657, 2679, 2714, 2740 — plus once in payments.js:165. A
regression test (`test-batch5-scope.js:75,133,135`) asserts the shape and a minimum occurrence count, so
anyone who "simplifies" one of these will fail CI.

**Anyone planning work here must know why this predicate exists**: legacy workspaces were created by the
boot migration at server.js:934–955 with `const wsId = user.id` — *the workspace id literally equals the
owner's user id*. For those tenants `req.workspaceId === req.workspaceOwnerId` and both arms of the
predicate coincide. For workspaces created by `POST /api/auth/register` (server.js:1259) the workspace
id is a fresh UUID **distinct** from the user id, and the two arms diverge. Invoices are written with
both (`.run(id, req.workspaceOwnerId, req.workspaceId, ...)`, server.js:2625). So the codebase contains
two structurally different generations of tenant, and code that assumes `workspaceId === ownerId` will
work in dev against a migrated database and silently break for new signups.

---

### Sign-in surfaces

| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | none | Creates `workspaces` → `users` (role `'owner'`) → `workspace_members` (`super_admin`, `active`) → `company_settings`, then returns a session. **No email format check, no password length check, no dedicated rate limiter.** Every failure is reported as `400 "Email already exists"` (server.js:1282). |
| POST | `/api/auth/login` | none, `loginLimiter` | 20 failed attempts / 15 min / IP, `skipSuccessfulRequests: true` (server.js:93–101). Email match is **case-sensitive** (`WHERE email = ?`). |
| POST | `/api/auth/google` | none | Verifies a Google **ID token** via `google-auth-library` against `GOOGLE_CLIENT_ID`. Matches on `google_id` then falls back to `email`. New users get a bcrypt hash of a random `generateId()` as an unusable password. Legacy users without a workspace get one created inline with `wsId = user.id`. Frontend uses `@react-oauth/google`'s `<GoogleLogin>` on `app/login/page.js:156` and `app/signup/page.js:152`, gated on `NEXT_PUBLIC_GOOGLE_CLIENT_ID`; when unset it renders a disabled "Google sign-in not configured" button. **SHIPPED.** |
| POST | `/api/auth/forgot-password` | none, `loginLimiter` | Neutral response always; sha256-hashed single-use token, 60 min TTL; supersedes outstanding links; sends via platform `SMTP_*` env, falling back to the workspace owner's SMTP. **SHIPPED (new).** |
| GET | `/api/auth/reset-password/:token` | none | `{ valid: bool }` pre-check for the UI. |
| POST | `/api/auth/reset-password` | none, `loginLimiter` | ≥8 chars, bumps `users.token_version` (revoking old sessions), deliberately does *not* log the user in. |
| GET | `/api/auth/me` | `auth` | Returns `{ user, company, workspace, memberRole, impersonation }`. |
| PUT | `/api/auth/password` | `auth` | Requires current password; ≥6 chars; **does not bump `token_version`**. |
| POST | `/api/sso/flux-token` | `auth` | Mints a 60-second HS256 token for the sibling "Flux" product, signed with `FLUX_SSO_SECRET` (≥16 chars required). Claims: `iss:'wappflow'`, `aud:'flux'`, `wf_workspace_id`, `wf_user_id`, `email`, `name`, `plan`. Unlock tiers checked against `workspace_plan.plan` ∈ {growth, enterprise, pro, business} — **note these keys do not match the live plan catalog** (`creator`/`studio`/`studio_plus`/`enterprise`), so `unlocked` is false for almost every real workspace. |

Frontend `lib/api.js` wraps these as `authAPI` (line 31) and `inviteAPI` (line 171); an axios response
interceptor (lib/api.js:17–28) clears the session and hard-redirects to `/login` on any 401 outside the
auth pages.

---

### Invitations and team management

| Method | Endpoint | Guard | Behaviour |
|---|---|---|---|
| GET | `/api/workspace` | `auth` | Workspace row + all members (ordered super_admin→admin→manager→user) + `rolePermissions` map + `currentUserRole`. |
| PUT | `/api/workspace` | super_admin/admin | Rename. |
| POST | `/api/workspace/invite` | super_admin/admin | Role must be `admin`\|`manager`\|`user`. Seat limit checked via `pricing.canCreate(db, ws, 'users')` → `402 {upgrade:true}` when exceeded. |
| PUT | `/api/workspace/members/:id` | super_admin/admin | Change `role` and/or `permissions`. Cannot modify or assign `super_admin` unless you are one. **`role` is not validated against an allow-list.** |
| DELETE | `/api/workspace/members/:id` | super_admin/admin | **Hard delete, deliberately** — the code comment (server.js:3650–3657) argues that soft-deleting an auth table would let a removed member keep authenticating. Also sets `users.workspace_id = NULL`. Cannot remove a super_admin or yourself. |
| GET/PUT | `/api/workspace/role-permissions` | any / super_admin | Read merges `DEFAULT_ROLE_PERMISSIONS` with saved rows; write upserts into `workspace_role_permissions`. **Never enforced.** |
| GET | `/api/auth/invite-info/:token` | none | `{ email, workspace_name, role }` for a `pending` invite. |
| POST | `/api/auth/accept-invite` | none | Creates the user (or resets an existing one's password), flips the member row to `active`, nulls the token, sets `users.workspace_id`, returns a session. |
| GET | `/api/team` … DELETE `/api/team/:id` | `auth`, **no role check** | Legacy shim. GET returns `workspace_members` as `members` plus `team_members` as `legacyMembers`. |
| GET | `/api/audit-logs` | `auth`, **no role check** | Workspace-scoped audit feed with `limit`/`offset`. |
| GET | `/api/workspace/export` | `auth`, **no role check** | Full JSON dump of the tenant: leads, notes, reminders, contact_history, messages, invoices, tags, bookings… |

Two invite paths exist inside `POST /api/workspace/invite` (server.js:3524–3536):

* **Email not yet registered** → a `pending` member row with `invite_token = generateId() + generateId()`
  and an emailed link `${FRONTEND_URL}/accept-invite?token=…`. The email is sent through the *workspace
  owner's* SMTP settings; if none are configured the endpoint still returns `invite_link` and the UI
  shows a copyable link instead (`app/team/page.js` InviteModal). Invite tokens have **no expiry**.
* **Email already has an account** → the user is added as an `active` member immediately **and**
  `UPDATE users SET workspace_id = ? WHERE id = ?` is executed. See Concerns — this is a tenant-takeover
  primitive.

The Team UI (`wappflow-web/src/app/team/page.js`, 722 lines) has three tabs — Members, Role Permissions,
Audit — and is itself gated behind the `team_collaboration` plan feature via `usePlan()` +
`<LockedOverlay>` (page.js:502–512). It loads `workspaceAPI.get()`, `auditAPI.getLogs()` and
`workspaceAPI.getRolePermissions()` with `Promise.allSettled` so one failure doesn't blank the page.

---

### Impersonation and the Command Center identity tier

`backend/command-center.js` (916 lines) is a **platform-scoped** control plane that deliberately reads
across all tenants. It is mounted last, at **server.js:6544**. (The note in the older
`DESKTOP-FINAL-VISION.md` that Command Center is unmounted dead code is **STALE** — the mount call is
right there; `PRODUCT-AUDIT.md:307` already corrects it, though it cites the pre-growth line 5594.)

It does *not* use the `auth` middleware. It has:

* **Its own identity table** `cc_admins`, seeded on first boot from `CC_FOUNDER_EMAIL` /
  `CC_FOUNDER_PASSWORD` (command-center.js:136–143), or via `scripts/cc-create-admin.js`.
* **A distinct JWT audience** `'command-center'` verified in `platformAuth` (command-center.js:185–201).
* **An IP allowlist** from `CC_IP_ALLOWLIST` (comma-separated). **When unset it allows everything** —
  `if (!allow.length) return true; // unset = allow (dev)` (command-center.js:177).
* **Six platform roles** (`founder`, `ops`, `finance`, `support`, `cs`, `readonly`) mapping to eleven
  granular permissions: `view`, `manage_plans`, `manage_flags`, `manage_overrides`, `manage_billing`,
  `impersonate`, `impersonate_write`, `run_sql`, `manage_support`, `bulk_actions`, `manage_admins`
  (command-center.js:27–40), enforced by `requirePerm(perm)`.
* **Step-up auth** — `POST /api/cc/step-up` re-verifies the password for a 5-minute `elevated: true`
  token used by the SQL console.
* **A full audit spine** `ccAudit()` writing `cc_audit` rows with before/after JSON, reason, IP and UA.

**Impersonation flow (SHIPPED, read-only by default):**

1. `POST /api/cc/workspaces/:id/impersonate` (command-center.js:438, `requirePerm('impersonate')`)
   resolves the workspace's super_admin, writes a `cc_impersonations` row and a `cc_audit` entry, then
   mints a **30-minute** token signed with the *same* `JWT_SECRET` as normal user tokens so the core
   `auth` accepts it. Write mode requires the separate `impersonate_write` permission; otherwise
   `mode: 'read'`.
2. The token is delivered to `/impersonate?token=…` (`wappflow-web/src/app/impersonate/page.js`). That
   page stashes the admin's own session under `cc_prev_token` / `cc_prev_user` / `cc_prev_workspace`,
   installs the impersonation token as `token`, calls `/auth/me` to populate `user` + `workspace`, sets
   `cc_impersonating='1'`, `cc_imp_name`, `cc_imp_mode`, and redirects to `/dashboard`.
3. `components/ImpersonationBanner.js` renders a fixed bottom bar — purple for read mode, **red for
   write mode** — with an "Exit impersonation" button that restores the stashed session and returns to
   `/control/customers`. It is mounted globally at `app/providers.js:23`. (`PRODUCT-AUDIT.md:307` calls
   this banner "unmounted" — **STALE; the code disagrees.**)
4. Server-side, `auth` blocks all non-GET methods when `mode === 'read'` (server.js:246–248) and lets
   impersonated sessions through the suspended-workspace gate so support can investigate.

`backend/grant-master.js` (99 lines) is the deliberate counterpart: a **CLI-only** escalation. It
resolves the same database the server uses (parsing `backend/.env` itself so `NODE_ENV` is right, then
`DATA_DIR || (production ? '/data' : __dirname)` + `wappflow.db`), looks up the account by
`lower(email)`, prints a dry-run diff, and only with `--apply` upserts `workspace_plan.plan =
'enterprise'`. Its header states the design rule explicitly: *"Deliberately a script, not an API route:
nothing reachable over HTTP should be able to hand out unlimited entitlements."* That rule is currently
violated — see the first item under Concerns.

---

### Configuration surface

| Variable | Consumer | Default / effect if unset |
|---|---|---|
| `JWT_SECRET` | all token signing/verification | falls back to a **hard-coded literal** |
| `DATA_DIR` | SQLite path + uploads root | `'/data'` in production, `__dirname` otherwise |
| `FRONTEND_URL` | CORS origin, invite links, reset links, module `clientBaseUrl` | CORS becomes `'*'`; links become `http://localhost:3000` |
| `TRUST_PROXY` | `app.set('trust proxy', …)` | `1` (one nginx hop) |
| `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google sign-in (server verify / client button) | button renders disabled |
| `GOOGLE_CLIENT_SECRET` | Google **Calendar** OAuth only (server.js:5946) | calendar connect throws |
| `FLUX_SSO_SECRET` / `FLUX_URL` | cross-product SSO | mint throws; base defaults to `https://flux.remoteops.co` |
| `CC_FOUNDER_EMAIL` / `CC_FOUNDER_PASSWORD` | first `cc_admins` seed | no admin is created |
| `CC_IP_ALLOWLIST` | Command Center network gate | **allows every IP** |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | platform mail for password resets | falls back to the studio's own SMTP, else logs an operator error |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | web push | **hard-coded keys are committed as the default** (server.js:22–23) |

---

### Concerns — bugs, security weaknesses, data-integrity risks and smells

*Read-only observations. Nothing here was fixed.*

**S1 — Any workspace member can grant themselves any plan (privilege/billing bypass).**
`PUT /api/workspace/plan` (server.js:5453) is guarded by `auth` alone: no role check, no ownership
check, no platform-admin check. Its body is written straight into `workspace_plan`, including the
free-form `features` and `limits` JSON, which `entitlements.getEntitlements()` merges *over* the plan
tables (entitlements.js:298–299). A `user`-role member can `PUT {"plan":"enterprise"}` and unlock every
paid feature and limit. It is exposed on the client as `planAPI.update` (lib/api.js:227). This directly
contradicts grant-master.js's stated invariant.

**S2 — Inviting an existing user hijacks them out of their own workspace.**
`POST /api/workspace/invite` runs `UPDATE users SET workspace_id = ? WHERE id = ?` for any email that
already has an account (server.js:3530). There is no consent step, no notification, and no check that
the target isn't already the owner of another tenant. Consequences: (a) the victim's next request
resolves `req.workspaceId` to the attacker's workspace; (b) the victim's own workspace becomes
unreachable — all of their leads, invoices and media are orphaned behind a `workspace_id` nobody can
authenticate into; (c) `DELETE /api/workspace/members/:id` then sets their `workspace_id` to NULL, at
which point `auth`'s fallback (`|| decoded.userId`) drops them into an empty phantom workspace with
`req.userRole` defaulting to `'super_admin'`. This is the single highest-severity defect in this layer.

**S3 — Security tokens come from `Math.random()`.**
`generateId()` (server.js:1111) is the classic `'xxxxxxxx-xxxx-4xxx-…'.replace(/[xy]/g, …Math.random()…)`
UUID-v4 shim. It is used for `workspace_members.invite_token` (`generateId()+generateId()`,
server.js:3521) and `team_members.invite_token` (server.js:3658), as well as every entity id. V8's
`Math.random` is xorshift128+ — an attacker who harvests a handful of ids the API hands them back (their
own lead/invoice ids) can recover the generator state and predict subsequent invite tokens, then accept
an invite to a workspace they were never sent one for. `crypto.randomBytes` is already imported in this
file (server.js:1434) and *is* used correctly by account-recovery.js:124. Invite tokens additionally
have **no expiry** and no `expires_at` column.

**S4 — Role-permission customisation is unenforced.**
`workspace_role_permissions` is written by `PUT /api/workspace/role-permissions` (server.js:3683) and read
back by two GET routes for display, but the `auth` middleware never queries it (server.js:231–237 reads
only the per-member blob and the hard-coded `DEFAULT_ROLE_PERMISSIONS`). A super_admin who turns off
"Delete leads" for managers in the Team UI gets a success toast and zero behavioural change.

**S5 — Seven of nine permissions are never checked at all.** See the matrix section above. Any
authenticated member — including role `user` — can call `GET /api/workspace/export` (a complete JSON dump
of the tenant, server.js:3017) and `GET /api/audit-logs` (server.js:3002), neither of which has a role
check. `manage_invoices` does not protect any invoice route; `delete_lead` does not protect
`DELETE /api/leads/:id`.

**S6 — A custom permissions blob silently erases the role defaults.**
`req.userPermissions = member.permissions ? JSON.parse(member.permissions) : DEFAULT_ROLE_PERMISSIONS[role]`
(server.js:233) is a replace, not a merge. The moment an admin toggles one switch for a member, every
other key becomes `undefined`. `canViewAllLeads` survives this by an explicit `??` fallback
(server.js:236–237); nothing else does.

**S7 — `req.workspaceOwnerId` is non-deterministic with two super_admins.**
`SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1` has no
`ORDER BY` (server.js:240). Since `company_settings`, `tags`, `message_presets`, `email_templates`,
`auto_reply_rules` and the SMTP/IMAP credentials are all filed under that id, promoting a second
super_admin — or deleting rows in a way that changes SQLite's scan order — can make an entire workspace's
tags, presets, branding and mail credentials appear to vanish. It also means `PUT /api/workspace/members/:id`
promoting someone to super_admin is a *data-visibility* operation, not just an authorization one.

**S8 — No member row means `super_admin`.** `req.userRole = member?.role || 'super_admin'`
(server.js:232) fails **open**. Any authenticated user whose `workspace_members` row is missing —
because they were removed, because a migration didn't write one, or because `users.workspace_id` points
somewhere with no matching seat — is treated as the owner of whatever `req.workspaceId` resolves to.

**S9 — Non-expiring tokens in query strings.** `auth` accepts `?token=` (server.js:203) and workspace
tokens have no `exp`. A single leaked nginx log line or shared SSE URL is a permanent credential. The new
`token_version` mechanism helps only if the user performs a *reset*; the in-app password **change**
(server.js:1307) does not bump it.

**S10 — Committed default secrets.** `JWT_SECRET` falls back to `'your-secret-key-change-in-production'`
(server.js:180) and both VAPID keys are hard-coded literals (server.js:22–23). `CC_IP_ALLOWLIST` unset
means the Command Center is reachable from anywhere.

**S11 — Case-sensitive email identity.** `POST /api/auth/login` and `POST /api/auth/google` match
`WHERE email = ?` (server.js:1290, 1394) while `account-recovery.js:117` uses `lower(email) = ?` and
`grant-master.js:64` uses `lower(email) = lower(?)`, and `users.email` is a plain `TEXT UNIQUE` (SQLite
default = case-sensitive). `Sami@x.com` and `sami@x.com` are two separate accounts; register with one
casing and sign in with the other and you get "Invalid credentials" forever, while password reset would
find you.

**S12 — The `team_members` legacy table is wired to the wrong key.**
`POST /api/team` inserts with `workspace_id = req.userId` (server.js:1660) — the *caller's user id*, not
the workspace — while `GET /api/team` (server.js:1655) and the leads-list assignee join (server.js:1757)
read it with `workspace_id = req.workspaceOwnerId`. For legacy tenants (workspace id == owner id) these
coincide by accident; for post-migration tenants, or when a non-owner adds a "team member", the row is
written where nothing will ever read it. `PUT`/`DELETE /api/team/:id` have the same mismatch, and none of
the four routes has a role check. The frontend Team page does not use `teamAPI` at all — only
`app/leads/[id]/page.js:830` and `app/settings/page.js:15` still import it.

**S13 — `PUT /api/workspace/members/:id` does not validate `role`.** Any string is accepted
(server.js:3636). Unknown roles fail closed at authorization time (`DEFAULT_ROLE_PERMISSIONS[unknown]` is
`undefined` → `{}`, and the literal `includes()` checks reject it), but they corrupt the UI's role
ordering and produce a member nobody can restore without a database edit.

**S14 — `POST /api/auth/register` swallows every error as "Email already exists"** (server.js:1282), and
performs no email-format or password-strength validation. A disk error, a constraint violation on
`workspaces`, and a genuine duplicate are indistinguishable to the caller and to the operator.

**S15 — Architectural smell: one user, one workspace.** `users.workspace_id` being scalar makes
`workspace_members` a lie about the model's expressiveness. Any future work on agencies, multi-brand
studios, or contractors serving several studios is a schema change plus a token change (the workspace
would have to move into the JWT or a switcher endpoint), not a feature.

**S16 — Stale doc references to correct here.** `PRODUCT-AUDIT.md:307` cites `server.js:5594` for the
Command Center mount (now 6544) and calls the impersonation banner "unmounted" (it is mounted at
`app/providers.js:23`). `command-center.js:30` claims per-workspace modules are gated "via the
moduleGate middleware in server.js" — **no `moduleGate` exists anywhere in the repo**, so the
Command Center's per-workspace module toggles are written to `entitlement_overrides` and never enforced
at the route level. `command-center.js:398` still tells the admin that suspended-workspace login
enforcement is a follow-up; `auth` (server.js:250–258) already enforces it.

### UNKNOWNs

* **UNKNOWN: whether `JWT_SECRET`, `CC_IP_ALLOWLIST` and the VAPID keys are actually set in
  production.** `backend/.env` is gitignored and not present in the tree; `backend/.env.example` lists
  `JWT_SECRET=CHANGE_THIS_TO_LONG_RANDOM_SECRET` but does not mention `CC_*`, `SMTP_*`, `FLUX_SSO_SECRET`
  or `TRUST_PROXY` at all. The example file is itself stale relative to the code.
* **UNKNOWN: how many production workspaces are "legacy" (workspace_id == owner user_id) versus
  "modern" (fresh UUID).** This determines how much of the dual-read predicate and the
  `workspaceOwnerId` convention can safely be retired, and cannot be answered without the live database
  at `/data/wappflow.db`.
* **UNKNOWN: whether the account-recovery module and `token_version` are deployed.** Both are
  **untracked/uncommitted** in the working tree as of this read (`?? backend/account-recovery.js`,
  `M backend/server.js`), and the repo's deploy story is a manual `pm2` step by the owner.
* **UNKNOWN: whether any rate limiting protects `/api/auth/register` or `/api/workspace/invite`.**
  Only the global 500-requests-per-15-min-per-IP limiter applies; there is no per-account or
  per-workspace throttle on invite creation.
