'use strict';
// Verifies the dependency-free, pure parts of the native-shell + offline-first layer:
// offline store (conflict merge / queue / delta / reconcile / gating), reporter policy
// logic, uploader multipart + type detection, watcher media filter, device facts.
// Electron glue (main/preload/tray/notifications) is syntax-checked separately.

const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = (c, m) => { if (!c) { console.log('✗ FAIL:', m); process.exitCode = 1; throw new Error(m); } console.log('  ✓', m); };

const tmp = path.join(os.tmpdir(), 'wf-offline-' + process.pid + '.json');
function cleanup() { try { fs.unlinkSync(tmp); } catch {} try { fs.unlinkSync(tmp + '.tmp'); } catch {} try { fs.rmSync(path.join(process.cwd(), '.wappflow'), { recursive: true, force: true }); } catch {} }

console.log('[1] offline store — conflict merge (LWW scalars + append lists)');
const createStore = require('./src/main/offline/store');
const merge = createStore.mergeRecord;
const a = { id: '1', title: 'old', tags: ['x'], updated_at: '2026-06-24T10:00:00Z' };
const b = { id: '1', title: 'new', tags: ['y'], updated_at: '2026-06-24T11:00:00Z' };
const m = merge(a, b);
assert(m.title === 'new', 'newer updated_at wins scalar (title=new)');
assert(JSON.stringify([...m.tags].sort()) === JSON.stringify(['x', 'y']), 'array fields are union-merged');
const m2 = merge(b, a); // order-independent: b is newer
assert(m2.title === 'new', 'merge is order-independent for scalars');

console.log('\n[2] offline store — queue + delta + cursor + reconcile');
const store = createStore(tmp);
const qid = store.enqueue({ method: 'PATCH', path: '/api/leads/L1', body: { stage: 'won' }, entity: 'leads', entity_id: 'L1' }, 1000);
assert(store.pending().length === 1, 'mutation enqueued');
store.applyDelta({ changes: { leads: [{ id: 'L1', stage: 'new', updated_at: '1970-01-01T00:00:00Z' }] }, now: 'cur1' });
assert(store.getCursor() === 'cur1', 'cursor advanced from delta');
assert(store.pending().length === 1, 'older server record does NOT supersede a newer local write');
// now the server catches up (record newer than the queued ts) → supersede
store.applyDelta({ changes: { leads: [{ id: 'L1', stage: 'won', updated_at: new Date(5000).toISOString() }] }, now: 'cur2' });
assert(store.pending().length === 0, 'queued write superseded once server record is newer than the mutation ts');
store.markDone(qid); // idempotent
const got = store.getRecord('leads', 'L1');
assert(got && got.stage === 'won', 'cache reflects merged server record');

console.log('\n[3] offline store — entitlements gating + plan/brain caching');
store.applyDelta({ changes: {}, now: 'cur3', plan: { plan: 'studio' }, brain: { keep_rate: 0.7 } });
const ent = store.getEntitlements();
assert(ent && ent.plan && ent.plan.plan === 'studio', 'plan cached from delta for offline gating');
store.cacheEntitlements({ features: { style_profiles: false, media_studio: true } });
assert(store.can('media_studio') === true && store.can('style_profiles') === false, 'can() gates on cached features');
assert(store.can('unknown_feature') === true, 'unknown feature defaults allowed (online check governs)');

console.log('\n[4] reporter — policy interpretation + report payload');
const reporter = require('./src/main/reporter');
assert(reporter.cmpVer('1.2.0', '1.10.0') < 0, 'cmpVer is numeric per-segment (1.2 < 1.10)');
assert(reporter.interpretPolicy({ action: 'block' }, '0.1.0').action === 'block', 'server-provided action passes through');
assert(reporter.interpretPolicy({ blocked_versions: ['0.1.0'] }, '0.1.0').action === 'block', 'blocked version → block');
assert(reporter.interpretPolicy({ min_version: '0.2.0' }, '0.1.0').action === 'update', 'below min_version → update');
assert(reporter.interpretPolicy({ min_version: '0.2.0' }, '0.3.0').action === 'ok', 'at/above min_version → ok');
const rep = reporter.buildReport({ version: '0.1.0' });
assert(rep.device_id && rep.version === '0.1.0' && rep.platform, 'report payload has device_id + version + platform');

console.log('\n[5] uploader — type detection + hand-rolled multipart');
const uploader = require('./src/main/uploader');
assert(uploader.guessType('a.JPG') === 'image/jpeg' && uploader.guessType('clip.mp4') === 'video/mp4' && uploader.guessType('raw.cr2') === 'image/x-canon-cr2', 'mime detection covers photo/video/raw');
const { boundary, body } = uploader.buildMultipart({ folder_id: 'f1' }, { filename: 'p.jpg', content_type: 'image/jpeg', buffer: Buffer.from([1, 2, 3, 4]) });
const s = body.toString('latin1');
assert(s.includes(boundary) && s.includes('filename="p.jpg"') && s.includes('name="folder_id"'), 'multipart body has boundary + file + field');
assert(s.includes(`--${boundary}--`), 'multipart body is terminated');
assert(body.includes(Buffer.from([1, 2, 3, 4])), 'file bytes embedded in multipart body');

console.log('\n[6] watcher media filter + device facts');
const watcher = require('./src/main/watcher');
assert(watcher.isMedia('shot.CR3') && watcher.isMedia('reel.mov') && !watcher.isMedia('notes.txt'), 'isMedia accepts photo/video, rejects docs');
const device = require('./src/main/device');
const info = device.machineInfo();
assert(info.platform === process.platform && typeof info.cpu_count === 'number', 'machineInfo returns platform + cpu_count');

console.log('\n[7] video frame aggregation (Phase 8)');
const vf = require('./src/main/ai/video-frames');
const ts = vf.sampleTimestamps(10000, 5);
assert(ts.length === 5 && ts[0] >= 500 && ts[4] <= 9500 && ts[0] < ts[4], 'sampleTimestamps spreads N points inside the clip');
assert(vf.aggregate([]).length === 0, 'no frames → no scores (never blocks)');
const still = vf.aggregate([{ aesthetic: 0.8, sharpness: 100, meanL: 120 }, { aesthetic: 0.8, sharpness: 100, meanL: 120 }, { aesthetic: 0.8, sharpness: 100, meanL: 120 }]);
const sv = Object.fromEntries(still.map(s => [s.score_type, s.value]));
assert(sv.quality === 0.8, 'quality = mean per-frame aesthetic');
assert(sv.motion === 0 && sv.scene_cut === 0 && sv.shake === 0, 'static footage → zero motion/scene_cut/shake');
const cuts = vf.aggregate([{ aesthetic: 0.5, sharpness: 50, meanL: 20 }, { aesthetic: 0.5, sharpness: 50, meanL: 230 }, { aesthetic: 0.5, sharpness: 50, meanL: 20 }, { aesthetic: 0.5, sharpness: 50, meanL: 230 }]);
const cv = Object.fromEntries(cuts.map(s => [s.score_type, s.value]));
assert(cv.motion > 0.5 && cv.scene_cut > 0, 'hard cuts → high motion + scene_cut density');
const VALID = new Set(['shake', 'motion', 'quality', 'speech', 'emotion', 'scene_cut', 'action']);
assert(still.every(s => VALID.has(s.score_type)), 'emits only registry-valid video score_types');

cleanup();
console.log('\n✅ ALL DESKTOP NATIVE/OFFLINE CHECKS PASSED');
process.exit(0);
