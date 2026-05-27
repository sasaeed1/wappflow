#!/usr/bin/env node
/* eslint-disable */
/**
 * WappFlow DB cleanup + demo seed.
 *
 *   - KEEPS the single user `wappflow@aitech.edu.pk` and their workspace +
 *     all the workspace-scoped data (leads, messages, settings, etc.).
 *   - DELETES every other user, workspace, and the data scoped to them.
 *   - SEEDS three demo accounts (free / starter / growth) so the tier
 *     gates can be exercised without changing the AI Tech workspace.
 *
 * Run from the wappflow backend dir:
 *   node scripts/clean_and_seed_demo.js
 *
 * Always backs up the DB to /tmp/wappflow.db.bak-<timestamp> before touching
 * anything. Use --dry-run to print counts without deleting.
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.WAPPFLOW_DB || '/data/wappflow.db';
const KEEP_EMAIL = 'wappflow@aitech.edu.pk';
const DRY_RUN = process.argv.includes('--dry-run');
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo1234!';

if (!fs.existsSync(DB_PATH)) {
  console.error(`DB not found at ${DB_PATH}`);
  process.exit(1);
}

// Back up first — always.
if (!DRY_RUN) {
  const bak = `/tmp/wappflow.db.bak-${Date.now()}`;
  fs.copyFileSync(DB_PATH, bak);
  console.log(`Backup → ${bak}`);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = OFF');

const keepUser = db
  .prepare('SELECT id, workspace_id, email FROM users WHERE email = ?')
  .get(KEEP_EMAIL);
if (!keepUser) {
  console.error(`User ${KEEP_EMAIL} not found — aborting (would have wiped DB).`);
  process.exit(1);
}
const KEEP_WS = keepUser.workspace_id;
const KEEP_USER = keepUser.id;
console.log(`Keeping workspace ${KEEP_WS} (user ${KEEP_USER} · ${keepUser.email})`);

// Discover every table + which scope column it has.
const allTables = db
  .prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
  )
  .all()
  .map((r) => r.name);

const tableScope = {}; // table → { col: 'workspace_id' | 'user_id' | null }
for (const t of allTables) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  if (cols.includes('workspace_id')) tableScope[t] = { col: 'workspace_id' };
  else if (cols.includes('user_id')) tableScope[t] = { col: 'user_id' };
  else tableScope[t] = { col: null };
}

// Compute would-delete counts up front (for the dry-run + the recap).
const previewCounts = {};
for (const t of allTables) {
  if (t === 'users' || t === 'workspaces' || t === 'sqlite_sequence') continue;
  const scope = tableScope[t];
  if (!scope.col) continue;
  const sql = `SELECT COUNT(*) AS c FROM ${t} WHERE ${scope.col} != ?`;
  const arg = scope.col === 'workspace_id' ? KEEP_WS : KEEP_USER;
  try {
    previewCounts[t] = db.prepare(sql).get(arg).c;
  } catch (e) {
    previewCounts[t] = `err: ${e.message}`;
  }
}
const userCount = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE workspace_id != ?`).get(KEEP_WS).c;
const wsCount = db.prepare(`SELECT COUNT(*) AS c FROM workspaces WHERE id != ?`).get(KEEP_WS).c;
previewCounts.users = userCount;
previewCounts.workspaces = wsCount;

console.log('\nRows that will be deleted:');
const nonZero = Object.entries(previewCounts).filter(([, v]) => v > 0);
if (nonZero.length === 0) {
  console.log('  (nothing — DB already cleaned)');
} else {
  for (const [t, n] of nonZero.sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(30)} ${String(n).padStart(6)}`);
  }
}

if (DRY_RUN) {
  console.log('\nDry run — no changes made.');
  process.exit(0);
}

// Actual cleanup + seed in one transaction.
const apply = db.transaction(() => {
  const deletedCounts = {};
  for (const t of allTables) {
    if (t === 'users' || t === 'workspaces' || t === 'sqlite_sequence') continue;
    const scope = tableScope[t];
    if (!scope.col) continue;
    const arg = scope.col === 'workspace_id' ? KEEP_WS : KEEP_USER;
    try {
      const r = db.prepare(`DELETE FROM ${t} WHERE ${scope.col} != ?`).run(arg);
      if (r.changes > 0) deletedCounts[t] = r.changes;
    } catch (e) {
      // Some tables may have schema quirks; log and continue.
      console.warn(`  skipped ${t}: ${e.message}`);
    }
  }

  const uR = db.prepare(`DELETE FROM users WHERE workspace_id != ?`).run(KEEP_WS);
  const wR = db.prepare(`DELETE FROM workspaces WHERE id != ?`).run(KEEP_WS);
  deletedCounts.users = uR.changes;
  deletedCounts.workspaces = wR.changes;

  console.log('\nDeleted:');
  for (const [t, n] of Object.entries(deletedCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(30)} ${String(n).padStart(6)}`);
  }

  // Seed 3 demo accounts (free / starter / growth) so tier gates can be tested.
  const DEMOS = [
    { email: 'free@wappflow.demo',    full: 'Free Demo',    biz: 'Free Demo Workspace',    plan: 'free' },
    { email: 'starter@wappflow.demo', full: 'Starter Demo', biz: 'Starter Demo Workspace', plan: 'starter' },
    { email: 'growth@wappflow.demo',  full: 'Growth Demo',  biz: 'Growth Demo Workspace',  plan: 'growth' },
  ];
  const hashed = bcrypt.hashSync(DEMO_PASSWORD, 10);

  // Introspect users table to know which columns are required.
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const wsCols = db.prepare('PRAGMA table_info(workspaces)').all().map((c) => c.name);
  const memberCols = db.prepare('PRAGMA table_info(workspace_members)').all().map((c) => c.name);

  // Build INSERTs dynamically against the actual schema. The workspace row
  // requires owner_id (the user), so we generate both IDs upfront and insert
  // workspace → user → member in that order. FK enforcement is off, so
  // workspace.owner_id can point to a user that doesn't exist yet — but we
  // insert the user immediately after so it stays consistent.
  const insertWs = (wsId, name, ownerId) => {
    const fields = ['id', 'name'];
    const values = [wsId, name];
    if (wsCols.includes('owner_id')) { fields.push('owner_id'); values.push(ownerId); }
    if (wsCols.includes('slug'))     { fields.push('slug');     values.push(null); }
    db.prepare(
      `INSERT INTO workspaces (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
    ).run(...values);
  };

  const insertUser = (uid, email, fullName, bizName, wsId) => {
    const fields = ['id', 'email', 'password', 'workspace_id'];
    const values = [uid, email, hashed, wsId];
    if (userCols.includes('business_name')) { fields.push('business_name'); values.push(bizName); }
    if (userCols.includes('full_name'))     { fields.push('full_name');     values.push(fullName); }
    if (userCols.includes('role'))          { fields.push('role');          values.push('owner'); }
    db.prepare(
      `INSERT INTO users (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
    ).run(...values);
  };

  const insertMember = (wsId, uid, fullName) => {
    const fields = ['workspace_id', 'user_id', 'role'];
    const values = [wsId, uid, 'super_admin'];
    if (memberCols.includes('id'))         { fields.unshift('id');         values.unshift(crypto.randomUUID()); }
    if (memberCols.includes('full_name'))  { fields.push('full_name');     values.push(fullName); }
    if (memberCols.includes('invite_status')) { fields.push('invite_status'); values.push('active'); }
    db.prepare(
      `INSERT INTO workspace_members (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
    ).run(...values);
  };

  for (const d of DEMOS) {
    const wsId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    insertWs(wsId, d.biz, userId);
    insertUser(userId, d.email, d.full, d.biz, wsId);
    insertMember(wsId, userId, d.full);
    db.prepare(`INSERT INTO workspace_plan (workspace_id, plan) VALUES (?, ?)`).run(wsId, d.plan);
    console.log(`  ✓ ${d.email} → ${d.plan} (workspace ${wsId.slice(0, 8)}…)`);
  }
});

apply();

// Recap
const finalUsers = db.prepare(`SELECT email, workspace_id FROM users ORDER BY email`).all();
const finalPlans = db.prepare(`SELECT workspace_id, plan FROM workspace_plan ORDER BY plan`).all();
console.log(`\nFinal state — ${finalUsers.length} users, ${finalPlans.length} plan rows:`);
for (const u of finalUsers) {
  const plan = finalPlans.find((p) => p.workspace_id === u.workspace_id);
  console.log(`  ${u.email.padEnd(38)} ${plan ? plan.plan : '(no plan)'}`);
}

console.log('\nDone. Demo password:', DEMO_PASSWORD);
