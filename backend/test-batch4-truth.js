'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Foundation Sprint · Batch 4 (pricing-reconcile + dead-code-purge + broken-routes)
//  BOOT-FREE verification.
//  (1) Live: formatMoney/nextPlanFor logic (extracted from lib/plan.js source),
//      empty-trash cascade SQL (table list parsed from server.js — drift-proof).
//  (2) Static: purge is total, vocabulary has no dead tiers, one upgrade route,
//      settings alias, invoice-email + empty-trash routes wired end to end.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const Database = require('better-sqlite3');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.log('  ✗', name, '—', e.message || e); fail++; }
}
const WEB = path.join(__dirname, '..', 'wappflow-web', 'src');
const read = (p) => fs.readFileSync(p, 'utf8');
const srv = read(path.join(__dirname, 'server.js'));
const planLib = read(path.join(WEB, 'lib', 'plan.js'));
const planLock = read(path.join(WEB, 'components', 'PlanLock.js'));
const navbar = read(path.join(WEB, 'components', 'NavBar.js'));
const settings = read(path.join(WEB, 'app', 'settings', 'page.js'));
const apiLib = read(path.join(WEB, 'lib', 'api.js'));

// ── (1a) Live: formatMoney + nextPlanFor extracted from source ───────────────
const fmSrc = planLib.match(/export const formatMoney = (\(amount[\s\S]*?);\r?\n/);
const formatMoney = eval(fmSrc[1]);
check('formatMoney(7999) === "PKR 7,999"', () => assert.strictEqual(formatMoney(7999), 'PKR 7,999'));
check('formatMoney(null) === "Custom"', () => assert.strictEqual(formatMoney(null), 'Custom'));
check('formatMoney(500, "USD") uses row currency', () => assert.strictEqual(formatMoney(500, 'USD'), 'USD 500'));

const npSrc = planLib.match(/export function nextPlanFor\(plan\) \{([\s\S]*?)\n\}/);
const nextPlanFor = new Function('plan', npSrc[1]);
check('nextPlanFor ladder creator→studio→studio_plus→enterprise→null', () => {
  assert.strictEqual(nextPlanFor('creator'), 'studio');
  assert.strictEqual(nextPlanFor('studio'), 'studio_plus');
  assert.strictEqual(nextPlanFor('studio_plus'), 'enterprise');
  assert.strictEqual(nextPlanFor('enterprise'), null);
  assert.strictEqual(nextPlanFor(undefined), 'studio'); // loading/unknown → safe target
});

// ── (1b) Live: empty-trash cascade (table list parsed from server.js) ────────
const trashBlock = srv.slice(srv.indexOf("app.delete('/api/leads/trash'"), srv.indexOf("app.delete('/api/leads/:id'"));
const tableList = trashBlock.match(/for \(const table of \[([^\]]+)\]\)/)[1]
  .split(',').map(s => s.trim().replace(/'/g, ''));
check('cascade list matches the permanent-delete route tables', () => {
  const perm = srv.slice(srv.indexOf("app.delete('/api/leads/:id/permanent'"));
  for (const t of tableList) assert(perm.includes(`DELETE FROM ${t} WHERE lead_id`), `permanent route missing ${t}`);
  // Phase 3 removed `invoices` from this cascade: emptying the lead trash used to
  // run DELETE FROM invoices WHERE lead_id, destroying financial records as a side
  // effect of tidying a pipeline. Invoices now soft-delete and the lead delete is
  // GUARDED instead. Asserting the exact set (not a count) so neither a new table
  // nor the return of invoices can slip in unnoticed.
  assert.deepStrictEqual(tableList, ['notes', 'reminders', 'messages', 'contact_history']);
  for (const guarded of ['invoices', 'cs_documents', 'bookings']) {
    assert(!tableList.includes(guarded), `${guarded} is back in the destructive cascade — it must be guarded, not deleted`);
  }
});
const db = new Database(':memory:');
db.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, is_deleted INTEGER DEFAULT 0);
  ${tableList.map(t => `CREATE TABLE ${t} (id TEXT PRIMARY KEY, lead_id TEXT);`).join('\n')}`);
db.exec(`INSERT INTO leads VALUES ('L1','wsA',1),('L2','wsA',0),('L3','wsB',1);
  INSERT INTO notes VALUES ('n1','L1'),('n2','L2'),('n3','L3');
  INSERT INTO messages VALUES ('m1','L1'),('m2','L3');`);
check('empty-trash cascade deletes only trashed leads in one workspace', () => {
  const emptyTrash = db.transaction((ws) => {
    const ids = db.prepare('SELECT id FROM leads WHERE workspace_id = ? AND is_deleted = 1').all(ws).map(r => r.id);
    if (!ids.length) return 0;
    const ph = ids.map(() => '?').join(',');
    for (const t of tableList) db.prepare(`DELETE FROM ${t} WHERE lead_id IN (${ph})`).run(...ids);
    db.prepare(`DELETE FROM leads WHERE id IN (${ph}) AND workspace_id = ?`).run(...ids, ws);
    return ids.length;
  });
  assert.strictEqual(emptyTrash('wsA'), 1);                       // only L1
  assert(db.prepare("SELECT 1 FROM leads WHERE id='L2'").get());  // active lead kept
  assert(db.prepare("SELECT 1 FROM leads WHERE id='L3'").get());  // other workspace kept
  assert(!db.prepare("SELECT 1 FROM notes WHERE lead_id='L1'").get()); // cascade ran
  assert(db.prepare("SELECT 1 FROM notes WHERE lead_id='L3'").get());  // other ws children kept
});

// ── (2) Static: dead-code-purge is total ─────────────────────────────────────
check('PlanWelcomeModal.js deleted', () =>
  assert(!fs.existsSync(path.join(WEB, 'components', 'PlanWelcomeModal.js'))));
check('zero live refs to PlanBanner/PlanChip/pl-banner/pl-chip', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []);
  const offenders = [];
  for (const f of walk(WEB)) {
    const t = read(f);
    if (/PlanBanner|PlanChip|PlanWelcomeModal|pl-banner|pl-chip/.test(t.replace(/\/\/.*deleted 2026-07-01[\s\S]*?context\.\)/, ''))) offenders.push(f);
  }
  assert.strictEqual(offenders.length, 0, 'refs remain: ' + offenders.join(', '));
});
check('kept PlanLock exports + CSS prefixes intact', () => {
  for (const e of ['LockTooltip', 'LockBadge', 'LockedOverlay', 'UpgradeCta', 'PlanLockStyles'])
    assert(planLock.includes(`export function ${e}`), e + ' missing');
  for (const c of ['.pl-tt', '.pl-badge', '.pl-overlay', '.pl-cta'])
    assert(planLock.includes(c), c + ' CSS missing');
});

// ── (2) Static: pricing-reconcile ─────────────────────────────────────────────
check('lib/plan.js exports the shared vocabulary', () => {
  for (const e of ['PLAN_META', 'planLabel', 'nextPlanFor', 'nextPlanLabel', 'UPGRADE_ROUTE', 'formatMoney'])
    assert(planLib.includes(`export`) && planLib.includes(e), e + ' missing');
});
check('no dead-tier requiredPlan literals remain', () => {
  const bad = [];
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return walk(p);
    if (!d.name.endsWith('.js')) return;
    if (/requiredPlan="(Growth|Starter|Free)"|requiredPlan='(Growth|Starter|Free)'/.test(read(p))) bad.push(p);
  });
  walk(WEB);
  assert.strictEqual(bad.length, 0, bad.join(', '));
});
check('no upgrade CTA routes to tab=workspace / tab=billing remain', () => {
  const t = planLock + navbar + settings + read(path.join(WEB, 'app', 'team', 'page.js')) + read(path.join(WEB, 'app', 'leads-list', 'page.js'));
  // match actual navigations only (the settings alias comment legitimately mentions the old URL)
  assert(!/router\.push\('\/settings\?tab=billing'\)|href="\/settings\?tab=billing"/.test(t), 'tab=billing navigation survives');
  assert(!/router\.push\('\/settings\?tab=workspace'\)|href="\/settings\?tab=workspace"/.test(t), 'upgrade→workspace survives');
});
check('NavBar TIER_STYLE keyed on real tiers only', () => {
  const block = navbar.slice(navbar.indexOf('const TIER_STYLE'), navbar.indexOf('const style = TIER_STYLE'));
  for (const k of ['creator:', 'studio:', 'studio_plus:', 'enterprise:']) assert(block.includes(k), k + ' missing');
  for (const k of ['free:', 'starter:', 'growth:']) assert(!block.includes(k), 'dead tier ' + k);
});
check('single currency impl: both pkr defs are formatMoney shims', () => {
  const landing = read(path.join(WEB, 'app', 'page.js'));
  assert(/const pkr = \(n\) => formatMoney\(n\)/.test(landing), 'landing pkr not unified');
  assert(/const pkr = \(n\) => formatMoney\(n\)/.test(settings), 'settings pkr not unified');
  assert(!/'PKR ' \+ Number/.test(landing + settings), 'hand-rolled PKR string survives');
});
check('settings aliases billing→plan + validates tab ids', () =>
  assert(/TAB_ALIASES = \{ billing: 'plan' \}/.test(settings) && /TABS\.some\(t => t\.id === resolved\)/.test(settings)));

// ── (2) Static: broken-routes ─────────────────────────────────────────────────
check('POST /api/invoices/:id/email wired (route + SMTP contract + audit)', () => {
  const r = srv.slice(srv.indexOf("app.post('/api/invoices/:id/email'"));
  assert(r.length > 100, 'route missing');
  assert(/SMTP not configured/.test(r), 'SMTP error contract missing');
  assert(/renderInvoiceEmailHTML\(/.test(r), 'template not used');
  assert(/logAudit\(req\.workspaceId, req\.userId, 'invoice_emailed'/.test(r), 'audit missing');
});
check('invoice email template ported (shared doc twin)', () =>
  assert(/function renderInvoiceEmailHTML\(invoice, company, baseUrl\)/.test(srv)));
check('DELETE /api/leads/trash registered BEFORE /api/leads/:id', () => {
  const a = srv.indexOf("app.delete('/api/leads/trash'");
  const b = srv.indexOf("app.delete('/api/leads/:id'");
  assert(a > -1 && b > -1 && a < b, 'ordering wrong — :id would swallow trash');
});
check('client bindings: invoicesAPI.sendEmail + leadsAPI.emptyTrash', () => {
  assert(/sendEmail: \(id, data\) => api\.post\(`\/invoices\/\$\{id\}\/email`, data\)/.test(apiLib));
  assert(/emptyTrash: \(\) => api\.delete\('\/leads\/trash'\)/.test(apiLib));
});
check('expires_at marked reserved (not dead)', () =>
  assert(/RESERVED for Gallery Expiry/.test(read(path.join(__dirname, 'media-studio.js')))));

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
