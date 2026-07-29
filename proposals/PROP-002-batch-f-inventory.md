# PROP-002 Batch F — Public Brand Chrome: Exact Inventory

*Generated 2026-07-27 by a 3-lens sweep (3 agents, 124 tool calls) over `main` (e53afb0).
**86 findings**: 31 page/brand, 23 brand-data, 32 accent/light-scope.*

## The decisions this inventory forced

1. **`.wf-public` must live on `documentElement`, not a page wrapper.** `confirm`, `Toast` and `Modal`
   all render through `createPortal(children, document.body)` (`components/ui/overlay.js:26`), so a
   wrapper class contains none of them — nor `<body>`'s background, nor the scrollbar chrome. This is
   not hypothetical: `app/booking/manage/[token]/page.js:31` already calls `confirm()`, so a studio's
   client on a white page gets a 60%-black scrim and a near-black dialog **today**.
2. **Three DERIVED tokens must be redeclared literally**: `--focus-ring`, `--accent-bg`, `--warning-fg`.
   `var()` inside a custom property resolves *where the declaration applies*, so redefining
   `--accent` in a nested scope does **not** update them — they would inherit dark-resolved literals
   silently (a 15%-alpha indigo ring on white = invisible keyboard focus on the studio's client forms).
3. **Fixed-light cannot be blanket.** `app/g` (the client gallery) is deliberately dark
   (`#0b0b0f` + a champagne `#c2a878`), and `app/d` goes dark under the `executive` document theme.
   `.wf-public` is therefore **opt-in per page**; the dark surfaces take the header/footer only.

## Other headline findings

- **The brand leak is worst exactly where it matters most.** `app/d/[token]/page.js:74` renders a
  hardcoded **"W"** mark in a `#0ea5e9→#6366f1` gradient above a legally-binding e-signature page,
  and its name slot falls back to the literal string **"WappFlow"**. The `/g` gallery names the
  photographer nowhere at all — its password gate says "your photographer", and its footer says
  "Delivered with WappFlow Media Studio".
- **The accent collision is structural, not cosmetic.** One studio's surfaces resolve to *five*
  different "brand" colours: sky→indigo (`/d`, `/client`, `/shop`), champagne `#c2a878` (`/g`),
  bronze `--pf-accent: #b07d52` (portfolio — the **only** studio-settable accent that ships today),
  near-black `--cs-accent: #14151a` (contract documents), and near-black `#16161a` for every public
  CTA (42 literals). Batch F's job is to make the seven non-themed surfaces consume **one** fallback,
  so the deferred backend proposal has a single place to feed real data.
- **A live defect self-heals.** The legacy `input:not([data-ui]) {…!important}` rule is repainting
  every public form control **dark right now** (the app theme defaults to `'dark'` for visitors with
  no preference — `app/layout.js:41`). Because that rule is written entirely in tokens, redefining
  them under `.wf-public` fixes all six pages with zero edits to those files.
- **D6 confirmed by the backend.** The only brand field that exists is a display **name**
  (`company_settings.company_name`, returned by `backend/booking.js:130/180`,
  `print-store.js:92`, `server.js:5804`). There is **no logo_url and no accent column anywhere**, and
  `/g`'s endpoint (`backend/media-studio.js:2639`) returns no brand at all. So the primitives ship
  with an unused `logoUrl`/`brandColor` seam — exactly what D6 asked for.

## Lens 1 — Public page brand chrome — 31 findings

Every public page's header/footer, where studio identity leaks as WappFlow, and each page's light/dark palette.

### `src/app/g/[token]/page.js:179` — /g client gallery — header has ZERO studio identity (worst identity vacuum in the sweep)

Header block spans lines 179-206. Markup: `<header style={{padding:'46px 24px 30px', textAlign:'center', borderBottom:'1px solid #1a1a22'}}>` containing (l.180) an eyebrow `<p ...color:'#c2a878'...>Your Gallery</p>`, (l.181) `<h1 className="ghero">{data?.title}</h1>` — the GALLERY title, not the studio — and (l.182) `{assets.length} photos · tap the heart to mark your favourites`. There is no logo, no mark, no studio name, no accent hook. The only identity on the page is a hardcoded champagne-gold `#c2a878` used 15 times (eyebrow, section rules, all CTAs, heart fill). The password gate (l.140-153) is equally anonymous: l.146 reads `Enter the password your photographer shared.` — 'your photographer', never their name. This is the highest-traffic client-facing page in the product and the studio is invisible on it.

> **Migration:** Prime PublicBrandHeader adopter, but note it is a DARK-canvas page (#0b0b0f) with a bespoke gold accent — it must NOT be wrapped in `.wf-public` (see item 3). PublicBrandHeader needs a `tone="dark"`/`inverse` prop or the /g header stays bespoke and only gains the logo+name slot. Backend gives it nothing today (item 4), so the graceful-fallback path (no brand → render gallery title alone, i.e. current behaviour) is the D6-compliant default. Do not touch #c2a878 — it is this page's deliberate identity and the closest thing to a per-studio accent that ships today.

### `src/app/g/[token]/page.js:269` — /g footer — hardcoded 'Delivered with WappFlow Media Studio' is the studio's sign-off

Exact line: `<footer style={{ textAlign: 'center', padding: '30px 20px 50px', color: '#52525b', fontSize: 12 }}>Delivered with WappFlow Media Studio</footer>`. The single footer on the page. THE DEFECT: the client opens their wedding gallery, scrolls to the bottom, and the only brand named on the entire page is WappFlow — the photographer they paid is named nowhere. Contrast /client:101 and /book:101 which at least say `Powered by {data.brand}`.

> **Migration:** Replace with PublicFooter. Copy should be `{brand}` primary with an optional, de-emphasised 'Delivered with WappFlow' secondary line that a future white-label entitlement can suppress. Colour #52525b on #0b0b0f is a dark-canvas value — PublicFooter must accept the dark tone.

### `src/app/g/[token]/page.js:177` — /g is the ONE public page that is intentionally dark — a `.wf-public` fixed-light scope would destroy it

Root: `<div style={{ minHeight: '100vh', background: '#0b0b0f', color: '#fff' }}>`. Palette census for this file: #fff ×24, #c2a878 ×15, #2a2a33 ×9 (borders), #14120f ×9 (on-accent ink), #15151b ×7 (surfaces), #9aa0aa ×4, #71717a ×3, #0b0b0f ×3, #13131a (sticky proofing bar l.210), #1a1a22 (header rule l.179), #52525b (footer). The Centered shell (l.331-333) and CommentModal (l.320-328) are dark too. Zero overlap with the light-page palette used by the other six pages.

> **Migration:** HARD CONSTRAINT on the `.wf-public` design: it cannot be applied blanket to every public route. Either (a) `.wf-public` is opt-in per page and /g simply does not opt in, or (b) `.wf-public` ships with a `.wf-public.is-dark` variant that re-points --bg/--surface/--text/--border to this page's existing hexes. Option (a) is the smaller change and is recommended; /g then keeps its literal styling untouched in Batch F and only its header/footer slots change.

### `backend/media-studio.js:2639` — /g public API returns NO brand fields at all — the frontend has nothing to render

`app.get('/api/media/portal/:token')` (l.2600-2646) responds (l.2638-2644) with exactly: `{ title, version, download_policy, watermark, proofing, store_enabled, sections, assets }`. No company_name, no company_logo, no studio name, no accent. The handler already loads `g.workspace_id` and even does a workspace-scoped query at l.2625 for `store_enabled`, so the owner lookup is one join away — but it is not done. Frontend consumer: `load()` at wappflow-web/src/app/g/[token]/page.js:44-59, `setData(json)` l.52.

> **Migration:** D6 DEFERRAL boundary — do NOT add the join in Batch F. Record it as the follow-up proposal's first item. PublicBrandHeader on /g must render correctly when `brand` is `undefined` (fall back to the gallery title alone = today's pixels).

### `src/app/d/[token]/page.js:72` — /d contract portal — the `Brand()` component is a literal WappFlow 'W' mark with 'WappFlow' as the text fallback

Component `Brand` spans lines 72-78, rendered at l.90. Exact markup: a sticky bar `background:'rgba(255,255,255,0.7)', backdropFilter:'blur(14px)', borderBottom:'1px solid rgba(0,0,0,0.06)'`; l.74 the mark — `<div style={{width:26,height:26,borderRadius:7,background:'linear-gradient(135deg,#0ea5e9,#6366f1)',...,color:'#fff',fontWeight:900,fontSize:13}}>W</div>` with the character **W hardcoded, not derived from any brand string**; l.75 `<strong style={{fontSize:14,color:'#16161a'}}>{data?.title || 'WappFlow'}</strong>` — the bold text is the DOCUMENT title, and when absent it literally prints 'WappFlow'; l.76 a right-aligned `{data?.type}` (proposal/contract) in #8a8a93. THE DEFECT, twice over: the mark is unconditionally WappFlow's, and the name slot is occupied by the document title so the studio has no slot at all. A client signing a PKR-priced wedding contract sees a WappFlow-branded chrome above it.

> **Migration:** Strongest structural prior art for PublicBrandHeader's SHAPE (sticky, translucent, mark + name + right meta) — generalise the layout, discard the content. Needed props: `logoUrl`, `name`, `initial` (derived from name, not 'W'), `meta` (right slot), `sticky`. Fallback when no brand: render the document title in the name slot as today, and suppress the mark entirely rather than showing a 'W'.

### `src/app/d/[token]/page.js:132` — /d has NO footer — nothing signs the document page

The page's return (l.88-133) ends: sticky action bar (l.114-124), SignSheet (l.126-129), AskWidget (l.131), `</div>` at l.132. There is no footer element anywhere in the file. The legally-binding e-signature surface — the single most trust-sensitive public page in the product — carries no 'Powered by / Delivered by' attribution of any kind.

> **Migration:** New PublicFooter adopter. Must not collide with the fixed bottom action bar (l.115, `position:'fixed',bottom:0`) or the AskWidget FAB (l.151, `bottom: stickyOffset ? 86 : 20`) — the footer needs the same `paddingBottom` compensation the content wrapper already applies at l.91 (`paddingBottom: hasPricing && !done ? 120 : 60`).

### `src/app/d/[token]/page.js:10` — /d is conditionally DARK — `outerBg('executive')` returns #080b12, second exception to `.wf-public`

`const outerBg = (t) => (t === 'executive' ? '#080b12' : t === 'editorial' ? '#efe9dd' : '#eceef2');` applied at l.89 `background: outerBg(data.theme)`. The inner document uses the `.cs-doc` / `.cs-theme-*` scope from app/contracts/contracts.css:9-31, whose `executive` theme is `--cs-bg:#0f1420; --cs-ink:#eef1f7` — i.e. a fully dark document canvas. Meanwhile the Brand bar (l.73) is hardcoded `rgba(255,255,255,0.7)` white and the sticky action bar (l.115) `rgba(255,255,255,0.92)` white, so the executive theme ALREADY renders white chrome sandwiching a dark document — a pre-existing inconsistency Batch F will make more visible.

> **Migration:** `.wf-public` must be applied to the /d shell only where it does not fight `.cs-doc`, which is already a self-contained fixed-palette scope with its own --cs-* ladder (a good model for how `.wf-public` should be written: prefix-namespaced, set on a wrapper, not on :root). Recommend `.wf-public` sit on the page shell and explicitly NOT re-declare anything `.cs-doc` owns. Flag the white-chrome-on-executive mismatch to the owner as an out-of-scope observation.

### `backend/contracts-studio.js:941` — /d public API returns NO brand fields — hence the 'WappFlow' text fallback

`app.get('/api/cs/public/:token')` responds at l.941: `res.json({ title, type, theme, blocks, settings, totals, status, signers, letterhead })`. `letterhead` (l.940, from `wsSettings.letterhead_url`) is the closest thing to a studio logo that reaches this page — but it is rendered INSIDE the document body by `<DocFrame letterhead={data.letterhead} .../>` (page.js:94), not in the chrome. So a studio that uploaded a letterhead has its logo on the paper while WappFlow's 'W' sits in the browser chrome above it. Consumer: `fetchPublicDoc` at wappflow-web/src/lib/api.js:495-499.

> **Migration:** Notable: /d is the only route with an existing per-workspace image asset on the wire. The follow-up backend proposal should decide whether `letterhead_url` doubles as the header logo or whether company_logo is served separately. Batch F: PublicBrandHeader takes `logoUrl` and /d passes nothing (graceful fallback), leaving letterhead where it is.

### `src/app/shop/[token]/page.js:51` — /shop print store — header uses the studio's REAL name but a WappFlow-gradient initial mark

Header spans l.51-55. l.52 the mark: `<div style={{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#0ea5e9,#6366f1)',...,fontWeight:900,fontSize:20,marginBottom:14}}>{(data.brand || 'W')[0].toUpperCase()}</div>`; l.53 `<h1 style={{fontSize:'clamp(24px,5vw,30px)',fontWeight:800,color:'#16161a',...}}>{data.brand} Print Shop</h1>`; l.54 `{data.gallery_title && <p ...>From “{data.gallery_title}”</p>}`. Also l.18 sets `document.title = \`Shop · ${d.brand}\``. THE DEFECT is narrower here but real: the letter is the studio's, the GRADIENT BEHIND IT is WappFlow's brand gradient, and when `data.brand` is falsy the initial collapses to a literal 'W' (item 27) which reads as the WappFlow mark.

> **Migration:** Cleanest 'name is right, chrome is wrong' adopter. PublicBrandHeader should render the initial on a neutral/derived surface (or the studio accent once the backend ships it), never on the fixed sky→indigo gradient. `data.brand` is present on this route, so this page exercises the happy path of the new primitive.

### `src/app/shop/[token]/page.js:114` — /shop has NO footer — and no attribution on the order-confirmation screen either

Page return l.48-115: shell div, header, product list (l.57-76), fixed cart/checkout bar (l.79-113), close. No footer element. The success state (l.40-46, `if (done) return ...`) is a bare centred card: `✓` badge, `Order placed!` (l.43), `Total {sym}{done.total} ... We’ll be in touch to finalize it.` (l.44) — no brand named at the moment of purchase. Same for the failure state at l.39 (`Shop unavailable`).

> **Migration:** PublicFooter adopter (3 insertion points: main page, `done` screen, `missing` screen). The done/missing screens use the shared `center` const (l.118) and would benefit from `.wf-public` + a Core EmptyState/ErrorState in a later pass — out of Batch F scope, note only.

### `backend/print-store.js:40` — /shop backend — brand falls back to the literal string 'WappFlow' when company_name is unset

`const brandSym = (ws) => { const o = owner(ws); let name = 'WappFlow', sym = '$'; if (o) { try { const cs = db.prepare('SELECT company_name, currency_symbol FROM company_settings WHERE user_id = ?').get(o); if (cs) { name = cs.company_name || name; sym = cs.currency_symbol || sym; } } catch {} } return { name, sym }; };` Emitted at l.92: `res.json({ brand: name, currency_symbol: sym, gallery_title: g.title, products })`. A studio that never filled in Settings → Company gets a shop titled 'WappFlow Print Shop' (page.js:53). Only company_name is selected — company_logo is deliberately not, even though it is on the same row.

> **Migration:** D6: backend deferred. But record the exact fix for the follow-up: widen this SELECT to `company_name, company_logo, currency_symbol` and change the fallback from 'WappFlow' to `null` so the frontend can decide. Batch F frontend must therefore treat the STRING 'WappFlow' as a possible value and still render sanely (it will — it just renders WappFlow's name, which is the defect the backend proposal closes).

### `src/app/pay/[token]/page.js:20` — /pay — the ONLY public page with neither a header nor a footer; total brand vacuum on the money surface

The entire authenticated-looking payment page is a single centred card, l.21-44: `<div style={c}><div style={{width:'100%',maxWidth:420,background:'#fff',borderRadius:18,padding:28,boxShadow:'0 30px 80px rgba(0,0,0,0.12)',textAlign:'center'}}>`. Paid branch l.24-28 (`✓`, `Payment received`, `Thank you — {p.currency_symbol}{amount} paid.`). Unpaid branch l.30-41: `Amount due` eyebrow (l.31), the amount (l.32), `{p.description || 'Payment'}` (l.33), the `Pay securely →` anchor (l.36), and — when no provider is wired — l.38 `Online payment isn’t enabled yet. Please complete payment with the studio directly — they’ll mark this as paid.` referring to 'the studio' generically. l.40 is the only trust signal: `🔒 Secure payment`. There is NO logo, NO name, NO footer anywhere in the 48-line file. A client is asked to hand over money on an unbranded page.

> **Migration:** Highest-value Batch F adopter by trust impact, lowest by effort (48 lines). Needs BOTH PublicBrandHeader (above the card) and PublicFooter (below). Because the backend sends no brand (item 13), the fallback rendering must still be an improvement — recommend the header degrade to the '🔒 Secure payment' trust line rather than to a WappFlow mark. Do not introduce a 'W' mark here where none exists today; that would be a regression.

### `backend/payments.js:222` — /pay public API selects only money columns — no workspace/brand join exists

`app.get('/api/payments/public/:token')`, l.220-226. l.222: `const p = db.prepare('SELECT amount, currency, currency_symbol, description, status, provider, checkout_url FROM payments WHERE public_token = ?').get(req.params.token);` — the row is fetched by token alone; unlike every other public route this handler never resolves the workspace, so there is not even a `workspace_id` in scope from which to derive the owner. Consumer: `fetchPayment` at wappflow-web/src/lib/api.js:559-562.

> **Migration:** The most invasive of the deferred backend items (needs `workspace_id` added to the SELECT plus the owner→company_settings lookup). Confirms the D6 sequencing was right. Batch F ships the /pay chrome with `brand={undefined}` and a comment pointing at this line.

### `src/app/client/[token]/page.js:56` — /client portal — BEST PRIOR ART among the token pages: mark + studio-name eyebrow + personalised greeting

Header spans l.56-61 and is the most complete brand block in the sweep. l.57 the mark `<div style={{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#0ea5e9,#6366f1)',...,fontSize:20,marginBottom:16}}>{(data.brand || 'W')[0].toUpperCase()}</div>`; l.58 — and this is the part worth generalising — a dedicated studio-name eyebrow: `<div style={{fontSize:12.5,letterSpacing:'0.14em',textTransform:'uppercase',color:'#8a8a93'}}>{data.brand}</div>`; l.59 `<h1 style={{fontSize:'clamp(26px,5vw,34px)',fontWeight:800,color:'#16161a',...}}>Welcome, {data.client_name}</h1>`; l.60 sub-line `Everything for your project, in one place.` l.29 also sets `document.title = \`${d.brand} · Your portal\``. This is the only page that gives the studio its own typographic slot separate from the page subject.

> **Migration:** GENERALISE FROM THIS ONE. PublicBrandHeader's canonical shape = { logo|initial mark, uppercase tracked brand eyebrow, page-subject h1, optional sub }. Props: `logoUrl`, `brand`, `title`, `subtitle`, `align='center'`. The only defect to fix is the gradient behind the initial and the 'W' fallback. /d's sticky bar is the same primitive in a `variant="bar"` layout.

### `src/app/client/[token]/page.js:101` — /client footer — 'Powered by {data.brand}': correct COPY, but data.brand defaults to 'WappFlow'

Exact line: `<p style={{ textAlign: 'center', fontSize: 12, color: '#a8aeb8', marginTop: 40 }}>Powered by {data.brand}</p>`. Semantically this is what all six light pages should say — the studio powers the portal. But because backend/server.js:5804 defaults `brand` to `'WappFlow'`, an un-configured workspace renders 'Powered by WappFlow' to its own client. Identical pattern at book/[slug]/page.js:101 and booking/manage/[token]/page.js:79 — three pages, byte-identical markup, three copies.

> **Migration:** Rule of Three satisfied — this exact `<p>` is duplicated verbatim across 3 files (client:101, book:101, booking/manage:79) and is the direct justification for PublicFooter. Extract it as-is (same #a8aeb8, 12px, centred), parameterise `brand` + `marginTop`, and add the fallback branch so a null/'WappFlow' brand suppresses the line rather than advertising the vendor.

### `src/app/client/[token]/page.js:17` — ACCENT COLLISION, concrete instance — #0ea5e9 and #6366f1 do triple duty on one page (brand mark, status semantics, link colour)

On this single file the two hexes that form the WappFlow brand gradient are also load-bearing status and interaction colours: l.17 `DOC_STATUS = { ... sent: ['#6366f1','Awaiting you'], viewed: ['#0ea5e9','Opened'], ... }`; l.21 `INV_STATUS = { ... sent: ['#6366f1','Due'], ... }`; l.57 the brand mark gradient `#0ea5e9→#6366f1`; l.76 the gallery 'Open →' affordance `color:'#6366f1'`. The `Pill` renderer at l.41 tints backgrounds as `${c}1f`. So the pill that means 'Awaiting your signature' is painted in the same indigo as the brand mark and the same indigo as `--accent` in globals.css:15. THE MOMENT a studio accent is introduced, 'brand', 'awaiting you', and 'open this link' become indistinguishable — that is the collision Batch F is asked to kill.

> **Migration:** Killing the collision means: (1) the brand mark stops using #0ea5e9/#6366f1 entirely (a neutral or brand-derived surface); (2) status keys move to the Batch B registry pattern (lib/leadStatus.js / lib/invoiceStatus.js already exist — DOC_STATUS/INV_STATUS here are two more stable-key→{label,tone} maps that belong in registries and should render via Badge, not a bespoke `Pill`); (3) the 'Open →' affordance becomes a link/Button token, not a raw hex. Item (2) may be larger than Batch F wants — flag for the owner whether DOC_STATUS/INV_STATUS registry extraction is in or out of scope; (1) and (3) are clearly in.

### `backend/server.js:5804` — /client portal backend — `brand: (cs && cs.company_name) || 'WappFlow'`

Inside the `/api/client-portal/public/:token` handler. The response (l.5802-5810) is `{ client_name, brand, galleries, documents, invoices, albums, orders, milestones, projects }`. `cs` is loaded at l.5796 as `db.prepare('SELECT * FROM company_settings WHERE user_id = ?').get(owner.user_id)` — note `SELECT *`, so **company_logo is already in memory on this route** and is simply not forwarded. This is the single cheapest backend win in the whole set.

> **Migration:** D6-deferred, but worth calling out in the follow-up proposal as the one-line item: the row is already loaded, adding `company_logo: cs && cs.company_logo` to the response object is a 1-token change with no new query. Batch F's PublicBrandHeader should be written with `logoUrl` already in its prop signature so that when the backend lands, no component change is needed.

### `src/app/book/[slug]/page.js:52` — /book public booking — header, same W-gradient mark with the studio's real name

Header spans l.52-56. l.53 mark: `<div style={{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#0ea5e9,#6366f1)',...,fontSize:20,marginBottom:14}}>{(data.brand || 'W')[0].toUpperCase()}</div>`; l.54 `<h1 ...>Book with {data.brand}</h1>`; l.55 `Choose a service and a time that works for you.` l.24 sets `document.title = \`Book · ${d.brand}\``. Same shape as /shop:51-55 (44px mark, clamp h1, muted sub) — a third byte-level near-duplicate of the same header, after /shop and /booking/manage.

> **Migration:** Rule of Three on the HEADER as well: /shop:52, /book:53, /booking/manage:45 and /client:57 all carry the identical `width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#0ea5e9,#6366f1)'` mark div — four copies. Extracting PublicBrandHeader removes all four at once. This page is the also the natural place to prove the primitive works with a live `brand` value.

### `src/app/book/[slug]/page.js:101` — /book footer — second verbatim copy of the 'Powered by {data.brand}' paragraph

`<p style={{ textAlign: 'center', fontSize: 12, color: '#a8aeb8', marginTop: 24 }}>Powered by {data.brand}</p>`. Differs from client:101 only in `marginTop` (24 vs 40). Note the booking-confirmed screen (l.40-47) has NO footer — a client who just booked sees `You’re booked!` / service+time / `A confirmation has been sent. See you then.` with zero brand attribution, same gap as /shop's done screen.

> **Migration:** PublicFooter with a `marginTop` (or spacing-token) prop. Add the missing footer to the `done` branch at l.40-47 — that is the highest-recall moment of the flow.

### `backend/booking.js:56` — /book + /booking/manage backend — `brandName()` returns the literal 'WappFlow' on two separate failure paths

`const brandName = (ws) => { const o = owner(ws); if (!o) return 'WappFlow'; try { const cs = db.prepare('SELECT company_name FROM company_settings WHERE user_id = ?').get(o); return (cs && cs.company_name) || 'WappFlow'; } catch { return 'WappFlow'; } };` — three separate returns of 'WappFlow' (no owner, no company_name, thrown query). Consumed at l.130 `res.json({ brand: brandName(row.workspace_id), services, slots, intake, timezone })` and l.180 `res.json({ brand: brandName(b.workspace_id), booking: {...}, slots })`. Extra wrinkle at l.101: the public booking SLUG itself is derived from this same value — `let slug = (cur && cur.slug) || slugify(req.body.slug || brandName(req.workspaceId))` — so an unconfigured studio's public booking URL becomes /book/wappflow.

> **Migration:** D6-deferred. The slug derivation at l.101 is a nastier variant of the same leak (it bakes 'wappflow' into a persisted, shareable URL) and should be called out separately in the follow-up proposal — it is not fixable by a frontend fallback. Only `company_name` is selected here; company_logo needs adding on both routes.

### `src/app/booking/manage/[token]/page.js:44` — /booking/manage — header is the W-gradient mark with NO studio name rendered at all

Header spans l.44-47. l.45 the mark `<div style={{width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#0ea5e9,#6366f1)',...}}>{(data.brand || 'W')[0].toUpperCase()}</div>`; l.46 `<h1 style={{fontSize:'clamp(22px,5vw,28px)',fontWeight:800,color:'#16161a',margin:0}}>Manage your booking</h1>`. Unlike /book and /shop, `data.brand` — which IS on the wire (backend/booking.js:180) — is never printed in the header; only its first letter survives, on a WappFlow gradient. Also note this page never sets `document.title`, so the browser tab falls back to the layout default 'WappFlow' (app/layout.js:6-7).

> **Migration:** Textbook case: the data is present, the chrome throws it away. Adopting PublicBrandHeader with `brand={data.brand}` is a pure win here. Also add `document.title = \`Manage booking · ${d.brand}\`` in the `load()` at l.23 to match the sibling pages.

### `src/app/booking/manage/[token]/page.js:31` — LIVE DARK-ON-LIGHT DEFECT — /booking/manage calls useConfirm(), whose dialog is 100% app-theme-tokened, on a fixed-light page

l.6 `import { useConfirm } from '@/lib/confirm';`, l.14 `const confirm = useConfirm();`, l.30-35 `cancel()` awaits `confirm({ title:'Cancel this booking?', message:'Your reserved time slot will be released.', tone:'danger', confirmLabel:'Cancel booking', cancelLabel:'Keep booking', requireTyped:'CANCEL' })`. The ConfirmDialog styles itself entirely from app tokens — src/lib/confirm.js:190 `background: var(--surface)`, :191 `border: 1px solid var(--border)`, :194 `color: var(--text)`, :206-208, :215, :227, :238, :246, :253, :260-263, :284-288. app/layout.js:43-44 defaults the document to DARK (`localStorage.getItem('theme') || 'dark'`), so a public visitor with no prior app session gets `--surface:#1a1d27` / `--text:#e2e8f0`: a dark charcoal modal slamming over the page's `linear-gradient(180deg,#f6f7f9,#eceef2)`. This is the only public route that currently mounts an app-tokened overlay, and it is ALREADY shipping the bug `.wf-public` exists to prevent. app/providers.js:19 also mounts `<ToastViewport />` globally (Toast.js consumes --surface/--text/--border/--elev-2), so the same hazard is latent on every public route the moment one fires a toast.

> **Migration:** THE proof-of-need for `.wf-public`, and the Batch F acceptance test. Because ConfirmDialog and ToastViewport render through a PORTAL (lib/confirm.js imports Portal from components/ui/overlay), a `.wf-public` class on the page shell will NOT reach them — the portal target is outside the subtree. `.wf-public` must therefore either (a) be applied to a wrapper that the portal also mounts into, or (b) be paired with a `data-wf-public` flag on <html>/<body> that the overlay primitives honour. Resolve this before writing the CSS; a naive `.wf-public { --surface: #fff; ... }` on the page div will silently fail for exactly the one case that already breaks.

### `src/app/booking/manage/[token]/page.js:79` — /booking/manage footer — third verbatim copy of 'Powered by {data.brand}'

`<p style={{ textAlign: 'center', fontSize: 12, color: '#a8aeb8', marginTop: 24 }}>Powered by {data.brand}</p>` — identical to book/[slug]/page.js:101 including marginTop:24, and to client/[token]/page.js:101 apart from marginTop.

> **Migration:** Third of three. Completes the Rule-of-Three justification for PublicFooter.

### `src/app/folio/[handle]/page.js:35` — /folio route shell — loading and not-found states are unbranded warm-light, then it delegates entirely

The route file is 35 lines and holds no brand chrome of its own. `const shell = { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f3efe7', color:'#1a1714' }` (l.35) — hardcoded to the ATELIER theme's bg/ink even though the portfolio being loaded may be any of ten themes (noir #0a0a0b, film #0c0b0a, luxe #0e221c, vivid #160b2e are all dark), so the loading spinner flashes warm-cream before a black portfolio paints. l.22 loading spinner (`borderTopColor:'#000'`), l.27-28 not-found: `<h1 style={{fontFamily:'Georgia, serif', fontSize:28}}>Portfolio not found</h1>` + `This portfolio may be private or the link may be incorrect.` in #777. l.16 sets `document.title = \`${d.title || 'Portfolio'}\`` — the ONLY public route whose tab title is purely the studio's, with no WappFlow suffix (layout.js template is `%s · WappFlow`, bypassed here because it is set imperatively). l.32 hands off to `<PortfolioCanvas portfolio={data} items={data.items || []} />`.

> **Migration:** /folio should be EXEMPT from `.wf-public` and from PublicBrandHeader/PublicFooter — it is a whole-page studio identity surface with its own token system (item 24), and wrapping it would be a regression. The only Batch F-adjacent nit is the theme-mismatched loading shell, which is out of scope; note it, do not fix it.

### `src/app/folio/portfolio-view.js:34` — PRIOR ART — PortfolioCanvas is the ONLY public surface where the studio's identity is fully realised; it is the model Batch F should aspire to

Header (`.pf-hero`) l.34-44: l.35 a real cover image `{cover ? <img className="pf-hero-bg" src={mediaUrl(cover)} .../> : <div className="pf-hero-bg pf-hero-fallback" />}`; l.38 a real avatar/logo `{pf.avatar_url && <img className="pf-avatar" src={mediaUrl(pf.avatar_url)} alt="" />}`; l.39 `{s.kicker || 'Portfolio'}` eyebrow; l.40 `<h1 className="pf-title">{pf.title || 'Untitled Studio'}</h1>` — the STUDIO's name, with a studio-flavoured fallback, not a vendor's; l.41 tagline. Footer (`.pf-foot`) l.74-85: l.75 `<div className="pf-foot-name">{pf.title || 'Studio'}</div>` at clamp(26px,5vw,56px), l.77-82 real contact affordances (mailto:, tel:, Instagram, website), l.84 the vendor mark. Crucially l.18: `const styleVars = s.accent ? { '--pf-accent': s.accent } : undefined;` — **a per-studio accent, injected as a CSS custom property with a graceful undefined fallback. This is exactly the mechanism Batch F needs and it already exists and ships.**

> **Migration:** COPY THE MECHANISM. `styleVars` at l.18 + `--pf-accent` consumed throughout portfolio.css is the working precedent for how PublicBrandHeader should take a brand accent: set a scoped custom property on the wrapper when present, omit the style object entirely when absent so the CSS default wins. Mirror it as `--wf-public-accent` inside `.wf-public`. Do NOT refactor PortfolioCanvas itself — it is a self-contained themed identity (`.pf-root` + 10 `.pf-theme-*`) that must stay outside `.wf-public`; harvest the pattern, leave the file alone.

### `src/app/folio/portfolio-view.js:84` — /folio footer — 'Made with WappFlow Studio' vendor mark (the tasteful version of the /g leak)

`<div className="pf-foot-mark">Made with WappFlow Studio</div>`, styled by portfolio.css:59 `.pf-foot-mark { font-size: 10.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--pf-ink-2); opacity: 0.7; }`. This is the RIGHT treatment and the direct counter-example to g/[token]/page.js:269: here the vendor mark is 10.5px, uppercase, 70% opacity, theme-toned, and sits BELOW a 26-56px studio name (l.75) and the studio's own contact links — the hierarchy is unmistakable. On /g the vendor line is the only line.

> **Migration:** PublicFooter's visual spec should be lifted from `.pf-foot`: studio name primary, studio contact secondary, vendor mark tertiary at ~10.5px/0.18em/70% opacity. That single hierarchy decision resolves the /g:269 and /d (no footer) defects at once and gives the future white-label entitlement one node to suppress.

### `src/app/d/[token]/page.js:74` — THE ACCENT FALLBACK COLLISION, enumerated — `linear-gradient(135deg,#0ea5e9,#6366f1)` is the de-facto WappFlow mark on 5 public surfaces, and #6366f1 is simultaneously the app's --accent token

Every occurrence inside the Batch F sweep, exact: d/[token]/page.js:74 (26px sticky mark, letter 'W'); d/[token]/page.js:151 (the 'Ask a question' FAB) and :155 (the AskWidget header bar) — so /d uses the gradient THREE times, twice on non-mark chrome; shop/[token]/page.js:52; client/[token]/page.js:57; book/[slug]/page.js:53; booking/manage/[token]/page.js:45. Six occurrences across five public files. THE COLLISION, precisely: (a) `#6366f1` is literally `--accent` in globals.css:15 (dark) and :38 (light) and `--sidebar-active` at :23/:42, i.e. the app's interaction colour; (b) the same #6366f1 is the studio-facing brand-mark gradient stop on public pages; (c) the same #6366f1 is a STATUS colour on client/[token]/page.js:17,21 ('Awaiting you'/'Due') and the link colour at :76; (d) `#0ea5e9` is both the other gradient stop and the 'Opened'/'Viewed' status colour at client:17; (e) the same pair recurs as the WappFlow chrome gradient across the authed app (app/contracts/[id]/page.js:85,414; app/control/login/page.js:36,51) and even as the PWA theme colour (app/layout.js:29 `themeColor: '#6366f1'`). So one hex pair currently means 'WappFlow', 'accent', 'interactive', and 'awaiting signature' at the same time. Introduce a studio accent and all four meanings alias.

> **Migration:** Batch F closes this by removing the gradient from PUBLIC brand chrome only (the 6 sites above): the mark surface becomes either a neutral token inside `.wf-public` or, when the backend later supplies one, the studio's own accent via a scoped custom property (the portfolio-view.js:18 pattern). Leave the authed-app occurrences (contracts, control, layout themeColor) alone — they are legitimately WappFlow's chrome. Do NOT simply swap #0ea5e9→#6366f1 or vice-versa; the fix is de-branding the public mark, not picking a winner between the two hexes.

### `src/app/client/[token]/page.js:57` — `(data.brand || 'W')[0].toUpperCase()` — the 'W' fallback that silently renders WappFlow's initial as the studio's

Identical expression at client/[token]/page.js:57, shop/[token]/page.js:52, book/[slug]/page.js:53, booking/manage/[token]/page.js:45 — four copies. Combined with backend fallbacks that return the string 'WappFlow' (booking.js:56 ×3 returns, print-store.js:40, server.js:5804), the failure mode compounds: brand === 'WappFlow' → initial 'W' → 'W' on the WappFlow gradient → an unmistakable WappFlow badge on a page the client believes belongs to their photographer. Even when brand is null the literal `|| 'W'` produces the same badge. /d:74 skips the expression entirely and hardcodes `>W<`.

> **Migration:** PublicBrandHeader must derive the initial from the brand string and render NOTHING when there is no brand — an empty/neutral avatar or the name alone, never a defaulted letter. Delete the `|| 'W'` in all four places and the hardcoded 'W' at d:74. Belt-and-braces: also treat the exact string 'WappFlow' as 'no brand' on the frontend until the backend deferral is closed, so the graceful-fallback path actually engages for unconfigured workspaces.

### `src/app/globals.css:5` — No `.wf-public` scope exists; :root defaults to DARK and public pages are all fixed-light — Core primitives are currently unusable on them

Verified by `grep -rn 'wf-public' src` → zero hits anywhere in the repo. globals.css:5-25 defines the DARK palette on `:root` (--bg:#0f1117, --surface:#1a1d27, --surface2:#222536, --border:#2a2d3e, --text:#e2e8f0, --text-muted:#6b7280, --text-dim:#9ca3af, --accent:#6366f1); the light values live only under `html.light` (l.28-48). app/layout.js:43 defaults the class to dark (`localStorage.getItem('theme') || 'dark'`), and no public page touches the class. Batch A's semantic layer (l.53-101) and the html.light overrides (l.89-101) follow the same shape. Consequence, measured against the primitives: Button.js needs --surface/--surface2/--text/--border/--accent/--on-accent; Badge.js needs --surface2/--text-dim + the 6 *-bg/*-fg pairs; Modal.js needs --surface/--surface2/--text/--text-dim/--border/--overlay-bg/--elev-3; Field.js needs --surface/--border/--text-muted/--text-dim/--elev-1; Toast/Spinner/EmptyState/ErrorState/Skeleton likewise. Every one of those resolves DARK for a public visitor today, so dropping any Core primitive onto /shop, /book, /client, /pay or /booking/manage paints charcoal-on-cream. That is precisely why those six pages hand-rolled ~110 hardcoded hexes instead of reusing the system.

> **Migration:** `.wf-public` must re-declare the full Tier-2 semantic set (--bg,--surface,--surface2,--border,--glass,--text,--text-muted,--text-dim,--accent-fg,--success/-bg/-fg,--warning*,--danger*,--info*,--overlay-bg,--elev-1/2/3,--on-accent) pinned to the light values, on a wrapper class, winning regardless of the html.light state — same containment discipline as `.cs-doc` (contracts.css:9) and `.pf-root` (portfolio.css:7), both of which already prove the pattern in this codebase. Two open questions to settle BEFORE writing it: (1) portal-rendered overlays escape the wrapper (see item 22); (2) /g and /d-executive are dark and must opt out (items 3, 7).

### `src/app/shop/[token]/page.js:118` — The six light public pages already share one de-facto light palette — this is the `.wf-public` token map, ready-made

Hex census across shop/pay/client/book/booking-manage/d shows a consistent, near-identical set: ink #16161a (d×10, shop×10, book×7, booking×7, client×5, pay×4); muted #70707a; dim #8a8a93; faint #a8aeb8; page bg `linear-gradient(180deg,#f6f7f9,#eceef2)` (shop:49, client:54, book:50, booking:42, pay:47) with flat #eceef2 for the centred error/loading shells (shop:118, book:115, booking:84, client:107, d:237); card surface #fff on border #ececf1 with `boxShadow:'0 1px 3px rgba(0,0,0,0.04)'` (shop:60, client:44, book:109, booking:49); control border #e2e2e8; input border #d8d8e0 (shop:120, book:117, d:240); danger #dc2626; success #10b981; warning #f59e0b. The shared `center`/`spinner`/`inp` consts at the foot of five files (shop:118-120, book:115-117, booking:84-85, client:107-108, pay:47-48, d:237-240) are literal duplicates of one another. NONE of these hexes would conflict with a `.wf-public` scope — they ARE the light palette, just inlined six times. They map cleanly onto html.light's intent (#16161a≈--text #0f172a, #70707a/#8a8a93≈--text-muted/--text-dim, #fff≈--surface, #ececf1/#e2e2e8≈--border) without being byte-identical, which is the only design decision to make.

> **Migration:** Decide once: does `.wf-public` adopt html.light's exact values (#0f172a/#ffffff/#e2e8f0/#64748b — cleaner, one source of truth, but shifts every public page's ink a shade) or freeze the public pages' own values (#16161a/#fff/#ececf1/#70707a — zero visual diff, but a second light palette to maintain)? Recommend the former with the owner's eyeball sign-off, since the diff is sub-perceptual and the alternative permanently forks the light ladder. Either way the six duplicated `center`/`spinner`/`inp` consts collapse into the scope + existing Spinner/Field primitives — a follow-on cleanup, not Batch F itself.

### `backend/server.js:320` — company_settings has company_logo but NO accent column — the brand data model is half-built, and no public endpoint serves the logo

Schema l.320-339: `company_name TEXT, company_logo TEXT, company_address, company_email, company_phone, company_website, currency, currency_symbol, ...`. There is a logo (uploaded via the endpoint at l.1426-1427 `INSERT INTO company_settings (id, user_id, company_logo) ... ON CONFLICT(user_id) DO UPDATE`) and it IS used — but only in transactional EMAIL, at l.2367-2369: `const logoBlock = c.company_logo ? '<img src=... max-height:54px;max-width:210px...>' : '<div style="...color:${accent}...">${esc(c.company_name || 'WappFlow')}</div>'`, where l.2353 hardcodes `const accent = '#6366f1'` — the same collision hex, and the same 'WappFlow' fallback. So the invoice EMAIL is more brand-aware than any public WEB page. Crucially there is NO accent/brand_color column at all; the only per-studio accent that exists anywhere is `ms_portfolios.settings.accent` (JSON), consumed at portfolio-view.js:18.

> **Migration:** Scopes the deferred backend proposal precisely: (1) forward company_logo on the 6 public payloads (already loaded via SELECT * on the /client route, server.js:5796 — free there); (2) ADD a brand accent column, since none exists — model it on ms_portfolios.settings.accent which already works end-to-end; (3) change the four 'WappFlow' string fallbacks to null so the frontend owns the fallback; (4) retire the hardcoded `accent = '#6366f1'` at server.js:2353 in the same pass so email and web share one brand source. Batch F ships PublicBrandHeader with `logoUrl` and `accent` in its prop signature so none of this requires a component change later.


## Lens 2 — What brand data exists today — 23 findings

Per-route endpoint shapes and where branding is stored — the D6 boundary.

### `backend/media-studio.js:2600` — ROUTE /g/[token] → GET /api/media/portal/:token — NO BRAND AT ALL

Handler at media-studio.js:2600; the literal response is media-studio.js:2638-2644: `res.json({ title: g.title, version: g.version, download_policy, watermark, proofing, store_enabled: storeEnabled, sections, assets: [...] })`. `title` is the GALLERY title (ms_galleries.title), not the studio. There is no company_name, no company_logo, no accent, no studio identity of any kind in this payload. The page (wappflow-web/src/app/g/[token]/page.js:179-182) accordingly renders only an eyebrow 'Your Gallery' + `data?.title`, and its footer (page.js:269) says the platform name, not the studio: 'Delivered with WappFlow Media Studio'. This page is also the only one of the eight that bypasses api.js and calls `fetch(`${BASE_URL}/api/media/portal/${token}`)` inline (page.js:47-48). Note this page is deliberately DARK-themed (page.js:177 `background:'#0b0b0f'`, gold #c2a878 as its accent) — it is the one public surface that is not a light surface.

> **Migration:** CANNOT render a real studio identity today — needs the deferred backend work. Batch F can adopt PublicBrandHeader here only in fallback mode (no name, no logo). Two extra cautions specific to /g: (a) it is dark-on-purpose, so a `.wf-public` FIXED-LIGHT scope must NOT be applied to this route or it will invert a deliberately cinematic gallery — either exclude /g from `.wf-public` or give it a `.wf-public--dark` sibling; (b) its accent is #c2a878 gold, a third accent value distinct from both #0ea5e9 and #6366f1, so folding it into the accent-collision fix would be a visual regression, not a fix. Recommend: leave /g's own chrome alone in Batch F and list it as a follow-up adopter once the backend returns brand.

### `backend/contracts-studio.js:926` — ROUTE /d/[token] → GET /api/cs/public/:token — NO STUDIO NAME; letterhead image only

Handler at contracts-studio.js:926; the literal response is contracts-studio.js:941: `res.json({ title: fresh.title, type: fresh.type, theme: fresh.theme, blocks, settings: fSettings, totals, status, signers, letterhead })`. `title` is the DOCUMENT title. The only brand-ish field is `letterhead`, computed at contracts-studio.js:940 as `(fSettings.letterhead !== false && wsSettings.letterhead_url) ? wsSettings.letterhead_url : null` — i.e. a workspace-uploaded letterhead IMAGE path from cs_settings.letterhead_url. There is no company_name, no company_logo, no accent. The page's own `Brand` component (wappflow-web/src/app/d/[token]/page.js:72-78) proves the gap: it renders a hardcoded gradient chip with the literal letter 'W' and falls back to the string 'WappFlow' when the doc has no title (page.js:75).

> **Migration:** PARTIAL today. A studio NAME cannot be rendered — needs deferred backend. But `letterhead` IS a real, already-returned brand asset and is the single richest brand signal any non-folio public route currently has; PublicBrandHeader could accept an optional `logoUrl` prop and /d could pass `mediaUrl(data.letterhead)` on day one. Note the page already renders letterhead separately inside the document frame (page.js:94 `<DocFrame letterhead={data.letterhead} .../>`), so reusing it in the header would double it — decide one placement, don't render both.

### `backend/print-store.js:86` — ROUTE /shop/[token] → GET /api/store/public/:token — RETURNS brand NAME

Handler at print-store.js:86; the literal response is print-store.js:92: `res.json({ brand: name, currency_symbol: sym, gallery_title: g.title, products })`, where `{ name, sym }` comes from `brandSym(g.workspace_id)` (print-store.js:90). `brand` is the real `company_settings.company_name`. No logo, no accent. Consumer: wappflow-web/src/app/shop/[token]/page.js:18 sets `document.title = `Shop · ${d.brand}``, page.js:52 renders a monogram from `(data.brand || 'W')[0].toUpperCase()`, page.js:53 renders `{data.brand} Print Shop`.

> **Migration:** CAN render a real studio identity TODAY (name + monogram). Batch F adopter with zero backend dependency. The page already derives exactly the monogram-from-first-letter pattern PublicBrandHeader should own — lift it into the primitive rather than reimplementing.

### `backend/payments.js:220` — ROUTE /pay/[token] → GET /api/payments/public/:token — NO BRAND AT ALL

Handler at payments.js:220. The response is a bare column projection, payments.js:222: `db.prepare('SELECT amount, currency, currency_symbol, description, status, provider, checkout_url FROM payments WHERE public_token = ?')` then `res.json(p)` at payments.js:224. Zero brand fields — not even a workspace_id is exposed, so the client cannot derive one. The page (wappflow-web/src/app/pay/[token]/page.js) renders no brand mark at all: it is a bare white card, and the only studio reference is the prose fallback at page.js:38 ('…complete payment with the studio directly'). Of all eight routes this is the emptiest.

> **Migration:** CANNOT render a real studio identity today — needs the deferred backend work. This is the highest-trust surface in the whole set (someone is about to pay money) and it currently shows no sender identity whatsoever, which is worth flagging in the follow-up proposal as the strongest argument for the backend work. Batch F can only add fallback chrome here. Cheapest future fix: add `company_name`/`company_logo` to the SELECT-join via the payment's workspace owner.

### `backend/server.js:5782` — ROUTE /client/[token] → GET /api/client-portal/public/:token — RETURNS brand NAME

Handler at server.js:5782. It resolves the workspace super_admin at server.js:5795 (`SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1`), then loads the FULL company_settings row at server.js:5796 (`cs = db.prepare('SELECT * FROM company_settings WHERE user_id = ?')`) — but the response at server.js:5802-5808 emits only `brand: (cs && cs.company_name) || 'WappFlow'` (server.js:5804) and throws the rest of the row away. Consumer: wappflow-web/src/app/client/[token]/page.js:29 (`document.title = `${d.brand} · Your portal``), page.js:57 monogram, page.js:58 eyebrow, page.js:101 footer 'Powered by {data.brand}'.

> **Migration:** CAN render a real studio identity TODAY (name + monogram). Also the single cheapest backend upgrade in the whole inventory: `cs` is ALREADY the full row in memory at server.js:5796 — exposing `company_logo` is a one-line change to the res.json at server.js:5804. Worth calling out in the follow-up proposal as the zero-cost first domino, but per D6 it stays out of Batch F.

### `backend/booking.js:125` — ROUTE /book/[slug] → GET /api/booking/public/:slug — RETURNS brand NAME

Handler at booking.js:125; the literal response is booking.js:130: `res.json({ brand: brandName(row.workspace_id), services: cfg.services || [], slots: computeSlots(...), intake: cfg.intake || [], timezone: cfg.timezone || '' })`. `brand` is the real company_name via brandName(). No logo, no accent. Consumer: wappflow-web/src/app/book/[slug]/page.js:24 (`document.title = `Book · ${d.brand}``), page.js:53 monogram, page.js:54 `Book with {data.brand}`, page.js:101 footer 'Powered by {data.brand}'.

> **Migration:** CAN render a real studio identity TODAY. Batch F adopter with zero backend dependency.

### `backend/booking.js:174` — ROUTE /booking/manage/[token] → GET /api/booking/manage/:token — RETURNS brand NAME

Handler at booking.js:174; the literal response is booking.js:180: `res.json({ brand: brandName(b.workspace_id), booking: { service, start_at, name, status }, slots: computeSlots(...) })`. Same brandName() source as /book. Consumer: wappflow-web/src/app/booking/manage/[token]/page.js:45 monogram, page.js:79 footer 'Powered by {data.brand}'. Note this page never uses `data.brand` in a heading — its h1 is the generic 'Manage your booking' (page.js:46) — so the studio name currently appears only in the tiny footer.

> **Migration:** CAN render a real studio identity TODAY. Adopting PublicBrandHeader here is a net UX gain, not just a refactor, because the returned brand name is currently under-used.

### `backend/media-studio.js:2585` — ROUTE /folio/[handle] → GET /api/media/public/portfolio/:handle — RICHEST BRAND PAYLOAD (self-contained, does NOT use company_settings)

Handler at media-studio.js:2585, returning `shapePublicPortfolio(pf)` (media-studio.js:2591). That shaper is media-studio.js:2403-2409 and returns: `{ title, tagline, bio, theme, cover_url, avatar_url, settings, items }` where `settings` is the parsed ms_portfolios.settings JSON. This is the ONLY public route that already ships a logo-equivalent (`avatar_url`), a theme, and an accent (`settings.accent`). Consumer wappflow-web/src/app/folio/portfolio-view.js proves all of it is live: line 18 `const styleVars = s.accent ? { '--pf-accent': s.accent } : undefined`, line 33 `className={`pf-root pf-theme-${pf.theme || 'atelier'}`}`, line 38 `<img className="pf-avatar" src={mediaUrl(pf.avatar_url)} />`, line 40 `{pf.title || 'Untitled Studio'}`, line 41 tagline, lines 78-81 contact links from `s.email / s.phone / s.instagram / s.website`, line 84 footer 'Made with WappFlow Studio'.

> **Migration:** CAN render a FULL studio identity today — name, tagline, avatar/logo, contact links, accent, and a 10-theme identity system. But this is a TRAP for Batch F: /folio is a deliberate ten-identity design system of its own (PORTFOLIO_THEME_META, portfolio-view.js:102-113, with themes like noir/luxe/film that are dark and use their own palettes) and it is fully self-contained — it never touches company_settings. Forcing PublicBrandHeader/PublicFooter or a fixed-light `.wf-public` onto /folio would destroy 10 shipped themes. STRONG RECOMMENDATION: exclude /folio from the `.wf-public` scope and from header/footer adoption; treat it as an already-solved brand surface. If anything, /folio is the model the deferred backend proposal should copy (its `settings.accent` is the only per-studio accent that exists anywhere in the product).

### `backend/server.js:321` — BRAND STORAGE #1 — company_settings (the primary brand table)

Schema at server.js:321-340. Quoted verbatim: `CREATE TABLE IF NOT EXISTS company_settings ( id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, company_name TEXT, company_logo TEXT, company_address TEXT, company_email TEXT, company_phone TEXT, company_website TEXT, currency TEXT DEFAULT 'USD', currency_symbol TEXT DEFAULT '$', currency_position TEXT DEFAULT 'before', invoice_prefix TEXT DEFAULT 'INV', invoice_counter INTEGER DEFAULT 1000, tax_name TEXT DEFAULT 'Tax', tax_rate REAL DEFAULT 0, email_signature TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id) );`. CRITICAL: `company_name` and `company_logo` EXIST. There is NO `accent` column and NO `theme` column — confirmed by `grep -rn accent backend/*.js`, which returns only ms_portfolios.settings (media-studio.js:198), a cs_settings comment (contracts-studio.js:129), and hardcoded `#6366f1` literals (server.js:2353). Note the table is keyed by user_id, NOT workspace_id — every public route has to resolve the workspace owner first.

> **Migration:** This settles the D6 split precisely: company_NAME is already plumbed to 4 of 8 public routes; company_LOGO is stored and uploadable (server.js:1421-1430 writes `/uploads/logos/logo-<userId>.<ext>`) but is returned by ZERO public endpoints; ACCENT does not exist as a column at all. So PublicBrandHeader should take props `{ name, logoUrl, accent }` where only `name` has a live source today, `logoUrl` is wired-but-always-undefined (graceful fallback to monogram), and `accent` is pure future-proofing that must default to the design-system token. The follow-up proposal needs a schema change (ADD COLUMN accent) — it is not merely a plumbing change.

### `backend/booking.js:56` — BRAND STORAGE #2 — brandName() helper, and its 'WappFlow' poison-fallback

booking.js:56 verbatim: `const brandName = (ws) => { const o = owner(ws); if (!o) return 'WappFlow'; try { const cs = db.prepare('SELECT company_name FROM company_settings WHERE user_id = ?').get(o); return (cs && cs.company_name) || 'WappFlow'; } catch { return 'WappFlow'; } };`. Feeds /api/booking/public/:slug (booking.js:130) and /api/booking/manage/:token (booking.js:180). It projects ONLY company_name — company_logo is available in the same row and is not selected.

> **Migration:** LOAD-BEARING GOTCHA for PublicBrandHeader: the absence of branding is encoded as the literal string 'WappFlow', not as null/undefined. Three of the four brand-carrying routes do this (booking.js:56, print-store.js:40, server.js:5804). So `data.brand` is NEVER falsy, and the page-level fallbacks like `(data.brand || 'W')[0]` (book/[slug]/page.js:53) are dead code that can never fire — an unbranded studio silently renders a 'W' monogram and the word 'WappFlow' as if it were the studio's name. PublicBrandHeader must treat `name === 'WappFlow'` as the unbranded case (render neutral platform chrome), or Batch F will ship a header that confidently mislabels every unconfigured studio.

### `backend/print-store.js:40` — BRAND STORAGE #3 — brandSym() helper (name + currency symbol)

print-store.js:40 verbatim: `const brandSym = (ws) => { const o = owner(ws); let name = 'WappFlow', sym = '$'; if (o) { try { const cs = db.prepare('SELECT company_name, currency_symbol FROM company_settings WHERE user_id = ?').get(o); if (cs) { name = cs.company_name || name; sym = cs.currency_symbol || sym; } } catch {} } return { name, sym }; };`. Feeds /api/store/public/:token (print-store.js:90-92) and the order POST (print-store.js:100).

> **Migration:** Same 'WappFlow' poison-fallback as brandName(). Also note this is the second independent implementation of 'resolve workspace owner → read company_settings' (brandName is the first, server.js:5795-5796 the third) — three copies, none selecting company_logo. The deferred backend proposal should land ONE shared `publicBrand(workspaceId)` helper returning `{ name, logo_url, accent }` rather than patching three call sites; worth stating so Batch F's prop shape is designed against that future single source.

### `backend/media-studio.js:184` — BRAND STORAGE #4 — ms_portfolios (the only store with an accent + theme)

Schema at media-studio.js:184-202. Brand-relevant columns quoted: `handle TEXT UNIQUE, -- vanity slug → /folio/:handle`, `title TEXT`, `tagline TEXT`, `bio TEXT`, `theme TEXT DEFAULT 'atelier'`, `cover_url TEXT`, `avatar_url TEXT`, `is_public INTEGER DEFAULT 0`, and crucially `settings TEXT DEFAULT '{}', -- JSON: accent, contact{}, social{}, layout opts`. This is the ONLY place in the product where a per-studio accent colour actually lives, and it is a JSON blob key, not a column.

> **Migration:** Precedent to cite in the follow-up proposal: the accent already exists as `ms_portfolios.settings.accent` and is consumed as a CSS custom property (`--pf-accent`, portfolio-view.js:18). The pattern PublicBrandHeader should mirror is exactly that — set a CSS var from data, let CSS do the rest — so that when the backend later supplies an accent, no component logic changes. Do NOT read ms_portfolios for the other seven routes: it is per-user portfolio identity, not workspace company identity, and the two are separate concepts today.

### `backend/contracts-studio.js:196` — BRAND STORAGE #5 — cs_settings (letterhead image, workspace-scoped)

Schema at contracts-studio.js:196-201 verbatim: `CREATE TABLE IF NOT EXISTS cs_settings ( workspace_id TEXT PRIMARY KEY, letterhead_url TEXT, -- workspace letterhead image (optional) settings TEXT DEFAULT '{}', -- JSON: default theme/expiry/sender/letterhead_on updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP );`. Read via `getSettings` at contracts-studio.js:733. Exposed publicly only at contracts-studio.js:940-941 on the /d route. The `settings` JSON comment at contracts-studio.js:129 mentions 'accent' but that comment is on the cs_documents table and grep confirms no accent is ever written or read anywhere in the backend.

> **Migration:** letterhead_url is the ONLY brand IMAGE that reaches any public page today. It is workspace-scoped (unlike company_settings which is user-scoped), which is a modelling inconsistency the deferred proposal will have to reconcile. For Batch F: this is the one real `logoUrl` value available, and only on /d.

### `backend/booking.js:25` — BRAND STORAGE #6 — booking_settings (NO brand; slug only)

Schema at booking.js:25-30 verbatim: `CREATE TABLE IF NOT EXISTS booking_settings ( workspace_id TEXT PRIMARY KEY, slug TEXT UNIQUE, settings TEXT DEFAULT '{}', updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP );`. Contains no brand columns whatsoever. The public slug is merely SEEDED from the brand name at booking.js:101 (`slugify(req.body.slug || brandName(req.workspaceId))`) — a one-time derivation, not a live link.

> **Migration:** Recorded to close the search: /book and /booking/manage get their brand exclusively from company_settings via brandName(), never from booking_settings. No second brand source hides here.

### `src/lib/api.js:449` — CLIENT-SIDE FETCH HELPERS — all eight public routes, and the one that bypasses them

Every public-route helper in api.js, with lines: fetchPublicPortfolio (api.js:449-453, `GET ${API_URL}/media/public/portfolio/:handle`, throws 'not_found' on 404); fetchPublicDoc (api.js:495-499, `GET /cs/public/:token`, maps 410→'expired'); fetchPayment (api.js:559-563, `GET /payments/public/:token`); fetchShop (api.js:578-582, `GET /store/public/:token`); fetchBookingPublic (api.js:589-593, `GET /booking/public/:slug`); fetchBookingManage (api.js:599-603, `GET /booking/manage/:token`); fetchClientPortal (api.js:613-617, `GET /client-portal/public/:token`). Mutations: signPublicDoc 500-504, declinePublicDoc 505-508, askPublicDoc 619-623, trackPublicDoc 624-631 (sendBeacon), createOrder 583-587, createBooking 594-598, rescheduleBookingPublic 604-608, cancelBookingPublic 609-612. Media path resolver: `mediaUrl` at api.js:634-637 (`/^https?:\/\//.test(p) ? p : `${BASE_URL}${p}``). EXCEPTION: /g/[token] has NO api.js helper — it imports raw `BASE_URL` (g/[token]/page.js:7) and hand-rolls seven fetches inline (page.js:47-48, 67, 80, 86, 97, 105, 118, 128), including its own copy of mediaUrl named `imgUrl` (page.js:9).

> **Migration:** All seven helpers are plain `fetch` + `res.json()` with no response reshaping — so ANY brand field the backend later adds flows through to the pages untouched, with zero api.js changes needed. That is the key enabler for D6: Batch F's primitive can be written against a `{ brand, brand_logo, brand_accent }` contract now, and the deferred backend work alone will light it up. `mediaUrl` (api.js:634) is the correct resolver for a future `logoUrl` prop — PublicBrandHeader should call it rather than string-concatenating BASE_URL. Separately: /g's inline-fetch duplication is pre-existing and out of Batch F scope, but note it means /g is the one route where adding a brand consumer requires touching raw fetch code.

### `src/app/shop/[token]/page.js:52` — ACCENT COLLISION #1 — /shop brand monogram uses #0ea5e9→#6366f1

shop/[token]/page.js:52: `background: 'linear-gradient(135deg,#0ea5e9,#6366f1)'` on the 44px monogram chip, with the monogram text `(data.brand || 'W')[0].toUpperCase()`. #0ea5e9 (sky) is not a design-system token; the sole accent token is `--accent: #6366f1` (globals.css:15 and :38). The gradient therefore starts at a colour the token ladder does not contain and ends at the one it does.

> **Migration:** Kill target. This site has a REAL brand name behind it, so the fix is: PublicBrandHeader renders the monogram on `var(--accent)` (flat) or an accent-derived gradient, never a hardcoded sky→indigo. Also note page.js:69 uses a bare `#6366f1` for option prices — same file, same colour, already correct-by-accident; retokenize both while here.

### `src/app/book/[slug]/page.js:53` — ACCENT COLLISION #2 — /book brand monogram uses #0ea5e9→#6366f1

book/[slug]/page.js:53: `background: 'linear-gradient(135deg,#0ea5e9,#6366f1)'` on the 44px monogram chip. The same file additionally hardcodes `#6366f1` as the selection colour in five places — service chips (page.js:61, both border and the `rgba(99,102,241,0.08)` tint), day chips (page.js:74, same pair), and time chips (page.js:81, border + fill).

> **Migration:** Kill target, and the densest one: killing #0ea5e9 here without also retokenizing the five `#6366f1`/`rgba(99,102,241,…)` literals leaves the page half-migrated. `rgba(99,102,241,0.08)` is very close to `--accent-light` (globals.css:40 = `rgba(99,102,241,0.1)` in light mode) — confirm the 0.08→0.1 shift is acceptable before substituting, or the selected-state tint will visibly darken.

### `src/app/booking/manage/[token]/page.js:45` — ACCENT COLLISION #3 — /booking/manage brand monogram uses #0ea5e9→#6366f1

booking/manage/[token]/page.js:45: `background: 'linear-gradient(135deg,#0ea5e9,#6366f1)'` on the 44px monogram chip. Same file also hardcodes `#6366f1` + `rgba(99,102,241,0.08)` on the reschedule day chips (page.js:62) and time chips (page.js:65) — a near-verbatim copy of the /book chip code.

> **Migration:** Kill target. /book and /booking/manage are duplicated chip implementations; if Batch F touches both, the selection-chip pattern is a Rule-of-Three candidate (3rd instance) — but that is a Button/segmented-control concern, NOT brand chrome. Resist scope creep: fix the accent literals, leave the chip abstraction to a later batch.

### `src/app/client/[token]/page.js:57` — ACCENT COLLISION #4 — /client brand monogram uses #0ea5e9→#6366f1

client/[token]/page.js:57: `background: 'linear-gradient(135deg,#0ea5e9,#6366f1)'` on the 44px monogram chip, directly above the eyebrow `{data.brand}` (page.js:58) — so the hardcoded platform gradient sits immediately adjacent to the real studio name, which is the exact visual confusion Batch F exists to fix. Also `#6366f1` hardcoded on the gallery 'Open →' affordance (page.js:76).

> **Migration:** Kill target, and the best demo case for the batch: real brand name + fake brand colour side by side. Footer at page.js:101 ('Powered by {data.brand}') is the natural PublicFooter adopter.

### `src/app/d/[token]/page.js:74` — ACCENT COLLISION #5 — /d uses #0ea5e9→#6366f1 in THREE places (worst offender)

Three separate sites in one file: (1) d/[token]/page.js:74 — the sticky Brand chip, `linear-gradient(135deg,#0ea5e9,#6366f1)` wrapping a hardcoded letter 'W'; (2) d/[token]/page.js:151 — the floating '✦ Ask a question' FAB, same gradient plus a matching shadow `0 10px 30px rgba(14,165,233,0.4)` (that rgba IS #0ea5e9, so the collision leaks into the shadow token too); (3) d/[token]/page.js:155 — the Ask panel header bar, same gradient.

> **Migration:** Kill target ×3, and the only one where the gradient also appears as an rgba shadow (page.js:151) — a naive hex-only find/replace will miss `rgba(14,165,233,0.4)` and leave a sky-blue glow under an indigo button. Grep for `14,165,233` as well as `0ea5e9`. Note the 'W' at page.js:74 is a hardcoded platform monogram with no data behind it — PublicBrandHeader's fallback should own that, and /d can pass `mediaUrl(data.letterhead)` as logoUrl (see the /d route item).

### `src/app/client/[token]/page.js:17` — ADJACENT (NOT the brand collision) — #0ea5e9 as a document-status colour on a public page

client/[token]/page.js:17-20, the DOC_STATUS map: `viewed: ['#0ea5e9', 'Opened']`, alongside `sent: ['#6366f1', 'Awaiting you']`, `signed/completed: ['#10b981', …]`, `declined: ['#ef4444', …]`, `expired: ['#9ca3af', …]`, `pending_approval: ['#f59e0b', …]`; and INV_STATUS at page.js:21. Rendered by the local `Pill` component (page.js:41) which computes its tint as `${c}1f` (hex-alpha concatenation). Here #0ea5e9 is a semantic STATUS hue, not the brand accent — a different concept that happens to share the literal.

> **Migration:** Explicitly OUT of the accent-collision fix — do not sweep it in, or 'Opened' and 'Awaiting you' will collapse to the same colour. It IS however a Batch-B-shaped item: the exact `key → {label, tone}` registry pattern (lib/leadStatus, lib/invoiceStatus per D3), and `Pill` duplicates components/ui/Badge.js. Flag as a follow-on adopter; note it needs the deferred `docStatus` registry, and that the `${c}1f` hex-alpha trick breaks the moment a colour becomes a CSS var, so it cannot be tokenized without moving to Badge tones.

### `src/app/globals.css:5` — THEME SUBSTRATE — why .wf-public is required: dark is the :root default, light is an html.light OVERRIDE

globals.css:5-26 defines the DARK palette on bare `:root` (`--bg:#0f1117; --surface:#1a1d27; --text:#e2e8f0; --accent:#6366f1; …`). Light mode is not a media query — it is an explicit class override at globals.css:28-48 (`html.light { --bg:#f1f5f9; --surface:#ffffff; --text:#0f172a; … }`). The Batch A additions repeat the pattern: primitives on `:root` at globals.css:57-90, per-mode semantic overrides in `html.light` at globals.css:91-102, and a third pair at globals.css:310/317. Confirmed there is currently NO `.wf-public` selector and NO `prefers-color-scheme` rule anywhere in the file (452 lines total).

> **Migration:** This is the mechanical justification for the `.wf-public` scope: because dark lives on `:root` rather than in a media query, ANY Core primitive (Button, Badge, Modal, Field, Spinner, EmptyState…) dropped onto a public page inherits DARK tokens by default, while all seven light public pages hardcode white/#f6f7f9 backgrounds — an instant unreadable-contrast bug. `.wf-public` must therefore re-declare the same Tier-2 token set that `html.light` declares (globals.css:29-47 AND 92-101 — both blocks, not just the first), scoped to the wrapper, so it wins regardless of the `html.light` class. Specificity check: `.wf-public` (0,1,0) beats `html.light` (0,1,1)? NO — html.light is (0,1,1) and wins. Use `.wf-public` on an element that is a DESCENDANT of html (it always is) and rely on the cascade proximity of custom properties: descendant declarations override ancestor ones for inherited custom props, so a `.wf-public` wrapper DIV does win over `html.light`. Verify this in the browser before shipping — it is the single highest-risk assumption in Batch F.

### `src/app/layout.js:41` — THEME SUBSTRATE — the pre-hydration script defaults every visitor to DARK, including anonymous public-link visitors

layout.js:41-44, inside the `dangerouslySetInnerHTML` head script: `var t = localStorage.getItem('theme') || 'dark'; document.documentElement.classList.toggle('light', t === 'light');`. A client opening a /shop, /pay, /book or /client link has no `theme` key in localStorage, so `t` is 'dark' and `html.light` is NEVER applied. Also relevant: layout.js:30 `themeColor: '#6366f1'` (the browser chrome colour is already the correct accent token value, not #0ea5e9), and layout.js:5-6 `title.template: '%s · WappFlow'` — every public page's tab title is suffixed with the platform name even when the page has a real studio brand (e.g. /shop sets `Shop · {brand}` at shop/[token]/page.js:18, rendering 'Shop · Acme · WappFlow').

> **Migration:** Confirms the `.wf-public` need is not theoretical: the DEFAULT state for every public visitor is dark tokens. Two extra findings worth carrying into the batch: (a) `themeColor: '#6366f1'` at layout.js:30 is already token-correct, so the accent-collision fix makes the browser chrome and the in-page monogram agree for the first time; (b) the `'%s · WappFlow'` title template (layout.js:6) is a brand leak on studio-branded public pages — arguably PublicBrandHeader's sibling concern, but it lives in metadata not CSS, so flag it rather than fixing it blind.


## Lens 3 — Accent collision & light-scope hazards — 32 findings

The fallback collision, and every rule that fights a fixed-light public scope.

### `src/app/globals.css:15` — CANONICAL ACCENT — the ONE correct fallback is #6366f1, and it must be spelled var(--accent)

`  --accent: #6366f1;` at :root:15 and the IDENTICAL `  --accent: #6366f1;` at html.light:38. The Batch A comment at globals.css:74 states it outright: `/* Text on an --accent fill (accent is indigo in both modes) */`. Corroborated outside CSS by app/layout.js:30 `themeColor: '#6366f1'` and app/manifest.js `theme_color: '#6366f1'`, and by `--sidebar-active: #6366f1` (globals.css:23 and :46). There is exactly one accent in this design system and it does not vary by mode. Therefore #0ea5e9 (sky-500) is NOT an accent — it is a decorative gradient partner — and #818cf8 (indigo-400) is NOT an accent either (see item 6).

> **Migration:** Batch F establishes the rule: an accent fallback literal is never written. Every site becomes `var(--accent)` with NO comma-fallback, because --accent is defined on :root in globals.css which app/layout.js:1 imports for EVERY route (there is no route that can render without it — app/control/layout.js, app/studio/layout.js and app/contracts/layout.js are all nested under the root layout). Every `var(--accent, X)` fallback in the codebase is therefore provably dead code today AND a divergence bomb the moment any scope (like .wf-public) redefines the token.

### `src/app/control/database/page.js:81` — THE COLLISION, exhibit A — two different accent fallbacks on two ADJACENT lines of one style object

Line 81: `                  background: active ? 'color-mix(in srgb, var(--accent,#6366f1) 14%, transparent)' : 'transparent',`
Line 82: `                  color: active ? 'var(--accent,#818cf8)' : 'var(--text,#e8e8ea)', borderBottom: '1px solid var(--border,#1e1e26)' }}>`
Same element, same active state, same token — the tint says --accent falls back to #6366f1 and the text one line below says --accent falls back to #818cf8. If --accent ever resolves to nothing, this single tab renders a #6366f1-tinted background under #818cf8 text: two different "the accent" in one 14px-tall control.

> **Migration:** Both become `var(--accent)`. If the author's intent on :82 was the lighter on-dark reading colour, the correct token is `var(--accent-fg)` (globals.css:85 = #a5b4fc dark / :97 = #4f46e5 light) — decide explicitly, do not preserve #818cf8.

### `src/components/control/ControlShell.js:78` — THE COLLISION, exhibit B — both fallbacks on the SAME LINE

`                  color: active ? 'var(--accent, #818cf8)' : 'var(--text-muted, #9a9aa5)', background: active ? 'color-mix(in srgb, var(--accent, #6366f1) 14%, transparent)' : 'transparent', textDecoration: 'none' }}>`
One declaration block asserts two mutually exclusive answers to "what colour is --accent by default" — #818cf8 for the text, #6366f1 for the 14% tint. This is the collision in its purest form: no ambiguity about intent drift, the two beliefs are 60 characters apart.

> **Migration:** Both become `var(--accent)` (or the text one becomes `var(--accent-fg)`). This file is the shared nav for every /control route, so it is the highest-blast-radius of the six.

### `src/app/control/plans/page.js:114` — Accent fallback #818cf8 — plans mini-button + support link button

app/control/plans/page.js:114 `const mini = { background: 'none', border: '1px solid var(--border,#1e1e26)', borderRadius: 7, padding: '2px 8px', color: 'var(--accent,#818cf8)', fontSize: 11, cursor: 'pointer' };`
app/control/support/page.js:308 `const linkBtn = { background: 'none', border: 'none', color: 'var(--accent,#818cf8)', fontSize: 12, cursor: 'pointer', padding: 0 };`
Both pick the #818cf8 side of the collision. Two files, two module-level style consts, same wrong literal.

> **Migration:** Both → `var(--accent)`. These are module-level consts so the fix is one token substitution each, zero call-site churn.

### `src/components/RoomPanel.js:101` — Accent fallback #6366f1 — the sixth and last var(--accent, X) site

`        <button onClick={send} disabled={!text.trim() || sending} style={{ background: 'var(--accent,#6366f1)', color: '#fff', border: 'none', borderRadius: 9, padding: '0 14px', cursor: text.trim() ? 'pointer' : 'default', opacity: text.trim() ? 1 : 0.5 }}>`
Picks the #6366f1 side. Note it also hardcodes `color: '#fff'` where the ladder provides `var(--on-accent)` (globals.css:75).

> **Migration:** → `background: 'var(--accent)', color: 'var(--on-accent)'`. Completes the six-site sweep: after this, the string `var(--accent,` does not appear anywhere in src.

### `src/app/globals.css:85` — Provenance of #818cf8 — it is not --accent and it is not --accent-fg either

globals.css:85 `  --accent-bg: var(--accent-light); --accent-fg: #a5b4fc;` (dark) and globals.css:97 `  --accent-fg: #4f46e5;` (light). #818cf8 appears in the design system ONLY as a page-local literal outside the ladder — app/login/page.js:258 `--auth-accent: #818cf8;`, app/signup/page.js:297 same, app/page.js:2318 `--lp-accent: #818cf8;`, app/settings/page.js:951 `accentColor: '#818cf8'`. It is an auth/landing dialect colour that leaked into /control as a token fallback.

> **Migration:** Documents WHY the fallback is wrong rather than merely inconsistent: #818cf8 was never the accent default at all. Do not 'unify on #818cf8'. Unify on var(--accent) → #6366f1. The auth/landing --auth-accent/--lp-accent dialects are OUT of Batch F scope and stay as they are.

### `src/app/d/[token]/page.js:74` — Public brand mark #1 of 5 — sticky doc header, hardcoded sky→indigo, ignores the studio entirely

`      <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 13 }}>W</div>`
Worse than the other four: the glyph is a LITERAL 'W' (WappFlow), not the studio's initial. The studio's client sees WappFlow's mark on the studio's own proposal.

> **Migration:** Replace with <PublicBrandHeader brand={data?.title} /> — and the header must render the STUDIO initial, never 'W'. This is the first adopter to migrate because it is the only one that is provably mis-branded rather than merely inconsistently branded.

### `src/app/shop/[token]/page.js:52` — Public brand mark #2 of 5 — print store header

`          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20, marginBottom: 14 }}>{(data.brand || 'W')[0].toUpperCase()}</div>`
Byte-identical to client:57, book:53 and booking/manage:45 except for marginBottom. Four copy-pastes of the same 44px avatar = Rule of Three breached twice over.

> **Migration:** <PublicBrandHeader brand={data.brand} title={`${data.brand} Print Shop`} subtitle={data.gallery_title && `From “${data.gallery_title}”`} /> — the header primitive absorbs lines 51-55 wholesale (wrapper header + mark + h1 + subtitle).

### `src/app/client/[token]/page.js:57` — Public brand mark #3 of 5 — unified client portal header

`          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20, marginBottom: 16 }}>{(data.brand || 'W')[0].toUpperCase()}</div>`
This is the surface that hurts most: the client portal is the page that LINKS OUT to the gallery (g), the shop, the docs and the invoices — so it is the one place a client sees the sky→indigo mark and then clicks through to a gold gallery (item 16) and a bronze portfolio (item 17) belonging to the same studio, in one session.

> **Migration:** <PublicBrandHeader brand={data.brand} eyebrow={data.brand} title={`Welcome, ${data.client_name}`} subtitle="Everything for your project, in one place." /> — absorbs lines 56-61.

### `src/app/book/[slug]/page.js:53` — Public brand mark #4 of 5 — booking page header

`          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20, marginBottom: 14 }}>{(data.brand || 'W')[0].toUpperCase()}</div>`

> **Migration:** <PublicBrandHeader brand={data.brand} title={`Book with ${data.brand}`} subtitle="Choose a service and a time that works for you." /> — absorbs lines 52-56. Pair with <PublicFooter brand={data.brand} /> for line 101.

### `src/app/booking/manage/[token]/page.js:45` — Public brand mark #5 of 5 — manage-booking header

`          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20, marginBottom: 14 }}>{(data.brand || 'W')[0].toUpperCase()}</div>`

> **Migration:** <PublicBrandHeader brand={data.brand} title="Manage your booking" /> — absorbs lines 44-47. This page is ALSO the portal-trap page (item 30), so migrate it last, after .wf-public is proven.

### `src/app/d/[token]/page.js:151` — Sky-weighted variant on the SAME page whose header is the sky→indigo gradient — the AI Ask widget

Line 151: `        <button onClick={() => setOpen(true)} style={{ …, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff', fontWeight: 700, fontSize: 13.5, boxShadow: '0 10px 30px rgba(14,165,233,0.4)' }}>✦ Ask a question</button>` — note the shadow is rgba(14,165,233,0.4), i.e. #0ea5e9 at 40%: the FAB's halo commits to sky while its fill is a 50/50 gradient.
Line 155: `          <div style={{ …, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff' }}>` (widget titlebar).
So on app/d alone a client sees: sky→indigo header mark (74), sky→indigo FAB with a sky halo (151/155), a near-black #16161a primary CTA (122), and a near-black --cs-accent document body (item 18). Four accents, one page.

> **Migration:** The FAB and titlebar consume the same brand token the header does; the rgba(14,165,233,0.4) shadow must be derived from that token (color-mix) or dropped, never a second literal.

### `src/app/shop/[token]/page.js:69` — Indigo-only pickup — the gradient collapses to just its #6366f1 end for text/links

app/shop/[token]/page.js:69 `                      {o.label} <span style={{ color: '#6366f1', fontWeight: 800 }}>{sym}{Number(o.price).toLocaleString()}</span> <span style={{ color: '#8a8a93' }}>+</span>`
app/client/[token]/page.js:76 `          {data.galleries.map((g, i) => <Row key={i} href={g.url} icon="🖼️" title={g.title} sub="View & download" right={<span style={{ fontSize: 13, color: '#6366f1', fontWeight: 700 }}>Open →</span>} />)}`
This is the mechanism of the collision on public pages: where the brand appears as a FILL it is the 2-stop gradient, but wherever it must be a single readable colour someone silently picked the indigo end. Nothing enforces that choice, which is exactly why the /control fallbacks (items 2-5) drifted the other way.

> **Migration:** Both become the single brand token that PublicBrandHeader/PublicFooter also consume. Batch F should define exactly one public brand colour value + one on-brand text value, with the gradient (if kept at all) DERIVED from it — not the source of truth.

### `src/app/client/[token]/page.js:17` — Status maps that carry BOTH collision hues as semantic colours

Line 17: `  draft: ['#64748b', 'Draft'], sent: ['#6366f1', 'Awaiting you'], viewed: ['#0ea5e9', 'Opened'],`
Line 21: `const INV_STATUS = { draft: ['#64748b', 'Draft'], sent: ['#6366f1', 'Due'], paid: ['#10b981', 'Paid'], overdue: ['#ef4444', 'Overdue'] };`
Here #6366f1 and #0ea5e9 sit side by side as DIFFERENT semantic states (sent vs viewed) on the same page whose brand mark is a gradient blending those exact two hues. A client cannot tell the brand from the status. Mirrored in app/contracts/vault/page.js:12 and app/contracts/[id]/page.js:267 (`viewed: ['#0ea5e9', 'Viewed']`) — the app-side twins of this map.

> **Migration:** Replace both maps with components/ui/Badge + a lib/*Status registry (the D3 key→{label,tone,order} pattern already shipped in Batch B as lib/leadStatus.js + lib/invoiceStatus.js). Badge tones resolve to --info-bg/--info-fg etc., which .wf-public will supply in light. This also removes the last public-page use of #0ea5e9 as a semantic colour.

### `src/app/book/[slug]/page.js:61` — Indigo-only selection state across both booking surfaces (5 sites)

app/book/[slug]/page.js:61 service chip `border: \`1.5px solid ${service === s.name ? '#6366f1' : '#e2e2e8'}\`, background: service === s.name ? 'rgba(99,102,241,0.08)' : '#fff'`
app/book/[slug]/page.js:74 day chip — same pattern
app/book/[slug]/page.js:81 time chip `background: time === t ? '#6366f1' : '#fff', color: time === t ? '#fff' : '#16161a'`
app/booking/manage/[token]/page.js:62 day chip — same
app/booking/manage/[token]/page.js:65 time chip — same
Five selected-state literals plus the rgba(99,102,241,0.08) tint, all hand-rolled, none tokenized. rgba(99,102,241,…) appears on 166 lines app-wide — it IS --accent-light's colour, spelled out longhand.

> **Migration:** Inside .wf-public these become `var(--accent)` / `var(--accent-light)` / `var(--surface)` and the selected time chip becomes <Button variant="primary">. The 1.5px border + 11px radius are the public dialect — keep the metrics, tokenize the colours.

### `src/app/g/[token]/page.js:180` — Non-conforming public accent #1 — the gallery is GOLD on near-black, 13 hardcoded #c2a878

`        <p style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#c2a878', margin: '0 0 12px', fontWeight: 600 }}>Your Gallery</p>`
#c2a878 appears on 13 lines: 144, 149, 180, 185, 186, 198, 217, 233, 251, 274, 291, 304, 325. Shell is `background: '#0b0b0f', color: '#fff'` (line 177) and Centered (line 332) — the ONLY DARK public surface in the product. Also carries its own gold spinner (`.gspin{…color:#c2a878}` line 304), its own CommentModal (317-329) and its own password gate (140-153), none of which use any Core primitive.

> **Migration:** CRITICAL SCOPE DECISION for Batch F: `.wf-public` is specified as FIXED-LIGHT, but app/g is deliberately dark (a gallery must not compete with the photographs). Either (a) exclude app/g from .wf-public in this batch and adopt only PublicBrandHeader/PublicFooter there, or (b) define .wf-public as a fixed PUBLIC scope with a `.wf-public--dark` companion for galleries. Do not silently repaint the gallery light. Recommend (a) — smallest correct change; revisit in the deferred brand-data proposal.

### `src/app/folio/portfolio.css:9` — Non-conforming public accent #2 — portfolio is BRONZE, and it is the ONLY studio-settable accent that exists today

portfolio.css:9 `  --pf-accent: #b07d52; --pf-card: #fff;` plus ten theme overrides that each redefine it (:76 noir #ffffff, :84 editorial #bb4430, :93 gallery #111111, :104 film #d89a4e, :116 brut #1f43ff, :129 luxe #c8a35b, :139 vivid #ff4d6d, :148 mono #000000, :158 frame #8a7b66).
app/folio/portfolio-view.js:18 `  const styleVars = s.accent ? { '--pf-accent': s.accent } : undefined;`
app/studio/portfolio/page.js:236 `<input type="color" value={s.accent || '#b07d52'} … />` with a Reset that writes '' (falling back to the CSS default).
THIS IS THE HEART OF THE COLLISION: a studio CAN set exactly one accent in this product, and it applies to exactly ONE of their eight public surfaces. The same studio's gallery stays gold, their shop/portal/booking stay sky→indigo, and their proposal stays near-black. One studio, five different 'brand colours', all reachable from the client portal in one click.

> **Migration:** portfolio.css is a self-contained themed dialect with 10 curated identities — do NOT fold it into .wf-public. It is the PROOF that the brand-accent seam belongs at the data layer, which D6 defers. Batch F's job is only to make the OTHER seven surfaces consume ONE fallback so that when the deferred backend lands, there is a single place to feed it.

### `src/app/contracts/contracts.css:12` — A THIRD accent default on the app/d public page — --cs-accent is near-black

`  --cs-accent: #14151a; --cs-on-accent: #ffffff; --cs-surface: #f7f8fa; --cs-radius: 12px;` (monochrome default), with .cs-theme-editorial:21 `--cs-accent: #9a3b28` and .cs-theme-executive:27 `--cs-accent: #c8a35b`. app/d/[token]/page.js:7 imports contracts.css and line 92 renders `<div className={\`cs-doc cs-theme-${data.theme}\`}>`. So inside the document body every accented element (app/contracts/blocks.js:99, 164, 165, 172, 179, 194, 195, 211, 227, 253, 260, 261, 273, 302) resolves to #14151a — while the sticky header 18px above it is sky→indigo.

> **Migration:** contracts.css is a legitimate document-theme dialect (the studio picks a document theme). Leave --cs-* alone. But PublicBrandHeader on app/d must not fight it: either the header adopts the document's --cs-accent, or it stays neutral. Decide explicitly and write it in the header's doc comment — this is the one adopter where the page already has a themed accent.

### `src/app/d/[token]/page.js:122` — Every light public CTA is near-black #16161a — a fourth 'primary' that no token describes

`          <button onClick={() => setSigning(true)} style={{ padding: '14px 28px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#16161a', color: '#fff', fontWeight: 800, fontSize: 15, boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>Review &amp; sign →</button>`
#16161a occurs on 9 lines in app/d, 10 in app/shop, 7 in app/book, 5 in app/client, 7 in app/booking/manage, 4 in app/pay — as BOTH the primary button fill and the body ink. So the public dialect's 'primary' is near-black while the app's primary is indigo, and the brand mark on the very same page is a sky→indigo gradient. A visitor cannot infer the brand colour from any CTA.

> **Migration:** Under .wf-public, `--accent` can legitimately be redefined to the public near-black so <Button variant="primary"> renders the existing public CTA byte-for-byte with zero visual diff — that is the cleanest adoption path and it makes the 42 #16161a literals collapse into one token. Verify contrast: #16161a on #fff is ~17:1, fine. This must be an explicit, written decision, not an accident.

### `src/app/globals.css:28` — .wf-public must mirror the FULL mode-varying token set — three separate html.light blocks, 34 declarations

Block 1, globals.css:28-48 — --bg, --surface, --surface2, --border, --glass, --glass-2, --text, --text-muted, --text-dim, --accent, --accent-hover, --accent-light, --success, --warning, --danger, --sidebar-bg, --sidebar-text, --sidebar-active, --shadow.
Block 2, globals.css:91-102 — --overlay-bg, --elev-1, --elev-2, --elev-3, --accent-fg, --success-bg, --success-fg, --danger-fg, --info-bg, --info-fg.
Block 3, globals.css:317-323 — --warning-bg, --warning-border, --warning-text, --danger-bg, --danger-border.
The crucial mechanic: `.wf-public` on a DESCENDANT element beats `html.light` for inherited custom properties by PROXIMITY, not specificity (specificity only arbitrates declarations on the same element) — so no !important is needed for tokens. But if .wf-public is ALSO applied to <html> (required for the portal fix, item 29), then it competes with html.light on the same element: `.wf-public` alone is (0,1,0) and LOSES to `html.light` (0,1,1). It must therefore be written as `html.wf-public` / `:root.wf-public` (0,1,1) AND placed after line 323 so source order settles the tie.
Do NOT redeclare the mode-INVARIANT tiers: --space-*, --radius-*, --fs-*, --fw-*, --dur*/--ease*, --z-*, --on-accent (globals.css:57-75) are identical in both modes and belong to Tier 1 only.

> **Migration:** Write .wf-public as ONE block that declares all 34 mode-varying tokens at their light values (copy from the three html.light blocks verbatim), placed at the very end of globals.css, with the selector `.wf-public, html.wf-public` so it works both as a page wrapper and as a documentElement class.

### `src/app/globals.css:77` — TRAP — --focus-ring is a DERIVED token: redefining --accent inside .wf-public will NOT update it

`  --focus-ring: 0 0 0 1px var(--accent), 0 0 0 4px var(--accent-light);`
Per CSS Custom Properties, var() references inside a custom property are substituted at computed-value time ON THE ELEMENT WHERE THE DECLARATION APPLIES, and the resolved string then inherits. --focus-ring is declared only on :root, so it computes to the DARK values (`0 0 0 1px #6366f1, 0 0 0 4px rgba(99,102,241,0.15)`) and children inherit that literal. Theme switching works today only because html.light sets --accent-light on the SAME element (html) that declares --focus-ring. A descendant scope like .wf-public gets no such recomputation — the ring would stay dark-mode indigo-at-15%-alpha on a white public card, effectively invisible (WCAG 2.4.11 failure on the studio's client-facing forms).

> **Migration:** MANDATORY: .wf-public must redeclare --focus-ring explicitly, not rely on redefining --accent/--accent-light. Also raise the alpha — rgba(99,102,241,0.15) over #fff is far too faint. Suggest `--focus-ring: 0 0 0 1px var(--accent), 0 0 0 4px color-mix(in srgb, var(--accent) 28%, transparent);` declared inside the .wf-public block itself.

### `src/app/globals.css:85` — TRAP — two more DERIVED tokens with the same recomputation failure: --accent-bg and --warning-fg

globals.css:85 `  --accent-bg: var(--accent-light); --accent-fg: #a5b4fc;`
globals.css:87 `  --warning-fg: var(--warning-text);`
Both are declared ONLY in :root and never in html.light (globals.css:101 even notes `/* --warning-fg follows --warning-text (html.light sets it to #92400e) */` — which is true only because both live on <html>). Inside .wf-public they would inherit the dark-resolved literals: --accent-bg = rgba(99,102,241,0.15) and --warning-fg = #fbbf24 (amber-on-dark) — the latter is ~1.8:1 on white. Blast radius is direct: Badge.js:15 uses --accent-bg, Badge.js:17 and Toast.js:55 use --warning-fg, EmptyState.js:54-55 uses --accent-bg/--accent-fg, lib/confirm.js:225 and :231 use --accent-bg and --warning-fg.

> **Migration:** Together with item 21, that is exactly THREE derived tokens .wf-public must redeclare literally: --focus-ring, --accent-bg, --warning-fg. Add a comment in globals.css naming them, because the failure is silent — nothing errors, colours are just quietly wrong.

### `src/app/globals.css:195` — LIVE DEFECT — input:not([data-ui]){…!important} is repainting public-page inputs DARK right now

`input:not([data-ui]), textarea:not([data-ui]), select:not([data-ui]) {\n  background: var(--surface2) !important;\n  color: var(--text) !important;\n  border-color: var(--border) !important;\n}` (195-199), plus ::placeholder (200-202) and :focus (203-206).
A stylesheet !important beats a non-important INLINE style. Every public form control specifies its light look inline and none carry data-ui, so all are overridden: app/book/[slug]/page.js:117 `const inp = { …, background: '#fff', … }` used at lines 87, 88, 89, 91, 93; app/shop/[token]/page.js:120 same const used at 100, 101, 102 (+ the qty input at :93); app/d/[token]/page.js:240 same const used at :215 (+ the Ask input at :167); app/g/[token]/page.js:148 password input, :196 name input, :324 comment textarea.
With the app default theme = dark (item 31), a studio's client filling in the booking form today sees #222536 boxes with #e2e8f0 text on a white card. The Batch D note at globals.css:229-233 explicitly assumed these neighbours render white — that assumption is false.

> **Migration:** GOOD NEWS: this rule is written entirely in tokens, so it SELF-HEALS the moment .wf-public redefines --surface2/--text/--border/--text-muted — the !important then paints them correctly light and the bug disappears for free, with zero edits to the six page files. Make this a named verification check: load /book/<slug> with localStorage.theme unset and assert computed input background === rgb(248,250,252).

### `src/app/globals.css:234` — .wf-input--public becomes redundant under .wf-public — two mechanisms for one job

`.wf-input--public { background: #fff; border-color: #d8d8e0; color: #0f172a; }` (234) + ::placeholder #94a3b8 (235) + option (236) + :-webkit-autofill (237-241), driven by Field.js:75 `className: \`wf-input${tone === 'public' ? ' wf-input--public' : ''}…\`` and documented at Field.js:21-22.
It hardcodes four hexes to force one light control. .wf-public solves the same problem for EVERY primitive at once by redefining the tokens, after which plain `.wf-input` (globals.css:211-228, all token-driven) already renders light and `tone="public"` is a no-op that merely re-asserts near-identical values (#fff vs var(--surface)=#ffffff, #d8d8e0 vs var(--border)=#e2e8f0, #0f172a vs var(--text)=#0f172a).

> **Migration:** Do not delete it in Batch F — nothing consumes tone="public" on the eight public routes today (verified: zero Field imports there). Instead mark it DEPRECATED in the globals.css comment per Constitution Art 11, point at .wf-public as the successor, and let it die on-touch. Flagging it now prevents Batch F from shipping the third mechanism.

### `src/app/globals.css:107` — The global :focus-visible ring rule + the .ms-root neutralizer precedent

`a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible,\ntextarea:focus-visible, summary:focus-visible, [role="button"]:focus-visible,\n[role="tab"]:focus-visible, [role="menuitem"]:focus-visible, [role="link"]:focus-visible,\n[tabindex]:focus-visible {\n  outline: none;\n  box-shadow: var(--focus-ring);\n}` (107-113), and the scope-down precedent at :120 `.ms-root :focus-visible { box-shadow: none; }` with the 5-line rationale at 114-119.
The rule itself is token-only so it needs NO .wf-public counterpart — provided --focus-ring is explicitly redeclared (item 21). The .ms-root pattern is the proof that a scope-level focus override is an accepted move in this codebase; .wf-public must NOT copy it (public pages have no themed outline of their own, so suppressing the ring would leave the studio's clients with no keyboard focus indicator at all on booking/checkout/sign forms).

> **Migration:** Explicitly write in the .wf-public comment: 'the global ring is INHERITED here on purpose — .wf-public redeclares --focus-ring rather than suppressing box-shadow.' Verification: Tab through /book/<slug> and assert a visible 4px halo on every chip, input and button.

### `src/app/globals.css:128` — body background/color bleed — the dark shell shows around every light public page

`body {\n  background: var(--bg);\n  color: var(--text);\n  …\n  transition: background 0.2s, color 0.2s;\n}` (128-134).
Every public route paints its own `minHeight: '100vh'` div (app/shop:49, app/client:54, app/book:50, app/booking/manage:42, app/d:89, app/pay:47, app/g:177, app/folio/[handle]:35) but <body> underneath stays var(--bg) = #0f1117. That is what a visitor sees in iOS/macOS overscroll rubber-banding, behind any short page, and during the paint gap before hydration. A .wf-public class on a page-level wrapper div CANNOT fix this — body is an ancestor, not a descendant.

> **Migration:** This is the second reason (after the portal trap) that .wf-public must ALSO land on documentElement, not only on a wrapper. Note the `transition: background 0.2s` on :133 will animate the flip — consider `html.wf-public body { transition: none; }` to avoid a visible dark→light wipe on first paint.

### `src/app/globals.css:326` — select option + scrollbar chrome resolve outside any wrapper scope

`select option {\n  background: var(--surface2);\n  color: var(--text);\n}` (326-329) — native option popups are rendered by the OS in several engines and are not reliably reachable by a descendant scope; this is precisely why .wf-input--public:236 needed its own explicit `option` rule.
`::-webkit-scrollbar-track { background: var(--bg); }` (333) and `::-webkit-scrollbar-thumb { background: var(--border); }` (334) with `:hover { background: var(--text-muted); }` (335) — these pseudo-elements attach to the scrolling element (documentElement/body), so a wrapper .wf-public never reaches them: a dark #0f1117 scrollbar gutter frames every light public page.

> **Migration:** Both are fixed by the documentElement-level .wf-public (they resolve against html/body). Keep the explicit `.wf-public select option` rule anyway for the OS-popup case. Scrollbar is a small but very visible tell that the page is 'the app' rather than 'the studio'.

### `src/app/globals.css:79` — Overlay tokens are consumed ONLY by portaled elements — a wrapper scope can never reach them

`  --overlay-bg: rgba(0,0,0,0.6); --overlay-blur: 8px;` (:root:79) and `  --overlay-bg: rgba(15,23,42,0.4);` (html.light:93).
Consumers: lib/confirm.js:178-180 `.cm-overlay { … background: var(--overlay-bg); backdrop-filter: blur(var(--overlay-blur)); }` and components/ui/Modal.js:98-100 `.wf-modal-backdrop { … background: var(--overlay-bg); … }`. Both of those elements live in the portal, i.e. as direct children of document.body — OUTSIDE any `.wf-public` wrapper div, so they resolve against :root/html.light and render the 60%-black app scrim over the studio's light page.

> **Migration:** Listed separately from item 29 because it is the token half of the same trap: even if you portal-scoped the dialog CARD, the BACKDROP is a sibling that also needs the scope. Only a documentElement-level .wf-public fixes both in one move.

### `src/components/ui/overlay.js:26` — THE BATCH F TRAP — every overlay renders to document.body, so a .wf-public wrapper contains none of them

`  return createPortal(children, document.body);`
Three primitives route through it: lib/confirm.js:116 `<Portal>`, components/ui/Toast.js:70 `<Portal>`, components/ui/Modal.js:54 `<Portal>`. All three are mounted app-wide from app/providers.js:13 (ConfirmProvider) and :19 (ToastViewport) inside the ROOT layout (app/layout.js:62), so they are live on every public route whether or not that route imports them.
Every style they emit is token-driven and will therefore resolve DARK on a public page: confirm.js:190-192 `.cm-card { background: var(--surface); border: 1px solid var(--border); … color: var(--text); }`, confirm.js:206-209 `.cm-close`, confirm.js:260-264 `.cm-typed-input`, confirm.js:291 `.cm-btn-primary { background: linear-gradient(135deg, var(--accent), var(--accent-hover)); }`; Modal.js:111-115 `.wf-modal-card`; Toast.js:91-95 `.wf-toast { background: var(--surface); border: 1px solid var(--border); … color: var(--text); }`.
Note also lib/confirm.js:145-154 `.cm-typed-input` is a bare <input> with NO data-ui, so it is additionally hit by the legacy !important override (item 23).

> **Migration:** REQUIRED APPROACH — do not try to scope the portal target. Ship a small client component (e.g. <PublicScope>, or fold it into PublicBrandHeader) that on mount does `document.documentElement.classList.add('wf-public')` and removes it on cleanup, mirroring exactly how app/layout.js:44 already toggles the `light` class on documentElement. Then EVERYTHING is in scope in one move: portaled confirm/Toast/Modal, the overlay backdrop tokens (item 28), body background (item 26), and scrollbars (item 27).
Also render the SAME `wf-public` class on the page wrapper so server-rendered in-flow content is light on first paint (the html class only arrives after hydration). Selector must be `.wf-public, html.wf-public` placed after globals.css:323 so it beats html.light on the shared <html> element.
REJECTED ALTERNATIVES, and why: (a) adding a `scope`/`public` prop to Modal/Toast/confirm — confirm() is invoked from library code with no knowledge of the surface, and Toast fires from anywhere, so the prop would be unenforceable; (b) changing the portal target to the .wf-public element — breaks the reference-counted scroll lock (overlay.js:81-94), the stacking registry (overlay.js:36-57) and z-index containment as soon as any transformed/positioned ancestor exists.
Cleanup contract: the class MUST be removed on unmount or an SPA navigation from /book back into the app leaves the whole dashboard stuck light.

### `src/app/booking/manage/[token]/page.js:31` — PROOF the trap is already live — a public page calls confirm() today and gets the dark app dialog

`    const ok = await confirm({ title: 'Cancel this booking?', message: 'Your reserved time slot will be released.', tone: 'danger', confirmLabel: 'Cancel booking', cancelLabel: 'Keep booking', requireTyped: 'CANCEL' });`
Wired via line 6 `import { useConfirm } from '@/lib/confirm';` and line 14 `const confirm = useConfirm();`. This is the ONLY Core-primitive consumer on any of the eight public routes today. A studio's client on a white #f6f7f9→#eceef2 page (line 42) clicks 'Cancel booking' and gets a 60%-black scrim plus a #1a1d27 card with #e2e8f0 text and a requireTyped input that the legacy !important paints #222536. Not hypothetical — shipped.

> **Migration:** Use this as the Batch F acceptance test, before and after. Before: screenshot the dark dialog. After .wf-public lands on documentElement: the same dialog must render on --surface #ffffff / --text #0f172a with the light rgba(15,23,42,0.4) scrim, and the requireTyped input must be light. Also verify the danger tone still reads: --danger-fg is #f87171 dark vs #dc2626 light (globals.css:88 / :99).

### `src/app/layout.js:41` — Root cause of the whole light-scope problem — the app theme defaults to DARK for visitors who have no preference

`            var t = localStorage.getItem('theme') || 'dark';\n            document.documentElement.classList.toggle('light', t === 'light');`
A studio's CLIENT arriving at /book/<slug> or /g/<token> has no localStorage.theme, so `|| 'dark'` fires and the page inherits the full dark app palette. This is why every token-driven thing on a public page renders dark today, and it is exactly why .wf-public cannot be built as 'html.light plus a bit' — it must be an ABSOLUTE light scope that is correct whether the viewer's app theme is dark, light, or absent.
Same file, line 62: `<Providers>{children}</Providers>` wraps every route — so ConfirmProvider + ToastViewport are unconditionally mounted on public pages (item 29).

> **Migration:** Do NOT solve this by forcing localStorage.theme on public routes — that would silently flip the app theme for owners who preview their own public links. .wf-public must win purely by cascade. Consider adding the class in the same pre-hydration inline script when location.pathname matches the public prefixes (/g/, /d/, /shop/, /pay/, /client/, /book/, /booking/, /folio/) to eliminate the first-paint flash entirely — that is the only zero-FOUC option and it costs ~3 lines here.

### `src/components/PublicBrandHeader.js:1` — Both Batch F components are absent, and the backend confirms D6: there is no brand data to consume yet

components/PublicBrandHeader.js and components/PublicFooter.js DO NOT EXIST (components/ contains only AICommandCenter, AddLeadModal, AppSwitcher, ContractsStudioShell, FloatingChat, HuddleModal, ImpersonationBanner, NavBar, PlanLock, RoomPanel, ScheduleMeetingModal, SidePanel, StudioCopilot, StudioShell, TagPicker, UsageWarnings, control/, ui/). The string 'wf-public' appears nowhere in src.
Backend brand payload is a bare display NAME and nothing else — backend/booking.js:56 `const brandName = (ws) => { … SELECT company_name FROM company_settings … || 'WappFlow'; }` returned at booking.js:130 and :180; backend/print-store.js:40 `brandSym` → :92 `res.json({ brand: name, currency_symbol: sym, … })`; backend/server.js:5804 `brand: (cs && cs.company_name) || 'WappFlow',`. No logo_url, no accent/brand colour column anywhere (grep for brand_color|accent_color|primary_color across backend returns nothing).
Footer today is three divergent one-liners: app/client:101 and app/book:101 and app/booking/manage:79 all `Powered by {data.brand}` in #a8aeb8; app/g:269 `Delivered with WappFlow Media Studio` in #52525b; app/folio/portfolio-view.js:84 `Made with WappFlow Studio`; app/shop and app/pay have NO footer at all.

> **Migration:** Build both as pure presentation with graceful fallback, exactly as D6 requires: PublicBrandHeader({ brand, title, subtitle, eyebrow }) renders the token-driven mark from brand[0] (never a literal 'W' — see item 7) and PublicFooter({ brand }) unifies the three 'Powered by' variants and adds one to shop + pay. Accept an OPTIONAL brandColor/logoUrl prop that is unused today and falls back to var(--accent) — that is the seam the deferred backend proposal fills, and adding it now costs nothing. Do not add backend columns in this batch.

