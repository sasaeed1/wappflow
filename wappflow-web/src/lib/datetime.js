// ───────────────────────────────────────────────────────────────────────────
// Shared date/time formatting for WappFlow.
//
// Every timestamp is rendered in the VIEWER's own local timezone, so a teammate
// in Karachi and a teammate in London each see the same moment in their own
// wall-clock time. The browser's Intl APIs do this automatically — the only
// thing we have to get right is parsing.
//
// The backend stores timestamps as UTC (SQLite CURRENT_TIMESTAMP →
// "YYYY-MM-DD HH:MM:SS" with no zone marker). `new Date()` parses a zone-less
// string inconsistently (some engines assume local time), which makes times
// wrong by the UTC offset. `toDate()` below normalizes any zone-less value to
// UTC so the displayed time is always accurate.
// ───────────────────────────────────────────────────────────────────────────

/** Parse any timestamp shape into a Date, treating zone-less strings as UTC. */
export function toDate(ts) {
  if (ts === null || ts === undefined || ts === '') return null;
  if (ts instanceof Date) return isNaN(ts.getTime()) ? null : ts;
  if (typeof ts === 'number') {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }
  let s = String(ts).trim();
  if (!s) return null;
  // Has an explicit zone (Z or ±HH:MM) — trust it as-is.
  if (/z$/i.test(s) || /[+-]\d\d:?\d\d$/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // Zone-less ("2026-05-21 14:30:00" or "2026-05-21T14:30:00") — it's UTC.
  s = s.replace(' ', 'T');
  let d = new Date(s + 'Z');
  if (isNaN(d.getTime())) d = new Date(s); // last-resort fallback
  return isNaN(d.getTime()) ? null : d;
}

/** "May 21, 3:42 PM" — short date + time with AM/PM. */
export function formatDateTime(ts) {
  const d = toDate(ts);
  if (!d) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/** "3:42 PM" — time only. */
export function formatTime(ts) {
  const d = toDate(ts);
  if (!d) return '';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/** "May 21, 2026" — date only. */
export function formatDate(ts) {
  const d = toDate(ts);
  if (!d) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/**
 * Context-aware short format:
 *  - today      → "3:42 PM"
 *  - this year  → "May 21, 3:42 PM"
 *  - older      → "May 21, 2025, 3:42 PM"
 */
export function formatSmart(ts) {
  const d = toDate(ts);
  if (!d) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(ts);
  const opts = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleString(undefined, opts);
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" / then falls back to short date. */
export function formatRelative(ts) {
  const d = toDate(ts);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return formatSmart(ts); // future → show the actual time
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return formatDate(ts);
}

/** Full, unambiguous timestamp for tooltips: "May 21, 2026, 3:42 PM". */
export function formatFull(ts) {
  const d = toDate(ts);
  if (!d) return '';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}
