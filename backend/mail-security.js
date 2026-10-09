'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Studio email accounts (SMTP sending / IMAP receiving), handled safely.
//
//  • Passwords at rest: they were stored as plain text, so any copy of the
//    database (a backup, a support export) carried every studio's mailbox
//    login. They are now sealed with AES-256-GCM. A row that is still plain
//    text keeps working and is sealed at boot (sealLegacyRows).
//    Key: DATA_ENCRYPTION_KEY, else derived from JWT_SECRET. Changing that key
//    makes stored mail passwords unreadable — studios would re-enter them.
//
//  • Where we connect: the host is something a studio types. Without a check
//    the server could be pointed at itself or the private network (SSRF):
//    127.0.0.1, 10.x, 169.254.169.254 … The host must resolve only to public
//    addresses and the port must be a mail port. Checked when settings are
//    saved and again right before every connection, so older rows are covered.
// ════════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');
const dns = require('dns').promises;
const net = require('net');
const { isPrivateIp } = require('./knowledge-crawler');

const SMTP_PORTS = new Set([25, 465, 587, 2525]);
const IMAP_PORTS = new Set([143, 993]);

function keyBytes() {
  const base = process.env.DATA_ENCRYPTION_KEY || process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  return crypto.createHash('sha256').update('wf-mail:' + base).digest();
}

/** Seal a secret for storage. Empty stays empty; an already-sealed value is returned as is. */
function sealSecret(plain) {
  if (plain == null || plain === '') return '';
  const s = String(plain);
  if (s.startsWith('v1:')) return s;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}

/** Read a stored secret: sealed → plain; legacy plain text → as is; unreadable → ''. */
function unsealSecret(stored) {
  if (stored == null || stored === '') return '';
  const s = String(stored);
  if (!s.startsWith('v1:')) return s;
  try {
    const raw = Buffer.from(s.slice(3), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', keyBytes(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  } catch { return ''; }
}

/** Is this a host + port the server may connect to for mail? → { ok } or { ok:false, error } (a sentence). */
async function checkMailHost(host, port, kind = 'smtp') {
  const h = String(host || '').trim().replace(/^\[|\]$/g, '');
  const p = Number(port);
  const label = kind === 'imap' ? 'incoming mail (IMAP)' : 'outgoing mail (SMTP)';
  if (!h) return { ok: false, error: `Enter the ${label} server address.` };
  if (!/^[a-z0-9.\-:]+$/i.test(h) || h.length > 253) return { ok: false, error: `That ${label} server address doesn’t look right. Use the address your email provider gives you, e.g. smtp.gmail.com.` };
  const ports = kind === 'imap' ? IMAP_PORTS : SMTP_PORTS;
  if (!ports.has(p)) return { ok: false, error: `Use a standard ${label} port: ${[...ports].join(', ')}.` };
  let addrs = [];
  if (net.isIP(h)) addrs = [h];
  else {
    try { addrs = (await dns.lookup(h, { all: true })).map((a) => a.address); }
    catch { return { ok: false, error: `We couldn’t find the server “${h}”. Check the address with your email provider.` }; }
  }
  if (!addrs.length || addrs.some(isPrivateIp)) {
    return { ok: false, error: `That ${label} server is a private or internal address. Use your email provider’s public server address.` };
  }
  return { ok: true };
}

/** A nodemailer transport for a studio's SMTP row, after the host check. Throws an Error with a plain message. */
async function smtpTransport(nodemailer, row) {
  const chk = await checkMailHost(row.smtp_host, row.smtp_port || 587, 'smtp');
  if (!chk.ok) throw Object.assign(new Error(chk.error), { code: 'EMAILHOST' });
  return nodemailer.createTransport({
    host: row.smtp_host, port: row.smtp_port || 587, secure: !!row.smtp_secure,
    auth: { user: row.smtp_user, pass: unsealSecret(row.smtp_pass) },
  });
}

/** Seal any mail passwords still stored as plain text. Safe to run on every boot. */
function sealLegacyRows(db) {
  let n = 0;
  for (const [table, col] of [['email_smtp_settings', 'smtp_pass'], ['email_imap_settings', 'imap_pass']]) {
    try {
      const rows = db.prepare(`SELECT id, ${col} AS v FROM ${table} WHERE ${col} IS NOT NULL AND ${col} != '' AND ${col} NOT LIKE 'v1:%'`).all();
      const upd = db.prepare(`UPDATE ${table} SET ${col} = ? WHERE id = ?`);
      for (const r of rows) { upd.run(sealSecret(r.v), r.id); n++; }
    } catch { /* table not created yet */ }
  }
  if (n) console.log(`🔐 Sealed ${n} stored mail password(s) at rest`);
  return n;
}

module.exports = { sealSecret, unsealSecret, checkMailHost, smtpTransport, sealLegacyRows, SMTP_PORTS, IMAP_PORTS };
