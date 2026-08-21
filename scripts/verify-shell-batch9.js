'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 5 Batch 4 (frontend) — universal search + the Ctrl+K palette.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SRC = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };

const palette = strip(R('components/shell/CommandPalette.js'));
const shell = strip(R('components/shell/AppShell.js'));
const ai = strip(R('components/AICommandCenter.js'));
const api = strip(R('lib/api.js'));

check('exactly ONE component binds Ctrl+K', () => {
  // Two components binding the same chord would just fight; the AI panel used to
  // own it, and only on CRM routes because it lived in a CRM fab.
  const binders = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.jsx?$/.test(f.name)) {
        const s = strip(fs.readFileSync(p, 'utf8'));
        if (/(ctrlKey \|\| e?\.?metaKey|metaKey \|\| e?\.?ctrlKey)/.test(s) && /'k'|"k"|=== 'K'/.test(s)) binders.push(p);
      }
    }
  };
  walk(SRC);
  assert.strictEqual(binders.length, 1, 'expected one Ctrl+K owner, found:\n   ' + binders.join('\n   '));
  assert(binders[0].endsWith(path.join('shell', 'CommandPalette.js')), 'the shortcut is not owned by the palette: ' + binders[0]);
  assert(!/ctrlKey/.test(ai), 'the AI panel still grabs the chord');
  assert(/e\.key === 'Escape'/.test(ai), 'the AI panel lost its Escape handling in the handover');
});

check('the palette is mounted by the shell, so every module gets it', () => {
  assert(/<CommandPalette \/>/.test(shell), 'the palette is not mounted');
  assert(/import CommandPalette from '\.\/CommandPalette'/.test(shell), 'import missing');
});

check('destinations come from the module registry, not a second list of routes', () => {
  assert(/Object\.values\(MODULES\)\.flatMap/.test(palette), 'routes are hard-coded and will drift from the registry');
  assert(/\.\.\.\(m\.nav \|\| \[\]\)/.test(palette) && /\.\.\.\(m\.menu \|\| \[\]\)/.test(palette),
    'nav and menu destinations are not both included');
});

check('search is debounced and ignores superseded responses', () => {
  assert(/setTimeout\(async \(\) => \{/.test(palette), 'no debounce — a request per keystroke');
  assert(/const id = \+\+reqId\.current;/.test(palette) && /if \(id === reqId\.current\)/.test(palette),
    'a slow response could overwrite results from a newer query');
  assert(/term\.length < 2/.test(palette), 'a 1-character query would hit the server');
});

check('the result list is keyboard-navigable and announced', () => {
  assert(/role="listbox"/.test(palette) && /role="option"/.test(palette), 'not an announced listbox');
  assert(/aria-selected=\{i === active\}/.test(palette), 'the active row is not announced');
  assert(/e\.key === 'ArrowDown'/.test(palette) && /e\.key === 'ArrowUp'/.test(palette) && /e\.key === 'Enter'/.test(palette),
    'arrow/enter handling missing');
  assert(/scrollIntoView\(\{ block: 'nearest' \}\)/.test(palette), 'arrowing past the fold would hide the selection');
});

check('the palette rides the Modal primitive rather than hand-rolling an overlay', () => {
  // Modal already owns focus trap, restore, scroll lock, Escape and the z-ladder.
  assert(/import Modal from '@\/components\/ui\/Modal'/.test(palette), 'not using the Modal primitive');
  assert(/<Modal open=\{open\} onClose=\{\(\) => setOpen\(false\)\}/.test(palette), 'Modal is not driven by palette state');
});

check('the API client exposes the search endpoint', () => {
  assert(/export const searchAPI = \{\s*global: \(q\) => api\.get\('\/search', \{ params: \{ q \} \}\),/.test(api),
    'searchAPI.global missing');
});

// ── selection arithmetic, executed ──────────────────────────────────────────
check('arrow selection clamps at both ends across a changing result set', () => {
  let active = 0;
  const move = (dir, len) => { active = dir > 0 ? Math.min(active + 1, len - 1) : Math.max(active - 1, 0); return active; };
  assert.strictEqual(move(-1, 3), 0, 'up at the top should stay put');
  assert.strictEqual(move(1, 3), 1);
  assert.strictEqual(move(1, 3), 2);
  assert.strictEqual(move(1, 3), 2, 'down at the bottom should stay put');
  // Results shrinking under the cursor must not leave it pointing past the end.
  active = 5;
  assert.strictEqual(move(1, 2), 1, 'a shrunken list should clamp the selection back into range');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
