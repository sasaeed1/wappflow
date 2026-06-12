'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA STUDIO — VIDEO LUTs  (the "look" library)
 * ─────────────────────────────────────────────────────────────────────────────
 *  A LUT here is a small set of grade parameters. From those we generate a real
 *  17³ .cube file on disk (a .cube is plain text — no binary assets, no native
 *  deps), which ffmpeg applies with `lut3d`. The SAME params drive a CSS-filter
 *  approximation in the editor for instant preview. Built-in looks only for now;
 *  custom .cube upload is a later add.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// id, name, category + grade params: temp (warm±), tint (magenta±), sat, contrast,
// lift (raised blacks / fade). All gentle — a LUT is a finish, not a sledgehammer.
const LUTS = [
  { id: 'wedding_warm',     name: 'Wedding Warm',     category: 'Wedding',     temp: 0.26, tint: 0.04, sat: 0.06, contrast: 0.05, lift: 0.03 },
  { id: 'wedding_luxury',   name: 'Wedding Luxury',   category: 'Wedding',     temp: 0.16, tint: 0.02, sat: -0.06, contrast: 0.04, lift: 0.10 },
  { id: 'cinematic_film',   name: 'Cinematic Film',   category: 'Cinematic',   temp: -0.16, tint: -0.06, sat: 0.04, contrast: 0.16, lift: 0.06 },
  { id: 'travel_pop',       name: 'Travel Pop',       category: 'Travel',      temp: 0.10, tint: 0, sat: 0.30, contrast: 0.14, lift: 0 },
  { id: 'real_estate_lux',  name: 'Real Estate Luxury', category: 'Real Estate', temp: -0.06, tint: 0, sat: 0.10, contrast: 0.12, lift: 0.02 },
  { id: 'restaurant_prem',  name: 'Restaurant Premium', category: 'Restaurant', temp: 0.20, tint: 0.03, sat: 0.12, contrast: 0.10, lift: 0.02 },
  { id: 'corporate_clean',  name: 'Corporate Clean',  category: 'Corporate',   temp: -0.04, tint: 0, sat: 0.02, contrast: 0.08, lift: 0 },
  { id: 'social_pop',       name: 'Social Pop',       category: 'Social',      temp: 0.06, tint: 0, sat: 0.40, contrast: 0.22, lift: 0 },
];

const ch = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function applyLook(r, g, b, L) {
  if (L.lift)  { r = L.lift + (1 - L.lift) * r; g = L.lift + (1 - L.lift) * g; b = L.lift + (1 - L.lift) * b; }
  if (L.temp)  { r = ch(r * (1 + L.temp * 0.28)); b = ch(b * (1 - L.temp * 0.28)); }
  if (L.tint)  { g = ch(g * (1 - L.tint * 0.22)); }
  if (L.sat)   { const y = 0.299 * r + 0.587 * g + 0.114 * b; r = ch(y + (r - y) * (1 + L.sat)); g = ch(y + (g - y) * (1 + L.sat)); b = ch(y + (b - y) * (1 + L.sat)); }
  if (L.contrast) { r = ch((r - 0.5) * (1 + L.contrast) + 0.5); g = ch((g - 0.5) * (1 + L.contrast) + 0.5); b = ch((b - 0.5) * (1 + L.contrast) + 0.5); }
  return [ch(r), ch(g), ch(b)];
}

// Generate the .cube text. Red index varies fastest (standard .cube ordering).
function cubeFor(L, N = 17) {
  let s = `TITLE "${L.name}"\nLUT_3D_SIZE ${N}\n`;
  const d = N - 1;
  for (let bi = 0; bi < N; bi++)
    for (let gi = 0; gi < N; gi++)
      for (let ri = 0; ri < N; ri++) {
        const [r, g, b] = applyLook(ri / d, gi / d, bi / d, L);
        s += `${r.toFixed(5)} ${g.toFixed(5)} ${b.toFixed(5)}\n`;
      }
  return s;
}

// CSS-filter approximation for the editor preview (grain/vignette are render-only).
function cssFor(L) {
  const f = [];
  if (L.contrast) f.push(`contrast(${(1 + L.contrast).toFixed(2)})`);
  if (L.sat) f.push(`saturate(${(1 + L.sat).toFixed(2)})`);
  if (L.lift) f.push(`brightness(${(1 + L.lift * 0.5).toFixed(2)})`);
  if (L.temp > 0) f.push(`sepia(${(L.temp * 0.4).toFixed(2)})`);
  if (L.temp < 0) f.push(`hue-rotate(${Math.round(L.temp * 16)}deg)`);
  return f.join(' ') || 'none';
}

// Write any missing built-in .cube files into `dir`; return { id → absolute path }.
function ensureCubeFiles(fs, path, dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const map = {};
  for (const L of LUTS) {
    const p = path.join(dir, `${L.id}.cube`);
    if (!fs.existsSync(p)) { try { fs.writeFileSync(p, cubeFor(L)); } catch {} }
    if (fs.existsSync(p)) map[L.id] = p;
  }
  return map;
}

// Public list for the API / client (no internal params leaked beyond the css hint).
function list() { return LUTS.map(L => ({ id: L.id, name: L.name, category: L.category, css: cssFor(L) })); }

module.exports = { LUTS, applyLook, cubeFor, cssFor, ensureCubeFiles, list };
