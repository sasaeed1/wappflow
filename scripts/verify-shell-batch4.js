'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 2 Batch 4 — App Router boundaries (gap-2) + orientation (navigation-ia-2/6/7)
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');

const SHELL_SEGMENTS = ['contracts', 'studio', 'control', 'bookings', 'chat', 'clients',
  'dashboard', 'help', 'invoices', 'knowledge', 'leads', 'leads-list', 'profile',
  'reports', 'settings', 'team', 'trash', 'whatsapp'];

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
// Migration comments legitimately NAME the strings and calls they replaced, so every
// assertion runs against code only.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

check('the app is no longer boundary-less: root error + global-error + not-found exist', () => {
  for (const f of ['error.js', 'global-error.js', 'not-found.js'])
    assert(fs.existsSync(path.join(WEB, 'app', f)), 'missing app/' + f);
});
check('every shell-mounting segment has its own error.js so a crash keeps the nav', () => {
  const missing = SHELL_SEGMENTS.filter((s) => !fs.existsSync(path.join(WEB, 'app', s, 'error.js')));
  assert(missing.length === 0, 'segments without a boundary: ' + missing.join(', '));
});
check('segment boundaries do NOT re-mount a shell (the layout above already renders one)', () => {
  for (const s of SHELL_SEGMENTS) {
    const src = R(`app/${s}/error.js`);
    assert(!/AppShell|ControlShell/.test(src), s + '/error.js wraps a shell — would double-render');
    assert(/'use client'/.test(src), s + '/error.js must be a client component');
  }
});
check('retry uses unstable_retry, not reset — reset re-renders WITHOUT re-fetching', () => {
  // Next 16.2 docs: unstable_retry() "will try to re-fetch and re-render". With reset(),
  // a failed API call would re-run the same broken render and look like a dead button.
  for (const f of ['app/error.js', 'app/global-error.js', 'app/dashboard/error.js']) {
    const src = R(f);
    assert(/unstable_retry/.test(src), f + ' still uses reset');
    assert(!/\breset\b/.test(src.replace(/\/\/.*$/gm, '')), f + ' still references reset');
  }
});
check('global-error is self-sufficient: own html/body, own <title>, no token dependency', () => {
  const src = R('app/global-error.js');
  assert(/<html/.test(src) && /<body/.test(src), 'must supply its own document — it replaces the root layout');
  assert(/<title>/.test(src), 'metadata is unsupported here; needs a React <title>');
  assert(!/var\(--/.test(src), 'cannot use tokens — globals.css is imported by the dead root layout');
});
check('404 does not strand logged-out or public visitors on a guarded route', () => {
  const src = R('app/not-found.js');
  assert(!/href="\/dashboard"/.test(src), '/dashboard is shell-guarded — bounces visitors to a login screen');
  assert(/href="\/"/.test(src) && /href="\/login"/.test(src), 'should offer both a public and a sign-in door');
});
check('lead detail derives its parent from the record, never "Dashboard"', () => {
  const src = strip(R('app/leads/[id]/page.js'));
  assert(/lead\.is_client \? '\/clients' : '\/leads-list'/.test(src), 'parent not derived from is_client');
  // covers the sub-nav, the not-found branch AND the post-delete redirect
  assert(!/router\.push\('\/dashboard'\)/.test(src), 'a hardcoded Dashboard jump survives');
  assert(/Back to Leads/.test(src), 'not-found branch still points at Dashboard');
});
check('misleading sibling "back" controls removed or relabelled', () => {
  assert(!/<ArrowLeft size=\{14\} \/> Back\b/.test(strip(R('app/invoices/page.js'))), 'invoices sideways-Back survives');
  assert(!/Back to settings/.test(strip(R('app/studio/help/page.js'))), 'studio help sibling-back survives');
});
check('the unlabelled back chevron has an accessible name', () => {
  const src = R('app/profile/page.js');
  assert(/aria-label="Go back"/.test(src), 'icon-only back button still has no accessible name');
});
check('Breadcrumbs mount via the shell subHeader, and never use router.back()', () => {
  const src = strip(R('components/shell/Breadcrumbs.js'));
  assert(/aria-label="Breadcrumb"/.test(src) && /aria-current/.test(src), 'breadcrumb a11y missing');
  assert(!/router\.back\(\)/.test(src), 'history-based back is unsafe here (lead→lead deep links pollute the stack)');
  assert(/subHeader/.test(R('components/shell/AppShell.js')), 'shell lost its subHeader slot');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
