#!/usr/bin/env node
// Create or reset a Command Center platform admin.
//   node scripts/cc-create-admin.js <email> <password> [role]
// role ∈ founder | ops | finance | support | cs | readonly  (default: founder)
//
// This is the safe way to bootstrap the first founder without putting credentials
// in env. Run it once on the server; the admin can then log in at /control/login.

const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '..');
const db = new Database(path.join(DATA_DIR, 'wappflow.db'));
db.pragma('journal_mode = WAL');

const cc = require('../command-center');

const [, , email, password, role = 'founder'] = process.argv;
if (!email || !password) {
  console.error('Usage: node scripts/cc-create-admin.js <email> <password> [role]');
  process.exit(1);
}

try {
  cc.ensureSchema(db);
  const id = cc.createOrUpdateAdmin(db, { email, password, role });
  console.log(`✅ Command Center admin ready: ${email}  (role: ${role}, id: ${id})`);
  console.log('   Log in at: <frontend>/control/login');
} catch (e) {
  console.error('❌ Failed:', e.message);
  process.exit(1);
}
