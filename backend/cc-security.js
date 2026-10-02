'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  COMMAND CENTER — security primitives (PROP-005 §A)
//
//  • TOTP (RFC 6238 / RFC 4226) for authenticator-app 2FA — Node crypto only.
//  • AES-256-GCM sealing for the TOTP secret at rest (key derived from JWT_SECRET).
//  • One-time recovery codes, stored as SHA-256 hashes.
//  • IP allowlist matching on req.ip (exact or CIDR — never a suffix match).
//  • Secret-column redaction for the database explorer / SQL console.
// ════════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');

// ── base32 (RFC 4648, no padding) ──────────────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i === -1) throw new Error('invalid base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// ── TOTP ───────────────────────────────────────────────────────────────────────
const STEP = 30, DIGITS = 6;
function hotp(secretBuf, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secretBuf).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}
function totp(secretB32, at = Date.now()) {
  return hotp(base32Decode(secretB32), Math.floor(at / 1000 / STEP));
}
// Accept the previous / current / next step (±30s clock drift).
function verifyTotp(secretB32, code, at = Date.now()) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const key = base32Decode(secretB32);
  const ctr = Math.floor(at / 1000 / STEP);
  for (const d of [-1, 0, 1]) {
    const exp = Buffer.from(hotp(key, ctr + d));
    if (crypto.timingSafeEqual(exp, Buffer.from(c))) return true;
  }
  return false;
}
function newTotpSecret() { return base32Encode(crypto.randomBytes(20)); }
function otpauthUri(secretB32, account, issuer = 'WappFlow Command Center') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}

// ── sealing the secret at rest ────────────────────────────────────────────────
function keyFrom(jwtSecret) { return crypto.createHash('sha256').update('cc-mfa:' + String(jwtSecret)).digest(); }
function seal(plain, jwtSecret) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyFrom(jwtSecret), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function unseal(sealed, jwtSecret) {
  if (!sealed) return null;
  if (!String(sealed).startsWith('v1:')) return String(sealed); // legacy plaintext (never written by us)
  const raw = Buffer.from(String(sealed).slice(3), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', keyFrom(jwtSecret), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

// ── recovery codes ────────────────────────────────────────────────────────────
const hashCode = (c) => crypto.createHash('sha256').update(String(c).replace(/[\s-]/g, '').toUpperCase()).digest('hex');
function newRecoveryCodes(n = 10) {
  const codes = Array.from({ length: n }, () => {
    const s = base32Encode(crypto.randomBytes(5)).slice(0, 8);
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashCode) };
}
// Returns the remaining hash list if `code` matched one (consumed), else null.
function consumeRecoveryCode(hashesJson, code) {
  let list = [];
  try { list = JSON.parse(hashesJson || '[]'); } catch {}
  const h = hashCode(code);
  const i = list.indexOf(h);
  if (i === -1) return null;
  list.splice(i, 1);
  return list;
}

// ── IP allowlist ──────────────────────────────────────────────────────────────
function ipv4ToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}
function normIp(ip) { return String(ip || '').replace(/^::ffff:/, '').trim(); }
// `allow` entries: exact IPv4/IPv6, or IPv4 CIDR ("203.0.113.0/24").
function ipMatches(ip, allow) {
  const addr = normIp(ip);
  return allow.some((entry) => {
    const a = entry.trim();
    if (!a) return false;
    if (!a.includes('/')) return normIp(a) === addr;
    const [base, bitsStr] = a.split('/');
    const bits = Number(bitsStr), ipN = ipv4ToInt(addr), baseN = ipv4ToInt(base);
    if (ipN == null || baseN == null || !(bits >= 0 && bits <= 32)) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipN & mask) === (baseN & mask);
  });
}

// ── redaction ─────────────────────────────────────────────────────────────────
const SECRET_COL = /(password|passwd|secret|token|api_?key|mfa|recovery|session_?data|private_?key|refresh|credential|p256dh|^auth$)/i;
function redactRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const cols = Object.keys(rows[0]).filter((c) => SECRET_COL.test(c));
  if (!cols.length) return rows;
  return rows.map((r) => { const o = { ...r }; cols.forEach((c) => { if (o[c] != null) o[c] = '[redacted]'; }); return o; });
}

module.exports = {
  base32Encode, base32Decode, totp, verifyTotp, newTotpSecret, otpauthUri,
  seal, unseal, newRecoveryCodes, consumeRecoveryCode, ipMatches, normIp, redactRows, SECRET_COL,
};
