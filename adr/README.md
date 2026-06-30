# Architecture Decision Records (ADRs)

**ADRs are immutable history** — the record of *why* WappFlow is built the way it is. Every major
architectural decision gets one. In a year, this folder is how a contributor (human or AI)
understands the system without re-deriving it.

## Rules
- One decision per file: `ADR-NNNN-short-title.md` (zero-padded, sequential). Use [`_TEMPLATE.md`](_TEMPLATE.md).
- **Never edit an Accepted ADR.** If the decision changes, write a new ADR that supersedes it and set
  the old one's status to `Superseded by ADR-XXXX`.
- An ADR is required for: choosing/replacing a major dependency or service, a data-model or storage
  strategy, an auth/permission/billing model, a cross-cutting pattern (SSE, entitlements-as-data,
  the design system), or anything a future contributor would otherwise ask "why on earth…?" about.

## How ADRs relate to the other governance docs
- **RFC** (`/rfc`) — explores a *direction* for a big/ambiguous feature. Lightweight, pre-decision.
- **Proposal** (`/proposals`, Constitution Article 0) — the *implementation design* for approved work.
- **ADR** (here) — records the *decision* once made. An RFC or Proposal that settles an architectural
  question should produce an ADR.

## Index
| ADR | Title | Status |
|---|---|---|
| [0001](ADR-0001-object-storage-cloudflare-r2.md) | Object storage on Cloudflare R2 behind a provider abstraction | Accepted |
| [0002](ADR-0002-modular-monolith.md) | Modular monolith (Express + better-sqlite3) over microservices | Accepted |

## Backfill backlog (decisions worth recording — write as time allows)
- better-sqlite3 (synchronous, single-file) as the database
- Next.js App Router (with breaking changes vs training data) for the web app
- Real-time over **unnamed** SSE frames (`es.onmessage` + `switch(data.type)`)
- Entitlements/pricing as config-as-data (single resolver) rather than hard-coded plans
- Control-first AI (advisory scores, analyze-once, never mutates user data)
- Self-hosted LiveKit on Hetzner for video, public-Jitsi for comms huddles
- Electron desktop shell wrapping cloud modules + a local ONNX AI engine
- WhatsApp as a first-class channel via `whatsapp-web.js` instances (the untouchable message flow)
