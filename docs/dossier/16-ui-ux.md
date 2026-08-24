## UI/UX — design system, interaction patterns and the experience

### What this part of the product is for

WappFlow's interface has to do something unusual: it is a single web application that a small photography or creative studio lives inside all day, and it has to switch between three completely different kinds of work without feeling like three different products. In the morning the owner is running a **CRM** — chasing leads that arrived over WhatsApp, moving them through a pipeline, raising invoices. In the afternoon they are a **photographer** — reviewing thousands of frames from a shoot, choosing keepers, building a gallery, sending it to the client. In between they are a **business** — sending a proposal or contract that the client signs in the browser. Each of those users has different taste: a CRM wants dense, high-contrast, information-first chrome; a photographer wants the UI to disappear so the photographs are the only thing with colour; a contract has to look like a document, not like software.

The interface answers this with **one shell and several deliberate dialects**: a shared token substrate and a shared set of primitives, plus scoped CSS "identities" (`.ms-root`, `.cs-doc`, `.pf-root`, `.wf-public`) that remap the tokens so the same components wear a different face depending on where they render. That is the good idea at the centre of the front end. The honest counterweight, documented in detail below, is that the idea was ratified and only partially executed: only **8 of 69 `page.js` files** actually import the shared primitives, the app still contains **76 hand-rolled fixed-position overlays**, **~2,226 raw hex colours** in `app/`, and **12 `aria-*` attributes against 915 `onClick` handlers** in the page layer.

Frontend stack: **Next.js 16 App Router + React 19**, all under `wappflow-web/src`. Styling is **CSS custom properties in `app/globals.css` plus inline `style={{}}` objects** — Tailwind directives are present at `app/globals.css:1-3` but essentially unused as a utility system; the real styling language is `var(--token)` inside inline styles (3,909 occurrences across `src/`). Icons are `lucide-react` throughout. Charts are `recharts`. Drag-and-drop is `@hello-pangea/dnd` (dashboard Kanban).

---

### 1. Domain vocabulary the interface assumes

The reader needs these to follow the screens:

| Term | What it means here | Where it lives |
|---|---|---|
| **Lead** | An inbound prospect, usually auto-created from a first WhatsApp/Instagram/Facebook message. Has a `status` on a six-stage pipeline. | `/leads-list`, `/leads/[id]`, `/dashboard` |
| **Client** | A lead that reached `Closed - Won` and was converted. Leaves the Leads list but keeps its chat and history. | `/clients` |
| **Shoot / Project** | One photography job. Holds every asset, gallery, album and reel for that job. The UI calls it a "shoot"; the API calls it a project (`mediaAPI.createProject`, `app/studio/page.js:36`). | `/studio`, `/studio/[id]` |
| **Cull** | The photographer's review pass over the raw take: each frame is marked **Keep / Maybe / Reject** and optionally star-rated 1–5, so thousands of frames become a few dozen deliverables. | `/studio/[id]/cull` |
| **Gallery** | A password-protectable, shareable, client-facing set of selected photographs, reachable by token at `/g/[token]`. | `app/studio/[id]/page.js:73` (`CreateGalleryModal`), `app/g/[token]/page.js` |
| **Album** | An internal print/layout construct (a physical album's page plan), distinct from a gallery. Can be auto-filled from cull "keep" decisions (`mediaAPI.autofillAlbum`, `app/studio/[id]/albums/[albumId]/page.js:95`). | `/studio/[id]/albums` |
| **Proofing request** | A client-side selection task inside a gallery ("pick 40 favourites") with a quota. | `app/studio/[id]/page.js:115` |
| **Document / Contract** | A block-based proposal or contract built in Contracts Studio and signed by the client at `/d/[token]`. | `/contracts/[id]`, `/d/[token]` |
| **Client portal** | A per-client hub at `/client/[token]` collecting their galleries, documents and invoices. | `app/client/[token]/page.js` |

---

### 2. The design token system

`app/globals.css` (522 lines) is the whole system. It is layered, and the layering is deliberate and well-commented.

**Tier 0 — the original palette** (`globals.css:5-25` for dark, `:28-48` for light). Dark is the default; light is opt-in via a `light` class on `<html>`.

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0f1117` | `#f1f5f9` |
| `--surface` / `--surface2` | `#1a1d27` / `#222536` | `#ffffff` / `#f8fafc` |
| `--border` | `#2a2d3e` | `#e2e8f0` |
| `--text` / `--text-dim` / `--text-muted` | `#e2e8f0` / `#9ca3af` / `#6b7280` | `#0f172a` / `#94a3b8` / `#64748b` |
| `--accent` / `--accent-hover` | `#6366f1` / `#4f46e5` | same |
| `--success` / `--warning` / `--danger` | `#10b981` / `#f59e0b` / `#ef4444` | `#059669` / `#d97706` / `#dc2626` |

**Tier 1/2 — the PROP-002 "Batch A" substrate** (`globals.css:57-102`), added purely additively so the ~5,000 existing inline `var(--*)` styles keep resolving identically. It introduces a 4px spacing scale (`--space-1..12`), a radius scale (`--radius-sm|md|lg|xl|pill`), a type scale (`--fs-caption` 11px → `--fs-h1` 28px), weights (`--fw-normal|medium|semibold|bold`), motion (`--dur-fast|dur|dur-slow`, `--ease`, `--ease-spring`), an elevation scale (`--elev-1..3`), semantic status pairs (`--success-bg/--success-fg`, `--danger-bg/--danger-fg`, `--info-bg/--info-fg`, `--warning-bg/--warning-fg`, `--accent-bg/--accent-fg`), and a **z-index ladder** replacing an ad-hoc 1–99999 sprawl:

`--z-base: 1 · --z-dropdown: 1000 · --z-sticky: 1100 · --z-overlay: 1200 · --z-modal: 1300 · --z-toast: 1400 · --z-banner: 1500`

Two tokens are load-bearing beyond styling. `--shell-h: 58px` (`globals.css:79`) publishes the app-bar height because full-bleed pages compute against it. `--focus-ring` (`globals.css:83`) plus the global `:focus-visible` rule at `globals.css:110-119` gives *every* focusable element a visible keyboard ring via `box-shadow`, which is a genuinely smart move: it coexists with the app's pervasive `outline: none` and therefore retro-fitted focus indication to hundreds of unmigrated inputs with zero per-file edits.

**Maturity: SHIPPED.** The token layer is real, coherent, commented, and resolves correctly in both modes.

#### Theming mechanics

- Light/dark is a class on `<html>` set by a pre-hydration inline script in `app/layout.js:42-45` (`localStorage.getItem('theme') || 'dark'`), so there is no flash of wrong theme. `suppressHydrationWarning` on `<html>` is correctly applied.
- The **only** place to change it is Settings → Appearance (`app/settings/page.js:2832-2841`), rendered as two preview cards. There is no toggle in the shell. **PARTIAL** — the feature works, but it is three clicks and a tab away from anywhere a user would look for it, and the Studio-only toggle that used to exist (`app/studio/StudioThemeToggle.js`) is now **dead code, imported by nothing**.
- Public token pages (booking, print shop, pay, client portal, contract) are seen by *the studio's clients*, who have no theme preference, so `.wf-public` (`globals.css:484-522`) pins the light palette absolutely. The class is applied to `document.documentElement` by `components/PublicScope.js`, not to a wrapper — correct, because `Modal`/`Toast`/`confirm` portal to `document.body` and a wrapper would never reach them. The file also correctly restates derived tokens (`--focus-ring`, `--accent-bg`, `--warning-fg`) rather than relying on `var()` re-resolution, and raises the focus-ring alpha from 15% to 28% because indigo at 15% is invisible on white. This is unusually careful CSS.

---

### 3. The visual identities — why the product looks like several products

There are **five** scoped identities, not three.

| Scope | File | Sub-themes | Character |
|---|---|---|---|
| **Core app** | `app/globals.css` | light / dark | Indigo accent, Inter, 10px radii, dense information UI |
| **Media Studio** | `app/studio/studio.css` (689 lines) | `monochrome` (default), `editorial`, `cinema` | Gallery-wall photography UI; type, spacing, shape, motion and atmosphere all change per theme |
| **Contracts Studio** | `app/contracts/contracts.css` (50 lines) | `monochrome`, `editorial`, `executive` | A **document canvas**: an 860px-max paper surface with its own type and its own selection colour |
| **Portfolio (public)** | `app/folio/portfolio.css` (169 lines) | 10 themes (`noir`, and nine others) | Full-bleed public marketing site: Ken-Burns hero, masonry work grid |
| **Public token pages** | `.wf-public` in globals | — | Fixed light, brand-headed |

**Media Studio** is the most ambitious. `.ms-root` declares ~40 `--ms-*` tokens and then *remaps the core tokens onto them* (`studio.css:60-63`: `--bg: var(--ms-paper); --surface: var(--ms-surface); --text: var(--ms-ink); --accent: var(--ms-accent)` …). That single trick is why a `<Button>` or `<Badge>` rendered inside Studio automatically wears the Studio look without knowing Studio exists. Themes are switched by `html[data-ms-theme="…"]` and are genuinely different worlds, not colour swaps:

- **monochrome** — Bodoni Moda display, 2px radii, 3px grid gap, `--ms-shadow` almost nil, `--ms-accent: #101010`. The photographs are the only colour.
- **editorial** — Fraunces serif body, Jost labels, cream `#fbfaf6` paper, `--ms-pad-y` up to 100px, pill buttons, centred masthead.
- **cinema** — Anton condensed caps, `#0a0a0b` black, radial-gradient backdrop, 40px/100px shadows, slower `--ms-speed: 0.4s`.

Theme choice persists in `localStorage['ms-theme']` and is applied pre-paint by an inline script in `app/studio/layout.js:17`, whose retired-id migration map (`dark-pro→cinema`, `airy→editorial`, `bold→monochrome`) is duplicated in `components/shell/StudioThemeSwitch.js:24`. The duplication is called out in both files and the two currently agree.

**Contracts Studio's** `.cs-doc` is applied to the *document*, not to the page, so the builder and the client's signing view render byte-identical output — "what you build is exactly what the client sees" (`contracts.css:3-4`). The `executive` theme is deliberately dark (`#0f1420` with `#c8a35b` gold), which is why `.wf-public` is explicitly *not* applied to `/d/[token]` under that theme.

**Maturity: SHIPPED**, and this is the strongest part of the product's design work. It is also where the most CSS lives that nothing uses any more — see §11.

---

### 4. The shell and navigation model

`components/shell/AppShell.js` (205 lines) is one sticky top bar for every authenticated module, mounted from **route layouts**, not from pages. That is the important architectural fact: `app/dashboard/layout.js`, `app/leads/layout.js`, `app/studio/layout.js`, `app/contracts/layout.js` and 14 others each render `<AppShell module="…">{children}</AppShell>`, so the chrome persists across navigation instead of remounting. The file's own comment records what it replaced: three per-page shells wrapped by 36 pages across 45 JSX call sites, where a page's loading branch and its loaded branch each mounted the chrome separately.

Left → right the bar is: **module switcher (waffle) · module mark + wordmark · module nav · spacer · page actions · module actions · notification bell · command palette · mobile burger · account avatar menu**.

The nav comes from a single registry, `components/shell/modules.js`:

| Module | `home` | Nav items | Menu | FABs | Dialect |
|---|---|---|---|---|---|
| `crm` | `/dashboard` | Dashboard, Leads (prefix-match), Clients, Communications (unread badge), Invoices, Bookings, Analytics (`lockFeature: 'analytics'`, Studio plan) | Settings, Team, Knowledge, Help | `AICommandCenter`, `FloatingChat` | — |
| `studio` | `/studio` | Shoots, Portfolio | Studio settings, Help center, Trash | `StudioCopilot` | `.ms-root` |
| `contracts` | `/contracts` | Overview, Client Vault, Analytics | Studio settings, Help & guide | — | — (`.cs-doc` travels with content) |

Active state is computed by `isNavActive` (`modules.js:96-102`): exact match by default, prefix match where a module owns a subtree. Locked items swap their icon for a padlock and get a `title` explaining the required plan (`AppShell.js:60-64`), and the lock is suppressed while `plan.loading` so the UI never flashes a lock and then snaps open (`AppShell.js:48`).

Mobile: below **860px** the nav and wordmark are hidden and a burger appears (`AppShell.js:198-201`), opening a `Drawer` that contains the same nav buttons. The drawer is a real dialog with focus trap, Escape and scroll lock (`components/ui/Drawer.js`).

`components/shell/Breadcrumbs.js` exists and is well-reasoned — it is deliberately *not* `router.back()`, because deep-links between related leads and the command palette pollute the history stack — but it is mounted through `AppShell`'s `subHeader` slot and **no layout in the repo currently passes one**. **Maturity: STUB.** The component works; nothing renders it.

Auth is guarded once by `useAuthGuard()` at `AppShell.js:43`, which redirects to `/login?next=…`. **PARTIAL:** 24 page files still perform their own `localStorage.getItem('token')` redirect (e.g. `app/clients/page.js:37`, `app/studio/page.js`, `app/contracts/[id]/page.js:40`), so the duplication the guard was built to remove is still largely present.

---

### 5. The module switcher

`components/shell/ModuleSwitcher.js` renders a 248px dropdown listing CRM, Media Studio, Contracts Studio and (disabled) Flux. Each row has the module's gradient mark; the current module gets `--accent-bg` and a check. Switching is an in-app `router.push(m.home)` — the file records that it used to be `target="_blank"`, which the product audit named as the root cause of the "not one product" feeling, and which only worked because of a same-origin-referrer session-inheritance trick still visible in `app/layout.js:47-53`.

Flux is the one genuine external link and is hard-parked: `FLUX_PARKED` from `lib/flux.js` disables the anchor, halves its opacity and prints "Coming soon". **Maturity: SHIPPED (CRM/Studio/Contracts), SOLD-NOT-BUILT (Flux — visibly advertised in the switcher, intentionally inert).**

On phones the panel is repositioned to fixed 12px gutters via `.as-panel` (`globals.css:431-437`) because the trigger sits ~169px in and neither left- nor right-anchoring fits a 375px screen.

---

### 6. The command palette (Ctrl/Cmd+K)

`components/shell/CommandPalette.js` (179 lines), mounted by the shell so it exists in every module. The binding is `(ctrlKey || metaKey) && k` (`:52`) and it **toggles**.

Two result classes in one list, deliberately:
1. **Navigation** — every destination flattened out of `MODULES` once at construction (`:41-47`), matched locally, so the palette is useful before any request returns. With an empty query it shows the first six destinations.
2. **Records** — `GET /api/search` via `searchAPI.global`, debounced 180ms, with a request-id guard so a slow response cannot overwrite a newer one (`:70-80`). Types rendered: lead, client, contract, invoice, booking, project ("Shoot"), message, team member.

Keyboard: ↑/↓ move, Enter opens, Escape closes (through the overlay stack), and the active row is scrolled into view with `scrollIntoView({block:'nearest'})`. A footer strip prints the shortcuts. `role="listbox"` / `role="option"` / `aria-selected` are correctly applied (`:128-138`) — one of the few places in the codebase where ARIA is done properly.

**Maturity: SHIPPED.** Two honest gaps: it is **navigate-only** (no commands — you cannot "create invoice" from it despite the name), and the shortcut is **not documented anywhere in the in-app help** (`app/help/page.js` has a "Keyboard Shortcuts & Tips" section at `:151` whose only entry is about Enter/Shift+Enter in chat). A discoverable feature nobody is told about is close to no feature.

---

### 7. Notifications, the bell, and realtime

`components/shell/ShellNotifications.js` (255 lines) owns the bell. It merges three sources into one list: the **persistent feed** (`GET /api/notifications`), **today's new leads**, and **reminders due within 24 hours**, de-duplicating derived lead cards when the feed already points at the same `/leads/{id}` URL. Locally dismissed ids persist in `localStorage['wf_dismissed_notifications']`.

Counting is cheap: a 60s poll of `GET /api/notifications/summary` (`:32`, `:61`) which returns `{ todayLeads, reminders, unread, comms, total }`. Those counts are re-published through a tiny module-level pub/sub (`components/shell/summary.js`) so the Communications nav badge reads the same fetch instead of polling again — a neat, small solution.

Realtime rides one app-wide `EventSource` from `components/shell/realtime.js`, mounted in `app/providers.js` *above* the shell so it survives navigation. Two contracts are documented there and matter: the backend emits **unnamed SSE frames** (`data: {"type":"lead_created",…}` with no `event:` line), so `addEventListener('lead_created')` silently receives nothing and the only correct consumption is `onmessage` + a switch on `data.type` (`realtime.js:20-25`); and `BASE_URL` must be imported rather than re-derived, because `NEXT_PUBLIC_API_URL` already ends in `/api` in production and produced `/api/api/events` (`realtime.js:29-35`). Reconnect is exponential 1s→30s with a visibility-change wake and a 3s localStorage reconcile that opens the stream after sign-in and closes it on sign-out. The bell subscribes to `notification` for an instant badge bump and to `chat_message|chat_mention|chat_thread_reply` (debounced 1.5s) for the comms count.

Toasts are a separate, better system: `components/ui/Toast.js` is a module-level store with an importable `toast.success/error/warning/info` API, one `<ToastViewport />` mounted in `app/providers.js`, bottom-right on `--z-toast`, max 4 visible with the rest queued, `aria-live="polite"`, `role="alert"` for danger, and pause-on-hover/focus with correct remaining-time arithmetic.

**Maturity: SHIPPED with named gaps.** Three:
- Opening the bell calls `loadPanelData()`, which fetches **the entire leads table** (`leadsAPI.getAll(null)`, `ShellNotifications.js:84`) purely to count today's arrivals. Phase 4 removed this from the 60s poll but left it on the click path.
- Toast adoption is thin: **27** `toast.*` calls exist while **25** page-local `showToast`/`setToast` implementations remain (`app/dashboard`, `app/settings`, `app/leads/[id]`, `app/leads-list`, `app/profile`, `app/knowledge`, `app/clients`).
- Sound is a full five-profile Web Audio service (`lib/sounds.js`: `reminder`, `whatsapp`, `team`, `newLead`, `system`, per-channel mute, volume) — but `app/dashboard/page.js:46-80` *also* hand-rolls its own `playNewLeadSound` / `playNewMessageSound` oscillators that bypass the service's mute and volume preferences entirely.

---

### 8. The registry pattern — domain keys vs display labels (PROP-002 D3)

This is the most conceptually valuable piece of the design system and worth the reader's attention.

The rule: **a status registry maps a stable domain key (the literal DB value, which drives logic, API, filtering and analytics) to presentation metadata only.** Colours are never values; components never learn domains.

`lib/statusRegistry.js` defines the contract. `makeStatusLookup(name, map)` returns a lookup that, for an unknown key, must: never crash, never silently normalise an invalid value into a valid-looking one, render a **neutral** badge, humanise the real value for display, and emit a one-shot `console.warn` so bad data is visible. That last set of rules is unusually mature thinking — most codebases quietly coerce an unknown status to "Draft" and hide a data bug forever.

| Registry | Keys | Tones |
|---|---|---|
| `lib/leadStatus.js` | `New`, `Contacted`, `Interested`, `Negotiating`, `Closed - Won`, `Closed - Lost` | accent, info, warning, warning, success, danger |
| `lib/invoiceStatus.js` | `draft`, `sent`, `pending`, `paid`, `overdue` (derived, never stored) | neutral, info, warning, success, danger |
| `lib/plan.js` `PLAN_META` | `creator`, `studio`, `studio_plus`, `enterprise` | labels + `crown` flag |

`displayInvoiceStatus(inv)` (`lib/invoiceStatus.js:24`) encodes the one rule that matters — show `overdue` when the backend's derived `is_overdue` is set, otherwise the stored status. The file also carries a comment recording a real shipped bug: `sent` was missing from the registry, so *every invoice the product raised on its own* (contract automation, print store) rendered with an unknown-status badge on the screen the studio uses to chase money.

**Maturity: PARTIAL, and this is the single largest gap between the ratified design and the code.** The registries exist and are correct, but only **two** files consume `leadStatusMeta` (`app/leads-list/page.js:26`, `components/AddLeadModal.js:8`) and **one** consumes `invoiceStatusMeta` (`app/invoices/page.js`). Meanwhile **six** independent lead-status colour maps are still live and can drift:

| File | Symbol | Note |
|---|---|---|
| `app/dashboard/page.js:35` | `STATUS_COLORS` | plus a separate `COLUMNS` array at `:27` with emoji labels `🏆 Won` / `❌ Lost` |
| `app/leads/[id]/page.js:106` | `STATUS_META` | its own emoji labels again |
| `app/leads-list/page.js:30` | `STATUS_META` | *coexists* with the registry import in the same file |
| `app/reports/page.js:24` | `STATUS_COLORS` | chart colours |
| `app/trash/page.js:12` | inline map | |
| `components/AICommandCenter.js:17` | `STATUS_COLORS` | |

The same status therefore renders as five different greens across the product, and "Won" is labelled `Closed - Won`, `🏆 Won`, and `Won` on three different screens.

---

### 9. Component primitives

`src/components/ui/**` is small, well-documented and mostly excellent.

| Primitive | File | What it gives you | Adoption (files importing) |
|---|---|---|---|
| `overlay.js` | 146 ln | `Portal`, `useOverlayStack` (registration order = stacking order, answers "am I top?"), `useEscape` (top-only, so nested overlays peel one at a time), `useScrollLock` (reference-counted), `useFocusTrap` (Tab cycle + focus restore, takes the *element* via callback ref because portal content mounts a tick late) | 4 primitives + `lib/confirm` |
| `Modal.js` | 205 ln | Centred dialog on `--z-modal`; `role="dialog"`, `aria-modal`, generated `aria-labelledby`/`describedby`; `dismissable={false}` kills backdrop *and* Escape; `useModal()` returns a promise resolving `'confirmed'\|'cancelled'\|'dismissed'` | 5 |
| `Drawer.js` | 95 ln | Edge panel on `--z-overlay` (below modal, so a modal opened from a drawer still covers it) | 1 (AppShell) |
| `Dropdown.js` | 94 ln | Anchored menu on `--z-dropdown`, `aria-haspopup`/`aria-expanded`/`aria-controls`, outside-mousedown + Escape. Explicitly *not* portaled. Replaced seven hand-rolled copies | 4 |
| `Button.js` | 61 ln | 4 variants (`primary`/`secondary`/`ghost`/`danger`), 2 sizes, `loading` → spinner + `aria-busy`. **No domain props** — no `whatsapp`, no `gradient` | 2 |
| `Badge.js` | 44 ln | 6 tones mapped to Batch-A status tokens, optional `dot`, plus a `color` escape hatch for arbitrary tag chips via `color-mix` | 2 |
| `Field.js` | 159 ln | `Field` (label/required/error/hint + id wiring) + `Input`/`Textarea`/`Select`/`Checkbox`/`Switch`. Controls carry `data-ui`, which opts them out of the legacy global `input {…!important}` override | 5 |
| `Toast.js` | 190 ln | see §7 | 7 |
| `Spinner.js` | 62 ln | The one loading indicator; `role="status"` + `aria-label`, ring is `aria-hidden` | 2 |
| `Skeleton.js` | 131 ln | `Skeleton` + `SkeletonRow` with **three real measured variants** (`leads`, `invoice`, `vaultCard`), heights matching the taller real row so the table shrinks rather than grows on load, rows fading with depth | 3 |
| `EmptyState.js` | 86 ln | Distinguishes an empty **list** from an empty **filter result** (`filtered` prop swaps copy and offers "Clear filters" instead of a create CTA) | 3 |
| `ErrorState.js` | 80 ln | `role="alert"`, human sentence + de-emphasised technical `detail` + retry | 3 |
| `VirtualList.js` | 82 ln | Window-scroll virtualization with spacer blocks (no inner scroll container, so the page scrollbar stays honest). Renders everything below `threshold: 120`. `setTimeout` throttle rather than rAF, because rAF never fires in a hidden document | 1 |

Two design decisions deserve praise. `EmptyState`'s `filtered` flag exists because "Add your first client" is *wrong and slightly insulting* when the user has 400 clients and mistyped a search — that's a real product insight encoded in an API. And `ErrorState` exists to close a defect class where a `catch {}` fell through to the empty state, so a backend outage rendered as "No clients yet" — a confident lie about the user's data that invites them to re-create records they already have.

**Maturity: SHIPPED as components, PARTIAL as a system.** Only **8 of 69** `page.js` files import any of them: `accept-invite`, `clients`, `contracts/vault`, `invoices`, `leads-list`, `profile`, `settings`, `team`. Concretely:

- `app/leads/[id]/page.js:190` defines its **own local `Modal`** with `zIndex: 200`, no focus trap, no Escape, no scroll lock — inside the same app that ships one.
- **76** sites across `app/` use raw `position: 'fixed', inset: 0` overlays; `app/contracts/[id]/page.js` alone has seven at `zIndex: 600`.
- The z-index ladder is referenced **6 times** total, all inside the primitives. Raw `zIndex:` literals include `9999` (×4), `9000` (×2), `850`, `700` (×3), `600` (×13), `510`, `500`, `380`…
- **20+** call sites still use native `window.confirm` / `window.alert` / `window.prompt` despite `lib/confirm.js` providing a styled, focus-trapped, typed-confirmation dialog (`requireTyped: 'DELETE'`) — including client-facing surfaces: `app/g/[token]/page.js:81` names a client's photo selection with a browser `prompt()`, and `app/d/[token]/page.js:222` collects a contract-decline reason the same way.
- `components/SidePanel.js` — a full right-rail Calendar/Tasks/Notes dock with its own local `Spinner` and `Empty` — is **imported by nothing**. Dead.

---

### 10. Loading, empty and error states

- **Route error boundaries: SHIPPED.** 19 `error.js` files plus `app/error.js`, `app/global-error.js` and `app/not-found.js`. `components/shell/RouteError.js` documents the Next 16 rule that an `error.js` wraps its segment's page but *not* its own segment's layout — which is why per-module boundaries render inside `AppShell` (user keeps navigation) while `app/error.js` must stay shell-free (it catches throws *from* `AppShell`). It also uses `unstable_retry` rather than `reset()`, because `reset()` re-renders without re-fetching and, on the dominant failure (a failed API call), would look like a dead button. The 404 page deliberately offers both "Go to WappFlow" and "Sign in" rather than bouncing a studio's client to a login screen for a product they have no account for.
- **Loading: PARTIAL.** There are **zero** `loading.js` files, so navigation has no route-level suspense fallback; each page owns a `loading` boolean (42 of 69 pages have one). Studio pages render a bare `<p className="ms-loading">Loading…</p>` (`app/studio/[id]/cull/page.js:412`).
- **Error swallowing: a live defect class.** 101 empty `catch {}` blocks remain in `app/`. `app/clients/page.js:43-46` carries the fix and the confession in one comment; most pages have not received it.

---

### 11. Mobile responsiveness

The approach is pragmatic: because the app is styled with inline `style={{}}` objects, media queries cannot override them normally — so `globals.css:397-442` defines a library of **`r-*` utility classes using `!important` at ≤640px**, applied as `className` to the inline-styled container.

| Class | Effect |
|---|---|
| `r-stack` / `r-stack-2` | collapse a grid to 1 or 2 columns, using `minmax(0,1fr)` not `1fr` so a nowrap child cannot force the track past the viewport |
| `r-col`, `r-wrap`, `r-full`, `r-actions`, `r-toolbar` | flex reflow |
| `r-scroll-x` + `r-tw` | wide data tables scroll horizontally inside their own container (`min-width: 760px`) |
| `r-kanban` / `r-kanban-col` | swipe sideways through pipeline columns (250px each) instead of squeezing them |
| `r-modal` | full-width, `max-height: 92vh`, 16px radius |
| `r-chat-side` | channel list becomes a ≤40vh strip above the conversation |
| `r-panel`, `as-panel` | right-anchored fixed panels inset to 12px gutters |
| `wf-fab`, `wf-fab-chat/ai/studio`, `wf-page` | scale the floating buttons to 0.85 and add `padding-bottom: 132px` to the page so the last row clears both stacked FABs |
| `r-stack-tablet`, `r-stack-tablet-2` | a 900px tablet step |

The comments record the two traps that were actually hit: grid items default to `min-width: auto` and refuse to shrink below intrinsic content width (fixed by `min-width: 0` on children, `globals.css:363-366`), and a `position: fixed` element inside a transformed ancestor is positioned against that ancestor, not the viewport.

Module-specific mobile blocks exist too: `.cs-header`/`.cs-wordmark`/`.cs-nav` at `globals.css:453-458` for Contracts, and `studio.css:196-211` which hides the Studio theme switcher, drops the wordmark text, and strips the keyboard-shortcut chips off the cull decision dock (useless on touch, and they made the bar wider than a 375px phone).

**Maturity: PARTIAL.** The utilities work and the reasoning is sound, but only **28 files** use any `r-*` class, and usage is thin: `r-modal` ×25, `r-stack` ×21, `r-wrap` ×11, `r-scroll-x` ×4, `r-kanban` ×1. The largest screens — `app/leads/[id]/page.js` (2,961 lines), `app/settings/page.js` (3,106 lines) — are essentially untouched by it apart from the bespoke `.lead-grid` / `.lead-subnav` rules at `globals.css:340-378`.

---

### 12. Accessibility posture — the honest picture

This is the weakest dimension of the product and it is not close.

| Measure | Count |
|---|---|
| `onClick` handlers, whole `src/` | **1,014** |
| `onClick` in `app/` (the page layer) | **915** |
| `aria-*` attributes in `app/` | **12** |
| `aria-*` attributes in `components/` | 58 |
| `role=` attributes, whole `src/` | 25 |
| `tabIndex` occurrences | **0** |
| `onKeyDown` handlers | 23 |
| `<div>` with an `onClick` in `app/` | ~98 |
| `<main>` landmarks | 9 (across 69 pages) |
| `<h1>` elements | 75 |
| `prefers-reduced-motion` blocks | **1** |
| Skip-to-content link | **none** |

What that means in practice: the **shell and the primitives are accessible** — `aria-current="page"` on nav, `aria-label` on every icon button, `aria-haspopup`/`aria-expanded` on dropdowns, `role="dialog"`+`aria-modal` on modals and drawers, a real focus trap with restore, `role="listbox"`/`option`/`aria-selected` in the palette, `role="switch"`+`aria-checked` on `Field`'s `Switch`, `role="status"` on `Spinner`, `role="alert"` on `ErrorState` and danger toasts, `aria-busy` on loading buttons. Someone who knows accessibility built that layer.

The **page layer is not accessible**. ~98 clickable `<div>`s with zero `tabIndex` are unreachable by keyboard and unannounced to screen readers — including notification rows (`ShellNotifications.js:224`, which navigates on click from a plain `<div>`) and gallery tiles. The single `prefers-reduced-motion` block (`globals.css:294-299`) covers only `.wf-skeleton` and `.spin`; it does not cover the modal pop (`--ease-spring` scale+translate), the toast spring-in, the `wf-shake` bell animation (`globals.css:302-311`), Studio's `ms-rise` entrance, or the portfolio hero's 30-second Ken-Burns zoom (`portfolio.css:21`). Colour contrast was not systematically audited here — **UNKNOWN: no contrast measurements exist in the repo and none were run for this document**, but `--text-muted: #6b7280` on `--surface2: #222536` is visibly marginal and appears throughout as metadata text.

**Maturity: PARTIAL — accessible shell over an inaccessible body.**

---

### 13. The actual journeys

**Onboarding a new studio — PARTIAL, arguably the product's biggest experience gap.**
`/signup` is a two-panel auth screen: a gradient promo aside on the left and a three-field form (email, password, business name) plus Google OAuth on the right. Password rules are enforced client-side (≥8 chars, one uppercase, one special — `app/signup/page.js:42-46`). On success the page writes `token`/`user`/`workspace` to localStorage, sets `wf_persist: 'forever'`, and **hard-navigates** (`window.location.replace('/dashboard')`) so the plan context initialises for the new account.

Then: nothing. The user lands on an empty Kanban board. There is **no onboarding wizard, no setup checklist, no product tour, no empty-state first-run sequence anywhere in the codebase** — `grep -rn "onboard"` over `src/` returns exactly one hit, an unrelated string in `app/control/adoption/page.js:38`. Worse, `app/signup/page.js:34` and `app/login/page.js:40` both set `sessionStorage['wf_just_logged_in']` with the comment *"Triggers the per-tier welcome modal on the next page after signup"* — and **no code anywhere reads that key**. The welcome modal does not exist. **Classification: SOLD-NOT-BUILT (a welcome/onboarding moment is written into the code as if it shipped).** The nearest substitute is `/help`, a static accordion of ~10 sections of hand-written articles — whose "Getting Started" copy tells the user to "go to the WhatsApp page **from the sidebar**" (8 mentions of a sidebar), while the app has been a top-bar shell since Phase 2 and `.sidebar`, `.app-layout` and `.main-content` in `globals.css:268-289` are now **dead CSS with zero call sites**.

**Working a lead to a won deal — SHIPPED, and the most polished flow in the product.**
A WhatsApp message auto-creates a lead. It surfaces in three places at once: a Kanban card on `/dashboard` (drag between six columns to change status, via `@hello-pangea/dnd`), a row on `/leads-list`, and a bell notification. `/leads-list` is the workhorse: search, status tabs, bulk selection with an action bar (bulk status, bulk assign, round-robin, bulk trash, bulk convert-to-client), saved views persisted per browser (`app/leads-list/page.js:47`, named through a `window.prompt`), and `VirtualList` for large tables. `/leads/[id]` is a 2,961-line two-column workspace: identity sidebar left, a multi-platform chat thread over a **ten-tab** panel right (notes, reminders, invoices, emails, email-flow, vertical, room, ai, timeline, related). Marking a lead `Closed - Won` opens a modal that captures the actual sale amount (`:920-932`) — a small, correct piece of product design that keeps revenue reporting honest. `/clients` then holds the converted record with an "undo conversion" affordance.

**Delivering a shoot — SHIPPED end to end, with the strongest craft in the product.**
Create a shoot on `/studio` (name, type chip row, date, location, optional lead link) → upload → **cull** at `/studio/[id]/cull`. The cull viewer is a genuine professional tool: a full-bleed image with a decision dock (Reject / Maybe / Keep), non-destructive edit sliders (exposure, contrast, temperature, tint, saturation, fade, vignette, grain, b&w, rotate), crop with pointer-drag handles, film-style presets, compare mode, 100% zoom, and copy/paste of edit settings between frames. It is driven by a proper photographer's keyboard map (`app/studio/[id]/cull/page.js:383-409`): `→`/`space` next, `←` prev, `P` keep, `X` reject, `M` maybe, `U`/`backspace` undecided, `1`–`5` star rating, `0` clear, `Z` 100%, `C` compare, `E` edit, `F` presets, `I` info, `B` before/after, `shift+C`/`shift+V` copy/paste edits, Escape peels one layer at a time. Input elements are correctly excluded from the handler. AI hints are advisory-only and say so on screen: *"AI focus & duplicate hints are advisory only — they never select, hide, or deliver a photograph. You stay in control."* (`app/studio/[id]/page.js:549`) — a defensible, well-stated stance. From there: select photos → create a gallery (optional password) → publish → share link → the client opens `/g/[token]`, a deliberately dark masonry gallery with a lightbox, favourites with counts, and story sections; or a proofing request with a quota. Album layouts and reels branch off the same shoot.

**Sending a contract — SHIPPED.** `/contracts/[id]` is a block builder over `.cs-doc` with 19 block types across five groups (Basic, Media, Pricing, Content, Action — including `pricing_table`, `package`, `addons`, `signature`, `approval`; `app/contracts/blocks.js:12-32`), three document themes, autosave with a `saved` indicator, version history with restore, an AI panel, a clause library, a people/room panel, and preview. The client receives a link, opens `/d/[token]`, and signs.

---

### 14. Specific praise

- **The comments are the best documentation in the repo.** Nearly every primitive explains not just what it does but the bug it closes and the alternative that was rejected — `VirtualList`'s "rAF never fires while a document is hidden", `realtime.js`'s `/api/api/events` post-mortem, `Breadcrumbs`' refusal to use `router.back()`, `globals.css:496-503` on `var()` not re-resolving in a nested custom-property scope. An external reader can reconstruct the reasoning without asking anyone.
- **`useSignOut` (`session.js:34-40`)** removes only session keys instead of `localStorage.clear()`, because clearing also wiped `theme`, `ms-theme` and the dismissed-notification set — signing out silently reset the user's light/dark and Studio-theme choices. A one-line fix for a genuinely annoying bug.
- **The `.wf-public` scope** is the most careful CSS in the codebase.
- **The Studio identities** are real design, not theming. Three distinct products' worth of taste in 689 lines.
- **The status-registry fallback contract** (never crash, never normalise, neutral badge, one-shot telemetry) is better thinking than most production design systems ship with.

### 15. Specific criticism

- **The design system was ratified and then not rolled out.** 8 of 69 pages use it. The result is worse than either extreme: a reader of the code cannot tell which pattern is current, and two competing patterns render side by side inside single files (`app/leads-list/page.js` imports `leadStatusMeta` *and* defines `STATUS_META`; `app/clients/page.js` imports `Spinner`/`EmptyState`/`ErrorState` *and* keeps a local `toast` state with a `setTimeout`).
- **Typography is not systematised.** `--fw-bold` is documented as "the only bold in Core", yet `fontWeight: 900` and `800` appear all over the page layer (`app/invoices/page.js:61`, `app/leads/[id]/page.js:1466`, …). `app/chat/page.js:796` sets `fontFamily: 'system-ui, -apple-system, sans-serif'` on the whole chat pane, overriding Inter.
- **Gradients are the unmanaged accent.** `linear-gradient(135deg, #6366f1, #8b5cf6)` and friends are hardcoded at ~235 sites (`linear-gradient` occurrences in `app/` + `components/`); there is no gradient token.
- **The bell's information design is muddled.** One badge fuses server notifications, today's leads and due reminders, with a client-side dedupe rule and a localStorage dismissal set — so the number on the bell is not a number the server can ever confirm, and "Mark all read" clears three different kinds of state through two different mechanisms.
- **Native browser dialogs on client-facing pages** (`window.prompt` in `/g/[token]` and `/d/[token]`) break the studio's brand in front of the studio's own customer, which is the exact place the product least affords it.

---

### 16. Bugs, data-integrity risks and architectural smells

*(Read-only observations. Nothing was changed.)*

1. **Shell-height drift the token was created to prevent.** `--shell-h` is `58px` (`globals.css:79`) and `AppShell.js:106` uses it — but `app/chat/page.js:796` still hardcodes `height: calc(100vh - 60px)`. The chat pane is 2px short of the viewport (or overflows, depending on rounding). `AppShell.js:33` even *describes* chat as computing `calc(100vh - 60px)` as if that were still correct.
2. **Dead focus-ring declaration in Studio.** `studio.css:406` sets `.ms-root :focus-visible { outline-color: var(--ms-spark) }` (per-theme cobalt/terracotta/amber), then `studio.css:435` sets `.ms-root :focus-visible { outline: 2px solid var(--ms-accent) }` — same specificity, later wins. The themed focus colour never renders. Compounding this, `globals.css:126` suppresses the global ring inside `.ms-root` on the assumption that Studio's own outline is the single indicator, so Studio's focus indication depends entirely on the rule that clobbered the intended one.
3. **Dead onboarding hook.** `sessionStorage['wf_just_logged_in']` is written by `app/signup/page.js:34` and `app/login/page.js:40` and read by nothing. Either the welcome modal was removed or never built; the code claims it exists.
4. **Dead code with maintenance cost.** `components/SidePanel.js` (imported nowhere), `app/studio/StudioThemeToggle.js` (imported nowhere), and the entire old Studio shell CSS — `.ms-shell`, `.ms-shell-content`, `.ms-shell-link`, `.ms-wordmark`, `.ms-waffle` (`studio.css:173-215`) — have zero JS call sites since `AppShell` replaced `StudioShell`. `globals.css:266-289` (`.app-layout`, `.sidebar`, `.main-content`) and `.table-row`, `.input-field`, `.btn-secondary` are likewise unreferenced.
5. **Stale in-product help is a support liability.** `app/help/page.js` instructs users to use a sidebar that no longer exists (8 references) and documents a bulk-upload path on the dashboard. This is user-facing documentation shipped inside the product, so it is worse than a stale README.
6. **Full-table fetch on a UI interaction.** Opening the notification bell triggers `leadsAPI.getAll(null)` (`ShellNotifications.js:84`) — the entire leads table over the wire — to count today's arrivals. On a workspace with thousands of leads this is a multi-megabyte response per bell click.
7. **Accessibility regressions are structural, not incidental.** Zero `tabIndex`, ~98 clickable `<div>`s, no skip link, 9 `<main>` landmarks across 69 pages. Any keyboard-only or screen-reader user can reach the shell and then go no further. If the product ever needs a VPAT or a public-sector customer, this is a rewrite of the page layer, not a patch.
8. **Overlay stacking is unenforced outside the primitives.** 76 raw fixed overlays with literal z-indexes up to `99999` (`ImpersonationBanner.js:39`) coexist with a `--z-*` ladder used 6 times. A `Modal` (`--z-modal` = 1300) opened over a page that hand-rolls `zIndex: 9999` will render *behind* it.
9. **Multiple sources of truth for lead status.** Six colour maps plus the registry (§8). Status is a DB value that drives filtering, analytics and revenue reporting; three different display labels for `Closed - Won` across three screens is a reporting-consistency risk as much as a cosmetic one.
10. **101 empty `catch {}` blocks in `app/`** keep the "outage renders as empty state" defect class alive on most pages, despite `ErrorState` existing specifically to close it.
11. **Two competing sound paths.** `lib/sounds.js` implements per-channel mute and volume; `app/dashboard/page.js:46-80` hand-rolls oscillators that ignore both. A user who mutes new-lead sounds will still hear them on the dashboard.
12. **Theme migration duplicated in two places.** The `dark-pro/airy/bold` → `cinema/editorial/monochrome` map lives in `app/studio/layout.js:17` (pre-paint inline script) and `components/shell/StudioThemeSwitch.js:24` (runtime). Both files say they must stay in agreement; nothing enforces it.
13. **`useFocusTrap` filters focusables by `el.offsetParent !== null`** (`overlay.js:130`), which returns `null` for `position: fixed` elements even when visible. A fixed-position control inside a modal would be skipped by the Tab cycle. Not observed failing in practice — flagged as a latent risk.
