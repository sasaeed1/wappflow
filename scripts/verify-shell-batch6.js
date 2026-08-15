'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 4 (frontend half, part 2) — server-side saved views + one-call bulk
//  status, each with a 404 fallback because the backend ships on the
//  phase-3 branch: merge order must not break either feature in either direction.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const api = R('lib/api.js');
const leads = strip(R('app/leads-list/page.js'));

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };

check('api client exposes viewsAPI (list/save/remove) and leadsAPI.bulkStatus', () => {
  assert(/export const viewsAPI = \{/.test(api), 'viewsAPI missing');
  assert(/list: \(entity = 'leads'\) => api\.get\('\/views'/.test(api), 'viewsAPI.list missing');
  assert(/save: \(entity, name, filters\) => api\.post\('\/views'/.test(api), 'viewsAPI.save missing');
  assert(/remove: \(id\) => api\.delete\(`\/views\/\$\{id\}`\)/.test(api), 'viewsAPI.remove missing');
  assert(/bulkStatus: \(lead_ids, status\) => api\.post\('\/leads\/bulk-status'/.test(api), 'bulkStatus missing');
});

check('views load server-first with a localStorage fallback', () => {
  assert(/await viewsAPI\.list\('leads'\)/.test(leads), 'views are not loaded from the server');
  assert(/setViews\(readViews\(\)\)/.test(leads), 'no localStorage fallback — the badge-endpoint lesson forgotten');
  assert(!/^\s*setViews\(readViews\(\)\);\s*$\n\s*fetchAll/m.test(leads), 'localStorage is still the PRIMARY path');
});

check('legacy views migrate entry-by-entry, comparing TRIMMED names', () => {
  // All-or-nothing key removal let retained copies of imported views clobber
  // later server edits and resurrect deleted views; raw-name comparison let
  // " Hot " upsert over the server's "Hot" (adversarial review findings).
  assert(/if \(remaining\.length\) writeViews\(remaining\); else localStorage\.removeItem\(VIEWS_KEY\)/.test(leads),
    'migration is not pruned per-entry — imported copies linger and resurrect');
  assert(/const name = viewName\(lv\.name\);/.test(leads), 'legacy names not normalized before comparing');
  assert(/if \(!name \|\| have\.has\(name\)\) continue;/.test(leads), 'server copy does not win over a stale local twin');
});

check('view names are trimmed and capped client-side, mirroring the backend', () => {
  assert(/const VIEW_NAME_MAX = 60;/.test(leads), 'no client-side cap — 61-char names would 400 and strand the view');
  assert(/\.trim\(\)\.slice\(0, VIEW_NAME_MAX\)/.test(leads), 'viewName does not trim + cap');
});

check('view save falls back per-browser ONLY on 404; other failures are surfaced', () => {
  assert(/await viewsAPI\.save\('leads', name, currentFilters\(\)\)/.test(leads), 'save does not hit the server');
  assert(/showToast\('Could not save the view — please retry', 'error'\); return;/.test(leads),
    'a rejected save would still claim success and silently strand the view');
  const idx = leads.indexOf("viewsAPI.save('leads', name, currentFilters())");
  const gate = leads.indexOf("err?.response?.status !== 404", idx);
  assert(idx !== -1 && gate > idx, 'save fallback is not gated on 404');
});

check('view delete keeps the chip and reports when the server refuses', () => {
  assert(/showToast\('Could not delete the view — please retry', 'error'\); return;/.test(leads),
    'a failed delete would hide the chip and let the view resurrect silently');
  assert(/const legacy = readViews\(\)\.filter\(x => viewName\(x\.name\) !== v\.name\);/.test(leads),
    'deleted views can resurrect from their legacy localStorage twin');
  assert(/writeViews\(next\)/.test(leads), 'fallback writes vanished — offline behaviour would silently regress');
});

check('Move-to-stage is ONE bulk call; the per-lead loop survives only as the 404 fallback', () => {
  assert(/await leadsAPI\.bulkStatus\(ids, status\)/.test(leads), 'bulk endpoint unused');
  const loop = /for \(const id of ids\) \{ try \{ await leadsAPI\.updateStatus\(id, \{ status \}\) ?; \} catch \{\} \}/;
  assert(loop.test(leads), 'legacy fallback loop removed — a 404 from an undeployed backend would strand the feature');
  const idx = leads.indexOf('bulkStatus(ids, status)');
  assert(idx !== -1 && leads.indexOf("err?.response?.status !== 404", idx) > idx, 'fallback is not gated on 404');
});

check('bulk failure is reported honestly instead of claiming success', () => {
  assert(/showToast\('Could not move leads — please retry', 'error'\); return;/.test(leads),
    'a failed bulk move would still show the success toast and update local state');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
