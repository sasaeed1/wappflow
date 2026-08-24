## Booking, scheduling and calendar

> **Reading note.** Every claim below is read from the code, not from the repo's own documents; where a document disagrees, the code wins and the disagreement is called out explicitly. `backend/booking.js`, `backend/availability.js`, `backend/studio-time.js` and `wappflow-web/src/lib/datetime.js` were being actively rewritten *while this section was written* — a timezone-correctness fix the code calls "Phase 9 (audit gap-4)" landed mid-read. Everything here is verified against the files as they stood at **2026-08-24 ~04:12 local**, with mtimes cited where the state is fresh. `backend/server.js` is ~6,470 lines and its line numbers drift with every edit.

### What this part of the product is for

WappFlow is a business operating system for photography and video studios. This part of it answers one question: *when is the studio busy, and how does a client get onto that calendar without a phone call?*

It is two features that were retrofitted to share one definition of "busy":

1. **Public self-booking** ("Booking"). The studio configures the sessions it sells, the hours it works, and any questions it wants answered up front. It gets a public link — `/book/<slug>` — for its Instagram bio. A stranger picks a service, a day and a time, leaves a name and a phone number, and is booked. The booking lands in the CRM as a **lead** (an unconverted contact record), plus a reminder, a timeline entry, a workspace notification and a WhatsApp confirmation. The client keeps a secret link they can use to move or cancel the appointment themselves.
2. **Internal meetings.** From inside a lead's profile a studio member schedules a Google Meet call with that lead: a real Google Calendar event with a video link, optionally emailing the lead an invite. No public surface, no self-service.

They remain distinct flows with distinct tables and distinct UI. The only thing they share is `backend/availability.js`, whose entire purpose is that a client can no longer self-book the exact hour the studio blocked for an internal call.

### Data model

| Table | Owner | Key columns | Notes |
|---|---|---|---|
| `booking_settings` | `booking.js:35-40` (created at mount) | `workspace_id` PK, `slug` UNIQUE, `settings` TEXT (JSON), `updated_at` | One row per workspace. `slug` is the public URL segment. The whole configuration is a JSON blob; only `timezone` is validated. |
| `bookings` | `booking.js:41-52` | `id` PK, `workspace_id`, `lead_id`, `service`, `start_at` TEXT, `duration_min`, `name`, `phone`, `email`, `notes`, `status` (`'confirmed'` → `'cancelled'`), `is_deleted`/`deleted_at`/`deleted_by`, `created_at` | Plus idempotent `ALTER`-added columns (`booking.js:62,66`): `token`, `intake` (JSON answers), `project_id`, `invoice_id`, `calendar_event_id`, `calendar_html_link`. Indexes `idx_bookings_ws`, `idx_bookings_lead`, `idx_bookings_ws_deleted`, declared in the module that owns the table so a fresh install cannot race the central index list. |
| `meetings` | `server.js:852-867` | `id` PK, `workspace_id`, `lead_id`, `user_id`, `provider` (`'google'`), `title`, `starts_at`, `ends_at`, `meet_link`, `event_id`, `html_link`, `notes`, `status` (`'scheduled'`), `created_at` | No indexes. `status` is written once and never updated by any code path. |
| `workspace_integrations` | `server.js:843-850` | `workspace_id` PK, `calendly_url`, `google_calendar_refresh_token`, `google_calendar_email`, `google_calendar_connected_at`, `updated_at` | The Google refresh token is stored **in plaintext** (`readIntegrations`, `server.js:5907`). |

`bookings.start_at` and `meetings.starts_at` deliberately store **different kinds of thing** — see "The timezone situation", which is the single most important subsection here.

### Configuration: settings, slug and services

`GET`/`PUT /api/booking/settings` (`booking.js:204`, `:210`) read and write the JSON blob merged over defaults at `booking.js:69-77`:

- `services`: `[{ name, duration (minutes), price, creates_shoot }]`. Default: one 30-minute "Consultation".
- `availability`: `{ 0..6: [startHour, endHour] }` keyed by JS day-of-week (0 = Sunday). Default Mon–Fri 9–17.
- `slot_min` (30) — the grid offered times sit on; `days_ahead` (21) — how far forward to offer.
- `buffer_min` (0) — dead time enforced after every appointment.
- `blackout`: `['YYYY-MM-DD', …]` closed days.
- `intake`: `[{ label, required }]` — free-text questions on the public form.
- `timezone`: an **IANA zone name**. Since the Phase 9 change it is load-bearing rather than decorative, and `PUT` now **rejects an unusable value with 400** (`booking.js:217-219`, via `studioTime.isValidZone`). The admin UI offers a populated `<select>` built from `Intl.supportedValuesOf('timeZone')` with the viewer's own zone first (`app/bookings/page.js:15-22`), replacing what was a free-text input.

The **slug** is derived once from the studio's `company_name` via `slugify()` (`booking.js:99`) and de-duplicated with a random 2-byte suffix on collision (`booking.js:222-223`). After the first save it can never change: `let slug = (cur && cur.slug) || slugify(...)` (`booking.js:220`) ignores any `slug` a caller later sends, and the admin page never sends one (`app/bookings/page.js:72`).

`creates_shoot` is the one flag on a service that changes what a booking *does*: when set, a successful public booking immediately creates a Media Studio project (a "shoot" — the container for a session's photographs) linked to the same lead (`booking.js:363-371`). It is opt-in on purpose so a 15-minute discovery call does not manufacture a shoot.

### Slot computation

`computeSlots(ws, cfg, serviceDuration)` (`booking.js:135-160`) walks forward `days_ahead` days from the studio's *own* today, skips blackout dates and days with no configured hours, then steps across the day's open window in `slot_min` increments, emitting a slot only if the whole service duration fits before closing, the slot is at least an hour away (`LEAD_MS`, `booking.js:101`), and it does not overlap anything in the shared busy calendar including the buffer.

The day loop is now deliberately Date-object-free: `addDays`/`dowOf` (`booking.js:118-127`) do calendar arithmetic on the `'YYYY-MM-DD'` string via `Date.UTC`, and "today" comes from `studioTime.msToWallClock(Date.now(), tz)` (`booking.js:142`) rather than the server's `new Date()`. Each candidate is converted to a true instant with `wallClockToMs` before any comparison. Output shape: `[{ date: 'YYYY-MM-DD', times: ['YYYY-MM-DD HH:MM:SS', …] }]`.

**A live gap that survived the fix:** the public listing endpoint still calls `computeSlots(row.workspace_id, cfg)` with **no service duration** (`booking.js:314`), so `dur` falls back to `slot_min`. One slot list is computed for the page and reused whichever service the visitor clicks (`app/book/[slug]/page.js:32` reads `data.slots` once and never refetches). A 90-minute wedding session is therefore *offered* on the 30-minute grid. The write guard now uses the real service duration, so the booking will be **refused** rather than silently overbooked — but the client is shown times that cannot be booked and gets an error on submit. The manage/reschedule endpoint does not have this problem; it passes `b.duration_min` (`booking.js:403`).

### The public booking flow

`POST /api/booking/public/:slug` (`booking.js:318`), unauthenticated:

1. Resolve the workspace from the slug; 404 if unknown.
2. Require `start_at`, and a name plus a phone **or** an email (`booking.js:324-325`).
3. Enforce `required` intake questions (`booking.js:327`).
4. Resolve the service by name, falling back to the first configured service (`booking.js:328`).
5. **Open a transaction** (`booking.js:336`) and inside it: run `slotProblem()`; **find-or-create the lead** — match on `customer_phone`, then `email`, within the workspace, else insert with `status='New'` and `first_message='Booked: <service>'` (`booking.js:341-347`), owned by the workspace's `super_admin` (`owner()`, `booking.js:78`); insert the booking with a 24-hex-char `token` from `crypto.randomBytes(12)`.
6. Insert a `reminders` row writing **both** `due_date` and `reminder_date` — the reminder cron fires on `reminder_date` only (`booking.js:357`).
7. Write a `booking`-typed activity entry via `addContactHistory` (`server.js:1204`), which double-writes to `contact_history` *and* the unified `activity_timeline` spine.
8. Send a WhatsApp confirmation containing the manage link — **only if the lead has a phone number** (`booking.js:359`).
9. If `creates_shoot`, create the Media Studio project (`booking.js:363-371`).
10. Best-effort push to Google Calendar (`booking.js:374-386`); a failure is `console.warn`ed and swallowed so a client's booking never fails on it.
11. Broadcast SSE `booking_created` and raise a workspace notification (`booking.js:387-388`).
12. Respond with `manage_url` and `next` — `journeyLinks()` (`public-brand.js:106-121`) returns the client's portal link and the booking link so the success screen is not a dead end.

The public GET (`booking.js:309`) returns `{ brand, services, slots, intake, timezone }`. `brand` comes from `publicBrand()` (`public-brand.js:55`), the single resolver every public surface uses; it deliberately carries no ids or counts because a capability token is the only credential on those pages, and it validates `brand_accent` against a hex pattern (`public-brand.js:42-45`) because that value is interpolated into inline CSS on a page a stranger can reach.

`app/book/[slug]/layout.js:14` marks this the **one** client-facing surface set `robots: { index: true, follow: true }`; the token pages are not indexable.

### The shared busy calendar and the double-booking guard

`backend/availability.js` is the single answer to "is this time taken?". `busyIntervals(db, workspaceId, opts)` returns `[[startMs, endMs], …]` merging two sources: non-cancelled, non-binned `bookings` from the last day forward extended by `duration_min` plus `bufferMin`; and all `meetings` from the last day forward using `ends_at` when sane and a default duration otherwise. It accepts `excludeBookingId`/`excludeMeetingId` so a row does not clash with itself on reschedule, and `timeZone` so the two stamp shapes land on the same scale. `clashes(busy, s, e)` is a half-open overlap test (`s < be && e > bs`), so abutting appointments are legal. Unparseable timestamps are dropped rather than treated as busy at epoch zero. `backend/test-phase6-scheduling.js` exercises all of this against a real in-memory SQLite database, including cross-workspace leakage, buffers, and the "both callers actually use it" assertions.

**The write guard, as of the Phase 9 change**, is `slotProblem(ws, cfg, startStamp, serviceDuration, excludeBookingId)` (`booking.js:177-201`). It returns `null` or a human sentence, and checks: parseable time; at least `LEAD_MS` in the future; not a blackout date; the day is open; the whole duration fits inside opening hours; and no interval overlap against the shared busy calendar with the buffer applied. It is called from create (`booking.js:337`) and reschedule (`booking.js:414`), each **inside a `db.transaction`** that checks and claims atomically — the comment at `booking.js:332-334` names the race the old code left open.

What this replaced is worth recording, because it is exactly the class of defect a planner should expect elsewhere in this codebase: until minutes before this was written, both guards were `WHERE start_at = ?` — exact string equality. A four-hour session at 09:00 did not collide with a session at 10:00; a booking never collided with an internal meeting at all; and nothing checked that the submitted `start_at` had ever been *offered*, so any string (3 a.m., a blackout date, a closed Sunday) was accepted. The 409 message *"That time was just taken"* asserted a guarantee the query could not make.

### Self-serve reschedule and cancel

Three unauthenticated token routes (`booking.js:397`, `:406`, `:445`). `GET /api/booking/manage/:token` returns the brand, a slim booking summary, a fresh slot list computed with the booking's own duration, and the studio timezone. Reschedule runs `slotProblem` (excluding this booking) inside a transaction, updates `start_at`, forces `status` back to `'confirmed'`, moves the Google event, writes history, WhatsApps the client the new time, broadcasts `booking_updated` and notifies the studio. Cancel flips `status` to `'cancelled'`, deletes the Google event and nulls the stored event ids, messages the client, broadcasts `booking_cancelled` and notifies.

Both are guarded only by the 24-hex token, which is the right design for a login-less client link (96 bits). The frontend requires the client to type `CANCEL` before cancelling (`app/booking/manage/[token]/page.js:35`).

### The studio-side console

`/bookings` (`app/bookings/page.js`) is one page carrying both configuration and the booking list: services (including the "Is a shoot" checkbox), weekly availability, buffer, timezone select, blackout dates, intake questions, then the public link with copy/open affordances. The list subscribes to SSE — `useRealtime(['booking_created','booking_updated','booking_cancelled'])` (`app/bookings/page.js:69`) — so bookings taken while the page is open appear live. Each row offers **Shoot**, **Invoice**, an **open on Google Calendar** link when one exists, **Cancel**, and **Open lead →**.

Two honest weaknesses remain. The list is headed "Upcoming" but the query is `ORDER BY start_at DESC LIMIT 200` with **no date floor** (`booking.js:233`), so past bookings sort to the top. And there is no studio-side *reschedule*: the owner can cancel, but moving an appointment is only possible through the client's own token link.

### Handoffs into the rest of the OS

`POST /api/booking/:id/handoff` with `{ target: 'shoot' | 'invoice' }` (`booking.js:243-281`). Both go through the same shared creators the rest of the app uses — `mediaStudioApi.createProject` (`media-studio.js:432`) and `createInvoiceForLead` (`server.js:2580`) — so a shoot booked from the calendar is not a second kind of shoot. The resulting id is written back onto the booking (`project_id`/`invoice_id`), making the handoff idempotent: a second click opens the first record rather than creating a duplicate.

The invoice handoff is **PARTIAL in a way worth planning around**: it creates one line item at `rate: 0, amount: 0`, with subtotal, tax, discount and total all zero (`booking.js:270-271`). The service's configured `price` — displayed to the client on the public page — is never stored on the booking row (there is no price column) and never reaches the invoice. Nothing anywhere collects a deposit at booking time; `payments.js:62` names `booking` as a payment `kind` in a schema comment, but no code path creates one.

### Internal meetings and the Google Calendar integration

**OAuth.** `POST /api/integrations/google-calendar/connect` (`server.js:6107`) exchanges a popup-flow authorization code (`redirect_uri: 'postmessage'`) for a refresh token, decodes the `id_token` for the account email, and stores both; it refuses when Google returns no refresh token, with instructions to revoke and retry. `DELETE /api/integrations/google-calendar` (`server.js:6142`) clears the row. `GET /api/integrations/status` (`server.js:6072`) reports `googleCalendar.{connected,email,connected_at,configured}` and `calendly.{configured,url}`.

**Event helpers** (`server.js:5981`, `:6010`, `:6024`) create, PATCH and DELETE against `calendars/primary/events`, with `conferenceDataVersion=1` and `sendUpdates=all` when a Meet link is wanted. Delete tolerates 404/410 as already-gone.

**Meetings.** `POST /api/leads/:leadId/meetings` (`server.js:6160`) validates the lead through `getScopedLead`, refuses any provider but `google`, checks the shared busy calendar (409 on clash, `server.js:6176-6183`), refreshes the access token, creates the event with `timezone: 'UTC'` hardcoded (`server.js:6203`, comment: *"could store per-workspace tz"*), extracts the Meet link, inserts the `meetings` row and writes a `meeting_scheduled` activity entry. `GET /api/leads/:leadId/meetings` (`server.js:6240`) lists them. **There is no update, cancel or delete route** — a meeting created by mistake stays in the busy calendar forever with no UI to remove it, and a Google-side cancellation never syncs back (no watch channel, no webhook).

**Calendly** is a stored URL only (`PUT /api/integrations/calendly`, `server.js:6093`, validated against `https://calendly.com/`). The UI sends it to a lead as a WhatsApp message (`components/ScheduleMeetingModal.js:92-107`). No availability, no booking data, no callback.

**`bookingCalendar`** (`server.js:6041-6067`) is the seam booking uses. `create`/`move`/`remove` each return `null` immediately unless a timezone is supplied, and again unless the workspace has a refresh token. Public-booking events are created with `withMeet: false` — a portrait session needs no video link.

### The timezone situation

This is the sharpest correctness hazard in the module. It was, until this week, a live defect; a fix has just landed on the booking side and **not** on the meetings side.

**Two timestamp shapes, one number line.**

- `bookings.start_at` is a **naive wall-clock string**, `'YYYY-MM-DD HH:MM:SS'`, no zone. It means "2 p.m. *at the studio*". The reasoning is written out at `studio-time.js:19-31`: an appointment is a wall-clock commitment, so a government changing its DST rules must not move a real shoot; and converting the existing rows to instants would mean *guessing* the zone of every booking already taken, which has no safe migration.
- `meetings.starts_at` is a **true ISO instant** (`…T…Z`). Its only writer is `ScheduleMeetingModal.js:61-67`, which builds a `Date` from the admin's browser-local inputs and calls `.toISOString()`.
- `availability.busyIntervals` merges both onto one millisecond scale.

**The defect.** `availability.toMs` was a bare `Date.parse`, which reads a zone-less string as **server-local** and an ISO string as a true instant. When the Node process's zone was not the studio's wall clock, every booking sat the studio's entire UTC offset away from every meeting — five hours for Karachi — and the double-booking guard, the slot list and the calendar push all read that skewed calendar (`studio-time.js:5-17` states this precisely).

**The fix, `backend/studio-time.js`** (137 lines, unit-tested by `backend/test-phase9-studio-time.js`): `wallClockToMs(stamp, tz)` passes anything already carrying a zone straight through as an instant, and converts a naive stamp by computing the zone's offset *at that instant* through `Intl.DateTimeFormat` — applied twice, because near a DST jump the first correction can land on the other side of the transition (`studio-time.js:78-82`). `msToWallClock` is the inverse. `formatStudioTime` renders a stamp in the studio's zone regardless of where the code is running. **With no configured zone everything falls back to UTC**, which is what a UTC box already did, so an unconfigured studio sees no behaviour change and a configured one becomes correct.

**What is now wired up:** `availability.js` takes `opts.timeZone`; `computeSlots` and `slotProblem` both pass it (`booking.js:137,193`); `PUT /api/booking/settings` rejects an invalid zone; `GET /api/booking/list` and the two public GETs return the zone so the frontend can label times; and every server-side rendering of a booking time — the WhatsApp confirmation, the reschedule message, the notification body, the contact-history line — now uses `formatStudioTime` instead of `new Date(stamp.replace(' ','T')).toLocaleString()`, which had been rendering in the *server's* zone and texting clients times offset by the studio's own UTC offset (`booking.js:358,359,388,433,435,439`).

**What is still wrong, right now:**

- **The meetings route was not migrated.** `server.js:6176-6179` still calls `availability.toMs(starts_at)` and `busyIntervals(db, req.workspaceId, { defaultDurationMin: 30 })` with **no `timeZone`**. The ISO meeting stamps are fine either way, but the booking wall-clocks in that call are read as UTC. So for a studio that *has* configured a non-UTC zone, the two directions now disagree: the public booker checks meetings correctly, while creating a meeting checks bookings offset by the studio's UTC offset. The asymmetry is new and is a direct consequence of a half-applied fix.
- **Silent Google Calendar no-op.** `bookingCalendar.create`/`move` return `null` when no timezone is set (`server.js:6043`, `:6054`). The rationale is sound and stated at `server.js:6037-6040` — *"a missing event is recoverable; a calendar full of events at the wrong hour is not"* — and `calTime` (`server.js:5970-5983`) implements the other half by passing a naive stamp through as `{dateTime, timeZone}` rather than through `toISOString()`. But a studio that connects Google Calendar and leaves the zone blank gets **no events at all**, with nothing logged, no error and no UI hint: `create` returns `null` and the `if (ev)` at `booking.js:384` simply skips the write.
- **`now`-relative SQL still mixes frames.** The analytics "upcoming bookings" count compares the naive `start_at` against SQLite's UTC `datetime('now')` (`server.js:2844-2845`), as does the `-1 day` window inside `busyIntervals` (`availability.js:55`). The one-day slack absorbs the second; the first is off by the studio's offset.
- **The two public client pages are only half migrated** (both mtime 04:13). The summary lines now use `formatAppointment` plus a `zoneLabel` suffix — the booking-confirmed screen (`app/book/[slug]/page.js:51-52`) and the manage card (`app/booking/manage/[token]/page.js:18,61`) — while the day and time *buttons* still hand-roll `new Date(s.replace(' ','T')).toLocale*` (`fmtDate`/`fmtTime`, `app/book/[slug]/page.js:13-14`). Worth being precise, because the new helper's own comment (`lib/datetime.js:112-116`) overstates the problem: parsing a zone-less string as browser-local and then formatting in browser-local is an **identity** — the reader sees the stored digits, i.e. the studio's clock, wherever they are. What the un-migrated call sites actually lack is the zone *label* and robustness against anyone later routing them through a helper that appends `Z`. `formatAppointment` (`lib/datetime.js:120`) reaches the same output deliberately: read the digits as UTC, format as UTC, append `zoneLabel()`.

`addMinutes` (`booking.js:90-97`) deserves a mention as the pattern to copy: it computes a booking's end time by doing its own UTC arithmetic on the naive string, precisely so a `new Date()` round-trip cannot shift it.

### Endpoint inventory

| Method | Path | Auth | Source | Purpose |
|---|---|---|---|---|
| GET | `/api/booking/settings` | JWT | `booking.js:204` | Settings + slug + public URL |
| PUT | `/api/booking/settings` | JWT | `booking.js:210` | Save settings; mints slug on first save; 400 on an invalid IANA zone |
| GET | `/api/booking/list` | JWT | `booking.js:231` | Non-cancelled bookings, `start_at DESC`, LIMIT 200, plus `timezone` |
| POST | `/api/booking/:id/handoff` | JWT | `booking.js:243` | `target: shoot \| invoice`; idempotent |
| POST | `/api/booking/:id/cancel` | JWT | `booking.js:283` | Studio-side cancel + calendar remove + client message |
| GET | `/api/booking/public/:slug` | none | `booking.js:309` | Brand, services, slots, intake, timezone |
| POST | `/api/booking/public/:slug` | none | `booking.js:318` | Take a booking (transactional check-and-claim) |
| GET | `/api/booking/manage/:token` | token | `booking.js:397` | Booking summary + fresh slots + timezone |
| POST | `/api/booking/manage/:token/reschedule` | token | `booking.js:406` | Move it (transactional) |
| POST | `/api/booking/manage/:token/cancel` | token | `booking.js:445` | Cancel it |
| GET | `/api/integrations/status` | JWT | `server.js:6072` | Google + Calendly connection state |
| PUT | `/api/integrations/calendly` | JWT | `server.js:6093` | Store a Calendly URL |
| POST | `/api/integrations/google-calendar/connect` | JWT | `server.js:6107` | OAuth code → refresh token |
| DELETE | `/api/integrations/google-calendar` | JWT | `server.js:6142` | Disconnect |
| POST | `/api/leads/:leadId/meetings` | JWT | `server.js:6160` | Create Google Meet event + row |
| GET | `/api/leads/:leadId/meetings` | JWT | `server.js:6240` | List a lead's meetings |

SSE events broadcast to the workspace: `booking_created`, `booking_updated`, `booking_cancelled`, plus a `notification` frame from `notify()` (`server.js:1072`). Frames are unnamed on the wire; the category travels in the payload as `kind`, because `type` is the SSE event name.

### Configuration and gating

**Env vars.** `FRONTEND_URL` becomes `clientBaseUrl`; every public and manage link is built from it, so an empty value yields relative, unusable links in WhatsApp messages. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (`server.js:182`, `:5904`) — both required or the OAuth exchange throws. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on the frontend. `backend/.env.example` lists `GOOGLE_CLIENT_ID` only.

**Entitlements.** `booking: true` on every plan (`entitlements.js:31`) — it is a core module. The module gate at `server.js:6259` maps `/api/booking/` to the `booking` feature key and exempts `/api/booking/(public|manage)` so client links never break when a workspace is disabled. `google_calendar` and `calendly` are **false on Creator** and true from Studio up (`entitlements.js:75`). That gate is enforced **only in the UI** (`app/settings/page.js`, `PlanLockBadge` plus disabled buttons); no `/api/integrations/*` route consults entitlements.

### Cross-module touchpoints

Bookings appear in global search (`search.js:73-79`, filters `is_deleted`, returns cancelled rows), the offline desktop sync delta (`sync.js:46`), saved views (`saved-views.js:22`), Comms project rooms (`comms.js:573`), the workspace JSON export (`server.js:2993`), the analytics tile "Upcoming Bookings" (`server.js:2844`, rendered at `app/reports/page.js:373`), and Command Center metering and per-workspace counts (`cc-metering.js:29,57`; `command-center.js:300,371,758`). The lead activity timeline renders `booking` with its own Calendar icon and colour (`app/leads/[id]/page.js:2627,2636`). Contracts Studio has a post-signature automation that WhatsApps the booking link (`contracts-studio.js:339-352`), and `journeyLinks` offers it from every public success screen.

Bookings are registered in the recycle bin with 90-day retention (`soft-delete.js:32`) and counted by the lead-deletion guard (`soft-delete.js:130`), but **no code anywhere sets `bookings.is_deleted = 1`** outside tests — bin plumbing with no producer.

### Maturity ledger

| Capability | Status | Gap |
|---|---|---|
| Public booking page, services, weekly hours, buffers, blackout, intake | **SHIPPED** | — |
| Find-or-create lead, reminder, timeline entry, notification | **SHIPPED** | — |
| Self-serve reschedule / cancel by token | **SHIPPED** | — |
| Handoff → Media Studio shoot; `creates_shoot` auto-project | **SHIPPED** | — |
| Interval double-booking guard (overlap, hours, blackout, lead time, transactional) | **SHIPPED** (landed 2026-08-24) | Booking side only; see meetings row |
| Studio-zone slot generation and server-side time formatting | **SHIPPED** (landed 2026-08-24) | Falls back to UTC when unconfigured |
| WhatsApp confirmation / reschedule / cancel messages | **PARTIAL** | Fires only when the lead has a phone; the success screen unconditionally claims "A confirmation has been sent" (`app/book/[slug]/page.js:50`). No email path exists — `booking.js` is never given a `sendEmail` dep. |
| Per-service duration in public slots | **PARTIAL** | Public GET omits the duration; long services are offered on the short grid and then refused at submit. |
| Handoff → invoice | **PARTIAL** | Always zero-value; the service `price` never travels. |
| Google Calendar push for bookings | **PARTIAL** | Silently disabled without a configured zone; failures only `console.warn`. |
| Shared busy calendar from the meetings side | **PARTIAL** | `server.js:6179` never passes `timeZone`; half-migrated. |
| Google Meet meetings from a lead | **PARTIAL** | Create + list only. No cancel, move or delete; `status` never changes; no sync back from Google. |
| Calendly | **PARTIAL** | A stored URL sent as a message. No availability or booking data. |
| Booking deposits / payment at booking | **SOLD-NOT-BUILT** | `services[].price` is shown to the client as `$X` (`app/book/[slug]/page.js:75`) and `payments.js:62` names a `booking` kind; nothing charges anything. |
| Studio-side reschedule | **SOLD-NOT-BUILT** | No route, no UI. |
| Recycle bin for bookings | **SOLD-NOT-BUILT** | Registered, swept, guarded — but nothing sets the flag. |
| `.ics` / add-to-calendar for the client | **SOLD-NOT-BUILT** | No code. |
| Booking analytics (no-show, conversion, popular service) | **SOLD-NOT-BUILT** | Only a raw "upcoming" count. |
| Audit logging of booking actions | **SOLD-NOT-BUILT** | `booking.js` is never given `logAudit`; create/cancel/reschedule/handoff are untracked, unlike Contracts Studio. |

### Bugs, security weaknesses, data-integrity risks and smells

1. **Half-migrated busy calendar.** `server.js:6176-6179` (meeting creation) does not pass `timeZone` to `availability`, while `booking.js` now does. For a studio with a configured non-UTC zone the two guards disagree by that offset, so a meeting can be booked on top of an existing booking even though the reverse is now correctly prevented.
2. **Offered-but-unbookable slots.** The public GET's missing service duration (`booking.js:314`) means the client is shown times the write guard will reject. Not a data-integrity risk any more, but a conversion-killing UX defect on exactly the surface that is meant to convert strangers.
3. **Silent Google Calendar no-op** when no timezone is configured. No log, no error, no UI hint.
4. **`now`-relative SQL mixes frames** (`server.js:2845`, `availability.js:55`), comparing naive wall-clock strings against SQLite's UTC `datetime('now')`.
5. **Booking-created reminders and the reminder cron.** `booking.js:357` stores the naive stamp in `reminder_date`; the cron (`server.js:3957-3967`) selects `WHERE reminder_date <= ?` binding `new Date().toISOString()`. That is a *string* comparison between `'2026-08-24 23:00:00'` and `'2026-08-24T09:00:30.000Z'`; because `' '` (0x20) sorts before `'T'` (0x54) under SQLite's default BINARY collation, any same-date naive stamp compares as already due. The only effective constraint is the `datetime(?, '-2 minutes')` lower bound, and the cron never marks a reminder complete — so a booking reminder for later today can fire hours early and repeat every minute. (Mechanism read from the code and SQLite's collation rules; not observed running.)
6. **Authorization is coarse.** Every `/api/booking/*` admin route uses bare `auth`. There is no `requirePermission` helper anywhere in `server.js`. A member with the `user` role — defaults `manage_settings: false`, `view_all_leads: false` (`server.js:189`) — can rewrite the public booking page, change the studio's opening hours, and read every booking's name, phone, email and intake answers, bypassing the lead-visibility scoping the Leads list enforces.
7. **`GET /api/leads/:leadId/meetings` does not scope the lead** (`server.js:6240`): it queries by `workspace_id + lead_id` without `getScopedLead`, unlike the POST on the same resource. Any member can list any lead's meetings.
8. **Plaintext OAuth refresh token** in `workspace_integrations.google_calendar_refresh_token` (`server.js:846`). A database read is a persistent grant on the studio's Google Calendar.
9. **The `google_calendar`/`calendly` entitlement gate is UI-only.** No backend check on `/api/integrations/*`, so a Creator-plan workspace can connect Google Calendar by calling the API directly.
10. **Public-endpoint abuse surface.** The only protection on `POST /api/booking/public/:slug` is the global 500-requests-per-15-minutes-per-IP limiter (`server.js:82-92`). No CAPTCHA, honeypot, duplicate suppression or per-slug limit. Each accepted booking inserts a lead *and* sends a WhatsApp message from the studio's own account, so this is a data-pollution vector and a cost/reputation vector at once.
11. **Mostly-unvalidated settings blob.** `PUT /api/booking/settings` merges `req.body.settings` wholesale; only `timezone` is checked. `days_ahead`, `slot_min` and the hour pairs are unbounded server-side, and a large `days_ahead` makes every public page load an expensive loop that now also runs `wallClockToMs` (an `Intl.DateTimeFormat` construction) per candidate slot.
12. **Meetings are immortal.** No cancel/delete route; `meetings.status` is written `'scheduled'` and never changed; `busyIntervals` therefore treats a mistaken meeting as permanently busy with no way to release the slot.
13. **`is_deleted` plumbing with no producer** — a recycle bin that can never receive a booking, while `GET /api/booking/list` does not filter the flag it nonetheless has.
14. **Slug immutability is silent.** A studio that renames itself keeps the old public URL and is never told why.
15. **Hardcoded `$`** for the service price on the public page (`app/book/[slug]/page.js:75`) while the rest of the product resolves a per-workspace `currency_symbol`; the product's live pricing is in PKR.
16. **Dead / stale code:** a second, obsolete `PLAN_DEFINITIONS` (`free`/`starter`/`growth`/`enterprise`) at `server.js:5432` that nothing references — the live matrix is `creator`/`studio`/`studio_plus`/`enterprise` at `entitlements.js:94`; and an unused `HISTORY_ICONS`/`HISTORY_COLORS` map at `app/leads/[id]/page.js:1238-1239`, superseded by `TIMELINE_ICONS`.
17. **No audit trail** for any booking action.
18. **An overstated code comment.** `lib/datetime.js:112-116` claims the hand-rolled `new Date(s.replace(' ','T'))` pattern "silently shifts every appointment" for a reader outside the studio's zone. For the parse-local-then-format-local pattern actually used on the two public pages it does not — it is an identity. The comment is right about helpers that append `Z`; taken literally it would send someone hunting a bug that is not there.

### Where the repo's own documents disagree with the code

`PRODUCT-AUDIT.md` §"Booking & Scheduling" (lines 240–257, dated 2026-07-01) contains several findings that are now **fixed** — the code is the truth:

- *"no frontend subscribes to `booking_created`"* — fixed (`app/bookings/page.js:69`).
- *"the owner literally cannot cancel or reschedule"* — half fixed: cancel exists (`POST /api/booking/:id/cancel`, wired at `app/bookings/page.js:52`); studio-side reschedule still does not.
- *"no project is created or linked when a booking is made"*, *"no invoice/deposit handoff"* — the handoffs now exist, though the invoice is zero-value and no deposit is collected.
- *"bookings are not indexed in global search"* — fixed (`search.js:73`).
- *"`booking` is absent from `HISTORY_ICONS`"* — the timeline has a Calendar icon for it; the map the audit cites is now dead code.
- *"a clean ~212-line additive module"* — `booking.js` is now ~470 lines.
- *"per-service duration is dropped when computing public slots… and can be double-booked into the following slot"* — the double-booking half is fixed by `slotProblem`; the dropped-duration half is still true.

Still accurate: the "Upcoming" heading over a `DESC`, no-floor query; the unconditional "A confirmation has been sent" for email-only clients; no `.ics`; no booking analytics; no audit logging; no restore UI for cancelled bookings; and the observation that the two scheduling systems remain disjoint at the UX level even though they now share a busy calendar.

`PRODUCT-BIBLE.md:41` describes Booking as *"Public booking page → scheduling → manage/reschedule"* — accurate as far as it goes, and silent on everything in the ledger above. `booking.js:76` still carries a stale comment describing `timezone` as a *"display label … slots are studio-local"*; since the Phase 9 change that field is load-bearing and validated.

### UNKNOWN

- **UNKNOWN: the timezone of the production Node process.** This determined the real-world magnitude of the pre-fix defect and still governs item 4 above. `deploy.sh`, `backend/package.json`, `nixpacks.toml` and `.env.example` set no `TZ`, and no pm2 ecosystem file is present in the repo.
- **UNKNOWN: whether the Phase 9 edits are tested end-to-end or deployed.** `test-phase9-studio-time.js` unit-tests the helper only; there is no integration test covering `slotProblem` or the transactional claim. This checkout is not a git working tree, so no diff, branch or commit history was available — only file mtimes.
- **UNKNOWN: whether any live workspace has a `timezone` configured.** Behaviour still differs sharply between configured and unconfigured studios and cannot be determined from code.
- **UNKNOWN: real-world Google API behaviour.** No request logs or fixtures exist in the repo; every statement about what Google accepts is read from the request bodies the code constructs.
- **UNKNOWN: whether `POST /api/booking/public/:slug` is reachable cross-origin in production.** CORS is `origin: process.env.FRONTEND_URL || '*'` (`server.js:107`), which would block an embedded or white-label booking page served from another domain; whether that is intended was not determinable.
