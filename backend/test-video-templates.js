'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Reel templates — is it an EDIT, or a slideshow with a colour grade?
//
//  The old builder gave every clip the same duration, the same transition on
//  every cut, one title card and nothing else. Those are exactly the properties
//  that make a template feel basic, and none of them are visible in a still —
//  which is why they survived so long.
//
//  These assert the CAPABILITY of the output document: that beats vary, that
//  transitions vary, that the reel is shaped (fast open, held close), and that
//  it asks for something at the end. They do NOT assert particular numbers, so a
//  pack can be retuned without breaking the suite.
//
//  The exact-duration test is the important one: an export that is 60.04s long
//  is a defect the user has to discover for themselves.
// ════════════════════════════════════════════════════════════════════════════
const assert = require('assert');
const T = require('./video-templates.js');
const engine = require('./video-engine.js');

let pass = 0, fail = 0;
const check = (n, fn) => {
  try { fn(); console.log('  ✓', n); pass++; }
  catch (e) { console.log('  ✗', n, '—', e.message); fail++; }
};

// 14 photos + a couple of videos, the shape a real shoot hands in.
const MEDIA = Array.from({ length: 16 }, (_, i) => ({ id: `a${i}`, type: i % 7 === 3 ? 'video' : 'photo' }));
const videoClips = (doc) => doc.tracks.find(t => t.type === 'video').clips;
const textTracks = (doc) => doc.tracks.filter(t => t.type === 'text');

console.log('\n[1] the reel is exactly as long as it was asked to be');

check('every pack, every duration, lands on the exact millisecond', () => {
  for (const p of T.PACKS) {
    for (const sec of T.DURATIONS) {
      const doc = T.buildTimeline(p, MEDIA, { durationSec: sec, title: 'Test' });
      const clips = videoClips(doc);
      const total = clips[clips.length - 1].end;
      assert.strictEqual(total, sec * 1000,
        `${p.id} @ ${sec}s ended at ${total}ms`);
    }
  }
});

check('clips are contiguous — no gaps, no overlaps on the spine', () => {
  const doc = T.buildTimeline(T.get('wedding_luxury'), MEDIA, { durationSec: 30, title: 'X' });
  const clips = videoClips(doc);
  for (let i = 1; i < clips.length; i++) {
    assert.strictEqual(clips[i].start, clips[i - 1].end,
      `gap/overlap between clip ${i - 1} and ${i}`);
  }
});

console.log('\n[2] rhythm — the thing that separates an edit from a slideshow');

check('beat lengths VARY (the old builder made them all identical)', () => {
  for (const p of T.PACKS) {
    const doc = T.buildTimeline(p, MEDIA, { durationSec: 60, title: 'X' });
    const durs = new Set(videoClips(doc).map(c => c.duration));
    assert(durs.size >= 3,
      `${p.id}: only ${durs.size} distinct beat length(s) — that is a slideshow`);
  }
});

check('the reel is SHAPED: it opens faster than it closes', () => {
  for (const p of T.PACKS) {
    const clips = videoClips(T.buildTimeline(p, MEDIA, { durationSec: 60, title: 'X' }));
    assert(clips.length >= 8, `${p.id}: too few clips to shape`);
    const open = clips[0].duration, close = clips[clips.length - 1].duration;
    assert(close > open,
      `${p.id}: closes on ${close}ms after opening on ${open}ms — nothing to land on`);
  }
});

check('a very short reel still works and is not over-shaped', () => {
  // 15s of a punchy pack is only a handful of beats; hook/outro must stand down
  // rather than eating the whole reel.
  const doc = T.buildTimeline(T.get('wedding_emotional'), MEDIA, { durationSec: 15, title: 'X' });
  const clips = videoClips(doc);
  assert(clips.length >= 3, 'a 15s reel collapsed to fewer than 3 shots');
  assert.strictEqual(clips[clips.length - 1].end, 15000);
  for (const c of clips) assert(c.duration >= 300, `beat of ${c.duration}ms is below the floor`);
});

console.log('\n[3] variety — transitions and motion change through the reel');

check('more than one transition type is used', () => {
  for (const p of T.PACKS) {
    const clips = videoClips(T.buildTimeline(p, MEDIA, { durationSec: 60, title: 'X' }));
    const types = new Set(clips.map(c => c.transitionIn?.type).filter(Boolean));
    assert(types.size >= 2,
      `${p.id}: the whole reel uses "${[...types][0]}" — one transition everywhere is the old behaviour`);
  }
});

check('the opening shot cuts hard — it never fades in', () => {
  for (const p of T.PACKS) {
    const clips = videoClips(T.buildTimeline(p, MEDIA, { durationSec: 30, title: 'X' }));
    assert(!clips[0].transitionIn, `${p.id}: the reel fades in, losing the scroll`);
  }
});

check('a transition never swallows its own beat', () => {
  for (const p of T.PACKS) {
    for (const c of videoClips(T.buildTimeline(p, MEDIA, { durationSec: 15, title: 'X' }))) {
      if (!c.transitionIn) continue;
      assert(c.transitionIn.duration <= c.duration * 0.5 + 1,
        `${p.id}: ${c.transitionIn.duration}ms transition on a ${c.duration}ms beat`);
    }
  }
});

check('photo motion is not identical shot to shot', () => {
  const clips = videoClips(T.buildTimeline(T.get('travel_story'), MEDIA, { durationSec: 60, title: 'X' }))
    .filter(c => c.kenBurns);
  const shapes = new Set(clips.map(c => JSON.stringify(c.kenBurns)));
  assert(shapes.size >= 3, `only ${shapes.size} distinct camera moves across ${clips.length} photos`);
});

console.log('\n[4] the reel asks for something');

check('title and CTA are SEPARATE text tracks', () => {
  const doc = T.buildTimeline(T.get('wedding_luxury'), MEDIA, { durationSec: 30, title: 'Ayesha & Bilal' });
  assert.strictEqual(textTracks(doc).length, 2,
    'title and CTA share a track — one cannot be restyled or removed without the other');
});

check('the CTA lands at the END, inside the reel', () => {
  const doc = T.buildTimeline(T.get('restaurant_premium'), MEDIA, { durationSec: 30, title: 'X' });
  const cta = textTracks(doc).flatMap(t => t.clips).find(c => c.text.type === 'cta');
  assert(cta, 'no call to action — the reel just stops');
  assert(cta.end <= 30000, `CTA runs past the end of the reel (${cta.end}ms)`);
  assert(cta.start > 30000 * 0.6, `CTA appears at ${cta.start}ms — that is not the ending`);
});

check('a caller can override or suppress the CTA', () => {
  const own = T.buildTimeline(T.get('travel_story'), MEDIA, { durationSec: 30, title: 'X', cta: 'Call us' });
  assert(own.tracks.flatMap(t => t.clips).some(c => c.text?.content === 'Call us'), 'override ignored');
  const none = T.buildTimeline(T.get('travel_story'), MEDIA, { durationSec: 30, title: 'X', cta: '' });
  assert(!none.tracks.flatMap(t => t.clips).some(c => c.text?.type === 'cta'), 'CTA could not be suppressed');
});

console.log('\n[5] the renderer accepts what we build');

check('every pack survives sanitizeTimeline with its structure intact', () => {
  // The engine silently drops what it does not recognise, so a template that
  // produced an unknown transition or effect would quietly lose it on export.
  for (const p of T.PACKS) {
    const built = T.buildTimeline(p, MEDIA, { durationSec: 30, title: 'X' });
    const clean = engine.sanitizeTimeline(built);
    assert.strictEqual(clean.tracks.length, built.tracks.length,
      `${p.id}: the renderer dropped a track`);
    const bIn = videoClips(built).filter(c => c.transitionIn).length;
    const cIn = clean.tracks.find(t => t.type === 'video').clips.filter(c => c.transitionIn).length;
    assert.strictEqual(cIn, bIn, `${p.id}: ${bIn - cIn} transition(s) were rejected by the renderer`);
    for (const c of videoClips(built)) {
      for (const fx of c.effects) assert(clean.tracks[0].clips.some(x => x.effects.includes(fx)),
        `${p.id}: effect "${fx}" is not one the renderer knows`);
    }
  }
});

check('no pack exceeds the renderer track limit', () => {
  for (const p of T.PACKS) {
    const doc = T.buildTimeline(p, MEDIA, { durationSec: 60, title: 'X' });
    assert(doc.tracks.length <= 12, `${p.id} builds ${doc.tracks.length} tracks`);
  }
});

check('a shoot with ONE photo still produces a valid reel', () => {
  const doc = T.buildTimeline(T.get('social_premium'), [{ id: 'solo', type: 'photo' }], { durationSec: 15, title: 'X' });
  const clips = videoClips(doc);
  assert(clips.length >= 3, 'one photo did not cycle into slots');
  assert(clips.every(c => c.assetId === 'solo'));
  assert.strictEqual(clips[clips.length - 1].end, 15000);
});

check('no media at all returns an empty timeline rather than throwing', () => {
  const doc = T.buildTimeline(T.get('social_premium'), [], { durationSec: 30 });
  assert.strictEqual(doc.duration, 0);
  assert.strictEqual(doc.tracks.length, 1);
});

console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'}: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
