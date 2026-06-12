'use client';
/* eslint-disable @next/next/no-img-element, jsx-a11y/media-has-caption -- dynamic /uploads media, muted preview */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Play, Pause, Scissors, Trash2, Copy, Download, Image as ImageIcon, Film,
  Check, Loader, X, ChevronDown, Wand2, ArrowLeftRight, ZoomIn, ZoomOut,
} from 'lucide-react';
import { mediaAPI, mediaUrl } from '../../../../../lib/api';
import NavBar from '../../../../../components/StudioShell';
import {
  ASPECTS, ASPECT_LABELS, EXPORT_PRESETS, QUALITIES, SAFE_AREAS, TRANSITIONS,
  DEFAULT_PHOTO_MS, DEFAULT_VIDEO_MS, PX_PER_MS, aspectBox, uid,
} from '../../../video-constants';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
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

export default function VideoEditor() {
  const router = useRouter();
  const { id, timelineId } = useParams();
  const [doc, setDoc] = useState(null);
  const [name, setName] = useState('');
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState(PX_PER_MS);
  const [saveState, setSaveState] = useState('saved'); // saved | saving | dirty
  const [aspectMenu, setAspectMenu] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 360, height: 640 });

  const stageWrapRef = useRef(null);
  const videoRef = useRef(null);
  const saveTimer = useRef(null);
  const firstLoad = useRef(true);
  const drag = useRef(null);

  const assetMap = useMemo(() => Object.fromEntries(assets.map(a => [a.id, a])), [assets]);

  // load
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
    (async () => {
      try {
        const [t, a] = await Promise.all([mediaAPI.getTimeline(timelineId), mediaAPI.listAssets(id, { limit: 500 })]);
        const d = t.data.document && t.data.document.tracks?.length ? t.data.document : emptyDoc(t.data.aspect_ratio);
        if (!getSpine(d)) d.tracks.unshift({ id: uid('t'), type: 'video', clips: [] });
        setDoc(d); setName(t.data.name || 'Untitled reel');
        setAssets((a.data.assets || []).filter(x => x.type === 'photo' || x.type === 'video'));
      } catch { router.push(`/studio/${id}/video`); return; }
      setLoading(false);
    })();
  }, [id, timelineId]);

  const spine = doc ? getSpine(doc) : null;
  const duration = spine ? spineEnd(spine) : 0;
  const selected = spine?.clips.find(c => c.id === selId) || null;

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

  // stage sizing — fit the aspect box into the available stage area
  useEffect(() => {
    const el = stageWrapRef.current; if (!el || !doc) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setStageSize(aspectBox(doc.aspect, r.width - 24, r.height - 24));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc?.aspect]);

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

  const activeClip = spine?.clips.find(c => playhead >= c.start && playhead < c.end) || null;
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
  const removeClip = (cid) => { mutateSpine(cs => repack(cs.filter(c => c.id !== cid))); if (selId === cid) setSelId(null); };
  const duplicateClip = (cid) => mutateSpine(cs => {
    const c = cs.find(x => x.id === cid); if (!c) return cs;
    return repack([...cs, { ...c, id: uid() }]);
  });
  const patchClip = (cid, patch) => mutateSpine(cs => cs.map(c => {
    if (c.id !== cid) return c;
    const n = { ...c, ...patch };
    if (patch.transform) n.transform = { ...c.transform, ...patch.transform };
    if (patch.kenBurns) n.kenBurns = { ...c.kenBurns, ...patch.kenBurns };
    n.end = n.start + n.duration;
    return n;
  }));

  const changeAspect = (aspect) => { setDoc(d => ({ ...d, aspect })); setAspectMenu(false); };

  // ── timeline drag (move / trim) ───────────────────────────────────────────────
  const onClipPointerDown = (e, clip, mode) => {
    e.stopPropagation();
    setSelId(clip.id); setPlaying(false);
    drag.current = { id: clip.id, mode, startX: e.clientX, orig: { ...clip } };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragUp);
  };
  const onDragMove = (e) => {
    const d = drag.current; if (!d) return;
    const dx = (e.clientX - d.startX) / scale; // ms moved
    mutateSpine(cs => {
      let next = cs.map(c => {
        if (c.id !== d.id) return c;
        if (d.mode === 'move') return { ...c, start: Math.max(0, d.orig.start + dx) };
        if (d.mode === 'trimR') { const dur = clamp(d.orig.duration + dx, 300, 120000); return { ...c, duration: dur, end: c.start + dur, out: (c.in || 0) + dur * (c.speed || 1) }; }
        if (d.mode === 'trimL') {
          const dur = clamp(d.orig.duration - dx, 300, 120000); const delta = d.orig.duration - dur;
          return { ...c, duration: dur, in: Math.max(0, (d.orig.in || 0) + delta * (c.speed || 1)) };
        }
        return c;
      });
      return d.mode === 'move' ? repack(next) : next.map(c => ({ ...c, end: c.start + c.duration }));
    });
  };
  const onDragUp = () => { drag.current = null; window.removeEventListener('pointermove', onDragMove); window.removeEventListener('pointerup', onDragUp); };

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
      else if (e.key.toLowerCase() === 's') { e.preventDefault(); splitAtPlayhead(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && selId) { e.preventDefault(); removeClip(selId); }
      else if (e.key === 'ArrowRight') setPlayhead(p => clamp(p + 100, 0, duration));
      else if (e.key === 'ArrowLeft') setPlayhead(p => clamp(p - 100, 0, duration));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selId, activeClip, duration, playhead]); // eslint-disable-line

  if (loading || !doc) return <NavBar><div className="ms-page"><p className="ms-loading">Opening editor…</p></div></NavBar>;

  const safe = SAFE_AREAS[EXPORT_PRESETS.find(p => p.aspect === doc.aspect && p.safe)?.safe] || null;

  // active-clip media style (transform + Ken Burns)
  let mediaStyle = { width: '100%', height: '100%', objectFit: 'cover' };
  if (activeClip) {
    const p = activeClip.duration ? (playhead - activeClip.start) / activeClip.duration : 0;
    const tf = activeClip.transform || {};
    let sc = tf.scale || 1, tx = (tf.x || 0) * 100, ty = (tf.y || 0) * 100;
    if (activeClip.kenBurns) { const k = activeClip.kenBurns; sc *= lerp(k.fromScale, k.toScale, p); tx += lerp(k.fromX, k.toX, p) * 100; ty += lerp(k.fromY, k.toY, p) * 100; }
    mediaStyle = { ...mediaStyle, transform: `translate(${tx}%, ${ty}%) scale(${sc}) rotate(${tf.rotation || 0}deg)`, opacity: tf.opacity ?? 1, transition: playing ? 'none' : 'transform .12s' };
  }

  return (
    <NavBar>
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
          <div className="ms-ve-stage" ref={stageWrapRef}>
            <div className="ms-ve-frame" style={{ width: stageSize.width, height: stageSize.height }}>
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
              {/* safe-area guides */}
              {safe && (
                <div className="ms-ve-safe" style={{ top: `${safe.top * 100}%`, bottom: `${safe.bottom * 100}%`, left: `${safe.left * 100}%`, right: `${safe.right * 100}%` }} />
              )}
            </div>
            <div className="ms-ve-transport">
              <button onClick={() => setPlaying(p => !p)} className="ms-ve-play">{playing ? <Pause size={17} /> : <Play size={17} />}</button>
              <span className="ms-ve-clock">{fmtClock(playhead)} <span style={{ opacity: 0.5 }}>/ {fmtClock(duration)}</span></span>
            </div>
          </div>

          {/* inspector */}
          <aside className="ms-ve-insp">
            {!selected ? (
              <div style={{ padding: 16, color: 'var(--ms-ink-3)', fontSize: 12.5, lineHeight: 1.6 }}>
                <Wand2 size={16} style={{ marginBottom: 8, opacity: 0.7 }} /><br />
                Select a clip to edit it. Click media on the left to add it to the timeline.<br /><br />
                <b style={{ color: 'var(--ms-ink-2)' }}>Shortcuts</b><br />Space play · S split · Del remove · ←→ nudge
              </div>
            ) : <Inspector clip={selected} patch={(p) => patchClip(selected.id, p)} onDelete={() => removeClip(selected.id)} onDup={() => duplicateClip(selected.id)} />}
          </aside>
        </div>

        {/* timeline */}
        <div className="ms-ve-timeline">
          <div className="ms-ve-tl-tools">
            <button onClick={splitAtPlayhead} disabled={!activeClip} className="ms-ve-tool" title="Split (S)"><Scissors size={14} /> Split</button>
            <button onClick={() => selId && duplicateClip(selId)} disabled={!selId} className="ms-ve-tool" title="Duplicate"><Copy size={14} /></button>
            <button onClick={() => selId && removeClip(selId)} disabled={!selId} className="ms-ve-tool" title="Delete (Del)"><Trash2 size={14} /></button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setScale(s => clamp(s / 1.3, 0.012, 0.4))} className="ms-ve-tool"><ZoomOut size={14} /></button>
            <button onClick={() => setScale(s => clamp(s * 1.3, 0.012, 0.4))} className="ms-ve-tool"><ZoomIn size={14} /></button>
          </div>
          <div className="ms-ve-tl-scroll">
            <div className="ms-ve-tl-track" style={{ width: Math.max(duration * scale + 40, 600) }} onPointerDown={scrubTo}>
              {spine.clips.map(c => {
                const a = assetMap[c.assetId];
                return (
                  <div key={c.id} onPointerDown={(e) => onClipPointerDown(e, c, 'move')}
                    className={`ms-ve-clip${selId === c.id ? ' is-sel' : ''}`}
                    style={{ left: c.start * scale, width: Math.max(c.duration * scale, 18) }}>
                    {a && <img src={mediaUrl(a.type === 'video' ? (a.poster_url || a.thumb_url) : (a.thumb_url || a.url))} alt="" />}
                    <span className="ms-ve-clip-label">{c.kind === 'video' ? <Film size={10} /> : <ImageIcon size={10} />}{c.speed !== 1 ? ` ${c.speed}×` : ''}</span>
                    <span className="ms-ve-handle l" onPointerDown={(e) => onClipPointerDown(e, c, 'trimL')} />
                    <span className="ms-ve-handle r" onPointerDown={(e) => onClipPointerDown(e, c, 'trimR')} />
                  </div>
                );
              })}
              {spine.clips.length === 0 && <div className="ms-ve-tl-empty">Click media above to build your reel →</div>}
              <div className="ms-ve-playhead" style={{ left: playhead * scale }} />
            </div>
          </div>
        </div>
      </div>

      {showExport && <ExportModal timelineId={timelineId} aspect={doc.aspect} duration={duration} onClose={() => setShowExport(false)} />}
    </NavBar>
  );
}

function dipStyle(tr, intensity) {
  const white = tr.type === 'dipToWhite';
  const fade = tr.type === 'fade' || tr.type === 'dipToBlack' || tr.type === 'dipToWhite';
  if (!fade) return { display: 'none' };
  return { position: 'absolute', inset: 0, background: white ? '#fff' : '#000', opacity: clamp(intensity, 0, 1), pointerEvents: 'none' };
}

function Inspector({ clip, patch, onDelete, onDup }) {
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ms-ink-2)', margin: '4px 0 14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!clip.reverse} onChange={e => patch({ reverse: e.target.checked })} style={{ accentColor: 'var(--ms-accent)' }} /> Reverse playback
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
              return <button key={lbl} onClick={() => patch({ kenBurns: kb })} className={`ms-chip${active ? ' ms-chip-active' : ''}`} style={{ padding: '5px 9px', fontSize: 11 }}>{lbl}</button>;
            })}
          </div>
        </Field>
      )}

      <Field label="Transition in">
        <TransitionPicker value={clip.transitionIn} onChange={t => patch({ transitionIn: t })} />
      </Field>
      <Field label="Transition out">
        <TransitionPicker value={clip.transitionOut} onChange={t => patch({ transitionOut: t })} />
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
    <div onClick={onClose} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div><h2>Export reel</h2><p className="ms-modal-sub">{fmtClock(duration)} · MP4 / H.264</p></div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ms-ink-3)', padding: 4 }}><X size={20} /></button>
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
