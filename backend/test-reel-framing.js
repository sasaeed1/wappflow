'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Reel framing — does the crop keep the subject, and never show the void?
//
//  A 9:16 reel throws away ~62% of a 3:2 photograph's width. Centred, that is
//  what crops people out of their own wedding reel. Shifting the crop toward the
//  subject fixes it — but shifting too far is worse than not shifting at all:
//  past the edge of the image the renderer letterboxes to black, so an
//  over-eager reframe puts a strip of nothing beside the bride.
//
//  So the two properties that matter are opposites, and both are tested here:
//    1. the subject ends up as close to centre as possible
//    2. the crop NEVER leaves the image
//
//  Pure maths, no image decoding — the point comes from vision-cpu.js and this
//  module only decides what to do with it.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const F = require('./reel-framing.js');

let pass = 0, fail = 0;
const check = (n, fn) => {
  try { fn(); console.log('  ✓', n); pass++; }
  catch (e) { console.log('  ✗', n, '—', e.message); fail++; }
};

const NINE_SIXTEEN = '9:16';
const LANDSCAPE = { w: 3000, h: 2000 };   // 3:2, the common DSLR frame
const PORTRAIT = { w: 2000, h: 3000 };
// 9:16 is 0.5625 — NARROWER than a 2:3 portrait (0.667). So a normal portrait
// photo is still cropped at the SIDES in a reel, not top and bottom. Only a
// source taller than 9:16 has vertical slack to spend. This caught a wrong
// assumption in these tests before it could become a wrong assumption in the
// code, and it is why the two cases are named explicitly.
const TALLER_THAN_REEL = { w: 1000, h: 2500 };   // 0.40

console.log('\n[1] how much a cover-fit actually throws away');

check('a 3:2 photo in a 9:16 frame loses most of its width', () => {
  const o = F.coverOverflow(LANDSCAPE.w, LANDSCAPE.h, 9 / 16);
  assert(o.overflowX > 0.6, `only ${(o.overflowX * 100).toFixed(0)}% cropped — the maths is wrong`);
  assert.strictEqual(o.overflowY, 0, 'a wide source should not be cropped vertically too');
});

check('a 2:3 portrait is STILL cropped at the sides — it is wider than 9:16', () => {
  const o = F.coverOverflow(PORTRAIT.w, PORTRAIT.h, 9 / 16);
  assert(o.overflowX > 0, 'a 2:3 portrait (0.667) is wider than 9:16 (0.5625)');
  assert.strictEqual(o.overflowY, 0);
});

check('only a source TALLER than the reel loses height', () => {
  const o = F.coverOverflow(TALLER_THAN_REEL.w, TALLER_THAN_REEL.h, 9 / 16);
  assert.strictEqual(o.overflowX, 0);
  assert(o.overflowY > 0, 'a 2:5 source must crop top and bottom');
});

check('matching aspects throw nothing away', () => {
  const o = F.coverOverflow(1080, 1920, 9 / 16);
  assert(o.overflowX < 1e-9 && o.overflowY < 1e-9);
});

console.log('\n[2] the subject is brought toward the middle');

check('a subject on the LEFT third pulls the crop left', () => {
  const t = F.frameTransform({ srcW: LANDSCAPE.w, srcH: LANDSCAPE.h, frameAspect: NINE_SIXTEEN, subject: { x: 0.25, y: 0.5 } });
  assert(t.x > 0, `expected a positive shift, got ${t.x}`);
});

check('a subject on the RIGHT third pulls the crop right', () => {
  const t = F.frameTransform({ srcW: LANDSCAPE.w, srcH: LANDSCAPE.h, frameAspect: NINE_SIXTEEN, subject: { x: 0.75, y: 0.5 } });
  assert(t.x < 0, `expected a negative shift, got ${t.x}`);
});

check('a subject already centred is not moved', () => {
  const t = F.frameTransform({ srcW: LANDSCAPE.w, srcH: LANDSCAPE.h, frameAspect: NINE_SIXTEEN, subject: { x: 0.5, y: 0.5 }, bias: 0 });
  assert.strictEqual(t.x, 0);
  assert.strictEqual(t.y, 0);
});

check('the shift is EXACT when there is room for it', () => {
  // Subject at 0.4 needs +0.1; the overflow here is ~0.66 so the limit is ~0.33.
  const t = F.frameTransform({ srcW: LANDSCAPE.w, srcH: LANDSCAPE.h, frameAspect: NINE_SIXTEEN, subject: { x: 0.4, y: 0.5 } });
  assert(Math.abs(t.x - 0.1) < 1e-6, `expected 0.1, got ${t.x}`);
});

console.log('\n[3] the crop NEVER leaves the image');

check('an extreme subject is clamped to the edge of the available crop', () => {
  for (const sx of [0, 0.02, 0.98, 1]) {
    const t = F.frameTransform({ srcW: LANDSCAPE.w, srcH: LANDSCAPE.h, frameAspect: NINE_SIXTEEN, subject: { x: sx, y: 0.5 } });
    const limit = F.coverOverflow(LANDSCAPE.w, LANDSCAPE.h, 9 / 16).overflowX / 2;
    assert(Math.abs(t.x) <= limit + 1e-6,
      `subject at ${sx} shifted ${t.x}, past the limit ${limit.toFixed(4)} — black would show beside the subject`);
  }
});

check('no shift is EVER made on the axis that is not cropped', () => {
  // A wide source in a tall frame has no vertical slack. Shifting anyway would
  // expose the void above and below.
  const t = F.frameTransform({ srcW: LANDSCAPE.w, srcH: LANDSCAPE.h, frameAspect: NINE_SIXTEEN, subject: { x: 0.5, y: 0.1 }, bias: 0.2 });
  assert.strictEqual(t.y, 0, `shifted vertically by ${t.y} with no vertical overflow to spend`);
});

check('when aspects match, nothing moves in either axis', () => {
  const t = F.frameTransform({ srcW: 1080, srcH: 1920, frameAspect: NINE_SIXTEEN, subject: { x: 0.1, y: 0.9 } });
  assert.strictEqual(t.x, 0);
  assert.strictEqual(t.y, 0);
});

console.log('\n[4] the upward bias, and when NOT to reframe');

check('the bias pulls up only where there is vertical slack to spend', () => {
  // Heads sit above centre; feet do not need protecting.
  const withBias = F.frameTransform({ srcW: TALLER_THAN_REEL.w, srcH: TALLER_THAN_REEL.h, frameAspect: NINE_SIXTEEN, subject: { x: 0.5, y: 0.5 }, bias: 0.06 });
  const without = F.frameTransform({ srcW: TALLER_THAN_REEL.w, srcH: TALLER_THAN_REEL.h, frameAspect: NINE_SIXTEEN, subject: { x: 0.5, y: 0.5 }, bias: 0 });
  assert(withBias.y > without.y, 'the bias did nothing on an axis that is being cropped');
});

check('a near-matching shape is left alone entirely', () => {
  // Nudging a shot whose whole frame is visible anyway moves the picture for no
  // reason, and overrides a composition the photographer chose.
  assert.strictEqual(F.needsReframing(1080, 1900, NINE_SIXTEEN), false);
  assert.strictEqual(F.framingFor({ width: 1080, height: 1900, subject: { x: 0.2, y: 0.2 } }, NINE_SIXTEEN), null);
});

check('a genuinely mismatched shape IS reframed', () => {
  assert.strictEqual(F.needsReframing(LANDSCAPE.w, LANDSCAPE.h, NINE_SIXTEEN), true);
  const t = F.framingFor({ width: LANDSCAPE.w, height: LANDSCAPE.h, subject: { x: 0.2, y: 0.5 } }, NINE_SIXTEEN);
  assert(t && t.x > 0);
});

console.log('\n[5] missing or broken inputs never move the picture');

check('an asset with no subject point is left untouched', () => {
  assert.strictEqual(F.framingFor({ width: 3000, height: 2000 }, NINE_SIXTEEN), null,
    'an asset the vision pass has not seen would be shifted on no evidence');
});

check('missing dimensions are left untouched', () => {
  assert.strictEqual(F.framingFor({ subject: { x: 0.2, y: 0.3 } }, NINE_SIXTEEN), null);
  assert.strictEqual(F.framingFor({ width: 0, height: 0, subject: { x: 0.2, y: 0.3 } }, NINE_SIXTEEN), null);
});

check('nonsense never throws and never moves anything', () => {
  const bad = [
    { srcW: NaN, srcH: 100, frameAspect: NINE_SIXTEEN, subject: { x: 0.5, y: 0.5 } },
    { srcW: 100, srcH: 100, frameAspect: 'banana', subject: { x: 0.5, y: 0.5 } },
    { srcW: 100, srcH: 100, frameAspect: NINE_SIXTEEN, subject: { x: 'left', y: null } },
    { srcW: 100, srcH: 100, frameAspect: NINE_SIXTEEN, subject: null },
    {},
  ];
  for (const b of bad) {
    const t = F.frameTransform(b);
    assert(t && t.x === 0 && t.y === 0, `moved the picture on bad input: ${JSON.stringify(b)} → ${JSON.stringify(t)}`);
  }
});

check('aspect strings and numbers are both understood', () => {
  assert(Math.abs(F.aspectRatio('9:16') - 0.5625) < 1e-9);
  assert(Math.abs(F.aspectRatio('16:9') - 16 / 9) < 1e-9);
  assert.strictEqual(F.aspectRatio(0.5625), 0.5625);
  assert.strictEqual(F.aspectRatio('nonsense'), null);
});

console.log('\n[6] the builder actually applies it');

check('buildTimeline frames clips from their subject points', () => {
  const T = require('./video-templates.js');
  const media = [
    { id: 'a', type: 'photo', width: 3000, height: 2000, subject: { x: 0.2, y: 0.5 } },
    { id: 'b', type: 'photo', width: 3000, height: 2000, subject: { x: 0.8, y: 0.5 } },
  ];
  const doc = T.buildTimeline(T.get('wedding_luxury'), media, { durationSec: 15, aspect: '9:16', title: 'X' });
  const clips = doc.tracks.find(t => t.type === 'video').clips;
  const forA = clips.filter(c => c.assetId === 'a');
  const forB = clips.filter(c => c.assetId === 'b');
  assert(forA.every(c => c.transform.x > 0), 'a left-subject clip was not shifted right');
  assert(forB.every(c => c.transform.x < 0), 'a right-subject clip was not shifted left');
});

check('Ken Burns moves AROUND the framed point, not away from it', () => {
  const T = require('./video-templates.js');
  const media = [{ id: 'a', type: 'photo', width: 3000, height: 2000, subject: { x: 0.2, y: 0.5 } }];
  const doc = T.buildTimeline(T.get('travel_story'), media, { durationSec: 15, aspect: '9:16', title: 'X' });
  const c = doc.tracks.find(t => t.type === 'video').clips.find(x => x.kenBurns);
  assert(c, 'no photo clip carried a Ken Burns move');
  const off = c.transform.x;
  assert(off > 0);
  // Both ends of the pan must sit near the framed offset, or the subject drifts
  // out of shot over the beat.
  assert(Math.abs(c.kenBurns.fromX - off) < 0.2 && Math.abs(c.kenBurns.toX - off) < 0.2,
    `pan runs ${c.kenBurns.fromX}→${c.kenBurns.toX} but the subject is framed at ${off}`);
});

check('media with no subject point still builds, unshifted', () => {
  const T = require('./video-templates.js');
  const media = [{ id: 'a', type: 'photo', width: 3000, height: 2000 }];
  const doc = T.buildTimeline(T.get('wedding_luxury'), media, { durationSec: 15, aspect: '9:16', title: 'X' });
  const clips = doc.tracks.find(t => t.type === 'video').clips;
  assert(clips.every(c => c.transform.x === 0 && c.transform.y === 0));
  assert.strictEqual(clips[clips.length - 1].end, 15000, 'framing broke the exact-duration guarantee');
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
