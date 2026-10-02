#!/usr/bin/env node
// Turn off two-step verification for a Command Center admin who has lost their
// authenticator app AND their recovery codes. Run on the server:
//   node scripts/cc-reset-2fa.js <email>
// The admin signs in with their password next time and sets 2FA up again.
// Also ends every open session for that admin.

const path = require('path');
const Database = require('better-sqlite3');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '..'));
const db = new Database(path.join(DATA_DIR, 'wappflow.db'));
db.pragma('journal_mode = WAL');
const cc = require('../command-center');

const [, , email] = process.argv;
if (!email) { console.error('Usage: node scripts/cc-reset-2fa.js <email>'); process.exit(1); }

try {
  cc.ensureSchema(db);
  const admin = db.prepare('SELECT id FROM cc_admins WHERE email = ?').get(String(email).toLowerCase());
  if (!admin) { console.error(`❌ No Command Center admin with email ${email}`); process.exit(1); }
  db.prepare('UPDATE cc_admins SET mfa_enabled = 0, mfa_secret = NULL, mfa_recovery = NULL, token_version = COALESCE(token_version,0) + 1 WHERE id = ?').run(admin.id);
  db.prepare(`INSERT INTO cc_audit (id, admin_id, action, target_type, target_id, reason) VALUES (?,?,?,?,?,?)`)
    .run('cli-' + Date.now().toString(36), null, 'admin_mfa_reset', 'admin', admin.id, 'reset from server command line');
  console.log(`✅ Two-step verification reset for ${email}. They will set it up again at the next sign-in.`);
} catch (e) {
  console.error('❌ Failed:', e.message);
  process.exit(1);
}
