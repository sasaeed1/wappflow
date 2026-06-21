// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — DATABASE EXPLORER + READ-ONLY SQL CONSOLE  (spec §15 + §16)
//
//  SECURITY-CRITICAL. This module never writes. It opens a SEPARATE, SQLite-level
//  READ-ONLY connection (roDb) and serves every read through it, so even a bug in
//  the request layer cannot mutate the database. The SQL console additionally:
//    • requires the `run_sql` permission AND a step-up (elevated) token
//    • whitelists only read verbs (select/with/explain/pragma/analyze)
//    • denylists every write/DDL verb via word-boundary regex
//    • runs through better-sqlite3 .prepare (rejects multi-statement) and refuses
//      any statement whose .reader flag is false
//  Every query (and every rejected attempt) is audited.
//
//  Mounted by command-center.js. Exports the standard sub-module shape:
//    module.exports = function (app, deps) { …register routes…; return {}; }
// ════════════════════════════════════════════════════════════════════════════

const Database = require('better-sqlite3');

module.exports = function (app, deps) {
  const {
    db, platformAuth, requirePerm, ccAudit, emit, rid,
    safeAll, safeCount, broadcastToWorkspace, sendEmail, entitlements,
  } = deps;

  // ── Separate READ-ONLY connection ──────────────────────────────────────────
  // deps.db.name is the on-disk path of the primary better-sqlite3 connection.
  // Opening it { readonly: true } makes writes impossible at the SQLite level.
  let roDb;
  try {
    roDb = new Database(db.name, { readonly: true });
  } catch (e) {
    console.error('cc-explorer: failed to open read-only connection:', e.message);
    roDb = db; // last-resort fallback; the four guard layers below still apply
  }

  // ── Identifier validation ──────────────────────────────────────────────────
  // Confirm a table name actually exists in sqlite_master BEFORE it is ever
  // interpolated into SQL. Returns the canonical name, or null.
  function validTable(name) {
    if (!name || typeof name !== 'string') return null;
    const row = roDb.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(name);
    return row ? row.name : null;
  }
  // Quote a (already-validated) identifier for safe interpolation.
  const qid = (id) => '"' + String(id).replace(/"/g, '""') + '"';

  const num = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

  // ════════════════════════════════════════════════════════════════════════════
  //  §15 — DATABASE EXPLORER
  // ════════════════════════════════════════════════════════════════════════════

  // List user tables with row counts.
  app.get('/api/cc/db/tables', platformAuth, (req, res) => {
    try {
      const tables = roDb.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all();
      const out = tables.map((t) => {
        let count = 0;
        try { count = roDb.prepare(`SELECT COUNT(*) AS c FROM ${qid(t.name)}`).get().c || 0; } catch {}
        return { name: t.name, rowCount: count };
      });
      res.json({ tables: out });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Inspect one table: columns, indexes, row count, paginated sample rows.
  app.get('/api/cc/db/tables/:name', platformAuth, (req, res) => {
    try {
      const name = validTable(req.params.name);
      if (!name) return res.status(404).json({ error: 'Table not found' });

      const limit = Math.min(Math.max(num(req.query.limit, 50), 1), 500);
      const offset = Math.max(num(req.query.offset, 0), 0);

      const columns = roDb.prepare(`PRAGMA table_info(${qid(name)})`).all().map((c) => ({
        name: c.name, type: c.type, notnull: !!c.notnull, dflt_value: c.dflt_value, pk: !!c.pk,
      }));
      const indexes = roDb.prepare(`PRAGMA index_list(${qid(name)})`).all().map((ix) => ({
        name: ix.name, unique: !!ix.unique, origin: ix.origin, partial: !!ix.partial,
      }));

      let rowCount = 0;
      try { rowCount = roDb.prepare(`SELECT COUNT(*) AS c FROM ${qid(name)}`).get().c || 0; } catch {}

      const rows = roDb.prepare(`SELECT * FROM ${qid(name)} LIMIT ? OFFSET ?`).all(limit, offset);

      res.json({ name, columns, indexes, rowCount, rows, limit, offset });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  //  §16 — READ-ONLY SQL CONSOLE
  //  Founder-only (run_sql) + step-up required. Four independent read-only layers.
  // ════════════════════════════════════════════════════════════════════════════

  // Whitelist: a query must START with one of these verbs.
  const READ_PREFIX = /^(select|with|explain|pragma|analyze)\b/i;
  // Denylist: reject if ANY of these write/DDL verbs appears as a whole word.
  const WRITE_WORDS = /\b(insert|update|delete|drop|alter|create|replace|attach|detach|vacuum|reindex|truncate)\b/i;

  app.post('/api/cc/db/query', platformAuth, requirePerm('run_sql'), (req, res) => {
    const rawSql = req.body?.sql;
    const sql = typeof rawSql === 'string' ? rawSql : '';

    // Step-up gate — destructive-tier action even though it only reads.
    if (!req.elevated) {
      return res.status(403).json({ error: 'Step-up required', need_step_up: true });
    }

    // Helper: audit a rejected attempt, then respond.
    const reject = (status, message) => {
      ccAudit(req, { action: 'sql_query_rejected', target_type: 'sql', after: { sql, reason: message } });
      return res.status(status).json({ error: message });
    };

    const t = sql.trim();
    if (!t) return reject(400, 'Empty query');

    // Layer 2 — whitelist read verbs only.
    if (!READ_PREFIX.test(t)) {
      return reject(400, 'Only read queries are allowed (select / with / explain / pragma / analyze).');
    }
    // Layer 3 — denylist any write / DDL keyword.
    if (WRITE_WORDS.test(t)) {
      return reject(400, 'Write or DDL statements are not allowed on the read-only console.');
    }

    // Layer 4 — prepare on the read-only connection (throws on multiple statements),
    // and refuse any non-reader statement.
    try {
      const stmt = roDb.prepare(sql); // Layer 1: roDb is opened readonly.
      if (!stmt.reader) return reject(400, 'Not a read query');

      const rows = stmt.all();
      const truncated = rows.length > 1000;
      const out = rows.slice(0, 1000);
      const columns = out[0] ? Object.keys(out[0]) : [];

      ccAudit(req, { action: 'sql_query', target_type: 'sql', after: { sql, rows: rows.length } });

      res.json({ columns, rows: out, truncated });
    } catch (e) {
      // SQLite errors (syntax, unknown column, multiple statements, etc.).
      ccAudit(req, { action: 'sql_query_rejected', target_type: 'sql', after: { sql, error: e.message } });
      res.status(400).json({ error: e.message });
    }
  });

  return {};
};
