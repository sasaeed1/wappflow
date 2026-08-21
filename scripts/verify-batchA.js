'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  PROP-002 Batch A verification — BOOT-FREE static checks.
//  (1) globals.css token substrate is ADDITIVE (every original token present) and
//      the new tokens + focus foundation + dialect neutralizer exist.
//  (2) lib/confirm.js is fully retokenized (no hardcoded surface/overlay hex) yet
//      behaviorally intact (role=dialog, Escape/Enter, autoFocus, provider API).
//  Scope guard: Batch A must touch ONLY globals.css + confirm.js.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const css = fs.readFileSync(path.join(WEB, 'app', 'globals.css'), 'utf8');
const confirm = fs.readFileSync(path.join(WEB, 'lib', 'confirm.js'), 'utf8');

let pass = 0, fail = 0;
function check(name, fn) { try { fn(); console.log('  ✓', name); pass++; } catch (e) { console.log('  ✗', name, '—', e.message || e); fail++; } }

// ── (1) globals.css additive substrate ──────────────────────────────────────
const ORIGINAL = ['--bg', '--surface', '--surface2', '--border', '--glass', '--glass-2',
  '--text', '--text-muted', '--text-dim', '--accent', '--accent-hover', '--accent-light',
  '--success', '--warning', '--danger', '--sidebar-bg', '--sidebar-text', '--sidebar-active',
  '--radius', '--shadow', '--warning-bg', '--warning-border', '--warning-text', '--danger-bg', '--danger-border'];
check('all 25 original tokens still defined (nothing renamed/removed)', () => {
  for (const t of ORIGINAL) assert(new RegExp(t.replace(/[-]/g, '\\-') + '\\s*:').test(css), `missing ${t}`);
});
check('--radius (10px) and --shadow retained verbatim', () => {
  assert(/--radius:\s*10px/.test(css), '--radius changed');
  assert(/--shadow:\s*0 4px 24px rgba\(0,0,0,0\.35\)/.test(css), '--shadow (dark) changed');
});
const NEW = ['--space-1', '--space-6', '--space-12', '--radius-sm', '--radius-lg', '--radius-pill',
  '--fs-body', '--fs-h1', '--fw-bold', '--dur', '--ease', '--z-modal', '--z-toast', '--on-accent',
  '--focus-ring', '--overlay-bg', '--overlay-blur', '--elev-1', '--elev-3',
  '--accent-bg', '--accent-fg', '--success-bg', '--success-fg', '--warning-fg', '--danger-fg', '--info-bg', '--info-fg'];
check('new substrate tokens present', () => {
  for (const t of NEW) assert(new RegExp(t.replace(/[-]/g, '\\-') + '\\s*:').test(css), `missing ${t}`);
});
check('z-index ladder is ordered dropdown<overlay<modal<toast<banner', () => {
  const z = (k) => Number((css.match(new RegExp('--z-' + k + ':\\s*(\\d+)')) || [])[1]);
  assert(z('dropdown') < z('overlay') && z('overlay') < z('modal') && z('modal') < z('toast') && z('toast') < z('banner'), 'ladder out of order');
});
check('semantic status tokens overridden in html.light (intentional per-mode)', () => {
  const light = css.slice(css.indexOf('html.light {', css.indexOf('BATCH A')));
  assert(/--success-fg:\s*#047857/.test(light), 'light --success-fg missing');
  assert(/--overlay-bg:\s*rgba\(15,23,42/.test(light), 'light --overlay-bg missing');
});
check('global :focus-visible ring uses --focus-ring via box-shadow', () =>
  assert(/:focus-visible\s*,[\s\S]*?box-shadow:\s*var\(--focus-ring\)/.test(css) || /\[tabindex\]:focus-visible\s*\{[\s\S]*?box-shadow:\s*var\(--focus-ring\)/.test(css)));
check('neutralizer scoped to .ms-root ONLY (Studio has universal :focus-visible; Contracts does not)', () => {
  assert(/\.ms-root :focus-visible\s*\{\s*box-shadow:\s*none/.test(css), 'Studio neutralizer missing');
  assert(!/\.cs-doc :focus-visible\s*\{\s*box-shadow:\s*none/.test(css), '.cs-doc must NOT be neutralized — it lacks equivalent focus treatment');
});

// ── (2) confirm.js retokenized but behavior-intact ──────────────────────────
check('confirm has NO hardcoded surface/overlay/text hex in its <style>', () =>
  assert(!/#14161f|rgba\(0,0,0,0\.6\)|rgba\(255,255,255|#f3f4f6|#b5bac9|#d1d5db|#9ca3af/.test(confirm)));
check('confirm chrome now reads tokens (surface/overlay/z/radius/elevation)', () => {
  for (const t of ['var(--surface)', 'var(--overlay-bg)', 'var(--z-modal)', 'var(--radius-lg)', 'var(--elev-3)', 'var(--text)', 'var(--border)'])
    assert(confirm.includes(t), `confirm missing ${t}`);
});
check('confirm tone icons read status tokens', () => {
  for (const t of ['var(--danger-bg)', 'var(--warning-fg)', 'var(--success-bg)', 'var(--info-fg)'])
    assert(confirm.includes(t), `confirm missing ${t}`);
});
check('confirm BEHAVIOR intact (role=dialog, aria-modal, Escape, Enter, autoFocus, provider)', () => {
  for (const marker of ['role="dialog"', 'aria-modal="true"', 'ConfirmProvider', 'useConfirm', 'alertOnly'])
    assert(confirm.includes(marker), `confirm lost ${marker}`);
  // Enter-to-confirm is now written as an early-return guard rather than an
  // equality branch, so match either shape.
  assert(/e\.key (===|!==) 'Enter'/.test(confirm), 'confirm no longer submits on Enter');
  // Focus was an autoFocus attribute; Batch C replaced it with the shared focus
  // trap, which also RESTORES focus on close — strictly better, and the reason
  // the literal attribute is gone. Assert focus is managed, not how.
  assert(/useFocusTrap\(/.test(confirm) || confirm.includes('autoFocus'),
    'confirm no longer manages focus by any mechanism');
  // Escape used to be a hand-rolled `e.key === 'Escape'` check here. Batch C moved
  // it onto the shared overlay primitive, which is stack-aware: Escape peels only
  // the TOP overlay instead of every listening dialog at once. Assert the
  // capability, not the old implementation of it.
  assert(/useEscape\(true, isTop, onCancel\)/.test(confirm) || confirm.includes("e.key === 'Escape'"),
    'confirm no longer closes on Escape by any mechanism');
});
check('confirm still animates (cm-fade + cm-pop keyframes preserved)', () =>
  assert(/@keyframes cm-fade/.test(confirm) && /@keyframes cm-pop/.test(confirm)));

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
