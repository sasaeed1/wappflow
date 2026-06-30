# ADR-0002: Modular monolith (Express + better-sqlite3) over microservices

- **Status:** Accepted
- **Date:** 2026-05 (backfilled 2026-07-01)
- **Deciders:** sasaeed1
- **Related:** `backend/server.js` (the spine) + additive module files

## Context
WappFlow is built and maintained by a very small team (effectively solo) and iterates fast across
many surfaces — CRM, Media Studio, Contracts, Booking, Invoices, Communications, Command Center.
The product needs strong cross-module data relationships (a contact ties to leads, contracts,
bookings, galleries, invoices, payments) and is deployed to a single server. The architecture had to
optimize for development velocity, transactional simplicity, and low operational overhead — not for
independent team ownership or web-scale horizontal scaling (which we do not have).

## Decision
We will build a **modular monolith**: a single Express process backed by **one better-sqlite3
database**. `backend/server.js` is the spine (auth, leads, clients, core routes, shared helpers), and
each product area is an **additive module** mounted with a uniform contract:

```js
require('./media-studio')(app, db, { auth, generateId, broadcastToWorkspace, ... })
require('./contracts-studio')(app, db, { ... })
require('./command-center')(app, db, { ... })
```

Modules receive the shared `app`, the shared `db`, and an explicit dependency bag (auth middleware,
id generator, SSE broadcaster, audit logger, etc.). They register their own routes/tables but share
one process, one connection, and one transaction domain. Real-time is one SSE stream of **unnamed**
frames consumed via `es.onmessage` + `switch(data.type)`.

## Alternatives considered
- **Microservices** — independent deploy/scale, but massive operational overhead (network, service
  discovery, distributed transactions, multiple datastores) for a solo maintainer, and it would
  fracture exactly the cross-module relationships that are WappFlow's value. Rejected.
- **Serverless functions** — fine for stateless bursts, but a poor fit for `whatsapp-web.js`
  long-lived sessions, SSE streams, and synchronous better-sqlite3. Rejected.
- **Separate database per module** — would lose single-transaction integrity and force a join/ETL
  layer for the contact-centric model. Rejected in favor of one DB.

## Consequences
- **Positive:** one deploy (pm2 + `git pull` + build), one DB to back up, cross-module queries and
  transactions are trivial, a new module is one `require(...)(app, db, deps)` line, and synchronous
  better-sqlite3 keeps handlers simple. Velocity is high.
- **Negative / trade-offs:** **`server.js` trends toward a god-file** (~5k lines — flagged in
  `PRODUCT-AUDIT.md`); no independent per-module scaling; one process is a single failure domain;
  module boundaries are convention, not enforced, so discipline (the dependency bag, no reaching into
  another module's tables) must be maintained by review. A heavy synchronous query blocks the event
  loop — long work belongs in the worker/queue, not a request handler.
- **Neutral:** the uniform mount contract keeps modules swappable and testable in isolation; if a
  single area ever needs to scale out, its module is already a seam that could be extracted — but we
  will not pay that cost until a real bottleneck demands it.

## References
- `backend/server.js` (module mounts ~L5467–5594; shared helpers `auth`, `generateId`,
  `broadcastToWorkspace`, `logAudit`, `addContactHistory`)
- Modules: `media-studio.js`, `contracts-studio.js`, `booking.js`, `comms.js`, `command-center.js`,
  `payments.js`, `reel-engine.js`, `brains.js`, `sync.js`, …
- Related decision: ADR-0001 (storage) keeps the monolith closer to stateless.
