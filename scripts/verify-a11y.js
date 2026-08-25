'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Accessibility regression guard.
//
//  Runs the audit and fails if any of the CLOSED categories reopens, or if the
//  two open ones get worse. Budgets rather than zero for those two, because they
//  are genuinely unfinished and pretending otherwise would either block every
//  commit or force somebody to paste in a wrong label to make a number go down.
//
//  Lower these numbers as the work is done. Never raise them.
// ════════════════════════════════════════════════════════════════════════════
const { execFileSync } = require('child_process');
const path = require('path');
const assert = require('assert');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };

const out = execFileSync(process.execPath, [path.join(__dirname, 'a11y-audit.js'), '--json'], { encoding: 'utf8', maxBuffer: 1 << 24 });
const { findings } = JSON.parse(out);

// ── Closed. These must stay at zero. ────────────────────────────────────────
check('every control has an accessible name', () => {
  assert.strictEqual(findings.unnamed.length, 0,
    `${findings.unnamed.length} control(s) announce as just "button":\n   ` +
    findings.unnamed.slice(0, 8).map((f) => `${f.file}:${f.line}`).join('\n   '));
});

check('everything clickable is reachable by keyboard', () => {
  // A card, row or toggle that only answers a mouse is unusable without one.
  // components/../lib/a11y.js exists so the fix is one import, not fifteen lines.
  assert.strictEqual(findings.clickableDiv.length, 0,
    `${findings.clickableDiv.length} element(s) respond to a click but cannot be focused:\n   ` +
    findings.clickableDiv.slice(0, 8).map((f) => `${f.file}:${f.line}`).join('\n   '));
});

check('every image is described or marked decorative', () => {
  assert.strictEqual(findings.noAlt.length, 0,
    `${findings.noAlt.length} image(s) with no alt:\n   ` +
    findings.noAlt.slice(0, 8).map((f) => `${f.file}:${f.line}`).join('\n   '));
});

check('every dialog says what it is', () => {
  assert.strictEqual(findings.unnamedDialog.length, 0,
    `${findings.unnamedDialog.length} dialog(s) with no name:\n   ` +
    findings.unnamedDialog.slice(0, 8).map((f) => `${f.file}:${f.line}`).join('\n   '));
});

// ── Structural affordances ──────────────────────────────────────────────────
const fs = require('fs');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');

check('there is a way to skip the navigation', () => {
  const shell = R('components/shell/AppShell.js');
  assert(/wf-skip-link/.test(shell), 'no skip link — a keyboard user tabs the whole nav on every page');
  assert(/href="#wf-main"/.test(shell), 'the skip link points nowhere');
  const css = R('app/globals.css');
  assert(/\.wf-skip-link\s*\{[^}]*left:\s*-9999px/.test(css), 'the skip link is not hidden until focused');
  assert(/\.wf-skip-link:focus[^{]*\{[^}]*left:\s*0/.test(css), 'the skip link never becomes visible');
});

check('page content is a landmark screen readers can jump to', () => {
  // Match the <main> and its id independently of attribute order/wrapping — the
  // capability is "content is a named main landmark", not "these two tokens are
  // adjacent on one line", which broke the moment the className grew a third term.
  const shell = R('components/shell/AppShell.js');
  const tag = shell.match(/<main\b[\s\S]{0,400}?>/);
  assert(tag, 'the page body is not a <main>');
  assert(/id="wf-main"/.test(tag[0]), 'the <main> is not the skip-link target #wf-main');
});

check('the shared keyboard helper exists and handles both activation keys', () => {
  const a11y = R('lib/a11y.js');
  assert(/export function clickable/.test(a11y), 'no clickable() helper');
  assert(/'Enter'/.test(a11y) && /' '/.test(a11y), 'Space or Enter is not handled');
  assert(/preventDefault/.test(a11y), 'Space would scroll the page instead of activating');
  assert(/export function clickableRow/.test(a11y),
    'no row variant — role="button" on a <tr> breaks table navigation');
});

// ── Open, with a budget that may only go down ───────────────────────────────
const BUDGET = { unlabelledInput: 53, placeholderOnly: 131 };

check(`form fields with no name at all stay within budget (${BUDGET.unlabelledInput})`, () => {
  const n = findings.unlabelledInput.length;
  assert(n <= BUDGET.unlabelledInput,
    `${n} exceeds the budget of ${BUDGET.unlabelledInput}. New fields need a label — ` +
    `aria-label, an id paired with <label for>, or wrap them in <Field>.\n   ` +
    findings.unlabelledInput.slice(0, 6).map((f) => `${f.file}:${f.line}`).join('\n   '));
});

check(`fields named only by a placeholder stay within budget (${BUDGET.placeholderOnly})`, () => {
  const n = findings.placeholderOnly.length;
  assert(n <= BUDGET.placeholderOnly,
    `${n} exceeds the budget of ${BUDGET.placeholderOnly}. A placeholder disappears as ` +
    `soon as somebody types, which is exactly when they might want to check what the field is.`);
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log(`   (open, budgeted: ${findings.unlabelledInput.length} unlabelled fields, ${findings.placeholderOnly.length} placeholder-only)`);
}
process.exitCode = fail === 0 ? 0 : 1;
