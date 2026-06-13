'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA STUDIO — AI REEL DRAFTS  (control-first)
 * ─────────────────────────────────────────────────────────────────────────────
 *  Generates draft reels by ANALYSING the shoot with the on-device CV scores
 *  (quality, sharpness) and the photographer's own cull data (keepers, ratings,
 *  duplicate groups). It selects + orders the strongest shots and assembles them
 *  into a styled timeline — a starting point the human then edits and exports.
 *
 *  Control-first by construction: a draft is just a normal `ms_timelines` row
 *  (source='ai_draft'). The AI never publishes, delivers, or exports. Drafts are
 *  fully editable, regenerable, and refreshable; nothing happens without the user.
 *
 *  No LLM key required — this is the same advisory CV lane the rest of Studio
 *  uses. (Face/smile scoring is a future enhancement; not in the current CV.)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const videoTemplates = require('./video-templates');

// Each style = creative direction (look + pacing + motion) + a selection strategy.
const DRAFT_STYLES = [
  { id: 'cinematic_highlights', name: 'Cinematic Highlights', desc: 'Your strongest frames, graded and paced like a film.', lut: 'cinematic_film', slotMs: 2400, motion: 'alt', transition: 'fade', transitionMs: 450, effects: ['letterbox'], maxShots: 10, order: 'best', aspect: '9:16' },
  { id: 'emotional_story',      name: 'Emotional Story',      desc: 'A gentle, chronological story of the day.',          lut: 'wedding_warm', slotMs: 2800, motion: 'zoomIn', transition: 'dipToBlack', transitionMs: 600, effects: [], maxShots: 9, order: 'story', aspect: '9:16' },
  { id: 'social_short',         name: 'Social Short',         desc: 'Fast, punchy, made for the feed.',                    lut: 'social_pop', slotMs: 1200, motion: 'zoomIn', transition: 'fade', transitionMs: 200, effects: [], maxShots: 12, order: 'best', aspect: '9:16' },
  { id: 'wedding_highlights',   name: 'Wedding Highlights',   desc: 'Warm, romantic highlights reel.',                     lut: 'wedding_luxury', slotMs: 2400, motion: 'alt', transition: 'fade', transitionMs: 450, effects: [], maxShots: 10, order: 'story', aspect: '9:16' },
  { id: 'realestate_tour',      name: 'Real Estate Tour',     desc: 'Clean, steady walkthrough of the space.',             lut: 'real_estate_lux', slotMs: 2600, motion: 'pan', transition: 'fade', transitionMs: 400, effects: [], maxShots: 10, order: 'story', aspect: '16:9' },
  { id: 'promotional',          name: 'Promotional',          desc: 'Punchy, brand-forward promo cut.',                    lut: 'corporate_clean', slotMs: 1600, motion: 'zoomIn', transition: 'fade', transitionMs: 250, effects: [], maxShots: 10, order: 'best', aspect: '9:16' },
];

const REC = {
  wedding:     ['wedding_highlights', 'emotional_story', 'cinematic_highlights'],
  event:       ['cinematic_highlights', 'social_short', 'emotional_story'],
  portrait:    ['cinematic_highlights', 'social_short', 'emotional_story'],
  real_estate: ['realestate_tour', 'cinematic_highlights', 'promotional'],
  commercial:  ['promotional', 'cinematic_highlights', 'social_short'],
  product:     ['promotional', 'social_short', 'cinematic_highlights'],
};

function getStyle(id) { return DRAFT_STYLES.find(s => s.id === id) || null; }
function recommendStyles(projectType) { return REC[projectType] || ['cinematic_highlights', 'social_short', 'emotional_story']; }
function styleList() { return DRAFT_STYLES.map(s => ({ id: s.id, name: s.name, desc: s.desc, aspect: s.aspect, lut: s.lut })); }

// How much faces/smiles matter, by style (people-centric styles weight them up).
// Consumed only when a face detector has written 'faces'/'smile' scores; harmless otherwise.
const FACE_WEIGHT = { emotional_story: 0.45, wedding_highlights: 0.4, cinematic_highlights: 0.2, social_short: 0.2, promotional: 0.1, realestate_tour: 0 };
function styleFaceWeight(styleId) { return FACE_WEIGHT[styleId] != null ? FACE_WEIGHT[styleId] : 0.2; }

// Rank media by CV quality + cull signals (+ faces/smiles when available); drop
// rejects; one shot per duplicate group. faceWeight tunes the people-shot boost.
function rankMedia(rows, { faceWeight = 0 } = {}) {
  const scored = [];
  for (const r of rows) {
    if (r.decision === 'reject') continue; // human rejected → never in a draft
    let score = (r.quality != null ? r.quality : 0.4);
    if (r.decision === 'keep') score += 0.6;
    if (r.rating) score += r.rating * 0.08;
    if (r.sharpness != null && r.sharpness < 120) score -= 0.12; // soft penalty
    if (faceWeight) { // advisory face/smile signals (present only if a detector ran)
      if (r.faces) score += faceWeight;
      if (r.smile) score += r.smile * faceWeight * 0.6;
    }
    scored.push({ id: r.id, type: r.type, score, dup: r.dup_group || null, when: r.capture_time || r.created_at || '' });
  }
  scored.sort((a, b) => b.score - a.score);
  // dedup: keep the best-scored member of each duplicate group
  const seen = new Set();
  const out = [];
  for (const m of scored) {
    if (m.dup) { if (seen.has(m.dup)) continue; seen.add(m.dup); }
    out.push(m);
  }
  return out;
}

// Pick + order the shots for a style from the ranked list.
function selectForStyle(ranked, style) {
  const n = Math.min(style.maxShots, ranked.length);
  const chosen = ranked.slice(0, n);
  if (style.order === 'story') chosen.sort((a, b) => String(a.when).localeCompare(String(b.when)));
  return chosen.map(m => ({ id: m.id, type: m.type }));
}

function signatureOf(media) {
  return crypto.createHash('sha1').update(media.map(m => m.id).sort().join(',')).digest('hex').slice(0, 16);
}

// Build a draft timeline document (reuses the template builder with AI-selected media).
function buildDraft(style, media, aspectOverride) {
  const tpl = { slotCount: media.length, slotMs: style.slotMs, motion: style.motion, transition: style.transition, transitionMs: style.transitionMs, lut: style.lut, effects: style.effects, aspect: style.aspect };
  return videoTemplates.buildTimeline(tpl, media, aspectOverride || style.aspect);
}

module.exports = { DRAFT_STYLES, getStyle, recommendStyles, styleList, rankMedia, styleFaceWeight, selectForStyle, signatureOf, buildDraft };
