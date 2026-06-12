// Media Studio — film preset library. Each preset is a bundle of the same
// non-destructive edit params the manual sliders use; applying one just sets
// params, so everything stays reversible and the original file is untouched.
// p: exposure ex / contrast ct / temperature te / tint ti / saturation sa /
//    fade fa / vignette vi / grain gr / bw

export const PRESETS = [
  { id: 'natural-boost', name: 'Natural Boost', p: { exposure: 0.08, contrast: 0.12, saturation: 0.15 } },
  { id: 'golden-hour',   name: 'Golden Hour',   p: { temperature: 0.45, exposure: 0.1, saturation: 0.12, vignette: 0.15 } },
  { id: 'portra',        name: 'Portra Warm',   p: { temperature: 0.25, saturation: -0.08, contrast: -0.06, fade: 0.25 } },
  { id: 'kodak-gold',    name: 'Kodak Gold',    p: { temperature: 0.35, exposure: 0.06, contrast: 0.1, saturation: 0.2, grain: 0.15 } },
  { id: 'velvia',        name: 'Velvia Pop',    p: { saturation: 0.45, contrast: 0.2, exposure: 0.02 } },
  { id: 'cinema-teal',   name: 'Cinema Teal',   p: { temperature: -0.3, tint: -0.12, contrast: 0.15, saturation: 0.05, vignette: 0.25 } },
  { id: 'noir',          name: 'Noir',          p: { bw: 1, contrast: 0.3, vignette: 0.35, grain: 0.25 } },
  { id: 'silver',        name: 'Silver Classic', p: { bw: 1, contrast: 0.12, fade: 0.2 } },
  { id: 'matte-bw',      name: 'Matte B&W',     p: { bw: 1, fade: 0.4, contrast: -0.05, grain: 0.1 } },
  { id: 'high-key',      name: 'High-Key',      p: { exposure: 0.25, contrast: -0.1, fade: 0.15, saturation: -0.05 } },
  { id: 'low-key',       name: 'Low-Key Drama', p: { exposure: -0.18, contrast: 0.25, vignette: 0.4, saturation: -0.05 } },
  { id: 'moody-forest',  name: 'Moody Forest',  p: { temperature: -0.12, tint: -0.15, saturation: -0.12, contrast: 0.12, fade: 0.2, vignette: 0.2 } },
  { id: 'desert-haze',   name: 'Desert Haze',   p: { temperature: 0.3, fade: 0.35, contrast: -0.08, saturation: -0.1 } },
  { id: 'arctic',        name: 'Arctic Blue',   p: { temperature: -0.4, exposure: 0.08, saturation: 0.05, contrast: 0.08 } },
  { id: 'rose-film',     name: 'Rose Film',     p: { temperature: 0.15, tint: 0.2, fade: 0.25, saturation: 0.05 } },
  { id: 'emerald',       name: 'Emerald',       p: { tint: -0.25, saturation: 0.15, contrast: 0.1 } },
  { id: 'sun-kissed',    name: 'Sun-Kissed',    p: { temperature: 0.5, exposure: 0.12, saturation: 0.18, vignette: 0.1 } },
  { id: 'faded-memory',  name: 'Faded Memory',  p: { fade: 0.5, saturation: -0.2, temperature: 0.1, grain: 0.2 } },
  { id: 'punchy-street', name: 'Punchy Street', p: { contrast: 0.3, saturation: 0.25, exposure: -0.04, vignette: 0.2, grain: 0.1 } },
  { id: 'soft-pastel',   name: 'Soft Pastel',   p: { exposure: 0.12, contrast: -0.15, saturation: -0.1, fade: 0.3, temperature: 0.08 } },
  { id: 'midnight',      name: 'Midnight',      p: { exposure: -0.25, temperature: -0.2, contrast: 0.18, vignette: 0.45, saturation: -0.08 } },
  { id: 'espresso',      name: 'Espresso',      p: { temperature: 0.3, contrast: 0.15, saturation: -0.15, vignette: 0.3, exposure: -0.06 } },
  { id: 'crisp-air',     name: 'Crisp Air',     p: { exposure: 0.06, contrast: 0.18, temperature: -0.08, saturation: 0.08 } },
  { id: 'vintage-grain', name: 'Vintage Grain', p: { temperature: 0.2, fade: 0.3, grain: 0.4, vignette: 0.25, saturation: -0.05, contrast: -0.04 } },
];

// CSS approximation of the server render — instant previews (grain is render-only).
export function previewFilter(p = {}) {
  const f = [];
  if (p.bw) f.push('grayscale(1)');
  if (p.exposure) f.push(`brightness(${(1 + p.exposure * 0.6).toFixed(3)})`);
  if (p.contrast) f.push(`contrast(${(1 + p.contrast * 0.6).toFixed(3)})`);
  if (p.fade) f.push(`contrast(${(1 - p.fade * 0.22).toFixed(3)}) brightness(${(1 + p.fade * 0.08).toFixed(3)})`);
  if (!p.bw && p.temperature > 0) f.push(`sepia(${(p.temperature * 0.35).toFixed(3)}) saturate(${(1 + p.temperature * 0.15).toFixed(3)})`);
  if (!p.bw && p.temperature < 0) f.push(`hue-rotate(${(p.temperature * 18).toFixed(1)}deg)`);
  if (!p.bw && p.tint) f.push(`hue-rotate(${(p.tint * -14).toFixed(1)}deg)`);
  if (!p.bw && p.saturation) f.push(`saturate(${(1 + p.saturation * 0.8).toFixed(3)})`);
  return f.join(' ') || 'none';
}

// Vignette can't be expressed as a CSS filter — preview it as an inset shadow.
export function previewVignette(p = {}) {
  if (!p.vignette) return 'none';
  const s = Math.round(40 + p.vignette * 140);
  return `inset 0 0 ${s}px ${Math.round(s * 0.45)}px rgba(0,0,0,${(p.vignette * 0.55).toFixed(2)})`;
}

// AI auto-enhance: derives a modest, explainable correction from the on-device
// CV scores. A SUGGESTION — sets sliders only; the photographer applies.
export function suggestEnhance(asset) {
  if (!asset || asset.exposure == null) return null;
  const s = {};
  const e = asset.exposure;
  if (e < 0.34) s.exposure = Math.min(0.5, +( (0.45 - e) * 1.3 ).toFixed(2));
  else if (e > 0.66) s.exposure = Math.max(-0.5, +( (0.55 - e) * 1.3 ).toFixed(2));
  if ((asset.shadow_clip || 0) > 0.12) s.exposure = Math.min(0.5, (s.exposure || 0) + 0.12);
  if ((asset.high_clip || 0) > 0.06) s.exposure = Math.max(-0.5, (s.exposure || 0) - 0.12);
  const clip = (asset.shadow_clip || 0) + (asset.high_clip || 0);
  if (clip < 0.02) s.contrast = 0.14;
  if (asset.quality != null && asset.quality < 0.45) s.saturation = 0.1;
  return Object.keys(s).length ? s : null;
}
