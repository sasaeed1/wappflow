'use strict';
/**
 * Integration test: Galleries + client portal + WhatsApp delivery seam.
 *   node scripts/test-media-galleries.js
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
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msg-'));
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT, customer_phone TEXT);
           CREATE TABLE activity_timeline (id TEXT PRIMARY KEY, lead_id TEXT, workspace_id TEXT, user_id TEXT,
             actor_name TEXT, activity_type TEXT, title TEXT, body TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
  const WS = 'ws1', LEAD = 'lead1', PHONE = '+15551234567';
  db.prepare('INSERT INTO leads (id, workspace_id, customer_name, customer_phone) VALUES (?,?,?,?)').run(LEAD, WS, 'Bride & Groom', PHONE);

  const fakeAuth = (req, _res, next) => { req.userId = 'u1'; req.workspaceId = WS; req.userRole = 'super_admin'; req.userPermissions = {}; req.senderName = 'T'; next(); };

  // Record delivery (the seam server.js fills with whatsappService.sendMessage)
  const sent = [];
  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));
  mountMediaStudio(app, db, {
    auth: fakeAuth, generateId: () => crypto.randomUUID(), multer, path, fs, uploadsDir,
    startWorker: false, clientBaseUrl: 'https://app.test',
    sendClientMessage: async ({ lead, userId, text }) => { sent.push({ phone: lead.customer_phone, userId, text }); return { sent: true }; },
  });

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const POST = (p, b) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });
  const PUT = (p, b) => fetch(base + p, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b || {}) });

  try {
    // project + 3 assets (raw bytes are fine; galleries don't need processed variants)
    const PID = (await (await POST('/api/media/projects', { title: 'Wedding', lead_id: LEAD })).json()).id;
    const fd = new FormData();
    for (let i = 0; i < 3; i++) fd.append('files', new Blob([Buffer.from('img' + i)], { type: 'image/jpeg' }), `p${i}.jpg`);
    const assets = (await (await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd })).json()).assets;
    const ids = assets.map(a => a.id);

    // create a PASSWORD gallery
    let r = await POST(`/api/media/projects/${PID}/galleries`, { title: 'Highlights', visibility: 'password', password: 'secret', settings: { download_policy: 'high-res' } });
    const G = await r.json();
    check('gallery created (201)', r.status === 201 && G.id);

    // before adding photos, publish is blocked
    r = await POST(`/api/media/galleries/${G.id}/publish`, {});
    check('publish blocked on empty gallery (400)', r.status === 400);

    // portal hidden until published
    r = await fetch(`${base}/api/media/portal/anybadtoken`);
    check('unknown/unpublished token → 404', r.status === 404);

    // add + reorder assets
    r = await POST(`/api/media/galleries/${G.id}/assets`, { asset_ids: ids });
    check('added 3 assets to gallery', (await r.json()).added === 3);
    r = await PUT(`/api/media/galleries/${G.id}/assets/order`, { asset_ids: [ids[2], ids[0], ids[1]] });
    check('reorder accepted', (await r.json()).count === 3);

    // PUBLISH → delivers over the (mocked) WhatsApp seam
    r = await POST(`/api/media/galleries/${G.id}/publish`, { notify: true });
    const pub = await r.json();
    check('publish ok + status published', r.status === 200 && pub.status === 'published');
    check('publish delivered via WhatsApp seam', pub.delivery && pub.delivery.whatsapp === 'sent', JSON.stringify(pub.delivery));
    check('exactly one client message sent', sent.length === 1, `sent=${sent.length}`);
    check('message went to the lead phone', sent[0] && sent[0].phone === PHONE);
    check('message contains the share link', sent[0] && sent[0].text.includes('/g/'));
    const token = pub.share_url.split('/g/')[1];

    // portal requires the password
    r = await fetch(`${base}/api/media/portal/${token}`);
    check('portal without password → 401', r.status === 401);
    r = await fetch(`${base}/api/media/portal/${token}?pw=wrong`);
    check('portal with wrong password → 401', r.status === 401);
    r = await fetch(`${base}/api/media/portal/${token}?pw=secret`);
    const portal = await r.json();
    check('portal with correct password → 200', r.status === 200);
    check('portal returns 3 assets in custom order', portal.assets.length === 3 && portal.assets[0].asset_id === ids[2]);
    check('high-res policy exposes a download_url', portal.assets[0].download_url !== null);

    // favorite toggle
    r = await POST(`/api/media/portal/${token}/favorite`, { asset_id: ids[0], contact: 'bride@x.com', pw: 'secret' });
    let fav = await r.json();
    check('favorite adds (favorited=true, count 1)', fav.favorited === true && fav.favorites === 1);
    r = await POST(`/api/media/portal/${token}/favorite`, { asset_id: ids[0], contact: 'bride@x.com', pw: 'secret' });
    fav = await r.json();
    check('favorite toggles off (favorited=false, count 0)', fav.favorited === false && fav.favorites === 0);
    // re-add for the photographer-side assertion
    await POST(`/api/media/portal/${token}/favorite`, { asset_id: ids[1], contact: 'bride@x.com', pw: 'secret' });

    // comment
    r = await POST(`/api/media/portal/${token}/comment`, { asset_id: ids[0], contact: 'bride@x.com', body: 'Love this one!', pw: 'secret' });
    check('comment posts (201)', r.status === 201);

    // photographer sees favorites + comments + share_url
    r = await fetch(`${base}/api/media/galleries/${G.id}`);
    const detail = await r.json();
    check('gallery detail exposes share_url', !!detail.share_url && detail.share_url.includes(token));
    check('gallery detail hides password_hash', detail.password_hash === undefined);
    check('photographer sees a client comment', detail.comments.length === 1);
    check('asset shows favorite count from client', detail.assets.find(a => a.id === ids[1]).favorites === 1);

    // CONTROL-FIRST: there is no public route that can publish/cull. Portal can only
    // view/favorite/comment. Confirm the portal cannot mutate gallery state.
    r = await POST(`/api/media/portal/${token}/publish`, {});
    check('no portal publish route exists (404)', r.status === 404);
    check('no cull decisions created anywhere', db.prepare('SELECT COUNT(*) n FROM ms_cull_decisions').get().n === 0);

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
