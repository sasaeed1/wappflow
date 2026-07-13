# PROP-002 Batch C — Exact Migration Inventory

*Generated 2026-07-13 by a 4-lens exhaustive sweep (4 agents, 142 tool calls) over `main` (4b76b34).
This is the site-by-site inventory PROP-002 §11 approximated ("~18–22 files, 20+ overlays, ~14 toasts,
8+ confirms"). Actual: **43 modals/overlays, 36 toast patterns, 50 native dialogs, 63 z-index sites**.
Batch C migrates only the approved adopter surfaces; everything else is recorded here as the on-touch
backlog so nothing is silently skipped.*

## Global findings

- **ZERO hand-rolled overlays implement focus trap, focus restore, or body scroll-lock; NONE have
  `role="dialog"`/`aria-modal`** — only `lib/confirm.js` (the Batch A primitive) does. Every modal
  in the app fails keyboard/screen-reader accessibility identically.
- **Three overlay patterns** recur: (A) inline-style `position:'fixed', inset:0` + blur backdrop +
  `.r-modal` card (majority); (B) Media Studio's shared `.ms-modal-overlay` CSS class
  (studio.css:324, z=400); (C) styled-jsx per-component overlays (ScheduleMeetingModal, HuddleModal,
  both z=9998).
- **Raw z-index values in the wild:** 30/40/45/50/60/100/200/250/300/320/350/380/400/500/510/600/700/
  850–851/998–999/9000/9998–9999/10000/99999. The Batch A ladder (--z-base:1 … --z-banner:1500) has
  exactly ONE consumer today (lib/confirm.js).
- **Toast position sprawl:** top-right (invoices, settings, team, knowledge, profile), bottom-right
  (leads-list, leads/[id], dashboard), bottom-center pills (clients, contracts, studio ×3). One
  position must be chosen for the Toast primitive.
- **Confirmed z-order inversions:** invoices toast (9999) covers its own modals (300/320) AND the
  delete confirm (1300); ScheduleMeetingModal (9998) buries its own success/error confirm dialogs
  (1300) — invisible dialog capturing Enter/Escape; FloatingChat (9000/9001) buries its error alerts;
  contracts toast (700) > contracts modals (600); chat thread drawer (60) renders under the NavBar
  (100). Plus dead backdrops (block clicks, never close) on invoices ×2, team ×4, leads-list ×3,
  leads/[id] ×3, chat ×1, dashboard ×1.

## Lens 1 — Hand-rolled modals & overlays — 43 sites

Every fixed full-viewport backdrop, dialog, drawer, sheet, lightbox, and takeover outside `components/ui/`.

### `src/components/AddLeadModal.js:41` — AddLeadModal

Span 6-156. Only Tailwind-class modal in codebase: `fixed inset-0 z-50 overflow-y-auto` + separate backdrop div (L42, bg-black/60 backdrop-blur-md). Backdrop-click: YES (L42). Escape: no. Focus trap/restore: no. Scroll lock: no. aria: none. z-index: Tailwind z-50.

> **Migration:** App surface (imported by dashboard/page.js:21 and leads-list/page.js:18). Prime early adopter. Hazards: hardcoded dark palette (#0f1117, white/10 borders) ignores theme tokens; gradient 'glow' decoration div; status <option> list duplicates lead-status registry keys (D3 overlap with lib/leadStatus).

### `src/components/ScheduleMeetingModal.js:128` — ScheduleMeetingModal

Span 15-~350. Overlay `.sm-overlay` via styled-jsx <style> block: position:fixed; inset:0; z-index:9998 (L262). Backdrop-click: YES (L128). Escape: no. Focus trap/restore: no. Scroll lock: no. aria: none.

> **Migration:** App surface (leads/[id]/page.js:25). Already uses useConfirm for alerts. Hazard: z 9998 sits ABOVE the leads page's own modals (z 200-300) and toasts (z 10000 barely above) — z-map collision zone. styled-jsx block must be dismantled on migration.

### `src/components/HuddleModal.js:150` — HuddleModal (LiveKit huddle)

Span 21-~240. Overlay `.hd-overlay` styled-jsx: fixed inset:0 z-index:9998, blur backdrop (L199). Backdrop-click: YES (L150) — closes/disconnects a LIVE CALL on stray click. Escape: no. Focus trap/restore: no. Scroll lock: no. aria: none.

> **Migration:** App surface (chat/page.js:17, RoomPanel.js:15). HIGH HAZARD: (1) backdrop-click ends a live LiveKit call — migration should make backdrop-close opt-out; (2) imperative DOM (track.attach() appends into tilesRef) must survive any portal/remount a Modal primitive introduces; (3) nested-modal case: RoomPanel is itself rendered inside overlay drawers in contracts/[id]:169 and studio/[id]:556, so HuddleModal (9998) opens on top of a z 500-600 overlay.

### `src/components/NavBar.js:632` — NavBar mobile nav drawer

Span ~630-706. Two fixed layers: backdrop inset:0 rgba(0,0,0,0.5) z=200 (L633) + right slide-in drawer 280px height:100vh z=250 (L635). Backdrop-click: YES (L632). Escape: no. Focus trap/restore: no. Scroll lock: no (page scrolls behind open drawer). aria: none.

> **Migration:** App shell (every authed page). It is a Drawer, not a centered Modal — decide whether Batch C primitive covers drawers or this stays. Hazard: z 200/250 collides with page-level modals that also use 200-300.

### `src/components/NavBar.js:717` — NavBar Flux upgrade modal (fluxUpgrade)

Span 717-~800. Inline overlay: fixed inset:0 z=9999, rgba(0,0,0,0.55)+blur(6px), flex-center, navFadeIn animation (L721). Backdrop-click: YES (L719). Escape: no. Focus trap/restore: no. Scroll lock: no. aria: none.

> **Migration:** App shell. FLUX_PARKED-related surface (buttons greyed 'Coming soon') — confirm it is still reachable before migrating; may be near-dead code. Hardcoded aurora-gradient dark card, ignores theme.

### `src/components/RoomPanel.js:17` — RoomPanel (not itself an overlay)

No fixed positioning of its own — plain panel content. Hosts open it inside their own hand-rolled overlays (contracts/[id]/page.js:169, studio/[id]/page.js:556) and it launches HuddleModal (z 9998) from within them.

> **Migration:** App surface. Listed for the nesting hazard only: overlay(z 500-600) → RoomPanel → HuddleModal(z 9998) is the codebase's one real nested-modal chain; the Modal primitive must support stacking or this chain breaks.

### `src/app/team/page.js:82` — InviteModal

Span 82-197. TWO overlay states: result screen (L107) and form (L146), both inline fixed inset:0 rgba(0,0,0,0.5)+blur(4px) flex-center z=200 with .r-modal card. Backdrop-click: NO (no onClick on overlay). Escape: no. Focus trap/restore/scroll lock/aria: none.

> **Migration:** App surface. Straightforward pattern-A adopter; two-phase content (form → invite-link result) fits a single Modal with swapped children.

### `src/app/team/page.js:199` — RoleModal

Span 199-244; overlay L210: fixed inset:0 rgba 0.5+blur flex-center z=200, .r-modal card. Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Simple pattern-A adopter.

### `src/app/team/page.js:246` — MemberPermissionsModal

Span 246-343; overlay L276: fixed inset:0 z=300 (higher than sibling modals' 200), maxHeight 90vh + overflowY:auto card. Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Scrollable-body modal — primitive needs a max-height/scroll variant.

### `src/app/contracts/[id]/page.js:126` — BuilderPage add-block picker (addAt)

Overlay L126: fixed inset:0 z=400 rgba(8,8,12,0.55)+blur(5px) flex-center; card stopPropagation. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface (Contracts Studio builder). One of NINE overlays in this single file — biggest migration file. Note builder page uses z=400 here but 500/600 elsewhere; layering is implicit.

### `src/app/contracts/[id]/page.js:151` — BuilderPage full-screen preview takeover

L151: fixed inset:0 z=500, opaque theme bg, overflowY:auto — full-page takeover, not a card modal. Exit via floating fixed button z=510 (L152). Backdrop-click: n/a. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. NOT a Modal-primitive candidate — it's a preview mode. Recommend excluding from Modal migration; z values still belong in the z-map. Renders .cs-doc themes inside.

### `src/app/contracts/[id]/page.js:169` — BuilderPage Room drawer (showRoom → RoomPanel)

L169: fixed inset:0 z=500 rgba+blur, flex-start/flex-end alignment = top-right anchored panel (drawer-ish). Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Nesting hazard: hosts RoomPanel which can open HuddleModal (z 9998) on top.

### `src/app/contracts/[id]/page.js:181` — ClausePickerModal

Span 181-207; overlay L185: fixed inset:0 z=600 rgba(8,8,12,0.6)+blur(5px) flex-center, .r-modal card maxHeight 80vh scroll. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Pattern-A adopter. All six contract modals below share identical overlay styling — one mechanical migration recipe covers them.

### `src/app/contracts/[id]/page.js:208` — VersionsModal

Span 208-266; overlay L220: identical z=600 pattern, maxHeight 82vh. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Pattern-A adopter.

### `src/app/contracts/[id]/page.js:269` — PeopleModal

Span 269-356; overlay L287: identical z=600 pattern, maxHeight 86vh. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none. Contains SST signer-status color map (D3-adjacent).

> **Migration:** App surface. Pattern-A adopter; SST map at L267 is a status registry candidate for the parallel registry work.

### `src/app/contracts/[id]/page.js:357` — AIModal

Span 357-437; overlay L394: identical z=600 pattern. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Pattern-A adopter; async AI generation in-flight — ensure backdrop-close doesn't abort silently mid-request.

### `src/app/contracts/[id]/page.js:459` — SettingsModal

Span 459-536; overlay L478: identical z=600 pattern, maxHeight 86vh. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Pattern-A adopter.

### `src/app/contracts/[id]/page.js:537` — SendModal

Span 537-616; overlay L564: identical z=600 pattern; two-phase (compose → sent). Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Pattern-A adopter. Send is an irreversible action — candidate for the Batch C requireTyped/confirm tier rather than plain Modal.

### `src/app/contracts/page.js:164` — NewDocModal

Span 164-262; overlay L199: fixed inset:0 z=600 rgba(8,8,12,0.6)+blur(6px) flex-center, .r-modal maxHeight 90vh. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface (Contracts list). Pattern-A adopter.

### `src/app/contracts/page.js:263` — BulkSendModal

Span 263-end; overlay L290: identical z=600 pattern. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Bulk send = irreversible multi-recipient action — requireTyped-tier candidate.

### `src/app/leads-list/page.js:70` — BulkAssignModal

Span 70-244; overlay L110: fixed inset:0 rgba 0.5+blur(4px) flex-center z=200, .r-modal. Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface (leads list — Batch B already touched this file's badges/buttons). Pattern-A adopter.

### `src/app/leads-list/page.js:245` — BulkTrashModal

Span 245-273; overlay L247: same pattern, z=250. Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Destructive bulk action — confirm/requireTyped-tier candidate rather than bespoke modal.

### `src/app/leads-list/page.js:274` — CreateGroupModal (inner Backdrop)

Span 274-588; overlay is a `Backdrop` component DEFINED INSIDE the render (L353-357): fixed inset:0 z=250, .r-modal maxHeight 90vh. Backdrop-click: NO (despite the name). Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Hazard: component-inside-component definition remounts children (input focus loss) every render — known React trap; migration to Modal primitive fixes it for free.

### `src/app/leads-list/page.js:589` — MergeDuplicatesModal

Span 589-684; overlay L627: same pattern z=200, onClick={() => onClose(doneCount)} — Backdrop-click: YES (passes result count). Escape: no. Trap/restore/lock/aria: none. maxHeight 88vh scroll.

> **Migration:** App surface. Safe-merge flow (memory: CRM safe merge) — backdrop-close carries state (doneCount), so onClose signature isn't a plain void; primitive API must allow that.

### `src/app/leads/[id]/page.js:187` — Modal helper (local) — used by DeleteModal(197), WonModal(220), LostModal(249), EmailWorkflowModal(468)

Span 187-196: fixed inset:0 rgba 0.5+blur(4px) flex-center z=200 + .r-modal card, maxWidth prop. Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. The closest thing to an existing Modal primitive — a local one. Migrating this ONE helper converts 4 dialogs at once. DeleteModal/LostModal are destructive → confirm-tier candidates; WonModal writes revenue.

### `src/app/leads/[id]/page.js:288` — InvoiceModal

Span 288-467; own overlay L351: same pattern but z=300, maxHeight 90vh scroll. Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Money-adjacent form (invoice create from lead). Pattern-A adopter.

### `src/app/leads/[id]/page.js:1251` — Lead image lightbox (viewImage)

L1251-1252: fixed inset:0 rgba(0,0,0,0.88) z=9999 flex-center, cursor:zoom-out. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Lightbox flavor, not a card modal — decide if Batch C Modal covers lightboxes or they get a separate primitive later. z 9999 above ScheduleMeetingModal (9998).

### `src/app/leads/[id]/page.js:2807` — EmailComposeModal

Span 2807-end; overlay L2849: fixed inset:0 rgba 0.55+blur flex-center z=300, .r-modal maxHeight 90vh. Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Sends email — data-loss hazard if a future backdrop-close default lands on a half-written draft; keep explicit-close.

### `src/app/dashboard/page.js:115` — BulkUploadModal

Span 115-295; overlay L179: fixed inset:0 rgba 0.5 z=200 flex-center, .r-modal. Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none. isOpen prop gate.

> **Migration:** App surface (kanban dashboard). Pattern-A adopter; long-running CSV import — must not close mid-upload (explicit-close only).

### `src/app/chat/page.js:133` — ChannelModal

Span 133-176; overlay L138: fixed inset:0 rgba 0.5 z=300 flex-center (no blur), .r-modal 440px. Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface (team chat). Pattern-A adopter.

### `src/app/chat/page.js:1199` — Chat thread side drawer (threadFor)

L1199: fixed inset:0 z=60 rgba(8,8,12,0.35) with justify-content:flex-end → right drawer panel min(420px,92vw) height:100%. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. Drawer, not centered modal. z=60 is unusually LOW — floating FABs (9000/998) and HuddleModal render above it, but so does almost everything; fine today only by accident. Hardcoded #e5e7eb borders ignore dark theme.

### `src/app/invoices/page.js:114` — InvoiceViewModal

Span 114-254; overlay L135: fixed inset:0 rgba 0.6+blur(6px) z=300 flex-center, .r-modal 720px maxHeight 90vh. Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface — Batch B already migrated this file's buttons/badges, making it the natural FIRST Modal adopter. Contains Mark-as-Paid (pending `success` Button variant decision) and Delete (confirm-tier).

### `src/app/invoices/page.js:255` — SendInvoiceModal

Span 255-319; overlay L280: same pattern z=320 (stacks over InvoiceViewModal z=300 — intentional two-deep stack). Backdrop-click: NO. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface. NESTED-MODAL case: opens from within InvoiceViewModal; z 300→320 hand-tuned. Modal primitive needs deterministic stacking for this pair.

### `src/app/studio/page.js:12` — NewProjectModal

Span 12-104; overlay L45 uses shared class `.ms-modal-overlay` (studio.css:324: fixed inset:0 rgba(6,6,8,0.6)+blur(8px) flex-center z=400, ms-fade animation; editorial-theme variant at 325). Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface (Media Studio). Pattern-B: 11 usages of .ms-modal-overlay across studio pages — migrating the class consumers is one recipe. Hazard: ms-fade CSS animation + per-theme overlay tint must be preserved or tokenized; Batch A neutralizer already scoped to .ms-root.

### `src/app/studio/[id]/page.js:32` — Lightbox (asset viewer)

Span 32-72; overlay L55: fixed inset:0 z=300 rgba(8,7,5,0.94) flex-center. Backdrop-click: YES. Escape: YES + ArrowLeft/Right nav (L38-44) — the ONLY app-surface modal with Escape. Trap/restore/lock/aria: none.

> **Migration:** App surface. Best-behaved hand-rolled overlay; video/img content. Also in this file: CreateGalleryModal (74, .ms-modal-overlay L87), ProofingRequestModal (116, L127), Room drawer overlay (L556 z=600 → RoomPanel→HuddleModal nesting), WatermarkModal (567, overlay L611 z=700), StudioAIModal (675, overlay L692 z=700) — six overlays total, mixed pattern A and B, none with Escape except Lightbox.

### `src/app/studio/[id]/cull/page.js:758` — Cull compare/duplicate-set fullscreen overlay

L758: fixed inset:0 z=350 rgba(6,6,8,0.96) column layout. Backdrop-click: NO (toolbar close). Escape: YES via the page-global keydown (L387: escape or 'c' closes). Trap/restore/lock/aria: none.

> **Migration:** App surface (touch cull). HAZARD: the page's global hotkey handler (L383-411: p/x/m/u/z/1-5 rate & decide keys) STAYS ACTIVE while GalleryFromKeepersModal (L800, .ms-modal-overlay L819 z=400) is open — only INPUT/TEXTAREA-focused events are guarded, so stray keypresses mutate cull decisions behind the modal. Modal primitive should suppress page hotkeys while open. Also CropOverlay (L45) is absolute in-canvas, not a viewport overlay — excluded.

### `src/app/studio/[id]/albums/page.js:16` — NewAlbumModal

Span 16-49; overlay L26 uses module-level style consts `overlay`/`modalBox` (L101-102: fixed inset:0 rgba 0.55+blur(4px) flex-center z=200). Backdrop-click: YES (L26). Escape: no. Trap/restore/lock/aria: none. autoFocus on title input (only focus mgmt seen anywhere).

> **Migration:** App surface. Pattern-A via shared consts — delete overlay/modalBox consts on migration.

### `src/app/studio/[id]/video/page.js:151` — AiDraftModal + TemplateGalleryModal(220) + NewReelModal(310)

Three modals, overlays at L172/L243/L313, all `.ms-modal-overlay` (z=400) with onClick={onClose}. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none.

> **Migration:** App surface (Reels). Pattern-B trio, mechanical migration. Same file-level recipe as studio/page.js.

### `src/app/studio/[id]/video/[timelineId]/page.js:527` — MusicModal + ExportModal(886)

Overlays L552/L916, `.ms-modal-overlay` z=400, backdrop-click YES, Escape no, trap/restore/lock/aria none.

> **Migration:** App surface (video editor). HAZARD: editor global keydown (L295-306: Space=play/pause, Delete/Backspace=remove selected clip, arrows=scrub) stays live while these modals are open — guarded only for INPUT/TEXTAREA focus. Same hotkey-suppression requirement as cull page.

### `src/app/studio/portfolio/page.js:246` — Portfolio preview takeover + CandidatesPicker(260) + ShareModal(305)

Preview: L246 fixed inset:0 z=500 opaque #000 overflowY:auto with fixed exit button z=510 (L247) — takeover, not modal. CandidatesPicker overlay L274 and ShareModal overlay L319: `.ms-modal-overlay` z=400, backdrop-click YES, Escape no, trap/lock/aria none.

> **Migration:** App surface (Studio v2 portfolio editor). Two pattern-B adopters + one takeover to exclude from Modal migration (same verdict as contracts preview).

### `src/app/g/[token]/page.js:281` — PUBLIC client gallery: slideshow lightbox + CommentModal(317)

Lightbox L281: fixed inset:0 rgba(0,0,0,0.94) z=300 flex-center; backdrop-click YES; prev/next absolute buttons; autoplay interval when playing; NO Escape, no keyboard nav at all. CommentModal overlay L320: fixed inset:0 rgba 0.7 z=320, backdrop-click YES, hardcoded dark card (#15151b), Escape no. Trap/restore/lock/aria: none on either.

> **Migration:** PUBLIC page (client gallery token link). CAUTION: public pages have their own visual identity (gold #c2a878 accents, dark) and no app token substrate — migrating these to the app Modal primitive risks style bleed; recommend deferring public surfaces or theming the primitive. Slideshow autoplay timer is an animation/interval dep tied to lightbox state.

### `src/app/d/[token]/page.js:176` — PUBLIC SignSheet bottom sheet (+ AskWidget panel at 136)

SignSheet overlay L209: fixed inset:0 z=50 rgba(8,8,12,0.55)+blur(4px) with align-items:flex-end → bottom SHEET, borderRadius 20px 20px 0 0, csUp slide animation, drag-handle bar. Backdrop-click: YES. Escape: no. Trap/restore/lock/aria: none. AskWidget: fixed bottom-right chat panel z=45 + launcher z=40 (L151-154) — floating panel, not modal.

> **Migration:** PUBLIC page (doc signing token link) — legally significant e-sign flow; backdrop-click dismisses a partially-completed signature (hazard). Bottom-sheet variant + slide animation are unique here; z-scale on this page (30/40/45/50) is its own tiny world. Recommend deferring or handling as a Sheet variant.

### `src/app/folio/portfolio-view.js:88` — PUBLIC portfolio lightbox (.pf-lightbox)

JSX L88, CSS app/folio/portfolio.css:63: fixed inset:0 z=9999 rgba(6,5,4,0.96) flex-center, pf-fade animation. Backdrop-click: YES. Escape: YES + arrow-key nav (portfolio-view.js:24-29). Trap/restore/scroll lock/aria: none.

> **Migration:** PUBLIC portfolio (vanity link, 10 themes). Best-behaved public overlay. Theme-dependent (film theme adds fixed grain layer z=50 at portfolio.css:110). Defer with other public surfaces. Also inventoried for completeness: control-plane modals — control/support/page.js Modal helper (L279, overlay L281 z=50, backdrop YES, shared by NewTicketModal L112 + TicketDetail L192) and control/reports/page.js new-report modal (L92, z=100, backdrop YES) — /control cc_admins surface, pattern-A adopters; and overlay-adjacent NON-modal floating layers for the z-map only: SidePanel flyout (SidePanel.js:209, z=851, Escape YES), AICommandCenter panel (AICommandCenter.js:133, z=999, Escape YES), FloatingChat (FloatingChat.js:198, z=9000), StudioCopilot (StudioCopilot.js:86, z=380), TagPicker fixed popover (TagPicker.js:82), AppSwitcher popover (AppSwitcher.js:53, absolute z=300 but FIXED on mobile via globals.css:378), ImpersonationBanner fixed bar (ImpersonationBanner.js:40, z=99999 — current z ceiling), PlanLock LockedOverlay (PlanLock.js:49 — position:relative in-flow card, NOT a viewport overlay, no migration needed).


## Lens 2 — Toast / transient notification patterns — 36 sites

True floating toasts AND inline transient feedback (labeled) — inline feedback is not a Batch C target but is listed so nothing is silently skipped.

### `src/app/team/page.js:43` — Toast component (team, copy #1 of 3)

TRUE TOAST. Local function Toast({message,type='success'}): position fixed top:20 right:24, zIndex 9999, success (green rgba(16,185,129,.95)) + error (red rgba(239,68,68,.95)) variants, AlertCircle/CheckCircle icons, no animation, no dismiss button, NO aria-live. Two host states in same file: (a) permissions-matrix component line 354 state + line 358 showToast → setTimeout 2500ms, rendered line 380; (b) TeamPage line 468 state + lines 502-503 showToast → setTimeout 3000ms, rendered line 585. Call sites: 364,365,508,519,525,539,541. Also plain setTimeout (not cleared on unmount/re-fire; rapid calls race).

> **Migration:** Direct replacement by shared Toast primitive; two independent host states collapse to one provider. Needs success+error tones. Duration inconsistency (2500 vs 3000) to be normalized.

### `src/app/settings/page.js:74` — Toast component (settings, copy #2 of 3)

TRUE TOAST. Local Toast: fixed top:20 right:24, z 9999, error (#ef4444) vs default dark (#111827) bg, CheckCircle/AlertCircle, maxWidth 360, animation 'slideIn 0.3s ease' (keyframes in globals.css:246), NO aria-live, no dismiss. Host state line 2362, showToast lines 2394-2396 (3000ms plain setTimeout), rendered line 2415. showToast is PROP-DRILLED into ~20 tab components (lines 2484-2501: ConnectionsTab, PlanBillingTab, AppearanceTab, PresetsTab, EmailTemplatesTab, EmailSendingTab, EmailReceivingTab, AutoReplyTab, TagsTab, LostReasonsTab, NotificationsTab, IntegrationsTab, WorkspaceTab, DataPrivacyTab, AICommandTab, PasswordTab) plus WhatsAppAccountCard (1945) and PlatformAccountCard (2131). ~50 call sites (335-3029). BUG-ish: PlanBillingTab line 1384 passes type 'info' but Toast only styles 'error' vs default — info renders as success styling.

> **Migration:** Highest-leverage single adoption: replacing the host + Toast kills prop-drilling through ~20 components if primitive exposes a hook/context. Needs success+error (+info) tones.

### `src/app/knowledge/page.js:36` — Toast component (knowledge, copy #3 of 3)

TRUE TOAST. Near-identical to settings copy: fixed top:20 right:24, z 9999, error #ef4444 vs #111827, slideIn 0.3s, NO aria-live, no dismiss, no maxWidth. Host state line 65, showToast lines 85-87 (3500ms plain setTimeout), rendered line 267. Call sites 101-214 (success + error both used).

> **Migration:** Direct swap to primitive. Third duplicated Toast component — Rule of Three already violated; all three top-right copies should collapse.

### `src/app/dashboard/page.js:649` — Dashboard SSE toast (color+icon API, unique shape)

TRUE TOAST. State {message,color,icon} (line 649), showToast useCallback lines 653-655, 4000ms plain setTimeout. Render lines 891-908: fixed bottom:28 right:28 zIndex 999 (LOWER than nav overlays), var(--surface) card with colored left border (borderLeft 4px solid toast.color), emoji icon, manual X dismiss button, animation 'slideUp 0.3s ease' (keyframes local, line 1340), NO aria-live. Callers pass arbitrary hex colors: 686 (#6366f1 new lead), 698 (#10b981 new message), 713 (#f59e0b catch-up sync). No error variant — purely informational SSE event notifications.

> **Migration:** Odd one out: color/icon API instead of success/error type. Map to primitive tones (info/success/warning). Longest duration (4000ms). Bottom-right position vs others' top-right — position must be standardized in Batch C decision.

### `src/app/invoices/page.js:330` — Invoices flashToast (success-only)

TRUE TOAST. String state line 330, flashToast line 343 (3200ms plain setTimeout, clears to ''). Render lines 410-415: fixed top:20 right:24 z 9999, var(--surface) bordered card, hardcoded green CheckCircle — NO error variant exists (errors on this page use a separate persistent `error` state, line 262, and window alerts elsewhere). No dismiss, no animation, NO aria-live. Callers: 351 (marked paid), 366 (deleted), 375 (emailed).

> **Migration:** Simple adoption; needs only success tone today but errors currently have no toast path — migration should route invoice errors through primitive's error tone.

### `src/app/leads-list/page.js:712` — Leads-list toast (3 variants, role=alert, double-timer bug)

TRUE TOAST. State {msg,type,ts} line 712. TWO dismiss mechanisms: showToast line 717 embeds setTimeout(()=>setToast(t=>(t&&t.ts)?null:t),3500) whose predicate is always truthy (clears ANY current toast, including a newer one), PLUS useEffect line 719 (3500ms, properly cleaned up). Render 1310-1322: fixed bottom:24 right:24 zIndex 10000, success/info/error variants (green/indigo/red rgba .95), emoji icons, role="alert" (only 1 of 2 in codebase), manual X dismiss. Callers: 809, 977, 1004, 1278-1279 (group modal onDone/onError), 1285 (merge), 1299, 1304; also InviteToGroupModal copy button line 560 routes 'Invite link copied' through parent onDone toast.

> **Migration:** Primitive fixes the double-timer race for free. Only site (with leads/[id]) using role=alert — primitive must bake in aria-live/role so the other 14 sites gain a11y. z 10000 is the current max toast z; primitive should use --z-toast:1400 token (globals.css:73) after z-map audit.

### `src/app/leads/[id]/page.js:673` — Lead detail toast (default type ERROR, ts-race bug)

TRUE TOAST. State line 673; showToast lines 675-678 with DEFAULT TYPE 'error' (unlike everywhere else where default is success). Line 677 has a real bug: setTimeout(()=>setToast(t=>(t&&t.ts===Date.now())?null:t)) — Date.now() re-evaluated at fire time so predicate is ~never true; the useEffect at 681-683 (3500ms, cleaned up) is the actual dismisser. Render 1259-1286: fixed bottom:24 right:24 z 10000, error/success/info palette, role="alert", slideIn 0.18s ease-out, X dismiss. ~10 callers (970-2526) incl. mic-permission errors, draft-saved info, AI tool failures.

> **Migration:** Adoption deletes the dead line-677 timer. Note the inverted default (error) — call sites must pass explicit types during migration or messages flip color.

### `src/app/profile/page.js:33` — Profile toast (light tinted style, below navbar)

TRUE TOAST. State line 33, showToast 56-58 (3000ms plain setTimeout). Render 129-144: fixed top:80 (below navbar — unique offset) right:24 z 9999, LIGHT tinted style (rgba bg .10-.12 + pastel border + dark text: #b91c1c on red / #15803d on green) unlike all other solid toasts, Check/AlertCircle icons, slideIn 0.2s, no dismiss, NO aria-live. Callers: 50, 70, 72, 97, 99.

> **Migration:** Fourth distinct visual style for the same concept — strongest visual-consistency argument for the primitive. top:80 offset exists because top:20 would sit under the fixed navbar; primitive placement must account for nav height.

### `src/app/studio/[id]/cull/page.js:116` — Cull viewer 'say' pill (Media Studio family, in-viewer)

TRUE TOAST (overlay-scoped). State line 116, say() line 131 (2600ms plain setTimeout). Render 749-750: position ABSOLUTE (not fixed) top:64, centered (left 50% translateX), zIndex 4 — scoped inside the fullscreen cull viewer overlay, black rgba(0,0,0,.8) pill, single variant (no success/error distinction; failures share styling e.g. 'Copy failed' pattern in sibling pages), NO aria-live, no dismiss. Many callers (keyboard-driven UX: keep/reject/copy-paste edits, line 313 etc.). NOTE: `copied` state here (115) is a clipboard-of-edits data store, NOT a notification.

> **Migration:** Media Studio (ms-*) themed context; Batch C must decide whether the shared Toast primitive gets an ms skin or cull keeps a scoped pill. Absolute-in-overlay positioning won't work with a body-level toast portal without a container option.

### `src/app/studio/trash/page.js:18` — Studio trash 'say' pill

TRUE TOAST. State+say() lines 18-19 (2600ms). Render line 89: fixed bottom:24 centered, zIndex 600, background var(--ms-ink) color var(--ms-paper) pill, single variant, NO aria-live, no dismiss.

> **Migration:** One of 5 identical bottom-center ms-ink pills (trash/settings/portfolio/clients/contracts) — the 'say' family. Cleanest early adopters; need only a neutral/default tone.

### `src/app/studio/settings/page.js:31` — Studio settings 'say' pill

TRUE TOAST. State line 31, say() line 33 (2400ms — family outlier, others 2600ms). Render line 171: fixed bottom:24 centered z 600, ms-ink pill, single variant, NO aria-live. Includes 'Link copied' via copyLink (line 52).

> **Migration:** Same as trash pill; normalize duration.

### `src/app/studio/portfolio/page.js:27` — Studio portfolio 'say' pill

TRUE TOAST. State line 27, say() line 30 (2600ms). Render line 255: fixed bottom:24 centered z 600, ms-ink pill. Line 100: both success ('Link copied') and failure ('Copy failed') share identical styling — no error variant. NO aria-live. (ms-banner divs at lines 129/326 are static info panels, not transient.)

> **Migration:** Same family; failure messages should map to error tone in primitive.

### `src/app/clients/page.js:27` — Clients 'say' pill

TRUE TOAST. State line 27, say() line 31 (2600ms). Render line 139: fixed bottom:24 centered zIndex 600, background var(--text) color var(--surface) pill + shadow (core-app tokens, not ms-*), single variant, NO aria-live.

> **Migration:** Same family but core-token colored — shows the pill pattern already leaked out of Media Studio into core CRM pages.

### `src/app/contracts/page.js:36` — Contracts list 'say' pill

TRUE TOAST. State line 36, say() line 37 (2600ms). Render line 147: fixed bottom:24 centered zIndex 700 (family outlier vs 600), var(--text)/var(--surface) pill, single variant, NO aria-live.

> **Migration:** Same family; z 700 vs 600 inconsistency dissolves under primitive.

### `src/app/control/reports/page.js:17` — Command Center reports 'toast()' — INLINE transient, misnamed

INLINE TRANSIENT (not a floating toast despite helper named toast). msg state line 17, toast() line 23 (3000ms). Render line 60: plain <span> green #34d399 text inline next to the h1 in the page header — no positioning, no z-index, success-only, NO aria-live. Errors use window.alert (26, 35, 41, 53).

> **Migration:** Batch C decision: promote to real Toast primitive (CC is a separate /control surface with its own shell) or leave. Listed so it isn't silently skipped; the window.alert error paths belong to the confirm/alert lens.

### `src/app/control/plans/page.js:9` — Command Center plans 'toast()' — INLINE transient, misnamed

INLINE TRANSIENT. msg state line 9, toast() line 19 (2500ms). Render line 44: inline green span in header row. Success-only; errors via window.alert (26, 33). NO aria-live.

> **Migration:** Same as control/reports.

### `src/components/ScheduleMeetingModal.js:20` — Copy-link button flip (ScheduleMeetingModal)

INLINE TRANSIENT — button label swap, NOT a toast. copied boolean line 20, set lines 95-96 (1800ms), render line 246: button content flips to 'Copied' with Check icon. No floating UI, no aria-live.

> **Migration:** NOT a Batch C migration target (inline affordance). Listed for completeness. A future CopyButton micro-primitive could unify the 7 copy-flip sites.

### `src/app/team/page.js:87` — Copy invite link button flip (team InviteModal)

INLINE TRANSIENT button swap. copied line 87, setTimeout 2000ms line 103, render 136-137 ('Copied!' + green tint bg).

> **Migration:** Not a toast target; copy-flip family.

### `src/app/settings/page.js:2135` — Keyed copy flips (PlatformAccountCard: webhook/verify/widget/whook)

INLINE TRANSIENT. copied string-key state line 2135, handleCopy sets key + 2000ms clear (2151-2152). Four buttons flip label/color: lines 2277-2278, 2286-2287, 2308-2309, 2323-2324.

> **Migration:** Not a toast target; copy-flip family (keyed variant).

### `src/app/bookings/page.js:16` — Bookings saved + copied flips

INLINE TRANSIENT. saved line 16 (set line 27, 1600ms after regenerating public URL) and copied line 17 (copy() line 29, 1600ms), rendered as button state at line 52 (green 'Copied').

> **Migration:** Not a toast target; copy/saved-flip family.

### `src/app/contracts/[id]/page.js:543` — Contract builder transient trio: copied / tplSaved / remindState (+ autosave indicator)

INLINE TRANSIENT x3: (1) share-link copied line 543, copy() line 552 (1600ms), button flip line 607; (2) tplSaved line 35, saveAsTemplate line 61 (2200ms), button flips green 'Saved' line 90; (3) remindState line 273, remind() line 284 ('done' cleared after 2500ms), button flips 'Reminder sent' lines 300-301. PLUS persistent autosave status indicator: saved 'saving'/'saved'/'error' lines 26/50-52, rendered line 83 (Cloud 'Saving…' / Check 'Saved' / red 'Save failed') — a state indicator, NOT transient.

> **Migration:** Button flips: not toast targets. Autosave indicator: explicitly NOT a toast — do not migrate; same pattern as reel (studio/[id]/reel/[reelId]/page.js:19) and album (studio/[id]/album/[albumId]/page.js:18) unsaved-changes flags.

### `src/app/contracts/vault/page.js:21` — Portal-link copied flip (per-lead keyed)

INLINE TRANSIENT. portalCopied leadId-keyed state line 21, set + 1800ms clear line 23, rendered as per-row button label (line ~69).

> **Migration:** Not a toast target; copy-flip family.

### `src/app/contracts/settings/page.js:15` — Contracts settings 'Saved' chip

INLINE TRANSIENT. saved boolean line 15; saveClause line 27 (1200ms) and updateSettings line 33 (1500ms — two different durations in same file); render line 57: inline green Check 'Saved' span in header. NO aria-live.

> **Migration:** Borderline: behaves like a transient save confirmation — reasonable candidate to become a success toast during Batch C, or stay inline. Flag for decision.

### `src/app/studio/store/page.js:16` — Store per-product 'Saved' button flip

INLINE TRANSIENT. savedId keyed state line 16, saveProduct line 23 (1500ms), render line 66: Save button flips to green 'Saved'.

> **Migration:** Not a toast target; saved-flip family.

### `src/app/control/desktop/page.js:13` — CC desktop 'Saved ✓' — NO auto-dismiss

INLINE feedback. saved line 13, set true on save success (line 28), reset only at start of next save (line 21) — persists indefinitely, render line 69 green 'Saved ✓' span. No timeout, NO aria-live.

> **Migration:** Inconsistent with every other saved-indicator (all others auto-clear). If CC pages adopt the primitive, this becomes a success toast; otherwise at minimum add the missing timeout.

### `src/app/g/[token]/page.js:77` — Public client gallery 'collection saved' flip

INLINE TRANSIENT on a PUBLIC (unauthenticated) page. savedColl line 77, set + 2500ms clear line 80, render line 191: button flips to '✓ Saved — your photographer can see it'.

> **Migration:** Public standalone page (own dark theme) — including it in the app-shell toast provider may be undesirable; flag as likely keep-inline.

### `src/app/invoices/page.js:116` — payLink 'Link copied' flip — NO auto-dismiss

INLINE feedback. payLink line 116, set once at line 121 (also writes clipboard), never cleared — button label permanently flips to '✓ Link copied' (line 240) for the modal's lifetime.

> **Migration:** Should either become a success toast or gain a reset timeout during invoices migration (invoices is already a Batch B adopter surface).

### `src/app/chat/page.js:370` — Typing indicator (transient, NOT a notification)

typingUser state line 370, cleared by ref-managed 3500ms timer line 452 (timer properly ref'd), rendered inline in thread lines 1039-1041 ('X is typing…').

> **Migration:** EXCLUDE from Batch C — presence indicator, not feedback. Listed because it matched the setTimeout-cleared-state sweep.

### `src/app/studio/[id]/page.js:157` — Media Studio project banner (persistent action feedback — biggest gray-zone)

BANNER, manual dismiss only, NO auto-dismiss. banner {type: ok/info/error, msg, link?} line 157; ~20 set sites (217, 235, 238, 243, 245, 250-251, 256, 259, 262, 271, 295, 306, 308, 313-314, 327, 330, 336, 338-339, 416) covering upload errors, watermarking, auto-edit, publish success (with copyable share link + Open button), export failures. Render 372-383: inline .ms-banner (studio.css:347) at top of content flow with X dismiss; also passed as setBanner prop into StudioAIModal (562, 675, 687). NO aria-live.

> **Migration:** KEY Batch C decision: this is transient action feedback rendered as a persistent banner. Success cases ('Deleted', 'Link copied') are toast-shaped; the link-bearing publish banner and error banners arguably should stay. Recommend: split — plain ok messages → Toast, link/error payloads stay banner. Do not blanket-migrate.

### `src/app/booking/manage/[token]/page.js:19` — Public booking-manage inline msg (persistent)

INLINE feedback, no timeout. msg line 19, set by reschedule/cancel (27-28), render line 48: indigo info box above content. Public unauthenticated page. NO aria-live.

> **Migration:** NOT a toast target (public page, persistent confirmation appropriate). Its window.confirm at line 28 belongs to the confirm lens.

### `src/components/UsageWarnings.js:20` — Global soft-limit usage banner (persistent, session-dismissable)

BANNER, not transient. Shows most-severe quota metric >=80%: inline full-width strip under nav, warn/critical/reached severities (amber/red), per-metric session dismiss (line 77), Upgrade CTA. No timeout, NO aria-live (has aria-label on dismiss only).

> **Migration:** NOT a Batch C toast target — system banner tier (--z-banner exists for this class). Listed to bound the lens.

### `src/components/ImpersonationBanner.js:39` — Impersonation banner (persistent, fixed, z 99999)

BANNER. Fixed bottom full-width, zIndex 99999 (highest z in app, above everything incl. toasts), gradient bg, shown while cc_impersonating. Not transient, not dismissable except by exiting impersonation.

> **Migration:** NOT a toast target, but its z 99999 must be in the Batch C z-map: it intentionally outranks --z-toast:1400 and all 9999/10000 toasts.

### `src/app/leads/[id]/page.js:1345` — Won/Lost status banners (persistent state display)

Full-width green/red banners (1346-1355) reflecting lead.status — pure state display, no dismissal, no timer.

> **Migration:** EXCLUDE — not feedback. Listed because comment says 'Status banners'.

### `src/app/studio/[id]/page.js:678` — StudioAIModal inline note (persistent)

note string state line 678, set by analyze/gen/album/reel results and failures (685-689), render line 731 as inline gray panel inside the modal. No timeout, both success and error text share styling.

> **Migration:** NOT a toast target (in-modal result readout). Its buildGallery success path already routes to parent setBanner — mixed feedback channels in one modal worth noting.

### `src/app/login/page.js:18` — Persistent form error states (login + 12 sibling sites) — inline validation, not transient

Representative of the persistent (no-timeout) error/status form-state family found in the sweep: login/page.js:18, signup/page.js:22, accept-invite/page.js:14 (also has setDone success screen + 1800ms redirect, line 40), components/AddLeadModal.js:15, components/HuddleModal.js:23, dashboard/page.js:120, invoices/page.js:262, leads/[id]/page.js:2811, whatsapp/page.js:14 (status), control/support/page.js:33, control/customers/page.js:15, settings/page.js:1032+1946 (integration status objects), hooks/usePushNotifications.js:20 (error surfaced via NotificationsTab showToast). None auto-dismiss; all render inline near their forms.

> **Migration:** NONE are Batch C targets (inline form validation stays inline per standard practice). Enumerated so the sweep provably covered them rather than silently skipping.

### `src/app/globals.css:73` — Toast infrastructure: unused --z-toast token + shared slideIn keyframe

--z-toast: 1400 defined (with --z-modal:1300, --z-banner:1500) but ZERO toasts use it — actual z-indexes in the wild: 4 (cull overlay), 600 (say pills), 700 (contracts pill), 999 (dashboard), 9999 (team/settings/knowledge/invoices/profile), 10000 (leads-list/leads-detail), 99999 (ImpersonationBanner). @keyframes slideIn at globals.css:246 (translateY -10px→0) is shared by settings/knowledge/profile/leads-detail toasts; slideUp is defined LOCALLY twice (dashboard/page.js:1340, AICommandCenter.js:372). ARIA: zero aria-live attributes in the entire src; only two role="alert" (leads-list:1311, leads/[id]:1269). Durations observed: 1200,1500,1600,1800,2000,2200,2400,2500,2600,3000,3200,3500,4000ms.

> **Migration:** Primitive spec inputs: mount at --z-toast:1400 (verify against modal z usage in the modal-lens inventory; note existing toasts at 9999+ currently sit above ad-hoc modals), bake in role=status + aria-live=polite (aria-live=assertive/role=alert for errors), one slideIn/slideUp animation, standard durations (e.g. 2500 default / 4000 long), success/error/info/neutral tones covering all observed variants.


## Lens 3 — Native dialogs (window.confirm / alert / prompt) — 50 sites

Every native browser dialog call, with the proposed tier (standard / danger / requireTyped) and whether the surface is app-internal or public.

### `src/lib/confirm.js:72` — window.alert — useConfirm fallback

Inside useConfirm(): when a component renders OUTSIDE ConfirmProvider (e.g. landing page), alertOnly opts fall back to window.alert(opts.message || opts.title). App-internal infrastructure.

> **Migration:** INTENTIONAL fallback — leave as-is (or route to Batch C Toast if the Toast host is mounted outside the provider tree). Not a migration target per se; document it. lib/confirm.js is the lib itself.

### `src/lib/confirm.js:76` — window.confirm — useConfirm fallback

Same outside-provider fallback: returns Promise.resolve(window.confirm(message)). Infrastructure.

> **Migration:** INTENTIONAL fallback — leave as-is. Verify which public pages actually render outside ConfirmProvider (providers.js mounts it) since public token pages are the main consumers of this path.

### `src/app/leads-list/page.js:616` — window.confirm — merge duplicate leads

Message: `Merge ${dupIds.length} duplicate(s) into "${primary.customer_name}"?\n\nAll messages, notes, invoices, tags & history move to the survivor. The other(s) go to Trash (restorable for 90 days).${warn}`. Guards MASS-DESTRUCTIVE lead merge (multi-record, cross-entity data movement). Surface: app-internal (leads list). NOTE: multi-line message with \n\n — native confirm renders it; Modal needs a body that supports paragraphs.

> **Migration:** requireTyped tier — this is the canonical type-to-confirm case (mass merge, partially reversible via 90-day trash but history/attachment moves are messy to undo). File ALREADY imports useConfirm (line 19); extend to the new requireTyped API. Suggested typed token: primary lead name or 'MERGE'.

### `src/app/studio/trash/page.js:37` — window.confirm — permanent delete media asset

Message: 'Delete this permanently? This cannot be undone.' Guards IRREVERSIBLE hard-delete of a media asset from studio trash. Surface: app-internal.

> **Migration:** danger tone confirm() from lib/confirm.js (single-item hard delete; matches existing app/trash/page.js:56 pattern 'Delete forever'). File does NOT import lib/confirm — add useConfirm import. If a bulk 'empty trash' exists here later, that would be requireTyped.

### `src/app/contracts/page.js:116` — window.confirm — delete contract document

Message: `Delete "${d.title}"?`. Guards deletion of a contract/document via csAPI.remove(d.id) (irreversible — no trash mentioned). Inline onClick on trash-icon button. Surface: app-internal (contracts list).

> **Migration:** danger tone confirm() with confirmLabel 'Delete'. File does NOT import lib/confirm — add useConfirm. The empty catch {} swallows failures — pair with Toast error while migrating.

### `src/app/contracts/[id]/page.js:215` — window.confirm — restore contract version

Message: 'Restore this version? Your current content will be replaced (sent copies are unaffected).' Guards overwriting current draft content with an older version (destructive to unsaved current content). Surface: app-internal (contract editor).

> **Migration:** Standard confirm() (warning-ish, not danger — sent copies unaffected, version history presumably retains the replaced state; use tone 'warning' if content is truly lost). File does NOT import lib/confirm — add useConfirm.

### `src/app/studio/[id]/page.js:267` — window.confirm — bulk move media to Trash

Message: `Move ${selected.size} item(s) to Trash? You can restore within 30 days.` Guards bulk soft-delete of selected media. Reversible (30-day trash). Surface: app-internal (Media Studio project).

> **Migration:** Standard confirm() default tone (reversible soft-delete; not danger, not requireTyped despite being bulk — trash is the safety net). File does NOT import lib/confirm — add useConfirm.

### `src/app/studio/[id]/page.js:275` — window.confirm — move single media item to Trash

Message: `Move this ${video|photograph} to Trash? You can restore within 30 days.` Guards single-item soft-delete. Reversible. Surface: app-internal.

> **Migration:** Standard confirm() default tone. Same file/import as line 267 — migrate together.

### `src/app/studio/[id]/page.js:578` — window.prompt — name watermark preset

Message: 'Name this watermark preset'. Collects a preset name, saved to localStorage. Non-destructive. Surface: app-internal.

> **Migration:** Neither confirm tier fits — needs the Batch C Modal primitive with a text input (an 'input/prompt modal' variant). lib/confirm.js has NO input support today. Not urgent; migrate when the input-modal variant exists.

### `src/app/studio/[id]/video/page.js:45` — bare confirm() — delete reel timeline

Message: 'Delete this reel? This cannot be undone.' Bare native confirm (file imports nothing from lib/confirm — verified imports lines 1–9). Guards IRREVERSIBLE deletion of a reel timeline via mediaAPI.deleteTimeline. Surface: app-internal (Media Studio video).

> **Migration:** danger tone confirm() with confirmLabel 'Delete'. Add useConfirm import. Also note empty catch {} on the delete call — add Toast error.

### `src/app/studio/[id]/video/page.js:62` — bare alert() — reel auto-build failure

Message: e?.response?.data?.error || 'Could not build a reel — run AI analysis on the photos first.' Error feedback after reelAPI.render fails. Guards nothing destructive. Surface: app-internal.

> **Migration:** Batch C Toast (error/danger) — transient failure feedback, not a blocking decision. Alternative: alertOnly confirm({tone:'danger'}) if Toast isn't adopted here yet.

### `src/app/studio/[id]/albums/[albumId]/page.js:96` — bare alert() — album autofill failure

Message: e.response?.data?.error || 'No keepers yet — mark some in Cull first.' Error feedback after mediaAPI.autofillAlbum fails. Non-destructive. Surface: app-internal. No lib/confirm import in file.

> **Migration:** Batch C Toast (warning/error tone) — informational failure, ideal toast case.

### `src/app/leads-list/page.js:622` — window.alert — merge failed

Message: e.response?.data?.error || 'Merge failed'. Error feedback in the merge catch block (right after the line-616 confirm). Surface: app-internal.

> **Migration:** Batch C Toast (danger) or alertOnly confirm — file already imports useConfirm (line 19), and lines 90/103 in this same file already use the alertOnly pattern, so alertOnly confirm is the zero-new-dependency fix; Toast is the better end state.

### `src/app/leads-list/page.js:806` — window.prompt — name saved view

Message: 'Name this view (e.g. "Hot — needs follow-up")'. Collects a name for a saved lead-list view. Non-destructive. Surface: app-internal.

> **Migration:** Needs Batch C input-capable Modal (prompt variant). File already imports useConfirm.

### `src/app/leads-list/page.js:999` — window.confirm — bulk convert leads to Clients

Message: `Move ${selected.size} lead(s) to Clients? They'll leave the Leads list but keep their chat, history & analytics.` Guards bulk won→client conversion. Reversible-ish (data kept; leaves the list). Surface: app-internal.

> **Migration:** Standard confirm() default tone (bulk but non-destructive — data preserved). Not requireTyped. File already imports useConfirm.

### `src/app/leads/[id]/page.js:2895` — window.prompt — Enter URL (rich-text toolbar)

Message: 'Enter URL:'. Inside the email/notes rich-text editor toolbar onMouseDown — collects a URL for execCmd (createLink). Non-destructive. Surface: app-internal (lead detail). CAUTION: fired from onMouseDown with e.preventDefault() to preserve editor selection — an async modal will DROP the contenteditable selection; migration must save/restore the Range or keep this synchronous.

> **Migration:** Needs Batch C input Modal, but this is the hardest prompt migration in the sweep: must capture window.getSelection() range before opening the modal and restore it before execCmd. File already imports useConfirm (line 26). Consider deferring or building a tiny inline popover instead of a modal.

### `src/app/booking/manage/[token]/page.js:28` — window.confirm — cancel booking (PUBLIC)

Message: 'Cancel this booking?'. Guards client-side booking cancellation via cancelBookingPublic(token) — irreversible for the end client (must rebook). Surface: PUBLIC (tokenized booking-manage page used by the photographer's clients, unauthenticated).

> **Migration:** danger (or warning) tone confirm — but PUBLIC-SURFACE CAVEAT: verify ConfirmProvider is mounted for this route and that cm-card tokens render correctly on the public page theme (public pages are light/standalone; cm-card uses var(--surface)/var(--border) dark-app tokens). If not, this page may need the Batch C Modal used standalone. No lib/confirm import today.

### `src/app/d/[token]/page.js:206` — window.prompt — decline document with reason (PUBLIC)

Message: 'Decline this document? (optional reason)'. Doubles as BOTH the confirmation AND the reason-collection for declining a contract/e-sign document (declinePublicDoc) — irreversible, legally meaningful. null = cancel, empty string = decline with no reason. Surface: PUBLIC (d/[token] e-sign page, unauthenticated client).

> **Migration:** Needs Batch C Modal with optional-text input + danger-toned 'Decline' action (a confirm alone loses the reason field; a plain input modal loses the gravity). Preserve the tri-state: cancel vs decline-with-empty-reason. Public-surface theming caveat as with booking/manage. No lib/confirm import.

### `src/app/g/[token]/page.js:79` — window.prompt — name a favourites selection (PUBLIC)

Message: 'Name this selection (e.g. "For the album", "Parents' favourites")'. Collects a collection name on the public client gallery portal before POSTing favourites. Non-destructive. Surface: PUBLIC (g/[token] gallery, unauthenticated).

> **Migration:** Batch C input Modal, default tone. Public-surface theming caveat (gallery portal has its own look). No lib/confirm import.

### `src/app/control/database/page.js:46` — window.prompt — step-up PASSWORD entry (control plane)

Message: 'Step-up required. Re-enter your password to run founder-level SQL:'. Collects the founder's PASSWORD in a plain-text native prompt (no masking!) to mint an elevated token for arbitrary SQL. Surface: app-internal /control (cc_admins only). This is the single most security-sensitive dialog in the sweep — password is visible on screen and in shoulder-surf range.

> **Migration:** NOT a confirm tier at all — needs a dedicated Batch C Modal with a type=password input. Treat as its own mini-component (StepUpModal). Arguably a Phase-0-adjacent security fix independent of design-system motives. No lib/confirm import.

### `src/app/control/reports/page.js:52` — bare confirm() — delete scheduled report (control plane)

Message: `Delete report "${r.name}"?`. Guards deletion of a saved/scheduled Command Center report (irreversible). Surface: app-internal /control. No lib/confirm import (verified imports lines 1–4).

> **Migration:** danger tone confirm(). NOTE for whole /control surface: these pages live under the ControlShell (dark bespoke theme) — confirm ConfirmProvider wraps /control routes (providers.js is app-root, so likely yes) and that cm-* styling looks right there.

### `src/app/control/reports/page.js:26` — bare alert() — validation: report name required

Message: 'Name required'. Form validation before createReport. Non-destructive. Surface: /control.

> **Migration:** Replace with inline field validation or Batch C Toast (warning). This file already has a homegrown 3s toast (line 23 `toast()` helper) — unify on the Batch C Toast primitive.

### `src/app/control/reports/page.js:35` — bare alert() — create report failed

Message: e.response?.data?.error || 'Failed'. Error feedback. Surface: /control.

> **Migration:** Batch C Toast (danger). Replaces the native alert; file's existing setMsg toast helper should also fold into the primitive.

### `src/app/control/reports/page.js:41` — bare alert() — run report failed

Message: e.response?.data?.error || 'Failed'. Error feedback on manual report run. Surface: /control.

> **Migration:** Batch C Toast (danger).

### `src/app/control/reports/page.js:53` — bare alert() — delete report failed

Message: e.response?.data?.error || 'Failed'. Error feedback in delete catch (same line block as the line-52 confirm). Surface: /control.

> **Migration:** Batch C Toast (danger). Migrate together with line 52.

### `src/app/control/support/page.js:131` — bare alert() — validation: ticket subject required

Message: 'Subject is required'. Form validation inside the New-ticket modal (already uses a local Modal component from ControlShell). Surface: /control.

> **Migration:** Inline field validation or Toast (warning). Note this file already renders a bespoke <Modal> — Batch C Modal primitive should absorb/replace ControlShell's Modal eventually (adjacent inventory item for the Modal lens).

### `src/app/control/support/page.js:136` — bare alert() — create ticket failed

Message: e.response?.data?.error || 'Failed to create ticket'. Error feedback. Surface: /control.

> **Migration:** Batch C Toast (danger).

### `src/app/control/support/page.js:206` — bare alert() — ticket status update failed

Message: e.response?.data?.error || 'Failed'. Error feedback in TicketDetail setStatus. Surface: /control.

> **Migration:** Batch C Toast (danger).

### `src/app/control/support/page.js:214` — bare alert() — ticket comment failed

Message: e.response?.data?.error || 'Failed'. Error feedback in addComment. Surface: /control.

> **Migration:** Batch C Toast (danger).

### `src/app/control/customers/[id]/page.js:21` — bare alert() — shared act() error handler

Message: e.response?.data?.error || 'Action failed'. The `act(fn)` wrapper used by EVERY mutation on this page (plan change, suspend, restore, grace, module toggle, override add/revoke, notes) — one alert covers ~10 actions. Surface: /control.

> **Migration:** Batch C Toast (danger) inside act() — single-point migration covers all mutations on the page. High-leverage: fix here first.

### `src/app/control/customers/[id]/page.js:44` — bare prompt() — suspension reason

Message: 'Reason for suspension?'. Collects reason then SUSPENDS a customer workspace (blocks their whole product access — severe, though reversible via Restore). null cancels; empty string proceeds. Surface: /control.

> **Migration:** Batch C Modal: danger-toned confirm WITH a reason text input (combined pattern, like d/[token] decline). Suspension is severe enough that plain prompt-as-confirm is inadequate; consider requireTyped only if owner wants extra friction — danger+reason-input recommended.

### `src/app/control/customers/[id]/page.js:45` — bare prompt() — grace period days

Message: 'Grace period days?' default '14'. Collects a number for ccApi.grace. Non-destructive (grants access). parseInt with NaN guard (days > 0). Surface: /control.

> **Migration:** Batch C input Modal with number input + default value support. Standard tone.

### `src/app/control/customers/[id]/page.js:46` — bare alert() — impersonate failed

Message: e.response?.data?.error || 'Failed'. Error feedback when minting a read-only impersonation token fails. Surface: /control.

> **Migration:** Batch C Toast (danger). (The impersonate action itself might deserve a confirm gate in future — out of scope for this lens.)

### `src/app/control/customers/[id]/page.js:113` — bare prompt() — override kind

Message: 'kind? (limit | feature | module)' default 'feature'. First of a 3-prompt chain (lines 113–115) building an entitlement override — changes what a paying customer can access. Surface: /control.

> **Migration:** Replace the whole 3-prompt chain (113/114/115) with ONE Batch C Modal form (kind select + key input + value input) — do not migrate the prompts individually. Standard tone with explicit 'Add override' action.

### `src/app/control/customers/[id]/page.js:114` — bare prompt() — override key

Message: 'key? (e.g. flux, leads)'. Second of the 3-prompt override chain. Surface: /control.

> **Migration:** Absorbed into the single override-form Modal (see line 113).

### `src/app/control/customers/[id]/page.js:115` — bare prompt() — override value

Message: 'value? (true/false or a number)'. Third of the chain; string coerced to bool/number afterwards. Surface: /control.

> **Migration:** Absorbed into the single override-form Modal (see line 113); the form can type the value field properly instead of string-coercion.

### `src/app/control/plans/page.js:26` — bare alert() — plan save failed

Message: e.response?.data?.error || 'Save failed'. Error feedback saving plan edits (pricing engine — money-adjacent). Surface: /control.

> **Migration:** Batch C Toast (danger).

### `src/app/control/plans/page.js:31` — bare prompt() — new plan key

Message: 'New plan key (e.g. studio_pro):'. First of a 2-prompt chain (31–32) creating a PLAN — a billing-critical object; a typo'd key is permanent-ish. Surface: /control.

> **Migration:** Replace 2-prompt chain with one Batch C Modal form (key + display name). Given plan keys drive entitlements/billing, add key-format validation in the form. Standard tone.

### `src/app/control/plans/page.js:32` — bare prompt() — plan display name

Message: 'Display name:' default = key. Second of the create-plan chain. Surface: /control.

> **Migration:** Absorbed into the create-plan Modal (see line 31).

### `src/app/control/plans/page.js:33` — bare alert() — create plan failed

Message: e.response?.data?.error || 'Failed'. Error feedback for createPlan. Surface: /control.

> **Migration:** Batch C Toast (danger).

### `src/app/control/plans/page.js:36` — bare prompt() x2 — add plan limit (key + value)

TWO native prompts on one line: 'Limit key (e.g. leads, users):' then 'Value (-1 = unlimited):' default '0'. Edits a plan's limits (entitlement-affecting, money-adjacent). Surface: /control.

> **Migration:** One Batch C Modal form (limit key + numeric value with -1=unlimited hint). Count as 2 native calls when tallying invocations.

### `src/app/control/plans/page.js:37` — bare prompt() x2 — add plan feature (key + value)

TWO prompts: 'Feature key (e.g. flux, api_access):' then 'Value (true / false / text):' default 'true', with string→bool coercion. Surface: /control.

> **Migration:** One Modal form (feature key + typed value control). 2 native calls on this line.

### `src/app/control/plans/page.js:38` — bare prompt() x2 — add plan price (interval + amount)

TWO prompts: 'Interval (month / year / lifetime):' default 'month' then 'Amount (USD):' default '0' (parseFloat||0 — a typo silently becomes $0!). PRICING data. Surface: /control.

> **Migration:** One Modal form (interval select + validated currency amount). The parseFloat||0 silent-zero is a data-integrity bug worth fixing during migration. 2 native calls on this line.

### `src/app/control/health/page.js:25` — bare alert() — health rollup failed

Message: e.response?.data?.error || 'Failed'. Error feedback for manual usage-rollup recompute. Surface: /control.

> **Migration:** Batch C Toast (danger).

### `src/app/control/inbox/page.js:27` — bare alert() — dismiss inbox item failed

Message: e.response?.data?.error || 'Failed'. Error feedback for dismissInbox. Surface: /control.

> **Migration:** Batch C Toast (danger). (Dismiss itself is unguarded — fine, it's low-stakes.)

### `src/app/control/flags/page.js:17` — bare alert() — shared act() error handler (flags)

Message: e.response?.data?.error || 'Failed'. act(fn) wrapper covering all flag mutations (create, enable/disable globally, rollout %, workspace assign). Surface: /control.

> **Migration:** Batch C Toast (danger) inside act() — single-point fix like customers/[id]:21.

### `src/app/control/flags/page.js:20` — bare prompt() — new flag key

Message: 'Flag key (e.g. NEW_CULL_UI):'. First of 2-prompt chain (20–21) creating a feature flag. Surface: /control.

> **Migration:** One Batch C Modal form (key + description) replacing the chain. Standard tone.

### `src/app/control/flags/page.js:21` — bare prompt() — flag description

Message: 'Description:' default ''. Second of the create-flag chain. Surface: /control.

> **Migration:** Absorbed into the create-flag Modal (see line 20).

### `src/app/control/flags/page.js:59` — bare prompt() — flag rollout percentage

Message: 'Rollout %?' default current pct. Sets percentage rollout (0–100 validated after). Changes live feature exposure for customers. Surface: /control.

> **Migration:** Batch C input Modal (number, 0–100 validation in-form). Standard tone; arguably warning tone since it changes production exposure.

### `src/app/control/flags/page.js:60` — bare prompt() — workspace ID for flag enable

Message: 'Workspace ID to enable for:'. Collects a raw workspace ID to assign a flag per-workspace. Typo risk: silently targets the wrong workspace. Surface: /control.

> **Migration:** Batch C Modal with a workspace SEARCH picker (the pattern already exists in control/support/page.js lines 150–162) rather than a raw-ID text input.


## Lens 4 — Z-index layering map + lib/confirm consumers — 63 sites

Every overlay/toast/dropdown/nav z-index compared against the Batch A ladder, plus current lib/confirm.js consumers.

### `src/lib/confirm.js:123` — ConfirmProvider dialog (the primitive itself)

Batch-A-retokenized confirm/alert dialog. .cm-overlay: position fixed inset 0, z-index var(--z-modal) = 1300, background var(--overlay-bg), backdrop blur. Backdrop onClick=onCancel (closes), Escape=cancel / Enter=confirm at window level, tones default/danger/success/warning/info, alertOnly single-button mode. useConfirm() falls back to window.confirm/alert outside the provider.

> **Migration:** Already on the ladder (--z-modal). BUT: it is stacked UNDER every legacy surface that uses z>1300 — see the inversion items for ScheduleMeetingModal (9998), FloatingChat (9000/9001), NavBar flux modal (9999), and all 9999/10000 page toasts. Batch C must pull those surfaces down onto the ladder or confirms fired from inside them stay invisible.

### `src/app/providers.js:3` — ConfirmProvider mount point

imports ConfirmProvider from '@/lib/confirm' and wraps the app — the single provider mount.

> **Migration:** Toast provider for Batch C should mount here alongside ConfirmProvider so both share one stacking context ordered by ladder tokens (--z-modal 1300 < --z-toast 1400).

### `src/components/ScheduleMeetingModal.js:16` — confirm consumer: ScheduleMeetingModal

5 alertOnly calls: GCal-not-connected warning (L51), meeting-scheduled success (L71), could-not-schedule error (L80), Calendly-link-sent success (L108), could-not-send error (L116). CRITICAL: this component's own overlay .sm-overlay is z-index 9998 (L262), so the confirm dialog at --z-modal 1300 renders UNDER it — the alert is invisible; the page just appears frozen until Enter/Escape.

> **Migration:** Confirmed z-order inversion (legacy 9998 > token 1300). Fix by moving sm-overlay to --z-modal. All 5 alertOnly calls are toast-shaped (success/error notices) — migrate to the Batch C Toast primitive instead of alertOnly confirm.

### `src/components/FloatingChat.js:15` — confirm consumer: FloatingChat

2 alertOnly danger calls: send failed (L125), upload failed (L137). Component renders at zIndex 9000 (FAB, L144/198) and 9001 (popover, L163) — above the confirm dialog's 1300, so these error alerts render UNDER the chat panel.

> **Migration:** Same inversion class as ScheduleMeetingModal. Move FAB/panel to --z-overlay (1200); migrate both alertOnly calls to Toast (tone: error).

### `src/app/chat/page.js:348` — confirm consumer: team chat

1 call: delete-message confirm (L657, tone danger, 'This cannot be undone.').

> **Migration:** Keep as confirm (destructive). No requireTyped needed (single message).

### `src/app/leads-list/page.js:71` — confirm consumer: leads list (distribute modal)

2 alertOnly calls: pick-at-least-one-teammate warning (L90), assignment-failed error (L103).

> **Migration:** Both are notices → migrate to Toast (warning/error tones). The page already has its own inline toast at L1312 — consolidate.

### `src/app/trash/page.js:18` — confirm consumer: leads trash

6 calls: restore-lead confirm (L47), restore-failed alert (L51), permanent-delete confirm (L56 'Delete forever', danger), delete-failed alert (L60), empty-trash-all confirm (L65, danger, deletes all N leads + messages/notes/invoices), empty-failed alert (L73).

> **Migration:** Permanent-delete (L56) and empty-trash (L65) are the prime candidates for the Batch C requireTyped tier (irreversible bulk destruction). Failure alerts → Toast.

### `src/app/leads/[id]/page.js:289` — confirm consumer: lead detail (2 hooks, L289 + L469)

2 alertOnly danger calls: could-not-create-invoice (L322), could-not-schedule-workflow (L481).

> **Migration:** Both error notices → Toast. Note this page also has its own bottom-right toast system at L1271 (z 10000) to consolidate.

### `src/app/team/page.js:83` — confirm consumer: team page (4 hooks: L83/200/247/458)

4 calls: could-not-invite alert (L97), failed-to-update-role alert (L206), failed-to-update-permissions alert (L262), remove-member confirm (L530, 'They will lose access immediately').

> **Migration:** Remove-member stays a confirm (danger). The 3 failure alerts → Toast. Page's own Toast component (L46, z 9999) must be replaced by the shared primitive.

### `src/app/knowledge/page.js:54` — confirm consumer: knowledge base

2 danger confirms: delete-document (L153, also removes extracted memories, irreversible), delete-memory (L208).

> **Migration:** Keep as confirms. Delete-document is a candidate for requireTyped if doc deletion cascades widely; otherwise plain danger confirm.

### `src/app/invoices/page.js:322` — confirm consumer: invoices

3 calls: could-not-update alert (L352), delete-invoice confirm (L356, danger, permanent, names the invoice), could-not-delete alert (L367).

> **Migration:** Delete confirm stays. Alerts → Toast. NOTE: this page owns the reported toast/modal inversion (see z-map item at L411).

### `src/app/settings/page.js:315` — confirm consumer: settings (8 hooks: L315/412/486/597/709/1030/1748)

8 calls: delete-preset (L343), delete-lost-reason (L437), delete-email-template (L585), delete-auto-reply-rule (L691), delete-tag (L775, 'Leads currently tagged will lose it'), connection-failed alert (L1066), disconnect-Google-Calendar confirm (L1080), disconnect-channel confirm (L1802, loses WhatsApp session).

> **Migration:** Deletes/disconnects stay confirms (danger). Connection-failed alert → Toast. Page's own Toast (L77, z 9999) replaced by shared primitive. Disconnect-channel (L1802) is consequence-heavy — consider requireTyped.

### `src/app/globals.css:72` — THE BATCH A LADDER (reference)

Actual block read: line 72 `--z-base: 1; --z-dropdown: 1000; --z-sticky: 1100; --z-overlay: 1200;` line 73 `--z-modal: 1300; --z-toast: 1400; --z-banner: 1500;`. Comment: 'Z-index ladder — replaces the ad-hoc 1..99999 sprawl'. Today exactly ONE consumer exists: lib/confirm.js:123.

> **Migration:** Every item below maps a raw value onto one of these 7 rungs. The ladder is sound; nothing in the sweep needs a new rung.

### `src/app/invoices/page.js:411` — REPORTED BUG — invoices toast (z 9999) covers invoice modals (z 300/320)

CONFIRMED z-order inversion. Toast: fixed top-right, zIndex 9999 (L411, shown via showToast/handleEmailSent). InvoiceDetailModal backdrop: fixed inset-0 zIndex 300 (L135). SendInvoiceModal backdrop: zIndex 320 (L280). After 'Invoice sent/downloaded' the toast paints on top of the still-open modal, overlapping its header/close region. Also inverts against the confirm dialog: 9999 > --z-modal 1300, so the delete-invoice confirm renders under an active toast.

> **Migration:** Toast → --z-toast (1400); both modal backdrops → --z-modal (1300). On the ladder toast-above-modal is the DESIGNED order (1400>1300) but toasts are small and top-right; the bug today is the raw 9999 which beats everything including confirms. Replace inline toast with the Batch C Toast primitive.

### `src/app/invoices/page.js:135` — DEAD BACKDROP — InvoiceDetailModal

Backdrop fixed inset-0 rgba(0,0,0,0.6) blur(6px) zIndex 300. Blocks clicks (covers page) but has NO onClick — clicking the dark area does nothing; close only via header X. No Escape handling.

> **Migration:** Migrate to Modal primitive with backdrop-click-to-close + Escape; --z-modal.

### `src/app/invoices/page.js:280` — DEAD BACKDROP — SendInvoiceModal

Backdrop zIndex 320, no onClick, blocks but never closes. Stacked 320>300 to sit above the detail modal — ad-hoc two-level modal stacking.

> **Migration:** Modal primitive; both rungs become --z-modal (later sibling wins by DOM order — no numeric hack needed).

### `src/app/team/page.js:107` — DEAD BACKDROPS — team page modals (L107, L146, L210, L276)

Invite-result modal (L107, z 200), invite modal (L146, z 200), role modal (L210, z 200), permissions modal (L276, z 300) — all fixed inset-0 blur backdrops with NO onClick close. Sticky sub-nav at L591 (z 40, sticky top:60).

> **Migration:** All four → Modal primitive at --z-modal with backdrop close. Sticky bar → --z-sticky.

### `src/app/team/page.js:46` — Toast — team page (z 9999)

Local Toast component: fixed top:20 right:24 zIndex 9999, error/success variants. Covers the confirm dialog (1300) and the page's own modals (200/300).

> **Migration:** Replace with shared Toast primitive at --z-toast (1400).

### `src/app/leads-list/page.js:110` — DEAD BACKDROPS — leads-list modals (L110 z200, L247 z250, L354 z250)

Distribute modal (L110), and two more modals (L247, L354) — fixed inset-0 blur backdrops, NO onClick. Only the bulk-action modal at L627 (z 200) closes on backdrop click.

> **Migration:** All → Modal primitive, --z-modal, uniform backdrop-close behavior.

### `src/app/leads-list/page.js:1312` — Toast — leads-list (z 10000)

role=alert, fixed bottom-right zIndex 10000, error/info/success palette, manual X dismiss. Beats every modal on the page and the confirm dialog.

> **Migration:** Shared Toast primitive at --z-toast.

### `src/app/leads/[id]/page.js:187` — DEAD BACKDROP — shared Modal component on lead detail

function Modal({children,maxWidth}) at L187: backdrop z 200, no onClose prop AT ALL — the wrapper cannot close itself; every usage must render its own close button inside. Two more inline modals: L351 (z 300) and L2849 (z 300, rich-text notes), both also without backdrop onClick.

> **Migration:** This local Modal is the natural first replacement target for the Batch C Modal primitive (same shape, add onClose/backdrop/Escape). All three → --z-modal.

### `src/app/leads/[id]/page.js:1252` — Lightbox + toast + popovers — lead detail

Image lightbox: z 9999, closes on backdrop click (L1251). Toast: bottom-right z 10000, role=alert, error/success/info (L1271). Sticky page nav z 50 (L1289). Popovers: z 5 (L1853), z 20 (L1903), z 30 (L1934). Timeline dots z 1 (L2150, L2678 — decorative).

> **Migration:** Lightbox → --z-overlay (1200) or --z-modal; toast → --z-toast; sticky nav → --z-sticky; popovers → --z-dropdown; dots → --z-base/none.

### `src/app/chat/page.js:138` — DEAD BACKDROP — ChannelModal (team chat)

Create-channel modal backdrop z 300, no onClick close (X button only).

> **Migration:** Modal primitive, --z-modal.

### `src/app/chat/page.js:1199` — Thread drawer backdrop z 60 — BELOW fixed NavBar (z 100)

Thread side-drawer backdrop: fixed inset-0 z 60, closes on click. NavBar is fixed z 100 (NavBar.js:400), so the top 60px of the drawer/backdrop is covered by the nav and clicks there hit nav buttons, not the backdrop — a partial inversion. Also: emoji/attach popover z 100 (L111), hover message actions z 10 (L290), mention popover z 30 (L1108).

> **Migration:** Drawer backdrop → --z-overlay (1200, above sticky 1100). Popovers → --z-dropdown.

### `src/app/dashboard/page.js:179` — DEAD BACKDROP — Bulk Upload modal (dashboard)

Backdrop z 200, no onClick close. Also on this page: notifications dropdown z 100 (L536), sticky rows z 30 (L447) and z 40 (L911), toast bottom-right z 999 (L893).

> **Migration:** Modal → --z-modal (+backdrop close); dropdown → --z-dropdown; stickies → --z-sticky; toast → --z-toast via shared primitive.

### `src/app/settings/page.js:77` — Toast — settings (z 9999)

Local Toast component, fixed top-right z 9999, error/success. Covers confirm dialog (1300) — a delete confirm and its own success toast can invert.

> **Migration:** Shared Toast primitive, --z-toast.

### `src/app/knowledge/page.js:39` — Toast — knowledge (z 9999)

Local toast, fixed top:20 right:24 z 9999.

> **Migration:** Shared Toast primitive, --z-toast.

### `src/app/profile/page.js:132` — Toast — profile (z 9999)

Fixed top:80 right:24 z 9999 toast.

> **Migration:** Shared Toast primitive, --z-toast.

### `src/app/clients/page.js:139` — Toast — clients (z 600, bottom-center pill)

Fixed bottom-center pill toast z 600, text-on-inverted styling.

> **Migration:** Shared Toast primitive, --z-toast. Note Batch C must pick ONE toast position — current sprawl: top-right (invoices/settings/team/knowledge/profile), bottom-right (leads-list, leads/[id], dashboard), bottom-center pills (clients/contracts/studio pages).

### `src/app/contracts/page.js:147` — INVERSION FAMILY — contracts toast (z 700) above contracts modals (z 600)

Toast: bottom-center z 700 (L147). Modals: z 600 (L199, L290 — both close on backdrop click). Same raw-number inversion family as invoices: toast numerically beats the modal on the same page.

> **Migration:** Toast → --z-toast, modals → --z-modal.

### `src/app/contracts/[id]/page.js:126` — Contract editor overlay ladder (z 400..600)

Add-block modal z 400 (closes, L126); full-page preview z 500 + exit button z 510 (L151/152); room drawer z 500 (closes, L169); five modals z 600 (L185, L220, L287, L394, L478, L564 — all close on backdrop click); sticky toolbar z 50 (L76, sticky top:58). contracts.css:44 .cs-block-ctl z 5 (local hover controls).

> **Migration:** Preview → --z-overlay; drawers → --z-overlay; modals → --z-modal; sticky toolbar → --z-sticky; block controls local/none.

### `src/app/studio/[id]/page.js:48` — Studio project overlays (z 300/600/700)

Lightbox z 300 (closes, L48); room drawer z 600 (closes, L556); two modals z 700 (close, L611/L692).

> **Migration:** Lightbox → --z-overlay; drawer → --z-overlay; modals → --z-modal.

### `src/app/studio/[id]/cull/page.js:758` — Cull lightbox stack (z 350 shell; internal z 2-4; toast z 4)

Full-screen cull lightbox z 350 (L758); inside it: dock z 2 (L710), loading veil z 3 (L745), TOAST pill z 4 (L750 — position absolute inside the lightbox's own stacking context, so it only ever shows over the lightbox), nav buttons z 2 (L872). Plus a fixed bottom-left hint card z 60 (L439).

> **Migration:** Lightbox shell → --z-overlay; internal absolutes can stay local (inside their own stacking context — no tokens needed); the L750 toast should move to the shared Toast primitive at --z-toast so it survives outside the lightbox; hint card → --z-toast or --z-overlay.

### `src/app/studio/[id]/albums/page.js:101` — Albums NewAlbumModal overlay (z 200) — NOT dead

Shared `overlay` style const z 200; usage at L26 has onClick={onClose} + stopPropagation on the card — closes correctly.

> **Migration:** --z-modal; straightforward Modal-primitive adoption.

### `src/app/studio/trash/page.js:89` — Toast — studio trash (z 600 bottom-center)

Bottom-center pill toast z 600 in ms-ink/ms-paper colors.

> **Migration:** Shared Toast primitive, --z-toast (Studio dialect may keep its palette via tone props).

### `src/app/studio/settings/page.js:171` — Toast — studio settings (z 600)

Identical bottom-center pill toast z 600.

> **Migration:** Shared Toast primitive, --z-toast.

### `src/app/studio/portfolio/page.js:246` — Portfolio preview (z 500/510) + toast (z 600)

Full-screen preview z 500, exit button z 510 (L246/247); bottom-center toast z 600 (L255).

> **Migration:** Preview → --z-overlay; exit button inside preview can stay local; toast → --z-toast.

### `src/app/studio/studio.css:324` — .ms-modal-overlay (z 400) + Studio shell CSS ladder

Studio's own CSS mini-ladder: .ms-shell fixed z 100 (L170) / relative z 100 (L360); dropdown menus z 300 (L205); .ms-modal-overlay z 400 (L324); .ms-cull-canvas z 5 (L506); .ms-ve video editor z 5 (L534); decorative stage/veil/covercard layers z 0-4 (L364-665).

> **Migration:** .ms-shell → --z-sticky; menus → --z-dropdown; .ms-modal-overlay → --z-modal; full-screen canvases (z 5) → --z-base or --z-overlay if they must beat the shell; decorative layers stay local.

### `src/components/NavBar.js:400` — NavBar — fixed top nav (z 100) + dropdowns (z 300) + mobile drawer (z 200/250)

Fixed top bar z 100 (L400); two dropdown menus z 300 (L475, L536); mobile drawer backdrop z 200 (closes on click, L632-633) + drawer panel z 250 (L636).

> **Migration:** Nav bar → --z-sticky (1100); dropdowns → --z-dropdown (1000 — note today dropdowns render ABOVE the nav 300>100, ladder keeps dropdown 1000 < sticky 1100: dropdowns are children of the nav so DOM order still wins; verify visually during migration); drawer backdrop → --z-overlay, panel above it by DOM order.

### `src/components/NavBar.js:721` — INVERSION — Flux upgrade modal at z 9999

Flux upsell modal backdrop z 9999 (closes on click, stopPropagation card L727-728). At 9999 it beats confirm (1300) and all toasts.

> **Migration:** --z-modal (1300).

### `src/app/globals.css:234` — .sidebar — fixed app sidebar (z 100)

Fixed left sidebar 240px z 100.

> **Migration:** --z-sticky (1100), same rung as NavBar.

### `src/components/ContractsStudioShell.js:38` — Contracts Studio shell — sticky header (z 100) + menu (z 300)

Sticky header z 100 (L38); dropdown menu z 300 (L55).

> **Migration:** Header → --z-sticky; menu → --z-dropdown.

### `src/components/AppSwitcher.js:53` — AppSwitcher panel (z 300)

Absolute dropdown panel z 300.

> **Migration:** --z-dropdown.

### `src/components/control/ControlShell.js:89` — Control plane shell — sticky header (z 20) + search dropdown (z 40)

Sticky header z 20 (L89); global-search dropdown z 40 (L95). Control surface has its own low-number scale.

> **Migration:** --z-sticky / --z-dropdown (control pages inherit globals.css, so ladder tokens are available).

### `src/app/control/support/page.js:281` — Control support — modal (z 50, closes) + dropdown (z 10)

Detail modal z 50 with onClick close (L281); autocomplete dropdown z 10 (L311).

> **Migration:** Modal → --z-modal; dropdown → --z-dropdown.

### `src/app/control/reports/page.js:92` — Control reports — new-report modal (z 100, closes)

Backdrop z 100 with onClick close.

> **Migration:** --z-modal.

### `src/components/control/ExportButton.js:34` — Control export dropdown (z 50)

Absolute dropdown z 50.

> **Migration:** --z-dropdown.

### `src/app/control/plans/page.js:44` — Control plans 'toast' — inline text, no overlay

toast() at L19 just sets an inline <span> (L44) — not fixed, no z-index. Listed for completeness of the toast inventory.

> **Migration:** Optional adoption of Toast primitive for consistency; no z-index work needed.

### `src/components/StudioCopilot.js:77` — StudioCopilot FAB + panel (z 380)

Fixed FAB z 380 (L77) and chat panel z 380 (L86). Sits above studio modals (400? no — 380<400 ok) but below nothing tokenized.

> **Migration:** --z-overlay (1200) so modals (1300) and toasts (1400) beat it.

### `src/components/FloatingChat.js:144` — INVERSION — FloatingChat FAB (z 9000) + popover (z 9001)

Fixed FAB z 9000 (L144, L198), notifications popover z 9001 (L163), inner dropdown z 10 (L231). 9000/9001 > confirm's 1300 → its own error alerts (L125/L137) render UNDERNEATH the chat window.

> **Migration:** FAB/panel → --z-overlay (1200); inner dropdown local or --z-dropdown. Fixing this un-buries its confirm alerts even before they become toasts.

### `src/components/AICommandCenter.js:95` — AI Command Center FAB (z 998) + panel (z 999)

Fixed FAB z 998, panel z 999.

> **Migration:** --z-overlay (1200).

### `src/components/SidePanel.js:190` — SidePanel rail (z 850) + flyout (z 851)

Fixed right-edge rail z 850 (L190, L194) and flyout panel z 851 (L209).

> **Migration:** --z-overlay (1200) — must stay below modals/toasts.

### `src/components/ImpersonationBanner.js:40` — Impersonation banner (z 99999) — the ceiling

Fixed bottom banner z 99999 — deliberately above absolutely everything (support/impersonation safety surface).

> **Migration:** --z-banner (1500) — exactly what the top rung exists for; on the ladder it still beats toast (1400) and modal (1300).

### `src/components/PlanLock.js:138` — PlanLock tooltip (z 9999)

Hover tooltip bubble z 9999, pointer-events none (harmless but sprawl). Local z 1 at L189.

> **Migration:** --z-dropdown (1000) is plenty for a hover tooltip anchored in-flow.

### `src/components/TagPicker.js:85` — TagPicker dropdown (z 9999, position fixed)

Fixed-position tag dropdown z 9999 (escapes containers via fixed + measured dropPos). At 9999 it would float above modals and toasts.

> **Migration:** --z-dropdown (1000). If it must appear inside modals, DOM order within the modal handles it.

### `src/components/HuddleModal.js:199` — HuddleModal overlay (z 9998) — closes on backdrop click (risky)

.hd-overlay fixed z 9998, backdrop blur; L150 backdrop onClick={onClose} — one stray click DISCONNECTS a live video huddle. Not dead — the opposite: too alive.

> **Migration:** --z-modal; when adopting the Modal primitive, set backdrop-close=false for live calls (the primitive needs a dismissable={false} option — same need as requireTyped tier).

### `src/components/ScheduleMeetingModal.js:262` — INVERSION — ScheduleMeetingModal overlay (z 9998) buries its own confirm alerts

.sm-overlay fixed z 9998 (closes on backdrop click, L128). All five useConfirm alertOnly dialogs render at --z-modal 1300 — UNDER this overlay. User schedules a meeting → success alert appears invisibly behind the modal.

> **Migration:** --z-modal (1300). This is the second confirmed inversion after invoices and arguably worse (invisible dialog capturing Enter/Escape).

### `src/app/d/[token]/page.js:73` — Public delivery page mini-ladder (z 20..50)

Sticky header z 20 (L73), bottom action bar z 30 (L115), ask-question FAB z 40 (L151), chat panel z 45 (L154), bottom-sheet modal z 50 (closes, L209).

> **Migration:** Public token pages don't load the app shell but do get globals.css — adopt tokens: header --z-sticky, bars/FABs --z-overlay, sheet --z-modal.

### `src/app/g/[token]/page.js:210` — Public gallery mini-ladder (z 20..320)

Sticky toolbar z 20 (L210), selection checkmarks z 2 (L243), submit FAB z 290 (L274), lightbox z 300 (closes, L281), confirm modal z 320 (closes, L320).

> **Migration:** Toolbar --z-sticky; FAB --z-overlay; lightbox --z-overlay; modal --z-modal.

### `src/app/shop/[token]/page.js:80` — Public shop bottom bar (z 30)

Fixed bottom checkout bar z 30.

> **Migration:** --z-overlay or --z-sticky.

### `src/app/reports/page.js:265` — Reports — sticky tabs (z 40) + filter dropdown (z 60)

Sticky sub-nav z 40 (L265, sticky top:60 under NavBar z100); filter popover z 60 (L289).

> **Migration:** Sticky → --z-sticky; popover → --z-dropdown.

### `src/app/folio/portfolio.css:63` — Public portfolio — .pf-lightbox (z 9999) + film-grain veil (z 50)

Lightbox z 9999 (L63); .pf-theme-film grain overlay fixed z 50 pointer-events none (L110); hero decorative layers z 0-3 (L21-30, L106).

> **Migration:** Lightbox → --z-modal or --z-overlay; grain veil can stay raw (decorative, pointer-events none); hero layers local.

### `src/app/page.js:2354` — Landing page decorative stack (out of Core scope)

Landing header fixed z 50 (L2354); background veils z 0/1 (L2335, L2350, L858-866); flux slide fans z 1-3 (L905-907), tags z 5 (L912), float chips z 10 (L927); feature/how cards z 1-2 (L2476-3110, L3297); footer z 1 (L3445). login/signup pages: decorative relative z 1 (login L310/325/389, signup L349/364/428). studio/[id]/video/page.js L88/L121 z 1-2 local badges.

> **Migration:** All decorative local stacking within self-contained sections — NO ladder tokens needed; leave as-is in Batch C (landing has its own lp-* dialect). Listed so the sweep is provably exhaustive: these account for every remaining z-index hit.

