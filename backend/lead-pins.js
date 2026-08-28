'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Pinned leads — the handful you are actually working right now.
//
//  A list sorted by last activity is honest but not personal: the lead you are
//  mid-negotiation with sinks the moment three other people message you. Pinning
//  floats it back to the top and keeps it there.
//
//  DESIGN DECISIONS, stated:
//    • Scope is (workspace, user, lead) — pins are PERSONAL, like saved views.
//      Two people working the same workspace pin different leads; one person's
//      working set is not an announcement to the team.
//    • Server-side, not localStorage. A pin is a statement about your work, and
//      it should survive a cleared cache and follow you to your phone — which is
//      the whole point of pinning something.
//    • NO server-side cap. The owner asked for unlimited pins with a warning
//      about clutter past three, which is a UI nudge, not a rule. A server that
//      silently refused the fourth pin would be a different feature, and a
//      cap enforced here could not be undone without a migration.
//    • The lead is verified to belong to the workspace before it can be pinned.
//      Without that check a guessed lead id from another tenant would be
//      accepted and then leak that lead's name back through the pinned list.
// ════════════════════════════════════════════════════════════════════════════

// Past this many, the LIST warns about clutter. Exported so the frontend and the
// test read the same number instead of each hardcoding a 3 that can drift.
const CLUTTER_WARN_AFTER = 3;

function installSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lead_pins (
      workspace_id TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      lead_id      TEXT NOT NULL,
      created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (workspace_id, user_id, lead_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lead_pins_scope ON lead_pins (workspace_id, user_id);
  `);
}

const bad = (msg, status = 400) => { const e = new Error(msg); e.status = status; return e; };

/** The ids this user has pinned in this workspace. Newest pin first. */
function listPins(db, { workspaceId, userId }) {
  return db.prepare(
    `SELECT lead_id FROM lead_pins
      WHERE workspace_id = ? AND user_id = ?
      ORDER BY created_at DESC`
  ).all(workspaceId, userId).map((r) => r.lead_id);
}

function pin(db, { workspaceId, userId, leadId }) {
  const id = String(leadId || '').trim();
  if (!id) throw bad('leadId required');
  // Tenancy check BEFORE the write. The pinned list is read back joined against
  // leads, so accepting a foreign id here would leak that lead into this
  // workspace's UI.
  const owned = db.prepare('SELECT id FROM leads WHERE id = ? AND workspace_id = ?').get(id, workspaceId);
  if (!owned) throw bad('lead not found', 404);
  db.prepare(
    `INSERT INTO lead_pins (workspace_id, user_id, lead_id) VALUES (?, ?, ?)
     ON CONFLICT (workspace_id, user_id, lead_id) DO NOTHING`
  ).run(workspaceId, userId, id);
  return listPins(db, { workspaceId, userId });
}

function unpin(db, { workspaceId, userId, leadId }) {
  // Scoped to owner: the WHERE clause is the authorization. One user can never
  // unpin another user's lead, even with a guessed id.
  db.prepare(
    'DELETE FROM lead_pins WHERE workspace_id = ? AND user_id = ? AND lead_id = ?'
  ).run(workspaceId, userId, String(leadId || ''));
  return listPins(db, { workspaceId, userId });
}

/** Housekeeping: a deleted lead must not leave a pin pointing at nothing. */
function prunePinsForLead(db, { workspaceId, leadId }) {
  db.prepare('DELETE FROM lead_pins WHERE workspace_id = ? AND lead_id = ?').run(workspaceId, String(leadId || ''));
}

module.exports = { installSchema, listPins, pin, unpin, prunePinsForLead, CLUTTER_WARN_AFTER };
