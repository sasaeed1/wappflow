## Product overview, personas and the business model

> **Line-citation snapshot note (added 2026-08-24).** This section's `backend/server.js` citations were
> written against an earlier snapshot than the one §14/§15 were pinned to. Measured against the current
> file (**6,595 lines**), they run low by roughly **+20 lines below ~line 2,000 and up to +50 lines above it**
> — beyond the dossier-wide ±25 tolerance stated in §01. The endpoints named below have been re-pinned to the
> current file; for any other `server.js:NNNN` reference in this section, grep for the quoted code rather than
> trusting the number.

### What this part of the product is for

WappFlow is a multi-tenant SaaS whose stated purpose is to be the single operating system a small
photography/videography studio runs its whole business on: capturing a lead from WhatsApp, talking to that
lead, sending them a contract, booking the shoot, ingesting and sorting the photos, delivering them in a
client-facing gallery, and getting paid — all against one customer record. The repo's own canonical statement
is `PRODUCT-BIBLE.md`: *"WappFlow is the Creative Business Operating System… one place where a photo/video
studio runs its entire business"*, with the explicit non-goal of competing on feature count and a north-star
test of *"Does this make WappFlow feel more like one operating system?"*.

The business model layer — plans, limits, entitlements, metering — is the machinery that decides which parts
of that OS a given workspace may use and how much of it they may consume. This section documents that
machinery as it actually exists in code, and it is blunt about a large gap: **the plan catalog is elaborate
and almost entirely unenforced, and there is no way for a customer to pay WappFlow any money.**

---

### Who it is for

**Primary persona (from code, not from a persona doc).** There is no persona document in the repo, so the
target user has to be inferred from hard-coded defaults and copy. The evidence is consistent and points at a
**Pakistani / South-Asian photography or video studio**:

| Signal | Evidence |
|---|---|
| Subscription currency is Pakistani Rupees | `backend/entitlements.js:123` — `const PLAN_CURRENCY = 'PKR'` |
| Phone matching is written around Pakistani numbers | `backend/server.js:1099-1110` normalises `+92` vs leading `0`; the duplicate-check comments use `"+92 310 154 7564"` (`server.js:1813`, `server.js:2093`) |
| AI prompt examples are priced in PKR | `backend/server.js:4336`, `backend/server.js:4374` — example knowledge values are `"45,000 PKR"`, `"45,000 PKR for 3 months"` |
| Marketing testimonial anchors to Karachi | `wappflow-web/src/app/page.js:1739` — *"Owner, Karachi real estate agency"* |
| WhatsApp is the assumed primary channel, not email | whole architecture; see below |

**Secondary/aspirational persona.** The landing page is fighting itself. The hero (`page.js:180-196`) sells a
generic B2B sales tool — *"Close every lead that touches your WhatsApp"*, *"The AI-powered CRM built for the
way modern teams actually sell"* — and the trust bar says *"Built for sales teams that actually live in
WhatsApp"* (`page.js:374`). The pricing section 1,500 lines later sells something else entirely: *"Built for
photographers, videographers, studios & agencies"* (`page.js:1861`), with plan tiers literally named Creator /
Studio / Studio+. The testimonials mix a real-estate agency, a SaaS company, an e-commerce brand and a B2B
services founder (`page.js:1736-1753`) — none of them studios. **This is a real positioning conflict a planner
must resolve**: the pricing, the module names, the entitlement keys (`media_studio`, `contracts_studio`,
`print_store`) and the PRODUCT-BIBLE all say "creative studio OS"; the top half of the landing page says
"WhatsApp CRM for sales teams".

### Jobs to be done

Derived from the `signature workflow` in `PRODUCT-BIBLE.md` and confirmed by the module wiring in
`backend/server.js:6237-6430`, the jobs are:

1. **Never lose a WhatsApp lead.** Inbound WhatsApp messages auto-create leads
   (`backend/whatsapp-service.js:348`, `:955`), so the conversation *is* the CRM record.
2. **Get the client signed without paper.** Contracts Studio: template → draft → send over WhatsApp + email →
   e-sign → vault (`backend/contracts-studio.js`, 41 routes under `/api/cs/*`).
3. **Put the shoot on the calendar without a phone call.** A public booking page creates the lead and the
   booking (`backend/booking.js`, `/api/booking/public/:slug`).
4. **Cull and deliver thousands of photos.** Media Studio, 115 routes under `/api/media/*`.
5. **Get paid.** Invoices (in `server.js`), a payments ledger with Stripe checkout
   (`backend/payments.js:110-130`), and a print store (`backend/print-store.js`).
6. **Give the client one link for everything.** Client Portal (`server.js:6272-6324`).

**Domain vocabulary for a reader who has never seen this product:**

- **Lead** — a person who contacted the studio. Auto-created from an inbound WhatsApp/Instagram/Facebook
  message, a website form, a booking, or manual entry. Becomes a **client** via an `is_client` flag on the
  same `leads` row (see `command-center.js:365-366`, which counts clients as `leads WHERE is_client = 1`).
- **Project / shoot** — `ms_projects`. The unit of photographic work attached to a lead.
- **Cull** — the photographer's triage pass over the raw take: keep / reject / maybe, a 0–5 star rating, a
  colour label, a flag. Stored one row per asset in `ms_cull_decisions` (`media-studio.js:122-133`). Note
  `user_id TEXT NOT NULL, -- a real human always owns the decision`, which is the code-level expression of the
  Bible's "control-first intelligence" principle: AI scores, humans decide.
- **Gallery** — the *client-facing delivery surface* (`ms_galleries`, `media-studio.js:1284`). Has a
  `share_token`, a `visibility` of `public|private|password|client_portal`, a publish `status`, and settings
  for watermarking and download policy. This is what the client is sent a link to (`/g/:token`).
- **Album** — a *print/layout artefact* (`ms_albums`, `media-studio.js:1380`): a page-by-page design with
  physical dimensions (`spec` = `{ w_mm, h_mm, margin_mm }`) that renders to a PDF. A gallery is for viewing
  and choosing; an album is for printing.
- **Portfolio** — the studio's own public marketing site (`ms_portfolios` / `ms_portfolio_items`, route
  `/folio`), unrelated to any one client.

---

### Why WhatsApp-first matters for this market

In Pakistan and much of South Asia, small-business commerce runs on WhatsApp, not email. A studio's enquiries
arrive as DMs and voice notes at unpredictable hours — the landing page states the thesis directly:
*"Traditional CRMs were built for email and forms. But customers DM you. They voice-note you. They go quiet
for three days and then ask for pricing at 11pm"* (`page.js:420-422`). Three architectural consequences follow
in the code:

1. **No Meta Business API dependency.** WappFlow drives WhatsApp Web through `whatsapp-web.js` with a
   Puppeteer-controlled browser session (`backend/whatsapp-service.js:1`, `LocalAuth`, QR pairing). The FAQ
   sells this as the feature: *"No. WappFlow connects directly to WhatsApp Web via a QR code — no API
   approval, no Meta paperwork"* (`page.js:2072`). For a studio with no company registration and no Meta
   Business verification, this is the difference between usable and not.
   **Risk, stated plainly:** this is unofficial automation of a consumer WhatsApp session. It is a ban/ToS
   exposure, it needs a headless Chrome per connected number (`browserPid` is tracked at
   `whatsapp-service.js:37`), and it is why `whatsapp_accounts` is a metered, priced resource.
2. **Multi-number is a first-class plan dimension.** `whatsapp_accounts` is one of only five metered limits
   (1 / 2 / 5 / unlimited across the tiers) because each connected number costs real server resources.
3. **Delivery rides the same channel.** Contracts, galleries, bookings and print orders are all sent to the
   client through the same WhatsApp send path (`server.js:6318-6323`, `bookingSend`; and the `sendClientMessage`
   seam injected into media-studio, booking, print-store and contracts-studio). The client never leaves
   WhatsApp; they just receive links.

---

### The module surface

| Module | Entitlement key | Backend | Route prefix | Client-facing route | Maturity |
|---|---|---|---|---|---|
| CRM (leads, pipeline, inbox, invoices, reports) | `crm` | `server.js` (184 routes) | `/api/leads`, `/api/invoices`, `/api/reports`, … | — | SHIPPED |
| Media Studio (projects, cull, galleries, albums, portfolio) | `media_studio` | `media-studio.js` (115 routes) | `/api/media/*` | `/g/:token`, `/folio` | SHIPPED |
| Contracts Studio | `contracts_studio` | `contracts-studio.js` (41 routes) | `/api/cs/*` | `/d/:token` | SHIPPED |
| Booking | `booking` | `booking.js` (10 routes) | `/api/booking/*` | `/book/:slug` | SHIPPED |
| Invoices / Payments / Store | `print_store`, `payments` | `server.js` + `payments.js` (6) + `print-store.js` (8) | `/api/payments/*`, `/api/store/*` | `/pay/:token`, `/shop/:token` | PARTIAL — Stripe checkout only, no local (PKR) rail |
| Client Portal | `client_portal` | `server.js:6262-6324` | `/api/client-portal/*` | `/client/:token` | SHIPPED |
| Communications (chat, threads, presence, huddles) | *(none)* | `comms.js` (24 routes) | `/api/comms/*` | — | PARTIAL — huddles require LiveKit env; unconfigured ⇒ dead |
| Command Center (internal control plane) | *(separate identity)* | `command-center.js` (37) + `cc-*.js` | `/api/cc/*` | `/control/*` | SHIPPED (internal) |
| Studio AI / Video AI / Reel / Brains / Style | *(none)* | `studio-ai.js`, `video-ai.js`, `reel-engine.js`, `brains.js` | `/api/studio-ai/*`, `/api/video-ai/*`, `/api/media/*` | — | PARTIAL |
| Flux (sibling Instagram content engine) | `flux` | separate repo | — | external URL | PARKED — `wappflow-web/src/lib/flux.js` forces `FLUX_PARKED = true` |

**Stale-doc note.** `DESKTOP-FINAL-VISION.md` records Command Center as unmounted dead code. That is no longer
true: it is mounted at `server.js:6426` and has a complete Next.js surface at `wappflow-web/src/app/control/`
(overview, customers, plans, flags, audit, storage, support, adoption, timemachine, desktop). **Believe the
code.** Likewise the FAQ claims huddles run on Jitsi (`page.js:2104`); the code migrated to self-hosted
LiveKit (`comms.js:423`, `components/HuddleModal.js:8-9`) — the FAQ is stale.

**Frontend module surface is narrower than the backend.** The app switcher knows only three modules — CRM,
Media Studio, Contracts Studio (`wappflow-web/src/components/shell/modules.js:20-92`, `MODULE_ORDER`).
Booking, Invoices and Communications are *nav items inside CRM*; Client Portal, Print Store, Portfolio,
Gallery and Pay are unauthenticated client-facing pages; Command Center is a separate `/control` app with its
own identity tier (`cc_admins`, `command-center.js:65`, seeded from `CC_FOUNDER_EMAIL` /
`CC_FOUNDER_PASSWORD`, optionally IP-restricted by `CC_IP_ALLOWLIST`).

---

### The plan catalog

Four tiers, defined as data in `backend/entitlements.js:94-117` and seeded into SQLite tables on boot
(`seed()`, `entitlements.js:202`).

| Plan key | Display name | List price | Founding-100 price | users | leads/mo | WhatsApp accts | storage_gb | contract_sends/mo |
|---|---|---|---|---|---|---|---|---|
| `creator` | Creator | PKR 7,999 | PKR 3,999 | 1 | 200 | 1 | 50 | 25 |
| `studio` | Studio | PKR 14,999 | PKR 7,499 | 5 | 500 | 2 | 250 | 100 |
| `studio_plus` | Studio+ | PKR 29,999 | PKR 14,999 | 15 | 5,000 | 5 | 1,024 | 500 |
| `enterprise` | Enterprise | Custom (`null`) | — | −1 | −1 | −1 | −1 | −1 |

`-1` means unlimited (`entitlements.js:114`). Prices: `PLAN_MONTHLY_PRICE` (`:119`), `PLAN_FOUNDING_PRICE`
(`:122`), currency `'PKR'` (`:123`), entry plan `DEFAULT_PLAN = 'creator'` (`:124`).

**Feature sets use inheritance:** `CREATOR_FEATURES` (`:29`) → `+ STUDIO_ADD` (`:65`) → `+ STUDIO_PLUS_ADD`
(`:81`) → `+ ENTERPRISE_ADD` (`:89`). Roughly 60 boolean keys in total.

**Which modules can each plan see? All of them.** Every module key — `crm`, `contracts_studio`, `booking`,
`media_studio`, `portfolio`, `client_portal`, `print_store` — is `true` in `CREATOR_FEATURES`
(`entitlements.js:31-32`). No tier removes a module. What the tiers gate is *depth*:

- **Creator** gets the modules plus WhatsApp, email, shared inbox, voice notes and `basic_ai`; it explicitly
  loses Instagram/Facebook/website capture, all team/reporting/knowledge features, all AI depth (reply
  suggestions, lead intelligence, next-best-actions, Studio Brain, asset scoring, hero-shot, culling),
  contract depth (clause library, versioning, redline, approvals, bulk send), gallery depth (collections,
  story sections, advanced proofing, portfolio management), automation and calendar integrations.
- **Studio** adds all of the above plus Desktop Beta (`desktop_access`).
- **Studio+** adds `white_label`, `priority_support`, `desktop_sync`, `local_ai`, `style_profiles`,
  `story_engine`, `reel_engine`, `ai_editing`, `flux`.
- **Enterprise** adds `api_access`, `byok`, `sso`, `audit_logs`, `dedicated_support`, `custom_integrations`,
  `custom_branding`.

**Sold-but-unbuilt guard.** `UNBUILT_FEATURES = new Set(['ai_editing'])` (`entitlements.js:135`) is forced off
at the resolver regardless of plan/flag/override and stripped from the advertised catalog by `getAllPlans()`
(`:333`). The comment records that `reel_engine`, `story_engine`, `style_profiles` and `desktop_sync` were
removed from this set as they shipped. This is an honest, well-designed mechanism — and it is the *only* place
in the codebase where "we sold it but haven't built it" is handled deliberately.

### Founding 100

Marketing promise (`page.js:1861`, `:1870`, FAQ `:2126`): the first 100 paying studios lock 50% off
permanently, plus founder access, roadmap input, beta features, early desktop access.

Implementation: table `founding_program (workspace_id PK, slot, plan, joined_at, active)`
(`pricing.js:49-52`); `foundingStatus()` (`pricing.js:166`) reads `pricing_config.founding_slots` (default
`'100'`, `pricing.js:62`) and counts `founding_program WHERE active=1`; `/api/plans` (`server.js:5566`, public,
unauthenticated) surfaces it to the landing page.

**Classification: STUB.** Nothing in the codebase ever writes a row into `founding_program` (verified by grep:
the only references are the `CREATE TABLE` and the `COUNT(*)`). `taken` is therefore permanently 0, so the
banner permanently renders *"100 of 100 spots left"* and `open` is permanently `true`. There is also no
mechanism to *hold* a founding price against a workspace — `plan_prices.is_founding` is a catalog row, not a
per-customer contract, so the "locked permanently" promise has no data model behind it.

---

### How entitlements resolve at runtime

The resolver is `getEntitlements(db, workspaceId)` (`entitlements.js:273`). Precedence, lowest to highest:

1. **Plan tables.** `plan_features` / `plan_limits` for `workspace_plan.plan`; falls back to the embedded
   `PLAN_DEFINITIONS` if unseeded (`:284-295`).
2. **Per-workspace JSON blob.** `workspace_plan.features` / `.limits` are `Object.assign`-ed over the plan
   (`:297-299`).
3. **Feature flags.** `applyFlags()` (`:236`) — precedence within flags: workspace assignment > global
   assignment > `default_state` > deterministic percentage rollout. The rollout bucket is a stable string hash
   of `workspaceId + ':' + flagKey` (`bucket()`, `:147`), so a 25% rollout always hits the same workspaces.
4. **Entitlement overrides.** `applyOverrides()` (`:258`) — time-windowed, non-revoked rows in
   `entitlement_overrides`, `kind ∈ {limit, feature, module}`.
5. **Unbuilt guard.** Forced off (`:306`).

Results are cached 30 s per workspace (`CACHE_TTL_MS`, `:137`); `invalidate(workspaceId)` clears it. Every
resolved value carries a `sources[key]` provenance string (`flag:workspace`, `override:limit`, `unbuilt`, …)
so Command Center can answer "why does this workspace have this?".

**Schema (config-as-data, all created by `ensureSchema`, `entitlements.js:154`):**

| Table | Key columns |
|---|---|
| `plans` | `key` (unique), `name`, `status`, `visibility`, `sort_order`, `is_default` |
| `plan_prices` | `plan_key`, `interval`, `region`, `currency`, `amount`, `is_founding`, `active` |
| `plan_limits` | PK (`plan_key`, `key`), `value` INTEGER (−1 = unlimited) |
| `plan_features` | PK (`plan_key`, `feature_key`), `enabled` (JSON-encoded) |
| `feature_flags` | `key` PK, `default_state`, `rollout_pct`, `status` |
| `flag_assignments` | `flag_key`, `scope` (`workspace`\|`global`), `scope_id`, `state`, `starts_at`, `ends_at` |
| `entitlement_overrides` | `workspace_id`, `kind`, `key`, `value`, `reason`, `admin_id`, `starts_at`, `ends_at`, `revoked_at` |
| `workspace_plan` | `workspace_id` PK, `plan`, `features` (JSON), `limits` (JSON), `trial_ends_at` (`server.js:803`) |
| `workspace_usage` / `workspace_usage_history` | period snapshots (`pricing.js:36-48`) |
| `founding_program` | `workspace_id` PK, `slot`, `plan`, `active` |
| `pricing_config` | `key`/`value`; seeded `founding_slots='100'`, `enforcement='on'` (`pricing.js:61-63`) |

### Usage metering

`backend/pricing.js` computes usage **live from source tables** rather than from counters, so it cannot drift
(`computeUsage`, `pricing.js:97`):

| Metric | Source query | Window |
|---|---|---|
| `leads` | `COUNT(*) FROM leads WHERE workspace_id=? AND created_at >= month_start` | calendar month |
| `users` | `COUNT(*) FROM workspace_members WHERE workspace_id=?` | current |
| `whatsapp_accounts` | `COUNT(*) FROM platform_accounts WHERE platform='whatsapp'` | current |
| `contract_sends` | `COUNT(*) FROM cs_documents WHERE sent_at IS NOT NULL AND sent_at >= month_start` | calendar month |
| `storage_gb` | `SUM(size_bytes)` over `ms_assets` + `ms_exports` | current |

Soft-limit bands (`levelFor`, `pricing.js:110`): `ok` → `warn` at 80% → `critical` at 90% → `reached` at 100%.
Month boundaries are UTC-naive strings matching SQLite `CURRENT_TIMESTAMP` (`monthBounds`, `:25`). A master
kill switch `pricing_config.enforcement` can be flipped to `'off'` (`enforcementOn`, `:89`).

The payload the UI consumes is `GET /api/workspace/plan-info` (`server.js:5555` → `getPlanInfo`, `:5527`),
returning `{ plan, name, features, limits, usage, quota, trial_ends_at, sources, all_plans, founding }`. The
React side is `wappflow-web/src/lib/plan.js` (`PlanProvider` / `usePlan`), which refreshes every 5 minutes and
exposes `hasFeature`, `hasLimit`, `quotaFor`, `atLimit`. `components/UsageWarnings.js` renders a global banner
for the most severe metric ≥80%; `components/PlanLock.js` provides the lock overlays and upgrade CTAs.

### What is actually enforced

**Server-side hard stops (HTTP 402) — five sites total:**

| Metric | Site | Behaviour |
|---|---|---|
| `leads` | `server.js:2095` (`POST /api/leads`) | 402 when the monthly allowance is reached |
| `leads` | `server.js:1796` (`POST /api/leads/bulk-upload`) | caps the import to the remaining allowance |
| `users` | `server.js:3474` (team invite) | 402 on seat limit |
| `whatsapp_accounts` | `server.js:5010` (`POST /api/platform-accounts`) | 402 on number limit |
| `contract_sends` | `contracts-studio.js:949` | 402 on monthly send limit |

**Storage** is enforced separately by `backend/storage-enforce.js`: `gate(db, ws, incomingBytes)` blocks an
upload that would push the workspace over `storage_gb` (used by `media-studio.js:257`), and `warn()` fires one
notification per upward threshold crossing, deduped in `storage_warn_state`.

**Module-level gate:** `MODULE_GATES` middleware (`server.js:6209-6233`) 403s requests under
`/api/media/`, `/api/studio-ai/`, `/api/video-ai/`, `/api/cs/`, `/api/booking/`, `/api/store/`,
`/api/payments/` when the resolved feature is **exactly `false`**, with tokenised client routes exempted by
regex. Since no plan sets any module key to `false`, this only ever fires from a Command Center override.

**Everything else is client-side only.** A repo-wide grep of `wappflow-web/src` finds exactly five feature
keys ever consumed: `analytics`, `reports`, `team_collaboration`, `google_calendar`, `calendly`
(`app/reports/page.js:85`, `app/knowledge/page.js:235`, `app/team/page.js:506`, `app/settings/page.js:1000-1001`,
plus `lockFeature: 'analytics'` on the Analytics nav item in `components/shell/modules.js:46`). The matching
backend endpoints (`GET /api/reports/overview` at `server.js:2900`, `GET /api/knowledge` at `server.js:4518`)
carry only `auth` — no entitlement check.

**Consequence, stated plainly:** of ~60 advertised feature keys, **five** have any gate at all and all five are
cosmetic UI locks bypassable with `curl`. The genuinely enforced difference between Creator (PKR 7,999) and
Enterprise is five integers.

### Grandfathering

`grandfatherExisting()` (`pricing.js:67`) is a one-time boot migration guarded by
`pricing_config.grandfathered='1'`:
1. any `workspace_plan` row on a plan key not in `['creator','studio','studio_plus','enterprise']` → set to
   `studio_plus`;
2. any workspace with users but no plan row → insert `studio_plus`.

New signups after that migration get `creator` — but note `POST /api/auth/register` (`server.js:1231-1262`)
**never inserts a `workspace_plan` row**. The row is created lazily on first read (`server.js:5390`,
`server.js:5525`) using `DEFAULT_PLAN`. The column default is the dead legacy value `'starter'`
(`server.js:805`), which resolves to empty feature/limit sets and falls back to Creator — safe, but by
accident rather than design.

### How money actually flows (and doesn't)

**Two distinct money rails must not be confused:**

- **Studio → its client (BUILT).** `payments.js` maintains a `payments` ledger (`kind` = `invoice` |
  `print_order`), mints public pay links (`/pay/:token`), calls Stripe Checkout over raw REST with
  `STRIPE_SECRET_KEY` (`payments.js:110-130`), verifies a webhook with `STRIPE_WEBHOOK_SECRET`, and settles by
  flipping the invoice/order to `paid` (`settle`, `:132`). Manual mark-as-paid also writes a ledger row so no
  path bypasses it (`markPaidByInvoice`, `:163`).
- **Customer → WappFlow (NOT BUILT).** There is no subscription billing anywhere. The upgrade button in
  Settings → Plan & Billing shows a toast: *"Contact us to switch to {plan}. Self-serve checkout is coming
  soon."* (`wappflow-web/src/app/settings/page.js:1347`). Enterprise routes to
  `mailto:sales@wappflow.app`, as do both Enterprise CTAs on the landing page (`page.js:1894`, `:1926`).
  Command Center admits it in its own payload: `note: 'Implied from plan list price — real MRR requires live
  subscription billing (not built).'` (`command-center.js:309`), rendered as a warning card at
  `app/control/page.js:32`.

**So the operating reality is:** a new workspace lands on Creator, is never asked for payment, has no trial
clock (the `trial_ends_at` column is only ever set by the manual `PUT /api/workspace/plan`), and can use the
product indefinitely for free within Creator's five limits. Revenue today can only be collected out-of-band
and applied by hand.

---

### Bugs, security weaknesses and architectural smells

Read-only observations. Nothing here was changed.

1. **Any authenticated user can grant themselves Enterprise, for free, in one request.**
   `PUT /api/workspace/plan` (`server.js:5403-5411`) is protected by `auth` alone — no role check, no admin
   check — and writes `plan`, plus arbitrary `features` and `limits` JSON into `workspace_plan`. The resolver
   applies that JSON *over* the plan tables at `entitlements.js:297-299`, above flags and below only
   admin overrides. `POST /api/workspace/plan {"plan":"enterprise","limits":{"leads":-1}}` defeats the entire
   pricing system. This is the single most severe finding in this section. It is **not** listed in
   `PRODUCT-AUDIT.md`.
2. **The lead limit is bypassable by the product's own primary channel.** There are seven
   `INSERT INTO leads` sites; only two are gated (`server.js:1817` bulk upload, `server.js:2107` manual
   create). Inbound WhatsApp (`whatsapp-service.js:348`, `:955`) and the Meta webhook handlers
   (`server.js:5110`, `:5172`, `:5222`) create leads with no check. The landing FAQ frames this as a feature
   (*"Inbound customer messages are never dropped, even at the limit"*, `page.js:2108`), but it means the
   headline metered resource cannot be enforced for the channel the product is named after.
3. **`white_label` is sold as Studio+ and shipped to everyone.** The key exists only in `entitlements.js:54`
   and `:82`; `backend/public-brand.js` applies the studio's own name, logo, accent and contact details to
   every public surface unconditionally, with no `hasFeature('white_label')` check anywhere in the repo. A
   Creator-plan studio already gets the Studio+ differentiator.
4. **Two different definitions of "storage used".** `pricing.computeUsage` sums `ms_assets.size_bytes`
   including soft-deleted rows (`pricing.js:105`), while `storage-enforce.usedBytes` sums
   `COALESCE(storage_size, size_bytes)` and excludes `deleted_at IS NOT NULL` (`storage-enforce.js:37-39`).
   The number shown in the Plan tab and the number that actually blocks an upload can disagree.
5. **Dead legacy plan catalog in `server.js`.** `const PLAN_DEFINITIONS` (`server.js:5419-5520`) still defines
   `free` / `starter` / `growth` / `enterprise` with USD-era limits (`carousels_monthly`, `brand_profiles`).
   Grep confirms it is referenced nowhere. It is a trap for the next reader and directly contradicts the live
   catalog. Related: `workspace_plan.plan DEFAULT 'starter'` (`server.js:805`) names a tier that no longer
   exists.
6. **`payments` is a module gate key that no plan defines.** `MODULE_GATES` (`server.js:6215`) gates
   `/api/payments/` on feature `payments`, but that key appears in no plan feature set — so it resolves to
   `undefined`, never `false`, and the gate is inert unless an admin creates an override.
7. **Client Portal hands out signing tokens to anyone with the link.** `GET /api/client-portal/public/:token`
   (`server.js:6272`) is unauthenticated; the 36-hex token is the only credential, and the response includes
   `/d/:token` links for every contract on the lead (`server.js:6320`). Anyone who receives a forwarded portal
   link can open — and sign — the studio's contracts. The code already hardened the *cross-tenant* half of
   this (`:6280-6286`); the capability-leak half remains by design.
8. **Founding 100 has no write path** (see above): permanently 0 taken, permanently "100 of 100 spots left",
   and no per-workspace price lock behind the "locked permanently" promise.
9. **Unverifiable testimonials presented as customer quotes.** `page.js:1736-1753` renders four five-star
   testimonials with invented, unattributable bylines on a product with zero recorded paying customers.
   Whatever the intent, shipping these on a live marketing page is a reputational and (in some jurisdictions)
   regulatory risk.
10. **Landing-page claims that the code contradicts.** *"WappFlow is self-hosted on your own server. Your
    conversations, leads, and files never leave your infrastructure"* (`page.js:2076`) — the deployed product
    is a shared multi-tenant SQLite instance with cross-tenant Command Center admin access. (Files do stay
    on the studio's — rather, the vendor's — single VPS disk: the Cloudflare R2 path in
    `backend/storage/providers/r2.js` is unreachable, because the AWS SDK it requires is not a dependency
    of `backend/package.json`. The claim is false on multi-tenancy, not on object storage.) *"All plans include… audit logs"*
    (`page.js:1932`) — the catalog makes `audit_logs` Enterprise-only (`entitlements.js:90`), while the code
    gates it for nobody. *"Huddles run on Jitsi Meet… no API keys needed"* (`page.js:2104`) — it is LiveKit,
    and it needs three env vars or the huddle modal reports `unconfigured`.
11. **No AI cost ceiling on any plan.** `METRICS` (`pricing.js:18`) has no AI dimension, `byok` is
    Enterprise-only, and `ai_usage` (`command-center.js:84`) records `est_cost` for observability only. A
    PKR 7,999/month Creator workspace can consume unbounded Groq/OpenAI/Anthropic spend on the vendor's keys.
12. **The studio's own invoices default to USD.** `company_settings.currency DEFAULT 'USD'` /
    `currency_symbol DEFAULT '$'` (`server.js:359-361`, `:398-399`), and every invoice, payment and print
    order inherits it (`server.js:2596`, `payments.js:63`). A Pakistani studio billing a Pakistani client gets
    `$` until they find the setting — in a product that prices *itself* in PKR.

### Configuration reference

Backend env vars observed in code: `PORT`, `NODE_ENV`, `JWT_SECRET`, `DATA_DIR`, `WAPPFLOW_DB`, `UPLOADS_DIR`,
`FRONTEND_URL`, `BASE_URL`, `TRUST_PROXY`, `DEMO_PASSWORD`;
AI — `AI_PROVIDER`, `AI_PROVIDERS`, `GROQ_API_KEY`/`GROQ_MODEL`, `OPENAI_API_KEY`/`OPENAI_MODEL`,
`ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`, `OPENROUTER_API_KEY`/`OPENROUTER_MODEL`,
`CEREBRAS_API_KEY`/`CEREBRAS_MODEL`;
money — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`;
comms — `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`;
Google — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`;
storage — `STORAGE_PROVIDER`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE`;
media tooling — `FFMPEG_PATH`, `FFPROBE_PATH`, `EXIFTOOL_PATH`, `DCRAW_PATH`, `MS_FACE_MODELS`, `MS_FONT_*`;
Command Center — `CC_FOUNDER_EMAIL`, `CC_FOUNDER_PASSWORD`, `CC_IP_ALLOWLIST`;
Flux — `FLUX_URL`, `FLUX_SSO_SECRET`.
Frontend: `NEXT_PUBLIC_API_URL` (defaults `http://localhost:3001/api`), `NEXT_PUBLIC_FLUX_URL`,
`NEXT_PUBLIC_FLUX_PARKED` (defaults to parked).

### Unknowns

- **UNKNOWN: how many real paying customers exist.** No production data is in the repo; `founding_program` is
  never written, and there is no billing table. Nothing in the code can answer this.
- **UNKNOWN: whether Founding-100 pricing was ever honoured for anyone**, since there is no per-workspace
  price-lock record — only a catalog-level `plan_prices.is_founding` row.
- **UNKNOWN: whether the PKR prices reflect a validated willingness-to-pay** or are a first guess. No
  research artefact, no experiment, no analytics event exists in the repo.
- **UNKNOWN: the intended resolution of the sales-CRM vs studio-OS positioning conflict.** Both narratives
  are live on the same page; no ADR or RFC in `adr/` or `rfc/` decides between them.
- **UNKNOWN: how upgrades are meant to be applied operationally today** — presumably a founder runs the
  Command Center `PUT /api/cc/plans/:key` or an entitlement override by hand, but no runbook exists.
