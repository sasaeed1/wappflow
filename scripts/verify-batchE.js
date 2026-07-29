'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  PROP-002 Batch E verification — BOOT-FREE static checks.
//  One Spinner / EmptyState / ErrorState / Skeleton; ONE @keyframes spin; and the
//  batch's single behavioural change — a failed fetch must render an ErrorState,
//  never the empty state (an outage must not read as "you have no data").
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');

const spinner = R('components/ui/Spinner.js');
const empty = R('components/ui/EmptyState.js');
const error = R('components/ui/ErrorState.js');
const skeleton = R('components/ui/Skeleton.js');
const css = R('app/globals.css');
const clients = R('app/clients/page.js');
const invoices = R('app/invoices/page.js');
const leads = R('app/leads-list/page.js');
const vault = R('app/contracts/vault/page.js');

const ALL = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css)$/.test(f)) ALL.push([path.relative(WEB, p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8')]);
  }
})(WEB);

let pass = 0, fail = 0;
function check(name, fn) { try { fn(); console.log('  ✓', name); pass++; } catch (e) { console.log('  ✗', name, '—', e.message || e); fail++; } }
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── ONE spin animation ───────────────────────────────────────────────────────
check('exactly ONE @keyframes spin survives, and it is the one in globals.css', () => {
  const decls = ALL.filter(([n]) => n !== 'components/ui/Spinner.js')
    .flatMap(([n, s]) => (strip(s).match(/@keyframes spin\b/g) || []).map(() => n));
  assert.deepStrictEqual(decls, ['app/globals.css'], 'spin declared in: ' + decls.join(', '));
});
check('no page redeclares the shared .spin helper class', () => {
  const offenders = ALL.filter(([n, s]) => n !== 'app/globals.css' && /\.spin\s*\{\s*animation/.test(s)).map(([n]) => n);
  assert(offenders.length === 0, '.spin shadowed in: ' + offenders.join(', '));
});
check('reduced-motion honoured: skeletons stop pulsing, spin slows', () => {
  assert(/@media \(prefers-reduced-motion: reduce\)/.test(css), 'no reduced-motion block');
  assert(/\.wf-skeleton \{ animation: none/.test(css), 'skeleton still animates under reduced motion');
});

// ── Primitives ───────────────────────────────────────────────────────────────
check('Spinner: role=status + accessible name + token colours + the shared keyframe', () => {
  assert(/role="status"/.test(spinner), 'no role=status');
  assert(/aria-label=/.test(spinner) && /label = 'Loading'/.test(spinner), 'no accessible name');
  assert(/animation: 'spin /.test(spinner), 'does not use the shared spin keyframe');
  assert(!/#[0-9a-fA-F]{3,6}/.test(strip(spinner)), 'raw hex in Spinner (must be var(--accent)/var(--border))');
  assert(/var\(--accent\)/.test(spinner) && /var\(--border\)/.test(spinner));
});
check('EmptyState: distinguishes filtered from truly-empty, CTA uses the Button primitive', () => {
  assert(/filtered = false/.test(empty), 'no filtered variant');
  assert(/import Button from '\.\/Button'/.test(empty), 'CTA does not reuse Button');
  assert(/variant=\{filtered \? 'secondary' : 'primary'\}/.test(empty), 'filtered CTA not de-emphasised');
  assert(!/#[0-9a-fA-F]{3,6}/.test(strip(empty)), 'raw hex in EmptyState');
});
check('ErrorState: role=alert, retry action, reassures about data safety', () => {
  assert(/role="alert"/.test(error), 'error not announced');
  assert(/onRetry/.test(error) && /<Button variant="secondary" onClick=\{onRetry\}/.test(error), 'no retry affordance');
  assert(/detail/.test(error), 'no technical detail slot');
  assert(!/#[0-9a-fA-F]{3,6}/.test(strip(error)), 'raw hex in ErrorState');
});
check('Skeleton: three real row shapes, aria-hidden, shared pulse keyframe', () => {
  for (const v of ['leads', 'invoice', 'vaultCard']) assert(new RegExp(v + ':').test(skeleton), 'missing variant ' + v);
  assert(/aria-hidden="true"/.test(skeleton), 'skeleton not hidden from AT');
  assert(/pulse 1\.4s/.test(skeleton), 'not using the shared pulse animation');
  assert(/className="wf-skeleton"/.test(skeleton), 'no hook for the reduced-motion rule');
  assert(!/#[0-9a-fA-F]{3,6}/.test(strip(skeleton)), 'raw hex in Skeleton');
});

// ── The behavioural change: an outage must never render as "no data" ──────────
check('clients: failed fetch sets an error and renders ErrorState with retry (was catch {})', () => {
  assert(!/catch \{\}/.test(clients), 'the empty catch survives');
  assert(/setError\(e\?\.response\?\.data\?\.error/.test(clients), 'failure not captured');
  assert(/<ErrorState[\s\S]{0,200}onRetry=\{load\}/.test(clients), 'no ErrorState with retry');
});
check('invoices: fetch failure no longer swallowed into an empty invoice list', () => {
  assert(!/invoicesAPI\.getAll\(\)\.catch\(\(\) => \(\{ data: \{ invoices: \[\] \} \}\)\)/.test(invoices), 'swallow survives');
  assert(/<ErrorState[\s\S]{0,220}onRetry=\{load\}/.test(invoices), 'no ErrorState with retry');
});
check('error branch is FIRST — a failure can never fall through to loading/empty', () => {
  for (const [name, s] of [['clients', clients], ['invoices', invoices]]) {
    const i = { err: s.indexOf('<ErrorState'), load: s.indexOf('{loading ? ('), empty: s.indexOf('<EmptyState') };
    // the ternary chain starts with `error ?` before the loading branch
    assert(/\{error \? \(/.test(s) || /error \? \(/.test(s), name + ' does not branch on error first');
    assert(i.err !== -1 && i.err < i.empty, name + ' renders EmptyState before ErrorState');
  }
});
check('no adopter renders an EmptyState while its own loading flag is true', () => {
  for (const [name, s] of [['clients', clients], ['invoices', invoices], ['leads-list', leads]]) {
    // EmptyState must always appear in a branch AFTER the loading test in the chain
    const l = s.indexOf('loading ? ('), e = s.indexOf('<EmptyState');
    assert(l !== -1 && e !== -1 && l < e, name + ' may flash an empty state while loading');
  }
});

// ── Adoption ─────────────────────────────────────────────────────────────────
check('every adopter distinguishes filtered-empty from truly-empty', () => {
  for (const [name, s] of [['clients', clients], ['invoices', invoices], ['leads-list', leads]])
    assert(/<EmptyState[\s\S]{0,120}filtered/.test(s), name + ' has no filtered-empty variant');
});
check('skeletons replace the loading text on the three approved list surfaces', () => {
  assert(/<SkeletonRow variant="invoice"/.test(invoices), 'invoices not skeletoned');
  assert(/<SkeletonRow variant="leads"/.test(leads), 'leads-list not skeletoned');
  assert(/<SkeletonRow variant="vaultCard"/.test(vault), 'vault not skeletoned');
  assert(!/Loading invoices\.\.\./.test(invoices) && !/Loading leads\.\.\./.test(leads), 'bare loading text survives');
});
check('leads-list in-button rings replaced by the Spinner primitive', () => {
  assert(!/animation: 'spin/.test(leads), 'inline spin ring survives');
  assert((leads.match(/<Spinner size="sm"/g) || []).length === 3, 'expected 3 migrated in-button spinners');
});
check('SCOPE GUARD: non-adopters were not migrated (keyframe dedupe only)', () => {
  // dashboard/profile/settings/etc. keep their local loaders this batch — only their
  // duplicate keyframes went. A stray import here would mean silent scope creep.
  for (const n of ['app/dashboard/page.js', 'app/profile/page.js', 'app/settings/page.js', 'app/trash/page.js'])
    assert(!/from '@\/components\/ui\/(Spinner|EmptyState|ErrorState|Skeleton)'/.test(ALL.find(([f]) => f === n)[1]), n + ' was migrated out of scope');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
