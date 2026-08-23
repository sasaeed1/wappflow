'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 7 — the Universal Timeline, over one activity spine.
//
//  activity_timeline had four writers in the whole codebase, so the "unified"
//  timeline showed messages, notes and meetings while contracts, invoices,
//  payments, bookings, orders and deliveries were absent from it entirely: the
//  CRM could not tell you the story of a client it had been managing for a year.
//  Worse, media-studio wrote BOTH an activity row and a history row, and the
//  endpoint read both tables, so every media event appeared twice.
//
//  Everything now arrives through addContactHistory, which feeds the spine, and
//  the endpoint reads the spine only. These checks drive real endpoints and then
//  read the feed the way the screen does, because "the booking shows up on the
//  client's timeline" is the behaviour that matters, not which table it took.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3014 node server.js &
//    WF_API=http://127.0.0.1:3014/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-phase7-activity-spine-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = process.env.WF_API || 'http://127.0.0.1:3014/api';
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
  const A = (await j('POST', '/auth/register', null, { email: `sp-a-${RUN}@test.local`, password: 'pw123456', businessName: 'Spine Studio' })).d;
  const B = (await j('POST', '/auth/register', null, { email: `sp-b-${RUN}@test.local`, password: 'pw123456', businessName: 'Rival Studio' })).d;
  assert(A?.token && B?.token, 'could not register - is the server up on ' + API + ' ?');

  const lead = (await j('POST', '/leads', A.token, { customer_name: 'Bilal Ahmed', customer_phone: '923005554444', status: 'New' })).d;
  const timeline = async (tok, id) => ((await j('GET', `/leads/${id || lead.id}/timeline`, tok)).d || {}).timeline || [];
  const titles = (t) => t.map((x) => String(x.title || '')).join(' | ');

  await check('a lead has a timeline the moment it exists, without being asked twice', async () => {
    // The tab used to render empty above "Click Refresh Timeline to load all
    // activity" - the endpoint has to return the story on the first call.
    const t = await timeline(A.token);
    assert(Array.isArray(t), 'the timeline endpoint did not return a feed');
    assert(t.length > 0, 'a newly created lead has an empty story: ' + JSON.stringify(t));
  });

  await check('winning the deal is on the timeline', async () => {
    await j('PUT', `/leads/${lead.id}/status`, A.token, { status: 'Closed - Won' });
    const t = await timeline(A.token);
    assert(/won|client/i.test(titles(t)), 'closing a deal left no trace: ' + titles(t));
  });

  await check('an invoice is on the timeline', async () => {
    await j('POST', '/invoices', A.token, { lead_id: lead.id, customer_name: 'Bilal Ahmed', items: [], total: 5000 });
    const t = await timeline(A.token);
    const row = t.find((x) => /Invoice .* created/i.test(x.title || ''));
    assert(row, 'an invoice raised for this client is not in their story: ' + titles(t));
    assert.strictEqual(row.activity_type, 'invoice', 'the invoice event is untyped, so it renders as a generic dot');
  });

  await check('a shoot is on the timeline, ONCE', async () => {
    // media-studio used to write the activity row AND a history row, and the
    // endpoint read both tables - so every media event was listed twice.
    const p = await j('POST', '/media/projects', A.token, { lead_id: lead.id, title: 'Bilal — engagement' });
    assert.strictEqual(p.status, 201, JSON.stringify(p.d));
    const t = await timeline(A.token);
    const hits = t.filter((x) => /Shoot created: Bilal — engagement/.test(x.title || ''));
    assert(hits.length > 0, 'the shoot is not on the timeline: ' + titles(t));
    assert.strictEqual(hits.length, 1, `the shoot appears ${hits.length} times - the feed is double-counting`);
  });

  await check('a booking is on the timeline and is typed as a booking', async () => {
    // booking-6: booking activity used to be visually indistinguishable, because
    // it arrived with no type for the UI to key an icon or colour off.
    await j('PUT', '/booking/settings', A.token, {
      slug: 'spine-' + RUN,
      settings: { services: [{ name: 'Engagement session', duration: 60, price: 0 }], availability: { 0: [0, 24], 1: [0, 24], 2: [0, 24], 3: [0, 24], 4: [0, 24], 5: [0, 24], 6: [0, 24] }, slot_min: 60, days_ahead: 60 },
    });
    const d = new Date(Date.now() + 5 * 86400000);
    const p = (n) => String(n).padStart(2, '0');
    const at = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} 11:00:00`;
    const r = await j('POST', `/booking/public/spine-${RUN}`, null, { service: 'Engagement session', start_at: at, name: 'Bilal Ahmed', phone: '923005554444' });
    assert.strictEqual(r.status, 200, 'booking failed: ' + JSON.stringify(r.d));

    const t = await timeline(A.token);
    const row = t.find((x) => /^Booked /.test(x.title || ''));
    assert(row, 'the booking is not on the client timeline: ' + titles(t));
    assert.strictEqual(row.activity_type, 'booking', 'the booking arrives untyped and renders as a generic dot');
  });

  await check('every timeline entry carries the type the UI keys off', async () => {
    const t = await timeline(A.token);
    const untyped = t.filter((x) => !x.activity_type);
    assert.deepStrictEqual(untyped, [], 'entries with no type render as generic grey dots: ' + JSON.stringify(untyped.slice(0, 3)));
  });

  await check('the feed is one row per event, not one per table it touched', async () => {
    const t = await timeline(A.token);
    const seen = new Map();
    for (const x of t) {
      const key = `${x.activity_type}::${x.title}::${x.created_at}`;
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    assert.deepStrictEqual(dupes, [], 'the same event is listed more than once: ' + JSON.stringify(dupes));
  });

  await check('history written before the spine existed is not lost', async () => {
    // Rows that predate the cutover live only in contact_history. The boot
    // backfill folds them in; without it a studio would open a client of two
    // years and see nothing before today.
    const db = openDb(true);
    db.prepare("INSERT INTO contact_history (id, lead_id, user_id, type, description, created_at) VALUES (?,?,?,?,?,?)")
      .run('legacy-' + RUN, lead.id, A.user.id, 'note', 'LEGACY row from before the spine', '2020-01-01 09:00:00');
    // Simulate a fresh boot running the backfill for the first time.
    db.prepare("DELETE FROM app_meta WHERE key = 'backfill_history_to_activity'").run();
    const r = db.prepare(`
      INSERT INTO activity_timeline (id, lead_id, workspace_id, user_id, actor_name, activity_type, title, metadata, created_at)
      SELECT lower(hex(randomblob(16))), h.lead_id, l.workspace_id, h.user_id, NULL,
             COALESCE(h.type, 'note'), h.description, h.metadata, h.created_at
      FROM contact_history h JOIN leads l ON l.id = h.lead_id
      WHERE h.description IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM activity_timeline a WHERE a.lead_id = h.lead_id AND a.title = h.description AND a.created_at = h.created_at)
    `).run();
    db.close();
    assert(r.changes >= 1, 'the backfill did not pick up the legacy row');

    const t = await timeline(A.token);
    assert(/LEGACY row from before the spine/.test(titles(t)), 'legacy history never reached the timeline');
  });

  await check('running the backfill again does not duplicate anything', async () => {
    const before = (await timeline(A.token)).length;
    const db = openDb(true);
    db.prepare(`
      INSERT INTO activity_timeline (id, lead_id, workspace_id, user_id, actor_name, activity_type, title, metadata, created_at)
      SELECT lower(hex(randomblob(16))), h.lead_id, l.workspace_id, h.user_id, NULL,
             COALESCE(h.type, 'note'), h.description, h.metadata, h.created_at
      FROM contact_history h JOIN leads l ON l.id = h.lead_id
      WHERE h.description IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM activity_timeline a WHERE a.lead_id = h.lead_id AND a.title = h.description AND a.created_at = h.created_at)
    `).run();
    db.close();
    const after = (await timeline(A.token)).length;
    assert.strictEqual(after, before, `re-running the backfill added ${after - before} duplicate row(s)`);
  });

  await check('another tenant cannot read your client story', async () => {
    const r = await j('GET', `/leads/${lead.id}/timeline`, B.token);
    assert.strictEqual(r.status, 404, 'a rival tenant read the timeline (status ' + r.status + ')');
  });

  await check('activity rows are stamped with the workspace they belong to', async () => {
    const db = openDb();
    const orphans = db.prepare('SELECT COUNT(*) n FROM activity_timeline WHERE lead_id = ? AND workspace_id IS NULL').get(lead.id).n;
    db.close();
    assert.strictEqual(orphans, 0, `${orphans} activity row(s) landed with no tenant`);
  });

  await check('Analytics reports money the studio actually received', async () => {
    // total_sales summed leads.actual_sale - a number typed on the deal record -
    // so a studio could collect a year of revenue and see zero, or see a figure
    // nobody ever paid. The ledger is now reported beside the estimate.
    const before = (await j('GET', '/analytics', A.token)).d;
    assert.strictEqual(typeof before.collected, 'number', 'Analytics still has no notion of money received');
    assert.strictEqual(typeof before.outstanding, 'number', 'Analytics cannot say what is owed');

    const inv = (await j('POST', '/invoices', A.token, { lead_id: lead.id, customer_name: 'Bilal Ahmed', items: [], total: 12000 })).d.invoice;
    const owed = (await j('GET', '/analytics', A.token)).d;
    assert.strictEqual(owed.outstanding - before.outstanding, 12000, 'an unpaid invoice did not move Outstanding');
    assert.strictEqual(owed.collected, before.collected, 'an UNPAID invoice was counted as collected');

    await j('POST', `/payments/invoice/${inv.id}/mark-paid`, A.token, {});
    const paid = (await j('GET', '/analytics', A.token)).d;
    assert.strictEqual(paid.collected - before.collected, 12000, 'settling an invoice did not move Collected');
    assert.strictEqual(paid.outstanding, before.outstanding, 'a settled invoice is still counted as owed');
  });

  await check('Analytics counts contracts and upcoming bookings', async () => {
    const a = (await j('GET', '/analytics', A.token)).d;
    assert.strictEqual(typeof a.contracts_signed, 'number', 'contracts are invisible to Analytics');
    assert.strictEqual(typeof a.contracts_awaiting, 'number', 'pending signatures are invisible to Analytics');
    assert(a.bookings_upcoming >= 1, 'the booking made above is not counted as upcoming: ' + a.bookings_upcoming);
  });

  await check('Analytics money never crosses a tenant boundary', async () => {
    const mine = (await j('GET', '/analytics', A.token)).d;
    const theirs = (await j('GET', '/analytics', B.token)).d;
    assert.strictEqual(theirs.collected, 0, 'a rival tenant sees your revenue: ' + theirs.collected);
    assert.strictEqual(theirs.outstanding, 0, 'a rival tenant sees your receivables');
    assert(mine.collected > 0, 'the fixture collected nothing, so this proves nothing');
  });

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
