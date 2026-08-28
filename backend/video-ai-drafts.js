'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA STUDIO — AI REEL DRAFTS  (control-first, pack-powered)
 * ─────────────────────────────────────────────────────────────────────────────
 *  An AI draft = the shoot's best media, ranked by the on-device CV scores +
 *  the photographer's cull data, poured into the matching CREATIVE PACK recipe.
 *  Wedding shoot → "Wedding Cinematic" pack → editable, premium-looking timeline.
 *
 *  Control-first: drafts are normal editable timelines; the AI never exports or
 *  delivers. No LLM key needed — this is the advisory CV lane.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const videoTemplates = require('./video-templates');

// Which packs to suggest for a shoot type (first = primary AI draft).
const REC = {
  wedding:     ['wedding_cinematic', 'wedding_emotional', 'wedding_luxury'],
  event:       ['social_premium', 'wedding_cinematic', 'travel_story'],
  portrait:    ['fashion_campaign', 'social_premium', 'wedding_emotional'],
  real_estate: ['realestate_luxury', 'corporate_brand', 'agency_portfolio'],
  commercial:  ['corporate_brand', 'agency_portfolio', 'social_premium'],
  product:     ['social_premium', 'fashion_campaign', 'restaurant_premium'],
};
const FACE_WEIGHT_BY_CAT = { Wedding: 0.45, Fashion: 0.4, Fitness: 0.3, Social: 0.25, Travel: 0.2, Agency: 0.15, Restaurant: 0.1, Education: 0.1, Corporate: 0.05, 'Real Estate': 0 };
const STORY_CATS = new Set(['Wedding', 'Travel', 'Real Estate', 'Education']);

function recommendStyles(projectType) { return REC[projectType] || ['social_premium', 'agency_portfolio', 'travel_story']; }
function getStyle(id) { return videoTemplates.get(id); }
function styleList() {
  // energy + cta ride along so the personalise flow can narrow packs by how the
  // reel should FEEL, not just what it is of. Without them the client would have
  // to keep its own copy of that mapping, which is how two catalogues drift.
  return videoTemplates.list().map(p => ({ id: p.id, name: p.name, desc: p.mood, category: p.category, style: p.style, aspect: p.aspect, lut: p.lut, palette: p.palette, energy: p.energy, cta: p.cta }));
}
function styleFaceWeight(id) { const p = videoTemplates.get(id); return p ? (FACE_WEIGHT_BY_CAT[p.category] != null ? FACE_WEIGHT_BY_CAT[p.category] : 0.2) : 0.2; }

// Rank media by CV quality + cull signals (+ faces/smiles when available); drop
// rejects; one shot per duplicate group.
function rankMedia(rows, { faceWeight = 0 } = {}) {
  const scored = [];
  for (const r of rows) {
    if (r.decision === 'reject') continue;
    let score = (r.quality != null ? r.quality : 0.4);
    if (r.decision === 'keep') score += 0.6;
    if (r.rating) score += r.rating * 0.08;
    if (r.sharpness != null && r.sharpness < 120) score -= 0.12;
    if (faceWeight) { if (r.faces) score += faceWeight; if (r.smile) score += r.smile * faceWeight * 0.6; }
    scored.push({ id: r.id, type: r.type, width: r.width, height: r.height, score, dup: r.dup_group || null, when: r.capture_time || r.created_at || '' });
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const out = [];
  for (const m of scored) { if (m.dup) { if (seen.has(m.dup)) continue; seen.add(m.dup); } out.push(m); }
  return out;
}

// Order the ranked media for a pack: chronological for story packs, best-first else.
// Returns the full ordered list; buildTimeline takes what it needs for the duration.
function selectForStyle(ranked, pack) {
  const list = [...ranked];
  if (pack && STORY_CATS.has(pack.category)) list.sort((a, b) => String(a.when).localeCompare(String(b.when)));
  // width/height ride along: the reel builder needs them to decide how much of
  // each frame a 9:16 crop throws away, and therefore where to put the crop.
  return list.map(m => ({ id: m.id, type: m.type, width: m.width, height: m.height }));
}

function signatureOf(media) {
  return crypto.createHash('sha1').update(media.map(m => m.id).sort().join(',')).digest('hex').slice(0, 16);
}

// Build a draft timeline = pack recipe filled with AI-ordered media at the target duration.
function buildDraft(pack, media, opts = {}) { return videoTemplates.buildTimeline(pack, media, opts); }

module.exports = { recommendStyles, getStyle, styleList, styleFaceWeight, rankMedia, selectForStyle, signatureOf, buildDraft, DRAFT_STYLES: videoTemplates.PACKS };
