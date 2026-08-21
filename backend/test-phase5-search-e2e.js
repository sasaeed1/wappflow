'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Phase 5 Batch 4 — universal search, exercised against a RUNNING server.
//
//  Run:  PORT=3001 node server.js &   (fresh DB)
//        WF_DB=./wappflow.db WF_SQLITE=./node_modules/better-sqlite3 //          node test-phase5-search-e2e.js
//
//  Kept as a file rather than a scratch script because the properties it pins —
//  tenant isolation, per-member visibility, and LIKE-wildcard escaping — are
//  exactly the ones a future edit to search.js could quietly break.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const API = 'http://127.0.0.1:3001/api';
const Database = require(process.env.WF_SQLITE);

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  ✓', n); pass++; } catch (e) { console.log('  ✗', n, '—', e.message || e); fail++; } };
const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};
const search = async (tok, q) => (await j('GET', `/search?q=${encodeURIComponent(q)}`, tok)).d;
const labels = (res) => (res.results || []).map((x) => `${x.type}:${x.label}`);

(async () => {
  const owner = (await j('POST', '/auth/register', null, { email: 'sq-owner@test.local', password: 'pw123456', businessName: 'Search Studio' })).d;
  const other = (await j('POST', '/auth/register', null, { email: 'sq-other@test.local', password: 'pw123456', businessName: 'Rival Studio' })).d;
  const mateReg = (await j('POST', '/auth/register', null, { email: 'sq-mate@test.local', password: 'pw123456', businessName: 'Mate' })).d;

  const db = new Database(process.env.WF_DB);
  // Put the teammate in the owner's workspace as a plain user (no view_all_leads).
  db.prepare('UPDATE users SET workspace_id = ? WHERE id = ?').run(owner.user.workspace_id, mateReg.user.id);
  db.prepare(`INSERT INTO workspace_members (id, workspace_id, user_id, role, full_name, invite_status)
              VALUES (?, ?, ?, 'user', 'Mate', 'active')`).run('m-' + mateReg.user.id, owner.user.workspace_id, mateReg.user.id);

  // Records in the owner's workspace
  const mk = async (name, phone) => (await j('POST', '/leads', owner.token, { customer_name: name, customer_phone: phone, status: 'New' })).d;
  const zephyr = await mk('Zephyr Photography', '923001111111');
  const assigned = await mk('Assigned To Mate', '923002222222');
  const pct = await mk('50% Deposit Client', '923003333333');
  await j('PUT', `/leads/${assigned.id}`, owner.token, { assigned_to: mateReg.user.id });
  // one promoted to client
  const clientLead = await mk('Zephyr Weddings', '923004444444');
  await j('PUT', `/leads/${clientLead.id}/client`, owner.token, { is_client: 1 });
  // a record in the OTHER tenant with a matching name
  await j('POST', '/leads', other.token, { customer_name: 'Zephyr Rival', customer_phone: '923009999999', status: 'New' });

  await check('finds leads by name across the workspace', async () => {
    const r = await search(owner.token, 'Zephyr');
    assert(labels(r).includes('lead:Zephyr Photography'), 'lead not found: ' + JSON.stringify(labels(r)));
  });

  await check('separates clients from leads, both linking to the record', async () => {
    const r = await search(owner.token, 'Zephyr');
    const client = (r.results || []).find((x) => x.type === 'client');
    assert(client, 'promoted client not returned as its own type: ' + JSON.stringify(labels(r)));
    assert.strictEqual(client.label, 'Zephyr Weddings');
    assert.strictEqual(client.url, `/leads/${clientLead.id}`, 'client should open the lead record');
    assert(!labels(r).includes('lead:Zephyr Weddings'), 'a client should not also appear as a lead');
  });

  await check('never returns another tenant’s records', async () => {
    const r = await search(owner.token, 'Zephyr');
    assert(!JSON.stringify(r).includes('Zephyr Rival'), 'CROSS-TENANT LEAK: ' + JSON.stringify(labels(r)));
    const back = await search(other.token, 'Zephyr');
    assert(!JSON.stringify(back).includes('Zephyr Photography'), 'leak in the other direction');
    assert(labels(back).some((l) => l.includes('Zephyr Rival')), 'the other tenant lost its own record');
  });

  await check('honours per-member lead visibility', async () => {
    // The teammate has view_all_leads = false, so search must not become a way to
    // see records they cannot open.
    const mine = await search(mateReg.token, 'Zephyr');
    assert(!labels(mine).some((l) => l.startsWith('lead:')), 'a restricted member saw unassigned leads: ' + JSON.stringify(labels(mine)));
    const theirs = await search(mateReg.token, 'Assigned');
    assert(labels(theirs).includes('lead:Assigned To Mate'), 'a member cannot find their OWN lead: ' + JSON.stringify(labels(theirs)));
  });

  await check('a % in the query searches literally instead of matching everything', async () => {
    const r = await search(owner.token, '50%');
    const found = labels(r);
    assert(found.includes('lead:50% Deposit Client'), 'literal % match failed: ' + JSON.stringify(found));
    // Unescaped, '%50%%' would match every lead in the workspace.
    assert(!found.includes('lead:Zephyr Photography'), 'the % behaved as a wildcard: ' + JSON.stringify(found));
  });

  await check('an underscore is literal too', async () => {
    await mk('a_b Studio', '923005555555');
    await mk('axb Studio', '923006666666');
    const r = await search(owner.token, 'a_b');
    const found = labels(r);
    assert(found.includes('lead:a_b Studio'), 'literal underscore match failed');
    assert(!found.includes('lead:axb Studio'), 'underscore behaved as a single-char wildcard');
  });

  await check('short and empty queries return nothing rather than everything', async () => {
    assert.deepStrictEqual((await search(owner.token, 'a')).results, [], 'a 1-char query returned rows');
    assert.deepStrictEqual((await search(owner.token, '   ')).results, [], 'a blank query returned rows');
  });

  await check('search requires authentication', async () => {
    const r = await j('GET', '/search?q=Zephyr', null);
    assert([401, 403].includes(r.status), `unauthenticated search returned ${r.status}`);
  });

  await check('results carry a usable destination', async () => {
    const r = await search(owner.token, 'Zephyr');
    for (const item of r.results || []) {
      assert(item.url && item.url.startsWith('/'), `result has no route: ${JSON.stringify(item)}`);
      assert(item.label, `result has no label: ${JSON.stringify(item)}`);
    }
  });

  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
