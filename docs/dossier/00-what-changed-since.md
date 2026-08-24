## READ THIS FIRST — what changed after the sections below were written

The eighteen survey sections in this dossier were written by agents reading the
source **while Phase 8 was being implemented**, and **Phase 9 landed entirely
afterwards**. Everything else in this document is accurate as written; the areas
listed here moved under it. Where a later section contradicts this one, believe
this one.

This matters because several of the defects the sections describe — and reasonably
present as open problems — are now closed, and a plan built on them would be
planning work that is already done.

### Phase 8 — the studio's identity on public pages (commit `e2f2eec`)

| The sections may say | What is now true |
|---|---|
| `company_logo` is never rendered on any public page | `backend/public-brand.js` is a single resolver used by **all eight** public surfaces (gallery, contract, shop, pay, booking, booking-manage, portal, portfolio). It returns `{name, logo, accent, website, email, phone, tagline}` with the logo absolutised. |
| Public endpoints answer "who is the studio?" inconsistently — three return a bare name string that falls back to the literal `'WappFlow'`, two return nothing | Every one returns the same `brand` **object**. A studio that has filled in nothing renders **no mark at all**, never a placeholder identity. |
| Shared links preview as generic WappFlow marketing | Each public route has a server `layout.js` with `generateMetadata` (`wappflow-web/src/lib/publicMeta.js`). Token pages are `noindex`; `/book` and `/folio` are indexable. |
| The portal lists what happened but offers no next step; the gallery is a dead end | `journeyLinks()` returns only destinations that exist; `PublicNextSteps` renders them at all four conversion points (sign, pay, book, order). The gallery links back to the portal. |
| The portal link is buried in the Contracts vault and never auto-created | `ensureClientPortal()` runs on `Closed - Won` in **both** the single and bulk status routes, and records the link on the client's timeline. |

**A trap worth knowing about**, because it shapes any future work on public pages:
`GET /api/cs/public/:token` marks a contract **viewed** and notifies the studio;
the gallery route logs an access; the portfolio route increments a view counter.
A server-side metadata fetch would fire all three on every link *preview*. The
frontend's preview fetch therefore sends `X-WF-Preview: 1` and those three
endpoints skip their side effect for it. Anything that adds server-side fetching
of a public endpoint must do the same.

### Phase 9 — correctness (commit `c6854e7`)

| The sections may say | What is now true |
|---|---|
| The double-booking guard checks exact start only, so overlapping bookings of differing durations both succeed | Both the create and reschedule guards apply the **same interval test the slot list uses**, plus opening-hours, blackout and lead-time validation. Check-and-claim is one **transaction**, so concurrent bookers serialise. |
| `availability.toMs` parses a naive booking stamp as server-local and an ISO meeting stamp as an instant | `backend/studio-time.js` puts both on one instant scale. A booking and a meeting at the same real moment now compare equal — previously they sat the studio's whole UTC offset apart on the shared busy calendar. |
| `booking_settings.timezone` is a display label that nothing applies | It is **validated and load-bearing**: slots, the collision guard, confirmation messages, reminders and the Google Calendar push all read it. With none set, behaviour is unchanged (naive stamps read as UTC). |
| Booking times render in the viewer's or the server's timezone | One formatter, `formatStudioTime` (backend) / `formatAppointment` (frontend). The confirmation message previously rendered in the **Node process's** zone — a Karachi studio on a UTC box was texting clients times five hours out. |
| There is no password reset of any kind | `backend/account-recovery.js`: hashed single-use tokens, 60-minute expiry, no account enumeration, and **session revocation** via `users.token_version` (JWTs here are signed without expiry, so a reset previously could not invalidate a stolen token). Impersonation tokens carry the claim too. |
| "Overdue" is never computed | Derived on read in `parseInvoice`, so every invoice response carries `is_overdue`. Not a stored status: a cron would race the payments ledger and go stale when a due date changed. |
| `sent` has no colour in the invoice list | `sent` is in the status registry. `Outstanding` now counts every unpaid non-draft invoice, not only `pending` — contract- and store-generated invoices are written as `sent` and were excluded from the studio's own receivables figure. |
| The owner cannot cancel or reschedule a booking | Both exist (`POST /api/booking/:id/cancel`, `POST /api/booking/:id/reschedule`), the client is notified, and the calendar entry moves or is deleted with it. |
| The store page never surfaces the shop link | `GET /api/store/links` returns one copyable link per published gallery. |

### Design decisions recorded, not just changes

Two are worth carrying into any plan because the obvious alternative was
deliberately rejected:

1. **Bookings keep wall-clock storage rather than migrating to stored UTC.** An
   appointment means "2pm at the studio", not an instant — wall clock plus a zone
   survives a government changing its DST rules. And converting existing rows
   would mean guessing the timezone of every booking already taken, for studios
   that mostly never set one. There is no safe migration, so there was no
   migration.

2. **The Google Calendar push is a deliberate no-op unless a studio has set a
   timezone.** A calendar full of events at the wrong hour is worse than no
   events. It switches itself on when they configure one.

### What is still open

Phases 1–9 of `PRODUCT-AUDIT.md` are done. **Phase 10** (named intelligence and
advanced features — Studio/Creator/Video Intelligence wired to real surfaces,
Gallery Expiry, lead follow-up and duplicate detection, the Command Center health
dashboard, workspace branding, keyboard shortcuts, drafts, multi-account
WhatsApp) was the remaining roadmap phase at the time this dossier was assembled.

The **accessibility** item from Phase 9 was NOT done: the audit's count of ~19
aria-labels against ~1074 `onClick` handlers still stands, and section 16 (UI/UX)
should be read as current on that point.

Separately, and unrelated to the roadmap: a set of API credentials (five AI
provider keys, a Google OAuth client secret, a LiveKit secret) were exposed in
plain text during development and **have not been rotated**. Any security
analysis should treat them as compromised.
