'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Pinned leads — behaviour and tenant isolation.
//
//  Pins are PERSONAL and server-side: they follow a user to another machine, but
//  one teammate's working set is not visible to another, and a pin can never
//  reach across a workspace boundary.
//
//  The interesting risk here is not the pinning, it is the READ BACK. The pinned
//  list is joined against leads to render names, so accepting a guessed lead id
//  from another tenant would quietly surface that tenant's lead in this
//  workspace's UI. That is why pin() verifies ownership BEFORE it writes, and
//  why the first test below is a security test rather than a validation one.
//
//  Asserts CAPABILITY, not spelling.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const pins = require('./lead-pins.js');

let pass = 0, fail = 0;
const check = (n, fn) => {
  try { fn(); console.log('  ✓', n); pass++; }
  catch (e) { console.log('  ✗', n, '—', e.message); fail++; }
};

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-pins-'));
const db = new Database(path.join(SCRATCH, 'test.db'));

// Minimal leads table — only the columns pin() actually reads.
db.exec(`
  CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT,
                      is_deleted INTEGER DEFAULT 0);
`);
pins.installSchema(db);

const WS_A = 'ws-alpha', WS_B = 'ws-beta';
const USER_1 = 'u1', USER_2 = 'u2';
const ins = db.prepare('INSERT INTO leads (id, workspace_id, customer_name) VALUES (?, ?, ?)');
ins.run('lead-a1', WS_A, 'Alpha One');
ins.run('lead-a2', WS_A, 'Alpha Two');
ins.run('lead-a3', WS_A, 'Alpha Three');
ins.run('lead-a4', WS_A, 'Alpha Four');
ins.run('lead-b1', WS_B, 'Beta One');

console.log('\n[1] a pin can never cross a workspace boundary');

check("workspace A cannot pin workspace B's lead, even with the exact id", () => {
  let threw = null;
  try { pins.pin(db, { workspaceId: WS_A, userId: USER_1, leadId: 'lead-b1' }); }
  catch (e) { threw = e; }
  assert(threw, "a foreign lead id was accepted — it would surface B's lead in A's UI");
  assert.strictEqual(threw.status, 404, 'must be indistinguishable from "no such lead"');
  const row = db.prepare('SELECT COUNT(*) n FROM lead_pins WHERE lead_id = ?').get('lead-b1');
  assert.strictEqual(row.n, 0, 'the foreign pin was written anyway');
});

check('the same lead id in the right workspace IS accepted', () => {
  // Guards against "fixing" the above by refusing everything.
  const list = pins.pin(db, { workspaceId: WS_B, userId: USER_1, leadId: 'lead-b1' });
  assert.deepStrictEqual(list, ['lead-b1']);
});

check('pins in one workspace are invisible from another', () => {
  const inA = pins.listPins(db, { workspaceId: WS_A, userId: USER_1 });
  assert.deepStrictEqual(inA, [], `workspace A can see ${JSON.stringify(inA)}`);
});

console.log('\n[2] pins are personal, not a team announcement');

check("one user's pin does not appear in another user's list", () => {
  pins.pin(db, { workspaceId: WS_A, userId: USER_1, leadId: 'lead-a1' });
  assert.deepStrictEqual(pins.listPins(db, { workspaceId: WS_A, userId: USER_1 }), ['lead-a1']);
  assert.deepStrictEqual(pins.listPins(db, { workspaceId: WS_A, userId: USER_2 }), []);
});

check('one user cannot unpin another user\'s lead', () => {
  pins.unpin(db, { workspaceId: WS_A, userId: USER_2, leadId: 'lead-a1' });
  assert.deepStrictEqual(pins.listPins(db, { workspaceId: WS_A, userId: USER_1 }), ['lead-a1'],
    "USER_2 unpinned USER_1's lead");
});

console.log('\n[3] the plumbing behaves');

check('pinning twice is idempotent, not an error or a duplicate', () => {
  const list = pins.pin(db, { workspaceId: WS_A, userId: USER_1, leadId: 'lead-a1' });
  assert.deepStrictEqual(list, ['lead-a1'], 'a second pin duplicated the row');
});

check('there is NO server-side cap — the owner asked for unlimited pins', () => {
  for (const id of ['lead-a2', 'lead-a3', 'lead-a4'])
    pins.pin(db, { workspaceId: WS_A, userId: USER_1, leadId: id });
  const list = pins.listPins(db, { workspaceId: WS_A, userId: USER_1 });
  assert.strictEqual(list.length, 4,
    `the fourth pin was refused — the clutter limit is a UI nudge, not a rule (got ${list.length})`);
  assert(pins.CLUTTER_WARN_AFTER === 3, 'the warn threshold the UI mirrors has moved');
});

check('unpin removes exactly one lead and leaves the rest', () => {
  const list = pins.unpin(db, { workspaceId: WS_A, userId: USER_1, leadId: 'lead-a2' });
  assert.strictEqual(list.length, 3);
  assert(!list.includes('lead-a2'));
  assert(list.includes('lead-a1') && list.includes('lead-a3') && list.includes('lead-a4'));
});

check('an empty/missing lead id is rejected rather than stored', () => {
  for (const bad of [undefined, null, '', '   ']) {
    let threw = null;
    try { pins.pin(db, { workspaceId: WS_A, userId: USER_1, leadId: bad }); } catch (e) { threw = e; }
    assert(threw, `pin accepted ${JSON.stringify(bad)}`);
  }
});

console.log('\n[4] a deleted lead must not leave a pin pointing at nothing');

check('permanent delete prunes the pin for EVERY user, not just the caller', () => {
  pins.pin(db, { workspaceId: WS_A, userId: USER_2, leadId: 'lead-a3' });
  pins.prunePinsForLead(db, { workspaceId: WS_A, leadId: 'lead-a3' });
  assert(!pins.listPins(db, { workspaceId: WS_A, userId: USER_1 }).includes('lead-a3'));
  assert(!pins.listPins(db, { workspaceId: WS_A, userId: USER_2 }).includes('lead-a3'),
    "another teammate's pin survived the permanent delete");
});

check('pruning one lead does not touch pins on other leads', () => {
  const list = pins.listPins(db, { workspaceId: WS_A, userId: USER_1 });
  assert(list.includes('lead-a1') && list.includes('lead-a4'), `collateral damage: ${JSON.stringify(list)}`);
});

check('the permanent-delete route actually calls the prune, soft delete does NOT', () => {
  // Soft delete is reversible, so a restored lead must come back pinned.
  const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
  const perm = srv.indexOf("app.delete('/api/leads/:id/permanent'");
  assert(perm > -1, 'permanent-delete route moved');
  assert(/prunePinsForLead/.test(srv.slice(perm, perm + 1600)),
    'permanent delete leaves pins dangling');
  const soft = srv.indexOf("app.delete('/api/leads/:id'");
  assert(soft > -1, 'soft-delete route moved');
  assert(!/prunePinsForLead/.test(srv.slice(soft, soft + 500)),
    'soft delete prunes pins — restoring a lead would silently lose them');
});

db.close();
try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
