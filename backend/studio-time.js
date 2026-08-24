'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  studio-time — one interpretation of an appointment's clock.
//
//  Phase 9 (audit gap-4). One timestamp had three meanings:
//
//    · bookings.start_at is a studio-LOCAL naive 'YYYY-MM-DD HH:MM:SS'
//    · meetings.starts_at is an ISO instant
//    · availability.toMs parsed BOTH with Date.parse, so the naive one came out
//      as server-local (UTC on the box) and the ISO one as a true instant
//
//  So in the "unified" busy calendar a booking and a meeting at the same real
//  moment sat the studio's whole UTC offset apart — five hours, for Karachi.
//  The double-booking guard, the slot list and the calendar push all read that
//  calendar. Meanwhile the frontend's shared formatter treats a zone-less stamp
//  as UTC, which is why the bookings page hand-rolls its own parse: routing it
//  through the shared helper would have shifted every appointment.
//
//  DECISION: bookings keep WALL-CLOCK storage and gain a real timezone.
//
//  Storing UTC was the other option and this is the safer, more correct one:
//    · An appointment means "2pm at the studio", not an instant. Wall clock plus
//      a zone survives a government changing its DST rules; a stored instant
//      silently moves the shoot.
//    · Converting the existing rows would mean GUESSING the zone of every
//      booking already taken — most studios have never set one — and silently
//      shifting real appointments. There is no safe migration.
//
//  With no configured zone we fall back to UTC, which is exactly what the box
//  does today: nothing changes for a studio that has not set one, and
//  everything becomes correct the moment they do.
// ════════════════════════════════════════════════════════════════════════════

const NAIVE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/;
const HAS_ZONE = /[zZ]$|[+-]\d{2}:?\d{2}$/;

/** Is this a timezone we can actually format in? Anything else is ignored
 *  rather than thrown, because a bad settings value must not break a booking. */
function isValidZone(tz) {
  if (!tz || typeof tz !== 'string') return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; }
  catch { return false; }
}

/** The zone's UTC offset, in ms, AT a given instant (so DST is handled). */
function offsetAt(utcMs, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  // What the wall clock reads there, re-read as if it were UTC.
  const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
  return asIfUtc - utcMs;
}

/**
 * A wall-clock stamp in a studio's zone → the true instant, in ms.
 *
 * '2026-08-25 14:00:00' + 'Asia/Karachi' → the moment it is 2pm in Karachi.
 * Falls back to UTC when the zone is missing or unusable, which is the
 * behaviour the server has today.
 */
function wallClockToMs(stamp, timeZone) {
  if (!stamp) return NaN;
  const s = String(stamp).trim();
  // Already carries a zone (a meeting, say) — it is an instant, take it as read.
  if (HAS_ZONE.test(s)) {
    const t = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
    return Number.isFinite(t) ? t : NaN;
  }
  const m = s.match(NAIVE);
  if (!m) return NaN;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  if (!isValidZone(timeZone)) return guess;                 // no zone ⇒ treat as UTC
  // Correct by the offset, then again: near a DST jump the first correction can
  // land on the other side of the transition, where the offset differs.
  let ms = guess - offsetAt(guess, timeZone);
  ms = guess - offsetAt(ms, timeZone);
  return ms;
}

/** The inverse: a true instant → the wall-clock stamp a studio would write. */
function msToWallClock(ms, timeZone) {
  if (!Number.isFinite(ms)) return null;
  if (!isValidZone(timeZone)) {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  }
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of dtf.formatToParts(new Date(ms))) p[part.type] = part.value;
  const hh = String((+p.hour) % 24).padStart(2, '0');
  return `${p.year}-${p.month}-${p.day} ${hh}:${p.minute}:${p.second}`;
}

/**
 * Format an appointment the way the STUDIO reads it, wherever the reader is.
 *
 * The confirmation message, the reminder and the admin list all used
 * `new Date(stamp.replace(' ','T')).toLocaleString()`, which renders in the
 * runtime's own zone — the Node server's for messages, the admin's browser for
 * the list. A studio in Karachi whose server runs UTC was texting clients times
 * five hours out.
 */
function formatStudioTime(stamp, timeZone, opts = {}) {
  const ms = wallClockToMs(stamp, timeZone);
  if (!Number.isFinite(ms)) return String(stamp || '');
  const fmt = {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
    ...opts,
  };
  if (isValidZone(timeZone)) fmt.timeZone = timeZone;
  else fmt.timeZone = 'UTC';
  try { return new Intl.DateTimeFormat('en-US', fmt).format(new Date(ms)); }
  catch { return String(stamp || ''); }
}

/** The studio's configured zone, or '' when they have not set one. */
function studioZone(db, workspaceId) {
  try {
    const row = db.prepare('SELECT settings FROM booking_settings WHERE workspace_id = ?').get(workspaceId);
    if (!row) return '';
    const cfg = JSON.parse(row.settings || '{}');
    return isValidZone(cfg.timezone) ? cfg.timezone : '';
  } catch { return ''; }
}

module.exports = { wallClockToMs, msToWallClock, formatStudioTime, studioZone, isValidZone, offsetAt };
