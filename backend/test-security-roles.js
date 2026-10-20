'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  SECURITY — privilege inside one workspace.
//
//  The tenant tests prove studio A cannot touch studio B. This proves the
//  lowest role INSIDE a studio cannot do what only admins should: a "user"
//  (no settings, team, billing, invoices, WhatsApp, delete, or reports, and
//  only the leads assigned to them) is driven through every authenticated
//  route, pointed at the studio's real records.
//
//    • A route guarded by requirePerm / an admin role check that answers 2xx
//      is a hard failure.
//    • An UNGUARDED route under an admin-shaped path that writes successfully
//      is reported for review (and fails the run unless it is in ALLOWED).
//    • Lead visibility: a lead not assigned to the user must not appear in the
//      list, its page, search, or exports.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3021 RATE_LIMIT_ACCOUNT=5000 node server.js &
//    WF_API=http://127.0.0.1:3021/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-security-roles.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const API = process.env.WF_API || 'http://127.0.0.1:3021/api';
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');
const { requireSameDb } = require('./test-db-check');

const RUN = crypto.randomBytes(4).toString('hex');
const DIGITS = String(Date.now()).slice(-6);
const openDb = (rw) => new Database(process.env.WF_DB, rw ? {} : { readonly: true });
const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  const text = await r.text(); let d = null; try { d = JSON.parse(text); } catch {}
  return { status: r.status, d, text };
};

// Every authenticated route, with what guards it.
function discover() {
  const re = /app\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*([^\n]*)/g;
  const out = [];
  for (const f of fs.readdirSync(__dirname)) {
    if (!f.endsWith('.js') || f.startsWith('test-') || f.startsWith('_')) continue;
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const [, method, p, rest] = m;
      const head = rest.split('=>')[0];
      if (!/\bauth\b/.test(head) || !p.startsWith('/api/')) continue;
      // The handler's first lines: an inline role check counts as a guard too.
      const body = src.slice(m.index, m.index + 700);
      const perm = (head.match(/requirePerm\('(\w+)'\)/) || [])[1] || null;
      const roleCheck = /req\.userRole\s*!==\s*'super_admin'|\['super_admin',\s*'admin'\]\.includes\(req\.userRole\)|isAdminRole\(req\)/.test(body);
      out.push({ method: method.toUpperCase(), path: p, file: f, perm, roleCheck });
    }
  }
  return out;
}

const SKIP = /\/auth\/|logout|password|\/mfa|2fa|\/whatsapp\/(reconnect|connect|disconnect|pair-code|accounts\/:id\/(connect|disconnect|pair-code))|\/sessions\/revoke|\/account\/(delete|close)/;
// Admin-shaped areas: an unguarded write here is suspicious.
const ADMIN_PATH = /^\/api\/(settings|workspace|team|integrations|platform-accounts|whatsapp\/accounts|email-templates|auto-reply|presets|tags|pipelines|lost-reasons|knowledge|memories|billing|plan|subscription|store\/products|booking\/settings|cs\/settings|cs\/templates|audit|webhooks|api-keys|ai\/settings|brains|roles)/;
// Reviewed: unguarded writes a plain member is meant to make.
const ALLOWED = new Set([
  'POST /api/tags',            // members can tag leads they work (create stays allowed; edit/delete is manage_settings)
  'POST /api/cs/templates',    // writing contracts is everyday work for every role; templates are where they start
]);

(async () => {
  await requireSameDb(API, Database);
  const owner = (await j('POST', '/auth/register', null, { email: `owner-${RUN}@test.local`, password: 'owner-password-1', businessName: 'Owner Studio' })).d;
  const plain = (await j('POST', '/auth/register', null, { email: `plain-${RUN}@test.local`, password: 'plain-password-1', businessName: 'x' })).d;
  assert(owner?.token && plain?.token, 'could not register - is the server up on ' + API + ' ?');
  const WS = owner.user.workspace_id;

  // The plain user joins the owner's studio with role "user".
  const w = openDb(true);
  w.prepare('UPDATE users SET workspace_id = ? WHERE id = ?').run(WS, plain.user.id);
  w.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role, invite_status, full_name) VALUES (?, ?, ?, 'user', 'active', 'Plain')").run('wm-' + RUN, WS, plain.user.id);
  w.close();

  // The studio's records, created by the owner. One lead is the user's own.
  const ids = {};
  const SECRET = `HIDDEN${RUN}`;
  ids.lead = (await j('POST', '/leads', owner.token, { customer_name: `${SECRET} Client`, customer_phone: `92301${DIGITS}1`, status: 'New' })).d?.id;
  ids.mine = (await j('POST', '/leads', owner.token, { customer_name: `Mine ${RUN}`, customer_phone: `92301${DIGITS}2`, status: 'New' })).d?.id;
  await j('PUT', `/leads/${ids.mine}`, owner.token, { assigned_to: plain.user.id });
  ids.invoice = (await j('POST', '/invoices', owner.token, { lead_id: ids.lead, customer_name: `${SECRET} Client`, items: [], total: 500 })).d?.invoice?.id;
  ids.emailTemplate = (await j('POST', '/email-templates', owner.token, { name: 'T', subject: 's', body: 'b' })).d?.id;
  const pl = (await j('POST', '/pipelines', owner.token, { name: 'P' })).d; ids.pipeline = pl?.pipeline?.id || pl?.id;
  const db = openDb(true);
  const plant = (sql, ...a) => { try { db.prepare(sql).run(...a); return a[0]; } catch { return null; } };
  ids.tag = plant('INSERT INTO tags (id, user_id, name) VALUES (?,?,?)', 'tg-' + RUN, owner.user.id, 'Tag');
  ids.waAccount = plant("INSERT INTO platform_accounts (id, workspace_id, platform, account_name, status) VALUES (?,?,'whatsapp','WA','disconnected')", 'pa-' + RUN, WS);
  ids.preset = plant('INSERT INTO message_presets (id, user_id, title, body) VALUES (?,?,?,?)', 'pr-' + RUN, owner.user.id, 'P', 'B');
  ids.autoReply = plant("INSERT INTO auto_reply_rules (id, user_id, name, keywords, reply_message) VALUES (?,?,?,'[]','r')", 'ar-' + RUN, owner.user.id, 'R');
  ids.knowledge = plant('INSERT INTO knowledge_documents (id, workspace_id, document_name) VALUES (?,?,?)', 'kd-' + RUN, WS, 'K');
  ids.memory = plant("INSERT INTO ai_memories (id, workspace_id, memory_type, key, value) VALUES (?,?,'fact','k','v')", 'me-' + RUN, WS);
  ids.lostReason = plant('INSERT INTO lost_reasons (id, workspace_id, reason) VALUES (?,?,?)', 'lr-' + RUN, WS, 'L');
  ids.member = db.prepare("SELECT id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin'").get(WS)?.id;
  db.close();

  const fill = (P) => {
    const pick = P.startsWith('/api/leads') ? ids.lead : P.startsWith('/api/invoices') ? ids.invoice : P.startsWith('/api/email-templates') ? ids.emailTemplate
      : P.startsWith('/api/pipelines') ? ids.pipeline : P.startsWith('/api/tags') ? ids.tag : P.startsWith('/api/platform-accounts') || P.startsWith('/api/whatsapp/accounts') ? ids.waAccount
      : P.startsWith('/api/presets') ? ids.preset : P.startsWith('/api/auto-reply') ? ids.autoReply : P.startsWith('/api/knowledge') ? ids.knowledge
      : P.startsWith('/api/memories') ? ids.memory : P.startsWith('/api/lost-reasons') ? ids.lostReason : P.startsWith('/api/workspace/members') ? ids.member : null;
    let out = P;
    for (const n of P.match(/:(\w+)/g) || []) { const v = /lead/i.test(n) ? ids.lead : pick; if (!v) return null; out = out.replace(n, encodeURIComponent(v)); }
    return out;
  };

  const BODY = { name: 'probe', title: 'probe', body: 'probe', subject: 's', content: 'probe', status: 'New', role: 'admin', email: `probe-${RUN}@test.local`,
    keywords: ['x'], reply_message: 'x', reason: 'x', color: '#000', permissions: { manage_settings: true, manage_team: true }, company_name: 'probe', items: [], total: 1 };

  const routes = discover().filter((r) => !SKIP.test(r.path));
  const order = { GET: 0, POST: 1, PUT: 1, PATCH: 1, DELETE: 2 };
  routes.sort((a, b) => order[a.method] - order[b.method]);
  const UNKNOWN = JSON.stringify((await j('GET', '/__no_such_route__', null)).d);
  const guardedLeaks = [], unguardedAdmin = [], hiddenLeadSeen = [];
  let probed = 0, reached = 0;
  for (const r of routes) {
    const p = fill(r.path); if (!p) continue;
    let res; try { res = await j(r.method, p.replace(/^\/api/, ''), plain.token, r.method === 'GET' ? undefined : BODY); } catch { continue; }
    probed++;
    if (!(res.status === 404 && JSON.stringify(res.d) === UNKNOWN)) reached++;
    const ok = res.status >= 200 && res.status < 300;
    if (ok && (r.perm || r.roleCheck)) guardedLeaks.push({ ...r, status: res.status });
    else if (ok && r.method !== 'GET' && ADMIN_PATH.test(r.path) && !ALLOWED.has(`${r.method} ${r.path}`)) unguardedAdmin.push({ ...r, status: res.status });
    if (ok && res.text.includes(SECRET) && !/^\/api\/leads\/:id$/.test(r.path)) hiddenLeadSeen.push({ ...r, status: res.status });
  }
  assert(reached > probed / 2, `only ${reached}/${probed} probes reached a route — URLs are wrong, results meaningless`);

  // Live updates: the member's event stream must not carry a lead they cannot see,
  // and MUST carry one assigned to them (proves the stream itself works).
  {
    const ctrl = new AbortController();
    let streamText = '';
    const sse = fetch(`${API}/events?token=${encodeURIComponent(plain.token)}`, { signal: ctrl.signal }).then(async (r) => {
      const reader = r.body.getReader(); const dec = new TextDecoder();
      for (;;) { const { value, done } = await reader.read(); if (done) break; streamText += dec.decode(value); }
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    const LIVE_HIDDEN = `LIVEHIDDEN${RUN}`, LIVE_MINE = `LIVEMINE${RUN}`;
    await j('POST', '/leads', owner.token, { customer_name: LIVE_HIDDEN, customer_phone: `92301${DIGITS}7`, status: 'New' });
    const m2 = (await j('POST', '/leads', owner.token, { customer_name: LIVE_MINE, customer_phone: `92301${DIGITS}8`, status: 'New' })).d?.id;
    await j('PUT', `/leads/${m2}`, owner.token, { assigned_to: plain.user.id });
    await new Promise((r) => setTimeout(r, 1500));
    ctrl.abort(); await sse;
    if (!streamText.includes(LIVE_MINE)) hiddenLeadSeen.push({ method: 'SSE', path: '/api/events (positive control: assigned lead never arrived — stream check is meaningless)', file: 'server.js', status: 0 });
    if (streamText.includes(LIVE_HIDDEN)) hiddenLeadSeen.push({ method: 'SSE', path: '/api/events (a lead not assigned to the member arrived live)', file: 'server.js', status: 200 });
  }

  // Direct visibility checks.
  const page = await j('GET', `/leads/${ids.lead}`, plain.token);
  const list = await j('GET', '/leads', plain.token);
  const mine = await j('GET', `/leads/${ids.mine}`, plain.token);
  const vis = [];
  if (page.status === 200) vis.push(`GET /api/leads/:id returned a lead not assigned to the user`);
  if (list.text.includes(SECRET)) vis.push('GET /api/leads lists a lead not assigned to the user');
  if (mine.status !== 200) vis.push(`the user cannot open their OWN assigned lead (${mine.status}) — the test setup is wrong`);

  // No membership row must never mean "owner". The account still points at the
  // studio, but its member row is gone (as after a botched removal or a migration).
  {
    const d = openDb(true);
    d.prepare('DELETE FROM workspace_members WHERE id = ?').run('wm-' + RUN);
    d.close();
    const r = await j('GET', '/settings/email-smtp', plain.token);
    if (r.status < 400) vis.push(`an account with NO membership row was treated as the owner (GET /settings/email-smtp → ${r.status})`);
  }

  console.log(`  ${probed} routes probed as a plain "user" (${reached} reached a handler)\n`);
  if (guardedLeaks.length) { console.log(`  ❌ ${guardedLeaks.length} GUARDED route(s) let a plain user through:`); for (const l of guardedLeaks) console.log(`    ${l.status} ${l.method} ${l.path}  (${l.file})  needs ${l.perm || 'admin role'}`); }
  if (unguardedAdmin.length) { console.log(`\n  ❌ ${unguardedAdmin.length} UNGUARDED admin-area write(s) a plain user can make:`); for (const l of unguardedAdmin) console.log(`    ${l.status} ${l.method} ${l.path}  (${l.file})`); }
  if (hiddenLeadSeen.length) { console.log(`\n  ❌ ${hiddenLeadSeen.length} route(s) showed the user a lead not assigned to them:`); for (const l of hiddenLeadSeen) console.log(`    ${l.status} ${l.method} ${l.path}  (${l.file})`); }
  for (const v of vis) console.log('  ❌ ' + v);
  const bad = guardedLeaks.length + unguardedAdmin.length + hiddenLeadSeen.length + vis.length;
  console.log(`\n${bad === 0 ? '✅ ROLES HELD' : '❌ ROLES BREACHED'}: ${probed} probed, ${bad} problem(s)`);
  process.exitCode = bad ? 1 : 0;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
