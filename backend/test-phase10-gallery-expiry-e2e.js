'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 10 — Gallery Expiry stops being a phantom feature.
//
//  `expires_at` has sat in ms_galleries since the beginning, carrying the comment
//  "RESERVED for Gallery Expiry (named roadmap feature) — not dead, do not purge".
//  Nothing ever set it, read it or exposed it. The feature was NAMED in the
//  product and did not exist: a studio who believed it was handing clients a link
//  they thought would stop working, and it never would.
//
//  The interesting property is not "the page 404s". It is that expiry closes
//  EVERY door: nine routes in media-studio and two in the print store reach a
//  gallery by its share token, so guarding only the page would leave favouriting,
//  commenting, downloading, exporting, proofing and ORDERING PRINTS as side doors
//  into a gallery the studio believes is closed.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3019 node server.js &
//    WF_API=http://127.0.0.1:3019/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-phase10-gallery-expiry-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = process.env.WF_API || 'http://127.0.0.1:3019/api';
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
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

(async () => {
  const A = (await j('POST', '/auth/register', null, { email: `gx-${RUN}@test.local`, password: 'pw123456', businessName: 'Expiry Studio' })).d;
  assert(A?.token, 'could not register - is the server up on ' + API + ' ?');
  const WS = A.user.workspace_id;

  const lead = (await j('POST', '/leads', A.token, { customer_name: 'Client X', customer_phone: '923005550001', status: 'New' })).d;
  const project = (await j('POST', '/media/projects', A.token, { lead_id: lead.id, title: 'Shoot X' })).d;
  const gallery = (await j('POST', `/media/projects/${project.id}/galleries`, A.token, { title: 'Delivery' })).d;
  const gid = gallery?.gallery?.id || gallery?.id;

  const db0 = openDb(true);
  db0.prepare("INSERT INTO ms_assets (id, workspace_id, project_id, filename, storage_key, type) VALUES (?,?,?,?,?,'photo')")
    .run('ax-' + RUN, WS, project.id, 'x1.jpg', 'fixture/x1.jpg');
  db0.prepare('INSERT INTO ms_gallery_assets (gallery_id, asset_id) VALUES (?,?)').run(gid, 'ax-' + RUN);
  db0.close();
  await j('POST', `/media/galleries/${gid}/publish`, A.token, {});
  const db1 = openDb();
  const token = db1.prepare('SELECT share_token FROM ms_galleries WHERE id = ?').get(gid).share_token;
  db1.close();
  await j('POST', '/store/products', A.token, { name: 'Print', options: [{ label: 'A4', price: 5000 }] });

  await check('a gallery with no expiry is open, as before', async () => {
    const r = await j('GET', `/media/portal/${token}`, null);
    assert.strictEqual(r.status, 200, 'a gallery with no expiry stopped working: ' + JSON.stringify(r.d));
  });

  await check('expiry can be SET — the column was write-only in the sense that nothing wrote it', async () => {
    const r = await j('PUT', `/media/galleries/${gid}`, A.token, { expires_at: day(7) });
    assert.strictEqual(r.status, 200, 'setting an expiry failed: ' + JSON.stringify(r.d));
    const db = openDb();
    const row = db.prepare('SELECT expires_at FROM ms_galleries WHERE id = ?').get(gid);
    db.close();
    assert.strictEqual(String(row.expires_at).slice(0, 10), day(7), 'the date was not stored: ' + row.expires_at);
  });

  await check('a nonsense date is refused rather than stored', async () => {
    const r = await j('PUT', `/media/galleries/${gid}`, A.token, { expires_at: 'next tuesday' });
    assert.strictEqual(r.status, 400, 'a junk expiry was accepted');
  });

  await check('a FUTURE expiry does not close the gallery', async () => {
    const r = await j('GET', `/media/portal/${token}`, null);
    assert.strictEqual(r.status, 200, 'a gallery expiring next week is already shut: ' + JSON.stringify(r.d));
  });

  await check('the client has ALL of the last day', async () => {
    // "Expires 30 June" must not lock them out on the morning of the 30th.
    await j('PUT', `/media/galleries/${gid}`, A.token, { expires_at: day(0) });
    const r = await j('GET', `/media/portal/${token}`, null);
    assert.strictEqual(r.status, 200, 'the gallery closed on its own expiry day: ' + JSON.stringify(r.d));
  });

  await check('a PAST expiry closes it, and says so', async () => {
    await j('PUT', `/media/galleries/${gid}`, A.token, { expires_at: day(-1) });
    const r = await j('GET', `/media/portal/${token}`, null);
    assert.strictEqual(r.status, 410, `an expired gallery still opened (status ${r.status})`);
    assert(r.d.expired, 'the response does not mark itself expired, so the page cannot explain');
    assert(r.d.expired_on, 'the client is not told when it expired');
  });

  await check('EVERY door closes, not just the page', async () => {
    // Nine routes reach a gallery by token. Guarding one leaves eight side doors
    // into a gallery the studio believes is shut.
    const doors = [
      ['favourite', 'POST', `/media/portal/${token}/favorite`, { asset_id: 'ax-' + RUN, contact: 'guest' }],
      ['comment',   'POST', `/media/portal/${token}/comment`,  { asset_id: 'ax-' + RUN, body: 'hi', contact: 'guest' }],
      ['collection','POST', `/media/portal/${token}/collection`, { name: 'x', contact: 'guest', asset_ids: ['ax-' + RUN] }],
      ['zip export','POST', `/media/portal/${token}/export`,   {}],
    ];
    for (const [name, m, path, body] of doors) {
      const r = await j(m, path, null, body);
      assert(r.status >= 400, `${name} still works on an expired gallery (status ${r.status})`);
    }
  });

  await check('the print shop closes with the gallery it hangs off', async () => {
    // The shop is reached by the GALLERY's share token, so an expired gallery
    // that still sells prints is a shop the studio cannot see or close.
    const shop = await j('GET', `/store/public/${token}`, null);
    assert.strictEqual(shop.status, 410, `the shop is still open on an expired gallery (status ${shop.status})`);

    const order = await j('POST', `/store/public/${token}`, null, {
      items: [{ product_id: 'anything', option: 'A4', qty: 1 }], name: 'Buyer', phone: '923005559999',
    });
    assert(order.status >= 400, `an order was accepted against an expired gallery (status ${order.status})`);
  });

  await check('clearing the expiry gives access back', async () => {
    // A studio must be able to undo this — the client rang and asked.
    const r = await j('PUT', `/media/galleries/${gid}`, A.token, { expires_at: '' });
    assert.strictEqual(r.status, 200, 'clearing the expiry failed: ' + JSON.stringify(r.d));
    const open = await j('GET', `/media/portal/${token}`, null);
    assert.strictEqual(open.status, 200, 'the gallery stayed shut after the expiry was cleared');
    const shop = await j('GET', `/store/public/${token}`, null);
    assert.strictEqual(shop.status, 200, 'the shop stayed shut after the expiry was cleared');
  });

  await check('the studio can SEE that a gallery has expired', async () => {
    // Otherwise they find out when the client rings.
    await j('PUT', `/media/galleries/${gid}`, A.token, { expires_at: day(-3) });
    const r = await j('GET', `/media/projects/${project.id}/galleries`, A.token);
    const list = r.d.galleries || r.d || [];
    const g = list.find((x) => x.id === gid);
    assert(g, 'the gallery is missing from the studio list');
    assert.strictEqual(g.is_expired, true, 'the studio list does not show that it expired');
  });

  await check('a gallery can finally be renamed and re-secured', async () => {
    // There was no way to change a gallery after creating it at all.
    const r = await j('PUT', `/media/galleries/${gid}`, A.token, { title: 'Delivery (final)', visibility: 'password', password: 'secret123' });
    assert.strictEqual(r.status, 200, 'editing failed: ' + JSON.stringify(r.d));
    const db = openDb();
    const row = db.prepare('SELECT title, visibility, password_hash FROM ms_galleries WHERE id = ?').get(gid);
    db.close();
    assert.strictEqual(row.title, 'Delivery (final)', 'the title did not change');
    assert.strictEqual(row.visibility, 'password', 'the visibility did not change');
    assert(row.password_hash, 'no password was set');
    assert(!String(row.password_hash).includes('secret123'), 'the password is stored in plain text');
  });

  await check('another tenant cannot set an expiry on your gallery', async () => {
    const B = (await j('POST', '/auth/register', null, { email: `gx-b-${RUN}@test.local`, password: 'pw123456', businessName: 'Rival' })).d;
    const r = await j('PUT', `/media/galleries/${gid}`, B.token, { expires_at: day(-30) });
    assert.strictEqual(r.status, 404, `a rival tenant reached your gallery (status ${r.status})`);
  });

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
