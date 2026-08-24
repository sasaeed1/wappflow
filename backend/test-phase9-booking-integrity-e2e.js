'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 9 — a studio cannot be double-booked.
//
//  The create and reschedule guards were `WHERE start_at = ?` — an EXACT match.
//  A four-hour wedding at 09:00 did not collide with a session at 10:00, and the
//  public endpoint accepted whatever start_at a caller sent rather than one it
//  had offered, so an overlapping booking did not even need a race to win. The
//  409 "that time was just taken" gave false confidence about a calendar nobody
//  was checking.
//
//  Worse, availability.toMs parsed a naive booking stamp as SERVER-local and an
//  ISO meeting stamp as a true instant, so on the shared busy calendar the two
//  sat the studio's whole UTC offset apart.
//
//  These drive the real public endpoint, because overbooking is a property of
//  what the API accepts, not of any one line.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3017 node server.js &
//    WF_API=http://127.0.0.1:3017/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-phase9-booking-integrity-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = process.env.WF_API || 'http://127.0.0.1:3017/api';
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };
const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};
const RUN = process.pid.toString(36) + Math.random().toString(36).slice(2, 8);
const openDb = (rw) => new Database(process.env.WF_DB, rw ? {} : { readonly: true });

// A date far enough ahead to clear the 1h lead time, expressed as the studio's
// wall clock. Built from UTC parts so the fixture does not drift with the host.
const p2 = (n) => String(n).padStart(2, '0');
const dayAhead = (n) => {
  const d = new Date(Date.now() + n * 86400000);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
};

(async () => {
  const A = (await j('POST', '/auth/register', null, { email: `bi-a-${RUN}@test.local`, password: 'pw123456', businessName: 'Integrity Studio' })).d;
  assert(A?.token, 'could not register - is the server up on ' + API + ' ?');
  const WS = A.user.workspace_id;
  const slug = 'integrity-' + RUN;

  // Open all week, 08:00-20:00, with two services of DIFFERENT durations - which
  // is the whole point: an exact-start guard cannot see the overlap between them.
  const setup = await j('PUT', '/booking/settings', A.token, {
    slug,
    settings: {
      services: [
        { name: 'Wedding day', duration: 240, price: 250000 },
        { name: 'Mini session', duration: 30, price: 15000 },
      ],
      availability: { 0: [8, 20], 1: [8, 20], 2: [8, 20], 3: [8, 20], 4: [8, 20], 5: [8, 20], 6: [8, 20] },
      slot_min: 30, days_ahead: 60, buffer_min: 0,
      timezone: 'Asia/Karachi',
    },
  });
  assert.strictEqual(setup.status, 200, 'settings failed: ' + JSON.stringify(setup.d));

  const DAY = dayAhead(4);
  const book = (service, at, name, phone) =>
    j('POST', `/booking/public/${slug}`, null, { service, start_at: `${DAY} ${at}:00`, name, phone });

  await check('the studio timezone is accepted and stored', async () => {
    const r = await j('GET', '/booking/settings', A.token);
    assert.strictEqual(r.d.settings.timezone, 'Asia/Karachi', 'the zone was dropped');
  });

  await check('a junk timezone is refused rather than silently ignored', async () => {
    // It used to be free text nobody read. It is load-bearing now.
    const r = await j('PUT', '/booking/settings', A.token, { slug, settings: { timezone: 'Mars/Olympus' } });
    assert.strictEqual(r.status, 400, 'an unusable zone was accepted (status ' + r.status + ')');
    const still = await j('GET', '/booking/settings', A.token);
    assert.strictEqual(still.d.settings.timezone, 'Asia/Karachi', 'the good zone was overwritten by a bad one');
  });

  await check('a first booking succeeds', async () => {
    const r = await book('Wedding day', '09:00', 'Ayesha', '923005551111');
    assert.strictEqual(r.status, 200, 'first booking failed: ' + JSON.stringify(r.d));
  });

  await check('THE BUG: a session INSIDE the four-hour wedding is refused', async () => {
    // 09:00 + 240min runs to 13:00. A 30-minute session at 10:00 sits squarely
    // inside it, and the exact-start guard let it through.
    const r = await book('Mini session', '10:00', 'Overlapper', '923005552222');
    assert.strictEqual(r.status, 409, `an overlapping booking was accepted (status ${r.status}): ` + JSON.stringify(r.d));
    const db = openDb();
    const n = db.prepare("SELECT COUNT(*) n FROM bookings WHERE workspace_id = ? AND status != 'cancelled'").get(WS).n;
    db.close();
    assert.strictEqual(n, 1, `the studio is double-booked: ${n} live bookings`);
  });

  await check('a booking that STRADDLES the end of the wedding is refused', async () => {
    // 12:30 + 30min ends at 13:00 — starts inside, so it overlaps.
    const r = await book('Mini session', '12:30', 'Straddler', '923005553333');
    assert.strictEqual(r.status, 409, 'a straddling booking was accepted: ' + JSON.stringify(r.d));
  });

  await check('a booking that ENDS exactly when the wedding starts is allowed', async () => {
    // 08:30 + 30min = 09:00. Touching is not overlapping; refusing this would
    // make the guard useless in the other direction.
    const r = await book('Mini session', '08:30', 'Before', '923005554444');
    assert.strictEqual(r.status, 200, 'a non-overlapping booking was wrongly refused: ' + JSON.stringify(r.d));
  });

  await check('a booking AFTER the wedding ends is allowed', async () => {
    const r = await book('Mini session', '13:00', 'After', '923005555555');
    assert.strictEqual(r.status, 200, 'a clear slot was refused: ' + JSON.stringify(r.d));
  });

  await check('a time the studio never offered is refused, not silently taken', async () => {
    // The endpoint accepted ANY start_at. Opening hours are 08:00-20:00.
    const r = await j('POST', `/booking/public/${slug}`, null, { service: 'Mini session', start_at: `${DAY} 03:00:00`, name: 'Night', phone: '923005556666' });
    assert.strictEqual(r.status, 409, 'a 3am booking outside opening hours was accepted: ' + JSON.stringify(r.d));
    assert(/hours|closed/i.test(r.d.error || ''), 'the refusal does not say why: ' + r.d.error);
  });

  await check('a booking that would run past closing is refused', async () => {
    // A four-hour wedding starting at 18:00 would end at 22:00; they close at 20:00.
    const r = await j('POST', `/booking/public/${slug}`, null, { service: 'Wedding day', start_at: `${DAY} 18:00:00`, name: 'Late', phone: '923005557777' });
    assert.strictEqual(r.status, 409, 'a booking running past closing was accepted: ' + JSON.stringify(r.d));
  });

  await check('a booking in the past is refused', async () => {
    const past = `${dayAhead(-2)} 10:00:00`;
    const r = await j('POST', `/booking/public/${slug}`, null, { service: 'Mini session', start_at: past, name: 'Past', phone: '923005558888' });
    assert.strictEqual(r.status, 409, 'a booking in the past was accepted: ' + JSON.stringify(r.d));
  });

  await check('a blackout day is refused', async () => {
    const off = dayAhead(6);
    await j('PUT', '/booking/settings', A.token, { slug, settings: { blackout: [off] } });
    const r = await j('POST', `/booking/public/${slug}`, null, { service: 'Mini session', start_at: `${off} 10:00:00`, name: 'Closed', phone: '923005559999' });
    assert.strictEqual(r.status, 409, 'a booking on a blackout day was accepted: ' + JSON.stringify(r.d));
  });

  await check('the slot list never offers a time the guard would refuse', async () => {
    // This is the property that matters: what the page shows and what the server
    // accepts must be the same calendar. They were computed two different ways.
    const pub = (await j('GET', `/booking/public/${slug}`, null)).d;
    const day = (pub.slots || []).find((s) => s.date === DAY);
    assert(day, 'no slots offered for the test day at all');
    for (const t of day.times) {
      const hhmm = t.slice(11, 16);
      // Everything inside the 09:00-13:00 wedding must be absent from the offer.
      assert(!(hhmm >= '09:00' && hhmm < '13:00'),
        `a slot inside an existing booking is still being offered: ${t}`);
    }
  });

  await check('concurrent bookers cannot both win the same slot', async () => {
    // Check-then-insert outside a transaction left a window where two requests
    // both passed the guard. The claim is transactional now.
    const day = dayAhead(9);
    const at = `${day} 15:00:00`;
    const results = await Promise.all([1, 2, 3, 4, 5].map((i) =>
      j('POST', `/booking/public/${slug}`, null, { service: 'Mini session', start_at: at, name: 'Racer ' + i, phone: '9230066600' + i })));
    const ok = results.filter((r) => r.status === 200).length;
    assert.strictEqual(ok, 1, `${ok} of 5 concurrent bookers got the same slot`);
    const db = openDb();
    const n = db.prepare("SELECT COUNT(*) n FROM bookings WHERE workspace_id = ? AND start_at = ? AND status != 'cancelled'").get(WS, at).n;
    db.close();
    assert.strictEqual(n, 1, `${n} bookings exist for one slot`);
  });

  await check('rescheduling onto an occupied slot is refused', async () => {
    const db = openDb();
    const b = db.prepare("SELECT token FROM bookings WHERE workspace_id = ? AND name = 'After'").get(WS);
    db.close();
    assert(b?.token, 'fixture booking missing');
    // 10:00 is inside the wedding.
    const r = await j('POST', `/booking/manage/${b.token}/reschedule`, null, { start_at: `${DAY} 10:00:00` });
    assert.strictEqual(r.status, 409, 'a reschedule onto an occupied slot was accepted: ' + JSON.stringify(r.d));
  });

  await check('rescheduling onto a FREE slot still works', async () => {
    // The guard must exclude the booking being moved, or it collides with itself.
    const db = openDb();
    const b = db.prepare("SELECT token, start_at FROM bookings WHERE workspace_id = ? AND name = 'After'").get(WS);
    db.close();
    const r = await j('POST', `/booking/manage/${b.token}/reschedule`, null, { start_at: `${DAY} 16:00:00` });
    assert.strictEqual(r.status, 200, 'a valid reschedule was refused: ' + JSON.stringify(r.d));
  });

  await check('rescheduling to the SAME time is not blocked by the booking itself', async () => {
    const db = openDb();
    const b = db.prepare("SELECT token, start_at FROM bookings WHERE workspace_id = ? AND name = 'After'").get(WS);
    db.close();
    const r = await j('POST', `/booking/manage/${b.token}/reschedule`, null, { start_at: b.start_at });
    assert.strictEqual(r.status, 200, 'a booking collided with itself: ' + JSON.stringify(r.d));
  });

  await check('an internal meeting blocks the public booker at the SAME REAL MOMENT', async () => {
    // availability.toMs read the naive booking as server-local and the ISO meeting
    // as a true instant, so for a Karachi studio they sat five hours apart and the
    // two systems could sell the same hour.
    const lead = (await j('POST', '/leads', A.token, { customer_name: 'Meeting Client', customer_phone: '923007770000', status: 'New' })).d;
    const day = dayAhead(12);
    // 14:00 in Karachi (UTC+5) is 09:00Z.
    const db = openDb(true);
    db.prepare(`INSERT INTO meetings (id, workspace_id, lead_id, user_id, provider, title, starts_at, ends_at, status)
                VALUES (?,?,?,?,'google','Planning call',?,?,'scheduled')`)
      .run('mtg-' + RUN, WS, lead.id, A.user.id, `${day}T09:00:00.000Z`, `${day}T10:00:00.000Z`);
    db.close();

    const r = await j('POST', `/booking/public/${slug}`, null, { service: 'Mini session', start_at: `${day} 14:00:00`, name: 'Clash', phone: '923007771111' });
    assert.strictEqual(r.status, 409, 'a client self-booked the hour the studio had blocked for a meeting: ' + JSON.stringify(r.d));

    // ...and a genuinely free hour that day is still bookable.
    const ok = await j('POST', `/booking/public/${slug}`, null, { service: 'Mini session', start_at: `${day} 17:00:00`, name: 'Fine', phone: '923007772222' });
    assert.strictEqual(ok.status, 200, 'the meeting blocked an unrelated hour too: ' + JSON.stringify(ok.d));
  });

  await check('the studio is told what time it is in THEIR clock, not the server’s', async () => {
    // The confirmation message and history line rendered with toLocaleString(),
    // i.e. the Node process's zone. A Karachi studio on a UTC box texted clients
    // times five hours out.
    // Tie the assertion to a SPECIFIC booking: created_at is second-granular and
    // several fixtures share a second, so "the latest row" is ambiguous.
    const db = openDb();
    const b = db.prepare("SELECT lead_id, start_at FROM bookings WHERE workspace_id = ? AND name = 'Fine'").get(WS);
    const row = b && db.prepare("SELECT description FROM contact_history WHERE lead_id = ? AND type = 'booking' AND description LIKE 'Booked%' LIMIT 1").get(b.lead_id);
    db.close();
    assert(b, 'the 17:00 fixture booking is missing');
    assert(row, 'no booking history line was written for it');
    // Booked at 17:00 studio time. Rendered in the SERVER's clock (UTC) that would
    // read 12:00 PM — five hours out, which is exactly what clients were told.
    assert(/5:00\s*PM/i.test(row.description),
      `the studio clock is not what was recorded (start_at ${b.start_at}): ` + row.description);
    assert(!/12:00\s*PM/i.test(row.description), 'the server clock leaked into the client-facing text');
  });

  await check('the admin list is given the zone it must render in', async () => {
    const r = await j('GET', '/booking/list', A.token);
    assert.strictEqual(r.d.timezone, 'Asia/Karachi', 'the bookings list cannot know which clock to show');
  });

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
