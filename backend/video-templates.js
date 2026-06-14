'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA STUDIO — CREATIVE PACKS  (flagship reel templates)
 * ─────────────────────────────────────────────────────────────────────────────
 *  A pack is a production-ready creative recipe: a look (LUT + colour), pacing,
 *  motion (Ken Burns), transitions, an optional title card — presented like a
 *  movie poster (cover palette / mood / style). Applying one fills its slots
 *  with the shoot's media to the chosen DURATION (15 / 30 / 45 / 60s) and opens
 *  a fully-editable timeline that's ready to export immediately.
 *
 *  This is the single creative-recipe engine: "Apply template" (user/auto media)
 *  AND "AI Reel Draft" (AI-ranked media) both call buildTimeline() — so a Wedding
 *  shoot's AI draft IS the Wedding Cinematic pack.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const uid = (p = 'c') => p + '_' + Math.random().toString(16).slice(2, 10);

const DURATIONS = [15, 30, 45, 60];
const DEFAULT_DURATION = 60;

// pacing: slotMs = the "feel" of each beat. The builder rescales to hit the exact
// chosen duration, but slotMs sets how many shots a duration becomes (energy).
const PACKS = [
  { id: 'wedding_luxury',     name: 'Wedding Luxury',     category: 'Wedding',     style: 'Luxury',    mood: 'Timeless elegance, warm golden light.',        aspect: '9:16', lut: 'wedding_luxury',  slotMs: 2600, motion: 'alt',     transition: 'fade',         transitionMs: 500, effects: [],            palette: ['#caa96a', '#3a2c1a'], titleText: true },
  { id: 'wedding_emotional',  name: 'Wedding Emotional',  category: 'Wedding',     style: 'Emotional', mood: 'Vows, tears, the quiet in-between.',           aspect: '9:16', lut: 'wedding_warm',    slotMs: 3000, motion: 'zoomIn',  transition: 'dipToBlack',   transitionMs: 650, effects: [],            palette: ['#dcab8c', '#43292a'], titleText: true },
  { id: 'wedding_cinematic',  name: 'Wedding Cinematic',  category: 'Wedding',     style: 'Cinematic', mood: 'Widescreen film, dramatic shadow.',            aspect: '9:16', lut: 'cinematic_film',  slotMs: 2400, motion: 'pan',     transition: 'crossDissolve',transitionMs: 550, effects: ['letterbox'], palette: ['#26323f', '#090d12'], titleText: true },
  { id: 'realestate_luxury',  name: 'Real Estate Luxury', category: 'Real Estate', style: 'Luxury',    mood: 'Architectural, clean, aspirational.',          aspect: '16:9', lut: 'real_estate_lux', slotMs: 2700, motion: 'pan',     transition: 'fade',         transitionMs: 420, effects: [],            palette: ['#a3b6c6', '#1b2730'], titleText: true },
  { id: 'restaurant_premium', name: 'Restaurant Premium', category: 'Restaurant',  style: 'Premium',   mood: 'Sizzle, plating, candle-lit ambience.',        aspect: '9:16', lut: 'restaurant_prem', slotMs: 1700, motion: 'zoomIn',  transition: 'fade',         transitionMs: 280, effects: [],            palette: ['#cda25b', '#2b1a11'], titleText: true },
  { id: 'travel_story',       name: 'Travel Story',       category: 'Travel',      style: 'Story',     mood: 'Wander, horizons, golden hour.',               aspect: '9:16', lut: 'travel_pop',      slotMs: 2000, motion: 'alt',     transition: 'fade',         transitionMs: 360, effects: [],            palette: ['#e2a95c', '#184c5b'], titleText: true },
  { id: 'corporate_brand',    name: 'Corporate Brand',    category: 'Corporate',   style: 'Brand',     mood: 'Confident, modern, on-message.',               aspect: '16:9', lut: 'corporate_clean', slotMs: 2600, motion: 'zoomOut', transition: 'fade',         transitionMs: 480, effects: ['letterbox'], palette: ['#4a6fa5', '#0f161f'], titleText: true },
  { id: 'fitness_energy',     name: 'Fitness Energy',     category: 'Fitness',     style: 'Energy',    mood: 'Fast, punchy, adrenaline.',                    aspect: '9:16', lut: 'social_pop',      slotMs: 1300, motion: 'zoomIn',  transition: 'fade',         transitionMs: 200, effects: ['vignette'],  palette: ['#e0563b', '#141414'], titleText: true },
  { id: 'fashion_campaign',   name: 'Fashion Campaign',   category: 'Fashion',     style: 'Campaign',  mood: 'Bold, editorial, runway.',                     aspect: '4:5',  lut: 'cinematic_film',  slotMs: 2200, motion: 'alt',     transition: 'dipToBlack',   transitionMs: 420, effects: [],            palette: ['#1c1c1c', '#3c2c3c'], titleText: true },
  { id: 'education_showcase', name: 'Education Showcase', category: 'Education',   style: 'Showcase',  mood: 'Clear, friendly, structured.',                 aspect: '16:9', lut: 'corporate_clean', slotMs: 2400, motion: 'zoomIn',  transition: 'fade',         transitionMs: 360, effects: [],            palette: ['#3a8a7a', '#10201c'], titleText: true },
  { id: 'agency_portfolio',   name: 'Agency Portfolio',   category: 'Agency',      style: 'Portfolio', mood: 'Sharp, premium, a reel of the work.',          aspect: '16:9', lut: 'cinematic_film',  slotMs: 1900, motion: 'alt',     transition: 'crossDissolve',transitionMs: 420, effects: [],            palette: ['#5a5a6a', '#121216'], titleText: true },
  { id: 'social_premium',     name: 'Social Premium',     category: 'Social',      style: 'Premium',   mood: 'Scroll-stopping, vibrant, now.',               aspect: '9:16', lut: 'social_pop',      slotMs: 1400, motion: 'zoomIn',  transition: 'fade',         transitionMs: 220, effects: [],            palette: ['#a05ad0', '#1a1030'], titleText: true },
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

function get(id) { return PACKS.find(p => p.id === id) || null; }

// gallery metadata (poster art comes from palette + the LUT's css, filled by caller)
function list() {
  return PACKS.map(p => ({
    id: p.id, name: p.name, category: p.category, style: p.style, mood: p.mood,
    aspect: p.aspect, lut: p.lut, palette: p.palette, durations: DURATIONS, recommendedDuration: DEFAULT_DURATION,
  }));
}

// Build a fully-editable timeline from a pack, filling slots with `media` (cycling
// if fewer than slots) to hit an EXACT target duration. Optional title card overlays
// the opening. media = [{ id, type }].
function buildTimeline(pack, media, opts = {}) {
  const aspect = opts.aspect || pack.aspect;
  const durationSec = DURATIONS.includes(opts.durationSec) ? opts.durationSec : DEFAULT_DURATION;
  const title = (opts.title || '').toString().trim().slice(0, 60);
  const targetMs = durationSec * 1000;

  const tracks = [];
  if (!media.length) return { version: 1, aspect, fps: 30, duration: 0, tracks: [{ id: uid('t'), type: 'video', clips: [] }] };

  // how many shots → exact fill (slotMs rescaled so the reel is precisely targetMs)
  const slotCount = Math.max(3, Math.min(80, Math.round(targetMs / pack.slotMs)));
  const slotMs = Math.round(targetMs / slotCount);

  const clips = [];
  let start = 0;
  for (let i = 0; i < slotCount; i++) {
    const m = media[i % media.length];
    const isVid = m.type === 'video';
    const dur = (i === slotCount - 1) ? (targetMs - start) : slotMs; // last clip absorbs rounding → exact total
    const clip = {
      id: uid(), kind: isVid ? 'video' : 'photo', assetId: m.id,
      start, duration: dur, end: start + dur, in: 0, out: dur, speed: 1, reverse: false,
      transform: { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1, fit: 'cover' },
      transitionIn: (i > 0 && pack.transition && pack.transition !== 'none') ? { type: pack.transition, duration: pack.transitionMs } : null,
      transitionOut: null,
      lut: pack.lut || null,
      effects: pack.effects ? [...pack.effects] : [],
    };
    if (!isVid) clip.kenBurns = kenBurnsFor(pack.motion, i);
    clips.push(clip);
    start += dur;
  }
  tracks.push({ id: uid('t'), type: 'video', clips });

  // title card — overlays the opening shots, fades in/out (premium, editable)
  if (pack.titleText && title) {
    const tDur = Math.min(2800, Math.round(targetMs * 0.18));
    tracks.push({ id: uid('t'), type: 'text', clips: [{
      id: uid(), kind: 'text', start: 200, duration: tDur, end: 200 + tDur,
      text: { content: title, type: 'heading', font: 'sans', size: 64, weight: 800, color: '#ffffff', opacity: 1, align: 'center', letterSpacing: 0, animation: 'fade' },
      transform: { x: 0, y: 0, scale: 1, opacity: 1 },
    }] });
  }

  return { version: 1, aspect, fps: 30, duration: targetMs, tracks };
}

module.exports = { PACKS, DURATIONS, DEFAULT_DURATION, get, list, buildTimeline };
