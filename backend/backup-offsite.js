'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Off-site backups (PROP-006). Every nightly backup was kept on the same disk as
//  the thing it protects; one dead disk or one lost server took both. This copies
//  each verified backup to Cloudflare R2 (any S3-compatible store works),
//  ENCRYPTED before it leaves the server.
//
//  Configure in backend/.env:
//    BACKUP_R2_BUCKET=wappflow-backups          (required to turn it on)
//    BACKUP_ENCRYPTION_KEY=<64 hex chars>        (required — nothing is uploaded unencrypted)
//    BACKUP_R2_ACCESS_KEY_ID / BACKUP_R2_SECRET_ACCESS_KEY / BACKUP_R2_ENDPOINT
//      (each falls back to the app's R2_* values, so one R2 token can serve both)
//
//  Format: "WFB1" | 12-byte IV | AES-256-GCM ciphertext | 16-byte tag.
//  Restore: node backup.js --decrypt <file.enc> <out>
//
//  No AWS SDK: a single PUT signed with SigV4 and an UNSIGNED-PAYLOAD body, which
//  R2 and S3 both accept, streamed so large upload archives never sit in memory.
//  Keep retention in the bucket itself (R2 → bucket → Settings → Object lifecycle,
//  e.g. delete after 30 days).
// ════════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');

const MAGIC = Buffer.from('WFB1');

function config(env = process.env) {
  const bucket = env.BACKUP_R2_BUCKET || '';
  const keyHex = env.BACKUP_ENCRYPTION_KEY || '';
  const accountId = env.BACKUP_R2_ACCOUNT_ID || env.R2_ACCOUNT_ID || '';
  const endpoint = (env.BACKUP_R2_ENDPOINT || env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '');
  return {
    enabled: !!bucket,
    bucket, endpoint,
    accessKeyId: env.BACKUP_R2_ACCESS_KEY_ID || env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: env.BACKUP_R2_SECRET_ACCESS_KEY || env.R2_SECRET_ACCESS_KEY || '',
    region: env.BACKUP_R2_REGION || 'auto',
    prefix: (env.BACKUP_R2_PREFIX || 'wappflow').replace(/^\/+|\/+$/g, ''),
    key: /^[0-9a-f]{64}$/i.test(keyHex) ? Buffer.from(keyHex, 'hex') : null,
  };
}

function problems(cfg) {
  const p = [];
  if (!cfg.key) p.push('BACKUP_ENCRYPTION_KEY must be 64 hex characters (generate one with: openssl rand -hex 32)');
  if (!cfg.endpoint) p.push('set BACKUP_R2_ENDPOINT or R2_ACCOUNT_ID');
  if (!cfg.accessKeyId || !cfg.secretAccessKey) p.push('set BACKUP_R2_ACCESS_KEY_ID and BACKUP_R2_SECRET_ACCESS_KEY (or R2_*)');
  return p;
}

async function encryptFile(src, dest, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const out = fs.createWriteStream(dest);
  out.write(Buffer.concat([MAGIC, iv]));
  await pipeline(fs.createReadStream(src), cipher, out, { end: false }).catch(async (e) => { out.destroy(); throw e; });
  await new Promise((resolve, reject) => out.end(cipher.getAuthTag(), (e) => (e ? reject(e) : resolve())));
}

async function decryptFile(src, dest, key) {
  const fd = fs.openSync(src, 'r');
  const size = fs.fstatSync(fd).size;
  const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
  const tag = Buffer.alloc(16); fs.readSync(fd, tag, 0, 16, size - 16);
  fs.closeSync(fd);
  if (!head.subarray(0, 4).equals(MAGIC)) throw new Error('not a WappFlow encrypted backup');
  const d = crypto.createDecipheriv('aes-256-gcm', key, head.subarray(4, 16));
  d.setAuthTag(tag);
  await pipeline(fs.createReadStream(src, { start: 16, end: size - 17 }), d, fs.createWriteStream(dest));
}

// ── SigV4 for one PUT ────────────────────────────────────────────────────────
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const hmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
function signPut({ endpoint, bucket, key, region, accessKeyId, secretAccessKey, contentLength, now = new Date() }) {
  const url = new URL(`${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const headers = { host: url.host, 'x-amz-content-sha256': 'UNSIGNED-PAYLOAD', 'x-amz-date': amzDate, 'content-length': String(contentLength) };
  const names = Object.keys(headers).sort();
  const canonical = ['PUT', url.pathname, '', names.map((h) => `${h}:${headers[h]}\n`).join(''), names.join(';'), 'UNSIGNED-PAYLOAD'].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kSig = hmac(hmac(hmac(hmac('AWS4' + secretAccessKey, day), region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSig).update(toSign).digest('hex');
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`;
  delete headers.host;
  return { url: url.toString(), headers };
}

async function putFile(cfg, filePath, objectKey) {
  const size = fs.statSync(filePath).size;
  const { url, headers } = signPut({ ...cfg, key: objectKey, contentLength: size });
  const r = await fetch(url, { method: 'PUT', headers, body: fs.createReadStream(filePath), duplex: 'half' });
  if (!r.ok) throw new Error(`upload refused (${r.status}): ${(await r.text()).slice(0, 300)}`);
  return { size };
}

/** Encrypt + upload each file. Returns [{ file, key, size }]; throws on the first failure. */
async function uploadBackups(files, { env = process.env, log = console.log } = {}) {
  const cfg = config(env);
  if (!cfg.enabled) return { skipped: 'off-site backups are off (set BACKUP_R2_BUCKET to turn them on)' };
  const bad = problems(cfg);
  if (bad.length) throw new Error('off-site backup not configured: ' + bad.join('; '));
  const done = [];
  for (const f of files) {
    const enc = f + '.enc';
    await encryptFile(f, enc, cfg.key);
    try {
      const objectKey = `${cfg.prefix}/${path.basename(enc)}`;
      const { size } = await putFile(cfg, enc, objectKey);
      done.push({ file: f, key: objectKey, size });
      log(`  ✓ off-site  ${objectKey}  ${(size / 1048576).toFixed(1)}MB (encrypted)`);
    } finally { try { fs.unlinkSync(enc); } catch {} }
  }
  return { uploaded: done };
}

module.exports = { config, problems, encryptFile, decryptFile, signPut, uploadBackups };
