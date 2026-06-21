// Phase 10 storage adapter test (local backend roundtrip; R2 path is env+SDK-gated).
// Run: node test-storage.js
const fs = require('fs');
const path = require('path');
const createStorage = require('./storage');

const tmp = path.join(__dirname, '_storage_test_tmp');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };

(async () => {
  const st = createStorage({ uploadsDir: tmp });

  console.log('\n[1] Backend selection');
  ok(st.backend === 'local', 'falls back to local when R2 env/SDK absent');
  ok(st.isRemote === false, 'isRemote=false on local');
  ok(createStorage.r2Configured() === false, 'r2Configured() false without env');

  console.log('\n[2] Local put/get/url/remove roundtrip');
  await st.putBuffer('media/variants/x/web.jpg', Buffer.from('hello-bytes'), 'image/jpeg');
  ok(fs.existsSync(path.join(tmp, 'media/variants/x/web.jpg')), 'putBuffer creates nested path');
  const got = await st.getBuffer('media/variants/x/web.jpg');
  ok(got.toString() === 'hello-bytes', 'getBuffer returns the bytes');
  ok(st.exists('media/variants/x/web.jpg') === true, 'exists() true');
  ok((await st.url('media/variants/x/web.jpg')) === '/uploads/media/variants/x/web.jpg', 'url() → /uploads path on local');
  ok((await st.presignPut('k', 'image/jpeg')) === null, 'presignPut null on local (direct multipart still used)');
  await st.remove('media/variants/x/web.jpg');
  ok(st.exists('media/variants/x/web.jpg') === false, 'remove() deletes');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? '✅ ALL STORAGE CHECKS PASSED' : '❌ ' + fails + ' FAILED'}\n`);
  process.exit(fails ? 1 : 0);
})();
