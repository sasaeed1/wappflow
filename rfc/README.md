# RFCs (Requests for Comment)

An **RFC** explores a *direction* for a big or ambiguous feature **before** an implementation design
exists. It's the lightweight "should we, and roughly how?" step — useful for brainstorming and
alignment before the heavier Proposal.

## When to write one
- The work is large, ambiguous, or has several plausible approaches.
- A decision will be hard to reverse.
- You want to align on direction before investing in a full Proposal.

Small or obvious work skips straight to a Proposal (or, if trivial, neither — see Constitution
Article 0).

## The governance flow
```
RFC  (direction — optional, for big/ambiguous work)
  ↓
Proposal  (implementation design — Constitution Article 0, required before significant code)
  ↓
Implementation  →  Verification  →  Deployment
  ↓
ADR  (records the decision, immutable)
```

- **RFC** = "what direction?" — `/rfc`, use [`_TEMPLATE.md`](_TEMPLATE.md).
- **Proposal** = "exact design to build?" — `/proposals`.
- **ADR** = "what did we decide and why?" — `/adr` (immutable history).

## Index
_(none yet — the first RFC will land here.)_
