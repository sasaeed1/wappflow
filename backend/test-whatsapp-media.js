'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Inbound WhatsApp media — regression test.
//
//  The bug this pins: received photos rendered in the thread as the literal
//  text "[Image]". The live message handler was fine — it downloaded the file
//  and stored media_url. The two SYNC importers wrote media_type but NOT
//  media_url, and one of them (POST /api/leads/:id/messages/sync) fires
//  automatically the first time you open a lead. The frontend renders an <img>
//  only when media_url is present, so it fell through to printing the body.
//
//  Worse, it could not self-heal: the live handler skips any wa_message_id it
//  has already seen, so once a media-less row existed, the real download was
//  fetched and thrown away on every later delivery.
//
//  Asserts CAPABILITY, not spelling: that a downloaded payload lands on disk at
//  a URL the app serves, that both importers carry media_url through to the
//  INSERT, and that a media-less row gets backfilled instead of skipped.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-media-'));
process.env.DATA_DIR = SCRATCH;

const { persistWaMedia, waMediaType } = require('./whatsapp-service.js');

let pass = 0, fail = 0;
const check = (n, fn) => {
  try { fn(); console.log('  ✓', n); pass++; }
  catch (e) { console.log('  ✗', n, '—', e.message); fail++; }
};

// A real 1x1 PNG header is enough — we only care that bytes round-trip.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const onDisk = (url) => fs.existsSync(path.join(SCRATCH, url.replace(/^\//, '')));

console.log('\n[1] persistWaMedia writes real files to a servable path');

check('an image lands in uploads/images and exists on disk', () => {
  const url = persistWaMedia({ data: PNG, mimetype: 'image/png' }, 'image');
  assert(/^\/uploads\/images\/img-.*\.png$/.test(url), `unexpected url: ${url}`);
  assert(onDisk(url), 'file was not written');
});

check('a voice note lands in uploads/voices', () => {
  const url = persistWaMedia({ data: PNG, mimetype: 'audio/ogg; codecs=opus' }, 'voice');
  assert(/^\/uploads\/voices\/voice-.*\.ogg$/.test(url), `unexpected url: ${url}`);
  assert(onDisk(url), 'file was not written');
});

check('a video lands in uploads/videos', () => {
  const url = persistWaMedia({ data: PNG, mimetype: 'video/mp4' }, 'video');
  assert(/^\/uploads\/videos\/video-.*\.mp4$/.test(url), `unexpected url: ${url}`);
  assert(onDisk(url), 'file was not written');
});

check('a document keeps its name but is filesystem-safe', () => {
  const url = persistWaMedia({ data: PNG, mimetype: 'application/pdf', filename: 'my report (final).pdf' }, 'media');
  assert(url.startsWith('/uploads/files/'), `unexpected url: ${url}`);
  assert(!/[()]/.test(url), `unsanitised characters survived: ${url}`);
  assert(url.endsWith('.pdf'), 'extension lost');
  assert(onDisk(url), 'file was not written');
});

check('nothing to write returns null rather than a broken URL', () => {
  assert.strictEqual(persistWaMedia(null, 'image'), null);
  assert.strictEqual(persistWaMedia({ mimetype: 'image/png' }, 'image'), null);
});

check('two files in the same millisecond do not overwrite each other', () => {
  // History imports persist a whole thread in one tick; a timestamp-only name
  // silently collapsed them into one file.
  const a = persistWaMedia({ data: PNG, mimetype: 'image/jpeg' }, 'image');
  const b = persistWaMedia({ data: PNG, mimetype: 'image/jpeg' }, 'image');
  assert.notStrictEqual(a, b, 'same filename generated twice');
  assert(onDisk(a) && onDisk(b), 'one of the two files is missing');
});

console.log('\n[2] message type maps to the kind the frontend switches on');

check('ptt/audio → voice, image/sticker → image, video → video, else media', () => {
  assert.strictEqual(waMediaType('ptt'), 'voice');
  assert.strictEqual(waMediaType('audio'), 'voice');
  assert.strictEqual(waMediaType('image'), 'image');
  assert.strictEqual(waMediaType('sticker'), 'image');
  assert.strictEqual(waMediaType('video'), 'video');
  assert.strictEqual(waMediaType('document'), 'media');
});

console.log('\n[3] every writer carries media_url — this is the actual bug');

const waSrc = fs.readFileSync(path.join(__dirname, 'whatsapp-service.js'), 'utf8');
const srvSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

check('every INSERT INTO messages that stores media_type also stores media_url', () => {
  // The defect was precisely an INSERT naming media_type and not media_url.
  const inserts = [...(waSrc + srvSrc).matchAll(/INSERT INTO messages\s*\(([^)]*)\)/g)].map((m) => m[1]);
  assert(inserts.length >= 3, `expected several message INSERTs, found ${inserts.length}`);
  const bad = inserts.filter((cols) => /media_type/.test(cols) && !/media_url/.test(cols));
  assert.strictEqual(bad.length, 0,
    `${bad.length} INSERT(s) store media_type but drop media_url:\n   ` + bad.join('\n   '));
});

check('fetchHistory downloads media and returns media_url', () => {
  const fn = waSrc.slice(waSrc.indexOf('async fetchHistory'), waSrc.indexOf('_collectMissedFromPage'));
  assert(/downloadMedia\(\)/.test(fn), 'fetchHistory never downloads media');
  assert(/persistWaMedia/.test(fn), 'fetchHistory does not persist what it downloads');
  assert(/media_url:/.test(fn), 'fetchHistory does not return media_url');
});

check('the missed-message sync re-fetches the message to get its media', () => {
  const fn = waSrc.slice(waSrc.indexOf('async syncMissedMessages'));
  assert(/getMessageById/.test(fn), 'missed-sync cannot download — page context only yields a hasMedia flag');
  assert(/persistWaMedia/.test(fn), 'missed-sync does not persist media');
});

console.log('\n[4] a media-less row can be repaired instead of skipped forever');

check('the live handler backfills a duplicate rather than dropping the download', () => {
  const i = waSrc.indexOf('SELECT id, media_url FROM messages WHERE wa_message_id');
  assert(i > -1, 'live dedup no longer reads the existing media_url, so it cannot tell if a backfill is needed');
  const block = waSrc.slice(i, i + 700);
  assert(/UPDATE messages SET media_url/.test(block), 'live handler still discards media on a duplicate');
});

check('the sync endpoint backfills a duplicate too', () => {
  const i = srvSrc.indexOf("SELECT id, media_url FROM messages WHERE wa_message_id");
  assert(i > -1, 'sync endpoint does not check the stored media_url');
  const block = srvSrc.slice(i, i + 700);
  assert(/UPDATE messages SET media_url/.test(block), 'sync endpoint still skips without repairing');
});

try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {}

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
