## CRM — leads, pipeline, clients and contact intelligence

> **Line-citation snapshot note (added 2026-08-24).** This section's `backend/server.js` citations were
> written against an earlier snapshot than the one §14/§15 were pinned to. Measured against the current
> file (**6,595 lines**), they run low by roughly **+20 lines below ~line 2,000 and up to +50 lines above it**
> — beyond the dossier-wide ±25 tolerance stated in §01. The endpoints named below have been re-pinned to the
> current file; for any other `server.js:NNNN` reference in this section, grep for the quoted code rather than
> trusting the number.

### What this part of the product is for

WappFlow is sold as a "Creative Business Operating System" for photo/video studios, and the CRM is
the room where a stranger becomes a paying customer. Somebody messages the studio on WhatsApp (or
Instagram, Facebook, a website form, or a public booking page); WappFlow turns that first message
into a **lead** — a single row that holds the person's name, phone, email, pipeline stage, money
estimate, tags, owner, and every message ever exchanged. The studio moves that lead through six
pipeline stages, sets follow-up reminders, writes notes, sends invoices, and eventually marks it
**Closed - Won**, at which point the same row is re-labelled a **client** and moves to a separate
Clients page. It never becomes a different record — a client *is* a lead with `is_client = 1`. This
matters more than it sounds: it means the whole product has exactly one contact table, and every
other module (Contracts, Bookings, Media Studio, Invoices, Print Store) hangs off `leads.id` via a
`lead_id` foreign key.

Almost the entire CRM lives in one file: `backend/server.js` (~6,500 lines), which also owns auth,
the SSE bus, invoices, and the mounting of every other module. The frontend is Next.js App Router:
`wappflow-web/src/app/leads-list/page.js` (the list), `app/leads/[id]/page.js` (the contact record,
~2,960 lines), `app/clients/page.js`, `app/dashboard/page.js` (a Kanban board), and `app/trash/page.js`.

---

### The data model

#### `leads` — the contact spine

Created at `backend/server.js:275` with only eleven columns; everything since has been bolted on
with `safeAlter('ALTER TABLE leads ADD COLUMN …')` (lines 633–705). The live column set (verified
against `backend/wappflow.db`) is:

| Column | Type | Meaning / notes |
|---|---|---|
| `id` | TEXT PK | UUID-ish string from `generateId()` (`server.js:1091`) — `Math.random()`-based, **not** crypto-random |
| `user_id` | TEXT | The creating user. Legacy; **not** the tenant key |
| `workspace_id` | TEXT | **The tenant key.** Added at `server.js:688`, backfilled from `user_id` at `server.js:933` |
| `customer_name`, `customer_phone` | TEXT | For Instagram/Facebook leads `customer_phone` holds the platform sender id, not a phone |
| `wa_username` | TEXT | WhatsApp push-name, captured on ingest (`whatsapp-service.js:348`) |
| `email`, `address`, `date_of_birth` | TEXT | Optional contact detail |
| `status` | TEXT, default `'New'` | Pipeline stage — see below |
| `first_message` | TEXT | The inbound text that created the lead |
| `total_messages` | INTEGER | Denormalised counter, incremented on every send/receive |
| `estimated_value` / `actual_sale` | REAL | Pipeline forecast vs. the single closed deal amount |
| `assigned_to` | TEXT | A `workspace_members.user_id` |
| `lead_source` | TEXT | Free text (manual/CSV only) |
| `platform_source` | TEXT | `whatsapp` \| `instagram` \| `facebook` \| `website` |
| `platform_account_id` | TEXT | Which connected inbox it arrived on |
| `is_client` / `client_since` | INTEGER / TIMESTAMP | Client promotion flag + first-promotion date |
| `closed_at`, `lost_reason` | TIMESTAMP / TEXT | Stamped when moved to a Closed stage |
| `last_message_at`, `last_contacted_at` | TIMESTAMP | Any activity vs. **outbound** activity |
| `lead_score`, `sentiment`, `urgency`, `intent_category`, `ai_last_analyzed_at` | — | Written only by the AI analyze route (`server.js:4163`) |
| `is_deleted`, `deleted_at`, `deleted_by` | — | Recycle bin |

#### Related tables

| Table | Key columns | Purpose |
|---|---|---|
| `notes` (`server.js:290`) | `id, lead_id, user_id, content, created_at` | Free-text notes. No `workspace_id` |
| `reminders` (`server.js:300`) | `id, lead_id, user_id, title, message, due_date, reminder_date, completed, is_completed` | Follow-up alarms. **Four columns for two concepts** — see Risks |
| `tags` (`server.js:321`) | `id, user_id, name, color` | Workspace-wide labels, keyed by *workspace owner's* user id |
| `lead_tags` (`server.js:330`) | `(lead_id, tag_id)` PK, `ON DELETE CASCADE` | Many-to-many join |
| `contact_history` (`server.js:435`) | `id, lead_id, user_id, type, description, metadata` | Legacy per-lead event log; still written, no longer read by the timeline |
| `activity_timeline` (`server.js:792`) | `id, lead_id, workspace_id, user_id, actor_name, activity_type, platform, title, body, metadata` | **The activity spine** — see below |
| `lead_channels` (`server.js:768`) | `id, lead_id, platform, identifier`, `UNIQUE(lead_id, platform, identifier)` | Extra handles for the same person |
| `lead_relations` (`server.js:781`) | `id, lead_id_a, lead_id_b, relation_type`, `UNIQUE(a,b)` | "These two records are the same person / related" |
| `messages` (`server.js:338`) | `id, lead_id, body, from_me, media_url, media_type, platform, wa_message_id, timestamp` | Conversation history |
| `lead_emails` (`server.js:558`) | `id, lead_id, workspace_id, direction, from_email, to_email, subject, body` | SMTP/IMAP email thread |
| `meetings` (`server.js:851`) | `id, workspace_id, lead_id, provider, starts_at, meet_link, event_id` | Google Meet events |
| `saved_views` (`backend/saved-views.js:26`) | `id, workspace_id, user_id, entity, name, filters`, `UNIQUE(ws,user,entity,name)` | Per-user saved filter combos |

Hot-path indexes are created idempotently at `server.js:875-908` (`idx_leads_ws`, `idx_leads_ws_phone`,
`idx_leads_ws_deleted`, `idx_messages_lead_ts`, `idx_activity_timeline_lead`, …).

---

### Multi-tenancy and per-member visibility

Every request passes through the `auth` middleware (`server.js:190`). It resolves three things onto
`req`:

* `req.workspaceId` — from `users.workspace_id`, falling back to the user's own id for legacy accounts.
* `req.workspaceOwnerId` — the `super_admin` member's user id, used for *shared* data that was never
  re-keyed (tags, message presets, company settings, email templates).
* `req.canViewAllLeads` (`server.js:216`) — a per-member permission. `DEFAULT_ROLE_PERMISSIONS`
  (`server.js:184`) grants `view_all_leads` to `super_admin`, `admin` and `manager`, and denies it to
  `user`. A JSON `permissions` blob on `workspace_members` overrides the role default.

The single authorization helper is **`getScopedLead(req, leadId)`** (`server.js:250`): it selects the
lead `WHERE id = ? AND workspace_id = ?` and then returns `null` if `!req.canViewAllLeads &&
lead.assigned_to !== req.userId`. Every sub-resource route (messages, notes, reminders, tags,
channels, timeline, AI, emails, meetings) calls it and 404s when it returns null. This is the
correct pattern and it is applied consistently on **reads**. It is **not** applied on several
top-level lead mutations (see Risks).

---

### How a lead is created (capture routes)

| Path | Where | Dedupe? | Plan limit? | Maturity |
|---|---|---|---|---|
| Inbound WhatsApp | `whatsapp-service.js:330-352` — atomic `upsertLead` transaction; digit-normalised exact match then last-10-digit suffix match | Yes | **No** | SHIPPED |
| Manual `POST /api/leads` | `server.js:2089` | Yes (`findLeadByPhone`, `server.js:1111`) | Yes (`pricing.canCreate`, 402 on breach) | SHIPPED |
| CSV bulk `POST /api/leads/bulk-upload` | `server.js:1793`; frontend parses CSV in `app/dashboard/page.js:115` | Yes; reports `skipped` | Yes; reports `limitSkipped` + warning | SHIPPED |
| Instagram webhook | `server.js:5139` | Matches on sender id | **No** | PARTIAL — no signature verification, cross-tenant fallback (see Risks) |
| Facebook webhook | `server.js:5201` | Matches on sender id | **No** | PARTIAL — same issues |
| Website form `POST /api/website-form/:formToken/submit` | `server.js:5254` | **No** — every submission creates a new lead | **No** | PARTIAL |
| Public booking `POST /api/booking/public/:slug` | `backend/booking.js:246-253` | Exact phone, then exact email | **No** | SHIPPED |
| Print store checkout | `backend/print-store.js:127` | Exact phone/email | **No** | SHIPPED |

`findLeadByPhone` (`server.js:1111`) is the canonical resolver: strip all non-digits, try an exact
match, then a `LIKE '%<last 10 digits>'` suffix match so `+92 310…` and `0310…` collapse to one lead.
Deleted leads are excluded, so a merged/trashed duplicate will not swallow future inbound traffic.

---

### The pipeline

Six stages, hard-coded in three places that must be kept in sync:

* Backend allow-list for bulk moves: `BULK_STATUSES` at `server.js:5758`.
* Frontend registry: `wappflow-web/src/lib/leadStatus.js` — `LEAD_STATUS` maps the stable **DB key**
  to `{ label, tone, order }`, deliberately separating domain keys from presentation.
* Legacy per-page colour maps that still exist alongside the registry: `STATUS_META` in
  `app/leads-list/page.js:30` and `app/leads/[id]/page.js:106`, plus `COLUMNS`/`STATUS_COLORS` in
  `app/dashboard/page.js:26` and `STATUS_COLOR` in `app/trash/page.js:10`.

Stages: `New → Contacted → Interested → Negotiating → Closed - Won | Closed - Lost`.

`PUT /api/leads/:id/status` (`server.js:2165`) is the transition endpoint and encodes the side effects:

* `Closed - Won` / `Closed - Lost` stamp `closed_at`; Won optionally stores `actual_sale`, Lost stores
  `lost_reason`.
* `Contacted`/`Interested`/`Negotiating` stamp `last_contacted_at`.
* **`Closed - Won` also sets `is_client = 1, client_since = COALESCE(client_since, CURRENT_TIMESTAMP)`.**
  The inline comment is explicit that this was added because studios won deals and watched the
  Clients page stay empty.
* Writes a `status_change` history row, emits a workspace-wide `lead_updated` SSE frame, and calls
  `logAudit`.

The list UI drives this three ways: a per-lead stepper (`app/leads/[id]/page.js:1450`), drag-and-drop
between Kanban columns (`app/dashboard/page.js:823`), and a bulk "Move to stage…" select
(`app/leads-list/page.js:1073`) that calls the transactional `POST /api/leads/bulk-status`
(`server.js:5759`) — chunked at 500 ids to stay under SQLite's bound-parameter cap, and correctly
filtered by `assigned_to` for members without `view_all_leads`.

**Won/Lost modals.** `WonModal` collects the sale amount; `LostModal` (`app/leads/[id]/page.js:252`)
offers a reason. It tries to load workspace-configured reasons from `lostReasonsAPI.getAll()` →
`GET /api/lost-reasons`. **That endpoint does not exist anywhere in the backend** (grep of
`backend/*.js` returns nothing). The modal silently falls back to the six hard-coded `LOST_REASONS`
at `app/leads/[id]/page.js:115`. The Settings page (`app/settings/page.js:383-405`) renders a full
"Lost Reasons" management card — add, list, delete — against the same missing endpoints.
**SOLD-NOT-BUILT.**

---

### Clients and lifetime revenue

`GET /api/leads` (`server.js:1713`) takes an opt-in `client` query param: `client=1` → only clients,
`client=0` → only leads, omitted → everything. `app/clients/page.js:51` asks for `client: 1`;
`app/leads-list/page.js:759` asks for `client: 0`; the dashboard Kanban asks for neither.

The same query attaches a correlated subquery:

```sql
(SELECT COALESCE(SUM(i.total), 0) FROM invoices i
   WHERE i.lead_id = leads.id AND i.status = 'paid'
     AND (i.is_deleted = 0 OR i.is_deleted IS NULL)) AS lifetime_revenue
```

so `lifetime_revenue` is **money actually collected via paid invoices**, not `actual_sale` (which
holds one deal). The Clients page sums it into a "Lifetime revenue" stat and shows "Paid to date" per
card, falling back to `actual_sale` labelled "Deal value" when nothing has been paid.

Promotion is reversible: `PUT /api/leads/:id/client` (`server.js:2146`) toggles `is_client`, writes a
`client` history entry, and never clears `client_since` (`COALESCE`), so a repeat client's join date
survives a second win. Status: **SHIPPED**, with one design consequence worth naming — because Won
now auto-promotes and the Leads list filters `client=0`, a lead vanishes from the Leads list the
moment it is won. The list still renders a "Closed - Won" filter tab whose count comes from that
already-filtered array (`app/leads-list/page.js:926`), so post-change it reads 0 for everyone.

---

### Assignment and team visibility

* `POST /api/leads/bulk-assign` (`server.js:1669`) — set `assigned_to` on many leads, audited.
* `POST /api/leads/round-robin` (`server.js:1685`) — distribute evenly across active
  `workspace_members`, optionally a caller-supplied subset (validated against the workspace).
* `PUT /api/leads/:id` with `assigned_to` writes an `assignment` history row (`server.js:2135`).

The UI is `BulkAssignModal` in `app/leads-list/page.js:85` with Manual/Round-Robin tabs. Members
without `view_all_leads` are filtered out of the list, trash, search (`backend/search.js:42`),
notification counts (`server.js:3202`) and bulk-status — a consistent rule with the gaps listed below.

---

### The lead detail page

`app/leads/[id]/page.js` renders a left contact card with click-to-edit fields (`InlineEditField`,
line 35), the pipeline stepper and Won/Lost/Move-to-Clients buttons, a full chat pane with per-platform
tabs, and a tab strip defined at line 1225:

| Tab | Data source | Maturity |
|---|---|---|
| Timeline | `GET /api/leads/:leadId/timeline` | SHIPPED (auto-loads on tab open, `useEffect` at line 654) |
| Notes | `notes` from `GET /api/leads/:id` | SHIPPED |
| Reminders | `reminders` | SHIPPED |
| Invoices | `invoices` | SHIPPED |
| Emails | `GET /api/leads/:id/emails` | PARTIAL — requires SMTP configured in Settings, else 400 |
| Email Flow | `email_workflows` | **STUB** — rows are created and can be manually marked sent; no dispatcher exists anywhere in `backend/` |
| Related | `GET /api/leads/:leadId/related` | SHIPPED |
| 💬 Team Room | `RoomPanel` (comms module) | Out of scope here |
| ✨ AI Assistant | `POST /api/leads/:id/ai/summary`, `…/reply-suggestions`, `…/analyze` | SHIPPED (needs an LLM key) |
| 🏭 Industry AI | `GET /api/leads/:id/industry`, `POST …/vertical-action`, `…/vertical-suggest` | PARTIAL / legacy — see Smells |

Real-time is handled by `useRealtime(['new_message','lead_updated','email_received'], …)` (line 732)
over the shell's single SSE connection, with an 8-second visibility-gated poll as a fallback.

---

### Notes, reminders and the reminder cron

Notes: `GET/POST /api/leads/:leadId/notes` (`server.js:2390`, `:2398`), `DELETE /api/notes/:id`
(`:2409`, scoped `AND user_id = ?` — you can only delete your own note, and a manager cannot delete
anyone else's).

Reminders: `POST /api/leads/:leadId/reminders` (`server.js:2424`) writes `reminder_date`, `message`,
`title` *and* `due_date` (the same value twice, because the schema drifted).
`GET /api/reminders/upcoming` (`:2436`) returns the caller's incomplete reminders joined to lead name.
`PUT /api/reminders/:id/toggle` (`:2450`) flips **both** `is_completed` and `completed`.

The cron is `node-cron` at `server.js:3949`, running `* * * * *`. It selects reminders with
`is_completed = 0 AND reminder_date <= now AND reminder_date >= now - 2 minutes`, then for each one
sends a Web Push (`sendPushToUser`), a per-user SSE `reminder_due` frame, and a `notifications` row.
Status: **SHIPPED**, with a real caveat — the ±2-minute window means any minute the process is down
or the event loop is blocked permanently drops those reminders; there is no "fired" flag and no catch-up.
A second cron at `server.js:3989` (`0 0 * * *`) sweeps expired bin rows via `softDeleteLib.purgeExpired`.

---

### Tags, channels and relations

Tags are workspace-wide but stored against `req.workspaceOwnerId` (`server.js:3002-3040`), assigned
via `POST/DELETE /api/leads/:leadId/tags/:tagId`. `attachTags` (`server.js:1150`) batch-loads tags for
a whole list in one query (previously N+1).

`lead_channels` lets one contact carry several handles (`GET/POST/DELETE /api/leads/:leadId/channels`,
`server.js:5254-5285`). `lead_relations` links two lead rows without merging them
(`POST /api/lead-relations` at `:5332`, which correctly `getScopedLead`s **both** sides).
`GET /api/leads/:leadId/related` (`:5291`) returns already-linked records plus up to 10 heuristic
suggestions matched by last-10-digit phone, exact email, or case-insensitive exact name.

---

### Duplicates and merge

`GET /api/leads/duplicates` (`server.js:2309`) groups live leads by normalised phone (≥6 digits),
then by normalised name (≥3 chars) for anything not already phone-grouped.

`POST /api/leads/merge` (`server.js:2333`) is genuinely careful: it discovers every table carrying a
`lead_id` column via `PRAGMA table_info`, re-points those rows at the primary with `UPDATE OR IGNORE`,
backfills blank fields on the survivor from the duplicates, soft-deletes the duplicates (restorable),
refreshes `last_message_at`, writes history + audit, and broadcasts both `lead_deleted` and a full
`lead_updated`. The UI (`MergeDuplicatesModal`, `app/leads-list/page.js:604`) requires typing `MERGE`
and warns that the survivor keeps only one routing phone.

**The detection half does not work.** `GET /api/leads/duplicates` is registered at `server.js:2309`,
*after* `GET /api/leads/:id` at `server.js:2048`. Express matches in registration order, so the
request is served by the `:id` handler with `req.params.id === 'duplicates'`, `getScopedLead` returns
null, and the response is `404 {"error":"Lead not found"}`. I verified this behaviour with a minimal
Express reproduction. The modal's `.catch(() => setGroups([]))` (`app/leads-list/page.js:619`)
converts that into a confident "No duplicates found". Merge itself is fine and reachable if the caller
supplies ids by other means. **Duplicate detection: STUB (dead by route shadowing). Merge: SHIPPED.**

---

### Recycle bin, saved views, bulk actions, pagination

**Recycle bin.** `DELETE /api/leads/:id` (`server.js:2251`) soft-deletes; `POST /api/leads/:id/restore`
(`:2260`) restores and broadcasts `lead_restored`. `DELETE /api/leads/:id/permanent` (`:2271`) is
**guarded, not cascading**: `softDeleteLib.attachmentsForLead` (`backend/soft-delete.js:123`) counts
live invoices, contracts and bookings and returns `409` with a human-readable message if any exist.
Only `notes`, `reminders`, `messages` and `contact_history` cascade. `DELETE /api/leads/trash`
(`:2214`) applies the same guard per lead and returns a `skipped[]` array. Retention is 90 days for
leads, `null` (never auto-purged) for invoices (`soft-delete.js:28-42`).

**Saved views.** `backend/saved-views.js` stores `(workspace_id, user_id, entity, name) → filters` JSON
(≤4 KB, name ≤60 chars), exposed at `GET/POST /api/views` and `DELETE /api/views/:id`
(`server.js:5817-5850`). The frontend (`app/leads-list/page.js:833`) migrates legacy `wf_lead_views`
localStorage entries one at a time and falls back to localStorage only on a 404. SHIPPED.

**Bulk actions.** `bulk-assign`, `round-robin`, `bulk-status`, `bulk-trash` are all server-side and
audited. The one exception is bulk **Move to Clients**, still a sequential client-side loop with
`catch {}` per item (`app/leads-list/page.js:1106`) — PARTIAL.

**Pagination.** `backend/pagination.js` implements opt-in paging: pass `?limit=&offset=` and
`GET /api/leads` returns `{ leads, total, limit, offset, hasMore }`; omit it and the response is
byte-identical to before. **No frontend caller passes `limit`.** `app/leads-list/page.js:759` sends
only `{ client: 0 }` and then filters, searches and sorts entirely client-side (`applyFilters`, line
783) before handing the result to a `VirtualList` (line 1264). So the server-side pagination is built
and unused: the wire still carries every lead in the workspace on every page load.
**Backend: SHIPPED. End-to-end: PARTIAL.**

---

### The Universal Timeline (the activity spine)

`activity_timeline` is intended to be the single answer to "what has ever happened with this contact".
The mechanism is deliberately indirect: modules keep calling `addContactHistory(leadId, userId, type,
description, metadata)` (`server.js:1203`), which writes the legacy `contact_history` row **and** calls
`logActivity` (`server.js:1189`), which resolves the lead's `workspace_id` and inserts into
`activity_timeline`. Both writes are wrapped in `try {} catch {}` — "the timeline is a record, never a
reason to fail the action".

A marker-gated, `NOT EXISTS`-guarded boot backfill (`server.js:736-756`, marker key
`backfill_history_to_activity` in `app_meta`) folds pre-existing `contact_history` into the spine, so
old contacts are not blank.

`GET /api/leads/:leadId/timeline` (`server.js:5361`) reads **only** `activity_timeline` (fixing an
earlier double-listing bug), then folds in the last 50 `messages` as synthetic `message_in`/`message_out`
items and the last 30 `notes`, sorts descending, and caps at 100 items.

Writers confirmed by grep: `server.js` (17 call sites — created, message, note, reminder, status_change,
assignment, client, merge, invoice, email-received, AI), `contracts-studio.js` (8),
`booking.js` (5), `media-studio.js` (7 + the media worker), `payments.js` (2), `print-store.js` (2),
plus a direct insert for `meeting_scheduled` at `server.js:6165`. This is the single most convincing
"one operating system" claim in the codebase, and it substantially holds up. **SHIPPED**, with named
gaps: outbound email via `POST /api/leads/:id/email` (`server.js:3763`) never calls
`addContactHistory`, so sent emails are absent from the spine; and the 50-message fold means a long
conversation crowds out older non-message events under the 100-item cap.

---

### Endpoint inventory (CRM surface)

| Method | Path | File:line | Notes |
|---|---|---|---|
| GET | `/api/leads` | `server.js:1713` | Filters: `status, assigned_to, source, platform, account_id, client`; opt-in `limit/offset`; adds `lifetime_revenue`, `assigned_name`, `account_display_name` |
| POST | `/api/leads` | `server.js:2089` | Dedupe + plan gate (402) |
| GET | `/api/leads/:id` | `server.js:2048` | Returns `{lead, notes, reminders, history, invoices, emailWorkflows, assignee}` |
| PUT | `/api/leads/:id` | `server.js:2120` | Field allow-list of 11 columns |
| PUT | `/api/leads/:id/status` | `server.js:2165` | Stage transition + Won→client |
| PUT | `/api/leads/:id/client` | `server.js:2146` | Promote/demote |
| DELETE | `/api/leads/:id` | `server.js:2251` | Soft delete |
| POST | `/api/leads/:id/restore` | `server.js:2260` | |
| DELETE | `/api/leads/:id/permanent` | `server.js:2271` | 409 when attachments exist |
| GET / DELETE | `/api/leads/trash` | `server.js:1781` / `2214` | List / empty (guarded) |
| DELETE | `/api/leads/trash/cleanup` | `server.js:2297` | 90-day purge |
| POST | `/api/leads/bulk-upload` | `server.js:1793` | CSV import |
| POST | `/api/leads/bulk-assign`, `/round-robin`, `/bulk-trash`, `/bulk-status` | `1669`, `1685`, `5735`, `5759` | |
| GET | `/api/leads/duplicates` | `server.js:2309` | **Shadowed — always 404** |
| POST | `/api/leads/merge` | `server.js:2333` | |
| GET/POST | `/api/leads/:leadId/notes` | `2390` / `2398` | |
| DELETE | `/api/notes/:id` | `2409` | |
| GET/POST | `/api/leads/:leadId/reminders` | `2416` / `2424` | |
| GET | `/api/reminders/upcoming` | `2436` | |
| PUT | `/api/reminders/:id/toggle` | `2450` | |
| POST/DELETE | `/api/leads/:leadId/tags/:tagId` | `3028` / `3037` | |
| GET/POST/PUT/DELETE | `/api/tags[/:id]` | `3002`–`3024` | |
| GET/POST/DELETE | `/api/leads/:leadId/channels[/:channelId]` | `5254`–`5285` | |
| GET | `/api/leads/:leadId/related` | `5291` | |
| POST/DELETE | `/api/lead-relations[/:id]` | `5332` / `5350` | |
| GET | `/api/leads/:leadId/timeline` | `5361` | |
| GET | `/api/leads/:leadId/history` | `1983` | Legacy `contact_history` read |
| GET/POST | `/api/views`, DELETE `/api/views/:id` | `5817`–`5841` | |
| GET | `/api/analytics` | `2847` | Pipeline + ledger stats |
| GET | `/api/reports/overview` | `2900` | Time series, funnel, agent perf, lost reasons, platforms |
| GET | `/api/search?q=` | `backend/search.js:32` | Cross-entity, honours `view_all_leads` |
| GET | `/api/notifications/summary` | `3197` | Badge counts |
| POST | `/api/leads/:id/ai/{summary,reply-suggestions,analyze}` | `4087`, `4118`, `4163` | |
| GET/POST | `/api/leads/:id/industry`, `/vertical-action`, `/vertical-suggest` | `4859`, `4921`, `4944` | Legacy verticals |
| GET/POST | `/api/leads/:leadId/meetings` | `6190` / `6110` | Google Meet |
| POST | `/api/website-form/:formToken/submit` | `5254` | **Public, unauthenticated** |

**SSE event names** (unnamed frames; consumers switch on `data.type`): `lead_created`, `lead_updated`,
`lead_deleted`, `lead_restored`, `new_message`, `email_received`, `reminder_due`, `notification`,
`connected`. Fan-out helpers: `broadcastToUser` (`server.js:978`), `broadcastToWorkspace`
(`server.js:1010`, 15-second member cache), `notify` (`server.js:1071`, writes a `notifications` row
then pushes a `notification` frame whose category travels as `kind`, not `type`).

**Plan limits** (`backend/entitlements.js:98-114`): new leads per calendar month — Creator 200,
Studio 500, Studio+ 5000, Enterprise unlimited (`-1`). Metric names in `backend/pricing.js:18`.

---

### Bugs, security weaknesses, data-integrity risks and smells

*(Read-only observations. Nothing was changed.)*

1. **`GET /api/leads/duplicates` is dead** — registered after `GET /api/leads/:id`
   (`server.js:2309` vs `2048`), so Express serves it with the `:id` handler and returns 404.
   Verified by reproduction. The UI swallows it as "No duplicates found"
   (`app/leads-list/page.js:619`). A user-visible feature that silently does nothing.

2. **Cross-tenant lead injection via Instagram/Facebook webhooks.** When the incoming page id does not
   match a stored `account_handle`, the handler falls back to
   `SELECT * FROM platform_accounts WHERE platform = 'instagram' ORDER BY created_at ASC LIMIT 1`
   (`server.js:5097`, mirrored for Facebook at `:5159`) — with **no workspace clause**. Any DM whose
   page id is unrecognised is written into the oldest workspace on the platform. Both webhooks also
   perform **no `X-Hub-Signature` verification**, so the endpoints accept forged payloads from anyone.

3. **Per-member visibility is enforced on reads but not on writes.** `PUT /api/leads/:id`
   (`server.js:2120`), `PUT /api/leads/:id/status` (`:2165` — it calls `getScopedLead` for the *prior*
   row but never 404s when it is null), `DELETE /api/leads/:id` (`:2251`), and
   `POST /api/leads/:id/restore` (`:2260`) all guard on `workspace_id` only. A `user`-role member
   without `view_all_leads` can edit, re-stage, reassign, or trash any lead in the workspace by id,
   including ones they cannot see.

4. **SSE fan-out ignores assignment.** `broadcastToWorkspace` (`server.js:1010`) pushes to every
   member. `lead_created` / `lead_updated` / merge frames carry the **full lead row**, so a member
   restricted to their own leads receives the names, phones and deal values of everyone else's.

5. **Inbound lead creation bypasses the plan limit entirely.** Only `POST /api/leads` and
   `bulk-upload` call `pricing.canCreate` / `checkLimit`. WhatsApp, Instagram, Facebook, website form,
   booking and print-store lead creation are ungated, so the metered "leads per month" limit is
   trivially exceeded by the product's own primary intake channel.

6. **Public website form is unauthenticated, undeduplicated and unthrottled** (`server.js:5254`,
   `Access-Control-Allow-Origin: *`). Anyone with the form token can create unlimited leads. It also
   writes `user_id = account.workspace_id`, i.e. a workspace id in a user-id column.

7. **Reminders schema has four columns for two concepts** — `title`/`message` and
   `due_date`/`reminder_date`, plus `completed`/`is_completed`. Writers set both, but the cron reads
   only `reminder_date`+`is_completed` (`server.js:3956`) while `/api/reminders/upcoming` orders by
   `COALESCE(due_date, reminder_date)`. A row written with only `due_date` never fires.

8. **Reminder badge count is broken.** `GET /api/notifications/summary` (`server.js:3215`) queries
   `reminders … WHERE (is_done = 0 OR is_done IS NULL)`. There is **no `is_done` column** (verified via
   `PRAGMA table_info(reminders)`); the statement throws and the surrounding `try/catch` returns `0`,
   so the bell's reminder count is permanently zero.

9. **Reminder cron drops missed reminders.** The `>= now - 2 minutes` window (`server.js:3957`) with no
   "fired" flag means any restart, deploy, or blocked event loop permanently loses those alarms.

10. **`assignee` on `GET /api/leads/:id` is almost always `null`.** It looks the assignee up in the
    legacy `team_members` table by id (`server.js:2078`), but `assigned_to` is populated with
    `workspace_members.user_id` by every writer. The list endpoint gets this right (it builds a map
    from `workspace_members` first, `server.js:1753`); the detail endpoint does not.

11. **Meetings use a non-existent column.** `server.js:6148`/`:6144` read `lead.name` for the calendar
    summary and attendee name; the column is `customer_name`, so every auto-titled event reads
    "Meeting with lead" and invitees get no name.

12. **Trash UI copy contradicts the backend guard.** `app/trash/page.js:55` and `:66` tell the user
    permanent delete removes "messages, notes and invoices". The backend refuses with 409 when
    invoices/contracts/bookings exist (`server.js:2280`) and never deletes invoices.

13. **`INSERT OR IGNORE INTO messages` in the IG/FB webhooks is a no-op guard** (`server.js:5126`,
    `:5188`) — the id is freshly random and no other column is unique, so a webhook replay duplicates
    the message. WhatsApp does this properly via `wa_message_id` lookup.

14. **Weak id generation.** `generateId()` (`server.js:1091`) builds UUID-shaped strings from
    `Math.random()`. These ids are used as lead ids, note ids, and — elsewhere in the codebase — as
    invite tokens and webhook verify tokens. Not cryptographically random.

15. **Two phone normalisations coexist.** `normalizePhone` (`server.js:1101`) strips non-digits;
    `normPhone` in the duplicates route (`server.js:2305`) additionally strips leading zeros. They can
    disagree about whether two records are the same person.

16. **Legacy verticals are still shipped in the UI.** `INDUSTRY_WORKFLOWS` (`server.js:4778`) covers
    `training_institute`, `real_estate`, `clinic`, `general` — a pre-pivot market. The lead page still
    exposes them as an "🏭 Industry AI" tab with canned messages about course fees and admissions,
    which is meaningless for a photography studio.

17. **Presentation duplication.** Despite the `lib/leadStatus.js` registry (which the leads list *does*
    use for its `Badge`), four separate colour maps for the same six statuses remain in
    `leads-list/page.js:30`, `leads/[id]/page.js:106`, `dashboard/page.js:26/35`, `trash/page.js:10`.

18. **`notes` and `lead_tags` carry no `workspace_id`.** They are reachable only through
    `getScopedLead`-guarded routes today, but the tables themselves have no tenant column, so any
    future direct query is one missing join away from a cross-tenant leak.

19. **Server-side pagination is built and unused** (see above) — the leads list still downloads the
    whole workspace and filters in the browser, which also means every client-side filter is computed
    over "leads minus clients" only.

20. **`GET /api/leads` fires four extra queries per request** to build assignee/account maps
    (`server.js:1755-1762`) even when paginating, so paging reduces the row transfer but not the
    enrichment work.

---

### What I could not determine

* **UNKNOWN: whether the shadowed `/api/leads/duplicates` route is also broken in production.** The
  reproduction was against a local Express instance mirroring the two registrations; I did not have
  access to the deployed server to confirm the live 404.
* **UNKNOWN: whether the Instagram/Facebook webhooks are actually reachable in production.** Their
  security weaknesses only matter if Meta apps are configured and the endpoints are publicly routed; I
  found no deployment config in the repo that confirms either way.
* **UNKNOWN: the real distribution of `permissions` overrides on `workspace_members`.** The default
  role matrix is in code, but how many live workspaces use custom per-member `view_all_leads` values
  cannot be read from the source.
* **UNKNOWN: whether anything outside this repo dispatches `email_workflows`.** Inside it, nothing
  does — grepping `email_workflows` across every file in `backend/` returns only `server.js` (schema,
  the two CRUD routes, the workspace-id backfill) and `test-batch5-scope.js`. So the "Email Flow" tab
  creates a `pending` row with a `scheduled_at` that no cron or poller ever acts on; `PUT
  /api/email-workflows/:id/status` (`server.js:2038`) exists purely so someone can mark it sent by
  hand. Treat it as **STUB** unless an external scheduler is proven to exist.
* **UNKNOWN: the intended semantics of `lead_relations.merged_into`.** The column exists
  (`server.js:785`) but no code reads or writes it.
