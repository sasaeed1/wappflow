'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Public links have their own rate limits (public-limits.js), keyed per link AND
//  per visitor: a ZIP of a gallery, an AI answer, a booking or a shop order cost
//  real work, and the global per-IP limit was far too loose for them.
//
//  The limiter runs before the handler, so unknown tokens are enough to count.
//  Run against a server with the REAL public limits (no RATE_LIMIT_PUBLIC_SCALE):
//    DATA_DIR=<scratch> PORT=3023 RATE_LIMIT_IP=1000000 node server.js &
//    WF_API=http://127.0.0.1:3023/api node test-public-limits.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const crypto = require('crypto');
const API = process.env.WF_API || 'http://127.0.0.1:3023/api';
const RUN = crypto.randomBytes(4).toString('hex');

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };
const post = async (p, body = {}) => (await fetch(API + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status;

// `max` requests are let through to the handler; the next one is refused.
async function limitsAt(name, max, pathFor) {
  for (let i = 0; i < max; i++) assert.notStrictEqual(await post(pathFor('a')), 429, `${name}: request ${i + 1} of ${max} was refused`);
  assert.strictEqual(await post(pathFor('a')), 429, `${name}: request ${max + 1} was not refused`);
  // Keyed per link: the same visitor on a different link is unaffected.
  assert.notStrictEqual(await post(pathFor('b')), 429, `${name}: another link was refused too`);
}

(async () => {
  await check('a booking page takes 10 bookings per visitor per 15 minutes', () => limitsAt('booking', 10, (k) => `/booking/public/${k}${RUN}`));
  await check('a contract takes 10 AI questions per visitor per 15 minutes', () => limitsAt('cs-ask', 10, (k) => `/cs/public/${k}${RUN}/ask`));
  await check('a contract takes 10 signing attempts per visitor per 15 minutes', () => limitsAt('cs-sign', 10, (k) => `/cs/public/${k}${RUN}/sign`));
  await check('a gallery builds 5 ZIPs per visitor per 15 minutes', () => limitsAt('portal-export', 5, (k) => `/media/portal/${k}${RUN}/export`));
  await check('a shop takes 15 orders per visitor per 10 minutes', () => limitsAt('store', 15, (k) => `/store/public/${k}${RUN}`));
  console.log(`\n${fail ? '❌' : '✅'} public limits: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
