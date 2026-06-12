// Video Studio — client-side constants mirrored from backend/video-engine.js.
// Kept tiny + dependency-free so both the reel list and the editor share them.

export const ASPECTS = {
  '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1],
  '4:5': [4, 5], '21:9': [21, 9], '3:2': [3, 2],
};

export const ASPECT_LABELS = {
  '9:16': 'Reel / Story', '16:9': 'Landscape', '1:1': 'Square',
  '4:5': 'Feed', '21:9': 'Cinematic', '3:2': 'Photo',
};

export const EXPORT_PRESETS = [
  { id: 'ig_reel',   label: 'Instagram Reel',     aspect: '9:16', safe: 'reel' },
  { id: 'tiktok',    label: 'TikTok',             aspect: '9:16', safe: 'tiktok' },
  { id: 'yt_shorts', label: 'YouTube Shorts',     aspect: '9:16', safe: 'reel' },
  { id: 'fb_reel',   label: 'Facebook Reel',      aspect: '9:16', safe: 'reel' },
  { id: 'ig_feed',   label: 'Instagram Feed',     aspect: '4:5',  safe: 'feed' },
  { id: 'square',    label: 'Square Post',        aspect: '1:1',  safe: 'feed' },
  { id: 'yt_16x9',   label: 'YouTube Video',      aspect: '16:9', safe: null },
  { id: 'website',   label: 'Website Video',      aspect: '16:9', safe: null },
  { id: 'cinematic', label: 'Cinematic 21:9',     aspect: '21:9', safe: null },
];

export const QUALITIES = [
  { v: 720, label: '720p' }, { v: 1080, label: '1080p' },
  { v: 1440, label: '1440p' }, { v: 2160, label: '4K' },
];

// Safe-area insets (fraction of frame) — keeps text clear of platform UI.
export const SAFE_AREAS = {
  reel:   { top: 0.10, bottom: 0.20, left: 0.06, right: 0.14 },
  tiktok: { top: 0.10, bottom: 0.22, left: 0.04, right: 0.16 },
  feed:   { top: 0.06, bottom: 0.10, left: 0.05, right: 0.05 },
};

export const TRANSITIONS = [
  { id: 'none', label: 'None' }, { id: 'fade', label: 'Fade' },
  { id: 'dipToBlack', label: 'Dip to black' }, { id: 'dipToWhite', label: 'Dip to white' },
];

export const TEXT_TYPES = [
  { id: 'heading', label: 'Heading', size: 64, weight: 800, y: -0.15 },
  { id: 'subheading', label: 'Subheading', size: 40, weight: 600, y: 0 },
  { id: 'caption', label: 'Caption', size: 28, weight: 500, y: 0.32 },
  { id: 'lowerThird', label: 'Lower third', size: 32, weight: 700, y: 0.34 },
  { id: 'cta', label: 'Call to action', size: 36, weight: 700, y: 0.40 },
];

export const TEXT_ANIM = [
  { id: 'none', label: 'None' }, { id: 'fade', label: 'Fade' }, { id: 'slide', label: 'Slide' },
  { id: 'scale', label: 'Scale' }, { id: 'typewriter', label: 'Typewriter' }, { id: 'pop', label: 'Pop' }, { id: 'zoom', label: 'Zoom' },
];

// Effects the export engine renders today (matches video-engine.fxFilter).
export const VIDEO_EFFECTS = [
  { id: 'vignette', label: 'Vignette' },
  { id: 'filmGrain', label: 'Film grain' },
  { id: 'blur', label: 'Blur' },
  { id: 'softFocus', label: 'Soft focus' },
  { id: 'letterbox', label: 'Letterbox' },
];

// CSS approximation of the per-clip colour grade for instant preview (the server
// render via eq/colorbalance is the source of truth).
export function colorPreviewFilter(c) {
  if (!c) return '';
  const f = [];
  if (c.brightness) f.push(`brightness(${(1 + c.brightness * 0.4).toFixed(2)})`);
  if (c.contrast) f.push(`contrast(${(1 + c.contrast * 0.5).toFixed(2)})`);
  if (c.saturation) f.push(`saturate(${(1 + c.saturation).toFixed(2)})`);
  if (c.temperature > 0) f.push(`sepia(${(c.temperature * 0.35).toFixed(2)})`);
  if (c.temperature < 0) f.push(`hue-rotate(${Math.round(c.temperature * 16)}deg)`);
  if (c.tint) f.push(`hue-rotate(${Math.round(-c.tint * 12)}deg)`);
  return f.join(' ');
}

export const DEFAULT_PHOTO_MS = 3000;
export const DEFAULT_VIDEO_MS = 5000;
export const PX_PER_MS = 0.06; // 60px per second at 1× zoom

// Fit an aspect ratio inside a max box, returning pixel w/h.
export function aspectBox(aspect, maxW, maxH) {
  const [aw, ah] = ASPECTS[aspect] || ASPECTS['9:16'];
  const r = aw / ah;
  let w = maxW, h = w / r;
  if (h > maxH) { h = maxH; w = h * r; }
  return { width: Math.round(w), height: Math.round(h) };
}

export const uid = (p = 'c') => p + '_' + Math.random().toString(16).slice(2, 9);
