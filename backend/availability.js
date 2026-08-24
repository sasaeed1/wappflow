'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Availability — ONE answer to "is this time already taken?" (Phase 6).
//
//  There were two scheduling systems that could not see each other. Public
//  self-booking (booking.js) built its free slots from the `bookings` table
//  alone; internal meetings (server.js, Google Calendar) wrote to `meetings`
//  and consulted nothing. So a client could self-book the exact hour the studio
//  had just blocked for a Google Meet, and neither side would object.
//
//  This module is the shared calendar read. It is deliberately NOT a merge of
//  the two features — a public booking and an internal meeting remain different
//  things with different flows. They simply share one definition of "busy".
// ════════════════════════════════════════════════════════════════════════════

const { wallClockToMs } = require('./studio-time');

/**
 * Parse the two timestamp shapes this codebase stores, into ONE instant scale.
 *
 * Phase 9 (audit gap-4). This used a bare Date.parse, which reads
 * 'YYYY-MM-DD HH:MM:SS' as SERVER-local and an ISO string as a true instant.
 * bookings.start_at is the first shape and means a wall clock AT THE STUDIO;
 * meetings.starts_at is the second. So the two sat the studio's entire UTC
 * offset apart on this shared calendar — five hours for Karachi — and the
 * double-booking guard, the slot list and the calendar push all read it.
 *
 * `timeZone` is the studio's configured zone; without one this behaves exactly
 * as before (naive stamps read as UTC), so an unconfigured studio sees no
 * change and a configured one becomes correct.
 *
 * Returns NaN for anything unparseable, and callers drop those rather than
 * treating them as busy-at-epoch-zero.
 */
function toMs(v, timeZone = '') {
  return wallClockToMs(v, timeZone);
}

/**
 * Every interval in this workspace that a new appointment must not overlap.
 * Returns [[startMs, endMs], ...] with `bufferMin` added to the end of each.
 */
function busyIntervals(db, workspaceId, opts = {}) {
  const bufferMs = Math.max(0, Number(opts.bufferMin) || 0) * 60000;
  const defaultDur = Math.max(1, Number(opts.defaultDurationMin) || 30);
  const tz = opts.timeZone || '';        // the studio's zone; '' ⇒ treat naive stamps as UTC
  const out = [];

  // Public bookings.
  try {
    const rows = db.prepare(
      `SELECT id, start_at, duration_min FROM bookings
       WHERE workspace_id = ? AND status != 'cancelled'
         AND (is_deleted = 0 OR is_deleted IS NULL)
         AND start_at >= datetime('now', '-1 day')`
    ).all(workspaceId);
    for (const r of rows) {
      if (opts.excludeBookingId && r.id === opts.excludeBookingId) continue;
      const s = toMs(r.start_at, tz);
      if (!Number.isFinite(s)) continue;
      out.push([s, s + ((Number(r.duration_min) || defaultDur) * 60000) + bufferMs]);
    }
  } catch { /* table may not exist on a very old DB */ }

  // Internal meetings (Google Calendar events created from a lead).
  try {
    const rows = db.prepare(
      `SELECT id, starts_at, ends_at FROM meetings
       WHERE workspace_id = ? AND starts_at >= datetime('now', '-1 day')`
    ).all(workspaceId);
    for (const r of rows) {
      if (opts.excludeMeetingId && r.id === opts.excludeMeetingId) continue;
      const s = toMs(r.starts_at, tz);
      if (!Number.isFinite(s)) continue;
      const e = toMs(r.ends_at, tz);
      out.push([s, (Number.isFinite(e) && e > s ? e : s + defaultDur * 60000) + bufferMs]);
    }
  } catch { /* meetings is optional — the module predates it on some installs */ }

  return out;
}

/** Does [startMs, endMs) overlap anything busy? */
function clashes(busy, startMs, endMs) {
  return (busy || []).some(([bs, be]) => startMs < be && endMs > bs);
}

module.exports = { busyIntervals, clashes, toMs };
