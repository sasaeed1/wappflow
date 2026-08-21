'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Album page model — ONE definition of what an album page is (Phase 6).
//
//  There were two. media-studio.js stores real pages in `ms_album_pages`
//  (page_no, layout_template, slots) and is the only thing that can export a
//  PDF. studio-ai.js's generator instead wrote its layout into `ms_albums.spec`
//  as `spreads: [{ layout: 'grid-N', asset_ids: [...] }]` and created no page
//  rows at all.
//
//  Because both list endpoints read the same `ms_albums` table, an AI-generated
//  album appeared in the real album list showing "0 pages", opened empty in the
//  real editor, and exported a BLANK PDF — the generator's work existed only in
//  a JSON blob nothing downstream could read.
//
//  This module is the shared vocabulary: pure functions, no db, no deps, so both
//  modules and the tests can use it.
// ════════════════════════════════════════════════════════════════════════════

/** Canonical layouts → how many images each page holds. */
const ALBUM_LAYOUTS = { single: 1, 'two-h': 2, 'two-v': 2, three: 3, grid4: 4 };

/** The most natural layout for a page holding `n` images (capped at 4). */
function layoutFor(n) {
  if (n <= 1) return 'single';
  if (n === 2) return 'two-h';
  if (n === 3) return 'three';
  return 'grid4';
}

/**
 * Ordered asset ids → canonical pages.
 *
 * `perPage` is clamped to what a layout can actually hold: the generator used to
 * emit `grid-8` when a shoot had more photos than spreads, a layout that exists
 * in no renderer, so those images had nowhere to go.
 */
function pagesFromAssetIds(assetIds, perPage = 4) {
  const ids = (assetIds || []).filter(Boolean);
  const per = Math.max(1, Math.min(4, Number(perPage) || 4));
  const pages = [];
  for (let i = 0; i < ids.length; i += per) {
    const slice = ids.slice(i, i + per);
    pages.push({ layout_template: layoutFor(slice.length), slots: slice.map((asset_id) => ({ asset_id })) });
  }
  return pages;
}

/**
 * Legacy `spec.spreads` → canonical pages. A spread holding more than four
 * images becomes as many pages as it needs rather than losing the overflow.
 */
function pagesFromSpreads(spreads) {
  const out = [];
  for (const s of spreads || []) {
    const ids = (s && s.asset_ids) || [];
    if (!ids.length) continue;
    // 'grid-N' carries the intended count; anything above 4 splits.
    const m = /^grid-(\d+)$/.exec(String(s.layout || ''));
    const intended = m ? Number(m[1]) : ids.length;
    out.push(...pagesFromAssetIds(ids, Math.min(4, Math.max(1, intended))));
  }
  return out;
}

module.exports = { ALBUM_LAYOUTS, layoutFor, pagesFromAssetIds, pagesFromSpreads };
