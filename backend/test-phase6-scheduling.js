'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 6 Batch 3 — one busy-calendar.
//
//  Public self-booking and internal meetings could not see each other, so a
//  client could book the exact hour the studio had blocked for a Google Meet.
//  The overlap arithmetic decides whether a studio owner double-books a real
//  client, so it runs against a real database here.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const availability = require('./availability');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// The two tables genuinely store different formats, and the fixture has to honour
// that or it tests nothing: bookings.start_at is a studio-LOCAL 'YYYY-MM-DD HH:MM:SS'
// while meetings.starts_at is an ISO instant. Mixing them up shifts every
// assertion by the local UTC offset.
// Second-aligned: the stored stamps have no sub-second component, so a
// millisecond-precise `at()` would make an exactly-abutting slot look like a
// fractional overlap and fail a boundary assertion for the wrong reason.
const T0 = Math.floor(Date.now() / 1000) * 1000;
const at = (h) => T0 + h * 3600e3;
// A naive booking stamp is a WALL CLOCK AT THE STUDIO (Phase 9, studio-time.js).
// With no configured zone it is read as UTC — the convention the whole codebase
// now shares. This fixture used to build the stamp from LOCAL parts, which only
// round-tripped because the old availability.toMs also parsed naive strings as
// server-local; on any machine that is not UTC the two conventions disagree by
// the host's offset, which is exactly the class of bug Phase 9 removed.
const localStamp = (h) => {
  const d = new Date(at(h));
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};
const isoStamp = (h) => new Date(at(h)).toISOString();

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE bookings (id TEXT PRIMARY KEY, workspace_id TEXT, start_at TEXT, duration_min INTEGER,
      status TEXT DEFAULT 'confirmed', is_deleted INTEGER DEFAULT 0);
    CREATE TABLE meetings (id TEXT PRIMARY KEY, workspace_id TEXT, starts_at TIMESTAMP, ends_at TIMESTAMP);
  `);
  db.prepare("INSERT INTO bookings VALUES ('b1','ws1',?,60,'confirmed',0)").run(localStamp(24));  // +24h, 1h
  db.prepare("INSERT INTO bookings VALUES ('b2','ws1',?,60,'cancelled',0)").run(localStamp(48));  // cancelled
  db.prepare("INSERT INTO bookings VALUES ('b3','ws1',?,60,'confirmed',1)").run(localStamp(72));  // in the bin
  db.prepare("INSERT INTO meetings VALUES ('m1','ws1',?,?)").run(isoStamp(30), isoStamp(31));     // +30h, 1h
  db.prepare("INSERT INTO bookings VALUES ('b9','ws2',?,60,'confirmed',0)").run(localStamp(24));  // another tenant
  return db;
}

check('busy time includes BOTH bookings and meetings', () => {
  const db = freshDb();
  const busy = availability.busyIntervals(db, 'ws1');
  assert.strictEqual(busy.length, 2, 'expected one booking + one meeting, got ' + busy.length);
  // The meeting is the thing the public booker was blind to.
  assert(availability.clashes(busy, at(30) + 6e5, at(30.5) + 6e5), 'a meeting does not block its own hour');
  assert(availability.clashes(busy, at(24) + 6e5, at(24.5) + 6e5), 'a booking does not block its own hour');
  db.close();
});

check('cancelled, binned, and other tenants’ appointments are not busy', () => {
  const db = freshDb();
  const busy = availability.busyIntervals(db, 'ws1');
  assert(!availability.clashes(busy, at(48), at(49)), 'a cancelled booking still blocks its slot');
  assert(!availability.clashes(busy, at(72), at(73)), 'a binned booking still blocks its slot');
  const other = availability.busyIntervals(db, 'ws2');
  assert.strictEqual(other.length, 1, 'busy time leaked across workspaces');
  db.close();
});

check('overlap is half-open — abutting appointments do not clash', () => {
  const db = freshDb();
  const busy = availability.busyIntervals(db, 'ws1');   // booking runs +24h → +25h
  assert(!availability.clashes(busy, at(25), at(26)), 'a slot starting exactly when another ends was rejected');
  assert(!availability.clashes(busy, at(23), at(24)), 'a slot ending exactly when another starts was rejected');
  assert(availability.clashes(busy, at(24.5), at(25.5)), 'a genuine overlap was allowed');
  assert(availability.clashes(busy, at(23.5), at(24.5)), 'an overlap on the leading edge was allowed');
  assert(availability.clashes(busy, at(24.1), at(24.2)), 'a slot fully inside another was allowed');
  db.close();
});

check('a buffer extends busy time, and excludes let a row ignore itself', () => {
  const db = freshDb();
  const buffered = availability.busyIntervals(db, 'ws1', { bufferMin: 30 });
  assert(availability.clashes(buffered, at(25.1), at(25.4)), 'the 30-minute buffer after a booking is not honoured');
  // Rescheduling must not treat the row being moved as a conflict with itself.
  const without = availability.busyIntervals(db, 'ws1', { excludeBookingId: 'b1' });
  assert(!availability.clashes(without, at(24), at(25)), 'a booking blocks its own reschedule');
  assert.strictEqual(without.length, 1, 'excluding one booking removed something else too');
  db.close();
});

check('unparseable or missing timestamps are dropped, not treated as busy at epoch 0', () => {
  const db = freshDb();
  db.prepare("INSERT INTO meetings VALUES ('bad','ws1','not a date',NULL)").run();
  db.prepare("INSERT INTO meetings VALUES ('noend','ws1',?,NULL)").run(isoStamp(36));
  const busy = availability.busyIntervals(db, 'ws1', { defaultDurationMin: 30 });
  assert(!availability.clashes(busy, 0, 1000), 'a junk timestamp became a busy interval at the epoch');
  // A meeting with no end still blocks its default duration rather than nothing.
  assert(availability.clashes(busy, at(36) + 6e5, at(36.2) + 6e5), 'an open-ended meeting blocks nothing');
  db.close();
});

// ── both callers actually use it ────────────────────────────────────────────
check('the public slot builder reads the shared calendar', () => {
  const bk = strip(read('booking.js'));
  assert(/availability\.busyIntervals\(db, ws/.test(bk), 'computeSlots does not consult the shared calendar');
  assert(!/SELECT start_at, duration_min FROM bookings/.test(bk), 'the bookings-only query survives');
  assert(/availability\.clashes\(booked/.test(bk), 'slot filtering does not use the shared overlap test');
});

check('creating a meeting refuses a time already committed', () => {
  const srv = strip(read('server.js'));
  const route = srv.slice(srv.indexOf("app.post('/api/leads/:leadId/meetings'"));
  const body = route.slice(0, route.indexOf('\n});'));
  assert(/availability\.busyIntervals\(db, req\.workspaceId/.test(body), 'meeting creation checks nothing');
  assert(/return res\.status\(409\)/.test(body), 'a clashing meeting should 409, not be created silently');
});

check('a booking and a meeting at the SAME REAL MOMENT land on one scale (Phase 9)', () => {
  // availability.toMs parsed the naive booking as server-local and the ISO
  // meeting as a true instant, so for a studio in Karachi the two sat five hours
  // apart on the shared busy calendar and each system could sell the same hour.
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE bookings (id TEXT PRIMARY KEY, workspace_id TEXT, start_at TEXT, duration_min INTEGER, status TEXT, is_deleted INTEGER);
    CREATE TABLE meetings (id TEXT PRIMARY KEY, workspace_id TEXT, starts_at TEXT, ends_at TEXT);
  `);
  // 14:00 in Karachi (UTC+5) is 09:00Z. Booked as the studio's wall clock; the
  // meeting recorded as the instant. They are the same hour.
  const day = new Date(Date.now() + 5 * 86400e3).toISOString().slice(0, 10);
  db.prepare("INSERT INTO bookings VALUES ('bz','wsz',?,60,'confirmed',0)").run(`${day} 14:00:00`);
  db.prepare('INSERT INTO meetings VALUES (?,?,?,?)').run('mz', 'wsz', `${day}T09:00:00.000Z`, `${day}T10:00:00.000Z`);

  const busy = availability.busyIntervals(db, 'wsz', { timeZone: 'Asia/Karachi' });
  assert.strictEqual(busy.length, 2, 'expected both rows');
  // Same start instant, so the two intervals must coincide.
  assert.strictEqual(busy[0][0], busy[1][0],
    'a booking and a meeting at one moment are still on different scales: ' +
    new Date(busy[0][0]).toISOString() + ' vs ' + new Date(busy[1][0]).toISOString());
  db.close();
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
