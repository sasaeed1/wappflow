'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Jimp, fenced: only real image bytes reach its type sniffer.
//
//  jimp 0.22 detects formats with file-type 16, whose ASF parser loops forever on
//  a malformed header (GHSA-5v7r-6r5c-r473, fixed only in the ESM-only 21.3.1).
//  The media worker runs inside the API process, so one crafted upload would
//  freeze the whole product. Moving to jimp 1.x is a rewrite of every photo path;
//  until then, Jimp.read is wrapped once (require() shares the module object, so
//  every caller is covered) and refuses anything that is not a known image
//  signature — an ASF file never reaches the vulnerable parser.
// ════════════════════════════════════════════════════════════════════════════
const fs = require('fs');

const SIGNATURES = [
  [0xff, 0xd8, 0xff],                         // JPEG
  [0x89, 0x50, 0x4e, 0x47],                   // PNG
  [0x47, 0x49, 0x46, 0x38],                   // GIF
  [0x42, 0x4d],                               // BMP
  [0x49, 0x49, 0x2a, 0x00],                   // TIFF (little-endian)
  [0x4d, 0x4d, 0x00, 0x2a],                   // TIFF (big-endian)
];
const isWebp = (b) => b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';

function looksLikeImage(head) {
  if (!head || head.length < 4) return false;
  return isWebp(head) || SIGNATURES.some((sig) => sig.every((byte, i) => head[i] === byte));
}

function headOf(src) {
  if (Buffer.isBuffer(src)) return src.subarray(0, 16);
  if (typeof src === 'string' && !/^https?:\/\//i.test(src)) {
    let fd;
    try { fd = fs.openSync(src, 'r'); const b = Buffer.alloc(16); const n = fs.readSync(fd, b, 0, 16, 0); return b.subarray(0, n); }
    catch { return null; }
    finally { if (fd !== undefined) try { fs.closeSync(fd); } catch {} }
  }
  return null; // Jimp instances, option objects — not bytes, pass through
}

function fence(Jimp) {
  if (!Jimp || Jimp.__wfFenced || typeof Jimp.read !== 'function') return Jimp;
  const read = Jimp.read.bind(Jimp);
  Jimp.read = function fencedRead(src, ...rest) {
    const head = headOf(src);
    if (head !== null && !looksLikeImage(head)) return Promise.reject(new Error('Not a supported image file'));
    return read(src, ...rest);
  };
  Jimp.__wfFenced = true;
  return Jimp;
}

let fenced = null;
try { fenced = fence(require('jimp')); } catch { /* jimp not installed — callers already handle that */ }

module.exports = { fence, looksLikeImage, Jimp: fenced };
