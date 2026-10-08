'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Every error a person can see is a sentence (friendly-errors.js).
//    DATA_DIR=<scratch> PORT=3026 node server.js &   then   node test-friendly-errors.js
// ════════════════════════════════════════════════════════════════════════════
const { translate, looksTechnical } = require('./friendly-errors');
const API = process.env.WF_API || 'http://127.0.0.1:3026/api';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
const sentence = (e) => typeof e === 'string' && /^[A-Z“"']/.test(e) && /[.!?)]$/.test(e) && !looksTechnical(e.replace(/\(Ref [0-9A-F]+\)/, ''));

(async () => {
  console.log('\n[1] Translation');
  for (const [s, m] of [[500, 'SQLITE_CONSTRAINT: UNIQUE constraint failed: tags.name'], [500, "Cannot read properties of undefined (reading 'id')"],
    [500, 'FOREIGN KEY constraint failed'], [500, 'WhatsApp client is not ready'], [500, 'connect ECONNREFUSED 1.2.3.4:443'], [400, 'lead_ids required'],
    [400, 'current_password and new_password are required'], [400, 'invalid status'], [404, ''], [400, 'view not found']]) {
    const t = translate(s, m).text; ok(sentence(t), `${m || '(empty)'} → ${t}`);
  }
  for (const m of ['Invalid email or password', 'You already have a contact with this WhatsApp number.', 'Monthly lead allocation reached. Upgrade your plan to add more leads.']) {
    ok(translate(400, m).text.replace(/\.$/, '') === m.replace(/\.$/, ''), `a good sentence is kept: "${m}"`);
  }

  console.log('\n[2] Through the API');
  const reg = await (await fetch(API + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `fe-${Date.now()}@test.local`, password: 'pw123456', businessName: 'FE' }) })).json();
  const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + reg.token };
  const call = async (m, p, b) => { const r = await fetch(API + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, d: await r.json().catch(() => ({})) }; };
  let r = await call('POST', '/leads/bulk-status', {});
  ok(r.status === 400 && sentence(r.d.error) && !/lead_ids/.test(r.d.error), `missing field → "${r.d.error}"`);
  r = await call('GET', '/leads/does-not-exist');
  ok(r.status === 404 && sentence(r.d.error), `missing lead → "${r.d.error}"`);
  r = await call('POST', '/leads', { customer_name: 'X', customer_phone: '12ab' });
  ok(r.status === 400 && /letters in it/.test(r.d.error), 'a specific message is passed through untouched');
  const first = await call('POST', '/leads', { customer_name: 'Y', customer_phone: '+447700900321' });
  r = await call('POST', '/leads', { customer_name: 'Y2', customer_phone: '+447700900321' });
  ok(r.status === 400 && r.d.existing_id === first.d.id, 'extra fields on an error reply (existing_id) are kept');
  r = await call('GET', '/leads?limit=1');
  ok(r.status === 200 && !('error' in r.d), 'successful replies are not touched');

  console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
