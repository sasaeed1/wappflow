// Storage abstraction test (local provider roundtrip + provider selection + the
// signed-URL/back-compat surface). R2 provider is env+SDK-gated and verified on the
// server. Run: node test-storage.js
const fs = require('fs');
const path = require('path');

let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.error('  ✗', m); } else console.log('  ✓', m); };

const tmp = path.join(__dirname, '_storage_test_tmp');
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

(async () => {
  // default (no STORAGE_PROVIDER) → local
  delete process.env.STORAGE_PROVIDER;
  const createStorage = require('./storage');
  const st = createStorage({ uploadsDir: tmp });

  console.log('\n[1] Provider selection');
  ok(st.provider === 'local', 'default provider = local');
  ok(st.isRemote === false, 'isRemote=false on local');

  console.log('\n[2] Canonical API (uploadFile/getPublicUrl/fileExists/delete)');
  const r = await st.uploadFile('media/projects/p1/x.jpg', Buffer.from('bytes-123'), 'image/jpeg');
  ok(r.provider === 'local' && r.size === 9 && r.key === 'media/projects/p1/x.jpg', 'uploadFile returns {provider,size,key}');
  ok(fs.existsSync(path.join(tmp, 'media/projects/p1/x.jpg')), 'file written to nested path');
  ok((await st.fileExists('media/projects/p1/x.jpg')) === true, 'fileExists true');
  ok((await st.getBuffer('media/projects/p1/x.jpg')).toString() === 'bytes-123', 'getBuffer roundtrip');
  ok(st.getPublicUrl('media/projects/p1/x.jpg') === '/uploads/media/projects/p1/x.jpg', 'getPublicUrl → /uploads path (the single URL impl)');
  ok((await st.generateSignedUploadUrl('k', 'image/jpeg')) === null, 'local signed-upload-url = null (uploads via API)');
  ok((await st.generateSignedDownloadUrl('media/projects/p1/x.jpg')) === '/uploads/media/projects/p1/x.jpg', 'local signed-download-url = public url');
  await st.deleteFile('media/projects/p1/x.jpg');
  ok((await st.fileExists('media/projects/p1/x.jpg')) === false, 'deleteFile removes');

  console.log('\n[3] Back-compat aliases (export-ZIP code)');
  await st.putBuffer('media/exports/e1.zip', Buffer.from('zip'), 'application/zip');
  ok((await st.getBuffer('media/exports/e1.zip')).toString() === 'zip', 'putBuffer alias works');
  ok((await st.presignGet('media/exports/e1.zip')) === '/uploads/media/exports/e1.zip', 'presignGet alias → url on local');
  await st.remove('media/exports/e1.zip');
  ok((await st.fileExists('media/exports/e1.zip')) === false, 'remove alias works');

  console.log('\n[4] STORAGE_PROVIDER=r2 without SDK/config → safe local fallback');
  // fresh require so the module re-reads the env
  delete require.cache[require.resolve('./storage')];
  delete require.cache[require.resolve('./storage/providers/r2')];
  process.env.STORAGE_PROVIDER = 'r2';
  const st2 = require('./storage')({ uploadsDir: tmp });
  ok(st2.provider === 'local', 'r2 requested but unconfigured here → falls back to local (no crash)');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? '✅ ALL STORAGE CHECKS PASSED' : '❌ ' + fails + ' FAILED'}\n`);
  process.exit(fails ? 1 : 0);
})();
