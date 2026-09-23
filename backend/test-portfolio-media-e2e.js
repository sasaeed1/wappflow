'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Portfolio media — uploaded videos are usable pieces, not broken tiles.
//
//  Direct portfolio uploads had no poster and nothing to name, frame or open them
//  with. This covers the server half: the original name is kept as an editor-only
//  label, a creator-picked thumbnail can be attached (and replaced, and cleaned up
//  on delete), tile framing is stored and validated, and none of the editor-only
//  data leaks onto the public page.
//
//  Run against a real server on a scratch data dir:
//    DATA_DIR=<scratch> PORT=3019 node server.js &
//    WF_API=http://127.0.0.1:3019/api WF_DATA=<scratch> node test-portfolio-media-e2e.js
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const API = process.env.WF_API || 'http://127.0.0.1:3019/api';

let pass = 0, fail = 0;
const check = async (n, fn) => { try { await fn(); console.log('  OK  ', n); pass++; } catch (e) { console.log('  FAIL', n, '-', e.message || e); fail++; } };
const j = async (m, p, tok, body) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};
const form = async (p, tok, fields) => {
  const fd = new FormData();
  for (const [k, name, type] of fields) fd.append(k, new Blob([Buffer.from('fixture-' + name)], { type }), name);
  const r = await fetch(API + p, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: fd });
  let d = null; try { d = await r.json(); } catch {}
  return { status: r.status, d };
};
const RUN = process.pid.toString(36) + Math.random().toString(36).slice(2, 8);
const onDisk = (url) => !process.env.WF_DATA || fs.existsSync(path.join(process.env.WF_DATA, url.replace(/^\/+/, '')));

(async () => {
  const A = (await j('POST', '/auth/register', null, { email: `pf-${RUN}@test.local`, password: 'pw123456', businessName: 'Folio Studio' })).d;
  assert(A?.token, 'could not register - is the server up on ' + API + ' ?');
  const B = (await j('POST', '/auth/register', null, { email: `pf2-${RUN}@test.local`, password: 'pw123456', businessName: 'Other Studio' })).d;

  let video, photo, poster1;

  await check('an uploaded video and photo land as items, named after their files', async () => {
    const r = await form('/media/portfolio/upload', A.token, [['files', 'Beach Reel.mp4', 'video/mp4'], ['files', 'bride.jpg', 'image/jpeg']]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.d));
    assert.strictEqual(r.d.added, 2);
    video = r.d.items.find(i => i.kind === 'video');
    photo = r.d.items.find(i => i.kind === 'photo');
    assert(video && photo, 'kinds not detected');
    assert.strictEqual(video.filename, 'Beach Reel.mp4');
    assert.strictEqual(video.title, null, 'the public title must stay empty until the creator names it');
    assert(video.video_url, 'a video item needs a playable url');
    assert.strictEqual(video.poster_url, null);
  });

  await check('non-media files are refused, not stored as broken photos', async () => {
    const r = await form('/media/portfolio/upload', A.token, [['files', 'notes.pdf', 'application/pdf']]);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.d.added, 0);
  });

  await check('a picked frame becomes the video thumbnail', async () => {
    const r = await form(`/media/portfolio/items/${video.id}/poster`, A.token, [['file', 'poster.jpg', 'image/jpeg']]);
    assert.strictEqual(r.status, 200, JSON.stringify(r.d));
    poster1 = r.d.items.find(i => i.id === video.id).poster_url;
    assert(poster1 && onDisk(poster1), 'poster not stored');
  });

  await check('replacing the thumbnail removes the old file', async () => {
    const r = await form(`/media/portfolio/items/${video.id}/poster`, A.token, [['file', 'poster2.png', 'image/png']]);
    const p2 = r.d.items.find(i => i.id === video.id).poster_url;
    assert(p2 && p2 !== poster1);
    assert(!process.env.WF_DATA || !onDisk(poster1), 'old poster left behind');
  });

  await check('a thumbnail must be an image', async () => {
    const r = await form(`/media/portfolio/items/${video.id}/poster`, A.token, [['file', 'x.mp4', 'video/mp4']]);
    assert.strictEqual(r.status, 400);
  });

  await check('another workspace cannot set my thumbnail', async () => {
    const r = await form(`/media/portfolio/items/${video.id}/poster`, B.token, [['file', 'p.jpg', 'image/jpeg']]);
    assert.strictEqual(r.status, 404);
  });

  await check('rename + framing are saved; bad framing clears it', async () => {
    await j('PUT', `/media/portfolio/items/${video.id}`, A.token, { title: 'Sunset at Clifton', focus: '30% 70%' });
    let it = (await j('GET', '/media/portfolio', A.token)).d.items.find(i => i.id === video.id);
    assert.strictEqual(it.title, 'Sunset at Clifton');
    assert.strictEqual(it.focus, '30% 70%');
    assert(it.poster_url, 'saving framing must not drop the thumbnail');
    await j('PUT', `/media/portfolio/items/${video.id}`, A.token, { focus: 'url(javascript:1)' });
    it = (await j('GET', '/media/portfolio', A.token)).d.items.find(i => i.id === video.id);
    assert.strictEqual(it.focus, null);
  });

  await check('position can be changed', async () => {
    await j('PUT', '/media/portfolio/items/order', A.token, { order: [photo.id, video.id] });
    const items = (await j('GET', '/media/portfolio', A.token)).d.items;
    assert.deepStrictEqual(items.map(i => i.id), [photo.id, video.id]);
  });

  await check('the public page never shows the original file name', async () => {
    const pf = (await j('PUT', '/media/portfolio', A.token, { is_public: true })).d;
    const r = await j('GET', `/media/public/portfolio/${pf.handle}`, null);
    assert.strictEqual(r.status, 200);
    const it = r.d.items.find(i => i.id === video.id);
    assert(it.poster_url && it.title === 'Sunset at Clifton');
    assert(!('filename' in it), 'filename leaked publicly');
  });

  await check('deleting the item removes its thumbnail file', async () => {
    const it = (await j('GET', '/media/portfolio', A.token)).d.items.find(i => i.id === video.id);
    await j('DELETE', `/media/portfolio/items/${video.id}`, A.token);
    assert(!process.env.WF_DATA || !onDisk(it.poster_url), 'poster left behind');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
