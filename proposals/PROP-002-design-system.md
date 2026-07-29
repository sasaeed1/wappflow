# PROP-002 — Design-System Primitive Layer

> **Status: draft → awaiting review + decisions.** Authored 2026-07-07. Required by [Engineering Constitution](../ENGINEERING-CONSTITUTION.md) Article 0 before any design-system code. Phase 1 of the [Product Audit](../PRODUCT-AUDIT.md) roadmap. Companion: [Product Bible](../PRODUCT-BIBLE.md). **No code has been written. Implementation does not begin until this proposal is approved and the §10 decisions are made.**

> **Objective (not negotiable up in scope):** the *smallest coherent* token + primitive layer that eliminates repeated UI inconsistency, reduces implementation drift, closes the mapped audit findings, and gives CRM / Media Studio / Contracts Studio / client-facing work a stable visual foundation — grounded in WappFlow as it exists today, not a generic SaaS template. Not a redesign. Not a big-bang migration. Legacy inline-styled screens and primitive-based screens coexist throughout.

_Forensic basis: 7 inventory areas, 61 UI patterns catalogued from real files, 8 core primitives proposed._

---

## 1. Current-state forensic inventory

WappFlow does not lack a design system — it has one that is **dead**, sitting on top of a **color-only token layer** that most surfaces bypass. The drift is measurable, and it is concentrated on exactly the dimensions the token layer never defined. Every number below is grounded in file evidence; the anchor claims (globals.css token set, `confirm.js` hardcoded chrome, `ControlShell` Pill palette, AddLeadModal Tailwind) were re-verified against source, not taken from the inventory.

### 1.1 The measured baseline

| Dimension | Measurement | Evidence |
|---|---|---|
| Inline `style={{}}` blocks | **5,148** across 85 files | app + components (grep) |
| Six-digit hex literals inline | **2,631** | app + components |
| `rgba()` literals inline | **1,153** | app + components |
| Inlined `#6366f1` that **equals** `--accent` | **381** | `globals.css:15` defines `--accent:#6366f1`; 381 sites re-hardcode it |
| Inline `linear-gradient` literals | **267** | no gradient token exists |
| Distinct `borderRadius` px values | **24** (mode 10px @ ~270, outweighed by 8/12/9/14/20) | cards drift 10→18px between modules |
| `fontWeight` values, no scale | 700 (632) / 800 (299) / 600 (296) / 900 (63) | emphasis picked per-element |
| `fontSize` values, no ramp | 13/12/11/14/12.5/13.5/11.5/15/10.5… incl. half-pixels | no `h1/h2/body/caption` in Core |
| Distinct `zIndex` literals | **34**, from 1 to 99999 (600×13, 300×11, 9999×8…) | no layering convention |
| `:focus-visible` rules in Core | **0** (only `studio.css` has one) | `globals.css:126` does `outline:none!important` + border swap |
| JS-driven hover (`onMouseEnter/Leave`) | **69** sites | CSS `:hover` bypassed |
| `disabled` opacity values | **12+** (0.3/0.35/0.4/0.45/0.5/0.55/0.6/0.7/0.85…) | no `--disabled-opacity` |
| CSS files total | **4** (`globals.css`, `studio/studio.css`, `contracts/contracts.css`, `folio/portfolio.css`) | everything else inline |
| `:root` custom properties in Core | **25** — all color/surface + lone `--radius:10px` + lone `--shadow` | `globals.css:5-26` (verified) |
| Files consuming `var(--*)` inline | **76 / 85** | the token approach is already the adopted, migration-compatible mechanism |
| Global primitive classes used in the product | `.btn-primary` 19 files (mostly landing/auth); `.btn-secondary`/`.badge`/`.card`/`.input-field`/`.table-row` = **0** product uses | `globals.css:64-146` — defined-but-dead |

The two facts that decide the entire proposal: **(a)** the token mechanism works — 76/85 files already read `var(--*)`; **(b)** the class mechanism failed — the dead primitives prove devs will not reach for global CSS classes. The fix is therefore **more tokens + importable React primitives**, never revived classes.

### 1.2 Shared-component surface (components/ + lib/)

The "shared surface" is far thinner than the file count implies. Only three things function as real cross-module primitives:

| Primitive | Adoption | Classification | Note |
|---|---|---|---|
| `lib/confirm.js` `useConfirm()` | 12 files (10 app + FloatingChat + ScheduleMeetingModal); mounted app-wide `providers.js:12` | **reusable-already** | BUT hardcoded dark-only — see 1.6 |
| `lib/plan.js` `usePlan` + `PlanLock` family | 5 app files | **partially-reusable** | tier vocabulary centralized (good); `PlanLockStyles` skin hardcoded dark |
| `ControlShell` `Card`/`Stat`/`Pill` | **293 uses across all 18 control pages** | **partially-reusable** | proof a tiny primitive set gets adopted — but module-private, Card radius 14 ≠ globals 10, Pill is a private palette |

Everything else in `components/` is a **whole feature** (AICommandCenter, FloatingChat, StudioCopilot, SidePanel, RoomPanel, HuddleModal, ScheduleMeetingModal, the 4 shells, AppSwitcher) or a **lead-domain helper** (TagPicker, AddLeadModal) — not design-system atoms. `SidePanel.js` is **dead** (mounted nowhere; grep finds no import) and `PlanWelcomeModal.js` (finding platform-3) **no longer exists** in the tree — that finding is stale for the file itself.

### 1.3 Buttons — the single most-repeated control, 6+ identities

910 `<button>` across 78 files; ~22 named button-style consts; 105 inline `borderRadius:999` pill renders. The primary CTA ships in **six incompatible visual identities**:

| Identity | Where | Treatment |
|---|---|---|
| flat `var(--accent)`, radius 10, wt 700 | `globals.css` `.btn-primary`, `contracts/page.js:329` | canonical (recommended) |
| flat, radius 11, wt 800, 14.5px | `bookings/page.js:118` | drift |
| gradient `#6366f1→#4f46e5`, radius 12, box-shadow | `team/page.js`, `accept-invite/page.js`, `leads-list/page.js:230` | drift |
| gradient `#6366f1→#a855f7`, radius 10 | `lib/confirm.js:219` (verified) | drift |
| Tailwind `from-violet-600 to-cyan-600` (hardcoded, theme-blind) | `AddLeadModal.js:46` (verified) | **breaks light mode** |
| black `var(--ms-ink)`, wt 800 | Studio `albums/page.js` | intentional Studio dialect |

Radius on this one atom scatters 8/9/10/11/12; weight 700/800. **Classification: duplicated + visually-inconsistent.** Secondary/ghost/icon/link buttons are re-declared per file (~15 files); `control/support/page.js:306-309` alone defines four (`primaryBtn/ghostBtn/linkBtn/segBtn`) hardcoding `#818cf8`, repeated verbatim in `control/health` and `control/timemachine`.

### 1.4 Badges / status-pills — 5+ implementations, per-module semantic palettes

| Domain | Maps | Divergence | Classification |
|---|---|---|---|
| Lead status | **6 files** (`leads-list:24`, `dashboard:35`, `reports:24`, `leads/[id]:103`, `AICommandCenter:17`, client-portal) | dot hues agree; text diverges (New `#4338ca` **dark** on list vs `#818cf8` **light** on dashboard); reports/AI degrade to bare hex | **visually-inconsistent** |
| Contract status | **3 maps, 3 label vocabularies, 2 Pill typographies** (`contracts/page.js:13`, `vault/page.js:9`, `client/[token]:16`) | `pending_approval` = 'Approval' purple `#a855f7` vs 'Needs approval' amber `#f59e0b` vs 'In review'; sent blue `#3b82f6` vs indigo `#6366f1` | **behaviorally-inconsistent** |
| Plan tier | **3 palettes** — `NavBar` PlanBadge (live tiers), `PlanLock` LockBadge (tier-agnostic amber→purple), control `planTone` **keyed to DEAD free/starter/growth** | every real plan (creator/studio/studio_plus) falls to neutral → colors nothing | **behaviorally-inconsistent** |
| Invoice status | own `{bg,text,dot,label}` (`invoices:15`) + separate `client/[token]:21` | paid `#047857` — a **third green** | **visually-inconsistent** |
| Role label | 3 maps (`team:16`, `profile:18`, `accept-invite:46`) | same person = 'Owner' on Profile, 'Super Admin' on Team | **behaviorally-inconsistent** |
| **`ControlShell` Pill** (verified) | 1 def, 293 uses | **right abstraction** (`tone` API), wrong palette (`#34d399` ≠ `--success #10b981`) | **partially-reusable** |
| **Studio `.ms-chip`/`.ms-status`** | 46 uses | token-driven, `--ms-*` themed | **too-domain-specific** — keep as dialect |

Three greens (`#10b981` / `#047857` / `#34d399`) render one "success" semantic. The `.badge` class in `globals.css:95` is **dead** (0 product uses).

### 1.5 Modals / dialogs — an a11y gap, not just visual drift

~20+ hand-rolled fixed overlays (17 via object-form grep + `ScheduleMeetingModal`, `HuddleModal`, `control/support` Modal, `confirm.js`). They agree on nothing:

| Behavior | State |
|---|---|
| `role="dialog"`/`aria-modal` | **only `confirm.js`** — the other ~20 have none |
| Focus trap | **0 / ~20** |
| Scroll-lock | **0 / ~20** (`body.style.overflow` grep = 0 app-wide) |
| Escape-to-close | confirm + lightboxes/panels only; form modals (AddLead, invoices, Huddle) do NOT |
| Backdrop-click | Huddle/control/confirm yes; `invoices/page.js:136` overlay has **no `onClose`** (dead backdrop) |
| z-index | 300/320/350/500/510/600/700/998/9998/9999/10000/99999 — **no scale**; invoices modal (z-300) renders **under its own toast** (z-9999) |
| Theming | AddLeadModal `#0f1117`, `confirm.js` `#14161f` (verified), Huddle `#0b0d16` — hardcoded dark, **break light mode** |

**Classification: duplicated + behaviorally-inconsistent.** Studio's `.ms-modal-overlay` (z-400) is an **intentional themed variant** — excluded.

### 1.6 Toasts + confirm + destructive patterns

- **Toasts:** ~14 per-page reimplementations, all fixed top-right, diverging on position (top:20/80/16), **duration (7 values, 2400–4000ms)**, and background (`#111827` dark pill vs green `rgba(16,185,129,.95)` vs bordered `var(--surface)` card), all pinned at z-9999. **Classification: duplicated.** No `useToast`.
- **Confirm:** `useConfirm()` is the **one proven shared overlay primitive** (tones, Escape/Enter, backdrop, `role=dialog`, native fallback). But it is **hardcoded dark-only** — verified `confirm.js:136` `background:#14161f`, `:140` `color:#f3f4f6`, `:172` icon `#818cf8`, `:219` primary gradient `#6366f1→#a855f7`, `:123` `z-index:9999` — so it is a dark slab in light mode, on light client-facing pages. **Classification: partially-reusable.**
- **Native dialogs survive:** 8+ `window.confirm/alert/prompt` including **public** surfaces — `contracts/page.js:116`, `leads-list:614` (merge), `studio/[id]:267,275`, `studio/trash:37`, `booking/manage/[token]:28`, `d/[token]:206`. **Classification: behaviorally-inconsistent.**
- **No typed-danger tier:** merge-duplicates, permanent purge, empty-trash are all a single OK click (or a native dialog).

### 1.7 Form controls, selects, textareas, validation

- **No shared FormField.** The intended `.input-field` class (`globals.css:104`) is **dead (0 uses)**. The de-facto shared layer is the blunt `input,textarea,select {…!important}` override (`globals.css:118`) — and it is itself the **cause** of the **61-occurrence** `onFocus/onBlur → e.target.style.borderColor` workaround across 10 files (settings alone: 34), because it defeats CSS `:focus` on inline-styled inputs.
- **~18 local input consts** (`inp/fld/field/inputStyle/miniInp`): padding 6px9px→12px13px, radius 7/8/9/10/11, bg `--bg`/`--surface`/`--surface2`/`#fff`. **duplicated.**
- **4 local `Field` wrappers, 3 incompatible prop shapes** (`control/support:294`, `control/desktop:89`, `control/timemachine:158`, `studio/video:877`). **partially-reusable** — the team wants a FormField.
- **Validation:** uniformly single-string per form; **0 files** with per-field errors or `aria-invalid`/`aria-describedby`/`aria-required`; required = a bare `*` glued into label text; error color drifts `var(--danger)`/`#ef4444`/`#dc2626`/red-400. **behaviorally-inconsistent.**
- **Booleans, 4 ways:** 3 divergent Toggle switches (`team:59` 44×24 r12; `studio/settings:319` 46×26 r999; `contracts/[id]:442` 40×23 r999) + bare native checkboxes + styled-jsx `.sm-checkbox` + a hand-built fake span+Check icon. **duplicated.**
- **Public token forms** (`d/[token]`, `book/[slug]`, `shop/[token]`) hardcode `#fff`/`#d8d8e0` — **intentionally fixed-light**; a primitive must offer a light/public variant. **too-domain-specific.**

### 1.8 Empty / loading / error / skeleton states

- **Skeletons: 0 anywhere** (`skeleton|shimmer|placeholder-glow` grep = 0). Data-heavy tables (leads-list, invoices, contracts vault) flash spinner→content. **dead/unbuilt** — the biggest perceived-speed gap.
- **Spinners: 5+ mechanisms** — 35 inline border-spinner divs across 24 files (each a different size), `.spin` (globals), `.ms-spin` (studio), `gspin` (`g/[token]`), inline `animation:'spin…'` on RefreshCw — **and `@keyframes spin` re-declared in 14 files** despite `globals.css:172` already defining it. **duplicated.**
- **Empty states: ~30+** one-off phrasings across **3 quality tiers** — bare muted `<p>` (bookings, store, control) → centered icon+text (leads-list, invoices) → full icon+title+description+CTA (`clients:88-94`, best-in-class). **duplicated.**
- **Errors: mostly swallowed.** Dominant pattern is `catch {}` → falls through to empty state, so `clients/page.js` makes a network outage **indistinguishable from zero clients** (crm-clients-10). **Only** `leads/[id]:1184` ships a real full-page error + Retry. **behaviorally-inconsistent.**
- **Trapped good primitives:** `SidePanel.js:20-33` `Spinner`/`Empty` (module-local, dead file) and Studio's `.ms-empty`/`.ms-loading` (Studio-scoped). **partially-reusable** — extract, don't invent.

### 1.9 Cross-context posture (do-not-merge)

Four styling worlds share almost nothing but are only *partly* supposed to: **CRM/core tokens+`html.light`** | **Studio `--ms-*`** (3 identities; remaps `--bg/--surface/--text` at `studio.css:60-63` so inline styles auto-theme) | **Contracts `--cs-*`** (3 doc themes) | **client token pages** (zero `var(--*)`, permanently light). The three per-context identity systems are **legitimate product differentiation** (`too-domain-specific`) and must be preserved. Only the seams — modals, pills, buttons, brand, confirm, empty/loading/error — are accidental drift. The `r-*` responsive utilities (`globals.css:270-331`) are the **proof-of-concept** that a shared className layer already spans all four contexts (`reusable-already`).

### 1.10 Finding → primitive/token → expected resolution

Only findings the design **actually** closes are listed; partials are marked honestly.

| Finding | Primitive / Token | Expected resolution | Closure |
|---|---|---|---|
| **design-system-1** — lead status in 6 files | `lib/leadStatus.js` + `Badge` | One `{label,dot,tone}` map feeds one `Badge`; dark/light-correct fg once | **Closes** |
| **design-system-2** — no Badge, 5 pill impls | `Badge` (tone map) + `--radius-lg` | One tone→token map off `--success/--warning/--danger/--accent`; radius reconciled | **Closes** |
| **design-system-3** — 17+ hand-rolled modals | `Modal` + `--overlay-*`/`--z-*`/`--focus-ring` | One overlay with focus-trap/scroll-lock/Escape/`role=dialog`; token-themed (light+dark) | **Closes** |
| **design-system-4** — native confirm under-adopted | `ConfirmDialog` (re-tokenize + adopt) | Re-skin `confirm.js` on tokens; swap 8+ `window.confirm` | **Closes** |
| **design-system-5** — per-file input styling | `Field`/`Input`/`Select`/`Textarea` + scope the `!important` override | Canonical field chrome; real `:focus-visible`; `aria` wiring; deletes 61 handlers | **Closes** |
| **design-system-6** — 24 radii, no scale | radius/space/elevation/z/motion/type token scales | Primitives read the scale; on-touch migration of literals | **Closes** (substrate) |
| **design-system-7** — 30+ empty states | `EmptyState` | One icon+title+description+CTA layout | **Closes** |
| **design-system-8** — 3 spinners, ~20 loading strings, no skeleton | `Spinner` + `Skeleton` + single `@keyframes spin` | One spinner; delete 14 dup keyframes; skeleton for 3 big tables | **Closes** |
| **design-system-9** — bold drift 700/800/900, 3+ CTA styles | `Button` + type scale (`--fw-*`, `--fs-*`) | One primary treatment (flat `--accent`); retire gradient primaries | **Closes** |
| **contracts-9** — 2 divergent contract STATUS maps | `lib/contractStatus.js` + `Badge` | One canonical label+tone per status | **Closes** |
| **command-center-3** — plan color half (dead-tier `planTone`) | plan-tier map in `lib/plan.js` + `Badge` | Delete dead-tier `planTone`; one tier→tone source | **Closes plan-color half** (filter-vocabulary fix is a data change outside DS) |
| **command-center-8** — 3 dialog patterns; local `Stat` | `Modal` + `Field`; hoist `Card`/`Stat` | Promote control `Modal`/`Field`; one `Stat` | **Closes the Modal+Field+Stat half** |
| **settings-team-6** — role labels (Owner vs Super Admin) | `lib/roles.js` + `Badge` | One canonical role map | **Closes** |
| **settings-team-11** — per-page toasts | `Toast` (`ToastProvider`/`useToast`) | One position/duration/tone | **Closes** |
| **platform-15** — 4 error affordances | `Toast` + `ErrorState` | One "something went wrong" language | **Closes** |
| **crm-leads-1** — AddLeadModal hardcoded Tailwind | `Modal` + `Field` + `Button` | Rebuild chrome on tokens; keep lead logic | **Closes** |
| **crm-leads-12** — MergeDuplicates native confirm | `ConfirmDialog` (`requireTyped`) | Branded typed-confirm for merge | **Closes** |
| **crm-clients-10** — outage reads as "zero clients" | `ErrorState` + "no `catch {}`" rule | Retry error state distinct from empty | **Closes** (rule is surface-enforced; grep-gated) |
| **comms-15**, **settings-team-13** — hardcoded dark slabs | tokenized primitives + tokens | Surfaces read `var(--*)` on migration | **Partial** — token layer enables; each screen migrates on-touch |

**Explicitly NOT claimed closed by this proposal:** navigation/IA (navigation-ia-6/7/8 — shell/active-state wiring), feature-dedup (crm-leads-6, studio-video-3/10, crm-clients-3), white-label plumbing that needs backend to *return* brand (gap-1, client-portal-2 — a `PublicBrandHeader` primitive is a **necessary but not sufficient** fast-follow, not in the minimal set), data-model soft-delete (gap-7, platform-6), and dead-feature revival (platform-3 PlanWelcomeModal). Those are separate proposals.

---

## 2. Proposed token architecture

### 2.1 Principle: extend `globals.css` additively, never replace

Keep all 25 existing tokens and **both** `:root` (dark) and `html.light` blocks exactly as-is. Layer new tokens on top so the ~5,148 inline `var(--*)` styles and 76/85 token-consuming files keep resolving identically on day one. `--radius` stays (aliased to `--radius-md`); `--shadow` stays (aliased to `--elev-3`). **No existing token is renamed or removed** → zero regression, zero forced edits.

### 2.2 Three-tier taxonomy (deliberately small)

- **Tier 1 — PRIMITIVES** (raw values, **mode-agnostic**, live once in `:root`, referenced only by semantic tokens — never directly by app code): color ramp, spacing, radius, font size/weight, motion, elevation geometry, z-index integers. These **never appear in `html.light`**.
- **Tier 2 — SEMANTIC** (role aliases that **do** flip per mode; declared in `:root`=dark and overridden in `html.light` with hand-tuned values — **never** auto-inversion). App code and primitives read these. The existing `--surface/--text/--border/--accent/--success/--warning/--danger` **are already semantic tokens** — we KEEP the names and only ADD missing roles (focus-ring, overlay, on-accent, status bg/fg pairs). No renaming = no churn.
- **Tier 3 — COMPONENT** (NOT tokens in `:root`): decisions live in the React primitives (`components/ui/*`) and shared `lib` maps (`leadStatus`/`contractStatus`/`roles`/`plan`). A component reads semantic tokens and **never invents a hex**. This is where "6 CTA identities" and "3 pill palettes" collapse to one.

Primitives feed semantics; semantics feed components; components are consumed inline or as JSX.

### 2.3 The full new token set

**Tier 1 — primitives (mode-agnostic, `:root` only):**

```
/* Color ramp — referenced by semantics; canonicalizes the 381 inlined #6366f1 */
--c-indigo-400:#818cf8; --c-indigo-500:#6366f1; --c-indigo-600:#4f46e5;
--c-emerald-500:#10b981; --c-emerald-600:#059669;   /* kills the 3-greens problem */
--c-amber-500:#f59e0b;  --c-amber-600:#d97706;
--c-red-500:#ef4444;    --c-red-600:#dc2626;
--c-sky-500:#0ea5e9;                                 /* info + client brand stop */
/* + a --c-slate ramp (900..50) mirroring the dark+light neutrals already in globals */

/* Spacing (4px base) — covers ~20 padding + 15 gap freehand values */
--space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
--space-5:20px; --space-6:24px; --space-8:32px; --space-10:40px; --space-12:48px;

/* Radius — folds 24 distinct radii; card drift 10/14/16/18 → md/lg */
--radius-sm:8px; --radius-md:10px; /* == existing --radius, aliased */ --radius-lg:14px; --radius-xl:20px; --radius-pill:999px;

/* Type — snaps the 13/12/11/14/12.5/13.5… ramp incl. half-px */
--fs-caption:12px; --fs-body:14px; --fs-h3:16px; --fs-h2:20px; --fs-h1:28px;
--fw-regular:400; --fw-medium:500; --fw-semibold:600; --fw-bold:700;   /* "bold" means 700, once; 800/900 retired from Core */
--lh-tight:1.2; --lh-normal:1.5;

/* Motion — replaces ad-hoc 0.15s/0.2s */
--dur-fast:120ms; --dur-base:180ms; --dur-slow:240ms;
--ease-standard:cubic-bezier(.22,.61,.36,1); --ease-out:cubic-bezier(0,0,.2,1);

/* Z-index ladder — retires the 34 literals (see 2.5) */
--z-raised:10; --z-sticky:100; --z-nav:200; --z-dropdown:400;
--z-overlay:600; --z-modal:800; --z-toast:1000; --z-banner:1200; --z-max:9999;
```

**Tier 2 — new semantic roles (both modes; `html.light` re-declares each):**

```
/* KEEP unchanged: --bg --surface --surface2 --border --glass --glass-2
   --text --text-muted --text-dim --accent --accent-hover --accent-light
   --success --warning --danger --shadow --radius(alias --radius-md)
   --warning-bg/-border/-text --danger-bg/-border  */

--on-accent: #ffffff;                    /* text/icon ON accent fills — fixes the scattered '#fff' */
--focus-ring: 0 0 0 2px var(--surface), 0 0 0 4px var(--accent);   /* one ring, one global rule */
--disabled-opacity: 0.5;                 /* one value for the 12+ */
--overlay-bg: rgba(0,0,0,0.6);           /* light: rgba(15,23,42,0.4) */
--overlay-blur: 8px;
--shadow-color: rgba(0,0,0,0.35);        /* light: rgba(0,0,0,0.08) — drives --elev-* */
--elev-1: 0 1px 3px var(--shadow-color);
--elev-2: 0 6px 16px var(--shadow-color);
--elev-3: var(--shadow);                 /* modal; keeps existing --shadow as alias */

/* STATUS PAIRS (bg + fg per role) — the tone map every Badge/pill reads ONCE.
   Dark = translucent-hue bg + bright fg; light = solid tint bg + dark fg
   — exactly the html.light pattern already proven at globals.css:196-202. */
--success-bg / --success-fg   --warning-bg / --warning-fg   --danger-bg / --danger-fg
--info-bg / --info-fg         --accent-bg / --accent-fg      --neutral-bg / --neutral-fg
```

### 2.4 Light/dark: intentional, not inverted

Anchor on the **existing** `html.light` model — a deliberate per-mode override that already ships real light values including the warning/danger boxes (`globals.css:196-202`). Primitives are mode-agnostic and live once. Semantics are declared in `:root` (dark) and **re-declared** in `html.light` with hand-tuned values. For the status pairs this means dark = `--success-bg: rgba(16,185,129,.14)` + bright `--success-fg`; light = `#ecfdf5`-range bg + `#047857`-range fg. Studio (`--ms-*`) and Contracts (`--cs-*`) are their own light-first identity worlds and are **not touched** beyond inheriting the mode-agnostic `:root` scales; their existing token blocks already satisfy the semantic-slot contract (surface/ink/accent/line/radius), so a token-driven primitive rendered inside them resolves correctly. Client token pages (intentionally fixed-light) get a scoped `.wf-public` class mapping the same semantic names to fixed light values, rather than hardcoding hex.

### 2.5 The z-index ladder

Replaces the 34 anarchic literals (1..99999). The ordering makes the "invoices modal renders under its own toast" bug **structurally impossible** — a toast always outranks a modal, a modal always outranks its overlay.

| Token | Value | Absorbs | Purpose |
|---|---|---|---|
| `--z-raised` | 10 | 1,2,20,30,40,50,60 | hover-lifted cards, focused rows |
| `--z-sticky` | 100 | (matches `.sidebar` z-100) | sticky headers/toolbars, sidebar |
| `--z-nav` | 200 | 200,250,290 | top nav / shell chrome |
| `--z-dropdown` | 400 | 300,320,350,380,500,510,600 | popovers, menus, selects, FABs |
| `--z-overlay` | 600 | — | modal backdrop / scrim |
| `--z-modal` | 800 | 700,850,998,999,9000,10000 | dialog/side-panel content |
| `--z-toast` | 1000 | the 9999 confirm/toast cluster | toasts + confirm (always above modal) |
| `--z-banner` | 1200 | 99999 | impersonation / system banners |
| `--z-max` | 9999 | — | last-resort drag ghosts (documented escape hatch) |

### 2.6 Incremental migration fit

Zero forced rewrites. The tokens are **added** to `:root`/`html.light`, so every existing `var(--*)` reference resolves identically. Migration is opt-in and mechanical, per property, in any order:

1. Replacing `borderRadius:12` with `'var(--radius-lg)'` or `padding:'16px'` with `'var(--space-4)'` is a one-line change touching only that property; legacy and migrated properties coexist in the same style object.
2. The **one** non-additive step — a global `:focus-visible { box-shadow: var(--focus-ring); outline:none }` plus retiring the `outline:none` border-swap — is behavior-only, needs no per-screen edits, and deletes the 61 `onFocus/onBlur` handlers as files are touched.
3. New screens use the `components/ui` primitives (which read semantics); legacy inline screens stay until touched.
4. **Guardrail (Rule of Three / Article 11):** new code may not introduce a raw hex/px for any dimension a token covers; existing literals are grandfathered and swapped on-touch. A diff-scoped CI grep gate enforces this on new drift only (see §3 governance).

The `r-*` utility library already proves className-over-inline layering coexists across all four contexts — the token+primitive layer follows the identical adoption model.

---

## 3. Primitive architecture

Two hard architectural rules carry through every entry: **(a)** ship **importable React primitives in `components/ui/`, NOT revived global classes** — grep proves the classes are ignored (`.badge`/`.card`/`.input-field` = 0 product uses) while inline `var(--*)` is adopted (76/85), and `ControlShell`'s Card/Stat/Pill (293 uses) proves an importable atom set *does* get adopted. **(b)** The scale tokens live at `:root` so Studio (`--ms-*`) and Contracts (`--cs-*`) inherit shared scale while overriding only identity — do **not** fold `.ms-chip`/`.ms-status`/`.ms-modal`/`.ms-empty` into Core.

**The minimal set = a token substrate + 8 core primitive entries.** Switch/Checkbox are grouped under the field system; Spinner/Skeleton/EmptyState/ErrorState under one state family — keeping the surface small while covering every evidence-backed duplication class. **Every primitive ships WITH its first-migration targets** — the design system already exists and is dead; a primitive that lands without migrating a real screen will be dead too.

### 3.1 Button

- **Purpose:** collapse the 6+ primary-CTA identities and ~22 named button consts.
- **Variants:** `primary` (CANONICAL = flat `var(--accent)`, radius `--radius`, wt `--fw-bold` — adopts `.btn-primary`; **retires all gradient primaries**; gradient survives only as a documented one-off marketing/auth `hero` class, not a product variant), `secondary` (transparent, 1px `--border`, wt 600), `ghost` (no border, hover `--surface2` — replaces ~15 local `btnGhost/iconBtn/segBtn`), `danger` (flat `--danger`).
- **Sizes:** `sm` (pad `--space-2`/`--space-4`, `--fs-body`), `md` (pad `--space-3`/`--space-5`) — default.
- **States:** hover (CSS from tokens — kills JS hover), disabled (native `disabled` attr + `--disabled-opacity`), `loading` (renders Spinner + disables + `aria-busy` — unifies the `loading/saving/busy/sending` flag chaos at the visual layer).
- **A11y:** real `<button type>`; `disabled` sets native attr not just opacity; focus via global `:focus-visible`; icon-only requires `aria-label` (dev-warn otherwise).
- **API:** `<Button variant="primary|secondary|ghost|danger" size="sm|md" loading disabled onClick>Label</Button>` — no polymorphic `as`, no `color` prop, no `gradient` prop.
- **Styling source:** `--accent`/`--on-accent`/`--radius`/`--fw-bold`/`--focus-ring`.
- **Replaces:** `.btn-primary`/`.btn-secondary` (as component), the ~22 named consts, confirm.js/AddLeadModal button chrome.
- **First targets:** `AddLeadModal.js` → `leads-list`+`team`+`accept-invite` (gradient cluster) → `clients`+`contracts`.

### 3.2 Badge

- **Purpose:** collapse 5+ pill impls, 105 inline radius-999 pills, and the per-module palettes.
- **Variants:** `tone` = `neutral|info|accent|success|warning|danger` (modeled on `ControlShell` Pill's `tone` API but **re-pointed** at `--success/--warning/--danger/--accent` status pairs — the `#34d399` private palette is retired); a **`color="#hex"`** variant to absorb `TagChip`/`LockBadge` (color-keyed, not tone-keyed); optional `dot`.
- **Sizes:** `sm` (`--fs-caption`, pad 2px8px), `md` (pad 3px9px) — default. Radius always `--radius-pill`.
- **A11y:** presentational span; color never the sole signal (label text always present); live status is the caller's `aria-live`, not the Badge's.
- **API:** `<Badge tone="success" size="md" dot>Paid</Badge>` or `<Badge color={tag.color}>{tag.name}</Badge>`.
- **Fed by shared lib maps** — `lib/leadStatus.js`, `lib/contractStatus.js`, `lib/roles.js`, plan-tier map in `lib/plan.js`, `lib/invoiceStatus.js` — so labels/tones are defined once. **Status divergence is a DATA fix, not just visual.**
- **Replaces:** dead `.badge`; `ControlShell` Pill (re-point); the 6 lead maps, 3 contract maps, invoice map, NavBar PlanBadge + LockBadge + dead-tier `planTone`; informs `TagChip`. Studio `.ms-chip`/`.ms-status` stays a dialect.
- **First targets:** leads-list + dashboard (dark-vs-light mismatch) → invoices + contracts overview/vault → control (swap Pill to re-pointed tones).

### 3.3 Modal

- **Purpose:** replace ~20 hand-rolled overlays that share no code, no `role=dialog` (except confirm), no focus trap (0/20), no scroll-lock (0/20). This is an **a11y + behavior gap**, not just visual drift.
- **Variants:** `default` centered card only (Studio keeps `.ms-modal` full-bleed as a separate themed skin).
- **Sizes:** `sm`/`md`/`lg` max-width caps (AddLead vs invoices vs contracts-send genuinely differ).
- **States:** `open`/`closed` (controlled via `open`).
- **A11y (built ONCE, non-configurable so it can't be misused):** `role="dialog"` `aria-modal` + `aria-labelledby` → title; focus trap (Tab cycles within, focus restores to opener on close); Escape closes; backdrop-click closes (opt-out `dismissable={false}`); scroll-lock (toggles body overflow on mount/unmount); z-index `--z-modal`.
- **API:** `<Modal open onClose title="Add lead" size="md" footer={<…>}>{body}</Modal>` — header/title/close and footer are slots; behavior is fixed.
- **Styling source:** `var(--surface)/--border/--radius/--overlay-bg/--overlay-blur/--elev-3` — works light **and** dark.
- **Replaces:** AddLeadModal (`#0f1117`), ScheduleMeetingModal (`.sm-card #14161f` — swap shell, keep logic), invoices modal (dead backdrop + z-under-toast), HuddleModal (`#0b0d16`), contracts/[id] modals, control/support `Modal()`.
- **First targets:** AddLeadModal → invoices modal → ScheduleMeetingModal.

### 3.4 Toast (`ToastProvider` + `useToast`)

- **Purpose:** replace the ~14 per-page toasts (7 durations, 3 backgrounds, colliding at z-9999). Built as a **provider+hook twin of the proven `ConfirmProvider`** so it slots into the same app-wide mount.
- **Variants:** `tone` = `success|danger|info` from `--success`/`--danger`.
- **States:** entering/visible/leaving; auto-dismiss on one default duration (success ~3s; errors persistent-until-dismissed).
- **A11y:** region `aria-live="polite"` (danger `assertive`); dismissible; single stacking context at `--z-toast`.
- **API:** `const toast = useToast(); toast.success('Invoice sent'); toast.error('Something went wrong')` — message + tone only; position/duration/z owned by the provider.
- **Replaces:** the ~14 `flashToast/showToast/say` copies; sits beside `useConfirm` to give platform-15/settings-team-11 one voice.
- **First targets:** invoices + team + settings → knowledge + profile (load-failure toasts also feed the ErrorState story).

### 3.5 ConfirmDialog — re-tokenize + extend the **existing** `lib/confirm.js`

- **Purpose:** the ONE genuinely-adopted overlay primitive (12 files) — but **verified dark-only** (`confirm.js:136 #14161f`, `:140 #f3f4f6`, `:172 #818cf8`, `:219 #6366f1→#a855f7`, `:123 z-9999`). Fix, don't reinvent: re-skin the inline `<style>` onto `var(--surface)/--text/--border/--overlay-*` + `--z-toast`, and add a typed-danger tier.
- **Variants:** keep `tone` (`default|danger|success|warning|info`) and `alertOnly`; **add `requireTyped:'DELETE'`** for irreversible/bulk ops.
- **States:** open/closed, awaiting-typed-match.
- **A11y:** already correct (`role=dialog`, Escape=cancel, Enter=confirm, backdrop) — preserve; `requireTyped` disables confirm until the typed value matches; native `window.confirm` fallback for out-of-provider public pages preserved.
- **API:** `const ok = await confirm({ title, message, tone:'danger', requireTyped:'DELETE' })` — same promise API already in use; only chrome + one option change.
- **Replaces:** its own dark chrome; the 8+ remaining `window.confirm/alert/prompt` (incl. public `booking/manage:28`, `d/[token]:206`); the missing typed-danger tier.
- **First targets:** confirm.js itself (token re-skin — unblocks light mode for all 12 consumers) → leads-list merge (`requireTyped`) → public booking/manage + d/[token].

### 3.6 Field system — `FormField` + `Input`/`Select`/`Textarea` (+ `Switch`, `Checkbox`)

- **Purpose:** there is NO shared FormField; `.input-field` is dead; the `!important` override causes the 61 focus handlers. ~18 input consts, 4 incompatible Field wrappers, single-string validation with zero a11y.
- **Sub-controls:** `Input`/`Textarea`/`Select` share one field chrome; `Switch` (one geometry, `on/onChange`, `role=switch`/`aria-checked`, default `--accent`) replaces the **3 Toggles**; `Checkbox` (token `accentColor`, native semantics) replaces the native scatter.
- **Variants:** `tone = default | public(light)` — the public variant lets `d/book/shop` token pages share the primitive instead of hardcoding `#fff/#d8d8e0`.
- **Sizes:** `sm`/`md` (md default; sm for dense CRM inline edits).
- **States:** default / focus (**real CSS `:focus-visible`** — kills the 61 handlers) / invalid / disabled / required.
- **A11y (the biggest value-add):** `FormField` renders a canonical `<label htmlFor>`; wires `required→aria-required`; binds error text via `aria-describedby` + `aria-invalid`; required shown as a real marker, not a bare `*`. **CRITICAL non-obvious step:** ship as scoped `.wf-input/.wf-field` classes and **scope down the global `input,textarea,select !important` override** — otherwise it fights the primitive's own `:focus` rule.
- **API:** `<Field label="Phone" required error={err} hint="…"><Input value onChange invalid={!!err}/></Field>` — error is a string, control is a child, a11y wiring is automatic. Opt-in per form → legacy inline forms coexist.
- **Styling source:** one padding / radius(`--radius`) / border(1.5px `--border`) / bg(`--surface2`) / focus(`--focus-ring`).
- **First targets:** AddLeadModal (3 focus colors in one form) → invoices + settings modals → accept-invite + profile (6 handlers each).

### 3.7 State family — `Spinner` + `EmptyState` + `ErrorState` + `Skeleton`

- **Purpose:** 0 skeletons; `@keyframes spin` in 14 files; 35 inline spinner divs; ~30 empty states across 3 tiers; swallowed `catch {}`.
- **`Spinner`:** sizes `sm`(16)/`md`(24)/`lg`(44) on the single `globals.css` `@keyframes spin`; `role="status"` + `aria-label`. Promotes the `SidePanel` Spinner. **Delete the 14 dup keyframes on migration.**
- **`EmptyState`:** icon+title+description+optional CTA; generalizes `SidePanel` Empty + `clients:88-94` Tier-3 (the best-in-class); landmark region with heading.
- **`ErrorState`:** AlertTriangle tile + message + Retry `Button`; generalizes `leads/[id]:1184`. **Paired with a rule (grep-gated):** `load()` catches set an error state, never `catch {}`.
- **`Skeleton`/`SkeletonRow`:** minimal, one pulse token, scoped to the 3 big tables (leads-list, invoices, contracts vault) — not a generic framework.
- **Styling source:** `var(--border)/--accent/--text-muted/--surface2`. Studio `.ms-empty`/`.ms-loading` kept as themed variants driven from the same scale.
- **First targets:** clients (`catch {}`→ErrorState; empty→EmptyState — closes crm-clients-10) → leads-list + invoices → delete the 14 keyframes.

### 3.8 Evaluate-and-decide list

| Primitive | Include now? | Rationale |
|---|---|---|
| **Switch** | **Yes** (in field system) | 3 Toggles, 3 prop shapes AND 3 geometries — high-leverage, low-risk. |
| **Checkbox** | **Yes** (in field system) | Booleans expressed 4 ways; one token-accent checkbox converges them. |
| **Skeleton** | **Yes** (state family) | Verified 0 in codebase; biggest perceived-speed gap; scoped to 3 tables. |
| **FormField** | **Yes** (as the label/error wrapper) | 4 local Field wrappers already exist; a11y wiring is the value-add. |
| **Card + Stat** (hoist from ControlShell) | **Defer — named fast-follow** | 293 adopted uses, but Card is largely the existing `.card` and the win is reconciling radius 14→`--radius-lg`, which the token already does. Clean fast-follow; not needed to kill the top-measured duplication. |
| **Tooltip** | **Defer** | `PlanLock` LockTooltip covers the one recurring need; no measured cross-app duplication. Mature-system reflex, not evidence. |
| **Alert (inline)** | **Defer** | `--warning-*`/`--danger-*` boxes already exist; Toast + ErrorState cover observed cases. |
| **Tabs** | **Defer** | Tab strips exist (`.sm-tab`, control segmented, studio) but not quantified as top-tier duplication and each is entangled with its screen. |
| **Dropdown/Menu** | **Defer** | The 4 shells' user-menus are intentionally module-scoped chrome; forcing a shared Menu risks fragmenting deliberate shell identity (constraint: shells coexist, not merge). |
| **Radio** | **Defer** | Sparse (a few native radios); below the 3+ divergent-impl bar. The field system's token `accentColor` covers them. |
| **PublicBrandHeader** | **Defer — adjacent** | Necessary for gap-1/client-portal-2 but **not sufficient** (backend must return brand); belongs to a client-portal follow-up, not this primitive set. |

### 3.9 Sequencing — the cheapest, highest-value wins first

1. **Re-tokenize `confirm.js` + `AddLeadModal`** — the two most-shared surfaces that break light mode; highest visibility, lowest risk.
2. **Ship the `--z-*` ladder + one global `:focus-visible` rule** — quick, behavior-only, unblocks Modal and restores platform-wide keyboard focus.
3. **`clients` `catch {}` → `ErrorState`** — closes crm-clients-10 (an outage currently reads as "zero clients").
4. **The `window.confirm` swaps** — 1-line each, including public pages.
5. Then the CRM cluster (leads-list, invoices, dashboard) for Button/Badge/Field/Modal — already on core tokens, highest traffic.

**Governance (Article 0 / Rule of Three / Article 11):** a primitive is the default (hand-rolling an atom that exists is a review-blocking defect); a new variant requires a one-paragraph note on the semantic gap it fills (cosmetic variation is drift, rejected); dead classes (`.btn-secondary/.badge/.card/.input-field/.table-row`) are marked deprecated and removed once primitives ship — **not** revived; a diff-scoped CI grep gate fails new inline fixed-overlay backdrops, new local `fld/inputStyle/Pill/STATUS_*` consts, any `window.confirm/alert/prompt`, new `@keyframes spin` outside globals, and hardcoded `#6366f1/#10b981/#ef4444/#f59e0b` — gating **new** drift so the legacy set only ever shrinks.

---

Files verified against source for this proposal: `src/app/globals.css` (25-token `:root` + `html.light` + `.card/.btn-*/.badge/.input-field/.table-row` dead classes + `@keyframes spin` at :172 + `r-*` utilities), `src/lib/confirm.js` (hardcoded `#14161f/#f3f4f6/#818cf8/#6366f1→#a855f7`, z-9999 at :123-240), `src/components/control/ControlShell.js` (Card radius 14 :124, Stat wt 800 :130, private Pill palette :135-142), `src/components/AddLeadModal.js` (Tailwind `bg-[#0f1117]` + `from-violet-600 to-cyan-600` + `z-50` at :41-47). Full finding IDs and evidence read from `ds-findings.md`.

---

## 4. Visual direction

### 4.1 The language: operational calm

WappFlow has one visual language, already latent in `app/globals.css`: a premium, restrained, dark-first workspace on Inter, a single indigo accent (`--accent` `#6366f1`), flat token-driven surfaces, and purposeful whitespace. PROP-002 does not invent this language — it *names* it so the drift measured in the audit stops. The through-line is **scarcity and intention**: one accent, semantic-only color, one radius scale, one weight for "bold," flat surfaces, and depth reserved for what actually floats.

It is explicitly **not** three things it currently drifts toward:

| Not this | Evidence of the drift today | The rule instead |
|---|---|---|
| **Generic Tailwind admin** — rainbow status palettes, candy gradients as default CTA | `AddLeadModal.js:47` primary CTA is `from-violet-600 to-cyan-600` (a gradient that appears nowhere else in Core, `crm-leads-1`); 6+ divergent primary-CTA identities (`design-system-9`); ControlShell's private green `#34d399` ≠ `--success #10b981` (`design-system-2`) | One accent for the single primary action; color reserved for meaning (`--success/--warning/--danger`); gradient retired from the product button |
| **Glassmorph-AI** — backdrop-blur as decoration | 43 inline `backdropFilter` declarations, 3 divergent backdrop colors (`rgba(0,0,0,.6)` / `rgba(6,6,8,.6)` / `rgba(30,30,28,.35)`) | `backdrop-blur` is a modal/overlay affordance only, driven by `--overlay-bg`/`--overlay-blur`, never ornament |
| **Decorative-concept-UI** — ornament without meaning | Half-pixel type sizes (12.5/13.5/14.5), `fontWeight` freehand across 700/800/900 (`design-system-9`), 24 distinct radii (`design-system-6`) | Every visual choice carries meaning; radius/weight/size come from a scale, not per-element taste |

### 4.2 The seven concrete rules

1. **Color is scarce.** One accent (indigo, `--accent`) for the single primary action and active/selected state per surface. Semantic color means meaning only — `--success #10b981`, `--warning #f59e0b`, `--danger #ef4444` with the existing light counterparts `#059669/#d97706/#dc2626`. Everything else is neutral surface/border/text. This is what collapses the "5 status palettes / 3 greens / 6+ CTA identities" (`design-system-1`, `-2`, `-9`).
2. **Surfaces are flat.** Layering is `--bg` (canvas) → `--surface` (card) → `--surface2` (inset/input) → `--border` (1px hairline). Depth = surface-step + hairline, not shadow stacks. Elevation (`--elev-1/2/3`) is reserved for genuinely floating layers (modals, popovers, toasts). Already the adopted grammar — 76/85 styled files consume `var(--*)`.
3. **One radius scale.** `--radius-sm:8 / --radius:10 (kept) / --radius-lg:14 / --radius-pill:999`. Cards, inputs, buttons, modals all read from it. Corner radius stops signaling "different module" (`design-system-6`: cards drift 10→18px today).
4. **One type system.** Inter throughout Core; a 4-rung weight scale (`--fw-regular 400 / -medium 500 / -semibold 600 / -bold 700`) and a small size ramp (`--fs-caption 12 / -body 14 / -h3 16 / -h2 20 / -h1 28`). "Bold" means 700, once; 800/900 are retired from Core body/heading use (`design-system-9`). Studio keeps its display weights as an intentional dialect.
5. **Dark and light are both first-class.** `html.light` is a deliberate per-mode override (already well-built, including `--warning-bg/border/text` and `--danger-bg/border`), **not** auto-inversion. The enforcing rule: primitives and migrated surfaces read `var(--*)` only — a hardcoded hex is a defect because it silently ignores `html.light`. The two most-shared "primitives" (`lib/confirm.js`, `AddLeadModal.js`) are currently hardcoded dark slabs and must be re-tokenized (`crm-leads-1`, `design-system-3`).
6. **Motion is calm and quick.** `--dur-fast 120ms / -base 180ms / -slow 240ms` with `--ease-standard`. Transitions are for state feedback (hover/focus/open-close), never idle animation; `prefers-reduced-motion` collapses them.
7. **Density is a scale choice, not a second language.** Dense where productivity needs it (CRM triage: 14px body, tight rows), spacious where presentation needs it (Studio galleries, client pages) — but both draw from the same tokens.

### 4.3 The four contexts — one system, shared grammar over per-context scales

WappFlow runs four styling worlds that must share **interaction grammar, a11y contract, and the root scale tokens** while keeping **legitimate visual identity**. The rule for every context: it may override *identity* (font, accent, radius, density) but must satisfy the same *semantic slots* (`surface/text/border/accent/success/warning/danger`) and the same interaction/a11y contract. Studio already remaps the core vars inside `.ms-root` (`studio.css:60-63`) — this is the **sanctioned mechanism** that lets a token-reading Core primitive render correctly inside Studio without a rewrite.

| Context | SHARED (must not vary) | MAY VARY (legitimate identity) |
|---|---|---|
| **CRM / operational** (leads-list, dashboard, leads/[id], clients, invoices, reports, team, settings, control) — *the reference context, migrates first* | Full Core token set + all Core primitives (Button, Badge, Field, Modal, Toast, EmptyState, Spinner, ErrorState); the full a11y contract; status semantics from shared lib maps (`lib/leadStatus.js`, `lib/contractStatus.js`, `lib/invoiceStatus.js`, `lib/roles.js`, plan map in `lib/plan.js`). ControlShell's private Pill palette is retired to the shared Badge tone map; its Card `radius 14` reconciles to `--radius-lg`. | **Density only** — tight end of the spacing scale, compact rows. Must NOT vary tokens, radius, palette, badge tone map, button treatment, or interaction grammar. |
| **Media Studio** (`studio/*`, `--ms-*`, 3 identities: monochrome/editorial/cinema) | The shared **interaction grammar + a11y contract** (modal focus-trap/Escape/scroll-lock/restore, focus-visible, confirm-for-destructive, aria labeling, toast semantics, reduced-motion); the **semantic-slot contract** (`.ms-root` remap makes Core primitives resolve correctly); root-level scale tokens (z-index, focus, motion). | Its **entire visual identity**, legitimately: display type (Bodoni/Anton/Fraunces, clamp(44–104px)), its own radius (`--ms-radius 2px`, flush photo grid), gallery-air density (`--ms-pad-y` up to 84px), monochrome-ink accent. **Keeps** `.ms-chip`/`.ms-status` (46 uses), `.ms-empty`/`.ms-empty-soft`/`.ms-loading`, `.ms-modal` as intentional dialects — NOT folded into Core (`design-system-7`, `-8` explicitly exclude these). |
| **Contracts Studio** (`contracts/*`; shell on core tokens, document canvas on `--cs-*`, 3 themes) | Everything the CRM shares for the **shell** (chrome already uses core tokens): Core Button/Badge/Field/Modal/Toast/confirm + full a11y contract. Contract status becomes ONE canonical map (`lib/contractStatus.js`) feeding the shared Badge — killing the 3 STATUS maps / 3 vocabularies ('Approval' vs 'Needs approval' vs 'In review', `contracts-9`). Retire the local `btnPrimary`/`btn`/`inp`/`miniInp` consts (`contracts-10`). Destructive-confirm: `contracts/page.js:116` `window.confirm` → `useConfirm` (`design-system-4`). | The **document canvas** identity: `--cs-*` serif typography (Playfair/Fraunces, `--cs-display-wt 800`), 3 document themes, legal-document spacing. Stays. |
| **Client-facing token pages** (g/d/shop/pay/client/book/folio — public, permanently **light**) | The a11y + interaction contract; a re-tokenized confirm (so it stops being a dark slab on a light page, `design-system-4`); standardized "link unavailable/expired" `ErrorState` (`client-portal-10`). **Biggest shared win: one `PublicBrandHeader`/`PublicFooter`** rendering the studio's real logo/name/accent — replacing 4-5 hand-rolled brand blocks and killing the accidental `#0ea5e9→#6366f1` fallback-gradient collision with the Contracts brand icon (`gap-1`, `client-portal-2`, `-7`). *Note: closing `gap-1` fully also needs the backend endpoints to return brand — the primitive is necessary but not sufficient.* | Intentionally **fixed-light** and warm/spacious regardless of admin theme — resolves to a light-mode slot set via a `.wf-public` scope / `tone="light"` variant on Field/Modal/Button, not hardcoded `#fff`/`#d8d8e0`. Imagery and generous spacing stay. Brand plumbing, failure semantics, and confirm may NOT vary per page. |

---

## 5. Interaction & accessibility contract

This is the behavioral spine of the system. The columns split what is **guaranteed once by a primitive** (cannot drift per screen) from what **remains the feature surface's job** (semantic/copy decisions a primitive can't make). Where a row closes an audit finding, it is cited.

### 5.1 Keyboard, focus & stacking

| Dimension | PRIMITIVE-enforced | FEATURE-SURFACE responsibility |
|---|---|---|
| **Keyboard reachability** | Every interactive primitive renders a native focusable element; no positive `tabindex`; logical DOM order | Author places controls in a sensible order; provides a keyboard path to hover-only affordances (e.g. the contracts toolbar bare-icon / literal "¶" buttons, `contracts-7`, need a visible label or labeled overflow menu) |
| **Visible focus** | **One global `:focus-visible` rule** — `box-shadow: var(--focus-ring)` (2px `var(--accent)`, 2px offset), replacing today's `input:focus{outline:none!important}` + border-swap. Core currently has **zero** `:focus-visible` rules — keyboard focus is near-invisible platform-wide. Ships the `--focus-ring` token and **deletes the 61 hand-wired `onFocus/onBlur` border-color handlers across 10 files** (`design-system-5`) | Nothing — this is fully owned by the token + Field/Button primitives |
| **Focus trap (modal)** | Modal traps Tab within the dialog; focus moves in on open | Author decides what receives initial focus if not the first control |
| **Focus restore** | Focus returns to the trigger element on close | — |
| **Stacking order** | `--z-*` ladder (`--z-dropdown 200 < --z-sticky 300 < --z-overlay 600 < --z-modal 800 < --z-toast 1000 < --z-banner 1100`) replaces 34 anarchic literals (1..99999). Guarantees a modal renders above its backdrop and a toast above any modal — the `invoices/page.js` modal (z-300) rendering **under its own toast** (z-9999) becomes impossible (`design-system-3`) | Author picks the correct rung's primitive (Modal vs Toast vs dropdown); never a raw integer |

### 5.2 Modals & overlays

| Dimension | PRIMITIVE-enforced (Modal) | FEATURE-SURFACE responsibility |
|---|---|---|
| **Dialog semantics** | `role="dialog"` + `aria-modal="true"` + `aria-labelledby` wired to the title. Today **only `confirm.js` has any dialog a11y**; the ~20 other overlays have none (`design-system-3`) | Provides the title text |
| **Escape to close** | Built in, once | May opt into `dismissable={false}` for a required decision |
| **Outside / backdrop click** | Backdrop closes; card stops propagation. Today inconsistent — `invoices/page.js:136` backdrop is dead | — |
| **Scroll-lock** | Toggles `body` overflow on open, releases on close. Today **zero of ~20 modals** lock scroll (`design-system-3`) | — |
| **Theming** | Chrome from `var(--surface)/--border/--radius/--overlay-*` → works light + dark. Fixes the hardcoded-dark slabs: `AddLeadModal` `#0f1117` (`crm-leads-1`), `confirm.js` `#14161f`, HuddleModal `#0b0d16` | Picks size (sm/md/lg); supplies body + footer content |

### 5.3 Forms, validation & inline errors

| Dimension | PRIMITIVE-enforced (Field / Input / Select / Textarea / Checkbox / Switch) | FEATURE-SURFACE responsibility |
|---|---|---|
| **Label association** | Canonical `<label htmlFor>` (one size/weight), replacing ~6 local `lbl` consts + inline label blocks (`design-system-5`) | Provides label text |
| **Required marking** | `required` + `aria-required` on the control; a real marker, not a bare `*` glued into label text (`AddLeadModal.js:83`) | Declares which fields are required |
| **Error binding** | On error: `aria-invalid=true` + `aria-describedby` → inline error node; error color always `--danger` (retiring the `#ef4444`/`#dc2626`/red-400 drift) | Owns the **validity rule** and the **error copy**; sets per-field errors, not one submit-time string |
| **Field chrome** | One padding / `radius var(--radius)` / `border 1.5px var(--border)` / `background var(--surface2)`; real CSS `:focus-visible`. **Critically scopes/removes the `globals.css:118` `input,textarea,select {…!important}` override** that today defeats inline focus styling and forces the 61 handlers | — |
| **Boolean controls** | One `Switch` (single geometry + `on/onChange` contract, `role="switch"` + `aria-checked`) replaces the 3 divergent Toggles (44×24, 46×26, 40×23); one token-accent `Checkbox` replaces the native scatter + the fake span+Check | Chooses switch vs checkbox semantics |

### 5.4 Async, loading, disabled & feedback

| Dimension | PRIMITIVE-enforced | FEATURE-SURFACE responsibility |
|---|---|---|
| **Async submit** | `Button loading` prop → disables the native control (`disabled` attr, not just opacity), sets `aria-busy`, swaps to a busy label + Spinner. Standardizes the visual so the `loading`/`saving`/`busy`/`sending` naming drift stops mattering at the call site | Owns the boolean and its name; decides the busy label copy |
| **Disabled** | Single `--disabled-opacity` (replacing 12+ scattered opacity values); native `disabled` | Decides *when* disabled |
| **Loading** | One `Spinner` on the single `globals.css` `@keyframes spin` (delete the 14 duplicated local `@keyframes` + 35 inline border-spinner divs, `design-system-8`); `Skeleton`/`SkeletonRow` for data tables (leads-list, invoices, contracts vault) to kill the load flash — **zero skeletons exist today** | Chooses spinner vs skeleton per surface |
| **Empty vs error** | `EmptyState` (icon/title/description/CTA) and `ErrorState` (AlertTriangle + message + Retry) are distinct primitives | **Rule the primitive enables but can't force:** `load()` catches must set an `ErrorState`, never `catch {}`. Today `clients/page.js` swallows errors so an outage looks like "zero clients" (`crm-clients-10`) |
| **Toast** | One `ToastProvider`/`useToast` (twin of `ConfirmProvider`): ONE position, tone color from `--success/--danger`, `--z-toast`, `aria-live="polite"` (`assertive` for errors). Duration policy: success **~3s auto-dismiss**; errors **persistent until dismissed**; **actionable** variant supported. Replaces ~14 copies with 7 durations (2400–4000ms) / 3 backgrounds (`settings-team-11`, `platform-15`) | Owns the message text and which tone/action |

### 5.5 Destructive actions & confirmation

| Dimension | PRIMITIVE-enforced (`useConfirm`, re-tokenized) | FEATURE-SURFACE responsibility |
|---|---|---|
| **Confirm dialog** | `tone` (default/danger/success/warning/info), Escape=cancel / Enter=confirm, backdrop-click, `role="dialog"`/`aria-modal`, native fallback for out-of-provider public pages. **Re-skinned to `var(--*)`** so it works in light mode (today hardcoded `#14161f`/`#f3f4f6`/`#6366f1→#a855f7`), routed through `--z-modal` | Writes the confirm question |
| **No native dialogs** | — | Route destructive actions through `useConfirm`, never `window.confirm/alert/prompt`. 8+ native calls survive incl. **public** `booking/manage/[token]:28`, `d/[token]:206`, plus `contracts/page.js:116`, `studio/trash:37`, `leads-list` merge/move (`design-system-4`, `crm-leads-12`, `platform-6`) |
| **Typed-danger tier** | NEW `requireTyped:'DELETE'` — confirm stays disabled until the typed value matches | Uses it for irreversible/bulk ops (merge duplicates, permanent purge, empty trash) — today a single OK click |

### 5.6 Screen-reader, motion & contrast

| Dimension | PRIMITIVE-enforced | FEATURE-SURFACE responsibility |
|---|---|---|
| **Status not color-alone** | Badge always renders label text alongside tone/dot | Picks the semantically correct tone (from the shared lib status maps) |
| **Icon-only buttons** | Button dev-warns when children is icon-only without `aria-label` | Supplies the `aria-label` |
| **Live announcements** | Toast region `aria-live`; Spinner `role="status"` + default `aria-label="Loading"` | — |
| **Reduced motion** | All primitive transitions collapse under `prefers-reduced-motion`; spinner remains as the accessible busy indicator | Avoids adding non-primitive idle animation |
| **Contrast (WCAG AA)** | Token pairs (`--*-bg`/`--*-fg`) chosen to meet 4.5:1 body / 3:1 large-UI in **both** themes; the fixed-light public slot set is AA-checked independently | Doesn't override token pairs with ad-hoc low-contrast hex |

---

## 6. Technical boundaries

### 6.1 What PROP-002 changes

1. **`app/globals.css` `:root` + `html.light` — additive token expansion only.** Adds the missing scale tiers (radius, spacing, elevation, z-index ladder, focus-ring, motion, type, overlay, status bg/fg pairs, `--on-accent`, `--disabled-opacity`) to **both** mode blocks. No existing token is renamed or removed — `--radius` stays, `--shadow` stays (aliased to `--elev-3`) — so all ~5,148 inline `var(--*)` styles and the 76/85 token-consuming files keep resolving identically on day one.
2. **A new `components/ui/` directory of importable React primitives:** `Button`, `Badge`, `Modal`, `Field` (+ `Input`/`Textarea`/`Select`/`Checkbox`/`Switch`), `EmptyState`, `Spinner`, `ErrorState`, `Skeleton`, plus a `ToastProvider`/`useToast`. Each reads **only** the new tokens.
3. **A new `lib/` status/label source-of-truth set:** `lib/leadStatus.js`, `lib/contractStatus.js`, `lib/invoiceStatus.js`, `lib/roles.js`, and a plan-tier map added to the existing `lib/plan.js`. These feed one Badge and kill the 6 lead-status maps, 3 contract-status maps, and dead-tier `planTone` (`design-system-1`, `contracts-9`, `command-center-3`, `settings-team-6`).
4. **Re-tokenize the two adopted-but-dark-hardcoded shared primitives:** `lib/confirm.js` and `components/PlanLock.js` (`PlanLockStyles`) — swap their inline hardcoded hex for `var(--*)`. `confirm.js` also gains `requireTyped`. This is the highest-visibility, lowest-risk win and a precondition for "dark+light both first-class" being true.
5. **One `PublicBrandHeader`/`PublicFooter`** primitive for the client token pages (closes the header half of `gap-1`/`client-portal-2`/`-7`; the backend brand-return is out of scope here — noted as a dependency, not claimed closed).
6. **One global `:focus-visible` rule** and retirement of the `input:focus{outline:none!important}` border-only pattern — the single non-additive CSS change (behavior-only, no per-screen edits).
7. **First-migration adoptions bundled with the primitives** (or the primitives will be dead like the existing global classes): `AddLeadModal`, `leads-list`, `invoices`, `dashboard`, `clients`, `contracts` overview/vault, `control` pages, and the native-`confirm` swaps. Legacy inline screens coexist untouched until touched.

### 6.2 What PROP-002 explicitly does NOT change

- **No framework or styling-framework migration.** Stays on React 19 + Next 16 App Router + inline-styles/CSS-vars, with Tailwind remaining installed and lightly used. No CSS-in-JS lib, no component library, no Tailwind-first rewrite.
- **No page redesigns.** Primitives reproduce the existing look (canonical primary = the flat `.btn-primary` look already in `globals.css`); migration is a swap, not a redraw.
- **No business-logic, auth, DB, or API changes.** Status *labels/colors* are centralized in `lib/`, but no status *values*, endpoints, or schemas change. (`gap-1`'s backend brand fields, `gap-7` soft-delete, and the entitlements catalog are separate proposals.)
- **The dead global CSS classes are not revived.** `.btn-secondary/.badge/.card/.input-field/.table-row` have ~0 product usages; they are marked deprecated (Article 11) and removed once primitives ship. The delivery vehicle is tokens + importable React primitives, because grep proves the inline-first culture ignores global classes.
- **Studio `--ms-*` and Contracts `--cs-*` dialects are not merged or flattened.** `.ms-chip/.ms-status/.ms-modal/.ms-empty` stay as intentional module dialects.
- **No navigation/IA, feature-dedup, or ops-message findings are claimed** (`navigation-ia-6/7/8`, `crm-leads-6`, `studio-video-3`, `studio-library-10`/`galleries-5` pm2 leak) — out of DS scope.

### 6.3 Directories & files expected to be touched

| Path | Change |
|---|---|
| `app/globals.css` | Additive token tiers in `:root` + `html.light`; one global `:focus-visible` rule; scope-down of the `input,textarea,select` `!important` override |
| `components/ui/**` (new) | The React primitives + `ToastProvider` |
| `lib/leadStatus.js`, `lib/contractStatus.js`, `lib/invoiceStatus.js`, `lib/roles.js` (new); `lib/plan.js` (edit) | Canonical status/label/tone maps |
| `lib/confirm.js`, `components/PlanLock.js` | Re-tokenize; `confirm.js` gains `requireTyped` |
| `app/providers.js` | Mount `ToastProvider` beside the existing `ConfirmProvider`/`PlanLockStyles` |
| First adopters | `components/AddLeadModal.js`, `components/ScheduleMeetingModal.js`, `app/leads-list/`, `app/invoices/`, `app/dashboard/`, `app/clients/`, `app/contracts/` (overview + vault), `app/control/*`, plus the native-confirm call sites |
| `components/SidePanel.js` | Dead (mounted nowhere) — delete or defer; excluded from DS scope |

### 6.4 Dependency decision

**No new runtime dependency.** Every primitive is expressible in React 19 + inline styles/CSS-vars already in the repo:

- **Focus trap / scroll-lock / dialog a11y** — hand-written in one `Modal` (~40 lines): a `keydown` Escape handler, a Tab-cycle trap over `querySelectorAll` of focusable nodes, and `document.body.style.overflow` toggle on mount/unmount. `lib/confirm.js` already implements Escape + backdrop + `role="dialog"` with zero deps, proving the pattern. A library like `@radix-ui/react-dialog` or `focus-trap-react` would add ~15–40KB gzipped and a headless-styling model that fights the inline-first, token-driven authoring culture — unjustified when one file covers the need.
- **Toasts** — a provider + hook + `setTimeout` queue mirrors the proven `ConfirmProvider`; no `sonner`/`react-hot-toast` needed.
- **Tailwind is present but not a dependency to add** — it's already installed; PROP-002 neither expands nor removes it.

Net bundle impact: **near-zero to slightly negative** — the primitives *delete* far more duplicated code (14 `@keyframes spin`, 35 spinner divs, ~14 toast systems, ~22 button consts, ~18 input consts, 61 focus handlers) than they add.

### 6.5 SSR / server-vs-client boundaries (Next 16 App Router)

- **Most target pages are already `'use client'`** (leads-list, invoices, dashboard, studio, contracts, the token pages) — they use hooks, state, and event handlers. The interactive primitives (`Button` with handlers, `Modal`, `Field`, `Toast`, `useConfirm`) are **Client Components** (`'use client'` at the top of each `components/ui/*` file) and drop into these pages with no boundary change.
- **Presentational primitives** (`Badge`, `EmptyState`, `Spinner`, `Skeleton`, `PublicFooter`) contain no hooks and can render in **either** a Server or Client Component — they take plain props and emit markup. Keep them free of `useState`/`useEffect` so they don't force a parent to become a Client Component. This matters for the public token pages, some of which fetch server-side.
- **Providers** (`ToastProvider`, existing `ConfirmProvider`, `PlanLockStyles`) mount in `app/providers.js`, which is already a Client boundary under `app/layout.js` — no new top-level boundary.

### 6.6 Hydration, dark-mode, testing

- **Hydration.** Tokens are CSS; they apply pre-hydration with no flash. The `html.light` class is already toggled by the existing theme mechanism (11 files read `'light'`) — PROP-002 adds token *values* to the existing class, changing nothing about *when* the class is applied, so there is no new theme-flash or hydration-mismatch risk. Primitives render deterministic markup from props (no `Date.now()`/`Math.random()` in initial render) to keep server/client output identical.
- **Dark-mode correctness** becomes *structurally* enforced: because primitives read only semantic tokens and both mode blocks define every new token, a migrated surface is correct in both themes by construction. The status bg/fg pairs follow the exact pattern `globals.css` already ships for warning/danger boxes (translucent-hue bg + bright fg in dark; solid tint + dark fg in light), generalized to all six roles.
- **Testing implications.** (a) Primitives get unit/interaction tests once (focus-trap cycles, Escape closes, scroll-lock toggles, `aria-invalid` binds, toast auto-dismiss/persist) — behavior verified in one place instead of per screen. (b) A **CI grep gate** (diff-scoped, so it only gates *new* drift) fails/warns on: new inline `position:'fixed'` overlays outside `components/ui`; new `const (fld|inputStyle|inp|btnPrimary|Pill|STATUS_COLORS|STATUS_META)` in `app/`; any `window.confirm/alert/prompt`; new `@keyframes spin` outside `globals.css`; hardcoded `#6366f1`/`#10b981`/`#ef4444`/`#f59e0b`; raw `zIndex` integer literals above a threshold. (c) Visual/manual verification of the two re-tokenized primitives (`confirm.js`, `PlanLock`) in **both** themes is the acceptance check for the light-mode fix.

**Primitive-required API changes are expected to be exceptional.** The one boundary case is `gap-1`: the `PublicBrandHeader` primitive can render brand only once the public endpoints return `{ brand, logo_url, accent }`. PROP-002 ships the *primitive* and marks the endpoint change as a dependency for a follow-up — it does **not** claim `gap-1` closed.

---

Sections 4, 5, and 6 above are the complete deliverable. Key grounding notes for the proposal reviewer: every quantified claim traces to the forensic inventory and the audit file at `C:/Users/DELL/AppData/Local/Temp/claude/C--Users-DELL-Desktop-Sami/03c435b2-be01-42fc-b941-42baabfd1b53/scratchpad/ds-findings.md`; the two non-obvious implementation traps carried into §6 are the `globals.css:118` `!important` input override (must be scoped or it fights the Field primitive) and Studio's `.ms-root` core-var remap at `studio.css:60-63` (intended, but means Core primitives re-skin under Studio — documented, not a bug).

---

## 7. Adoption strategy

### 7.1 Principle: additive, opt-in, on-touch

The design system already exists on disk and is **dead** — `.badge`/`.card`/`.input-field`/`.btn-secondary` have zero product usages, and the inline-first culture (5,148 `style={{}}` blocks) proves developers ignore global classes. Any strategy that depends on a "big-bang migration" or on reviving those classes will fail the same way. Adoption therefore obeys three non-negotiable rules:

1. **Additive only.** Tokens are *added* to `:root`/`html.light`; no existing token is renamed or removed (`--radius` stays, `--shadow` stays as an alias). Every existing `var(--surface)`/`var(--accent)` reference and every inline style resolves identically on day one. Nothing regresses because nothing existing changes.
2. **Coexistence is permanent during migration.** Legacy inline screens and primitive-based screens render side-by-side. A screen migrated to `<Button>` sits next to one still using a local `btnPrimary` const with no conflict — they read the same tokens.
3. **Migrate on-touch, not on-schedule.** Beyond the seeded proving-ground surfaces, there is no mandate to rewrite untouched files. A file is migrated when it is next edited for other reasons, or when it appears in a batch's explicit adopter list. The grep gate (§7.7) ensures the legacy set only *shrinks*.

Each primitive **ships with its first adopters in the same batch**. A primitive with no migrated caller is dead code — the audit already contains one such graveyard.

### 7.2 Choosing first-adopter surfaces

First adopters are selected by four codebase-grounded criteria, not by convenience:

| Criterion | Why it matters | Surfaces that qualify |
|---|---|---|
| Already on core `var(--*)` tokens | Zero theming rework; the primitive drops in cleanly | leads-list, invoices, dashboard, clients, contracts overview, control/* |
| Highest traffic / most-repeated atoms | Maximum drift killed per file touched | leads-list (STATUS_META, gradient CTA, spinner, empty), invoices (modal, toast, status pill, spinner) |
| Contains an *already-shared* broken primitive | Fixing it fixes N consumers at once | `lib/confirm.js` (12 consumers), `AddLeadModal` (dashboard + leads-list) |
| Self-contained, low blast radius | Safe to prove the pattern | `clients/page.js` (141 lines), the public token pages |

**Deliberately NOT first:** Studio (`--ms-*`) and Contracts document canvas (`--cs-*`) — they are intentional dialects that only need to *inherit* the root scale tokens, not adopt Core primitives wholesale. Forcing them early risks fragmenting deliberate identity for no drift reduction.

### 7.3 Migration batches (summary; full spec in §11)

| Batch | Primitives/tokens introduced | Adopter surfaces | Legacy removed |
|---|---|---|---|
| **A — Substrate + confirm fix** | Full `:root`/`html.light` scale-token expansion (radius/space/z-index/focus/motion/elevation/overlay/type/status-pairs); one global `:focus-visible` rule; re-tokenize `lib/confirm.js` | `lib/confirm.js` (re-skin), globals.css | `outline:none!important` border-only focus; confirm's hardcoded `#14161f`/`#6366f1→#a855f7` |
| **B — Button + Badge + status libs** | `Button`, `Badge`, `lib/leadStatus.js`, `lib/contractStatus.js`, `lib/invoiceStatus.js`, `lib/roles.js`, plan-tier map in `lib/plan.js` | leads-list, dashboard, invoices, contracts overview/vault, control/* Pill | 6 lead-status maps, 3 contract-status maps, ControlShell private Pill palette, `planTone` dead-tier map, ~22 button consts on adopters |
| **C — Modal + Toast + confirm adoption** | `Modal`, `ToastProvider`/`useToast`, `requireTyped` confirm tier | `AddLeadModal`, invoices modal, `ScheduleMeetingModal`, invoices/team/settings toasts; native `window.confirm` swaps (leads-list merge, contracts delete, studio/trash, public booking/manage, d/[token]) | `AddLeadModal` Tailwind `#0f1117`; ~14 local toasts; 8+ native `window.confirm/alert/prompt` |
| **D — Field system** | `Field`/`Input`/`Textarea`/`Select`/`Checkbox`/`Switch`; scope-down the global `input,textarea,select !important` override | AddLeadModal, invoices, settings, accept-invite, profile | ~18 local input consts, 4 divergent `Field` wrappers, 3 `Toggle`s, 61 onFocus/onBlur handlers on adopters |
| **E — State family** | `Spinner`, `EmptyState`, `ErrorState`, `Skeleton` | clients (catch{}→ErrorState), leads-list, invoices; delete 14 local `@keyframes spin` | 35 inline spinner divs, 14 duplicate keyframes, ~30 bespoke empties on adopters |
| **F — Public chrome (follow-up)** | `PublicBrandHeader`/`PublicFooter`, `.wf-public` light scope | g/d/shop/pay/client/book/folio | 4–5 hand-rolled brand blocks; `#0ea5e9→#6366f1` fallback collision |

Batch A is a hard dependency for all others (they read its tokens). B–E are independently shippable once A lands. F is an explicit follow-up (needs backend endpoints to *return* brand — see §7.6).

### 7.4 Per-batch operating contract

Every batch carries the same six clauses:

- **Compatibility:** primitives read only tokens introduced in Batch A; legacy inline callers are untouched and keep rendering. No batch renames a token or a shared export.
- **Expected visual changes:** *intentional* — the 6 CTA identities collapse to one flat accent button; the dark-vs-light lead-status mismatch (`#4338ca` vs `#818cf8`) resolves to one tone; `AddLeadModal` stops being a black slab in light mode; confirm/PlanLock stop being dark-only. These are the point, and they are called out in the batch's manual-verification list so a reviewer expects them.
- **Regression risks:** (a) the global `:focus-visible` rule is the one behavior-wide change — mitigated by shipping it alone in Batch A; (b) scoping the `input !important` override (Batch D) could change unmigrated inputs — mitigated by scoping *down* (narrowing selectors) not removing, and verifying a sample of legacy forms; (c) z-index reflow — mitigated because the ladder is chosen to preserve existing stacking order (banner > toast > modal > overlay) while *fixing* the known invoices-modal-under-its-toast inversion.
- **Verification gates:** see §8; each batch must pass `next build`, primitive interaction tests, keyboard/focus/light+dark spot-checks on adopters, and the grep gate before merge.
- **Rollback:** because batches are additive, rollback is reverting the batch PR. Token additions are inert if unreferenced; a reverted primitive leaves its (still-working) legacy callers because migration PRs delete the local copy *in the same diff* as adding the primitive call — so revert restores both together. No half-state.

### 7.5 Coexistence proof already in the tree

The `r-*` responsive utility library (`r-stack`, `r-scroll-x`, `r-modal`, `wf-fab`) is already applied as classNames over inline-styled containers across **all four contexts** (CRM, Studio, Contracts, public token pages). It is the working proof that a token/className layer coexists with inline styles without a rewrite. The primitive layer follows the identical adoption model — which is why "legacy + primitive coexist" is a demonstrated fact here, not an aspiration.

### 7.6 Honest scope boundary

Adoption of these primitives **does not** close findings that require other work: `gap-1`/`client-portal-2` need backend endpoints to *return* `{brand, logo_url, accent}` — `PublicBrandHeader` (Batch F) is necessary but not sufficient. Navigation/IA findings (`navigation-ia-6/7/8`), feature-dedup (`crm-leads-6`, `studio-video-3`, `crm-clients-3`), and data-model soft-delete (`gap-7`) are out of scope and belong to separate proposals. A batch may not claim these closed.

### 7.7 Governance gate — preventing fresh drift mid-migration

The migration is worthless if new feature work spawns new one-offs faster than batches retire them. A **diff-scoped CI grep gate** (detailed in §8.1 and §9) fails/warns any PR that introduces, *in changed lines only*:

- a new inline `position:'fixed'` overlay backdrop outside `components/ui/` → use `Modal`;
- a new local `const (fld|inputStyle|inp|btnPrimary|Pill|STATUS_COLORS|STATUS_META)` in `app/` → use the primitive/lib map;
- `window.confirm|alert|prompt` anywhere → use `useConfirm`;
- a new `@keyframes spin` outside `globals.css`;
- a hardcoded `#6366f1|#10b981|#ef4444|#f59e0b` literal → use the token;
- a raw `zIndex` integer above a threshold outside the `--z-*` tokens.

Diff-scoping is what makes this non-bureaucratic: it gates **new** drift without demanding anyone touch the 5,148 grandfathered inline styles. Existing literals are legal until the file is next edited (Rule of Three / on-touch). This is the mechanism that guarantees the legacy set is monotonically non-increasing.

---

## 8. Verification strategy

### 8.1 Static scans (the primary, cheap gate)

The grep gate from §7.7 runs in CI on every PR, diff-scoped. It is the cheapest and highest-leverage verification because it prevents regression by construction rather than detecting it after the fact. Two modes:

- **Fail** on the unambiguous defects: `window.confirm/alert/prompt`; a new `@keyframes spin` outside `globals.css`; a new `position:'fixed'` backdrop outside `components/ui/`.
- **Warn** on the softer ones (raw hex tokens, raw large `zIndex`, new local `STATUS_*`/`fld` consts) so a reviewer must acknowledge them but an intentional exception isn't blocked.

Additionally, a **retirement scan** tracks the legacy counts (inline `#6366f1`, `@keyframes spin`, `window.confirm`, local input consts) and reports the delta per PR — the number must trend down. This turns "migration progress" into an observable metric instead of a vibe.

### 8.2 Primitive unit + interaction tests

Each primitive ships with tests co-located in `components/ui/`. The bar is behavioral, not snapshot:

| Primitive | Must-pass interaction tests |
|---|---|
| `Button` | renders `<button type>`; `disabled` sets native disabled (not just opacity); `loading` sets `aria-busy` + disables + renders Spinner; icon-only warns without `aria-label` |
| `Badge` | tone→token map resolves to the right CSS var per tone; label text always rendered (color never sole signal); `color` variant applies custom hex without breaking tone path |
| `Modal` | `role=dialog`/`aria-modal`; focus moves in on open and **traps** (Tab cycles); focus **restores** to opener on close; Escape closes; backdrop click closes (card `stopPropagation`); **body scroll-locks** on open and releases on unmount; `z-index` resolves to `--z-modal` |
| `Toast` | region is `aria-live=polite` (assertive for error tone); auto-dismiss timer fires once at the single default duration; stacking at `--z-toast` |
| `Confirm` (re-skinned) | preserves existing `role=dialog`, Escape=cancel/Enter=confirm, backdrop, native fallback; `requireTyped:'DELETE'` keeps confirm disabled until the typed value matches |
| `Field`/`Input` | `label htmlFor` associates; `required`→`aria-required`; `error`→`aria-invalid` + `aria-describedby` pointing at the error node; real CSS `:focus-visible` present (no JS onFocus needed) |
| `Switch`/`Checkbox` | `role=switch`/native checkbox semantics; `aria-checked` reflects state; keyboard toggle (Space) |
| `Spinner`/`EmptyState`/`ErrorState` | Spinner `role=status`+label; ErrorState renders `onRetry` as a real `<button>`; EmptyState heading is a landmark |

### 8.3 Keyboard, focus, and a11y checks

- **Focus-visible sweep:** after Batch A, tab through leads-list, invoices, and one modal in both themes — the `--focus-ring` must be visible on every interactive element (Core currently has *zero* focus-visible rules; this is the single most important a11y regression-forward check).
- **Modal a11y:** for each migrated modal, verify trap + restore + scroll-lock manually once (automated in §8.2, spot-checked in the real app because focus-trap bugs are notoriously environment-sensitive).
- **Form a11y:** with a screen reader (NVDA on the Windows dev box), confirm a migrated form announces label, required, and error-on-submit for `AddLeadModal`.
- **Contrast:** token pairs (status bg/fg, on-accent, focus ring) checked to WCAG AA (4.5:1 body, 3:1 UI) in **both** themes and in the fixed-light `.wf-public` scope. This is a one-time token-authoring check, not per-PR.

### 8.4 Light + dark and responsive

- **Light+dark:** every migrated surface is spot-checked in both modes. Priority targets are the previously dark-only offenders (`confirm.js`, `AddLeadModal`, PlanLock) — these are the highest-visibility wins and the ones most likely to reveal a missed hardcoded hex.
- **Responsive:** the `r-*` utilities already handle 375px; migrated primitives must not break them. Spot-check leads-list and invoices at 375/768/1280 via the Claude_Preview DOM-measurement approach already established for this repo. Primitives use relative units and the token scale, so this is a check, not new work.

### 8.5 Build and backend harness role

- **`next build`** (Turbopack) must pass per batch. Note the repo's `AGENTS.md` warns this is a modified Next.js — build is the authoritative check that nothing in the App Router wiring broke.
- **Backend test harnesses:** largely **not applicable** — this is a frontend token/primitive layer with no API changes. The exception is the status **libs**: `lib/leadStatus.js`/`contractStatus.js`/`invoiceStatus.js`/`roles.js` encode label+tone maps; if any label is surfaced to or filtered by the backend (e.g. the CC plan filter in `command-center-3` that currently returns zero rows against dead tiers), the existing CC/entitlements checks confirm the vocabulary now matches live plan keys. Otherwise backend tests only serve as a regression backstop that no primitive change altered a data path.

### 8.6 Manual spot-checks (the irreducible human pass)

Per batch, a short scripted walkthrough on the real app: open the migrated modal, submit a form with a validation error, fire a destructive confirm, trigger a toast, load a list into its empty and error states, toggle light/dark. This catches the things tests don't — z-index stacking in a real overlay, a toast rendering under a modal, a focus ring that's technically present but visually wrong.

### 8.7 Screenshot visual-regression testing — recommendation: **NOT NOW**

**Recommendation: do not adopt automated screenshot visual-regression (VRT) for this proposal.** Reasoning grounded in this codebase and this migration's shape:

- **The migration is deliberately visual-changing.** Batches B–E *intentionally* alter appearance on hundreds of surfaces (6 CTA styles → 1, status colors reconciled, radius normalized, dark-only modals now theming). A VRT baseline would flag every one of these as a "failure," producing a wall of expected diffs that must be manually re-baselined batch after batch. VRT's value is catching *unintended* pixel drift on a *stable* UI — the opposite of our situation right now.
- **Baseline ownership is unresolved on a solo/small team.** VRT requires someone to own and approve baselines per theme (dark + light), per viewport (375/768/1280), per context (CRM/Studio/Contracts/public). That's a 2×3×4 matrix of baselines to maintain against a UI that is mid-migration and inline-heavy. The maintenance cost lands on exactly the person the "no bureaucracy" constraint is protecting.
- **False-positive cost is high here.** Inline-styled, token-driven surfaces render with subtle sub-pixel and font-hinting variance across CI runners vs the Windows dev box; anti-aliasing and the Inter webfont make naive pixel-diffing noisy. Taming that (threshold tuning, deterministic rendering) is real setup cost for a team with no CI VRT infra today.
- **The cheaper gates already cover the real risks.** The behavioral risks (focus trap, scroll-lock, aria wiring, z-index order) are covered by interaction tests + manual spot-checks. The *consistency* goal is enforced structurally by the grep gate — a token that's defined once cannot drift, so there is nothing for VRT to catch that the gate doesn't prevent.

**Revisit trigger:** once the migration stabilizes (primitives adopted on the high-traffic cluster, appearance no longer intentionally churning), a *narrow* VRT harness over the `components/ui/` primitives' storybook-style render fixtures — not full pages — becomes worthwhile and cheap, because primitives are small, deterministic, and have stable baselines. That is a post-migration follow-up, explicitly out of scope for PROP-002.

---

## 9. Design-system governance

Lightweight, Constitution-aligned (Article 0 proposal-before-implementation; Golden Rule; Rule of Three; Article 11 Deprecation). No committee, no design-ops role.

### 9.1 When to use an existing primitive

**Default: import from `components/ui/`.** If the need is a button, badge/pill, form field, modal/dialog, toast, confirm, empty/loading/error state, spinner, card, or stat — use the primitive. Hand-rolling the same atom inline when a primitive exists is a **review-blocking defect**, caught by the grep gate (a new local `btnPrimary`/`Pill`/`STATUS_*`/`fld` const in `app/` fails review).

### 9.2 When a new variant is justified

A new variant is justified **only** when an existing primitive cannot express a genuinely distinct *semantic* need — e.g. `Button variant="danger"`, `Badge tone="warning"`, `Field tone="public"` (fixed-light). Requirements:

- The variant is added **to the primitive, in one place** — never re-implemented per file.
- It carries a one-paragraph note (in the primitive file and the PROP-002 living doc) stating the semantic gap it fills.
- **Cosmetic-only variation is not a variant — it is drift.** A "slightly different radius/weight/padding" request is rejected; the answer is the existing token scale. The answer to "we need another green" is `--success`, not a fourth green.

### 9.3 When a component stays local / domain-specific

A component stays out of `components/ui/` when it is a **whole feature or module chrome**, not an atom:

- The 4 shells (`NavBar`, `StudioShell`, `ContractsStudioShell`, `ControlShell`), `AICommandCenter`, `FloatingChat`, `StudioCopilot`, `RoomPanel`, `HuddleModal`, `TagPicker`, and `AddLeadModal`-as-a-form (its *chrome* migrates to `Modal`/`Field`; its lead logic stays local).
- Studio's `.ms-*` and Contracts' `--cs-*` dialects **stay module-local by design** — they satisfy the semantic-slot contract and are not merge candidates. Forcing convergence would fragment deliberate product identity.
- **Rule of Three:** a pattern earns promotion to `components/ui/` only after it recurs 3× *or* is an atom the whole app needs. `Badge` and `Modal` qualify immediately by the audit's measured evidence (5+ pill implementations, 20+ modals); a one-off does not.

### 9.4 How token additions are approved

Low bar, but a real one:

- A **scale** token (a new radius/space/z/motion/type step) is added to `:root` only if it names a rung the system actually needs, and the PR **states which existing literals it replaces**. No speculative rungs.
- **Identity** tokens (`--ms-*`/`--cs-*`) may be added only within their dialect, never at the shared root.
- A **new raw color** at `:root` must justify itself against the existing semantic set. The default answer is "use the existing semantic token."
- Scale tokens live at `:root` so Studio and Contracts inherit radius/z/focus/motion automatically; dialects override only identity (font/accent/density), matching the sanctioned Studio remap at `studio.css:60-63`.

### 9.5 How duplication is detected

The diff-scoped CI grep gate (§7.7, §8.1). It is the enforcement backbone: it turns every governance rule above into an automated check on changed lines, so the rules hold without anyone policing them manually. It gates *new* drift only — grandfathered literals are legal until on-touch.

### 9.6 How deprecated patterns retire (Article 11)

- **Dead global classes** (`.btn-secondary`/`.badge`/`.card`/`.input-field`/`.table-row` — 0 product usages) are marked deprecated when the primitives ship and **removed** once their (near-zero) callers are gone. They are **not** revived — the codebase proves developers ignore global classes.
- **Deprecation list** (documented, with the replacing primitive named): the gradient primary CTA, ControlShell's private Pill palette, the 3 `Toggle`s, the ~14 per-page toasts, and the native `window.confirm` calls. Each migrated surface **deletes its local copy in the same PR** that adopts the primitive — retirement is coupled to adoption, never a separate cleanup that gets deferred forever.
- **`SidePanel.js`** is dead (mounted nowhere) — delete or defer, excluded from DS scope.
- Legacy inline screens and primitive screens coexist throughout; the grep gate guarantees the legacy set only shrinks.

---

## 10. Decisions required from the owner

Genuine product-owner decisions only — visual direction, behavioral tradeoffs, priority, and meaningful dependencies. Import paths, prop names, and file locations are implementation detail and are **not** listed.

| # | Question | Recommended | Alternatives | Consequence of each |
|---|---|---|---|---|
| D1 | **Canonical primary CTA:** flat `var(--accent)` or a gradient? | **Flat `var(--accent)`** (adopt existing `.btn-primary` look), radius `--radius`, weight 700. | (a) Promote one gradient (`#6366f1→#4f46e5`) as the single primary; (b) keep gradient as a documented "hero" variant for marketing/auth only. | Flat = calmest, matches "operational calm," one treatment everywhere, retires 6 identities. Gradient-primary = flashier but heavier on dense CRM screens and harder to theme in light mode. Hero-only (rec'd fallback) preserves marketing punch without leaking gradients into the product. |
| D2 | **Retire `800`/`900` font-weights from Core body/headings?** ("bold" = 700, once) | **Yes** — 700 is the only "bold" in Core; Studio keeps its display weights as a dialect. | Keep a `--fw-heavy:800` rung for stat values / H1s. | Retiring = tighter typographic system, less "unsettled" feel. Keeping 800 = preserves the heavier dashboard stat/H1 look some screens use today, at the cost of one more weight to police. |
| D3 | **Status pill vocabulary — one canonical label per contract status.** Currently "Approval" vs "Needs approval" vs "In review"; roles "Owner" vs "Super Admin." | Pick **one label each** in the shared libs (`contractStatus.js`, `roles.js`). Recommend "Needs approval" and "Super Admin" (the more descriptive of each). | Keep per-surface labels (status quo). | One label = the same status/role reads identically everywhere (closes `contracts-9`, `settings-team-6`). Keeping per-surface labels leaves the "stitched-together" tell the maturity push targets. This is a copy/voice decision only the owner can ratify. |
| D4 | **Typed-confirm tier** (`requireTyped:'DELETE'`) for irreversible/bulk ops (merge duplicates, permanent purge, empty trash)? | **Yes**, for the 3–4 highest-consequence actions only. | Single-click danger confirm everywhere (status quo). | Typed tier = real friction on genuinely destructive, un-undoable actions (merge moves messages/notes/invoices to a survivor). Single-click = simpler but one misclick is unrecoverable. Adds minor UX friction on exactly the actions where friction is desirable. |
| D5 | **Migration priority after Batch A:** CRM-first or public-token-pages-first? | **CRM-first** (leads-list/invoices/dashboard) — highest traffic, already on tokens. | Public-pages-first (highest brand-leak payoff). | CRM-first = fastest measurable drift reduction on the surfaces staff use hourly; validates primitives under load before touching client-facing polish. Public-first = better first-impression for the studio's *clients* sooner, but is **blocked** on backend brand endpoints (D6) so it can't fully land yet. |
| D6 | **Public brand endpoints (`gap-1`):** commit to backend work to return `{brand, logo_url, accent}` from public endpoints, or defer? | **Defer to a follow-up proposal;** ship `PublicBrandHeader` (Batch F) ready to consume it. | Bundle the backend work into PROP-002. | Defer = keeps PROP-002 a focused frontend proposal; the primitive is ready when endpoints land. Bundle = closes the white-label leak sooner but expands scope into backend and couples this proposal's timeline to API changes. The header alone cannot close `gap-1`/`client-portal-2` without the data. |
| D7 | **Global `:focus-visible` rule** replacing `outline:none!important`. | **Ship it** (Batch A, alone). | Keep current near-invisible focus. | Shipping = restores keyboard accessibility platform-wide (currently zero focus-visible in Core) — the single biggest a11y win. It is the one behavior-wide change; isolating it in Batch A makes any unexpected visual effect easy to attribute and revert. Not shipping = the app stays keyboard-inaccessible. |
| D8 | **Studio/Contracts dialects:** confirm they stay separate (inherit root scale, override only identity) and are **not** migrated onto Core primitives. | **Confirm — leave them as intentional dialects.** | Converge Studio `.ms-chip`/`.ms-modal` onto Core. | Leaving = preserves the deliberate gallery/document feel; they still inherit shared radius/z/focus/motion. Converging = a single visual language everywhere but flattens product differentiation (a photographer's gallery *should* feel unlike a CRM table) for no measured drift gain. |

---

## 11. Proposed implementation batches

Optimized for reviewability and evidence, not speed. Batch A is the substrate and hard-blocks the rest; B–E are independently shippable after A; F is a follow-up gated on D6.

### Batch A — Token substrate + confirm re-tokenize + focus rule *(proving ground: `lib/confirm.js` + globals)*

- **Objective:** Land the semantic-scale token layer and prove it by fixing the single most-shared dark-only primitive, plus the one global a11y rule. This is the smallest change that unblocks every other batch and delivers a visible win (confirm now themes to light) on day one.
- **Dependencies:** none.
- **Scope (tokens):** additive `:root` + `html.light` — radius scale (`--radius-sm/-lg/-xl/-pill`), spacing (`--space-1..12`), z-index ladder (`--z-dropdown/-sticky/-overlay/-modal/-toast/-banner`), focus (`--focus-ring`), motion (`--dur-*`/`--ease-*`), elevation (`--elev-1..3`, keep `--shadow` as alias), overlay (`--overlay-bg`/`--overlay-blur`), type scale (`--fs-*`/`--fw-*`), and **status pairs** (`--success-bg/-fg`, `--warning-bg/-fg`, `--danger-bg/-fg`, `--info-bg/-fg`, `--accent-bg/-fg`, `--neutral-bg/-fg`) with hand-tuned dark + light values. One global `:focus-visible { box-shadow: var(--focus-ring); outline: none }`; retire `input:focus{outline:none!important}` border-only pattern. Re-skin `confirm.js` inline `<style>` onto `var(--surface)/--text/--border/--overlay-*` + `--z-modal`.
- **Adopter surfaces:** `lib/confirm.js` (12 downstream consumers inherit the fix), `globals.css`.
- **Files affected:** ~2 (`globals.css`, `confirm.js`) + a docs entry. Behavior-wide focus change touches 0 additional files but affects all.
- **Risk:** **Medium** (the focus rule is the only app-wide behavior change; isolating it here is deliberate).
- **Automated verification:** `next build`; confirm interaction tests still green (role/Escape/Enter/backdrop/native-fallback preserved); grep gate active.
- **Manual verification:** tab through leads-list + invoices in both themes → visible focus ring everywhere; open a confirm in **light** mode → themed, not a dark slab; fire confirm from inside a modal → renders above it.
- **Rollback:** revert the PR; token additions are inert if unreferenced, confirm reverts to prior chrome, focus rule removed.

### Batch B — Button + Badge + status libs *(proving ground: leads-list + invoices)*

- **Objective:** Collapse the 6 CTA identities and 5+ pill palettes into one `Button` and one tone-driven `Badge`, fed by shared status libs so divergence becomes a *data* fix.
- **Dependencies:** Batch A (radius, status-pair, on-accent tokens).
- **Scope:** `components/ui/Button.js` (primary/secondary/ghost/danger; sm/md; `loading`), `components/ui/Badge.js` (tone enum + `color` variant + optional dot); `lib/leadStatus.js`, `lib/contractStatus.js`, `lib/invoiceStatus.js`, `lib/roles.js`, plan-tier map in `lib/plan.js`.
- **Adopter surfaces:** leads-list, dashboard, invoices, contracts overview/vault, control/* (swap ControlShell Pill to re-pointed tones), NavBar `PlanBadge` + PlanLock `LockBadge` (feed from plan map). Requires owner ratification of D1/D3.
- **Files affected:** ~10–14 (6 lead-status maps, 3 contract maps, invoices STATUS, ControlShell Pill, plan-tier consumers, ~22 button consts on adopters — deleted as their surfaces migrate).
- **Risk:** **Medium** (visual changes are intentional and broad; CC plan filter behavior changes from "returns zero rows" to "works").
- **Automated verification:** Button/Badge unit + interaction tests; grep gate flags any surviving local `STATUS_*`/`btnPrimary` on adopters; `next build`.
- **Manual verification:** same lead status renders identically on dashboard vs list vs detail (dark AND light); one flat primary button everywhere on adopters; CC customers plan filter now returns rows.
- **Rollback:** revert PR; migrated surfaces' local consts return with the primitive removal (co-deleted in the same diff).

### Batch C — Modal + Toast + confirm adoption *(proving ground: AddLeadModal + invoices)*

- **Objective:** One accessible `Modal` (focus-trap/scroll-lock/Escape/backdrop/`role=dialog`), one `Toast` provider, and finish the confirm migration off native dialogs.
- **Dependencies:** A (overlay/z-index/surface tokens), C's Modal reuses A's confirm patterns.
- **Scope:** `components/ui/Modal.js` (sm/md/lg), `ToastProvider`/`useToast`, `requireTyped` confirm tier.
- **Adopter surfaces:** `AddLeadModal` (Tailwind `#0f1117` → tokenized Modal+Field shell), invoices modal (fixes dead backdrop + z-under-toast), `ScheduleMeetingModal` (swap ~150 lines of inline chrome), invoices/team/settings toasts; native `window.confirm` swaps (leads-list merge with `requireTyped`, contracts delete, studio/trash, **public** booking/manage + d/[token]).
- **Files affected:** ~18–22 (20+ hand-rolled overlays begin migrating; ~14 toasts; 8+ native confirms).
- **Risk:** **High** (focus-trap and scroll-lock are environment-sensitive; z-index reflow) — mitigated by shipping Modal + interaction tests first, then migrating one modal at a time.
- **Automated verification:** Modal a11y interaction tests (trap/restore/scroll-lock/z-index); Toast aria-live + single-duration tests; grep gate fails any `window.confirm/alert/prompt` and any new `position:'fixed'` backdrop outside `components/ui/`; `next build`.
- **Manual verification:** open `AddLeadModal` in light mode (was a black slab); Tab cannot escape any migrated modal; page behind is scroll-locked; a toast never renders under a modal; public booking/manage cancel now uses the branded confirm.
- **Rollback:** revert PR; note that public-page confirm swaps are 1-line and independently revertible if a specific token page regresses.

### Batch D — Field system *(proving ground: AddLeadModal + settings)*

- **Objective:** One field system with correct label/required/error a11y; delete the 61 onFocus/onBlur border handlers by scoping down the global `input !important` override.
- **Dependencies:** A (radius/focus/surface2), C (Modal, since AddLeadModal's fields live in the Modal).
- **Scope:** `Field`/`Input`/`Textarea`/`Select`/`Checkbox`/`Switch`; **scope-down** (narrow, don't remove) the `input,textarea,select {…!important}` selector so it stops defeating the primitive's `:focus-visible`; `tone="public"` light variant for token pages.
- **Adopter surfaces:** AddLeadModal (3 focus colors → 1), invoices + settings modals, accept-invite, profile.
- **Files affected:** ~10–15 (~18 local input consts, 4 `Field` wrappers, 3 `Toggle`s, 61 onFocus/onBlur handlers on adopters).
- **Risk:** **Medium-High** (the `!important` scope-down is the trap — it could alter unmigrated inputs) — mitigated by narrowing selectors and spot-checking a sample of legacy forms in both themes.
- **Automated verification:** Field a11y tests (label association, `aria-required`, `aria-invalid`/`describedby`, CSS focus present); Switch/Checkbox role tests; `next build`; grep gate flags new local `fld`/`inputStyle` consts.
- **Manual verification:** screen-reader announces label+required+error on AddLeadModal submit; keyboard focus ring on inputs with zero JS handlers; a legacy (unmigrated) form still renders correctly after the override scope-down.
- **Rollback:** revert PR — critically, the `!important` scope-down reverts with it, restoring legacy input behavior.

### Batch E — State family *(proving ground: clients + leads-list)*

- **Objective:** One `Spinner`, `EmptyState`, `ErrorState`, and minimal `Skeleton`; make `load()` failures set an ErrorState instead of `catch{}` swallowing (an outage currently reads as "zero clients").
- **Dependencies:** A (tokens), B (EmptyState/ErrorState CTAs use `Button`).
- **Scope:** `components/ui/Spinner.js` (sm/md/lg on the single globals `@keyframes spin`), `EmptyState.js`, `ErrorState.js`, `Skeleton.js`/`SkeletonRow.js` (for leads-list/invoices/contracts vault only).
- **Adopter surfaces:** clients (`catch{}`→ErrorState, closes `crm-clients-10`), leads-list + invoices (spinner→Spinner, empties→EmptyState, load flash→Skeleton); **delete the 14 duplicate `@keyframes spin`**.
- **Files affected:** ~10–16 (35 inline spinner divs, 14 keyframes, ~30 empties begin migrating).
- **Risk:** **Low** (thin presentational primitives; the `catch{}` rule is the only behavioral change).
- **Automated verification:** Spinner `role=status`; ErrorState renders `onRetry` button; grep gate fails a new `@keyframes spin` outside globals; `next build`.
- **Manual verification:** kill the network → clients shows ErrorState with Retry (not "No clients yet"); big tables show Skeleton then content (no flash); one spinner mechanism everywhere on adopters.
- **Rollback:** revert PR; primitives removed, adopters' local spinners/empties return co-deleted.

### Batch F — Public brand chrome *(follow-up; gated on D6)*

- **Objective:** One `PublicBrandHeader`/`PublicFooter` rendering the studio's real logo/name/accent; kill the `#0ea5e9→#6366f1` fallback collision; `.wf-public` fixed-light scope so token pages share the primitives.
- **Dependencies:** A–E; **and backend endpoints returning `{brand, logo_url, accent}`** (owner decision D6) — the primitive is necessary but not sufficient without this data.
- **Scope:** `PublicBrandHeader`/`PublicFooter`, `.wf-public` light-slot scope, tokenized confirm already available from A.
- **Adopter surfaces:** g/d/shop/pay/client/book/folio.
- **Files affected:** ~7.
- **Risk:** **Low** (self-contained pages) — but **cannot close `gap-1`/`client-portal-2` until the endpoints return brand.**
- **Automated verification:** header renders provided brand/logo/accent; falls back gracefully when absent; `next build`.
- **Manual verification:** every public link shows the studio's identity (not "WappFlow"/generic W); confirm on a public page is light-themed.
- **Rollback:** revert PR; token pages return to prior hand-rolled brand blocks.

**Sequencing note:** the cheapest immediate wins live in Batch A (the confirm re-skin unblocks light mode for 12 files; the z-index ladder + one focus rule are quick and unblock Modal) and the 1-line `window.confirm` swaps in Batch C. First batch is deliberately tokens + the confirm fix + the focus rule on ONE proving-ground surface — the smallest change that proves the substrate and delivers a visible, high-confidence win before any broad migration begins.

---

---

## Approval, decisions & implementation log

**Approved 2026-07-07 with all recommended decisions D1–D8.**

**D3 clarification (owner):** canonical **domain keys** and **display labels** stay separate. Stable
internal keys (`needs_approval`, `super_admin`) drive business logic, APIs, DB values, filtering,
analytics, permissions, and integrations. The status/role **registries** (Batch B) map keys →
*presentation metadata* (`label`, badge variant/tone, optional icon, ordering, and allowed
transitions only where already appropriate to the existing architecture). Presentation copy is
**never** the domain value. This is **not** a workflow/state-machine redesign.

### Batch A — token substrate + focus foundation + confirm retokenize — IMPLEMENTED

Branch `design-system/batch-a-tokens` — **awaiting review before Batch B.** Tightly scoped to the
substrate; **no Button, no Badge, no page migration, no Studio/Contracts identity change, no domain
semantics.**

- **`globals.css` (additive):** new `:root` + `html.light` blocks — spacing/radius/type/weight/motion
  scales, a z-index ladder (`--z-dropdown..--z-banner`, replacing the 1..99999 sprawl), `--focus-ring`,
  `--overlay-bg/--overlay-blur`, an elevation scale (`--elev-1..3`), `--on-accent`, and semantic status
  pairs (`--success-bg/-fg`, `--info-bg/-fg`, `--danger-fg`, `--warning-fg`, `--accent-bg/-fg`) with
  hand-tuned per-mode values. **Nothing renamed or removed** — `--radius` and `--shadow` retained
  verbatim (verified: all 25 original tokens present). One global `:focus-visible` box-shadow ring
  (D7) that coexists with the existing `outline:none` suppression, plus a neutralizer inside
  `.ms-root` (Studio) so its universal `:focus-visible` outline stays the sole indicator — no double
  ring. *(Corrected pre-merge in 6f85376: `.cs-doc` was initially neutralized too, but Contracts has
  **no** equivalent focus treatment — only `.cs-ce{outline:none}` plus a JS selection outline — so the
  neutralizer would have left its controls with no visible focus indicator. `.cs-doc` now gets the
  global ring.)*
- **`lib/confirm.js` (retokenize only):** the inline `<style>` now reads tokens — hardcoded color
  literals **52 → 0**, `z-index:9999 → var(--z-modal)`, token refs **0 → 40**. It now themes in light
  mode (was a dark slab) for all 12 consumers. **JS logic byte-identical** (role=dialog, aria-modal,
  Escape/Enter, autoFocus, backdrop, per-tone icon, provider API, animations all unchanged).
- **`scripts/verify-batchA.js`:** boot-free harness (12 checks) — additive-token proof, z-ladder order,
  per-mode semantic overrides, focus rule + dialect neutralizer, confirm retokenized-yet-behavioral.

**Verification:** verify-batchA 12/12 · `next build` ✓ · backend regression 5/5 · live: tokens resolve
in dark+light with intentional per-mode flip (`--success-fg #34d399→#047857`, `--elev-3` .5→.18,
`--overlay-bg` black→slate), focus rule + neutralizer compiled into the live cascade, login screen
pixel-identical to baseline (substrate is inert until adopted).

**Deferred to post-deploy spot-check** (needs an authenticated + real-keyboard session): keyboard
focus-ring rendering in-app, and the confirm dialog opening in light mode. Transitively proven (confirm
reads the verified tokens; the ring rule is in the cascade), to be eyeballed after deploy — consistent
with how every prior batch was confirmed against production.

### Batch B — Button + Badge primitives + status registries — IMPLEMENTED, APPROVED FOR MERGE

Branch `design-system/batch-b-button-badge` (ad51245 + dd16434 + review polish). Scope held to:
Button primitive, Badge primitive, key→metadata registries, approved first targets only (invoices
fully; leads-list status badge only).

- **`components/ui/Button.js`** — visual/interaction primitive, 4 variants (`primary`/`secondary`/
  `ghost`/`danger`) × `sm`/`md`, `loading` (spinner + `aria-busy` + disable) + `disabled`, token-driven,
  **no inline box-shadow** (keeps the Batch A focus ring visible), **zero domain knowledge/props** (D1).
- **`components/ui/Badge.js`** — presentation primitive, 6 tones mapping to the Batch A status pairs,
  `dot` + `color` escape hatch (`color-mix` tint), renders a `<span>` (no border, no pointer cursor —
  reads as a chip, cannot compete with buttons). Zero domain knowledge.
- **`lib/leadStatus.js` + `lib/invoiceStatus.js`** — registries: stable **DB key** → `{label, tone,
  order}` (D3). Keys are the canonical domain values; labels are presentation-only.
- **`lib/statusRegistry.js`** — shared fallback contract (owner review requirement): an unknown/legacy
  status **never crashes, never disappears, never masquerades** — it renders a **neutral** Badge with
  the **humanized original value** (`closed_won` → “Closed Won”, empty/null → “Unknown”), flagged
  `unknown: true`, with a **one-shot, SSR-safe** `console.warn` for telemetry. This replaced two silent
  normalizers (`unknown → 'Draft'` in invoices, `unknown → 'New'` in leads). **No DB-layer
  normalization** — bad data surfaces instead of being laundered by the UI.
- **Migrations:** invoices — 2 status pills → `<Badge>`, `STATUS_COLORS` deleted, 4 buttons →
  `<Button>` (send=primary, delete=danger, cancel=secondary, send-invoice=primary+loading), −14 raw
  color literals. leads-list — status badge → `<Badge>` + registry; `STATUS_META`’s non-badge uses
  (avatar gradient, value color, filter tabs) deliberately untouched, migrate on-touch.

**Owner decision — no `success` Button variant (Rule of Three).** State semantics ≠ action hierarchy.
**“Mark as Paid” is recorded as an unresolved pattern under observation:** it keeps its local green
treatment, sitting beside the migrated primary “Send via Email” in the InvoiceViewModal footer (two
filled CTAs in one group — a known hierarchy tension, accepted for now). If ≥3 genuinely equivalent
affirmative actions with a consistent semantic need emerge in later batches, bring back a small
proposal for `variant="success"` covering: concrete surfaces, semantic rationale, hierarchy behavior
when primary and success coexist, contrast, light/dark, confirmation semantics.

**Verification:** verify-batchB **19/19** (primitive purity incl. regex domain scan; registry shape;
fallback contract incl. live `humanizeStatus` execution; no-silent-normalize; one-shot SSR-safe
telemetry; key-drives-logic/label-display-only) · `next build` ✓ (pre-fallback; fallback = 1 pure-JS
module + 2 import lines, ESM-load verified) · adversarial 3-lens audit (hierarchy / keys-vs-labels /
fallback safety): **0 unaccepted findings** — every filter/sort/write/analytic uses the raw key; a
label edit provably cannot change API/DB/filter/analytics semantics; danger hover feedback fixed
during review (`hoverBg` was `=== bg`).

**Known/accepted (on-touch backlog):** leads-list filter tabs still render the raw key as their
caption (a label-only registry edit would not propagate to tabs); `statusColors` inside the invoice
print template stays local (print document ≠ app UI, keyed on the raw key); Mark-as-Paid per above;
remaining lead-status maps + contract/role/plan registries migrate when their surfaces are touched.

### Batch C — overlay infrastructure: Modal + Toast + confirm tier — IMPLEMENTED

Branch `design-system/batch-c-modal-toast`. Owner approval 2026-07-13 scoped this to ONE reusable
overlay architecture (not lots of components): Modal primitive, one Toast engine, approved confirm
migrations — no Drawers/Popovers/Palette/Overlay-Manager. Exact inventory first
(`proposals/PROP-002-batch-c-inventory.md`, 188 sites: 40 overlays / 36 toasts / 50 native dialogs /
62 z-index owners; headline finding: ZERO hand-rolled overlays had focus trap, focus restore,
scroll-lock, or dialog aria).

- **`components/ui/overlay.js` — the shared foundation** (the "future Overlay Manager" seam,
  deliberately manager-free: no context, no controller — five composable pieces): SSR-safe `Portal`;
  an overlay **stack registry** (registration order = stacking; answers "am I top?" so Escape and
  backdrop-close peel ONE overlay at a time); `useEscape`; **reference-counted** `useScrollLock`
  (nested overlays don't fight over `body.overflow`); `useFocusTrap` (Tab/Shift+Tab cycle +
  `[data-autofocus]` initial target + focus restore to opener; takes the container *element*, not a
  ref — Portal children mount one effect-tick late, a plain ref is still null when the trap engages).
  Future Drawer/Popover/Tooltip/Palette/Dropdown compose these same hooks.
- **`components/ui/Modal.js`** — centered-card dialog primitive: `role="dialog"`, `aria-modal`,
  labelledBy/describedBy (auto from `title`/`description` or explicit ids), portal, `--z-modal`,
  motion tokens, sm/md/lg, `padded={false}` for surfaces with their own internal chrome,
  **`dismissable={false}`** (disables backdrop + Escape + hides X — live calls, wizards, destructive
  flows). **`useModal()`** lifecycle hook (open/close/toggle) with the **promise seam**: `open()`
  returns a Promise resolved by `close('confirmed'|'cancelled')` or dismissal → `'dismissed'`.
- **`components/ui/Toast.js`** — ONE engine: module-level store + importable `toast` API
  (`toast.show({title, description, tone, action, duration})`; success/error/warning/info are thin
  delegates). `<ToastViewport />` mounted once in `app/providers.js`: **bottom-right** (top-right is
  what caused the invoices toast-over-modal-close bug), `--z-toast`, `aria-live=polite` region,
  `role=alert` for errors only, queue (max 4 visible, rest surface as slots free), pause-on-hover,
  keyboard-dismissable, token-driven.
- **`lib/confirm.js`** — rebased onto the foundation (portal + stack + scroll-lock + a real focus
  trap: previously Tab escaped the dialog into the page). `confirm()` API unchanged for all existing
  consumers. New **`requireTyped: 'PHRASE'`** tier: exact-match input gates the confirm button AND
  the Enter key; case-sensitive; cancel always available.
- **Overlay migrations (approved adopters):** invoices ×2 (dead backdrops z 300/320 → Modal;
  the z-9999 toast inversion eliminated), team ×4 (invite form + result, role, permissions),
  AddLeadModal (the app's only Tailwind modal — hardcoded `#0f1117` slab that ignored light mode →
  tokenized Modal; status options now come from the lead-status registry, D3), ScheduleMeetingModal
  (styled-jsx z-9998 overlay that buried its own success/error dialogs → Modal; hardcoded palette
  tokenized; outcome notices → toasts).
- **Toast migrations:** invoices (local z-9999), team (local component, z 9999), settings (local
  component, z 9999 — `showToast(msg, type)` kept as a thin adapter over the engine because 12 tab
  components consume it as a prop; zero call-site churn, zero duplicate logic). Alert-style failure
  notices on those surfaces → `toast.error`.
- **Typed confirmations (owner list):** Merge Leads → `MERGE`; Empty Trash (leads) → `DELETE`;
  Delete Contract → `DELETE`; Studio Trash permanent delete → `DELETE`; Public Booking cancel →
  `CANCEL`. **Token Management (d/[token]): no native dialog exists in the file — nothing to
  migrate** (recorded). Flag for review: typed `CANCEL` on the PUBLIC booking page is heavy ceremony
  for an end client — implemented as approved, one prop to soften if desired.

**Verification:** verify-batchC **19/19** (foundation shape, manager-free architecture, Modal a11y +
dismissable gating, useModal promise seam, single-engine toast + delegating wrappers, viewport
mounted once, requireTyped gates, per-surface migration proofs, scoped grep gates, no numeric
z-index in primitives) · **real-browser interaction tests** (Next dev in the worktree + lab page,
real keyboard): initial focus into dialog, 7-focusable Tab cycle wraps, Shift+Tab reverse-wraps,
Escape closes + restores focus to opener + resolves `'dismissed'`, nested modals stack on ONE
`--z-modal` rung by DOM order and Escape peels one at a time, ref-counted scroll lock holds across
nesting, `dismissable={false}` survives backdrop + Escape, confirm-inside-modal stacks and Escape
closes only the confirm, toast region aria-live/roles/queue(7→4)/action-dismiss verified, typed tier:
Enter inert until exact phrase (case-sensitive), then Enter confirms · light/dark computed-style
flip verified on modal + backdrop · `next build` ✓ · all 8 migrated routes compile 200.

**Interaction-test caveats:** browser-driver screenshots timed out (long-standing environment quirk)
— visual evidence is computed-style numeric proofs, consistent with Batches A/B; the lab page was a
worktree-only scratch harness (deleted before commit — the repo still has no committed interaction
test infra; adopting a test framework needs its own proposal).

**Known/accepted (recorded, NOT migrated — approved-list discipline):** leads-list saved-view
`window.prompt` + move-to-clients `window.confirm`; all remaining overlays/toasts/dialogs in the
inventory (leads-list ×3+bulk, leads/[id] ×3+lightbox, chat, dashboard, contracts builder ×9, studio
family, HuddleModal, NavBar drawer + Flux modal, FloatingChat/SidePanel/AICommandCenter/Copilot
z-fixes, control plane ×8 files, public g/[token] + d/[token] + folio) — each with its ladder-token
target already mapped in the inventory doc. Drawers + full-page takeovers are explicitly a different
species (future Drawer primitive is a legitimate Rule-of-Three proposal — 4+ exist).

### Batch D — Field system + the `!important` scope-down — IMPLEMENTED

Branch `design-system/batch-d-fields`. The proposal called this the batch's one genuinely
dangerous move: narrowing a global `!important` override without disturbing every unmigrated form.

- **`components/ui/Field.js` (new)** — one field anatomy: `Field` owns the label/required/error/hint
  wiring (`htmlFor`, `aria-required`, `aria-invalid`, `aria-describedby`, `role="alert"` on the
  message, `useId` for collision-safe ids); `Input`/`Textarea`/`Select` are the controls;
  `Checkbox`/`Switch` cover the boolean patterns. Every control sets **`data-ui`** — the opt-out flag
  the scope-down keys on. Wiring is spread AFTER caller props so a stray `id` can never orphan the
  label. Label is flex, so `label={<><User size={13}/> Name</>}` composes.
- **The scope-down (`globals.css`)** — `input, textarea, select {…!important}` became
  `input:not([data-ui]), …` across **all three** groups (base, `::placeholder`, `:focus`). Declarations
  are byte-identical, so **every unmigrated control behaves exactly as before**, including keeping
  `outline: none !important` (so no unmigrated field regains a UA outline that would collide with the
  Batch A ring). Primitives are freed from the override and style their own states via `.wf-input`.
- **The dead-handler purge — 90 handlers across 11 files.** The `!important` border-color pair always
  beat inline writes, so every `onFocus/onBlur → e.target.style.borderColor` handler was **provably
  dead code**: it could never have had a visual effect. Deleted app-wide (82 by an automated sweep, 8
  more removed by hand while rewriting adopters). The **two** handlers in `leads/[id]` that write
  `e.currentTarget.parentElement.style.borderColor` target a wrapper div around a contentEditable —
  those are alive and were deliberately kept.
- **Adopters:** AddLeadModal, invoices `SendInvoiceModal`, settings (the local `Input` wrapper became
  a thin adapter over `Field`, preserving its prop shape for ~12 tab consumers, plus PasswordTab),
  accept-invite, profile.

**Verification:** verify-batchD **22/22** · `next build` ✓ · live lab (real browser): label↔control
association, `aria-required`/`aria-invalid`/`aria-describedby`→message with `role="alert"`,
`role="switch"` toggling, and — the critical regression test — an **unmigrated** input still forced to
`--surface2` in dark and `#f8fafc` in light despite inline white styling, while a `tone="public"`
field stays white in both. Batch A's focus ring renders on primitives
(`box-shadow: 0 0 0 1px #6366f1, 0 0 0 4px rgba(99,102,241,.15)`).

**Adversarial 3-lens audit (scope-down / purge / Field API): 0 high findings; the core claims held**
— a programmatic tag census over `git show HEAD:` proved all 90 deleted handlers sat on real form
controls (input 72, textarea 16, select 2) and that the only two `div` sites are the two that were
kept. Every medium finding it raised was **fixed before commit**: the invoices modal could render the
same error twice (or two contradictory errors) — errors are now routed to exactly one surface;
`Checkbox`/`Switch` ignored `FieldContext`, so composing them inside a labelled `Field` emitted an
orphaned `htmlFor` — both now claim the Field id; both spread `{...rest}` after their own wiring, so a
caller's `className`/`onClick` silently disabled them — now merged; the Switch thumb hardcoded an
un-themed `rgba()` shadow → `--elev-1`; the invalid border used `--danger` while its message used
`--danger-fg` → unified; `.wf-input` metrics were improvised from one modal → aligned to the app's
dominant 12px-label/14px-control anatomy so migrated fields sit flush beside unmigrated ones; the
public tone was incomplete (`option` and `:-webkit-autofill` are styled by app-theme rules that would
repaint a light field dark) → both overridden; and AddLeadModal's five icon-led labels, silently
dropped by the migration, were **restored**. Three verifier checks were also hardened after the audit
showed they were unfalsifiable: the dead-handler gate now matches every handler spelling, the
functional-onBlur check is scoped to the purged files (repo-wide it passed regardless), and the
hex gate no longer strips `rgba()` — the syntax the one real offender used.

**Known/accepted:** `Checkbox`, `Switch` and `tone="public"` ship with **zero adopters** — the four
page-local Toggles (team, studio settings, contracts builder) and the public token pages migrate
on-touch, not here. Pre-existing and out of scope: the global `:-webkit-autofill` rule's `!important`
box-shadow suppresses the Batch A focus ring on an autofilled field (affects legacy and primitives
alike, predates this batch); and the contracts builder's title input has never rendered borderless as
its author intended, because the global override always painted it — deleting its dead handlers
changes nothing, but the underlying defect stays open.

### Batch E — State family (Spinner / EmptyState / ErrorState / Skeleton) — IMPLEMENTED

Branch `design-system/batch-e-states`. Exact inventory first
(`proposals/PROP-002-batch-e-inventory.md`, **442 sites**: 101 spinner/keyframe, 137 empty states,
126 swallowed-error sites, 78 loading states — §11 had estimated "35 spinners, 14 keyframes, ~30
empties"). Migrated ONLY the approved adopters; the rest is the recorded on-touch backlog.

- **`components/ui/Spinner.js`** — `role="status"` + accessible name (the ring itself is
  `aria-hidden` decoration), sm/md/lg, `var(--accent)`/`var(--border)`, riding the ONE shared
  `@keyframes spin`.
- **`components/ui/EmptyState.js`** — enforces the distinction the codebase kept losing: an empty
  *list* and an empty *filter result* are different situations. `filtered` swaps the copy and offers
  "Clear filters" instead of a create CTA. CTAs reuse the Button primitive.
- **`components/ui/ErrorState.js`** — `role="alert"`, a retry action, a de-emphasised technical
  `detail` slot, and copy that says the data is safe.
- **`components/ui/Skeleton.js`** — `Skeleton` is the dumb bar; `SkeletonRow` composes it into the
  **three real row shapes** the inventory measured (leads 9-col grid + 34px squircle avatar;
  invoices 6-col grid, no avatar; vault flex card + 40px circle). One generic row would have fitted
  none of them and reintroduced the layout shift skeletons exist to prevent.
- **The behavioural fix.** `clients` swallowed its fetch failure in a bare `catch {}`, so a backend
  outage rendered **"No clients yet"** — telling the user their data was gone and inviting them to
  re-create it. `invoices` did the same via `.catch(() => ({data:{invoices:[]}}))`. Both now capture
  the failure and render an ErrorState with retry. Both adopters branch **error → loading → empty →
  filtered-empty → content**, the ordering `contracts/analytics/page.js:42` already used — this
  restores an in-house convention rather than importing one.
- **`invoices` had no filtered-empty variant** — a user with 300 invoices who mistyped a search was
  told to "create invoices from any lead profile". Fixed.
- **17 duplicate `@keyframes spin` deleted** (§11 estimated 14); `globals.css:285` is the sole
  survivor. The 14 *aliased* spin keyframes (`fcSpin`, `sm-spin`, `hd-rot`, `csp` ×6, `ms-spin`, …)
  are deliberately untouched. Also added a `prefers-reduced-motion` block so skeletons stop pulsing.

**Verification:** verify-batchE **15/15** · `next build` ✓ · live lab: all three Spinner sizes expose
`role="status"` with accessible names and `aria-hidden` rings; ErrorState announces via `role="alert"`
and its retry fires; true-empty vs filtered-empty render different copy and CTAs; every skeleton bar
is hidden from assistive tech; and the three skeleton shapes measure **59 / 62 / 73px** against real
rows of ~58 / ~62 / ~72px (the invoice variant was 4px short on first measure and was corrected so
the table shrinks rather than grows on load).

**Known/accepted (recorded, NOT migrated — approved-adopter discipline):** `contracts/vault` gets the
Skeleton only; its `.catch(() => setClients([]))` swallow is the top deferred item (the fix is three
lines and the primitive already exists — deliberately not slipped in). Also deferred: ~124 further
swallow sites; `dashboard`/`leads/[id]`/`profile`/`reports`/`accept-invite` full-page spinners;
`settings`' 7 loading branches across 3 treatments; the ~12 control/* and ~15 studio/* loaders;
`components/SidePanel.js`'s local `Spinner()`/`Empty()` (which would silently **shadow** the
primitives if that file ever imports them — must be deleted in the same edit); `bookings`/`studio
store`, which hang on "Loading…" forever when their fetch fails; and the spinner colour drift
(`#ef4444` in trash, `#8b5cf6` in knowledge) that resolves whenever those surfaces adopt.
