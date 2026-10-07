// Off-site backups (PROP-006): run the real backup.js against a fake S3/R2 endpoint
// and prove what arrives is encrypted, signed, and decrypts back to the original.
//   node test-backup-offsite.js
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const Database = require('better-sqlite3');
const off = require('./backup-offsite');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

(async () => {
  const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-bk-'));
  const db = new Database(path.join(DATA, 'wappflow.db'));
  db.exec("CREATE TABLE leads (id TEXT, customer_name TEXT); INSERT INTO leads VALUES ('l1','Sara Klein'),('l2','Omar Aziz');");
  db.close();
  fs.mkdirSync(path.join(DATA, 'uploads')); fs.writeFileSync(path.join(DATA, 'uploads', 'photo.jpg'), crypto.randomBytes(2048));

  const got = [];
  const srv = http.createServer((req, res) => {
    const chunks = []; req.on('data', (c) => chunks.push(c));
    req.on('end', () => { got.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(200); res.end(); });
  });
  await new Promise((r) => srv.listen(0, r));
  const KEY = crypto.randomBytes(32).toString('hex');
  const env = { ...process.env, DATA_DIR: DATA, BACKUP_R2_BUCKET: 'wf-backups', BACKUP_ENCRYPTION_KEY: KEY,
    BACKUP_R2_ENDPOINT: `http://127.0.0.1:${srv.address().port}`, BACKUP_R2_ACCESS_KEY_ID: 'AK', BACKUP_R2_SECRET_ACCESS_KEY: 'SK' };

  console.log('\n[1] A nightly run copies every file off-site, encrypted');
  let out = '';
  await new Promise((resolve) => {
    const { execFile } = require('child_process');
    execFile(process.execPath, ['backup.js'], { cwd: __dirname, env }, (e, so, se) => { out = so + se; resolve(); });
  });
  ok(/off-site\s+wappflow\/wappflow-.*\.db\.enc/.test(out), 'the database copy is uploaded');
  ok(/off-site\s+wappflow\/wappflow-.*-uploads\.tar\.gz\.enc/.test(out), 'the uploads archive is uploaded');
  ok(got.length === 2 && got.every((g) => g.method === 'PUT' && /^\/wf-backups\/wappflow\//.test(g.url)), 'two signed PUTs to the bucket');
  ok(got.every((g) => /^AWS4-HMAC-SHA256 Credential=AK\/\d{8}\/auto\/s3\/aws4_request/.test(g.headers.authorization || '')), 'requests are SigV4-signed');
  const dbUpload = got.find((g) => /\.db\.enc$/.test(g.url));
  ok(dbUpload && !dbUpload.body.includes(Buffer.from('Sara Klein')) && dbUpload.body.subarray(0, 4).toString() === 'WFB1', 'nothing readable leaves the server');

  console.log('\n[2] It restores');
  const enc = path.join(DATA, 'pulled.db.enc'); fs.writeFileSync(enc, dbUpload.body);
  const plain = path.join(DATA, 'restored.db');
  execFileSync(process.execPath, ['backup.js', '--decrypt', enc, plain], { cwd: __dirname, env });
  const r = new Database(plain, { readonly: true });
  ok(r.prepare('SELECT COUNT(*) AS c FROM leads').get().c === 2, 'the decrypted copy is the database');
  r.close();
  const tampered = Buffer.from(dbUpload.body); tampered[40] ^= 1; fs.writeFileSync(enc, tampered);
  let refused = false; try { execFileSync(process.execPath, ['backup.js', '--decrypt', enc, plain + '2'], { cwd: __dirname, env, stdio: 'pipe' }); } catch { refused = true; }
  ok(refused, 'a tampered copy is refused, not silently restored');

  console.log('\n[3] It never uploads unencrypted');
  got.length = 0;
  await new Promise((resolve) => require('child_process').execFile(process.execPath, ['backup.js'], { cwd: __dirname, env: { ...env, BACKUP_ENCRYPTION_KEY: '' } }, (e, so, se) => { out = so + se; resolve(); }));
  ok(got.length === 0 && /off-site copy failed: .*BACKUP_ENCRYPTION_KEY/.test(out), 'without a key, it refuses and the run fails loudly');

  srv.close(); fs.rmSync(DATA, { recursive: true, force: true });
  console.log(`\n${fail ? '❌' : '✅'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
