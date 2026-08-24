## Addendum 5 — The embeddable website capture widget (`widget.js`) and its spam surface

WappFlow ships a **drop-in JavaScript widget** that a studio pastes onto its own marketing
website. It renders a floating "Contact Us" bubble in the bottom-right corner; a visitor who
fills it in becomes a lead inside the studio's WappFlow CRM. The file is
`wappflow-web/public/widget.js` — 174 lines, plain ES5-style IIFE, no build step, no
dependencies — served by Next.js from the frontend origin at `/widget.js`.

This is the only piece of WappFlow that is *designed to run on somebody else's domain*. Section
03 of this dossier lists the receiving endpoint (`POST /api/website-form/:formToken/submit`) as
one of several capture routes; section 15 never mentions it. That is a material omission,
because the widget's design **requires publishing a workspace-scoped bearer-ish token in public
HTML**, and the endpoint that consumes it has no origin check, no CAPTCHA, no honeypot and no
per-token rate limit.

---

### What a studio actually gets

Settings → Connections → **Website** is one of four "platform" tabs (`wappflow-web/src/app/settings/page.js:1656-1691`).
The Website platform is `type: 'widget'` and offers three integration modes, chosen by a local
`website_type` field stored in the account's `credentials` JSON (`settings/page.js:2172-2181`):

| Mode | What Settings shows | Instructions | Where |
|---|---|---|---|
| `widget` (default) | A copy-paste `<script>` snippet | 5 steps: paste before `</body>`, a floating button appears, customise with `data-color` / `data-title` | `settings/page.js:1663-1669`, snippet built at `:2088`, rendered `:2237-2251` |
| `webhook` | The raw submit URL, to POST JSON at from the studio's own form handler | "No authentication needed — the unique token in the URL authenticates the submission" (`:1676`) | `settings/page.js:1670-1677`, URL at `:2259` |
| `formspree` | The same URL, to paste into Formspree → Integrations → Webhooks | Formspree forwards each submission | `settings/page.js:1678-1685` |

All three modes point at the **same token and the same endpoint**. The generated snippet is:

```html
<script src="{frontendOrigin}/widget.js"
        data-form="{webhook_verify_token}"
        data-api="{NEXT_PUBLIC_BASE_URL}"
        data-title="{account_name}"></script>
```

(`settings/page.js:2086-2088`; `frontendOrigin` is `window.location.origin`, i.e. whatever host
the studio owner happened to open Settings on, and `data-api` is the frontend's build-time
`NEXT_PUBLIC_BASE_URL`, `wappflow-web/src/lib/api.js:4`.)

### The token *is* the Meta webhook verify token

There is no separate "form token" concept in the schema. `POST /api/platform-accounts`
(`backend/server.js:5055-5083`) mints one value per account slot:

```js
const verifyToken = generateId().replace(/-/g, '').slice(0, 24);   // server.js:5072
```

and stores it in `platform_accounts.webhook_verify_token` (table DDL `server.js:631-643`:
`id, workspace_id, platform, account_name, account_handle, credentials, webhook_verify_token,
status, slot_index, created_at`). For Instagram/Facebook that column is the Meta subscription
verify token, which Meta treats as a shared secret. For `platform = 'website'` the *identical*
column is the public form token, and the product tells the studio to publish it in its page
source. `generateId()` is a `Math.random()` UUIDv4 (`server.js:1111-1116`) — already flagged as
§15 Finding 9 for invite tokens; here the weakness is almost beside the point, because the
design gives the token away. There is **no UNIQUE index** on `webhook_verify_token` (only
`idx_platform_accounts_ws` on `workspace_id`, verified against the schema of the shipped
`backend/wappflow.db`), and the lookup is an unindexed scan.

### The widget's client behaviour

| Concern | Behaviour | Line |
|---|---|---|
| Bootstrap | Reads `data-form`, `data-title`, `data-color`, `data-api` off its own `<script>` tag; `data-api` falls back to `script.src` minus `/widget.js` | `widget.js:4-12` |
| Missing token | `console.warn` and return — silent for the visitor | `widget.js:14` |
| UI | Injects a `<style>` block and two elements into `document.body`; 4 fields — name, phone, email, message (textarea) | `widget.js:16-113` |
| Client validation | Requires **at least one** of name/phone/email; email/phone format never checked | `widget.js:135-139` |
| Submit | `fetch(apiBase + '/api/website-form/' + formToken + '/submit')`, `Content-Type: application/json`, body `{name, phone, email, message}` | `widget.js:146-150` |
| Success | Replaces the form body with a "Message sent!" panel | `widget.js:153-159` |
| Failure | Renders `data.error` **verbatim** to the visitor | `widget.js:160-165` |
| Anti-spam | None — no honeypot field, no CAPTCHA, no timing check, no client throttle beyond disabling the button | whole file |

A repo-wide grep for `captcha|hcaptcha|turnstile|honeypot` across `backend/`,
`wappflow-web/src` and `wappflow-web/public` returns **zero hits**.

### The receiving endpoint

`backend/server.js:5254-5290`. Public, no `auth` middleware. It sets
`Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: Content-Type` on the response,
looks the account up by token, normalises a Formspree-compatible field grab-bag, inserts a lead
(+ optional message row), and broadcasts one SSE frame.

| Canonical field | Accepted aliases | Line |
|---|---|---|
| `name` | `name`, `full_name`, `_name`, `your_name`, else the literal `'Website Visitor'` | `5263` |
| `phone` | `phone`, `telephone`, `mobile`, `phone_number` | `5264` |
| `email` | `email`, `_replyto`, `your_email` | `5265` |
| `message` | `message`, `comments`, `comment`, `msg` | `5266` |

Written rows: `leads(id, user_id, workspace_id, customer_name, customer_phone, email,
status='New', first_message, platform_source='website', platform_account_id, created_at,
last_message_at)` (`5271-5275`) and, if a message was supplied,
`messages(id, lead_id, user_id, body, from_me=0, timestamp)` (`5278`). Response body is
`{ ok: true, lead_id }` — the internal lead UUID is handed to an anonymous submitter.

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/website-form/:formToken/submit` | none | `server.js:5254`; ACAO `*`; 404 `{error:'Form not found'}` on unknown token |
| OPTIONS | `/api/website-form/:formToken/submit` | none | `server.js:5292-5297` — **dead code**, see below |

---

### Maturity verdict

| Piece | Status | Why |
|---|---|---|
| `widget.js` asset + Settings snippet generator | **SHIPPED** | The file exists, is self-contained, and the snippet/URL/copy buttons all work (`settings/page.js:2237-2270`) |
| Webhook / Formspree modes | **SHIPPED (as documentation)** | They are just the same URL with different instructions; nothing mode-specific runs server-side — `website_type` is never read by the backend |
| End-to-end website→lead capture | **PARTIAL, and probably BROKEN in production** | Two independent blockers, both confirmed below: the CORS preflight and a foreign-key violation |
| Plan gating for website capture | **SOLD-NOT-BUILT** | The landing page sells it as a paid tier feature (`wappflow-web/src/app/page.js:1801`, comparison row `:1952` — off for Creator, on for Studio+) but no limit key exists and no server check runs |
| Spam / abuse controls | **NOT BUILT** | No origin allowlist, no CAPTCHA, no honeypot, no per-token limiter |
| Lead attribution (which page/campaign) | **NOT BUILT** | Nothing captures referrer, page URL or UTM; `leads.lead_source` is left NULL on this path |

---

### Bugs, security weaknesses and data-integrity risks

**W-1. The published token is a lead-injection credential — HIGH.**
Anyone who views source on a WappFlow customer's website reads `data-form="…"`, and can then
`curl` unlimited leads into that customer's CRM. There is no origin allowlist (ACAO is a flat
`*`, `server.js:5255`), no signature, no nonce, no proof-of-work. The only throttle is the
**global** limiter — `windowMs: 15 min, max: 500` per IP (`server.js:82-92`) — which is
per-IP, shared with every other route, and trivially spread across hosts. This is a cheaper and
more reliable attack than the unauthenticated Meta webhooks that §15 ranks as Finding 2: it
needs no guesswork about `entry.id`, and it deterministically targets a *chosen* tenant rather
than "whichever workspace owns the oldest social account".

**W-2. The "at least one contact field" guard is dead code — MEDIUM (data integrity).**
`server.js:5263` defaults `name` to the literal `'Website Visitor'`, so `name` is always truthy;
the very next check `if (!name && !phone && !email)` at `:5267` can never fire. `POST {}` with an
empty JSON body therefore creates a contactless lead. The widget's own client-side guard
(`widget.js:135`) is the *only* place that rule is enforced, and an attacker does not use the widget.

**W-3. No dedupe on this path.** Unlike manual creation (`findLeadByPhone`, `server.js:1131`,
called at `:2117`), inbound WhatsApp (`whatsapp-service.js` upsert), public booking
(`booking.js:405`) or the print store (`print-store.js:150`), the website path never checks for
an existing lead. Ten submissions from the same phone number produce ten leads.

**W-4. No plan metering.** `pricing.canCreate(db, ws, 'leads')` gates manual creation
(`server.js:2122`) and returns 402 at the monthly cap (Creator 200 / Studio 500 / Studio+ 5000,
`backend/entitlements.js:98-108`). The website path calls nothing, so the monthly lead
allocation — a core billing lever — is bypassable by anyone on the internet, and the usage
counter (`pricing.js:100`, a live `COUNT(*)` over `leads`) is inflatable by a stranger.

**W-5. Website leads are silent.** The handler broadcasts `broadcastToWorkspace(ws,
'lead_created', {lead})` (`server.js:5283`) and nothing else. It never calls `notify()`
(`server.js:1091`), so no bell entry and no push; and it never calls `addContactHistory()`
(`server.js:1223`), so the lead has no timeline entry. *Correction to the brief that prompted
this addendum:* the Instagram and Facebook handlers **do** call `notify()`
(`server.js:5172`, `:5234`) but they also skip `addContactHistory()`. The public booking route
does both (`booking.js:448`), and the print store writes history (`print-store.js:155`). So the
website path is the least instrumented capture route in the product: if the operator's tab is
closed when the SSE frame fires, the lead appears silently in a list with no history row.

**W-6. CONFIRMED BUG — the insert violates a foreign key on any modern workspace.**
The handler writes `account.workspace_id` into `leads.user_id` (`server.js:5273-5275`), but
`leads` declares `FOREIGN KEY (user_id) REFERENCES users(id)` (`server.js:295-308`, present
since the first commit of `server.js`, `d8dfb37`), and `db.pragma('foreign_keys = ON')` has been
set since the Phase 4 concurrency work (`server.js:57`, commit `c2f43f5`). Signup mints a
workspace id and a user id independently (`server.js:1259-1267`), so a workspace id is not a
user id. I reproduced this against a `VACUUM INTO` copy of the shipped `backend/wappflow.db`:
inserting a workspace-created account's row with the exact column list from `:5273` raises
`FOREIGN KEY constraint failed`. The `catch` at `:5289` turns that into
`HTTP 500 {"error":"FOREIGN KEY constraint failed"}`, which `widget.js:161` then renders to the
website visitor verbatim. It only succeeds on **legacy** accounts where `workspace_id` falls
back to the user id (`server.js:226`, `const workspaceId = user?.workspace_id || decoded.userId`)
— which is exactly the shape of the seeded demo data in the dev database (`user_id = workspace_id
= 'u_demo'`, the only rows with `platform_source='website'` that exist). The Instagram and
Facebook handlers have the identical defect (`:5158`, `:5220`); `booking.js` and
`print-store.js` do it correctly by resolving a real owner user id first (`booking.js:79`).

**W-7. CONFIRMED BUG — the CORS preflight is answered by the wrong middleware.**
`Content-Type: application/json` (`widget.js:148`) is not a CORS-safelisted content type, so the
browser sends an `OPTIONS` preflight. The global `cors()` middleware is mounted at
`server.js:106-109` with `origin: process.env.FRONTEND_URL || '*'`, and the `cors` package
answers preflights itself and ends the response (`preflightContinue` defaults to `false`,
`backend/node_modules/cors/lib/index.js:8-13`, `:163-176`). Therefore the hand-written
`app.options` at `server.js:5292-5297` **never executes**, and on any deployment that follows the
documented instruction to set `FRONTEND_URL` in production (`DEPLOYMENT.md:313`, "✅ in prod";
`.env.example:8` sets `https://wappflow.remoteops.co`) the preflight replies with
`Access-Control-Allow-Origin: <the dashboard origin>`. A browser on `https://customer-studio.com`
rejects that and the fetch fails before the POST is ever sent — the visitor sees
`Network error. Please try again.` (`widget.js:167-171`). Notably this blocker only affects
**browsers**; a scripted attacker (`curl`) is unaffected, so the spam surface in W-1 is live even
where the legitimate widget is not.

**W-8. Snippet injection via an unescaped account name — LOW/MEDIUM.**
`settings/page.js:2088` interpolates `account_name` into an HTML attribute with no escaping, and
`widget.js:87` injects the resulting `data-title` into `panel.innerHTML`. `PUT
/api/platform-accounts/:id` (`server.js:5087-5111`) is gated on `auth` **only** — no role check —
so any workspace member, including a low-privilege seat, can set the account name to a string
containing `"` plus markup. The owner copies the snippet and pastes it into the studio's public
website, where it executes on every visitor. `data-color` lands in a `<style>` block
(`widget.js:20`, `:39`, `:52-59`) — CSS injection, lower impact. The same GET route also returns
every account's `webhook_verify_token` to any authenticated member (`server.js:5040-5050`),
including the Meta verify tokens.

**W-9. Unbounded payload stored on a public route.** `express.json({ limit: '50mb' })`
(`server.js:112`) applies here. `message` is stored whole into `leads.first_message` and
`messages.body` with no truncation, where the Instagram/Facebook handlers at least
`.slice(0, 200)` (`server.js:5162`). A single anonymous POST can write tens of megabytes into a
tenant's database; the global limiter allows 500 of them per IP per 15 minutes.

**W-10. Plan gating for this feature does not exist.** `settings/page.js:1699` computes
`plan.limits['website_forms']` — a key that appears in **no** plan definition
(`entitlements.js:94-115` defines `users, leads, whatsapp_accounts, storage_gb, contract_sends,
ig_accounts, facebook_accounts`). `undefined` means `platformLocked()` is false and
`platformAtLimit()` returns false (`:1700-1710`), so every plan can create website forms. The
same line mis-derives Instagram's key as `instagram_accounts` while entitlements define
`ig_accounts`, so the IG lock is equally inert. Server-side, `POST /api/platform-accounts`
gates **only** WhatsApp (`server.js:5063-5070`). The landing page sells "Instagram, Facebook &
Website lead capture" as a Studio-tier upgrade (`page.js:1801`, `:1952`); nothing enforces it.

**W-11. Minor inconsistencies.** `total_messages` is left at its `0` default even when a message
row is written (contrast `:5164` for Instagram, which sets `1`); the message insert here is a
plain `INSERT` while IG/FB use `INSERT OR IGNORE`; deleting the account slot
(`server.js:5113-5124`) hard-deletes the row, so a widget already live on a customer's website
starts 404-ing with no signal to anyone.

### Cross-references and doc drift

* §03 cites this endpoint as `server.js:5204`; in the current tree it is **5254**, and the
  Instagram/Facebook handlers it cites as `5090`/`5155` are at **5139**/**5201**. §15's citations
  (`5139`, `5201`) match the current code, so §03's numbers are the stale ones — roughly 50 lines
  of drift. Believe the code.
* §15 Finding 2 (unauthenticated Meta webhooks) should be read alongside W-1: the website form is
  the same class of defect with a lower attack cost and precise tenant targeting.
* §15 Finding 9 (`Math.random` tokens) covers `server.js:5072` as "Meta webhook verify tokens" —
  the same line is also the website form token.
* `backend/test-phase5-realtime.js:115-121` is the only test that touches this path, and it is a
  **source-text assertion** (it greps `server.js` for three `broadcastToWorkspace(account.workspace_id,
  'lead_created', …)` call sites). No test issues an HTTP request to the endpoint, which is why
  W-6 and W-7 survive a green suite.

### UNKNOWNs

* **UNKNOWN:** whether the production OVH deployment actually sets `FRONTEND_URL`. The repo
  contains only `backend/.env.example`; the live `.env` is not in the tree. If it is unset, W-7
  does not bite and W-6 does; if it is set (as `DEPLOYMENT.md:313` instructs), the widget fails at
  the preflight for every visitor.
* **UNKNOWN:** whether any real website lead has ever been captured on a non-legacy workspace.
  The only `platform_source='website'` rows in the dev database are two seeded demo leads
  (`lead_4`, `lead_8`, both `user_id = workspace_id = 'u_demo'`, created 2026-06). I have no
  access to the production database.
* **UNKNOWN:** whether `widget.js` is actually reachable in production. It lives in Next.js
  `public/`, so it should be served at `{frontendOrigin}/widget.js`, but nothing in the repo
  pins or tests that URL, and the snippet hard-codes whichever origin the owner's browser was on
  when they opened Settings.
