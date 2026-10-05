#!/usr/bin/env node
// Turn off two-step sign-in for a CUSTOMER user who has lost their authenticator
// app AND their recovery codes (PROP-006). Run on the server after confirming who
// they are:
//   node scripts/reset-user-2fa.js <email>
// Ends every open session for that user. If their workspace requires two-step
// sign-in they will be asked to set it up again at the next sign-in.

const path = require('path');
const Database = require('better-sqlite3');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '..'));
const db = new Database(path.join(DATA_DIR, 'wappflow.db'));
db.pragma('journal_mode = WAL');

const [, , email] = process.argv;
if (!email) { console.error('Usage: node scripts/reset-user-2fa.js <email>'); process.exit(1); }

try {
  const user = db.prepare('SELECT id, workspace_id FROM users WHERE lower(email) = ?').get(String(email).toLowerCase());
  if (!user) { console.error(`❌ No WappFlow user with email ${email}`); process.exit(1); }
  db.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_recovery = NULL, token_version = COALESCE(token_version,0) + 1 WHERE id = ?').run(user.id);
  try {
    db.prepare('INSERT INTO audit_logs (id, workspace_id, user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?,?,?)')
      .run('cli-' + Date.now().toString(36), user.workspace_id, user.id, 'mfa_reset_by_support', 'user', user.id, JSON.stringify({ via: 'server command line' }));
  } catch {}
  console.log(`✅ Two-step sign-in reset for ${email}. They have been signed out everywhere.`);
} catch (e) {
  console.error('❌ Failed:', e.message);
  process.exit(1);
}
