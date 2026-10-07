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

    console.log('\n[3] Uploaded files cannot run as pages; names are unguessable');
    fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });
    fs.writeFileSync(path.join(DATA, 'uploads', 'evil.html'), '<script>alert(1)</script>');
    let u = await fetch(`${BASE}/uploads/evil.html`);
    ok(/sandbox/.test(u.headers.get('content-security-policy') || '') && /attachment/.test(u.headers.get('content-disposition') || ''), 'an uploaded HTML file is served as a sandboxed download');
    ok(u.headers.get('x-content-type-options') === 'nosniff', 'uploads are served with nosniff');
    r = await call('GET', '/auth/me', { token: OT });
    ok(/default-src 'none'/.test(r.headers.get('content-security-policy') || ''), 'API JSON carries a strict CSP');
    const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    ok(!/cb\(null, `voice-\$\{Date\.now\(\)\}\.\$\{ext\}`\)/.test(SRV) && /unguessable\(\)/.test(SRV), 'voice-note and file names carry random bits');

    console.log('\n[4] Gallery passwords: bcrypt, legacy upgrade, lockout');
    r = await call('POST', '/media/projects', { token: OT, body: { title: 'Dubai wedding' } });
    const PID = r.data?.project?.id || r.data?.id;
    r = await call('POST', `/media/projects/${PID}/galleries`, { token: OT, body: { title: 'Highlights', visibility: 'password', password: 'sunset-42' } });
    const GID = r.data?.id || r.data?.gallery?.id;
    ok(!!GID, 'password gallery created');
    ok(db.prepare('SELECT password_hash FROM ms_galleries WHERE id = ?').get(GID).password_hash.startsWith('$2'), 'new gallery passwords are bcrypt');
    db.prepare("INSERT INTO ms_assets (id, workspace_id, project_id, storage_key, filename, mime) VALUES ('a1', ?, ?, 'media/x.jpg', 'x.jpg', 'image/jpeg')").run(WS, PID);
    db.prepare("INSERT INTO ms_gallery_assets (gallery_id, asset_id) VALUES (?, 'a1')").run(GID);
    r = await call('POST', `/media/galleries/${GID}/publish`, { token: OT, body: { notify: false } });
    const TOKEN = db.prepare('SELECT share_token FROM ms_galleries WHERE id = ?').get(GID).share_token;
    ok(!!TOKEN, 'gallery published');
    const legacy = require('crypto').createHash('sha256').update(`${GID}::old-pass`).digest('hex');
    db.prepare('UPDATE ms_galleries SET password_hash = ? WHERE id = ?').run(legacy, GID);
    r = await call('GET', `/media/portal/${TOKEN}?pw=old-pass`);
    ok(r.status === 200, 'an old (SHA-256) password still opens the gallery');
    ok(db.prepare('SELECT password_hash FROM ms_galleries WHERE id = ?').get(GID).password_hash.startsWith('$2'), '…and is upgraded to bcrypt on that visit');
    for (let i = 0; i < 10; i++) await call('GET', `/media/portal/${TOKEN}?pw=wrong-${i}`);
    r = await call('GET', `/media/portal/${TOKEN}?pw=old-pass`);
    ok(r.status === 429, 'after 10 wrong guesses even the right password waits 15 minutes');

    console.log('\n[5] Two-step sign-in for customers');
    const sec = require('./cc-security');
    const login = (email) => call('POST', '/auth/login', { body: { email, password: 'Passw0rd!long' } });
    r = await login('owner@acme.test');
    ok(r.status === 200 && r.data.token, 'without 2FA, sign-in is unchanged');
    r = await call('POST', '/account/mfa/setup', { token: OT });
    const SECRET = r.data.secret;
    ok(/^[A-Z2-7]{32}$/.test(SECRET) && /^data:image\/png/.test(r.data.qr || ''), 'set-up returns a key and a QR code');
    r = await call('POST', '/account/mfa/enable', { token: OT, body: { code: '000000' } });
    ok(r.status === 401, 'a wrong code does not turn it on');
    r = await call('POST', '/account/mfa/enable', { token: OT, body: { code: sec.totp(SECRET) } });
    ok(r.status === 200 && r.data.recovery_codes?.length === 10, 'the right code turns it on and shows 10 recovery codes');
    const RC = r.data.recovery_codes;
    r = await login('owner@acme.test');
    ok(r.data.mfa_required && !r.data.token, 'now the password alone gives no session');
    const mt = r.data.mfa_token;
    r = await call('POST', '/auth/login/mfa', { body: { mfa_token: mt, code: '123456' } });
    ok(r.status === 401, 'a wrong code is refused');
    r = await call('POST', '/auth/login/mfa', { body: { mfa_token: mt, code: sec.totp(SECRET) } });
    ok(r.status === 200 && r.data.token && r.data.workspace, 'password + code signs in');
    r = await login('owner@acme.test');
    r = await call('POST', '/auth/login/mfa', { body: { mfa_token: r.data.mfa_token, code: RC[0] } });
    ok(r.status === 200 && r.data.token, 'a recovery code signs in once');
    r = await login('owner@acme.test');
    r = await call('POST', '/auth/login/mfa', { body: { mfa_token: r.data.mfa_token, code: RC[0] } });
    ok(r.status === 401, '…and never again');
    r = await call('POST', '/auth/login/mfa', { body: { mfa_token: OT, code: sec.totp(SECRET) } });
    ok(r.status === 401, 'a normal session token cannot stand in for the sign-in token');

    console.log('\n[6] An owner can require it for the team');
    r = await call('PUT', '/workspace/security', { token: MT, body: { require_2fa: true } });
    ok(r.status === 403, 'only the owner can change the policy');
    r = await call('PUT', '/workspace/security', { token: OT, body: { require_2fa: true } });
    ok(r.status === 200, 'the owner requires it');
    r = await login('agent@acme.test');
    ok(r.data.mfa_setup_required && !r.data.token, 'a member without it must set it up at sign-in');
    const mt2 = r.data.mfa_token;
    r = await call('POST', '/auth/mfa/setup', { body: { mfa_token: mt2 } });
    const S2 = r.data.secret;
    r = await call('POST', '/auth/mfa/enable', { body: { mfa_token: mt2, code: sec.totp(S2) } });
    ok(r.status === 200 && r.data.token && r.data.recovery_codes?.length === 10, 'set-up during sign-in finishes with a session and recovery codes');
    r = await call('POST', '/account/mfa/disable', { token: r.data.token, body: { password: 'Passw0rd!long', code: sec.totp(S2) } });
    ok(r.status === 400, 'members cannot turn it off while the workspace requires it');
    r = await call('GET', '/auth/me', { token: OT });

    console.log('\n[7] Email verification');
    const nu = await register('new@acme.test', 'Newco');
    const row = db.prepare('SELECT email_verified_at, email_verify_token FROM users WHERE email = ?').get('new@acme.test');
    ok(!row.email_verified_at && /^[a-f0-9]{48}$/.test(row.email_verify_token || ''), 'sign-up creates an unconfirmed address with a link token');
    r = await call('GET', '/auth/me', { token: nu.token });
    ok(r.data.user && !r.data.user.email_verified_at, 'the app knows it is unconfirmed');
    r = await call('POST', '/auth/verify-email', { body: { token: 'f'.repeat(48) } });
    ok(r.status === 400, 'a made-up link is refused');
    r = await call('POST', '/auth/verify-email', { body: { token: row.email_verify_token } });
    ok(r.status === 200 && !!db.prepare('SELECT email_verified_at FROM users WHERE email = ?').get('new@acme.test').email_verified_at, 'the emailed link confirms it');
    r = await call('POST', '/account/verify-email/send', { token: nu.token });
    ok(r.status === 200 && r.data.already, 'resending after confirming is a no-op');

    console.log('\n[8] Multiple pipelines');
    r = await call('GET', '/workspace/plan-info', { token: OT });
    ok((r.data.plan === 'studio' || r.data.plan_key === 'studio') && r.data.trial_ends_at && Math.round((new Date(r.data.trial_ends_at) - Date.now()) / 86400000) === 14, 'a new workspace starts on a 14-day Studio trial');
    ok(r.data.features && r.data.features.sso !== true && r.data.features.api_access !== true && r.data.features.byok !== true, 'unbuilt Enterprise features are never switched on');
    // The rest of this section exercises the Creator → Studio gate, so end the trial.
    db.prepare("UPDATE workspace_plan SET plan = 'creator', trial_ends_at = NULL WHERE workspace_id = ?").run(WS);
    await new Promise((res) => setTimeout(res, 31000)); // entitlements cache is 30 s
    r = await call('GET', '/pipelines', { token: OT });
    const DEF = r.data.pipelines?.find((p) => p.is_default);
    ok(DEF && r.data.pipelines.length === 1 && r.data.stages.length === 6, 'every workspace starts with one default pipeline over the six stages');
    ok(r.data.can_add === false, 'Creator cannot add a second pipeline');
    r = await call('POST', '/pipelines', { token: OT, body: { name: 'Corporate' } });
    ok(r.status === 402 && r.data.upgrade, '…and is told it needs Studio');
    db.prepare("INSERT INTO workspace_plan (workspace_id, plan) VALUES (?, 'studio') ON CONFLICT(workspace_id) DO UPDATE SET plan = 'studio'").run(WS);
    await new Promise((res) => setTimeout(res, 31000)); // entitlements cache is 30 s
    r = await call('POST', '/pipelines', { token: OT, body: { name: 'Corporate', stage_labels: { Interested: 'Proposal sent', New: 'New' } } });
    ok(r.status === 201 && r.data.pipeline.stage_labels.Interested === 'Proposal sent' && !r.data.pipeline.stage_labels.New, 'Studio adds a pipeline with its own stage names');
    const CORP = r.data.pipeline.id;
    r = await call('POST', '/pipelines', { token: MT, body: { name: 'Sneaky' } });
    ok(r.status === 403, 'a User-role member cannot add pipelines');
    r = await call('POST', '/leads', { token: OT, body: { customer_name: 'Gulf Events LLC', customer_phone: '+971509998877', pipeline_id: CORP } });
    const corpLead = r.data?.lead?.id || r.data?.id;
    r = await call('GET', `/leads?pipeline_id=${CORP}`, { token: OT });
    ok(r.data.leads.length === 1 && r.data.leads[0].id === corpLead, 'a lead created on a board lands on that board');
    r = await call('GET', '/leads?pipeline_id=default', { token: OT });
    ok(!r.data.leads.some((l) => l.id === corpLead), '…and not on the default board');
    r = await call('PUT', `/leads/${corpLead}`, { token: OT, body: { pipeline_id: 'not-a-pipeline' } });
    ok(r.status === 400, 'a lead cannot be moved to a pipeline that does not exist');
    const other = await register('rival@other.test', 'Rival');
    r = await call('POST', `/pipelines/${CORP}/leads`, { token: other.token, body: { lead_ids: [corpLead] } });
    ok(r.status === 404 || (r.status === 200 && r.data.moved === 0), 'another workspace cannot touch this pipeline');
    r = await call('DELETE', `/pipelines/${CORP}`, { token: OT });
    ok(r.status === 200 && r.data.leads_moved_to_default === 1, 'deleting a pipeline moves its leads to the default');
    r = await call('GET', '/leads?pipeline_id=default', { token: OT });
    ok(r.data.leads.some((l) => l.id === corpLead), '…where they appear, nothing lost');
    r = await call('DELETE', `/pipelines/${DEF.id}`, { token: OT });
    ok(r.status === 400, 'the default pipeline cannot be deleted');

    console.log('\n[9] Editing respects lead visibility');
    const hidden = (await call('POST', '/leads', { token: OT, body: { customer_name: 'Unassigned Co', customer_phone: '+33612345678' } })).data;
    const hiddenId = hidden?.lead?.id || hidden?.id;
    r = await call('PUT', `/leads/${hiddenId}`, { token: MT, body: { customer_name: 'Renamed' } });
    ok(r.status === 404, 'a member who only sees assigned leads cannot edit another lead by id');

    console.log('\n[10] Connected-account secrets stay on the server');
    db.prepare("INSERT INTO platform_accounts (id, workspace_id, platform, account_name, account_handle, credentials, webhook_verify_token, status) VALUES ('ig1', ?, 'instagram', 'Studio IG', '1784', ?, 'vt-ig1', 'active')")
      .run(WS, JSON.stringify({ app_id: '123', app_secret: 'APP-SECRET-XYZ', access_token: 'PAGE-TOKEN-XYZ' }));
    r = await call('GET', '/platform-accounts', { token: MT });
    const ig = r.data.accounts.find((a) => a.id === 'ig1');
    ok(ig && !JSON.stringify(r.data).includes('PAGE-TOKEN-XYZ') && !JSON.stringify(r.data).includes('APP-SECRET-XYZ'), 'the list never returns page tokens or app secrets');
    ok(ig.credentials.app_id === '123' && ig.credentials.has_access_token === true, '…but shows what is set');
    r = await call('PUT', '/platform-accounts/ig1', { token: OT, body: { credentials: { ...ig.credentials, app_id: '456' } } });
    const stored = JSON.parse(db.prepare("SELECT credentials FROM platform_accounts WHERE id = 'ig1'").get().credentials);
    ok(stored.access_token === 'PAGE-TOKEN-XYZ' && stored.app_id === '456' && !('has_access_token' in stored), 'saving the form keeps the real secrets and changes the rest');

    if (globalThis.MORE_TESTS) await globalThis.MORE_TESTS({ call, db, OT, MT, WS, leadId, memberId, ok, API, BASE, DATA, register });
  } catch (e) {
    fails++; console.error('Test crashed:', e); console.error(log.slice(-3000));
  } finally {
    stop();
    console.log(`\n${passes} passed, ${fails} failed`);
    process.exit(fails ? 1 : 0);
  }
})();
