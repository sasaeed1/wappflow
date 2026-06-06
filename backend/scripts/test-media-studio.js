'use strict';
/**
 * Isolated integration test for the Media Studio module.
 * Mounts media-studio.js on a real Express app with an in-memory DB and a fake auth,
 * then drives the full slice over HTTP. Does NOT load server.js (no WhatsApp/puppeteer).
 *
 *   node scripts/test-media-studio.js
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
function check(name, cond, extra) {
  if (cond) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}${extra ? ' → ' + extra : ''}`); failed++; }
}

(async () => {
  // ── temp storage + in-memory DB ──
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-uploads-'));
  const db = new Database(':memory:');

  // Minimal core tables the module references (leads for JOIN/validation, activity_timeline & audit for writes).
  db.exec(`
    CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT);
    CREATE TABLE activity_timeline (id TEXT PRIMARY KEY, lead_id TEXT, workspace_id TEXT, user_id TEXT,
      actor_name TEXT, activity_type TEXT, title TEXT, body TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE audit_logs (id TEXT PRIMARY KEY, workspace_id TEXT, user_id TEXT, action TEXT,
      entity_type TEXT, entity_id TEXT, details TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
  `);
  const WS = 'ws_test', LEAD = 'lead_test';
  db.prepare('INSERT INTO leads (id, workspace_id, customer_name) VALUES (?, ?, ?)').run(LEAD, WS, 'Ayesha & Bilal');

  // Fake auth → inject the same fields the real middleware attaches.
  const fakeAuth = (req, _res, next) => {
    req.userId = 'user_1'; req.workspaceId = WS; req.userRole = 'super_admin';
    req.userPermissions = { manage_settings: true }; req.senderName = 'Tester';
    next();
  };

  const app = express();
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));
  mountMediaStudio(app, db, {
    auth: fakeAuth,
    generateId: () => crypto.randomUUID(),
    logAudit: (ws, u, a, et, ei, d) => db.prepare('INSERT INTO audit_logs (id,workspace_id,user_id,action,entity_type,entity_id,details) VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(), ws, u, a, et, ei, JSON.stringify(d)),
    broadcastToWorkspace: () => {},
    addContactHistory: () => {},
    multer, path, fs, uploadsDir,
    startWorker: false,   // keep ingest jobs deterministic for this test
  });

  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const J = (r) => r.json();

  try {
    // 1. overview / mount check
    let r = await fetch(`${base}/api/media/overview`); let body = await J(r);
    check('GET /overview returns ok', r.status === 200 && body.ok === true, JSON.stringify(body));
    check('overview starts with 0 projects', body.projects === 0);

    // 2. create project linked to a CRM lead
    r = await fetch(`${base}/api/media/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Ayesha & Bilal — Wedding', project_type: 'wedding', lead_id: LEAD, location: 'Lahore' }),
    });
    const project = await J(r);
    check('POST /projects → 201', r.status === 201, `status ${r.status}`);
    check('project linked to lead_id', project.lead_id === LEAD);
    const PID = project.id;

    // 2b. rejects unknown lead_id (CRM link stays honest)
    r = await fetch(`${base}/api/media/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Bad', lead_id: 'nope' }),
    });
    check('POST /projects rejects unknown lead_id (400)', r.status === 400);

    // 2c. activity mirrored onto the CRM lead timeline
    const tl = db.prepare('SELECT * FROM activity_timeline WHERE lead_id = ?').all(LEAD);
    check('project creation wrote to lead activity_timeline', tl.length === 1, `rows=${tl.length}`);

    // 3. list shows client_name + asset_count
    r = await fetch(`${base}/api/media/projects`); body = await J(r);
    check('GET /projects lists the project', body.projects.length === 1);
    check('list joins client_name from leads', body.projects[0].client_name === 'Ayesha & Bilal');
    check('list reports asset_count 0', body.projects[0].asset_count === 0);

    // 4. presigned seam
    r = await fetch(`${base}/api/media/projects/${PID}/assets/sign`, { method: 'POST' }); body = await J(r);
    check('sign returns multipart contract', body.mode === 'multipart' && /\/assets$/.test(body.upload_url));

    // 5. upload two files (multipart, field "files")
    const fd = new FormData();
    fd.append('files', new Blob([Buffer.from('fake-jpeg-bytes-1')], { type: 'image/jpeg' }), 'IMG_001.jpg');
    fd.append('files', new Blob([Buffer.from('fake-raw-bytes-2')], { type: 'application/octet-stream' }), 'IMG_002.CR2');
    r = await fetch(`${base}/api/media/projects/${PID}/assets`, { method: 'POST', body: fd });
    body = await J(r);
    check('POST /assets uploads 2 files (201)', r.status === 201 && body.uploaded === 2, JSON.stringify(body));
    check('RAW file detected by extension', body.assets.some(a => a.type === 'raw'));
    check('photo detected by mime', body.assets.some(a => a.type === 'photo'));
    const ASSET = body.assets[0];

    // 5b. ingest jobs were enqueued (worker contract exists even with no worker running)
    const jobs = db.prepare("SELECT * FROM ms_jobs WHERE project_id = ? AND type = 'ingest'").all(PID);
    check('ingest jobs enqueued for each asset', jobs.length === 2, `jobs=${jobs.length}`);

    // 6. library listing
    r = await fetch(`${base}/api/media/projects/${PID}/assets`); body = await J(r);
    check('GET /assets library returns total 2', body.total === 2);
    check('assets expose a public url', body.assets.every(a => typeof a.url === 'string' && a.url.startsWith('/uploads/')));

    // 6b. the stored file is actually served by the static /uploads route
    r = await fetch(`${base}${ASSET.url}`);
    check('uploaded file is served over /uploads', r.status === 200, `status ${r.status}`);

    // 7. CONTROL-FIRST WALL: simulate the CV worker writing an ADVISORY score…
    db.prepare('INSERT INTO ms_asset_scores (id, workspace_id, asset_id, score_type, value, model_version) VALUES (?,?,?,?,?,?)')
      .run(crypto.randomUUID(), WS, ASSET.id, 'sharpness', 0.82, 'cv-v0');
    r = await fetch(`${base}/api/media/assets/${ASSET.id}`); body = await J(r);
    check('asset detail surfaces advisory AI score', body.scores.length === 1 && body.scores[0].score_type === 'sharpness');
    check('asset has NO human cull decision (AI cannot create one)', body.cull === null);
    // …and confirm the AI never touched the human-decision table.
    const culls = db.prepare('SELECT COUNT(*) n FROM ms_cull_decisions').get().n;
    check('ms_cull_decisions still empty — AI has no write path there', culls === 0);

    // 8. overview reflects the new state
    r = await fetch(`${base}/api/media/overview`); body = await J(r);
    check('overview now reports 2 assets', body.assets === 2 && body.projects === 1, JSON.stringify(body));

  } catch (e) {
    console.log('  ❌ threw:', e.message);
    failed++;
  } finally {
    // Clean teardown: await the server close and close the native DB BEFORE the process
    // exits, otherwise libuv asserts on Windows (handle closing during process.exit).
    await new Promise(res => server.close(res));
    try { db.close(); } catch {}
    try { fs.rmSync(uploadsDir, { recursive: true, force: true }); } catch {}
  }

  console.log(`\n${failed === 0 ? '🎉 PASS' : '🔴 FAIL'} — ${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
})();
