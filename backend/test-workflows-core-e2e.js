'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  CORE WORKFLOWS — the journeys a studio actually walks, end to end.
//
//  Every other suite here tests a seam. This one tests the PRODUCT: it plays
//  through the four sequences that make up a real job, in order, the way a
//  photographer and their client would, and checks the state that should exist
//  afterwards. Its job is to catch the class of failure where every part works
//  and the whole does not.
//
//    1. Enquiry → won → client       (the CRM spine)
//    2. Contract → signed → invoice → shoot → booking link   (the handoff chain)
//    3. Shoot → gallery → delivery → client favourites → prints → payment
//    4. Booking → shoot → calendar   (the scheduling chain)
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3022 node server.js &
//    WF_API=http://127.0.0.1:3022/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-workflows-core-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = process.env.WF_API || 'http://127.0.0.1:3022/api';
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');

let pass = 0, fail = 0;
const step = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };
const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};
const RUN = process.pid.toString(36) + Math.random().toString(36).slice(2, 8);
const openDb = (rw) => new Database(process.env.WF_DB, rw ? {} : { readonly: true });
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const p2 = (n) => String(n).padStart(2, '0');
const dayAhead = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`; };

(async () => {
  const S = (await j('POST', '/auth/register', null, { email: `wf-${RUN}@test.local`, password: 'studio-password-1', businessName: 'Rehmat Studios' })).d;
  assert(S?.token, 'could not register - is the server up on ' + API + ' ?');
  const WS = S.user.workspace_id;
  const T = S.token;

  // The studio sets itself up, once, the way a new customer would.
  const db0 = openDb(true);
  db0.prepare(`INSERT INTO company_settings (id, user_id, company_name, company_logo, company_email, currency_symbol)
               VALUES (?,?,?,?,?,'Rs ') ON CONFLICT(user_id) DO UPDATE SET company_name=excluded.company_name`)
    .run('cs-' + RUN, S.user.id, 'Rehmat Studios', '/uploads/logo.png', 'hello@rehmat.pk');
  db0.close();
  await j('PUT', '/booking/settings', T, {
    slug: 'rehmat-' + RUN,
    settings: {
      services: [{ name: 'Wedding', duration: 240, price: 200000, creates_shoot: true }, { name: 'Consultation', duration: 30 }],
      availability: { 0: [8, 20], 1: [8, 20], 2: [8, 20], 3: [8, 20], 4: [8, 20], 5: [8, 20], 6: [8, 20] },
      slot_min: 60, days_ahead: 60, timezone: 'Asia/Karachi',
    },
  });
  await j('POST', '/store/products', T, { name: 'Framed print', options: [{ label: 'A3', price: 9000 }] });

  console.log('\n  ── 1. Enquiry becomes a client ─────────────────────────────');

  let lead;
  await step('an enquiry is captured as a lead', async () => {
    const r = await j('POST', '/leads', T, { customer_name: 'Sana & Bilal', customer_phone: '923005557' + RUN.slice(0, 3), email: 'sana@test.local', status: 'New' });
    assert(r.d?.id, 'the lead was not created: ' + JSON.stringify(r.d));
    lead = r.d;
  });

  await step('the studio can find them again by searching', async () => {
    const r = await j('GET', `/search?q=${encodeURIComponent('Sana')}`, T);
    assert.strictEqual(r.status, 200, 'search failed: ' + JSON.stringify(r.d));
    assert((r.d.results || []).some((x) => (x.label || '').includes('Sana')), 'the new lead is not findable: ' + JSON.stringify(r.d.results));
  });

  await step('notes and reminders attach to them', async () => {
    const n = await j('POST', `/leads/${lead.id}/notes`, T, { content: 'Wants a winter date.' });
    assert(n.status < 300, 'note failed: ' + JSON.stringify(n.d));
    const rm = await j('POST', `/leads/${lead.id}/reminders`, T, { title: 'Call back', reminder_date: `${dayAhead(2)} 10:00:00` });
    assert(rm.status < 300, 'reminder failed: ' + JSON.stringify(rm.d));
  });

  await step('winning the deal promotes them to a client, with a portal', async () => {
    const r = await j('PUT', `/leads/${lead.id}/status`, T, { status: 'Closed - Won' });
    assert.strictEqual(r.status, 200, 'status change failed: ' + JSON.stringify(r.d));
    const db = openDb();
    const l = db.prepare('SELECT is_client, client_since FROM leads WHERE id = ?').get(lead.id);
    const portal = db.prepare('SELECT token FROM client_portals WHERE lead_id = ?').get(lead.id);
    db.close();
    assert.strictEqual(l.is_client, 1, 'winning the deal did not make them a client');
    assert(l.client_since, 'client_since was not stamped');
    assert(portal?.token, 'no client portal was created at conversion');
  });

  await step('they now appear on the Clients screen, not just Leads', async () => {
    const r = await j('GET', '/leads?is_client=1', T);
    const rows = r.d.leads || r.d || [];
    assert(Array.isArray(rows) && rows.some((x) => x.id === lead.id), 'the new client is not in the client list');
  });

  console.log('\n  ── 2. Contract to money ────────────────────────────────────');

  let doc, invoiceId;
  await step('a contract is raised for that client and sent', async () => {
    const r = await j('POST', '/cs/documents', T, {
      lead_id: lead.id, title: 'Wedding Agreement', type: 'contract',
      blocks: [{ type: 'pricing_table', data: { currency: 'PKR', rows: [{ name: 'Full day', price: 200000 }] } }],
      settings: { automations: { move_pipeline: true, create_invoice: true, create_project: true, send_booking_link: true } },
    });
    assert.strictEqual(r.status, 200, 'contract create failed: ' + JSON.stringify(r.d));
    doc = r.d;
    const db = openDb(true);
    db.prepare("UPDATE cs_documents SET status = 'sent', token = ? WHERE id = ?").run('wf-doc-' + RUN, doc.id);
    db.close();
  });

  await step('the client opens it, and the studio can tell', async () => {
    const r = await j('GET', `/cs/public/wf-doc-${RUN}`, null);
    assert.strictEqual(r.status, 200, 'the client cannot open the contract: ' + JSON.stringify(r.d));
    assert(r.d.brand?.name, 'the signing page does not name the studio');
    const db = openDb();
    const st = db.prepare('SELECT status FROM cs_documents WHERE id = ?').get(doc.id).status;
    db.close();
    assert.strictEqual(st, 'viewed', 'the studio cannot tell the client opened it');
  });

  await step('the client signs it', async () => {
    const db = openDb();
    const signer = db.prepare('SELECT id FROM cs_signers WHERE document_id = ?').get(doc.id);
    db.close();
    assert(signer, 'no signer was seeded from the client record');
    const r = await j('POST', `/cs/public/wf-doc-${RUN}/sign`, null, { signer_id: signer.id, typed_name: 'Sana', consent: true, signature_data: SIG });
    assert.strictEqual(r.status, 200, 'signing failed: ' + JSON.stringify(r.d));
  });

  await step('signing raises the invoice, opens the shoot and offers a date', async () => {
    const db = openDb();
    const inv = db.prepare('SELECT id, total, workspace_id, invoice_number FROM invoices WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1').get(lead.id);
    const proj = db.prepare('SELECT id FROM ms_projects WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1').get(lead.id);
    db.close();
    assert(inv, 'no invoice was raised');
    assert.strictEqual(inv.total, 200000, 'the invoice does not match the contract: ' + inv.total);
    assert.strictEqual(inv.workspace_id, WS, 'the invoice has no workspace');
    assert(inv.invoice_number, 'the invoice has no number');
    assert(proj, 'no shoot was opened');
    invoiceId = inv.id;

    const t = ((await j('GET', `/leads/${lead.id}/timeline`, T)).d || {}).timeline || [];
    assert(t.some((x) => /Booking link sent/i.test(x.title || '')), 'the client was never offered a date');
  });

  await step('the invoice is payable, and paying it moves the money figures', async () => {
    const before = (await j('GET', '/analytics', T)).d;
    const link = await j('POST', '/payments/link', T, { kind: 'invoice', ref_id: invoiceId, lead_id: lead.id, amount: 200000, description: 'Wedding' });
    assert.strictEqual(link.status, 200, 'no pay link: ' + JSON.stringify(link.d));
    const pub = await j('GET', `/payments/public/${link.d.token}`, null);
    assert.strictEqual(pub.status, 200, 'the client cannot open the pay page');
    assert(pub.d.brand?.name, 'the pay page does not say who is asking for money');

    await j('POST', `/payments/invoice/${invoiceId}/mark-paid`, T, {});
    const after = (await j('GET', '/analytics', T)).d;
    assert.strictEqual(after.collected - before.collected, 200000, 'settling the invoice did not move Collected');
    assert(after.outstanding <= before.outstanding, 'the settled invoice is still counted as owed');
  });

  console.log('\n  ── 3. Shoot to delivery to prints ──────────────────────────');

  let project, galleryId, shareToken;
  await step('the shoot exists and knows its client', async () => {
    const r = await j('GET', '/media/projects', T);
    const list = r.d.projects || r.d || [];
    project = list.find((p) => p.lead_id === lead.id);
    assert(project, 'the shoot is not in the studio list');
    const detail = (await j('GET', `/media/projects/${project.id}`, T)).d;
    assert.strictEqual(detail.client_name, 'Sana & Bilal', 'the shoot does not name its client');
  });

  await step('photographs are delivered in a gallery', async () => {
    const g = (await j('POST', `/media/projects/${project.id}/galleries`, T, { title: 'Wedding — selects' })).d;
    galleryId = g?.gallery?.id || g?.id;
    assert(galleryId, 'the gallery was not created');
    const db = openDb(true);
    for (let i = 0; i < 3; i++) {
      db.prepare("INSERT INTO ms_assets (id, workspace_id, project_id, filename, storage_key, type) VALUES (?,?,?,?,?,'photo')")
        .run(`wf-a${i}-${RUN}`, WS, project.id, `p${i}.jpg`, `fix/p${i}.jpg`);
      db.prepare('INSERT INTO ms_gallery_assets (gallery_id, asset_id) VALUES (?,?)').run(galleryId, `wf-a${i}-${RUN}`);
    }
    db.close();
    const pubd = await j('POST', `/media/galleries/${galleryId}/publish`, T, {});
    assert.strictEqual(pubd.status, 200, 'publishing failed: ' + JSON.stringify(pubd.d));
    const db2 = openDb();
    shareToken = db2.prepare('SELECT share_token FROM ms_galleries WHERE id = ?').get(galleryId).share_token;
    db2.close();
    assert(shareToken, 'no share link was minted');
  });

  await step('the client opens the gallery and sees whose work it is', async () => {
    const r = await j('GET', `/media/portal/${shareToken}`, null);
    assert.strictEqual(r.status, 200, 'the client cannot open their gallery: ' + JSON.stringify(r.d));
    assert.strictEqual((r.d.assets || []).length, 3, 'the photographs are missing');
    assert.strictEqual(r.d.brand?.name, 'Rehmat Studios', 'the gallery does not name the studio');
    assert(r.d.portal_url, 'the gallery is a dead end — no route to the rest of their things');
  });

  await step('the client marks favourites, and the studio sees them', async () => {
    const r = await j('POST', `/media/portal/${shareToken}/favorite`, null, { asset_id: `wf-a0-${RUN}`, contact: 'sana' });
    assert(r.status < 300, 'favouriting failed: ' + JSON.stringify(r.d));
    const list = (await j('GET', `/media/projects/${project.id}/galleries`, T)).d;
    const g = (list.galleries || []).find((x) => x.id === galleryId);
    assert(g.favorite_count >= 1, 'the studio cannot see the client’s favourites');
  });

  await step('the client orders a print, and it bills them', async () => {
    const shop = await j('GET', `/store/public/${shareToken}`, null);
    assert.strictEqual(shop.status, 200, 'the shop did not open: ' + JSON.stringify(shop.d));
    const product = (shop.d.products || [])[0];
    assert(product, 'no products are for sale');

    const order = await j('POST', `/store/public/${shareToken}`, null, {
      items: [{ product_id: product.id, option: 'A3', qty: 2 }],
      name: 'Sana & Bilal', phone: '923005557' + RUN.slice(0, 3),
    });
    assert.strictEqual(order.status, 200, 'the order failed: ' + JSON.stringify(order.d));
    assert.strictEqual(order.d.total, 18000, 'server-side pricing is wrong: ' + order.d.total);
    assert(order.d.pay_url, 'the order took money details and never billed anybody');

    const db = openDb();
    const o = db.prepare('SELECT invoice_id, lead_id FROM ms_print_orders WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1').get(WS);
    db.close();
    assert(o.invoice_id, 'the order raised no invoice');
    assert.strictEqual(o.lead_id, lead.id, 'the order is not attached to the client');
  });

  await step('everything the client has is in one place', async () => {
    const db = openDb();
    const portal = db.prepare('SELECT token FROM client_portals WHERE lead_id = ?').get(lead.id);
    db.close();
    const r = await j('GET', `/client-portal/public/${portal.token}`, null);
    assert.strictEqual(r.status, 200, 'the portal did not open');
    assert.strictEqual(r.d.brand?.name, 'Rehmat Studios', 'the portal does not name the studio');
    assert((r.d.galleries || []).length >= 1, 'their gallery is not on the portal');
    assert((r.d.invoices || []).length >= 1, 'their invoices are not on the portal');
    assert((r.d.orders || []).length >= 1, 'their order is not on the portal');
    assert(r.d.links?.book, 'they cannot book again from their own portal');
  });

  console.log('\n  ── 4. Booking to shoot ─────────────────────────────────────');

  await step('a stranger books a wedding from the public page', async () => {
    const r = await j('POST', `/booking/public/rehmat-${RUN}`, null, {
      service: 'Wedding', start_at: `${dayAhead(20)} 09:00:00`, name: 'Ayesha Khan', phone: '923005558' + RUN.slice(0, 3),
    });
    assert.strictEqual(r.status, 200, 'the booking failed: ' + JSON.stringify(r.d));
    assert(r.d.manage_url, 'the client cannot manage the booking they just made');
  });

  await step('that booking created a contact AND a shoot, because the service is one', async () => {
    const list = (await j('GET', '/booking/list', T)).d;
    const b = (list.bookings || []).find((x) => x.name === 'Ayesha Khan');
    assert(b, 'the booking is not in the studio list');
    assert(b.lead_id, 'the booking created no contact');
    assert(b.project_id, 'a service marked as a shoot did not create one');
    const db = openDb();
    const proj = db.prepare('SELECT lead_id, shoot_date FROM ms_projects WHERE id = ?').get(b.project_id);
    db.close();
    assert.strictEqual(proj.lead_id, b.lead_id, 'the shoot is not linked to the booking contact');
    assert.strictEqual(proj.shoot_date, dayAhead(20), 'the shoot date does not match the booking');
  });

  await step('the studio cannot then be double-booked over it', async () => {
    const clash = await j('POST', `/booking/public/rehmat-${RUN}`, null, {
      service: 'Consultation', start_at: `${dayAhead(20)} 10:00:00`, name: 'Someone Else', phone: '923005559999',
    });
    assert.strictEqual(clash.status, 409, `an overlapping booking was accepted (status ${clash.status})`);
  });

  await step('the studio can move it, and the client is told', async () => {
    const list = (await j('GET', '/booking/list', T)).d;
    const b = (list.bookings || []).find((x) => x.name === 'Ayesha Khan');
    const r = await j('POST', `/booking/${b.id}/reschedule`, T, { start_at: `${dayAhead(21)} 09:00:00` });
    assert.strictEqual(r.status, 200, 'the studio cannot move a booking: ' + JSON.stringify(r.d));
    const db = openDb();
    const hist = db.prepare("SELECT COUNT(*) n FROM contact_history WHERE lead_id = ? AND description LIKE 'Rescheduled%'").get(b.lead_id).n;
    db.close();
    assert(hist >= 1, 'moving the booking left no trace on the contact');
  });

  console.log('\n  ── The whole story is on one timeline ──────────────────────');

  await step('the client record tells the whole story, once each', async () => {
    const t = ((await j('GET', `/leads/${lead.id}/timeline`, T)).d || {}).timeline || [];
    const titles = t.map((x) => String(x.title || ''));
    const has = (re, what) => assert(titles.some((x) => re.test(x)), `${what} is missing from the client's story: ` + titles.join(' | '));
    has(/Lead created|created/i, 'the enquiry');
    has(/won|client/i, 'winning the deal');
    has(/signed/i, 'the signature');
    has(/Invoice .* created/i, 'the invoice');
    has(/Shoot created/i, 'the shoot');
    has(/order/i, 'the print order');

    const seen = new Map();
    for (const x of t) { const k = `${x.activity_type}::${x.title}::${x.created_at}`; seen.set(k, (seen.get(k) || 0) + 1); }
    const dupes = [...seen.entries()].filter(([, n]) => n > 1);
    assert.deepStrictEqual(dupes, [], 'events are double-counted: ' + JSON.stringify(dupes));
  });

  console.log('\n' + (fail === 0 ? '✅ ALL CORE WORKFLOWS WORK END TO END' : '❌ BROKEN WORKFLOWS') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
