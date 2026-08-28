'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  SECURITY — the pre-launch hardening pass.
//
//  Four defects found by audit, none of which had ever failed visibly:
//
//  1. META WEBHOOKS WERE UNAUTHENTICATED. /api/webhooks/instagram and
//     /api/webhooks/facebook accepted ANY POST — no signature check — so anyone
//     who found the URL could inject messages and create leads.
//
//  2. …AND THEY GUESSED WHOSE DATA IT WAS. When the page id did not match, both
//     fell back to `ORDER BY created_at ASC LIMIT 1` — the FIRST account of that
//     platform in the whole database. A crafted payload therefore landed in an
//     arbitrary tenant's CRM. Same shape as the WhatsApp _resolveOwner leak that
//     put one studio's message on another studio's number.
//
//  3. EXPORT DOWNLOADS WERE PERMANENT AND UNSCOPED. /api/media/exports/:id/file
//     had no auth, no tenancy check and no expiry — "the id is the capability",
//     forever. Ids are random, but ids are not secrets: they travel in logs,
//     Referer headers and screenshots, and one leak meant permanent access to a
//     complete gallery ZIP.
//
//  4. CAPABILITY URLS BECAME "KNOWLEDGE". The learner reads staff replies and
//     stores durable facts — including the links we generate. A contract SIGNING
//     url and a gallery share url were found in production ai_memories, shown in
//     the Knowledge UI and fed into every AI prompt as memory context, hence sent
//     to the model provider on every call.
//
//  Static assertions where the defect is structural (a fallback query that must
//  not exist), executable where behaviour is what matters (the redactor).
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const SERVER = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const MEDIA = fs.readFileSync(path.join(__dirname, 'media-studio.js'), 'utf8');

let pass = 0, fail = 0;
const check = (n, fn) => {
  try { fn(); console.log('  ✓', n); pass++; }
  catch (e) { console.log('  ✗', n, '—', e.message); fail++; }
};

console.log('\n[1] Meta webhooks are authenticated');

check('a signature is verified before the payload is read', () => {
  for (const platform of ['instagram', 'facebook']) {
    const i = SERVER.indexOf(`app.post('/api/webhooks/${platform}'`);
    assert(i > -1, `${platform} webhook route is missing`);
    const handler = SERVER.slice(i, i + 900);
    assert(/verifyMetaSignature\(req\)/.test(handler), `${platform} webhook does not verify a signature`);
    // Order matters: verifying after acting on the body is not verifying.
    assert(handler.indexOf('verifyMetaSignature') < handler.indexOf('entry'),
      `${platform} reads the payload before checking the signature`);
  }
});

check('verification uses a constant-time compare over the RAW body', () => {
  const i = SERVER.indexOf('function verifyMetaSignature');
  assert(i > -1, 'verifier missing');
  const fn = SERVER.slice(i, i + 1200);
  assert(/createHmac\('sha256'/.test(fn), 'not an HMAC');
  assert(/timingSafeEqual/.test(fn), 'a plain === leaks the signature byte by byte through timing');
  assert(/Buffer\.isBuffer\(req\.body\)/.test(fn), 'not hashing the raw body — a re-serialised object will not match');
});

check('the raw body is captured BEFORE express.json consumes the stream', () => {
  const raw = SERVER.indexOf("'/api/webhooks/instagram', '/api/webhooks/facebook'");
  const json = SERVER.indexOf('app.use(express.json(');
  assert(raw > -1, 'no raw parser registered for the Meta webhooks');
  assert(raw < json, 'the raw parser is registered after express.json, so the signature can never match');
});

check('with no secret configured it REFUSES rather than accepting', () => {
  const i = SERVER.indexOf('function verifyMetaSignature');
  const fn = SERVER.slice(i, i + 400);
  assert(/if \(!META_APP_SECRET\) return \{ ok: false/.test(fn),
    'missing config must fail closed — an unauthenticated write path into customer records is not a convenience default');
});

console.log('\n[2] webhooks never guess whose data it is');

check('no cross-workspace fallback survives anywhere', () => {
  // The exact shape of the original bug.
  assert(!/ORDER BY created_at ASC LIMIT 1/.test(SERVER),
    'a "first account in the database" fallback is still present — a crafted payload would land in an arbitrary tenant');
});

check('an unknown page id is ignored, not reassigned', () => {
  for (const platform of ['instagram', 'facebook']) {
    const i = SERVER.indexOf(`app.post('/api/webhooks/${platform}'`);
    const handler = SERVER.slice(i, i + 1400);
    assert(/if \(!account\) \{/.test(handler) && /ignored/.test(handler),
      `${platform} does not explicitly ignore an unknown page`);
  }
});

console.log('\n[3] export downloads are signed and expiring');

check('the download URL is signed', () => {
  assert(/function signExport/.test(MEDIA), 'no signer');
  assert(/createHmac\('sha256'/.test(MEDIA.slice(MEDIA.indexOf('function signExport'), MEDIA.indexOf('function signExport') + 300)), 'not an HMAC');
  assert(/download_url:[^\n]*exportLink\(exp\)/.test(MEDIA), 'shapeExport still hands out a bare id URL');
});

check('the route refuses an unsigned or expired link, before touching the file', () => {
  const i = MEDIA.indexOf("app.get('/api/media/exports/:id/file'");
  const handler = MEDIA.slice(i, i + 1200);
  assert(/Date\.now\(\) > e/.test(handler), 'no expiry check');
  assert(/timingSafeEqual/.test(handler), 'signature compared without a constant-time check');
  assert(handler.indexOf('timingSafeEqual') < handler.indexOf('SELECT * FROM ms_exports'),
    'the export is looked up before the link is validated');
});

console.log('\n[4] capability URLs never become knowledge');

check('every ai_memories write is redacted', () => {
  const writes = [...SERVER.matchAll(/INSERT (?:OR (?:IGNORE|REPLACE) )?INTO ai_memories[\s\S]{0,600}?\.run\(([^;]*)\);/g)];
  assert(writes.length >= 2, `expected to find the memory writers, found ${writes.length}`);
  for (const w of writes) {
    assert(/redactCapabilityUrls/.test(w[1]),
      'a memory is written without redaction:\n      ' + w[1].replace(/\s+/g, ' ').slice(0, 110));
  }
});

check('the redactor strips signing and share links but keeps ordinary pages', () => {
  const m = SERVER.match(/const CAPABILITY_URL = (.+);/);
  assert(m, 'CAPABILITY_URL not found');
  const re = eval(m[1]); // eslint-disable-line no-eval -- reading our own source, not input
  const redact = (t) => String(t).replace(re, (x) => { try { return new URL(x).origin + '/… [link removed]'; } catch { return '[link removed]'; } });

  for (const secret of [
    'https://wappflow.remoteops.co/d/db8e298c37554021f654d93b45a290e371b8',
    'https://wappflow.remoteops.co/g/0be5ac96ca47fea507055425d7ffc2f6',
    'https://wappflow.remoteops.co/shop/abc123def456',
    'https://wappflow.remoteops.co/client/7f6f8db2fc9b7f00',
    'https://wappflow.remoteops.co/book/demo-studio',
  ]) {
    const out = redact(`please use ${secret} thanks`);
    assert(!out.includes(secret), 'a capability URL survived redaction: ' + out);
    assert(out.includes('[link removed]'), 'nothing was substituted: ' + out);
  }
  // Redaction must not eat the whole sentence, or the memory becomes useless.
  assert(redact('use https://x.test/d/tok now').startsWith('use '), 'redaction ate surrounding text');
  // An ordinary marketing page is not a credential.
  const ordinary = 'see https://wappflow.remoteops.co/about for details';
  assert.strictEqual(redact(ordinary), ordinary, 'a normal page URL was redacted');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
