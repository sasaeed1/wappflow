'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Saved views — server-side storage for list filter combinations (Phase 4).
//
//  The audit's crm-leads-11: saved views lived in per-browser localStorage, so
//  a user's carefully built "Hot — needs follow-up" view existed on exactly one
//  machine and evaporated with a cleared cache. This moves them server-side.
//
//  DESIGN DECISIONS, stated:
//    • Scope is (workspace, user, entity) — views stay PERSONAL, matching the
//      localStorage semantics exactly. Sharing a view with the team is a feature
//      decision (who can edit it? does it appear unasked?) that belongs in its
//      own proposal, not smuggled into a persistence fix.
//    • `entity` is a column, not a table-per-list: Clients, Galleries, Contracts
//      mount views later with zero schema change (the audit's "build once,
//      mount everywhere").
//    • `filters` is an opaque JSON blob to the server. The server validates
//      shape and size, never meaning — filter vocabularies belong to each list
//      and evolve without migrations.
// ════════════════════════════════════════════════════════════════════════════

const ENTITIES = new Set(['leads', 'clients', 'galleries', 'contracts', 'bookings', 'team']);
const NAME_MAX = 60;
const FILTERS_MAX_BYTES = 4096; // a filter combo is a handful of keys, not a document

function installSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS saved_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      name TEXT NOT NULL,
      filters TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (workspace_id, user_id, entity, name)
    );
    CREATE INDEX IF NOT EXISTS idx_saved_views_scope ON saved_views (workspace_id, user_id, entity);
  `);
}

const bad = (msg) => { const e = new Error(msg); e.status = 400; return e; };

function listViews(db, { workspaceId, userId, entity }) {
  if (!ENTITIES.has(entity)) throw bad(`unknown entity "${entity}"`);
  return db.prepare(
    `SELECT id, entity, name, filters, updated_at FROM saved_views
     WHERE workspace_id = ? AND user_id = ? AND entity = ? ORDER BY name COLLATE NOCASE`
  ).all(workspaceId, userId, entity).map((v) => {
    let filters = {};
    try { filters = JSON.parse(v.filters); } catch {}
    return { ...v, filters };
  });
}

function saveView(db, { workspaceId, userId, entity, name, filters }) {
  if (!ENTITIES.has(entity)) throw bad(`unknown entity "${entity}"`);
  const trimmed = String(name || '').trim();
  if (!trimmed || trimmed.length > NAME_MAX) throw bad(`name required, at most ${NAME_MAX} characters`);
  if (filters === null || typeof filters !== 'object' || Array.isArray(filters)) throw bad('filters must be an object');
  const json = JSON.stringify(filters);
  if (Buffer.byteLength(json, 'utf8') > FILTERS_MAX_BYTES) throw bad('filters too large');
  // Upsert on the natural key: saving a view under an existing name replaces it,
  // which is exactly what the localStorage version did.
  db.prepare(
    `INSERT INTO saved_views (workspace_id, user_id, entity, name, filters)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (workspace_id, user_id, entity, name)
     DO UPDATE SET filters = excluded.filters, updated_at = CURRENT_TIMESTAMP`
  ).run(workspaceId, userId, entity, trimmed, json);
  return db.prepare(
    `SELECT id, entity, name, filters, updated_at FROM saved_views
     WHERE workspace_id = ? AND user_id = ? AND entity = ? AND name = ?`
  ).get(workspaceId, userId, entity, trimmed);
}

function deleteView(db, { workspaceId, userId, id }) {
  // Scoped to owner: one user can never delete another user's view, even with a
  // guessed id — the WHERE clause is the authorization.
  return db.prepare(
    `DELETE FROM saved_views WHERE id = ? AND workspace_id = ? AND user_id = ?`
  ).run(id, workspaceId, userId).changes;
}

module.exports = { installSchema, listViews, saveView, deleteView, ENTITIES, NAME_MAX, FILTERS_MAX_BYTES };
