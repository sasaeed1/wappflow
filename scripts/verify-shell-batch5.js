'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 4 (frontend half) — VirtualList + the counts-only badge.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const vl = R('components/ui/VirtualList.js');
const leads = R('app/leads-list/page.js');
const notifs = R('components/shell/ShellNotifications.js');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };

check('VirtualList: spacers preserve scroll geometry; small lists render unchanged', () => {
  assert(/start \* rowHeight/.test(vl) && /items\.length - end\) \* rowHeight/.test(vl), 'spacer math missing');
  assert(/items\.length <= threshold/.test(vl), 'no small-list passthrough — tiny lists would pay windowing overhead');
  assert(/aria-hidden="true"/.test(vl), 'spacers must be hidden from AT');
});
check('VirtualList throttle is timers, not rAF — rAF never fires in hidden documents', () => {
  const code = strip(vl);
  assert(!/requestAnimationFrame/.test(code), 'rAF throttle silently stops updating when the document is hidden');
  assert(/setTimeout\(\(\) => \{ frame\.current = 0; measure\(\); \}, 16\)/.test(code), 'timer throttle missing');
  assert(/passive: true/.test(code), 'scroll listener should be passive');
});
check('leads list is windowed, with the row JSX passed through untouched', () => {
  assert(/<VirtualList items=\{leads\} rowHeight=\{59\}/.test(leads), 'leads list not windowed');
  assert(/renderRow=\{\(lead, i\) => \{/.test(leads), 'row must stay an inline pass-through — extraction is a later, testable step');
  assert(!/\) : leads\.map\(\(lead, i\) => \{/.test(strip(leads)), 'the unwindowed map survives');
});
check('badge polls the counts endpoint and falls back if it is not deployed yet', () => {
  const code = strip(notifs);
  assert(/api\.get\('\/notifications\/summary'\)/.test(code), 'badge does not use the counts endpoint');
  assert(/if \(await loadSummary\(\)\) return;/.test(code), 'summary is not the primary path');
  assert(/await loadPanelData\(\);/.test(code), 'no fallback — merge order could break the badge');
});
check('panel data loads lazily when the dropdown opens, not on every poll', () => {
  assert(/onClick=\{\(e\) => \{ loadPanelData\(\); p\.onClick\(e\); \}\}/.test(notifs), 'panel data not loaded on open');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
