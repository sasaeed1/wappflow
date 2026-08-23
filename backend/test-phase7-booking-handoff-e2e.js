'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 7 — a booking is no longer a dead end.
//
//  Taking an appointment used to be the end of the chain: the studio then
//  re-typed the same client into Media Studio to make a shoot, and again into an
//  invoice. Nothing linked the three, so a booking, its shoot and its invoice
//  were three unrelated rows about one afternoon.
//
//  These checks drive the real endpoints, because what matters is that the
//  records come out LINKED and that a second click does not quietly create a
//  duplicate - both behaviours, not spellings.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3012 node server.js &
//    WF_API=http://127.0.0.1:3012/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-phase7-booking-handoff-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = process.env.WF_API || 'http://127.0.0.1:3012/api';
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

(async () => {
  const A = (await j('POST', '/auth/register', null, { email: `bk-a-${RUN}@test.local`, password: 'pw123456', businessName: 'Studio A' })).d;
  const B = (await j('POST', '/auth/register', null, { email: `bk-b-${RUN}@test.local`, password: 'pw123456', businessName: 'Studio B' })).d;
  assert(A?.token && B?.token, 'could not register - is the server up on ' + API + ' ?');

  // A public booking page with two services: one that IS a shoot, one that is not.
  const slug = 'studio-a-' + RUN;
  await j('PUT', '/booking/settings', A.token, {
    slug,
    settings: {
      services: [
        { name: 'Discovery call', duration: 30, price: 0 },
        { name: 'Wedding day', duration: 480, price: 250000, creates_shoot: true },
      ],
      availability: { 0: [0, 24], 1: [0, 24], 2: [0, 24], 3: [0, 24], 4: [0, 24], 5: [0, 24], 6: [0, 24] },
      slot_min: 30, days_ahead: 60,
    },
  });

  // Two future slots, far apart, written in the studio-LOCAL naive shape the
  // module stores. Built from UTC parts so the fixture does not drift with the
  // machine's own timezone.
  const stamp = (daysAhead, hour) => {
    const d = new Date(Date.now() + daysAhead * 86400000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(hour)}:00:00`;
  };
  const callAt = stamp(3, 10);
  const weddingAt = stamp(9, 9);

  const book = (service, start_at, name, phone) =>
    j('POST', `/booking/public/${slug}`, null, { service, start_at, name, phone });

  let callBooking, weddingBooking;

  await check('a public booking still creates the contact and the appointment', async () => {
    const r = await book('Discovery call', callAt, 'Nadia Iqbal', '923005551111');
    assert.strictEqual(r.status, 200, 'booking failed: ' + JSON.stringify(r.d));
    const list = (await j('GET', '/booking/list', A.token)).d;
    callBooking = (list.bookings || []).find((b) => b.service === 'Discovery call');
    assert(callBooking, 'the booking is not in the studio list');
    assert(callBooking.lead_id, 'the booking is not linked to a contact');
  });

  await check('a service marked "is a shoot" creates the shoot at booking time', async () => {
    const r = await book('Wedding day', weddingAt, 'Hamza Ali', '923005552222');
    assert.strictEqual(r.status, 200, 'booking failed: ' + JSON.stringify(r.d));
    const list = (await j('GET', '/booking/list', A.token)).d;
    weddingBooking = (list.bookings || []).find((b) => b.service === 'Wedding day');
    assert(weddingBooking, 'the wedding booking is missing');
    assert(weddingBooking.project_id, 'a service declared a shoot but no shoot was created');

    const db = openDb();
    const proj = db.prepare('SELECT lead_id, shoot_date, workspace_id FROM ms_projects WHERE id = ?').get(weddingBooking.project_id);
    db.close();
    assert.strictEqual(proj.lead_id, weddingBooking.lead_id, 'the shoot is not linked to the booking contact');
    assert.strictEqual(proj.shoot_date, weddingAt.slice(0, 10), 'the shoot date does not match the appointment');
  });

  await check('an ordinary service does NOT create a shoot', async () => {
    // Auto-creating a Media Studio project for every 15-minute call would bury the
    // real shoots, which is why this is opt-in per service.
    assert(!callBooking.project_id, 'a discovery call created a shoot');
  });

  await check('the studio can turn any booking into a shoot on demand', async () => {
    const r = await j('POST', `/booking/${callBooking.id}/handoff`, A.token, { target: 'shoot' });
    assert.strictEqual(r.status, 200, 'handoff failed: ' + JSON.stringify(r.d));
    assert(r.d.url && r.d.url.startsWith('/studio/'), 'no destination returned: ' + JSON.stringify(r.d));
    const db = openDb();
    const proj = db.prepare('SELECT lead_id FROM ms_projects WHERE id = ?').get(r.d.id);
    db.close();
    assert.strictEqual(proj.lead_id, callBooking.lead_id, 'the shoot is not linked to the booking contact');
  });

  await check('clicking it twice opens the first shoot instead of making a second', async () => {
    const first = (await j('GET', '/booking/list', A.token)).d.bookings.find((b) => b.id === callBooking.id);
    const r = await j('POST', `/booking/${callBooking.id}/handoff`, A.token, { target: 'shoot' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.d.id, first.project_id, 'a duplicate shoot was created for the same appointment');
    assert(r.d.existing, 'the response does not say it already existed');
    const db = openDb();
    const n = db.prepare('SELECT COUNT(*) n FROM ms_projects WHERE lead_id = ?').get(callBooking.lead_id).n;
    db.close();
    assert.strictEqual(n, 1, 'more than one shoot exists for this contact');
  });

  await check('a booking raises an invoice for the same contact, once', async () => {
    const r = await j('POST', `/booking/${callBooking.id}/handoff`, A.token, { target: 'invoice' });
    assert.strictEqual(r.status, 200, 'invoice handoff failed: ' + JSON.stringify(r.d));
    const db = openDb();
    const inv = db.prepare('SELECT lead_id, invoice_number, workspace_id FROM invoices WHERE id = ?').get(r.d.id);
    db.close();
    assert.strictEqual(inv.lead_id, callBooking.lead_id, 'the invoice is not linked to the booking contact');
    assert(inv.invoice_number, 'the invoice got no number - it skipped the shared creator');

    const again = await j('POST', `/booking/${callBooking.id}/handoff`, A.token, { target: 'invoice' });
    assert.strictEqual(again.d.id, r.d.id, 'a second invoice was raised for the same booking');
  });

  await check('invoice numbering stays one sequence however the invoice is raised', async () => {
    // The store, the booking handoff and the invoices screen all share one creator
    // precisely so two customers cannot receive the same invoice number.
    const direct = await j('POST', '/invoices', A.token, { customer_name: 'Walk-in', items: [], total: 0 });
    assert.strictEqual(direct.status, 201, JSON.stringify(direct.d));
    const db = openDb();
    const rows = db.prepare('SELECT invoice_number FROM invoices WHERE workspace_id = ?').all(A.user.workspace_id);
    db.close();
    const nums = rows.map((r) => r.invoice_number);
    assert.strictEqual(new Set(nums).size, nums.length, 'duplicate invoice numbers: ' + nums.join(', '));
  });

  await check('another tenant cannot hand off your booking', async () => {
    const r = await j('POST', `/booking/${weddingBooking.id}/handoff`, B.token, { target: 'shoot' });
    assert.strictEqual(r.status, 404, 'a rival tenant reached your booking (status ' + r.status + ')');
  });

  await check('an unknown handoff target is refused rather than half-done', async () => {
    const r = await j('POST', `/booking/${callBooking.id}/handoff`, A.token, { target: 'spaceship' });
    assert.strictEqual(r.status, 400, 'an unknown target returned ' + r.status);
  });

  await check('cancelling tells the client and clears the appointment', async () => {
    const r = await j('POST', `/booking/${weddingBooking.id}/cancel`, A.token);
    assert.strictEqual(r.status, 200, 'cancel failed: ' + JSON.stringify(r.d));
    const list = (await j('GET', '/booking/list', A.token)).d.bookings || [];
    assert(!list.some((b) => b.id === weddingBooking.id), 'a cancelled booking is still listed as upcoming');
    const db = openDb();
    const hist = db.prepare("SELECT COUNT(*) n FROM contact_history WHERE lead_id = ? AND type = 'booking' AND description LIKE 'Cancelled%'").get(weddingBooking.lead_id).n;
    db.close();
    assert(hist >= 1, 'the studio cancelling left no trace on the contact record');
  });

  await check('cancelling a booking that is not yours does nothing', async () => {
    const r = await j('POST', `/booking/${callBooking.id}/cancel`, B.token);
    assert.strictEqual(r.status, 404, 'a rival tenant cancelled your booking (status ' + r.status + ')');
    const list = (await j('GET', '/booking/list', A.token)).d.bookings || [];
    assert(list.some((b) => b.id === callBooking.id), 'the booking was cancelled by the other tenant');
  });

  await check('the shoot knows who its client is, on the detail route too', async () => {
    // The list route always joined the lead; the detail route did not, so the
    // project page rendered a client name that was never sent.
    const list = (await j('GET', '/booking/list', A.token)).d.bookings || [];
    const withShoot = list.find((b) => b.project_id);
    const proj = (await j('GET', `/media/projects/${withShoot.project_id}`, A.token)).d;
    assert(proj.lead_id, 'the shoot lost its CRM link');
    assert(proj.client_name, 'the detail route still does not return client_name');
  });

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
