## Invoices, payments, the print store and the money ledger

### What this part of the product is for

WappFlow is a CRM and delivery platform for small creative studios (photographers, videographers,
event shooters). The "money" domain is the part that turns a conversation with a prospect into a bill,
gets that bill in front of the client, records when the client actually paid, and lets the studio sell
extra goods — prints, albums, digital files — off the back of work it has already delivered.

Four things live here, and they are deliberately layered:

1. **Invoices** — the *claim*. A row in `invoices` saying "you owe us this much, for these line items."
2. **The payments ledger** — the *cash truth*. A row in `payments` saying "this much money actually
   arrived, on this date, recorded by this person, through this provider." The ledger, not the invoice
   status, is what Analytics reports as revenue.
3. **The pay rail** — how a client hands money over. Either a Stripe Checkout session (code exists,
   **not configured in production**) or a manual "the studio marks it paid" fallback (what runs today).
4. **The print store** — a public catalogue attached to a delivered photo gallery, where a client can
   order prints; an order auto-raises an invoice and a pay link through the same shared creators.

There is a *fifth* money concept in the repo that is **not** this domain and should not be confused
with it: `backend/pricing.js` and `backend/entitlements.js` handle WappFlow's own subscription plans
(PKR-denominated Creator / Studio / Studio+ / Enterprise tiers). That is the studio paying *WappFlow*.
No code in the repo actually charges a workspace for its plan — plan state is set administratively.
Everything below is about the studio billing *its own clients*.

---

### 1. The invoice model

**Table `invoices`** (`backend/server.js:384-407`, plus later `safeAlter` columns):

| Column | Notes |
|---|---|
| `id` TEXT PK | app-generated |
| `user_id` TEXT | always the **workspace owner's** user id, not the acting member (`server.js:2600`) |
| `workspace_id` TEXT | added later by `safeAlter` (`server.js:717`) and backfilled from `users.workspace_id` (`server.js:722`) |
| `lead_id` TEXT | the CRM contact this bills; nullable |
| `invoice_number` TEXT NOT NULL | e.g. `INV-1001`; **no UNIQUE constraint** |
| `customer_name/_email/_phone/_address` | denormalised snapshot of the client at issue time |
| `items` TEXT (JSON) | array of `{description, qty, rate, amount}` |
| `subtotal`, `tax_rate`, `tax_amount`, `discount`, `total` REAL | all supplied by the client, never recomputed server-side |
| `currency`, `currency_symbol` | copied from `company_settings` at creation |
| `status` TEXT default `'draft'` | `draft` → `pending` → `paid`; `overdue` exists in the UI only |
| `due_date`, `notes`, `created_at` | |
| `is_deleted`, `deleted_at`, `deleted_by` | soft-delete columns added by `backend/soft-delete.js` |

Indexes: `idx_invoices_user`, `idx_invoices_lead`, `idx_invoices_ws`, `idx_invoices_ws_deleted`
(`server.js:885-903`).

**Numbering** is a per-workspace counter held on the owner's `company_settings` row
(`invoice_prefix TEXT DEFAULT 'INV'`, `invoice_counter INTEGER DEFAULT 1000` — `server.js:363-364`).
Creation reads the counter, adds one, formats `${prefix}-${counter}`, then writes the counter back
(`server.js:2588-2596`). The first invoice a studio issues is therefore `INV-1001`.

**Status semantics.** `draft` is the default. Emailing a draft flips it to `pending`
(`server.js:2716-2718`). `paid` is only ever written by `settle()` in the payments module
(`backend/payments.js:135`) — there is no other `UPDATE invoices SET status='paid'` anywhere in the
backend. `overdue` is a presentation key in `wappflow-web/src/lib/invoiceStatus.js:11` and a filter
button on the invoices page, but **no code ever sets it** — see the defects section.

**Soft delete is a hard guarantee.** `soft-delete.js:30` registers `invoices` with
`retentionDays: null`, and `purgeExpired()` skips any table with a null retention (`soft-delete.js:99-113`),
so a binned invoice is never swept on a timer. Permanently deleting a lead used to cascade
`DELETE FROM invoices WHERE lead_id` — it now refuses with HTTP 409 and names what is attached
(`server.js:2286-2292`, `soft-delete.js:117-143`). Emptying the whole lead trash applies the same guard
and reports skipped leads (`server.js:2233-2243`).

---

### 2. `createInvoiceForLead` — one creator, five callers

`createInvoiceForLead(req, body)` (`server.js:2580-2612`) is a plain function, not a route. It exists
because invoices are raised from five different places, and each of them previously hand-rolled its own
`INSERT` — with drifting results. The header comment at `server.js:2575-2579` says it plainly: a store
order that skipped the counter would hand two customers the same invoice number. The contracts module's
copy inserted **no `workspace_id` at all**, so contract-generated invoices landed with a null tenant
(`backend/contracts-studio.js:307-310`).

The function does five things no caller may skip: validates `lead_id` is in the caller's workspace via
`getScopedLead`, allocates the next number from the counter, inserts with both `user_id` (owner) and
`workspace_id`, writes a CRM timeline entry via `addContactHistory`, and writes an audit row
(`logAudit(..., 'create_invoice', ...)`).

Callers, all injected at mount time:

| Caller | Site | Status it creates |
|---|---|---|
| `POST /api/invoices` | `server.js:2614` | whatever the client sends (UI sends `draft`) |
| Booking handoff (`POST /api/booking/:id/handoff` with `target:'invoice'`) | `backend/booking.js:185-197` | `draft`, **total 0**, one zero-rate line item |
| Contract signing automation (`a.create_invoice`) | `backend/contracts-studio.js:311-318` | `sent` — note `sent` is **not** in the status registry |
| Contract deposit variant (`pay.type === 'deposit'`) | `contracts-studio.js:302-306` | `sent`, single "Deposit — <title>" line, balance stated in notes |
| Public print-store order | `backend/print-store.js:145-151` | `sent` |

The takeaway for planning: `createInvoiceForLead` is the *only* correct way to raise an invoice, and it
is passed by dependency injection into `booking.js`, `print-store.js` and `contracts-studio.js` at
`server.js:6419-6448`.

---

### 3. Invoice HTTP surface

All authed unless noted. `auth` sets `req.workspaceId`, `req.workspaceOwnerId`, `req.userId`,
`req.canViewAllLeads`. Every query carries the legacy dual predicate
`(workspace_id = ? OR (workspace_id IS NULL AND user_id = ?))` so pre-workspace rows still resolve.

| Method + path | File:line | Purpose | UI? |
|---|---|---|---|
| `GET /api/invoices` | `server.js:2531` | list, newest first; opt-in pagination via `?limit&offset` (`backend/pagination.js:28`) | yes — `/invoices` |
| `GET /api/invoices/bin` | `server.js:2544` | soft-deleted invoices | **no UI, no api.js client** |
| `POST /api/invoices/:id/restore` | `server.js:2554` | un-delete | **no UI** |
| `GET /api/invoices/:id` | `server.js:2567` | single | not used by the page |
| `POST /api/invoices` | `server.js:2614` | create via `createInvoiceForLead` | yes — lead detail modal |
| `PUT /api/invoices/:id` | `server.js:2620` | field update; `status:'paid'` is intercepted and delegated | not used by the page |
| `DELETE /api/invoices/:id` | `server.js:2649` | soft delete to the bin | yes |
| `POST /api/invoices/:id/email` | `server.js:2686` | SMTP-send the rendered document | yes |
| `GET /api/leads/:leadId/invoices` | `server.js:2000` | invoices for one contact | yes — lead detail |

`PUT /api/invoices/:id` deserves attention. It computes `wantsPaid = status === 'paid' && current.status !== 'paid'`,
writes every other field with the *old* status preserved, then calls
`paymentsApi.markPaidByInvoice(...)` — and returns HTTP 503 if the payments module is not mounted
(`server.js:2626-2643`). This is the mechanism that makes "the ledger is the only door to paid" true
for legacy clients as well as the new one.

---

### 4. The shared invoice document (`wappflow-web/src/lib/invoiceDoc.js`)

`buildInvoiceHTML(invoice, company, baseUrl)` returns a complete branded HTML document — logo,
company block, billed-to block, striped line-item table, subtotal/discount/tax/total, notes, footer.

It is **deliberately dependency-free** so that the Node backend can `import()` it directly across the
frontend/backend boundary: `renderInvoiceEmailHTML` resolves
`wappflow-web/src/lib/invoiceDoc.js` by path, converts it with `pathToFileURL`, dynamic-imports it once
and caches the module (`server.js:2674-2682`). The only environment-specific input, the logo base URL,
is a parameter rather than an env read. That is why "no imports" is a load-bearing constraint here, not
a style preference.

**The XSS history.** The file's own header (`invoiceDoc.js:1-16`) records that there were once *three*
invoice templates: this escaped one, a hand-maintained copy inside `server.js` for emailing, and a
thinner third one inside the lead page's Create Invoice modal. The third interpolated the customer name,
every line-item description and the notes field **raw** into a `document.write` on a same-origin window.
A lead's name is attacker-supplied — the public booking form creates leads from whatever a stranger
types — so booking under a crafted name and waiting for the studio to hit Print was a path to running
script with access to `localStorage`, where the auth token lives. Consolidating to one `esc()`-ing
builder is what makes that bug class impossible rather than merely absent. Both remaining call sites
now use it: `wappflow-web/src/app/invoices/page.js:44` (Print/PDF) and the lead-page draft print
(`wappflow-web/src/app/leads/[id]/page.js:333-346`).

**But the shared module is currently broken.** `invoiceDoc.js:69` calls `displayPhone(...)`, which is
defined in `wappflow-web/src/lib/api.js:634` and **is not imported by `invoiceDoc.js`** — the file has
zero import statements. Any invoice whose `customer_phone` is truthy will throw `ReferenceError:
displayPhone is not defined` at render time, in the browser print path *and* in the backend email path.
See defects.

---

### 5. The payments ledger — the source of cash truth

**Table `payments`** (`backend/payments.js:59-73`):

| Column | Notes |
|---|---|
| `id` TEXT PK, `workspace_id` TEXT NOT NULL | |
| `kind` TEXT, `ref_id` TEXT | schema comment lists `invoice \| contract_deposit \| print_order \| booking`; **only `'invoice'` is ever written by any code path** |
| `lead_id`, `amount` REAL, `currency`, `currency_symbol` | |
| `description`, `status` (`pending\|paid\|failed\|refunded`) | only `pending` and `paid` are ever written |
| `provider` (`manual\|stripe`), `provider_ref`, `checkout_url` | `provider_ref='backfill'` marks synthetic rows |
| `public_token` TEXT UNIQUE | 32-hex from `crypto.randomBytes(16)`; the credential for `/pay/<token>` |
| `created_by`, `created_at`, `paid_at` | |

Plus `payments_meta(key, value)` — a one-row-per-marker table used to gate one-time migrations, and
`idx_payments_ws`.

**The idempotency guard.** `payments.js:80`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_invoice_paid
  ON payments(workspace_id, kind, ref_id) WHERE status='paid' AND kind='invoice'
```

A *partial* unique index: at most one PAID ledger row per invoice per workspace, enforced by SQLite
rather than by remembering to check. It is created **before** the backfill so even the backfill inserts
are constrained, and wrapped in try/catch so a pre-existing duplicate logs loudly instead of aborting
boot (`payments.js:79-83`).

**The backfill.** Marker-gated on `payments_meta.backfill_invoice_payments` *and*
`NOT EXISTS`-guarded, so it is idempotent twice over (`payments.js:92-108`). Every invoice already
sitting at `status='paid'` before the ledger existed gets a synthetic `paid` row with
`provider_ref='backfill'` and `paid_at = invoice.created_at` (best-effort timing), so `payments`
becomes the complete historical record of cash rather than a record that starts mid-history.

**Mark-paid converges on one function.** `markPaidByInvoice(invoiceId, {workspaceId, workspaceOwnerId, userId, note})`
(`payments.js:164-193`) is the single door:

1. loads the invoice with the dual workspace predicate — 404 if not yours;
2. pre-checks for an existing paid row → returns `{ok:true, already:true}` (idempotent, no error);
3. inserts a `pending` manual ledger row carrying who marked it and an optional 300-char note;
4. calls `markPaid(p)` which flips the row to `paid`, sets `paid_at`, calls `settle(p)`, broadcasts the
   SSE event `payment_paid`, and fires an in-app notification;
5. if the partial index throws UNIQUE (a concurrent settle won), deletes its own pending row and returns
   the winner's id;
6. re-reads the invoice and, if it did *not* become `paid`, returns a `warning` string and logs an error —
   because `settle()` swallows its exceptions (`payments.js:138`) and a silent failure here means the
   ledger and the invoice disagree;
7. writes an `invoice_mark_paid` audit row.

Three entry points reach it: `POST /api/payments/invoice/:invoiceId/mark-paid` (`payments.js:196`, what
the UI calls — `wappflow-web/src/lib/api.js:546`), the legacy `PUT /api/invoices/:id` delegate
(`server.js:2639-2642`), and the Stripe webhook via `markPaid` (not `markPaidByInvoice`).

**Payments HTTP surface:**

| Method + path | File:line | Auth | Notes |
|---|---|---|---|
| `POST /api/payments/invoice/:invoiceId/mark-paid` | `payments.js:196` | authed | ledger-truth manual settle |
| `POST /api/payments/link` | `payments.js:222` | authed | mints `public_token`, optionally a Stripe session |
| `GET /api/payments` | `payments.js:231` | authed | last 200 rows + `provider` — **no frontend consumes this** |
| `POST /api/payments/:id/mark-paid` | `payments.js:237` | authed | settle any payment row directly |
| `GET /api/payments/public/:token` | `payments.js:246` | **public** | pay-page data + `brand` + `next` journey links |
| `POST /api/payments/webhook` | `payments.js:267` | **public, signature-verified** | Stripe |

---

### 6. Stripe — implemented, unconfigured

`payments.js` has **no Stripe SDK dependency**. `configured = !!process.env.STRIPE_SECRET_KEY`
(`payments.js:52-54`). Checkout sessions are created by `fetch`-ing
`https://api.stripe.com/v1/checkout/sessions` with a URL-encoded body: `mode=payment`, success/cancel
URLs pointing back at `/pay/<token>`, `client_reference_id = payment.id`, and one inline
`price_data` line item in minor units (`payments.js:111-130`). On success the payment row stores
`checkout_url` and `provider_ref = session.id`.

**Webhook verification** (`payments.js:18-37`, `267-302`) is a hand-rolled HMAC of Stripe's
`t=<ts>,v1=<sig>` scheme: parse the header, reject if `|now - t| > 300s` (replay window), HMAC-SHA256
`"${t}."` + the **raw body buffer**, compare with `crypto.timingSafeEqual` against every `v1` entry.
The raw bytes are available because `server.js:114` registers a path-scoped
`express.raw({type: () => true})` on `/api/payments/webhook` **before** the global
`express.json` at `server.js:115` — the comment there explicitly says DO NOT reorder.

Behaviour: 400 when `STRIPE_WEBHOOK_SECRET` is unset (a manual-only deployment gets no webhooks, so any
POST is a forgery attempt), 400 on non-Buffer body / bad signature / unparseable JSON; 200 for accepted,
duplicate, and post-verification errors (so Stripe stops retrying). Idempotency is
`webhook_events UNIQUE(platform, event_id)` (`server.js:835-841`) and the insert happens **only inside
the handled `checkout.session.completed` branch**, so a future handler for another event type is not
pre-marked processed. `verifyStripeSignature` is exported as a pure function for the harness
(`payments.js:310`); `backend/test-batch2-stripe.js` exercises valid / tampered / wrong-secret / stale /
multi-`v1` / malformed / non-Buffer / empty-secret cases plus a live SQL dedupe proof.

**Configuration state.** `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` appear in **neither**
`backend/.env.example` **nor** the environment-variable table in `DEPLOYMENT.md:306-327`. `ROADMAP.md:30`
records payments as "manual now; set `STRIPE_SECRET_KEY` to enable Checkout" and `ROADMAP.md:64` marks
Stripe go-live as *deferred until further notice*. **UNKNOWN: whether the live OVH host has these vars
set — the deployed `.env` is not in the repo. Every in-repo signal says no.** If unset, `createPaymentLink`
returns `provider:'manual'` and the pay page shows the "online payment isn't enabled yet" panel.

---

### 7. The public pay page (`/pay/[token]`)

`GET /api/payments/public/:token` (`payments.js:246-260`) returns only what a stranger should see:
amount, currency, description, status, provider, `checkout_url`, plus `brand` (resolved by
`backend/public-brand.js:55` from the workspace owner's `company_settings`) and `next` — journey links
to the client portal and booking page (`public-brand.js:107-122`). `workspace_id` and `lead_id` are
destructured away before responding.

The page (`wappflow-web/src/app/pay/[token]/page.js`) renders three states: **paid** (green tick,
receipt line, next-steps), **payable** (big amount + a "Pay securely →" anchor to `checkout_url`), and
**manual fallback** — literally "Online payment isn't enabled yet. Please complete payment with the
studio directly — they'll mark this as paid." (`page.js:53`). It also honours `?status=success` /
`?status=cancelled` from the Stripe redirect. This fallback panel is what a real client sees today.

---

### 8. The print store

**Domain terms** (needed to read this): a *project* is one job for one client. A *gallery* is a
published set of delivered photos with a `share_token`, reachable at `/g/<token>`. An *album* is a
designed print product (page layouts) — different thing. A *cull* is the photographer's keep/reject pass.
The print store hangs off the **gallery**: the client is looking at their photos, and the shop link is
right there.

**Tables** (`backend/print-store.js:27-45`):

- `ms_print_products(id, workspace_id, name, kind, description, options JSON, active, sort_order, created_at)`
  — `kind` is one of print/album/digital/frame (UI list at `wappflow-web/src/app/studio/store/page.js:8`);
  `options` is `[{label, price}]`, so "8×10 → 25" is an option, not a separate product.
- `ms_print_orders(id, workspace_id, gallery_id, lead_id, items JSON, total, currency_symbol,
  customer_name/_phone/_email, note, status, created_at)` + three columns added later by ALTER:
  `invoice_id`, `payment_id`, `pay_url` (`print-store.js:45`).

**Admin surface** — `/studio/store` (a single 93-line page): `GET|POST /api/store/products`,
`PUT|DELETE /api/store/products/:id`, `GET /api/store/orders`,
`POST /api/store/orders/:id/status` (`print-store.js:53-92`).

**Public surface** — keyed by the gallery share token, no auth:

- `GET /api/store/public/:token` (`print-store.js:95`) → brand, currency symbol, gallery title, active products.
- `POST /api/store/public/:token` (`print-store.js:105`) → place an order.

The ordering flow is the interesting one (`print-store.js:105-176`), and it is a full chain:

1. resolve the gallery by `share_token`; 404 if unknown;
2. require a name and at least one of phone/email;
3. **re-price every line server-side from the catalogue** — the client's prices are ignored entirely
   (`print-store.js:115-121`). Unknown product ids are silently dropped;
4. resolve or create the CRM lead: prefer the gallery's project's `lead_id`, else match an existing lead
   by phone then email, else insert a new `New`-status lead with `first_message = 'Print order'`;
5. insert the order and a `contact_history` line;
6. **raise an invoice** through `createInvoiceForLead` (status `sent`) and **mint a pay link** through
   `createPaymentLink` (kind `'invoice'`, ref the invoice), storing `invoice_id`, `payment_id`, `pay_url`
   on the order (`print-store.js:142-162`). The comment there is explicit that the store used to price an
   order and then never bill anybody;
7. WhatsApp the client the pay link via the injected `sendClientMessage`;
8. broadcast `print_order_created` and return `{ok, total, currency_symbol, pay_url, next}`.

**Gallery entry point.** `store_enabled` is not a per-gallery setting — it is computed as
"does this workspace have ≥1 active product?" (`backend/media-studio.js:2700`), and if true the
"🛍️ Order prints" button appears on **every** published gallery
(`wappflow-web/src/app/g/[token]/page.js:214-216`).

**Wiring order matters.** `print-store` mounts *before* `payments` (`server.js:6428` vs `6439`), so
`createPaymentLink` is injected as a thunk `(args) => paymentsApi.createPaymentLink(args)` that resolves
at call time (`server.js:6433`).

---

### 9. What Analytics counts as revenue — and how that changed

This is one of the clearest before/after stories in the codebase, and the code comments state it
outright (`server.js:2822-2831`).

**Before:** `GET /api/analytics` reported `total_sales = SUM(leads.actual_sale)` — a number a human typed
into the deal record. A studio could collect a year of real money and see zero, or see a figure nobody
ever received.

**Now** (`server.js:2833-2845`), the ledger is reported *beside* the estimate, not instead of it:

| Field | Query | Meaning |
|---|---|---|
| `collected` | `SUM(amount) FROM payments WHERE workspace_id=? AND status='paid'` | cash actually received, all time |
| `collected_this_month` | same, `strftime('%Y-%m', COALESCE(paid_at, created_at)) = this month` | |
| `outstanding` | `SUM(total) FROM invoices WHERE status != 'paid' AND not deleted` | claims not yet settled |
| `invoices_raised` | count of non-deleted invoices | |
| `contracts_signed` / `contracts_awaiting` | `cs_documents` by status | |
| `bookings_upcoming` | future non-cancelled bookings | |
| `total_sales` (kept) | `SUM(leads.actual_sale)` | now labelled **"Pipeline Value"** in the UI |

The Reports page renders `collected` as the headline "Collected" KPI with `collected_this_month` as its
subtitle, and moves the old estimate down to a second row as "Pipeline Value"
(`wappflow-web/src/app/reports/page.js:355-370`).

**Two places did not follow.** `GET /api/reports/overview`'s "Revenue over time" chart still sums
`leads.actual_sale` grouped by `closed_at` (`server.js:2884-2890`), and the Dashboard's six-month
"won revenue" trend and per-column pipeline value still use `actual_sale || estimated_value`
(`wappflow-web/src/app/dashboard/page.js:853, 975, 1052`). So "Collected" and "revenue over time" on the
same screen answer different questions from different sources.

One more ledger-derived number: the leads list now computes `lifetime_revenue` per contact as the sum of
their **paid invoices** via a correlated subquery, replacing `actual_sale` which reported a repeat
client's fifth booking as their entire history (`server.js:1721-1725`).

---

### 10. Maturity assessment

| Feature | Status | Named gap |
|---|---|---|
| Invoice create / list / edit / soft-delete | **SHIPPED** | — |
| Invoice numbering (per-workspace counter) | **SHIPPED** | no UNIQUE on `invoice_number`; single-process assumption |
| Shared invoice document (print + email) | **PARTIAL** | `displayPhone` is undefined in `invoiceDoc.js` — throws for any invoice with a phone |
| Invoice email via SMTP | **SHIPPED** | requires per-workspace SMTP in Settings; 400 otherwise |
| Invoice bin / restore | **PARTIAL** | backend routes exist and work; **no UI and no `api.js` client** — unreachable for users |
| Payments ledger + partial UNIQUE idempotency | **SHIPPED** | — |
| Manual mark-as-paid through the ledger | **SHIPPED** | — |
| Payment links (`public_token` + `/pay/<token>`) | **SHIPPED** | manual-settlement mode only in practice |
| Stripe Checkout | **PARTIAL / not live** | code complete and tested; `STRIPE_SECRET_KEY` unset — see §6 |
| Stripe webhook + signature verification | **SHIPPED (dormant)** | 400s everything until `STRIPE_WEBHOOK_SECRET` is set |
| Payments list screen | **STUB** | `GET /api/payments` returns data; nothing in `wappflow-web/src/app` calls it. The ledger has no UI |
| Print store admin (products, orders) | **SHIPPED** | no per-gallery enable/disable; no image per product |
| Public shop + server-side re-pricing | **SHIPPED** | — |
| Order → invoice → pay link → WhatsApp chain | **SHIPPED** | see the `kind` mismatch defect below |
| Print-order fulfilment states | **PARTIAL** | `status` column doubles as payment state and fulfilment state |
| `overdue` invoice status | **SOLD-NOT-BUILT** | filter button, badge tone and document colour exist; nothing ever sets it |
| Payment kinds `contract_deposit`, `print_order`, `booking` | **SOLD-NOT-BUILT** | declared in the schema comment; no code writes them |
| `manage_invoices` permission | **SOLD-NOT-BUILT** | defined in `ROLE_PERMISSIONS` and shown in the Team UI; enforced on zero routes |
| Refunds / partial payments / payment plans | **not built** | `status` allows `refunded`/`failed`; no code path writes either |

---

### 11. Defects, security weaknesses and data-integrity risks

Read-only observations. Nothing here was changed.

**D1 — `invoiceDoc.js` throws on any invoice with a phone number (BUG, user-visible).**
`wappflow-web/src/lib/invoiceDoc.js:69` calls `displayPhone(...)`; the function lives at
`wappflow-web/src/lib/api.js:634` and the document module has **no imports at all**. Both consumers
break: the browser Print/PDF path (`app/invoices/page.js:44`) and, because the backend dynamic-imports
the same file (`server.js:2678`), `POST /api/invoices/:id/email` → HTTP 500. Since the modal prefills
`customer_phone` from the lead (`app/leads/[id]/page.js:317`), most real invoices carry one. This also
silently violates the "deliberately dependency-free" invariant the file's own header depends on.

**D2 — `settle()` writes across tenants (SECURITY / data integrity).**
`payments.js:135-136` runs `UPDATE invoices SET status='paid' WHERE id = ?` and
`UPDATE ms_print_orders SET status='paid' WHERE id = ?` with **no `workspace_id` predicate**. Meanwhile
`POST /api/payments/link` (`payments.js:222-229`) accepts `ref_id` straight from the request body and
never checks it belongs to `req.workspaceId`. An authenticated user in workspace A can therefore mint a
payment for `ref_id` = an invoice in workspace B, call `POST /api/payments/:id/mark-paid` (which only
verifies the *payment* row is theirs, `payments.js:239`), and flip another tenant's invoice to paid.
`markPaidByInvoice` is correctly scoped; the link + generic mark-paid pair is the hole. Note the partial
UNIQUE index is keyed `(workspace_id, kind, ref_id)`, so it does not block this either.

**D3 — the print-store pay link settles the invoice but never the order.**
`print-store.js:154` mints the link with `kind: 'invoice'`. `settle()` only touches `ms_print_orders`
when `kind === 'print_order'` — a value nothing in the codebase ever writes. So a client who pays for
prints marks the *invoice* paid while the order sits at `status='new'` forever. The `settle()`
print-order branch is dead code.

**D4 — `ms_print_orders.status` conflates payment and fulfilment.**
Default `'new'`; the admin dropdown offers `new | in_production | fulfilled | cancelled`
(`app/studio/store/page.js:9`); `settle()` would write `'paid'`. Even if D3 were fixed, marking an order
"in production" would erase the record that it was paid, and a `'paid'` value renders as an
out-of-range `<select>` value in the admin UI.

**D5 — invoice totals are client-supplied and never validated.**
`createInvoiceForLead` inserts `subtotal`, `tax_rate`, `tax_amount`, `discount` and `total` exactly as
received (`server.js:2599-2606`); all arithmetic happens in the browser
(`app/leads/[id]/page.js:300-302`). Nothing checks that `total == subtotal + tax - discount`, or that
`total` matches the line items. Contrast the print store, which re-prices server-side
(`print-store.js:115-121`) — the correct pattern already exists in the repo.

**D6 — `manage_invoices` is defined but never enforced.**
`ROLE_PERMISSIONS` grants it to super_admin/admin/manager and denies it to `user`
(`server.js:186-189`), and the Team page presents it as a real toggle
(`wappflow-web/src/app/team/page.js:32`). No invoice or payment route reads it. Any authenticated member
of a workspace can create, edit, delete and mark-paid invoices.

**D7 — the payments ledger has no UI and is not exportable.**
`GET /api/payments` has no caller in `wappflow-web/src`. The workspace data export
(`server.js:2975-3004`) includes `invoices` but **not** `payments`, `ms_print_orders` or
`ms_print_products`. The table the product treats as cash truth cannot be read or exported by the person
whose cash it is.

**D8 — public store POST is a lightly-rate-limited write amplifier (ABUSE).**
The only limiter is global: 500 requests / 15 min / IP (`server.js:82-92`). Each anonymous
`POST /api/store/public/:token` can create a lead, an order, an invoice (burning an invoice number), a
payment row, and **send a WhatsApp message from the studio's number to an attacker-supplied phone**
(`print-store.js:169`). There is no CAPTCHA, no per-token throttle, and no dedupe.

**D9 — `outstanding` includes drafts.**
`server.js:2837` sums every invoice with `status != 'paid'`, which includes `draft`. A studio drafting
quotes inflates its own receivables figure. Note also that booking handoff creates zero-total drafts
(`booking.js:188-195`) — harmless for the sum, but they count toward `invoices_raised`.

**D10 — multi-currency sums are unguarded.**
`collected` sums `payments.amount` regardless of `payments.currency` (`server.js:2834`). Invoices copy
`currency` from `company_settings` at creation, so changing the workspace currency later leaves old rows
in the old currency and the SUM silently mixes units.

**D11 — a Stripe settlement on an already-manually-paid invoice is swallowed.**
If an invoice is marked paid manually and a Stripe session for it later completes, `markPaid` violates
`uq_payments_invoice_paid`, the webhook's outer catch returns `200 {received:true, note}`
(`payments.js:301`), and that payment row stays `pending` — so real money received via Stripe is never
counted in `collected`. Correct at the invoice level, wrong at the cash level.

**D12 — invoice numbering is safe only by accident.**
The read-modify-write of `invoice_counter` (`server.js:2588-2596`) is not wrapped in a transaction and
`invoice_number` has no UNIQUE constraint. `createInvoiceForLead` is fully synchronous and
better-sqlite3 is synchronous, so a single-process pm2 fork deployment cannot interleave — but a second
worker, a cluster-mode restart, or any future `await` inserted into that function produces duplicate
invoice numbers with no error. Separately, if the owner has no `company_settings` row the `UPDATE`
affects zero rows and *every* invoice becomes `INV-1001`; the row is created at signup
(`server.js:1255`, `1407`) so this is a legacy-data risk, not a fresh-signup one.

**D13 — `status: 'sent'` is not a known invoice status.**
Contract automations and print-store orders create invoices with `status:'sent'`
(`contracts-studio.js:317`, `print-store.js:149`), but the registry only knows
`draft|pending|paid|overdue` (`lib/invoiceStatus.js:8-12`). `makeStatusLookup` deliberately renders an
unknown value as a neutral humanised badge rather than pretending it is a draft — so these render as a
grey "Sent" pill and are invisible to every status filter button on `/invoices`.

**D14 — small dead code in the notification path.**
`payments.js:149` reads `p.customer_name || p.payer_name`; the `payments` table has neither column, so
the "who paid" clause in every payment notification is always the empty branch.

**D15 — the module gate for payments cannot fire from any plan.**
`MODULE_GATES` includes `{prefix:'/api/payments/', key:'payments'}` (`server.js:6266`), but no plan in
`backend/entitlements.js` defines a `payments` feature key (`print_store` does exist, `entitlements.js:32`).
`ent.features.payments` is therefore `undefined`, never `=== false`, so the gate is inert unless someone
sets a per-workspace override. Not a bug today; a trap for anyone who assumes payments are plan-gated.

**D16 — copy/behaviour mismatch on delete.**
The invoices page confirm dialog says the invoice "will be permanently deleted"
(`app/invoices/page.js:282`), but `DELETE /api/invoices/:id` soft-deletes to a bin the UI does not
expose (D7's sibling). The user is told something false in the more alarming direction.

---

### 12. Configuration reference for this domain

| Variable | Read at | Effect if unset |
|---|---|---|
| `STRIPE_SECRET_KEY` | `payments.js:52` | `provider='manual'`; no Checkout session; `/pay` shows the manual panel |
| `STRIPE_WEBHOOK_SECRET` | `payments.js:53` | webhook 400s every POST; boot warns if the secret key *is* set (`payments.js:55-57`) |
| `FRONTEND_URL` | `server.js:6433-6448` → `clientBaseUrl` | pay/shop/portal links become relative and useless off-site; also the CORS origin (`server.js:106`) |

Per-workspace settings that shape money behaviour live on the owner's `company_settings` row:
`invoice_prefix`, `invoice_counter`, `currency`, `currency_symbol`, `currency_position`, `tax_name`,
`tax_rate`, `company_logo`/`company_name`/`brand_accent` (the last three feed `publicBrand`).
SMTP for invoice email is a separate per-owner table, `email_smtp_settings` (`server.js:2696`).

**SSE events emitted here:** `payment_paid` (`payments.js:143`), `print_order_created`
(`print-store.js:171`), and `notification` frames with `kind:'payment'` (`server.js:1072-1085`). Note
that **no frontend code subscribes to `payment_paid` or `print_order_created`** — the invoices page and
store page update optimistically or on manual reload only.

**Audit actions written:** `create_invoice`, `invoice_mark_paid`, `invoice_emailed`, `soft_delete`,
`restore` (all on the `invoices`/`invoice` entity).

---

### 13. Open questions

- **UNKNOWN: whether Stripe is configured on the live OVH host.** The deployed `.env` is not in the
  repo, and neither `backend/.env.example` nor `DEPLOYMENT.md:306-327` documents the two Stripe
  variables at all. Every in-repo signal (`ROADMAP.md:30`, `ROADMAP.md:64`) says manual-only.
- **UNKNOWN: whether the `uq_payments_invoice_paid` index actually created successfully on the
  production database.** Creation is wrapped in try/catch and only logs on failure
  (`payments.js:81-83`); verifying requires reading the live DB at `/data/wappflow.db`.
- **UNKNOWN: how many production invoices carry `status='sent'`** (D13) — i.e. how much money is
  currently invisible to the `/invoices` status filters. Requires a live query.
- **UNKNOWN: whether pm2 runs the API in fork or cluster mode in production**, which decides whether
  D12's invoice-number race is theoretical or live. `DEPLOYMENT.md:454` shows a plain
  `pm2 start backend/server.js` (fork), but the deployed ecosystem config is not in the repo.
- **Deferred to other sections:** the subscription/plan side of money (`backend/pricing.js`,
  `backend/entitlements.js`, `plan_prices`, the Founding 100 programme) — enforcement and limits, not
  client billing. Also the contract-signing automation engine itself (`contracts-studio.js`), covered in
  the Contracts Studio section; only its invoice/deposit hand-off is documented here.
