# WappFlow — agent operating rules (repo root)

**Before touching the code, read the Canon.** Three documents govern every change here, permanently:
the [Engineering Constitution](ENGINEERING-CONSTITUTION.md) (*how* we build), the
[Product Bible](PRODUCT-BIBLE.md) (*what* & *why*), and the [ADRs](adr/) (immutable decision history).
Companion: the [Product Audit](PRODUCT-AUDIT.md) (current state + roadmap).

## The non-negotiables

1. **Proposal before implementation** (Constitution Article 0). For any *significant* change — new
   DB schema/column, API contract, shared component, cross-module workflow, or auth/permission/
   billing path — first write a proposal from [`proposals/_TEMPLATE.md`](proposals/_TEMPLATE.md) and
   get it approved. Big/ambiguous direction? Start with an [RFC](rfc/). Architectural decision? Record
   an [ADR](adr/). Trivial localized fixes are exempt but still obey every other rule.
2. **Priority order:** Security → Data Integrity → Consistency → Performance → Workflow Integration
   → UX → Delight → New Features. New features are last.
3. **Golden Rule + Rule of Three:** never build a second implementation if one exists (Refactor →
   Unify → Extend → Reuse → Delete). When a pattern appears a third time, extract it.
4. **One question gates everything:** *does this make WappFlow feel more like one operating system?*
   If no, don't build it.
5. **The Foundation Sprint (formerly "Phase 0") criticals are merge blockers** (security, workspace
   isolation, payment/billing integrity, broken routes/workflows, duplicate engines/schemas, data
   integrity). See [`proposals/PROP-001`](proposals/PROP-001-phase-0-truth-and-integrity.md).
6. **Deprecate, don't nuke:** replacements follow Deprecated → Migration → Removal → Cleanup
   (Article 11). Only *provably-dead* code may be removed directly, with evidence.
7. **Feature Complete, not just functional:** a user-facing feature isn't finished until it has (where
   applicable) permissions, audit, notifications, search/palette registration, timeline, analytics,
   empty/loading/error states, responsive, a11y, docs, and tests.

## Standing constraints

Additive · data-driven · backward-compatible · no rewrites · respect plan-flags/entitlements &
founder overrides · **never touch the WhatsApp message flow** · secrets stay in server `.env`.

## Stack-specific rules

- **Frontend** (`wappflow-web/`): Next.js with breaking changes vs. training data — see
  [`wappflow-web/AGENTS.md`](wappflow-web/AGENTS.md). Verify via `next build`, not assumptions.
- **Backend** (`backend/`): Express + better-sqlite3 monolith (`server.js`) with additive modules
  mounted via `require('./module')(app, db, {deps})`. SSE frames are **unnamed** — consume via
  `es.onmessage` + `switch (data.type)`, never named `addEventListener`.
- **Desktop** (`wappflow-desktop/`): Electron shell wrapping cloud modules + the local AI engine.

## Definition of Done

Every change answers "yes" to the 10 questions in the Constitution's *Definition of Done*. If any is
"no," refactor before merging.
