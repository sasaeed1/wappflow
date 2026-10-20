'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  The Google Calendar refresh token is a standing key to a studio's calendar.
//  It was stored as plain text; it is now sealed at rest like the mail passwords
//  (mail-security.js), legacy rows are sealed at boot, and every reader goes
//  through readIntegrations(), which unseals.
//
//    node test-integrations-sealing.js                       (unit checks only)
//    WF_API=http://127.0.0.1:3021/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-integrations-sealing.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');
const mailSec = require('./mail-security');
const { strip: stripComments } = require('./test-source');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };

(async () => {
  await check('a plain-text refresh token left by an older version is sealed at boot', () => {
    const db = new Database(':memory:');
    db.exec('CREATE TABLE workspace_integrations (workspace_id TEXT PRIMARY KEY, google_calendar_refresh_token TEXT)');
    db.prepare('INSERT INTO workspace_integrations VALUES (?, ?)').run('ws1', '1//plain-refresh-token');
    db.prepare('INSERT INTO workspace_integrations VALUES (?, ?)').run('ws2', null);
    mailSec.sealLegacyRows(db);
    const v = db.prepare("SELECT google_calendar_refresh_token t FROM workspace_integrations WHERE workspace_id = 'ws1'").get().t;
    assert(v.startsWith('v1:'), 'not sealed: ' + v);
    assert(!v.includes('plain-refresh-token'), 'the token is still readable in the row');
    assert.strictEqual(mailSec.unsealSecret(v), '1//plain-refresh-token');
    assert.strictEqual(db.prepare("SELECT google_calendar_refresh_token t FROM workspace_integrations WHERE workspace_id = 'ws2'").get().t, null);
  });

  await check('every write seals the token and every read unseals it (source)', () => {
    const src = stripComments(fs.readFileSync(require.resolve('./server.js'), 'utf8'));
    assert(/SEALED_INTEGRATION_COLS\s*=\s*\['google_calendar_refresh_token'\]/.test(src), 'sealed column list missing');
    assert(/function readIntegrations[\s\S]{0,400}unsealSecret/.test(src), 'readIntegrations does not unseal');
    assert(/function upsertIntegrations[\s\S]{0,300}sealSecret/.test(src), 'upsertIntegrations does not seal');
    const direct = src.match(/FROM workspace_integrations/g) || [];
    assert.strictEqual(direct.length, 1, 'something reads workspace_integrations around readIntegrations()');
    assert(/google-calendar\/connect',\s*auth,\s*requirePerm\('manage_settings'\)/.test(src), 'connecting a calendar is not limited to settings managers');
  });

  if (process.env.WF_API && process.env.WF_DB) {
    const API = process.env.WF_API;
    const RUN = crypto.randomBytes(4).toString('hex');
    await check('the status route reads through the seal: a legacy plain row connects, an unreadable one does not', async () => {
      const r = await (await fetch(API + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `cal-${RUN}@test.local`, password: 'cal-password-1', businessName: 'Cal' }) })).json();
      assert(r?.token, 'could not register');
      const ws = r.user?.workspace_id || r.user?.id;
      const db = new Database(process.env.WF_DB);
      const set = (v) => db.prepare('INSERT INTO workspace_integrations (workspace_id, google_calendar_refresh_token) VALUES (?, ?) ON CONFLICT(workspace_id) DO UPDATE SET google_calendar_refresh_token = excluded.google_calendar_refresh_token').run(ws, v);
      const connected = async () => (await (await fetch(API + '/integrations/status', { headers: { Authorization: 'Bearer ' + r.token } })).json())?.googleCalendar?.connected;
      set('1//legacy-plain'); assert.strictEqual(await connected(), true, 'a legacy plain row reads as disconnected');
      set('v1:' + Buffer.from('not a real seal at all, wrong key').toString('base64')); assert.strictEqual(await connected(), false, 'an unreadable token reads as connected');
      db.close();
    });
  }

  console.log(`\n${fail ? '❌' : '✅'} integrations sealing: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
