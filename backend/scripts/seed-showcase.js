'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Showcase seeder — fills ONE demo workspace with a believable studio:
//  a team, ~140 leads with real-looking conversations across WhatsApp,
//  Instagram, Facebook and the website, three pipelines, notes, reminders,
//  tags, invoices and payments, bookings, signed contracts with certificates,
//  a knowledge base, team chat, and a photo studio with shoots, culled photos,
//  client galleries (favourites, comments, proofing), albums, rendered reels,
//  a print store and a public portfolio.
//
//  HOW: history (leads, messages, money, bookings) is written straight to the
//  database with dates spread over the past ten months, because the API would
//  stamp everything "today" and every chart would be one spike. Everything
//  with a real pipeline behind it — photo upload + AI scoring, culling,
//  galleries, albums, reels, contracts and signing — goes through the running
//  API as the workspace owner, so it is exactly what the app itself produces.
//
//  SAFETY
//    • Refuses to run if the workspace has a CONNECTED WhatsApp number, or
//      already has leads (use --clean first). Nothing it does sends a message:
//      contracts are sent with no channel, galleries published with
//      notify:false, proofing approved in the database.
//    • Every phone number is in Ofcom's drama range (+44 7700 900xxx) and
//      every email is @example.com/.net/.org, so even a later manual send
//      can never reach a real person.
//    • --clean removes the workspace's content (keeps the owner's account,
//      plan, settings and WhatsApp connection). It is a demo account; do not
//      point this at a real studio.
//
//  RUN on the server, from backend/, with the API up:
//    node scripts/seed-showcase.js --email someone@example.com          # checks only
//    PEXELS_API_KEY=… node scripts/seed-showcase.js --email … --yes     # seed
//    node scripts/seed-showcase.js --email … --clean --yes              # wipe demo content
//  Options: --studio "Golden Hour Studio"  --handle golden-hour-studio
//           --photos <dir>  (use your own photos: one sub-folder per shoot key,
//                            or a flat folder shared round-robin)
//           --no-reels  --api http://127.0.0.1:3001
//
//  Photos: with PEXELS_API_KEY (free at pexels.com/api) each shoot gets
//  on-theme photos (weddings look like weddings). Without it the seeder falls
//  back to picsum.photos — real photographs, but random subjects.
// ════════════════════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const C = require('./showcase/content');

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const EMAIL = (opt('email', '') || '').toLowerCase();
const APPLY = flag('yes');
const CLEAN = flag('clean');
const STUDIO = opt('studio', 'Golden Hour Studio');
const HANDLE = opt('handle', STUDIO.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
const PHOTOS_DIR = opt('photos', '');
const NO_REELS = flag('no-reels');
const API = (opt('api', '') || `http://127.0.0.1:${process.env.PORT || 3001}`).replace(/\/+$/, '') + '/api';
const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '..'));
const UPLOADS = path.join(DATA_DIR, 'uploads');

if (!EMAIL) { console.error('Usage: node scripts/seed-showcase.js --email <owner email> [--yes] [--clean]'); process.exit(1); }
const db = new Database(path.join(DATA_DIR, 'wappflow.db'), { fileMustExist: true });
db.pragma('busy_timeout = 5000');

// ── helpers ─────────────────────────────────────────────────────────────────
let seed = 20261008;
const rng = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rng() * a.length)];
const between = (a, b) => a + Math.floor(rng() * (b - a + 1));
const chance = (p) => rng() < p;
const uid = () => crypto.randomUUID();
const NOW = Date.now();
const DAY = 86400000;
const at = (ms) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');   // SQLite UTC "YYYY-MM-DD HH:MM:SS"
const daysAgo = (d, hour = 11, min = 0) => { const x = new Date(NOW - d * DAY); x.setUTCHours(hour, min, 0, 0); return x.getTime(); };
const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const prettyDate = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const monthName = (ms) => new Date(ms).toLocaleDateString('en-GB', { month: 'long' });
const cols = {};
const colsOf = (t) => (cols[t] ||= db.prepare(`PRAGMA table_info("${t}")`).all().map((c) => c.name));
const hasTable = (t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
function insert(table, row) {
  if (!hasTable(table)) return false;
  const c = colsOf(table);
  const keys = Object.keys(row).filter((k) => c.includes(k) && row[k] !== undefined);
  db.prepare(`INSERT INTO "${table}" (${keys.map((k) => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map((k) => row[k]));
  return true;
}
const update = (table, id, set) => {
  const c = colsOf(table); const keys = Object.keys(set).filter((k) => c.includes(k));
  if (keys.length) db.prepare(`UPDATE "${table}" SET ${keys.map((k) => `"${k}" = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => set[k]), id);
};
let phoneN = 100;
const phone = () => `+447700900${String(phoneN++).padStart(3, '0')}`;
const emailFor = (name) => `${name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '')}@${pick(['example.com', 'example.net', 'example.org'])}`;
const log = (...a) => console.log(...a);
const step = (s) => console.log(`\n▸ ${s}`);

// ── API client (as the owner) ───────────────────────────────────────────────
// The API allows 500 requests / 15 min per address, and the window is shared
// with anything else this address did recently (an earlier run, a --clean and
// re-seed). Follow the server's own RateLimit-* headers: slow down when few are
// left, and on a 429 wait for the window to reset and retry.
let TOKEN = null;
async function api(method, p, body, { form, okStatuses } = {}) {
  for (let attempt = 0; ; attempt++) {
    const headers = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};
    let payload;
    if (form) payload = form; else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const r = await fetch(API + p, { method, headers, body: payload });
    const reset = Number(r.headers.get('ratelimit-reset')) || 60;
    const remaining = Number(r.headers.get('ratelimit-remaining'));
    if (r.status === 429 && attempt < 3) {
      log(`  … API rate limit reached; waiting ${reset}s for it to reset`);
      await sleep((reset + 2) * 1000);
      continue;
    }
    let d = null; try { d = await r.json(); } catch {}
    if (!r.ok && !(okStatuses || []).includes(r.status)) throw new Error(`${method} ${p} → ${r.status} ${d && d.error ? d.error : ''}`);
    if (Number.isFinite(remaining) && remaining < 15) { log(`  … pacing: ${remaining} API calls left in this window, waiting ${reset}s`); await sleep((reset + 2) * 1000); }
    return d;
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── who/where ───────────────────────────────────────────────────────────────
const owner = db.prepare('SELECT * FROM users WHERE lower(email) = ?').get(EMAIL);
if (!owner) { console.error(`No user with email ${EMAIL}`); process.exit(1); }
const WS = owner.workspace_id || db.prepare('SELECT id FROM workspaces WHERE owner_id = ?').get(owner.id)?.id;
if (!WS) { console.error('That user has no workspace.'); process.exit(1); }
const OWNER = owner.id;
log(`Workspace ${WS} — owner ${owner.email} (${owner.full_name || owner.business_name || ''})`);

// ════════════════════════════════════════════════════════════════════════════
//  CLEAN — remove this workspace's content, keep the account itself.
// ════════════════════════════════════════════════════════════════════════════
const KEEP_TABLES = new Set(['users', 'workspaces', 'workspace_plan', 'company_settings', 'platform_accounts', 'workspace_role_permissions',
  'cc_audit', 'cc_inbox', 'cc_notes', 'audit_logs', 'workspace_scores', 'platform_events', 'email_smtp_settings', 'email_imap_settings']);
function clean() {
  const leadIds = db.prepare('SELECT id FROM leads WHERE workspace_id = ?').all(WS).map((r) => r.id);
  const memberUsers = db.prepare("SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id IS NOT NULL AND user_id != ?").all(WS, OWNER).map((r) => r.user_id)
    .filter((u) => (db.prepare('SELECT email FROM users WHERE id = ?').get(u)?.email || '').endsWith('@team.example.com'));
  const files = new Set();
  const counts = {};
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  const tx = db.transaction(() => {
    db.exec('CREATE TEMP TABLE IF NOT EXISTS sc_leads(id TEXT PRIMARY KEY); DELETE FROM temp.sc_leads;');
    const il = db.prepare('INSERT OR IGNORE INTO temp.sc_leads VALUES (?)'); leadIds.forEach((id) => il.run(id));
    // Children keyed only by a parent id first (gallery assets, signers, album pages…).
    const childOf = [
      ['ms_gallery_assets', 'gallery_id', 'ms_galleries'], ['ms_client_favorites', 'gallery_id', 'ms_galleries'], ['ms_client_comments', 'gallery_id', 'ms_galleries'],
      ['ms_gallery_access', 'gallery_id', 'ms_galleries'], ['ms_fav_collections', 'gallery_id', 'ms_galleries'], ['ms_proofing_selections', 'set_id', 'ms_proofing_sets'],
      ['ms_album_pages', 'album_id', 'ms_albums'], ['cs_signers', 'document_id', 'cs_documents'], ['cs_events', 'document_id', 'cs_documents'],
      ['cs_versions', 'document_id', 'cs_documents'], ['cs_approvals', 'document_id', 'cs_documents'], ['chat_messages', 'channel_id', 'chat_channels'],
      ['chat_members', 'channel_id', 'chat_channels'], ['ms_video_clips', 'asset_id', 'ms_assets'], ['ms_cull_decisions', 'project_id', 'ms_projects'],
    ];
    for (const [t, col, parent] of childOf) {
      if (!hasTable(t) || !hasTable(parent)) continue;
      const n = db.prepare(`DELETE FROM "${t}" WHERE "${col}" IN (SELECT id FROM "${parent}" WHERE workspace_id = ?)`).run(WS).changes;
      if (n) counts[t] = (counts[t] || 0) + n;
    }
    for (const t of tables) {
      if (KEEP_TABLES.has(t)) continue;
      const c = colsOf(t); const conds = [];
      if (c.includes('workspace_id')) conds.push('workspace_id = @ws');
      if (c.includes('lead_id')) conds.push('lead_id IN (SELECT id FROM temp.sc_leads)');
      if (!conds.length) continue;
      if (t === 'workspace_members') { const n = db.prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND (user_id IS NULL OR user_id != ?)").run(WS, OWNER).changes; if (n) counts[t] = n; continue; }
      const where = conds.join(' OR ');
      for (const fc of c.filter((x) => /(^|_)(storage_key|path|url|pdf_storage_key|media_url|poster_url|proxy_url|variants)$/i.test(x))) {
        for (const r of db.prepare(`SELECT "${fc}" v FROM "${t}" WHERE ${where}`).all({ ws: WS })) if (r.v) files.add(String(r.v));
      }
      const n = db.prepare(`DELETE FROM "${t}" WHERE ${where}`).run({ ws: WS }).changes;
      if (n) counts[t] = (counts[t] || 0) + n;
    }
    for (const t of ['notes', 'reminders', 'contact_history', 'messages']) {
      if (!hasTable(t)) continue;
      const n = db.prepare(`DELETE FROM "${t}" WHERE lead_id IN (SELECT id FROM temp.sc_leads)`).run().changes; if (n) counts[t] = (counts[t] || 0) + n;
    }
    // The seeded team members (only the @team.example.com accounts this script makes).
    for (const u of memberUsers) { db.prepare('DELETE FROM users WHERE id = ?').run(u); counts.users = (counts.users || 0) + 1; }
    if (hasTable('tags')) { const n = db.prepare('DELETE FROM tags WHERE user_id = ?').run(OWNER).changes; if (n) counts.tags = n; }
    // Rows that only pointed at rows removed above (e.g. a timeline's export). Orphans that
    // existed before this clean are left alone.
    for (let pass = 0; pass < 10; pass++) {
      const fresh = db.pragma('foreign_key_check').filter((r) => !baseline.has(`${r.table}:${r.rowid}`) && r.rowid != null);
      if (!fresh.length) break;
      for (const r of fresh) if (db.prepare(`DELETE FROM "${r.table}" WHERE rowid = ?`).run(r.rowid).changes) counts[r.table] = (counts[r.table] || 0) + 1;
    }
  });
  if (!APPLY) { log('\nDRY RUN — would remove this workspace’s leads, media, galleries, contracts, invoices, bookings, chat and knowledge.'); log(`Leads now: ${leadIds.length}. Re-run with --yes to clean.`); return; }
  const baseline = new Set(db.pragma('foreign_key_check').map((r) => `${r.table}:${r.rowid}`));
  db.pragma('foreign_keys = OFF');   // children and parents go in one transaction; checked again below
  try { tx(); } finally { db.pragma('foreign_keys = ON'); }
  // Files on disk (uploads) that belonged to removed rows.
  let removed = 0;
  for (const v0 of files) {
    let vals = [v0]; try { const o = JSON.parse(v0); if (o && typeof o === 'object') vals = Object.values(o).filter((x) => typeof x === 'string'); } catch {}
    for (const v of vals) {
      const rel = v.replace(/^https?:\/\/[^/]+/, '').split('?')[0].replace(/^.*?\/?uploads\//, '').replace(/^\/+/, '');
      if (!rel || rel.includes('..')) continue;
      const p = path.join(UPLOADS, rel);
      try { if (p.startsWith(UPLOADS + path.sep) && fs.statSync(p).isFile()) { fs.unlinkSync(p); removed++; } } catch {}
    }
  }
  log('Removed:'); for (const [t, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) log(`  ${t.padEnd(28)} ${n}`);
  log(`  files                        ${removed}`);
}

// ════════════════════════════════════════════════════════════════════════════
//  PHOTOS — Pexels by theme, or a local folder, or picsum.
// ════════════════════════════════════════════════════════════════════════════
const PHOTO_CACHE = path.join(require('os').tmpdir(), 'wf-showcase-photos');
async function photosFor(story) {
  const want = story.photos;
  if (!want) return [];
  fs.mkdirSync(PHOTO_CACHE, { recursive: true });
  if (PHOTOS_DIR) {
    const sub = path.join(PHOTOS_DIR, story.key);
    const dir = fs.existsSync(sub) ? sub : PHOTOS_DIR;
    const all = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().map((f) => path.join(dir, f));
    if (!all.length) throw new Error(`No photos in ${dir}`);
    if (dir === sub) return all.slice(0, want);
    const start = (STORY_INDEX[story.key] * want) % all.length;
    return Array.from({ length: want }, (_, i) => all[(start + i) % all.length]);
  }
  const out = [];
  const key = process.env.PEXELS_API_KEY;
  if (key) {
    const per = Math.ceil(want / story.query.length);
    for (const q of story.query) {
      const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${Math.min(80, per + 6)}&orientation=landscape`, { headers: { Authorization: key } });
      if (!r.ok) throw new Error(`Pexels ${r.status} for "${q}" — check PEXELS_API_KEY`);
      const d = await r.json();
      for (const ph of (d.photos || []).slice(0, per)) out.push({ url: ph.src.large2x || ph.src.large, name: `${story.key}-${ph.id}.jpg`, credit: ph.photographer });
    }
  } else {
    for (let i = 0; i < want; i++) { const n = STORY_INDEX[story.key] * 40 + i + 10; out.push({ url: `https://picsum.photos/seed/wf-${story.key}-${n}/1800/1200`, name: `${story.key}-${n}.jpg` }); }
  }
  const files = [];
  for (const ph of out.slice(0, want)) {
    const f = path.join(PHOTO_CACHE, ph.name);
    if (!fs.existsSync(f)) {
      const r = await fetch(ph.url, { redirect: 'follow' });
      if (!r.ok) { log(`  ! skipped a photo (${r.status})`); continue; }
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    }
    files.push(f);
  }
  return files;
}
const STORY_INDEX = Object.fromEntries(C.STORIES.map((s, i) => [s.key, i]));

// A handwritten-looking signature as a PNG data URL (for the signed contracts).
async function signaturePng(name) {
  const Jimp = require('jimp');
  const W = 420, H = 120; const img = new Jimp(W, H, 0x00000000);
  const ink = Jimp.rgbaToInt(20, 28, 60, 255);
  const dot = (x, y, r = 1.6) => { for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) if (dx * dx + dy * dy <= r * r) { const px = Math.round(x + dx), py = Math.round(y + dy); if (px >= 0 && py >= 0 && px < W && py < H) img.setPixelColor(ink, px, py); } };
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const loops = 5 + (h % 4); let px = 20, py = 70;
  for (let t = 0; t <= 1; t += 0.0015) {
    const x = 20 + t * 360; const y = 64 + Math.sin(t * Math.PI * loops * 2 + (h % 7)) * (22 - t * 10) + Math.sin(t * Math.PI * 3) * 8;
    const steps = Math.ceil(Math.hypot(x - px, y - py)); for (let s = 0; s <= steps; s++) dot(px + ((x - px) * s) / (steps || 1), py + ((y - py) * s) / (steps || 1));
    px = x; py = y;
  }
  for (let x = 60; x < 330; x++) dot(x, 100 + Math.sin(x / 40) * 2, 1.1);
  return img.getBase64Async(Jimp.MIME_PNG);
}

// ════════════════════════════════════════════════════════════════════════════
//  SEED
// ════════════════════════════════════════════════════════════════════════════
const ctx = { team: {}, leads: [], stories: {}, invoiceN: 1000, tagIds: {}, pipelines: {} };
const memberIds = () => [OWNER, ...Object.values(ctx.team)];

function seedSettings() {
  step('Studio settings, team, pipelines, tags');
  const cs = db.prepare('SELECT id FROM company_settings WHERE user_id = ?').get(OWNER);
  const set = { company_name: STUDIO, company_email: 'hello@goldenhour.example.com', company_phone: '+44 7700 900001', company_website: `https://${HANDLE}.example.com`,
    company_address: '14 Market Lane, Studio 3', currency: 'USD', currency_symbol: '$', invoice_prefix: 'GHS-', tax_name: 'VAT', tax_rate: 0, brand_tagline: 'Wedding, portrait & commercial photography', brand_accent: '#6366f1',
    email_signature: `Warmly,\n${owner.full_name || 'The team'}\n${STUDIO}` };
  if (cs) update('company_settings', cs.id, set); else insert('company_settings', { id: uid(), user_id: OWNER, ...set });

  const hash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10); // unusable password: these are display-only teammates
  for (const m of C.TEAM) {
    const id = uid();
    insert('users', { id, email: `${m.key}@team.example.com`, password: hash, business_name: STUDIO, role: 'member', workspace_id: WS, full_name: m.name,
      bio: m.title, created_at: at(daysAgo(between(200, 290))), email_verified_at: at(daysAgo(200)) });
    insert('workspace_members', { id: uid(), workspace_id: WS, user_id: id, role: m.role, full_name: m.name, invite_status: 'active', created_at: at(daysAgo(between(200, 290))) });
    ctx.team[m.key] = id;
  }
  // Pipelines: the default board becomes "Weddings & Events"; two more for commercial and portraits.
  let def = db.prepare('SELECT id FROM pipelines WHERE workspace_id = ? AND is_default = 1').get(WS);
  if (!def) { def = { id: uid() }; insert('pipelines', { id: def.id, workspace_id: WS, name: 'x', stage_labels: '{}', sort_order: 0, is_default: 1, created_at: at(daysAgo(300)) }); }
  db.prepare('UPDATE pipelines SET name = ?, stage_labels = ? WHERE id = ?').run(C.PIPELINES.weddings.name, JSON.stringify(C.PIPELINES.weddings.labels), def.id);
  ctx.pipelines.weddings = null; // default board = NULL pipeline_id
  let order = 1;
  for (const k of ['commercial', 'portraits']) {
    const id = uid(); ctx.pipelines[k] = id;
    insert('pipelines', { id, workspace_id: WS, name: C.PIPELINES[k].name, stage_labels: JSON.stringify(C.PIPELINES[k].labels), sort_order: order++, is_default: 0, created_at: at(daysAgo(280)) });
  }
  for (const t of C.TAGS) { const id = uid(); ctx.tagIds[t.name] = id; insert('tags', { id, user_id: OWNER, name: t.name, color: t.color, created_at: at(daysAgo(290)) }); }
  for (const r of C.LOST_REASONS) insert('lost_reasons', { id: uid(), workspace_id: WS, reason: r, created_at: at(daysAgo(290)) });
}

function timeline(leadId, ms, type, title, extra = {}) {
  insert('activity_timeline', { id: uid(), lead_id: leadId, workspace_id: WS, user_id: extra.user || OWNER, actor_name: extra.actor || null, activity_type: type,
    platform: extra.platform || null, title, body: extra.body || null, metadata: extra.meta ? JSON.stringify(extra.meta) : null, created_at: at(ms) });
  insert('contact_history', { id: uid(), lead_id: leadId, user_id: extra.user || OWNER, type, description: title, created_at: at(ms) });
}

// One lead with its whole conversation and CRM trail. Returns the lead record.
function makeLead(spec) {
  const id = uid();
  const service = spec.service; const svc = C.SERVICES[service];
  const created = spec.created; const name = spec.name;
  const platform = spec.platform || 'whatsapp';
  const value = spec.value || Math.round(between(svc.min, svc.max) / 50) * 50;
  const won = spec.status === 'Closed - Won'; const lost = spec.status === 'Closed - Lost';
  const eventMs = spec.eventMs || created + between(30, 160) * DAY;
  const v = { date: prettyDate(eventMs), month: monthName(eventMs), venue: spec.venue || pick(C.VENUES), offer: `$${Math.round(value * 0.9 / 50) * 50}`, n: between(8, 25) };
  const convo = C.conversation(rng, service, spec.status, v, { stage: spec.stage });
  const assignee = spec.assignee || (chance(0.7) ? pick(memberIds()) : null);
  const phoneNo = platform === 'instagram' || platform === 'facebook' ? `17841${between(100000000, 999999999)}` : phone();
  const closedAt = won || lost ? created + between(4, 20) * DAY : null;
  const score = won ? between(78, 96) : lost ? between(18, 45) : { New: between(40, 70), Contacted: between(45, 72), Interested: between(60, 85), Negotiating: between(72, 92) }[spec.status];
  const urgency = spec.status === 'Negotiating' || (spec.status === 'New' && chance(0.3)) ? 'high' : pick(['low', 'medium', 'medium']);
  const intent = spec.status === 'New' ? pick(['pricing_inquiry', 'appointment_booking', 'general_inquiry']) : lost ? 'not_interested' : pick(['pricing_inquiry', 'appointment_booking', 'follow_up']);

  // messages: spaced realistically from creation; the last open conversations land in the last few days.
  let t = created;
  const msgRows = [];
  convo.forEach((m, i) => {
    t += i === 0 ? 0 : (m.me ? between(4, 90) : between(20, 600)) * 60000 + (i > 6 ? between(0, 3) * DAY : 0);
    msgRows.push({ ...m, ts: t });
  });
  const lastMsg = msgRows.length ? msgRows[msgRows.length - 1].ts : created;
  insert('leads', {
    id, user_id: OWNER, workspace_id: WS, customer_name: name, customer_phone: phoneNo, email: platform === 'instagram' || platform === 'facebook' ? null : emailFor(name),
    status: spec.status, first_message: convo[0].b.slice(0, 200), total_messages: convo.length, estimated_value: value, actual_sale: won ? value : null,
    created_at: at(created), last_message_at: at(lastMsg), last_contacted_at: at(lastMsg), is_deleted: 0, is_client: won ? 1 : 0, client_since: won ? at(closedAt) : null,
    closed_at: closedAt ? at(closedAt) : null, lost_reason: lost ? pick(C.LOST_REASONS) : null, assigned_to: assignee, lead_source: spec.source || { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', website: 'Website' }[platform] || 'WhatsApp',
    platform_source: platform === 'website' ? 'whatsapp' : platform, lead_score: score, sentiment: lost ? pick(['neutral', 'negative']) : pick(['positive', 'positive', 'neutral']),
    urgency, intent_category: intent, ai_last_analyzed_at: at(Math.min(NOW, lastMsg + 3600000)), pipeline_id: svc.pipeline === 'weddings' ? null : ctx.pipelines[svc.pipeline],
    address: spec.company ? spec.company : null,
  });
  const msgPlatform = platform === 'website' ? 'whatsapp' : platform;
  for (const m of msgRows) {
    insert('messages', { id: uid(), lead_id: id, user_id: m.me ? (assignee || OWNER) : OWNER, body: m.b, from_me: m.me, timestamp: at(m.ts), platform: msgPlatform, ack: m.me ? 3 : null });
  }
  if (platform === 'instagram' || platform === 'facebook') {
    insert('lead_channels', { id: uid(), lead_id: id, workspace_id: WS, platform, identifier: phoneNo, display_name: `@${name.toLowerCase().replace(/[^a-z]+/g, '')}`, added_by: OWNER, created_at: at(created) });
  }
  // timeline + notes + tags
  timeline(id, created, 'created', platform === 'website' ? 'Lead captured from website enquiry form' : `New ${platform === 'whatsapp' ? 'WhatsApp' : platform === 'instagram' ? 'Instagram' : 'Facebook'} conversation`, { platform: msgPlatform });
  if (assignee && assignee !== OWNER) timeline(id, created + 20 * 60000, 'assigned', `Assigned to ${C.TEAM.find((m) => ctx.team[m.key] === assignee)?.name || 'a teammate'}`);
  const stageOrder = ['New', 'Contacted', 'Interested', 'Negotiating'];
  const reached = won || lost ? (won ? 4 : between(1, 3)) : stageOrder.indexOf(spec.status);
  for (let s = 1; s <= Math.min(reached, 3); s++) timeline(id, created + s * between(1, 3) * DAY, 'pipeline', `Moved to "${stageOrder[s]}"`);
  if (won) timeline(id, closedAt, 'pipeline', 'Moved to "Closed - Won" — client booked 🎉');
  if (lost) timeline(id, closedAt, 'pipeline', 'Marked as lost');
  if (spec.status !== 'New' && chance(0.55)) {
    for (let k = 0; k < between(1, 2); k++) {
      const nm = created + between(1, 6) * DAY;
      insert('notes', { id: uid(), lead_id: id, user_id: assignee || OWNER, content: C.fill(pick(C.NOTES), v), created_at: at(Math.min(nm, NOW - 3600000)) });
    }
  }
  const tags = new Set(spec.tags || []);
  if (!spec.tags) { if (chance(0.15)) tags.add('Referral'); if (spec.status === 'Negotiating' && chance(0.5)) tags.add('Hot lead'); if (['corporate', 'product', 'realestate', 'headshots'].includes(service) && chance(0.6)) tags.add('Corporate'); if (spec.status === 'Interested' && chance(0.35)) tags.add('Needs follow-up'); }
  for (const tg of tags) if (ctx.tagIds[tg]) insert('lead_tags', { lead_id: id, tag_id: ctx.tagIds[tg] });
  // follow-up reminders on open leads (future ones fire as in-app reminders for the owner)
  if (['Contacted', 'Interested', 'Negotiating'].includes(spec.status) && chance(0.6)) {
    const due = NOW + between(1, 12) * DAY; const d = new Date(due); d.setUTCHours(9, 30, 0, 0);
    const title = pick(C.REMINDERS);
    insert('reminders', { id: uid(), lead_id: id, user_id: OWNER, title, message: title, due_date: at(d.getTime()), reminder_date: d.toISOString(), completed: 0, is_completed: 0, created_at: at(lastMsg) });
  }
  if (won && chance(0.5)) {
    const title = 'Send planning questionnaire'; const d = created + 5 * DAY;
    insert('reminders', { id: uid(), lead_id: id, user_id: OWNER, title, message: title, due_date: at(d), reminder_date: new Date(d).toISOString(), completed: 1, is_completed: 1, created_at: at(created + DAY) });
  }
  const lead = { id, name, service, status: spec.status, value, created, closedAt, eventMs, phone: phoneNo, assignee, platform: msgPlatform, venue: v.venue, story: spec.story };
  ctx.leads.push(lead);
  return lead;
}

function seedLeads() {
  step('Leads and conversations');
  // 1) the story clients (the ones with shoots)
  for (const s of C.STORIES) {
    const shoot = daysAgo(s.daysAgo, 10);
    const created = shoot - between(70, 140) * DAY;
    ctx.stories[s.key] = makeLead({ name: s.client, service: s.service, status: 'Closed - Won', created: Math.min(created, NOW - 45 * DAY), eventMs: shoot, value: s.value,
      platform: s.platform, source: s.source, venue: s.venue, tags: s.tags, assignee: ctx.team[s.owner], stage: s.stage, story: s, company: s.contact ? s.client : null });
  }
  // 2) the pipeline: a believable mix, more recent leads than old ones
  const plan = [['New', 18], ['Contacted', 16], ['Interested', 15], ['Negotiating', 11], ['Closed - Won', 42], ['Closed - Lost', 30]];
  const svcWeights = [['wedding', 34], ['engagement', 10], ['event', 8], ['corporate', 12], ['product', 9], ['realestate', 8], ['family', 9], ['headshots', 6], ['maternity', 4]];
  const pickSvc = () => { let r = rng() * 100; for (const [k, w] of svcWeights) { r -= w; if (r <= 0) return k; } return 'wedding'; };
  const platforms = [['whatsapp', 46], ['instagram', 28], ['website', 14], ['facebook', 12]];
  const pickPlat = () => { let r = rng() * 100; for (const [k, w] of platforms) { r -= w; if (r <= 0) return k; } return 'whatsapp'; };
  const used = new Set(C.STORIES.map((s) => s.client));
  for (const [status, n] of plan) {
    for (let i = 0; i < n; i++) {
      const service = pickSvc();
      let name;
      if (['corporate', 'product', 'realestate', 'headshots'].includes(service) && chance(0.7)) { name = pick(C.COMPANIES); if (used.has(name)) name = `${pick(C.FIRST)} ${pick(C.LAST)}`; }
      else name = `${pick(C.FIRST)} ${pick(C.LAST)}`;
      if (used.has(name)) { i--; continue; } used.add(name);
      // open stages are recent; closed ones spread across ten months, weighted to recent
      const age = status === 'New' ? between(0, 6) : status === 'Contacted' ? between(2, 14) : status === 'Interested' ? between(5, 25) : status === 'Negotiating' ? between(6, 30)
        : Math.round(25 + Math.pow(rng(), 1.4) * 275);
      const created = daysAgo(age, between(7, 20), between(0, 59));
      makeLead({ name, service, status, created, platform: pickPlat(), source: chance(0.12) ? pick(['Referral', 'Google Search', 'Wedding fair']) : undefined });
    }
  }
  log(`  ${ctx.leads.length} leads`);
}

function invoiceRow(lead, { label, amount, status, created, due, paidAt }) {
  ctx.invoiceN++;
  const id = uid();
  const items = [{ description: label, quantity: 1, qty: 1, rate: amount, amount }];
  insert('invoices', { id, user_id: OWNER, workspace_id: WS, lead_id: lead.id, invoice_number: `GHS-${ctx.invoiceN}`, customer_name: lead.name, customer_email: emailFor(lead.name), customer_phone: lead.phone,
    items: JSON.stringify(items), subtotal: amount, tax_rate: 0, tax_amount: 0, discount: 0, total: amount, currency: 'USD', currency_symbol: '$', status,
    due_date: isoDate(due), notes: 'Thank you for choosing us! Payment by card via the secure link, or bank transfer.', created_at: at(created), is_deleted: 0 });
  if (status === 'paid') {
    insert('payments', { id: uid(), workspace_id: WS, kind: 'invoice', ref_id: id, lead_id: lead.id, amount, currency: 'USD', currency_symbol: '$', description: `${label} — ${lead.name}`,
      status: 'paid', provider: chance(0.7) ? 'stripe' : 'manual', created_by: OWNER, created_at: at(created), paid_at: at(paidAt) });
  } else if (status === 'sent' && chance(0.6)) {
    insert('payments', { id: uid(), workspace_id: WS, kind: 'invoice', ref_id: id, lead_id: lead.id, amount, currency: 'USD', currency_symbol: '$', description: `${label} — ${lead.name}`,
      status: 'pending', provider: 'manual', public_token: crypto.randomBytes(16).toString('hex'), created_by: OWNER, created_at: at(created) });
  }
  return id;
}

function seedMoneyAndBookings() {
  step('Invoices, payments, bookings');
  let inv = 0, bk = 0;
  for (const l of ctx.leads) {
    const svc = C.SERVICES[l.service];
    if (l.status === 'Closed - Won') {
      const dep = Math.round(l.value * 0.3 / 10) * 10;
      const depAt = l.closedAt + between(0, 2) * DAY;
      invoiceRow(l, { label: `${svc.label} — 30% retainer`, amount: dep, status: 'paid', created: l.closedAt, due: l.closedAt + 7 * DAY, paidAt: depAt }); inv++;
      const balDue = l.eventMs - 7 * DAY;
      const past = l.eventMs < NOW;
      const status = past ? (chance(0.88) ? 'paid' : 'sent') : (balDue < NOW + 20 * DAY ? 'sent' : 'draft');
      invoiceRow(l, { label: `${svc.label} — balance`, amount: l.value - dep, status, created: Math.min(NOW - DAY, balDue - 14 * DAY), due: balDue, paidAt: Math.min(NOW - 3600000, balDue - between(0, 5) * DAY) }); inv++;
      // the shoot itself
      insert('bookings', { id: uid(), workspace_id: WS, lead_id: l.id, service: svc.label, start_at: new Date(l.eventMs).toISOString(), duration_min: svc.duration,
        name: l.name, phone: l.phone, email: emailFor(l.name), notes: `Venue: ${l.venue}`, status: past ? 'completed' : 'confirmed', token: crypto.randomBytes(16).toString('hex'),
        created_at: at(l.closedAt), is_deleted: 0 }); bk++;
    } else if (['Interested', 'Negotiating'].includes(l.status) && chance(0.55)) {
      const when = NOW + between(1, 14) * DAY; const d = new Date(when); d.setUTCHours(between(9, 16), chance(0.5) ? 0 : 30, 0, 0);
      insert('bookings', { id: uid(), workspace_id: WS, lead_id: l.id, service: 'Discovery call (20 min)', start_at: d.toISOString(), duration_min: 20, name: l.name, phone: l.phone,
        email: emailFor(l.name), notes: 'Booked from the public booking page', status: chance(0.8) ? 'confirmed' : 'pending', token: crypto.randomBytes(16).toString('hex'), created_at: at(NOW - between(1, 4) * DAY), is_deleted: 0 }); bk++;
    }
  }
  db.prepare('UPDATE company_settings SET invoice_counter = ? WHERE user_id = ?').run(ctx.invoiceN + 1, OWNER);
  // Public booking page
  const slugTaken = db.prepare('SELECT workspace_id FROM booking_settings WHERE slug = ? AND workspace_id != ?').get(HANDLE, WS);
  const slug = slugTaken ? `${HANDLE}-${crypto.randomBytes(2).toString('hex')}` : HANDLE;
  db.prepare('DELETE FROM booking_settings WHERE workspace_id = ?').run(WS);
  insert('booking_settings', { workspace_id: WS, slug, updated_at: at(NOW), settings: JSON.stringify({
    services: [
      { name: 'Discovery call', duration: 20, price: 0, is_shoot: false },
      { name: 'Engagement session', duration: 90, price: 450, is_shoot: true },
      { name: 'Family portraits', duration: 60, price: 350, is_shoot: true },
      { name: 'Maternity session', duration: 75, price: 395, is_shoot: true },
      { name: 'Headshots (per person)', duration: 20, price: 95, is_shoot: true },
    ],
    availability: { 1: [10, 18], 2: [10, 18], 3: [10, 18], 4: [10, 18], 5: [10, 18], 6: [9, 14] }, slot_min: 30, days_ahead: 60, buffer_min: 15, timezone: 'Europe/London',
  }) });
  ctx.bookingSlug = slug;
  log(`  ${inv} invoices, ${bk} bookings, booking page /book/${slug}`);
}

function seedKnowledgeAndChat() {
  step('Knowledge base, team chat, notifications');
  for (const k of C.KNOWLEDGE) {
    const id = uid();
    const mem = C.MEMORIES.filter((m) => (k.type === 'text' ? m[0] === 'faq' : true)).length;
    insert('knowledge_documents', { id, workspace_id: WS, document_name: k.name, file_path: '', file_type: k.type, extracted_text: k.text, memory_count: Math.min(mem, 8), processed: 1, uploaded_at: at(daysAgo(between(120, 240))) });
  }
  for (const [type, key, value] of C.MEMORIES) insert('ai_memories', { id: uid(), workspace_id: WS, memory_type: type, key, value, confidence: between(86, 99), source: 'document', created_at: at(daysAgo(between(100, 200))), updated_at: at(daysAgo(between(10, 90))) });
  const who = (k) => (k === 'owner' ? OWNER : ctx.team[k]);
  const nameOf = (k) => (k === 'owner' ? (owner.full_name || 'Owner') : C.TEAM.find((m) => m.key === k).name);
  let ch = 0;
  for (const [name, msgs] of Object.entries(C.CHAT)) {
    const id = uid();
    insert('chat_channels', { id, workspace_id: WS, name, description: { general: 'Studio-wide updates', shoots: 'Planning for upcoming shoots', editing: 'Culling, edits and delivery' }[name], is_private: 0, created_by: OWNER, created_at: at(daysAgo(250)) });
    for (const u of memberIds()) insert('chat_members', { channel_id: id, user_id: u, last_read_at: at(NOW - 3600000), joined_at: at(daysAgo(250)) });
    msgs.forEach(([k, body], i) => { insert('chat_messages', { id: uid(), channel_id: id, user_id: who(k), sender_name: nameOf(k), body, created_at: at(NOW - (msgs.length - i) * between(25, 160) * 60000) }); ch++; });
  }
  log(`  ${C.KNOWLEDGE.length} documents, ${C.MEMORIES.length} AI memories, ${ch} chat messages`);
}

// ── API phase ───────────────────────────────────────────────────────────────
async function seedContracts() {
  step('Contracts (created, sent and signed through the real API)');
  const targets = [];
  for (const l of ctx.leads) {
    if (l.status === 'Closed - Won' && (l.story || chance(0.45))) targets.push({ l, outcome: 'signed' });
    else if (l.status === 'Negotiating') targets.push({ l, outcome: chance(0.6) ? 'viewed' : 'sent' });
    else if (l.status === 'Interested' && chance(0.35)) targets.push({ l, outcome: 'draft' });
  }
  const sigCache = {};
  let n = 0, signed = 0;
  for (const { l, outcome } of targets) {
    const svc = C.SERVICES[l.service];
    const doc = await api('POST', '/cs/documents', { title: `${(svc.pack === 'wedding-proposal' ? 'Wedding Photography Proposal' : svc.pack === 'commercial-sow' ? 'Statement of Work' : 'Session Agreement')} — ${l.name}`, pack_id: svc.pack, lead_id: l.id, theme: pick(['monochrome', 'editorial', 'executive']) });
    n++;
    const created = (l.closedAt || NOW - between(2, 8) * DAY) - between(2, 5) * DAY;
    let sentAt = null, viewedAt = null, doneAt = null;
    if (outcome !== 'draft') {
      const s = await api('POST', `/cs/documents/${doc.id}/send`, { channels: ['none'] });
      sentAt = created + between(2, 30) * 3600000;
      const token = s.share_url.split('/d/')[1];
      if (outcome === 'viewed' || outcome === 'signed') { await api('GET', `/cs/public/${token}`); viewedAt = sentAt + between(1, 20) * 3600000; }
      if (outcome === 'signed') {
        sigCache[l.name] ||= await signaturePng(l.name);
        const selection = svc.pack === 'wedding-proposal' ? { package: l.value >= 5000 ? 'Luxe' : l.value >= 3500 ? 'Signature' : 'Essential', addons: chance(0.5) ? ['Drone aerial coverage'] : [] } : undefined;
        await api('POST', `/cs/public/${token}/sign`, { typed_name: l.name, consent: true, signature_data: sigCache[l.name], selection });
        doneAt = Math.min(NOW - 3600000, (l.closedAt || viewedAt) - between(0, 1) * DAY + 3600000);
        signed++;
      }
    }
    // backdate the document and its trail to when it really happened
    update('cs_documents', doc.id, { created_at: at(created), updated_at: at(doneAt || viewedAt || sentAt || created), sent_at: sentAt ? at(sentAt) : null, viewed_at: viewedAt ? at(viewedAt) : null, completed_at: doneAt ? at(doneAt) : null });
    const evs = db.prepare('SELECT id, type FROM cs_events WHERE document_id = ? ORDER BY rowid').all(doc.id);
    for (const e of evs) { const when = { created, sent: sentAt, viewed: viewedAt, signed: doneAt }[e.type] || created; db.prepare('UPDATE cs_events SET created_at = ? WHERE id = ?').run(at(when), e.id); }
    if (doneAt) db.prepare('UPDATE cs_signers SET signed_at = ? WHERE document_id = ? AND status = ?').run(at(doneAt), doc.id, 'signed');
    db.prepare('UPDATE cs_versions SET created_at = ? WHERE document_id = ?').run(at(sentAt || created), doc.id);
  }
  log(`  ${n} documents, ${signed} signed with sealed certificates`);
}

async function waitForJobs(projectIds, label, maxMin = 25) {
  const q = db.prepare(`SELECT COUNT(*) c FROM ms_jobs WHERE project_id IN (${projectIds.map(() => '?').join(',')}) AND status IN ('pending','running')`);
  const t0 = Date.now(); let last = -1;
  for (;;) {
    const c = q.get(...projectIds).c;
    if (c === 0) return true;
    if (c !== last) { log(`  … ${label}: ${c} job(s) left`); last = c; }
    if (Date.now() - t0 > maxMin * 60000) { log(`  ! ${label} still running after ${maxMin} min — continuing; the worker will finish them in the background.`); return false; }
    await sleep(5000);
  }
}

async function seedStudio() {
  step('Media Studio: shoots, photos, AI culling, galleries, albums, reels');
  // Portfolio first, with auto-include OFF so publishing galleries doesn't dump every photo into it.
  await api('PUT', '/media/portfolio', { title: STUDIO, tagline: 'Wedding, portrait & commercial photography', handle: HANDLE, theme: 'atelier', auto_include: false,
    bio: `${STUDIO} is a small team of photographers and filmmakers telling honest, beautiful stories — from three-day weddings to brand campaigns. We shoot light, natural and true to the moment.`,
    settings: { contact: { email: 'hello@goldenhour.example.com', whatsapp: '+44 7700 900001' }, social: { instagram: HANDLE } } }).catch(async (e) => {
    if (/taken/.test(e.message)) await api('PUT', '/media/portfolio', { handle: `${HANDLE}-${crypto.randomBytes(2).toString('hex')}`, auto_include: false }); else throw e;
  });

  const projects = [];
  for (const s of C.STORIES) {
    const lead = ctx.stories[s.key];
    const shoot = daysAgo(s.daysAgo, 10);
    const p = await api('POST', '/media/projects', { title: s.title, project_type: { wedding: 'wedding', engagement: 'portrait', corporate: 'event', product: 'product', realestate: 'real_estate', family: 'portrait' }[s.service] || 'general',
      lead_id: lead.id, shoot_date: isoDate(shoot), location: s.venue });
    projects.push({ s, p, lead, shoot, assets: [] });
    const photos = await photosFor(s);
    for (let i = 0; i < photos.length; i += 8) {
      const fd = new FormData();
      for (const f of photos.slice(i, i + 8)) fd.append('files', new Blob([fs.readFileSync(f)], { type: 'image/jpeg' }), `${s.key.toUpperCase()}_${String(i + photos.slice(i, i + 8).indexOf(f) + 1).padStart(4, '0')}.jpg`);
      const r = await api('POST', `/media/projects/${p.id}/assets`, undefined, { form: fd });
      projects[projects.length - 1].assets.push(...r.assets.map((a) => a.id));
    }
    log(`  ${s.title}: ${photos.length} photos`);
  }
  const withPhotos = projects.filter((x) => x.assets.length);
  if (withPhotos.length) await waitForJobs(withPhotos.map((x) => x.p.id), 'thumbnails + AI scoring');

  for (const x of projects) {
    const { s, p, lead, shoot } = x;
    // project dates + status, capture times in shoot order
    const status = { planning: 'planning', culling: 'culling', proofing: 'delivery', delivered: 'delivered' }[s.stage] || 'delivered';
    db.prepare('UPDATE ms_projects SET status = ?, created_at = ?, updated_at = ? WHERE id = ?').run(status, at(lead.closedAt + DAY), at(Math.min(NOW - 3600000, shoot + 20 * DAY)), p.id);
    x.assets.forEach((aid, i) => db.prepare('UPDATE ms_assets SET capture_time = COALESCE(capture_time, ?), created_at = ?, uploaded_at = ? WHERE id = ?')
      .run(new Date(shoot + i * between(3, 9) * 60000).toISOString(), at(Math.min(NOW - 7200000, shoot + DAY)), at(Math.min(NOW - 7200000, shoot + DAY)), aid));
    if (x.assets[0]) await api('PUT', `/media/projects/${p.id}`, { cover_asset_id: x.assets[Math.min(2, x.assets.length - 1)] });
    // milestones
    const ms = [['Contract signed', 'done', lead.closedAt], ['Retainer paid', 'done', lead.closedAt + DAY], ['Shoot day', shoot < NOW ? 'done' : 'pending', shoot],
      ['Culling & edits', s.stage === 'delivered' || s.stage === 'proofing' ? 'done' : s.stage === 'culling' ? 'in_progress' : 'pending', shoot + 10 * DAY],
      ['Gallery delivered', s.stage === 'delivered' || s.stage === 'proofing' ? 'done' : 'pending', shoot + 21 * DAY]];
    if (s.album) ms.push(['Album designed & approved', s.proofing === 'approved' ? 'done' : 'pending', shoot + 45 * DAY]);
    ms.forEach(([title, st, due], i) => insert('ms_milestones', { id: uid(), workspace_id: WS, project_id: p.id, lead_id: lead.id, title, status: st, due_date: isoDate(due), sort_order: i, created_at: at(lead.closedAt + DAY) }));
    if (!x.assets.length) continue;

    // AI-assisted cull: keep the best ~75%, a few maybes, reject the weakest.
    const scored = x.assets.map((id) => ({ id, s: db.prepare("SELECT AVG(value) v FROM ms_asset_scores WHERE asset_id = ? AND score_type IN ('aesthetic','sharpness')").get(id)?.v ?? rng() })).sort((a, b) => b.s - a.s);
    const keep = scored.slice(0, Math.round(scored.length * 0.75)).map((a) => a.id);
    const maybe = scored.slice(keep.length, keep.length + 2).map((a) => a.id);
    const reject = scored.slice(keep.length + maybe.length).map((a) => a.id);
    await api('POST', `/media/projects/${p.id}/cull/bulk`, { asset_ids: keep, decision: 'keep' });
    if (maybe.length) await api('POST', `/media/projects/${p.id}/cull/bulk`, { asset_ids: maybe, decision: 'maybe' });
    if (reject.length) await api('POST', `/media/projects/${p.id}/cull/bulk`, { asset_ids: reject, decision: 'reject' });
    db.prepare('UPDATE ms_cull_decisions SET rating = ?, decided_at = ? WHERE project_id = ? AND decision = ?').run(4, at(Math.min(NOW - 7200000, shoot + 3 * DAY)), p.id, 'keep');
    for (const id of keep.slice(0, 5)) db.prepare('UPDATE ms_cull_decisions SET rating = 5 WHERE asset_id = ?').run(id);
    x.keep = keep;
    if (s.stage === 'culling') continue;

    // Galleries: the full delivery + a short sneak peek.
    const settings = { download_policy: 'high-res', allow_favourites: true, allow_comments: true };
    const g = await api('POST', `/media/projects/${p.id}/galleries/from-cull`, { title: `${s.title.split(' — ')[0]} — Full Gallery`, visibility: s.password ? 'password' : 'public', password: s.password, settings });
    const peek = await api('POST', `/media/projects/${p.id}/galleries`, { title: `${s.title.split(' — ')[0]} — Sneak Peek`, visibility: 'public', settings: { download_policy: 'web' } });
    await api('POST', `/media/galleries/${peek.id}/assets`, { asset_ids: keep.slice(0, 8) });
    for (const gal of [peek, g]) await api('POST', `/media/galleries/${gal.id}/publish`, { notify: false });
    const pubAt = Math.min(NOW - 3600000, shoot + 18 * DAY);
    db.prepare('UPDATE ms_galleries SET created_at = ?, published_at = ? WHERE id = ?').run(at(pubAt - DAY), at(pubAt), g.id);
    db.prepare('UPDATE ms_galleries SET created_at = ?, published_at = ? WHERE id = ?').run(at(shoot + 2 * DAY), at(Math.min(NOW - 7200000, shoot + 3 * DAY)), peek.id);
    x.gallery = g; x.peek = peek; x.pubAt = pubAt;

    // Client activity, written as the client would have left it.
    const who = emailFor(lead.name);
    const favs = keep.filter(() => chance(0.4)).slice(0, 14);
    for (const aid of favs) insert('ms_client_favorites', { id: uid(), gallery_id: g.id, asset_id: aid, contact_identifier: who, created_at: at(Math.min(NOW - 600000, pubAt + between(1, 48) * 3600000)) });
    if (s.partner) for (const aid of keep.filter(() => chance(0.2)).slice(0, 6)) insert('ms_client_favorites', { id: uid(), gallery_id: g.id, asset_id: aid, contact_identifier: `${s.partner.toLowerCase()}@example.com`, created_at: at(Math.min(NOW - 600000, pubAt + between(2, 60) * 3600000)) });
    if (favs.length >= 4) insert('ms_fav_collections', { id: uid(), gallery_id: g.id, workspace_id: WS, name: s.service === 'wedding' ? 'For the album' : 'Our favourites', contact_identifier: who, asset_ids: JSON.stringify(favs.slice(0, 10)), created_at: at(Math.min(NOW - 600000, pubAt + 3 * DAY)) });
    const comments = ['This one!! 😍', 'Can we get this one in black & white?', 'Absolutely love the light here', 'Mum wants a print of this one', 'Could you brighten this slightly?', 'Best photo of the day ❤️'];
    for (const aid of keep.slice(1, 1 + between(2, 4))) insert('ms_client_comments', { id: uid(), gallery_id: g.id, asset_id: aid, contact_identifier: who, body: pick(comments), created_at: at(Math.min(NOW - 600000, pubAt + between(2, 72) * 3600000)) });
    for (let v = 0; v < between(3, 9); v++) insert('ms_gallery_access', { id: uid(), gallery_id: g.id, lead_id: lead.id, email: who, access_token: g.share_token || null, last_viewed_at: at(Math.min(NOW - 600000, pubAt + between(1, 200) * 3600000)) });
    if (s.proofing) {
      const set = await api('POST', `/media/galleries/${g.id}/proofing`, { title: s.service === 'wedding' ? 'Choose your 20 album favourites' : 'Pick your favourites', quota: 20, instructions: 'Tap the heart on the photos you want in your album. You can change your mind until you submit.' });
      for (const aid of keep.slice(0, 20)) insert('ms_proofing_selections', { id: uid(), set_id: set.id, asset_id: aid, contact_identifier: who, round: 0, created_at: at(Math.min(NOW - 600000, pubAt + 4 * DAY)) });
      db.prepare('UPDATE ms_proofing_sets SET status = ?, submitted_at = ?, created_at = ? WHERE id = ?').run(s.proofing, at(Math.min(NOW - 600000, pubAt + 5 * DAY)), at(pubAt), set.id);
    }
    if (s.album) {
      const al = await api('POST', `/media/projects/${p.id}/albums`, { title: `${s.title.split(' — ')[0]} — Heirloom Album`, spec: { w_mm: 300, h_mm: 300, margin_mm: 12 } });
      await api('POST', `/media/albums/${al.id}/autofill`, { decision: 'keep' });
      db.prepare('UPDATE ms_albums SET status = ?, created_at = ?, updated_at = ? WHERE id = ?').run(s.proofing === 'approved' ? 'approved' : 'draft', at(Math.min(NOW - 7200000, pubAt + 7 * DAY)), at(Math.min(NOW - 3600000, pubAt + 12 * DAY)), al.id);
    }
    timeline(lead.id, Math.min(NOW - 3600000, shoot + 3 * DAY), 'media', `Sneak peek published (${Math.min(8, keep.length)} photos)`);
    timeline(lead.id, pubAt, 'media', `Gallery "${g.title}" delivered — ${keep.length} photos`);
    if (favs.length) timeline(lead.id, Math.min(NOW - 600000, pubAt + 2 * DAY), 'media', `Client favourited ${favs.length} photos`);
  }

  // Reels — rendered by the real video engine from the scored photos.
  let ffmpeg = false;
  try { require('child_process').execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-version'], { stdio: 'ignore' }); ffmpeg = true; } catch {}
  if (!NO_REELS && !ffmpeg) log('  ! ffmpeg is not installed, so reels are skipped (a failed render would show in the demo). Install it with: sudo apt install -y ffmpeg — then re-run with --clean first.');
  if (!NO_REELS && ffmpeg) {
    const reelProjects = projects.filter((x) => x.s.reel && x.assets.length);
    for (const x of reelProjects) {
      try { await api('POST', `/media/projects/${x.p.id}/reel-render`, { target_count: 12, title: `${x.s.title.split(' — ')[0]} — Highlights Reel`, preset: 'ig_reel', quality: 1080 }); }
      catch (e) { log(`  ! reel for ${x.s.title}: ${e.message}`); }
    }
    if (reelProjects.length) await waitForJobs(reelProjects.map((x) => x.p.id), 'reel renders', 30);
    const ready = db.prepare(`SELECT COUNT(*) c FROM ms_video_exports WHERE workspace_id = ? AND status IN ('done','ready','completed')`).get(WS).c;
    log(`  ${reelProjects.length} reels requested, ${ready} rendered`);
  }

  // Portfolio: the best keepers from delivered work, a few featured.
  const best = projects.filter((x) => x.gallery && x.keep).flatMap((x) => x.keep.slice(0, 3));
  if (best.length) {
    const r = await api('POST', '/media/portfolio/items', { asset_ids: best });
    const items = (r.items || []).filter((it) => best.includes(it.asset_id));
    for (const it of items.slice(0, 4)) await api('PUT', `/media/portfolio/items/${it.id}`, { featured: true });
    await api('PUT', '/media/portfolio', { is_public: true });
  }
  ctx.projects = projects;
}

async function seedStore() {
  step('Print store');
  const products = [
    { name: 'Fine art print', kind: 'print', description: 'Giclée on 310gsm cotton rag, archival inks', options: [{ label: '8×10"', price: 45 }, { label: '12×18"', price: 85 }, { label: '20×30"', price: 160 }] },
    { name: 'Gallery canvas', kind: 'canvas', description: 'Hand-stretched on a 38mm frame, ready to hang', options: [{ label: '16×20"', price: 180 }, { label: '24×36"', price: 290 }] },
    { name: 'Heirloom album', kind: 'album', description: 'Lay-flat, 30 spreads, linen or leather cover', options: [{ label: '10×10"', price: 650 }, { label: '12×12"', price: 850 }] },
    { name: 'Parent album', kind: 'album', description: 'A smaller copy of your album for family', options: [{ label: '8×8"', price: 290 }] },
    { name: 'Digital download — full gallery', kind: 'digital', description: 'Every image at full resolution', options: [{ label: 'Full gallery', price: 250 }] },
  ];
  const ids = [];
  for (const p of products) { const r = await api('POST', '/store/products', { ...p, active: 1 }); ids.push(r.id || r.product?.id); }
  const delivered = (ctx.projects || []).filter((x) => x.gallery);
  const statuses = ['fulfilled', 'fulfilled', 'in_production', 'new', 'new', 'fulfilled', 'in_production'];
  let n = 0;
  for (const x of delivered.slice(0, 7)) {
    const prod = pick(products); const o = pick(prod.options); const qty = between(1, 3);
    const total = o.price * qty;
    insert('ms_print_orders', { id: uid(), workspace_id: WS, gallery_id: x.gallery.id, lead_id: x.lead.id, items: JSON.stringify([{ product: prod.name, option: o.label, qty, price: o.price }]),
      total, currency_symbol: '$', customer_name: x.lead.name, customer_phone: x.lead.phone, customer_email: emailFor(x.lead.name), note: chance(0.4) ? 'Please gift wrap 🎁' : null,
      status: statuses[n % statuses.length], created_at: at(Math.min(NOW - 3600000, x.pubAt + between(3, 20) * DAY)) });
    n++;
  }
  log(`  ${products.length} products, ${n} orders`);
}

function seedNotifications() {
  step('Recent notifications');
  // Drop the "now"-stamped ones the API calls produced and write a believable recent feed.
  db.prepare('DELETE FROM notifications WHERE workspace_id = ?').run(WS);
  const recent = ctx.leads.filter((l) => l.status === 'New').slice(0, 5);
  const feed = [
    ...recent.map((l, i) => ({ type: 'lead', title: 'New lead', body: `${l.name} just came in`, url: `/leads/${l.id}`, icon: '👤', ago: 20 + i * 140 })),
    { type: 'contract', title: 'Contract fully signed', body: `${ctx.stories.sophia.name} signed "Wedding Photography Proposal"`, url: `/leads/${ctx.stories.sophia.id}`, icon: '✍️', ago: 300 },
    { type: 'gallery', title: 'Client saved a collection', body: `"For the album" — 10 photos in ${C.STORIES[1].title}`, url: `/leads/${ctx.stories.mariam.id}`, icon: '⭐', ago: 520 },
    { type: 'payment', title: 'Payment received', body: `$1,440 retainer from ${ctx.stories.sophia.name}`, url: '/invoices', icon: '💳', ago: 900 },
    { type: 'gallery', title: 'New gallery comment', body: `${ctx.stories.hira.name} commented on ${C.STORIES[3].title.split(' — ')[0]} — Full Gallery`, url: `/leads/${ctx.stories.hira.id}`, icon: '💬', ago: 1500 },
    { type: 'booking', title: 'New booking', body: 'Discovery call booked from your booking page', url: '/bookings', icon: '📅', ago: 2200 },
  ];
  for (const f of feed) insert('notifications', { id: uid(), workspace_id: WS, user_id: OWNER, type: f.type, title: f.title, body: f.body, url: f.url, icon: f.icon, is_read: f.ago > 1000 ? 1 : 0, created_at: at(NOW - f.ago * 60000) });
  // The API also wrote "today" entries into lead timelines for things we backdated — drop those duplicates.
  db.prepare("DELETE FROM activity_timeline WHERE workspace_id = ? AND created_at >= ? AND activity_type NOT IN ('media','pipeline','created','assigned')").run(WS, at(START));
  db.prepare("DELETE FROM activity_timeline WHERE workspace_id = ? AND created_at >= ? AND activity_type = 'media' AND title NOT LIKE 'Client favourited%'").run(WS, at(START));
}

const START = Date.now() - 1000;
(async () => {
  if (CLEAN) { try { clean(); } catch (e) { console.error('\n✗ Clean failed, nothing was removed:', e.message); process.exit(1); } return; }

  // ── preflight ────────────────────────────────────────────────────────────
  const connected = db.prepare("SELECT COUNT(*) c FROM platform_accounts WHERE workspace_id = ? AND status = 'connected'").get(WS).c;
  const existing = db.prepare('SELECT COUNT(*) c FROM leads WHERE workspace_id = ? AND (is_deleted = 0 OR is_deleted IS NULL)').get(WS).c;
  log(`Connected channels: ${connected}   Existing leads: ${existing}   Photos: ${PHOTOS_DIR ? `folder ${PHOTOS_DIR}` : process.env.PEXELS_API_KEY ? 'Pexels (on-theme)' : 'picsum (random subjects — set PEXELS_API_KEY for on-theme photos)'}`);
  if (connected) { console.error('\n✗ This workspace has a connected WhatsApp/Instagram/Facebook account. Disconnect it first — the demo must never be able to message anyone.'); process.exit(1); }
  if (existing) { console.error(`\n✗ This workspace already has ${existing} leads. Run with --clean --yes first (it is meant for an empty demo account).`); process.exit(1); }
  if (!process.env.JWT_SECRET) { console.error('✗ JWT_SECRET not found (run from backend/ so .env is read).'); process.exit(1); }
  TOKEN = jwt.sign({ userId: OWNER, tv: owner.token_version || 0 }, process.env.JWT_SECRET, { expiresIn: '3h' });
  const me = await api('GET', '/auth/me').catch((e) => { console.error(`✗ Cannot reach the API at ${API}: ${e.message}`); process.exit(1); });
  if ((me.user?.workspace_id || me.workspace_id || WS) !== WS) { console.error('✗ API token resolved to a different workspace.'); process.exit(1); }
  if (!APPLY) { log('\nChecks passed. Re-run with --yes to seed.'); return; }

  seedSettings();
  seedLeads();
  seedMoneyAndBookings();
  seedKnowledgeAndChat();
  await seedContracts();
  await seedStudio();
  await seedStore();
  seedNotifications();

  const pf = db.prepare('SELECT handle FROM ms_portfolios WHERE workspace_id = ? AND user_id = ?').get(WS, OWNER);
  const base = process.env.FRONTEND_URL || '';
  log('\n✓ Done. Public pages to show clients:');
  if (pf) log(`  Portfolio       ${base}/folio/${pf.handle}`);
  log(`  Booking page    ${base}/book/${ctx.bookingSlug}`);
  for (const x of (ctx.projects || []).filter((p) => p.gallery).slice(0, 5)) {
    const tok = db.prepare('SELECT share_token FROM ms_galleries WHERE id = ?').get(x.gallery.id)?.share_token;
    log(`  Gallery         ${base}/g/${tok}   ${x.s.title.split(' — ')[0]}${x.s.password ? `   (password: ${x.s.password})` : ''}`);
  }
})().catch((e) => { console.error('\n✗ Seeding stopped:', e.message); console.error('  Run with --clean --yes to remove what was written, then try again.'); process.exit(1); });
