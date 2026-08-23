'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 8 — the studio's identity on the pages their clients actually see.
//
//  company_logo has existed in company_settings since the beginning and was
//  rendered on exactly ONE screen: the studio's own settings page. Their client
//  never saw it. Meanwhile six public endpoints each answered "who is the
//  studio?" differently - three returned a bare name string that fell back to
//  the literal 'WappFlow', one returned only a letterhead, and the gallery and
//  pay pages returned nothing at all. A client looked at their own wedding
//  photographs on a page that named nobody, above a footer crediting the
//  software vendor, and was asked for money by a page that never said by whom.
//
//  There is one resolver now (backend/public-brand.js) and every public surface
//  uses it. These checks drive the real public endpoints, because "the client
//  sees the studio" is a property of the responses, not of any one file.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3016 FRONTEND_URL=https://studio.test node server.js &
//    WF_API=http://127.0.0.1:3016/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-phase8-public-brand-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = process.env.WF_API || 'http://127.0.0.1:3016/api';
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };
const j = async (m, p, tok, body, headers) => {
  const r = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};
const RUN = process.pid.toString(36) + Math.random().toString(36).slice(2, 8);
const openDb = (rw) => new Database(process.env.WF_DB, rw ? {} : { readonly: true });
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

(async () => {
  const A = (await j('POST', '/auth/register', null, { email: `pb-a-${RUN}@test.local`, password: 'pw123456', businessName: 'Noor Studios' })).d;
  assert(A?.token, 'could not register - is the server up on ' + API + ' ?');
  const WS = A.user.workspace_id;

  // A studio that has filled in its identity, including an uploaded logo.
  const db0 = openDb(true);
  db0.prepare(`INSERT INTO company_settings (id, user_id, company_name, company_logo, company_website, company_email, brand_accent)
               VALUES (?,?,?,?,?,?,?)
               ON CONFLICT(user_id) DO UPDATE SET company_name=excluded.company_name, company_logo=excluded.company_logo,
                 company_website=excluded.company_website, company_email=excluded.company_email, brand_accent=excluded.brand_accent`)
    .run('cs-' + RUN, A.user.id, 'Noor Studios', '/uploads/noor-logo.png', 'noorstudios.pk', 'hello@noorstudios.pk', '#c2a878');
  db0.close();

  const lead = (await j('POST', '/leads', A.token, { customer_name: 'Hina Raza', customer_phone: '923005558888', status: 'New' })).d;

  // Every public surface, set up.
  const project = (await j('POST', '/media/projects', A.token, { lead_id: lead.id, title: 'Hina — mehndi' })).d;
  const gallery = (await j('POST', `/media/projects/${project.id}/galleries`, A.token, { title: 'Mehndi — selects' })).d;
  const galleryId = gallery?.gallery?.id || gallery?.id;
  const db1 = openDb(true);
  db1.prepare("INSERT INTO ms_assets (id, workspace_id, project_id, filename, storage_key, type) VALUES (?,?,?,?,?,'photo')")
    .run('a-' + RUN, WS, project.id, 'm1.jpg', 'fixture/m1.jpg');
  db1.prepare('INSERT INTO ms_gallery_assets (gallery_id, asset_id) VALUES (?,?)').run(galleryId, 'a-' + RUN);
  db1.close();
  await j('POST', `/media/galleries/${galleryId}/publish`, A.token, {});
  const db2 = openDb();
  const shareToken = db2.prepare('SELECT share_token FROM ms_galleries WHERE id = ?').get(galleryId).share_token;
  db2.close();

  await j('PUT', '/booking/settings', A.token, {
    slug: 'noor-' + RUN,
    settings: { services: [{ name: 'Mehndi coverage', duration: 240, price: 80000 }], availability: { 1: [9, 18] }, slot_min: 60, days_ahead: 30 },
  });
  await j('POST', '/store/products', A.token, { name: 'Framed print', options: [{ label: 'A3', price: 12000 }] });

  const doc = (await j('POST', '/cs/documents', A.token, { lead_id: lead.id, title: 'Mehndi Agreement', type: 'contract' })).d;
  const db3 = openDb(true);
  db3.prepare("UPDATE cs_documents SET status = 'sent', token = ? WHERE id = ?").run('doc-' + RUN, doc.id);
  db3.close();

  const inv = (await j('POST', '/invoices', A.token, { lead_id: lead.id, customer_name: 'Hina Raza', items: [], total: 80000 })).d.invoice;
  const payLink = (await j('POST', '/payments/link', A.token, { kind: 'invoice', ref_id: inv.id, lead_id: lead.id, amount: 80000, description: 'Mehndi coverage' })).d;
  const portal = (await j('POST', `/client-portal/${lead.id}`, A.token)).d;

  // ── every public surface names the studio ──────────────────────────────────
  const SURFACES = [
    ['gallery',   `/media/portal/${shareToken}`],
    ['contract',  `/cs/public/doc-${RUN}`],
    ['shop',      `/store/public/${shareToken}`],
    ['pay',       `/payments/public/${payLink.token}`],
    ['booking',   `/booking/public/noor-${RUN}`],
    ['portal',    `/client-portal/public/${portal.token}`],
  ];

  for (const [name, path] of SURFACES) {
    await check(`the ${name} page tells the client who the studio is`, async () => {
      const r = await j('GET', path, null);
      assert.strictEqual(r.status, 200, `${name} returned ${r.status}: ` + JSON.stringify(r.d));
      const b = r.d.brand;
      assert(b && typeof b === 'object', `${name} has no brand object: ` + JSON.stringify(r.d).slice(0, 200));
      assert.strictEqual(b.name, 'Noor Studios', `${name} names the wrong studio: ` + b.name);
      assert(b.logo, `${name} does not carry the studio's logo`);
    });
  }

  await check('the logo is an ABSOLUTE url, usable off-site', async () => {
    // It is stored as '/uploads/…'. A relative path is useless in an Open Graph
    // card or in an email client rendering the same asset.
    const r = await j('GET', `/media/portal/${shareToken}`, null);
    assert(/^https?:\/\//.test(r.d.brand.logo), 'logo is not absolute: ' + r.d.brand.logo);
    assert(r.d.brand.logo.endsWith('/uploads/noor-logo.png'), 'logo path mangled: ' + r.d.brand.logo);
  });

  await check('the brand carries contact details a client can act on', async () => {
    const r = await j('GET', `/client-portal/public/${portal.token}`, null);
    assert.strictEqual(r.d.brand.website, 'noorstudios.pk');
    assert.strictEqual(r.d.brand.email, 'hello@noorstudios.pk');
    assert.strictEqual(r.d.brand.accent, '#c2a878', 'the studio accent was dropped');
  });

  await check('an unsafe accent colour is refused, not interpolated into a public page', async () => {
    // brand.accent is rendered into an inline style on a page a stranger can reach.
    const db = openDb(true);
    db.prepare('UPDATE company_settings SET brand_accent = ? WHERE user_id = ?')
      .run('red;} body{display:none} .x{color:red', A.user.id);
    db.close();
    const r = await j('GET', `/media/portal/${shareToken}`, null);
    assert.strictEqual(r.d.brand.accent, null, 'a CSS payload survived into the public brand: ' + r.d.brand.accent);
    const db2 = openDb(true);
    db2.prepare('UPDATE company_settings SET brand_accent = ? WHERE user_id = ?').run('#c2a878', A.user.id);
    db2.close();
  });

  await check('a studio that has filled in nothing is not branded as WappFlow', async () => {
    // The old fallback literally told a client they were dealing with the vendor.
    const B = (await j('POST', '/auth/register', null, { email: `pb-b-${RUN}@test.local`, password: 'pw123456', businessName: 'Blank' })).d;
    const db = openDb(true);
    db.prepare('UPDATE company_settings SET company_name = NULL, company_logo = NULL WHERE user_id = ?').run(B.user.id);
    db.close();
    const l2 = (await j('POST', '/leads', B.token, { customer_name: 'Anon', customer_phone: '923005559999', status: 'New' })).d;
    const p2 = (await j('POST', `/client-portal/${l2.id}`, B.token)).d;
    const r = await j('GET', `/client-portal/public/${p2.token}`, null);
    assert.strictEqual(r.status, 200, 'the portal broke without a brand');
    assert.strictEqual(r.d.brand.name, null, 'an unbranded studio is presented as: ' + r.d.brand.name);
    assert.notStrictEqual(r.d.brand.name, 'WappFlow', 'the client is told they are dealing with the vendor');
  });

  // ── a LINK PREVIEW is not a client opening the page ───────────────────────
  // A SECOND, untouched document: the surfaces loop above already opened the first
  // one for real (correctly marking it viewed), so the preview pair needs a fixture
  // nobody has read yet.
  const doc2 = (await j('POST', '/cs/documents', A.token, { lead_id: lead.id, title: 'Second Agreement', type: 'contract' })).d;
  const db4 = openDb(true);
  db4.prepare("UPDATE cs_documents SET status = 'sent', token = ? WHERE id = ?").run('doc2-' + RUN, doc2.id);
  db4.close();

  await check('previewing a contract link does NOT mark it viewed', async () => {
    // Phase 8 gives each public page a server-side metadata fetch so shared links
    // preview with the studio's identity. Without the preview header that fetch
    // would flip every contract to 'viewed' the moment the studio SENT it, and
    // "has the client opened it yet?" would be permanently wrong.
    const before = (() => { const db = openDb(); const s = db.prepare('SELECT status FROM cs_documents WHERE id = ?').get(doc2.id).status; db.close(); return s; })();
    assert.strictEqual(before, 'sent', 'fixture is not in the sent state');

    const r = await j('GET', `/cs/public/doc2-${RUN}`, null, null, { 'X-WF-Preview': '1' });
    assert.strictEqual(r.status, 200, 'preview fetch failed: ' + JSON.stringify(r.d));
    assert(r.d.brand?.name, 'the preview did not return the brand it exists to fetch');

    const db = openDb();
    const after = db.prepare('SELECT status FROM cs_documents WHERE id = ?').get(doc2.id).status;
    const events = db.prepare("SELECT COUNT(*) n FROM cs_events WHERE document_id = ? AND type = 'viewed'").get(doc2.id).n;
    db.close();
    assert.strictEqual(after, 'sent', 'a link preview marked the contract as viewed by the client');
    assert.strictEqual(events, 0, 'a link preview wrote a "viewed" event into the legal audit trail');
  });

  await check('a REAL client opening the contract still marks it viewed', async () => {
    // The suppression must not break the signal it protects.
    const r = await j('GET', `/cs/public/doc2-${RUN}`, null);
    assert.strictEqual(r.status, 200);
    const db = openDb();
    const after = db.prepare('SELECT status FROM cs_documents WHERE id = ?').get(doc2.id).status;
    const events = db.prepare("SELECT COUNT(*) n FROM cs_events WHERE document_id = ? AND type = 'viewed'").get(doc2.id).n;
    db.close();
    assert.strictEqual(after, 'viewed', 'a real client view no longer registers');
    assert(events >= 1, 'the viewed event is missing from the audit trail');
  });

  await check('previewing a gallery link does not log a client visit', async () => {
    const n0 = (() => { const db = openDb(); const n = db.prepare('SELECT COUNT(*) n FROM ms_gallery_access WHERE gallery_id = ?').get(galleryId).n; db.close(); return n; })();
    await j('GET', `/media/portal/${shareToken}`, null, null, { 'X-WF-Preview': '1' });
    const n1 = (() => { const db = openDb(); const n = db.prepare('SELECT COUNT(*) n FROM ms_gallery_access WHERE gallery_id = ?').get(galleryId).n; db.close(); return n; })();
    assert.strictEqual(n1, n0, 'a link preview counted as the client viewing their gallery');

    await j('GET', `/media/portal/${shareToken}`, null);
    const n2 = (() => { const db = openDb(); const n = db.prepare('SELECT COUNT(*) n FROM ms_gallery_access WHERE gallery_id = ?').get(galleryId).n; db.close(); return n; })();
    assert(n2 > n1, 'a real gallery visit is no longer recorded');
  });

  await check('one studio never sees another studio brand', async () => {
    const C = (await j('POST', '/auth/register', null, { email: `pb-c-${RUN}@test.local`, password: 'pw123456', businessName: 'Rival Films' })).d;
    const l3 = (await j('POST', '/leads', C.token, { customer_name: 'Someone', customer_phone: '923005550000', status: 'New' })).d;
    const p3 = (await j('POST', `/client-portal/${l3.id}`, C.token)).d;
    const r = await j('GET', `/client-portal/public/${p3.token}`, null);
    assert.notStrictEqual(r.d.brand.name, 'Noor Studios', 'a rival tenant is presented with another studio brand');
    assert(!String(r.d.brand.logo || '').includes('noor-logo'), 'another studio logo leaked across tenants');
  });

  // ── the journey does not dead-end ─────────────────────────────────────────
  await check('winning a deal mints the client portal without being asked', async () => {
    // The portal is the one link that ties a client's whole relationship together,
    // and it only existed if somebody remembered to go and mint it - buried behind
    // a button in the Contracts vault, so most clients never got one.
    const l = (await j('POST', '/leads', A.token, { customer_name: 'Auto Portal', customer_phone: '92300555' + RUN.slice(0, 4), status: 'New' })).d;
    const db0 = openDb();
    const before = db0.prepare('SELECT COUNT(*) n FROM client_portals WHERE lead_id = ?').get(l.id).n;
    db0.close();
    assert.strictEqual(before, 0, 'the fixture already had a portal');

    await j('PUT', `/leads/${l.id}/status`, A.token, { status: 'Closed - Won' });

    const db = openDb();
    const row = db.prepare('SELECT token, workspace_id FROM client_portals WHERE lead_id = ?').get(l.id);
    db.close();
    assert(row, 'winning the deal did not create a portal');
    assert.strictEqual(row.workspace_id, WS, 'the portal landed in the wrong workspace');

    const pub = await j('GET', `/client-portal/public/${row.token}`, null);
    assert.strictEqual(pub.status, 200, 'the auto-created portal does not open');
    assert.strictEqual(pub.d.client_name, 'Auto Portal', 'the portal opened the wrong client');
  });

  await check('the studio can find that link on the client record', async () => {
    const l = (await j('POST', '/leads', A.token, { customer_name: 'Findable', customer_phone: '92300666' + RUN.slice(0, 4), status: 'New' })).d;
    await j('PUT', `/leads/${l.id}/status`, A.token, { status: 'Closed - Won' });
    const t = ((await j('GET', `/leads/${l.id}/timeline`, A.token)).d || {}).timeline || [];
    const row = t.find((x) => /portal/i.test(x.title || ''));
    assert(row, 'the portal was minted silently - the studio has no way to know: ' + t.map((x) => x.title).join(' | '));
    const meta = JSON.parse(row.metadata || '{}');
    assert(/\/client\//.test(meta.url || ''), 'the recorded portal link is unusable: ' + meta.url);
  });

  await check('the portal offers what to do NEXT, not just what already happened', async () => {
    const r = await j('GET', `/client-portal/public/${portal.token}`, null);
    assert(r.d.links, 'the portal has no forward links at all');
    assert(r.d.links.book && r.d.links.book.includes('noor-'), 'a client cannot book again from their own portal: ' + r.d.links.book);
  });

  await check('a gallery is not a cul-de-sac', async () => {
    const r = await j('GET', `/media/portal/${shareToken}`, null);
    assert(r.d.portal_url && r.d.portal_url.startsWith('/client/'),
      'a client viewing their gallery has no route to their contracts or invoices: ' + r.d.portal_url);
  });

  await check('every conversion point hands the client somewhere to go', async () => {
    // Signing, paying, booking and ordering all ended at "thank you" and nothing.
    const pay = await j('GET', `/payments/public/${payLink.token}`, null);
    assert(pay.d.next, 'the pay page offers no next step');
    assert(pay.d.next.book, 'the pay page cannot send a client to book again');

    const d = new Date(Date.now() + 6 * 86400000);
    const pz = (n) => String(n).padStart(2, '0');
    const at = `${d.getUTCFullYear()}-${pz(d.getUTCMonth() + 1)}-${pz(d.getUTCDate())} 14:00:00`;
    const booked = await j('POST', `/booking/public/noor-${RUN}`, null, { service: 'Mehndi coverage', start_at: at, name: 'Hina Raza', phone: '923005558888' });
    assert.strictEqual(booked.status, 200, JSON.stringify(booked.d));
    assert(booked.d.next, 'the booking confirmation offers no next step');
    assert(booked.d.manage_url, 'the client cannot change the booking they just made');
  });

  await check('a studio with no booking page gets no broken buttons', async () => {
    // journeyLinks must return only what exists, so callers can render whatever
    // they get without guarding.
    const D = (await j('POST', '/auth/register', null, { email: `pb-d-${RUN}@test.local`, password: 'pw123456', businessName: 'No Booking' })).d;
    const l = (await j('POST', '/leads', D.token, { customer_name: 'Client D', customer_phone: '92300777' + RUN.slice(0, 4), status: 'New' })).d;
    await j('PUT', `/leads/${l.id}/status`, D.token, { status: 'Closed - Won' });
    const db = openDb();
    const row = db.prepare('SELECT token FROM client_portals WHERE lead_id = ?').get(l.id);
    db.close();
    const r = await j('GET', `/client-portal/public/${row.token}`, null);
    assert.strictEqual(r.status, 200, 'the portal broke for a studio with no booking page');
    assert.strictEqual(r.d.links.book, null, 'a booking button was offered with nowhere to point');
  });

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
