'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Reel framing — where to put the crop window so the subject survives it.
//
//  THE PROBLEM: a reel is usually 9:16. A photograph usually is not. Every clip
//  is `cover`-fitted, which centres the crop, and a centred crop of a 3:2 frame
//  into 9:16 throws away ~62% of the width. If the subject is not dead centre —
//  and in a composed photograph it deliberately is not, because photographers
//  put people on the thirds — the auto-reel crops them out. That is what "detect
//  faces and frame accordingly" is actually asking for.
//
//  WHAT WE HAVE, HONESTLY: this server has no face detector. The desktop Local
//  AI Engine runs UltraFace and writes face_count/smile; the server runs a jimp
//  CPU pass whose `faces` is always 0. Building against that would be dead code.
//
//  What the server DOES compute, on every asset, is the edge-energy centroid —
//  vision-cpu.js already derives it to score rule-of-thirds and then discards
//  it. That is a real saliency signal: detail clusters on subjects, not on empty
//  sky or plain walls. It is a weaker signal than a face box and it is named
//  honestly as `subject`, not `face`.
//
//  THE SEAM: this module takes a subject POINT, not a face. When a desktop pass
//  supplies a real face centre it lands in the same field and everything
//  downstream improves with no change here. `source` is carried through so the
//  UI can say which it was.
// ════════════════════════════════════════════════════════════════════════════

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 9:16 → 0.5625. Accepts "9:16" or a number. */
function aspectRatio(a) {
  if (typeof a === 'number' && isFinite(a) && a > 0) return a;
  const m = String(a || '').match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const w = parseFloat(m[1]), h = parseFloat(m[2]);
  return h > 0 ? w / h : null;
}

/**
 * How much of the source is thrown away by a cover-fit, per axis.
 *
 * Returns { overflowX, overflowY } as fractions of the SOURCE dimension that
 * fall outside the frame. Exactly one of them is non-zero (or both are 0 when
 * the aspects match), which is what makes the shift one-dimensional.
 */
function coverOverflow(srcW, srcH, frameAspect) {
  const src = srcW / srcH;
  if (!isFinite(src) || src <= 0) return { overflowX: 0, overflowY: 0 };
  if (src > frameAspect) {
    // Source is wider than the frame → cropped left and right.
    return { overflowX: 1 - frameAspect / src, overflowY: 0 };
  }
  // Source is taller → cropped top and bottom.
  return { overflowX: 0, overflowY: 1 - src / frameAspect };
}

/**
 * The transform that brings `subject` into the middle of the frame.
 *
 * The renderer applies `translate(x*100%, y*100%)` to a cover-fitted image, so
 * x/y are fractions of the SOURCE dimension. Bringing a subject at sx to centre
 * needs a shift of (0.5 - sx) — clamped to half the overflow, because shifting
 * further would pull the image edge into frame and expose the black behind it.
 *
 * @param {object}  o
 * @param {number}  o.srcW, o.srcH        source pixel dimensions
 * @param {string|number} o.frameAspect   "9:16" or 0.5625
 * @param {{x:number,y:number}} o.subject normalised 0..1 within the source
 * @param {number}  [o.bias]              extra upward pull on the vertical axis,
 *                                        as a fraction of the crop height
 * @returns {{x:number, y:number}} clip transform offsets
 */
function frameTransform({ srcW, srcH, frameAspect, subject, bias = 0 }) {
  const fa = aspectRatio(frameAspect);
  if (!fa || !(srcW > 0) || !(srcH > 0) || !subject) return { x: 0, y: 0 };

  const sx = clamp(Number(subject.x), 0, 1);
  const sy = clamp(Number(subject.y), 0, 1);
  if (!isFinite(sx) || !isFinite(sy)) return { x: 0, y: 0 };

  const { overflowX, overflowY } = coverOverflow(srcW, srcH, fa);
  const limitX = overflowX / 2;
  const limitY = overflowY / 2;

  // Bias only applies on the axis actually being cropped, and only upward:
  // heads sit above centre, feet do not need protecting.
  const wantY = 0.5 - sy + (limitY > 0 ? bias : 0);

  return {
    x: +clamp(0.5 - sx, -limitX, limitX).toFixed(4),
    y: +clamp(wantY, -limitY, limitY).toFixed(4),
  };
}

/**
 * Is reframing worth doing at all?
 *
 * When the source and the frame are near enough the same shape there is nothing
 * to choose — the whole picture is visible either way — and a nudge would move
 * the image for no reason. Below this the transform is left at 0 so a
 * deliberately composed square-ish shot is not quietly shifted.
 */
function needsReframing(srcW, srcH, frameAspect, minOverflow = 0.08) {
  const fa = aspectRatio(frameAspect);
  if (!fa || !(srcW > 0) || !(srcH > 0)) return false;
  const { overflowX, overflowY } = coverOverflow(srcW, srcH, fa);
  return Math.max(overflowX, overflowY) >= minOverflow;
}

/**
 * The whole decision for one clip, including whether to make it.
 *
 * Returns null when there is nothing to do, so a caller can leave the clip's
 * existing transform untouched rather than overwriting a hand-set one with a
 * computed zero.
 */
function framingFor(asset, frameAspect, { bias = 0.06 } = {}) {
  if (!asset || !asset.subject) return null;
  const w = Number(asset.width) || 0, h = Number(asset.height) || 0;
  if (!needsReframing(w, h, frameAspect)) return null;
  const t = frameTransform({ srcW: w, srcH: h, frameAspect, subject: asset.subject, bias });
  if (t.x === 0 && t.y === 0) return null;
  return t;
}

module.exports = { aspectRatio, coverOverflow, frameTransform, needsReframing, framingFor };
