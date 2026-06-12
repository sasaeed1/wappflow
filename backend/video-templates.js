'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA STUDIO — VIDEO TEMPLATES  (reel recipes)
 * ─────────────────────────────────────────────────────────────────────────────
 *  A template is a "recipe": a paced sequence of placeholder slots, each with
 *  motion (Ken Burns), a transition, and a graded look (LUT). Applying one builds
 *  a real timeline document by dropping the photographer's media into the slots
 *  in order — then it's a normal, fully-editable reel that exports like any other.
 *
 *  Scoped to what the export engine renders today (photo/video slots, Ken Burns,
 *  transitions, LUT/effects). Text/music placeholders come with those features.
 *  Built-in recipes only here; per-workspace custom templates use ms_video_templates.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const uid = (p = 'c') => p + '_' + Math.random().toString(16).slice(2, 10);

// id, name, category, authored aspect, look (lut id), slotCount, slotMs (per slot),
// motion pattern, transition (between slots) + duration, optional effects.
const TEMPLATES = [
  { id: 'wedding_highlights', name: 'Wedding Highlights', category: 'Wedding', aspect: '9:16', lut: 'wedding_warm', slotCount: 8, slotMs: 2200, motion: 'alt', transition: 'fade', transitionMs: 450, effects: [] },
  { id: 'wedding_firstdance', name: 'First Dance',        category: 'Wedding', aspect: '9:16', lut: 'wedding_luxury', slotCount: 6, slotMs: 3000, motion: 'zoomIn', transition: 'dipToBlack', transitionMs: 600, effects: ['vignette'] },
  { id: 'realestate_tour',    name: 'Property Tour',      category: 'Real Estate', aspect: '16:9', lut: 'real_estate_lux', slotCount: 8, slotMs: 2600, motion: 'pan', transition: 'fade', transitionMs: 400, effects: [] },
  { id: 'restaurant_tease',   name: 'Menu Tease',         category: 'Restaurant', aspect: '9:16', lut: 'restaurant_prem', slotCount: 7, slotMs: 1500, motion: 'zoomIn', transition: 'fade', transitionMs: 250, effects: [] },
  { id: 'travel_diary',       name: 'Travel Diary',       category: 'Travel', aspect: '9:16', lut: 'travel_pop', slotCount: 8, slotMs: 2000, motion: 'alt', transition: 'fade', transitionMs: 350, effects: [] },
  { id: 'corporate_story',    name: 'Brand Story',        category: 'Corporate', aspect: '16:9', lut: 'corporate_clean', slotCount: 6, slotMs: 2800, motion: 'zoomOut', transition: 'fade', transitionMs: 500, effects: ['letterbox'] },
  { id: 'social_quick',       name: 'Quick Reel',         category: 'Social', aspect: '9:16', lut: 'social_pop', slotCount: 10, slotMs: 1200, motion: 'zoomIn', transition: 'fade', transitionMs: 200, effects: [] },
  { id: 'fitness_energy',     name: 'Energy',             category: 'Fitness', aspect: '9:16', lut: 'social_pop', slotCount: 8, slotMs: 1400, motion: 'zoomIn', transition: 'fade', transitionMs: 220, effects: ['vignette'] },
  { id: 'fashion_lookbook',   name: 'Lookbook',           category: 'Fashion', aspect: '4:5', lut: 'cinematic_film', slotCount: 7, slotMs: 2400, motion: 'alt', transition: 'dipToBlack', transitionMs: 400, effects: [] },
  { id: 'product_showcase',   name: 'Product Showcase',   category: 'Product', aspect: '1:1', lut: 'social_pop', slotCount: 6, slotMs: 1800, motion: 'zoomIn', transition: 'fade', transitionMs: 300, effects: [] },
];

function kenBurnsFor(motion, i) {
  switch (motion) {
    case 'zoomIn':  return { fromScale: 1, toScale: 1.16, fromX: 0, toX: 0, fromY: 0, toY: 0 };
    case 'zoomOut': return { fromScale: 1.16, toScale: 1, fromX: 0, toX: 0, fromY: 0, toY: 0 };
    case 'pan':     return { fromScale: 1.12, toScale: 1.12, fromX: -0.05, toX: 0.05, fromY: 0, toY: 0 };
    case 'alt':     return i % 2
      ? { fromScale: 1.14, toScale: 1, fromX: 0.04, toX: 0, fromY: 0, toY: 0 }
      : { fromScale: 1, toScale: 1.14, fromX: -0.04, toX: 0, fromY: 0, toY: 0 };
    default:        return { fromScale: 1, toScale: 1.1, fromX: 0, toX: 0, fromY: 0, toY: 0 };
  }
}

function get(id) { return TEMPLATES.find(t => t.id === id) || null; }

// list metadata for the gallery (css filled in by the caller from the LUT library)
function list() {
  return TEMPLATES.map(t => ({ id: t.id, name: t.name, category: t.category, aspect: t.aspect, lut: t.lut, slotCount: t.slotCount, durationMs: t.slotCount * t.slotMs }));
}

// Build a timeline document by filling the template's slots with `media` in order.
// media = [{ id, type }]; cycles if there are fewer media than slots.
function buildTimeline(tpl, media, aspectOverride) {
  const aspect = aspectOverride || tpl.aspect;
  const clips = [];
  let start = 0;
  for (let i = 0; i < tpl.slotCount && media.length; i++) {
    const m = media[i % media.length];
    const isVid = m.type === 'video';
    const dur = tpl.slotMs;
    const clip = {
      id: uid(), kind: isVid ? 'video' : 'photo', assetId: m.id,
      start, duration: dur, end: start + dur, in: 0, out: dur, speed: 1, reverse: false,
      transform: { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1, fit: 'cover' },
      transitionIn: (i > 0 && tpl.transition && tpl.transition !== 'none') ? { type: tpl.transition, duration: tpl.transitionMs } : null,
      transitionOut: null,
      lut: tpl.lut || null,
      effects: tpl.effects ? [...tpl.effects] : [],
    };
    if (!isVid) clip.kenBurns = kenBurnsFor(tpl.motion, i);
    clips.push(clip);
    start += dur;
  }
  return { version: 1, aspect, fps: 30, tracks: [{ id: uid('t'), type: 'video', clips }] };
}

module.exports = { TEMPLATES, get, list, buildTimeline };
