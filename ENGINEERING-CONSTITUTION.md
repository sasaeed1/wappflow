# WappFlow Engineering Constitution

> **Status: permanent, binding.** Ratified 2026-07-01. This document — together with
> [`PRODUCT-AUDIT.md`](PRODUCT-AUDIT.md) — is the source of truth for how WappFlow is built.
> It governs every contributor and every AI agent working in this repository, in every session.
> It is not a feature request; it is the operating model. When a request and this Constitution
> conflict, surface the conflict before proceeding.

---

## The Mission

WappFlow is **no longer** trying to be the platform with the most features. It is becoming the most
**cohesive, polished, and intelligent Creative Business Operating System.**

Every decision must answer one question:

> **Does this make WappFlow feel more like one operating system?**

If the answer is no, do not build it.

By the end of this phase WappFlow should not feel like a CRM, a gallery platform, a contracts tool,
a booking system, and a chat app sharing a login. It should feel like **one deeply integrated OS.**

---

## Article 0 — Proposal Before Implementation (non-negotiable)

**Before implementing any significant feature or architectural change, first produce a brief
technical proposal** (use [`proposals/_TEMPLATE.md`](proposals/_TEMPLATE.md)) covering:

problem · proposed solution · affected modules · database changes · APIs · UI impact ·
migration strategy · backward compatibility · risks · rollout plan.

**Only begin implementation after that proposal has been validated against the existing
architecture and the Product Audit, and approved.** This single rule keeps development disciplined
and prevents drift back into the feature race.

"Significant" = anything that adds/changes a DB schema, an API contract, a shared component, a
cross-module workflow, an auth/permission/billing path, or more than a localized edit. Trivial,
localized fixes do not need a proposal — but they still obey every other Article.

**The governance flow** (heavier as reversibility drops):
`RFC` (explore a direction for big/ambiguous work — [`/rfc`](rfc/), optional) →
`Proposal` (implementation design — [`/proposals`](proposals/), required before significant code) →
Implementation → Verification → Deployment →
`ADR` (record the decision, immutable — [`/adr`](adr/)).
Any proposal or RFC that settles an architectural question **must produce an ADR.**

---

## Article 1 — Role

You operate as **Principal Software Engineer + Senior Product Architect + UX Architect +
Platform Architect + Performance Engineer** — not a ticket-taker. Every implementation is judged on
UX, architecture, maintainability, scalability, consistency, and product cohesion — not merely
whether it functions.

---

## Article 2 — The Priority Order

Every task is ranked by this order. A lower priority never justifies regressing a higher one.

1. **Security**
2. **Data Integrity**
3. **Platform Consistency**
4. **Performance**
5. **Workflow Integration**
6. **User Experience**
7. **Product Delight**
8. **New Features** ← always last

---

## Article 3 — The Golden Rule

**Never create a second implementation if one already exists.** Always prefer, in order:
**Refactor → Unify → Extend → Reuse → Delete duplication.**

The audit found 3 reel engines, 2 album editors, 2 schedulers, 2 invoice templates, multiple AI
FABs, 4 app shells, and a doubly-declared `ms_albums` schema. No new parallel subsystems. Ever.

### The Rule of Three

**If the same pattern appears three times, stop and extract it.** Two occurrences may be coincidence;
the third is a pattern asking to become a primitive. This is the concrete threshold that triggers the
Golden Rule — abstraction without over-engineering.

- Three near-identical dialogs → one reusable Dialog.
- Three upload flows → one upload service.
- Three timeline implementations → one Timeline.
- Three card layouts → one Card.

The corollary: don't abstract on the *first* occurrence either. Build it inline, build it again, and
when the third appears, unify all three.

---

## Article 4 — The Foundation Sprint is a Blocker

The first phase of the maturity roadmap is the **Foundation Sprint** (formerly "Phase 0"). The name
is deliberate: this is not bug-fixing cleanup, it is *strengthening the platform* — an investment.

Resolve **all critical findings** from the Product Audit before adding functionality. Treat these
as merge blockers: security issues, authentication, authorization, **workspace isolation**, payment
& billing integrity, broken routes, broken workflows, duplicate engines, duplicate schemas, and
data integrity. Nothing in Priority 5–8 ships while a Foundation-Sprint blocker is open. (Tracked in
[`proposals/PROP-001`](proposals/PROP-001-phase-0-truth-and-integrity.md).)

---

## Article 5 — One Platform

CRM · Studio · Contracts · Booking · Communications · Client Portal · Desktop · Command Center must
behave like **one** operating system. No visual fragmentation. No workflow fragmentation. No
architectural fragmentation.

**Navigation:** one app shell — one navigation, sidebar, header, footer, breadcrumb system.

---

## Article 6 — One Design System

Every UI element comes from **one** reusable design-system layer. Never hand-build duplicate UI.
Canonical primitives are required for: Buttons, Inputs, Selects, Checkboxes, Radio Groups, Tables,
Badges, Status Chips, Cards, Dialogs, Drawers, Dropdowns, Tabs, Accordions, Tooltips, Popovers,
Date Pickers, Pagination, Forms, Skeletons, Empty/Loading/Error/Success states, Confirmation
Dialogs, Context/Right-click Menus, Toasts, Progress Indicators, Upload components, Avatars — and
everything else. No exceptions. All tokens (color, spacing, radius, type) come from one source.

---

## Article 7 — Platform Standards

Every feature, page, and module supports these **where applicable**:

- **Search** — every module registers searchable entities; everything is findable.
- **Command Palette** — every module registers actions; `Ctrl+K` is universal.
- **Notifications** — one infrastructure (browser, desktop, email, realtime, future mobile).
- **Timeline** — one infrastructure; every module contributes events. No separate timelines.
- **Audit** — every mutation auditable: who, when, old value, new value, IP, device, reason.
- **Permissions** — every action respects workspace permissions. No bypasses.
- **Analytics** — every module exposes analytics.
- **Saved Views** — every list supports saved / shared / personal views.
- **Bulk Actions** — every list supports select / edit / assign / archive / export / delete where appropriate.
- **Draft Recovery** — every editor autosaves.
- **Undo** — every destructive action supports undo where technically feasible.
- **Recycle Bin** — deleted records recoverable; retention configurable.
- **Keyboard Shortcuts** — power-user experience.
- **Responsive Design** — every screen.
- **Accessibility** — keyboard nav, screen readers, focus states, ARIA, color contrast.
- **Localization** — never hardcode display strings.
- **Feature Flags** — everything feature-gated.
- **Plan Enforcement** — everything respects workspace entitlements.
- **Workspace Overrides** — founder overrides always respected.
- **Desktop Sync** — desktop-aware features synchronize correctly.
- **Offline Support** — where appropriate.
- **API Consistency** — common response shapes, error handling, pagination.
- **Error Handling** — graceful, consistent, helpful.

---

## Article 8 — Workflow Integration & Contact-Centric Architecture

Every module connects naturally — **no dead ends, no manual jumps, no duplicated work**:

> Lead → Conversation → Contract → Booking → Project → Media → Gallery → Album → Invoice →
> Payment → Client Portal → Timeline → Analytics → Communications

**The Contact is the heart of WappFlow.** Everything connects back to the customer relationship, not
to an isolated module. Every entity exposes its relationships (the future Universal Relationship
Graph: interactive graph, relationship explorer, one-click navigation).

---

## Article 9 — Performance & Code Quality

**Performance** (optimize before adding complexity): DB indexes, large tables, pagination,
virtualization, bundle size, client rendering, caching, background jobs, realtime subscriptions,
memory, query efficiency.

**Code quality:** reuse components / services / hooks; extract common logic; delete obsolete code;
reduce duplication; composition over inheritance; **no "god" pages or "god" components.**

---

## Article 10 — Product Delight

Beyond architecture, the product should feel **premium**: animations, transitions, hover states,
micro-interactions, skeleton loaders, empty states, context/right-click menus, drag-and-drop, the
upload experience, image previews, success moments, meaningful onboarding — subtle polish throughout.

---

## Article 11 — Deprecation Policy

When you replace something, **do not delete it immediately.** Every retirement follows a lifecycle:

> **Deprecated → Migration → Removal → Cleanup**

1. **Deprecated** — mark the old path clearly (comment/annotation, and a log/console warning if it's
   a runtime path). Point to the replacement. Stop using it in new code.
2. **Migration** — move existing callers/data to the replacement. The old and new coexist during this
   window; nothing breaks.
3. **Removal** — once no caller remains, delete the old implementation (recoverable from git history).
4. **Cleanup** — remove now-dead styles, tables/columns, flags, and references; record the change.

**Exception:** code that is *provably dead* — never imported, never mounted, never shipped (e.g. a
component referenced from nowhere) — may be removed directly, **with evidence of non-use** in the
proposal. The lifecycle protects things users or code depend on; it doesn't protect phantom code.

---

## The Definition of Done — every change must answer "yes"

1. Does this **avoid duplicating** existing functionality? (else Refactor/Unify/Extend/Reuse)
2. Does it **reuse** existing architecture where possible?
3. Does it **improve platform cohesion**?
4. Does it **comply with platform standards** (Article 7)?
5. Is it **discoverable**?
6. Is it **performant**?
7. Is it **accessible**?
8. Is it **responsive**?
9. Does it **integrate naturally** with existing workflows?
10. Is it **maintainable**?

If any answer is "no," refactor before merging.

---

## The Definition of Complete — when is a *feature* finished?

"Done" is per-change. **"Complete" is per-feature** — and a feature is not complete just because it
functions. A feature is **Feature Complete** only when it has, *where applicable*:

Permissions · Audit · Notifications · Search registration · Command-Palette registration · Timeline
integration · Analytics · Keyboard shortcuts · Bulk actions · Mobile responsiveness · Accessibility ·
Empty state · Loading state · Error state · Documentation · Tests.

This list is what prevents "80%-finished" features that look done in a demo but are second-class
citizens of the platform. "Where applicable" is a judgment call to justify in the proposal — not an
excuse to skip the list. A feature ships to users only when it is Feature Complete (or its gaps are
explicitly accepted and tracked).

---

## How we measure progress

Not by features shipped. By:

**Bugs eliminated · Duplication removed · Workflows simplified · Performance improved · User friction
reduced · Product consistency increased.**

This is the progress that compounds — it's what turns a powerful product into one people genuinely
enjoy using.

---

## The Canon — read before touching the code

Three documents are the canon every contributor (human or AI) reads first:

1. **[Engineering Constitution](ENGINEERING-CONSTITUTION.md)** (this doc) — *how* we build. Changes rarely.
2. **[Product Bible](PRODUCT-BIBLE.md)** — *what* we're building and *why*. Evolves intentionally.
3. **[ADRs](adr/)** — the immutable record of *which decisions* we made and why.

Companion (non-canon, living): the [Product Audit](PRODUCT-AUDIT.md) (current-state snapshot +
roadmap) and the [Feature Spec](WAPPFLOW-FEATURE-SPEC.md) (inventory).

---

## Standing constraints (carried forward)

Additive · data-driven · backward-compatible · no rewrites · respect plan-flags & entitlements ·
respect founder/workspace overrides · **never touch the WhatsApp message flow** · R2 secrets stay
in server `.env` (never in git or memory).

---

## Roadmap pointer

The sequenced plan lives in [`PRODUCT-AUDIT.md`](PRODUCT-AUDIT.md) §8 (11 phases, foundations
first). Named high-priority work — Universal Search, Command Palette, Global Notification Center,
Universal Timeline, Health Dashboard, Saved Views, Bulk Actions, Draft Recovery, Undo, Recycle Bin,
Activity Feed, Audit Center, Keyboard Shortcuts, Feature Discovery, Lead Follow-up, Duplicate
Detection, Gallery Expiry, Studio/Creator/Video Intelligence, Command Center Intelligence,
Universal Relationship Graph — lands as **thin layers over the shared foundations**, never as new
bespoke subsystems.
