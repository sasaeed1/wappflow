'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  SECURITY — the tenant boundary, fuzzed.
//
//  This product has ~384 authenticated routes and 182 of them take an `:id`.
//  Multi-tenancy here is enforced route by route, by remembering to add
//  `AND workspace_id = ?` to a query — which means the boundary is exactly as
//  strong as the least careful route, and no amount of reading finds the one
//  that was forgotten. Two real leaks have already been found this way: the
//  legacy chat routes (Phase 5) and the public client portal (Phase 7).
//
//  So this does not read the source. It DISCOVERS every authenticated route
//  from the code, creates one of every major record as tenant A, then drives
//  each route as tenant B with A's real ids. Anything that answers 2xx is a
//  leak — B either read, changed or destroyed something that is not theirs.
//
//  A route that returns 404/403 is correct. A route that returns 400 or 500 is
//  reported separately: it did not leak, but it also did not cleanly refuse,
//  and a 500 on a foreign id often means the code got further than it should.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3020 node server.js &
//    WF_API=http://127.0.0.1:3020/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-security-tenant-isolation.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const API = process.env.WF_API || 'http://127.0.0.1:3020/api';
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');

const RUN = process.pid.toString(36) + Math.random().toString(36).slice(2, 8);
const openDb = (rw) => new Database(process.env.WF_DB, rw ? {} : { readonly: true });

const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};

// ── Discover the routes from source ─────────────────────────────────────────
// Reading the route table rather than maintaining a list is the point: a route
// added next month is tested the day it lands, without anybody remembering to.
function discoverRoutes() {
  const re = /app\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*([^)]*)/g;
  const out = [];
  for (const f of fs.readdirSync(__dirname)) {
    if (!f.endsWith('.js') || f.startsWith('test-') || f.startsWith('_')) continue;
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const [, method, p, rest] = m;
      const head = rest.split('=>')[0];
      if (!/\bauth\b/.test(head)) continue;              // public routes are a different test
      if (!p.startsWith('/api/')) continue;
      out.push({ method: method.toUpperCase(), path: p, file: f });
    }
  }
  return out;
}

// Map a path param to one of tenant A's real ids, by what the path is about.
// Order matters: the most specific prefix wins.
function resolveParams(routePath, ids) {
  const P = routePath;
  const pick = () => {
    if (P.startsWith('/api/leads')) return ids.lead;
    if (P.startsWith('/api/invoices')) return ids.invoice;
    if (P.startsWith('/api/cs/documents')) return ids.doc;
    if (P.startsWith('/api/cs/signers')) return ids.signer;
    if (P.startsWith('/api/media/projects')) return ids.project;
    if (P.startsWith('/api/media/galleries')) return ids.gallery;
    if (P.startsWith('/api/media/assets')) return ids.asset;
    if (P.startsWith('/api/booking')) return ids.booking;
    if (P.startsWith('/api/store/products')) return ids.product;
    if (P.startsWith('/api/store/orders')) return ids.order;
    if (P.startsWith('/api/payments')) return ids.payment;
    if (P.startsWith('/api/chat/channels') || P.startsWith('/api/comms')) return ids.channel;
    if (P.startsWith('/api/notes')) return ids.note;
    if (P.startsWith('/api/reminders')) return ids.reminder;
    if (P.startsWith('/api/tags')) return ids.tag;
    if (P.startsWith('/api/media/albums')) return ids.album;
    if (P.startsWith('/api/media/timelines') || P.startsWith('/api/media/clips') || P.startsWith('/api/media/video')) return ids.timeline;
    if (P.startsWith('/api/media/proofing')) return ids.proofing;
    if (P.startsWith('/api/media/portfolio')) return ids.portfolioItem;
    if (P.startsWith('/api/studio-ai/projects') || P.startsWith('/api/video-ai/projects')) return ids.project;
    if (P.startsWith('/api/cs/templates')) return ids.csTemplate;
    if (P.startsWith('/api/cs/clauses')) return ids.csClause;
    if (P.startsWith('/api/team')) return ids.member;
    if (P.startsWith('/api/email-templates')) return ids.emailTemplate;
    if (P.startsWith('/api/auto-reply')) return ids.autoReply;
    if (P.startsWith('/api/presets')) return ids.preset;
    if (P.startsWith('/api/whatsapp/accounts')) return ids.waAccount;
    if (P.startsWith('/api/lead-relations')) return ids.lead;
    return null;
  };
  const value = pick();
  if (!value) return null;
  let filled = routePath;
  for (const name of routePath.match(/:(\w+)/g) || []) {
    const key = name.slice(1);
    // leadId is always a lead, whatever the route is otherwise about.
    const v = /lead/i.test(key) ? ids.lead : value;
    if (!v) return null;
    filled = filled.replace(name, encodeURIComponent(v));
  }
  return filled;
}

(async () => {
  let pass = 0, fail = 0, skipped = 0;
  const leaks = [];
  const noisy = [];

  const A = (await j('POST', '/auth/register', null, { email: `iso-a-${RUN}@test.local`, password: 'pw123456', businessName: 'Tenant A' })).d;
  const B = (await j('POST', '/auth/register', null, { email: `iso-b-${RUN}@test.local`, password: 'pw123456', businessName: 'Tenant B' })).d;
  assert(A?.token && B?.token, 'could not register both tenants - is the server up on ' + API + ' ?');
  const WS_A = A.user.workspace_id;

  // ── Tenant A builds one of everything ─────────────────────────────────────
  const ids = {};
  ids.lead = (await j('POST', '/leads', A.token, { customer_name: 'A Client', customer_phone: '92300111' + RUN.slice(0, 4), status: 'New' })).d?.id;
  ids.invoice = (await j('POST', '/invoices', A.token, { lead_id: ids.lead, customer_name: 'A Client', items: [], total: 1000 })).d?.invoice?.id;
  ids.doc = (await j('POST', '/cs/documents', A.token, { lead_id: ids.lead, title: 'A Contract', type: 'contract' })).d?.id;
  ids.project = (await j('POST', '/media/projects', A.token, { lead_id: ids.lead, title: 'A Shoot' })).d?.id;
  const gal = (await j('POST', `/media/projects/${ids.project}/galleries`, A.token, { title: 'A Gallery' })).d;
  ids.gallery = gal?.gallery?.id || gal?.id;
  ids.product = (await j('POST', '/store/products', A.token, { name: 'A Print', options: [{ label: 'A4', price: 100 }] })).d?.product?.id
             || (await j('GET', '/store/products', A.token)).d?.products?.[0]?.id;
  ids.payment = (await j('POST', '/payments/link', A.token, { kind: 'invoice', ref_id: ids.invoice, lead_id: ids.lead, amount: 1000 })).d?.id;
  ids.note = (await j('POST', `/leads/${ids.lead}/notes`, A.token, { content: 'A note' })).d?.id;

  await j('PUT', '/booking/settings', A.token, {
    slug: 'iso-' + RUN,
    settings: { services: [{ name: 'Session', duration: 60 }], availability: { 0: [0, 24], 1: [0, 24], 2: [0, 24], 3: [0, 24], 4: [0, 24], 5: [0, 24], 6: [0, 24] }, slot_min: 60, days_ahead: 30 },
  });
  const d3 = new Date(Date.now() + 3 * 86400000);
  const p2 = (n) => String(n).padStart(2, '0');
  await j('POST', `/booking/public/iso-${RUN}`, null, {
    service: 'Session',
    start_at: `${d3.getUTCFullYear()}-${p2(d3.getUTCMonth() + 1)}-${p2(d3.getUTCDate())} 12:00:00`,
    name: 'A Client', phone: '92300111' + RUN.slice(0, 4),
  });

  // The rest come straight from the database — creating them through the API
  // would double the fixture for no extra coverage of the boundary.
  const db = openDb();
  const one = (sql, ...p) => { try { return db.prepare(sql).get(...p); } catch { return null; } };
  ids.booking = one('SELECT id FROM bookings WHERE workspace_id = ?', WS_A)?.id;
  ids.asset = one('SELECT id FROM ms_assets WHERE workspace_id = ?', WS_A)?.id;
  ids.signer = one('SELECT id FROM cs_signers WHERE workspace_id = ?', WS_A)?.id;
  ids.channel = one('SELECT id FROM chat_channels WHERE workspace_id = ?', WS_A)?.id
             || one('SELECT id FROM channels WHERE workspace_id = ?', WS_A)?.id;
  ids.reminder = one('SELECT id FROM reminders WHERE lead_id = ?', ids.lead)?.id;
  ids.tag = one('SELECT id FROM tags WHERE workspace_id = ?', WS_A)?.id;
  ids.order = one('SELECT id FROM ms_print_orders WHERE workspace_id = ?', WS_A)?.id;
  db.close();

  // Records the API has no simple create for, or that need a whole flow to
  // exist. Planted directly so their routes are PROBED rather than skipped —
  // a skipped route is an untested route, not a passing one.
  const w = openDb(true);
  const plant = (sql, ...args) => { try { w.prepare(sql).run(...args); return args[0]; } catch { return null; } };
  ids.asset = plant("INSERT INTO ms_assets (id, workspace_id, project_id, filename, storage_key, type) VALUES (?,?,?,?,?,'photo')",
    'as-' + RUN, WS_A, ids.project, 'a.jpg', 'fix/a.jpg');
  ids.album = plant("INSERT INTO ms_albums (id, workspace_id, project_id, title) VALUES (?,?,?,?)",
    'al-' + RUN, WS_A, ids.project, 'A Album');
  ids.timeline = plant("INSERT INTO ms_timelines (id, workspace_id, project_id, name) VALUES (?,?,?,?)",
    'tl-' + RUN, WS_A, ids.project, 'A Reel');
  ids.proofing = plant("INSERT INTO ms_proofing_sets (id, workspace_id, gallery_id, title, status) VALUES (?,?,?,?,'open')",
    'ps-' + RUN, WS_A, ids.gallery, 'A Proofing');
  // These carry a user_id / created_by rather than only a workspace_id, which is
  // itself worth knowing: the tenant key is not uniform across this schema.
  // NOTE: tags carry NO workspace_id at all — they are keyed on user_id. That is
  // not a leak (a different tenant is a different user) but it does mean tags are
  // per-MEMBER, so two people in one studio cannot see each other's.
  ids.tag = plant("INSERT INTO tags (id, user_id, name) VALUES (?,?,?)", 'tg-' + RUN, A.user.id, 'A Tag');
  ids.channel = plant("INSERT INTO chat_channels (id, workspace_id, name, created_by) VALUES (?,?,?,?)",
    'ch-' + RUN, WS_A, 'a-channel', A.user.id);
  ids.csTemplate = plant("INSERT INTO cs_templates (id, workspace_id, title) VALUES (?,?,?)",
    'ct-' + RUN, WS_A, 'A Template');
  ids.order = plant("INSERT INTO ms_print_orders (id, workspace_id, lead_id, items, total) VALUES (?,?,?,'[]',100)",
    'or-' + RUN, WS_A, ids.lead);
  // presets has no table on a fresh install, so its routes are reported skipped
  // rather than silently counted as passing.
  w.close();

  // These have real create endpoints — use them, so the fixture exercises the
  // same shape production writes.
  ids.csClause = (await j('POST', '/cs/clauses', A.token, { title: 'A Clause', body: 'text' })).d?.id;
  ids.emailTemplate = (await j('POST', '/email-templates', A.token, { name: 'A Email', subject: 's', body: 'b' })).d?.id;
  ids.member = A.user.id;   // team routes address a user id
  const ordRow = (() => { const d = openDb(); const r = d.prepare('SELECT id FROM ms_print_orders WHERE workspace_id = ?').get(WS_A); d.close(); return r; })();
  ids.order = ids.order || ordRow?.id;

  const have = Object.entries(ids).filter(([, v]) => v).map(([k]) => k);
  console.log(`  fixture: tenant A owns ${have.length} record types — ${have.join(', ')}`);
  for (const [k, v] of Object.entries(ids)) if (!v) console.log(`  (no ${k} fixture — routes about it are skipped, not passed)`);

  // ── Drive every discovered route as tenant B ──────────────────────────────
  const routes = discoverRoutes().filter((r) => /:/.test(r.path));
  console.log(`  probing ${routes.length} authenticated id-routes as the WRONG tenant\n`);

  // A benign body: enough for a route to get past its own validation and reach
  // the authorization check, which is the thing under test.
  const BODY = {
    title: 'pwned', name: 'pwned', content: 'pwned', body: 'pwned', text: 'pwned',
    status: 'New', customer_name: 'pwned', amount: 1, total: 1, items: [],
    decision: 'keep', value: 'pwned', label: 'pwned', message: 'pwned',
  };

  for (const r of routes) {
    const filled = resolveParams(r.path, ids);
    if (!filled || /:/.test(filled)) { skipped++; continue; }

    const res = await j(r.method, filled, B.token, r.method === 'GET' ? undefined : BODY);

    if (res.status >= 200 && res.status < 300) {
      // A 2xx MIGHT be a leak. Confirm: did it actually return or touch A's data?
      const blob = JSON.stringify(res.d || {});
      const touched = blob.includes(ids.lead) || blob.includes(ids.invoice || ' ') ||
                      blob.includes(ids.project || ' ') || blob.includes('A Client') ||
                      blob.includes('A Contract') || blob.includes('A Shoot') || blob.includes('A Gallery');
      leaks.push({ ...r, filled, status: res.status, touched, sample: blob.slice(0, 160) });
      fail++;
    } else if (res.status === 404 || res.status === 403 || res.status === 401) {
      pass++;                                  // refused cleanly — correct
    } else {
      noisy.push({ ...r, filled, status: res.status, err: (res.d && res.d.error) || '' });
      pass++;                                  // did not leak, but did not refuse cleanly
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log(`  ${pass} routes refused the wrong tenant`);
  console.log(`  ${skipped} skipped (no fixture for that resource)`);

  if (noisy.length) {
    console.log(`\n  ${noisy.length} refused with a non-404 status (no leak, but the check is late):`);
    for (const n of noisy.slice(0, 15)) console.log(`    ${n.status} ${n.method} ${n.path}  (${n.file})  ${n.err}`.slice(0, 150));
    if (noisy.length > 15) console.log(`    …and ${noisy.length - 15} more`);
  }

  if (leaks.length) {
    console.log(`\n  ❌ ${leaks.length} ROUTE(S) ANSWERED THE WRONG TENANT:`);
    for (const l of leaks) {
      console.log(`    ${l.status} ${l.method} ${l.path}   (${l.file})${l.touched ? '   ← RETURNED TENANT A DATA' : ''}`);
      if (l.touched) console.log(`         ${l.sample}`);
    }
  }

  console.log(`\n${fail === 0 ? '✅ TENANT BOUNDARY HELD' : '❌ TENANT BOUNDARY BREACHED'}: ${pass} refused, ${fail} leaked`);
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
