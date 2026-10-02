// PROP-005 — Command Center completion, end to end against a real server.
// Boots server.js on an empty temporary database and exercises every new path:
// 2FA login, step-up, revocation, DB browser gate + redaction, event spine,
// grace enforcement, manual billing, impersonation end, help desk, message
// explorer, bulk actions, admins, system health, export, stream tickets.
//   node test-cc-prop005.js
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sec = require('./cc-security');

const PORT = 3000 + Math.floor(Math.random() * 900) + 4100;
const API = `http://127.0.0.1:${PORT}/api`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-prop005-'));
const FOUNDER = { email: 'founder@test.local', password: 'founder-pass-123' };

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

(async () => {
  const env = { ...process.env, DATA_DIR: DATA, PORT: String(PORT), JWT_SECRET: 'prop005-test-secret', NODE_ENV: 'test',
    CC_FOUNDER_EMAIL: FOUNDER.email, CC_FOUNDER_PASSWORD: FOUNDER.password };
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; srv.stdout.on('data', (d) => { log += d; }); srv.stderr.on('data', (d) => { log += d; });
  const stop = () => { try { srv.kill('SIGKILL'); } catch {} try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {} };
  try {
    for (let i = 0; i < 80; i++) { try { const r = await fetch(`${API}/plans`); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }

    console.log('\n[1] Two-step login');
    let r = await call('POST', '/cc/login', { body: FOUNDER });
    ok(r.status === 200 && r.data.mfa_setup_required && !r.data.token, 'password alone never returns a session; enrolment required');
    const mfaTok = r.data.mfa_token;
    r = await call('POST', '/cc/mfa/setup', { body: { mfa_token: mfaTok } });
    ok(r.status === 200 && /^[A-Z2-7]{32}$/.test(r.data.secret) && /^data:image\/png/.test(r.data.qr || ''), 'setup returns a base32 secret + QR');
    const secret = r.data.secret;
    r = await call('POST', '/cc/mfa/enable', { body: { mfa_token: mfaTok, code: '000000' } });
    ok(r.status === 401, 'wrong code is rejected at enrolment');
    r = await call('POST', '/cc/mfa/enable', { body: { mfa_token: mfaTok, code: sec.totp(secret) } });
    ok(r.status === 200 && r.data.token && r.data.recovery_codes?.length === 10, 'right code → session + 10 recovery codes');
    let T = r.data.token;
    const recovery = r.data.recovery_codes;

    r = await call('POST', '/cc/login', { body: FOUNDER });
    ok(r.data.mfa_required && !r.data.token, 'next sign-in asks for the code');
    r = await call('POST', '/cc/login/mfa', { body: { mfa_token: r.data.mfa_token, code: recovery[0] } });
    ok(r.status === 200 && r.data.token, 'a recovery code signs in once');
    const reuse = await call('POST', '/cc/login', { body: FOUNDER });
    r = await call('POST', '/cc/login/mfa', { body: { mfa_token: reuse.data.mfa_token, code: recovery[0] } });
    ok(r.status === 401, '…and cannot be reused');

    console.log('\n[2] Tokens: header only, revocation');
    r = await call('GET', `/cc/me?token=${T}`);
    ok(r.status === 401, 'a token in the query string is refused');
    r = await call('GET', '/cc/me', { token: T });
    ok(r.status === 200 && r.data.mfa_enabled === true && r.data.recovery_codes_left === 9, 'header token works; recovery count tracks use');

    console.log('\n[3] Step-up + database browser');
    r = await call('GET', '/cc/db/tables/users', { token: T });
    ok(r.status === 403 && r.data.need_step_up, 'reading table rows needs a step-up');
    r = await call('POST', '/cc/step-up', { token: T, body: { password: FOUNDER.password } });
    ok(r.status === 401, 'step-up needs the authenticator code too');
    r = await call('POST', '/cc/step-up', { token: T, body: { password: FOUNDER.password, code: sec.totp(secret) } });
    ok(r.status === 200 && r.data.token, 'password + code → elevated token');
    const E = r.data.token;

    console.log('\n[4] Customer signup → event spine + inbox');
    r = await call('POST', '/auth/register', { body: { email: 'owner@acme.test', password: 'customer-pass-1', businessName: 'Acme Realty' } });
    ok(r.status === 201, 'customer registers');
    const C = r.data.token, WS = r.data.user.workspace_id;
    r = await call('GET', '/cc/events?type=workspace_created', { token: T });
    ok(r.data.events.some((e) => e.workspace_id === WS && e.workspace_name === 'Acme Realty'), 'workspace_created recorded by trigger, with name');
    r = await call('GET', '/cc/events?type=user_signed_up', { token: T });
    ok(r.data.events.some((e) => e.workspace_id === WS), 'user_signed_up recorded');
    r = await call('GET', '/cc/inbox', { token: T });
    ok(r.data.items.some((i) => i.kind === 'new_signup' && i.workspace_id === WS), 'Founder Inbox gets the new signup');
    r = await call('GET', `/cc/events?workspace_id=${WS}`, { token: T });
    ok(r.data.events.length > 0 && r.data.events.every((e) => e.workspace_id === WS), 'workspace filter applies to every row');

    r = await call('GET', '/cc/db/tables/users', { token: E });
    ok(r.status === 200 && r.data.rows.every((u) => u.password === '[redacted]'), 'elevated browse works; password column redacted');
    r = await call('GET', '/cc/db/tables/cc_admins', { token: E });
    ok(r.data.rows.every((a) => a.password_hash === '[redacted]' && (a.mfa_secret === '[redacted]' || a.mfa_secret == null)), 'admin hashes and 2FA secrets redacted');

    console.log('\n[5] Grace periods actually lift limits');
    r = await call('GET', `/cc/workspaces/${WS}`, { token: T });
    const before = r.data.entitlements.limits;
    ok(Object.values(before).some((v) => v !== -1), 'plan has finite limits before grace');
    r = await call('POST', `/cc/workspaces/${WS}/grace`, { token: T, body: { days: 3, reason: 'test' } });
    const graceId = r.data.id;
    r = await call('GET', `/cc/workspaces/${WS}`, { token: T });
    ok(Object.values(r.data.entitlements.limits).every((v) => v === -1) && r.data.entitlements.grace_until, 'during grace every limit is unlimited');
    await call('POST', `/cc/grace/${graceId}/end`, { token: T });
    r = await call('GET', `/cc/workspaces/${WS}`, { token: T });
    ok(JSON.stringify(r.data.entitlements.limits) === JSON.stringify(before), 'ending grace restores the plan limits');

    console.log('\n[6] Manual billing');
    r = await call('PUT', `/cc/workspaces/${WS}/subscription`, { token: T, body: { plan: 'studio', amount: 59, interval: 'month', charge_now: true } });
    ok(r.status === 200 && r.data.balance === 59, 'subscription created and first period charged ($59 owed)');
    r = await call('POST', `/cc/workspaces/${WS}/billing/entries`, { token: T, body: { kind: 'payment', amount: 59, method: 'bank_transfer', reference: 'TX-1' } });
    ok(r.status === 200 && r.data.balance === 0, 'payment recorded; balance cleared');
    r = await call('POST', `/cc/workspaces/${WS}/billing/entries`, { token: T, body: { kind: 'refund', amount: 10 } });
    ok(r.status === 403 && r.data.need_step_up, 'refunds need a step-up');
    r = await call('GET', '/cc/billing/overview', { token: T });
    ok(r.data.mrr === 59 && r.data.paying === 1, 'real MRR comes from recorded subscriptions');
    r = await call('GET', '/cc/overview', { token: T });
    ok(r.data.revenue.mrr === 59 && typeof r.data.revenue.implied_mrr === 'number', 'Overview shows real and implied MRR');

    console.log('\n[7] Impersonation can be ended server-side');
    r = await call('POST', `/cc/workspaces/${WS}/impersonate`, { token: T, body: { mode: 'write' } });
    ok(r.status === 403 && r.data.need_step_up, 'write-mode impersonation needs a step-up');
    r = await call('POST', `/cc/workspaces/${WS}/impersonate`, { token: T, body: { mode: 'read' } });
    const IMP = r.data.token;
    r = await call('GET', '/auth/me', { token: IMP });
    ok(r.status === 200, 'impersonation token works');
    r = await call('POST', '/cc/impersonation/end', { token: IMP });
    ok(r.status === 200, 'banner exit ends the session');
    r = await call('GET', '/auth/me', { token: IMP });
    ok(r.status === 401 && r.data.impersonation_ended, 'the ended token is refused although not expired');

    console.log('\n[8] Help desk');
    r = await call('POST', '/support/tickets', { token: C, body: { subject: 'Cannot export leads', body: 'The export button does nothing.', kind: 'bug' } });
    ok(r.status === 200, 'customer opens a ticket');
    const TK = r.data.id;
    r = await call('GET', '/cc/tickets', { token: T });
    ok(r.data.tickets.some((t) => t.id === TK && t.requester_email === 'owner@acme.test'), 'it lands in Command Center Support with the requester');
    r = await call('GET', '/cc/inbox', { token: T });
    ok(r.data.items.some((i) => i.kind === 'support_ticket' && i.workspace_id === WS), 'and in the Founder Inbox');
    await call('POST', `/cc/tickets/${TK}/comment`, { token: T, body: { body: 'Internal: repro on staging', internal: true } });
    await call('POST', `/cc/tickets/${TK}/comment`, { token: T, body: { body: 'Thanks — fixed in today’s release.' } });
    r = await call('GET', `/support/tickets/${TK}`, { token: C });
    ok(r.data.comments.length === 1 && /fixed/.test(r.data.comments[0].body), 'customer sees the public reply, never the internal note');
    r = await call('GET', '/notifications', { token: C });
    ok(JSON.stringify(r.data).includes('WappFlow support replied'), 'customer is notified of the reply');
    r = await call('POST', '/auth/register', { body: { email: 'other@else.test', password: 'customer-pass-2', businessName: 'Other Co' } });
    const C2 = r.data.token;
    r = await call('GET', `/support/tickets/${TK}`, { token: C2 });
    ok(r.status === 404, 'another workspace cannot read the ticket');

    console.log('\n[9] Message explorer is founder + step-up only');
    r = await call('GET', '/cc/messages/search?q=hello', { token: T });
    ok(r.status === 403 && r.data.need_step_up, 'search needs a step-up');
    r = await call('GET', '/cc/messages/search?q=hello', { token: E });
    ok(r.status === 200 && Array.isArray(r.data.results), 'elevated founder can search');

    console.log('\n[10] Bulk actions');
    r = await call('POST', '/cc/bulk', { token: T, body: { action: 'suspend', workspace_ids: [WS] } });
    ok(r.status === 403 && r.data.need_step_up, 'bulk actions need a step-up');
    r = await call('POST', '/cc/bulk', { token: E, body: { action: 'suspend', workspace_ids: [WS] } });
    ok(r.status === 200 && r.data.count === 1, 'bulk suspend applies');
    r = await call('GET', '/auth/me', { token: C });
    ok(r.status === 403 && r.data.suspended, 'the suspended customer is locked out');
    await call('POST', '/cc/bulk', { token: E, body: { action: 'restore', workspace_ids: [WS] } });

    console.log('\n[11] Admins');
    r = await call('POST', '/cc/admins', { token: E, body: { email: 'ops@test.local', role: 'ops' } });
    ok(r.status === 200 && r.data.temporary_password, 'invite an ops admin (temporary password once)');
    r = await call('GET', '/cc/admins', { token: T });
    const me = r.data.admins.find((a) => a.email === FOUNDER.email);
    r = await call('PATCH', `/cc/admins/${me.id}`, { token: E, body: { role: 'ops' } });
    ok(r.status === 400, 'the last founder cannot be demoted');

    console.log('\n[12] System health · export · stream ticket · plan clone · flag kill');
    r = await call('GET', '/cc/system', { token: T });
    ok(r.status === 200 && r.data.checks.length >= 4 && r.data.jobs.some((j) => j.key === 'billing_daily'), 'system snapshot with checks and jobs');
    const ex = await fetch(`${API}/cc/export?dataset=customers&format=csv`, { headers: { Authorization: `Bearer ${T}` } });
    ok(ex.status === 200 && (await ex.text()).includes('Acme Realty'), 'export works with a header token');
    r = await call('POST', '/cc/events/stream-ticket', { token: T });
    const ctl = new AbortController();
    const sse = await fetch(`${API}/cc/events/stream?ticket=${encodeURIComponent(r.data.ticket)}`, { signal: ctl.signal });
    ok(sse.status === 200 && /event-stream/.test(sse.headers.get('content-type') || ''), 'stream opens with a 60-second ticket');
    ctl.abort();
    const bad = await fetch(`${API}/cc/events/stream?ticket=${T}`);
    ok(bad.status === 401, 'a session token is not a stream ticket');
    r = await call('POST', '/cc/plans/studio/clone', { token: T, body: { key: 'studio_agency', name: 'Studio Agency' } });
    ok(r.status === 200, 'plan cloned');
    r = await call('GET', '/cc/plans', { token: T });
    const cl = r.data.plans.find((p) => p.key === 'studio_agency');
    ok(cl && Object.keys(cl.limits).length > 0 && cl.prices.length > 0, 'clone carries limits and prices');
    await call('POST', '/cc/flags', { token: T, body: { key: 'beta_x', default_state: 1 } });
    r = await call('POST', '/cc/flags/beta_x/kill', { token: T });
    r = await call('GET', `/cc/workspaces/${WS}`, { token: T });
    ok(r.data.entitlements.features.beta_x === false, 'kill switch turns a flag off for everyone');

    console.log('\n[13] Logout revokes');
    await call('POST', '/cc/logout', { token: T });
    r = await call('GET', '/cc/me', { token: T });
    ok(r.status === 401, 'the session ends on logout');
  } catch (e) {
    fails++; console.error('Test crashed:', e); console.error(log.slice(-3000));
  } finally {
    stop();
    console.log(`\n${passes} passed, ${fails} failed`);
    process.exit(fails ? 1 : 0);
  }
})();
