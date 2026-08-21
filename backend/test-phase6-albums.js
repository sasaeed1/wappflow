'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 6 Batch 2 — one album model.
//
//  The AI generator wrote its layout into ms_albums.spec and created no page
//  rows, while every reader downstream (list, editor, PDF worker) looks at
//  ms_album_pages. So a generated album listed as "0 pages", opened empty, and
//  exported a BLANK PDF. The conversion and the backfill decide what a paying
//  client receives, so both run for real here.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const model = require('./album-model');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

check('a page never claims more slots than its layout can hold', () => {
  for (const [layout, cap] of Object.entries(model.ALBUM_LAYOUTS)) {
    assert(cap >= 1 && cap <= 4, `layout ${layout} has an impossible capacity`);
  }
  for (const n of [1, 2, 3, 4]) {
    const l = model.layoutFor(n);
    assert(model.ALBUM_LAYOUTS[l] >= n, `layoutFor(${n}) picked ${l}, which holds only ${model.ALBUM_LAYOUTS[l]}`);
  }
  assert.strictEqual(model.layoutFor(9), 'grid4', 'oversized pages must clamp to the largest real layout');
});

check('no image is ever dropped, whatever the spread size', () => {
  // The generator emitted grid-N where N could exceed 4 (more photos than
  // spreads), a layout that exists in no renderer — those images had nowhere to go.
  const ids = Array.from({ length: 23 }, (_, i) => `a${i}`);
  const pages = model.pagesFromAssetIds(ids);
  const placed = pages.flatMap((p) => p.slots.map((s) => s.asset_id));
  assert.deepStrictEqual(placed, ids, 'assets lost or reordered during pagination');
  for (const p of pages) {
    assert(p.slots.length <= model.ALBUM_LAYOUTS[p.layout_template], `page overfilled: ${p.layout_template} with ${p.slots.length}`);
  }
});

check('legacy spreads convert without losing images, splitting oversized ones', () => {
  const spreads = [
    { layout: 'grid-1', asset_ids: ['a'] },
    { layout: 'grid-3', asset_ids: ['b', 'c', 'd'] },
    { layout: 'grid-8', asset_ids: ['e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'] }, // unrenderable
    { layout: 'grid-2', asset_ids: [] },                                        // empty
  ];
  const pages = model.pagesFromSpreads(spreads);
  const placed = pages.flatMap((p) => p.slots.map((s) => s.asset_id));
  assert.deepStrictEqual(placed, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l'], 'images lost in conversion');
  assert.strictEqual(pages[0].layout_template, 'single');
  assert.strictEqual(pages[1].layout_template, 'three');
  assert(pages.length >= 4, 'the 8-image spread should have become multiple pages');
  for (const p of pages) assert(p.slots.length > 0, 'an empty page was produced');
});

check('conversion is stable — running it twice gives the same pages', () => {
  const spreads = [{ layout: 'grid-4', asset_ids: ['a', 'b', 'c', 'd'] }];
  assert.deepStrictEqual(model.pagesFromSpreads(spreads), model.pagesFromSpreads(spreads));
});

// ── the backfill, run against a real database ───────────────────────────────
check('the backfill repairs stranded albums and touches nothing else', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE ms_albums (id TEXT PRIMARY KEY, spec TEXT);
    CREATE TABLE ms_album_pages (id TEXT PRIMARY KEY, album_id TEXT, page_no INTEGER, layout_template TEXT, slots TEXT);
    INSERT INTO ms_albums VALUES
      ('stranded', '{"pages":30,"spreads":[{"layout":"grid-2","asset_ids":["x","y"]},{"layout":"grid-1","asset_ids":["z"]}]}'),
      ('already-built', '{"pages":10,"spreads":[{"layout":"grid-1","asset_ids":["q"]}]}'),
      ('hand-made', '{}'),
      ('junk-spec', '{spreads: not json');
    INSERT INTO ms_album_pages VALUES ('p0', 'already-built', 0, 'single', '[{"asset_id":"original"}]');
  `);

  const runBackfill = () => {
    const stranded = db.prepare(`
      SELECT a.id, a.spec FROM ms_albums a
      WHERE NOT EXISTS (SELECT 1 FROM ms_album_pages p WHERE p.album_id = a.id)
        AND a.spec IS NOT NULL AND a.spec != '' AND a.spec LIKE '%spreads%'
    `).all();
    let repaired = 0, n = 0;
    const ins = db.prepare('INSERT INTO ms_album_pages (id, album_id, page_no, layout_template, slots) VALUES (?,?,?,?,?)');
    for (const a of stranded) {
      let spec = {}; try { spec = JSON.parse(a.spec); } catch { continue; }
      const pages = model.pagesFromSpreads(spec.spreads);
      if (!pages.length) continue;
      pages.forEach((pg, i) => ins.run(`bf${n++}`, a.id, i, pg.layout_template, JSON.stringify(pg.slots)));
      repaired++;
    }
    return repaired;
  };

  assert.strictEqual(runBackfill(), 1, 'expected exactly the stranded album to be repaired');
  const pages = db.prepare('SELECT * FROM ms_album_pages WHERE album_id = ? ORDER BY page_no').all('stranded');
  assert.strictEqual(pages.length, 2, 'stranded album did not get its pages');
  assert.deepStrictEqual(JSON.parse(pages[0].slots), [{ asset_id: 'x' }, { asset_id: 'y' }]);
  assert.strictEqual(pages[0].layout_template, 'two-h');

  // An album someone already built by hand must not be touched.
  const built = db.prepare('SELECT * FROM ms_album_pages WHERE album_id = ?').all('already-built');
  assert.strictEqual(built.length, 1, 'the backfill added pages to an album that already had them');
  assert.strictEqual(JSON.parse(built[0].slots)[0].asset_id, 'original', 'existing page content was overwritten');

  // Idempotent: a second run must be a no-op.
  assert.strictEqual(runBackfill(), 0, 'the backfill is not idempotent — it would duplicate pages on every boot');
  assert.strictEqual(db.prepare('SELECT COUNT(*) c FROM ms_album_pages').get().c, 3, 'page count changed on re-run');
  db.close();
});

// ── the consolidation itself ────────────────────────────────────────────────
check('there is ONE album page model, shared by both modules', () => {
  const ms = strip(read('media-studio.js'));
  const sai = strip(read('studio-ai.js'));
  assert(/require\('\.\/album-model'\)/.test(ms), 'media-studio still defines its own layouts');
  assert(!/const ALBUM_LAYOUTS = \{ single: 1/.test(ms), 'the duplicate layout table survives');
  assert(/require\('\.\/album-model'\)/.test(sai), 'studio-ai does not use the shared model');
});

check('the generator writes real pages, not just a spec blob', () => {
  const sai = strip(read('studio-ai.js'));
  assert(/albumModel\.pagesFromSpreads\(spreads\)/.test(sai), 'generator does not build pages');
  assert(/INSERT INTO ms_album_pages/.test(sai), 'generator writes no page rows — blank PDFs return');
  assert(/db\.transaction\(/.test(sai), 'album and its pages must be written atomically');
});

check('the second album editor and its routes are gone', () => {
  const sai = read('studio-ai.js');
  assert(!/app\.get\('\/api\/studio-ai\/albums\/:id'/.test(sai), 'dead album read route survives');
  assert(!/app\.put\('\/api\/studio-ai\/albums\/:id'/.test(sai), 'dead album update route survives');
  assert(!/app\.get\('\/api\/studio-ai\/projects\/:id\/albums'/.test(sai), 'dead album list route survives');
  // Generation must remain — it is the feature, and it now feeds the real model.
  assert(/app\.post\('\/api\/studio-ai\/projects\/:id\/album'/.test(sai), 'album generation was removed by mistake');

  const web = path.join(__dirname, '..', '..', 'wf-prop3-wt', 'wappflow-web', 'src');
  assert(!fs.existsSync(path.join(web, 'app', 'studio', '[id]', 'album')), 'the duplicate editor route still exists');
  const api = read(path.join('..', '..', 'wf-prop3-wt', 'wappflow-web', 'src', 'lib', 'api.js'));
  assert(!/getAlbum: \(albumId\) => api\.get\(`\/studio-ai\/albums/.test(api), 'dead API method survives');
  const page = read(path.join('..', '..', 'wf-prop3-wt', 'wappflow-web', 'src', 'app', 'studio', '[id]', 'page.js'));
  assert(/\/studio\/\$\{projectId\}\/albums\/\$\{albumId\}/.test(page), 'the AI panel still links to the retired editor');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
