// 14-day Studio trials (PROP-006). In-memory database, the real module.
//   node test-trials.js
const Database = require('better-sqlite3');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
process.env.NODE_ENV = 'test';
const db = new Database(':memory:');
db.exec(`CREATE TABLE workspaces (id TEXT, name TEXT);
  CREATE TABLE workspace_plan (workspace_id TEXT PRIMARY KEY, plan TEXT, features TEXT, limits TEXT, trial_ends_at TEXT, updated_at TEXT);
  CREATE TABLE cc_inbox (id TEXT, kind TEXT, workspace_id TEXT, severity TEXT, title TEXT, body TEXT, link TEXT, status TEXT DEFAULT 'open');
  INSERT INTO workspaces VALUES ('w1', 'Atelier Nour'), ('w2', 'Paying Co');`);
const notes = []; const invalidated = [];
const t = require('./trials')({ post() {} }, db, { platformAuth: () => {}, requirePerm: () => () => {}, entitlements: { invalidate: (w) => invalidated.push(w) }, notify: (w, n) => notes.push([w, n]), generateId: () => Math.random().toString(36).slice(2) });

console.log('\n[1] Sign-up starts a trial');
t.startTrial('w1');
let row = db.prepare("SELECT * FROM workspace_plan WHERE workspace_id = 'w1'").get();
ok(row.plan === 'studio' && Math.round((new Date(row.trial_ends_at) - Date.now()) / 86400000) === 14, 'Studio for 14 days');
ok(invalidated.includes('w1'), 'features apply at once');
ok(t.sweep().ended === 0, 'nothing ends early');

console.log('\n[2] When it ends');
db.prepare("UPDATE workspace_plan SET trial_ends_at = ? WHERE workspace_id = 'w1'").run(new Date(Date.now() - 60000).toISOString());
db.prepare("INSERT INTO workspace_plan (workspace_id, plan, trial_ends_at) VALUES ('w2', 'studio_plus', NULL)").run();
ok(t.sweep().ended === 1, 'the expired trial is ended');
row = db.prepare("SELECT * FROM workspace_plan WHERE workspace_id = 'w1'").get();
ok(row.plan === 'creator' && row.trial_ends_at === null, 'the workspace moves to Creator');
ok(notes.some(([w, n]) => w === 'w1' && /trial has ended/i.test(n.title)), 'the owner is told');
ok(db.prepare("SELECT COUNT(*) AS c FROM cc_inbox WHERE kind = 'trial_ended' AND workspace_id = 'w1'").get().c === 1, 'the founder sees it in the inbox');
ok(db.prepare("SELECT plan FROM workspace_plan WHERE workspace_id = 'w2'").get().plan === 'studio_plus', 'a paying workspace (no trial date) is never touched');
ok(t.sweep().ended === 0, 'running again changes nothing');

console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
