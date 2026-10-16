'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  SECURITY — cross-tenant REFERENCES, fuzzed.
//
//  test-security-tenant-isolation.js puts tenant A's ids in the URL. That only
//  covers half the boundary. The other half is an id arriving in the BODY or
//  the QUERY of a request tenant B is otherwise entitled to make: B creates an
//  invoice "for" A's lead, adds A's photos to B's gallery, assigns B's leads to
//  A's user, moves B's lead into A's pipeline. Each of those passes a URL check
//  because the URL is B's own.
//
//  So: both tenants build one of everything. Every authenticated route is then
//  driven as B, with B's OWN ids in the path and A's ids in the body and query
//  under every name a route might read them by. Two detectors:
//    • READ  — the response contains one of A's sentinel strings.
//    • WRITE — the whole database is snapshotted around every write; any row
//              created, changed or deleted that carries one of A's ids is a
//              leak (B either changed A's data or linked B's data to A's).
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3021 RATE_LIMIT_ACCOUNT=5000 node server.js &
//    WF_API=http://127.0.0.1:3021/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-security-crosslinks.js
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
  const r = await fetch(API + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000), // AI/render routes waiting on the network must not stall the sweep
  });
  const text = await r.text();
  let d = null; try { d = JSON.parse(text); } catch {}
  return { status: r.status, d, text };
};

function discoverRoutes() {
  const re = /app\.(get|post|put|patch|delete)\(\s*'([^']+)'\s*,\s*([^)]*)/g;
  const out = [];
  for (const f of fs.readdirSync(__dirname)) {
    if (!f.endsWith('.js') || f.startsWith('test-') || f.startsWith('_')) continue;
    const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const [, method, p, rest] = m;
      if (!/\bauth\b/.test(rest.split('=>')[0])) continue;
      if (!p.startsWith('/api/')) continue;
      out.push({ method: method.toUpperCase(), path: p, file: f });
    }
  }
  return out;
}

// Routes that would end the probing tenant's own session or start real-world
// side effects (a Chromium for WhatsApp). They are not about references.
const SKIP = /\/auth\/|logout|\/account\/(delete|close)|\/me\/delete|password|\/mfa|2fa|\/whatsapp\/(reconnect|connect|disconnect|pair-code|accounts\/:id\/(connect|disconnect|pair-code|reset))|\/sessions\/revoke|\/danger/;

// Build one of everything for a tenant; every name carries the tenant's sentinel.
async function build(tag, T) {
  const S = `${tag}${RUN}`;
  const ids = {};
  ids.lead = (await j('POST', '/leads', T.token, { customer_name: `${S} Client`, customer_phone: `92300${tag === 'ALPHA' ? 1 : 2}${DIGITS}`, status: 'New' })).d?.id;
  ids.lead2 = (await j('POST', '/leads', T.token, { customer_name: `${S} Second`, customer_phone: `92300${tag === 'ALPHA' ? 3 : 4}${DIGITS}`, status: 'New' })).d?.id;
  ids.invoice = (await j('POST', '/invoices', T.token, { lead_id: ids.lead, customer_name: `${S} Client`, items: [], total: 1000 })).d?.invoice?.id;
  ids.doc = (await j('POST', '/cs/documents', T.token, { lead_id: ids.lead, title: `${S} Contract`, type: 'contract' })).d?.id;
  ids.project = (await j('POST', '/media/projects', T.token, { lead_id: ids.lead, title: `${S} Shoot` })).d?.id;
  const gal = (await j('POST', `/media/projects/${ids.project}/galleries`, T.token, { title: `${S} Gallery` })).d;
  ids.gallery = gal?.gallery?.id || gal?.id;
  ids.note = (await j('POST', `/leads/${ids.lead}/notes`, T.token, { content: `${S} Note` })).d?.id;
  ids.csClause = (await j('POST', '/cs/clauses', T.token, { title: `${S} Clause`, body: 'text' })).d?.id;
  ids.emailTemplate = (await j('POST', '/email-templates', T.token, { name: `${S} Email`, subject: 's', body: 'b' })).d?.id;
  ids.payment = (await j('POST', '/payments/link', T.token, { kind: 'invoice', ref_id: ids.invoice, lead_id: ids.lead, amount: 1000 })).d?.id;
  const prod = (await j('POST', '/store/products', T.token, { name: `${S} Print`, options: [{ label: 'A4', price: 100 }] })).d;
  ids.product = prod?.product?.id || prod?.id;
  // A real booking, through the public page, so booking routes are probed too.
  const slug = `xl-${tag.toLowerCase()}-${RUN}`;
  await j('PUT', '/booking/settings', T.token, { slug, settings: { services: [{ name: 'Session', duration: 60 }], availability: { 0: [0, 24], 1: [0, 24], 2: [0, 24], 3: [0, 24], 4: [0, 24], 5: [0, 24], 6: [0, 24] }, slot_min: 60, days_ahead: 30 } });
  const d3 = new Date(Date.now() + (tag === 'ALPHA' ? 3 : 4) * 86400000); const p2 = (n) => String(n).padStart(2, '0');
  await j('POST', `/booking/public/${slug}`, null, { service: 'Session', start_at: `${d3.getUTCFullYear()}-${p2(d3.getUTCMonth() + 1)}-${p2(d3.getUTCDate())} 12:00:00`, name: `${S} Client`, phone: `92300${tag === 'ALPHA' ? 5 : 6}${DIGITS}` });
  const pl = await j('POST', '/pipelines', T.token, { name: `${S} Pipeline` });
  ids.pipeline = pl.d?.pipeline?.id || pl.d?.id;
  ids.user = T.user.id;
  ids.member = T.user.id;

  const w = openDb(true);
  const ws = T.user.workspace_id;
  // Planted ids must NOT contain the sentinel: B's own audit log records the ids B
  // sends, and that would read as A's data appearing in B's response.
  const K = crypto.randomBytes(5).toString('hex');
  const plant = (sql, ...args) => { try { w.prepare(sql).run(...args); return args[0]; } catch { return null; } };
  ids.asset = plant("INSERT INTO ms_assets (id, workspace_id, project_id, filename, storage_key, type) VALUES (?,?,?,?,?,'photo')", `as-${K}`, ws, ids.project, `${S}.jpg`, `fix/${S}.jpg`);
  ids.album = plant('INSERT INTO ms_albums (id, workspace_id, project_id, title) VALUES (?,?,?,?)', `al-${K}`, ws, ids.project, `${S} Album`);
  ids.timeline = plant('INSERT INTO ms_timelines (id, workspace_id, project_id, name) VALUES (?,?,?,?)', `tl-${K}`, ws, ids.project, `${S} Reel`);
  ids.proofing = plant("INSERT INTO ms_proofing_sets (id, workspace_id, gallery_id, title, status) VALUES (?,?,?,?,'open')", `ps-${K}`, ws, ids.gallery, `${S} Proofing`);
  ids.tag = plant('INSERT INTO tags (id, user_id, name) VALUES (?,?,?)', `tg-${K}`, T.user.id, `${S} Tag`);
  ids.channel = plant('INSERT INTO chat_channels (id, workspace_id, name, created_by) VALUES (?,?,?,?)', `ch-${K}`, ws, `${S} channel`, T.user.id);
  ids.csTemplate = plant('INSERT INTO cs_templates (id, workspace_id, title) VALUES (?,?,?)', `ct-${K}`, ws, `${S} Template`);
  ids.order = plant("INSERT INTO ms_print_orders (id, workspace_id, lead_id, items, total) VALUES (?,?,?,'[]',100)", `or-${K}`, ws, ids.lead);
  ids.waAccount = plant("INSERT INTO platform_accounts (id, workspace_id, platform, account_name, status) VALUES (?,?,'whatsapp',?,'disconnected')", `pa-${K}`, ws, `${S} WA`);
  ids.reminder = plant('INSERT INTO reminders (id, lead_id, user_id, title, due_date) VALUES (?,?,?,?,?)', `rm-${K}`, ids.lead, T.user.id, `${S} Reminder`, '2030-01-01 10:00:00');
  w.close();
  const db = openDb();
  const one = (sql, ...p) => { try { return db.prepare(sql).get(...p)?.id; } catch { return null; } };
  ids.booking = one('SELECT id FROM bookings WHERE workspace_id = ?', ws);
  ids.signer = one('SELECT id FROM cs_signers WHERE workspace_id = ?', ws);
  db.close();
  return { S, ids, ws, token: T.token, user: T.user };
}

// Path params resolved to the PROBING tenant's own records, so the request is one
// it is entitled to make — the only foreign thing about it is the body/query.
function fillPath(P, ids) {
  const pick = () => {
    if (P.startsWith('/api/leads')) return ids.lead;
    if (P.startsWith('/api/invoices')) return ids.invoice;
    if (P.startsWith('/api/cs/documents')) return ids.doc;
    if (P.startsWith('/api/cs/signers')) return ids.signer;
    if (P.startsWith('/api/cs/templates')) return ids.csTemplate;
    if (P.startsWith('/api/cs/clauses')) return ids.csClause;
    if (P.startsWith('/api/media/projects') || P.startsWith('/api/studio-ai/projects') || P.startsWith('/api/video-ai/projects')) return ids.project;
    if (P.startsWith('/api/media/galleries')) return ids.gallery;
    if (P.startsWith('/api/media/assets')) return ids.asset;
    if (P.startsWith('/api/media/albums')) return ids.album;
    if (P.startsWith('/api/media/timelines') || P.startsWith('/api/media/clips') || P.startsWith('/api/media/video')) return ids.timeline;
    if (P.startsWith('/api/media/proofing')) return ids.proofing;
    if (P.startsWith('/api/booking')) return ids.booking;
    if (P.startsWith('/api/store/products')) return ids.product;
    if (P.startsWith('/api/store/orders')) return ids.order;
    if (P.startsWith('/api/payments')) return ids.payment;
    if (P.startsWith('/api/chat/channels') || P.startsWith('/api/comms')) return ids.channel;
    if (P.startsWith('/api/notes')) return ids.note;
    if (P.startsWith('/api/reminders')) return ids.reminder;
    if (P.startsWith('/api/tags')) return ids.tag;
    if (P.startsWith('/api/pipelines')) return ids.pipeline;
    if (P.startsWith('/api/team') || P.startsWith('/api/workspace')) return ids.member;
    if (P.startsWith('/api/email-templates')) return ids.emailTemplate;
    if (P.startsWith('/api/whatsapp/accounts')) return ids.waAccount;
    if (P.startsWith('/api/lead-relations')) return ids.lead;
    return null;
  };
  const value = pick();
  let filled = P;
  for (const name of P.match(/:(\w+)/g) || []) {
    const key = name.slice(1);
    const v = /lead/i.test(key) ? ids.lead : /project/i.test(key) ? ids.project : /gallery/i.test(key) ? ids.gallery : value;
    if (!v) return null;
    filled = filled.replace(name, encodeURIComponent(v));
  }
  return filled;
}

// A's ids under every name a route might read a reference by.
function foreignRefs(a) {
  const x = a.ids;
  return {
    lead_id: x.lead, leadId: x.lead, lead_ids: [x.lead, x.lead2], leadIds: [x.lead, x.lead2], ids: [x.lead, x.lead2],
    related_lead_id: x.lead2, target_lead_id: x.lead2, merge_into: x.lead2, source_lead_id: x.lead2, contact_id: x.lead, client_id: x.lead,
    project_id: x.project, projectId: x.project, gallery_id: x.gallery, galleryId: x.gallery,
    asset_id: x.asset, asset_ids: [x.asset], assetIds: [x.asset], photo_ids: [x.asset], cover_asset_id: x.asset,
    album_id: x.album, timeline_id: x.timeline, proofing_id: x.proofing, set_id: x.proofing,
    slots: [{ asset_id: x.asset }], page_ids: [x.asset],
    invoice_id: x.invoice, ref_id: x.invoice, payment_id: x.payment, document_id: x.doc, doc_id: x.doc,
    template_id: x.csTemplate, clause_id: x.csClause, clause_ids: [x.csClause], email_template_id: x.emailTemplate,
    product_id: x.product, order_id: x.order, booking_id: x.booking, note_id: x.note, reminder_id: x.reminder,
    tag_id: x.tag, tag_ids: [x.tag], tags: [x.tag], pipeline_id: x.pipeline, channel_id: x.channel,
    account_id: x.waAccount, platform_account_id: x.waAccount, wa_account_id: x.waAccount,
    user_id: x.user, assigned_to: x.user, assignee_id: x.user, owner_id: x.user, member_id: x.user, user_ids: [x.user], members: [x.user], mentions: [x.user],
    workspace_id: a.ws,
    // enough generic fields for a route to get past its own validation
    title: 'probe', name: 'probe', content: 'probe', body: 'probe', text: 'probe', message: 'probe',
    status: 'New', customer_name: 'probe', amount: 1, total: 1, items: [], kind: 'invoice', type: 'contract',
  };
}

const AUDIT_ONLY = /^(audit_logs?|activity_log|events?|event_log|cc_events|cc_audit|request_log|rate_limits?|sessions?)$/;

function snapshot(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  const snap = new Map();
  for (const t of tables) {
    let rows; try { rows = db.prepare(`SELECT rowid AS __r, * FROM "${t}"`).all(); } catch { continue; }
    for (const r of rows) { const k = `${t}:${r.__r}`; delete r.__r; snap.set(k, JSON.stringify(r)); }
  }
  return snap;
}

(async () => {
  await requireSameDb(API, Database);
  const regA = (await j('POST', '/auth/register', null, { email: `xl-a-${RUN}@test.local`, password: 'xl-password-1', businessName: 'Alpha' })).d;
  const regB = (await j('POST', '/auth/register', null, { email: `xl-b-${RUN}@test.local`, password: 'xl-password-1', businessName: 'Bravo' })).d;
  assert(regA?.token && regB?.token, 'could not register both tenants - is the server up on ' + API + ' ?');
  const A = await build('ALPHA', regA);
  const B = await build('BRAVO', regB);
  const missing = Object.entries(A.ids).filter(([, v]) => !v).map(([k]) => k);
  console.log(`  fixture: ${Object.keys(A.ids).length - missing.length} record types per tenant${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);

  const markersA = [A.S, A.ws, A.user.id, ...Object.values(A.ids).filter(Boolean)];
  const touchesA = (json) => json && markersA.some((m) => json.includes(m));

  const routes = discoverRoutes().filter((r) => !SKIP.test(r.path));
  const order = { GET: 0, POST: 1, PUT: 1, PATCH: 1, DELETE: 2 };
  routes.sort((a, b) => order[a.method] - order[b.method]);
  console.log(`  probing ${routes.length} authenticated routes as B with A's ids in body and query\n`);

  // Prove the detector can see a write at all: A editing A's own lead MUST show up.
  {
    const d0 = openDb(); const before = snapshot(d0);
    await j('PUT', `/leads/${A.ids.lead}`, A.token, { customer_name: `${A.S} Client renamed` });
    const after = snapshot(d0); d0.close();
    const seen = [...after].some(([k, v]) => before.get(k) !== v && touchesA(v));
    assert(seen, 'self-test failed: the write detector did not see A editing its own lead — results would be meaningless');
    console.log('  self-test: the write detector sees a change to A\'s data ✓');
  }
  const statusCount = {};
  const UNKNOWN_ROUTE = JSON.stringify((await j('GET', '/__no_such_route__', null)).d);
  let unreached = 0;
  const qsOf = (refs) => '?' + Object.entries(refs).filter(([, v]) => typeof v === 'string').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  const readLeaks = [], writeLeaks = [], auditNoise = [];
  let probed = 0, skipped = 0;
  const db = openDb();
  async function pass(label, refs, withDeletes) {
  const qs = qsOf(refs);

  for (const r of routes) {
    if (r.method === 'DELETE' && !withDeletes) continue; // deletes run once, last, so pass 2 still has B's records
    const filled = fillPath(r.path, B.ids);
    if (!filled) { skipped++; continue; }
    const isWrite = r.method !== 'GET';
    const before = isWrite ? snapshot(db) : null;
    let res;
    try { res = await j(r.method, filled.replace(/^\/api/, '') + qs, B.token, isWrite ? refs : undefined); } catch (e) { continue; }
    probed++;
    if (process.env.WF_VERBOSE) console.log(`    ${res.status} ${r.method} ${r.path}`);
    statusCount[res.status] = (statusCount[res.status] || 0) + 1;
    if (res.status === 404 && JSON.stringify(res.d) === UNKNOWN_ROUTE) unreached++;

    if (res.text && res.text.includes(A.S)) readLeaks.push({ ...r, pass: label, filled, status: res.status, sample: res.text.slice(Math.max(0, res.text.indexOf(A.S) - 80), res.text.indexOf(A.S) + 60) });

    if (isWrite) {
      const after = snapshot(db);
      const diffs = [];
      for (const [k, v] of after) { const old = before.get(k); if (old !== v && (touchesA(v) || touchesA(old))) diffs.push({ k, kind: old ? 'changed' : 'created', row: v }); }
      for (const [k, old] of before) if (!after.has(k) && touchesA(old)) diffs.push({ k, kind: 'deleted', row: old });
      const real = diffs.filter((d) => !AUDIT_ONLY.test(d.k.split(':')[0]));
      if (real.length) writeLeaks.push({ ...r, pass: label, filled, status: res.status, diffs: real });
      else if (diffs.length) auditNoise.push({ ...r, tables: [...new Set(diffs.map((d) => d.k.split(':')[0]))] });
    }
    // B must still be able to act; if a route ended B's session the rest would be meaningless.
    if (res.status === 401) {
      const me = await j('GET', '/auth/me', B.token);
      if (me.status === 401) { console.log(`  ! B's session ended after ${r.method} ${r.path} — add it to SKIP`); break; }
    }
  }
  }
  // Pass 1: every reference is A's. Pass 2: B's own records, but A's PEOPLE in every
  // person field — "assign my lead to them", "mention them", "add them to my channel".
  await pass('foreign records', foreignRefs(A), false);
  const people = { ...foreignRefs(B) };
  for (const k of ['user_id', 'assigned_to', 'assignee_id', 'owner_id', 'member_id']) people[k] = A.user.id;
  people.user_ids = [A.user.id]; people.members = [A.user.id]; people.mentions = [A.user.id];
  await pass('foreign people', people, true);
  db.close();

  console.log('  responses: ' + Object.entries(statusCount).map(([k, v]) => `${k}×${v}`).join(' '));
  console.log(`  ${probed} routes probed, ${skipped} skipped (no record of that kind to point the URL at)`);
  if (auditNoise.length) console.log(`  ${auditNoise.length} wrote only to audit/event logs mentioning A's ids (not a leak): ${auditNoise.slice(0, 6).map((n) => `${n.method} ${n.path}`).join(', ')}${auditNoise.length > 6 ? ' …' : ''}`);
  if (readLeaks.length) {
    console.log(`\n  ❌ ${readLeaks.length} READ LEAK(S) — B's response contained A's data:`);
    for (const l of readLeaks) console.log(`    ${l.status} ${l.method} ${l.path}  (${l.file})\n         …${l.sample.replace(/\s+/g, ' ')}…`);
  }
  if (writeLeaks.length) {
    console.log(`\n  ❌ ${writeLeaks.length} WRITE LEAK(S) — B's request created, changed or deleted rows tied to A:`);
    for (const l of writeLeaks) {
      console.log(`    ${l.status} ${l.method} ${l.path}  (${l.file})  [${l.pass}]`);
      for (const d of l.diffs.slice(0, 3)) console.log(`         ${d.kind} ${d.k}: ${d.row.slice(0, 170)}`);
    }
  }
  const handled = probed - unreached;
  assert(handled > probed / 2, `only ${handled} of ${probed} probes got past a 404 — the probe URLs are wrong, results would be meaningless`);
  const leaks = readLeaks.length + writeLeaks.length;
  console.log(`\n${leaks === 0 ? '✅ NO CROSS-TENANT REFERENCES ACCEPTED' : '❌ CROSS-TENANT REFERENCES ACCEPTED'}: ${probed} probed, ${leaks} leaked`);
  process.exitCode = leaks === 0 ? 0 : 1;
})().catch((e) => { console.error('FATAL', e); process.exitCode = 1; });
