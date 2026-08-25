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

check('fetchHistory obtains media and returns media_url', () => {
  const fn = waSrc.slice(waSrc.indexOf('async fetchHistory'), waSrc.indexOf('_collectMissedFromPage'));
  assert(/media_url:/.test(fn), 'fetchHistory does not return media_url');
  // Don't care WHERE the download happens — only that fetchHistory reaches a
  // downloader for media messages. (An earlier version of this check asserted
  // downloadMedia() appeared literally inside fetchHistory, and broke the moment
  // the call moved into a helper, with nothing actually regressing.)
  assert(/_downloadMediaFor|downloadMedia\(\)/.test(fn),
    'fetchHistory never reaches a media downloader');
});

check('the downloader has more than one way to get the bytes', () => {
  const fn = waSrc.slice(waSrc.indexOf('async _downloadMediaFor'), waSrc.indexOf('async _downloadMediaInPage'));
  assert(fn.length > 100, '_downloadMediaFor not found');
  assert(/_downloadMediaInPage/.test(fn), 'no in-page download — the only path that works on this account');
  assert(/downloadMedia\(\)/.test(fn), 'no library fallback if the in-page shape breaks');
  assert(/persistWaMedia/.test(fn), 'the downloader does not persist what it downloads');
  assert(/describeWaError|_lastMediaReason/.test(fn),
    'failures log the minified page-side message ("r") instead of a readable diagnosis');
});

check('a message missing from the page store is re-hydrated before giving up', () => {
  // fetchMessages() can hand back entries the media download cannot use. The
  // recovery is getMessagesById — it lives INSIDE the page evaluate now, which is
  // why this checks the capability rather than a particular call site.
  const fn = waSrc.slice(waSrc.indexOf('async _downloadMediaInPage'));
  assert(/Msg\.get\(/.test(fn) && /getMessagesById/.test(fn),
    'no re-hydration path — a message absent from Msg.get will always fail');
});

check('every in-page failure returns data instead of throwing across the boundary', () => {
  const fn = waSrc.slice(waSrc.indexOf('async _downloadMediaInPage'), waSrc.indexOf('async fetchHistory'));
  // A bare `throw` inside the evaluate would arrive in Node as the minified "r".
  assert(!/^\s*throw /m.test(fn), 'an in-page throw would cross the boundary and lose all detail');
  for (const reason of ['message-not-in-store', 'download-threw', 'unresolvable-stage']) {
    assert(fn.includes(reason), `missing the '${reason}' diagnosis`);
  }
});

check('the LIVE handler uses the same downloader, not the broken library call', () => {
  // The live path failed too — a new voice note produced the same minified "r".
  // If this regresses to message.downloadMedia(), newly received photos break
  // again while history keeps working, which is a confusing half-fixed state.
  const i = waSrc.indexOf("client.on('message'");
  assert(i > -1, "could not find the live message handler");
  const fn = waSrc.slice(i, i + 9000);
  assert(/_downloadMediaFor\(/.test(fn), 'live handler does not use the shared downloader');
  assert(!/persistWaMedia\(await message\.downloadMedia\(\)/.test(fn),
    'live handler is back on the library call that fails on this account');
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
