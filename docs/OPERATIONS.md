# WappFlow operations runbook

Things only someone with access to the production server can do. Each section says what to run and how to
check it worked. Command Center → **System Health** shows most of these at a glance.

## 1. Platform email (password resets, verification, support replies)

Without it, password-reset links, email-confirmation links and support-reply emails are never sent.

1. Pick any SMTP provider (Google Workspace, Zoho, Brevo, Mailgun, Amazon SES). Create an app password.
2. In `/var/www/wappflow/backend/.env` set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
   `SMTP_FROM`.
3. `pm2 restart wappflow-api`
4. Check: System Health → "Platform email" is green. Then use **Forgot password** on your own account.

## 2. Off-site backups (Cloudflare R2)

1. Cloudflare → R2 → create a bucket, e.g. `wappflow-backups`. In the bucket's **Settings → Object lifecycle**,
   add a rule to delete objects after 30 days.
2. R2 → **Manage API tokens** → create a token with *Object Read & Write* on that bucket. Note the Access Key ID,
   Secret Access Key and your Account ID.
3. Generate the encryption key on the server: `openssl rand -hex 32`. **Save it in your password manager** — a
   backup cannot be restored without it.
4. In `backend/.env` set `BACKUP_R2_BUCKET`, `BACKUP_ENCRYPTION_KEY`, `BACKUP_R2_ACCOUNT_ID`,
   `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`.
5. Run one now: `cd /var/www/wappflow/backend && NODE_ENV=production DATA_DIR=/data node backup.js`. It should
   end with two `✓ off-site` lines.
6. Make sure the nightly job exists on THIS server: `ls -l /etc/cron.daily/wappflow-backup`. If it is missing:
   ```
   printf '#!/bin/sh\ncd /var/www/wappflow/backend && sudo -u ubuntu NODE_ENV=production DATA_DIR=/data node backup.js >> /var/log/wappflow-backup.log 2>&1\n' | sudo tee /etc/cron.daily/wappflow-backup
   sudo chmod +x /etc/cron.daily/wappflow-backup
   ```
7. Check: System Health → "Newest backup" and "Off-site backups" are green. If backups stop for 36 hours the
   Founder Inbox says so.

**Restore:** download the `.enc` file from R2, then
`BACKUP_ENCRYPTION_KEY=… node backup.js --decrypt file.db.enc restored.db` and
`node backup.js --verify-only restored.db`.

## 3. Rotate credentials

Do these one at a time and check the app after each.

| Credential | Where | Effect of rotating |
|---|---|---|
| `JWT_SECRET` | `backend/.env` | Signs everyone out (customers and admins) — they sign in again. Use 64+ random characters: `openssl rand -hex 48`. |
| Command Center admins | Admins & Security → Reset password; each admin sets up 2FA again if reset | — |
| R2 keys (`R2_*`, `BACKUP_R2_*`) | Cloudflare → R2 → API tokens: create new, update `.env`, restart, then delete the old token | — |
| SMTP password | Your mail provider → new app password → `.env` → restart | — |
| AI provider keys (`GROQ_API_KEY`, etc.) | Provider dashboard → new key → `.env` → restart → revoke old | — |
| Meta page tokens | Each customer reconnects in Settings → Connections when theirs expire | — |

After any `.env` change: `pm2 restart wappflow-api`.

## 4. Remove the demo data

Every demo row has an id starting `demo-`, so this removes exactly those and nothing else:
`cd /var/www/wappflow && NODE_ENV=production DATA_DIR=/data node scripts/seed-demo.js --clean`

## 5. Commit the server's local changes

The production `backend/server.js` carries edits that are not in GitHub (rate-limit bypass, sign-up and invite
limits). Until they are committed, every deploy depends on `git stash` / `git stash pop` merging cleanly.
On the server run `cd /var/www/wappflow && git diff --stat && git diff backend/server.js > ~/server-local.patch`
and share the patch so it can be added to the repository properly.

## 6. Customer locked out of two-step sign-in

After confirming who they are: `cd /var/www/wappflow/backend && node scripts/reset-user-2fa.js their@email.com`
(admins: `node scripts/cc-reset-2fa.js admin@email.com`).
