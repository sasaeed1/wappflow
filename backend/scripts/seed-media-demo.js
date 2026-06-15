#!/usr/bin/env node
/* eslint-disable */
// ════════════════════════════════════════════════════════════════════════════
//  SEED DEMO SHOOTS  —  fill the Studio with realistic shoots + photographs so
//  the new immersive home (full-bleed stage + masonry wall) can be judged with
//  real imagery instead of the empty state.
//
//  Usage (run from the backend dir):
//     node scripts/seed-media-demo.js            # add demo shoots (idempotent)
//     node scripts/seed-media-demo.js --clean    # remove demo shoots, then add
//     node scripts/seed-media-demo.js --remove   # remove demo shoots only
//     WAPPFLOW_DB=/data/wappflow.db UPLOADS_DIR=/data/uploads node scripts/seed-media-demo.js
//
//  Safe by construction:
//   • Every seeded shoot is tagged settings.demo = true. --clean / --remove only
//     ever delete shoots carrying that tag, plus their assets + image files.
//     Real shoots are never touched.
//   • Photos are downloaded from picsum.photos (stable, license-free) into
//     <uploads>/media, exactly where real uploads live.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const PROD = process.env.NODE_ENV === 'production';
const DB_PATH = process.env.WAPPFLOW_DB || (PROD ? '/data/wappflow.db' : path.join(__dirname, '..', 'wappflow.db'));
const UPLOADS_DIR = process.env.UPLOADS_DIR || (PROD ? '/data/uploads' : path.join(__dirname, '..', 'uploads'));
const MEDIA_DIR = path.join(UPLOADS_DIR, 'media');

const REMOVE = process.argv.includes('--remove');
const CLEAN = process.argv.includes('--clean');

if (!fs.existsSync(DB_PATH)) { console.error(`DB not found at ${DB_PATH}`); process.exit(1); }
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});
// SQLite CURRENT_TIMESTAMP format (UTC): 'YYYY-MM-DD HH:MM:SS'
const ts = (d) => new Date(d).toISOString().slice(0, 19).replace('T', ' ');
const publicUrl = (key) => '/' + ['uploads', key].join('/').replace(/\/+/g, '/');

// ── Find the workspace to seed into ─────────────────────────────────────────
// Prefer the workspace that already owns shoots (matches what the user sees);
// otherwise the first user's workspace.
let ws = db.prepare(`SELECT workspace_id AS id FROM ms_projects GROUP BY workspace_id
  ORDER BY COUNT(*) DESC LIMIT 1`).get();
let creator = null;
if (ws) {
  creator = db.prepare(`SELECT id FROM users WHERE workspace_id = ? ORDER BY created_at LIMIT 1`).get(ws.id);
}
if (!ws) {
  const u = db.prepare(`SELECT id, workspace_id FROM users WHERE workspace_id IS NOT NULL ORDER BY created_at LIMIT 1`).get();
  if (!u) { console.error('No workspace found. Sign up first, then re-run.'); process.exit(1); }
  ws = { id: u.workspace_id }; creator = { id: u.id };
}
const WS = ws.id;
const CREATED_BY = creator ? creator.id : null;
console.log(`Workspace: ${WS}`);

// ── Remove previously-seeded demo shoots (tag: settings.demo) ───────────────
function removeDemo() {
  const demos = db.prepare(`SELECT id, title, settings FROM ms_projects WHERE workspace_id = ?`).all(WS)
    .filter((p) => { try { return JSON.parse(p.settings || '{}').demo === true; } catch { return false; } });
  if (!demos.length) { console.log('No demo shoots to remove.'); return; }
  const ids = demos.map((d) => d.id);
  const qs = ids.map(() => '?').join(',');
  const assets = db.prepare(`SELECT storage_key FROM ms_assets WHERE project_id IN (${qs})`).all(...ids);
  let files = 0;
  for (const a of assets) { try { fs.unlinkSync(path.join(UPLOADS_DIR, a.storage_key)); files++; } catch {} }
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM ms_assets WHERE project_id IN (${qs})`).run(...ids);
    db.prepare(`DELETE FROM ms_projects WHERE id IN (${qs})`).run(...ids);
  });
  tx();
  console.log(`Removed ${demos.length} demo shoot(s), ${assets.length} asset row(s), ${files} file(s).`);
}

if (REMOVE || CLEAN) removeDemo();
if (REMOVE) { console.log('Done.'); process.exit(0); }

// Idempotency: if demo shoots already exist (and not --clean), don't double-seed.
const existingDemo = db.prepare(`SELECT settings FROM ms_projects WHERE workspace_id = ?`).all(WS)
  .some((p) => { try { return JSON.parse(p.settings || '{}').demo === true; } catch { return false; } });
if (existingDemo && !CLEAN) {
  console.log('Demo shoots already present. Use --clean to reseed, or --remove to delete. Nothing to do.');
  process.exit(0);
}

// ── Optionally link real clients (leads) so client names show on cards ──────
const leads = db.prepare(`SELECT id, customer_name FROM leads WHERE workspace_id = ? AND customer_name IS NOT NULL
  ORDER BY created_at DESC LIMIT 8`).all(WS);
let leadCursor = 0;
const nextLead = () => (leadCursor < leads.length ? leads[leadCursor++].id : null);

// ── The demo shoots. Index 0 = newest = the home "stage". First image of each
//    is a wide hero shot (becomes the cover); the rest mix orientations so the
//    masonry wall has rhythm. picsum seeds keep images stable across re-runs. ─
const L = [1600, 1067], P = [1000, 1500], S = [1200, 1200], W = [1800, 1000]; // landscape/portrait/square/wide
const shoots = [
  { title: 'Ayesha & Bilal — The Wedding', type: 'wedding', status: 'delivery', loc: 'Lahore',
    dims: [W, P, L, S, P, L, P, S, L, P, L, S, P, L] },
  { title: 'Sara — Editorial Portrait', type: 'portrait', status: 'culling', loc: 'Studio 4',
    dims: [W, P, P, S, P, L, P, S, P, L] },
  { title: 'Hassan & Mariam — Engagement', type: 'event', status: 'delivered', loc: 'Islamabad',
    dims: [W, P, L, P, S, L, P, L, S, P, L] },
  { title: 'Nova Athleisure — Lookbook', type: 'commercial', status: 'shooting', loc: 'Karachi',
    dims: [W, S, P, L, S, P, L, P, S] },
  { title: 'The Pearl Residence — Listing', type: 'real_estate', status: 'delivered', loc: 'DHA Phase 6',
    dims: [W, L, L, S, L, P, L, S] },
];

async function fetchImage(seed, w, h, tries = 3) {
  const url = `https://picsum.photos/seed/${seed}/${w}/${h}`;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((res) => setTimeout(res, 600 * (i + 1)));
    }
  }
}

const insProject = db.prepare(`INSERT INTO ms_projects
  (id, workspace_id, lead_id, title, project_type, shoot_date, location, status, settings, created_by, created_at, updated_at)
  VALUES (@id,@ws,@lead,@title,@type,@shoot_date,@loc,@status,@settings,@by,@created,@created)`);
const insAsset = db.prepare(`INSERT INTO ms_assets
  (id, workspace_id, project_id, type, storage_key, filename, mime, size_bytes, width, height, variants, status, uploaded_by, created_at)
  VALUES (@id,@ws,@pid,'photo',@key,@fname,'image/jpeg',@size,@w,@h,@variants,'ready',@by,@created)`);

(async () => {
  const base = Date.now();
  let totalPhotos = 0;
  for (let si = 0; si < shoots.length; si++) {
    const s = shoots[si];
    const pid = uid();
    const projTime = base - si * 36e5; // 1h apart; index 0 newest → becomes the stage
    const shootDate = ts(projTime - 6 * 864e5).slice(0, 10);
    insProject.run({
      id: pid, ws: WS, lead: nextLead(), title: s.title, type: s.type,
      shoot_date: shootDate, loc: s.loc, status: s.status,
      settings: JSON.stringify({ demo: true }), by: CREATED_BY, created: ts(projTime),
    });
    process.stdout.write(`\n${s.title}  `);
    for (let j = 0; j < s.dims.length; j++) {
      const [w, h] = s.dims[j];
      const seed = `wf-${si}-${j}`;
      let buf;
      try { buf = await fetchImage(seed, w, h); }
      catch (e) { process.stdout.write('x'); continue; }
      const fname = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${s.type}-${j + 1}.jpg`;
      const key = `media/${fname}`;
      fs.writeFileSync(path.join(MEDIA_DIR, fname), buf);
      insAsset.run({
        id: uid(), ws: WS, pid, key, fname, size: buf.length, w, h,
        variants: JSON.stringify({ original: publicUrl(key) }),
        by: CREATED_BY, created: ts(projTime + (j + 1) * 1000), // first asset = earliest = cover
      });
      process.stdout.write('.');
      totalPhotos++;
    }
  }
  console.log(`\n\nDone. ${shoots.length} demo shoots, ${totalPhotos} photographs.`);
  console.log('Refresh the Studio home to see the stage + wall with real imagery.');
})().catch((e) => { console.error('\nFailed:', e.message); process.exit(1); });
