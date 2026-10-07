# Technical Proposal — Close the open findings, unfinished features and operational gaps

- **Proposal ID / date:** PROP-006 · 2026-10-05
- **Author:** Claude (for the owner)
- **Status:** approved (owner: "we need to fix Open findings, UX standards, accessibility and known gaps…", 2026-10-05)
- **Audit findings addressed:** the "Open findings", "Built but unfinished" and "Operational gaps" tables of the
  WappFlow Product, Experience & Security Reference (2026-10-05)
- **Priority-order rank:** Security → Data Integrity → Consistency → UX

## Owner decisions (2026-10-05)

| Question | Decision |
|---|---|
| Unbuilt plan features | Build **multiple pipelines** now. **Hide** AI editing, bring-your-own AI key, API access and SSO from plans and pricing until built. (No preference given → recommended option.) |
| Trials | New sign-ups get a **14-day Studio trial**, then drop to Creator automatically with a notice; Command Center can extend. (No preference → recommended.) |
| Off-site backups | **Cloudflare R2**, encrypted, nightly. |
| Customer 2FA | **Optional for everyone**; a workspace owner can require it for their whole team. |

## 1. Problem → 2. Solution (one row per finding)

| # | Finding | Solution |
|---|---|---|
| 1 | Role permissions defined but not enforced server-side (delete leads, reports, settings, invoices, WhatsApp) | One `requirePerm(key)` middleware reading the already-resolved `req.userPermissions`; applied to every route in those families. UI keeps hiding; server now refuses (403). |
| 2 | `/uploads` files public with guessable names | All new upload names get 128 bits of randomness. `/uploads` responses gain `nosniff` and a `sandbox` CSP so an uploaded HTML/SVG can never run script. Existing files keep working (no URL breakage). |
| 3 | Gallery passwords fast-hashed, unlimited guesses | bcrypt for new/changed passwords; legacy SHA-256 hashes verified then upgraded on first correct entry; 10 wrong guesses per gallery per IP per 15 min. |
| 4 | CSP off | API: strict CSP (`default-src 'none'`). Web app: CSP that still allows the app's own inline bootstrap, Google sign-in, LiveKit and storage hosts; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`. Tokens remain in localStorage (moving to cookies is a separate, larger change). |
| 5 | No customer 2FA / email verification | Reuse `cc-security.js` TOTP + sealing (Golden Rule). Optional per user; owner toggle "require for team". Email verification link on sign-up with an in-app banner; never blocks sign-in (SMTP may be unset). |
| 6 | Backups on same disk | `backup.js --offsite` encrypts (AES-256-GCM, `BACKUP_ENCRYPTION_KEY`) and uploads to R2 via the existing storage provider config. System Health + Founder Inbox alert when the newest backup is older than 36 h. |
| 7 | Multiple pipelines sold, not built | `pipelines` table (workspace-scoped), `leads.pipeline_id` (NULL = default). The six lifecycle statuses stay the source of truth (analytics unchanged); each pipeline can relabel its stages. Dashboard pipeline switcher; plan-gated by `multi_pipeline`. |
| 8 | Drip emails never sent | A minute cron sends due `email_workflows` through the workspace's SMTP; marks sent/failed with error; timeline + audit. |
| 9 | Outbound queue never fed | The WhatsApp flow must not be touched, so the queue is **deprecated** (Article 11): page link removed, routes kept read-only. |
| 10 | IG/FB replies saved as drafts | Send through the Meta Graph API with the page token already stored on the account; on failure keep the draft and say why. |
| 11 | Trial date not enforced | 14-day Studio trial on sign-up; hourly sweep downgrades expired trials to Creator, notifies the owner and the Founder Inbox. |
| 12 | Unbuilt features advertised | Add `byok`, `api_access`, `sso` to `UNBUILT_FEATURES`; remove them and AI editing from pricing/landing copy. |
| 13 | Accessibility check failing 3/9 | Name the 2 buttons, make the 15 clickables keyboard-reachable, label fields until under budget. |
| 14 | Operational | Password-reset UX states when email isn't configured; remove the invented testimonial; UX pass on Analytics/Clients/Knowledge/Team; runbook for SMTP, credential rotation, demo-data clean-up and committing the server's local edits. |

## 3. Golden-Rule check
Reuses `cc-security.js` (TOTP/seal), `storage/` (R2), `entitlements.js` (`UNBUILT_FEATURES`), `notify`, `logAudit`,
`sendEmail`, the existing `email_workflows` table, `platform_accounts.credentials`. No second implementation.

## 4–6. Modules, DB, APIs
CRM, Settings, Media Studio, Platform, Command Center. Additive columns only (`users.mfa_*`, `users.email_verified_at`,
`workspaces.require_2fa`, `leads.pipeline_id`, `pipelines`, `email_workflows.error`); no drops. New routes are
listed in the PR.

## 8. Standards
Permissions (server-enforced), Audit (every new action), Notifications (trial, backups, 2FA), Plan Enforcement
(pipelines), A11y, Responsive, Error Handling.

## Out of scope (roadmap, not "fixes")
Further industry modules, the native mobile app, print-lab integration, moving sessions to httpOnly cookies,
verifying web push on a physical phone (owner to test).
