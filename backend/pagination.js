'use strict';

// ════════════════════════════════════════════════════════════════════════════
//  Server-side pagination — OPT-IN (Phase 4)
// ════════════════════════════════════════════════════════════════════════════
//
// The core list endpoints (leads, invoices, contracts, messages) fetch everything a
// workspace owns, unbounded. On a mature workspace that is tens of thousands of rows
// transferred on every page load, and it is the reason the leads list cannot be
// virtualized: you cannot window rows the client has already been forced to download.
//
// WHY OPT-IN, and not just "add a default LIMIT": the current frontend fetches all
// leads and filters/sorts them CLIENT-SIDE. Silently capping the response would make
// a workspace with 3,000 leads quietly show 500 and filter within only those — wrong
// answers presented confidently, which is the failure mode this codebase already had
// too much of. So behaviour is unchanged unless the caller asks for a page, and the
// cap lands with the virtualized list that knows how to ask for the next one.
//
//   ?limit=100&offset=200  → { items, total, limit, offset, hasMore }
//   (no limit)             → unchanged: a bare array, exactly as before
//
// The guard rails matter more than the feature: limit is clamped so a client cannot
// ask for 10 million rows, and offset cannot go negative.

const MAX_LIMIT = 500;

/** Reads paging params. Returns null when the caller did not ask to paginate. */
function pageParams(req) {
  const raw = req.query.limit;
  if (raw === undefined || raw === '') return null;
  let limit = parseInt(raw, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = 50;
  limit = Math.min(limit, MAX_LIMIT);
  let offset = parseInt(req.query.offset, 10);
  if (!Number.isFinite(offset) || offset < 0) offset = 0;
  return { limit, offset };
}

/**
 * Applies paging to an already-built query.
 *
 * `countSql` must be the same FROM/WHERE with COUNT(*) — the total is what lets a
 * virtualized list size its scrollbar without downloading every row, so it is the
 * whole point rather than a nicety.
 */
function paginate(db, { sql, countSql, params, page }) {
  const total = db.prepare(countSql).get(...params)?.c ?? 0;
  const items = db.prepare(`${sql} LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset);
  return {
    items,
    total,
    limit: page.limit,
    offset: page.offset,
    hasMore: page.offset + items.length < total,
  };
}

/** Turns `SELECT <cols> FROM x WHERE y ORDER BY z` into its COUNT(*) twin. */
// Find a keyword at parenthesis depth 0 - i.e. one belonging to THIS query and
// not to a subquery. Taking the first FROM naively breaks the moment a column is
// computed by a correlated subquery (a lifetime-revenue SUM, say): the count
// would then be built from the SUBQUERY's FROM and count the wrong table.
function topLevelIndex(sql, word) {
  const upper = sql.toUpperCase();
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (depth !== 0) continue;
    if (!upper.startsWith(word, i)) continue;
    const before = i === 0 ? ' ' : sql[i - 1];
    const after = sql[i + word.length] === undefined ? ' ' : sql[i + word.length];
    if (/[\s(),]/.test(before) && /[\s(),]/.test(after)) return i;
  }
  return -1;
}

function toCountSql(sql) {
  const from = topLevelIndex(sql, 'FROM');
  if (from === -1) throw new Error('toCountSql: no FROM clause');
  const order = topLevelIndex(sql, 'ORDER BY');
  const body = (order === -1 || order < from) ? sql.slice(from) : sql.slice(from, order);
  return `SELECT COUNT(*) c ${body}`;
}

module.exports = { MAX_LIMIT, pageParams, paginate, toCountSql };
