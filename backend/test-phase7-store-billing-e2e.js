'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 7 — a print order now collects the money it quotes.
//
//  The store priced an order server-side, took the customer's details, saved the
//  total, and then messaged them "we'll be in touch to finalize it". Nothing
//  billed them: no invoice, no pay link, no ledger row. Store revenue was
//  invisible to the invoices screen and to the payments ledger, so the one part
//  of the product that actually takes money was the one part that never did.
//
//  The order now raises the invoice and the pay link through the SAME creators
//  the rest of the app uses, which is what keeps invoice numbering in one
//  sequence and store money on the payments screen.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3013 node server.js &
//    WF_API=http://127.0.0.1:3013/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-phase7-store-billing-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = process.env.WF_API || 'http://127.0.0.1:3013/api';
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
  const A = (await j('POST', '/auth/register', null, { email: `st-a-${RUN}@test.local`, password: 'pw123456', businessName: 'Print Studio' })).d;
  assert(A?.token, 'could not register - is the server up on ' + API + ' ?');

  // A shoot, a published gallery to shop from, and a product to buy.
  const lead = (await j('POST', '/leads', A.token, { customer_name: 'Sana Malik', customer_phone: '923005553333', status: 'New' })).d;
  const project = (await j('POST', '/media/projects', A.token, { lead_id: lead.id, title: 'Sana — portraits' })).d;
  const product = (await j('POST', '/store/products', A.token, {
    name: 'Fine art print', kind: 'print',
    options: [{ label: '8x10', price: 4000 }, { label: '16x20', price: 9000 }],
  })).d;
  const productId = product?.product?.id || product?.id;
  assert(productId, 'product not created: ' + JSON.stringify(product));

  // Publish a gallery so the public shop token exists.
  const gallery = (await j('POST', `/media/projects/${project.id}/galleries`, A.token, { title: 'Sana — selects' })).d;
  const galleryId = gallery?.gallery?.id || gallery?.id;
  assert(galleryId, 'gallery not created: ' + JSON.stringify(gallery));
  // Publishing refuses an empty gallery, and the share token is minted by the
  // publish route - so stand in one asset and then publish for real, rather than
  // faking the token and testing a state production never produces.
  const db0 = openDb(true);
  db0.prepare("INSERT INTO ms_assets (id, workspace_id, project_id, filename, storage_key, type) VALUES (?,?,?,?,?,'photo')")
    .run('asset-' + RUN, A.user.workspace_id, project.id, 'sana-001.jpg', 'fixture/sana-001.jpg');
  db0.prepare('INSERT INTO ms_gallery_assets (gallery_id, asset_id) VALUES (?,?)').run(galleryId, 'asset-' + RUN);
  db0.close();
  const published = await j('POST', `/media/galleries/${galleryId}/publish`, A.token, {});
  assert.strictEqual(published.status, 200, 'publish failed: ' + JSON.stringify(published.d));
  const db1 = openDb();
  const shareToken = db1.prepare('SELECT share_token FROM ms_galleries WHERE id = ?').get(galleryId).share_token;
  db1.close();
  assert(shareToken, 'the gallery has no share token to shop from');

  let order;

  await check('a public order still prices server-side from the catalogue', async () => {
    const r = await j('POST', `/store/public/${shareToken}`, null, {
      items: [{ product_id: productId, option: '16x20', qty: 2 }],
      name: 'Sana Malik', phone: '923005553333', note: 'Matte please',
    });
    assert.strictEqual(r.status, 200, 'order failed: ' + JSON.stringify(r.d));
    assert.strictEqual(r.d.total, 18000, 'server-side pricing changed: ' + r.d.total);
    const db = openDb();
    order = db.prepare('SELECT * FROM ms_print_orders WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1').get(A.user.workspace_id);
    db.close();
    assert(order, 'the order was not recorded');
  });

  await check('the order raises a real invoice for the same contact', async () => {
    assert(order.invoice_id, 'the order captured money and raised no invoice');
    const db = openDb();
    const inv = db.prepare('SELECT * FROM invoices WHERE id = ?').get(order.invoice_id);
    db.close();
    assert(inv, 'the invoice row is missing');
    assert.strictEqual(inv.lead_id, order.lead_id, 'the invoice is not linked to the buyer');
    assert.strictEqual(inv.total, 18000, 'the invoice total does not match the order');
    assert(inv.invoice_number, 'the invoice got no number - it bypassed the shared creator');
    assert.strictEqual(inv.workspace_id, A.user.workspace_id, 'the invoice landed in the wrong workspace');
  });

  await check('the invoice itemises what was actually ordered', async () => {
    const db = openDb();
    const inv = db.prepare('SELECT items FROM invoices WHERE id = ?').get(order.invoice_id);
    db.close();
    const items = JSON.parse(inv.items);
    assert.strictEqual(items.length, 1, 'line items lost');
    assert(/16x20/.test(items[0].description), 'the chosen option is not on the invoice: ' + items[0].description);
    assert.strictEqual(items[0].qty, 2);
    assert.strictEqual(items[0].amount, 18000);
  });

  await check('the customer is given a way to pay', async () => {
    assert(order.pay_url, 'no pay link was minted for the order');
    assert(order.payment_id, 'no ledger row was created for the order');
    const db = openDb();
    const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(order.payment_id);
    db.close();
    assert.strictEqual(p.amount, 18000, 'the ledger disagrees with the order total');
    assert.strictEqual(p.ref_id, order.invoice_id, 'the payment is not tied to the invoice');
    assert.strictEqual(p.lead_id, order.lead_id, 'the payment is not tied to the buyer');
    assert(p.public_token, 'the pay link has no public token');
  });

  await check('store money is visible on the payments screen like any other', async () => {
    const r = await j('GET', '/payments', A.token);
    assert.strictEqual(r.status, 200, JSON.stringify(r.d));
    const rows = r.d.payments || r.d || [];
    assert(Array.isArray(rows) && rows.some((p) => p.id === order.payment_id),
      'the store payment is missing from the ledger the studio actually looks at');
  });

  await check('the pay page opens for that token without a login', async () => {
    const db = openDb();
    const token = db.prepare('SELECT public_token FROM payments WHERE id = ?').get(order.payment_id).public_token;
    db.close();
    const r = await j('GET', `/payments/public/${token}`, null);
    assert.strictEqual(r.status, 200, 'the client cannot open their own pay page: ' + JSON.stringify(r.d));
    assert.strictEqual(r.d.amount ?? r.d.payment?.amount, 18000, 'the pay page shows the wrong amount');
  });

  await check('the client portal shows the order WITH its pay link', async () => {
    const portal = (await j('POST', `/client-portal/${order.lead_id}`, A.token)).d;
    const pub = (await j('GET', `/client-portal/public/${portal.token}`, null)).d;
    const o = (pub.orders || [])[0];
    assert(o, 'the order is not on the portal');
    assert(o.pay_url, 'the portal lists the order but gives no way to pay it');
    const inv = (pub.invoices || [])[0];
    assert(inv, 'the invoice is not on the portal');
    assert(inv.pay_url && inv.pay_url.startsWith('/pay/'), 'an unpaid invoice on the portal is still a dead line of text');
  });

  await check('a free order does not raise an empty invoice', async () => {
    // Zero-value carts happen (a gallery giving away a digital file). Billing
    // nothing is worse than not billing.
    const free = (await j('POST', '/store/products', A.token, { name: 'Digital copy', options: [{ label: 'JPEG', price: 0 }] })).d;
    const freeId = free?.product?.id || free?.id;
    const before = (() => { const db = openDb(); const n = db.prepare('SELECT COUNT(*) n FROM invoices WHERE workspace_id = ?').get(A.user.workspace_id).n; db.close(); return n; })();
    const r = await j('POST', `/store/public/${shareToken}`, null, {
      items: [{ product_id: freeId, option: 'JPEG', qty: 1 }], name: 'Sana Malik', phone: '923005553333',
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.d));
    const after = (() => { const db = openDb(); const n = db.prepare('SELECT COUNT(*) n FROM invoices WHERE workspace_id = ?').get(A.user.workspace_id).n; db.close(); return n; })();
    assert.strictEqual(after, before, 'a zero-value order raised an invoice');
  });

  await check('invoice numbers stay one sequence across store and studio', async () => {
    await j('POST', '/invoices', A.token, { customer_name: 'Walk-in', items: [], total: 500 });
    const db = openDb();
    const nums = db.prepare('SELECT invoice_number FROM invoices WHERE workspace_id = ?').all(A.user.workspace_id).map((r) => r.invoice_number);
    db.close();
    assert.strictEqual(new Set(nums).size, nums.length, 'two customers share an invoice number: ' + nums.join(', '));
  });

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
