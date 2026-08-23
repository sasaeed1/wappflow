'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 7 — the action hub, and the cross-tenant hole it would have widened.
//
//  The hub's whole point is that creating a contract, a shoot or a portal link
//  from a contact stamps that contact's lead_id on the new record. Two writers
//  stored that lead_id WITHOUT checking the lead belonged to the caller, and the
//  PUBLIC client portal read every child table by lead_id ALONE. So a rival
//  tenant could attach a document to your lead id, and your portal — whose only
//  credential is a token you hand to clients — would publish their document
//  along with its SIGNING token.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3011 node server.js &
//    WF_API=http://127.0.0.1:3011/api WF_DB=<scratch>/wappflow.db \
//      WF_SQLITE=./node_modules/better-sqlite3 node test-phase7-action-hub-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = process.env.WF_API || 'http://127.0.0.1:3011/api';
const Database = require(process.env.WF_SQLITE || 'better-sqlite3');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };
const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};

// Unique per run: registration fails on a duplicate email, so fixed addresses
// make the suite pass only on a spotless database — exactly the kind of test
// that quietly stops running.
const RUN = process.pid.toString(36) + Math.random().toString(36).slice(2, 8);
const PLANTED_TOKEN = 'planted-signing-token-' + RUN;   // cs_documents.token is UNIQUE

(async () => {
  const A = (await j('POST', '/auth/register', null, { email: `hub-a-${RUN}@test.local`, password: 'pw123456', businessName: 'Studio A' })).d;
  const B = (await j('POST', '/auth/register', null, { email: `hub-b-${RUN}@test.local`, password: 'pw123456', businessName: 'Studio B' })).d;
  assert(A && A.token && B && B.token, 'could not register the two tenants - is the server up on ' + API + ' ?');

  const lead = (await j('POST', '/leads', A.token, { customer_name: 'Ayesha Khan', customer_phone: '923005550001', status: 'New' })).d;
  assert(lead && lead.id, 'lead not created: ' + JSON.stringify(lead));

  // ── what the hub does ─────────────────────────────────────────────────────
  let doc, proj, portal;

  await check('a contract started from a contact is linked to that contact', async () => {
    const r = await j('POST', '/cs/documents', A.token, { lead_id: lead.id, title: 'Agreement - Ayesha Khan', type: 'contract' });
    assert.strictEqual(r.status, 200, 'create failed: ' + JSON.stringify(r.d));
    doc = r.d;
    const db = new Database(process.env.WF_DB, { readonly: true });
    const row = db.prepare('SELECT lead_id, workspace_id FROM cs_documents WHERE id = ?').get(doc.id);
    db.close();
    assert.strictEqual(row.lead_id, lead.id, 'the link was dropped - the hub would create orphans');
  });

  await check('the linked contact is pre-filled as the signer, so nobody retypes it', async () => {
    const full = (await j('GET', '/cs/documents/' + doc.id, A.token)).d;
    const signer = (full.signers || []).find((s) => s.role === 'client');
    assert(signer, 'no client signer was seeded from the lead');
    assert.strictEqual(signer.name, 'Ayesha Khan');
    assert.strictEqual(signer.phone, '923005550001');
  });

  await check('a shoot started from a contact is linked to that contact', async () => {
    const r = await j('POST', '/media/projects', A.token, { lead_id: lead.id, title: 'Ayesha Khan - shoot' });
    assert.strictEqual(r.status, 201, 'create failed: ' + JSON.stringify(r.d));
    proj = r.d;
    assert.strictEqual(proj.lead_id, lead.id, 'the shoot is not linked to the contact');
  });

  await check('the portal link resolves to that contact and lists what was just created', async () => {
    const r = await j('POST', '/client-portal/' + lead.id, A.token);
    assert.strictEqual(r.status, 200, 'portal link failed: ' + JSON.stringify(r.d));
    portal = r.d;
    assert(portal.token, 'no portal token issued');
    let pub = (await j('GET', '/client-portal/public/' + portal.token, null)).d;
    assert.strictEqual(pub.client_name, 'Ayesha Khan', 'portal opened the wrong contact');
    assert((pub.projects || []).some((p) => p.id === proj.id), 'the shoot did not reach the portal');

    // A document only appears once it has a signing token, and a token is issued
    // when it is SENT — an unsigned draft must stay private, which is why the
    // fresh contract is absent here. Stamp a token to stand in for "sent" rather
    // than driving the real send path (which would try WhatsApp and email).
    assert(!(pub.documents || []).some((d) => d.title === 'Agreement - Ayesha Khan'),
      'an UNSENT draft contract was published to the client portal');
    const db = new Database(process.env.WF_DB);
    db.prepare("UPDATE cs_documents SET token = ?, status = 'sent' WHERE id = ?").run('legit-signing-token-' + RUN, doc.id);
    db.close();
    pub = (await j('GET', '/client-portal/public/' + portal.token, null)).d;
    assert((pub.documents || []).some((d) => d.title === 'Agreement - Ayesha Khan'), 'a sent contract did not reach the portal');
  });

  // ── the hole the hub would have widened ───────────────────────────────────
  await check('a rival tenant CANNOT attach a contract to your contact', async () => {
    const r = await j('POST', '/cs/documents', B.token, { lead_id: lead.id, title: 'Rival Contract', type: 'contract' });
    assert.strictEqual(r.status, 400, 'a foreign lead_id was accepted (status ' + r.status + ')');
    const db = new Database(process.env.WF_DB, { readonly: true });
    const n = db.prepare('SELECT COUNT(*) n FROM cs_documents WHERE lead_id = ? AND workspace_id != ?').get(lead.id, A.user.workspace_id).n;
    db.close();
    assert.strictEqual(n, 0, 'a foreign document was stored against the lead anyway');
  });

  await check('a rival tenant CANNOT attach an invoice to your contact', async () => {
    const r = await j('POST', '/invoices', B.token, { lead_id: lead.id, customer_name: 'Rival', items: [], total: 1 });
    assert.strictEqual(r.status, 400, 'a foreign lead_id was accepted on an invoice (status ' + r.status + ')');
  });

  await check('even a row that IS cross-tenant never reaches the public portal', async () => {
    // The write-side guard is new; rows written before it exist in the wild. This
    // is the check that matters: the portal must be safe on its own, without
    // trusting any writer, present or future.
    const db = new Database(process.env.WF_DB);
    db.prepare('INSERT INTO cs_documents (id, workspace_id, lead_id, type, title, blocks, token, status) VALUES (?,?,?,?,?,?,?,?)')
      .run('planted-doc-' + RUN, B.user.workspace_id, lead.id, 'contract', 'PLANTED Rival Contract', '[]', PLANTED_TOKEN, 'sent');
    db.prepare('INSERT INTO invoices (id, user_id, workspace_id, lead_id, invoice_number, customer_name, items, total, status) VALUES (?,?,?,?,?,?,?,?,?)')
      .run('planted-inv-' + RUN, B.user.id, B.user.workspace_id, lead.id, 'PLANTED-' + RUN, 'Rival', '[]', 999, 'sent');
    db.close();

    const pub = (await j('GET', '/client-portal/public/' + portal.token, null)).d;
    const blob = JSON.stringify(pub);
    assert(!blob.includes('PLANTED'), 'CROSS-TENANT LEAK: the portal published another tenant record:\n   ' + blob);
    assert(!blob.includes(PLANTED_TOKEN), 'CROSS-TENANT LEAK: a foreign document SIGNING TOKEN was published');
    // and the tenant's own records are still there - the filter did not just empty it
    assert((pub.documents || []).some((d) => d.title === 'Agreement - Ayesha Khan'), 'the fix removed the legitimate document too');
  });

  await check('the portal reveals nothing without a valid token', async () => {
    const r = await j('GET', '/client-portal/public/not-a-real-token', null);
    assert.strictEqual(r.status, 404, 'a bogus token returned ' + r.status);
  });

  await check('creating for a contact that does not exist is refused, not silently orphaned', async () => {
    const r = await j('POST', '/cs/documents', A.token, { lead_id: 'no-such-lead', title: 'Ghost' });
    assert.strictEqual(r.status, 400, 'an unknown lead_id was accepted (status ' + r.status + ')');
  });

  console.log('\n' + (fail === 0 ? 'ALL PASS' : 'FAILURES') + ': ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
