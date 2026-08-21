'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 6 Batch 1 — stop the video subsystem lying.
//
//  Not consolidation yet: these are the defects underneath it. Three systems
//  writing one set of tables had drifted into silently dropping user choices,
//  writing undeclared enum values, and depending on module mount order.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const engine = require('./video-engine');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── the silent drop, exercised ──────────────────────────────────────────────
check('legacy transition names resolve instead of being silently dropped', () => {
  // The Story-Engine planner emits 'cut' and 'whip'; the renderer knew neither and
  // returned null for anything unrecognised, which reads as "no transition". So a
  // user who chose "whip" got a hard cut and was never told.
  assert.strictEqual(engine.resolveTransitionType('whip'), 'slide', 'whip still unrenderable');
  assert.strictEqual(engine.resolveTransitionType('dissolve'), 'crossDissolve');
  // A cut genuinely IS the absence of a transition — that one was always faithful.
  assert.strictEqual(engine.resolveTransitionType('cut'), 'none');
  // Unknown names must still resolve to null rather than inventing something.
  assert.strictEqual(engine.resolveTransitionType('nonsense'), null);
  assert.strictEqual(engine.resolveTransitionType(undefined), null);
});

check('every name the planner templates emit is renderable', () => {
  // Whatever vocabulary the template library speaks, nothing may reach the
  // renderer as an unresolvable value.
  const videoAi = read('video-ai.js');
  const emitted = new Set([...videoAi.matchAll(/slot\([^)]*'([a-zA-Z]+)'\s*\)/g)].map((m) => m[1]));
  for (const name of emitted) {
    // slot()'s last arg is the transition; motions share the capture, so only
    // assert names that are known transitions in EITHER vocabulary.
    if (['cut', 'whip', 'fade', 'dissolve'].includes(name)) {
      assert(engine.resolveTransitionType(name), `template transition "${name}" does not resolve`);
    }
  }
  assert(emitted.size > 0, 'no template slots parsed — the check would be vacuous');
});

check('a whip survives sanitizeTimeline as a real transition', () => {
  const doc = {
    aspect: '9:16', fps: 30,
    tracks: [{ id: 't1', type: 'video', clips: [
      { assetId: 'a1', start: 0, duration: 2000, transitionIn: { type: 'whip', duration: 400 } },
      { assetId: 'a2', start: 2000, duration: 2000, transitionIn: { type: 'cut', duration: 400 } },
    ] }],
  };
  const san = engine.sanitizeTimeline(doc);
  const clips = san.tracks[0].clips;
  assert.strictEqual(clips[0].transitionIn.type, 'slide', 'whip did not survive sanitisation');
  assert.strictEqual(clips[1].transitionIn, null, 'a cut should sanitise to no transition');
});

// ── one vocabulary, end to end ──────────────────────────────────────────────
check('the editor picker offers what the renderer can actually draw', () => {
  const consts = read(path.join('..', '..', 'wf-prop3-wt', 'wappflow-web', 'src', 'app', 'studio', 'video-constants.js'));
  const offered = [...consts.matchAll(/\{ id: '(\w+)', label:/g)].map((m) => m[1]);
  for (const t of engine.TRANSITIONS) {
    assert(offered.includes(t), `renderer supports "${t}" but the picker never offers it`);
  }
});

check('the Story-Engine editor speaks canonical names', () => {
  const editor = read(path.join('..', '..', 'wf-prop3-wt', 'wappflow-web', 'src', 'app', 'studio', '[id]', 'reel', '[reelId]', 'page.js'));
  const code = strip(editor);
  assert(/const TRANSITIONS = \[\s*\{ id: 'none'/.test(code), 'editor still uses bare legacy strings');
  assert(/LEGACY_TRANSITION = \{ cut: 'none', whip: 'slide', dissolve: 'crossDissolve' \}/.test(code),
    'plans saved with old spellings would show a blank select');
});

// ── ownership: who may write which table ────────────────────────────────────
check('modules that write tables they do not own assert that ownership at boot', () => {
  const reel = strip(read('reel-engine.js'));
  for (const t of ['ms_timelines', 'ms_video_exports', 'ms_jobs']) {
    assert(reel.includes(t), `reel-engine no longer references ${t} — update this check`);
  }
  assert(/must be created by media-studio before reel-engine mounts/.test(reel),
    'reel-engine still depends on mount order without saying so');
  // The pattern this copies, still in place:
  assert(/ms_albums must be created by media-studio/.test(strip(read('studio-ai.js'))), 'studio-ai lost its guard');
});

check('every table has exactly ONE DDL owner', () => {
  // The ms_albums clash was this defect with two DIFFERENT schemas. lead_channels
  // was the same shape of mistake with identical ones — harmless until the day
  // the real schema changes and the copy silently creates the old version.
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && !f.startsWith('test-'));
  const owners = {};
  for (const f of files) {
    for (const m of read(f).matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)) {
      (owners[m[1]] ||= new Set()).add(f);
    }
  }
  const dupes = Object.entries(owners).filter(([, v]) => v.size > 1)
    .map(([t, v]) => `${t}: ${[...v].join(', ')}`);
  assert.deepStrictEqual(dupes, [], 'tables declared by more than one module:\n   ' + dupes.join('\n   '));
});

check('ms_timelines.source declares every value written to it', () => {
  // Scope to the ms_timelines block — other tables also have a `source` column,
  // and matching the first one made this assert against the wrong schema.
  const ms = read('media-studio.js');
  const block = ms.slice(ms.indexOf('CREATE TABLE IF NOT EXISTS ms_timelines'));
  const declared = block.slice(0, block.indexOf(');')).match(/source TEXT DEFAULT 'manual',\s*--([^\n\r]*)/)[1];
  // reel-engine writes 'ai_reel', which the column comment did not list — so the
  // Reels list, matching only the documented values, badged it as nothing.
  for (const v of ['manual', 'template', 'ai_draft', 'ai_reel']) {
    assert(declared.includes(v), `source value "${v}" is written but undeclared`);
  }
  const writes = [...read('reel-engine.js').matchAll(/'(ai_reel|ai_draft|template|manual)'/g)].map((m) => m[1]);
  for (const w of new Set(writes)) assert(declared.includes(w), `reel-engine writes undeclared source "${w}"`);
});

check('the Reels list badges every AI-built timeline, not just one kind', () => {
  const page = read(path.join('..', '..', 'wf-prop3-wt', 'wappflow-web', 'src', 'app', 'studio', '[id]', 'video', 'page.js'));
  assert(/t\.source === 'ai_reel'/.test(page), "Auto-reel timelines still render with no badge");
  assert(/t\.source === 'ai_draft'/.test(page), 'AI draft badge lost');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
