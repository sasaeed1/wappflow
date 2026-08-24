## The public client journey and the Client Portal

*Observation timestamp: this section describes the code as it stood on **2026-08-24**, on branch `main`
at commit `c23c7af`. This area was rewritten four days earlier by commit `e2f2eec` ("Phase 8: the
studio's identity on every page their clients see"), and two of the pages described here
(`app/book/[slug]/page.js`, `app/booking/manage/[token]/page.js`) plus `backend/booking.js` have
**uncommitted working-tree changes** at the time of reading — a Phase-9 timezone/booking-integrity
effort in progress (`backend/studio-time.js` is untracked). Anything about booking times below is a
snapshot of work mid-flight.*

---

### What this part of the product is for

WappFlow is sold to small creative studios — wedding and event photographers, videographers. The
studio logs in; **its clients never do**. Everything a client of the studio touches lives in a set of
eight login-less web pages, each addressed by a random token (or, for two of them, a human-readable
slug). The studio pastes those URLs into WhatsApp, and the client taps them from a phone.

This is commercially the most important surface in the product: it is the only part a *paying
customer's customer* ever sees, so it doubles as the studio's shop window. Until Phase 8 it was
branded WappFlow — a bride opened her own wedding photographs on a page that named nobody, above a
footer crediting the software vendor. Phase 8 introduced a single brand resolver
(`backend/public-brand.js`) and per-page link previews (`wappflow-web/src/lib/publicMeta.js`) so the
studio's own identity leads on every one of them.

Some domain vocabulary used below, because it is photography-trade jargon:

- **Shoot / project** (`ms_projects`) — one job: "Hina — mehndi". Everything hangs off it.
- **Cull** — the studio's private act of triaging thousands of raw frames down to keepers. Clients
  never see a cull; it happens inside the app.
- **Gallery** (`ms_galleries`) — a *published, client-facing* set of finished photographs from one
  shoot. This is the delivery. A gallery has a `share_token`; that token is the whole URL.
- **Album** (`ms_albums`) — a physical printed book laid out page by page. Distinct from a gallery:
  a gallery is a web page, an album is a product. The portal only *lists* albums; it cannot show them.
- **Proofing / selection set** (`ms_proofing_sets`) — a formal round where the client is asked to pick
  N photographs (for the album, for retouching) with a quota, which the studio then approves or sends
  back for revision.
- **Portfolio** (`ms_portfolios`) — the studio's own public shop window at a vanity handle. Not tied
  to any client.

---

### 1. The eight public surfaces

| Route (frontend) | Public API it reads | What the client sees | What the client can *do* | Maturity |
|---|---|---|---|---|
| `/client/[token]` | `GET /api/client-portal/public/:token` | Unified hub for one CRM contact: progress milestones, documents, galleries, albums, invoices, print orders, projects | Follow links out; pay an invoice if a pay link exists; book again; order prints | **SHIPPED** (read-only hub) |
| `/g/[token]` | `GET /api/media/portal/:token` (+ 7 sub-routes) | Dark, editorial photo gallery, masonry grid, optional named "story sections" | Favourite, comment, save a named collection, download one or all (ZIP), run a slideshow, submit proofing selections, jump to the shop or the portal | **SHIPPED** |
| `/d/[token]` | `GET /api/cs/public/:token` | A block-built contract / proposal / quote, in one of 3 themes | Pick a package + add-ons (live total), ask an AI question about the document, draw + type a signature and sign, or decline | **SHIPPED** |
| `/shop/[token]` | `GET /api/store/public/:token` | Print/album/digital catalogue for the studio, framed as "from *gallery title*" | Add to cart, set quantities, check out with name + phone/email | **SHIPPED** |
| `/pay/[token]` | `GET /api/payments/public/:token` | One amount due, a description, the studio's mark | Click through to Stripe Checkout — *if* Stripe is configured; otherwise a "pay the studio directly" message | **PARTIAL** — see §6 |
| `/book/[slug]` | `GET /api/booking/public/:slug` | Service picker, day strip, time grid, intake questions | Book a slot; receives a `manage_url` | **SHIPPED** (timezone work in flight) |
| `/booking/manage/[token]` | `GET /api/booking/manage/:token` | The one booking, its status | Reschedule to another offered slot, or cancel (type-to-confirm) | **PARTIAL** — no metadata/noindex, see §5 |
| `/folio/[handle]` | `GET /api/media/public/portfolio/:handle` | The studio's portfolio in one of 10 themes, hero + about + grid + lightbox | Browse; email/call/Instagram/website links | **PARTIAL** — Phase 8 skipped its UI, see §4 |

Two of these are *meant* to be found: `/book/[slug]` and `/folio/[handle]` explicitly set
`robots: { index: true, follow: true }` (`app/book/[slug]/layout.js:14`,
`app/folio/[handle]/layout.js:13`). The six token pages are `index: false, follow: false`
(`lib/publicMeta.js:53`).

---

### 2. The capability-token security model

**The token is the credential.** There is no login, no password (except one optional per-gallery
password), no session, and no rate limit beyond the global one. Whoever holds the URL *is* the client,
with all of that client's rights. Every backend handler in this domain is mounted with no `auth`
middleware and resolves the row directly from the token.

| Token | Table.column | Entropy | Minted where | Revocable? |
|---|---|---|---|---|
| Portal | `client_portals.token` | `crypto.randomBytes(18)` = 36 hex chars | `ensureClientPortal()`, `server.js:6316-6328` (idempotent) | **No** — no revoke/expiry column or endpoint |
| Gallery | `ms_galleries.share_token` | `randomBytes(16)` = 32 hex | on publish, `media-studio.js:1717` — **reused** if already present | Indirectly: set `status` back to `draft` |
| Document | `cs_documents.token` | `randomBytes(18)` | on create/send, `contracts-studio.js:789,966` | Yes: `status='voided'`, or `expires_at` |
| Payment | `payments.public_token` | `randomBytes(16)` | `createPaymentLink()`, `payments.js:213` | No |
| Booking | `bookings.token` | `randomBytes(12)` = 24 hex | on public booking, `booking.js:390` | No |
| Portfolio | `ms_portfolios.token` *or* `handle` | `randomBytes(8)` = 16 hex; **handle is a slug of the user's name** | `getOrCreatePortfolio()`, `media-studio.js:2427-2438` | `is_public = 0` |

The implications a reader planning work should hold on to:

1. **Tokens are forwarded.** Clients paste gallery links into family WhatsApp groups. Every capability
   attached to that token travels with it. On `/g` that means anyone in the group can favourite,
   comment as any name they type, download the whole shoot as a ZIP, and submit the proofing round.
2. **The portal token is a super-token.** `/client/[token]` returns, among other things, `/d/<token>`
   links for every one of that contact's contracts — i.e. the **signing** capability. Hand someone the
   portal link and you have handed them the ability to sign your contracts. It also never expires.
3. **Photo files themselves are not gated at all.** Images resolve to `/uploads/...` served by
   `express.static` with `Access-Control-Allow-Origin: *` and no auth (`server.js:114-121`); the
   gallery password only guards the JSON *listing*, not the JPEGs.
4. **The brand payload is a deliberate public contract.** `public-brand.js:24-26` restricts the shape
   to `{name, logo, accent, website, email, phone, tagline}` with an explicit comment that anything
   added there is effectively public, and `safeColor()` (`public-brand.js:42-45`) whitelists
   `#rgb`/`#rrggbb` because `accent` is interpolated into inline CSS on a stranger-reachable page.
5. **Cross-tenant hardening exists in exactly one place and is worth copying.** The portal handler
   scopes *every* child query to the portal's own `workspace_id`, with a comment explaining that
   filtering by `lead_id` alone would let a rival tenant attach a contract to your lead id and have
   your portal hand strangers its signing token (`server.js:6341-6353`).

---

### 3. Branding and link metadata

`backend/public-brand.js` is the single resolver. It reads the **workspace owner's** `company_settings`
row — found via `workspace_members WHERE role='super_admin'` — and returns:

| Field | Source column | Notes |
|---|---|---|
| `name` | `company_settings.company_name` | falls back to `null`, never to the literal "WappFlow" |
| `logo` | `company_settings.company_logo` | absolutised against `FRONTEND_URL` — **see §7, this is wrong** |
| `accent` | `company_settings.brand_accent` | column added by `ensureBrandColumns()`; **no writer exists** |
| `website` / `email` / `phone` | `company_website` / `company_email` / `company_phone` | rendered in `PublicFooter` |
| `tagline` | `company_settings.brand_tagline` | column exists; **no writer, no reader in any page** |

Three shared React components consume it:

- **`components/PublicBrandMark.js`** — the logo `<img>`, or a coloured square with the studio's
  initial, or **nothing**. The refusal to render a placeholder is explicit and deliberate: "a
  placeholder mark asserts an identity that isn't the studio's" (`PublicBrandMark.js:11-12`). Used by
  `/client`, `/g`, `/shop`, `/pay`, `/book`, `/booking/manage`.
- **`components/PublicBrandHeader.js`** — a sticky bar version (mark + name + page title + a meta
  slot), with `light`/`dark` tones. Used only by `/d`.
- **`components/PublicFooter.js`** — studio name, website, email, then a de-emphasised "Powered by
  WappFlow" second line. The two lines are deliberately separate so a white-label entitlement could
  suppress one — but see §7, no such check exists.

A fourth, **`components/PublicNextSteps.js`**, is the anti-dead-end component: after a client signs,
pays, orders or books, the success screen renders whatever `journeyLinks()`
(`public-brand.js:106-121`) found — a portal link and/or a booking link — instead of terminating.

**`components/PublicScope.js`** solves a narrower problem: the app is dark-themed by default, but the
public pages are fixed-light. It adds `wf-public` to `<html>` on mount and removes it on unmount,
because `confirm`/`Toast`/`Modal` render through `createPortal(children, document.body)` and a wrapper
class would never reach them. `/g` and the executive `/d` theme deliberately do *not* use it — they
are dark by design.

**Link previews.** `lib/publicMeta.js` gives each token route a thin server `layout.js` exporting
`generateMetadata`, which server-side-fetches the same public endpoint and builds a per-studio
OpenGraph/Twitter card. Two details are load-bearing:

- The fetch sends `X-WF-Preview: 1` (`publicMeta.js:24`). Backends check `isPreview(req)`
  (`contracts-studio.js:95`, `media-studio.js:39`) so a crawler rendering a link preview does **not**
  flip a contract to `viewed`, does **not** log a gallery access, and does **not** inflate the
  portfolio `view_count`. Without it, sending a contract would immediately report it as opened.
- `/pay` deliberately omits the amount from its title — "a payment link previewed in a group chat
  should not announce what somebody owes" (`app/pay/[token]/layout.js:8-9`).

`/booking/manage/[token]` has **no `layout.js` and therefore no metadata** — it inherits the root
layout's "WappFlow — AI-powered customer operations" OpenGraph card *and* is indexable, since the root
layout sets no `robots`.

---

### 4. How the surfaces connect to each other

Before Phase 8 these were eight microsites. The current wiring:

```
/g  ──"Order prints"──▶ /shop/<same gallery token>      (g/page.js:215; only if store_enabled)
/g  ──"Everything else from X"──▶ /client/<portal token> (media-studio.js:2723-2730)
/client ──rows──▶ /g/<token>, /d/<token>, /pay/<token>   (server.js:6409-6410, 6394)
/client ──CTAs──▶ /book/<slug>, /shop/<gallery token>    (server.js:6415-6432)
/d  ──after signing──▶ PublicNextSteps{portal, book}     (contracts-studio.js:1077)
/shop ──after ordering──▶ pay_url + PublicNextSteps      (print-store.js:172-175)
/pay ──always──▶ PublicNextSteps{portal, book}           (payments.js:257)
/book ──after booking──▶ manage_url + PublicNextSteps    (booking.js:449-452)
/folio ──▶ nothing                                        (isolated)
```

`journeyLinks()` returns only links that exist, so a studio with no booking slug simply gets one
button rather than a broken one.

**`/folio` is the outlier.** Its `layout.js` was added on 2026-08-24 for metadata, and
`shapePublicPortfolio()` now returns a `brand` object (`media-studio.js:2471-2478`) — but the renderer,
`app/folio/portfolio-view.js`, was last touched **2026-06-15** and ignores it entirely. It still hard-codes
`Made with WappFlow Studio` in its footer (`portfolio-view.js:83`) and uses its own separate identity
system (`pf.avatar_url`, `pf.title`, `settings.accent`, 10 themes in `pf-theme-*` CSS). Portfolios are
also **per-user, not per-workspace** (`ms_portfolios.user_id`), so a three-person studio has three
portfolios. Classify: **PARTIAL** — the brand payload is on the wire and unused.

---

### 5. Per-page mechanics worth knowing

**`/client/[token]`** (`app/client/[token]/page.js`, 132 lines). Purely a reader. Sections render
conditionally, so an empty studio sees a short page. Invoice rows show a "Pay now" button only when a
`payments` row with a `public_token` already exists for that invoice and is unpaid
(`server.js:6363-6372`) — pay links are **not** minted automatically when an invoice is sent; a human
must click "💳 Payment link" in `app/invoices/page.js:36`. Classify the "pay from the portal" feature
as **PARTIAL** with that named gap.

**`/g/[token]`** — the richest surface. Public sub-routes, all gated by the same
`portalAllowed(gallery, pw)` check (`media-studio.js:1533-1537`) except where noted:

| Method + path | Effect |
|---|---|
| `GET /api/media/portal/:token?pw=` | gallery payload; 401 + `needs_password` if gated; logs an `ms_gallery_access` row unless preview |
| `POST …/favorite` | toggles `ms_client_favorites`, SSE `ms_client_favorited` |
| `POST …/collection` | saves the client's favourites as a named `ms_fav_collections` row + notifies the studio |
| `POST …/comment` | `ms_client_comments`, capped at 2000 chars, SSE + notify |
| `POST …/export` | queues a ZIP job; 403 if `download_policy === 'none'` |
| `GET …/export/:exportId` | poll status — **no password check** |
| `POST …/proofing/:setId/select` | toggle one selection; 409 if the set is closed; validates the asset belongs to the gallery |
| `POST …/proofing/:setId/submit` | closes the round, emits `ms_proofing_submitted` |

`download_policy` (`'none' | 'web' | 'high-res'`) is enforced server-side in `shapePublicAsset()`
(`media-studio.js:1540-1558`): the full-resolution original is only ever put in `download_url` when
the policy is `high-res`. Gallery-level `settings.watermark` burns a tiled text watermark into the
**ZIP export's** web variant (`startGalleryExport`, `media-studio.js:1756-1772`); the *on-page*
watermark is a separate, project-level "apply watermark" operation that writes `variants.watermarked`
(`media-studio.js:669-718`). The `/g` page never reads the `watermark` boolean it is sent. Classify
watermarking as **PARTIAL** — two mechanisms, one toggle, easy to believe you are protected when you
are not.

Client identity in the gallery is a free-text "Your name (optional)" box persisted to
`localStorage['wf_gallery_contact']`, sent as `contact_identifier`, defaulting to `'guest'`.

**`/d/[token]`** — renders `blocks` (a JSON array of editor blocks) through the shared `BlockView`
from `app/contracts/blocks.js`, so the client sees exactly the editor's output. Interactive pricing:
`package` blocks are single-select, `addons` are multi-select, and a live total is computed
client-side and posted back as `selection` on signing (`d/page.js:44-52, 141`). The sign sheet
requires all three of typed legal name, a drawn canvas signature, and an explicit ESIGN/UETA consent
checkbox that names IP/timestamp/device capture (`d/page.js:213-241`); the server re-checks all three
(`contracts-studio.js:1044-1047`) and stores IP, user-agent and a SHA-256 `doc_hash` over
`id::blocks::name::signature::timestamp`. Two client-facing extras: an **AI "Ask a question" widget**
(`POST /api/cs/public/:token/ask`, answered strictly from the document text), and a **silent analytics
beacon** that reports time-on-page and the deepest block scrolled into view via `IntersectionObserver`
and `navigator.sendBeacon` (`d/page.js:56-73`).

**`/book/[slug]`** — `booking_settings` has only `workspace_id`, `slug`, `settings` JSON. There is **no
enabled/published flag**: the page is live the moment a slug exists. Slots come from `computeSlots()`
(`booking.js:136-161`), which honours weekly `availability`, `slot_min`, `buffer_min`, a `blackout`
date list, `days_ahead`, and a hard `LEAD_MS` of one hour. Creation checks and claims the slot inside
a single `db.transaction` (`booking.js:333-355`) — the comment notes that checking outside it left the
exact race the "just taken" 409 pretends to prevent. Booking find-or-creates a `leads` row by phone,
then email.

---

### 6. Configuration and environment

| Variable | Consumed by | Effect on this domain |
|---|---|---|
| `FRONTEND_URL` | backend, passed to every module as `clientBaseUrl` | builds every `/g`, `/d`, `/pay`, `/client`, `/book`, `/booking/manage` absolute link, and absolutises `brand.logo` |
| `NEXT_PUBLIC_BASE_URL` | `lib/api.js:4`, `lib/publicMeta.js:16` | the **API** origin; used for `<img src>` on `/uploads/*` and for the server-side metadata fetch. Defaults to `http://localhost:3001` / `http://127.0.0.1:3001` |
| `NEXT_PUBLIC_API_URL` | `lib/api.js` | API base *including* `/api` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | `backend/payments.js` | when absent, `provider` is `manual`, `checkout_url` is null, and `/pay` degrades to "Online payment isn't enabled yet… they'll mark this as paid" (`pay/page.js:53`). **UNKNOWN: whether Stripe is configured in the live OVH deployment — the repo contains no `.env`.** |
| `STORAGE_PROVIDER` | `backend/storage/index.js` | `local` (default) serves `/uploads/<key>`; `r2` returns bucket URLs and presigns ZIP downloads |
| `TRUST_PROXY` | `server.js:37` | makes `req.ip` (and therefore signature IP capture and rate limiting) reflect the real client behind nginx |

---

### 7. Bugs, security weaknesses, data-integrity risks and smells

Read-only observations; nothing here was changed.

1. **`brand.logo` is built against the wrong host.** `absolute()` (`public-brand.js:30-37`) prefixes
   the stored `/uploads/logos/…` path with `FRONTEND_URL`, which `DEPLOYMENT.md:312` defines as the
   **Next.js app origin** (`https://app.example.com`), while `/uploads` is served by the **API**
   origin (`server.js:121`). `wappflow-web/next.config.ts` has no rewrites. An uploaded logo therefore
   resolves to a 404 in the header, the footer and the OpenGraph image on every public page. This is
   the headline feature of Phase 8 and it appears broken in any split-host deployment. (It works in
   dev only because both fall back to localhost.)
2. **The logo upload writes to the wrong row.** `POST /api/settings/logo` stores against
   `req2.userId` (`server.js:1605-1607`) whereas the settings PUT beside it uses
   `req.workspaceOwnerId`, and `publicBrand()` reads the `super_admin`'s row. A team member uploading
   a logo silently changes nothing a client will ever see.
3. **`brand_accent` and `brand_tagline` have no writer.** The columns are created
   (`public-brand.js:87-91`) and read, but nothing in `backend/` or `wappflow-web/src/` ever sets
   them except the Phase-8 test. Studio accent colour on public pages is **STUB**.
4. **White-label is SOLD-NOT-BUILT.** `entitlements.js:82` grants `white_label: true` to Studio+ and
   Enterprise, the landing page sells it (`app/page.js:1815, 1964`), and `PublicFooter.js:37` renders
   "Powered by WappFlow" unconditionally. Nothing anywhere reads the `white_label` key. Unlike
   `ai_editing` it is *not* in `UNBUILT_FEATURES` (`entitlements.js:135`), so the resolver reports it
   as an available feature of a paid plan.
5. **A signed-but-expired or declined contract can still be signed.**
   `POST /api/cs/public/:token/sign` blocks only `voided`, `signed` and `completed`
   (`contracts-studio.js:1042-1043`). The nightly sweep sets `status='expired'`
   (`contracts-studio.js:1130`) and the GET returns 410 for expiry — but the POST does not check
   `expires_at` or `expired`/`declined` status at all. A client who kept the tab open, or who
   re-declines and re-signs, can execute an expired document.
6. **Soft-deleted contracts and bookings stay live at their public links.** `cs_documents` and
   `bookings` both carry `is_deleted` (`soft-delete.js:31-32`), but `loadByToken()`
   (`contracts-studio.js:1006`), the booking-manage lookups (`booking.js:459, 468, 505`) and the
   portal's document query (`server.js:6382`) none of them filter it. "Delete" in the studio's UI does
   not withdraw the client's link.
7. **The print shop bypasses both the publish gate and the gallery password.**
   `GET/POST /api/store/public/:token` resolves `ms_galleries WHERE share_token = ?` with no
   `status='published'` and no `portalAllowed()` check (`print-store.js:97, 107`), unlike
   `loadPublishedGallery()` (`media-studio.js:2668-2670`). A draft or password-protected gallery's
   token opens the shop, and the anonymous `POST` creates a `leads` row, a `ms_print_orders` row, an
   **invoice** and a **payment link** in the studio's ledger with no rate limiting beyond the global
   500-per-15-min-per-IP. That is an unauthenticated write path into the studio's books.
8. **Gallery favourites never hydrate.** The `faved` Set in `app/g/[token]/page.js:21` starts empty on
   every page load and is only ever mutated by clicks; the server returns aggregate `favorites` counts
   but never "which ones are mine". A client who favourites 40 photos, closes the tab and returns sees
   zero hearts and an absent "My favourites" toggle, while their rows still exist in
   `ms_client_favorites`.
9. **Favourites identity is a free-text box.** `contact_identifier` defaults to `'guest'`
   (`media-studio.js:2745`), and the uniqueness key is
   `(gallery_id, asset_id, contact_identifier)`. Every visitor who leaves the name blank shares one
   favourites set and can toggle off each other's picks. Typing another guest's name impersonates them.
10. **`/booking/manage/[token]` leaks into search and previews as WappFlow marketing.** No
    `layout.js` ⇒ no `generateMetadata`, no `robots: noindex`, and the root layout's OpenGraph card
    (`app/layout.js:13-19`) applies. Cancel/reschedule also have no confirmation of identity beyond
    the 24-hex token.
11. **The public AI endpoint is unmetered and ungated.** `POST /api/cs/public/:token/ask` calls
    `ai.callLLM(prompt, { temperature, maxTokens })` with **no `ctx`**
    (`contracts-studio.js:1109`), and `ai-engine.js:194` spreads `ctx` into the meter call — so spend
    is recorded with `workspace_id: null`, invisible to the Command Center's AI ledger and to plan
    enforcement. There is no per-token or per-document quota; the only limit is the global rate limiter.
12. **`ms_gallery_access` grows unbounded.** Every non-preview page load inserts a fresh row
    (`media-studio.js:2686-2689`) with no dedupe and no retention. Its `lead_id`/`email` columns are
    never populated, so the table is write-only noise today.
13. **Gallery expiry is declared and never implemented.** `ms_galleries.expires_at` exists with a
    comment reserving it for a named roadmap feature (`media-studio.js:1301`); it is never written,
    never read, and `loadPublishedGallery()` ignores it. A delivered gallery link is permanent.
    **SOLD-NOT-BUILT** relative to the roadmap.
14. **Architectural smell — public pages ride the whole app.** Root `layout.js` registers a service
    worker and mounts `ConfirmProvider / SoundProvider / PlanProvider / RealtimeProvider /
    UsageWarnings / ImpersonationBanner` on *every* route, public ones included. The SSE connection is
    correctly guarded on a stored token (`components/shell/realtime.js:61`), but a bride opening her
    gallery still gets a WappFlow-branded PWA service worker installed on her phone.
15. **Booking-time formatting is correct only by cancellation.** Slot times render via
    `new Date(iso.replace(' ','T')).toLocaleTimeString()` (`app/book/[slug]/page.js:14`,
    `app/booking/manage/[token]/page.js:14`) — parsed as *visitor-local* and formatted as
    *visitor-local*, so the studio's wall-clock digits survive by accident, while the confirmation
    line uses the deliberate `formatAppointment()` helper (`lib/datetime.js:120-138`), which formats
    as UTC on purpose. Two opposite strategies on one page. This is the exact area under active
    uncommitted edit, so it may be mid-repair.
16. **`X-WF-Preview` is a self-asserted header.** Any caller can send it to read a contract without
    marking it viewed, or to browse a gallery without leaving an access trail. That is a low-severity
    integrity issue for the studio's "has the client opened it?" signal, not a confidentiality one.

### Where the existing docs are stale

`PRODUCT-AUDIT.md` §"Client Portal & the public client journey" (lines 276-286 and the findings table)
is **out of date as of commit `e2f2eec`**. Specifically, findings `client-portal-2` (gallery shows no
studio name), `client-portal-3` (links preview as generic WappFlow marketing), `client-portal-5`
(unpaid invoices not clickable), and `client-portal-6` (conversion dead ends) are all now implemented
in code, and its claim that "the studio's real uploaded logo … is displayed on NONE of them" and that
there is "no `generateMetadata` on any public route" is contradicted by
`components/PublicBrandMark.js` and the six `layout.js` files. Its statement that the hub "never
surfaces booking, pay links, or the shop" is contradicted by `server.js:6371, 6392-6408`. What *does*
still hold from that audit: `client-portal-7` (no shared cross-surface navigation — the links are
one-directional CTAs, not a shell), `client-portal-9` (grid actions are hover-only; the lightbox is
the acknowledged touch fallback, `g/page.js:312-313`), and `client-portal-10` (only `/d` distinguishes
"expired" from "not available"). Believe the code.
