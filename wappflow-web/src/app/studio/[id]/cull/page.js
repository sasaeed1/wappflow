'use client';
/* eslint-disable @next/next/no-img-element -- cull viewer shows dynamic /uploads photos; next/image isn't configured for them */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Check, X, HelpCircle, Star, ChevronLeft, ChevronRight, Sparkles, Copy as Dup, Images,
  Columns2, SlidersHorizontal, RotateCcw, RotateCw, Crop, Loader, Undo2, Wand2, Info,
  ClipboardCopy, ClipboardPaste, Users,
} from 'lucide-react';
import { mediaAPI, mediaUrl } from '../../../../lib/api';
import NavBar from '../../../../components/StudioShell';
import { PRESETS, previewFilter, previewVignette, suggestEnhance } from '../../presets';

const FILTERS = [
  ['all', 'All'], ['undecided', 'To review'], ['keep', 'Keepers'], ['maybe', 'Maybe'], ['reject', 'Rejected'],
];
const DEC_META = {
  keep:   { label: 'KEEP',   color: '#2f9e6e', Icon: Check },
  reject: { label: 'REJECT', color: '#d4564a', Icon: X },
  maybe:  { label: 'MAYBE',  color: '#d39a3e', Icon: HelpCircle },
};
const ZERO_EDITS = { exposure: 0, contrast: 0, temperature: 0, tint: 0, saturation: 0, fade: 0, vignette: 0, grain: 0, bw: 0, rotate: 0 };
const FULL_CROP = { x: 0, y: 0, w: 1, h: 1 };
const EDIT_KEYS = ['exposure', 'contrast', 'temperature', 'tint', 'saturation', 'fade', 'vignette', 'grain', 'bw', 'rotate'];

const parseEdits = (a) => { try { return JSON.parse(a?.edits || '{}'); } catch { return {}; } };
const hasEdits = (a) => { const e = parseEdits(a); return EDIT_KEYS.concat('crop').some(k => e[k]); };

function EditSlider({ label, value, onChange, min = -100, max = 100 }) {
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11.5, color: 'var(--ms-ink-2)' }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--ms-ink-3)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(value * 100)}</span>
      </div>
      <input type="range" min={min} max={max} value={Math.round(value * 100)}
        onChange={e => onChange(Number(e.target.value) / 100)}
        onDoubleClick={() => onChange(0)}
        style={{ width: '100%', accentColor: 'var(--ms-accent)' }} />
    </div>
  );
}

function CropOverlay({ crop, setCrop, boxRef }) {
  const drag = useRef(null);
  useEffect(() => {
    const move = (e) => {
      if (!drag.current || !boxRef.current) return;
      const r = boxRef.current.getBoundingClientRect();
      const dx = (e.clientX - drag.current.sx) / r.width;
      const dy = (e.clientY - drag.current.sy) / r.height;
      const s = drag.current.startCrop;
      let { x, y, w, h } = s;
      const m = drag.current.mode;
      if (m === 'move') { x = s.x + dx; y = s.y + dy; }
      else {
        if (m.includes('w')) { x = s.x + dx; w = s.w - dx; }
        if (m.includes('e')) { w = s.w + dx; }
        if (m.includes('n')) { y = s.y + dy; h = s.h - dy; }
        if (m.includes('s')) { h = s.h + dy; }
      }
      w = Math.max(0.08, Math.min(1, w)); h = Math.max(0.08, Math.min(1, h));
      x = Math.max(0, Math.min(1 - w, x)); y = Math.max(0, Math.min(1 - h, y));
      setCrop({ x, y, w, h });
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [setCrop, boxRef]);

  const start = (mode) => (e) => { e.preventDefault(); e.stopPropagation(); drag.current = { mode, startCrop: { ...crop }, sx: e.clientX, sy: e.clientY }; };
  const pct = (v) => `${v * 100}%`;
  const handle = (mode, style) => (
    <div onPointerDown={start(mode)} style={{ position: 'absolute', width: 16, height: 16, background: '#fff', borderRadius: 3, boxShadow: '0 1px 6px rgba(0,0,0,0.5)', cursor: `${mode}-resize`, ...style }} />
  );
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 ${pct(crop.y)}, ${pct(crop.x)} ${pct(crop.y)}, ${pct(crop.x)} ${pct(crop.y + crop.h)}, ${pct(crop.x + crop.w)} ${pct(crop.y + crop.h)}, ${pct(crop.x + crop.w)} ${pct(crop.y)}, 0 ${pct(crop.y)})` }} />
      <div onPointerDown={start('move')} style={{ position: 'absolute', left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h), border: '1.5px solid #fff', cursor: 'move', boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.25) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.25) 1px, transparent 1px)', backgroundSize: '33.4% 33.4%' }} />
      </div>
      {handle('nw', { left: `calc(${pct(crop.x)} - 8px)`, top: `calc(${pct(crop.y)} - 8px)` })}
      {handle('ne', { left: `calc(${pct(crop.x + crop.w)} - 8px)`, top: `calc(${pct(crop.y)} - 8px)` })}
      {handle('sw', { left: `calc(${pct(crop.x)} - 8px)`, top: `calc(${pct(crop.y + crop.h)} - 8px)` })}
      {handle('se', { left: `calc(${pct(crop.x + crop.w)} - 8px)`, top: `calc(${pct(crop.y + crop.h)} - 8px)` })}
    </div>
  );
}

export default function CullPage() {
  const router = useRouter();
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [assets, setAssets] = useState([]);
  const [filter, setFilter] = useState('all');
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showGallery, setShowGallery] = useState(false);
  // workspace tools
  const [tool, setTool] = useState('info'); // info | edit | presets
  const [compare, setCompare] = useState(false);
  const [pending, setPending] = useState({ ...ZERO_EDITS });
  const [crop, setCrop] = useState({ ...FULL_CROP });
  const [cropOn, setCropOn] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [copied, setCopied] = useState(null);
  const [toast, setToast] = useState(null);
  // zoom
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panDrag = useRef(null);
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const cropBoxRef = useRef(null);

  const editing = tool === 'edit' || tool === 'presets';
  const zoomed = scale > 1.001;

  const say = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const refreshAssets = useCallback(async () => {
    try { const r = await mediaAPI.listAssets(id, { limit: 500 }); setAssets(r.data.assets || []); return r.data.assets || []; } catch { return []; }
  }, [id]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
    try { const c = localStorage.getItem('ms-copied-edits'); if (c) setCopied(JSON.parse(c)); } catch {}
    (async () => {
      try {
        const [p, a] = await Promise.all([mediaAPI.getProject(id), mediaAPI.listAssets(id, { limit: 500 })]);
        setProject(p.data); setAssets(a.data.assets || []);
      } catch { router.push('/studio'); return; }
      setLoading(false);
    })();
  }, [id]);

  const counts = useMemo(() => {
    const c = { all: assets.length, keep: 0, reject: 0, maybe: 0, undecided: 0 };
    assets.forEach(a => { const d = a.cull_decision || 'undecided'; c[d] = (c[d] || 0) + 1; });
    return c;
  }, [assets]);

  const view = useMemo(
    () => (filter === 'all' ? assets : assets.filter(a => (a.cull_decision || 'undecided') === filter)),
    [assets, filter]
  );
  const idx = Math.min(cursor, Math.max(0, view.length - 1));
  const current = view[idx];
  const keepers = useMemo(() => assets.filter(a => a.cull_decision === 'keep'), [assets]);

  const applyLocal = (assetId, patch) => setAssets(prev => prev.map(a => (a.id === assetId ? { ...a, ...patch } : a)));

  const decide = useCallback(async (decision, assetId) => {
    const target = assetId ? assets.find(a => a.id === assetId) : current;
    if (!target) return;
    applyLocal(target.id, { cull_decision: decision });
    if (!assetId && filter === 'all') setCursor(c => Math.min(c + 1, view.length - 1));
    try { await mediaAPI.cullAsset(target.id, { decision }); } catch {}
  }, [current, assets, filter, view.length]);

  const rate = useCallback(async (n) => {
    if (!current) return;
    const v = current.cull_rating === n ? 0 : n;
    applyLocal(current.id, { cull_rating: v });
    try { await mediaAPI.cullAsset(current.id, { rating: v }); } catch {}
  }, [current]);

  const next = useCallback(() => { setScale(1); setPan({ x: 0, y: 0 }); setCursor(c => Math.min(c + 1, view.length - 1)); }, [view.length]);
  const prev = useCallback(() => { setScale(1); setPan({ x: 0, y: 0 }); setCursor(c => Math.max(c - 1, 0)); }, []);

  const loadPendingFrom = (a) => {
    const e = parseEdits(a);
    const p = { ...ZERO_EDITS };
    EDIT_KEYS.forEach(k => { if (e[k]) p[k] = e[k]; });
    setPending(p);
    setCrop(e.crop ? { ...e.crop } : { ...FULL_CROP });
    setActivePreset(null);
  };
  useEffect(() => { setScale(1); setPan({ x: 0, y: 0 }); setCropOn(false); if (current) loadPendingFrom(current); }, [current?.id]); // eslint-disable-line

  // duplicate-group members
  const dupMembers = useMemo(() => {
    if (!current?.dup_group) return null;
    const m = assets.filter(a => a.dup_group === current.dup_group);
    return m.length > 1 ? m.slice(0, 4) : null;
  }, [current, assets]);
  const compareSet = useMemo(() => dupMembers || [current, view[idx + 1]].filter(Boolean), [dupMembers, current, view, idx]);

  // ── zoom: wheel-to-zoom anchored at the cursor; drag to pan ────────────────
  const zoomTo = useCallback((newScale, anchor) => {
    setScale(s => {
      const ns = Math.max(1, Math.min(6, newScale));
      setPan(p => {
        if (ns <= 1.001) return { x: 0, y: 0 };
        if (!anchor || !stageRef.current) return p;
        const r = stageRef.current.getBoundingClientRect();
        const cx = anchor.x - r.left - r.width / 2;
        const cy = anchor.y - r.top - r.height / 2;
        return { x: cx - (cx - p.x) * (ns / s), y: cy - (cy - p.y) * (ns / s) };
      });
      return ns;
    });
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (editing && cropOn) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      zoomTo(scale * factor, { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [scale, zoomTo, editing, cropOn]);

  const toggle100 = useCallback(() => {
    if (zoomed) { setScale(1); setPan({ x: 0, y: 0 }); return; }
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const ratio = img.naturalWidth / img.getBoundingClientRect().width;
    zoomTo(Math.max(1.05, ratio), null);
  }, [zoomed, zoomTo]);

  const startPan = (e) => { if (!zoomed) return; panDrag.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y }; };
  useEffect(() => {
    const move = (e) => { if (panDrag.current) setPan({ x: panDrag.current.px + (e.clientX - panDrag.current.sx), y: panDrag.current.py + (e.clientY - panDrag.current.sy) }); };
    const up = () => { panDrag.current = null; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  // ── copy / paste edits ──────────────────────────────────────────────────────
  const copyEdits = useCallback(() => {
    if (!current) return;
    const e = parseEdits(current);
    const bundle = {}; EDIT_KEYS.forEach(k => { if (e[k]) bundle[k] = e[k]; });
    if (e.crop) bundle.crop = e.crop;
    if (!Object.keys(bundle).length) { say('No edits on this photo to copy'); return; }
    setCopied(bundle);
    try { localStorage.setItem('ms-copied-edits', JSON.stringify(bundle)); } catch {}
    say('Edits copied — Shift+V to paste');
  }, [current]);

  const pollAsset = async (test) => {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const list = await refreshAssets();
      const fresh = list.find(x => x.id === current?.id);
      if (fresh && test(fresh)) return true;
    }
    return false;
  };

  const pasteEdits = useCallback(async () => {
    if (!current || !copied) return;
    setRendering(true);
    try {
      const res = await mediaAPI.setEdits(current.id, copied);
      const rev = res.data?.edits?.rev;
      await pollAsset(f => (parseEdits(f).rev || 0) >= (rev || 1));
      say('Edits pasted');
    } catch (e) { say(e.response?.data?.error || 'Paste failed'); }
    setRendering(false);
  }, [current, copied]); // eslint-disable-line

  // ── apply / reset / batch ───────────────────────────────────────────────────
  const buildBody = () => {
    const body = {}; EDIT_KEYS.forEach(k => { if (pending[k]) body[k] = pending[k]; });
    if (cropOn || (crop.x || crop.y || crop.w !== 1 || crop.h !== 1)) body.crop = crop;
    return body;
  };
  const applyEdits = async () => {
    if (!current) return;
    setRendering(true);
    try {
      const res = await mediaAPI.setEdits(current.id, buildBody());
      const rev = res.data?.edits?.rev;
      await pollAsset(f => (parseEdits(f).rev || 0) >= (rev || 1) && (f.variants?.web || '').includes(`-r${rev}-`));
    } catch (e) { say(e.response?.data?.error || 'Edit failed'); }
    setRendering(false); setCropOn(false);
  };
  const applyToKeepers = async () => {
    if (keepers.length === 0) { say('No keepers yet'); return; }
    setRendering(true);
    try {
      await mediaAPI.batchEdits(id, keepers.map(k => k.id), buildBody());
      say(`Rendering ${keepers.length} keeper${keepers.length === 1 ? '' : 's'}…`);
      setTimeout(refreshAssets, 4000); setTimeout(refreshAssets, 9000);
    } catch (e) { say(e.response?.data?.error || 'Batch failed'); }
    setRendering(false);
  };
  const resetEdits = async () => {
    if (!current) return;
    setRendering(true);
    try { await mediaAPI.clearEdits(current.id); await pollAsset(f => !f.variants?.full_edit); } catch {}
    setPending({ ...ZERO_EDITS }); setCrop({ ...FULL_CROP }); setActivePreset(null); setRendering(false); setCropOn(false);
  };

  const usePreset = (preset) => {
    const p = { ...ZERO_EDITS };
    Object.entries(preset.p).forEach(([k, v]) => { p[k] = v; });
    setPending(p); setActivePreset(preset.id);
  };
  const aiSuggestion = useMemo(() => suggestEnhance(current), [current]);

  // ── keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (compare) { if (k === 'escape' || k === 'c') { e.preventDefault(); setCompare(false); } return; }
      if (e.shiftKey && k === 'c') { e.preventDefault(); copyEdits(); return; }
      if (e.shiftKey && k === 'v') { e.preventDefault(); pasteEdits(); return; }
      if (editing && k === 'escape') { e.preventDefault(); setTool('info'); setCropOn(false); return; }
      if (k === 'escape' && zoomed) { e.preventDefault(); setScale(1); setPan({ x: 0, y: 0 }); return; }
      if (k === 'arrowright' || k === ' ') { e.preventDefault(); next(); }
      else if (k === 'arrowleft') { e.preventDefault(); prev(); }
      else if (k === 'p') { e.preventDefault(); decide('keep'); }
      else if (k === 'x') { e.preventDefault(); decide('reject'); }
      else if (k === 'm') { e.preventDefault(); decide('maybe'); }
      else if (k === 'u' || k === 'backspace') { e.preventDefault(); decide(null); }
      else if (k === 'z') { e.preventDefault(); toggle100(); }
      else if (k === 'c') { e.preventDefault(); if (compareSet.length > 1) setCompare(true); }
      else if (k === 'e') { e.preventDefault(); setTool(t => t === 'edit' ? 'info' : 'edit'); }
      else if (k === 'f') { e.preventDefault(); setTool(t => t === 'presets' ? 'info' : 'presets'); }
      else if (k >= '1' && k <= '5') { e.preventDefault(); rate(Number(k)); }
      else if (k === '0') { e.preventDefault(); rate(0); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, rate, next, prev, zoomed, compare, editing, compareSet.length, toggle100, copyEdits, pasteEdits]);

  if (loading) return <NavBar><div className="ms-page"><p className="ms-loading">Loading…</p></div></NavBar>;

  const sharp = current?.sharpness != null ? current.sharpness >= 120 : null;
  const expo = current?.exposure;
  const overE = (current?.high_clip || 0) > 0.06 || (expo != null && expo > 0.78);
  const underE = (current?.shadow_clip || 0) > 0.10 || (expo != null && expo < 0.22);
  const expoLabel = expo == null ? '—' : overE ? 'Bright' : underE ? 'Dark' : 'Balanced';
  const expoColor = (overE || underE) ? '#d39a3e' : '#2f9e6e';
  const q = current?.quality;
  const qualLabel = q == null ? '—' : q >= 0.66 ? 'Great' : q >= 0.4 ? 'Good' : 'Weak';
  const qualColor = q == null ? 'var(--ms-ink-3)' : q >= 0.66 ? '#2f9e6e' : q >= 0.4 ? '#d39a3e' : '#d4564a';
  const livePreview = editing ? { filter: previewFilter(pending), transform: pending.rotate ? `rotate(${pending.rotate}deg)` : undefined } : {};
  const liveVignette = editing ? previewVignette(pending) : 'none';

  const railBtn = (key, Icon, label) => (
    <button key={key} onClick={() => setTool(t => t === key ? 'info' : key)} title={label}
      className="ms-iconbtn" style={{ width: 40, height: 40, borderRadius: 11, background: tool === key ? 'var(--ms-accent)' : 'transparent', color: tool === key ? 'var(--ms-on-accent)' : 'var(--ms-ink-2)', borderColor: tool === key ? 'var(--ms-accent)' : 'var(--ms-line)' }}>
      <Icon size={17} />
    </button>
  );

  return (
    <NavBar>
      <div className="ms-page" style={{ paddingTop: 'clamp(14px, 2vw, 24px)', maxWidth: 1560, paddingBottom: 40 }}>
        {/* header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <button onClick={() => router.push(`/studio/${id}`)} className="ms-back" style={{ margin: 0 }}><ArrowLeft size={15} /> Back</button>
          <h1 className="ms-h2" style={{ fontSize: 'clamp(17px, 2vw, 22px)', flex: 1, minWidth: 120 }}>Cull <span style={{ color: 'var(--ms-ink-3)', fontWeight: 400 }}>{project?.title ? `· ${project.title}` : ''}</span></h1>
          <div className="ms-seg">
            {FILTERS.map(([f, label]) => (
              <button key={f} onClick={() => { setFilter(f); setCursor(0); }} className={filter === f ? 'is-active' : ''}>
                {label} <span style={{ opacity: 0.6 }}>{counts[f] ?? 0}</span>
              </button>
            ))}
          </div>
          {counts.keep > 0 && (
            <button onClick={() => setShowGallery(true)} className="ms-btn-ink" style={{ padding: '9px 16px', fontSize: 12 }}>
              <Images size={15} /> Gallery · {counts.keep}
            </button>
          )}
        </div>

        {!current ? (
          <div className="ms-empty-soft">{assets.length === 0 ? 'Upload photographs first.' : 'Nothing in this filter.'}</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
              {/* tool rail */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
                {railBtn('info', Info, 'Info & AI (I)')}
                {railBtn('edit', SlidersHorizontal, 'Edit (E)')}
                {railBtn('presets', Wand2, 'Presets (F)')}
                <button onClick={() => compareSet.length > 1 && setCompare(true)} disabled={compareSet.length < 2} title="Compare (C)"
                  className="ms-iconbtn" style={{ width: 40, height: 40, borderRadius: 11 }}><Columns2 size={17} /></button>
                <div style={{ flex: 1 }} />
                <button onClick={copyEdits} title="Copy edits (Shift+C)" className="ms-iconbtn" style={{ width: 40, height: 40, borderRadius: 11 }}><ClipboardCopy size={16} /></button>
                <button onClick={pasteEdits} disabled={!copied} title="Paste edits (Shift+V)" className="ms-iconbtn" style={{ width: 40, height: 40, borderRadius: 11 }}><ClipboardPaste size={16} /></button>
              </div>

              {/* stage */}
              <div ref={stageRef} style={{ flex: 1, minWidth: 280, position: 'relative', background: '#09090b', borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 500, maxHeight: '74vh', cursor: zoomed ? 'grab' : 'default' }}
                onPointerDown={startPan} onDoubleClick={toggle100}>
                <div ref={cropBoxRef} style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', maxHeight: '74vh', transform: zoomed ? `translate(${pan.x}px, ${pan.y}px) scale(${scale})` : undefined, transition: panDrag.current ? 'none' : 'transform 0.12s ease-out' }}>
                  <img ref={imgRef} key={current.id} src={mediaUrl(zoomed ? (current.variants?.full_edit || current.url) : (current.variants?.web || current.url))} alt={current.filename} draggable={false}
                    style={{ maxWidth: '100%', maxHeight: '74vh', objectFit: 'contain', display: 'block', userSelect: 'none', ...livePreview }} />
                  {liveVignette !== 'none' && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: liveVignette, transform: pending.rotate ? `rotate(${pending.rotate}deg)` : undefined }} />}
                  {editing && cropOn && !zoomed && <CropOverlay crop={crop} setCrop={setCrop} boxRef={cropBoxRef} />}
                </div>

                {!editing && current.cull_decision && DEC_META[current.cull_decision] && (
                  <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, background: DEC_META[current.cull_decision].color, color: 'white', fontWeight: 700, fontSize: 10.5, letterSpacing: '0.08em' }}>
                    {(() => { const I = DEC_META[current.cull_decision].Icon; return <I size={12} />; })()}
                    {DEC_META[current.cull_decision].label}
                  </div>
                )}
                {hasEdits(current) && !editing && (
                  <div style={{ position: 'absolute', top: 14, right: 14, padding: '4px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: '#e8cb8d', fontSize: 10.5, fontWeight: 600, letterSpacing: '0.06em' }}>EDITED</div>
                )}
                <div style={{ position: 'absolute', bottom: 12, right: 12, padding: '4px 11px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10.5, fontWeight: 600 }}>
                  {zoomed ? `${Math.round(scale * 100)}% · scroll to zoom · drag to pan` : 'scroll or dbl-click to zoom'}
                </div>
                {rendering && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', color: '#fff', gap: 10, fontSize: 13 }}>
                    <Loader size={16} className="ms-spin" /> Rendering…
                  </div>
                )}
                {toast && (
                  <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', padding: '7px 16px', borderRadius: 999, background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 12 }}>{toast}</div>
                )}
                {!zoomed && !editing && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); prev(); }} disabled={idx === 0} style={navArrow('left', idx === 0)}><ChevronLeft size={22} /></button>
                    <button onClick={(e) => { e.stopPropagation(); next(); }} disabled={idx >= view.length - 1} style={navArrow('right', idx >= view.length - 1)}><ChevronRight size={22} /></button>
                  </>
                )}
                <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', padding: '4px 13px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11, fontWeight: 500 }}>
                  {idx + 1} / {view.length}
                </div>
              </div>

              {/* right panel */}
              <aside style={{ width: 262, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '74vh', overflowY: 'auto' }}>
                {tool === 'presets' && (
                  <div className="ms-panel" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span className="ms-section-label">Presets</span>
                      <span style={{ fontSize: 10.5, color: 'var(--ms-ink-3)' }}>{PRESETS.length} looks</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {PRESETS.map(ps => (
                        <button key={ps.id} onClick={() => usePreset(ps)} style={{ border: activePreset === ps.id ? '2px solid var(--ms-accent)' : '1px solid var(--ms-line)', borderRadius: 9, padding: 0, overflow: 'hidden', cursor: 'pointer', background: 'var(--ms-surface-2)', textAlign: 'left' }}>
                          <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden' }}>
                            <img src={mediaUrl(current.thumb_url || current.url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: previewFilter(ps.p) }} />
                            {ps.p.vignette ? <div style={{ position: 'absolute', inset: 0, boxShadow: previewVignette(ps.p) }} /> : null}
                          </div>
                          <div style={{ padding: '5px 7px', fontSize: 10, fontWeight: 600, color: 'var(--ms-ink-2)', letterSpacing: '0.03em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ps.name}</div>
                        </button>
                      ))}
                    </div>
                    <button onClick={applyEdits} disabled={rendering || !activePreset} className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
                      {rendering ? 'Rendering…' : 'Apply to this photo'}
                    </button>
                    <button onClick={applyToKeepers} disabled={rendering || !activePreset || keepers.length === 0} className="ms-btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8, padding: '9px' }}>
                      <Users size={13} /> Apply to {keepers.length} keeper{keepers.length === 1 ? '' : 's'}
                    </button>
                  </div>
                )}

                {tool === 'edit' && (
                  <div className="ms-panel" style={{ padding: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span className="ms-section-label">Edit</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--ms-ink-2)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!pending.bw} onChange={e => setPending(p => ({ ...p, bw: e.target.checked ? 1 : 0 }))} style={{ accentColor: 'var(--ms-accent)' }} /> B&amp;W
                      </label>
                    </div>
                    {aiSuggestion && (
                      <button onClick={() => { setPending(p => ({ ...p, ...aiSuggestion })); setActivePreset(null); }} className="ms-btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '8px', marginBottom: 12, gap: 6 }}>
                        <Sparkles size={13} /> AI auto-enhance{aiSuggestion.exposure ? ` · exp ${aiSuggestion.exposure > 0 ? '+' : ''}${aiSuggestion.exposure}` : ''}
                      </button>
                    )}
                    <EditSlider label="Exposure" value={pending.exposure} onChange={v => setPending(p => ({ ...p, exposure: v }))} />
                    <EditSlider label="Contrast" value={pending.contrast} onChange={v => setPending(p => ({ ...p, contrast: v }))} />
                    <EditSlider label="Warmth" value={pending.temperature} onChange={v => setPending(p => ({ ...p, temperature: v }))} />
                    <EditSlider label="Tint" value={pending.tint} onChange={v => setPending(p => ({ ...p, tint: v }))} />
                    <EditSlider label="Saturation" value={pending.saturation} onChange={v => setPending(p => ({ ...p, saturation: v }))} />
                    <EditSlider label="Fade" value={pending.fade} onChange={v => setPending(p => ({ ...p, fade: v }))} min={0} />
                    <EditSlider label="Vignette" value={pending.vignette} onChange={v => setPending(p => ({ ...p, vignette: v }))} min={0} />
                    <EditSlider label="Grain" value={pending.grain} onChange={v => setPending(p => ({ ...p, grain: v }))} min={0} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '12px 0 6px' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--ms-ink-2)', flex: 1 }}>Rotate</span>
                      <button onClick={() => setPending(p => ({ ...p, rotate: ((p.rotate - 90) % 360) }))} className="ms-iconbtn" style={{ width: 30, height: 30 }}><RotateCcw size={14} /></button>
                      <button onClick={() => setPending(p => ({ ...p, rotate: ((p.rotate + 90) % 360) }))} className="ms-iconbtn" style={{ width: 30, height: 30 }}><RotateCw size={14} /></button>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--ms-ink-2)' }}>Straighten</span>
                      <span style={{ fontSize: 11, color: 'var(--ms-ink-3)' }}>{(pending.rotate - Math.round(pending.rotate / 90) * 90).toFixed(1)}°</span>
                    </div>
                    <input type="range" min={-15} max={15} step={0.5} value={pending.rotate - Math.round(pending.rotate / 90) * 90}
                      onChange={e => setPending(p => ({ ...p, rotate: Math.round(p.rotate / 90) * 90 + Number(e.target.value) }))}
                      onDoubleClick={() => setPending(p => ({ ...p, rotate: Math.round(p.rotate / 90) * 90 }))}
                      style={{ width: '100%', accentColor: 'var(--ms-accent)', marginBottom: 12 }} />

                    <button onClick={() => setCropOn(v => !v)} className="ms-btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '8px', marginBottom: 10, background: cropOn ? 'var(--ms-surface-2)' : undefined }}>
                      <Crop size={14} /> {cropOn ? 'Cropping — drag handles' : 'Crop'}
                    </button>

                    <button onClick={applyEdits} disabled={rendering} className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>
                      {rendering ? 'Rendering…' : 'Apply'}
                    </button>
                    <button onClick={applyToKeepers} disabled={rendering || keepers.length === 0} className="ms-btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '8px', marginBottom: 8 }}>
                      <Users size={13} /> Apply to {keepers.length} keeper{keepers.length === 1 ? '' : 's'}
                    </button>
                    <button onClick={resetEdits} disabled={rendering || !hasEdits(current)} className="ms-btn-text" style={{ width: '100%', justifyContent: 'center' }}><Undo2 size={13} /> Reset to original</button>
                  </div>
                )}

                {tool === 'info' && (
                  <>
                    <div className="ms-panel">
                      <div className="ms-note" style={{ marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10, fontWeight: 600 }}>
                        <Sparkles size={12} /> AI suggests
                      </div>
                      {sharp == null ? (
                        <p style={{ fontSize: 12.5, color: 'var(--ms-ink-3)', margin: 0 }}>No analysis yet (RAW, or still processing).</p>
                      ) : (
                        <>
                          <Row label="Focus" value={sharp ? 'Sharp' : 'Soft'} color={sharp ? '#2f9e6e' : '#d39a3e'} />
                          <Row label="Exposure" value={expoLabel} color={expoColor} />
                          {q != null && <Row label="Quality" value={qualLabel} color={qualColor} />}
                          {current.dup_group && <Row label="Duplicate" value={`${dupMembers ? dupMembers.length : 2} similar`} color="var(--ms-ink-2)" icon={<Dup size={11} />} />}
                        </>
                      )}
                      {aiSuggestion && (
                        <button onClick={() => { setTool('edit'); setPending(p => ({ ...p, ...aiSuggestion })); }} className="ms-btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '7px', marginTop: 12, gap: 6 }}>
                          <Wand2 size={13} /> Auto-enhance suggestion
                        </button>
                      )}
                      {dupMembers && (
                        <button onClick={() => setCompare(true)} className="ms-btn-ghost" style={{ width: '100%', justifyContent: 'center', padding: '7px', marginTop: 8 }}><Columns2 size={13} /> Compare duplicates</button>
                      )}
                      <p style={{ fontSize: 10.5, color: 'var(--ms-ink-3)', margin: '12px 0 0', lineHeight: 1.5, borderTop: '1px solid var(--ms-line)', paddingTop: 10 }}>
                        Advisory only — AI never keeps, rejects, or edits without you.
                      </p>
                    </div>
                    <div className="ms-panel">
                      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ms-ink-3)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>Your rating</div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} onClick={() => rate(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            <Star size={22} fill={(current.cull_rating || 0) >= n ? '#d39a3e' : 'none'} color={(current.cull_rating || 0) >= n ? '#d39a3e' : 'var(--ms-ink-3)'} />
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </aside>
            </div>

            {/* decision bar */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '14px 0 12px', flexWrap: 'wrap' }}>
              <DecBtn onClick={() => decide('reject')} active={current.cull_decision === 'reject'} color="#d4564a" Icon={X} label="Reject" hint="X" />
              <DecBtn onClick={() => decide('maybe')} active={current.cull_decision === 'maybe'} color="#d39a3e" Icon={HelpCircle} label="Maybe" hint="M" />
              <DecBtn onClick={() => decide('keep')} active={current.cull_decision === 'keep'} color="#2f9e6e" Icon={Check} label="Keep" hint="P" />
            </div>

            {/* filmstrip */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 2px' }}>
              {view.map((a, i) => {
                const dec = a.cull_decision;
                const meta = dec && DEC_META[dec];
                return (
                  <button key={a.id} onClick={() => setCursor(i)} style={{
                    position: 'relative', flexShrink: 0, width: 70, height: 70, borderRadius: 5, overflow: 'hidden', cursor: 'pointer', padding: 0,
                    outline: i === idx ? '2px solid var(--ms-accent)' : '1px solid var(--ms-line)', outlineOffset: -1, border: 'none', background: 'var(--ms-surface-2)',
                  }}>
                    {a.thumb_url
                      ? <img src={mediaUrl(a.thumb_url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: dec === 'reject' ? 0.4 : 1 }} />
                      : null}
                    {meta && (
                      <span style={{ position: 'absolute', top: 3, right: 3, width: 15, height: 15, borderRadius: '50%', background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <meta.Icon size={9} color="white" />
                      </span>
                    )}
                    {hasEdits(a) && <span style={{ position: 'absolute', bottom: 3, left: 3, fontSize: 9, color: '#e8cb8d', background: 'rgba(0,0,0,0.55)', borderRadius: 4, padding: '0 4px' }}>✎</span>}
                  </button>
                );
              })}
            </div>

            <p style={{ marginTop: 12, fontSize: 11, color: 'var(--ms-ink-3)', textAlign: 'center' }}>
              <Kbd>←→</Kbd> nav · <Kbd>P</Kbd> keep · <Kbd>X</Kbd> reject · <Kbd>M</Kbd> maybe · <Kbd>U</Kbd> undo · <Kbd>1–5</Kbd> rate · <Kbd>scroll</Kbd>/<Kbd>Z</Kbd> zoom · <Kbd>C</Kbd> compare · <Kbd>E</Kbd> edit · <Kbd>F</Kbd> presets · <Kbd>⇧C/⇧V</Kbd> copy/paste edits
            </p>
          </>
        )}
      </div>

      {/* compare overlay */}
      {compare && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 350, background: 'rgba(6,6,8,0.95)', display: 'flex', flexDirection: 'column', padding: 'clamp(12px, 3vw, 32px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600, flex: 1 }}>{dupMembers ? `Duplicate set — ${compareSet.length} similar frames` : 'Compare'}</span>
            {dupMembers && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginRight: 14 }}>Pick the best — “Keep this” rejects the others</span>}
            <button onClick={() => setCompare(false)} style={{ ...navArrow('right', false), position: 'static', transform: 'none', width: 38, height: 38 }}><X size={18} /></button>
          </div>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${Math.min(compareSet.length, 4)}, 1fr)`, gap: 12, minHeight: 0 }}>
            {compareSet.map(a => {
              const aSharp = a.sharpness != null ? a.sharpness >= 120 : null;
              const dec = a.cull_decision;
              return (
                <div key={a.id} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: '#0f0f13', borderRadius: 10, overflow: 'hidden', border: dec === 'keep' ? '2px solid #2f9e6e' : dec === 'reject' ? '2px solid rgba(212,86,74,0.5)' : '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                    <img src={mediaUrl(a.variants?.web || a.url)} alt={a.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', opacity: dec === 'reject' ? 0.45 : 1 }} />
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {aSharp != null && <span style={{ color: aSharp ? '#5fd0a0' : '#e6b455', fontWeight: 600 }}>{aSharp ? 'Sharp' : 'Soft'}</span>}
                      {a.quality != null && <span style={{ marginLeft: 8 }}>Q {Math.round(a.quality * 100)}</span>}
                    </span>
                    {dupMembers ? (
                      <button onClick={async () => { for (const o of compareSet) await decide(o.id === a.id ? 'keep' : 'reject', o.id); setCompare(false); }}
                        style={{ ...cmpBtn, background: '#2f9e6e' }}><Check size={13} /> Keep this</button>
                    ) : null}
                    <button onClick={() => decide('keep', a.id)} style={{ ...cmpBtn, background: dec === 'keep' ? '#2f9e6e' : 'rgba(255,255,255,0.1)' }}><Check size={13} /></button>
                    <button onClick={() => decide('reject', a.id)} style={{ ...cmpBtn, background: dec === 'reject' ? '#d4564a' : 'rgba(255,255,255,0.1)' }}><X size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showGallery && (
        <GalleryFromKeepersModal projectId={id} keepers={counts.keep}
          onClose={() => setShowGallery(false)} onDone={() => router.push(`/studio/${id}`)} />
      )}
    </NavBar>
  );
}

function GalleryFromKeepersModal({ projectId, keepers, onClose, onDone }) {
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      await mediaAPI.createGalleryFromCull(projectId, {
        title: title.trim() || undefined, visibility,
        password: visibility === 'password' ? password : undefined, decision: 'keep',
      });
      onDone();
    } catch (e) { setErr(e.response?.data?.error || 'Could not create gallery'); setSaving(false); }
  };

  return (
    <div onClick={onClose} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--ms-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Images size={18} color="var(--ms-on-accent)" /></div>
          <div>
            <h2 style={{ fontSize: 19 }}>Gallery from keepers</h2>
            <p className="ms-modal-sub">{keepers} photo{keepers === 1 ? '' : 's'} marked Keep</p>
          </div>
        </div>
        <label className="ms-label">Gallery name</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Keepers" className="ms-input" style={{ marginBottom: 18 }} autoFocus />
        <label className="ms-label">Visibility</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {['private', 'password', 'public'].map(v => (
            <button key={v} onClick={() => setVisibility(v)} className={`ms-chip${visibility === v ? ' ms-chip-active' : ''}`} style={{ flex: 1 }}>{v}</button>
          ))}
        </div>
        {visibility === 'password' && <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Gallery password" className="ms-input" style={{ marginBottom: 18 }} />}
        {err && <p style={{ color: '#d4564a', fontSize: 12.5, margin: '0 0 12px' }}>{err}</p>}
        <button onClick={submit} disabled={saving} className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? 'Creating…' : `Create gallery with ${keepers} photo${keepers === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, color, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 12.5, color: 'var(--ms-ink-3)' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color }}>{icon}{value}</span>
    </div>
  );
}

function DecBtn({ onClick, active, color, Icon, label, hint }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '11px 24px', borderRadius: 999, cursor: 'pointer',
      border: `1px solid ${active ? color : 'var(--ms-line)'}`, background: active ? color : 'transparent', color: active ? 'white' : 'var(--ms-ink)',
      fontFamily: 'var(--ms-font-ui)', fontWeight: 600, fontSize: 13.5, transition: 'all 0.15s ease',
    }}>
      <Icon size={16} color={active ? 'white' : color} /> {label}
      <span style={{ fontSize: 10, opacity: 0.6, border: `1px solid ${active ? 'rgba(255,255,255,0.5)' : 'var(--ms-line)'}`, borderRadius: 4, padding: '1px 5px' }}>{hint}</span>
    </button>
  );
}

function Kbd({ children }) {
  return <span style={{ display: 'inline-block', padding: '1px 6px', margin: '0 2px', borderRadius: 4, border: '1px solid var(--ms-line)', background: 'var(--ms-surface-2)', fontSize: 10.5, fontWeight: 600, color: 'var(--ms-ink-2)' }}>{children}</span>;
}

const navArrow = (side, disabled) => ({
  position: 'absolute', [side]: 12, top: '50%', transform: 'translateY(-50%)',
  width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: disabled ? 'default' : 'pointer',
  background: 'rgba(0,0,0,0.45)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  opacity: disabled ? 0.2 : 1, backdropFilter: 'blur(4px)',
});
const cmpBtn = { display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 999, border: 'none', cursor: 'pointer', color: '#fff', fontSize: 11.5, fontWeight: 600 };
