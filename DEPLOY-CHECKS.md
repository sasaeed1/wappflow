# Deferred live checks — run after the server migration

Everything below is verified by harness and (where noted) by an end-to-end run against a
**freshly created local database**. None of it has been exercised against the real
production database, real WhatsApp sessions, or real traffic. This file is the list of
things to actually look at once the migrated server is up.

Branches involved: `phase-3/safety-net` (backend) and `proposal/prop-003-one-shell` (frontend).
Deploy the backend first — it carries the security fixes, and every frontend dependency on
it is gated on a 404 so the UI degrades rather than breaks.

## 1. The private-channel membership backfill (highest risk)

Runs once on boot, after the comms module mounts. For every private channel with no
`chat_members` rows it inserts the creator plus everyone who has actually posted there.

- Look for the boot log line: `✅ Backfilled membership for N legacy private channel(s)`.
- **Before deploying**, snapshot the table: `SELECT id, is_private, created_by FROM chat_channels WHERE is_private = 1;`
- After: confirm every private channel someone was genuinely using still appears in that
  person's sidebar. The failure mode to watch for is a channel *disappearing* for someone
  who had access — meaning they never posted and were not the creator.
- Recovery if that happens: insert the missing `chat_members` row directly. Nothing is deleted
  by this migration, so it is additive and reversible.

## 2. Chat authorization (was cross-tenant)

- A user of workspace A must get **404** from `GET /api/chat/channels/:id/messages` for a
  channel in workspace B, and the same for POST.
- Private channels must not appear in `GET /api/chat/channels` for non-members.
- Participants must still read and post normally.

## 3. Real-time, on real traffic

- Exactly **one** `/api/events` connection per tab (check the network panel), surviving
  navigation between modules.
- An inbound WhatsApp message should now move a **teammate's** dashboard, not just the owner's.
- WhatsApp status transitions (`qr_ready` → `connected` → `disconnected`) should update the
  WhatsApp page immediately rather than up to 2s later. This one is worth watching closely:
  the status accessor fires on every transition, and only a real device produces the full
  sequence.
- Instagram / Facebook / website-form leads should now appear live (they never did — the
  frames were written to a map keyed by the wrong id).

## 4. Notifications

- A payment marked paid, a contract viewed/declined, a booking rescheduled/cancelled, and a
  finished or failed media render should each produce a bell entry.
- An @mention should reach the mentioned person's bell and **not** the sender's.
- The Communications badge should reflect unread team messages and clear on read.
- Note the deliberate rule: a DM badges immediately; a public channel starts counting only
  once you have opened it.

## 5. Universal search / Ctrl+K

- Ctrl+K in every module, including Studio and Contracts.
- Results must never cross tenants; a member without `view_all_leads` must see only their own leads.
- Typing a literal `%` or `_` must behave as a search, not a wildcard.
- Performance is the open question: search is LIKE-based with no full-text index. Fine at
  single-workspace scale in testing, unverified against a large real workspace. If it is slow,
  the fix is FTS5, not more indexes.

## 6. Things a fresh DB cannot tell us

- Query plans on real row counts (the Phase 4 indexes were verified with EXPLAIN QUERY PLAN
  against fixtures, not production volumes).
- Whether any long-lived workspace has data shapes the new code does not expect — especially
  older invoices/contracts predating the soft-delete columns.
