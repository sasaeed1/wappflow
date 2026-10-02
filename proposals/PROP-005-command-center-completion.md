# Technical Proposal — Command Center: secure, correct, complete

- **Proposal ID / date:** PROP-005 · 2026-10-02
- **Author:** Claude Code, for the owner
- **Status:** approved (owner: "fix all of it, complete it and finish it"), implementing
- **Source of findings:** `docs/dossier/13-command-center.md`, re-verified against the code on 2026-10-02
- **Priority-order rank:** Security (§A) → Data Integrity (§B) → Consistency (§C) → Features (§D)

## Owner decisions (2026-10-02)

| Question | Decision |
|---|---|
| How customers pay WappFlow | **Manual billing for now.** No gateway; a ledger the founder maintains. Stripe can be added later behind the same tables. |
| Admin login protection | **Authenticator-app 2FA (TOTP)**, required for every admin. IP allowlist kept as an optional extra, fixed. |
| Cross-customer message search | **Yes — founder-only, step-up required, every search and view audited.** |
| Customer support | **In-app help desk.** Customers file and follow tickets from Help; admins answer from Support. |

## A. Security

1. **Database table browser** (`cc-explorer.js`) needs `run_sql` + a step-up token, like the SQL console. Secret columns are redacted from both: password hashes, 2FA secrets, recovery codes, OAuth/session tokens and API keys.
2. **IP allowlist** reads `req.ip` (Express `trust proxy` is already set) instead of the raw `X-Forwarded-For`. Matching is exact or CIDR, never a suffix.
3. **No platform tokens in URLs.**
   - Exports download through an authorised `fetch` and a blob.
   - The live stream uses a 60-second, single-purpose stream ticket (`aud: cc-stream`).
   - `platformAuth` stops reading `?token=` everywhere else.
4. **2FA (RFC 6238 TOTP)**, built on Node `crypto` with no new dependency.
   - Enrolment: QR code / secret plus 10 one-time recovery codes.
   - Login becomes password → 6-digit code. An admin without 2FA is forced through enrolment before the first session token is issued.
   - The secret is encrypted at rest (AES-256-GCM, key derived from `JWT_SECRET`).
   - CLI recovery: `scripts/cc-reset-2fa.js <email>`.
5. **Real logout and revocation.**
   - `cc_admins.token_version`; `POST /api/cc/logout` bumps it.
   - Disabling an admin revokes every one of their sessions.
6. **Impersonation can be ended server-side.**
   - `POST /api/cc/impersonations/:id/end` sets `ended_at`.
   - The core `auth` rejects an impersonation token whose session has ended.
   - The in-app banner's "Exit" calls it.
7. **Destructive actions confirm; the dangerous ones also require step-up.** Step-up (password + code, 5-minute elevated token): suspend, impersonate-write, bulk actions, database browser/SQL, message explorer, admin changes, refunds. Plan change and module off confirm in a dialog only — they are reversible in one click and fully audited.

## B. Data integrity

- **Usage rollup** writes *yesterday* (complete) and *today* (running). Previously the 02:00 run recorded only two hours.
- **One definition of storage used:** `storage-enforce.usedBytes()`, reused by Overview, Customers, Workspace 360 and the Storage dashboard.
- **`/api/cc/events`** applies its filters to the legacy `audit_logs` half too.
- **Grace period expiry** compares `datetime()` values. A string compare of ISO against SQL timestamps delayed it by up to a day.

## C. Consistency (what the screens say)

- **Customers plan filter and tones** are read from the live plan catalog. The old list offered free/starter/growth.
- **Stale copy:** removed the "follow-up rewire" suspend note and the "app-wide enforcement pending" flags note.
- **Workspace 360** renders, adds, pins and deletes admin notes.
- **Permission-aware UI:** `ControlShell` exposes the admin's resolved permissions through context, and pages hide controls the role cannot use.
- **Audit and Event pages** expose their filters.
- **`ControlShell` is responsive:** a phone-width drawer nav, since the founder works from a phone.

## D. Completing what is half-built

| Item | Change |
|---|---|
| Grace periods | An active grace lifts all numeric limits (−1) in `entitlements.getEntitlements` until it ends; `grace_until` is surfaced. Grant and revoke invalidate the cache. |
| Event spine | SQLite triggers write `platform_events` for: user signup, workspace created, lead created, contract signed, payment received, gallery published, booking created. Additive, with no change to any product route or to the WhatsApp flow. |
| Founder Inbox | Persisted items are written for new customer tickets, overdue manual invoices, storage at 100%, and new signups. |
| Usage trends | `GET /api/cc/workspaces/:id/usage` (30/90 days) reads `workspace_usage_daily`; sparklines on Workspace 360 and Overview. |
| Saved views | Customers list saves and loads filter sets (`cc_saved_views`). |

## E. New areas

| Area | Summary | Permission |
|---|---|---|
| **Billing (manual)** | Tables: `cc_subscriptions` (workspace, plan, price, interval, status active/paused/past_due/cancelled/comped, `current_period_end`) and `cc_billing_ledger` (charge/payment/credit/refund/adjustment). Actions: record a payment, credit, refund, pause/resume/cancel, comp. Overview shows **real MRR** from active subscriptions, with implied MRR beside it. A daily job marks unpaid periods past due and raises an Inbox item. | `manage_billing` |
| **System Health** | CPU load, memory, disk (`fs.statfs`), uptime, process memory, DB and WAL size, newest backup age, last run of each scheduled job (recorded in `cc_config`), WhatsApp sessions connected. | `view` |
| **Admins** | List, invite (email + temp password), change role, disable/enable, reset 2FA, revoke sessions. Cannot demote or disable the last founder. | `manage_admins` |
| **Bulk actions** | Customers list multi-select: change plan, suspend, restore, grant grace, set a flag. Step-up; one audit row per workspace. | `bulk_actions` |
| **Message Explorer** | Search message text across workspaces, open a thread. The founder role only, plus step-up. Every search and view is audited, and an entry is written to the customer's own `audit_logs` ("WappFlow support viewed conversations"). | founder role |
| **Plans / flags extras** | `POST /api/cc/plans/:key/clone`; `POST /api/cc/flags/:key/kill` (off everywhere, now). | `manage_plans` / `manage_flags` |
| **Help desk (customer side)** | `cc_tickets` gains `requester_user_id` and `customer_visible`. Customer routes: `GET/POST /api/support/tickets`, `GET /api/support/tickets/:id`, `POST /api/support/tickets/:id/reply`. Admin public replies notify the customer (bell + email); a new customer ticket raises a Founder Inbox item and a live event. "Contact support" and "My tickets" in Help. | workspace `auth` |

## Golden rule

Reuses `ccAudit`, `emit`, `platformAuth`/`requirePerm`, the step-up flow, `entitlements.invalidate`, `storage-enforce.usedBytes`, `notify`/`sendEmail`, `cc_tickets`, `cc_saved_views`, `cc_inbox` and `workspace_usage_daily`. No second implementation of anything that exists.

## Database

Everything is additive and idempotent: `CREATE TABLE IF NOT EXISTS`, guarded `ALTER TABLE ADD COLUMN` and `CREATE TRIGGER IF NOT EXISTS`. Existing rows keep NULLs.
- New tables: `cc_subscriptions`, `cc_billing_ledger`, `cc_stream_tickets` (in-memory only).
- New columns: `cc_admins.token_version`, `.mfa_enabled`, `.mfa_recovery`; `cc_tickets.requester_user_id`, `.customer_visible`, `.updated_at`; `cc_ticket_comments.author_type`, `.author_user_id`.

## Rollout

Deploy as usual. **On the first login after deploy every admin is asked to set up 2FA.** Keep the phone that runs the authenticator app handy. If locked out, run `node scripts/cc-reset-2fa.js <email>` on the server.

**Rollback:** revert the commit. The new tables and columns are inert without the code.
