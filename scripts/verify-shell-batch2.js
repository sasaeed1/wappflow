'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 2 (One Shell) Batch 2 verification — the CRM migration.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');

const shell = R('components/shell/AppShell.js');
const modules = R('components/shell/modules.js');
const notifs = R('components/shell/ShellNotifications.js');

const CRM_ROUTES = ['dashboard', 'leads-list', 'leads', 'clients', 'chat', 'invoices', 'bookings',
  'reports', 'team', 'knowledge', 'help', 'trash', 'whatsapp', 'profile', 'settings'];

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };

check('every CRM route mounts the shell from its own layout', () => {
  for (const r of CRM_ROUTES) {
    const lp = path.join(WEB, 'app', r, 'layout.js');
    assert(fs.existsSync(lp), 'missing layout for /' + r);
    assert(/<AppShell module="crm">/.test(fs.readFileSync(lp, 'utf8')), '/' + r + ' does not mount AppShell');
  }
});
check('no CRM page wraps itself in the old NavBar any more', () => {
  const offenders = [];
  for (const r of CRM_ROUTES) {
    (function walk(d) {
      for (const f of fs.readdirSync(d)) {
        const q = path.join(d, f);
        if (fs.statSync(q).isDirectory()) walk(q);
        else if (f === 'page.js' && /components\/NavBar/.test(fs.readFileSync(q, 'utf8'))) offenders.push(path.relative(WEB, q));
      }
    })(path.join(WEB, 'app', r));
  }
  assert(offenders.length === 0, 'still wrapping NavBar: ' + offenders.join(', '));
});
check('notifications + FABs are module-scoped (were accidents of which shell a page picked)', () => {
  assert(/notifications: true/.test(modules), 'CRM lost its notification bell');
  assert(/fabs: \[AICommandCenter, FloatingChat\]/.test(modules), 'CRM FABs not declared');
  assert(/fabs: \[StudioCopilot\]/.test(modules), 'Studio copilot not declared');
  assert(/mod\.notifications && <ShellNotifications/.test(shell), 'shell does not gate notifications by module');
});
check('notification behaviour ported faithfully (dedupe, 24h window, dismissed set, 60s poll)', () => {
  assert(/feedLeadUrls\.has\(`\/leads\/\$\{l\.id\}`\)/.test(notifs), 'lead/feed dedupe lost');
  assert(/36e5 <= 24/.test(notifs), '24-hour reminder window lost');
  assert(/wf_dismissed_notifications/.test(notifs), 'dismissed set lost');
  assert(/setInterval\(load, 60000\)/.test(notifs), '60s poll lost');
});
check('plan gating survived the port (Analytics is still lockable)', () => {
  assert(/lockFeature: 'analytics'/.test(modules), 'analytics lock lost');
  assert(/featureLocked\(item\.lockFeature\)/.test(shell), 'shell does not apply feature locks');
});
check('the /studio/store shell teleport is untouched, pending the Studio batch', () => {
  const store = R('app/studio/store/page.js');
  assert(/components\/NavBar/.test(store), 'store migrated early — its module identity is undecided');
  assert(fs.existsSync(path.join(WEB, 'components/NavBar.js')), 'NavBar deleted while store still imports it');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
