'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Repair WhatsApp media that was stored as a nameless attachment.
//
//  Three hand-rolled copies of the type mapping lived in whatsapp-service.js and
//  each knew a different set of message types. Anything none of them recognised
//  fell through to the generic 'media', which sends the file to /uploads/files
//  with a ".bin" extension and makes the thread render a "📎 Attachment" link
//  instead of the picture or clip it actually is.
//
//  The code is fixed, but rows written BEFORE the fix are still wrong, and the
//  live handler skips any wa_message_id it has already seen — so they will never
//  self-heal. This walks them, sniffs the real format from the file's magic
//  bytes (the only trustworthy source: mimetype was never stored), and moves the
//  file to the right folder with the right extension.
//
//  Dry by default. Pass --apply to actually write.
//
//    node repair-wa-media-types.js            # report only
//    node repair-wa-media-types.js --apply    # repair
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const APPLY = process.argv.includes('--apply');
const DATA_DIR = process.env.DATA_DIR || (process.env.NODE_ENV === 'production' ? '/data' : __dirname);
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'wappflow.db');

// Magic numbers. A document must be left alone, so anything not listed here is
// deliberately untouched rather than guessed at.
function sniff(buf) {
  if (buf.length < 12) return null;
  const hex = buf.toString('hex');
  if (hex.startsWith('52494646') && buf.slice(8, 12).toString('ascii') === 'WEBP')
    return { kind: 'image', ext: 'webp', dir: 'images', prefix: 'img' };
  if (hex.startsWith('89504e47')) return { kind: 'image', ext: 'png',  dir: 'images', prefix: 'img' };
  if (hex.startsWith('ffd8ff'))   return { kind: 'image', ext: 'jpg',  dir: 'images', prefix: 'img' };
  if (hex.startsWith('47494638')) return { kind: 'image', ext: 'gif',  dir: 'images', prefix: 'img' };
  if (buf.slice(4, 8).toString('ascii') === 'ftyp')
    return { kind: 'video', ext: 'mp4',  dir: 'videos', prefix: 'video' };
  if (hex.startsWith('1a45dfa3')) return { kind: 'video', ext: 'webm', dir: 'videos', prefix: 'video' };
  if (hex.startsWith('4f676753')) return { kind: 'voice', ext: 'ogg',  dir: 'voices', prefix: 'voice' };
  return null; // PDFs, office docs, anything genuinely a file
}

const db = new Database(DB_PATH);
const rows = db.prepare(
  "SELECT id, media_type, media_url FROM messages WHERE media_type = 'media' AND media_url LIKE '/uploads/files/%'"
).all();

console.log(`${rows.length} generic-'media' rows to inspect in ${DB_PATH}`);
if (!APPLY) console.log('DRY RUN — pass --apply to write.\n');

const update = db.prepare('UPDATE messages SET media_type = ?, media_url = ? WHERE id = ?');
let repaired = 0, left = 0, missing = 0;

for (const r of rows) {
  const abs = path.join(DATA_DIR, r.media_url.replace(/^\//, ''));
  if (!fs.existsSync(abs)) { missing++; console.log(`  ? missing on disk  ${r.media_url}`); continue; }

  let head;
  try {
    const fd = fs.openSync(abs, 'r');
    head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
  } catch (e) { missing++; continue; }

  const hit = sniff(head);
  if (!hit) { left++; continue; }

  const base = path.basename(abs).replace(/\.[^.]*$/, '');
  const stamp = (base.match(/^(\d+)/) || [])[1] || Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = `${hit.prefix}-${stamp}-${rand}.${hit.ext}`;
  const destDir = path.join(DATA_DIR, 'uploads', hit.dir);
  const destUrl = `/uploads/${hit.dir}/${filename}`;

  console.log(`  → ${hit.kind.padEnd(5)} ${r.media_url}  ⇒  ${destUrl}`);
  if (APPLY) {
    fs.mkdirSync(destDir, { recursive: true });
    // Copy then unlink rather than rename: /uploads subdirs could sit on
    // different mounts, and a half-done rename would lose the only copy.
    fs.copyFileSync(abs, path.join(destDir, filename));
    update.run(hit.kind, destUrl, r.id);
    fs.unlinkSync(abs);
  }
  repaired++;
}

console.log(`\n${APPLY ? 'Repaired' : 'Would repair'}: ${repaired} · left as genuine files: ${left} · missing on disk: ${missing}`);
db.close();
