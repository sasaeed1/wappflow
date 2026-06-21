'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  WORKSPACE SYNC  (Final Vision · Phase 6 — offline-first foundation)
//  GET /api/workspace/sync?since=<ISO ts> → all workspace rows changed since the
//  cursor, plus a fresh `now` cursor to pass next time. The desktop (and a future
//  web service-worker) mirror this into a local store so culling/ratings/labels/
//  albums/notes work offline, then push queued changes back on reconnect.
//
//  Delta signal: COALESCE(updated_at, created_at) per table — tolerant of tables
//  that only have created_at. Hard-deletes aren't captured yet (tombstones are a
//  tracked follow-up); leads use is_deleted (soft) so their removals DO sync.
//  Large libraries: capped per table; cursor-based paging is a tracked follow-up.
// ════════════════════════════════════════════════════════════════════════════

const PAGE_CAP = 2000;

module.exports = function mountSync(app, db, deps = {}) {
  const { auth = (req, res, next) => next() } = deps;

  // Rows changed since `since`, trying updated_at then created_at. Defensive: a
  // missing column/table yields [] rather than throwing.
  function deltaRows(table, since, workspaceId) {
    for (const ts of ['updated_at', 'created_at']) {
      try {
        return db.prepare(`SELECT * FROM ${table} WHERE workspace_id = ? AND ${ts} > ? ORDER BY ${ts} ASC LIMIT ${PAGE_CAP}`).all(workspaceId, since);
      } catch { /* try next ts column */ }
    }
    return [];
  }

  app.get('/api/workspace/sync', auth, (req, res) => {
    try {
      const since = (req.query.since || '1970-01-01T00:00:00Z').toString();
      const now = new Date().toISOString();
      const ws = req.workspaceId;

      const changes = {
        leads:     deltaRows('leads', since, ws),
        projects:  deltaRows('ms_projects', since, ws),
        assets:    deltaRows('ms_assets', since, ws),
        cull:      deltaRows('ms_cull_decisions', since, ws),
        albums:    deltaRows('ms_albums', since, ws),
        galleries: deltaRows('ms_galleries', since, ws),
        contracts: deltaRows('cs_documents', since, ws),
        bookings:  deltaRows('bookings', since, ws),
      };

      let plan = null, brain = [];
      try { plan = db.prepare('SELECT * FROM workspace_plan WHERE workspace_id = ?').get(ws) || null; } catch {}
      try { brain = db.prepare('SELECT key, value, confidence, source, updated_at FROM workspace_brain WHERE workspace_id = ?').all(ws); } catch {}

      const counts = Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.length]));
      const capped = Object.entries(counts).filter(([, n]) => n >= PAGE_CAP).map(([k]) => k);

      res.json({
        since, now, schema_version: 1,
        changes, plan, brain, counts,
        // If any collection hit the cap, the client should re-sync from `now` to drain the rest.
        more: capped.length ? capped : false,
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  console.log('🔄 Sync delta endpoint mounted at GET /api/workspace/sync');
  return {};
};
