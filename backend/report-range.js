'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  The date range a report covers, worked out once from the query string.
//
//  ?period=30                      → the last 30 days, today included
//  ?start_date=…&end_date=…        → that range (YYYY-MM-DD), either order
//  ?tz=300                         → the viewer's offset from UTC in minutes, so
//                                    "today" is their today, not the server's
//
//  Also returns the range of equal length just before it, for up/down trends.
//  Pure (no I/O) so it is testable; `now` can be passed in for tests.
// ════════════════════════════════════════════════════════════════════════════

const DAY = 86400000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 3660; // ten years; anything longer is a typo

const toDate = (s) => {
  if (typeof s !== 'string' || !ISO.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? t : null;
};
const fmt = (t) => new Date(t).toISOString().slice(0, 10);

function reportRange(query = {}, now = Date.now()) {
  // Minutes east of UTC, whole minutes, within real-world offsets.
  let tz = parseInt(query.tz, 10);
  if (!Number.isFinite(tz) || Math.abs(tz) > 14 * 60) tz = 0;
  const today = toDate(fmt(now + tz * 60000));

  let start = toDate(query.start_date);
  let end = toDate(query.end_date);
  if (start != null && end != null) {
    if (start > end) [start, end] = [end, start];
    if ((end - start) / DAY + 1 > MAX_DAYS) start = end - (MAX_DAYS - 1) * DAY;
  } else {
    let days = parseInt(query.period, 10);
    if (!Number.isFinite(days) || days < 1) days = 30;
    days = Math.min(days, MAX_DAYS);
    end = today;
    start = today - (days - 1) * DAY;
  }
  const days = Math.round((end - start) / DAY) + 1;
  const prevEnd = start - DAY;
  const prevStart = prevEnd - (days - 1) * DAY;

  // SQLite modifier that shifts a stored UTC timestamp into the viewer's day.
  // Built from a validated integer, so it is safe to place in SQL text.
  const tzModifier = `${tz >= 0 ? '+' : '-'}${Math.abs(tz)} minutes`;

  return {
    range: { start: fmt(start), end: fmt(end), days },
    prev: { start: fmt(prevStart), end: fmt(prevEnd), days },
    tz, tzModifier,
  };
}

module.exports = { reportRange };
