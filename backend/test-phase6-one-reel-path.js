'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 6 (final) — one reel artifact, one editor.
//
//  Three systems generated reels and two editors edited them. The Story Engine
//  wrote its plan into ms_reel_plans in a private shape only its own editor
//  could read — an editor with no render and no export, whose own subtitle
//  promised "the render uses your existing video engine". It did not. Work put
//  in there could not leave.
//
//  Everything now produces the SAME artifact: an ms_timelines row, opened by the
//  one editor that can actually export.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const engine = require('./video-engine');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const VIDEO_AI = strip(read('video-ai.js'));
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');

check('the Story Engine writes a canonical timeline, not a private plan', () => {
  assert(/INSERT INTO ms_timelines/.test(VIDEO_AI), 'video-ai does not produce a timeline');
  assert(!/INSERT INTO ms_reel_plans/.test(VIDEO_AI), 'it still writes the private reel-plan shape');
  assert(/videoEngine\.sanitizeTimeline\(doc\)/.test(VIDEO_AI), 'the document is not validated by the engine');
});

check('it declares the ownership it depends on', () => {
  // ms_timelines belongs to media-studio; video-ai only works because that mounts first.
  assert(/ms_timelines must be created by media-studio before video-ai mounts/.test(VIDEO_AI),
    'video-ai writes a table it does not own without asserting it exists');
});

check('the dead-end editor and its routes are gone', () => {
  assert(!fs.existsSync(path.join(WEB, 'app', 'studio', '[id]', 'reel')),
    'the Story-Engine editor route still exists');
  for (const r of ["app.get('/api/video-ai/reels/:id'", "app.put('/api/video-ai/reels/:id'", "app.get('/api/video-ai/projects/:id/reels'"]) {
    assert(!VIDEO_AI.includes(r), `route still mounted: ${r}`);
  }
  const api = strip(fs.readFileSync(path.join(WEB, 'lib', 'api.js'), 'utf8'));
  for (const m of ['getReel', 'updateReel', 'reels:']) {
    assert(!api.includes(m), `client method for a deleted route survives: ${m}`);
  }
});

check('the generate action opens the ONE editor that can export', () => {
  const page = strip(fs.readFileSync(path.join(WEB, 'app', 'studio', '[id]', 'page.js'), 'utf8'));
  assert(/\/studio\/\$\{projectId\}\/video\/\$\{reel\.timeline_id \|\| reel\.reel_id\}/.test(page),
    'the reel result still links at the removed editor');
  assert(!/\/studio\/\$\{projectId\}\/reel\//.test(page), 'a link to the deleted route survives');
});

// ── the conversion itself, executed ─────────────────────────────────────────
check('a Story-Engine plan converts into a renderable timeline', () => {
  // Mirrors the route's mapping so the shape is proven, not assumed.
  const planClips = [
    { asset_id: 'a1', duration_ms: 2000, in_ms: 0, out_ms: 2000, motion: 'kenburns', transition: 'cut' },
    { asset_id: 'a2', duration_ms: 1500, in_ms: 0, out_ms: 1500, motion: 'static', transition: 'whip' },
    { asset_id: 'a3', duration_ms: 1800, in_ms: 0, out_ms: 1800, motion: 'pan', transition: 'fade' },
  ];
  const doc = {
    version: 1, aspect: '9:16', fps: 30,
    tracks: [{ id: 'v1', type: 'video', clips: planClips.map((c, i) => ({
      id: 'c' + i, assetId: c.asset_id,
      start: planClips.slice(0, i).reduce((a, x) => a + x.duration_ms, 0),
      duration: c.duration_ms, in: c.in_ms, out: c.out_ms,
      transitionIn: i === 0 ? null : { type: c.transition, duration: 400 },
      kenBurns: /kenburns|pan|zoom/i.test(c.motion) ? { fromScale: 1, toScale: 1.12, fromX: 0, toX: 0.06, fromY: 0, toY: 0 } : undefined,
    })) }],
  };
  const san = engine.sanitizeTimeline(doc);
  const clips = san.tracks[0].clips;
  assert.strictEqual(clips.length, 3, 'clips were dropped in sanitisation');
  assert.strictEqual(san.duration, 5300, 'duration should be the sum of the clips, got ' + san.duration);
  // The planner's vocabulary must survive as something the renderer can draw.
  assert.strictEqual(clips[1].transitionIn.type, 'slide', "'whip' did not resolve to a renderable transition");
  assert.strictEqual(clips[0].transitionIn, null, 'the first clip should have no transition in');
  assert(clips[0].kenBurns, 'kenburns motion was lost');
  assert(san.width > 0 && san.height > 0, 'no dimensions were computed');
});

check('every reel path now produces the same artifact', () => {
  // video-ai (story), reel-engine (auto-reel), media-studio (templates/AI drafts).
  for (const [f, label] of [['video-ai.js', 'Story Engine'], ['reel-engine.js', 'Auto-reel'], ['media-studio.js', 'templates/AI drafts']]) {
    assert(/INSERT INTO ms_timelines/.test(strip(read(f))), `${label} does not write ms_timelines`);
  }
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
