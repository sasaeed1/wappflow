# PROP-002 Batch E — Exact Migration Inventory

*Generated 2026-07-27 by a 4-lens exhaustive sweep (4 agents, 150 tool calls) over `main` (2754369).
PROP-002 §11 estimated "35 inline spinner divs, 14 keyframes, ~30 empties". Actual:
**102 spinner/keyframe sites, 139 empty states, 126 swallowed-error sites, 94 loading states** — 461 total.
Batch E migrates ONLY the approved adopters (clients, leads-list, invoices) plus the repo-wide
keyframe dedupe; everything else below is the recorded on-touch backlog.*

## Headline findings

- **17 exact-duplicate `@keyframes spin`** (not 14), plus **14 aliased** spin keyframes
  (`fcSpin`, `sm-spin`, `hd-rot`, `auth-spin` ×2, `gspin`, `pfspin`, `csp` ×6, `ms-spin`).
  Only the exact-name duplicates are deleted here — the aliases are a separate concern.
  The survivor is `globals.css:285` plus the `.spin` helper at `:299`. **Do not rename `spin`** —
  31 inline call sites reference the literal name and would silently become no-ops.
- **The swallow is real and confirmed**: `clients:41`, `invoices:335`, and `contracts/vault:28` all
  turn a failed fetch into the *empty* state, so a backend outage reads as "no clients / no invoices"
  and invites the user to re-create records they already have.
- **`invoices` has no filtered-empty variant** — a user with 300 invoices who mistypes a search is
  told to "create invoices from any lead profile". Same class of defect as the swallow: the UI states
  something false with confidence.
- **`contracts/analytics/page.js:42` already does this correctly** (error → loading → content, three
  distinct states). The batch restores an existing in-house convention rather than importing one.
- **Three distinct skeleton shapes are required** — leads-list (9-column grid, 34px squircle avatar,
  ~58px rows), invoices (6-column grid, no avatar, ~62px two-line rows), vault (flex card, 40px
  *circle* avatar, ~72px, 12px gaps). No two share a container model, avatar treatment, or height.
- **`components/SidePanel.js` already defines local `Spinner()` and `Empty()`** — a future importer
  would silently shadow the primitives. Recorded now so the eventual migration deletes them in the
  same edit.
- **Spinner colour drift**: `#6366f1` (dashboard, leads, profile, invoices, accept-invite), `#ef4444`
  (trash), `#8b5cf6` (knowledge). The primitive standardises on `var(--accent)`.
- **Two surfaces hang on "Loading…" forever when their fetch fails** (`bookings:37`,
  `studio/store:31`) — a different failure mode from the swallow, same root cause.

## Lens 1 — Spinners & spin keyframes — 102 sites

Every `@keyframes spin` (exact and aliased) and every spinner render site.

### `app/globals.css:285` — @keyframes spin — THE SURVIVOR

`@keyframes spin { to { transform: rotate(360deg); } }`. This is the ONE canonical declaration and the only global-scope spin keyframe loaded on every authenticated page. All 17 exact-name duplicates below are byte-identical or trivially equivalent to it.

> **Migration:** KEEP. This is the single @keyframes spin that survives. Spinner.js must animate with `animation: spin <dur> linear infinite` and nothing else. Do not rename it — 31 inline call sites reference the literal name 'spin' and renaming turns them all into silent no-ops.

### `app/globals.css:299` — .spin helper class — canonical

`.spin { animation: spin 0.8s linear infinite; }`. Global utility. Currently consumed by components/ui/Button.js:57, components/RoomPanel.js:80, app/settings/page.js:148, app/studio/[id]/albums/[albumId]/page.js:131.

> **Migration:** KEEP as the shared animation utility Spinner.js applies. Note the 0.8s duration is the de-facto house rate for ring spinners (1s/1.5s is used only for RefreshCw icon spinners) — Spinner should standardize on one duration token.

### `app/accept-invite/page.js:55` — duplicate @keyframes spin (1 of 17)

`<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>` inside the loading branch. Renders a real global <style> tag, so it is redundant with globals.css:285.

> **Migration:** DELETE. Feeds only the spinner at line 53, which becomes <Spinner size="md" />.

### `app/accept-invite/page.js:185` — duplicate @keyframes spin (2 of 17)

Second identical `<style>{`@keyframes spin …`}</style>` in the SAME file — the form branch re-declares what line 55 already declared. Double duplication within one file.

> **Migration:** DELETE. Feeds the in-button spinner at line 175.

### `app/whatsapp/page.js:312` — duplicate @keyframes spin (3 of 17)

`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }` inside a styled-jsx/<style> block. Uses the from/to long form rather than globals' to-only form — functionally identical.

> **Migration:** DELETE. Feeds four RefreshCw icon spinners at lines 119, 167, 261, 275. NOTE: whatsapp is NOT an approved Batch E adopter — deleting this keyframe is safe (globals.css:285 covers it) but do not restyle the page.

### `app/leads-list/page.js:1330` — duplicate @keyframes spin (4 of 17) — APPROVED ADOPTER

`<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>` as the last child before </NavBar>. Feeds the three in-button spinners at lines 237, 265, 537.

> **Migration:** DELETE as part of the leads-list adoption. Verify no other leads-list descendant relies on it after the three button spinners become <Spinner size="sm" /> (grep confirms only 237/265/537 use it).

### `app/leads/[id]/page.js:1180` — duplicate @keyframes spin (5 of 17)

`<style>{`@keyframes spin …`}</style>` in the full-page loading branch, adjacent to the 44px spinner at line 1177.

> **Migration:** DELETE. leads/[id] is NOT an approved adopter for spinner replacement — but keyframe deletion is a pure dedupe and safe under globals.css:285.

### `app/leads/[id]/page.js:2794` — duplicate @keyframes spin (6 of 17)

Second identical declaration in the SAME file, inside a styled-jsx block (alongside a duplicate @keyframes pulse at 2795, which also duplicates globals.css:288).

> **Migration:** DELETE. Also note the co-located duplicate @keyframes pulse at line 2795 — out of Batch E scope, log for a later dedupe pass.

### `app/chat/page.js:1175` — duplicate @keyframes spin (7 of 17)

`@keyframes spin { to { transform: rotate(360deg); } }` inside a <style> block. Feeds one in-button spinner at line 1151.

> **Migration:** DELETE.

### `app/knowledge/page.js:263` — duplicate @keyframes spin (8 of 17)

Inside a <style> block that also re-declares @keyframes slideIn (262) and @keyframes pulse (264) — all three duplicate globals.css:285/287/288.

> **Migration:** DELETE the spin declaration only (Batch E scope). Flag slideIn/pulse duplicates for a follow-up.

### `app/invoices/page.js:508` — duplicate @keyframes spin (9 of 17) — APPROVED ADOPTER

`<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>` immediately before </NavBar>. Feeds exactly one spinner — the 36px table loader at line 468.

> **Migration:** DELETE as part of the invoices adoption. Only consumer is line 468, which becomes <Spinner size="md" /> (or a Skeleton row set, since this is a table loading state — see the Skeleton note on line 468).

### `components/AICommandCenter.js:373` — duplicate @keyframes spin (10 of 17)

`@keyframes spin { to { transform: rotate(360deg); } }` in a styled-jsx block alongside @keyframes slideUp (372).

> **Migration:** DELETE. Feeds the Loader icon at 179 and the 36px ring at 225.

### `app/dashboard/page.js:882` — duplicate @keyframes spin (11 of 17)

`<style>{`@keyframes spin …`}</style>` in the full-page loading branch next to the 44px spinner at 879.

> **Migration:** DELETE.

### `app/dashboard/page.js:1336` — duplicate @keyframes spin (12 of 17)

Second identical declaration in the SAME file, in the main styled-jsx block (with duplicate pulse 1337, slideUp 1338, fadeSlideIn 1339, notifPop 1340).

> **Migration:** DELETE the spin declaration. Dashboard has TWO spin keyframes (882 + 1336) — both go.

### `app/profile/page.js:120` — duplicate @keyframes spin (13 of 17)

`<style>{`@keyframes spin …`}</style>` in the loading branch, next to the 40px spinner at 117.

> **Migration:** DELETE.

### `app/profile/page.js:327` — duplicate @keyframes spin (14 of 17)

Second declaration in the SAME file, combined on one line with a duplicate @keyframes slideIn: `@keyframes spin { to { transform: rotate(360deg); } } @keyframes slideIn { … }`.

> **Migration:** DELETE the spin half of this line only — the slideIn half also duplicates globals.css:287 but is outside Batch E scope. Careful surgical edit: this is a single string literal containing two keyframes.

### `app/studio/[id]/albums/[albumId]/page.js:188` — duplicate @keyframes spin (15 of 17) + duplicate .spin class

`<style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>` — re-declares BOTH globals.css:285 (@keyframes spin) AND globals.css:299 (.spin), with a different duration (1s vs 0.8s). Its local .spin therefore silently overrides/conflicts with the global one for this page depending on stylesheet order.

> **Migration:** DELETE the whole block — highest-value duplicate because it shadows the canonical .spin with a different duration. The consumer is the Loader at line 131. Studio is NOT an approved adopter, so leave the Loader as-is but expect the animation speed to change from 1s to 0.8s once the local override is gone; call that out explicitly at review.

### `app/reports/page.js:614` — duplicate @keyframes spin (16 of 17)

`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }` (from/to long form) in a styled-jsx block. Feeds the RefreshCw at line 343.

> **Migration:** DELETE.

### `app/settings/page.js:2351` — duplicate @keyframes spin (17 of 17)

`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }` in a styled-jsx block (with a duplicate @keyframes slideIn at 2350). Serves EIGHT spinner sites in this file (148, 1952, 1985, 1992, 1999, 2024, 2602, 2609).

> **Migration:** DELETE. Highest fan-out of any duplicate — verify all 8 consumers still animate off globals.css:285 after removal.

### `app/login/page.js:566` — @keyframes auth-spin — spin-family ALIAS (1 of 2)

`@keyframes auth-spin { to { transform: rotate(360deg); } }` inside the login page's styled-jsx. Semantically identical to globals.css:285, renamed only because the auth pages render outside the app shell.

> **Migration:** DELETE and repoint .auth-spinner to the canonical `spin`. Caveat to verify first: login/signup render OUTSIDE NavBar — confirm globals.css is actually loaded on these routes (it is imported in app/layout.js, so it should be) before deleting, otherwise the auth spinner dies. This is the single riskiest keyframe deletion in the batch.

### `app/signup/page.js:623` — @keyframes auth-spin — spin-family ALIAS (2 of 2)

Byte-identical copy of login/page.js:566 in the signup page's styled-jsx.

> **Migration:** DELETE with the same globals.css-reachability check as login. login+signup are a copy-paste pair; migrate them together or not at all.

### `components/FloatingChat.js:340` — @keyframes fcSpin — spin-family ALIAS

`<style>{`@keyframes fcSpin { to { transform: rotate(360deg); } }`}</style>`. camelCase alias, one consumer (line 269).

> **Migration:** DELETE and repoint to canonical `spin`. FloatingChat is not an approved adopter — keyframe dedupe only.

### `components/ScheduleMeetingModal.js:307` — @keyframes sm-spin — spin-family ALIAS

`@keyframes sm-spin { to { transform: rotate(360deg); } }` in styled-jsx, paired with the `.sm-spin` class at line 306.

> **Migration:** DELETE both 306 and 307 together, or neither — the class and keyframe share a name and orphaning one breaks the modal's two Loader2 spinners (205, 233).

### `components/HuddleModal.js:217` — @keyframes hd-rot + .hd-spin class — spin-family ALIAS

`.hd-spin { animation: hd-rot 1s linear infinite; } @keyframes hd-rot { to { transform: rotate(360deg); } }` — class and keyframe on ONE line, and the keyframe name (hd-rot) differs from the class name (hd-spin), so a name-based grep for 'spin' keyframes misses it. Only found via the generic @keyframes sweep.

> **Migration:** DELETE the whole line and repoint HuddleModal.js:164 to the canonical .spin. Call this one out in the diff — the hd-rot/hd-spin name mismatch is exactly the kind of thing a future grep-based audit will miss.

### `app/studio/studio.css:352` — @keyframes ms-spin — spin-family ALIAS (studio design system)

`@keyframes ms-spin { to { transform: rotate(360deg); } }` in the Media Studio stylesheet, paired with `.ms-spin` at 353. Ten consumers across studio routes.

> **Migration:** DO NOT DELETE in Batch E. studio.css is a deliberately separate --ms-* design system with its own token namespace and 10 consumers; collapsing it into globals is a Media Studio decision, not a Batch E one. Record it as the ONE justified survivor besides globals.css:285, and note it for a future studio-tokens batch.

### `app/g/[token]/page.js:304` — @keyframes gspin + .gspin class — spin-family ALIAS (public route)

`.gspin{animation:gspin 1s linear infinite;color:#c2a878}@keyframes gspin{to{transform:rotate(360deg)}}` — embedded in the same <style> string as a Google Fonts @import and a .ghero font rule. Hard-coded brand hex #c2a878 for the spinner color.

> **Migration:** DEFER. Public gallery route with its own standalone visual identity (serif Fraunces, gold #c2a878) that deliberately does not inherit the app shell. Deleting the keyframe requires confirming globals.css loads here. Out of Batch E's approved adopter list — inventory only.

### `app/folio/[handle]/page.js:22` — @keyframes pfspin — spin-family ALIAS (public route)

`<style>{`@keyframes pfspin{to{transform:rotate(360deg)}}`}</style>` inline on the same line as its only consumer, a 26px ring using rgba(0,0,0,0.15)/#000.

> **Migration:** DEFER. Public portfolio route with a light-only, black-on-white identity; the app's --accent token would be wrong here. Inventory only.

### `app/client/[token]/page.js:32` — @keyframes csp — spin-family ALIAS (public token route, 1 of 6)

`<style>{`@keyframes csp{to{transform:rotate(360deg)}}`}</style>` inline in the loading branch. One of SIX byte-identical copies of the same csp keyframe across the six public token routes.

> **Migration:** DEFER as a group. All six csp pages (client, booking/manage, book, pay, shop, d) are copy-paste siblings sharing an identical 26px rgba(0,0,0,0.15)/#16161a spinner. They are unauthenticated public routes outside the app shell — a strong candidate for a single shared PublicShell in a LATER batch, not Batch E. Migrating one without the other five would fragment them further.

### `app/booking/manage/[token]/page.js:37` — @keyframes csp — spin-family ALIAS (public token route, 2 of 6)

Byte-identical copy of the csp keyframe, inline in the loading branch.

> **Migration:** DEFER with the csp group (see app/client/[token]/page.js:32).

### `app/book/[slug]/page.js:37` — @keyframes csp — spin-family ALIAS (public token route, 3 of 6)

Byte-identical copy of the csp keyframe, inline in the loading branch.

> **Migration:** DEFER with the csp group.

### `app/pay/[token]/page.js:16` — @keyframes csp — spin-family ALIAS (public token route, 4 of 6)

Byte-identical copy of the csp keyframe, inline in the loading branch.

> **Migration:** DEFER with the csp group.

### `app/shop/[token]/page.js:38` — @keyframes csp — spin-family ALIAS (public token route, 5 of 6)

Byte-identical copy of the csp keyframe, inline in the loading branch.

> **Migration:** DEFER with the csp group.

### `app/d/[token]/page.js:80` — @keyframes csp — spin-family ALIAS (public token route, 6 of 6)

Byte-identical copy of the csp keyframe, inline in the loading branch. This file also declares an unrelated @keyframes csUp at line 232.

> **Migration:** DEFER with the csp group. Do not touch csUp (232) — not spin-family.

### `app/studio/studio.css:353` — .ms-spin class definition

`.ms-spin { animation: ms-spin 1s linear infinite; }` — the studio-system spin utility, 1s (vs the app's 0.8s). Ten consumers.

> **Migration:** KEEP with studio.css:352. Out of Batch E scope.

### `components/ScheduleMeetingModal.js:306` — .sm-spin class definition

`.sm-spin { animation: sm-spin 1s linear infinite; }` — note the class name and the keyframe name are identical, which is legal CSS but confusing.

> **Migration:** DELETE together with the keyframe at 307.

### `app/login/page.js:559` — .auth-spinner class definition (1 of 2)

Lines 559-565: `width:14px; height:14px; border:2px solid rgba(255,255,255,0.35); border-top-color:#fff; border-radius:50%; animation: auth-spin 0.8s linear infinite;`. A CSS-defined 14px ring — the only spinner in the codebase expressed purely in CSS rather than inline style. Colors are hard-coded white, correct only on the gradient auth button.

> **Migration:** This is the exact geometry Spinner.js size="sm" should produce (14px, 2px ring). Use it as the reference spec. Replacing it means Spinner needs a way to inherit a light-on-dark color — see the tone/currentColor note under components/ui/Button.js:57.

### `app/signup/page.js:616` — .auth-spinner class definition (2 of 2)

Lines 616-622: byte-identical copy of login/page.js:559-565.

> **Migration:** Copy-paste twin of login. Migrate as a pair.

### `components/ui/Button.js:57` — IN-PRIMITIVE spinner — NOT a migration target

`{loading && <RefreshCw size={15} className="spin" aria-hidden="true" />}`. The Batch B Button primitive's own loading indicator: a lucide RefreshCw at 15px, colored by the button's `color` (var(--on-accent) / var(--text)) via currentColor, animated by globals.css:299. It is the ONLY spinner in the codebase with any accessibility treatment — aria-hidden="true" on the icon plus aria-busy on the <button> at line 38.

> **Migration:** DO NOT count as a migration target. But DO decide: should Button reuse the new Spinner? RECOMMENDATION — YES, swap line 57 to `<Spinner size="sm" aria-hidden />` with Spinner defaulting to currentColor. Rationale: (a) Button currently uses a RefreshCw ICON while every other in-button loader in the app is a BORDER RING — one primitive ends that split; (b) Spinner must expose an escape hatch to suppress its own role="status" when nested inside an aria-busy button, otherwise the migration ADDS a duplicate live-region announcement — design that prop (e.g. `decorative` / `aria-hidden`) BEFORE migrating any in-button site; (c) size="sm" must render 14-15px to keep every existing button's layout unchanged. Also note Button has no `success` variant, which already blocked the invoices Mark-as-Paid button in Batch B.

### `components/SidePanel.js:22` — local Spinner() component — the closest thing to an existing primitive

A file-local `function Spinner()` (declared line 20) rendering `<div style={{ width:26, height:26, border:'3px solid var(--border)', borderTopColor:'var(--accent)', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />`. 26px, FULLY TOKENIZED (var(--border) + var(--accent)) — the only spinner in the codebase with zero raw color values. No role="status", no aria-label. Rendered three times: lines 47, 97, 160 (reminders / tasks / notes panels) — a section-level, not full-page, loader.

> **Migration:** USE THIS AS THE DESIGN REFERENCE for Spinner.js: var(--border) track + var(--accent) head is exactly the token-driven default the primitive should ship. Also the strongest evidence the primitive is needed — someone already built it locally three call sites deep. SidePanel is not an approved adopter, but this component should be deleted in favor of the primitive as soon as it is.

### `components/FloatingChat.js:269` — inline ring spinner — panel loader

24px, `border: '3px solid var(--border)'` (token) + `borderTopColor: '#25d366'` (RAW HEX — WhatsApp brand green), animation 'fcSpin 0.8s'. No role="status", no aria-label. Panel-level loader inside the floating chat.

> **Migration:** Not an approved adopter. Inventory note: the #25d366 head is a deliberate brand color, so Spinner needs a color override prop (or a `tone` escape) or this site cannot migrate. Same requirement as Badge's color escape hatch from Batch B.

### `components/AICommandCenter.js:225` — inline ring spinner — panel loader

36px, `border: '3px solid #e5e7eb'` (RAW HEX, light-mode-only gray — will look wrong in dark mode) + `borderTopColor: '#6366f1'` (RAW HEX indigo). No role="status". Centered panel loader with `margin: '0 auto 12px'`.

> **Migration:** Not an approved adopter. Flag the #e5e7eb track as a live dark-mode defect (hard-coded light gray ring on a dark surface) — this is one of four sites with that exact bug (also profile:117, knowledge:370, and this one's sibling accept-invite:53 which uses #c7d2fe). The token-driven Spinner fixes all four for free when they are eventually migrated.

### `components/AICommandCenter.js:179` — lucide Loader icon spinner — in-button

`{loading ? <Loader size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Send size={15} />}`. 15px, color inherited (currentColor). No aria treatment. In-button send indicator.

> **Migration:** Not an approved adopter. Note it uses `Loader` (the spoke icon) where other files use `Loader2`/`RefreshCw` — three different lucide icons are in use as spinners across the codebase, which is precisely the inconsistency Spinner.js exists to end.

### `components/RoomPanel.js:80` — lucide Loader2 spinner — inline with label

`<Loader2 size={14} className="spin" /> Loading…` inside a flex row, color `var(--text-dim,#666)` (token WITH a raw fallback). Consumes the canonical globals.css:299 .spin. No role="status".

> **Migration:** Not an approved adopter. One of only four sites already using the canonical .spin class (with Button.js:57, settings:148, albums:131) — these are the cheapest future migrations.

### `components/HuddleModal.js:164` — lucide Loader2 spinner — modal connecting state

`{phase === 'connecting' && <div className="hd-state"><Loader2 className="hd-spin" size={26} /><div>Connecting…</div></div>}`. 26px, currentColor, driven by the hd-rot keyframe (HuddleModal.js:217). No role="status" — and this is a state that can persist for many seconds, so screen-reader users get silence.

> **Migration:** Not an approved adopter. Strong a11y argument for the batch: a multi-second connecting state that announces nothing. Repoint to canonical .spin when 217 is deleted.

### `components/ScheduleMeetingModal.js:205` — lucide Loader2 spinner — in-button (Scheduling…)

`<Loader2 size={15} className="sm-spin" /> Scheduling…`. 15px, currentColor, driven by sm-spin (306/307). No aria treatment.

> **Migration:** Not an approved adopter. Repoint to canonical .spin together with line 233 when 306/307 are deleted.

### `components/ScheduleMeetingModal.js:233` — lucide Loader2 spinner — in-button (Sending…)

`{loading ? <><Loader2 size={14} className="sm-spin" /> Sending…</> : <>Send to lead on WhatsApp</>}`. 14px, currentColor. Note 14px here vs 15px at line 205 — inconsistent sizing within a single file.

> **Migration:** Not an approved adopter. The 14/15px drift inside one file is good evidence for the sm/md/lg fixed scale.

### `components/StudioCopilot.js:128` — lucide Loader spinner — inline 'thinking…'

`<Loader size={13} className="ms-spin" /> thinking…`, color var(--ms-ink-3) (studio token). 13px — a fourth distinct small size (12/13/14/15px all in use across the codebase). No role="status".

> **Migration:** Studio system, out of Batch E scope. Inventory only.

### `app/trash/page.js:110` — inline ring spinner — section loader

34px, `border: '3px solid var(--border)'` (token) + `borderTopColor: '#ef4444'` (RAW HEX red, the trash accent), animation 'spin 0.8s'. No role="status". NOTE: trash/page.js has NO local @keyframes spin — it relies entirely on globals.css:285, proving the global declaration is reachable and the 17 duplicates are pure dead weight.

> **Migration:** Not an approved adopter. Cite this file in the proposal as the existence proof that deleting the 17 duplicates is safe.

### `app/invoices/page.js:468` — inline ring spinner — table loader — APPROVED ADOPTER

36px, `border: '3px solid var(--border)'` (token) + `borderTopColor: '#6366f1'` (RAW HEX indigo — should be var(--accent)), `margin: '0 auto 12px'`, animation 'spin 0.8s'. No role="status". Sits inside `padding: '60px 0'; textAlign:'center'` with the text 'Loading invoices...' at line 469. It renders BELOW an already-rendered table header row (line 460) — i.e. the header is visible while the body loads.

> **Migration:** PRIMARY BATCH E TARGET. Because the header row is already painted and the body is a fixed 6-column grid ('50px 1fr 130px 120px 110px 200px', line 460/480), this is the single best SkeletonRow case in the app — skeleton rows will match the real rows exactly. Recommend <SkeletonRow> x5 over <Spinner> here, and delete the 'Loading invoices...' copy with it. Also swap the raw #6366f1 for var(--accent). Paired empty state at lines 471-476 (FileText 40px + 'No invoices found' + 'Create invoices from any lead profile.') is the matching EmptyState adoption.

### `app/chat/page.js:1151` — inline ring spinner — in-button (Sending)

12px, `border: '2px solid rgba(255,255,255,0.4)'` + `borderTopColor: 'white'` (RAW, light-on-dark for a filled button). Smallest ring spinner in the codebase at 12px. No aria treatment.

> **Migration:** Not an approved adopter. 12px is below the proposed sm (14px) — confirm sm=14 is acceptable here before any future migration, or accept a 2px visual growth.

### `app/dashboard/page.js:280` — inline ring spinner — in-button (CSV import)

16px, `border: '2px solid rgba(255,255,255,0.4)'` + `borderTopColor: 'white'` (RAW). Inside the gradient Import button, text 'Importing {n}…'. No aria treatment.

> **Migration:** Not an approved adopter. Note 16px here vs 14px on most other in-button spinners — another size-drift data point.

### `app/dashboard/page.js:879` — inline ring spinner — FULL-PAGE loader

44px, `border: '3px solid var(--border)'` (token) + `borderTopColor: '#6366f1'` (RAW indigo), `margin: '0 auto'`. Largest spinner in the codebase (tied with leads/[id]:1177). No role="status" — a full-page load that announces nothing.

> **Migration:** Not an approved adopter. 44px sets the lg size on the scale: sm=14 (in-button), md=36 (section), lg=44 (full-page). Every size in the codebase clusters around those three, which validates the sm/md/lg API.

### `app/accept-invite/page.js:53` — inline ring spinner — FULL-PAGE loader

36px, `border: '3px solid #c7d2fe'` (RAW indigo-200 — light-mode-only) + `borderTopColor: '#6366f1'` (RAW), `margin: '0 auto 16px'`. No role="status".

> **Migration:** Not an approved adopter. Dark-mode defect: #c7d2fe track is a light-mode-only tint. One of the four hard-coded-track sites.

### `app/accept-invite/page.js:175` — inline ring spinner — in-button (Setting up account…)

14px, `border: '2px solid rgba(255,255,255,0.4)'` + `borderTopColor: 'white'` (RAW). The canonical in-button ring geometry, repeated verbatim at 9 other sites.

> **Migration:** Not an approved adopter. This exact 14px/2px/rgba(255,255,255,0.4)/white recipe appears at accept-invite:175, profile:320, leads-list:237/265/537, leads/[id]:2958, settings:2609 (13px variant), plus login/signup .auth-spinner — TEN near-identical copies. That is the single strongest duplication argument in the batch: Spinner size="sm" with an on-accent tone collapses ten hand-written rings into one.

### `app/settings/page.js:148` — lucide RefreshCw spinner — in-button (avatar upload)

`{uploading ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}`. 14px, currentColor, uses the canonical globals.css:299 .spin. No aria treatment.

> **Migration:** Not an approved adopter. Already on the canonical class — cheap future migration.

### `app/settings/page.js:1952` — lucide RefreshCw spinner — status indicator

`<RefreshCw size={18} color="#f59e0b" style={{ animation: 'spin 1.5s linear infinite' }} />` in a Wifi/WifiOff/spinning tri-state. 18px, RAW hex amber, 1.5s duration (slower than the 0.8s house rate). No role="status".

> **Migration:** Not an approved adopter. Semantically a STATUS indicator, not a loading spinner — arguably should stay an icon and not become a Spinner at all. Note the 1.5s duration: Spinner should NOT expose a duration prop, so sites like this either accept 0.8s or stay as-is.

### `app/settings/page.js:1985` — lucide RefreshCw spinner — conditional in-button (1 of 3)

`<RefreshCw size={13} style={reconnecting ? { animation: 'spin 1s linear infinite' } : {}} />` — the SAME icon is both a static button glyph and a spinner depending on state. 13px, currentColor, 1s.

> **Migration:** Not an approved adopter. IMPORTANT PATTERN: the conditional-animation idiom (same icon, animated only when busy) cannot be expressed by a separate <Spinner> component without changing the markup shape. Three instances here (1985/1992/1999) plus whatsapp:261 = four sites where Spinner is the WRONG tool. Document this as an explicit non-goal so a later agent does not force-migrate them.

### `app/settings/page.js:1992` — lucide RefreshCw spinner — conditional in-button (2 of 3)

Identical to 1985: `<RefreshCw size={13} style={reconnecting ? { animation: 'spin 1s linear infinite' } : {}} />`.

> **Migration:** Not an approved adopter. Same conditional-animation non-goal as 1985.

### `app/settings/page.js:1999` — lucide RefreshCw spinner — conditional in-button (3 of 3)

Identical to 1985 and 1992: `<RefreshCw size={13} style={reconnecting ? { animation: 'spin 1s linear infinite' } : {}} />`. Three byte-identical copies within 15 lines.

> **Migration:** Not an approved adopter. Same conditional-animation non-goal as 1985.

### `app/settings/page.js:2024` — lucide RefreshCw spinner — large status/connecting

`<RefreshCw size={28} color="#25d366" style={{ animation: 'spin 1.5s linear infinite' }} />`. 28px, RAW WhatsApp green, 1.5s.

> **Migration:** Not an approved adopter. Another brand-colored spinner (cf. FloatingChat:269) reinforcing the need for a color escape hatch.

### `app/settings/page.js:2602` — inline ring spinner — in-button (Send Test Email)

13px, `border: '2px solid rgba(5,150,105,0.3)'` + `borderTopColor: '#059669'` (RAW emerald — a green-on-white button, the only in-button ring NOT using white). No aria treatment.

> **Migration:** Not an approved adopter. Proves the in-button spinner cannot hard-code white: Spinner must default to currentColor so it inherits whatever the button's text color is. Design that in before migrating any in-button site.

### `app/settings/page.js:2609` — inline ring spinner — in-button (Save Settings)

13px, `border: '2px solid rgba(255,255,255,0.4)'` + `borderTopColor: 'white'` (RAW). 13px here vs 14px at the other nine copies of this recipe.

> **Migration:** Not an approved adopter. Part of the ten-copy in-button ring cluster.

### `app/profile/page.js:117` — inline ring spinner — FULL-PAGE loader

40px, `border: '3px solid #e5e7eb'` (RAW light gray — dark-mode defect) + `borderTopColor: '#6366f1'` (RAW), `margin: '0 auto 12px'`. No role="status".

> **Migration:** Not an approved adopter. Fourth hard-coded-light-track site. 40px is a fifth distinct large size (34/36/40/44 all in use).

### `app/profile/page.js:192` — inline ring spinner — in-button (avatar)

12px, `border: '2px solid rgba(255,255,255,0.4)'` + `borderTopColor: 'white'` (RAW).

> **Migration:** Not an approved adopter.

### `app/profile/page.js:320` — inline ring spinner — in-button (Saving…)

14px, `border: '2px solid rgba(255,255,255,0.4)'` + `borderTopColor: 'white'` (RAW). The canonical in-button recipe.

> **Migration:** Not an approved adopter. Part of the ten-copy cluster.

### `app/leads-list/page.js:237` — inline ring spinner — in-button (Assigning…) — APPROVED ADOPTER

14px, `border: '2px solid rgba(255,255,255,0.4)'` + `borderTopColor: 'white'` (RAW), inside the bulk-assign CTA: `{loading ? <><div …/> Assigning…</> : <><UserCheck size={15}/> Assign N Leads</>}`. No aria treatment.

> **Migration:** BATCH E TARGET. Cleanest path: this button should become a <Button loading={loading}> from Batch B, which already renders its own spinner and sets aria-busy — i.e. the fix is to adopt Button, not to hand-place a Spinner. Confirm that reading with the owner before writing code; if Button is used, this site needs NO Spinner at all and the migration is strictly smaller.

### `app/leads-list/page.js:265` — inline ring spinner — in-button (Moving…) — APPROVED ADOPTER

14px, same rgba(255,255,255,0.4)/white recipe, inside the Move-to-Trash CTA: `{loading ? <><div …/> Moving…</> : <><Trash2 size={14}/> Move to Trash</>}`. No aria treatment.

> **Migration:** BATCH E TARGET. Same Button-loading recommendation as line 237 — and this one maps to <Button variant="danger" loading> exactly.

### `app/leads-list/page.js:537` — inline ring spinner — in-button (Creating group…) — APPROVED ADOPTER

14px, same rgba(255,255,255,0.4)/white recipe, inside the Create-Group CTA. No aria treatment.

> **Migration:** BATCH E TARGET. Same Button-loading recommendation. These three (237/265/537) are the ONLY spinners in leads-list — there is no full-page or table loader here, so leads-list's Skeleton adoption (if any) must be built fresh rather than replacing an existing spinner. Verify what leads-list currently shows while the list loads before promising a SkeletonRow swap.

### `app/leads/[id]/page.js:71` — inline ring spinner — inline saving indicator

14px, `border: '2px solid var(--border)'` (token) + `borderTopColor: color` (DYNAMIC — a prop-driven color, not a constant). `flexShrink: 0`, animation 'spin 0.7s' — a SIXTH distinct duration (0.7s vs 0.8/0.9/1/1.5s).

> **Migration:** Not an approved adopter. Dynamic-color site: a hard requirement for the Spinner color escape hatch. Also the 0.7s outlier confirms durations are accidental, not designed.

### `app/leads/[id]/page.js:1177` — inline ring spinner — FULL-PAGE loader

44px, `border: '3px solid var(--border)'` (token) + `borderTopColor: '#6366f1'` (RAW), `margin: '0 auto'`. Tied for largest with dashboard:879. No role="status".

> **Migration:** Not an approved adopter. Confirms lg=44.

### `app/leads/[id]/page.js:2308` — inline ring spinner — section loader

36px, `border: '3px solid var(--border)'` (token) + `borderTopColor: '#10b981'` (RAW emerald), `margin: '0 auto 12px'`.

> **Migration:** Not an approved adopter. Another brand/semantic-colored head.

### `app/leads/[id]/page.js:2489` — inline ring spinner — in-card (AI action cards)

24px, `border: `2px solid ${card.color}44`` (TEMPLATE-LITERAL color with an appended 44 alpha suffix) + `borderTopColor: card.color` (DYNAMIC), `margin: '0 auto'`. The most dynamic spinner in the codebase — both track and head derive from per-card data.

> **Migration:** Not an approved adopter. The `${color}44` alpha-suffix trick only works on 6-digit hex and would break on a var() token — so this site CANNOT migrate to a token-driven Spinner without also changing the card color model. Explicitly out of scope; note it so nobody attempts it.

### `app/leads/[id]/page.js:2958` — inline ring spinner — in-button (Send Email)

14px, `border: '2px solid rgba(255,255,255,0.4)'` + `borderTopColor: 'white'` (RAW). Canonical in-button recipe.

> **Migration:** Not an approved adopter. Part of the ten-copy cluster.

### `app/knowledge/page.js:288` — lucide RefreshCw spinner — in-button (learning)

`{learning ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <MessageSquare size={14} />}`. 14px, currentColor, 1s. No aria treatment.

> **Migration:** Not an approved adopter.

### `app/knowledge/page.js:299` — lucide RefreshCw spinner — in-button (uploading)

`{uploading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}`. Identical shape to 288.

> **Migration:** Not an approved adopter.

### `app/knowledge/page.js:346` — lucide RefreshCw spinner — in-button (crawling)

`{crawling ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Globe size={14} />}`. Third identical copy in one file.

> **Migration:** Not an approved adopter. Three identical icon-swap loaders in one file — a good future Button loading= case.

### `app/knowledge/page.js:370` — inline ring spinner — section loader

36px, `border: '3px solid #e5e7eb'` (RAW light gray — dark-mode defect) + `borderTopColor: '#8b5cf6'` (RAW violet), `margin: '0 auto 12px'`.

> **Migration:** Not an approved adopter. Third of the four hard-coded #e5e7eb track sites (with AICommandCenter:225 and profile:117).

### `app/whatsapp/page.js:119` — lucide RefreshCw spinner — status tri-state

`<RefreshCw size={24} color={meta.color} style={{ animation: 'spin 1.5s linear infinite' }} />` in a Wifi/WifiOff/spinning tri-state (lines 114-120). 24px, DYNAMIC color from meta, 1.5s.

> **Migration:** Not an approved adopter. Status indicator rather than a loader — same non-goal as settings:1952.

### `app/whatsapp/page.js:167` — lucide RefreshCw spinner — QR generating placeholder

`<RefreshCw size={40} color="var(--accent)" style={{ animation: 'spin 1.5s linear infinite', marginBottom: 12 }} />` inside a 260x260 placeholder box with 'Generating QR code…'. 40px, TOKEN color, 1.5s.

> **Migration:** Not an approved adopter. One of the very few spinners already using var(--accent) — good precedent for the Spinner default.

### `app/whatsapp/page.js:261` — lucide RefreshCw spinner — conditional in-button

`<RefreshCw size={16} style={reconnecting ? { animation: 'spin 1s linear infinite' } : {}} />`. Same conditional-animation idiom as settings:1985/1992/1999.

> **Migration:** Not an approved adopter. Fourth instance of the conditional-animation non-goal.

### `app/whatsapp/page.js:275` — lucide RefreshCw spinner — initializing state

`<RefreshCw size={40} color="var(--text-muted)" style={{ animation: 'spin 1.5s linear infinite' }} />` centered in a 72px circular var(--surface2) chip, above an 'Initializing…' heading (277-279). 40px, TOKEN color, 1.5s.

> **Migration:** Not an approved adopter. Structurally this is already an EmptyState-shaped composition (icon chip + heading + sub-copy) — useful as a reference for EmptyState's layout even though the page is out of scope.

### `app/reports/page.js:343` — lucide RefreshCw spinner — section loader

`<RefreshCw size={32} color="var(--text-dim)" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />`. 32px, TOKEN color, 1s.

> **Migration:** Not an approved adopter.

### `app/login/page.js:212` — CSS-class span spinner — in-button (Signing in…)

`<><span className="auth-spinner" /> Signing in…</>`. Renders the 14px CSS ring defined at login/page.js:559. The only spinner expressed as a bare <span> + class rather than inline style. No aria treatment.

> **Migration:** Not an approved adopter. Its markup shape (empty element + class) is the closest existing analog to how <Spinner /> will be used, which makes it the easiest future migration — but see the globals.css-reachability caveat on the auth-spin keyframe (line 566).

### `app/signup/page.js:238` — CSS-class span spinner — in-button (Creating account…)

`<><span className="auth-spinner" /> Creating account…</>`. Twin of login/page.js:212.

> **Migration:** Not an approved adopter. Migrate as a pair with login.

### `app/g/[token]/page.js:137` — lucide Loader spinner — FULL-PAGE (public gallery)

`if (loading) return <Centered><Loader size={26} className="gspin" /></Centered>;`. 26px, color #c2a878 (RAW brand gold, set on the .gspin class at line 304). No role="status".

> **Migration:** DEFER — public route with its own visual identity. Inventory only.

### `app/folio/[handle]/page.js:22` — inline ring spinner — FULL-PAGE (public portfolio)

26px, `border: '2px solid rgba(0,0,0,0.15)'` + `borderTopColor: '#000'` (RAW, light-only black-on-white). Keyframe declared inline on the same line. No role="status".

> **Migration:** DEFER — public route, deliberately light-only. Inventory only.

### `app/client/[token]/page.js:32` — inline ring spinner — FULL-PAGE (public token route, 1 of 6)

`<div style={spinner} />` where `spinner` is the module const at line 108: 26px, `border: '2px solid rgba(0,0,0,0.15)'` + `borderTopColor: '#16161a'` (RAW), animation 'csp .9s' (0.9s — yet another duration). No role="status".

> **Migration:** DEFER as a group. Six byte-identical siblings — a shared PublicShell candidate for a later batch, not Batch E.

### `app/booking/manage/[token]/page.js:37` — inline ring spinner — FULL-PAGE (public token route, 2 of 6)

`<div style={sp} />`, const at line 85. Byte-identical to client/[token]: 26px, rgba(0,0,0,0.15)/#16161a, csp .9s. No role="status".

> **Migration:** DEFER with the csp group.

### `app/book/[slug]/page.js:37` — inline ring spinner — FULL-PAGE (public token route, 3 of 6)

`<div style={spinner} />`, const at line 116. Byte-identical to the other five.

> **Migration:** DEFER with the csp group.

### `app/pay/[token]/page.js:16` — inline ring spinner — FULL-PAGE (public token route, 4 of 6)

`<div style={sp} />`, const at line 48. Byte-identical to the other five.

> **Migration:** DEFER with the csp group. Payment route — treat any change here as higher-risk than the other five.

### `app/shop/[token]/page.js:38` — inline ring spinner — FULL-PAGE (public token route, 5 of 6)

`<div style={spinner} />`, const at line 119. Byte-identical to the other five.

> **Migration:** DEFER with the csp group.

### `app/d/[token]/page.js:80` — inline ring spinner — FULL-PAGE (public token route, 6 of 6)

`<div style={spinner} />`, const at line 238. Byte-identical to the other five.

> **Migration:** DEFER with the csp group.

### `app/studio/[id]/page.js:366` — lucide Loader spinner — in-button (Upload media)

`{uploading ? <Loader size={16} className="ms-spin" /> : <Upload size={16} />}`. 16px, currentColor, studio ms-spin.

> **Migration:** Studio system — out of Batch E scope. Inventory only.

### `app/studio/[id]/cull/page.js:746` — lucide Loader spinner — inline (Rendering…)

`<Loader size={16} className="ms-spin" /> Rendering…`. 16px, currentColor.

> **Migration:** Studio system — out of scope. Inventory only.

### `app/studio/[id]/video/page.js:78` — lucide Loader spinner — in-button (Auto-reel)

`{building ? <Loader size={15} className="ms-spin" /> : <Wand2 size={15} />}`. 15px, currentColor.

> **Migration:** Studio system — out of scope. Inventory only.

### `app/studio/[id]/video/page.js:125` — lucide Loader spinner — per-row refresh

`{refreshing === t.id ? <Loader size={12} className="ms-spin" /> : <RefreshCw size={12} />}`. 12px, currentColor.

> **Migration:** Studio system — out of scope. Inventory only.

### `app/studio/[id]/video/page.js:204` — lucide Loader spinner — per-row generate

`{generating === s.id ? <Loader size={16} className="ms-spin" color="var(--ms-accent)" /> : <Wand2 size={16} color="var(--ms-ink-3)" />}`. 16px, studio token color.

> **Migration:** Studio system — out of scope. Inventory only.

### `app/studio/[id]/video/page.js:299` — lucide Loader spinner — overlay scrim

`<span style={{ position:'absolute', inset:0, …, background:'rgba(0,0,0,0.55)' }}><Loader size={22} className="ms-spin" color="#fff" /></span>`. 22px, RAW white on a dark scrim. The only full-cover overlay spinner in the codebase.

> **Migration:** Studio system — out of scope. Inventory note: an overlay/scrim variant is a shape Spinner.js does NOT need to cover in Batch E.

### `app/studio/[id]/video/[timelineId]/page.js:563` — lucide Loader spinner — in-button (Upload a track)

`{busy ? <Loader size={15} className="ms-spin" /> : <Upload size={15} />}`. 15px, currentColor.

> **Migration:** Studio system — out of scope. Inventory only.

### `app/studio/[id]/video/[timelineId]/page.js:947` — lucide Loader spinner — section loader

`<Loader size={26} className="ms-spin" color="var(--ms-accent)" />`. 26px, studio accent token.

> **Migration:** Studio system — out of scope. Inventory only.

### `app/studio/portfolio/page.js:118` — lucide Loader spinner — inline (Saving…)

`<span …><Loader size={12} className="ms-spin" /> Saving…</span>`, color var(--ms-ink-3). 12px.

> **Migration:** Studio system — out of scope. Inventory only.

### `app/studio/[id]/albums/[albumId]/page.js:131` — lucide Loader spinner — in-button (Export PDF / Building…)

`{pdf?.status === 'pending' ? <Loader size={15} className="spin" /> : <FileText size={15} />}`. 15px, currentColor. NOTE it uses `.spin` (the app class) not `.ms-spin`, and this file locally re-declares .spin at 1s (line 188) — so this studio button animates at a different rate than the rest of studio.

> **Migration:** Studio route but consuming the APP's .spin class — this is the site whose animation speed changes (1s to 0.8s) when the duplicate at line 188 is deleted. The only user-visible side effect of the whole keyframe-dedupe sweep. Call it out explicitly in the PR description.


## Lens 2 — Empty states — 139 sites

Every "nothing here" UI, with copy, CTA, and whether it distinguishes no-data from no-results.

### `app/clients/page.js:88` — Clients — no clients at all (APPROVED ADOPTER, gold standard)

Copy: h2 'No clients yet' + body 'Win a deal, then use Move to Clients on the lead to keep your pipeline clean without losing the relationship.' Icon: UserCheck 24px in a 52px accent-light rounded tile. CTA: <button onClick={router.push('/leads-list')}>Go to Leads <ArrowRight/></button> using local btnPrimary (line 156). Centred, dashed 1px var(--border) container, radius 16, padding clamp(50px,10vh,110px). Correctly loading-guarded by line 86 `loading ? 'Loading clients…'`.

> **Migration:** This is the reference shape for EmptyState (icon tile + title + body + CTA + dashed container). Migrate to <EmptyState icon={UserCheck} title='No clients yet' body='…' action={<Button variant='primary' …>Go to Leads</Button>} />; the btnPrimary literal at line 156 dies with it. Keep the dashed-border container as the EmptyState default surface.

### `app/clients/page.js:95` — Clients — filtered/search empty (correct distinction)

Copy: 'No clients match “{query}”.' Plain <p>, no icon, no CTA, NOT centred (padding '30px 0', left-aligned). Correctly distinct from the no-data-at-all branch at line 88 — this branch never says 'add your first'. Style is inconsistent with the sibling branch (bare paragraph vs full card).

> **Migration:** Migrate to <EmptyState variant='filtered' title={`No clients match “${query}”`} action={<Button variant='ghost' onClick={()=>setQuery('')}>Clear search</Button>} />. EmptyState needs a lighter `filtered` variant (no icon tile, smaller padding, optional clear-filter CTA) so the two branches read as one system.

### `app/clients/page.js:41` — Clients — bare catch{} swallow behind the empty state (APPROVED ErrorState target)

`try { const r = await leadsAPI.getAll({ client: 1 }); setClients(r.data.leads || []); } catch {}` — a failed fetch leaves clients=[] and the user sees the 'No clients yet' onboarding empty state at line 88 instead of an error. A network failure is indistinguishable from an empty workspace.

> **Migration:** This is the exact defect Batch E's ErrorState is scoped to fix. Add `const [error,setError]=useState(null)`, set it in catch, and render <ErrorState title='Couldn’t load your clients' body={…} action={<Button onClick={load}>Try again</Button>} /> ABOVE the length===0 branch so the empty state is only reached on a successful empty response.

### `app/leads-list/page.js:1142` — Leads list — table empty (APPROVED ADOPTER)

Copy: 'No leads found' (14px, weight 600, var(--text-dim)). Icon: Users 36px, color var(--border). CTA: conditional 'Clear all filters' text-button shown only when `(search || hasFilters)` — resets search/tag/assigned/date/status. Centred, padding 60, inside the table shell. Loading-guarded by line 1140 ('Loading leads...' text). PARTIAL distinction: the CTA is filter-aware, but the HEADLINE is identical for both cases — a workspace with zero leads also reads 'No leads found' and is never offered 'Add your first lead'.

> **Migration:** Split into two branches: `allLeads.length===0` → <EmptyState icon={Users} title='No leads yet' body='Leads arrive automatically from connected WhatsApp/Instagram/Facebook accounts.' action={<Button>Add a lead</Button>} /> vs `leads.length===0` (filtered) → <EmptyState variant='filtered' title='No leads match your filters' action={<Button variant='ghost'>Clear all filters</Button>} />. `allLeads` already exists in scope (used at line 1060). Replace the line-1141 loading text with <SkeletonRow count={6} /> matching the 9-column grid at line 1128.

### `app/leads-list/page.js:186` — Leads list — round-robin modal, no active members

Copy: 'No active members found'. Plain <p>, 13px, var(--text-dim), textAlign center, padding '16px 0'. No icon, no CTA (user is left with no route to invite a member).

> **Migration:** <EmptyState size='sm' title='No active members' body='Invite teammates in Team settings to distribute leads.' action={<Button variant='ghost' onClick={()=>router.push('/team')}>Open Team</Button>} />. Needs an `sm` size for in-modal use.

### `app/leads-list/page.js:391` — Leads list — WhatsApp group modal, no eligible leads (empty rendered as error)

Copy: 'None of the selected leads have a real WhatsApp phone number. Instagram/Facebook/website leads can\'t be added to WhatsApp groups directly.' Rendered as a red danger box (rgba(239,68,68,0.10) bg, red border, #dc2626 text). No icon, no CTA. This is an empty state wearing error styling — inconsistent with every other empty state in the app.

> **Migration:** Decide the boundary: this is 'no eligible items', not a failure. Migrate to <EmptyState tone='warning' …> once EmptyState gains a tone, or leave as-is and document it as out-of-scope. Do NOT map it to ErrorState — nothing failed.

### `app/leads-list/page.js:429` — Leads list — WhatsApp group modal, no connected accounts

Copy: 'No connected WhatsApp account is ready. Connect WhatsApp in Settings → Connections first.' Red danger box, no icon, CTA is prose-only (no link/button). Correctly loading-guarded by line 427 (`loadingAccounts ? 'Loading connected WhatsApp accounts…'`).

> **Migration:** <EmptyState tone='warning' title='No WhatsApp account connected' action={<Button variant='ghost' onClick={()=>router.push('/settings?tab=connections')}>Connect WhatsApp</Button>} />. Same tone question as the previous item.

### `app/leads-list/page.js:649` — Leads list — merge-duplicates, none found / all cleaned up

Copy is doneCount-dependent: title 'All cleaned up!' or 'No duplicates found'; sub 'Merged N groups.' or 'Your contacts look unique.' Icon: UserCheck 32px in #10b981. No CTA. Centred, padding 40. Correctly guarded by `groups === null` at line 647 ('Scanning for duplicates…').

> **Migration:** <EmptyState icon={UserCheck} tone='success' title={…} body={…} /> — EmptyState needs an icon-colour/tone escape so the green success read survives. Replace line 648 with <Spinner size='md' label='Scanning for duplicates…' />.

### `app/leads-list/page.js:1097` — Leads list — saved views, none saved (micro empty state)

Copy: 'Save a filter combination to reuse it.' Inline <span>, 12px, italic, var(--text-dim), sits in the Views row. No icon, no CTA (the adjacent 'Save current' button is always rendered).

> **Migration:** Below the size floor for EmptyState — leave as an inline hint. Note it in the batch report so nobody 'migrates' it into a 60px-tall card and breaks the toolbar row.

### `app/invoices/page.js:471` — Invoices — table empty, does NOT distinguish filtered from no-data (APPROVED ADOPTER)

Copy: 'No invoices found' (15px/700) + 'Create invoices from any lead profile.' (13px muted). Icon: FileText 40px, color var(--border). NO CTA button. Centred, padding '60px 0'. Loading-guarded by line 466 (36px spinner with local @keyframes spin). DEFECT: the condition is `filtered.length === 0` — `filtered` is search+status filtered (search box line 441, status tabs line 445), so filtering to 'overdue' with zero overdue invoices shows the identical first-run onboarding copy. Never distinguishes 'no invoices at all' from 'no results for this filter'.

> **Migration:** Split: `invoices.length===0` → <EmptyState icon={FileText} title='No invoices yet' body='Create invoices from any lead profile.' action={<Button onClick={()=>router.push('/leads-list')}>Go to Leads</Button>} /> vs `filtered.length===0` → <EmptyState variant='filtered' title='No invoices match this filter' action={<Button variant='ghost' onClick={()=>{setSearch('');setFilterStatus('all');}}>Clear filters</Button>} />. `invoices` is already in scope (line 421). Replace the line-467 loading block with <SkeletonRow count={6} /> matching the 6-column grid at line 460, and delete the local @keyframes spin at line 508.

### `app/invoices/page.js:55` — Invoices — generated invoice HTML, no line items

Copy: 'No line items' in a `<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">` inside the invoice PDF/print HTML template string (not React). Hard-coded hex #94a3b8, outside the token system.

> **Migration:** OUT OF SCOPE for Batch E — it is a string template rendered outside React (print/PDF), so no primitive can reach it. Record it so the design-system audit doesn't flag it later as an unmigrated empty state.

### `app/contracts/vault/page.js:45` — Contracts vault — filtered-empty wearing no-data copy (Skeleton target)

Copy: 'No clients yet — documents you create will be filed here.' Plain <p>, var(--text-muted), no icon, no CTA, not centred. Guarded from flash by `clients &&` (clients initialises to null, line 18; loading text at line 44). DEFECT: the condition is `filtered.length === 0` (line 31 filters by the search box `q`), so searching for a non-matching client name shows 'No clients yet' on a vault full of clients.

> **Migration:** Split on `clients.length===0` vs `filtered.length===0`. Batch E scope lists the vault for Skeleton only — replace line 44's 'Loading…' with <Skeleton> rows matching the accordion card at line 51 (40px avatar circle + two text lines). Fixing the filtered/no-data conflation is a copy change in the same file; do it in the same commit or explicitly defer it in the report.

### `app/contracts/page.js:100` — Contracts — no documents (best-in-class, non-adopter)

Copy: h2 'Your contract workspace' + 'Build beautiful, interactive proposals & contracts your clients actually enjoy signing — connected to every lead, project and pipeline.' Icon: FileSignature 26px in a 54px accent-light tile. CTA: 'Create your first document' (+ Plus icon) via local btnPrimary. Centred, dashed border, radius 16. Loading-guarded at line 99.

> **Migration:** Structurally identical to app/clients/page.js:88 — the two together define the EmptyState contract (icon tile size 52–54, title 20–21px/800, body max-width 380–420, one primary CTA). Not an approved adopter; use as design input only, migrate in a later batch.

### `app/contracts/page.js:121` — Contracts — filtered/search empty

Copy: 'No documents match.' Plain <p>, no icon, no CTA. Rendered INSIDE the results column after the `shown.map()`, so it appears at the bottom of an empty flex column rather than centred in the content area. Correct filtered-vs-no-data distinction (the no-data branch is line 100).

> **Migration:** <EmptyState variant='filtered' title='No documents match' action={<Button variant='ghost' onClick={()=>{setQuery('');setFilter('all');}}>Clear filters</Button>} />. Later batch.

### `app/contracts/page.js:130` — Contracts — recent activity aside, nothing yet

Copy: 'Nothing yet.' 12.5px var(--text-muted), no icon, no CTA, not centred. `ov` may be `{}` before the overview fetch resolves — no separate loading guard for the aside.

> **Migration:** Small-slot EmptyState (size='xs'). If Batch E adds Skeleton here later, it needs a 3-row timeline skeleton matching line 132.

### `app/contracts/page.js:302` — Contracts — bulk-send modal, no packs or templates

Copy: 'No packs or templates yet.' Inline <span>, 12.5px, no icon, no CTA. Not loading-guarded.

> **Migration:** Inline hint — below the EmptyState floor. Leave, but record.

### `app/contracts/settings/page.js:97` — Contracts settings — clause library empty, FLASHES before fetch

Copy: 'No clauses yet — add cancellation, usage rights, payment terms…' Plain <p>, no icon, no CTA. LOADING FLASH: `clauses` initialises to [] and is populated in a useEffect fetch with no loading flag, so every visit paints 'No clauses yet' before the response lands.

> **Migration:** Either initialise to `null` and gate (`clauses === null ? <Skeleton/> : …`) or add an explicit loading flag. Not in Batch E's approved adopter list — record as a confirmed defect for the follow-up batch.

### `app/contracts/analytics/page.js:70` — Contracts analytics — no document views

Copy: 'No views yet — send a document to start tracking.' Plain <p>, 13px muted, no icon, no CTA. Correctly guarded — page-level `!a && !err` loading at line 42.

> **Migration:** Small EmptyState. Note this page already has an `err` variable alongside the loading gate — a natural ErrorState adopter in a later batch.

### `app/contracts/[id]/page.js:101` — Contract editor — empty canvas

Copy: 'An empty canvas. Add your first block.' No icon. CTA: <AddBtn at={0} /> — the real add-block control, rendered inline. Centred, padding '40px 0'. Condition also requires `!settings.upload`.

> **Migration:** Good candidate for EmptyState with an arbitrary `action` node (not just a Button) — the primitive's action slot must accept any ReactNode, not only Button props.

### `app/contracts/[id]/page.js:192` — Contract editor — clause picker modal, no clauses

Copy: 'No clauses yet — add them in Contracts Studio → Settings → Clause library.' Plain <p>, no icon, prose-only CTA. Correctly guarded by `!clauses` (line 191 'Loading…').

> **Migration:** <EmptyState size='sm' … action={<Button variant='ghost' onClick={()=>router.push('/contracts/settings')}>Open clause library</Button>} />.

### `app/contracts/[id]/page.js:228` — Contract editor — version history, no snapshots

Copy: 'No snapshots yet — they’re created each time you send this document.' Plain <p>, no icon, no CTA. Correctly guarded by `!data` (line 227).

> **Migration:** size='sm' EmptyState; the 'Loading…' at line 227 becomes <Spinner size='sm' />.

### `app/contracts/[id]/page.js:338` — Contract editor — activity feed empty

Copy: 'No activity yet.' Plain <p>, 13px muted, margin 0, no icon, no CTA, not centred.

> **Migration:** size='xs' EmptyState.

### `app/contracts/[id]/page.js:573` — Contract send modal — no client linked

Copy: 'No client linked — you’ll still get a shareable link to send manually.' Amber notice box (color-mix #f59e0b 14%), no icon, no CTA. An 'empty relation' notice rather than a list empty state.

> **Migration:** Not an EmptyState — it is an inline notice. Leave; record so it isn't swept up.

### `app/dashboard/page.js:470` — Dashboard kanban — empty column

Copy: 'Drop here'. Icon: dashed 24px box with Plus 12px. No CTA. Centred, height 80, color var(--border). Suppressed while `snapshot.isDraggingOver`. Page is fully loading-gated at line 876 so no flash.

> **Migration:** Special-purpose drop affordance, NOT a generic empty state. Explicitly exclude from EmptyState migration — it must stay tightly sized to fit inside the column.

### `app/dashboard/page.js:559` — Dashboard notification panel — all caught up

Copy: 'All caught up!' (14/700) + 'No new leads or urgent reminders' (12px dim). Icon: CheckCircle 32px #10b981. No CTA. Centred, padding '40px 24px'. Derived from props, no async gate needed.

> **Migration:** Duplicate of components/NavBar.js:914 (same concept, different copy and sizes). Both should collapse onto one <EmptyState tone='success' icon={CheckCircle} title='All caught up!' …> once EmptyState lands.

### `app/dashboard/page.js:1119` — Dashboard recent activity — no leads

Copy: 'No leads yet'. Plain <p>, 13px dim, centred, padding '20px 0'. No icon, no CTA — inconsistent with every other 'no leads' state in the app (line 1259 has an icon, leads-list:1142 has an icon + clear-filters).

> **Migration:** size='sm' EmptyState. Flag the copy inconsistency: three different renderings of 'the workspace has no leads' across dashboard:1119, dashboard:1259 and leads-list:1142.

### `app/dashboard/page.js:1259` — Dashboard list view — no leads found

Copy: 'No leads found' (14/600). Icon: MessageSquare 36px at opacity 0.3. No CTA. Centred, padding 60. `leads` here is the filtered set — no distinction between an empty workspace and an active filter, and no clear-filter affordance.

> **Migration:** Same split as leads-list:1142. Reuse whatever copy Batch E settles on there so the two surfaces agree.

### `app/trash/page.js:112` — Leads trash — empty

Copy: 'Trash is empty' (17/800) + 'Deleted leads will show up here for 90 days.' Icon: Inbox 30px in a 64px var(--surface2) tile. No CTA (correct — nothing to do). Centred, padding '72px 24px', solid border card. Correctly loading-guarded at line 108 (spinner with local @keyframes spin).

> **Migration:** Clean EmptyState migration with no action prop — confirms `action` must be optional. Its line-110 spinner is one of the duplicate @keyframes spin sites.

### `app/team/page.js:619` — Team members — filtered-empty shows no-data copy + wrong CTA

Copy: 'No team members yet' (16/700 dim). Icon: Users 44px #d1d5db (hard-coded, not tokenised). CTA: 'Invite Member' gradient button, rendered only when `canManage`. Centred, padding 60, card container. Guarded from flash by the page-level `loading` gate at line 581. DEFECT: condition is `filtered.length === 0` where `filtered` is search-filtered (search input line 614) — typing a non-matching name on a 10-person team shows 'No team members yet' and offers Invite.

> **Migration:** Split on `members.length===0` vs `filtered.length===0`; the filtered branch gets 'No members match “{search}”' + a Clear-search ghost Button and NO Invite CTA. Also retires a hard-coded #d1d5db icon colour.

### `app/team/page.js:691` — Team activity logs — empty

Copy: 'No activity yet' (700 weight). Icon: Activity 40px at opacity 0.3. No CTA. Centred, padding 60. Guarded by the page loading gate at 581.

> **Migration:** Straight EmptyState. Note the icon is dimmed by opacity here but by colour elsewhere (#d1d5db at line 621, var(--border) at invoices:473) — the primitive must pick ONE icon treatment.

### `app/knowledge/page.js:378` — Knowledge — no documents

Copy: h3 'No documents yet' + 'Upload PDFs, Word docs, or text files. The AI will extract pricing, services, policies and more automatically.' Icon: BookOpen 32px #8b5cf6 in a 72px #f3e8ff tile (hard-coded hex). CTA: 'Upload First Document' gradient button triggering the file input. Centred, padding '60px 40px', card with hard-coded #e5e7eb border. Correctly guarded by the loading branch at line 373.

> **Migration:** EmptyState migration also retires hard-coded #f3e8ff/#8b5cf6/#e5e7eb. The icon tile is 72px here vs 52–54px on clients/contracts — the primitive must normalise this.

### `app/knowledge/page.js:427` — Knowledge — document with no extracted memories

Copy: 'No memories extracted from this document.' Plain <p>, 13px dim, no icon, no CTA. Correctly guarded — line 425 renders 'Loading...' while `docMemories[doc.id]` is undefined.

> **Migration:** size='xs' EmptyState; its 'Loading...' becomes <Spinner size='sm' />.

### `app/knowledge/page.js:513` — Knowledge — memories empty, filtered-empty shows no-data copy

Copy: h3 'No memories yet' + 'Upload a document or click "Learn from Chats" to start building your AI\'s knowledge.' Icon: 🧠 emoji at 48px (an emoji, not a lucide icon — inconsistent with every other empty state). No CTA button despite the copy naming two actions. Centred card. DEFECT: condition is `filteredMemories.length === 0`, so a search/type filter miss shows the first-run onboarding copy.

> **Migration:** Split filtered vs no-data. Decide the emoji-vs-icon question for EmptyState — there are 4 emoji-illustrated empty states (this, leads/[id]:2443 🏭, leads/[id]:2624 ✨, control/inbox:43 📭) against ~40 lucide-icon ones.

### `app/help/page.js:265` — Help centre — no search results (correct filtered-empty)

Copy: 'No results for "{search}"' (16/700) + 'Try different keywords or browse by category.' Icon: Search 40px var(--border). No CTA. Centred, padding '60px 0'. Condition is `search && filtered.length === 0` — correctly gated on search being non-empty, so it can never fire as a no-data state. Static content, no fetch, no flash risk.

> **Migration:** This is the model for EmptyState's `filtered` variant: search icon, quotes the query, suggests a next move, no 'add your first' CTA. Use its copy pattern for clients:95, contracts:121, studio:189, studio/help:230.

### `app/settings/page.js:348` — Settings — message presets empty, FLASHES before fetch

Copy: 'No presets yet' (700) + 'Create your first message template above.' Icon: MessageSquare 36px at opacity 0.3. No CTA (the form toggle lives above). Centred, padding 40. Condition `presets.length === 0 && !showForm`. LOADING FLASH: `presets` = useState([]) at line 282, fetched in useEffect at line 288 with no loading flag — the empty state paints on every mount before the response.

> **Migration:** Confirmed flash defect. Fix pattern for all five Settings tabs: initialise to `null`, render <Skeleton> while null. Not an approved Batch E adopter — record for the follow-up.

### `app/settings/page.js:425` — Settings — lost reasons empty, FLASHES before fetch

Copy: 'No lost reasons yet' (700) + 'Add reasons above — they’ll appear when you close a lead as lost.' Icon: AlertCircle 36px opacity 0.3. No CTA. Centred, padding 40. LOADING FLASH: `reasons` = useState([]) line 378, fetched in useEffect line 382, no loading flag.

> **Migration:** Same null-init + Skeleton fix as settings:348.

### `app/settings/page.js:528` — Settings — email templates empty, FLASHES before fetch

Copy: 'No email templates yet' (700) — title only, NO body copy and NO CTA, unlike its four sibling tabs. Icon: Mail 36px opacity 0.3. Centred, padding 40. LOADING FLASH: `templates` = useState([]) line 451, fetched line 457, no loading flag.

> **Migration:** Flash fix + add body copy so the five Settings empties are consistent.

### `app/settings/page.js:661` — Settings — auto-reply rules empty, FLASHES before fetch

Copy: 'No auto-reply rules yet' (700) — title only, no body, no CTA. Icon: Bot 36px opacity 0.3. Centred, padding 40. LOADING FLASH: `rules` = useState([]) line 562, fetched line 568, no loading flag. Also note this block renders AFTER the rules.map() rather than as an else-branch.

> **Migration:** Flash fix; restructure to a proper ternary so the empty state and the list are mutually exclusive branches.

### `app/settings/page.js:742` — Settings — tags empty, FLASHES before fetch

Copy: 'No tags yet. Create one above.' Plain <p>, 14px dim. NO icon (the only one of the five Settings tabs without one), no CTA, not centred. LOADING FLASH: `tags` = useState([]) line 674, fetched line 680, no loading flag.

> **Migration:** Flash fix + bring under EmptyState so it matches its four siblings.

### `app/settings/page.js:1242` — Settings — audit log empty

Copy: 'No activity recorded yet.' Plain <p>, 13px dim, no icon, no CTA, not centred. Correctly guarded by `loadingLogs` at line 1240.

> **Migration:** size='sm' EmptyState; its 'Loading…' becomes <Skeleton> rows matching the log row at line 1247.

### `app/settings/page.js:1828` — Settings connections — no platform accounts

Copy: 'No {activeDef.label} accounts yet' (14/700) + a platform-specific body describing the plan limit. Icon: activeDef.icon 26px in a 56px tinted tile. CTA: 'Add {label} Account' button that becomes 'Plan limit reached' + Lock when at limit. Centred, padding '28px 0'. Correctly loading-guarded at line 1826.

> **Migration:** EmptyState with a dynamic icon and a disabled-CTA case — confirms the action slot must accept a fully-configured Button (including disabled + swapped label/icon), not just {label,onClick}.

### `app/settings/storage/page.js:98` — Settings storage — no media

Copy: 'No media yet.' Plain <div>, 13px, `var(--text-dim,#666)` (fallback hex). No icon, no CTA, not centred.

> **Migration:** size='xs' EmptyState; also retires the `,#666` fallback.

### `app/reports/page.js:410` — Reports — lead sources chart, no data (near-invisible)

Copy: 'No source data yet'. Plain <p> inside a 160px-tall flex box, color `var(--border)` — the text is rendered in the BORDER colour, so it is barely legible in both themes. No icon, no CTA. Guarded by the page loading gate at line 341.

> **Migration:** Real legibility defect. EmptyState must render body copy at var(--text-muted) minimum; a chart-slot variant that fills a fixed height is needed here and at reports:580.

### `app/reports/page.js:580` — Reports — agent performance, no assigned team members

Copy: 'No team members assigned to leads yet' (700) + 'Add team members in Settings and assign them to leads.' Icon: Users 40px opacity 0.3. No CTA despite the copy naming the action. Centred, padding 60. Guarded by the page loading gate.

> **Migration:** <EmptyState … action={<Button variant='ghost' onClick={()=>router.push('/team')}>Open Team</Button>} />.

### `app/bookings/page.js:121` — Bookings — no upcoming bookings

Copy: 'No bookings yet — share your link to get started.' Plain <p>, 14px muted, no icon, no CTA (the share link lives elsewhere on the page). Not centred. Page is gated on `!settings` at line 37, and bookings load in the same effect, so no independent flash.

> **Migration:** size='sm' EmptyState with a 'Copy booking link' ghost Button. Later batch.

### `app/studio/page.js:137` — Media Studio — no shoots (full-bleed hero empty state)

Copy: eyebrow 'Media Studio' + h1 'Every shoot, delivered.' + 'Bring photographs in, cull with AI at your side, and deliver galleries your clients will remember.' + CTA 'Create your first shoot'. No icon — uses a full-bleed hero image (.ms-hero-fallback) with a veil. The WHOLE container is click-to-create (onClick on .ms-stage). Loading-guarded at line 135 ('Opening the studio…').

> **Migration:** OUT OF SCOPE for the generic EmptyState — this is a branded marketing-grade hero, not a card. Document it as a deliberate exception so nobody flattens it. Same call applies to studio/[id]/video/page.js:85.

### `app/studio/page.js:188` — Media Studio — no shoots match search (correct filtered-empty)

Copy: 'No shoots match “{query}”.' Rendered via `.ms-empty-soft` (studio.css:343 — dashed 1px var(--ms-line), radius, padding 60px 20px, centred, 13.5px var(--ms-ink-3)). No icon, no CTA. Correctly distinct from the no-data hero at line 137.

> **Migration:** .ms-empty-soft is the Media Studio module's OWN empty-state primitive, already used at 9 sites. Batch E must decide: keep it as the ms-scoped skin of EmptyState (recommended — it is token-consistent within .ms-root) or absorb it. Do not delete it while migrating the core app.

### `app/studio/[id]/page.js:393` — Shoot — no galleries

Copy: 'No galleries yet. Select photographs below, then create a gallery to deliver them.' `.ms-empty-soft`, marginBottom 44. No icon, no CTA (a 'New gallery' text-button sits in the section head at line 391).

> **Migration:** ms-scoped EmptyState. Later batch.

### `app/studio/[id]/page.js:487` — Shoot — no media (three-way copy, tab-aware)

Copy branches on state: `assets.length===0` → 'No media yet — upload photos or videos to begin.'; else mediaTab==='video' → 'No videos yet. Upload video and it lands here — same uploader.'; else → 'No photos yet — upload to begin.' `.ms-empty-soft`, no icon, no CTA. Distinguishes truly-empty from tab-filtered (good) but NOT from search/selection filters that also feed `shown`.

> **Migration:** The best existing example of state-aware empty copy in the codebase — use it as the argument for why EmptyState takes `title`/`body` as props rather than deriving them. Later batch.

### `app/studio/[id]/cull/page.js:451` — Cull — nothing to show (correct distinction, broken layout)

Copy: `assets.length===0 ? 'Upload photographs first.' : 'Nothing in this filter.'` — correct no-data vs filtered distinction. Plus a 'Back to shoot' ms-btn-ghost button rendered INLINE beside the text (marginLeft 14) inside a flex row, so the CTA sits to the right of the sentence rather than beneath it — visually inconsistent with every other empty state. Absolutely positioned, inset 0, over the dark cull canvas; text at rgba(255,255,255,0.5). No icon.

> **Migration:** Needs a dark-surface EmptyState variant (the cull canvas is a fixed dark UI, not theme-following). Fix the inline-CTA layout when migrating. Later batch.

### `app/studio/[id]/cull/page.js:648` — Cull — no AI analysis for this frame

Copy: 'No analysis yet (RAW, or still processing).' Plain <p>, 12.5px, rgba(255,255,255,0.5). No icon, no CTA. Conflates two very different states (unsupported format vs in-flight processing) into one line.

> **Migration:** Arguably wants a Spinner for the 'still processing' half. Record as a copy/state defect; out of Batch E scope.

### `app/studio/trash/page.js:68` — Studio trash — empty

Copy: 'Trash is empty. Deleted photos & videos will appear here for 30 days.' `.ms-empty-soft`, no icon, no CTA. Correctly guarded by `items === null` at line 67 ('Loading trash…').

> **Migration:** Compare with app/trash/page.js:112 — same concept, wildly different treatment (icon tile + two-line hierarchy vs a single dashed-box sentence). Note the divergence; unify only when both modules are in scope.

### `app/studio/portfolio/page.js:152` — Portfolio — nothing added yet

Copy: 'Nothing in your portfolio yet. Add from your published work, or upload showcase pieces directly.' `.ms-empty-soft`, no icon, no CTA inside (Upload / Add-from-published buttons sit in the header at lines 145–146). Page loading-gated at line 103.

> **Migration:** ms-scoped EmptyState. Later batch.

### `app/studio/portfolio/page.js:282` — Portfolio picker — nothing new to add

Copy: 'Nothing new to add. Publish a gallery first, then it shows up here.' `.ms-empty-soft` inside a modal. No icon, no CTA. Correctly guarded by `cands == null` at line 281 ('Loading your published work…').

> **Migration:** ms-scoped EmptyState, size='sm' for modal use.

### `app/studio/portfolio/page.js:348` — Portfolio — client filter, no matches

Copy: 'No matching clients.' Plain <p>, 13px var(--ms-ink-3), padding 6. No icon, no CTA. Correct filtered-empty.

> **Migration:** Inline hint; duplicate of app/studio/page.js:93 (identical copy, identical styling) — a Rule-of-Three candidate.

### `app/studio/page.js:93` — Media Studio — client picker filter, no matches

Copy: 'No matching clients.' Plain <p>, 13px var(--ms-ink-3), padding '4px 10px'. No icon, no CTA. Correct filtered-empty. Byte-identical concept to studio/portfolio/page.js:348.

> **Migration:** Second of three identical 'No matching clients.' sites — cite in the report as evidence for the shared primitive.

### `app/studio/settings/page.js:199` — Studio settings — no learned insights

Copy: 'No learned insights yet — they appear as you cull and deliver.' Inline <span>, 12.5px var(--ms-ink-3). No icon, no CTA, not centred.

> **Migration:** Inline hint, below the EmptyState floor.

### `app/studio/settings/page.js:235` — Studio settings — no style profiles

Copy: 'No styles yet — add your first signature look.' Plain <p>, 12.5px var(--ms-ink-3), margin 0. No icon, no CTA (the add control is elsewhere in the section). Rendered before the styles.map() rather than as an else-branch.

> **Migration:** size='xs' ms-scoped EmptyState.

### `app/studio/help/page.js:230` — Studio help — no article matches (correct filtered-empty)

Copy: 'No help articles match “{q}”. Try another term.' `.ms-empty-soft`. No icon, no CTA. Static content, no flash risk. Correctly filtered-only.

> **Migration:** Matches the app/help/page.js:265 pattern in intent but not in shape (no icon, no title/body split). Unify copy structure when both are in scope.

### `app/studio/store/page.js:45` — Print store — no products

Copy: 'No products yet — add your first.' Plain <p>, 14px var(--text-muted). No icon, no CTA. Page gated on `!products` at line 31 so no flash.

> **Migration:** size='sm' EmptyState with an 'Add product' Button.

### `app/studio/store/page.js:74` — Print store — no orders

Copy: 'No orders yet.' Plain <p>, 14px var(--text-muted). No icon, no CTA.

> **Migration:** size='xs' EmptyState.

### `app/studio/[id]/video/page.js:85` — Reels — no timelines (hero empty state)

Copy: h2 'Make your first reel' + 'Drop in photos and clips, set the beat, and export for Instagram, TikTok, or YouTube — without leaving Studio.' Icon: Film 32px white at 0.9 opacity. TWO CTAs: 'Let AI draft a reel' (primary, white-on-ink) and a second in the same row. Whole hero is click-to-create. Loading-guarded at line 66.

> **Migration:** Second full-bleed hero empty state (with studio/page.js:137). Also the only empty state with TWO CTAs — if EmptyState is ever extended here, `action` must accept a node, not a single button config. Out of Batch E scope.

### `app/studio/[id]/video/page.js:139` — Reels — no source assets (secondary hint)

Copy: 'Tip: upload photos & clips to this shoot first — they become the building blocks of your reel.' Rendered as `.ms-note` with a Sparkles 12px icon. Not a list empty state — an advisory that co-exists with content.

> **Migration:** Not an EmptyState. Record so it isn't miscategorised.

### `app/studio/[id]/video/[timelineId]/page.js:366` — Video editor — no assets in shoot

Copy: 'No photos or clips in this shoot yet.' Plain <p>, 12px var(--ms-ink-3), gridColumn '1/-1', padding 8. No icon, no CTA.

> **Migration:** Needs a grid-spanning EmptyState (gridColumn 1/-1) — the primitive must not assume a block container.

### `app/studio/[id]/video/[timelineId]/page.js:373` — Video editor — preview frame empty

Copy: 'Add media to begin'. Icon: Film 26px. Rendered via `.ms-ve-frame-empty` (studio.css:560 — absolute inset 0, flex column centred, rgba(255,255,255,0.4), 12.5px). No CTA.

> **Migration:** Dark absolute-fill variant. Same dark-surface need as the cull canvas.

### `app/studio/[id]/video/[timelineId]/page.js:453` — Video editor — empty timeline spine

Copy: 'Click media above to build your reel →'. `.ms-ve-tl-empty` (studio.css:582 — absolutely positioned top 28 left 8). No icon, no CTA, deliberately NOT centred (it must sit at the timeline origin).

> **Migration:** Positional micro-hint — explicitly exclude from EmptyState; centring it would break the timeline.

### `app/studio/[id]/video/[timelineId]/page.js:569` — Video editor — no audio tracks

Copy: 'No tracks yet. Upload one above — your licensed track from Epidemic, Artlist, Uppbeat, etc.' Plain <p>, 12.5px var(--ms-ink-3), padding 8. No icon, no CTA.

> **Migration:** size='xs' ms-scoped EmptyState.

### `app/studio/[id]/albums/page.js:73` — Albums — none yet

Copy: 'No albums yet — design one and export a print-ready PDF.' Icon: BookOpen 30px var(--text-muted) at opacity 0.5. No CTA (a 'New album' button sits in the header at line 70). Centred, padding '80px 20px', 2px DASHED border radius 18. Correctly loading-guarded at line 73 ('Loading…').

> **Migration:** Note the 2px dashed border here vs 1px dashed at clients:89 and contracts:101 — EmptyState must standardise the dashed container.

### `app/studio/[id]/albums/[albumId]/page.js:139` — Album designer — no pages

Copy: 'No pages yet — add one below.' Centred, padding '50px 20px', 2px dashed var(--border), radius 16, var(--text-muted). No icon, no CTA.

> **Migration:** size='sm' EmptyState. This file also carries its own `.spin` + @keyframes spin at line 188 — one of the duplicate declarations Batch E deletes.

### `app/studio/[id]/album/[albumId]/page.js:80` — Album spread — empty spread slot

Copy: 'Empty — click a photo below to add it here.' gridColumn '1 / -1', padding 18, centred, 12.5px var(--ms-ink-3). No icon, no CTA.

> **Migration:** Grid-spanning micro EmptyState; same gridColumn requirement as video/[timelineId]:366.

### `app/studio/[id]/reel/[reelId]/page.js:86` — Reel viewer — no clips

Copy: 'This reel has no clips. Generate a reel from the Studio AI panel first.' Plain <p>, 13px var(--ms-ink-3). No icon, no CTA, not centred.

> **Migration:** size='sm' ms-scoped EmptyState.

### `app/folio/portfolio-view.js:54` — Public portfolio — no work (PUBLIC-FACING, dual copy)

Copy branches on the `preview` prop: owner preview → 'Your selected work will appear here — add some from the left.'; public visitor → 'Coming soon.' Rendered via `.pf-empty` (portfolio.css:60 — centred, var(--pf-ink-2), 15px, padding '60px 0'). No icon, no CTA. Good instinct: never shows internal instructions to a public visitor.

> **Migration:** OUT OF SCOPE — the public portfolio runs its own pf-* token system, deliberately isolated from the app shell. Do not import the app EmptyState here. Record as a deliberate exception.

### `app/chat/page.js:868` — Team chat — no teammates for DM

Copy: 'No teammates yet.' Tiny <p>, 11px var(--text-muted), padding '4px 8px'. No icon, no CTA. Rendered after the members.map() rather than as an else-branch.

> **Migration:** Inline hint, below the EmptyState floor.

### `app/chat/page.js:958` — Team chat — message search, no matches

Copy: 'No matches.' Plain <div>, 13px var(--text-dim), padding '8px 4px'. No icon, no CTA. Correctly gated behind `msgQuery.trim().length >= 2`, so it can only mean 'no results for this query'.

> **Migration:** Correct filtered-empty semantics; identical copy to components/control/ControlShell.js:96 — a shared search-results empty.

### `app/chat/page.js:975` — Team chat — no pinned messages

Copy: 'No pinned messages yet.' Plain <div>, 13px var(--text-dim). No icon, no CTA, not centred.

> **Migration:** size='xs' EmptyState.

### `app/chat/page.js:994` — Team chat — new channel welcome

Copy: 'Welcome to #{activeChannel.name}' (16/800) + `activeChannel.description || 'This is the beginning of this channel. Start the conversation!'`. Icon: Hash 24px #6366f1 in a 60px rgba(99,102,241,0.12) tile. No CTA (the composer below IS the action). Centred, padding '60px 20px'. Correctly guarded by `loadingMessages` at line 992.

> **Migration:** Well-formed EmptyState with a data-driven body. Its line-993 loading text is a Skeleton candidate in a later batch.

### `app/leads/[id]/page.js:494` — Lead detail — email compose, no templates

Copy: 'No email templates yet. Create them in Settings.' Icon: Mail 32px #d1d5db (hard-coded). No CTA — prose points at Settings with no link. Centred, padding 24, var(--surface2) card.

> **Migration:** <EmptyState … action={<Button variant='ghost' onClick={()=>router.push('/settings')}>Open Settings</Button>} />. Retires a hard-coded #d1d5db.

### `app/leads/[id]/page.js:1607` — Lead detail — no additional channels

Copy: 'No additional channels linked'. Plain <p>, 12px var(--text-dim), centred, padding '8px 0'. No icon, no CTA. Condition `channels.length === 0 && !addingChannel`.

> **Migration:** size='xs' EmptyState.

### `app/leads/[id]/page.js:1754` — Lead detail — no messages

Copy: 'No messages yet' (14/600 var(--text-muted)). Icon: MessageSquare 24px #9ca3af in a 56px rgba(255,255,255,0.8) tile — the tile background is a hard-coded white wash that will not survive dark mode correctly. No CTA. Centred, fills the 480px message area.

> **Migration:** EmptyState migration also fixes a theme bug (rgba(255,255,255,0.8) tile). Duplicate concept with components/FloatingChat.js:271 ('No messages yet', different sizing).

### `app/leads/[id]/page.js:1908` — Lead detail — quick replies, no presets

Copy: 'No presets yet.' Plain <div>, 13px var(--text-dim), centred, padding 20. No icon, no CTA.

> **Migration:** size='xs' EmptyState inside a popover.

### `app/leads/[id]/page.js:2067` — Lead detail — no notes

Copy: 'No notes yet'. Icon: StickyNote 32px, container color var(--border) so the ICON inherits the border colour (near-invisible, same defect class as reports:410). No CTA. Centred, padding '32px 0'. Condition `notes.length === 0 && !addingNote`.

> **Migration:** EmptyState must set an explicit icon colour (var(--text-dim) or muted) rather than inheriting — fixes this and leads/[id]:2135, :2171, :2252.

### `app/leads/[id]/page.js:2107` — Lead detail — no reminders

Copy: 'No reminders set' (14px var(--text-dim)). Icon: Bell 32px #d1d5db (hard-coded). No CTA. Centred, padding '32px 0'.

> **Migration:** EmptyState; note the copy verb differs from all siblings ('set' vs 'yet') — normalise.

### `app/leads/[id]/page.js:2135` — Lead detail — no contact history

Copy: 'No history yet'. Icon: History 32px inheriting container color var(--border) — near-invisible. No CTA. Centred, padding '32px 0'.

> **Migration:** Same icon-colour fix as :2067.

### `app/leads/[id]/page.js:2171` — Lead detail — no invoices

Copy: 'No invoices yet'. Icon: Receipt 32px inheriting var(--border). No CTA inside (a 'Create Invoice' gradient button sits above at line 2166, outside the empty state).

> **Migration:** Move the Create Invoice action INTO the EmptyState action slot when the list is empty — the current layout shows a lone floating button above an empty panel.

### `app/leads/[id]/page.js:2211` — Lead detail — no emails

Copy: 'No emails yet' (14/600 var(--text-dim)) + 'Click "Compose Email" to send the first one.' at 12px color var(--border) — the SUB-COPY is rendered in the border colour and is effectively unreadable. Icon: Mail 32px #d1d5db. No CTA inside.

> **Migration:** Legibility defect in the body copy. EmptyState must enforce body = var(--text-muted). Same bug at :2252.

### `app/leads/[id]/page.js:2252` — Lead detail — no email workflows

Copy: 'No email workflows yet' + 'Create email templates in Settings first.' at 12px color var(--border) (unreadable). Icon: Mail 32px inheriting var(--border). No CTA.

> **Migration:** Same legibility fix as :2211.

### `app/leads/[id]/page.js:2443` — Lead detail — industry not detected

Copy: 'Industry not detected yet' (14/700) + 'Click "Detect Industry" to analyze this lead\'s conversation.' Icon: 🏭 emoji at 48px. CTA: '🏭 Detect Industry' gradient button INSIDE the empty state. Centred, padding '32px 0'. Correctly gated on `!verticalLoading`.

> **Migration:** Emoji-icon case (see knowledge:513). Well-formed otherwise — has an in-state CTA.

### `app/leads/[id]/page.js:2624` — Lead detail — AI panel idle

Copy: 'AI Assistant Ready' (14/700) + 'Click any button above to analyze this lead\'s conversation.' Icon: ✨ emoji at 40px. No CTA (buttons live above). Centred, padding '24px 0'. Condition is a triple `!aiSummary && aiSuggestions.length === 0 && !aiAnalysis`.

> **Migration:** An 'idle/ready' state rather than a true empty state — EmptyState should cover it, but flag the semantic in the report.

### `app/leads/[id]/page.js:2657` — Lead detail — timeline empty state standing in for a LOADING state

Copy: 'Unified Timeline' (14/700) + 'Click "Refresh Timeline" to load all activity'. Icon: Activity 36px #d1d5db. No CTA inside (the Refresh button is above at line 2652). DEFECT: the timeline is never auto-fetched, so this empty state is what every user sees on first open of the tab — an empty state doing a loading state's job, and the user must manually trigger the fetch.

> **Migration:** The clearest 'empty state shown where data should be loading' case in the codebase, though the cause is a missing fetch rather than a missing guard. Record it — the correct fix is to fetch on tab activation and show <Skeleton>, not to restyle the empty state.

### `app/leads/[id]/page.js:2765` — Lead detail — no related leads

Copy: 'No Related Leads Found' (14/700, Title Case — the only Title-Case empty-state headline in the app) + 'No other leads share the same phone, email, or name.' Icon: Network 36px #d1d5db. No CTA. Centred, padding '32px 0'.

> **Migration:** EmptyState; normalise the casing to sentence case to match all other headlines.

### `components/SidePanel.js:25` — SidePanel — local Empty() component (PRIOR ART, direct duplicate of the planned EmptyState)

`function Empty({ icon: Icon, text, sub })` → centred div, padding '36px 16px', color var(--text-dim), Icon 32px at opacity 0.35, title 13.5/700 var(--text), sub 12px. Exactly the icon+title+sub contract Batch E is about to build, minus the CTA slot. Used at lines 48, 98, 161.

> **Migration:** This is the strongest existing evidence for the primitive's API. Build components/ui/EmptyState.js with this prop shape ({icon, title, body, action}) and delete this local component — SidePanel is not an approved adopter, so either add it to scope explicitly or leave it and cite it as the design source.

### `components/SidePanel.js:48` — SidePanel calendar — nothing scheduled

Copy: 'Nothing scheduled' + 'Reminders from your leads appear here.' Icon: Calendar 32px. No CTA in-state (a 'Connect Google Calendar in Settings → Integrations' dashed button at line 58 renders unconditionally, empty or not). Correctly loading-guarded by the local Spinner at line 47.

> **Migration:** Reference implementation. Its local Spinner (line 20: 26px, 3px border, var(--accent) top, animation 'spin 0.8s linear infinite') is the exact shape components/ui/Spinner.js should adopt for size='md'.

### `components/SidePanel.js:98` — SidePanel tasks — none yet

Copy: 'No tasks yet' + 'Add your to-dos above.' Icon: CheckSquare 32px. No CTA. Correctly loading-guarded by the local Spinner at line 97.

> **Migration:** Reference implementation.

### `components/SidePanel.js:161` — SidePanel notes — none yet

Copy: 'No notes yet' + 'Jot down quick thoughts here.' Icon: StickyNote 32px. No CTA. Correctly loading-guarded by the local Spinner at line 160.

> **Migration:** Reference implementation.

### `components/RoomPanel.js:81` — Room panel — no messages

Copy: 'No messages yet. Start the discussion for this {type}.' Plain <div>, 13px `var(--text-dim,#666)`, centred, padding '18px 0'. No icon, no CTA. Correctly guarded — condition is `!loading && !messages.length`, and line 80 renders a Loader2 with className='spin' (the globals.css spin, correctly reused).

> **Migration:** A rare correct loading guard AND correct use of the single globals @keyframes spin — cite as the target pattern. size='sm' EmptyState.

### `components/FloatingChat.js:171` — Floating chat — lead picker, FLASHES 'No leads found' before fetch

Copy: 'No leads found'. Plain <div>, 13px var(--text-dim), centred, padding '24px 16px'. No icon, no CTA. TWO defects: (1) LOADING FLASH — leads are fetched at line 101 with no loading gate on this branch, so opening the picker paints 'No leads found' before the response; (2) no distinction — `filteredLeads` (line 113) is search-filtered, so both 'no leads exist' and 'no leads match your search' read identically.

> **Migration:** Confirmed flash defect + missing distinction. Not an approved Batch E adopter — record for the follow-up with a Skeleton row treatment for the 220px-tall list.

### `components/FloatingChat.js:271` — Floating chat — no messages

Copy: 'No messages yet'. Icon: MessageSquare 24px at opacity 0.4. No CTA. Centred, padding '24px 16px'. Correctly loading-guarded by `loadingMsgs` at line 268 (24px spinner using the file-local @keyframes fcSpin declared at line 340).

> **Migration:** The fcSpin keyframes at line 340 is one of the duplicate spin declarations Batch E deletes — migrating the loading branch to <Spinner> removes it.

### `components/NavBar.js:914` — NavBar notifications — all caught up

Copy: 'All caught up!' (13/700) — title only, NO sub-copy, unlike its twin at app/dashboard/page.js:559 which adds 'No new leads or urgent reminders'. Icon: CheckCircle 26px #10b981 (vs 32px in the dashboard twin). No CTA. Centred, padding '28px 20px'.

> **Migration:** Near-duplicate of dashboard:559 with divergent copy and icon size — a Rule-of-Three exhibit. Both collapse onto one <EmptyState tone='success' icon={CheckCircle} title='All caught up!' body='No new leads or urgent reminders' />.

### `components/AICommandCenter.js:282` — AI command centre — no leads in result

Copy: 'No leads found'. Plain <p>, 13px, inside a var(--surface2) card, padding 24, centred. No icon, no CTA. Result-driven (post-query), so no flash risk.

> **Migration:** size='sm' EmptyState. Third distinct rendering of the string 'No leads found' (with leads-list:1145 and dashboard:1262) — all three differ in icon, size and container.

### `components/AICommandCenter.js:311` — AI command centre — no upcoming reminders

Copy: 'No upcoming reminders'. Plain <p>, 13px, var(--surface2) card, padding 24, centred. No icon, no CTA.

> **Migration:** size='sm' EmptyState, same shape as :282.

### `components/TagPicker.js:98` — Tag picker — no tags

Copy: 'No tags yet — create them in Settings'. Plain <div>, 12px var(--text-dim), centred, padding '16px 14px'. No icon; the CTA is prose-only (no link). `allTags` arrives as a prop defaulting to [] (line 34), so any parent that fetches tags asynchronously will flash this state — parent-dependent, not fixable inside TagPicker alone.

> **Migration:** size='xs' EmptyState with a real link CTA. Note the prop-default flash risk: EmptyState cannot fix it; the parents must pass a loading signal.

### `components/TagPicker.js:75` — Tag picker — button label driven by emptiness

`{assignedTags.length === 0 ? 'Add tag' : 'Tags'}` — an emptiness-conditioned LABEL, not an empty state region.

> **Migration:** Not an EmptyState. Listed only so the sweep is provably exhaustive over the length===0 pattern.

### `components/control/ControlShell.js:96` — Control shell — global search, no matches

Copy: 'No matches.' Plain <div>, 13px `var(--text-dim, #666)` (fallback hex), padding 12, LEFT-aligned (not centred). No icon, no CTA. Correct filtered-only semantics (only renders when `results` is non-null, i.e. after a search).

> **Migration:** Identical copy to app/chat/page.js:958. Control-plane surfaces are dark-first with hex fallbacks throughout — decide whether /control is in the design-system scope at all before migrating any of its 24 empty states.

### `components/StudioCopilot.js:100` — Studio copilot — empty conversation (empty state as onboarding)

Copy: 'Ask me anything about this shoot — culling progress, weakest frames, client feedback, what to deliver next.' plus a row of QUICK suggestion chips that each send a prompt (multiple CTAs). No icon. Left-aligned, not centred — deliberately, since it sits in a chat column.

> **Migration:** Suggestion-chip empty states don't fit the icon+title+body+action shape. Explicitly exclude, or EmptyState needs a `children` escape hatch.

### `components/ScheduleMeetingModal.js:215` — Schedule meeting — no Calendly URL configured

Copy: 'No Calendly URL set.' + an <a className='sm-link'> CTA 'Add your Calendly URL in Settings →'. No icon. Centred via the local `.sm-empty` class (declared at lines 351–352: text-align center, padding 24, sub in var(--text-dim)).

> **Migration:** `.sm-empty` is a fourth private empty-state class (with .ms-empty, .ms-empty-soft, .pf-empty) — cite all four in the report as the duplication EmptyState retires. This one has a link CTA rather than a Button.

### `components/HuddleModal.js:165` — Huddle — calls not configured (adjacent unconfigured state)

Copy: 'Calls aren’t enabled yet.' + 'An admin needs to configure LiveKit (see LIVEKIT-SETUP.md).' Icon: AlertCircle 26px. No CTA. Rendered via the local `.hd-state` class. This is an unconfigured/capability state, not a data-empty state.

> **Migration:** Boundary case — closer to ErrorState (tone='info') than EmptyState. Record; do not migrate in Batch E without an explicit ruling on which primitive owns 'feature not configured'.

### `app/pay/[token]/page.js:38` — Public pay page — online payment not enabled (unconfigured state)

Copy: 'Online payment isn’t enabled yet. Please complete payment with the studio directly — they’ll mark this as paid.' Hard-coded light palette (#f5f5f7 bg, #55555e text) because it is a public token page. No icon, no CTA.

> **Migration:** OUT OF SCOPE — public token pages run their own self-contained light styling. Record as a deliberate exception alongside client/[token], g/[token], shop/[token], book/[slug], d/[token], folio.

### `app/client/[token]/page.js:35` — Client portal — local Section({empty}) abstraction (PRIOR ART)

`const Section = ({ title, children, empty })` renders `empty ? <p style={{fontSize:14,color:'#9aa0aa',margin:0}}>{empty}</p> : <div>{children}</div>` — a second in-repo empty-state abstraction, this one taking the empty COPY as a prop and swapping the whole body. Hard-coded #9aa0aa (public page).

> **Migration:** Cite as prior art for an 'empty' prop on a section wrapper. Public token page — out of scope for the app EmptyState.

### `app/client/[token]/page.js:71` — Client portal — no documents

Copy: 'No documents yet.' Via the Section `empty` prop. No icon, no CTA, left-aligned, hard-coded #9aa0aa. Whole page is loading-gated at line 32 (`state === 'loading'`), so no flash.

> **Migration:** Out of scope (public). Record.

### `app/client/[token]/page.js:75` — Client portal — no galleries (best public copy in the app)

Copy: 'Your galleries will appear here once delivered.' — client-facing, expectation-setting, avoids the internal 'yet' voice. Via the Section `empty` prop. No icon, no CTA.

> **Migration:** Out of scope, but quote this copy in the report as the standard for client-facing empty states.

### `app/client/[token]/page.js:85` — Client portal — no invoices

Copy: 'No invoices yet.' Via the Section `empty` prop. No icon, no CTA.

> **Migration:** Out of scope (public). Record.

### `app/g/[token]/page.js:229` — Public gallery — no favourites (correct filtered-empty)

Copy: 'No favourites yet — tap the heart on the photos you love.' Centred, #71717a, 13px, padding 24. No icon, no CTA. Only renders in the favourites-filter view, so the copy correctly describes a filter result and tells the visitor how to populate it.

> **Migration:** Out of scope (public, self-contained styling). Good filtered-empty copy — cite as an example.

### `app/shop/[token]/page.js:57` — Public print store — no products

Copy: 'No products available yet.' Centred <p>, #8a8a93. No icon, no CTA. Page loading-gated at line 38.

> **Migration:** Out of scope (public). Record.

### `app/book/[slug]/page.js:69` — Public booking — no availability

Copy: 'No open times right now — please check back soon.' Wrapped in a <Card title="Availability">, #8a8a93, 14px. No icon, no CTA. Page loading-gated at line 37.

> **Migration:** Out of scope (public). Good visitor-appropriate copy.

### `app/d/[token]/page.js:160` — Public document — AI thread empty prompt

Copy: 'Ask anything about the pricing, timeline, or terms — answered instantly from this document.' 13px #8a8a93. No icon, no CTA (the input below is the action). An onboarding prompt, not a data-empty state.

> **Migration:** Out of scope (public). Record.

### `app/control/adoption/page.js:43` — Control — no adoption scores

Copy: 'No scores yet — run a rollup from Customer Health.' Plain <div>, 13px `var(--text-dim,#666)`. No icon, no CTA, left-aligned, no loading guard.

> **Migration:** One of 24 near-identical control-plane one-liners. Batch E must rule on whether /control is in the design-system scope at all — it is a separate dark admin surface with hex fallbacks everywhere. Recommend: OUT of Batch E, tracked as a single follow-up item.

### `app/control/audit/page.js:22` — Control — no admin actions

Copy: 'No admin actions recorded yet.' Plain <div>, padding 20, 13px var(--text-dim,#666). No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster; see control/adoption:43.

### `app/control/customers/page.js:60` — Control — no workspaces

Copy: 'No workspaces.' Table <td colSpan={8}>, padding 20. No icon, no CTA. Correctly guarded — condition is `!loading && !rows.length`.

> **Migration:** Control-plane cluster. One of only three control pages that guard on loading (with support:90 and flags:38) — the other 21 can flash.

### `app/control/customers/[id]/page.js:120` — Control — no plan overrides

Copy: 'No overrides.' Plain <div>, 13px var(--text-dim,#666). No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster.

### `app/control/customers/[id]/page.js:134` — Control — no platform events for workspace

Copy: 'No platform events yet for this workspace.' Plain <div>, 13px var(--text-dim,#666). No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster.

### `app/control/database/page.js:75` — Control — no tables

Copy: 'No tables.' Plain <div>, padding 14. No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster.

### `app/control/database/page.js:144` — Control — table has no rows

Copy: 'No rows.' <td colSpan={detail.columns.length || 1}>, padding 16. No icon, no CTA.

> **Migration:** Control-plane cluster.

### `app/control/database/page.js:212` — Control — query returned no rows (correct result-empty)

Copy: 'Query returned no rows.' <td colSpan>, padding 16. No icon, no CTA. Correctly distinguishes a query result from a missing table (line 144).

> **Migration:** Control-plane cluster; note the correct semantic distinction.

### `app/control/desktop/page.js:45` — Control — no desktop installs

Copy: 'No desktop installs have reported yet.' Plain <div>, 13px var(--text-dim,#666). No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster.

### `app/control/desktop/page.js:77` — Control — no devices ('None yet.')

Copy: 'None yet.' — the tersest empty state in the codebase, with no subject. Plain <div>, 13px. No icon, no CTA.

> **Migration:** Control-plane cluster; copy quality flag.

### `app/control/events/page.js:36` — Control — no platform events

Copy: 'No events yet. Toggle a flag or suspend a workspace to generate one.' Plain <div>, padding 20, 13px. No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster.

### `app/control/flags/page.js:38` — Control — no feature flags

Copy: 'No flags yet. Create one to start.' Wrapped in a <Card>, 13px var(--text-dim,#666). No icon, no CTA. Correctly guarded — `!loading && !flags.length`.

> **Migration:** Control-plane cluster; one of the three loading-guarded control pages.

### `app/control/health/page.js:56` — Control — no health data

Copy: 'No data.' <td colSpan={7}>, padding 20. No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster.

### `app/control/health/page.js:68` — Control — no risk factors (em-dash placeholder)

Copy: '—' rendered as a <span> when `(w.risk_factors || []).length` is 0. A placeholder glyph rather than an empty state.

> **Migration:** Not an EmptyState — an empty-cell placeholder. Listed for sweep completeness.

### `app/control/inbox/page.js:43` — Control — inbox zero

Copy: '📭 Inbox zero — nothing needs attention. (At-risk/expansion signals appear after a health rollup.)' Emoji icon inline in the string, padding 24, 13px. No CTA, no loading guard.

> **Migration:** Control-plane cluster; fourth emoji-illustrated empty state.

### `app/control/plans/page.js:85` — Control — plan has no price

Copy: 'No price (custom / contact sales).' Plain <div>, 12px. A per-row 'field is empty' note, not a list empty state.

> **Migration:** Not an EmptyState — an inline field placeholder. Listed for completeness.

### `app/control/reports/page.js:72` — Control — no scheduled reports

Copy: 'No reports yet.' <td colSpan={6}>, padding 20. No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster.

### `app/control/storage/page.js:46` — Control — no storage by plan

Copy: 'No storage tracked yet.' Plain <div>, 13px. No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster; copy is duplicated verbatim at line 78 of the same file.

### `app/control/storage/page.js:56` — Control — no recent uploads

Copy: 'No recent uploads.' Plain <div>, 13px. No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster.

### `app/control/storage/page.js:78` — Control — no workspace storage (duplicate copy)

Copy: 'No storage tracked yet.' — byte-identical to line 46 in the same file, describing a different dataset (per-workspace vs per-plan). No icon, no CTA.

> **Migration:** Control-plane cluster; same-file duplicate copy.

### `app/control/support/page.js:90` — Control — no support tickets

Copy: 'No tickets.' <td colSpan={6}>, padding 20. No icon, no CTA. Correctly guarded — `!loading && !tickets.length`.

> **Migration:** Control-plane cluster; one of the three loading-guarded control pages.

### `app/control/support/page.js:249` — Control — ticket has no comments

Copy: 'No comments yet.' Plain <div>, 13px. No icon, no CTA, no loading guard.

> **Migration:** Control-plane cluster.

### `app/control/timemachine/page.js:114` — Control — no timeline events in range (correct filtered-empty)

Copy: 'No events or audit entries for this workspace in range.' Plain <div>, padding 20, 13px. No icon, no CTA. Correctly names the RANGE filter rather than claiming no data exists.

> **Migration:** Control-plane cluster; good filtered-empty copy despite the bare styling.

### `app/control/ai/page.js:20` — Control — no AI usage metered (paragraph-length empty state)

Copy: 'No AI calls metered yet. Metering is live (the callGemini path now records provider, tokens, latency, cost & success to ai_usage) — this page populates as the app makes AI requests (summaries, reply suggestions, AI command, industry, knowledge).' A full explanatory paragraph with inline <code> — the longest empty-state copy in the codebase. No icon, no CTA.

> **Migration:** Control-plane cluster; demonstrates EmptyState's body slot must accept rich nodes (inline <code>), not a plain string.


## Lens 3 — Swallowed load errors — 126 sites

Every fetch failure that renders as "no data" — the batch's one behavioural change.

### `app/clients/page.js:41` — T1-APPROVED — clients load: CONFIRMED, the proposal's claim is exactly right

CONFIRM. The proposal's claim that app/clients/page.js swallows its load error so an outage reads as "zero clients" is TRUE, verbatim:

  const load = async () => {
    setLoading(true);
    try { const r = await leadsAPI.getAll({ client: 1 }); setClients(r.data.leads || []); } catch {}
    setLoading(false);
  };

Guards: leadsAPI.getAll({client:1}) — the entire page payload.
User sees when the API is down: `clients` stays `[]`, `loading` flips to false, and the render at line 88 (`clients.length === 0`) paints the full-bleed empty state at lines 89-94 — a UserCheck icon, the headline "No clients yet" (line 91), the copy "Win a deal, then use Move to Clients..." (line 92), and a "Go to Leads" CTA (line 93). A studio whose backend is down is told, in confident product voice, that it has never won a client. The StatCards at line 74 additionally render "Clients 0" and suppress the "Lifetime revenue" tile (line 75, gated on revenue > 0).
Error state today: NONE. The component has exactly three states — `loading`, `busy` (per-row), `toast` — and `toast` is only ever written by `say()` from the moveBack mutation (line 48). There is no error variable, no retry affordance, no way to distinguish outage from emptiness.

> **Migration:** THE headline behavioural change of Batch E. Add `const [loadError, setLoadError] = useState(null)`; `catch (e) { setLoadError(e); }` and branch BEFORE the `clients.length === 0` test at line 88: `loadError ? <ErrorState onRetry={load} /> : clients.length === 0 ? <EmptyState .../> : ...`. The existing empty-state block (lines 89-94) is a near-perfect shape for the EmptyState primitive (icon tile + title + body + CTA) — extract it as the reference implementation. ErrorState's retry CTA uses the existing components/ui/Button.js primitive; the two ad-hoc style objects btnPrimary/btnGhost at lines 156-157 should be dropped in favour of it. Note `setLoading(false)` at line 42 is OUTSIDE the try/catch, so it already runs on failure — no finally rewiring needed.

### `app/clients/page.js:36` — T1-APPROVED — clients company/currency fetch swallowed

`settingsAPI.getCompany().then(r => setCompany(r.data.company || {})).catch(() => {})`. Guards the workspace currency symbol. On failure `company` stays null and `sym` (line 29) silently falls back to '$' — a PKR studio sees dollar signs on every deal value and on the lifetime-revenue tile with no indication anything failed. Error state today: none.

> **Migration:** Secondary/degradable — do NOT block the page on it. Keep it non-fatal but stop it being invisible: either fold into the same loadError (soft variant) or leave as-is and record. Lowest priority of the three adopter surfaces' findings.

### `app/leads-list/page.js:753` — T1-APPROVED — leads-list PRIMARY: allSettled leads leg dropped on rejection

`fetchAll` (lines 743-757) uses `Promise.allSettled([leadsAPI.getAll(...), tagsAPI.getAll(), workspaceAPI.get()])` then `if (leadsRes.status === 'fulfilled') setAllLeads(leadsRes.value.data.leads || []);`. There is no `else`. When the leads endpoint 500s the rejection is examined, found to be a rejection, and dropped on the floor — allSettled guarantees the outer try/catch at line 756 (`catch (e) { console.error(e); }`) never even fires. `allLeads` stays `[]`, the `applyFilters` effect (line 741) derives `leads = []`, `finally { setLoading(false) }` runs, and the table body at line 1142 renders the empty state at lines 1143-1147: a Users glyph and "No leads found", plus a "Clear all filters" button if any filter is set (line 1146) — actively misdirecting the user into fiddling with filters during a backend outage. Error state today: NONE for loads. The page has a `toast` state but it is only written by mutation handlers (lines 1285, 1310) and by the merge/group modals.

> **Migration:** Primary leads-list adopter target. Capture the rejected settlement: `if (leadsRes.status === 'rejected') setLoadError(leadsRes.reason)`. Gate the table body: `loadError ? <ErrorState onRetry={() => fetchAll(platformFilter, accountFilter)} /> : loading ? <SkeletonRow count={8} /> : leads.length === 0 ? <EmptyState/> : rows`. This is also the SkeletonRow target — the current loading branch (line 1141) is a bare centred "Loading leads..." string inside a grid whose header row (lines 1129-1138) already defines the column template `40px 2fr 1.2fr 1fr 1fr 1.4fr 1fr 1fr 40px`; SkeletonRow should reuse that template so the load-in doesn't reflow.

### `app/leads-list/page.js:754` — T1-APPROVED — leads-list tags leg dropped on rejection

`if (tagsRes.status === 'fulfilled') setAllTags(...)`, no else. On failure `allTags` stays `[]`: the tag filter chips vanish from the toolbar and every row's Tags cell renders blank, indistinguishable from "this lead has no tags". Error state today: none.

> **Migration:** Degradable — the page is still usable without tags. Do not escalate to a full-page ErrorState; either roll into a soft/partial ErrorState variant or record as accepted degradation. Decide the policy once here since the identical shape recurs at leads/[id] and dashboard.

### `app/leads-list/page.js:755` — T1-APPROVED — leads-list workspace/members leg dropped on rejection

`if (wsRes.status === 'fulfilled') setMembers((wsRes.value.data.members || []).filter(...))`, no else. On failure `members` stays `[]`, so every row's Assigned cell renders empty and the assignment filter offers no teammates — a shared workspace looks like a solo one. Error state today: none.

> **Migration:** Same degradable class as the tags leg. Note the knock-on: the bulk-assign modal (line 103) already surfaces its OWN failures properly via confirm({alertOnly, tone:'danger'}) — so the write path is honest while the read path is silent. Worth citing as the internal precedent for what the read path should do.

### `app/leads-list/page.js:738` — T1-APPROVED — platform accounts fetch swallowed

`platformAccountsAPI.getAll().then(r => setPlatformAccounts(r.data.accounts || [])).catch(() => {})` in the mount effect. On failure the per-account platform filter chips silently disappear; a multi-account studio believes it has one inbox. Error state today: none.

> **Migration:** Degradable secondary. Record; migrate only if the batch adopts a soft-degradation convention. Do not block the page.

### `app/leads-list/page.js:308` — T1-APPROVED — WhatsApp ready-accounts swallowed to empty (group create)

`whatsappGroupsAPI.readyAccounts().then(...).catch(() => setAccounts([])).finally(() => setLoadingAccounts(false))` inside the create-WhatsApp-group modal. Explicit swallow-to-empty. On failure the modal reports there are no connected WhatsApp accounts — the user concludes their WhatsApp is disconnected and goes to Settings to re-scan a QR that was never the problem. Error state today: the modal has an `onError` channel (used at lines 315, 325, 349) but it is wired only to user-input validation and the create mutation, never to this load.

> **Migration:** High-value: the failure mode actively sends the user down a wrong repair path. The modal ALREADY has an error channel (`onError` -> showToast at line 1285) — route the catch into it, or render an inline ErrorState in the account-picker slot. Cheap fix, real payoff.

### `app/leads-list/page.js:605` — T1-APPROVED — duplicate detection swallowed to empty

`leadsAPI.getDuplicates().then(...).catch(() => setGroups([]))` in MergeDuplicatesModal. `groups` is initialised to `null` (line 592) precisely so null=loading and []=none-found can be distinguished — and the catch throws that distinction away by writing `[]`. On failure the modal declares the database clean of duplicates. Error state today: none for the load; the merge mutation at line 629 correctly uses `toast.error('Merge failed', ...)`.

> **Migration:** Textbook case: the tri-state (null | [] | data) already exists and the catch collapses it. Add a fourth state or keep `null` and set a separate error. The in-file contrast — mutation shouts (line 629), load whispers (line 605) — makes this the clearest teaching example in the batch.

### `app/leads-list/page.js:982` — T1-APPROVED — bulk status change: per-item failures swallowed

`for (const id of ids) { try { await leadsAPI.updateStatus(id, { status }); } catch {} }`. A write, not a read, but the same defect class: if 40 of 50 leads fail to update, the loop completes, the UI refetches, and the user is told nothing. Partial failure is reported as total success. Error state today: none for this loop.

> **Migration:** Out of the strict fetch lens but ON an approved adopter surface. Not an ErrorState target (no empty-vs-error confusion) — the right fix is a counted result via the existing Toast primitive from Batch C ('Updated 10 of 50'). Record; only take it if Batch E's scope stretches to bulk-op reporting, otherwise backlog with an explicit note.

### `app/leads-list/page.js:1008` — T1-APPROVED — bulk move-to-clients: per-item failures swallowed

`for (const id of ids) { try { await leadsAPI.setClient(id, true); } catch {} }`. Identical shape to line 982. Leads that failed to promote silently remain in the pipeline while the user believes they were moved to Clients — and this is the exact write that populates the clients page whose read is item #1.

> **Migration:** Same treatment as line 982; pair them in one change if taken. Note the coupling: a silent failure here plus a silent failure at clients/page.js:41 means a lead can be invisible on BOTH surfaces with zero signal.

### `app/leads-list/page.js:766` — T1-APPROVED — tag assign/remove failure is console-only

`handleTagToggle`: `catch (e) { console.error(e); }`. The optimistic local state update at lines 763-765 is inside the try and therefore skipped on failure, so the chip does snap back — but the user gets no explanation and will simply click again. Error state today: console only.

> **Migration:** Toast primitive (Batch C), not ErrorState. Record on the adopter surface; low cost if the file is open anyway.

### `app/invoices/page.js:335` — T1-APPROVED — invoices PRIMARY: load pre-caught to an empty ledger

`Promise.all([ invoicesAPI.getAll().catch(() => ({ data: { invoices: [] } })), settingsAPI.getCompany().catch(...) ]).then(...).finally(() => setLoading(false))`. The `.catch` fabricates a well-formed empty success response, so the `.then` at line 337 runs happily with `invoices = []`. There is deliberately no `.catch` on the outer chain because neither leg can reject. User sees when the API is down: the table body at line 471 (`filtered.length === 0`) renders "No invoices found" plus "Create invoices from any lead profile" (lines 472-476). This is the highest-consequence instance in the codebase — an outage tells a business it has no outstanding invoices, i.e. that nobody owes it money. Error state today: NONE for the load. The `error` state at line 263 belongs to the separate EmailInvoiceModal component and drives only the send flow (lines 269-270, 303); the page-level mutations correctly use toast.error (lines 350, 365).

> **Migration:** The strongest justification for Batch E existing. Replace the fabricated-empty catch with a real rejection path: drop the per-leg `.catch` on the invoices leg, add `.catch(setLoadError)` on the chain, and branch `loadError ? <ErrorState onRetry={load}/> : loading ? <SkeletonRow/> : filtered.length === 0 ? <EmptyState/> : rows`. Keep the getCompany leg pre-caught (item #13) so a currency-lookup blip never blanks the ledger. Note the loading branch at lines 466-470 already hand-rolls a 36px border-spinner with `animation: 'spin 0.8s linear infinite'` depending on the local `@keyframes spin` at line 508 — that is one of the 17 duplicate declarations to delete, and this call site is the direct Spinner primitive target. The grid template `50px 1fr 130px 120px 110px 200px` (lines 460, 478) is the SkeletonRow shape.

### `app/invoices/page.js:336` — T1-APPROVED — invoices company/currency fetch pre-caught

`settingsAPI.getCompany().catch(() => ({ data: { company: {} } }))`. On failure `company` is `{}` and `sym` falls back to '$' (line 118), so every amount in the ledger, in the view modal, and in the printed/emailed invoice HTML renders with the wrong currency symbol and no warning.

> **Migration:** Genuinely degradable — KEEP this one pre-caught so a settings blip cannot blank the ledger. Explicitly document that choice when fixing line 335, otherwise a later reader will 'fix' it for symmetry and reintroduce a worse failure mode.

### `app/invoices/page.js:125` — T1-APPROVED — payment-link creation swallowed

`makePayLink`: `try { const r = await paymentsAPI.link({...}); const url = ...; setPayLink(url); try { await navigator.clipboard.writeText(url); } catch {} } catch {}`. Two nested empty catches. If the payments API fails the button does nothing at all — no link appears, no clipboard write, no message. The user clicks repeatedly assuming a UI bug. (The inner catch guards clipboard, which is legitimately non-fatal.)

> **Migration:** Toast primitive, not ErrorState — it is an action, not a load. On an approved surface so take it opportunistically while migrating line 335. The inner clipboard catch is correct; leave it.

### `app/dashboard/page.js:771` — BACKLOG — dashboard fetchAll: entire pipeline + analytics console-only

`fetchAll` (lines 739-772) awaits `Promise.all([leadsAPI.getAll(null), analyticsAPI.get(), tagsAPI.getAll().catch(...)])` and ends `catch (e) { console.error(e); } finally { setLoading(false); }`. Either of the first two legs rejecting aborts the whole body: `allLeads`/`leads` stay `[]`, `analytics` stays null, `reminders` stays `[]`, `notifBadge` is never set. The user lands on the app's home screen and sees an empty kanban board across all pipeline columns, zeroed charts, and no reminders — the single most alarming false-empty in the product. Error state today: the `error` state at line 120 belongs to the CSV-import modal and renders only at lines 263-267.

> **Migration:** Highest-severity finding OUTSIDE the approved scope. Do not migrate in Batch E — record as the top of the backlog and the strongest argument for a Batch F. Note tagsAPI is already individually pre-caught (line 746), so the author was thinking about partial failure and simply did not extend it to the two legs that matter.

### `app/dashboard/page.js:737` — BACKLOG — dashboard SSE-triggered lead refresh swallowed

`fetchLeads` (lines 731-738) ends `} catch {}`. This is the refresh fired on every SSE frame. A failure leaves the board showing stale data indefinitely with no staleness indicator; combined with the SSE auto-retry at line 726 the board can silently diverge from the server for the whole session.

> **Migration:** Backlog. Distinct sub-class — STALE data rather than absent data — which ErrorState does not model. Flag for the batch's design notes: a 'live data is stale' affordance is a gap in the approved primitive set.

### `app/dashboard/page.js:746` — BACKLOG — dashboard tags leg pre-caught to empty

`tagsAPI.getAll().catch(() => ({ data: { tags: [] } }))` inside the fetchAll Promise.all. Deliberately non-fatal so a tags outage cannot blank the board; consequence is that every card renders tagless.

> **Migration:** Backlog. Correct instinct, silent execution — the pattern to generalise is 'degrade AND disclose', not 'degrade silently'.

### `app/dashboard/page.js:755` — BACKLOG — per-lead reminder fan-out swallowed to empty arrays

`leadsAPI.getById(lead.id).then(r => r.data.reminders || []).catch(() => [])` mapped over the first 30 leads. Each failure contributes `[]`, so a partial or total reminder outage renders as 'no upcoming reminders' and suppresses the urgent-reminder notification badge computed at lines 763-770. The user misses follow-ups and never learns why.

> **Migration:** Backlog. Also an N+1 fan-out (30 sequential-ish requests) — worth pairing with a perf note if a future batch touches this file.

### `app/dashboard/page.js:779` — BACKLOG — dashboard company/currency fetch swallowed

`settingsAPI.getCompany().then(r => setCompany(r.data.company || {})).catch(() => {})`. Same currency-symbol degradation as clients/invoices; every monetary figure on the dashboard silently reverts to '$'.

> **Migration:** Backlog. Third occurrence of the identical getCompany-swallow shape (clients:36, invoices:336, dashboard:779) — plus studio and leads/[id]. Rule of Three is satisfied: a shared `useCompany()` hook with one honest failure policy is the real fix. Record as an RFC candidate, not a Batch E item.

### `app/leads/[id]/page.js:866` — BACKLOG — conversation history swallowed to empty (severe)

`fetchMessages`: `catch { setMessages([]); }`. An explicit swallow-to-empty on the message thread. When the messages endpoint fails the lead's entire WhatsApp/Instagram conversation history renders as an empty thread — the user believes they have never spoken to this customer, and may re-introduce themselves. Also skips the `platform_counts` update (line 863), so the per-platform tab badges go stale simultaneously.

> **Migration:** Backlog, but arguably the most user-damaging single line in the sweep after invoices:335 — it destroys the appearance of a customer relationship, not just a list. Record prominently. Note this file DOES have a proper load-error path already (fetchError, lines 625 and 1187-1197, rendering 'Could not load lead' with a retry) — the pattern exists in-file and simply was not applied to the message fetch. That makes it a cheap, low-risk future fix.

### `app/leads/[id]/page.js:820` — BACKLOG — lead detail: eight Promise.all legs each pre-caught to empty

Lines 820-827 pre-catch eight legs to fabricated empty payloads: presetsAPI (820), tagsAPI (821), emailTemplatesAPI (822), teamAPI (823), settingsAPI.getCompany (824), leadEmailsAPI (825), leadChannelsAPI (826), leadRelationsAPI.getSuggested (827). Each returns a well-formed empty response so the outer `.then` always succeeds. A backend outage renders the lead detail as a customer with no tags, no channels, no email history, no related leads, no team, and no quick-reply presets — a fully populated record appears blank.

> **Migration:** Backlog. Eight sites, one shape, one file. The deliberate design is 'the lead page must render even if satellites fail', which is correct — the missing half is disclosure. This is the canonical case for a soft/partial ErrorState variant; note it as a design input even though the file is out of scope.

### `app/leads/[id]/page.js:552` — BACKLOG — linked shoots swallowed to empty

`mediaAPI.listProjects({ lead_id: leadId }).then(r => { if (on) setShoots(r.data.projects || []); }).catch(() => { if (on) setShoots([]); })`. Explicit swallow-to-empty: the Media Studio shoots linked to this client vanish, reading as 'no shoots booked'.

> **Migration:** Backlog. Cross-module (CRM surface reading Studio data) — a Studio outage silently rewrites CRM truth. Worth calling out in the ecosystem notes.

### `app/leads/[id]/page.js:258` — BACKLOG — custom lost-reasons fetch swallowed

`lostReasonsAPI.getAll().then(...).catch(() => {})`. On failure the workspace's configured lost reasons never load and the modal silently falls back to the hardcoded LOST_REASONS defaults (lines 249-250). The user records a lost deal against a taxonomy their workspace does not use, and the data is wrong forever after.

> **Migration:** Backlog. Silent-wrong-default is a data-integrity issue, not merely cosmetic — under the Constitution's priority order (Security > DataIntegrity > ...) this outranks most of the visual work in this batch. Flag accordingly.

### `app/leads/[id]/page.js:701` — BACKLOG — WhatsApp-dependent fetch swallowed (documented as intentional)

`.catch(() => {}) // non-fatal — WhatsApp might not be connected`. The only swallow in the sweep with a written rationale. Still conflates 'WhatsApp not connected' (a real, actionable user state) with 'the request failed'.

> **Migration:** Backlog. Cite as the good-faith end of the spectrum: the author reasoned about it and wrote it down. The fix is not to make it fatal but to distinguish the two causes. Useful in the proposal to show the finding set is not a blanket condemnation.

### `app/leads/[id]/page.js:1153` — BACKLOG — post-AI lead refresh swallowed

`try { const r = await leadsAPI.getById(leadId); ... setLead(prev => ({...prev, ...fresh})); } catch {}` nested inside the AI-analysis handler. If the refresh fails the AI result is displayed but the left-panel Lead Intelligence card keeps stale values — two panes disagreeing on screen with no indication which is current.

> **Migration:** Backlog. Note the outer handler at line 1154 DOES set aiError (rendered at lines 2471-2473) — so the same function both surfaces and swallows depending on which await failed. Good illustration of inconsistency being the root cause rather than negligence.

### `app/reports/page.js:110` — BACKLOG — reports/analytics load console-only

`fetchAll` (lines 100-111): `Promise.all([analyticsAPI.getReports(params), analyticsAPI.get()])` with `catch (e) { console.error(e); } finally { setLoading(false); }`. On failure `data` and `analytics` stay null and every chart, funnel and KPI renders zeroed or blank after the 'Loading analytics...' line (line 344) disappears. Because fetchAll re-runs on every period change (line 98), a user changing the date range sees their report silently blank out. Error state today: none.

> **Migration:** Backlog, high severity — zeroed analytics are not merely missing, they are actively misleading (a business could read '0 leads this month' as a real result). Note the local `@keyframes spin` at line 614 is one of the 17 duplicates.

### `app/team/page.js:433` — BACKLOG — team allSettled: workspace failure console-only

`fetchAll` (lines 430-451) uses allSettled with the comment 'Use allSettled so one failure doesn't block others'. The workspace leg has an explicit else — `console.error('Workspace fetch failed:', wsResult.reason)` (line 441) — and nothing more. The logs (line 446) and permissions (line 447) legs have no else at all. On failure `members` stays `[]` and `workspace` stays null: the team page shows an empty roster, i.e. the admin appears to have no colleagues. Error state today: none for loads (mutations correctly use toast.error at 180, 226, 489).

> **Migration:** Backlog. Notable because the rejection reason is explicitly captured into console and then discarded — the value needed for an ErrorState is already in hand at line 441. One of the cheapest future fixes in the sweep.

### `app/trash/page.js:34` — BACKLOG — trash load swallowed to empty

`catch { setLeads([]); } finally { setLoading(false); }`. On failure the trash renders as empty — the user concludes the 90-day restore window has elapsed and their deleted leads are gone forever. Error state today: none for the load; all three mutations (51, 60, 73) correctly use confirm({alertOnly, tone:'danger'}).

> **Migration:** Backlog. Same mutation-shouts/load-whispers asymmetry as leads-list:605. The emotional stakes are high (perceived permanent data loss) relative to the fix cost.

### `app/contracts/page.js:47` — BACKLOG — contracts list + overview swallowed

`try { const [d, o] = await Promise.all([csAPI.list(), csAPI.overview()]); setDocs(...); setOv(...); } catch {}` then `setLoading(false)`. Either leg failing leaves `docs = []` and `ov = {}`: the contracts index shows no documents and all overview counters (awaiting/completed, lines 52-53) read zero. Error state today: none.

> **Migration:** Backlog. Same family as invoices:335 (a legal/financial register reading as empty). If a Batch F extends the adopter set, contracts index is the natural next surface after the three approved ones.

### `app/contracts/page.js:179` — BACKLOG — contracts: leads picker swallowed (create modal)

`leadsAPI.getAll(null).then(r => setLeads(r.data.leads || [])).catch(() => {})`. The client picker in the create-document modal renders empty; the user cannot attach a client and has no idea why.

> **Migration:** Backlog. Note this component DOES have a rendered `err` (line 177, shown at line 258) used by the create mutation (line 197) — the channel exists and the load does not use it.

### `app/contracts/page.js:180` — BACKLOG — contracts: packs list swallowed (create modal)

`csAPI.packs().then(r => setPacks(r.data.packs || [])).catch(() => {})`. Document packs silently absent from the picker.

> **Migration:** Backlog. Same rendered-err channel available as item above.

### `app/contracts/page.js:181` — BACKLOG — contracts: templates list swallowed (create modal)

`csAPI.templates().then(r => setTemplates(r.data.templates || [])).catch(() => {})`. Saved templates silently absent; the user starts from a blank document believing their templates were never saved.

> **Migration:** Backlog. Perceived data loss again — templates the user built appear to have vanished.

### `app/contracts/page.js:276` — BACKLOG — contracts bulk-send: packs list swallowed (duplicate of :180)

`csAPI.packs().then(r => setPacks(r.data.packs || [])).catch(() => {})` — the same three loads repeated verbatim in the second component in this file.

> **Migration:** Backlog. Lines 276-278 are a copy of 179-181; three duplicated swallows. Rule of Three: extract a shared loader when this file is next touched.

### `app/contracts/page.js:277` — BACKLOG — contracts bulk-send: templates list swallowed (duplicate of :181)

`csAPI.templates().then(r => setTemplates(r.data.templates || [])).catch(() => {})`.

> **Migration:** Backlog; see item above.

### `app/contracts/page.js:278` — BACKLOG — contracts bulk-send: leads picker swallowed (duplicate of :179)

`leadsAPI.getAll(null).then(r => setLeads(r.data.leads || [])).catch(() => {})`. In the bulk-send flow an empty recipient list means the user cannot send and receives no explanation.

> **Migration:** Backlog; see item above. Component has a rendered `err` at line 274/322 already wired to the send mutation (line 287).

### `app/contracts/vault/page.js:28` — BACKLOG (Skeleton-only scope) — client vault swallowed to empty

`csAPI.vault().then(r => setClients(r.data.clients || [])).catch(() => setClients([]))`. `clients` is initialised to `null` (line 18) exactly so null=loading and []=empty are distinct — and the catch collapses that to `[]`. Render at line 45 then shows 'No clients yet — documents you create will be filed here.' A studio whose backend is down is told its entire document vault is empty. Error state today: none. Loading is a bare 'Loading…' paragraph (line 44).

> **Migration:** IMPORTANT SCOPE NOTE: Batch E approves Skeleton/SkeletonRow for contracts vault but does NOT list vault among the ErrorState adopters (clients, leads-list, invoices only). So the skeleton work here will visibly improve the loading state while leaving this swallow in place. Call that out explicitly in the batch report so it reads as a deliberate scope boundary rather than an oversight. Same null-collapsed-to-[] shape as leads-list:605.

### `app/contracts/[id]/page.js:274` — BACKLOG — contract document load swallowed to a fake empty document

`const load = () => csAPI.get(id).then(r => setData(r.data)).catch(() => setData({ signers: [], events: [] }))`. Fabricates a valid-looking empty document on failure: the signer list renders empty and the audit trail renders empty. On a legal e-signature surface this is the worst instance in the file — 'no signers, no events' is a factual claim about a legal document.

> **Migration:** Backlog, flagged for DataIntegrity priority. A fabricated empty audit trail on a contract is materially different from an empty list elsewhere; worth escalating separately from the visual batch.

### `app/contracts/[id]/page.js:212` — BACKLOG — contract version history swallowed to empty

`csAPI.versions(id).then(r => setData(r.data)).catch(() => setData({ versions: [] }))`. Version history renders empty; the user believes the document has never been revised.

> **Migration:** Backlog. Same fabricated-empty family as line 274.

### `app/contracts/[id]/page.js:183` — BACKLOG — clause library swallowed to empty

`csAPI.clauses().then(r => setClauses(r.data.clauses || [])).catch(() => setClauses([]))`. The saved clause library renders empty in the editor; the user rewrites clauses they already own.

> **Migration:** Backlog. Perceived loss of authored content.

### `app/contracts/[id]/page.js:44` — BACKLOG — workspace letterhead/defaults swallowed

`csAPI.getSettings().then(r => { setWsLetterhead(...); setWsDefaults(...); }).catch(() => {})`. On failure the document silently renders without the workspace letterhead and without configured defaults — and could be sent to a client unbranded with no warning.

> **Migration:** Backlog. Silent-wrong-output rather than silent-empty; the artefact leaves the building in the wrong state. Note for the batch's taxonomy.

### `app/contracts/[id]/page.js:43` — BACKLOG — contract load failure redirects instead of explaining

`.catch(() => router.push('/contracts'))`. Not a swallow-to-empty but the same information loss: any failure bounces the user back to the index with no message, indistinguishable from a deleted document or a permissions problem.

> **Migration:** Backlog. Distinct sub-class (silent redirect). Worth listing because a reader scanning for `catch {}` would miss it entirely — it looks like deliberate handling.

### `app/contracts/settings/page.js:20` — BACKLOG — contracts settings: clause list swallowed

`const loadClauses = () => csAPI.clauses().then(r => setClauses(r.data.clauses || [])).catch(() => {})`. The clause manager renders empty; a user could re-create clauses that already exist, producing duplicates.

> **Migration:** Backlog.

### `app/contracts/settings/page.js:23` — BACKLOG — contracts settings: letterhead + settings swallowed

`csAPI.getSettings().then(r => { setLetterhead(...); setSettings(...); }).catch(() => {})`. Settings render at defaults; a user 'fixing' what looks unconfigured may overwrite real saved settings on the next save.

> **Migration:** Backlog. Destructive-on-retry: the silent-empty invites a write that destroys real data. Higher severity than a read-only blank.

### `app/chat/page.js:473` — BACKLOG — team chat: members roster swallowed

`try { const r = await workspaceAPI.get(); setMembers(...); } catch {}` — first of four sequential single-line swallows in one bootstrap IIFE (lines 472-477). Roster empty: no @-mentions resolve, DM picker is empty.

> **Migration:** Backlog. Four independent swallows in six lines — the densest cluster in the sweep; cite as evidence of the pattern being habitual rather than considered.

### `app/chat/page.js:474` — BACKLOG — team chat: presence swallowed

`try { const r = await commsAPI.presence(); setOnline(r.data.online || []); } catch {}`. Everyone renders as offline — colleagues appear unavailable when they are not.

> **Migration:** Backlog. Silent-wrong-state (offline is a meaningful assertion, not an absence).

### `app/chat/page.js:475` — BACKLOG — team chat: unread counts swallowed

`try { const r = await commsAPI.unread(); setUnreadCounts(...); } catch {}`. Unread badges never appear; the user misses messages entirely.

> **Migration:** Backlog.

### `app/chat/page.js:476` — BACKLOG — team chat: DM list swallowed

`try { const r = await commsAPI.dms(); setDms(r.data.dms || []); } catch {}`. DM list renders empty — existing private conversations appear not to exist.

> **Migration:** Backlog.

### `app/chat/page.js:491` — BACKLOG — team chat: channel list console-only

`loadChannels` ends `catch (e) { console.error(e); }`. On failure `channels` stays `[]`, no channel is auto-selected (line 486 guard), and the whole chat surface renders as a workspace with no channels.

> **Migration:** Backlog. The parent of the four swallows above — if this one fails the surface is empty regardless.

### `app/chat/page.js:513` — BACKLOG — team chat: message history console-only

`loadMessages` ends `catch (e) { console.error(e); } finally { if (!silent) setLoadingMessages(false); }`. `messages` retains its previous value (no reset) so on first load the thread renders empty and on a silent poll it silently goes stale. Same class as leads/[id]:866.

> **Migration:** Backlog. Note the `silent` polling path means failures accumulate invisibly over a long session.

### `app/chat/page.js:534` — BACKLOG — team chat: DM list refresh after dmOpen swallowed

`try { const d = await commsAPI.dms(); setDms(d.data.dms || []); } catch {}` nested inside handleDmOpen. The newly opened DM does not appear in the sidebar; the user opens it again.

> **Migration:** Backlog.

### `app/chat/page.js:186` — BACKLOG — read receipts swallowed to empty

`try { const r = await commsAPI.receipts(msg.id); setReceipts(r.data.seen_by || []); } catch { setReceipts([]); }`. Explicit swallow-to-empty: 'seen by nobody' is asserted when the lookup failed. A sender concludes their message was ignored.

> **Migration:** Backlog. Clean example of an empty list being a false factual claim rather than a neutral absence — good line to quote in the proposal.

### `app/chat/page.js:678` — BACKLOG — pinned messages swallowed to empty

`try { const r = await commsAPI.pins(activeChannelRef.current.id); setPins(r.data.pins || []); } catch { setPins([]); }`. The pins panel renders empty; pinned team knowledge appears to have been unpinned.

> **Migration:** Backlog.

### `app/chat/page.js:685` — BACKLOG — chat search swallowed to empty

`try { const r = await commsAPI.search(q.trim()); setSearchResults(r.data.results || []); } catch { setSearchResults([]); }`. A failed search is indistinguishable from a genuine zero-result search — the user concludes the message they are looking for does not exist.

> **Migration:** Backlog. Search is the canonical no-results-vs-error case; ErrorState needs a compact inline variant to serve it (design input).

### `app/chat/page.js:727` — BACKLOG — message thread swallowed to null

`try { const r = await commsAPI.thread(messageId); setThreadData(r.data); } catch { setThreadData(null); }`. The thread pane renders empty — replies appear to have vanished.

> **Migration:** Backlog.

### `app/chat/page.js:478` — BACKLOG — 30s presence poll swallowed

`setInterval(() => { commsAPI.presence().then(r => setOnline(r.data.online || [])).catch(() => {}); }, 30000)`. A recurring silent failure: presence freezes at its last value for the rest of the session, with no staleness signal.

> **Migration:** Backlog. Recurring/polling swallows (this, dashboard:737, settings:1906) are a distinct sub-class — one failure is invisible AND permanent for the session. Worth naming in the taxonomy.

### `app/knowledge/page.js:182` — BACKLOG — per-document memories swallowed

`try { const res = await fetch(`${API}/api/knowledge/${docId}/memories`, ...); const data = await res.json(); setDocMemories(p => ({ ...p, [docId]: data.memories || [] })); } catch {}`. Expanding a knowledge doc shows no extracted memories, reading as 'this document produced nothing' rather than 'the lookup failed'.

> **Migration:** Backlog. NOTE the counter-example in the same file: `fetchAll` at line 99 does `catch (e) { showToast('Failed to load data', 'error'); }` — the file's main load is honest and only this secondary one is silent. Cite as proof that the codebase already knows how to do this.

### `app/settings/page.js:2328` — BACKLOG — settings fetchCompany: the exact `catch { } finally { setLoading(false) }` shape

`const fetchCompany = async () => { try { const res = await settingsAPI.getCompany(); setCompany(res.data.company || {}); } catch { } finally { setLoading(false); } }`. Literally the pattern named in the lens brief. On failure the company/branding tab renders every field blank; a user who then saves will overwrite their real saved settings with empties.

> **Migration:** Backlog, but flag for DataIntegrity: destructive-on-retry, same as contracts/settings:23. The blank form invites the overwrite. This class deserves separate escalation from the visual work.

### `app/settings/page.js:2485` — BACKLOG — SMTP settings load: `catch { } finally { setLoading(false) }`

Email/SMTP settings loader ends `} catch { } finally { setLoading(false); }` after populating ~8 fields (lines 2477-2484). On failure the SMTP form renders empty/default (port 587 etc.) and a save writes those defaults over the user's real credentials.

> **Migration:** Backlog. Destructive-on-retry on credentials — the most consequential instance of this sub-class.

### `app/settings/page.js:2648` — BACKLOG — IMAP settings load: `catch { } finally { setLoading(false) }`

Identical shape to line 2485 for IMAP (fields at lines 2640-2647, including imap_pass). Same destructive-on-retry exposure.

> **Migration:** Backlog. Third instance of the exact shape in one file (1719, 2328, 2485, 2648 — four in total); a shared loader with one honest policy is the fix.

### `app/settings/page.js:1719` — BACKLOG — platform accounts load: `catch {} finally { setLoading(false) }`

`loadAccounts`: `try { const res = await platformAccountsAPI.getAll(); setAccounts(res.data.accounts || []); } catch {} finally { setLoading(false); }`. The connected-accounts list renders empty — a user with several connected WhatsApp/Instagram accounts is shown none and may re-onboard duplicates.

> **Migration:** Backlog. Duplicate-creation risk, and it mirrors leads-list:308 which surfaces the same data in a modal — a single outage produces the same false 'nothing connected' story in two places.

### `app/settings/page.js:1209` — BACKLOG — audit log swallowed to empty

`auditAPI.getLogs({ limit: 100 }).then(r => setLogs(r.data.logs || [])).catch(() => {}).finally(() => setLoadingLogs(false))`. The audit log renders empty. An empty security audit trail is a specific and false assertion — 'no admin actions were recorded'.

> **Migration:** Backlog, flag under Security in the Constitution's priority order. An audit surface must never fabricate emptiness; this outranks the visual scope of the batch.

### `app/settings/page.js:1379` — BACKLOG — workspace + members load swallowed

`workspaceAPI.get().then(res => { setWorkspace(...); setWsName(...); setMembers(...); setCurrentRole(...); }).catch(() => {}).finally(() => setLoading(false))`. On failure `workspace` is null, `members` is [], and `currentRole` keeps its default `'super_admin'` (line 1376 initial) — the UI may show admin-only affordances to a user whose real role never loaded.

> **Migration:** Backlog, flag under Security: a permission-bearing value silently defaults to the MOST privileged role on fetch failure. Client-side only (the server is the authority) but it is still a misleading UI and deserves its own note.

### `app/settings/page.js:385` — BACKLOG — lost reasons swallowed to empty

`try { const res = await lostReasonsAPI.getAll(); setReasons(res.data.reasons || []); } catch { setReasons([]); }`. The lost-reason manager renders empty; the user re-adds reasons that already exist. Pairs with leads/[id]:258 where the same outage silently substitutes hardcoded defaults.

> **Migration:** Backlog. Same data, two surfaces, two different silent failure modes (empty here, wrong-defaults there) — a good illustration of why one shared policy matters.

### `app/settings/page.js:2940` — BACKLOG — AI profile swallowed

`aiAPI.getProfile().then(r => { if (r.data?.profile) setProfile(p => ({ ...p, ...r.data.profile })); }).catch(() => {})`. The AI profile form renders defaults; a save overwrites the user's tuned profile.

> **Migration:** Backlog. Destructive-on-retry again.

### `app/settings/page.js:2941` — BACKLOG — AI provider status swallowed

`aiAPI.status().then(r => setProviderInfo(r.data)).catch(() => {})`. Provider/quota info renders blank, so a user cannot tell whether AI is configured, out of credit, or simply unreported.

> **Migration:** Backlog. Ties into the Command Center AI metering work — a blank provider panel is indistinguishable from an unmetered one.

### `app/settings/page.js:1906` — BACKLOG — WhatsApp status poll swallowed (5s interval)

`try { const res = await fetch(.../status ...); const data = await res.json(); setStatus(prev => ...); } catch {}` inside a 5s `setInterval` (line 1910). If polling fails, `status` freezes at its last value; the code at line 1939 then treats `!status` as an error state but a STALE status as truth — so a disconnected account can keep rendering 'Connected' indefinitely.

> **Migration:** Backlog. Polling sub-class with an inverted consequence: the swallow produces a falsely POSITIVE state rather than a false empty. Worth its own line in the taxonomy — ErrorState alone does not cover it.

### `app/settings/page.js:777` — BACKLOG — push subscription lookup swallowed

`navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription().then(sub => setSubscribed(!!sub))).catch(() => {})`. On failure `subscribed` stays false, so the UI offers to enable push for a user who already has it enabled.

> **Migration:** Backlog, low severity. Browser-API rather than network, but the false-negative-state shape is identical.

### `app/bookings/page.js:21` — BACKLOG — booking settings swallowed to a fabricated empty config

`bookingAPI.settings().then(r => { setSettings(r.data.settings); setUrl(r.data.public_url); }).catch(() => setSettings({ services: [], availability: {} }))`. Fabricates an empty configuration. Because the render guard at line 37 is `if (!settings) return <Loading/>`, the fabricated object satisfies it and the page renders fully — showing no services and no availability, i.e. 'you have never configured bookings'. A save from that state would wipe the real config.

> **Migration:** Backlog, destructive-on-retry. Also note the `save` function at line 25 has NO try/catch at all — an unhandled rejection. Worth recording alongside.

### `app/bookings/page.js:22` — BACKLOG — bookings list swallowed

`bookingAPI.list().then(r => setBookings(r.data.bookings || [])).catch(() => {})`. The upcoming-bookings list renders empty — a photographer believes their calendar is clear and may double-book.

> **Migration:** Backlog. Real-world consequence beyond the screen (double-booking); good severity example.

### `app/studio/page.js:119` — BACKLOG — Media Studio project list swallowed

`const load = async () => { setLoading(true); try { const res = await mediaAPI.listProjects(); setProjects(res.data.projects || []); } catch {} setLoading(false); }`. Structurally identical to clients/page.js:41 (same author shape: try/catch{}/setLoading outside). On failure the Studio home shows no shoots; the derived `featured` (line 124) and `totalPhotos` (line 125) also read empty/zero.

> **Migration:** Backlog. Direct structural twin of the approved clients fix — if the clients migration lands cleanly, this is the lowest-risk next adopter for a Batch F. Note the file DOES have a rendered `err` at line 21/96 already, used for mutations only.

### `app/studio/page.js:24` — BACKLOG — studio landing: leads fetch swallowed

`leadsAPI.getAll(null).then(r => setLeads(r.data.leads || [])).catch(() => {})`. The client picker for attaching a shoot to a lead renders empty.

> **Migration:** Backlog. Fifth occurrence of the `leadsAPI.getAll(null).catch(() => {})` picker shape (also contracts:179, contracts:278, studio/portfolio:309, studio/settings:42) — a shared LeadPicker with one honest failure policy is the Rule-of-Three fix.

### `app/studio/[id]/page.js:180` — BACKLOG — studio asset list swallowed to empty array

`refreshAssets`: `try { const r = await mediaAPI.listAssets(id, { limit: 5000 }); setAssets(r.data.assets || []); return r.data.assets || []; } catch { return []; }`. Returns `[]` to its callers on failure, so downstream logic also proceeds as if the shoot genuinely has no photos. A photographer opening a 5000-image shoot during an outage sees an empty gallery.

> **Migration:** Backlog. The `catch { return [] }` shape propagates the false-empty into every caller, which is worse than a local swallow — the lie travels.

### `app/studio/[id]/page.js:183` — BACKLOG — studio galleries swallowed

`refreshGalleries`: `try { const r = await mediaAPI.listGalleries(id); setGalleries(r.data.galleries || []); } catch {}` (also duplicated at line 185 in the mount path). Client galleries render as none; the photographer may re-create a gallery that already has client favourites in it.

> **Migration:** Backlog. Duplicate-creation risk on top of client-visible data.

### `app/studio/[id]/albums/page.js:59` — BACKLOG — album list swallowed

`mediaAPI.listAlbums(id).then(r => setAlbums(r.data.albums || [])).catch(() => {}).finally(() => setLoading(false))`. Albums render as none.

> **Migration:** Backlog.

### `app/studio/[id]/cull/page.js:146` — BACKLOG — cull AI scores swallowed

`try { const r = await mediaAPI.intelligence(id); setScores(r.data.scores || {}); } catch {}`. AI cull scores silently absent, so the cull UI presents unscored images as if the analyser had genuinely produced nothing — the user culls without the assistance they are paying for and never knows it was unavailable.

> **Migration:** Backlog. Paid-feature-silently-absent is its own commercial concern; worth flagging to the owner separately from the design batch.

### `app/studio/[id]/cull/page.js:147` — BACKLOG — studio brain swallowed

`try { const b = await mediaAPI.brain(); setBrain(b.data.brain || {}); } catch {}`. Studio Brain preferences absent; cull recommendations silently fall back to generic behaviour.

> **Migration:** Backlog. Same paid-feature-silently-absent class.

### `app/studio/[id]/cull/page.js:99` — BACKLOG — cull recommendation tip swallowed

`brainsAPI.recommendations().then(r => { ... if (c && c.text) setRecTip(c.text); }).catch(() => {})`. The recommendation tip never appears.

> **Migration:** Backlog, low severity — a tip's absence is genuinely tolerable. Include for completeness.

### `app/studio/store/page.js:18` — BACKLOG — print store products AND orders swallowed (two legs, one line)

`const load = () => { storeAPI.products().then(r => setProducts(r.data.products || [])).catch(() => setProducts([])); storeAPI.orders().then(r => setOrders(r.data.orders || [])).catch(() => {}); }`. Products swallow-to-empty and orders swallow-to-nothing on the same line. The print store renders with no products and no orders — a studio is told it has made no sales.

> **Migration:** Backlog. 'Zero orders' on a revenue surface is the same severity class as invoices:335 — record prominently despite being out of scope.

### `app/studio/portfolio/page.js:264` — BACKLOG — portfolio candidates swallowed to empty

`mediaAPI.portfolioCandidates().then(r => setCands(r.data.candidates || [])).catch(() => setCands([]))`. The AI-suggested portfolio candidates render as none.

> **Migration:** Backlog.

### `app/studio/portfolio/page.js:309` — BACKLOG — portfolio: leads picker swallowed

`leadsAPI.getAll(null).then(r => setLeads(r.data.leads || [])).catch(() => {})`. Client picker empty.

> **Migration:** Backlog. Instance of the shared-LeadPicker duplication noted at studio/page.js:24.

### `app/studio/settings/page.js:40` — BACKLOG — portfolio settings swallowed

`mediaAPI.getPortfolio().then(r => setPf(r.data)).catch(() => {})`. `pf` stays null so the public/private toggle, the vanity share URL and the copy-link button (line 52) all render unconfigured — a live public portfolio appears to not exist.

> **Migration:** Backlog. The public/private control rendering in an unknown state is a privacy-adjacent concern: a user could toggle believing they are enabling something already enabled.

### `app/studio/settings/page.js:42` — BACKLOG — studio settings: leads prefetch swallowed (and result discarded)

`leadsAPI.getAll(null).then(() => {}).catch(() => {})` — the success handler is empty too; the call exists purely as a warm-up and both outcomes are discarded.

> **Migration:** Backlog. Likely dead/vestigial code rather than a real swallow — worth deleting rather than migrating. Flag to the owner as a cleanup, not an ErrorState site.

### `app/studio/settings/page.js:190` — BACKLOG — studio brain fields swallowed

`mediaAPI.brain().then(r => { ...setBrain(b); ...setVals(v); }).catch(() => {})`. The Studio Brain form renders empty; a save from that state overwrites the user's real brain values.

> **Migration:** Backlog, destructive-on-retry.

### `app/studio/settings/page.js:225` — BACKLOG — style list swallowed

`const load = () => studioAiAPI.styles().then(r => setStyles(r.data.styles || [])).catch(() => {})`. Saved AI styles render as none.

> **Migration:** Backlog.

### `app/studio/settings/page.js:265` — BACKLOG — job queue health swallowed to a fabricated empty result

`const load = () => mediaAPI.jobs().then(r => setJ(r.data)).catch(() => setJ({ byStatus: {}, failures: [] }))`. Fabricates a clean job queue: zero jobs in every status, zero failures. This is an operational-health panel, so the swallow reports 'everything is fine' precisely when the backend is not fine.

> **Migration:** Backlog. Inverted-severity case: the swallow produces a falsely REASSURING signal on a monitoring surface. Strongest single example for the proposal's argument that swallows are not merely cosmetic.

### `app/studio/[id]/video/page.js:157` — BACKLOG — AI draft styles swallowed to fabricated empty

`mediaAPI.aiDraftStyles(projectId).then(r => setData(r.data)).catch(() => setData({ styles: [], recommended: [] }))`. Fabricates an empty style set. Note this component HAS a rendered `err` (lines 155, 186) which the load does not use.

> **Migration:** Backlog. Rendered error channel present and unused — cheap future fix.

### `app/studio/[id]/video/page.js:228` — BACKLOG — video template packs swallowed to empty

`mediaAPI.videoTemplates().then(r => setPacks(r.data.templates || [])).catch(() => setPacks([]))`. Template packs render as none. Same unused rendered `err` at lines 226/262.

> **Migration:** Backlog; see item above.

### `app/studio/[id]/video/[timelineId]/page.js:91` — BACKLOG — video presets pre-caught to null inside Promise.all

`Promise.all([mediaAPI.getTimeline(timelineId), mediaAPI.listAssets(id, {limit:500}), mediaAPI.videoPresets().catch(() => null)])`. Presets silently null so the editor renders without export presets.

> **Migration:** Backlog. Deliberate non-fatal leg; disclosure is the missing half, as elsewhere.

### `app/studio/[id]/video/[timelineId]/page.js:97` — BACKLOG — timeline audio assets swallowed

`try { setAudioAssets((await mediaAPI.listAudio(id)).data.audio || []); } catch {}`. The audio library renders empty in the video editor; the user believes they have uploaded no music.

> **Migration:** Backlog.

### `components/NavBar.js:297` — BACKLOG — NavBar notifications: leads leg pre-caught to empty

`leadsAPI.getAll(null).catch(() => ({ data: { leads: [] } }))` inside `loadNotifData`. Today's-new-leads notifications never appear. NavBar wraps nearly every authenticated page, so this swallow is present on almost every screen in the product.

> **Migration:** Backlog, but note the blast radius: NavBar is the single most-rendered component, so its four swallows (297, 298, 311, 320) affect every surface simultaneously. Not an ErrorState target (a nav bar must not shout) — needs a distinct quiet-degradation affordance. Design input for the batch.

### `components/NavBar.js:298` — BACKLOG — NavBar notifications: reminders leg pre-caught to empty

`remindersAPI.getUpcoming().catch(() => ({ data: { reminders: [] } }))`. Urgent reminders (due within 24h, lines 302-306) never surface and the badge count is understated — the user misses time-sensitive follow-ups.

> **Migration:** Backlog; see item above.

### `components/NavBar.js:311` — BACKLOG — NavBar notification feed swallowed

`try { const nr = await notificationsAPI.get(); feedItems = ...; setFeed(feedItems); } catch {}`. The persistent notification feed (contracts signed, bookings, gallery activity) renders empty and `feedUnread` stays 0, so the badge under-reports.

> **Migration:** Backlog; see item above.

### `components/NavBar.js:320` — BACKLOG — NavBar loadNotifData outer swallow

The whole of `loadNotifData` (lines 293-321) ends `} catch {}`. Even with every leg pre-caught, any remaining throw (e.g. the `JSON.parse(localStorage...)` at line 314) silently aborts badge computation entirely.

> **Migration:** Backlog. Belt-and-braces swallow layered over already-swallowing legs — three levels of silence on one code path.

### `components/NavBar.js:327` — BACKLOG — NavBar platform accounts swallowed

`loadPlatformAccounts`: `try { const res = await platformAccountsAPI.getAll(); setPlatformAccounts(res.data.accounts || []); } catch {}`. The account switcher renders empty across the whole app.

> **Migration:** Backlog. Third surface showing the same platformAccounts data with a third independent silent failure (leads-list:738, settings:1719, here).

### `components/SidePanel.js:41` — BACKLOG — side panel calendar swallowed to empty

`remindersAPI.getUpcoming().then(r => setReminders(r.data.reminders || [])).catch(() => setReminders([])).finally(() => setLoading(false))`. The calendar panel renders 'nothing upcoming' during an outage.

> **Migration:** Backlog. SidePanel is also app-wide, same blast-radius note as NavBar.

### `components/SidePanel.js:71` — BACKLOG — side panel tasks swallowed

`myTasksAPI.getAll().then(r => setTasks(r.data.tasks || [])).catch(() => {}).finally(() => setLoading(false))`. The task list renders empty — the user believes their to-do list is clear.

> **Migration:** Backlog.

### `components/SidePanel.js:141` — BACKLOG — side panel quick notes swallowed

`quickNotesAPI.getAll().then(r => setNotes(r.data.notes || [])).catch(() => {}).finally(() => setLoading(false))`. Sticky notes render as none — authored content appears lost.

> **Migration:** Backlog. Perceived data loss of user-authored content.

### `components/ScheduleMeetingModal.js:45` — BACKLOG — integration status swallowed to empty object

`api.get('/integrations/status').then(r => setIntegrations(r.data)).catch(() => setIntegrations({}))`. On failure every integration reads as not-connected, so the modal offers to connect Google Calendar/Calendly the user already connected.

> **Migration:** Backlog. (Excluded from this lens: the `catch {}` at line 89 in the same file guards `navigator.clipboard.writeText`, not a fetch.)

### `components/control/ControlShell.js:47` — BACKLOG — Command Center global search swallowed to empty

`try { const r = await ccApi.search(val.trim()); setResults(r.data.results || []); } catch { setResults([]); }`. Admin global search reports zero matches on failure — an operator investigating an incident concludes the workspace does not exist.

> **Migration:** Backlog. Command Center is admin-only and per the memory notes is partly dead code; verify whether /control is still mounted before spending effort. Search no-results-vs-error again.

### `app/control/customers/page.js:24` — BACKLOG — Command Center workspace list swallowed to empty

`try { const r = await ccApi.workspaces({...}); setRows(r.data.rows); setTotal(r.data.total); } catch { setRows([]); }`. Note `total` is NOT reset, so the pager can claim N results while the table shows none — a visibly inconsistent state.

> **Migration:** Backlog. The unreset `total` makes the inconsistency user-visible, which is (perversely) better than a clean lie. Worth noting.

### `app/control/support/page.js:43` — BACKLOG — support ticket queue swallowed to empty

`try { const r = await ccApi.tickets({ status }); setTickets(r.data.tickets || []); } catch { setTickets([]); }`. The support queue renders empty — an operator concludes there are no open tickets and stops working.

> **Migration:** Backlog. Operational surface where a false empty directly causes inaction.

### `app/control/support/page.js:48` — BACKLOG — support stats swallowed to null

`ccApi.supportStats().then((r) => setStats(r.data)).catch(() => setStats(null))`. Stats panel blank.

> **Migration:** Backlog.

### `app/control/support/page.js:125` — BACKLOG — workspace typeahead swallowed to empty

`ccApi.workspaces({ q: wsQ.trim(), limit: 6 }).then((r) => setWsResults(r.data.rows || [])).catch(() => setWsResults([]))`. Typeahead reports no matching workspace.

> **Migration:** Backlog. Search class again.

### `app/control/support/page.js:199` — BACKLOG — ticket detail swallowed to null

`ccApi.ticket(id).then((r) => setData(r.data)).catch(() => setData(null))`. Ticket detail renders blank with no distinction between a deleted ticket and a failed fetch.

> **Migration:** Backlog.

### `app/control/reports/page.js:21` — BACKLOG — control reports swallowed to empty

`const load = useCallback(() => { ccApi.reports().then((r) => setRows(r.data.reports || [])).catch(() => setRows([])); }, [])`. The table then renders 'No reports yet.' (line 72) — a scheduled-report outage reads as 'you have never created a report'.

> **Migration:** Backlog. The empty-state copy 'No reports yet.' makes an explicit historical claim, which is the exact failure the batch is about.

### `app/control/health/page.js:21` — BACKLOG — workspace health rollup swallowed to empty

`ccApi.health(sort).then((r) => { setRows(r.data.rows); setComputed(r.data.computed); }).catch(() => setRows([]))`. A health-monitoring table that renders empty on failure — and `computed` is left stale, so the 'last computed at' timestamp can describe data that is no longer displayed.

> **Migration:** Backlog. Second monitoring surface (with studio/settings:265) whose swallow produces a falsely reassuring reading.

### `app/control/events/page.js:12` — BACKLOG — control event stream initial load swallowed

`ccApi.events({ limit: 150 }).then((r) => setEvents(r.data.events)).catch(() => {})`. The event log renders empty. The SSE tail's own frame parse is also swallowed at line 23 (`catch {}`) and `es.onerror` (line 25) only flips a `live` boolean without explaining anything.

> **Migration:** Backlog. Combined effect: an empty event log with a quiet 'not live' dot, which reads as a calm system.

### `app/control/database/page.js:23` — BACKLOG — DB table list swallowed to empty

`ccApi.dbTables().then((r) => setTables(r.data.tables || [])).catch(() => setTables([]))`. The database browser lists no tables.

> **Migration:** Backlog.

### `app/control/database/page.js:31` — BACKLOG — DB table detail swallowed to null

`.catch(() => setDetail(null))` on the table-detail fetch. Detail pane blank.

> **Migration:** Backlog. Note the same file DOES render `sqlError` properly (lines 19, 195-197) for the query runner — surfaced for writes, silent for reads, one more time.

### `app/control/flags/page.js:13` — BACKLOG — feature flags swallowed to empty

`ccApi.flags().then((r) => setFlags(r.data.flags)).catch(() => setFlags([])).finally(() => setLoading(false))`. The flag list renders empty — an operator concludes no flags are defined and could create duplicates or wrongly assume a feature is off.

> **Migration:** Backlog. Flags govern behaviour, so a false empty here can drive a wrong operational decision.

### `app/control/audit/page.js:11` — BACKLOG — control audit log swallowed to nothing

`ccApi.audit({ limit: 200 }).then((r) => setRows(r.data.audit)).catch(() => {})`. Admin audit trail renders empty.

> **Migration:** Backlog, Security priority — second audit surface that fabricates an empty trail (with settings:1209).

### `app/control/plans/page.js:14` — BACKLOG — plan list swallowed to empty

`.catch(() => setPlans([]))` on the plans fetch. The pricing-plan admin renders no plans, which could lead an operator to believe entitlements are unconfigured.

> **Migration:** Backlog. Touches the pricing-engine work; a false 'no plans' reading is billing-adjacent.

### `app/control/customers/[id]/page.js:19` — BACKLOG — plan options for the plan-change control swallowed

`ccApi.plans().then((r) => setPlanOpts(r.data.plans.map((p) => p.key))).catch(() => {})`. The plan dropdown renders empty so an operator cannot change a customer's plan and is told nothing. Note the page's MAIN load (line 16) correctly sets `err` and renders it (line 23) — the primary path is honest and only this secondary one is silent.

> **Migration:** Backlog. Clean in-file contrast between a handled primary load and a silent secondary one; useful as a proposal example.

### `app/control/storage/page.js:19` — BACKLOG — storage-by-workspace swallowed

`ccApi.storageWorkspaces().then((r) => setWs(r.data.workspaces || [])).catch(() => {})`. The per-workspace storage table renders empty while the page's primary overview (line 18) correctly sets and renders `err` (line 24).

> **Migration:** Backlog. Same handled-primary/silent-secondary contrast as control/customers/[id]:19.

### `app/control/storage/page.js:20` — BACKLOG — storage-by-plan swallowed

`ccApi.storageByPlan().then((r) => setByPlan(r.data.by_plan || [])).catch(() => {})`. By-plan storage breakdown renders empty.

> **Migration:** Backlog; see item above.

### `app/control/storage/page.js:21` — BACKLOG — fastest-growing workspaces swallowed

`ccApi.storageFastestGrowing().then((r) => setFastest(r.data.workspaces || [])).catch(() => {})`. The growth panel renders empty, reading as 'no workspace is growing'.

> **Migration:** Backlog; see item above. Three silent secondaries around one honest primary in a single 25-line file.

### `app/g/[token]/page.js:57` — BACKLOG — client gallery: outage rendered as 404 (miscategorised)

`catch { setNotFound(true); }` in the public client-gallery loader. The function already distinguishes real conditions (`res.status === 404` -> setNotFound at line 49, `401` -> setNeedsPw at line 50), then the catch collapses every network/5xx failure into the same 'not found'. The photographer's CLIENT — an external person — is told the gallery does not exist. They may tell the photographer the link is broken.

> **Migration:** Backlog, but reputationally the highest-stakes instance: the audience is the customer's customer. The 404 vs 401 branches prove the author was already distinguishing causes; the catch undoes it. Public/token surfaces deserve their own honest ErrorState variant ('something went wrong, try again' vs 'this link is invalid').

### `app/g/[token]/page.js:105` — BACKLOG — gallery export poll swallowed to an empty object

`const s = await fetch(...).then(r => r.json()).catch(() => ({}))` inside a 2s poll. A failed poll yields `{}`, which matches neither 'ready' nor 'failed', so the poll silently burns through its 40-try budget (line 107) and only then reports a generic error — roughly 80 seconds of a spinner that could have failed immediately.

> **Migration:** Backlog. Distinct sub-class: the swallow converts a fast failure into a long, silent, misleading wait. Relevant to the Spinner primitive's design (a spinner with no timeout story is part of the problem).

### `app/client/[token]/page.js:29` — BACKLOG — client portal: outage rendered as 'missing'

`fetchClientPortal(token).then(d => { setData(d); setState('ok'); ... }).catch(() => setState('missing'))`. Any failure — expired token, 500, network — renders the same 'portal not found' page to the photographer's client.

> **Migration:** Backlog. One of five public/token surfaces collapsing all failures to 'missing' (this, shop:18, pay:14, book:24, booking/manage:23). Handle as one family with one honest public ErrorState if a future batch takes them.

### `app/shop/[token]/page.js:18` — BACKLOG — public shop: outage rendered as 'missing'

`fetchShop(token).then(...).catch(() => setState('missing'))`. A client trying to buy prints is told the shop does not exist — a directly lost sale during a transient outage.

> **Migration:** Backlog. Revenue-affecting; highest commercial severity of the five token surfaces.

### `app/pay/[token]/page.js:14` — BACKLOG — public payment page: outage rendered as 'missing'

`fetchPayment(token).then(d => { setP(d); setState('ok'); }).catch(() => setState('missing'))`. A customer trying to pay an invoice is told the payment link does not exist.

> **Migration:** Backlog. Revenue-affecting and trust-affecting — an invalid-looking payment link reads as a scam signal to the payer. Arguably the single most damaging item in the whole sweep by consequence, despite being far outside scope. Escalate separately.

### `app/book/[slug]/page.js:24` — BACKLOG — public booking page: outage rendered as 'missing'

`fetchBookingPublic(slug).then(...).catch(() => setState('missing'))`. A prospect trying to book is told the booking page does not exist — a lost lead. (The booking submit path at line 34 DOES set and render `err`, lines 20/96.)

> **Migration:** Backlog. Same handled-write/silent-read asymmetry, this time on a public acquisition surface.

### `app/booking/manage/[token]/page.js:23` — BACKLOG — booking management: outage rendered as 'missing'

`const load = () => fetchBookingManage(token).then(d => { setData(d); setState('ok'); }).catch(() => setState('missing'))`. A client trying to reschedule is told their booking does not exist — they may assume it was cancelled. (The reschedule mutation at line 29 correctly sets `msg`.)

> **Migration:** Backlog. Completes the five-surface public/token family.

### `app/d/[token]/page.js:35` — BACKLOG — public document view: expired vs missing, everything else is 'missing'

`.catch(e => setState(e.message === 'expired' ? 'expired' : 'missing'))`. Better than its siblings — it distinguishes expiry — but every other failure including 5xx still renders 'missing'. A signer sent a contract link is told during an outage that the document does not exist.

> **Migration:** Backlog. The best of the token-surface family and still one branch short. Good template for what the honest version looks like: add an `'error'` state alongside `'expired'`/`'missing'`.

### `hooks/usePushNotifications.js:114` — OPPOSITE DEFECT — error state set on every failure, returned, and never consumed anywhere

The hook declares `const [error, setError] = useState(null)` (line 20) and returns `{ supported, permission, subscribed, loading, error, subscribe, unsubscribe, sendTest }` (line 114). A repo-wide grep for `usePushNotifications` returns exactly ONE hit — the export at line 15 of the file itself. The module has zero importers: every error it carefully records is written to a state that no component ever reads or renders. Separately, its own line 37 is a `} catch {}`. The live push-subscription UI in app/settings/page.js (lines 770-800+) reimplements the same logic inline and does not use this hook.

> **Migration:** This is the purest instance of the opposite defect in the codebase — errors captured with care, rendered nowhere, because the consumer does not exist. NOT a Batch E target (out of scope, and the fix is deletion not migration). Recommend recording as a dead-code cleanup: either delete the hook or adopt it in settings, per the Constitution's Deprecation Policy (Article 11). Verify against the desktop/PWA work before deleting in case it is a planned consumer.

### `app/folio/[handle]/page.js:17` — OPPOSITE DEFECT — an 'error' state is computed, then rendered identically to 'missing'

`.catch((e) => { if (on) setState(e.message === 'not_found' ? 'missing' : 'error'); })`. The author explicitly distinguishes a real 404 from any other failure and stores `'error'`. The render then throws the distinction away: line 21 handles `'loading'`, line 24 is `if (state !== 'ok')` and paints one screen — the heading 'Portfolio not found' with the copy 'This portfolio may be private or the link may be incorrect.' (lines 27-28). The `'error'` value is never tested for anywhere in the file; even the state comment on line 11 (`// loading | ok | missing`) omits it. Net effect on a public vanity portfolio link: during an outage a prospective client is told the photographer's portfolio does not exist and is nudged toward 'the link may be incorrect'.

> **Migration:** The cleanest error-set-but-never-rendered case: the value exists, is correct, and is one `if` away from being useful. Out of Batch E scope (public portfolio is not an approved adopter) but it is the ideal one-line demonstration for the proposal — the distinction is already computed and simply not rendered. Also note line 22 defines a NINETEENTH spin keyframe under a different name, `@keyframes pfspin`, which the 18-count `@keyframes spin` sweep does not catch — include it in the dedup work or it will survive the cleanup unnoticed.


## Lens 4 — Loading states & skeleton targets — 94 sites

How each surface behaves while fetching, plus the exact geometry each SkeletonRow must mimic.

### `components/ui/Spinner.js:17` — Spinner primitive ALREADY EXISTS (built concurrently, mid-sweep)

Written at 13:12 while this sweep was running (every other file is 13:01). Signature: Spinner({size='md'|'sm'|'lg', label='Loading', showLabel=false, center=false, style, ...rest}). SIZE={sm:14,md:20,lg:32}, BORDER={sm:2,md:2.5,lg:3}. Wrapper is role="status" + aria-label; the ring is aria-hidden with animation:'spin 0.7s linear infinite' and borderTopColor var(--accent). center=true gives width:100% + padding:'48px 0'.

> **Migration:** Do NOT rebuild. Note the ring uses 0.7s while every existing call site uses 0.8s (and reports/knowledge use 1s) — adopting Spinner silently retimes those spinners. That is acceptable (it is the point of one primitive) but should be called out in the batch report rather than discovered visually. Verify it is exported default and that no page re-declares @keyframes spin after adopting it.

### `components/ui/EmptyState.js:24` — EmptyState primitive ALREADY EXISTS (built concurrently)

EmptyState({icon, title, description, action:{label,onClick}, filtered=false, compact=false, children, style}). Renders CTA through the Button primitive (variant='secondary' when filtered, 'primary' otherwise). Tokens used: --radius-lg, --accent-bg, --accent-fg, --surface2, --text-dim, --fs-lg/--fs-body/--fs-body-sm, --fw-bold. All 10 verified present in app/globals.css.

> **Migration:** Do NOT rebuild. The `filtered` prop is the key affordance for this batch: leads-list and clients both need the two-variant split (empty list vs. empty filter result); invoices currently has NO such split and must gain one.

### `components/ui/ErrorState.js:19` — ErrorState primitive ALREADY EXISTS (built concurrently)

ErrorState({title='Could not load this', description, detail, onRetry, retryLabel='Try again', compact, style}). role="alert", AlertTriangle icon, --danger-bg/--danger-fg tint, retry rendered via Button variant='secondary'. `detail` surfaces the technical message de-emphasised at --fs-caption.

> **Migration:** Do NOT rebuild. Every swallowed-catch finding below (items for clients:41, leads-list:756, invoices:335-336, vault:28) resolves to: capture the error into state, then branch to <ErrorState onRetry={load} detail={e.message} /> BEFORE the empty-state branch.

### `components/ui/Button.js:57` — Button already consumes the globals `.spin` class — the precedent to follow

`{loading && <RefreshCw size={15} className="spin" aria-hidden="true" />}`. Button's own busy indicator rides app/globals.css:299 `.spin { animation: spin 0.8s linear infinite; }` and declares no keyframes of its own.

> **Migration:** Reference, not a migration target. Any inline `<button>` in an adopter that currently hand-rolls a 14px rotating div (leads-list:237, leads-list:265) should become <Button loading> rather than <Button><Spinner size="sm"/></Button> — Button already owns that affordance.

### `app/globals.css:285` — THE canonical @keyframes spin — the one survivor

`@keyframes spin { to { transform: rotate(360deg); } }`. Global, loaded on every route via app/layout.js.

> **Migration:** KEEP. This is the single declaration Spinner.js and Button.js ride. All 17 duplicates below get deleted against this.

### `app/globals.css:299` — `.spin` utility class — the shared consumer

`.spin { animation: spin 0.8s linear infinite; }`. Consumed by Button.js:57, RoomPanel.js:80, settings/page.js:148.

> **Migration:** KEEP. Skeleton/Spinner adoption must not orphan this — three live consumers.

### `app/globals.css:288` — @keyframes pulse — the ONLY shimmer-adjacent animation that exists

`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`. Already duplicated at dashboard/page.js:1337, leads/[id]/page.js:2795, knowledge/page.js:264 (0.5 not 0.4), and studio.css:351 as ms-pulse (0.5→1).

> **Migration:** Skeleton.js MUST reuse this existing `pulse` keyframe rather than introduce a new `shimmer`/`skeleton-pulse` keyframe — otherwise Batch E deletes 17 spin duplicates while creating a fresh animation-duplication problem in the same commit. A pure opacity pulse also degrades gracefully under prefers-reduced-motion (add that media query in Skeleton.js).

### `components/ui/Badge.js:1` — NO Skeleton.js / SkeletonRow.js exists yet — and no shimmer anywhere in the codebase

Anchored here because the file is absent. A full-tree grep for `skeleton|Skeleton|shimmer|sk-|placeholder-glow` returns ZERO real matches across all 85 source files (the only hits are CSS `mask-image` on page.js:2342, login/page.js:297, signup/page.js:336 — unrelated). There is no prior skeleton, shimmer, or content-placeholder implementation to extend.

> **Migration:** Greenfield — build, do not extend. Only Skeleton.js + SkeletonRow.js are missing from Batch E's four-file scope.

### `components/AICommandCenter.js:373` — Duplicate @keyframes spin #1

Inside a <style> block alongside @keyframes slideUp (line 372). Consumed twice in this file.

> **Migration:** Delete the spin line only; keep slideUp. Verify the two spin consumers in this file still animate off globals.

### `app/whatsapp/page.js:312` — Duplicate @keyframes spin #2

`from{rotate(0deg)} to{rotate(360deg)}` long form. Consumer at line 261 (RefreshCw, reconnecting).

> **Migration:** Delete. Functionally identical to the globals `to{}` short form.

### `app/leads-list/page.js:1330` — Duplicate @keyframes spin #3 — inside an APPROVED adopter

`<style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>` rendered at the very bottom of the page tree, outside the main <div> but inside <NavBar>. Feeds the two inline modal spinners at lines 237 and 265.

> **Migration:** Delete as part of the leads-list migration. Both consumers (237, 265) become <Button loading> in the same edit, so nothing is left needing it.

### `app/dashboard/page.js:882` — Duplicate @keyframes spin #4

Inside the early-return full-page loading block (lines 876-884).

> **Migration:** Delete when/if dashboard adopts Spinner. Dashboard is NOT an approved Batch E adopter — the keyframes deletion is still in scope (proposal says delete duplicates), but do it as a pure deletion without touching dashboard's markup, since globals already supplies spin.

### `app/dashboard/page.js:1336` — Duplicate @keyframes spin #5 (second one in the same file)

A second declaration in the main render's <style> block, alongside duplicate pulse (1337), slideUp (1338), fadeSlideIn (1339), notifPop (1340).

> **Migration:** Delete the spin line and the pulse line (1337 duplicates globals:288); keep slideUp/fadeSlideIn/notifPop which are page-local.

### `app/leads/[id]/page.js:1180` — Duplicate @keyframes spin #6

Inside the `if (loading) return (…)` full-page spinner block (1174-1182).

> **Migration:** Delete.

### `app/leads/[id]/page.js:2794` — Duplicate @keyframes spin #7 (second in the same file)

Main-render <style> block, next to duplicate pulse at 2795.

> **Migration:** Delete both spin (2794) and pulse (2795) — both duplicate globals.

### `app/knowledge/page.js:263` — Duplicate @keyframes spin #8

<style> block with duplicate slideIn (262) and duplicate pulse (264, uses 0.5 vs globals 0.4). Four consumers: lines 288, 299, 346, 370.

> **Migration:** Delete spin. Leave the 0.5-opacity pulse alone or reconcile it deliberately — it is a visual delta, not a pure dedupe.

### `app/invoices/page.js:508` — Duplicate @keyframes spin #9 — inside an APPROVED adopter

Bottom of the page render. Sole consumer is the full-panel loading spinner at line 468.

> **Migration:** Delete as part of the invoices migration — line 468 becomes SkeletonRow, so the keyframes has zero remaining consumers in this file.

### `app/studio/[id]/albums/[albumId]/page.js:188` — Duplicate @keyframes spin #10 — plus a shadowing `.spin` class

`<style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>` — redeclares BOTH the keyframes and the `.spin` utility, and at 1s instead of the globals 0.8s.

> **Migration:** Highest-risk deletion in the set: removing this changes `.spin` timing here from 1s to 0.8s for any element in this subtree. Delete both declarations, then eyeball this page.

### `app/settings/page.js:2351` — Duplicate @keyframes spin #11

Long form, alongside duplicate slideIn (2350). Six consumers in this file: 148 (className), 1952, 1985, 1992, 1999, 2024.

> **Migration:** Delete spin and slideIn (both duplicate globals). Settings is not a Batch E adopter — deletion only.

### `app/reports/page.js:614` — Duplicate @keyframes spin #12

Long form. Consumer at line 343 (RefreshCw at 1s in the full-page analytics loader).

> **Migration:** Delete.

### `app/profile/page.js:120` — Duplicate @keyframes spin #13

Inside the `if (loading)` early-return block (112-123).

> **Migration:** Delete.

### `app/profile/page.js:327` — Duplicate @keyframes spin #14 (second in the same file)

Main render, combined with a page-local slideIn (translateX variant — NOT the globals translateY slideIn).

> **Migration:** Delete only the spin half of that template literal; the translateX slideIn is genuinely local and must survive.

### `app/accept-invite/page.js:55` — Duplicate @keyframes spin #15

Inside the `if (loading)` early-return (49-58).

> **Migration:** Delete. Public/unauthed route — still gets globals.css via the root layout, so safe.

### `app/accept-invite/page.js:185` — Duplicate @keyframes spin #16 (second in the same file)

Main render <style>.

> **Migration:** Delete.

### `app/chat/page.js:1175` — Duplicate @keyframes spin #17 — the last one

Main render <style> block.

> **Migration:** Delete. This closes the set at 17 deletions — the proposal estimated 14, so the batch report must state the corrected number (17 literal `spin` duplicates, plus globals:285 kept).

### `app/globals.css:285` — COUNT CORRECTION: 18 declarations of `@keyframes spin` exist, not 15

Full census: globals.css:285 (canonical) + 17 duplicates (AICommandCenter:373, whatsapp:312, leads-list:1330, dashboard:882, dashboard:1336, leads/[id]:1180, leads/[id]:2794, knowledge:263, invoices:508, studio/[id]/albums/[albumId]:188, settings:2351, reports:614, profile:120, profile:327, accept-invite:55, accept-invite:185, chat:1175).

> **Migration:** The proposal's estimate of 14 is LOW by 3. Do not let the implementation stop at 14 and declare done — the acceptance check should be `grep -c '@keyframes spin' src` returning exactly 1.

### `components/FloatingChat.js:340` — Aliased spin keyframes: `fcSpin` — outside the literal-name sweep

`@keyframes fcSpin { to { transform: rotate(360deg); } }` — byte-identical rotation under a private name, so it does not appear in a `@keyframes spin` grep.

> **Migration:** OUT OF SCOPE for Batch E's stated deletion (which names `spin`), but must be listed in the report as known remaining debt — otherwise a future reader sees `grep '@keyframes spin' == 1` and wrongly concludes rotation animation is fully consolidated. 14 aliased declarations total (this + the 13 below).

### `components/ScheduleMeetingModal.js:307` — Aliased spin keyframes: `sm-spin`

Consumers at lines 205 and 233 (Loader2 className="sm-spin").

> **Migration:** Deferred debt — record, do not delete this batch.

### `components/HuddleModal.js:217` — Aliased spin keyframes: `hd-rot` (+ `.hd-spin` class)

`.hd-spin { animation: hd-rot 1s linear infinite; } @keyframes hd-rot { to { transform: rotate(360deg); } }`. Consumer at line 164 (connecting phase).

> **Migration:** Deferred debt.

### `app/login/page.js:566` — Aliased spin keyframes: `auth-spin`

Unauthed auth shell keeps its own rotation name.

> **Migration:** Deferred debt. Login/signup are deliberately styled apart from the app shell — reconcile only with an explicit decision.

### `app/signup/page.js:623` — Aliased spin keyframes: `auth-spin` (second copy)

Duplicate of login's declaration, in a separate file.

> **Migration:** Deferred debt.

### `app/g/[token]/page.js:304` — Aliased spin keyframes: `gspin`

Bundled into a <style> that also @imports a Google font — public gallery route.

> **Migration:** Deferred debt. Public token route; theming is intentionally independent.

### `app/folio/[handle]/page.js:22` — Aliased spin keyframes: `pfspin`

Public portfolio loader; hardcoded #000 ring, not tokens.

> **Migration:** Deferred debt — public portfolio deliberately does not inherit app tokens.

### `app/client/[token]/page.js:32` — Aliased spin keyframes: `csp` (copy 1 of 6)

`if (state === 'loading') return <div style={center}><div style={spinner} /><style>{`@keyframes csp{…}`}</style></div>;` — one identical line copy-pasted across six public token routes.

> **Migration:** Deferred debt, but the single highest-value cleanup after Batch E: six byte-identical loaders that could share one <PublicLoading/>.

### `app/d/[token]/page.js:80` — Aliased spin keyframes: `csp` (copy 2 of 6)

Same copy-pasted public loader.

> **Migration:** Deferred debt.

### `app/booking/manage/[token]/page.js:37` — Aliased spin keyframes: `csp` (copy 3 of 6)

Same copy-pasted public loader.

> **Migration:** Deferred debt.

### `app/book/[slug]/page.js:37` — Aliased spin keyframes: `csp` (copy 4 of 6)

Same copy-pasted public loader.

> **Migration:** Deferred debt.

### `app/shop/[token]/page.js:38` — Aliased spin keyframes: `csp` (copy 5 of 6)

Same copy-pasted public loader.

> **Migration:** Deferred debt.

### `app/pay/[token]/page.js:16` — Aliased spin keyframes: `csp` (copy 6 of 6)

Same copy-pasted public loader — on the PAYMENT route.

> **Migration:** Deferred debt.

### `app/studio/studio.css:352` — Aliased spin keyframes: `ms-spin` (+ `.ms-spin` at 353)

Media Studio's own design language; also owns `.ms-loading` (line 344) and `ms-pulse` (351).

> **Migration:** Deferred and arguably PERMANENT — studio.css is a deliberate parallel design language. Do not fold into Spinner without an explicit ADR.

### `app/clients/page.js:41` — APPROVED DEFECT: clients swallows the fetch error into a bare `catch {}`

`try { const r = await leadsAPI.getAll({ client: 1 }); setClients(r.data.leads || []); } catch {}` then `setLoading(false)` on line 42. On any failure `clients` stays `[]`, so line 88's `clients.length === 0` branch fires and the user is shown the confident empty state at 89-94: a 52px UserCheck tile, "No clients yet", and a CTA telling them to go win a deal. A backend outage is rendered as "you have no customers".

> **Migration:** THE headline fix of Batch E. Add `const [error, setError] = useState(null)`; `catch (e) { setError(e); }`; then order the render branches strictly: loading → error → empty → filtered-empty → list. Render `<ErrorState onRetry={load} detail={error.message} />`. Note load() is also called on mount only (line 35) so onRetry must call load() and clear error first.

### `app/clients/page.js:24` — clients `loading` state — initialised true

`const [loading, setLoading] = useState(true)`; set true at 40, false at 42 (unconditionally, outside the try — so it clears even on throw).

> **Migration:** Keep the state; add a sibling `error` state. Do not move setLoading into the try.

### `app/clients/page.js:87` — clients renders a bare text line while loading — no spinner, no skeleton

`<p style={{color:'var(--text-muted)',fontSize:14,padding:'40px 0'}}>Loading clients…</p>`. The cards grid below is `repeat(auto-fill, minmax(300px,1fr))` (line 98), so the paragraph collapses to ~60px and the whole grid snaps in — a visible layout jump on every load.

> **Migration:** clients is an approved ADOPTER but NOT one of the three approved Skeleton targets. Replace with `<Spinner size="lg" center label="Loading clients" />`. Do not silently add a card skeleton here — that would exceed approved scope.

### `app/clients/page.js:89` — clients empty state — hand-rolled, to become EmptyState

Lines 89-94: dashed-border box, radius 16, padding clamp(50px,10vh,110px) 20px; 52x52 radius-14 --accent-light tile with UserCheck size=24; h2 "No clients yet" (20px/800); body copy with a <strong> inside; CTA button `Go to Leads` + ArrowRight using the local `btnPrimary` object (line 156).

> **Migration:** → <EmptyState icon={UserCheck} title="No clients yet" description={…} action={{label:'Go to Leads', onClick:()=>router.push('/leads-list')}} />. Two deltas to accept explicitly: (a) the dashed border is lost — EmptyState has no border; (b) the <strong>Move to Clients</strong> inline emphasis must become plain text or go through `children`, since `description` renders a plain string.

### `app/clients/page.js:96` — clients filtered-empty state — the `filtered` EmptyState variant

`<p …>No clients match “{query}”.</p>` — a bare paragraph, visually unrelated to the rich empty state 7 lines above. Correctly distinguishes empty-list from empty-filter, which invoices does NOT.

> **Migration:** → <EmptyState filtered icon={Search} title={`No clients match “${query}”`} action={{label:'Clear search', onClick:()=>setQuery('')}} />. This adds a Clear affordance that does not exist today — a small scope addition worth flagging in the report.

### `app/clients/page.js:156` — clients local `btnPrimary` / `btnGhost` style objects feeding the empty-state CTA

`btnPrimary` (156) and `btnGhost` (157) — hardcoded padding 9px 15px, radius 10, background var(--accent), fontSize 13/fontWeight 700. Used at lines 93 (empty-state CTA), 129, 130, 131.

> **Migration:** EmptyState's CTA goes through Button automatically. The other three call sites (129/130/131) are card row actions — migrating them is Button/Batch-B territory, not Batch E. Leave btnPrimary/btnGhost in place if only line 93 is absorbed; delete them only if all four call sites move.

### `app/leads-list/page.js:699` — leads-list `loading` state — the primary Skeleton driver

`const [loading, setLoading] = useState(true)` on the main page component. Cleared only in fetchAll's `finally` (line 756).

> **Migration:** Drives the SkeletonRow branch at 1140.

### `app/leads-list/page.js:756` — leads-list swallows fetch failure to console — falls through to "No leads found"

`} catch (e) { console.error(e); } finally { setLoading(false); }`. Uses Promise.allSettled (744-748) so per-call rejection is already tolerated and each `if (…status === 'fulfilled')` simply skips — meaning a total leads-API outage leaves `allLeads` at `[]` and renders the empty state at 1142-1147 ("No leads found"), identical to a genuinely empty pipeline.

> **Migration:** Because of allSettled the fix is finer-grained than clients': set error state when `leadsRes.status === 'rejected'` specifically (tags/workspace failing should NOT blank the list). Then branch loading → leadsError → empty → rows.

### `app/leads-list/page.js:1140` — SKELETON TARGET 1 of 3 — leads-list table body while loading

Today: `<div style={{padding:60, textAlign:'center', color:'var(--text-dim)', fontSize:14}}>Loading leads...</div>` — a single ~104px-tall centred text line inside a table shell whose header (1128) is already painted. When rows arrive the body jumps from 104px to N×~58px. Classic layout shift on the app's busiest surface.

> **Migration:** Replace with 8 × <SkeletonRow variant="leads" />. See the next item for the exact geometry the skeleton must reproduce.

### `app/leads-list/page.js:1155` — SKELETON TARGET 1 — exact leads row geometry SkeletonRow must mimic

Row container: `display:grid; gridTemplateColumns:'40px 2fr 1.2fr 1fr 1fr 1.4fr 1fr 1fr 40px'; alignItems:center; padding:'12px 16px'; borderBottom:'1px solid var(--border)'` (last row none), className="r-tw" (mobile table-wrap). Header at 1128 uses the IDENTICAL 9-column template with padding '12px 16px'. Cell contents, left to right: (1) 16px checkbox square; (2) AVATAR 34x34 radius 10 + 10px gap + a two-line stack: name 14px/700 then a 2px-margin row of a 10px platform pill (~90px wide, radius 20) and a 10px date — this column sets the row height; (3) 11px Phone icon + 12px text; (4) Badge (dot variant) + optional 10px AI-score chip stacked with 4px gap; (5) 12px MessageSquare + 13px count; (6) tag chips (variable, 3px gap) + TagPicker; (7) assigned pill 11px, padding 3px 9px, radius 20 — or an em-dash; (8) value text 13px/800; (9) 15px ChevronRight. Effective row height ≈ 58-60px (34px avatar + 24px vertical padding).

> **Migration:** SkeletonRow for leads MUST use the same 9-column grid string and the same '12px 16px' padding, and MUST include the 34x34 radius-10 avatar block — that block, not the text, determines row height. Suggested bars: col2 = 34x34 circle-ish block + (110px x 13px) over (70px x 9px); col3 = 90x11; col4 = 64x18 pill; col5 = 30x11; col6 = two 44x14 pills; col7 = 60x16 pill; col8 = 50x13; cols 1/9 empty. Render exactly 8 rows and give the wrapper the same borderBottom treatment so the shell does not resize when real rows land.

### `app/leads-list/page.js:1142` — leads-list empty state — needs the empty/filtered SPLIT

Lines 1142-1147: padding 60, centred; Users icon 36x36 in var(--border); "No leads found" 14px/600; and CONDITIONALLY, when `(search || hasFilters)`, a bare-text "Clear all filters" button that resets 6 filters at once (search, tagFilter, assignedFilter, dateFrom, dateTo, statusFilter).

> **Migration:** Split into two EmptyState calls driven by the SAME `(search || hasFilters)` condition already present: filtered → <EmptyState filtered icon={Search} title="No leads match those filters" action={{label:'Clear all filters', onClick:resetAll}} />; otherwise → <EmptyState icon={Users} title="No leads yet" description=… />. Extract the 6-setter reset into a named `clearAllFilters()` first — inlining it into the action prop keeps a 6-statement arrow inside JSX.

### `app/leads-list/page.js:1128` — leads-list table header stays painted during load — the skeleton anchor

Header grid renders unconditionally above the loading/empty/rows ternary, so column widths are already established before the body resolves.

> **Migration:** Good news for the skeleton: it only needs to match the body, not re-render the header. Do NOT wrap the header in the loading branch.

### `app/leads-list/page.js:237` — leads-list BulkAssignModal — hand-rolled 14px button spinner

`{loading ? <><div style={{width:14,height:14,border:'2px solid rgba(255,255,255,0.4)',borderTopColor:'white',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} /> Assigning…</> : …}` — plus a hardcoded `#a5b4fc` disabled background and a gradient enabled background on 233-234.

> **Migration:** → <Button loading={loading}>Assign N Leads</Button>. Button already renders the spinning RefreshCw. This is one of the two consumers keeping the page-local @keyframes spin (1330) alive.

### `app/leads-list/page.js:265` — leads-list BulkTrashModal — second hand-rolled 14px button spinner

Byte-identical spinner div to line 237, with `#9ca3af` disabled bg and `#ef4444` danger bg, label "Moving…".

> **Migration:** → <Button variant="danger" loading={loading}>Move to Trash</Button>. NOTE: Batch B's open question about a missing `success`/`danger` Button variant applies here — confirm a danger variant exists before migrating, or leave this one and delete only the 237 spinner (in which case @keyframes spin at 1330 must STAY). Do not delete 1330 until both consumers are gone.

### `app/leads-list/page.js:427` — leads-list secondary loading: `loadingAccounts` — text-only

State at 279 (`useState(true)`), cleared in `.finally()` at 309. Renders at 428: `<div style={{padding:14, background:'var(--surface2)', borderRadius:12, fontSize:13, color:'var(--text-dim)'}}>Loading connected WhatsApp accounts…</div>` inside the filter panel.

> **Migration:** Low value, in-file. → <Spinner size="sm" showLabel label="Loading connected WhatsApp accounts" /> inside the same padded box, or leave as-is. Migrating it is optional; if skipped, say so explicitly rather than leaving it undocumented.

### `app/leads-list/page.js:186` — leads-list micro-empty: "No active members found"

`<p style={{fontSize:13, color:'var(--text-dim)', textAlign:'center', padding:'16px 0'}}>No active members found</p>` inside BulkAssignModal's member picker.

> **Migration:** → <EmptyState compact title="No active members" /> — the `compact` variant exists precisely for in-modal cases like this. Optional; call it out either way.

### `app/leads-list/page.js:652` — leads-list micro-empty: MergeDuplicatesModal result state

`{doneCount > 0 ? 'All cleaned up!' : 'No duplicates found'}` at 14px/700 — a success state and an empty state sharing one node.

> **Migration:** Leave alone. This is a dual-purpose success/empty node; forcing it through EmptyState would misrepresent the success case. Document as deliberately skipped.

### `app/leads-list/page.js:982` — leads-list bulk-status loop swallows every per-item failure

`for (const id of ids) { try { await leadsAPI.updateStatus(id, { status }); } catch {} }` — a 20-lead bulk update where 19 fail reports the same success toast as one where all 20 succeed.

> **Migration:** OUT OF BATCH E SCOPE (this is a mutation-result problem, not a loading-state one) — ErrorState is a fetch-failure primitive and does not fit a bulk-write partial failure. Record as a separate finding for a later batch; do not fix here.

### `app/leads-list/page.js:1008` — leads-list bulk set-client loop swallows every per-item failure

`for (const id of ids) { try { await leadsAPI.setClient(id, true); } catch {} }` — same partial-failure blindness as line 982.

> **Migration:** OUT OF BATCH E SCOPE. Record alongside 982.

### `app/invoices/page.js:326` — invoices `loading` state — the second Skeleton driver

`useState(true)`, cleared only in `.finally(() => setLoading(false))` at line 340.

> **Migration:** Drives the SkeletonRow branch at 466.

### `app/invoices/page.js:335` — invoices masks BOTH fetch failures as empty results — at the call site

`invoicesAPI.getAll().catch(() => ({ data: { invoices: [] } }))` and `settingsAPI.getCompany().catch(() => ({ data: { company: {} } }))`. The error is converted to a valid-looking empty payload before it can ever reach state, so the page cannot distinguish outage from zero-invoices. Downstream consequence: line 383-384 compute totalRevenue/totalPending from `[]`, so the four stat cards (419-436) confidently display $0 Paid Revenue and $0 Pending during an outage.

> **Migration:** Worse than the clients case because it fabricates zero MONEY figures, not just an empty list. Fix: keep the .catch but record which one failed — `.catch(e => { setLoadErr(e); return {data:{invoices:[]}}; })` — and branch to ErrorState. Critically, the stat cards at 419-436 must ALSO be suppressed (or skeletoned) when loadErr is set; fixing only the table still leaves four lying $0 cards on screen.

### `app/invoices/page.js:466` — SKELETON TARGET 2 of 3 — invoices table body (full-panel spinner today)

Lines 466-470: `padding:'60px 0'` centred block with a 36x36 3px ring (borderTopColor #6366f1 hardcoded, animation 'spin 0.8s') plus "Loading invoices...". Total ~132px tall; real content is N×~58px. This is the clearest "full-page spinner where a skeleton belongs" in the approved scope — the table header (460) is already painted above it, so the columns are known and a skeleton is trivially correct.

> **Migration:** Replace the whole 466-470 block with 6 × <SkeletonRow variant="invoice" />. Deleting it removes the only consumer of the page-local @keyframes spin at line 508, so that deletion becomes safe in the same edit. Also drop the hardcoded #6366f1.

### `app/invoices/page.js:480` — SKELETON TARGET 2 — exact invoice row geometry SkeletonRow must mimic

Row: `display:grid; gridTemplateColumns:'50px 1fr 130px 120px 110px 200px'; padding:'14px 20px'; borderBottom:'1px solid var(--border)'` (last row none). Header at 460 uses the SAME template with padding '12px 20px' and lives in a `.r-scroll-x` wrapper (459). Cells: (1) index number 13px/600, alignSelf center; (2) customer — a TWO-LINE stack: name 14px/700 + OPTIONAL email 11px/muted (only when inv.customer_email) — this variable second line is what sets row height; (3) invoice number 13px/600; (4) date 13px; (5) amount 15px/800; (6) right-aligned flex, 8px gap: Badge(dot) + a 25x25 Send icon button (padding 6, radius 8) + a 25x25 Trash icon button. NO avatar in this table.

> **Migration:** SkeletonRow for invoices must reuse the exact 6-column string and '14px 20px' padding. Because the customer email line is conditional, real rows vary between ~52px and ~62px — pick the TWO-LINE height (~62px) for the skeleton so the shell never grows when rows land (shrinking is far less jarring than growing). Suggested bars: c1 = 16x13; c2 = (120x13) over (150x10); c3 = 80x13; c4 = 70x13; c5 = 60x15; c6 = right-aligned 60x18 pill + two 25x25 squares. No avatar block — do NOT reuse the leads variant.

### `app/invoices/page.js:471` — invoices empty state — MISSING the filtered variant (a real bug, not just styling)

Lines 471-476 branch on `filtered.length === 0` where `filtered` (376-380) is the SEARCH+STATUS-filtered array — yet the copy is the unconditional "No invoices found" / "Create invoices from any lead profile." So a user with 300 invoices who types a typo, or clicks the Overdue tab with nothing overdue, is told to go create invoices from a lead profile. No clear-filter affordance exists anywhere.

> **Migration:** Highest-value EmptyState migration in the batch. Split on `invoices.length === 0` (true empty) vs `filtered.length === 0` (filtered): true-empty → <EmptyState icon={FileText} title="No invoices yet" description="Create invoices from any lead profile." />; filtered → <EmptyState filtered icon={Search} title="No invoices match" action={{label:'Clear filters', onClick:()=>{setSearch(''); setFilterStatus('all');}}} />. Both `invoices` and `filtered` are already in scope at that point — no refactor needed.

### `app/invoices/page.js:343` — invoices mutation handlers already error correctly — the contrast case

handleMarkPaid (343-351) and handleDelete (353-366) both `catch (e) { toast.error('…', { description: e.message }); }`. Mutations surface failure properly; only the initial FETCH lies.

> **Migration:** Do not touch. Cite this in the report as the in-file proof that the fetch path is the anomaly — it makes the 335-336 fix obviously correct rather than a matter of taste.

### `app/contracts/vault/page.js:18` — SKELETON TARGET 3 of 3 — contracts vault uses a null-sentinel instead of a loading flag

`const [clients, setClients] = useState(null)` — `null` means loading, `[]` means loaded-and-empty. Line 44 renders on `!clients`, line 45 on `clients && filtered.length === 0`. Unlike leads-list/invoices there is NO `loading` boolean at all.

> **Migration:** Vault is Skeleton-ONLY in the approved scope (not a full adopter). The null-sentinel actually works and does distinguish the two states — do not refactor it into a loading boolean, just branch the skeleton on `clients === null`. Minimal diff.

### `app/contracts/vault/page.js:28` — vault converts a failed fetch straight into the empty state

`csAPI.vault().then(r => setClients(r.data.clients || [])).catch(() => setClients([]))` — the catch assigns `[]`, which is the exact value that means "loaded, genuinely zero clients". Line 45 then renders "No clients yet — documents you create will be filed here." on a backend outage.

> **Migration:** Same defect class as clients:41 and invoices:335. BUT vault is Skeleton-only in the approved scope — adding ErrorState here is scope creep. Recommend: record it as the top deferred item, or seek explicit approval to extend vault to a full adopter (the fix is 3 lines and the primitive already exists). Do not slip it in silently.

### `app/contracts/vault/page.js:44` — SKELETON TARGET 3 — vault renders one bare word while loading

`{!clients && <p style={{color:'var(--text-muted)'}}>Loading…</p>}` — a single ~20px-tall paragraph. The card list below (47) is `flex column, gap:12` with ~72px cards, so a 3-client vault jumps from 20px to ~276px. The largest proportional layout shift of the three skeleton targets.

> **Migration:** Replace with 4 × <SkeletonRow variant="vaultCard" /> inside the same `flex column, gap:12` wrapper. Geometry in the next item.

### `app/contracts/vault/page.js:52` — SKELETON TARGET 3 — exact vault card geometry SkeletonRow must mimic

Card wrapper (51): `background:var(--surface); border:1px solid var(--border); borderRadius:14; overflow:hidden`, siblings separated by a 12px flex gap (47). Card header is a full-width <button> (52) with `display:flex; alignItems:center; gap:14; padding:'16px 18px'`. Contents: (1) AVATAR 40x40 `borderRadius:999` (a true circle — unlike leads-list's radius-10 squircle), --accent-light bg, 15px/800 initial, flexShrink 0; (2) flex:1 min-width:0 two-line stack — client name 15px/700, then a 12px meta row with 12px gap holding "N documents", an optional green "N signed", and an optional bold total; (3) 18px ChevronRight, flexShrink 0. Collapsed card height ≈ 40px avatar + 32px padding = 72px. The expanded body (64-81) only exists on click and never during load.

> **Migration:** Vault needs a THIRD SkeletonRow shape — 40px CIRCLE avatar, not the leads 34px squircle and not the avatar-less invoice row. Suggested: 40x40 circle + 14px gap + (140x14) over (180x10) + a 18x18 block right-aligned, all inside a radius-14 bordered card with 16px/18px padding, repeated 4× with 12px gaps. Skeleton the COLLAPSED card only — never the expanded document list.

### `components/ui/Spinner.js:13` — THREE distinct SkeletonRow shapes are required — a single generic row will not fit

Consolidating the three targets: leads-list = 9-column grid, 34x34 radius-10 avatar, ~58px, padding 12px 16px. invoices = 6-column grid, NO avatar, ~62px (two-line customer cell), padding 14px 20px. vault = flex card, 40x40 CIRCLE avatar, ~72px, padding 16px 18px, 12px inter-card gap, radius-14 border. No two share a container model (grid / grid / flex-card), an avatar treatment (squircle / none / circle), or a height.

> **Migration:** Design SkeletonRow to take an explicit shape/variant prop (or accept a columns template + an avatar shape), NOT a one-size row. Skeleton.js should be the dumb primitive (a single pulsing bar: width, height, radius, plus prefers-reduced-motion) and SkeletonRow.js should compose Skeleton into the three named layouts. Anchored on Spinner.js because Skeleton.js does not exist yet.

### `app/dashboard/page.js:876` — FULL-PAGE SPINNER where a skeleton would be better — dashboard

`if (loading) return (…)` — an entire 100vh blank screen with a 44x44 ring and "Loading WappFlow...". The user's whole app disappears on every dashboard visit. Dashboard has a known, stable layout (stat cards + charts + recent-leads list) that skeletons perfectly.

> **Migration:** FLAG ONLY — dashboard is NOT an approved Batch E adopter. Record as the #1 candidate for a follow-up batch. The @keyframes spin at 882 is still deleted (globals covers it), but the markup stays untouched.

### `app/leads/[id]/page.js:1174` — FULL-PAGE SPINNER where a skeleton would be better — lead detail

`if (loading) return (…)` 100vh centred 44x44 ring + "Loading lead...". Immediately followed by a second full-page early return `if (!lead)` at 1184 — so a failed fetch and a missing lead already diverge here, which is more than most surfaces do.

> **Migration:** FLAG ONLY — not an approved adopter. Note that the `!lead` branch at 1184 is a de-facto ErrorState and is the closest thing to prior art for the primitive; worth reading before finalising ErrorState's copy.

### `app/profile/page.js:112` — FULL-PAGE SPINNER — profile (60vh)

`if (loading) return (…)` inside <NavBar>: 60vh centred 40x40 ring + "Loading profile…". Hardcoded `#e5e7eb` border (a light-mode literal that will look wrong in dark theme).

> **Migration:** FLAG ONLY. The hardcoded #e5e7eb is a token violation Spinner would fix for free — good argument for extending adoption later, but out of approved scope now.

### `app/reports/page.js:341` — FULL-PAGE SPINNER — reports/analytics (padding 80)

`{loading ? (<div style={{background:'var(--surface)', borderRadius:20, padding:80, textAlign:'center'}}><RefreshCw size={32} style={{animation:'spin 1s linear infinite'}} /><p>Loading analytics...</p></div>) : …}` — 1s timing, distinct from every other spinner.

> **Migration:** FLAG ONLY — not an approved adopter. Delete keyframes at 614 only.

### `app/accept-invite/page.js:49` — FULL-PAGE SPINNER — accept-invite (unauthed route)

100vh gradient background, 36x36 ring with hardcoded #c7d2fe/#6366f1, "Loading invite...".

> **Migration:** FLAG ONLY. Unauthed route with its own gradient identity — adopting Spinner here would need a deliberate theming decision.

### `app/trash/page.js:108` — FULL-PAGE SPINNER with NO label — trash

`<div style={{display:'flex', justifyContent:'center', padding:80}}><div style={{width:34,height:34,…borderTopColor:'#ef4444',animation:'spin 0.8s linear infinite'}} /></div>` — a bare ring, no text, and no role="status", so screen readers announce nothing at all during the wait. Note there is NO @keyframes spin declared in this file — it already relies on globals:285, proving the deletion strategy works.

> **Migration:** FLAG ONLY (not an approved adopter), but this is the strongest ACCESSIBILITY argument for Spinner: role="status" + aria-label comes free. Also cite it as the working precedent that pages can consume globals' spin with no local declaration.

### `components/SidePanel.js:20` — A local `Spinner()` component ALREADY EXISTS and will collide by name

`function Spinner() { return <div style={{display:'flex', justifyContent:'center', padding:30}}><div style={{width:26,height:26,border:'3px solid var(--border)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} /></div>; }` — used three times (47, 97, 160) for reminders, tasks, and notes. Token-correct already; it is a 26px centred ring, i.e. almost exactly `<Spinner size="lg" center />`. This file ALSO has a local `Empty({icon, text, sub})` at line 25 — a hand-rolled EmptyState — used at the same three sites.

> **Migration:** Most important non-adopter finding. Two consequences: (1) if SidePanel ever imports the new primitive the local declaration shadows it — the local one must be deleted in the same edit, never both present; (2) the local `Empty` at line 25 is near-identical to the new EmptyState and is prior art worth checking the API against. SidePanel is NOT an approved adopter — deleting these is deferred, but the name collision must be recorded now so a future migrator does not get a silent shadow.

### `components/RoomPanel.js:80` — Inline loading row already using the globals `.spin` class + a lucide icon

`{loading && <div style={{display:'flex',alignItems:'center',gap:8,color:'var(--text-dim,#666)',fontSize:13}}><Loader2 size={14} className="spin" /> Loading…</div>}` — the cleanest existing loading row in the codebase; no local keyframes, uses the shared class.

> **Migration:** Prior art — this is essentially `<Spinner size="sm" showLabel />`. Not an adopter; cite as the pattern the primitive formalises. Note it uses a lucide Loader2 whereas Spinner.js uses a CSS ring — a visual inconsistency the batch should acknowledge but need not resolve.

### `components/HuddleModal.js:164` — Loading phase rendered as a named state machine — a different model entirely

`{phase === 'connecting' && <div className="hd-state"><Loader2 className="hd-spin" size={26} /><div>Connecting…</div></div>}` — a `phase` enum, not a boolean, with its own hd-rot keyframes (217).

> **Migration:** OUT OF SCOPE. Recorded because it shows a third loading model (boolean / null-sentinel / phase enum) coexisting in the codebase — relevant context for whether Batch E's primitives generalise. Do not migrate.

### `components/control/ControlShell.js:56` — Command Center shell renders a bare centred text line while authenticating

`return <div style={{minHeight:'100vh', display:'grid', placeItems:'center', …}}>Loading Command Center…</div>;` — no spinner, no role="status".

> **Migration:** OUT OF SCOPE. Per memory, Command Center is largely unmounted/dead code — explicitly do NOT spend Batch E effort here.

### `app/control/page.js:12` — 11 control/* pages share one copy-pasted bare-text loader

Identical `if (!d) return <div style={{color:'var(--text-dim,#666)'}}>Loading…</div>;` (or the tabular variant) at: control/page.js:12, control/adoption:14, control/ai:13, control/inbox:25, control/desktop:34, control/storage:25, control/customers/[id]:24, control/customers:59 (colSpan 8 <tr>), control/support:89 (colSpan 6 <tr>) and :223, control/flags:37, control/database:103. All use a null-sentinel; none distinguish a failed fetch from a slow one.

> **Migration:** OUT OF SCOPE — do not migrate. Enumerated so the report can state the loading-state debt honestly: ~12 more sites exist beyond the approved three, all in Command Center.

### `app/studio/page.js:136` — 10 studio/* surfaces use the parallel `.ms-loading` convention, not spinners

`<p className="ms-loading">Opening the studio…</p>` — styled at studio.css:344 (uppercase 11px label, 44px vertical padding, ms-pulse animation). Same pattern at: studio/[id]/page.js:341, studio/[id]/cull:413, studio/[id]/albums:73, studio/[id]/album/[albumId]:47, studio/[id]/video:66 and :188 and :271, studio/[id]/video/[timelineId]:308, studio/[id]/reel/[reelId]:42, studio/portfolio:103 and :104 and :281, studio/trash:66, studio/settings:122. Note studio/[id]/albums/[albumId]:112 breaks the convention with a plain `padding:40` div, and studio/store:31 and bookings:37 do the same.

> **Migration:** OUT OF SCOPE and arguably permanently so — Media Studio is a deliberate parallel design language (ms-* tokens, ms-spin, ms-pulse, ms-loading). Do NOT fold into Spinner without an ADR. Worth noting that `.ms-loading` is already a pulsing text placeholder, i.e. the closest thing to a skeleton philosophy in the codebase — but it is NOT a skeleton and should not be presented as one.

### `app/settings/page.js:1396` — settings has 7 independent bare-text loading branches with 3 different visual treatments

1078 (`Loading…` inside a SectionCard), 1241 (13px <p>), 1396 (`Loading workspace...`, padding 40 centred), 1827 (`Loading accounts...`, padding 20px 0), 2411 (surface card, radius 20, padding 60), 2507 and 2680 (identical surface/radius-20/padding-60 blocks). Backed by loading states at 754, 997, 1206, 1368, 1693, 2298, 2464, 2626.

> **Migration:** OUT OF SCOPE. Settings is the single largest concentration of loading-state inconsistency (7 renders, 3 treatments, 8 state vars) and is the strongest candidate for the batch AFTER this one. Delete only the duplicate @keyframes at 2351.

### `app/contracts/[id]/page.js:63` — contracts detail: 4 independent null-sentinel loaders in one file

Line 63 `if (!doc) return <…><p style={{padding:40}}>Loading…</p></…>` (full-page), plus in-panel loaders at 191 (clauses), 227 (versions), 294 (data). Each pairs with a hand-rolled empty state: 192 ("No clauses yet — add them in Contracts Studio → Settings"), 228 ("No snapshots yet"), 338 ("No activity yet.").

> **Migration:** OUT OF SCOPE (only vault is approved from the contracts family, and Skeleton-only). Recorded because those three empty states have genuinely good, action-guiding copy — read them before finalising EmptyState's description conventions.

### `app/contracts/page.js:99` — contracts index: bare-text loader + two hand-rolled empties

Line 99 `{loading ? <p style={{color:'var(--text-muted)', padding:'30px 0'}}>Loading…</p> : …}` (state at 33). Empties at 121 ("No documents match." — correctly a FILTERED empty), 130 ("Nothing yet."), 302 ("No packs or templates yet.").

> **Migration:** OUT OF SCOPE. Line 121 is one of only three places in the codebase that already gets the filtered/empty distinction right (with clients:96 and leads-list:1146) — cite as evidence the `filtered` prop matches existing intent rather than inventing it.

### `app/contracts/analytics/page.js:42` — contracts analytics ALREADY does error-vs-loading correctly — the model to copy

`{err && <p style={{color:'var(--text-muted)'}}>Couldn’t load analytics.</p>}` then `{!a && !err && <p>Loading…</p>}` then `{a && (…)}`. State: `const [a, setA] = useState(null)` + `const [err, setErr] = useState(false)` (13-14), `.catch(() => setErr(true))` (18). Three distinct states, correctly ordered.

> **Migration:** THE reference implementation. Its exact branch ordering (error → loading → content) is what clients, leads-list, invoices, and vault must adopt. Quote this file in the batch report to show the fix restores an existing in-house convention rather than importing a new one. settings/storage/page.js:53 (`{!data && !err && …}`) follows the same pattern.

### `app/chat/page.js:993` — chat: two bare-text loaders, one of which is inside the message thread

Line 993 `{loadingMessages ? <div style={{textAlign:'center', padding:'40px', …}}>Loading messages...</div> : …}` (state at 363, set at 495/514 with a `silent` flag so background polls do not flash it — a genuinely thoughtful detail). Line 1208 is a second `Loading…` in the sidebar.

> **Migration:** OUT OF SCOPE. The `silent` flag at 495 is important prior art: any Spinner/Skeleton adoption elsewhere must not make background refreshes flash a loading state. Worth stating as a general rule in the batch report.

### `app/whatsapp/page.js:67` — whatsapp encodes loading as a fake STATUS LABEL

`if (!status) return { color: 'var(--text-muted)', label: 'Loading...' };` inside getStatusMeta — "Loading..." is returned as if it were a connection status alongside Connected/Disconnected/Auth Failed, so the loading state is rendered by the status-badge component.

> **Migration:** OUT OF SCOPE, but flag it: this is a loading state masquerading as domain data, which is exactly the kind of thing Batch B's key→label registry work is meant to prevent. Record for a later batch; delete only the duplicate @keyframes at 312.

### `app/team/page.js:581` — team: static (non-spinning) icon as a loading indicator

`{loading ? (<div style={{background:'var(--surface)', borderRadius:20, padding:60, textAlign:'center', color:'var(--text-dim)'}}><RefreshCw size={28} style={{margin:'0 auto 12px', display:'block', opacity:0.3}} />Loading workspace...</div>) : …}` — a RefreshCw at opacity 0.3 with NO animation, so it reads as a disabled control rather than activity.

> **Migration:** OUT OF SCOPE, but the clearest single example of why one Spinner primitive is worth it: this surface looks broken rather than busy. Good screenshot for the batch report.

### `app/knowledge/page.js:368` — knowledge: full-panel spinner + a nested bare-text loader

Line 368-372 (36x36 ring, hardcoded #e5e7eb/#8b5cf6 — a THIRD accent colour for spinners, after #6366f1 and #ef4444) and line 426 (`<p style={{color:'var(--text-dim)', fontSize:13}}>Loading...</p>`). Also three separate action spinners at 288, 299, 346 all using `animation:'spin 1s linear infinite'` inline.

> **Migration:** OUT OF SCOPE. Records the spinner-colour drift across the codebase: #6366f1 (dashboard, leads, profile, invoices, accept-invite), #ef4444 (trash), #8b5cf6 (knowledge), var(--accent) (SidePanel, Spinner.js). The new primitive standardises on var(--accent) — say so explicitly, since three surfaces will change colour whenever they eventually adopt.

### `app/bookings/page.js:37` — bookings: null-sentinel full-page bare-text loader

`if (!settings) return <NavBar><div style={{padding:40, color:'var(--text-muted)'}}>Loading…</div></NavBar>;` — no spinner, no error branch; a failed settings fetch hangs on "Loading…" forever.

> **Migration:** OUT OF SCOPE. Worth recording as a distinct failure mode from the others: this one never resolves at all on error (permanent loading), rather than lying with an empty state. Different bug, same root cause.

### `app/studio/store/page.js:31` — studio store: null-sentinel loader that also never resolves on error

`if (!products) return <NavBar><div style={{padding:40, color:'var(--text-muted)'}}>Loading…</div></NavBar>;` — same permanent-loading failure mode as bookings:37.

> **Migration:** OUT OF SCOPE. Pairs with bookings:37; two confirmed permanent-loading surfaces.

### `app/globals.css:285` — ACCEPTANCE CHECKS for Batch E (recommended)

Proposed verifications: (1) `grep -c '@keyframes spin' src` === 1; (2) `grep -rn 'animation:.*spin' src` — every remaining hit is either globals.css:299 or an ALIASED name from the deferred list, never an inline `animation:'spin …'` in an adopter; (3) the three adopters render loading → error → empty → filtered-empty → content in that order; (4) no adopter renders EmptyState while its loading flag is true; (5) SkeletonRow row height matches the real row within ~4px for all three targets (measure in the browser at 1280px); (6) Skeleton respects prefers-reduced-motion; (7) Spinner call sites expose role="status"; (8) no page declares a `.spin` class (kills studio/[id]/albums/[albumId]:188's shadow).

> **Migration:** Per memory, frontend spot-checks need an authed session and the owner deploys manually. Checks 1, 2, 4, 8 are pure static greps and can be run without a browser — front-load those. Checks 5 and 6 need the authed visual pass.

### `components/ui/Skeleton.js:1` — SCOPE GUARD: what Batch E must NOT touch

Explicitly out of scope despite being visible in this sweep: all 14 aliased spin keyframes (fcSpin/sm-spin/hd-rot/auth-spin ×2/gspin/pfspin/csp ×6/ms-spin); the 6 copy-pasted public-token-route loaders; the ~12 control/* loaders; the ~15 studio/* ms-loading sites; settings' 7 loading branches; the SidePanel local Spinner/Empty pair; the leads-list bulk-loop swallows (982, 1008); and ErrorState for contracts vault (Skeleton-only approval). File does not exist yet — anchored as the batch's scope marker.

> **Migration:** The single largest risk to this batch is scope creep: the fix for vault:28 is three lines and the primitive is already built, which makes it very tempting. Approved scope is Skeleton-only for vault. Either stop at the skeleton or ask first — and either way state the decision in the report rather than leaving it unmentioned.

