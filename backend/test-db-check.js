'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  For e2e suites that talk to a server (WF_API) AND open its database (WF_DB).
//
//  If the server on that port is not the one using WF_DB — usually a server
//  from an earlier run that is still shutting down, or was never stopped — the
//  suite registers its users on the wrong server and then fails somewhere
//  unrelated: "FOREIGN KEY constraint failed" on the first direct insert, or
//  "no such column" against a half-migrated file. That looked like a flaky
//  test for weeks. This check registers a throwaway account and confirms it
//  landed in WF_DB, so the run stops at once with the real reason.
//
//    await requireSameDb(API, Database);   // first line of the suite
// ════════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');

async function requireSameDb(api, Database, dbPath = process.env.WF_DB) {
  if (!dbPath) throw new Error('WF_DB is not set — point it at the database the server under test is using.');
  const email = `db-check-${crypto.randomBytes(6).toString('hex')}@test.local`;
  let r;
  try {
    r = await fetch(api + '/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'db-check-password', businessName: 'DB check' }),
    });
  } catch (e) {
    throw new Error(`No server answered at ${api} (${e.cause?.code || e.message}). Start it first.`);
  }
  const body = await r.json().catch(() => ({}));
  if (!body.user?.id) throw new Error(`Could not register a check account at ${api} (HTTP ${r.status}).`);
  const db = new Database(dbPath, { readonly: true });
  try {
    if (!db.prepare('SELECT 1 FROM users WHERE id = ?').get(body.user.id)) {
      throw new Error(`The server at ${api} is not using ${dbPath}. A server from an earlier run is probably `
        + 'still on that port: stop it, wait until the port is free, then start the server for this run.');
    }
  } finally { db.close(); }
}

module.exports = { requireSameDb };
