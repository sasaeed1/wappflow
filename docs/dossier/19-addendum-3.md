## Addendum 3 — Email as a Second Communication Channel (SMTP out, IMAP in)

WappFlow's marketing calls it a unified inbox for studios: WhatsApp, Instagram, Facebook, website forms —
and email. Email is the only one of those channels the platform runs *itself*, with its own credentials,
its own background process, and its own tables. Nowhere else in this dossier is it described as a
subsystem, so this addendum does that: what exists, how it behaves at runtime, and where it stops.

The short version: **outbound email is SHIPPED and used by six different features; inbound email is
PARTIAL and quietly destructive; email automation (templates with triggers, workflows) is
SOLD-NOT-BUILT.**

---

### 1. What "email" means here

A WappFlow tenant is a *workspace* owned by one user (the studio owner). Email is configured **per
workspace, on the owner's user row** — not per team member and not per workspace id. Every email
read/write resolves credentials with `req.workspaceOwnerId` (e.g. `backend/server.js:3819`), so a
five-person studio shares one sending identity and one receiving mailbox.

WappFlow is not a mail server. It borrows the studio's existing mailbox:

* **Outbound** — the studio pastes SMTP host/port/user/password (Gmail app password, SendGrid key, etc.)
  into Settings, and WappFlow opens a `nodemailer` connection per message.
* **Inbound** — the studio pastes IMAP credentials for the *same* mailbox, and a background loop inside
  the API process logs into it every two minutes, reads unread messages, and files matching ones onto
  lead records.

There is no shared platform mail domain for tenant mail, no sending reputation owned by WappFlow, and no
webhook-based provider (no SES/Postmark/Mailgun). Dependencies are `nodemailer ^8.0.7`, `imap ^0.8.19`
and `mailparser ^3.9.8` (`backend/package.json:26,29,33`).

---

### 2. The five tables

All are created in the one big `db.exec` schema block in `server.js`.

| Table | Line | Key columns | Purpose |
|---|---|---|---|
| `email_smtp_settings` | `server.js:564` | `user_id` **UNIQUE**, `smtp_host`, `smtp_port` (default 587), `smtp_secure`, `smtp_user`, `smtp_pass`, `from_name`, `from_email` | One outbound identity per workspace owner |
| `email_imap_settings` | `server.js:593` | `user_id` **UNIQUE**, `imap_host`, `imap_port` (default 993), `imap_secure` (default 1), `imap_user`, `imap_pass`, `is_enabled` (default 0) | One inbound mailbox per workspace owner |
| `lead_emails` | `server.js:578` | `id`, `lead_id`, `workspace_id`, `user_id`, `direction` (`sent`/`received`), `from_email`, `to_email`, `subject`, `body`, `status`, `created_at` | The per-lead email thread, both directions |
| `email_templates` | `server.js:428` | `id`, `user_id`, `name`, `subject`, `body`, `delay_days`, `trigger_event` (default `manual`) | Reusable follow-up copy |
| `email_workflows` | `server.js:440` | `id`, `user_id`, `workspace_id`, `lead_id`, `template_id`, `template_name`, `template_subject`, `status` (default `pending`), `scheduled_at`, `sent_at` | A template "queued" against a lead |

Notes on shape:

* `lead_emails` has **no `message_id`, no `in_reply_to`, no `thread_id`, no attachment columns and no
  `read_at`**. Threading, attachments and read state simply do not exist in the data model.
* `email_workflows.workspace_id` was added later by a migration (`server.js:737`) with a backfill from
  `users.workspace_id` (`server.js:742`) — the same owner-id-vs-workspace-id confusion documented in
  §15. Reads still carry the dual predicate `(workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))`
  (`server.js:2035`).
* The only index is `idx_lead_emails_lead ON lead_emails(lead_id)` (`server.js:906`). There is no index
  on `workspace_id`, `direction`, or `created_at`, and the inbound dedup query filters on
  `(lead_id, direction, from_email, subject, created_at)`.

---

### 3. Endpoint inventory

| Method | Path | Line | Auth / role | Notes |
|---|---|---|---|---|
| GET | `/api/settings/email-smtp` | `3701` | `auth` only | Password masked to `••••••••`; host/port/user returned to **any** member |
| PUT | `/api/settings/email-smtp` | `3710` | `auth` + `super_admin\|admin` | Masked value round-trips and preserves the stored password (`3715`) |
| POST | `/api/settings/email-smtp/test` | `3729` | `auth` only | `transporter.verify()` then sends a test mail to `from_email` |
| GET | `/api/settings/email-imap` | `3753` | `auth` only | Password masked |
| PUT | `/api/settings/email-imap` | `3761` | `auth` + `super_admin\|admin` | Sets `is_enabled`, which is what enrols the mailbox in the global poller |
| POST | `/api/settings/email-imap/test` | `3779` | `auth` only | Opens a real IMAP connection with the owner's stored credentials; `connTimeout 10s`, `authTimeout 8s` |
| POST | `/api/settings/email-imap/poll-now` | `3859` | `auth` only | `await triggerEmailPoll(req.workspaceOwnerId)` — the HTTP request blocks on a full mailbox poll |
| GET | `/api/leads/:id/emails` | `3804` | `auth`, lead scoped via `getScopedLead` | Full thread, newest first |
| POST | `/api/leads/:id/email` | `3813` | `auth`, lead scoped | Compose + send; 400 if SMTP unconfigured |
| POST | `/api/invoices/:id/email` | `2728` | `auth` | Renders the invoice document and mails it; flips a `draft` invoice to `pending` (`2764`) |
| GET/POST/PUT/DELETE | `/api/email-templates[/:id]` | `2773`–`2799` | `auth`, keyed to `workspaceOwnerId` | Plain CRUD |
| GET/POST | `/api/leads/:leadId/email-workflows` | `2028`, `2042` | `auth`, lead scoped | Creates a row with `status='pending'` |
| PUT | `/api/email-workflows/:id/status` | `2060` | `auth` | Manual status flip only |

Frontend bindings live in `wappflow-web/src/lib/api.js`: `settingsAPI.getEmailSmtp/updateEmailSmtp/testEmailSmtp`
(`:128-130`), `leadEmailsAPI.getAll/send/pollNow` (`:133-137`), `emailTemplatesAPI` (`:189`),
`emailWorkflowsAPI.updateStatus` (`:196`). The IMAP settings tab bypasses the api client entirely and
uses raw `fetch` against `NEXT_PUBLIC_BASE_URL` (`settings/page.js:2617`, `:2635`, `:2650`).

---

### 4. Outbound — SMTP. **SHIPPED**, with no delivery infrastructure

Every send follows the same three lines: read the owner's `email_smtp_settings` row, build a *fresh*
`nodemailer.createTransport({host, port, secure, auth})`, call `sendMail`. That pattern is copy-pasted at
six sites:

| Sender | Line | Trigger |
|---|---|---|
| Lead compose | `server.js:3822` | Studio clicks Compose Email on a lead |
| Invoice email | `server.js:2740` | Studio emails an invoice |
| SMTP self-test | `server.js:3733` | Settings → Email Sending → Test |
| Team invite | `server.js:3564` | Inviting a member; falls back to returning a copyable link when SMTP is absent |
| `sendEmail` seam → Contracts Studio | `server.js:6504` | Send-for-signature and 8am reminders (`contracts-studio.js:450`, `:799`, `:995`) |
| `sendEmail` seam → Command Center | `server.js:6574` | Scheduled platform reports (`cc-reports.js:73-78`) |

Password reset is a seventh path with its own precedence: platform `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`
env vars first, then the workspace owner's row, then a loud operator error and silent failure
(`account-recovery.js:63-92`).

What is missing on this side, in code terms:

* **No queue and no retry.** `await transporter.sendMail(...)` inside the request handler. A transient
  SMTP failure returns 500 to the browser (`server.js:3844`) and the message is gone. The `sendEmail`
  seam swallows failures into `delivery.email = 'failed'` (`contracts-studio.js:995`) and never retries.
* **No bounce, complaint or unsubscribe handling anywhere.** A repo-wide grep for
  `unsubscribe|bounce|dkim|spf|dmarc` in `backend/` matches only the *web-push* unsubscribe route
  (`server.js:3218`). `lead_emails.status` is written as the literal `'sent'` at insert time and never
  updated.
* **No SPF/DKIM guidance in the product.** The Email Sending tab offers host presets for Gmail, Office
  365, Yahoo, Zoho and SendGrid (`settings/page.js:2521-2527`) and stops there.
* **No transport reuse or pooling** — a new TCP+TLS+AUTH handshake per message.
* **Attachments are a UI lie.** The compose modal has a paperclip button, a hidden multi-file input and
  a chip list of chosen files (`leads/[id]/page.js:2902-2909`, `:2925-2938`), but `handleSend` posts only
  `{to_email, subject, body}` (`:2826`) and the backend never reads attachments. Selected files are
  silently discarded. **STUB.**
* The body is `contentEditable` `innerHTML`; the backend sets `html: body.replace(/\n/g,'<br>')` and
  `text: body` (`server.js:3831-3832`) — so the plaintext alternative part of every outgoing mail
  contains raw HTML markup.

---

### 5. Inbound — the IMAP poller. **PARTIAL**, and it changes state in the studio's real mailbox

`startEmailPoller()` is defined at `server.js:3870` and **called unconditionally at module load**
(`server.js:3990`), inside the same process that serves every HTTP request, the SSE bus, the WhatsApp
Puppeteer sessions and the crons. It does `pollAll()` immediately, then `setInterval(pollAll, 2*60*1000)`
(`:3985-3986`).

`pollAll(filterUserId)` (`:3961`) selects every enabled mailbox platform-wide:

```
SELECT i.*, u.workspace_id
FROM email_imap_settings i
JOIN users u ON u.id = i.user_id
WHERE i.is_enabled = 1 AND i.imap_host != '' AND i.imap_user != '' AND i.imap_pass != ''
```

then loops **sequentially, awaiting each one**: `for (const config of configs) { await pollWorkspace(config); }`
(`:3975-3977`).

`pollWorkspace(config)` (`:3874`) then, per mailbox:

1. Connects with `tls: !!imap_secure`, **`tlsOptions: { rejectUnauthorized: false }`**, `connTimeout: 20000`,
   `authTimeout: 10000` (`:3880-3884`).
2. `imap.openBox('INBOX', false, …)` — read-write (`:3888`).
3. `imap.search(['UNSEEN'], …)` — **the entire unread backlog, with no date window and no result cap**
   (`:3890`).
4. `imap.fetch(results, { bodies: '', markSeen: true })` (`:3893`) — fetches full raw messages and
   **marks them Seen on the studio's real Gmail/Exchange/Zoho mailbox**.
5. Buffers each raw message into a JS string, `simpleParser`s it (`:3901`), and takes
   `parsed.from.value[0].address.toLowerCase()`, `parsed.subject`, and `parsed.text || parsed.html`
   (`:3902-3904`).
6. **Match or discard** (`:3908-3917`):
   ```
   SELECT * FROM leads
   WHERE LOWER(email) = ? AND workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL) LIMIT 1
   ```
   No lead → `console.log('No lead found for: …')` and `return`. The message is dropped.
7. Dedup: skip if a `received` row exists for the same `lead_id + from_email + subject` within
   `datetime('now','-10 minutes')` (`:3919-3927`).
8. Insert into `lead_emails` with `direction='received'`, `to_email = config.imap_user`
   (`:3930-3935`), write `addContactHistory(lead.id, lead.user_id, 'email', 'Email received: …')`
   (`:3936`) — which also writes the unified activity spine via `logActivity` (`server.js:1231`) — and
   broadcast `email_received` with `{lead_id, from_email, subject, preview}` (`:3937-3941`).

The SSE event goes through `broadcastToWorkspace` (`server.js:1030`), i.e. an unnamed frame carrying
`data.type`. The lead page subscribes via `useRealtime(['new_message','lead_updated','email_received'])`
and refetches on receipt (`leads/[id]/page.js:732`, `:740`).

**The consequences of step 6 are the important part.** Email is the *only* channel that never creates a
contact. WhatsApp (`whatsapp-service.js:370`, `:1276`), Instagram (`server.js:5160`), Facebook
(`server.js:5222`), the website form (`server.js:5272`), the public booking page (`booking.js:405`) and
the print store (`print-store.js:150`) all `INSERT INTO leads` for an unknown sender. Inbound email does
not. A first-contact enquiry by email is marked read in the studio's inbox and then thrown away by
WappFlow — no lead, no notification, no record. The "unified inbox" claim only holds for people already
in the CRM *whose `leads.email` matches the sender address exactly* (case-insensitively). A reply from
`jane@work.com` when the lead row says `jane.doe@gmail.com` is discarded; so is any `+tag` alias, any
forwarded thread, and any reply from a colleague on the same booking.

Note also that email never becomes a *message*: it lands in `lead_emails`, not `messages`, and the lead
page's platform tab bar has exactly four tabs — WhatsApp, Instagram, Facebook, Website
(`leads/[id]/page.js:1658-1662`). Email lives in two separate lead tabs, `emails` and `email-flow`
(`:1230-1231`).

---

### 6. Templates and workflows — **SOLD-NOT-BUILT**

The Email Templates tab is titled "Email Follow-up Templates … for automated follow-up workflows"
(`settings/page.js:483`) and offers a `trigger_event` dropdown with `manual`, `on_contacted`,
`on_interested`, `on_negotiating`, `on_won` plus a "Send After (days)" field (`:477-481`, `:501-509`).
It also advertises `{name} {phone} {email} {company}` substitution variables (`:519`).

None of it runs. A repo-wide grep for `trigger_event` and `delay_days` returns only the schema
(`server.js:434-435`), the two CRUD handlers (`server.js:2782-2794`) and the settings form itself. **No
cron, no scheduler and no status-change hook ever reads either column.** The six `cron.schedule` calls in
the backend are metering, CC reports, grace sweeps, contract reminders, the per-minute reminder push and
a midnight job (`cc-metering.js:104`, `command-center.js:889`/`:905`, `contracts-studio.js:1128`,
`server.js:3999`/`:4039`) — none touch `email_templates` or `email_workflows`. There is no variable
substitution code anywhere.

`email_workflows` is the same story one level down: `POST /api/leads/:leadId/email-workflows` inserts a
row with `status='pending'` and a `scheduled_at` (`server.js:2049-2053`), and nothing ever sends it. The
UI's only affordance for a pending row is a **"Mark Sent"** button that calls
`emailWorkflowsAPI.updateStatus(wf.id,'sent')` (`leads/[id]/page.js:2262-2264`) — a human marking their
own manual work as done. `email_workflows` is a to-do list rendered as an automation.

---

### 7. Plan gating — declared, never enforced

`entitlements.js:35` and the plan matrix in `server.js:5483-5558` define four flags: `email_integration`,
`email_templates`, `email_sending`, `email_receiving`. All four are `false` on the free tier
(`server.js:5483-5486`) and `true` from Studio upward (`:5514-5517`). Outside those definitions the
strings appear **nowhere** in the backend — no route checks them. SMTP and IMAP configuration, sending
and polling are all reachable on any plan. (For contrast, the frontend does not gate the three Settings
tabs either: `settings/page.js:61-63` lists them unconditionally.)

---

### 8. Bugs, security weaknesses, data-integrity risks and smells

1. **`markSeen: true` mutates a third-party system irreversibly** (`server.js:3893`). Enabling Email
   Receiving hands WappFlow the power to mark the owner's real mail read, and it exercises it on *every*
   unread message — including the ones it then discards for having no matching lead. The first poll after
   enabling processes the entire UNSEEN backlog at once. Nothing in the UI warns about this; the "How it
   works" panel says only that matching replies get filed (`settings/page.js:2799-2804`). This is the
   single most user-hostile behaviour in the email subsystem.
2. **No re-entrancy guard on the poller.** `setInterval(pollAll, 120000)` (`:3986`) fires on a wall clock
   while `pollAll` is an un-awaited async function that walks every enabled mailbox **sequentially**
   (`:3975`). With ~7 mailboxes at the 20s connect + 10s auth ceiling, a single run can exceed the
   interval and runs begin to overlap and stack, multiplying concurrent IMAP connections against the same
   accounts (Gmail caps simultaneous IMAP connections). This is a hard scaling ceiling on the number of
   tenants that can have Email Receiving on at once — §17 never names it.
3. **A hung mailbox can kill the poller permanently.** `connTimeout`/`authTimeout` only cover connect and
   auth. If `openBox` or `fetch` never calls back after `ready`, the promise returned by `pollWorkspace`
   never resolves, the `await` in the loop never returns, and every mailbox behind it stops being polled
   until the process restarts. There is no overall timeout, no `Promise.race`, and no `imap.end()` on a
   stall.
4. **`rejectUnauthorized: false` on both IMAP paths** (`server.js:3785`, `:3882`) disables TLS
   certificate verification, so the mailbox password is offered to whatever answers on that host:port.
   §15 flags this; it is worth restating that it applies to the *live poller*, not just the test button.
5. **Plaintext credentials.** `email_smtp_settings.smtp_pass` and `email_imap_settings.imap_pass` are
   stored unencrypted (`server.js:571`, `:600`); masking happens only on read (`:3705`, `:3757`). Combined
   with the `/api/storage/file` traversal in §15, a DB read hands over every tenant's mailbox password.
6. **Un-role-gated capability endpoints.** `PUT` on both settings routes requires `super_admin|admin`
   (`:3712`, `:3763`), but `GET` (`:3701`, `:3753`), `POST …/test` (`:3729`, `:3779`) and
   `POST …/poll-now` (`:3859`) require only `auth`. Any member — including the lowest role — can read the
   owner's SMTP/IMAP hostnames and account addresses, cause a test mail to be sent, and trigger a poll of
   the owner's mailbox. `poll-now` has no rate limit and blocks the request thread on a full poll, so it
   is also a cheap way to pile up IMAP connections.
7. **Stored XSS from inbound mail.** The ingester stores `parsed.text || parsed.html` (`:3904`), so a
   message with no plaintext part is stored as attacker-controlled HTML, and `EmailBodyRow` renders
   `em.body` with `dangerouslySetInnerHTML` and no sanitiser (`leads/[id]/page.js:146`). An unsolicited
   email from an address that matches a lead is a direct injection vector into the studio's authenticated
   session. (Also raised in §15; it belongs to this subsystem.)
8. **Data loss in the dedup window.** Two genuinely different emails from the same address with the same
   subject inside 10 minutes — "Re: Wedding" sent twice with new information — collapse to one stored row
   (`:3919-3927`). Because no `Message-ID` is stored, correct dedup is impossible and re-ingestion after
   any manual "mark unread" is equally impossible to detect beyond 10 minutes.
9. **Silent loss on parse/insert failure.** `markSeen` happens at fetch time, before parsing. If
   `simpleParser` rejects (`.catch(e => console.error(...))` at `:3945`) or the insert throws, the message
   is already read in the real mailbox and was never stored. There is no dead-letter path.
10. **Unbounded memory on first run.** Each message body is accumulated into a JS string (`:3898-3899`)
    and every parse promise is pushed into an array held until `Promise.all` (`:3947`). A mailbox with
    thousands of unread messages, or a few large ones, is fetched whole into the API process's heap.
11. **A race at `fetch.once('end')`.** The `promises` array is appended inside the per-message body
    `stream.once('end')` handler; `fetch.once('end')` resolves on `Promise.all(promises)` (`:3947`). If
    the fetch-level `end` can fire before the last body stream's `end`, that message's promise is not
    awaited before `imap.end()`. Not proven to fire in practice — see UNKNOWN below.
12. **Six copies of the transport-building code.** `nodemailer.createTransport` appears at
    `server.js:2740`, `:3564`, `:3733`, `:3822`, `:6507`, `:6577` plus `account-recovery.js:93`, each
    with slightly different `from` fallbacks (`from_name || 'WappFlow'` in most places, `smtp_user`
    directly in the team invite at `:3574`). The `sendEmail` seam injected into Contracts Studio and
    Command Center is the right abstraction; the other five sites predate it and were never migrated.
13. **Inbound email is invisible to universal search.** `search.js` queries leads, members and other
    entities but never `lead_emails` — an email body is not findable from the global search bar.
14. **The poller writes `lead.user_id` as the row's `user_id`** (`:3934`) while outbound writes
    `req.userId` (`:3838`), so `lead_emails.user_id` means two different things depending on direction.

---

### 9. Maturity verdicts

| Capability | Verdict | Named gap |
|---|---|---|
| SMTP config + test + per-lead compose/send | **SHIPPED** | 400s until configured; no retry |
| Invoice email, contract-for-signature email, team invite, password reset | **SHIPPED** | all depend on the tenant's own SMTP; contract/report senders swallow failures |
| Outbound attachments | **STUB** | UI collects files, request drops them |
| Delivery health (bounces, complaints, unsubscribes, auth guidance) | **SOLD-NOT-BUILT** | zero code |
| IMAP config + test + manual poll | **SHIPPED** | no role gate on test/poll |
| Inbound ingestion into a lead thread | **PARTIAL** | exact-address match only; unmatched mail marked read and discarded; no attachments, no threading |
| Email as a lead source | **NOT BUILT** | every other channel creates leads; email never does |
| Email templates with `trigger_event` / `delay_days` / variables | **SOLD-NOT-BUILT** | columns stored, never read |
| Email workflows (scheduled sends) | **SOLD-NOT-BUILT** | rows created, only a manual "Mark Sent" |
| Per-plan email entitlements | **SOLD-NOT-BUILT** | four flags defined, zero enforcement sites |

---

### 10. Unknowns

* **UNKNOWN: real-world delivery success.** No logging, metrics or status column tracks whether a
  `sendMail` that resolved was actually delivered; `lead_emails.status` is a constant.
* **UNKNOWN: how many tenants have `is_enabled = 1`.** This is a production-data question; the code
  imposes no cap and the deployment docs (`DEPLOYMENT.md:454`) start a single non-clustered pm2 process,
  so the failure mode is one shared serial loop for the whole platform.
* **UNKNOWN: whether the `fetch.once('end')` / body-stream race (finding 11) actually fires** with
  `imap@0.8.19`'s event ordering — establishing that needs a runtime test, not a read.
* **UNKNOWN: behaviour against non-Gmail servers** (Exchange folder layouts, servers that reject
  `markSeen` on a read-only-ish INBOX). Only `INBOX` is ever opened (`:3888`); no folder is configurable.
