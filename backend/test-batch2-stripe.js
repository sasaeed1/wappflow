'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Foundation Sprint · Batch 2 (stripe-webhook) verification — BOOT-FREE.
//  (1) Live HMAC tests of the exported verifyStripeSignature (valid / tampered /
//      stale / malformed / wrong-secret), matching Stripe's t.v1 scheme.
//  (2) Live SQL proof that webhook_events UNIQUE(platform,event_id) dedupes.
//  (3) Static source checks: raw parser registered BEFORE express.json, handler
//      rejects unconfigured/unsigned posts, idempotency INSERT only inside the
//      handled-event branch with a generated PK, settlement path unchanged.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { verifyStripeSignature } = require('./payments');

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); console.log('  ✓', name); pass++; }
  catch (e) { console.log('  ✗', name, '—', e.message || e); fail++; }
}

// ── (1) HMAC verification ─────────────────────────────────────────────────────
const SECRET = 'whsec_test_secret_123';
const body = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', client_reference_id: 'pay_1' } } }));
const now = 1_800_000_000; // fixed "now" for determinism
function sign(buf, secret, t) {
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.`).update(buf).digest('hex');
  return `t=${t},v1=${v1}`;
}

check('valid signature verifies', () =>
  assert.strictEqual(verifyStripeSignature(body, sign(body, SECRET, now), SECRET, 300, now), true));
check('tampered body rejected', () =>
  assert.strictEqual(verifyStripeSignature(Buffer.concat([body, Buffer.from('x')]), sign(body, SECRET, now), SECRET, 300, now), false));
check('wrong secret rejected', () =>
  assert.strictEqual(verifyStripeSignature(body, sign(body, 'whsec_other', now), SECRET, 300, now), false));
check('stale timestamp rejected (replay window)', () =>
  assert.strictEqual(verifyStripeSignature(body, sign(body, SECRET, now - 301), SECRET, 300, now), false));
check('within-tolerance timestamp accepted', () =>
  assert.strictEqual(verifyStripeSignature(body, sign(body, SECRET, now - 299), SECRET, 300, now), true));
check('multiple v1 entries: one valid passes', () =>
  assert.strictEqual(verifyStripeSignature(body, `t=${now},v1=deadbeef,v1=${sign(body, SECRET, now).split('v1=')[1]}`, SECRET, 300, now), true));
check('missing header rejected', () =>
  assert.strictEqual(verifyStripeSignature(body, undefined, SECRET, 300, now), false));
check('malformed header rejected', () =>
  assert.strictEqual(verifyStripeSignature(body, 'garbage', SECRET, 300, now), false));
check('non-Buffer body rejected', () =>
  assert.strictEqual(verifyStripeSignature('string body', sign(body, SECRET, now), SECRET, 300, now), false));
check('empty secret rejected', () =>
  assert.strictEqual(verifyStripeSignature(body, sign(body, SECRET, now), '', 300, now), false));

// ── (2) Idempotency via UNIQUE(platform,event_id) ────────────────────────────
const Database = require('better-sqlite3');
const db = new Database(':memory:');
db.exec(`CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY, platform TEXT NOT NULL, event_id TEXT NOT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(platform, event_id))`);
const ins = db.prepare('INSERT INTO webhook_events (id, platform, event_id) VALUES (?, ?, ?)');

check('first event insert succeeds', () => ins.run('row1', 'stripe', 'evt_1'));
check('replayed event id throws UNIQUE (deduped)', () => {
  let uniq = false;
  try { ins.run('row2', 'stripe', 'evt_1'); } catch (e) { uniq = String(e.message).includes('UNIQUE'); }
  assert(uniq, 'second insert did not hit UNIQUE');
});
check('same event id on another platform still allowed', () => ins.run('row3', 'meta', 'evt_1'));

// ── (3) Static source checks ──────────────────────────────────────────────────
const srv = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const pay = fs.readFileSync(path.join(__dirname, 'payments.js'), 'utf8');

check('raw parser registered BEFORE global express.json', () => {
  const rawIdx = srv.indexOf("app.use('/api/payments/webhook', express.raw(");
  const jsonIdx = srv.indexOf('app.use(express.json(');
  assert(rawIdx > -1, 'raw parser not found');
  assert(jsonIdx > -1, 'global json parser not found');
  assert(rawIdx < jsonIdx, 'raw parser is AFTER express.json — ordering bug');
});
check('raw parser matches all content-types (type:()=>true)', () =>
  assert(/express\.raw\(\{\s*type:\s*\(\)\s*=>\s*true/.test(srv)));

const whStart = pay.indexOf("app.post('/api/payments/webhook'");
const wh = pay.slice(whStart, pay.indexOf('});', pay.lastIndexOf('markPaid(p, sess.id)')) + 3);
check('handler rejects when STRIPE_WEBHOOK_SECRET unset', () =>
  assert(/if \(!STRIPE_WEBHOOK_SECRET\) return res\.status\(400\)/.test(wh)));
check('handler requires raw Buffer body', () => assert(/Buffer\.isBuffer\(req\.body\)/.test(wh)));
check('handler verifies signature before parsing', () => {
  assert(wh.indexOf('verifyStripeSignature(') > -1, 'no verification call');
  assert(wh.indexOf('verifyStripeSignature(') < wh.indexOf('JSON.parse('), 'parses before verifying');
});
check('idempotency INSERT only inside handled-event branch, with generated PK', () => {
  const branch = wh.slice(wh.indexOf("ev.type === 'checkout.session.completed'"));
  assert(/INSERT INTO webhook_events/.test(branch), 'no idempotency insert in branch');
  assert(!/INSERT INTO webhook_events/.test(wh.slice(0, wh.indexOf("ev.type === 'checkout.session.completed'"))), 'insert happens before type branch');
  assert(/\.run\(generateId\(\), 'stripe', String\(ev\.id/.test(branch), 'PK not generated / event id misplaced');
});
check('duplicate events return 200 (Stripe stops retrying)', () =>
  assert(/duplicate:\s*true/.test(wh)));
check('settlement path unchanged (client_reference_id → markPaid)', () => {
  assert(/sess && sess\.client_reference_id/.test(wh));
  assert(/p\.status !== 'paid'\) markPaid\(p, sess\.id\)/.test(wh));
});
check('boot warning when Stripe live but webhook secret missing', () =>
  assert(/STRIPE_SECRET_KEY set\) but STRIPE_WEBHOOK_SECRET is missing/.test(pay)));
check('manual mark-paid route untouched', () =>
  assert(/app\.post\('\/api\/payments\/:id\/mark-paid', auth,/.test(pay)));

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
