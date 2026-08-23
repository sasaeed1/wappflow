'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 6 Batch 5 — shrink the AI surface to what is actually wired up.
//
//  Seven backend AI endpoints had no caller anywhere: two were duplicates of
//  routes the app really uses, the rest were built and never connected. Dead
//  endpoints are not free — they are authenticated attack surface, they make the
//  API look larger than it is, and they mislead the next person into thinking a
//  feature exists.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const read = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const webFile = (...p) => fs.readFileSync(path.join(WEB, ...p), 'utf8');

const SERVER = strip(read('server.js'));
const STUDIO_AI = strip(read('studio-ai.js'));
const VIDEO_AI = strip(read('video-ai.js'));
const API = strip(webFile('lib', 'api.js'));

check('the seven unreferenced AI endpoints are gone', () => {
  const gone = [
    [SERVER, "app.post('/api/ai/sentiment'", 'POST /api/ai/sentiment'],
    [SERVER, "app.post('/api/ai/industry-detect'", 'POST /api/ai/industry-detect'],
    [STUDIO_AI, "app.get('/api/studio-ai/portfolio-picks'", 'GET /studio-ai/portfolio-picks'],
    [STUDIO_AI, "app.post('/api/studio-ai/assets/:id/auto-edit'", 'POST /studio-ai/assets/:id/auto-edit'],
    [VIDEO_AI, "app.get('/api/video-ai/templates'", 'GET /video-ai/templates'],
    [VIDEO_AI, "app.post('/api/video-ai/templates'", 'POST /video-ai/templates'],
    [VIDEO_AI, "app.post('/api/video-ai/projects/:id/cull'", 'POST /video-ai/.../cull'],
    [VIDEO_AI, "app.post('/api/video-ai/projects/:id/story'", 'POST /video-ai/.../story'],
  ];
  for (const [src, marker, label] of gone) assert(!src.includes(marker), `${label} is back`);
});

check('the routes those DUPLICATED still exist — the capability was never removed', () => {
  // industry-detect duplicated a live route the lead page actually calls, and
  // studio-ai's auto-edit duplicated media-studio's. Removing a duplicate must
  // not remove the feature.
  assert(/app\.get\('\/api\/leads\/:id\/industry'/.test(SERVER), 'the live industry route went with its duplicate');
  assert(/auto-edit/.test(strip(read('media-studio.js'))), 'the live auto-edit route went with its duplicate');
  assert(/autoEdit:\s+\(projectId, body\) => api\.post\(`\/media\/projects\/\$\{projectId\}\/auto-edit`/.test(API),
    'the surviving auto-edit client method was removed by mistake');
});

check('endpoints that ARE wired up survived', () => {
  assert(/app\.post\('\/api\/video-ai\/projects\/:id\/reel'/.test(VIDEO_AI), 'reel generation removed — it has a caller');
  // The reel EDITOR routes were removed on purpose in the reel consolidation:
  // the Story Engine now writes a canonical ms_timelines row opened by the one
  // editor that can export, so its private plan store and editor are gone.
  assert(!/app\.(get|put)\('\/api\/video-ai\/reels\/:id'/.test(VIDEO_AI),
    'the dead-end reel editor routes are back');
  assert(/app\.post\('\/api\/ai\/command'/.test(SERVER), 'the AI command endpoint was removed');
  assert(/app\.post\('\/api\/studio-ai\/projects\/:id\/album'/.test(STUDIO_AI), 'album generation was removed');
});

check('the dead client methods went with their endpoints', () => {
  for (const m of ['/ai/sentiment', 'portfolioPicks', "'/video-ai/templates'"]) {
    assert(!API.includes(m), `a client method for a deleted endpoint survives: ${m}`);
  }
  // Match the exact removed paths, not the bare words: media-studio has its own
  // LIVE /media/assets/:id/cull, and matching on "/cull" flags that as dead.
  assert(!/video-ai\/projects\/\$\{id\}\/(cull|story)/.test(API), 'a video-ai cull/story client method survives');
  assert(/media\/assets\/\$\{id\}\/cull/.test(API), 'the live media-studio cull method was removed by mistake');
  // The seeded template library is still READ when generating a reel, so it stays.
  assert(/ms_template_library/.test(VIDEO_AI), 'the template library was removed, but reel generation still reads it');
});

check('no frontend code calls anything that no longer exists', () => {
  const dead = ['aiAPI.sentiment', 'studioAiAPI.portfolioPicks', 'studioAiAPI.autoEdit',
                'videoAiAPI.templates', 'videoAiAPI.createTemplate', 'videoAiAPI.cull', 'videoAiAPI.story'];
  const offenders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) { walk(p); continue; }
      if (!/\.jsx?$/.test(f.name)) continue;
      const s = strip(fs.readFileSync(p, 'utf8'));
      for (const d of dead) if (s.includes(d + '(')) offenders.push(`${p} → ${d}`);
    }
  };
  walk(WEB);
  assert.deepStrictEqual(offenders, [], 'calls to removed methods:\n   ' + offenders.join('\n   '));
});

check('AI results distinguish success from failure', () => {
  // Both used to render in the same neutral grey box, so "Scored 45/50 photos."
  // and "Analyze failed." were typographically identical.
  const page = strip(webFile('app', 'studio', '[id]', 'page.js'));
  assert(/setNote\(\{ ok: false, msg:/.test(page), 'failures do not carry a tone');
  assert(/setNote\(\{ ok: true, msg:/.test(page), 'successes do not carry a tone');
  assert(/note\.ok \? 'status' : 'alert'/.test(page), 'failures are not announced to assistive tech');
  assert(/note\.ok \? 'var\(--ms-line[^)]*\)' : 'var\(--danger-bg/.test(page), 'failure is not visually distinct');
  assert(!/setNote\('/.test(page), 'a bare-string note survives and would render without a tone');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
