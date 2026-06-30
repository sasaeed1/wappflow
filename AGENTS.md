# WappFlow — agent operating rules (repo root)

**Before doing anything, you are bound by the [Engineering Constitution](ENGINEERING-CONSTITUTION.md).**
It is permanent and governs every change in this repository. The [Product Audit](PRODUCT-AUDIT.md)
is the companion source of truth for current state and the maturity roadmap.

## The five things you must not forget

1. **Proposal before implementation** (Constitution Article 0). For any *significant* change — new
   DB schema/column, API contract, shared component, cross-module workflow, or auth/permission/
   billing path — first write a proposal from [`proposals/_TEMPLATE.md`](proposals/_TEMPLATE.md) and
   get it approved. Trivial localized fixes are exempt but still obey every other rule.
2. **Priority order:** Security → Data Integrity → Consistency → Performance → Workflow Integration
   → UX → Delight → New Features. New features are last.
3. **Golden Rule:** never build a second implementation if one exists. Refactor → Unify → Extend →
   Reuse → Delete duplication.
4. **One question gates everything:** *does this make WappFlow feel more like one operating system?*
   If no, don't build it.
5. **Phase 0 critical findings are merge blockers** (security, workspace isolation, payment/billing
   integrity, broken routes/workflows, duplicate engines/schemas, data integrity).

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
