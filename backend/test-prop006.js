// PROP-006 — open findings, unfinished features and gaps, end to end against a real server.
// Boots server.js on an empty temporary database and checks each fix from the outside.
//   node test-prop006.js
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = 3000 + Math.floor(Math.random() * 900) + 5100;
const BASE = `http://127.0.0.1:${PORT}`;
const API = `${BASE}/api`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-prop006-'));

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓', m); } else { fails++; console.error('  ✗', m); } };

async function call(method, url, { token, body, headers = {} } = {}) {
  const r = await fetch(API + url, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; const text = await r.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers };
}
const register = async (email, name) => (await call('POST', '/auth/register', { body: { email, password: 'Passw0rd!long', businessName: name } })).data;

(async () => {
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), JWT_SECRET: 'prop006-test-secret', NODE_ENV: 'test', ...(globalThis.EXTRA_ENV || {}) };
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  const stop = () => { try { srv.kill('SIGKILL'); } catch {} try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 80; i++) { try { const r = await fetch(`${API}/plans`); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
    const db = new Database(path.join(DATA, 'wappflow.db'));

    // ── Owner + a "user"-role member in the same workspace ───────────────────
    const owner = await register('owner@acme.test', 'Acme');
    const OT = owner.token;
    const WS = db.prepare('SELECT workspace_id FROM users WHERE email = ?').get('owner@acme.test').workspace_id;
    const member = await register('agent@acme.test', 'Agent');
    const memberId = db.prepare('SELECT id FROM users WHERE email = ?').get('agent@acme.test').id;
    db.prepare('UPDATE users SET workspace_id = ? WHERE id = ?').run(WS, memberId);
    db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, full_name, invite_status) VALUES (?,?,?,?,?,'active')").run('m-agent', WS, memberId, 'user', 'Agent');
    const MT = member.token;

    console.log('\n[1] Role permissions are enforced by the server');
    let r = await call('POST', '/leads', { token: OT, body: { customer_name: 'Lina Haddad', customer_phone: '+971501112233' } });
    const leadId = r.data?.lead?.id || r.data?.id;
    ok(!!leadId, 'owner creates a lead');
    db.prepare('UPDATE leads SET assigned_to = ? WHERE id = ?').run(memberId, leadId);
    r = await call('DELETE', `/leads/${leadId}`, { token: MT });
    ok(r.status === 403 && r.data.permission_denied === 'delete_lead', 'a User-role member cannot delete a lead');
    r = await call('GET', '/reports/overview', { token: MT });
    ok(r.status === 403, '…cannot read revenue reports');
    r = await call('PUT', '/settings/company', { token: MT, body: { company_name: 'Hacked' } });
    ok(r.status === 403, '…cannot change company settings');
    r = await call('POST', '/invoices', { token: MT, body: { lead_id: leadId, items: [] } });
    ok(r.status === 403, '…cannot create invoices');
    r = await call('POST', '/platform-accounts', { token: MT, body: { platform: 'whatsapp', account_name: 'x' } });
    ok(r.status === 403, '…cannot add a WhatsApp number');
    r = await call('PUT', '/booking/settings', { token: MT, body: { settings: {} } });
    ok(r.status === 403, '…cannot change booking settings (module route)');
    r = await call('GET', '/auth/me', { token: MT });
    ok(r.data.permissions && r.data.permissions.delete_lead === false && r.data.permissions.create_lead === true, '/auth/me tells the UI what the role allows');
    r = await call('GET', '/reports/overview', { token: OT });
    ok(r.status === 200, 'the owner still can');
    // The owner widens the User role from Team → Roles; it now applies.
    await call('PUT', '/workspace/role-permissions', { token: OT, body: { role: 'user', permissions: { view_reports: true } } });
    r = await call('GET', '/reports/overview', { token: MT });
    ok(r.status === 200, 'saved role settings apply to members (they were ignored before)');

    console.log('\n[2] Lost reasons work');
    r = await call('POST', '/lost-reasons', { token: OT, body: { text: 'Went with a competitor' } });
    ok(r.status === 200, 'the owner adds a lost reason');
    r = await call('GET', '/lost-reasons', { token: MT });
    ok(r.data.reasons?.length === 1 && r.data.reasons[0].reason === 'Went with a competitor', 'everyone sees it when closing a lead');
    r = await call('POST', '/lost-reasons', { token: MT, body: { text: 'x' } });
    ok(r.status === 403, 'a User-role member cannot edit the list');

    if (globalThis.MORE_TESTS) await globalThis.MORE_TESTS({ call, db, OT, MT, WS, leadId, memberId, ok, API, BASE, DATA, register });
  } catch (e) {
    fails++; console.error('Test crashed:', e); console.error(log.slice(-3000));
  } finally {
    stop();
    console.log(`\n${passes} passed, ${fails} failed`);
    process.exit(fails ? 1 : 0);
  }
})();
