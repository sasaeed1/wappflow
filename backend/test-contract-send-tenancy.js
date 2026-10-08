'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  A contract's WhatsApp message must name the workspace that sends it.
//
//  The send, remind and bulk-send routes handed sendClientMessage a bare
//  { id, customer_phone } with no workspace_id. The WhatsApp manager treats a
//  missing workspace as a system call and uses ANY connected number, so a
//  studio without WhatsApp would have sent its client's signing link from
//  another studio's phone. Every call must carry the document's workspace.
//
//    node test-contract-send-tenancy.js
// ════════════════════════════════════════════════════════════════════════════
const express = require('express');
const Database = require('better-sqlite3');
const http = require('http');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

const db = new Database(':memory:');
db.exec(`CREATE TABLE leads (id TEXT PRIMARY KEY, workspace_id TEXT, customer_name TEXT, customer_phone TEXT, email TEXT, status TEXT, actual_sale REAL);
  CREATE TABLE workspace_members (workspace_id TEXT, user_id TEXT, role TEXT);
  CREATE TABLE company_settings (user_id TEXT, invoice_prefix TEXT, invoice_counter INTEGER, currency TEXT, currency_symbol TEXT);`);
db.prepare("INSERT INTO leads VALUES ('lead-a', 'ws-a', 'Client A', '+447700900001', NULL, 'New', NULL)").run();

const sent = [];
const app = express();
app.use(express.json());
const auth = (req, res, next) => { req.workspaceId = 'ws-a'; req.userId = 'user-a'; req.workspaceOwnerId = 'user-a'; next(); };
require('./contracts-studio')(app, db, {
  auth,
  sendClientMessage: async ({ lead }) => { sent.push(lead); return { sent: true }; },
  uploadsDir: require('os').tmpdir(),
});

const server = http.createServer(app).listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (method, path, body) => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return r.json();
};

(async () => {
  try {
    console.log('\n[1] Send: a document with no lead, signer phone only');
    const loose = await call('POST', '/api/cs/documents', { title: 'Loose agreement', pack_id: 'nda' });
    await call('POST', `/api/cs/documents/${loose.id}/signers`, { role: 'client', name: 'Walk-in', phone: '+447700900002' });
    await call('POST', `/api/cs/documents/${loose.id}/send`, { channels: ['whatsapp'] });
    ok(sent.length === 1 && sent[0].workspace_id === 'ws-a', 'the message names the sending workspace');

    console.log('\n[2] Send: a document linked to a lead');
    const linked = await call('POST', '/api/cs/documents', { title: 'Linked agreement', pack_id: 'nda', lead_id: 'lead-a' });
    await call('POST', `/api/cs/documents/${linked.id}/send`, { channels: ['whatsapp'] });
    ok(sent.length === 2 && sent[1].workspace_id === 'ws-a' && sent[1].id === 'lead-a', 'workspace and lead both carried');

    console.log('\n[3] Remind');
    await call('POST', `/api/cs/documents/${linked.id}/remind`, { channels: ['whatsapp'] });
    ok(sent.length === 3 && sent[2].workspace_id === 'ws-a', 'a reminder names the workspace too');

    console.log('\n[4] Bulk send');
    await call('POST', '/api/cs/bulk-send', { lead_ids: ['lead-a'], pack_id: 'nda', channels: ['whatsapp'] });
    const bulk = sent.slice(3);
    ok(bulk.length >= 1 && bulk.every(l => l.workspace_id === 'ws-a'), 'every bulk message names the workspace');

    console.log('\n[5] No channel → nothing is sent');
    const quiet = await call('POST', '/api/cs/documents', { title: 'Quiet', pack_id: 'nda', lead_id: 'lead-a' });
    const before = sent.length;
    await call('POST', `/api/cs/documents/${quiet.id}/send`, { channels: ['none'] });
    ok(sent.length === before, 'channels without whatsapp send nothing');
  } catch (e) { fail++; console.error('  ✗ crashed:', e.message); }
  server.close();
  console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
