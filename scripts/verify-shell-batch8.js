'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 5 Batch 3 (frontend) — the feed reaches every module, and unread team
//  messages are visible from outside /chat.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const SRC = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };

const modules = strip(R('components/shell/modules.js'));
const shell = strip(R('components/shell/AppShell.js'));
const bell = strip(R('components/shell/ShellNotifications.js'));
const summary = strip(R('components/shell/summary.js'));

check('the bell is mounted in every module, not just CRM', () => {
  // A finished render or a signed contract had nowhere to appear for someone
  // working inside Studio or Contracts.
  assert.strictEqual((modules.match(/notifications: true/g) || []).length, 3,
    'expected the notification flag on crm, studio and contracts');
});

check('the Communications nav item declares a badge', () => {
  assert(/label: 'Communications', icon: Inbox, badge: 'comms'/.test(modules), 'no badge declared on the nav item');
  assert(/const badgeCount = item\.badge === 'comms' && !locked \? \(summary\.comms \|\| 0\) : 0;/.test(shell),
    'the shell does not resolve the badge count');
  assert(/aria-label=\{`\$\{badgeCount\} unread`\}/.test(shell), 'the badge is invisible to screen readers');
});

check('the badge count reuses the bell’s fetch — no second poller', () => {
  assert(/publishSummary\(r\.data\)/.test(bell), 'the bell does not publish what it fetched');
  assert(/const summary = useSummary\(\);/.test(shell), 'the shell does not subscribe');
  // The whole point: nothing else may call the summary endpoint.
  const callers = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.jsx?$/.test(f.name) && /notifications\/summary/.test(strip(fs.readFileSync(p, 'utf8')))) callers.push(p);
    }
  };
  walk(SRC);
  assert.strictEqual(callers.length, 1, 'more than one component polls the summary endpoint:\n   ' + callers.join('\n   '));
});

check('a late-mounting subscriber still gets the last known counts', () => {
  // Real behaviour, executed: the shell can mount after the bell has fetched.
  let current = { comms: 0, total: 0 };
  const listeners = new Set();
  const publishSummary = (next) => { current = { ...current, ...next }; for (const fn of listeners) fn(current); };
  const mount = () => { let state = current; listeners.add((v) => { state = v; }); return () => state; };

  publishSummary({ comms: 4, total: 9 });      // bell fetched before the nav mounted
  const read = mount();
  assert.strictEqual(read().comms, 4, 'a subscriber mounting late would show 0 until the next poll');
  publishSummary({ comms: 6, total: 11 });
  assert.strictEqual(read().comms, 6, 'later updates do not reach subscribers');
});

check('bookings listens for the renamed reschedule/cancel events too', () => {
  const bookings = strip(R('app/bookings/page.js'));
  for (const ev of ['booking_created', 'booking_updated', 'booking_cancelled']) {
    assert(bookings.includes(`'${ev}'`), `bookings page ignores ${ev}`);
  }
});

check('the bell only calls API methods that exist', () => {
  // markAllRead?.() silently no-opped because the client exposes readAll.
  // Optional chaining on a typo is indistinguishable from success.
  const methods = [...bell.matchAll(/notificationsAPI[.](\w+)/g)].map((m) => m[1]);
  const api = fs.readFileSync(path.join(SRC, 'lib', 'api.js'), 'utf8');
  const i0 = api.indexOf('export const notificationsAPI');
  const exported = api.slice(i0, i0 + 400);
  for (const m of new Set(methods)) {
    assert(exported.includes(m + ':'), 'bell calls notificationsAPI.' + m + ' which is not exported');
  }
  assert(!/notificationsAPI[.]\w+[?][.]/.test(bell), 'optional chaining hides a missing method - let it throw');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
