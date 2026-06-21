'use strict';

// Downloads the registered ONNX vision models into src/main/ai/models/.
// Run on a machine with internet: `npm run fetch-models`. URLs drift over time —
// on failure it prints the manual source so you can drop the file in by hand.

const fs = require('fs');
const path = require('path');
const https = require('https');
const models = require('../src/main/ai/models');

const DIR = path.resolve(__dirname, '..', 'src', 'main', 'ai', 'models');
fs.mkdirSync(DIR, { recursive: true });

function download(url, dest, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 6) return reject(new Error('too many redirects'));
    https.get(url, { headers: { 'User-Agent': 'wappflow-desktop' } }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        return resolve(download(r.headers.location, dest, depth + 1));
      }
      if (r.statusCode !== 200) { r.resume(); return reject(new Error('HTTP ' + r.statusCode)); }
      const f = fs.createWriteStream(dest);
      r.pipe(f);
      f.on('finish', () => f.close(() => resolve()));
      f.on('error', (e) => { try { fs.unlinkSync(dest); } catch {} reject(e); });
    }).on('error', reject);
  });
}

(async () => {
  console.log('Models dir:', DIR, '\n');
  for (const m of models.ALL) {
    const dest = path.join(DIR, m.file);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) { console.log(`✓ ${m.file} — already present`); continue; }
    let ok = false;
    for (const url of m.urls) {
      try {
        process.stdout.write(`↓ ${m.file}\n   ${url}\n`);
        await download(url, dest);
        const sz = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
        if (sz < 1000) throw new Error('file too small (likely an error page)');
        console.log(`   ✓ ${(sz / 1e6).toFixed(1)} MB\n`);
        ok = true; break;
      } catch (e) { console.log(`   ✗ ${e.message}`); try { fs.unlinkSync(dest); } catch {} }
    }
    if (!ok) console.log(`   ! Could not auto-download. Manual: ${m.manual}\n`);
  }
  console.log('Done. Verify with:  npm run test:vision <path-to-a-photo.jpg>');
})();
