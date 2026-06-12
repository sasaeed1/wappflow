'use strict';
/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  WappFlow · MEDIA STUDIO — VIDEO ENGINE  (shared, pure where possible)
 * ─────────────────────────────────────────────────────────────────────────────
 *  The timeline is ONE JSON document (the EDL). This module holds the logic that
 *  both the API (media-studio.js) and the worker (media-worker.js) need:
 *
 *    • ASPECTS / EXPORT_PRESETS / dimsFor   — format math
 *    • sanitizeTimeline(doc)                — validate+clamp the EDL, compute duration
 *    • detectFfmpeg()                       — is ffmpeg/ffprobe on this box? (cached)
 *    • parseFfprobe(json)                   — probe output → asset video metadata
 *    • buildExportCommand(timeline, target, resolve) — EDL → ffmpeg argv (PURE)
 *
 *  buildExportCommand is a pure function (no spawning, no fs) so the whole render
 *  graph is unit-testable WITHOUT ffmpeg installed. The worker spawns it for real
 *  only when detectFfmpeg() says the binary is present; otherwise exports fail
 *  gracefully with a clear message. A missing binary must never crash the host.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const ASPECTS = {
  '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1],
  '4:5': [4, 5], '21:9': [21, 9], '3:2': [3, 2],
};

// preset → { label, aspect, safe-area key }. `quality` (720/1080/1440/2160) is the short edge.
const EXPORT_PRESETS = {
  ig_reel:   { label: 'Instagram Reel',     aspect: '9:16', safe: 'reel' },
  tiktok:    { label: 'TikTok',             aspect: '9:16', safe: 'tiktok' },
  yt_shorts: { label: 'YouTube Shorts',     aspect: '9:16', safe: 'reel' },
  fb_reel:   { label: 'Facebook Reel',      aspect: '9:16', safe: 'reel' },
  ig_feed:   { label: 'Instagram Feed',     aspect: '4:5',  safe: 'feed' },
  square:    { label: 'Instagram Square',   aspect: '1:1',  safe: 'feed' },
  yt_16x9:   { label: 'YouTube Video',      aspect: '16:9', safe: null },
  website:   { label: 'Website Video',      aspect: '16:9', safe: null },
  cinematic: { label: 'Cinematic Showcase', aspect: '21:9', safe: null },
  custom:    { label: 'Custom',             aspect: null,   safe: null },
};

const QUALITIES = { 720: 720, 1080: 1080, 1440: 1440, 2160: 2160 };
const TRANSITIONS = ['none', 'fade', 'crossDissolve', 'slide', 'push', 'zoom', 'blur', 'dipToBlack', 'dipToWhite'];
const EFFECTS = ['filmGrain', 'letterbox', 'lightLeak', 'glow', 'pan', 'zoom', 'shake', 'blur', 'softFocus', 'vignette', 'kenBurns'];
const TEXT_TYPES = ['heading', 'subheading', 'caption', 'lowerThird', 'cta'];
const TEXT_ANIM = ['none', 'fade', 'slide', 'scale', 'typewriter', 'pop', 'zoom'];

const clamp = (v, lo, hi, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
};
const even = (n) => { n = Math.round(n); return n % 2 ? n + 1 : n; };

// aspect + short-edge quality → even WxH
function dimsFor(aspect, quality) {
  const [aw, ah] = ASPECTS[aspect] || ASPECTS['9:16'];
  const short = QUALITIES[quality] || 1080;
  let width, height;
  if (aw >= ah) { height = short; width = short * (aw / ah); }
  else { width = short; height = short * (ah / aw); }
  return { width: even(width), height: even(height) };
}

// ── EDL validation ───────────────────────────────────────────────────────────
// Whitelists everything, clamps numerics, drops malformed clips, recomputes
// per-track and overall duration. Returns a clean document we trust downstream.
function sanitizeClip(c, kind) {
  if (!c || typeof c !== 'object') return null;
  const start = clamp(c.start, 0, 36e5, 0);
  const dur = clamp(c.duration ?? ((c.end || 0) - start), 10, 6e5, 3000);
  const out = {
    id: String(c.id || '').slice(0, 64) || ('c_' + Math.random().toString(16).slice(2, 10)),
    kind,
    start, duration: dur, end: start + dur,
  };
  if (kind === 'video' || kind === 'photo') {
    if (c.assetId) out.assetId = String(c.assetId).slice(0, 64);
    out.in = clamp(c.in, 0, 36e5, 0);
    out.out = clamp(c.out, 0, 36e5, out.in + dur);
    out.speed = clamp(c.speed, 0.25, 4, 1);
    out.reverse = !!c.reverse;
    if (c.freezeAtMs != null) out.freezeAtMs = clamp(c.freezeAtMs, 0, 36e5, 0);
    const t = c.transform || {};
    out.transform = {
      x: clamp(t.x, -1, 1, 0), y: clamp(t.y, -1, 1, 0),
      scale: clamp(t.scale, 0.1, 8, 1), rotation: clamp(t.rotation, -360, 360, 0),
      flipH: !!t.flipH, flipV: !!t.flipV, opacity: clamp(t.opacity, 0, 1, 1),
      fit: ['cover', 'contain', 'fill'].includes(t.fit) ? t.fit : 'cover',
    };
    if (c.kenBurns) {
      const k = c.kenBurns;
      out.kenBurns = {
        fromScale: clamp(k.fromScale, 1, 3, 1), toScale: clamp(k.toScale, 1, 3, 1.12),
        fromX: clamp(k.fromX, -1, 1, 0), toX: clamp(k.toX, -1, 1, 0),
        fromY: clamp(k.fromY, -1, 1, 0), toY: clamp(k.toY, -1, 1, 0),
      };
    }
    out.transitionIn = sanitizeTransition(c.transitionIn);
    out.transitionOut = sanitizeTransition(c.transitionOut);
    out.effects = Array.isArray(c.effects) ? c.effects.filter(e => EFFECTS.includes(e)).slice(0, 6) : [];
    if (c.lut) out.lut = String(c.lut).slice(0, 64);
    const col = c.color || {};
    out.color = {
      brightness: clamp(col.brightness, -1, 1, 0), contrast: clamp(col.contrast, -1, 1, 0),
      saturation: clamp(col.saturation, -1, 1, 0), temperature: clamp(col.temperature, -1, 1, 0),
      tint: clamp(col.tint, -1, 1, 0),
    };
  } else if (kind === 'text') {
    const t = c.text || {};
    out.text = {
      content: String(t.content || '').slice(0, 280),
      type: TEXT_TYPES.includes(t.type) ? t.type : 'heading',
      font: String(t.font || 'Inter').slice(0, 48),
      size: clamp(t.size, 8, 240, 48), weight: clamp(t.weight, 100, 900, 700),
      color: /^#[0-9a-fA-F]{3,8}$/.test(t.color || '') ? t.color : '#ffffff',
      opacity: clamp(t.opacity, 0, 1, 1),
      align: ['left', 'center', 'right'].includes(t.align) ? t.align : 'center',
      letterSpacing: clamp(t.letterSpacing, -10, 40, 0),
      animation: TEXT_ANIM.includes(t.animation) ? t.animation : 'fade',
    };
    const tr = c.transform || {};
    out.transform = { x: clamp(tr.x, -1, 1, 0), y: clamp(tr.y, -1, 1, 0.35), scale: clamp(tr.scale, 0.1, 4, 1), opacity: clamp(tr.opacity, 0, 1, 1) };
  } else if (kind === 'audio') {
    if (c.assetId) out.assetId = String(c.assetId).slice(0, 64);
    if (c.trackId) out.trackId = String(c.trackId).slice(0, 64); // built-in music id
    out.in = clamp(c.in, 0, 36e5, 0);
    const a = c.audio || {};
    out.audio = { volume: clamp(a.volume, 0, 2, 1), mute: !!a.mute, fadeIn: clamp(a.fadeIn, 0, 1e4, 0), fadeOut: clamp(a.fadeOut, 0, 1e4, 600) };
  } else if (kind === 'overlay') {
    if (c.assetId) out.assetId = String(c.assetId).slice(0, 64);
    const tr = c.transform || {};
    out.transform = { x: clamp(tr.x, -1, 1, 0), y: clamp(tr.y, -1, 1, 0), scale: clamp(tr.scale, 0.05, 4, 0.2), opacity: clamp(tr.opacity, 0, 1, 1) };
  }
  return out;
}
function sanitizeTransition(t) {
  if (!t || !TRANSITIONS.includes(t.type) || t.type === 'none') return null;
  return { type: t.type, duration: clamp(t.duration, 100, 2000, 400) };
}

const TRACK_KIND = { video: 'video', photo: 'video', audio: 'audio', text: 'text', overlay: 'overlay' };

function sanitizeTimeline(doc = {}) {
  const aspect = ASPECTS[doc.aspect] ? doc.aspect : '9:16';
  const fps = [24, 25, 30, 60].includes(Number(doc.fps)) ? Number(doc.fps) : 30;
  const tracks = [];
  let duration = 0;
  for (const tr of Array.isArray(doc.tracks) ? doc.tracks.slice(0, 12) : []) {
    const type = ['video', 'audio', 'text', 'overlay'].includes(tr.type) ? tr.type : 'video';
    const clips = [];
    for (const c of Array.isArray(tr.clips) ? tr.clips.slice(0, 400) : []) {
      // a video track holds video|photo clips; the clip's own `kind` decides which
      const kind = type === 'video' ? (c.kind === 'photo' ? 'photo' : 'video') : type;
      const sc = sanitizeClip(c, kind);
      if (sc) { clips.push(sc); duration = Math.max(duration, sc.end); }
    }
    clips.sort((a, b) => a.start - b.start);
    tracks.push({ id: String(tr.id || '').slice(0, 64) || ('t_' + Math.random().toString(16).slice(2, 8)), type, clips });
  }
  const { width, height } = dimsFor(aspect, doc.quality || 1080);
  return { version: 1, aspect, width, height, fps, duration, safeArea: doc.safeArea || EXPORT_PRESETS[doc.preset]?.safe || null, tracks };
}

// ── ffmpeg / ffprobe presence (cached) ───────────────────────────────────────
let _ff = null;
function detectFfmpeg() {
  if (_ff) return _ff;
  const { spawnSync } = require('child_process');
  const probe = (bin) => { try { const r = spawnSync(bin, ['-version'], { timeout: 4000 }); return r.status === 0; } catch { return false; } };
  _ff = { ffmpeg: probe(process.env.FFMPEG_PATH || 'ffmpeg'), ffprobe: probe(process.env.FFPROBE_PATH || 'ffprobe') };
  return _ff;
}
function _resetFfmpegCache() { _ff = null; } // tests

function parseFfprobe(json) {
  let data = json;
  if (typeof json === 'string') { try { data = JSON.parse(json); } catch { return {}; } }
  const streams = data.streams || [];
  const v = streams.find(s => s.codec_type === 'video') || {};
  const hasAudio = streams.some(s => s.codec_type === 'audio');
  const fmt = data.format || {};
  let fps = 0;
  if (v.avg_frame_rate && v.avg_frame_rate.includes('/')) {
    const [a, b] = v.avg_frame_rate.split('/').map(Number);
    if (b) fps = Math.round((a / b) * 100) / 100;
  }
  return {
    v_duration_ms: Math.round((Number(fmt.duration) || Number(v.duration) || 0) * 1000),
    v_width: v.width || 0, v_height: v.height || 0, v_fps: fps,
    v_codec: v.codec_name || null, v_has_audio: hasAudio ? 1 : 0,
  };
}

// ── EDL → ffmpeg argv (PURE) ─────────────────────────────────────────────────
// MVP render model: the FIRST video track is the spine — its clips are normalized
// (trim → speed → scale/cover/pad → fade) and concatenated. Photo clips loop for
// their duration with an optional Ken Burns push. The first audio track (if any)
// is mixed under with volume + fades. Returns { args, segments, hasAudio, note }.
// resolve(assetId) → absolute file path (or null). Stills/missing media degrade.
function buildExportCommand(timeline, target, resolve = () => null) {
  const t = sanitizeTimeline(timeline);
  const W = target.width || t.width, H = target.height || t.height, FPS = target.fps || t.fps;
  const crf = target.crf != null ? target.crf : 20;

  const spine = t.tracks.find(tk => tk.type === 'video') || { clips: [] };
  const audioTrack = t.tracks.find(tk => tk.type === 'audio');
  const clips = spine.clips.filter(c => c.kind === 'video' || c.kind === 'photo');
  if (clips.length === 0) return { args: null, segments: 0, hasAudio: false, note: 'empty-timeline' };

  const inputs = [];     // ffmpeg -i args (in order)
  const filters = [];    // filter_complex chains
  const segLabels = [];
  let missing = 0;

  clips.forEach((c, i) => {
    const file = c.assetId ? resolve(c.assetId) : null;
    const durS = (c.duration / 1000).toFixed(3);
    let label = `v${i}`;
    if (c.kind === 'photo' || !file) {
      // looped still (or a gray placeholder when the file is missing)
      if (file) inputs.push('-loop', '1', '-t', durS, '-i', file);
      else { inputs.push('-f', 'lavfi', '-t', durS, '-i', `color=c=0x111114:s=${W}x${H}:r=${FPS}`); missing++; }
      const k = c.kenBurns;
      if (file && k) {
        // zoompan Ken Burns push over the clip's frame count
        const frames = Math.max(1, Math.round((c.duration / 1000) * FPS));
        const zExpr = `min(zoom+${((k.toScale - k.fromScale) / frames).toFixed(6)},${k.toScale})`;
        filters.push(`[${i}:v]scale=${W * 2}:${H * 2},zoompan=z='${zExpr}':d=${frames}:s=${W}x${H}:fps=${FPS}[${label}]`);
      } else if (file) {
        filters.push(`[${i}:v]${scaleCover(W, H)},fps=${FPS},trim=duration=${durS},setsar=1[${label}]`);
      } else {
        filters.push(`[${i}:v]fps=${FPS},trim=duration=${durS},setsar=1[${label}]`);
      }
    } else {
      // video: trim source, optional speed, scale/cover
      const inS = (c.in / 1000).toFixed(3), outS = ((c.in + c.duration * c.speed) / 1000).toFixed(3);
      inputs.push('-ss', inS, '-to', outS, '-i', file);
      const speedPts = c.speed !== 1 ? `,setpts=${(1 / c.speed).toFixed(4)}*PTS` : '';
      const rev = c.reverse ? ',reverse' : '';
      filters.push(`[${i}:v]${scaleCover(W, H)},fps=${FPS}${speedPts}${rev},setsar=1[${label}]`);
    }
    // per-clip fade transitions (to/from black) — simple, reliable for MVP
    const fades = [];
    if (c.transitionIn) fades.push(`fade=t=in:st=0:d=${(c.transitionIn.duration / 1000).toFixed(3)}`);
    if (c.transitionOut) { const d = c.transitionOut.duration / 1000; fades.push(`fade=t=out:st=${(c.duration / 1000 - d).toFixed(3)}:d=${d.toFixed(3)}`); }
    if (fades.length) { filters.push(`[${label}]${fades.join(',')}[${label}f]`); label = `${label}f`; }
    segLabels.push(`[${label}]`);
  });

  // concat the normalized segments
  filters.push(`${segLabels.join('')}concat=n=${segLabels.length}:v=1:a=0[vout]`);

  // audio spine (first audio clip of the first audio track)
  let hasAudio = false;
  const aClip = audioTrack && audioTrack.clips[0];
  const aFile = aClip ? (aClip.assetId ? resolve(aClip.assetId) : null) : null;
  if (aFile && !(aClip.audio && aClip.audio.mute)) {
    inputs.push('-i', aFile);
    const aIdx = clips.length; // audio is the next input index
    const vol = aClip.audio ? aClip.audio.volume : 1;
    const fi = aClip.audio ? aClip.audio.fadeIn / 1000 : 0;
    const fo = aClip.audio ? aClip.audio.fadeOut / 1000 : 0.6;
    const totalS = (t.duration / 1000).toFixed(3);
    filters.push(`[${aIdx}:a]volume=${vol.toFixed(2)},afade=t=in:st=0:d=${fi.toFixed(2)},afade=t=out:st=${Math.max(0, t.duration / 1000 - fo).toFixed(2)}:d=${fo.toFixed(2)},atrim=duration=${totalS}[aout]`);
    hasAudio = true;
  }

  const args = ['-y'];
  for (const a of inputs) args.push(a);
  args.push('-filter_complex', filters.join(';'));
  args.push('-map', '[vout]');
  if (hasAudio) args.push('-map', '[aout]', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  args.push('-c:v', 'libx264', '-preset', target.preset || 'medium', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart');
  // output path appended by the caller
  return { args, segments: segLabels.length, hasAudio, missing, note: 'ok' };
}

// scale to cover WxH then center-crop (no letterbox) — the reel default
function scaleCover(W, H) {
  return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
}

module.exports = {
  ASPECTS, EXPORT_PRESETS, QUALITIES, TRANSITIONS, EFFECTS, TEXT_TYPES, TEXT_ANIM,
  dimsFor, sanitizeTimeline, sanitizeClip, detectFfmpeg, _resetFfmpegCache, parseFfprobe, buildExportCommand,
};
