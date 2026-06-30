# Technical Proposal — <title>

> Required by [Engineering Constitution](../ENGINEERING-CONSTITUTION.md) Article 0 **before** any
> significant feature or architectural change. Fill every section. Keep it brief but complete.
> Status: `draft` → `in-review` → `approved` → `implemented`. Do not write code until `approved`.

- **Proposal ID / date:** PROP-NNN · YYYY-MM-DD
- **Author:** 
- **Status:** draft
- **Audit findings addressed:** (PRODUCT-AUDIT.md finding IDs, e.g. `platform-3`, `invoices-store-7`)
- **Roadmap phase:** (PRODUCT-AUDIT.md §8)
- **Priority-order rank:** (Security / Data Integrity / Consistency / Performance / Workflow / UX / Delight / Feature)

---

## 1. Problem
What's broken or missing, and the user/business impact. Cite file:line evidence.

## 2. Proposed solution
The approach, in enough detail to evaluate. Why this over alternatives considered.

## 3. Golden-Rule check (does this already exist?)
What existing component/service/route/table this reuses, refactors, unifies, or extends.
**If a second implementation is being proposed, justify why unification is not possible.**

## 4. Affected modules
Which of CRM · Studio · Contracts · Booking · Comms · Client Portal · Desktop · Command Center · Platform.

## 5. Database changes
New/changed tables & columns, indexes, and the **migration strategy** (forward + how existing rows are handled). Note workspace-scoping.

## 6. APIs
New/changed routes: method, path, request, response shape, errors, pagination. Confirm common response/error conventions.

## 7. UI impact
Screens touched, new states (empty/loading/error/success), and which **design-system primitives** are used (no hand-rolled UI).

## 8. Platform-standards compliance (Article 7)
Which standards apply and how this satisfies them: Search · Command Palette · Notifications · Timeline · Audit · Permissions · Analytics · Saved Views · Bulk Actions · Drafts · Undo · Recycle Bin · Shortcuts · Responsive · A11y · Localization · Feature Flags · Plan Enforcement · Desktop Sync · Offline · API Consistency · Error Handling.

## 9. Workflow integration
Where this sits in Lead→…→Analytics, what it links to upstream/downstream, and that it adds no dead ends or manual jumps. Contact-centric.

## 10. Backward compatibility
What must not break. Existing data, existing clients, feature flags, grandfathered workspaces.

## 11. Risks & mitigations
Security, data-loss, performance, and rollout risks — each with a mitigation.

## 12. Rollout plan
Flag/gate, staged enablement, verification steps, and rollback.

---

## Definition of Done check
- [ ] 1. No duplication (or unification justified)
- [ ] 2. Reuses existing architecture
- [ ] 3. Improves platform cohesion
- [ ] 4. Complies with platform standards
- [ ] 5. Discoverable
- [ ] 6. Performant
- [ ] 7. Accessible
- [ ] 8. Responsive
- [ ] 9. Integrates naturally with workflows
- [ ] 10. Maintainable
