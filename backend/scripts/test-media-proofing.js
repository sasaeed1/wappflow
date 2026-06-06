'use strict';
/**
 * Integration test: proofing / selection (pick-your-N + revision rounds).
 *   node scripts/test-media-proofing.js
 */
const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const mountMediaStudio = require('../media-studio');

let passed = 0, failed = 0;
const check = (n, c, e) => { if (c) { console.log(`  ✅ ${n}`); passed++; } else { console.log(`  ❌ ${n}${e ? ' → ' + e : ''}`); failed++; } };

(async () => {
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msp-'));
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT, customer_phone TEXT);
           CREATE TABLE activity_timeline (id TEXT PRIMARY KEY, lead_id TEXT, workspace_id TEXT, user_id TEXT, actor_name TEXT, activity_type TEXT, title TEXT, body TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
  const WS = 'ws1', LEAD = 'lead1', PHONE = '+15550001111';
  db.prepare('INSERT INTO leads (id, workspace_id, customer_name, customer_phone) VALUES (?,?,?,?)').run(LEAD, WS, 'Couple', PHONE);
  const fakeAuth = (req, _res, next) => { req.userId = 'u1'; req.workspaceId = WS; req.userRole = 'super_admin'; req.userPermissions = {}; req.senderName = 'T'; next(); };

  const sent = [];
  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));
  mountMediaStudio(app, db, {
    auth: fakeAuth, generateId: () => crypto.randomUUID(), multer, path, fs, uploadsDir,
    startWorker: false, clientBaseUrl: 'https://app.test',
    sendClientMessage: async ({ lead, text }) => { sent.push({ phone: lead.customer_phone, text }); return { sent: true }; },
  });

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const POST = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const GET = (p) => fetch(base + p).then(r => r.json());

  try {
    const PID = (await (await POST('/api/media/projects', { title: 'Wedding', lead_id: LEAD })).json()).id;
    const fd = new FormData();
    for (let i = 0; i < 4; i++) fd.append('files', new Blob([Buffer.from('x' + i)], { type: 'image/jpeg' }), `p${i}.jpg`);
    const ids = (await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd })).json()).assets.map(a => a.id);
    const g = await (await POST(`/api/media/projects/${PID}/galleries`, { title: 'Proofs', visibility: 'private' })).json();
    await POST(`/api/media/galleries/${g.id}/assets`, { asset_ids: ids });
    const token = (await (await POST(`/api/media/galleries/${g.id}/publish`, { notify: false })).json()).share_url.split('/g/')[1];

    // photographer creates a "pick 2" set
    let r = await POST(`/api/media/galleries/${g.id}/proofing`, { title: 'Pick your 2 favourites', quota: 2 });
    const set = await r.json();
    check('proofing set created (open)', r.status === 201 && set.status === 'open' && set.quota === 2);

    // submitting with nothing selected is blocked
    check('submit with 0 selections → 400', (await POST(`/api/media/portal/${token}/proofing/${set.id}/submit`, {})).status === 400);

    // portal shows the active set
    let portal = await GET(`/api/media/portal/${token}`);
    check('portal exposes the proofing set', portal.proofing && portal.proofing.id === set.id && portal.proofing.quota === 2 && portal.proofing.selected_count === 0);

    // client selects
    let sel = await (await POST(`/api/media/portal/${token}/proofing/${set.id}/select`, { asset_id: ids[0], contact: 'bride@x.com' })).json();
    check('select #1 → count 1, quota echoed', sel.selected === true && sel.selected_count === 1 && sel.quota === 2);
    await POST(`/api/media/portal/${token}/proofing/${set.id}/select`, { asset_id: ids[1] });
    sel = await (await POST(`/api/media/portal/${token}/proofing/${set.id}/select`, { asset_id: ids[0], selected: false })).json();
    check('toggle #1 off → count 1', sel.selected === false && sel.selected_count === 1);
    sel = await (await POST(`/api/media/portal/${token}/proofing/${set.id}/select`, { asset_id: ids[0] })).json();
    check('re-select #1 → count 2', sel.selected_count === 2);
    check('selecting an asset not in gallery → 400', (await POST(`/api/media/portal/${token}/proofing/${set.id}/select`, { asset_id: 'nope' })).status === 400);

    // client submits
    r = await POST(`/api/media/portal/${token}/proofing/${set.id}/submit`, {});
    check('submit → submitted with 2 selections', r.status === 200 && (await r.json()).selected_count === 2);
    const det = await GET(`/api/media/proofing/${set.id}`);
    check('photographer sees submitted + 2 picks', det.status === 'submitted' && det.selected_asset_ids.length === 2);
    check('photographer notified via lead timeline', db.prepare('SELECT COUNT(*) n FROM activity_timeline WHERE activity_type = ?').get('proofing_submitted').n === 1);

    // selecting is locked while submitted
    check('select while submitted → 409', (await POST(`/api/media/portal/${token}/proofing/${set.id}/select`, { asset_id: ids[2] })).status === 409);

    // photographer requests changes → revision round, client notified on WhatsApp
    r = await POST(`/api/media/proofing/${set.id}/request-changes`, { note: 'Could we swap the last one?' });
    const rev = await r.json();
    check('request-changes → status revision, round 2', rev.status === 'revision' && rev.revision_round === 2);
    check('client got the revision message on WhatsApp', sent.some(m => m.phone === PHONE && /tweak/i.test(m.text)));

    // selecting works again during revision
    check('select during revision → ok', (await POST(`/api/media/portal/${token}/proofing/${set.id}/select`, { asset_id: ids[2] })).status === 200);

    // approve → notify + prompt disappears from portal
    r = await POST(`/api/media/proofing/${set.id}/approve`, {});
    check('approve → status approved', (await r.json()).status === 'approved');
    check('client got the approval message', sent.some(m => /approved/i.test(m.text)));
    portal = await GET(`/api/media/portal/${token}`);
    check('approved set no longer prompts the client', portal.proofing === null);

    // control-first: selections are client picks, never cull decisions
    check('no cull decisions created by proofing', db.prepare('SELECT COUNT(*) n FROM ms_cull_decisions').get().n === 0);

  } catch (e) {
    console.log('  ❌ threw:', e.stack || e.message); failed++;
  } finally {
    await new Promise(res => server.close(res));
    try { db.close(); } catch {}
    try { fs.rmSync(uploadsDir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n${failed === 0 ? '🎉 PASS' : '🔴 FAIL'} — ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
})();
