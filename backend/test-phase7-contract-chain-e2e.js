'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 7 — what happens after a client signs.
//
//  Signing is the moment the chain should carry on by itself, and instead it
//  stopped dead. The contract automations existed but each one had hand-rolled
//  its own near-copy of a creator that lives elsewhere:
//
//    * create_invoice was a FOURTH copy of invoice creation, and it inserted no
//      workspace_id at all - contract-generated invoices landed with a null
//      tenant, surviving only on the legacy owner-id fallback.
//    * create_project was a THIRD copy of shoot creation. It skipped the lead
//      check, the timeline entry, the audit row and the broadcast, so a shoot
//      born from a signed contract never appeared in the client's story or on
//      anyone's screen.
//    * nothing led to a BOOKING, though signing is exactly when a client is
//      most willing to commit to a date.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3015 node server.js &
//    WF_API=http://127.0.0.1:3015/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-phase7-contract-chain-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = process.env.WF_API || 'http://127.0.0.1:3015/api';
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
// The sign route requires a drawn signature as well as a typed name - a 1x1 PNG
// stands in for the canvas the client scribbles on.
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  const A = (await j('POST', '/auth/register', null, { email: `cc-a-${RUN}@test.local`, password: 'pw123456', businessName: 'Chain Studio' })).d;
  assert(A?.token, 'could not register - is the server up on ' + API + ' ?');
  const WS = A.user.workspace_id;

  // A public booking page must exist for the booking-link handoff to have a target.
  await j('PUT', '/booking/settings', A.token, {
    slug: 'chain-' + RUN,
    settings: { services: [{ name: 'Wedding day', duration: 480, price: 250000 }], availability: { 1: [9, 17] }, slot_min: 60, days_ahead: 60 },
  });

  const lead = (await j('POST', '/leads', A.token, { customer_name: 'Zara Sheikh', customer_phone: '923005556666', email: 'zara@test.local', status: 'New' })).d;

  // A contract with a priced block, and every handoff switched on.
  const doc = (await j('POST', '/cs/documents', A.token, {
    lead_id: lead.id, title: 'Wedding Agreement — Zara', type: 'contract',
    blocks: [{ type: 'pricing_table', data: { currency: 'PKR', rows: [{ name: 'Full day coverage', price: 250000 }] } }],
    settings: {
      automations: { move_pipeline: true, pipeline_stage: 'Closed - Won', create_invoice: true, create_project: true, send_booking_link: true },
    },
  })).d;
  assert(doc?.id, 'contract not created: ' + JSON.stringify(doc));

  // Send it so a public signing token exists, then sign as the client.
  const db0 = openDb(true);
  db0.prepare("UPDATE cs_documents SET status = 'sent', token = ? WHERE id = ?").run('sign-' + RUN, doc.id);
  const signer = db0.prepare('SELECT id FROM cs_signers WHERE document_id = ?').get(doc.id);
  db0.close();
  assert(signer, 'the contract has no client signer seeded from the lead');

  await check('a client can sign, and the document completes', async () => {
    const r = await j('POST', `/cs/public/sign-${RUN}/sign`, null, { signer_id: signer.id, typed_name: 'Zara Sheikh', consent: true, signature_data: SIG });
    assert.strictEqual(r.status, 200, 'signing failed: ' + JSON.stringify(r.d));
    assert(['signed', 'completed'].includes(r.d.status), 'unexpected status after signing: ' + r.d.status);
  });

  await check('signing raises an invoice that belongs to a WORKSPACE', async () => {
    // The old copy inserted (id, user_id, lead_id, ...) with no workspace_id, so
    // the invoice was invisible to every workspace-scoped query and only the
    // legacy owner-id fallback kept it reachable at all.
    const db = openDb();
    const inv = db.prepare("SELECT * FROM invoices WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1").get(lead.id);
    db.close();
    assert(inv, 'signing raised no invoice');
    assert.strictEqual(inv.workspace_id, WS, 'the invoice landed with no tenant: ' + JSON.stringify(inv.workspace_id));
    assert(inv.invoice_number, 'the invoice got no number');
    assert.strictEqual(inv.total, 250000, 'the invoice total does not match the contract: ' + inv.total);
  });

  await check('that invoice is visible on the invoices screen, not just in the table', async () => {
    const r = await j('GET', '/invoices', A.token);
    const list = r.d.invoices || r.d || [];
    assert(list.some((i) => i.lead_id === lead.id && i.total === 250000),
      'the contract invoice is missing from the list the studio actually looks at');
  });

  await check('signing opens a shoot that is linked, audited and announced', async () => {
    const db = openDb();
    const proj = db.prepare('SELECT * FROM ms_projects WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1').get(lead.id);
    const audit = db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE workspace_id = ? AND entity_type = 'ms_project'").get(WS).n;
    db.close();
    assert(proj, 'signing opened no shoot');
    assert.strictEqual(proj.workspace_id, WS, 'the shoot landed in the wrong workspace');
    assert.strictEqual(proj.lead_id, lead.id, 'the shoot is not linked to the client');
    assert(audit >= 1, 'the shoot was created without an audit row - it bypassed the shared creator');
  });

  await check('all three handoffs show up in the client story, once each', async () => {
    const t = ((await j('GET', `/leads/${lead.id}/timeline`, A.token)).d || {}).timeline || [];
    const titles = t.map((x) => String(x.title || ''));
    const has = (re) => titles.filter((x) => re.test(x)).length;
    assert(has(/Invoice .* created/i) === 1, 'the contract invoice is missing or doubled in the timeline: ' + titles.join(' | '));
    assert(has(/Shoot created/i) === 1, 'the contract shoot is missing or doubled in the timeline: ' + titles.join(' | '));
    assert(has(/signed/i) >= 1, 'the signature itself is not in the story');
    assert(has(/Booking link sent/i) === 1, 'the booking handoff left no trace: ' + titles.join(' | '));
  });

  await check('the client is sent somewhere they can actually pick a date', async () => {
    const db = openDb();
    const row = db.prepare("SELECT metadata FROM activity_timeline WHERE lead_id = ? AND title LIKE 'Booking link sent%'").get(lead.id);
    db.close();
    assert(row, 'no booking-link event was recorded');
    const meta = JSON.parse(row.metadata || '{}');
    assert(/\/book\/chain-/.test(meta.url || ''), 'the booking link does not point at the public booking page: ' + meta.url);
  });

  await check('the deal is moved to won and the contact becomes a client', async () => {
    const l = (await j('GET', `/leads/${lead.id}`, A.token)).d;
    const rec = l.lead || l;
    assert.strictEqual(rec.status, 'Closed - Won', 'the pipeline automation did not run: ' + rec.status);
  });

  await check('a studio with no booking page does not break signing', async () => {
    // The handoff has to degrade: a studio that never set up a public booking
    // page should still get its invoice and its shoot.
    const B = (await j('POST', '/auth/register', null, { email: `cc-b-${RUN}@test.local`, password: 'pw123456', businessName: 'No Booking Studio' })).d;
    const l2 = (await j('POST', '/leads', B.token, { customer_name: 'Omar Farooq', customer_phone: '923005557777', status: 'New' })).d;
    const d2 = (await j('POST', '/cs/documents', B.token, {
      lead_id: l2.id, title: 'Portrait Agreement', type: 'contract',
      blocks: [{ type: 'pricing_table', data: { currency: 'PKR', rows: [{ name: 'Session', price: 30000 }] } }],
      settings: { automations: { create_invoice: true, send_booking_link: true } },
    })).d;
    const db = openDb(true);
    db.prepare("UPDATE cs_documents SET status = 'sent', token = ? WHERE id = ?").run('sign2-' + RUN, d2.id);
    const s2 = db.prepare('SELECT id FROM cs_signers WHERE document_id = ?').get(d2.id);
    db.close();
    const r = await j('POST', `/cs/public/sign2-${RUN}/sign`, null, { signer_id: s2.id, typed_name: 'Omar Farooq', consent: true, signature_data: SIG });
    assert.strictEqual(r.status, 200, 'signing broke when there was no booking page: ' + JSON.stringify(r.d));
    const db2 = openDb();
    const inv = db2.prepare('SELECT workspace_id FROM invoices WHERE lead_id = ?').get(l2.id);
    db2.close();
    assert(inv, 'the invoice was lost because an unrelated handoff had nowhere to point');
    assert.strictEqual(inv.workspace_id, B.user.workspace_id, 'the invoice landed in the wrong workspace');
  });

  await check('invoice numbering is still one sequence per workspace', async () => {
    await j('POST', '/invoices', A.token, { lead_id: lead.id, customer_name: 'Zara Sheikh', items: [], total: 1000 });
    const db = openDb();
    const nums = db.prepare('SELECT invoice_number FROM invoices WHERE workspace_id = ?').all(WS).map((r) => r.invoice_number);
    db.close();
    assert(nums.length >= 2, 'not enough invoices to prove anything: ' + nums.join(', '));
    assert.strictEqual(new Set(nums).size, nums.length, 'a contract invoice collided with a manual one: ' + nums.join(', '));
  });

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
