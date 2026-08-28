'use client';
/* eslint-disable @next/next/no-img-element, jsx-a11y/media-has-caption -- dynamic /uploads media, muted preview */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Play, Pause, Scissors, Trash2, Copy, Download, Image as ImageIcon, Film, Maximize, Minimize,
  Check, Loader, X, ChevronDown, Wand2, ArrowLeftRight, ZoomIn, ZoomOut, Type, Snowflake,
  Music, Upload, Volume2, Plus, Layers, VolumeX, Move,
} from 'lucide-react';
import { mediaAPI, mediaUrl } from '../../../../../lib/api';
import {
  ASPECTS, ASPECT_LABELS, EXPORT_PRESETS, QUALITIES, SAFE_AREAS, TRANSITIONS, VIDEO_EFFECTS,
  TEXT_TYPES, TEXT_ANIM, FONT_FAMILIES, DEFAULT_PHOTO_MS, DEFAULT_VIDEO_MS, PX_PER_MS, aspectBox, uid, colorPreviewFilter,
} from '../../../video-constants';
import { clickable } from '@/lib/a11y';

const ZERO_COLOR = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// interpolate motion keyframes [{t,scale,x,y}] at progress p (0..1)
function sampleMotion(keys, p) {
  const k = [...keys].sort((a, b) => a.t - b.t);
  if (p <= k[0].t) return k[0];
  if (p >= k[k.length - 1].t) return k[k.length - 1];
  for (let i = 0; i < k.length - 1; i++) {
    if (p >= k[i].t && p <= k[i + 1].t) {
      const f = (p - k[i].t) / ((k[i + 1].t - k[i].t) || 1);
      return { scale: lerp(k[i].scale, k[i + 1].scale, f), x: lerp(k[i].x, k[i + 1].x, f), y: lerp(k[i].y, k[i + 1].y, f) };
    }
  }
  return k[0];
}
// interpolate scalar opacity keyframes [{t,v}] at progress p
function sampleOpacity(keys, p) {
  const k = [...keys].sort((a, b) => a.t - b.t);
  if (p <= k[0].t) return k[0].v;
  if (p >= k[k.length - 1].t) return k[k.length - 1].v;
  for (let i = 0; i < k.length - 1; i++) if (p >= k[i].t && p <= k[i + 1].t) {
    const f = (p - k[i].t) / ((k[i + 1].t - k[i].t) || 1);
    return lerp(k[i].v, k[i + 1].v, f);
  }
  return k[0].v;
}
const fmtClock = (ms) => { const s = Math.max(0, ms / 1000); return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${Math.floor((s * 10) % 10)}`; };

// ── document helpers (the spine = the single video track for Phase 1) ─────────
const emptyDoc = (aspect = '9:16') => ({ aspect, fps: 30, tracks: [{ id: uid('t'), type: 'video', clips: [] }] });
const getSpine = (doc) => doc.tracks.find(t => t.type === 'video') || doc.tracks[0];
const spineEnd = (spine) => spine.clips.reduce((m, c) => Math.max(m, c.end), 0);
function repack(clips) { // sort by start, lay contiguous from 0, refresh end
  const s = [...clips].sort((a, b) => a.start - b.start);
  let t = 0;
  return s.map(c => { const n = { ...c, start: t, end: t + c.duration }; t += c.duration; return n; });
}

// ── Tracks ───────────────────────────────────────────────────────────────────
//
// The RENDERER has always taken up to 12 tracks of video/audio/text/overlay and
// already flattens the clips of EVERY text track (backend/video-engine.js). The
// editor drew three hardcoded lanes — one video, one text, one audio clip — so
// the capability existed and was simply unreachable from the UI. Nothing about
// the document shape changes here; the timeline just stops pretending there are
// only ever three.
//
// TRACK_H also fixes the reason the text and audio lanes appeared "not visible":
// the timeline was a fixed 168px tall with overflow-y:hidden, while 76 + 38 + 36
// of lanes plus 32 of padding needs ~182px. The lanes were being clipped off the
// bottom of the panel. Heights now drive the panel instead of the other way round.
const TRACK_META = {
  video:   { label: 'Media',   height: 72, tint: '#3a3d52' },
  overlay: { label: 'Overlay', height: 34, tint: '#7c5cff' },
  text:    { label: 'Text',    height: 32, tint: '#6366f1' },
  audio:   { label: 'Audio',   height: 30, tint: '#2f9e6e' },
};
// Stacking order, top to bottom: the video spine reads as the base layer, and
// audio sits at the bottom the way it does in every editor anyone has used.
const TRACK_ORDER = ['video', 'overlay', 'text', 'audio'];
const trackH = (type) => (TRACK_META[type] || TRACK_META.video).height;
const TRACK_GAP = 6;
// Wide enough for the longest label AND the two controls. The controls fade in
// on hover but still occupy their 20px, so sizing the header for the visible
// state alone truncated "Media" to "MEDI" — measured 27px available against 35px
// wanted. Collapsing the buttons instead would shift the label on every hover.
const HEAD_W = 140;

/** Document order is arbitrary; presentation order is not. Stable within a type. */
function orderTracks(tracks) {
  return tracks
    .map((t, i) => [t, i])
    .sort(([a, ai], [b, bi]) => {
      const d = TRACK_ORDER.indexOf(a.type) - TRACK_ORDER.indexOf(b.type);
      return d !== 0 ? d : ai - bi;
    })
    .map(([t]) => t);
}

export default function VideoEditor() {
  const router = useRouter();
  const { id, timelineId } = useParams();
  const [doc, setDoc] = useState(null);
  const [name, setName] = useState('');
  const [assets, setAssets] = useState([]);
  const [audioAssets, setAudioAssets] = useState([]);
  const [luts, setLuts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMusic, setShowMusic] = useState(false);
  const [selId, setSelId] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState(PX_PER_MS);
  const [saveState, setSaveState] = useState('saved'); // saved | saving | dirty
  const [aspectMenu, setAspectMenu] = useState(false);
  const [trackMenu, setTrackMenu] = useState(false);
  // The timeline panel is draggable-tall and remembers itself. It used to be a
  // hard 168px, which on a short viewport is not enough for even three lanes —
  // and the lanes it could not fit were simply clipped away with no scrollbar.
  const [tlHeight, setTlHeight] = useState(() => {
    if (typeof window === 'undefined') return 210;
    const saved = parseInt(localStorage.getItem('wf_ve_tl_h') || '0', 10);
    if (saved >= 140 && saved <= 640) return saved;
    // On a short window the preview and the timeline are in direct competition,
    // so the default never takes more than ~40% and the grip settles the rest.
    return Math.round(clamp(window.innerHeight * 0.4, 150, 210));
  });
  useEffect(() => { try { localStorage.setItem('wf_ve_tl_h', String(tlHeight)); } catch {} }, [tlHeight]);
  const [showExport, setShowExport] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 360, height: 640 });

  const stageWrapRef = useRef(null);
  const [stageEl, setStageEl] = useState(null);
  const attachStage = useCallback((el) => { stageWrapRef.current = el; setStageEl(el); }, []);
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const saveTimer = useRef(null);
  const firstLoad = useRef(true);
  const drag = useRef(null);

  const assetMap = useMemo(() => Object.fromEntries(assets.map(a => [a.id, a])), [assets]);

  // load
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
    (async () => {
      try {
        const [t, a, pr] = await Promise.all([mediaAPI.getTimeline(timelineId), mediaAPI.listAssets(id, { limit: 500 }), mediaAPI.videoPresets().catch(() => null)]);
        const d = t.data.document && t.data.document.tracks?.length ? t.data.document : emptyDoc(t.data.aspect_ratio);
        if (!getSpine(d)) d.tracks.unshift({ id: uid('t'), type: 'video', clips: [] });
        setDoc(d); setName(t.data.name || 'Untitled reel');
        setAssets((a.data.assets || []).filter(x => x.type === 'photo' || x.type === 'video'));
        if (pr?.data?.luts) setLuts(pr.data.luts);
        try { setAudioAssets((await mediaAPI.listAudio(id)).data.audio || []); } catch {}
      } catch { router.push(`/studio/${id}/video`); return; }
      setLoading(false);
    })();
  }, [id, timelineId]);

  const spine = doc ? getSpine(doc) : null;
  const duration = spine ? spineEnd(spine) : 0;
  const textTrack = doc ? doc.tracks.find(t => t.type === 'text') : null;
  const audioTrack = doc ? doc.tracks.find(t => t.type === 'audio') : null;
  const musicClip = audioTrack?.clips[0] || null;
  const musicAsset = musicClip ? audioAssets.find(a => a.id === musicClip.assetId) : null;
  const selected = doc ? (doc.tracks.flatMap(tr => tr.clips).find(c => c.id === selId) || null) : null;
  // Every text track, not just the first. The renderer already composites all of
  // them; the preview was only ever showing one, so a second text track exported
  // captions the editor had never drawn.
  const activeTexts = doc
    ? doc.tracks.filter(t => t.type === 'text' && !t.muted).flatMap(t => t.clips).filter(c => playhead >= c.start && playhead < c.end)
    : [];
  const tracks = doc ? orderTracks(doc.tracks) : [];
  const tracksHeight = tracks.reduce((h, t) => h + trackH(t.type) + TRACK_GAP, 0);
  // Wide enough for the longest clip on ANY track, not just the video spine —
  // a caption or a music bed running past the last shot used to be unscrollable.
  const laneW = Math.max(
    (doc ? doc.tracks.flatMap(t => t.clips).reduce((m, c) => Math.max(m, c.end || 0), 0) : 0) * scale + 40,
    duration * scale + 40,
    600,
  );

  // autosave (debounced) on doc/name change
  const markDirty = useCallback(() => {
    setSaveState('saving');
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await mediaAPI.saveTimeline(timelineId, { name, document: docRef.current }); setSaveState('saved'); }
      catch { setSaveState('dirty'); }
    }, 800);
  }, [timelineId, name]);
  const docRef = useRef(doc); useEffect(() => { docRef.current = doc; }, [doc]);
  useEffect(() => { if (firstLoad.current) { firstLoad.current = false; return; } if (doc) markDirty(); }, [doc, name]); // eslint-disable-line

  const mutateSpine = (fn) => setDoc(d => {
    const nd = { ...d, tracks: d.tracks.map(t => t.type === 'video' ? { ...t, clips: fn([...t.clips]) } : t) };
    return nd;
  });

  // Stage sizing — fit the aspect box into the available stage area.
  //
  // This used to set the size ONLY from inside the ResizeObserver callback. That
  // callback fires as soon as observation starts, which on first paint can be
  // before the stage has laid out: width 0 → aspectBox(aspect, -24, -24) returns
  // NEGATIVE dimensions, and because the element never resizes afterwards nothing
  // corrects it. The preview therefore opened at the wrong shape and only became
  // 9:16 once you changed the aspect, which re-ran this effect against a
  // laid-out element. Measure directly as well, and ignore degenerate boxes.
  // Depends on `stageEl` (a state-backed callback ref), not on a plain ref: a ref
  // mutation does not re-run an effect, so when the stage mounted after this
  // effect had already run the observer was never attached and stageSize stayed
  // at its useState default of 360x640 forever. Keying on the element itself
  // means the measurement happens exactly when there is something to measure.
  useEffect(() => {
    if (!stageEl || !doc) return;
    const measure = () => {
      const r = stageEl.getBoundingClientRect();
      const w = r.width - 24, h = r.height - 24;
      if (w <= 0 || h <= 0) return; // not laid out yet — a later frame will size it
      setStageSize(aspectBox(doc.aspect, w, h));
    };
    measure();
    const raf = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(stageEl);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [stageEl, doc?.aspect]);

  // ── fullscreen preview ──────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  const toggleFullscreen = useCallback(() => {
    const el = stageWrapRef.current; if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // ── playback ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    let raf, last = performance.now();
    const tick = (now) => {
      const dt = now - last; last = now;
      setPlayhead(ph => { const np = ph + dt; if (np >= duration) { setPlaying(false); return 0; } return np; });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, duration]);

  // top-most clip at the playhead (greatest start wins on overlap — matches the compositor)
  const activeClip = spine ? (spine.clips.filter(c => playhead >= c.start && playhead < c.end).sort((a, b) => a.start - b.start).slice(-1)[0] || null) : null;
  const activeAsset = activeClip ? assetMap[activeClip.assetId] : null;

  // keep the <video> element seeked/playing in sync with the playhead
  useEffect(() => {
    const v = videoRef.current; if (!v || !activeClip || activeClip.kind !== 'video') return;
    v.playbackRate = activeClip.speed || 1;
    if (playing) { v.play().catch(() => {}); } else { v.pause(); }
  }, [playing, activeClip?.id]); // eslint-disable-line
  useEffect(() => {
    const v = videoRef.current; if (!v || !activeClip || activeClip.kind !== 'video' || playing) return;
    const local = ((playhead - activeClip.start) * (activeClip.speed || 1) + (activeClip.in || 0)) / 1000;
    try { v.currentTime = clamp(local, 0, v.duration || local); } catch {}
  }, [playhead, activeClip?.id]); // eslint-disable-line

  // keep the music <audio> element in sync with the playhead
  useEffect(() => {
    const el = audioRef.current; if (!el || !musicClip) return;
    el.volume = clamp((musicClip.audio?.mute ? 0 : (musicClip.audio?.volume ?? 1)), 0, 1);
    if (playing) { el.play().catch(() => {}); } else { el.pause(); }
  }, [playing, musicClip?.id, musicClip?.audio?.volume, musicClip?.audio?.mute]); // eslint-disable-line
  useEffect(() => {
    const el = audioRef.current; if (!el || !musicClip || playing) return;
    try { el.currentTime = (playhead + (musicClip.in || 0)) / 1000; } catch {}
  }, [playhead, musicClip?.id, musicClip?.in]); // eslint-disable-line

  const setMusic = (asset) => {
    setDoc(d => {
      const clip = { id: uid(), kind: 'audio', assetId: asset.id, start: 0, in: 0, audio: { volume: 1, fadeIn: 0, fadeOut: 800, mute: false } };
      const tracks = [...d.tracks.filter(t => t.type !== 'audio'), { id: uid('t'), type: 'audio', clips: [clip] }];
      return { ...d, tracks };
    });
    setShowMusic(false);
  };
  const removeMusic = () => { setDoc(d => ({ ...d, tracks: d.tracks.filter(t => t.type !== 'audio') })); if (musicClip && selId === musicClip.id) setSelId(null); };

  // ── editing actions ───────────────────────────────────────────────────────────
  const addAsset = (a) => {
    const isVid = a.type === 'video';
    const dur = isVid ? clamp(a.v_duration_ms || DEFAULT_VIDEO_MS, 500, 60000) : DEFAULT_PHOTO_MS;
    mutateSpine(cs => {
      const start = cs.reduce((m, c) => Math.max(m, c.end), 0);
      const clip = {
        id: uid(), kind: isVid ? 'video' : 'photo', assetId: a.id,
        start, duration: dur, end: start + dur, in: 0, out: dur, speed: 1, reverse: false,
        transform: { scale: 1, x: 0, y: 0, rotation: 0, opacity: 1, fit: 'cover' },
        transitionIn: null, transitionOut: null,
      };
      if (!isVid) clip.kenBurns = { fromScale: 1, toScale: 1.12, fromX: 0, toX: 0.04, fromY: 0, toY: 0 };
      return [...cs, clip];
    });
  };
  const splitAtPlayhead = () => {
    if (!activeClip) return;
    const offset = playhead - activeClip.start;
    if (offset < 200 || offset > activeClip.duration - 200) return;
    mutateSpine(cs => {
      const i = cs.findIndex(c => c.id === activeClip.id);
      const a = { ...cs[i], duration: offset, end: cs[i].start + offset, out: (cs[i].in || 0) + offset * (cs[i].speed || 1) };
      const b = { ...cs[i], id: uid(), start: cs[i].start + offset, duration: cs[i].duration - offset, end: cs[i].end, in: (cs[i].in || 0) + offset * (cs[i].speed || 1) };
      if (b.kenBurns) b.kenBurns = { ...b.kenBurns, fromScale: lerp(b.kenBurns.fromScale, b.kenBurns.toScale, offset / cs[i].duration) };
      const next = [...cs]; next.splice(i, 1, a, b); return next;
    });
  };
  // generic, track-aware mutators (work for spine media AND text clips)
  const removeClip = (cid) => {
    setDoc(d => ({ ...d, tracks: d.tracks.map(tr => tr.type === 'video' ? { ...tr, clips: repack(tr.clips.filter(c => c.id !== cid)) } : { ...tr, clips: tr.clips.filter(c => c.id !== cid) }) }));
    if (selId === cid) setSelId(null);
  };
  const duplicateClip = (cid) => setDoc(d => ({ ...d, tracks: d.tracks.map(tr => {
    if (!tr.clips.some(c => c.id === cid)) return tr;
    const c = tr.clips.find(x => x.id === cid);
    if (tr.type === 'video') return { ...tr, clips: repack([...tr.clips, { ...c, id: uid() }]) };
    return { ...tr, clips: [...tr.clips, { ...c, id: uid(), start: c.end, end: c.end + c.duration }] };
  }) }));
  const patchClip = (cid, patch) => setDoc(d => ({ ...d, tracks: d.tracks.map(tr => ({ ...tr, clips: tr.clips.map(c => {
    if (c.id !== cid) return c;
    const n = { ...c, ...patch };
    if (patch.transform) n.transform = { ...c.transform, ...patch.transform };
    if (patch.kenBurns) n.kenBurns = { ...c.kenBurns, ...patch.kenBurns };
    if (patch.text) n.text = { ...c.text, ...patch.text };
    n.end = n.start + n.duration;
    return n;
  }) })) }));
  const addText = () => {
    const start = clamp(playhead, 0, Math.max(0, duration - 500)), dur = 2500;
    const clip = {
      id: uid(), kind: 'text', start, duration: dur, end: start + dur,
      text: { content: 'Your text', type: 'heading', font: 'sans', size: 64, weight: 800, color: '#ffffff', opacity: 1, align: 'center', letterSpacing: 0, animation: 'fade' },
      transform: { x: 0, y: -0.12, scale: 1, opacity: 1 },
    };
    setDoc(d => {
      let tracks = d.tracks;
      if (!tracks.some(t => t.type === 'text')) tracks = [...tracks, { id: uid('t'), type: 'text', clips: [] }];
      tracks = tracks.map(t => t.type === 'text' ? { ...t, clips: [...t.clips, clip] } : t);
      return { ...d, tracks };
    });
    setSelId(clip.id);
  };

  // ── track management ───────────────────────────────────────────────────────
  // The renderer caps at 12 tracks, so the UI refuses the 13th rather than
  // letting someone build a timeline that silently loses a layer on export.
  const MAX_TRACKS = 12;
  const addTrack = (type) => {
    setDoc(d => (d.tracks.length >= MAX_TRACKS ? d : { ...d, tracks: [...d.tracks, { id: uid('t'), type, clips: [] }] }));
    setTrackMenu(false);
  };
  const removeTrack = (tid) => setDoc(d => {
    const tr = d.tracks.find(t => t.id === tid);
    // The video spine is the timeline's backbone — duration is measured from it
    // and every other lane is positioned against it. Removing it would leave a
    // document with nothing to render against, so it is emptied, not deleted.
    if (tr?.type === 'video' && d.tracks.filter(t => t.type === 'video').length === 1) {
      return { ...d, tracks: d.tracks.map(t => t.id === tid ? { ...t, clips: [] } : t) };
    }
    return { ...d, tracks: d.tracks.filter(t => t.id !== tid) };
  });
  // Muting is presentation-only and belongs on the document so it survives a
  // save — the renderer skips a muted track's clips the same way the preview does.
  const toggleTrackMute = (tid) => setDoc(d => ({ ...d, tracks: d.tracks.map(t => t.id === tid ? { ...t, muted: !t.muted } : t) }));

  const changeAspect = (aspect) => { setDoc(d => ({ ...d, aspect })); setAspectMenu(false); };
  const uploadLut = async (file) => { try { const r = await mediaAPI.uploadLut(file, file.name); setLuts(ls => [...ls, r.data]); } catch {} };

  // ── timeline drag (move / trim) ───────────────────────────────────────────────
  const onClipPointerDown = (e, clip, mode) => {
    e.stopPropagation();
    setSelId(clip.id); setPlaying(false);
    const tt = doc.tracks.find(tr => tr.clips.some(c => c.id === clip.id))?.type || 'video';
    drag.current = { id: clip.id, mode, startX: e.clientX, orig: { ...clip }, trackType: tt };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
  };
  const onDragMove = (e) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.startX) / scale; // ms moved
    setDoc(doc => ({ ...doc, tracks: doc.tracks.map(tr => {
      if (!tr.clips.some(c => c.id === d.id)) return tr;
      let next = tr.clips.map(c => {
        if (c.id !== d.id) return c;
        if (d.mode === 'move') return { ...c, start: Math.max(0, d.orig.start + dx), end: Math.max(0, d.orig.start + dx) + c.duration };
        if (d.mode === 'trimR') { const dur = clamp(d.orig.duration + dx, 300, 120000); return { ...c, duration: dur, end: c.start + dur, ...(c.kind === 'video' && !c.freeze ? { out: (c.in || 0) + dur * (c.speed || 1) } : {}) }; }
        if (d.mode === 'trimL') {
          const dur = clamp(d.orig.duration - dx, 300, 120000); const delta = d.orig.duration - dur;
          if (d.trackType === 'video') return { ...c, duration: dur, end: c.start + dur, in: Math.max(0, (d.orig.in || 0) + delta * (c.speed || 1)) };
          return { ...c, start: d.orig.start + delta, duration: dur, end: d.orig.start + delta + dur };
        }
        return c;
      });
      // move = free positioning (overlap allowed → crossfades); only trims keep ends synced
      return { ...tr, clips: next };
    }) }));
  };
  const onDragUp = () => { drag.current = null; window.removeEventListener('pointermove', onDragMove); window.removeEventListener('pointerup', onDragUp); };

  // ── timeline panel resize ──────────────────────────────────────────────────
  const tlResize = useRef(null);
  const onTlResizeDown = (e) => {
    e.preventDefault();
    tlResize.current = { startY: e.clientY, startH: tlHeight };
    const move = (ev) => {
      const r = tlResize.current; if (!r) return;
      // Dragging UP grows the timeline, so the delta is inverted.
      setTlHeight(clamp(r.startH - (ev.clientY - r.startY), 140, Math.min(640, window.innerHeight - 220)));
    };
    const up = () => { tlResize.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── drag the media inside the frame (position + scale) ─────────────────────
  //
  // The renderer has always honoured a per-clip `transform` {x, y, scale} — the
  // editor only exposed it as number fields in the inspector, which is not how
  // anybody frames a shot. Dragging the preview writes the same transform, and
  // the wheel scales it, so what you drag is exactly what exports.
  //
  // x/y are normalised to -1..1 of the FRAME, matching the renderer's contract,
  // so the gesture stays correct at any preview size or aspect.
  const frameDrag = useRef(null);
  const canPose = selected && (selected.kind === 'photo' || selected.kind === 'video' || selected.kind === 'text' || selected.kind === 'overlay');
  const onFramePointerDown = (e) => {
    if (!canPose) return;
    e.preventDefault();
    const t = selected.transform || { x: 0, y: 0, scale: 1 };
    frameDrag.current = { id: selected.id, startX: e.clientX, startY: e.clientY, x: t.x || 0, y: t.y || 0 };
    const move = (ev) => {
      const f = frameDrag.current; if (!f) return;
      patchClip(f.id, { transform: {
        x: clamp(f.x + ((ev.clientX - f.startX) / stageSize.width) * 2, -1, 1),
        y: clamp(f.y + ((ev.clientY - f.startY) / stageSize.height) * 2, -1, 1),
      } });
    };
    const up = () => { frameDrag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onFrameWheel = (e) => {
    if (!canPose) return;
    const t = selected.transform || { scale: 1 };
    // Text scales down to 0.1 and media only to 1: a photo scaled below 1 would
    // expose the empty frame behind it, which the renderer letterboxes to black.
    const lo = selected.kind === 'text' || selected.kind === 'overlay' ? 0.1 : 1;
    patchClip(selected.id, { transform: { scale: clamp((t.scale || 1) * (e.deltaY < 0 ? 1.06 : 1 / 1.06), lo, 4) } });
  };

  const scrubTo = (e) => {
    const track = e.currentTarget.getBoundingClientRect();
    setPlayhead(clamp((e.clientX - track.left) / scale, 0, duration));
    setPlaying(false);
  };

  // keyboard
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
      if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); splitAtPlayhead(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selId) { e.preventDefault(); removeClip(selId); }
      else if (e.key === 'ArrowRight') setPlayhead(p => clamp(p + 100, 0, duration));
      else if (e.key === 'ArrowLeft') setPlayhead(p => clamp(p - 100, 0, duration));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selId, activeClip, duration, playhead]); // eslint-disable-line

  if (loading || !doc) return <><div className="ms-page"><p className="ms-loading">Opening editor…</p></div></>;

  const safe = SAFE_AREAS[EXPORT_PRESETS.find(p => p.aspect === doc.aspect && p.safe)?.safe] || null;

  // active-clip media style (transform + Ken Burns + colour/LUT look)
  let mediaStyle = { width: '100%', height: '100%', objectFit: 'cover' };
  const activeFx = activeClip?.effects || [];
  if (activeClip) {
    const p = activeClip.duration ? (playhead - activeClip.start) / activeClip.duration : 0;
    const tf = activeClip.transform || {};
    let sc = tf.scale || 1, tx = (tf.x || 0) * 100, ty = (tf.y || 0) * 100;
    if (activeClip.motionKeys && activeClip.motionKeys.length >= 2) {
      const m = sampleMotion(activeClip.motionKeys, p); sc *= m.scale; tx += m.x * 50; ty += m.y * 50;
    } else if (activeClip.kenBurns) { const k = activeClip.kenBurns; sc *= lerp(k.fromScale, k.toScale, p); tx += lerp(k.fromX, k.toX, p) * 100; ty += lerp(k.fromY, k.toY, p) * 100; }
    const lutCss = activeClip.lut ? (luts.find(l => l.id === activeClip.lut)?.css || '') : '';
    const filter = [colorPreviewFilter(activeClip.color), lutCss, activeFx.includes('blur') ? 'blur(6px)' : '', activeFx.includes('softFocus') ? 'blur(1.5px)' : '', activeFx.includes('glow') ? 'brightness(1.07) contrast(1.03)' : ''].filter(Boolean).join(' ');
    const op = activeClip.opacityKeys && activeClip.opacityKeys.length >= 2 ? sampleOpacity(activeClip.opacityKeys, p) : (tf.opacity ?? 1);
    mediaStyle = { ...mediaStyle, transform: `translate(${tx}%, ${ty}%) scale(${sc}) rotate(${tf.rotation || 0}deg)`, opacity: op, transition: playing ? 'none' : 'transform .12s', filter: filter || undefined };
  }

  return (
    <>
      <div className="ms-ve">
        {/* top bar */}
        <div className="ms-ve-top">
          <button onClick={() => router.push(`/studio/${id}/video`)} className="ms-ve-icon" title="Back to reels"><ArrowLeft size={17} /></button>
          <input value={name} onChange={e => setName(e.target.value)} className="ms-ve-name" placeholder="Untitled reel" />
          <span className="ms-ve-save">{saveState === 'saving' ? 'Saving…' : saveState === 'dirty' ? 'Unsaved' : 'Saved'}</span>

          <div style={{ flex: 1 }} />

          <div style={{ position: 'relative' }}>
            <button onClick={() => setAspectMenu(v => !v)} className="ms-ve-pill"><ArrowLeftRight size={14} /> {doc.aspect} <ChevronDown size={13} /></button>
            {aspectMenu && (
              <div className="ms-menu" style={{ right: 0, top: '110%', minWidth: 180 }}>
                {['9:16', '1:1', '4:5', '16:9', '21:9', '3:2'].map(a => (
                  <button key={a} className="ms-menu-item" onClick={() => changeAspect(a)} style={{ justifyContent: 'space-between', color: 'var(--ms-ink)' }}>
                    <span>{a}</span><span style={{ fontSize: 11, color: 'var(--ms-ink-3)' }}>{ASPECT_LABELS[a]}{doc.aspect === a ? ' ✓' : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setShowExport(true)} disabled={duration === 0} className="ms-btn-ink"><Download size={15} /> Export</button>
        </div>

        <div className="ms-ve-body">
          {/* media rail */}
          <aside className="ms-ve-rail">
            <div className="ms-ve-rail-h">Media <span>{assets.length}</span></div>
            <div className="ms-ve-rail-grid">
              {assets.map(a => (
                <button key={a.id} onClick={() => addAsset(a)} className="ms-ve-tile" title={`Add ${a.filename}`}>
                  <img src={mediaUrl(a.type === 'video' ? (a.poster_url || a.thumb_url) : (a.thumb_url || a.url))} alt="" loading="lazy" />
                  {a.type === 'video' && <span className="ms-ve-tile-badge"><Film size={11} /></span>}
                  <span className="ms-ve-tile-add">+</span>
                </button>
              ))}
              {assets.length === 0 && <p style={{ fontSize: 12, color: 'var(--ms-ink-3)', gridColumn: '1/-1', padding: 8 }}>No photos or clips in this shoot yet.</p>}
            </div>
          </aside>

          {/* stage */}
          <div className="ms-ve-stage" ref={attachStage}>
            <div className={`ms-ve-frame${canPose ? ' is-posable' : ''}`}
                 style={{ width: stageSize.width, height: stageSize.height }}
                 onPointerDown={onFramePointerDown}
                 onWheel={onFrameWheel}
                 title={canPose ? 'Drag to reposition · scroll to scale' : undefined}>
              {!activeClip && <div className="ms-ve-frame-empty"><Film size={26} /><span>Add media to begin</span></div>}
              {activeClip && activeAsset && activeClip.kind === 'video' && (
                <video ref={videoRef} key={activeClip.id} src={mediaUrl(activeAsset.proxy_url || activeAsset.url)} muted playsInline style={mediaStyle} />
              )}
              {activeClip && activeAsset && activeClip.kind === 'photo' && (
                <img key={activeClip.id} src={mediaUrl(activeAsset.variants?.web || activeAsset.url)} alt="" style={mediaStyle} />
              )}
              {/* transition flashes (dip to black/white) */}
              {activeClip?.transitionIn && playhead - activeClip.start < activeClip.transitionIn.duration && (
                <div style={dipStyle(activeClip.transitionIn, 1 - (playhead - activeClip.start) / activeClip.transitionIn.duration)} />
              )}
              {activeClip?.transitionOut && activeClip.end - playhead < activeClip.transitionOut.duration && (
                <div style={dipStyle(activeClip.transitionOut, 1 - (activeClip.end - playhead) / activeClip.transitionOut.duration)} />
              )}
              {/* effect overlays (preview) */}
              {activeFx.includes('vignette') && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 120px 40px rgba(0,0,0,0.55)' }} />}
              {activeFx.includes('letterbox') && <><div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '11%', background: '#000', pointerEvents: 'none' }} /><div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '11%', background: '#000', pointerEvents: 'none' }} /></>}
              {activeFx.includes('filmGrain') && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.12, mixBlendMode: 'overlay', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }} />}
              {activeFx.includes('lightLeak') && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', mixBlendMode: 'screen', background: 'linear-gradient(115deg, rgba(255,138,30,0.55) 0%, rgba(255,80,40,0.18) 28%, transparent 55%)' }} />}
              {/* text overlays */}
              {activeTexts.map(tc => <TextOverlay key={tc.id} clip={tc} stage={stageSize} />)}
              {/* safe-area guides */}
              {safe && (
                <div className="ms-ve-safe" style={{ top: `${safe.top * 100}%`, bottom: `${safe.bottom * 100}%`, left: `${safe.left * 100}%`, right: `${safe.right * 100}%` }} />
              )}
            </div>
            <div className="ms-ve-transport">
              <button onClick={() => setPlaying(p => !p)} className="ms-ve-play">{playing ? <Pause size={17} /> : <Play size={17} />}</button>
              <span className="ms-ve-clock">{fmtClock(playhead)} <span style={{ opacity: 0.5 }}>/ {fmtClock(duration)}</span></span>
              {/* Watch the cut at full size without leaving the editor. The stage
                  re-measures itself on resize, so the frame keeps its aspect. */}
              <button onClick={toggleFullscreen} className="ms-ve-fs"
                      title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Preview fullscreen (F)'}
                      aria-label={isFullscreen ? 'Exit fullscreen' : 'Preview fullscreen'}>
                {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
              </button>
            </div>
            {musicAsset && <audio ref={audioRef} key={musicClip.id} src={mediaUrl(musicAsset.url)} preload="auto" />}
          </div>

          {/* inspector */}
          <aside className="ms-ve-insp">
            {!selected ? (
              <div style={{ padding: 16, color: 'var(--ms-ink-3)', fontSize: 12.5, lineHeight: 1.6 }}>
                <Wand2 size={16} style={{ marginBottom: 8, opacity: 0.7 }} /><br />
                Select a clip to edit it. Click media on the left to add it to the timeline.<br /><br />
                <b style={{ color: 'var(--ms-ink-2)' }}>Shortcuts</b><br />Space play · S split · Del remove · ←→ nudge
              </div>
            ) : selected.kind === 'text' ? (
              <TextInspector clip={selected} patch={(p) => patchClip(selected.id, p)} onDelete={() => removeClip(selected.id)} onDup={() => duplicateClip(selected.id)} />
            ) : selected.kind === 'audio' ? (
              <AudioInspector clip={selected} asset={musicAsset} patch={(p) => patchClip(selected.id, p)} onRemove={removeMusic} onReplace={() => setShowMusic(true)} />
            ) : <Inspector clip={selected} luts={luts} onUploadLut={uploadLut} kfT={selected.duration ? clamp((playhead - selected.start) / selected.duration, 0, 1) : 0} patch={(p) => patchClip(selected.id, p)} onDelete={() => removeClip(selected.id)} onDup={() => duplicateClip(selected.id)} />}
          </aside>
        </div>

        {/* timeline */}
        <div className="ms-ve-timeline" style={{ height: tlHeight }}>
          {/* Drag to make room. A fixed-height timeline is what clipped the text
              and audio lanes out of sight in the first place. */}
          <div className="ms-ve-tl-grip" onPointerDown={onTlResizeDown}
               role="separator" aria-label="Resize timeline" title="Drag to resize the timeline" />
          <div className="ms-ve-tl-tools">
            <button onClick={splitAtPlayhead} disabled={!activeClip} className="ms-ve-tool" title="Split (S)"><Scissors size={14} /> Split</button>
            <button onClick={addText} className="ms-ve-tool" title="Add text"><Type size={14} /> Text</button>
            <button onClick={() => setShowMusic(true)} className="ms-ve-tool" title="Music"><Music size={14} /> Music</button>

            {/* Add a track. The renderer always accepted up to 12; there was
                simply no way to ask for one. */}
            <div style={{ position: 'relative' }}>
              <button onClick={() => setTrackMenu(v => !v)} className="ms-ve-tool"
                      disabled={doc.tracks.length >= MAX_TRACKS}
                      title={doc.tracks.length >= MAX_TRACKS ? `The renderer supports ${MAX_TRACKS} tracks` : 'Add a track'}
                      aria-expanded={trackMenu}>
                <Plus size={14} /> Track
              </button>
              {trackMenu && (
                <div className="ms-ve-menu" role="menu">
                  {['text', 'audio', 'overlay', 'video'].map(t => (
                    <button key={t} role="menuitem" onClick={() => addTrack(t)}>
                      <span className="ms-ve-tl-dot" style={{ background: TRACK_META[t].tint }} />
                      {TRACK_META[t].label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => selId && duplicateClip(selId)} disabled={!selId} className="ms-ve-tool" title="Duplicate"><Copy size={14} /></button>
            <button onClick={() => selId && removeClip(selId)} disabled={!selId} className="ms-ve-tool" title="Delete (Del)"><Trash2 size={14} /></button>
            <div style={{ flex: 1 }} />
            <button aria-label="Zoom out" onClick={() => setScale(s => clamp(s / 1.3, 0.012, 0.4))} className="ms-ve-tool"><ZoomOut size={14} /></button>
            <button aria-label="Zoom in" onClick={() => setScale(s => clamp(s * 1.3, 0.012, 0.4))} className="ms-ve-tool"><ZoomIn size={14} /></button>
          </div>
          <div className="ms-ve-tl-scroll">
            {/* One row per track, each with a sticky header. Replaces three
                hardcoded lanes that could not show a second text track, could
                not label what a lane was, and could not be added to. */}
            <div className="ms-ve-tl-rows" style={{ width: HEAD_W + laneW }}>
              {tracks.map((tr) => {
                const meta = TRACK_META[tr.type] || TRACK_META.video;
                const isSpine = tr.type === 'video';
                return (
                  <div key={tr.id} className="ms-ve-tl-row" style={{ height: trackH(tr.type), marginBottom: TRACK_GAP }}>
                    <div className={`ms-ve-tl-head${tr.muted ? ' is-muted' : ''}`} style={{ width: HEAD_W }}>
                      <span className="ms-ve-tl-dot" style={{ background: meta.tint }} />
                      <span className="ms-ve-tl-name">{meta.label}</span>
                      <button className="ms-ve-tl-hbtn" title={tr.muted ? 'Unmute track' : 'Mute track'}
                              aria-label={`${tr.muted ? 'Unmute' : 'Mute'} ${meta.label} track`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => toggleTrackMute(tr.id)}>
                        {tr.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                      </button>
                      <button className="ms-ve-tl-hbtn" title={isSpine ? 'Clear this track' : 'Delete this track'}
                              aria-label={`${isSpine ? 'Clear' : 'Delete'} ${meta.label} track`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={() => removeTrack(tr.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className="ms-ve-tl-lane" style={{ width: laneW }} onPointerDown={scrubTo}>
                      {tr.clips.length === 0 && (
                        <div className="ms-ve-tl-empty">
                          {isSpine ? 'Click media on the left to build your reel' : `Empty ${meta.label.toLowerCase()} track`}
                        </div>
                      )}
                      {tr.clips.map(c => {
                        const a = assetMap[c.assetId];
                        const isSel = selId === c.id;
                        const w = Math.max(c.duration * scale, 18);
                        return (
                          <div key={c.id} onPointerDown={(e) => onClipPointerDown(e, c, 'move')}
                            className={`ms-ve-clip ms-ve-clip-${tr.type}${isSel ? ' is-sel' : ''}${tr.muted ? ' is-mutedclip' : ''}`}
                            style={{ left: c.start * scale, width: w, height: trackH(tr.type), background: tr.type === 'video' ? undefined : meta.tint }}>

                            {tr.type === 'video' && a && (
                              <img src={mediaUrl(a.type === 'video' ? (a.poster_url || a.thumb_url) : (a.thumb_url || a.url))} alt="" />
                            )}

                            {tr.type === 'video' ? (
                              <span className="ms-ve-clip-label">
                                {c.kind === 'video' ? <Film size={10} /> : <ImageIcon size={10} />}
                                {c.freeze ? ' ❄' : c.speed !== 1 ? ` ${c.speed}×` : ''}
                              </span>
                            ) : (
                              <span className="ms-ve-clip-tlabel">
                                {tr.type === 'text' ? <Type size={9} /> : tr.type === 'audio' ? <Music size={9} /> : <Layers size={9} />}
                                {tr.type === 'text' ? (c.text?.content || 'Text')
                                  : tr.type === 'audio' ? ((audioAssets.find(x => x.id === c.assetId)?.filename) || 'Music') + (c.audio?.mute ? ' (muted)' : '')
                                  : (a?.filename || 'Overlay')}
                              </span>
                            )}

                            {c.motionKeys && c.motionKeys.map((k, j) => (
                              <span key={j} className="ms-ve-kf" style={{ left: `calc(${k.t * 100}% - 3px)` }} />
                            ))}

                            {/* Transitions, ON the bar. They were only reachable
                                through the inspector, so you could not see that a
                                clip had one, which edge it was on, or how long it
                                ran — the timeline is where that belongs. Width is
                                the real duration, so a 400ms dissolve looks like
                                400ms at the current zoom. */}
                            {c.transitionIn && c.transitionIn.type !== 'none' && (
                              <span className="ms-ve-trans l"
                                    style={{ width: Math.min(Math.max(c.transitionIn.duration * scale, 6), w / 2) }}
                                    title={`In: ${c.transitionIn.type} · ${c.transitionIn.duration}ms`} />
                            )}
                            {c.transitionOut && c.transitionOut.type !== 'none' && (
                              <span className="ms-ve-trans r"
                                    style={{ width: Math.min(Math.max(c.transitionOut.duration * scale, 6), w / 2) }}
                                    title={`Out: ${c.transitionOut.type} · ${c.transitionOut.duration}ms`} />
                            )}

                            <span className="ms-ve-handle l" onPointerDown={(e) => onClipPointerDown(e, c, 'trimL')} />
                            <span className="ms-ve-handle r" onPointerDown={(e) => onClipPointerDown(e, c, 'trimR')} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Height is derived now. It used to be `92 + (text ? 38 : 0) + …`,
                  a hand-maintained sum that could not know about a fourth track. */}
              <div className="ms-ve-playhead" style={{ left: HEAD_W + playhead * scale, height: Math.max(tracksHeight, 40) }} />
            </div>
          </div>
        </div>
      </div>

      {showExport && <ExportModal timelineId={timelineId} aspect={doc.aspect} duration={duration} onClose={() => setShowExport(false)} />}
      {showMusic && (
        <MusicModal projectId={id} audioAssets={audioAssets} current={musicClip?.assetId}
          onClose={() => setShowMusic(false)} onPick={setMusic}
          onUploaded={(list) => setAudioAssets(list)} />
      )}
    </>
  );
}

function AudioInspector({ clip, asset, patch, onRemove, onReplace }) {
  const a = clip.audio || {};
  const setA = (k, v) => patch({ audio: { ...a, [k]: v } });
  return (
    <div style={{ padding: 14, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--ms-accent)', color: 'var(--ms-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music size={15} /></span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ms-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset?.filename || 'Music'}</span>
      </div>

      <Field label={`Volume · ${Math.round((a.volume ?? 1) * 100)}%`}>
        <input type="range" min={0} max={150} value={Math.round((a.volume ?? 1) * 100)} onChange={e => setA('volume', Number(e.target.value) / 100)} style={{ width: '100%' }} />
      </Field>
      <Field label={`Fade in · ${((a.fadeIn || 0) / 1000).toFixed(1)}s`}>
        <input type="range" min={0} max={5000} step={100} value={a.fadeIn || 0} onChange={e => setA('fadeIn', Number(e.target.value))} style={{ width: '100%' }} />
      </Field>
      <Field label={`Fade out · ${((a.fadeOut || 0) / 1000).toFixed(1)}s`}>
        <input type="range" min={0} max={5000} step={100} value={a.fadeOut || 0} onChange={e => setA('fadeOut', Number(e.target.value))} style={{ width: '100%' }} />
      </Field>
      <Field label={`Start from · ${((clip.in || 0) / 1000).toFixed(1)}s`}>
        <input type="range" min={0} max={Math.max(1000, (asset?.duration_ms || 30000) - 1000)} step={500} value={clip.in || 0} onChange={e => patch({ in: Number(e.target.value) })} style={{ width: '100%' }} />
      </Field>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ms-ink-2)', margin: '4px 0 16px', cursor: 'pointer' }}>
        <input type="checkbox" checked={!!a.mute} onChange={e => setA('mute', e.target.checked)} style={{ accentColor: 'var(--ms-accent)' }} /> Mute
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onReplace} className="ms-btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '8px' }}><Music size={13} /> Replace</button>
        <button onClick={onRemove} className="ms-btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '8px', color: '#d4564a' }}><Trash2 size={13} /> Remove</button>
      </div>
    </div>
  );
}

function MusicModal({ projectId, audioAssets, current, onClose, onPick, onUploaded }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [previewId, setPreviewId] = useState(null);
  const previewRef = useRef(null);

  const upload = async (file) => {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      await mediaAPI.uploadAudio(projectId, file);
      // give the probe a moment, then refresh the list
      await new Promise(r => setTimeout(r, 1200));
      const list = (await mediaAPI.listAudio(projectId)).data.audio || [];
      onUploaded(list);
    } catch (e) { setErr(e.response?.data?.error || 'Upload failed'); }
    setBusy(false);
  };
  const togglePreview = (a) => {
    const el = previewRef.current; if (!el) return;
    if (previewId === a.id) { el.pause(); setPreviewId(null); return; }
    el.src = mediaUrl(a.url); el.play().catch(() => {}); setPreviewId(a.id);
  };

  return (
    <div {...clickable(onClose)} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--ms-accent)', color: 'var(--ms-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Music size={18} /></span>
            <div><h2>Music</h2><p className="ms-modal-sub">Add a track to your reel.</p></div>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ms-ink-3)', padding: 4 }}><X size={20} /></button>
        </div>

        <label className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center', cursor: 'pointer', margin: '14px 0' }}>
          {busy ? <Loader size={15} className="ms-spin" /> : <Upload size={15} />} {busy ? 'Uploading…' : 'Upload a track'}
          <input type="file" accept="audio/*,.mp3,.wav,.m4a,.aac" hidden disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        </label>
        {err && <p style={{ fontSize: 12.5, color: '#d4564a', marginBottom: 10 }}>{err}</p>}

        <div style={{ maxHeight: '46vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {audioAssets.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--ms-ink-3)', padding: 8 }}>No tracks yet. Upload one above — your licensed track from Epidemic, Artlist, Uppbeat, etc.</p>}
          {audioAssets.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 11, border: `1px solid ${current === a.id ? 'var(--ms-accent)' : 'var(--ms-line)'}`, background: 'var(--ms-surface)' }}>
              <button onClick={() => togglePreview(a)} className="ms-iconbtn" style={{ width: 30, height: 30, flexShrink: 0 }}>{previewId === a.id ? <Pause size={13} /> : <Play size={13} />}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, color: 'var(--ms-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.filename}</div>
                {a.duration_ms > 0 && <div style={{ fontSize: 10.5, color: 'var(--ms-ink-3)' }}>{fmtClock(a.duration_ms)}</div>}
              </div>
              <button onClick={() => onPick(a)} className="ms-btn-ink" style={{ padding: '6px 14px', fontSize: 12 }}>{current === a.id ? 'Re-add' : 'Use'}</button>
            </div>
          ))}
        </div>
        <audio ref={previewRef} onEnded={() => setPreviewId(null)} hidden />
      </div>
    </div>
  );
}

function dipStyle(tr, intensity) {
  const white = tr.type === 'dipToWhite';
  const fade = tr.type === 'fade' || tr.type === 'dipToBlack' || tr.type === 'dipToWhite';
  if (!fade) return { display: 'none' };
  return { position: 'absolute', inset: 0, background: white ? '#fff' : '#000', opacity: clamp(intensity, 0, 1), pointerEvents: 'none' };
}

function Inspector({ clip, luts, onUploadLut, kfT = 0, patch, onDelete, onDup }) {
  const color = clip.color || ZERO_COLOR;
  const fx = clip.effects || [];
  const mk = clip.motionKeys || null;
  const [kfSel, setKfSel] = useState(0);
  const ki = mk ? Math.min(kfSel, mk.length - 1) : 0;
  const addKey = () => {
    const cur = mk ? sampleMotion(mk, kfT) : { scale: 1, x: 0, y: 0 };
    const next = [...(mk || []), { t: +kfT.toFixed(3), scale: cur.scale, x: cur.x, y: cur.y }].sort((a, b) => a.t - b.t);
    patch({ motionKeys: next }); setKfSel(next.findIndex(k => k.t === +kfT.toFixed(3)));
  };
  const startKeys = () => { patch({ motionKeys: [{ t: 0, scale: 1, x: 0, y: 0 }, { t: 1, scale: 1.15, x: 0, y: 0 }] }); setKfSel(0); };
  const setKey = (prop, v) => { const next = mk.map((k, j) => j === ki ? { ...k, [prop]: v } : k); patch({ motionKeys: next }); };
  const delKey = () => { if (mk.length <= 2) { patch({ motionKeys: null }); return; } patch({ motionKeys: mk.filter((_, j) => j !== ki) }); setKfSel(0); };
  // opacity keyframes (any clip kind)
  const ok = clip.opacityKeys || null;
  const [okSel, setOkSel] = useState(0);
  const oi = ok ? Math.min(okSel, ok.length - 1) : 0;
  const startOKeys = () => { patch({ opacityKeys: [{ t: 0, v: 0 }, { t: 1, v: 1 }] }); setOkSel(0); };
  const addOKey = () => { const cur = ok ? sampleOpacity(ok, kfT) : 1; const next = [...(ok || []), { t: +kfT.toFixed(3), v: cur }].sort((a, b) => a.t - b.t); patch({ opacityKeys: next }); setOkSel(next.findIndex(k => k.t === +kfT.toFixed(3))); };
  const setOKey = (v) => patch({ opacityKeys: ok.map((k, j) => j === oi ? { ...k, v } : k) });
  const delOKey = () => { if (ok.length <= 2) { patch({ opacityKeys: null }); return; } patch({ opacityKeys: ok.filter((_, j) => j !== oi) }); setOkSel(0); };
  const setColor = (k, v) => patch({ color: { ...ZERO_COLOR, ...color, [k]: v } });
  const toggleFx = (idfx) => patch({ effects: fx.includes(idfx) ? fx.filter(e => e !== idfx) : [...fx, idfx] });
  return (
    <div style={{ padding: 14, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--ms-accent)', color: 'var(--ms-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {clip.kind === 'video' ? <Film size={15} /> : <ImageIcon size={15} />}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ms-ink)', textTransform: 'capitalize' }}>{clip.kind} clip</span>
      </div>

      <Field label={`Duration · ${(clip.duration / 1000).toFixed(1)}s`}>
        <input type="range" min={300} max={20000} step={100} value={clip.duration}
          onChange={e => patch({ duration: Number(e.target.value), out: (clip.in || 0) + Number(e.target.value) * (clip.speed || 1) })} style={{ width: '100%' }} />
      </Field>

      {clip.kind === 'video' && (
        <>
          <Field label={`Speed · ${clip.speed}×`}>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {[0.25, 0.5, 1, 1.5, 2, 4].map(s => (
                <button key={s} onClick={() => patch({ speed: s })} className={`ms-chip${clip.speed === s ? ' ms-chip-active' : ''}`} style={{ padding: '5px 9px', fontSize: 11 }}>{s}×</button>
              ))}
            </div>
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ms-ink-2)', margin: '4px 0 8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!clip.reverse} onChange={e => patch({ reverse: e.target.checked })} style={{ accentColor: 'var(--ms-accent)' }} /> Reverse playback
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ms-ink-2)', margin: '0 0 14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!clip.freeze} onChange={e => patch({ freeze: e.target.checked })} style={{ accentColor: 'var(--ms-accent)' }} /> <Snowflake size={12} /> Freeze frame
          </label>
        </>
      )}

      {clip.kind === 'photo' && (
        <Field label="Motion (Ken Burns)">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['None', null], ['Zoom in', { fromScale: 1, toScale: 1.18, fromX: 0, toX: 0, fromY: 0, toY: 0 }],
              ['Zoom out', { fromScale: 1.18, toScale: 1, fromX: 0, toX: 0, fromY: 0, toY: 0 }],
              ['Pan ▸', { fromScale: 1.12, toScale: 1.12, fromX: -0.05, toX: 0.05, fromY: 0, toY: 0 }]].map(([lbl, kb]) => {
              const active = (!kb && !clip.kenBurns) || (kb && clip.kenBurns && clip.kenBurns.toScale === kb.toScale && clip.kenBurns.toX === kb.toX && clip.kenBurns.fromScale === kb.fromScale);
              return <button key={lbl} onClick={() => patch({ kenBurns: kb, motionKeys: null })} className={`ms-chip${active && !mk ? ' ms-chip-active' : ''}`} style={{ padding: '5px 9px', fontSize: 11 }}>{lbl}</button>;
            })}
          </div>
        </Field>
      )}

      {clip.kind === 'photo' && (
        <Field label="Keyframes (scale + position)">
          {!mk ? (
            <button onClick={startKeys} className="ms-btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '8px' }}>+ Add motion keyframes</button>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                {mk.map((k, j) => (
                  <button key={j} onClick={() => setKfSel(j)} title={`${Math.round(k.t * 100)}%`}
                    className={`ms-chip${ki === j ? ' ms-chip-active' : ''}`} style={{ padding: '4px 8px', fontSize: 10.5 }}>◆ {Math.round(k.t * 100)}%</button>
                ))}
                <button onClick={addKey} title="Add keyframe at playhead" className="ms-iconbtn" style={{ width: 26, height: 26 }}>+</button>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--ms-ink-3)', marginBottom: 8 }}>Editing keyframe {ki + 1} of {mk.length} · at {Math.round(mk[ki].t * 100)}%</div>
              <ColorSlider label="Zoom" min={0} max={100} value={(mk[ki].scale - 1) / 2} onChange={v => setKey('scale', 1 + clamp(v, 0, 1) * 2)} />
              <ColorSlider label="Pan X" value={mk[ki].x} onChange={v => setKey('x', v)} />
              <ColorSlider label="Pan Y" value={mk[ki].y} onChange={v => setKey('y', v)} />
              <button onClick={delKey} className="ms-btn-text" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}><Trash2 size={12} /> {mk.length <= 2 ? 'Clear keyframes' : 'Delete this keyframe'}</button>
            </>
          )}
        </Field>
      )}

      <Field label="Transition in">
        <TransitionPicker value={clip.transitionIn} onChange={t => patch({ transitionIn: t })} />
      </Field>
      <Field label="Transition out">
        <TransitionPicker value={clip.transitionOut} onChange={t => patch({ transitionOut: t })} />
      </Field>
      <p style={{ fontSize: 10.5, color: 'var(--ms-ink-3)', margin: '-6px 0 12px', lineHeight: 1.4 }}>Fade/Dissolve crossfade when clips overlap — drag a clip over its neighbour on the timeline.</p>

      <Field label="Opacity keyframes">
        {!ok ? (
          <button onClick={startOKeys} className="ms-btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '8px' }}>+ Animate opacity</button>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
              {ok.map((k, j) => (
                <button key={j} onClick={() => setOkSel(j)} className={`ms-chip${oi === j ? ' ms-chip-active' : ''}`} style={{ padding: '4px 8px', fontSize: 10.5 }}>◆ {Math.round(k.t * 100)}%</button>
              ))}
              <button onClick={addOKey} title="Add keyframe at playhead" className="ms-iconbtn" style={{ width: 26, height: 26 }}>+</button>
            </div>
            <ColorSlider label={`Opacity @ ${Math.round(ok[oi].t * 100)}%`} min={0} max={100} value={ok[oi].v} onChange={v => setOKey(clamp(v, 0, 1))} />
            <button onClick={delOKey} className="ms-btn-text" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}><Trash2 size={12} /> {ok.length <= 2 ? 'Clear opacity' : 'Delete this keyframe'}</button>
          </>
        )}
      </Field>

      <div style={{ height: 1, background: 'var(--ms-line)', margin: '6px 0 14px' }} />

      {luts.length > 0 && (
        <Field label="Look">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            <button onClick={() => patch({ lut: null })} className={`ms-chip${!clip.lut ? ' ms-chip-active' : ''}`} style={{ padding: '7px 4px', fontSize: 10, justifyContent: 'center' }}>None</button>
            <label className="ms-chip" title="Upload a .cube LUT" style={{ padding: '7px 4px', fontSize: 10, justifyContent: 'center', cursor: 'pointer' }}>
              + .cube
              <input type="file" accept=".cube" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onUploadLut(f); e.target.value = ''; }} />
            </label>
            {luts.map(l => (
              <button key={l.id} onClick={() => patch({ lut: l.id })} title={l.name}
                className={`ms-chip${clip.lut === l.id ? ' ms-chip-active' : ''}`}
                style={{ padding: 0, overflow: 'hidden', flexDirection: 'column', height: 46, position: 'relative' }}>
                <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#caa37a,#6b8aa6)', filter: l.css === 'none' ? undefined : l.css }} />
                <span style={{ position: 'relative', fontSize: 8.5, fontWeight: 600, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.7)', alignSelf: 'flex-end', width: '100%', textAlign: 'left', padding: '0 4px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</span>
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="Color">
        <ColorSlider label="Exposure" value={color.brightness} onChange={v => setColor('brightness', v)} />
        <ColorSlider label="Contrast" value={color.contrast} onChange={v => setColor('contrast', v)} />
        <ColorSlider label="Saturation" value={color.saturation} onChange={v => setColor('saturation', v)} />
        <ColorSlider label="Warmth" value={color.temperature} onChange={v => setColor('temperature', v)} />
        <ColorSlider label="Tint" value={color.tint} onChange={v => setColor('tint', v)} />
      </Field>

      <Field label="Effects">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {VIDEO_EFFECTS.map(e => (
            <button key={e.id} onClick={() => toggleFx(e.id)} className={`ms-chip${fx.includes(e.id) ? ' ms-chip-active' : ''}`} style={{ padding: '5px 9px', fontSize: 11 }}>{e.label}</button>
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
        <button onClick={onDup} className="ms-btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '8px' }}><Copy size={13} /> Duplicate</button>
        <button onClick={onDelete} className="ms-btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '8px', color: '#d4564a' }}><Trash2 size={13} /> Delete</button>
      </div>
    </div>
  );
}

function TransitionPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
      {TRANSITIONS.map(t => {
        const active = (t.id === 'none' && !value) || value?.type === t.id;
        return <button key={t.id} onClick={() => onChange(t.id === 'none' ? null : { type: t.id, duration: 400 })}
          className={`ms-chip${active ? ' ms-chip-active' : ''}`} style={{ padding: '5px 9px', fontSize: 11 }}>{t.label}</button>;
      })}
    </div>
  );
}

function TextOverlay({ clip, stage }) {
  const t = clip.text || {}, tf = clip.transform || {};
  const fontPx = Math.max(8, (t.size || 48) * (stage.height / 1080) * (tf.scale || 1));
  const fam = (FONT_FAMILIES.find(f => f.id === t.font) || FONT_FAMILIES[0]).css;
  const boxed = ['caption', 'lowerThird', 'cta'].includes(t.type);
  const left = t.align === 'left' ? `${6 + (tf.x || 0) * 100}%` : t.align === 'right' ? `${94 + (tf.x || 0) * 100}%` : `${50 + (tf.x || 0) * 100}%`;
  const tx = t.align === 'left' ? '0%' : t.align === 'right' ? '-100%' : '-50%';
  return (
    <div style={{
      position: 'absolute', left, top: `${50 + (tf.y || 0) * 100}%`, transform: `translate(${tx}, -50%)`, maxWidth: '88%', pointerEvents: 'none',
      fontFamily: fam, fontWeight: t.weight || 700, fontSize: fontPx, lineHeight: 1.12, color: t.color || '#fff', opacity: tf.opacity ?? t.opacity ?? 1,
      textAlign: t.align || 'center', letterSpacing: (t.letterSpacing || 0) * (stage.height / 1080),
      background: boxed ? 'rgba(0,0,0,0.35)' : 'transparent', padding: boxed ? `${fontPx * 0.18}px ${fontPx * 0.4}px` : 0, borderRadius: boxed ? 6 : 0,
      textShadow: boxed ? 'none' : '0 2px 14px rgba(0,0,0,0.5)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>{t.content || ' '}</div>
  );
}

function TextInspector({ clip, patch, onDelete, onDup }) {
  const t = clip.text || {};
  const tf = clip.transform || {};
  const setText = (k, v) => patch({ text: { [k]: v } });
  const setTf = (k, v) => patch({ transform: { [k]: v } });
  return (
    <div style={{ padding: 14, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--ms-accent)', color: 'var(--ms-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Type size={15} /></span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ms-ink)' }}>Text</span>
      </div>

      <textarea value={t.content || ''} onChange={e => setText('content', e.target.value)} rows={2} placeholder="Your text"
        className="ms-input" style={{ width: '100%', resize: 'vertical', marginBottom: 14, fontFamily: 'var(--ms-font-ui)' }} autoFocus />

      <Field label="Style">
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {TEXT_TYPES.map(tt => (
            <button key={tt.id} onClick={() => patch({ text: { type: tt.id, size: tt.size, weight: tt.weight }, transform: { y: tt.y } })}
              className={`ms-chip${t.type === tt.id ? ' ms-chip-active' : ''}`} style={{ padding: '5px 9px', fontSize: 11 }}>{tt.label}</button>
          ))}
        </div>
      </Field>

      <Field label="Font">
        <div style={{ display: 'flex', gap: 5 }}>
          {FONT_FAMILIES.map(f => (
            <button key={f.id} onClick={() => setText('font', f.id)} className={`ms-chip${t.font === f.id ? ' ms-chip-active' : ''}`} style={{ flex: 1, fontFamily: f.css }}>{f.label}</button>
          ))}
        </div>
      </Field>

      <Field label={`Size · ${t.size || 48}`}>
        <input type="range" min={16} max={160} value={t.size || 48} onChange={e => setText('size', Number(e.target.value))} style={{ width: '100%' }} />
      </Field>

      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ms-ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Color</div>
          <input type="color" value={t.color || '#ffffff'} onChange={e => setText('color', e.target.value)} style={{ width: 44, height: 30, borderRadius: 7, border: '1px solid var(--ms-line)', background: 'none', cursor: 'pointer' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ms-ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>Align</div>
          <div style={{ display: 'flex', gap: 5 }}>
            {['left', 'center', 'right'].map(a => (
              <button key={a} onClick={() => setText('align', a)} className={`ms-chip${(t.align || 'center') === a ? ' ms-chip-active' : ''}`} style={{ flex: 1, padding: '6px 4px', fontSize: 11 }}>{a[0].toUpperCase()}</button>
            ))}
          </div>
        </div>
      </div>

      <Field label="Animation">
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {TEXT_ANIM.map(a => (
            <button key={a.id} onClick={() => setText('animation', a.id)} className={`ms-chip${(t.animation || 'fade') === a.id ? ' ms-chip-active' : ''}`} style={{ padding: '5px 9px', fontSize: 11 }}>{a.label}</button>
          ))}
        </div>
      </Field>

      <Field label="Position">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 11.5, color: 'var(--ms-ink-2)' }}>Horizontal</span></div>
        <input type="range" min={-45} max={45} value={Math.round((tf.x || 0) * 100)} onChange={e => setTf('x', Number(e.target.value) / 100)} onDoubleClick={() => setTf('x', 0)} style={{ width: '100%', marginBottom: 8 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}><span style={{ fontSize: 11.5, color: 'var(--ms-ink-2)' }}>Vertical</span></div>
        <input type="range" min={-45} max={45} value={Math.round((tf.y || 0) * 100)} onChange={e => setTf('y', Number(e.target.value) / 100)} onDoubleClick={() => setTf('y', 0)} style={{ width: '100%' }} />
      </Field>

      <Field label={`Duration · ${(clip.duration / 1000).toFixed(1)}s`}>
        <input type="range" min={500} max={12000} step={100} value={clip.duration} onChange={e => patch({ duration: Number(e.target.value) })} style={{ width: '100%' }} />
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onDup} className="ms-btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '8px' }}><Copy size={13} /> Duplicate</button>
        <button onClick={onDelete} className="ms-btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '8px', color: '#d4564a' }}><Trash2 size={13} /> Delete</button>
      </div>
    </div>
  );
}

function ColorSlider({ label, value, onChange, min = -100, max = 100 }) {
  return (
    <div style={{ marginBottom: 9 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 11.5, color: 'var(--ms-ink-2)' }}>{label}</span>
        <span style={{ fontSize: 10.5, color: 'var(--ms-ink-3)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(value * 100)}</span>
      </div>
      <input type="range" min={min} max={max} value={Math.round(value * 100)} onChange={e => onChange(Number(e.target.value) / 100)} onDoubleClick={() => onChange(0)} style={{ width: '100%' }} />
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ms-ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

function ExportModal({ timelineId, aspect, duration, onClose }) {
  const recommended = EXPORT_PRESETS.find(p => p.aspect === aspect) || EXPORT_PRESETS[0];
  const [preset, setPreset] = useState(recommended.id);
  const [quality, setQuality] = useState(1080);
  const [exp, setExp] = useState(null);
  const [err, setErr] = useState('');
  const poll = useRef(null);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  const start = async () => {
    setErr('');
    try {
      const r = await mediaAPI.exportTimeline(timelineId, { preset, quality });
      setExp(r.data);
      poll.current = setInterval(async () => {
        try {
          const e = (await mediaAPI.getVideoExport(r.data.id)).data;
          setExp(e);
          if (e.status === 'done' || e.status === 'failed') { clearInterval(poll.current); poll.current = null; }
        } catch {}
      }, 1500);
    } catch (e) { setErr(e.response?.data?.error || 'Export failed to start'); }
  };

  const rendering = exp && (exp.status === 'pending' || exp.status === 'rendering');
  const done = exp && exp.status === 'done';
  const failed = exp && exp.status === 'failed';

  return (
    <div {...clickable(onClose)} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div><h2>Export reel</h2><p className="ms-modal-sub">{fmtClock(duration)} · MP4 / H.264</p></div>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ms-ink-3)', padding: 4 }}><X size={20} /></button>
        </div>

        {!exp && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ms-ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Platform</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18, maxHeight: 200, overflowY: 'auto' }}>
              {EXPORT_PRESETS.map(p => (
                <button key={p.id} onClick={() => setPreset(p.id)} className={`ms-chip${preset === p.id ? ' ms-chip-active' : ''}`} style={{ justifyContent: 'space-between' }}>
                  {p.label} <span style={{ fontSize: 10, opacity: 0.6 }}>{p.aspect}</span>
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ms-ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Quality</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {QUALITIES.map(q => (
                <button key={q.v} onClick={() => setQuality(q.v)} className={`ms-chip${quality === q.v ? ' ms-chip-active' : ''}`} style={{ flex: 1 }}>{q.label}</button>
              ))}
            </div>
            {err && <p style={{ color: '#d4564a', fontSize: 12.5, marginBottom: 12 }}>{err}</p>}
            <button onClick={start} className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center' }}><Download size={15} /> Render MP4</button>
            <p style={{ fontSize: 10.5, color: 'var(--ms-ink-3)', marginTop: 12, lineHeight: 1.5 }}>Renders on the server in the background — you can keep working. 4K takes longer than 1080p.</p>
          </>
        )}

        {rendering && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Loader size={26} className="ms-spin" color="var(--ms-accent)" />
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--ms-ink)', margin: '14px 0 6px' }}>Rendering… {exp.progress || 0}%</p>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--ms-surface-2)', overflow: 'hidden', margin: '0 auto', maxWidth: 280 }}>
              <div style={{ height: '100%', width: `${exp.progress || 1}%`, background: 'var(--ms-accent)', transition: 'width .4s' }} />
            </div>
          </div>
        )}

        {done && (
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#2f9e6e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><Check size={24} color="#fff" /></div>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--ms-ink)', marginBottom: 4 }}>Your reel is ready</p>
            <p style={{ fontSize: 12, color: 'var(--ms-ink-3)', marginBottom: 16 }}>{exp.size_bytes ? (exp.size_bytes / 1048576).toFixed(1) + ' MB' : ''} · {exp.width}×{exp.height}</p>
            <a href={mediaUrl(exp.url)} download className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}><Download size={15} /> Download MP4</a>
            <video src={mediaUrl(exp.url)} controls style={{ width: '100%', borderRadius: 10, marginTop: 14, background: '#000' }} />
          </div>
        )}

        {failed && (
          <div style={{ padding: '8px 0' }}>
            <p style={{ fontSize: 13.5, color: '#d4564a', fontWeight: 600, marginBottom: 8 }}>Render failed</p>
            <p style={{ fontSize: 12.5, color: 'var(--ms-ink-2)', lineHeight: 1.6, marginBottom: 16 }}>{exp.error_message || 'Something went wrong.'}</p>
            <button onClick={() => setExp(null)} className="ms-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>Try again</button>
          </div>
        )}
      </div>
    </div>
  );
}
