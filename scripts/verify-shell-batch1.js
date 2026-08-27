'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 2 (One Shell) Batch 1 verification — BOOT-FREE static checks.
//  One shell mounted from a layout; the two overlay primitives the shell needs;
//  in-app module switching; one session read and a logout that keeps preferences.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');

const dropdown = R('components/ui/Dropdown.js');
const drawer = R('components/ui/Drawer.js');
const shell = R('components/shell/AppShell.js');
const switcher = R('components/shell/ModuleSwitcher.js');
const session = R('components/shell/session.js');
const modules = R('components/shell/modules.js');
const css = R('app/globals.css');
const layout = R('app/contracts/layout.js');

const CONTRACTS = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f === 'page.js') CONTRACTS.push([path.relative(WEB, p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8')]);
  }
})(path.join(WEB, 'app', 'contracts'));

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── The two primitives the shell needed and PROP-002 lacked ──────────────────
check('Dropdown rides overlay hooks, the z-ladder, and has real menu a11y', () => {
  assert(/useOverlayStack/.test(dropdown) && /useEscape/.test(dropdown), 'not on the shared overlay hooks');
  assert(/role="menu"/.test(dropdown) && /aria-haspopup/.test(dropdown) && /aria-expanded/.test(dropdown));
  assert(/var\(--z-dropdown\)/.test(dropdown), 'not on the ladder');
  assert(!/z-?[iI]ndex:\s*\d/.test(strip(dropdown)), 'hardcoded z-index');
});
check('Drawer closes the Batch C debt: focus trap + Escape + scroll lock', () => {
  for (const h of ['useFocusTrap', 'useScrollLock', 'useEscape', 'useOverlayStack', 'Portal'])
    assert(dropdown.includes(h) || drawer.includes(h), 'Drawer missing ' + h);
  assert(/role="dialog"/.test(drawer) && /aria-modal="true"/.test(drawer));
  assert(/var\(--z-overlay\)/.test(drawer), 'drawer must sit below --z-modal');
});

// ── One shell, mounted once ──────────────────────────────────────────────────
check('Contracts mounts the shell from its LAYOUT, not from each page', () => {
  assert(/<AppShell module="contracts">/.test(layout), 'layout does not mount AppShell');
  for (const [name, s] of CONTRACTS)
    assert(!/ContractsStudioShell/.test(s), name + ' still wraps itself in the old shell');
});
check('shell height is a token — three shells used to hardcode 60/58/58', () => {
  assert(/--shell-h:\s*58px/.test(css), '--shell-h not defined');
  assert(/height: 'var\(--shell-h\)'/.test(shell), 'shell does not consume its own token');
});
check('shell sits on the z-ladder and keeps the load-bearing .wf-page class', () => {
  assert(/zIndex: 'var\(--z-sticky\)'/.test(shell), 'shell not on --z-sticky');
  assert(/'wf-page'/.test(shell), '.wf-page dropped — mobile rules in globals.css key off it');
  assert(!/z-?[iI]ndex:\s*\d/.test(strip(shell)), 'hardcoded z-index in shell');
});
check('active state is derived from the route, with prefix support', () => {
  assert(/export function isNavActive/.test(modules), 'no shared active-state rule');
  assert(/pathname\.startsWith\(item\.href \+ '\/'\)/.test(modules), 'no prefix matching');
  assert(/aria-current=\{active \? 'page' : undefined\}/.test(shell), 'active state not exposed to AT');
});

// ── The audit's root cause: new-tab module switching ─────────────────────────
check('internal module switching is IN-APP — no _blank on CRM/Studio/Contracts', () => {
  // strip comments first: the header comment QUOTES target="_blank" as the thing removed
  const code = strip(switcher);
  const marker = code.indexOf('href={FLUX_PARKED');
  assert(marker !== -1, 'Flux link not found');
  assert(!/target="_blank"/.test(code.slice(0, marker)), 'an internal module still opens a new tab');
  // Client-side navigation, by whichever mechanism. This used to demand
  // `router.push(m.home)` literally, and broke when the items became <Link
  // href={m.home}> — which is still client-side AND additionally gives the
  // browser a real href, so ⌘/Ctrl-click and "Open in new tab" finally work.
  const internal = code.slice(0, marker);
  assert(/router\.push\(m\.home\)/.test(internal) || /<Link[\s\S]{0,200}href=\{m\.home\}/.test(internal),
    'module switching is neither a router.push nor a Link — it may be a full page load');
  // Flux is genuinely external and parked — the one legitimate _blank
  assert(/target="_blank"/.test(code.slice(marker)), 'Flux link changed unexpectedly');
});
check('module registry is the single source of nav (was duplicated per shell)', () => {
  for (const k of ['crm:', 'studio:', 'contracts:']) assert(modules.includes(k), 'missing module ' + k);
  assert(/dialectClass: 'ms-root'/.test(modules), 'Studio dialect scope lost — D8 requires it');
  assert(/label: 'Communications'/.test(modules), 'comms-4 rename not applied');
});

// ── Session: one read, one correct logout, one guard ─────────────────────────
check('sign-out removes session keys only — no localStorage.clear()', () => {
  // strip comments: the rationale comment names localStorage.clear() as the old bug
  assert(!/localStorage\.clear\(\)/.test(strip(session)), 'clear() wipes theme/ms-theme preferences');
  assert(/SESSION_KEYS = \['token', 'user', 'workspace', 'wf_persist'\]/.test(session), 'session key list changed');
  assert(/removeItem/.test(session), 'not removing scoped keys');
});
check('auth guard is shell-level and always carries ?next=', () => {
  assert(/export function useAuthGuard/.test(session), 'no shared guard');
  assert(/login\?next=\$\{encodeURIComponent\(next\)\}/.test(session), 'guard drops the return path');
  assert(/useAuthGuard\(\)/.test(shell), 'shell does not guard');
});
// Superseded by Batch 3, which migrated the last module and removed all four old
// chrome components. The guard's original assertion (they must still exist) is now
// inverted: nothing may reference them, and they must be gone.
check('all four legacy shells are deleted and nothing references them', () => {
  for (const f of ['NavBar.js', 'StudioShell.js', 'ContractsStudioShell.js', 'AppSwitcher.js'])
    assert(!fs.existsSync(path.join(WEB, 'components', f)), f + ' still on disk');
  const offenders = [];
  (function walk(d) {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js') && /from ['"][^'"]*components\/(NavBar|StudioShell|ContractsStudioShell|AppSwitcher)['"]/.test(fs.readFileSync(p, 'utf8')))
        offenders.push(path.relative(WEB, p));
    }
  })(WEB);
  assert(offenders.length === 0, 'still importing a deleted shell: ' + offenders.join(', '));
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
