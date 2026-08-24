'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 9 — the timezone primitive, tested against the cases that break naive
//  implementations.
//
//  Timezone code that is subtly wrong is worse than none: it fails silently,
//  by a whole hour, on two days a year, and nobody notices until a photographer
//  misses a wedding. These run the real functions against known instants rather
//  than reading the source.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const T = require('./studio-time');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };

check('a wall-clock stamp in a zone resolves to the right instant', () => {
  // Karachi is UTC+5 all year (Pakistan has no DST). 14:00 there is 09:00Z.
  const ms = T.wallClockToMs('2026-08-25 14:00:00', 'Asia/Karachi');
  assert.strictEqual(new Date(ms).toISOString(), '2026-08-25T09:00:00.000Z');
});

check('the same stamp in a different zone is a different moment', () => {
  const kar = T.wallClockToMs('2026-08-25 14:00:00', 'Asia/Karachi');
  const lon = T.wallClockToMs('2026-08-25 14:00:00', 'Europe/London');
  const nyc = T.wallClockToMs('2026-08-25 14:00:00', 'America/New_York');
  assert.notStrictEqual(kar, lon, 'Karachi and London 2pm are the same instant?');
  // London is BST (+1) in August, New York is EDT (-4): nine hours apart.
  assert.strictEqual((nyc - lon) / 3600000, 5, 'London→New York offset wrong');
  assert.strictEqual((lon - kar) / 3600000, 4, 'Karachi→London offset wrong');
});

check('no configured zone behaves exactly as the server does today (UTC)', () => {
  // The fallback must be a no-op change for every studio that never set a zone.
  const ms = T.wallClockToMs('2026-08-25 14:00:00', '');
  assert.strictEqual(new Date(ms).toISOString(), '2026-08-25T14:00:00.000Z');
  assert.strictEqual(T.wallClockToMs('2026-08-25 14:00:00', undefined), ms);
  assert.strictEqual(T.wallClockToMs('2026-08-25 14:00:00', 'Not/AZone'), ms, 'a junk zone must not shift the time');
});

check('a stamp that already carries a zone is taken as the instant it is', () => {
  // meetings.starts_at is an ISO instant; it must NOT be re-interpreted.
  const iso = '2026-08-25T09:00:00.000Z';
  assert.strictEqual(T.wallClockToMs(iso, 'Asia/Karachi'), Date.parse(iso));
  assert.strictEqual(T.wallClockToMs('2026-08-25T14:00:00+05:00', 'America/New_York'), Date.parse('2026-08-25T09:00:00Z'));
});

check('THE BUG THIS EXISTS FOR: a booking and a meeting at the same moment compare equal', () => {
  // availability.toMs parsed the naive booking as server-local and the ISO
  // meeting as a true instant, so in the shared busy calendar they sat the
  // studio's whole UTC offset apart. The double-booking guard read that.
  const booking = T.wallClockToMs('2026-08-25 14:00:00', 'Asia/Karachi');   // 2pm in Karachi
  const meeting = T.wallClockToMs('2026-08-25T09:00:00.000Z', 'Asia/Karachi'); // the same moment
  assert.strictEqual(booking, meeting, 'a booking and a meeting at one moment still disagree');
});

check('spring-forward: the hour that does not exist is handled, not NaN', () => {
  // London jumps 01:00→02:00 on 2026-03-29. 01:30 never happens.
  const ms = T.wallClockToMs('2026-03-29 01:30:00', 'Europe/London');
  assert(Number.isFinite(ms), 'a non-existent local time produced NaN');
  // It must land adjacent to the transition, not an arbitrary day away.
  const gap = Math.abs(ms - Date.parse('2026-03-29T01:00:00Z'));
  assert(gap <= 2 * 3600000, 'the resolved instant is nowhere near the transition: ' + new Date(ms).toISOString());
});

check('autumn-back: the hour that happens twice resolves without drifting a day', () => {
  // London falls back 02:00→01:00 on 2026-10-25; 01:30 occurs twice.
  const ms = T.wallClockToMs('2026-10-25 01:30:00', 'Europe/London');
  assert(Number.isFinite(ms), 'an ambiguous local time produced NaN');
  const gap = Math.abs(ms - Date.parse('2026-10-25T01:00:00Z'));
  assert(gap <= 2 * 3600000, 'the resolved instant drifted: ' + new Date(ms).toISOString());
});

check('a zone WITH dst converts correctly on both sides of the change', () => {
  // New York: EST (-5) in January, EDT (-4) in July. A naive implementation
  // that caches one offset gets one of these wrong.
  const winter = T.wallClockToMs('2026-01-15 09:00:00', 'America/New_York');
  const summer = T.wallClockToMs('2026-07-15 09:00:00', 'America/New_York');
  assert.strictEqual(new Date(winter).toISOString(), '2026-01-15T14:00:00.000Z', 'EST conversion wrong');
  assert.strictEqual(new Date(summer).toISOString(), '2026-07-15T13:00:00.000Z', 'EDT conversion wrong');
});

check('round-tripping a stamp through the instant and back is lossless', () => {
  for (const [stamp, tz] of [
    ['2026-08-25 14:00:00', 'Asia/Karachi'],
    ['2026-01-15 09:30:00', 'America/New_York'],
    ['2026-07-15 23:45:00', 'Europe/London'],
    ['2026-12-31 23:59:00', 'Asia/Tokyo'],
    ['2026-02-28 00:00:00', 'Australia/Sydney'],
  ]) {
    const back = T.msToWallClock(T.wallClockToMs(stamp, tz), tz);
    assert.strictEqual(back, stamp, `${stamp} in ${tz} round-tripped to ${back}`);
  }
});

check('formatting shows the STUDIO clock, whatever the reader runs', () => {
  // The confirmation message rendered in the Node server's zone; the admin list
  // rendered in the browser's. A Karachi studio on a UTC box texted times five
  // hours out.
  const out = T.formatStudioTime('2026-08-25 14:00:00', 'Asia/Karachi');
  assert(/2:00/.test(out) && /PM/.test(out), 'the studio clock is not what was rendered: ' + out);
  assert(/Aug/.test(out) && /25/.test(out), 'wrong date rendered: ' + out);
});

check('formatting an unconfigured studio does not silently shift the time', () => {
  const out = T.formatStudioTime('2026-08-25 14:00:00', '');
  assert(/2:00/.test(out) && /PM/.test(out), 'an unzoned studio saw a shifted time: ' + out);
});

check('garbage in does not produce a crash or a plausible-looking lie', () => {
  assert(Number.isNaN(T.wallClockToMs('', 'Asia/Karachi')));
  assert(Number.isNaN(T.wallClockToMs(null, 'Asia/Karachi')));
  assert(Number.isNaN(T.wallClockToMs('not a date', 'Asia/Karachi')));
  assert.strictEqual(T.formatStudioTime('not a date', 'Asia/Karachi'), 'not a date', 'a bad stamp was rendered as a real time');
  assert.strictEqual(T.msToWallClock(NaN, 'Asia/Karachi'), null);
});

check('zone validation accepts real zones and rejects the rest', () => {
  for (const z of ['Asia/Karachi', 'Europe/London', 'America/New_York', 'UTC']) {
    assert(T.isValidZone(z), z + ' rejected');
  }
  for (const z of ['', null, undefined, 'Mars/Olympus', 'GMT+5', 42, {}]) {
    assert(!T.isValidZone(z), JSON.stringify(z) + ' accepted');
  }
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
