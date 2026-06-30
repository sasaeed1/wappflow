# WappFlow Product Bible

> **The canonical statement of what WappFlow *is*.** One of the three documents every contributor —
> human or AI — reads before touching the code (with the [Engineering Constitution](ENGINEERING-CONSTITUTION.md)
> and the [ADRs](adr/)). The Constitution governs *how* we build; this governs *what* we're building
> and *why*. It **evolves intentionally** — changes are deliberate, not incidental.

## The one-sentence product
WappFlow is the **Creative Business Operating System**: one place where a photo/video studio runs its
entire business — finding clients, signing them, scheduling shoots, culling and delivering media,
getting paid, and keeping every conversation and record connected to the customer.

## What we are becoming (and what we are not)
We are **not** competing on feature count. We are becoming the platform a studio **never wants to
leave** because everything is in one place, consistent, fast, and connected. The north-star test for
every decision:

> **Does this make WappFlow feel more like one operating system?** If no, we don't build it.

## Product principles
1. **One product, not a suite.** CRM, Studio, Contracts, Booking, Comms, Portal, Command Center, and
   Desktop are *rooms in one house*, not separate apps sharing a login.
2. **The Contact is the heart.** Every object connects back to the customer relationship. No module
   is an island; no record is a dead end.
3. **Control-first intelligence.** AI advises, scores, and drafts — it never silently mutates the
   user's work (cull selections, galleries, ledgers). The human stays in control.
4. **Effortless over feature-rich.** The win is making an *existing* workflow take fewer clicks, not
   adding a new surface.
5. **Trust is a feature.** Security, workspace isolation, money-rail correctness, and data integrity
   come before polish — always (see Constitution priority order).
6. **Premium feel.** It should feel fast, predictable, consistent, and professional — powerful
   without feeling complicated.

## The modules (the rooms of the house)
| Module | What it does |
|---|---|
| **CRM** | Leads & pipeline → clients; conversations, follow-up, the customer record. |
| **Media Studio** | Projects → upload → AI-assisted cull → edit/auto-edit → deliver. Photo + video/reel. |
| **Galleries / Portfolio** | Client-facing delivery galleries, album proofing, public portfolio. |
| **Contracts Studio** | Template → draft → send (WhatsApp + email) → e-sign → vault. |
| **Booking** | Public booking page → scheduling → manage/reschedule. |
| **Invoices / Payments / Store** | Invoice → pay; print store; one money ledger as the source of truth. |
| **Client Portal** | The unified, branded client-side experience across gallery/store/pay/booking. |
| **Communications** | Team chat, threads, presence, calls/huddles; context-linked to records. |
| **Command Center** | Internal platform control plane (health, customers, flags, audit, support). |
| **Desktop + Local AI** | Electron shell wrapping the cloud modules + an on-device ONNX AI engine. |

## The signature workflow (must feel like one continuous flow)
> Lead → Conversation → Contract → Booking → Project → Media → Gallery → Album → Invoice → Payment →
> Client Portal → Timeline → Analytics → Communications

No dead ends. No manual re-entry. No duplicated work. The **Universal Relationship Graph** — every
entity exposing its relationships with one-click navigation — is the product's intended signature
capability and the literal embodiment of "contact-centric."

## How we measure progress
Not by features shipped. By:
- **Bugs eliminated** · **Duplication removed** · **Workflows simplified** ·
  **Performance improved** · **User friction reduced** · **Product consistency increased**.

This is the progress that compounds — it's what turns a powerful product into one people genuinely
enjoy using.

## The canonical sources of truth
- **This Bible** — what & why (evolves intentionally).
- **[Engineering Constitution](ENGINEERING-CONSTITUTION.md)** — how we build (changes rarely).
- **[ADRs](adr/)** — the immutable record of architectural decisions.
- **[PRODUCT-AUDIT.md](PRODUCT-AUDIT.md)** — the current-state assessment + maturity roadmap (a snapshot).
- **[WAPPFLOW-FEATURE-SPEC.md](WAPPFLOW-FEATURE-SPEC.md)** — the exhaustive feature/route/table inventory.
