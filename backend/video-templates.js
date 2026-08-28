'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA STUDIO — CREATIVE PACKS  (flagship reel templates)
 * ─────────────────────────────────────────────────────────────────────────────
 *  A pack is a production-ready creative recipe: a look (LUT + colour), pacing,
 *  motion, transitions, title and call-to-action — presented like a movie poster
 *  (cover palette / mood / style). Applying one fills its slots with the shoot's
 *  media to the chosen DURATION (15 / 30 / 45 / 60s) and opens a fully-editable
 *  timeline that is ready to export immediately.
 *
 *  This is the single creative-recipe engine: "Apply template" (user/auto media)
 *  AND "AI Reel Draft" (AI-ranked media) both call buildTimeline() — so a Wedding
 *  shoot's AI draft IS the Wedding Cinematic pack.
 *
 *  ── WHY THIS WAS REWRITTEN ─────────────────────────────────────────────────
 *  The previous builder produced a uniform slideshow: every clip exactly the same
 *  length, the same transition on every cut, one title card, and nothing else.
 *  That is the difference between "a template" and "an edit", and it is why the
 *  results felt basic no matter how good the LUT was. An edit has:
 *
 *    • RHYTHM — beats of different lengths. A cut every 2.6s forever reads as a
 *      slideshow however pretty the grade is.
 *    • STRUCTURE — a hook that earns the next three seconds, a body, and an
 *      outro that lands rather than stopping.
 *    • VARIETY — transitions and motion that change through the reel.
 *    • A REASON TO ACT — a closing call-to-action, not just a title at the top.
 *
 *  All of it renders through capabilities backend/video-engine.js already had
 *  (9 transitions, per-clip speed/effects/kenBurns, multiple text tracks); none
 *  of this needs a renderer change. The multi-track editor can now show and edit
 *  every layer this produces.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const uid = (p = 'c') => p + '_' + Math.random().toString(16).slice(2, 10);

const DURATIONS = [15, 30, 45, 60];
const DEFAULT_DURATION = 60;

// Relative beat weights, cycled across the body of the reel and then normalised
// so the total lands exactly on the requested duration. The SHAPE is what
// matters, not the absolute numbers — [1,1,1,1] is the old slideshow.
const RHYTHMS = {
  // long holds broken by a quick pair — breathing room, then a lift
  elegant:  [1.5, 1.5, 0.8, 0.8, 1.7, 1.2],
  // even-ish with a gentle pulse; safe for corporate/education
  measured: [1.2, 1, 1.2, 1, 1.35, 1],
  // fast, syncopated, made for scroll-stopping
  punchy:   [0.6, 0.6, 1.1, 0.5, 0.5, 1.3, 0.7],
  // slow builds with one long anchor shot per phrase
  editorial:[1.8, 0.9, 0.9, 1.6, 0.7, 1.4],
};

const PACKS = [
  { id: 'wedding_luxury', name: 'Wedding Luxury', category: 'Wedding', style: 'Luxury',
    mood: 'Timeless elegance, warm golden light.', aspect: '9:16', lut: 'wedding_luxury',
    energy: 'calm', beatMs: 2600, rhythm: 'elegant',
    transitions: ['crossDissolve', 'fade', 'crossDissolve', 'dipToWhite'], transitionMs: 500,
    motion: ['zoomIn', 'pan', 'alt', 'zoomOut'], effects: [], outroEffects: ['vignette'],
    palette: ['#caa96a', '#3a2c1a'], titleText: true, cta: 'Enquire about your date' },

  { id: 'wedding_emotional', name: 'Wedding Emotional', category: 'Wedding', style: 'Emotional',
    mood: 'Vows, tears, the quiet in-between.', aspect: '9:16', lut: 'wedding_warm',
    energy: 'calm', beatMs: 3000, rhythm: 'editorial',
    transitions: ['dipToBlack', 'crossDissolve', 'fade'], transitionMs: 650,
    motion: ['zoomIn', 'alt', 'zoomIn'], effects: [], outroEffects: ['vignette'],
    palette: ['#dcab8c', '#43292a'], titleText: true, cta: 'Tell us your story' },

  { id: 'wedding_cinematic', name: 'Wedding Cinematic', category: 'Wedding', style: 'Cinematic',
    mood: 'Widescreen film, dramatic shadow.', aspect: '9:16', lut: 'cinematic_film',
    energy: 'balanced', beatMs: 2400, rhythm: 'editorial',
    transitions: ['crossDissolve', 'dipToBlack', 'crossDissolve', 'blur'], transitionMs: 550,
    motion: ['pan', 'zoomIn', 'alt'], effects: ['letterbox'], outroEffects: ['letterbox', 'vignette'],
    palette: ['#26323f', '#090d12'], titleText: true, cta: 'Book a consultation' },

  { id: 'realestate_luxury', name: 'Real Estate Luxury', category: 'Real Estate', style: 'Luxury',
    mood: 'Architectural, clean, aspirational.', aspect: '16:9', lut: 'real_estate_lux',
    energy: 'balanced', beatMs: 2700, rhythm: 'measured',
    transitions: ['fade', 'push', 'fade', 'slide'], transitionMs: 420,
    motion: ['pan', 'zoomOut', 'pan'], effects: [], outroEffects: [],
    palette: ['#a3b6c6', '#1b2730'], titleText: true, cta: 'Arrange a viewing' },

  { id: 'restaurant_premium', name: 'Restaurant Premium', category: 'Restaurant', style: 'Premium',
    mood: 'Sizzle, plating, candle-lit ambience.', aspect: '9:16', lut: 'restaurant_prem',
    energy: 'punchy', beatMs: 1700, rhythm: 'punchy',
    transitions: ['fade', 'zoom', 'fade', 'blur'], transitionMs: 280,
    motion: ['zoomIn', 'alt', 'zoomIn'], effects: [], outroEffects: ['vignette'],
    palette: ['#cda25b', '#2b1a11'], titleText: true, cta: 'Reserve a table' },

  { id: 'travel_story', name: 'Travel Story', category: 'Travel', style: 'Story',
    mood: 'Wander, horizons, golden hour.', aspect: '9:16', lut: 'travel_pop',
    energy: 'balanced', beatMs: 2000, rhythm: 'measured',
    transitions: ['fade', 'slide', 'crossDissolve', 'push'], transitionMs: 360,
    motion: ['pan', 'alt', 'zoomIn'], effects: [], outroEffects: [],
    palette: ['#e2a95c', '#184c5b'], titleText: true, cta: 'Plan your trip' },

  { id: 'corporate_brand', name: 'Corporate Brand', category: 'Corporate', style: 'Brand',
    mood: 'Confident, modern, on-message.', aspect: '16:9', lut: 'corporate_clean',
    energy: 'balanced', beatMs: 2600, rhythm: 'measured',
    transitions: ['fade', 'push', 'fade'], transitionMs: 480,
    motion: ['zoomOut', 'pan', 'zoomIn'], effects: ['letterbox'], outroEffects: ['letterbox'],
    palette: ['#4a6fa5', '#0f161f'], titleText: true, cta: 'Get in touch' },

  { id: 'fitness_energy', name: 'Fitness Energy', category: 'Fitness', style: 'Energy',
    mood: 'Fast, punchy, adrenaline.', aspect: '9:16', lut: 'social_pop',
    energy: 'punchy', beatMs: 1300, rhythm: 'punchy',
    transitions: ['zoom', 'fade', 'slide', 'zoom'], transitionMs: 200,
    motion: ['zoomIn', 'alt', 'zoomIn', 'zoomOut'], effects: ['vignette'], outroEffects: ['vignette', 'glow'],
    palette: ['#e0563b', '#141414'], titleText: true, cta: 'Start your programme' },

  { id: 'fashion_campaign', name: 'Fashion Campaign', category: 'Fashion', style: 'Campaign',
    mood: 'Bold, editorial, runway.', aspect: '4:5', lut: 'cinematic_film',
    energy: 'balanced', beatMs: 2200, rhythm: 'editorial',
    transitions: ['dipToBlack', 'crossDissolve', 'dipToWhite'], transitionMs: 420,
    motion: ['alt', 'zoomIn', 'pan'], effects: [], outroEffects: ['filmGrain'],
    palette: ['#1c1c1c', '#3c2c3c'], titleText: true, cta: 'See the collection' },

  { id: 'education_showcase', name: 'Education Showcase', category: 'Education', style: 'Showcase',
    mood: 'Clear, friendly, structured.', aspect: '16:9', lut: 'corporate_clean',
    energy: 'calm', beatMs: 2400, rhythm: 'measured',
    transitions: ['fade', 'slide', 'fade'], transitionMs: 360,
    motion: ['zoomIn', 'pan', 'zoomOut'], effects: [], outroEffects: [],
    palette: ['#3a8a7a', '#10201c'], titleText: true, cta: 'Enrol today' },

  { id: 'agency_portfolio', name: 'Agency Portfolio', category: 'Agency', style: 'Portfolio',
    mood: 'Sharp, premium, a reel of the work.', aspect: '16:9', lut: 'cinematic_film',
    energy: 'punchy', beatMs: 1900, rhythm: 'punchy',
    transitions: ['crossDissolve', 'push', 'blur', 'crossDissolve'], transitionMs: 420,
    motion: ['alt', 'zoomIn', 'pan'], effects: [], outroEffects: ['vignette'],
    palette: ['#5a5a6a', '#121216'], titleText: true, cta: 'Let’s work together' },

  { id: 'social_premium', name: 'Social Premium', category: 'Social', style: 'Premium',
    mood: 'Scroll-stopping, vibrant, now.', aspect: '9:16', lut: 'social_pop',
    energy: 'punchy', beatMs: 1400, rhythm: 'punchy',
    transitions: ['zoom', 'fade', 'slide'], transitionMs: 220,
    motion: ['zoomIn', 'alt', 'zoomOut'], effects: [], outroEffects: ['glow'],
    palette: ['#a05ad0', '#1a1030'], titleText: true, cta: 'Follow for more' },
];

// Ken Burns per motion name, varied slightly by index so consecutive shots on
// the same motion do not move identically — identical motion is the other half
// of why a uniform template reads as a slideshow.
function kenBurnsFor(motion, i) {
  const j = i % 2 ? 1 : -1;                    // alternate the drift direction
  const w = 1 + (i % 3) * 0.02;               // tiny per-shot variation in travel
  switch (motion) {
    case 'zoomIn':  return { fromScale: 1, toScale: 1.14 * w, fromX: 0, toX: 0.01 * j, fromY: 0, toY: 0 };
    case 'zoomOut': return { fromScale: 1.16 * w, toScale: 1, fromX: 0.01 * j, toX: 0, fromY: 0, toY: 0 };
    case 'pan':     return { fromScale: 1.12, toScale: 1.12, fromX: -0.05 * j, toX: 0.05 * j, fromY: 0, toY: 0 };
    case 'alt':     return i % 2
      ? { fromScale: 1.14, toScale: 1, fromX: 0.04, toX: 0, fromY: 0.01, toY: 0 }
      : { fromScale: 1, toScale: 1.14, fromX: -0.04, toX: 0, fromY: -0.01, toY: 0 };
    default:        return { fromScale: 1, toScale: 1.1, fromX: 0, toX: 0, fromY: 0, toY: 0 };
  }
}

function get(id) { return PACKS.find(p => p.id === id) || null; }

// gallery metadata (poster art comes from palette + the LUT's css, filled by caller)
function list() {
  return PACKS.map(p => ({
    id: p.id, name: p.name, category: p.category, style: p.style, mood: p.mood,
    aspect: p.aspect, lut: p.lut, palette: p.palette,
    energy: p.energy, cta: p.cta,
    durations: DURATIONS, recommendedDuration: DEFAULT_DURATION,
  }));
}

/**
 * Lay out beat lengths for `n` shots that sum to EXACTLY `targetMs`.
 *
 * The reel is shaped, not evenly sliced:
 *   hook  — the first shots run short, to earn the next three seconds
 *   body  — the pack's rhythm, cycled
 *   outro — the last shots run long, so the reel lands instead of stopping
 *
 * Rounding is absorbed by the final beat, so the sum is exact rather than
 * "close" — an export that is 60.04s long is a bug the user has to find.
 */
function beatPlan(pack, n, targetMs) {
  const rhythm = RHYTHMS[pack.rhythm] || RHYTHMS.measured;
  const hookN = n >= 8 ? 3 : n >= 5 ? 2 : 0;
  const outroN = n >= 8 ? 2 : n >= 5 ? 1 : 0;

  const weights = [];
  for (let i = 0; i < n; i++) {
    if (i < hookN) weights.push(0.55);                       // quick opening burst
    else if (i >= n - outroN) weights.push(1.9);             // hold the landing
    else weights.push(rhythm[(i - hookN) % rhythm.length]);
  }

  const total = weights.reduce((a, b) => a + b, 0);
  const ms = weights.map(w => Math.max(300, Math.round((w / total) * targetMs)));
  // Absorb the rounding drift in the last beat so the sum is exact.
  const drift = targetMs - ms.reduce((a, b) => a + b, 0);
  ms[ms.length - 1] = Math.max(300, ms[ms.length - 1] + drift);
  return { ms, hookN, outroN };
}

// Build a fully-editable timeline from a pack, filling slots with `media` (cycling
// if fewer than slots) to hit an EXACT target duration. media = [{ id, type }].
function buildTimeline(pack, media, opts = {}) {
  const aspect = opts.aspect || pack.aspect;
  const durationSec = DURATIONS.includes(opts.durationSec) ? opts.durationSec : DEFAULT_DURATION;
  const title = (opts.title || '').toString().trim().slice(0, 60);
  // The CTA is overridable so a caller (or the personalise flow) can speak in the
  // studio's own words; the pack's line is only a sensible default.
  const cta = (opts.cta !== undefined ? opts.cta : pack.cta || '').toString().trim().slice(0, 60);
  const targetMs = durationSec * 1000;

  if (!media.length) return { version: 1, aspect, fps: 30, duration: 0, tracks: [{ id: uid('t'), type: 'video', clips: [] }] };

  const tracks = [];
  const slotCount = Math.max(3, Math.min(80, Math.round(targetMs / pack.beatMs)));
  const { ms: beats, hookN, outroN } = beatPlan(pack, slotCount, targetMs);

  const transitions = pack.transitions && pack.transitions.length ? pack.transitions : ['fade'];
  const motions = pack.motion && pack.motion.length ? pack.motion : ['zoomIn'];

  const clips = [];
  let start = 0;
  for (let i = 0; i < slotCount; i++) {
    const m = media[i % media.length];
    const isVid = m.type === 'video';
    const dur = beats[i];
    const inHook = i < hookN;
    const inOutro = i >= slotCount - outroN;

    // A shorter transition on a short beat: a 500ms dissolve across a 550ms hook
    // shot is not a transition, it is the whole shot.
    const tMs = Math.max(120, Math.min(pack.transitionMs, Math.round(dur * 0.45)));

    const clip = {
      id: uid(), kind: isVid ? 'video' : 'photo', assetId: m.id,
      start, duration: dur, end: start + dur, in: 0, out: dur, speed: 1, reverse: false,
      transform: { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1, fit: 'cover' },
      // Cycled, not one type for the whole reel. The hook always cuts hard on the
      // first frame — an opening that fades in has already lost the scroll.
      transitionIn: i === 0 ? null : { type: transitions[i % transitions.length], duration: tMs },
      transitionOut: null,
      lut: pack.lut || null,
      effects: inOutro && pack.outroEffects ? [...pack.outroEffects] : (pack.effects ? [...pack.effects] : []),
    };
    // Video in the hook runs slightly hot; the outro settles below 1. Photos have
    // no speed to ramp, so they get their pace from the beat length alone.
    if (isVid) clip.speed = inHook ? 1.15 : inOutro ? 0.92 : 1;
    if (!isVid) clip.kenBurns = kenBurnsFor(motions[i % motions.length], i);
    clips.push(clip);
    start += dur;
  }
  tracks.push({ id: uid('t'), type: 'video', clips });

  // Title card — over the hook, out before the body starts.
  if (pack.titleText && title) {
    const tDur = Math.min(2800, Math.round(targetMs * 0.18));
    tracks.push({ id: uid('t'), type: 'text', clips: [{
      id: uid(), kind: 'text', start: 200, duration: tDur, end: 200 + tDur,
      text: { content: title, type: 'heading', font: 'sans', size: 64, weight: 800, color: '#ffffff', opacity: 1, align: 'center', letterSpacing: 0, animation: 'scale' },
      transform: { x: 0, y: -0.08, scale: 1, opacity: 1 },
    }] });
  }

  // Call to action — its OWN track, so it can be restyled or removed without
  // touching the title, and so both are visible as separate lanes in the editor.
  // A reel that ends without asking for anything is a portfolio piece, not
  // marketing, and this is a CRM: the reel exists to start a conversation.
  if (cta) {
    const cDur = Math.min(2600, Math.round(targetMs * 0.16));
    const cStart = Math.max(0, targetMs - cDur - 150);
    tracks.push({ id: uid('t'), type: 'text', clips: [{
      id: uid(), kind: 'text', start: cStart, duration: cDur, end: cStart + cDur,
      text: { content: cta, type: 'cta', font: 'sans', size: 44, weight: 700, color: '#ffffff', opacity: 1, align: 'center', letterSpacing: 0.5, animation: 'slide' },
      transform: { x: 0, y: 0.34, scale: 1, opacity: 1 },
    }] });
  }

  return { version: 1, aspect, fps: 30, duration: targetMs, tracks };
}

module.exports = { PACKS, DURATIONS, DEFAULT_DURATION, RHYTHMS, get, list, buildTimeline, beatPlan };
