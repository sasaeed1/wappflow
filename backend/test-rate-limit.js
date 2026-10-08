'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  The API rate limit counts a signed-in user as themselves.
//
//  It used to be one 500-per-15-minutes counter per IP address, so everyone
//  behind one office connection shared it, and one person refreshing the
//  dashboard used it up: every call answered 429, the dashboard showed 0 leads
//  and live updates said "Reconnecting" (production, 257 refusals in 5 min).
//
//  Run against a server started with small limits so the test is quick:
//    DATA_DIR=<scratch> PORT=3023 RATE_LIMIT_IP=20 RATE_LIMIT_USER=60 node server.js &
//    node test-rate-limit.js
// ════════════════════════════════════════════════════════════════════════════
const API = process.env.WF_API || 'http://127.0.0.1:3023/api';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
const get = (p, tok) => fetch(API + p, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} });
const reg = async (n) => (await (await fetch(API + '/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `rl-${n}-${Date.now()}@test.local`, password: 'pw123456', businessName: 'RL' }) })).json()).token;

(async () => {
  const A = await reg('a'), B = await reg('b');   // 2 anonymous calls used
  console.log('\n[1] Anonymous traffic is limited per IP (limit 20)');
  let anon429 = false;
  for (let i = 0; i < 25 && !anon429; i++) anon429 = (await get('/auth/me')).status === 429;
  ok(anon429, 'anonymous requests hit the per-IP limit');
  const bad = await get('/leads', 'not-a-real-token');
  ok(bad.status === 429, 'an invalid token is counted as anonymous, not given its own budget');

  console.log('\n[2] A signed-in user has their own budget on the same IP (limit 60)');
  const r = await get('/leads', A);
  ok(r.status === 200, `user A still works while the IP is exhausted (got ${r.status})`);
  let used = 1, a429 = false;
  for (; used < 70 && !a429; used++) a429 = (await get('/leads', A)).status === 429;
  ok(a429 && used > 55, `user A is limited only after their own ${used - 1} calls`);
  const rb = await get('/leads', B);
  ok(rb.status === 200, 'user B on the same IP is unaffected by user A');

  console.log('\n[3] The live-updates stream is never refused by the limiter');
  const ctl = new AbortController();
  const ev = await fetch(`${API}/events?token=${encodeURIComponent(A)}`, { signal: ctl.signal }).catch((e) => ({ status: 0, e }));
  ok(ev.status === 200, `/api/events connects even with user A limited (got ${ev.status})`);
  ctl.abort();

  console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
