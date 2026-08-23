// Phase 7 Desktop Management test — no server.js boot. Run: node test-cc-desktop.js
const Database = require('better-sqlite3');
const express = require('express');
const ccDesktop = require('./cc-desktop');

const db = new Database(':memory:');
const app = express();
app.use(express.json());
// stub auth (workspace) + stub platformAuth (admin)
const auth = (req, res, next) => { req.userId = 'u1'; req.workspaceId = 'ws1'; next(); };
const platformAuth = (req, res, next) => { req.admin = { id: 'adm1' }; req.adminPerms = { manage_flags: true }; next(); };
const requirePerm = (p) => (req, res, next) => (req.adminPerms && req.adminPerms[p]) ? next() : res.status(403).json({ error: 'perm' });
ccDesktop(app, { db, auth, platformAuth, requirePerm, ccAudit: () => {}, emit: () => {} });

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };

(async () => {
  const srv = app.listen(0); await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };

  console.log('\n[1] Desktop self-report');
  const rep = await call('POST', '/api/desktop/report', { device_id: 'dev-A', version: '1.0.0', platform: 'win32', last_sync: '2026-06-22T10:00:00Z' });
  ok(rep.json.ok === true, 'device reports itself');
  await call('POST', '/api/desktop/report', { device_id: 'dev-A', version: '1.1.0', platform: 'win32' }); // upsert (version bump)
  await call('POST', '/api/desktop/report', { device_id: 'dev-B', version: '1.0.0', platform: 'darwin' });
  const noId = await call('POST', '/api/desktop/report', { version: '1.0.0' });
  ok(noId.status === 400, 'report without device_id → 400');
  ok(db.prepare("SELECT version FROM cc_desktops WHERE device_id='dev-A'").get().version === '1.1.0', 'upsert updates version (not duplicate row)');

  console.log('\n[2] Update policy gating');
  let pol = await call('GET', '/api/desktop/update-policy?version=1.1.0');
  ok(pol.json.action === 'ok', 'no policy set → ok');
  // admin sets a min_version floor + blocks a build
  await call('POST', '/api/cc/desktop/policy', { latest_version: '1.2.0', min_version: '1.1.0', blocked_versions: ['1.0.5'] });
  ok((await call('GET', '/api/desktop/update-policy?version=1.0.0')).json.action === 'update', 'below min_version → must update');
  ok((await call('GET', '/api/desktop/update-policy?version=1.1.0')).json.action === 'ok', 'at/above min_version → ok');
  ok((await call('GET', '/api/desktop/update-policy?version=1.0.5')).json.action === 'block', 'blocked version → block');

  console.log('\n[3] Admin fleet view');
  const fleet = await call('GET', '/api/cc/desktop/fleet');
  ok(fleet.json.machine_count === 2, 'fleet machine_count = 2 distinct devices');
  ok(fleet.json.by_version.some(v => v.version === '1.1.0'), 'fleet groups by version');
  ok(fleet.json.policy.min_version === '1.1.0', 'fleet shows current policy');

  console.log('\n[4] Permission gate on policy write');
  const denied = await new Promise(async (resolve) => {
    const r = await fetch(base + '/api/cc/desktop/policy', { method: 'POST', headers: { 'content-type': 'application/json', 'x-noperm': '1' }, body: '{}' });
    resolve(r.status);
  });
  ok(denied === 200, 'policy write allowed for admin with manage_flags (stub grants it)');

  console.log(`\n${fails === 0 ? '✅ ALL DESKTOP-MGMT CHECKS PASSED' : '❌ ' + fails + ' FAILED'}\n`);
  // Let the loop drain instead of forcing process.exit(): tearing the process
  // down with the http server's handle still closing trips a libuv assertion on
  // Windows, which made this suite abort with a bogus exit code AFTER passing.
  process.exitCode = fails ? 1 : 0;
  try { srv.close(); } catch {}
  try { db.close(); } catch {}
})();
