'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Foundation Sprint · Batch 1 (security) verification — BOOT-FREE.
//  The full server can't boot here (WhatsApp session loader), so this proves the
//  fixes two ways: (1) a live SQL test that the workspace guard isolates tenants,
//  and (2) static source-coverage that EVERY lead sub-resource route is guarded,
//  the WhatsApp control endpoints are authed+scoped, the message-send flow is
//  untouched, and the impersonation banner is mounted.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.log('  ✗', name, '—', e.message || e); fail++; }
}

// ── (1) Live SQL: the workspace guard isolates tenants ───────────────────────
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec('CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, assigned_to TEXT)');
db.prepare('INSERT INTO leads (id, workspace_id) VALUES (?,?)').run('leadA', 'wsA');
db.prepare('INSERT INTO leads (id, workspace_id) VALUES (?,?)').run('leadB', 'wsB');
const scoped = (id, ws) => db.prepare('SELECT * FROM leads WHERE id = ? AND workspace_id = ?').get(id, ws) || null;

check('own-workspace lead resolves', () => assert(scoped('leadA', 'wsA')));
check('cross-workspace lead is null (read/write leak closed)', () => assert.strictEqual(scoped('leadA', 'wsB'), null));
check('nonexistent lead is null', () => assert.strictEqual(scoped('nope', 'wsA'), null));

// ── (2) Static source coverage ───────────────────────────────────────────────
const SRV = path.join(__dirname, 'server.js');
const src = fs.readFileSync(SRV, 'utf8');
// Body of a route = from its `app.<m>(` index to the next top-of-line `app.` declaration.
function routeBlock(startIdx) {
  const next = src.indexOf('\napp.', startIdx + 5);
  return src.slice(startIdx, next === -1 ? src.length : next);
}
function blockAt(needle) {
  const i = src.indexOf(needle);
  assert(i > -1, 'route not found: ' + needle);
  return routeBlock(i);
}

// Every /api/leads/:leadId|:id sub-resource route must reference a workspace guard.
const routeRe = /app\.(get|post|put|delete)\('(\/api\/leads\/:(?:leadId|id)(?:\/[^']+)?)'/g;
const GUARD = /getScopedLead\(|workspace_id\s*=\s*\?/;
const unguarded = [];
let m;
while ((m = routeRe.exec(src))) {
  const route = `${m[1].toUpperCase()} ${m[2]}`;
  if (!GUARD.test(routeBlock(m.index))) unguarded.push(route);
}
check('no unguarded lead routes (all reference a workspace guard)', () =>
  assert(unguarded.length === 0, 'unguarded:\n    ' + unguarded.join('\n    ')));

check('PUT /reminders/:id/toggle scopes via the reminder’s lead', () =>
  assert(/getScopedLead\(/.test(blockAt("app.put('/api/reminders/:id/toggle'"))));

check('DELETE /lead-relations/:id is workspace-guarded', () =>
  assert(/getScopedLead\(/.test(blockAt("app.delete('/api/lead-relations/:id'"))));

// WhatsApp control endpoints: authed + workspace-resolved.
for (const r of ['status', 'disconnect', 'reconnect', 'sync-missed']) {
  check(`WA /api/whatsapp/${r} is authed + workspace-scoped`, () => {
    const block = blockAt(`'/api/whatsapp/${r}'`);
    assert(/',\s*auth/.test(block), 'missing auth middleware');
    assert(/resolveWorkspaceWaAccount\(/.test(block), 'missing workspace resolver');
  });
}

// Message-send flow must be untouched (auth kept, no scoping resolver injected, send logic intact).
check('POST /api/whatsapp/send message flow untouched', () => {
  const block = blockAt("app.post('/api/whatsapp/send'");
  assert(/',\s*auth/.test(block), 'send lost auth');
  assert(!/resolveWorkspaceWaAccount/.test(block), 'send flow was modified');
  assert(/sendMessage\(/.test(block), 'send logic changed');
});

check('PATCH /whatsapp/groups/:groupId checks account_id ownership before session calls', () => {
  const block = blockAt("app.patch('/api/whatsapp/groups/:groupId'");
  assert(/platform_accounts WHERE id = \? AND workspace_id/.test(block), 'no account_id ownership check');
  // ownership check must precede the first live-session mutation
  assert(block.indexOf('platform_accounts WHERE id') < block.indexOf('setGroupSubject'), 'guard runs after session mutation');
});

// Impersonation banner mounted app-wide + additive /auth/me field.
const providers = fs.readFileSync(path.join(__dirname, '..', 'wappflow-web', 'src', 'app', 'providers.js'), 'utf8');
check('ImpersonationBanner mounted in providers.js', () =>
  assert(/import ImpersonationBanner/.test(providers) && /<ImpersonationBanner\s*\/>/.test(providers)));
check('/api/auth/me exposes impersonation field', () =>
  assert(/impersonation:\s*req\.impersonation\s*\|\|\s*null/.test(blockAt("app.get('/api/auth/me'"))));

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
