'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 2 (One Shell) Batch 3 verification — the Studio migration and the
//  removal of all four legacy shells.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const R = (p) => fs.readFileSync(path.join(WEB, p), 'utf8');

const shell = R('components/shell/AppShell.js');
const modules = R('components/shell/modules.js');
const themeSwitch = R('components/shell/StudioThemeSwitch.js');
const studioLayout = R('app/studio/layout.js');

const STUDIO_PAGES = [];
(function walk(d) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f === 'page.js') STUDIO_PAGES.push([path.relative(WEB, p).replace(/\\/g, '/'), fs.readFileSync(p, 'utf8')]);
  }
})(path.join(WEB, 'app', 'studio'));

let pass = 0, fail = 0;
const check = (n, fn) => { try { fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };

check('Studio mounts the shell from its layout, keeping the pre-paint theme script', () => {
  assert(/<AppShell module="studio">/.test(studioLayout), 'shell not mounted');
  assert(/data-ms-theme/.test(studioLayout) && /dangerouslySetInnerHTML/.test(studioLayout), 'pre-paint theme script lost — would flash');
  assert(/import '\.\/studio\.css'/.test(studioLayout), 'studio.css import lost');
});
check('all 14 Studio pages unwrapped — including the alias trap', () => {
  const offenders = STUDIO_PAGES.filter(([, s]) => /from ['"][^'"]*components\/(StudioShell|NavBar)['"]/.test(s)).map(([n]) => n);
  assert(offenders.length === 0, 'still importing a shell: ' + offenders.join(', '));
  assert(STUDIO_PAGES.length >= 14, 'expected >=14 studio pages, found ' + STUDIO_PAGES.length);
});
check('D8 preserved: content still renders inside the .ms-root token-remap scope', () => {
  assert(/dialectClass: 'ms-root'/.test(modules), 'Studio dialect class lost');
  assert(/mod\.dialectClass \? `wf-page \$\{mod\.dialectClass\}`/.test(shell), 'shell does not apply the dialect class');
});
check('theme switcher survived as a module action, with its retired-id migration', () => {
  assert(/actions: StudioThemeSwitch/.test(modules), 'theme switch not declared as a module action');
  assert(/mod\.actions && <mod\.actions \/>/.test(shell), 'shell does not render module actions');
  assert(/'dark-pro': 'cinema', airy: 'editorial', bold: 'monochrome'/.test(themeSwitch), 'retired-theme migration lost');
  assert(/data-ms-theme/.test(themeSwitch) && /ms-theme/.test(themeSwitch), 'theme persistence lost');
});
check('the /studio/store shell teleport is resolved — it is a Studio page now', () => {
  const store = STUDIO_PAGES.find(([n]) => n.endsWith('app/studio/store/page.js'));
  assert(store, 'store page missing');
  assert(!/components\/NavBar/.test(store[1]), 'store still imports the CRM shell');
});
check('menu destinations come from the registry, not derived from home', () => {
  // CRM's settings/help are TOP-LEVEL routes; deriving them from home gave /dashboard/settings (404)
  assert(/href: '\/settings'/.test(modules) && /href: '\/help'/.test(modules), 'CRM menu paths wrong');
  assert(/href: '\/contracts\/settings'/.test(modules), 'Contracts menu paths wrong');
  assert(/href: '\/studio\/trash'/.test(modules), 'Studio Trash destination lost');
  assert(!/\$\{mod\.home\}\/settings/.test(shell), 'shell still derives settings from home');
});
check('every legacy shell is deleted', () => {
  for (const f of ['NavBar.js', 'StudioShell.js', 'ContractsStudioShell.js', 'AppSwitcher.js'])
    assert(!fs.existsSync(path.join(WEB, 'components', f)), f + ' still on disk');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
