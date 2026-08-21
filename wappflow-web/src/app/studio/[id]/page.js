'use client';
/* eslint-disable @next/next/no-img-element -- gallery thumbs are dynamic /uploads URLs; next/image isn't configured for them */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Upload, Image as ImageIcon, Check, X, Plus, Share2, Copy, Trash2,
  Lock, Globe, Eye, Sparkles, Loader, ExternalLink, ListChecks, Download, Package, BookOpen, Film,
  Heart, MessageSquare, ChevronLeft, ChevronRight, Grid2x2, Grid3x3, LayoutGrid, LayoutDashboard, Play, Pause, Droplets, Wand2, SlidersHorizontal,
} from 'lucide-react';

// photo | video — RAW and stills both live under "photo"
const kindOf = (a) => (a?.type === 'video' ? 'video' : 'photo');
const fmtDur = (ms) => { if (!ms) return null; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
import { mediaAPI, mediaUrl, studioAiAPI, videoAiAPI } from '../../../lib/api';
import RoomPanel from '@/components/RoomPanel';

function FocusChip({ sharpness }) {
  if (sharpness == null) return null;
  const sharp = sharpness >= 120;
  return (
    <span className="ms-chip-float" style={{ background: 'rgba(10,8,6,0.55)' }} title="AI focus estimate — advisory only, never auto-applied">
      <span style={{ width: 5, height: 5, borderRadius: 9, background: sharp ? '#5fd0a0' : '#e6b455' }} /> {sharp ? 'Sharp' : 'Soft'}
    </span>
  );
}

const VIEW_SIZES = { s: 116, m: 168, l: 248 };

// Fullscreen viewer for any photograph in the library.
function Lightbox({ assets, index, onClose, onNav, onAdvance, onDelete, selected, onToggleSelect }) {
  const a = assets[index];
  const isVideo = a ? kindOf(a) === 'video' : false;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNav(1);
      else if (e.key === 'ArrowLeft') onNav(-1);
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNav]);
  // slideshow auto-advance — photos only (videos play through on their own)
  useEffect(() => {
    if (!playing || isVideo) return;
    const t = setInterval(() => onAdvance(), 3500);
    return () => clearInterval(t);
  }, [playing, isVideo, onAdvance, index]);
  if (!a) return null;
  const isSel = selected.has(a.id);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(8,7,5,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {isVideo
        ? <video onClick={e => e.stopPropagation()} src={mediaUrl(a.proxy_url || a.url)} poster={a.poster_url ? mediaUrl(a.poster_url) : undefined} controls autoPlay style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', background: '#000' }} />
        : <img onClick={e => e.stopPropagation()} src={mediaUrl(a.variants?.web || a.url)} alt={a.filename} style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain' }} />}

      <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={lbBtn} title="Close (Esc)" aria-label="Close"><X size={20} /></button>
      <button onClick={(e) => { e.stopPropagation(); onNav(-1); }} disabled={index === 0} style={{ ...lbArrow, left: 16, opacity: index === 0 ? 0.25 : 1 }}><ChevronLeft size={26} /></button>
      <button onClick={(e) => { e.stopPropagation(); onNav(1); }} disabled={index === assets.length - 1} style={{ ...lbArrow, right: 16, opacity: index === assets.length - 1 ? 0.25 : 1 }}><ChevronRight size={26} /></button>

      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 999, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)' }}>
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, padding: '0 6px' }}>{index + 1} / {assets.length}</span>
        <button onClick={() => setPlaying(p => !p)} style={{ ...lbPill, background: playing ? '#fff' : 'rgba(255,255,255,0.12)', color: playing ? '#14120f' : '#fff' }} title="Slideshow (Space)">{playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Slideshow</>}</button>
        <button onClick={() => onToggleSelect(a.id)} style={{ ...lbPill, background: isSel ? '#fff' : 'rgba(255,255,255,0.12)', color: isSel ? '#14120f' : '#fff' }}><Check size={14} /> {isSel ? 'Selected' : 'Select'}</button>
        <button onClick={() => onDelete(a)} style={{ ...lbPill, background: 'rgba(212,86,74,0.18)', color: '#ff9b90' }}><Trash2 size={14} /> Delete</button>
      </div>
    </div>
  );
}

function CreateGalleryModal({ onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [password, setPassword] = useState('');
  const [policy, setPolicy] = useState('web');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try { await onCreate({ title: title.trim(), visibility, password: visibility === 'password' ? password : undefined, settings: { download_policy: policy } }); }
    finally { setSaving(false); }
  };
  return (
    <div onClick={onClose} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
          <h2>New gallery</h2>
          <button onClick={onClose} className="ms-iconbtn" style={{ border: 'none' }}><X size={18} /></button>
        </div>
        <label className="ms-label">Gallery name</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Highlights" className="ms-input" style={{ marginBottom: 22 }} autoFocus />
        <label className="ms-label">Visibility</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {[['private', Lock, 'Private'], ['password', Lock, 'Password'], ['public', Globe, 'Public']].map(([v, Icon, lbl]) => (
            <button key={v} onClick={() => setVisibility(v)} className={`ms-chip${visibility === v ? ' ms-chip-active' : ''}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textTransform: 'none' }}><Icon size={13} /> {lbl}</button>
          ))}
        </div>
        {visibility === 'password' && (
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Gallery password" className="ms-input" style={{ marginBottom: 22 }} />
        )}
        <label className="ms-label">Downloads</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {[['none', 'No download'], ['web', 'Web size'], ['high-res', 'High-res']].map(([v, lbl]) => (
            <button key={v} onClick={() => setPolicy(v)} className={`ms-chip${policy === v ? ' ms-chip-active' : ''}`} style={{ flex: 1, textTransform: 'none' }}>{lbl}</button>
          ))}
        </div>
        <button onClick={submit} disabled={saving} className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center' }}>{saving ? 'Creating…' : 'Create gallery'}</button>
      </div>
    </div>
  );
}

function ProofingRequestModal({ gallery, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [quota, setQuota] = useState('');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try { await onCreate(gallery.id, { title: title.trim() || undefined, quota: quota ? Number(quota) : undefined, instructions: instructions.trim() || undefined }); }
    finally { setSaving(false); }
  };
  return (
    <div onClick={onClose} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2>Request selections</h2>
          <button onClick={onClose} className="ms-iconbtn" style={{ border: 'none' }}><X size={18} /></button>
        </div>
        <p className="ms-modal-sub" style={{ marginBottom: 22 }}>Your client picks their favourites right inside the gallery, then submits.</p>
        <label className="ms-label">Prompt</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Select your favourites" className="ms-input" style={{ marginBottom: 22 }} autoFocus />
        <label className="ms-label">How many? (optional)</label>
        <input type="number" min="1" value={quota} onChange={e => setQuota(e.target.value)} placeholder="40" className="ms-input" style={{ marginBottom: 22 }} />
        <label className="ms-label">Instructions (optional)</label>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2} placeholder="Anything they should know…" className="ms-input" style={{ resize: 'vertical', marginBottom: 28 }} />
        <button onClick={submit} disabled={saving} className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center' }}>{saving ? 'Sending…' : 'Send selection request'}</button>
      </div>
    </div>
  );
}

export default function ProjectPage() {
  const router = useRouter();
  const { id } = useParams();
  const fileRef = useRef(null);
  const [project, setProject] = useState(null);
  const [assets, setAssets] = useState([]);
  const [galleries, setGalleries] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewGallery, setShowNewGallery] = useState(false);
  const [banner, setBanner] = useState(null);
  const [exports, setExports] = useState({});
  const [proofingFor, setProofingFor] = useState(null);
  const [viewSize, setViewSize] = useState('c'); // collage (natural sizes) is the default — gallery feel
  const [mediaTab, setMediaTab] = useState('all'); // all | photo | video — works like a filter, reads like sections
  const [aiHints, setAiHints] = useState(true);    // Settings → Defaults: show advisory AI badges
  const [lightbox, setLightbox] = useState(null); // index into the SHOWN list
  const [wmModal, setWmModal] = useState(false);
  const [aiPanel, setAiPanel] = useState(false);
  const [showRoom, setShowRoom] = useState(false);

  // apply per-device studio preferences (set in Studio → Settings)
  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem('ms-prefs') || '{}'); if (p.libraryView) setViewSize(p.libraryView); if (p.aiHints === false) setAiHints(false); } catch {}
  }, []);

  const photoCount = assets.filter(a => kindOf(a) === 'photo').length;
  const videoCount = assets.length - photoCount;
  const shown = mediaTab === 'all' ? assets : assets.filter(a => kindOf(a) === mediaTab);
  const [visibleCount, setVisibleCount] = useState(400); // incremental render for huge shoots
  useEffect(() => { setVisibleCount(400); }, [mediaTab]);

  const refreshAssets = useCallback(async () => {
    try { const r = await mediaAPI.listAssets(id, { limit: 5000 }); setAssets(r.data.assets || []); return r.data.assets || []; } catch { return []; }
  }, [id]);
  const refreshGalleries = useCallback(async () => {
    try { const r = await mediaAPI.listGalleries(id); setGalleries(r.data.galleries || []); } catch {}
  }, [id]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
    let poll;
    (async () => {
      setLoading(true);
      try { const p = await mediaAPI.getProject(id); setProject(p.data); } catch { router.push('/studio'); return; }
      await Promise.all([refreshAssets(), refreshGalleries()]);
      setLoading(false);
      // Live-ish: pick up client favourites / comments / submissions without a manual refresh.
      poll = setInterval(() => { refreshAssets(); refreshGalleries(); }, 20000);
    })();
    return () => { if (poll) clearInterval(poll); };
  }, [id]);

  const onUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    try {
      await mediaAPI.uploadAssets(id, fd);
      await refreshAssets();
      let tries = 0;
      const poll = setInterval(async () => {
        const a = await refreshAssets();
        tries++;
        const pending = a.some(x => !x.variants?.thumb);
        if (!pending || tries >= 6) clearInterval(poll);
      }, 2500);
    } catch (err) {
      setBanner({ type: 'error', msg: err.response?.data?.error || 'Upload failed' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggle = (assetId) => setSelected(prev => {
    const next = new Set(prev);
    next.has(assetId) ? next.delete(assetId) : next.add(assetId);
    return next;
  });

  const applyWatermark = async (config) => {
    const ids = Array.from(selected); if (ids.length === 0) return;
    setWmModal(false);
    try {
      await mediaAPI.applyWatermark(id, ids, config);
      setBanner({ type: 'ok', msg: `Watermarking ${ids.length} photo${ids.length === 1 ? '' : 's'} — they’ll update shortly.` });
      setSelected(new Set());
      setTimeout(refreshAssets, 4000); setTimeout(refreshAssets, 12000);
    } catch (e) { setBanner({ type: 'error', msg: e.response?.data?.error || 'Could not watermark' }); }
  };
  const autoOrganize = async () => {
    try {
      const r = await mediaAPI.autoFolders(id);
      setBanner({ type: r.data.folders ? 'ok' : 'info', msg: r.data.folders ? `Organized into ${r.data.folders} folders by capture time.` : (r.data.message || 'Nothing to organize.') });
      if (r.data.folders) refreshAssets();
    } catch (e) { setBanner({ type: 'error', msg: e.response?.data?.error || 'Could not organize' }); }
  };
  const removeWatermark = async () => {
    const ids = Array.from(selected); if (ids.length === 0) return;
    setWmModal(false);
    try { await mediaAPI.removeWatermark(id, ids); setBanner({ type: 'ok', msg: 'Watermark removed.' }); setSelected(new Set()); setTimeout(refreshAssets, 1500); }
    catch (e) { setBanner({ type: 'error', msg: e.response?.data?.error || 'Could not remove' }); }
  };
  // AI auto-edit selected photos to the learned house style (non-destructive).
  const autoEditSelected = async () => {
    const ids = Array.from(selected).filter(x => kindOf(assets.find(a => a.id === x)) === 'photo');
    if (!ids.length) { setBanner({ type: 'error', msg: 'Select some photos first.' }); return; }
    try {
      const r = await mediaAPI.autoEdit(id, { asset_ids: ids });
      setBanner({ type: 'ok', msg: `Auto-editing ${r.data.queued} photo${r.data.queued === 1 ? '' : 's'} to your house style — they’ll update shortly.` });
      setSelected(new Set());
      setTimeout(refreshAssets, 1800);
    } catch (e) { setBanner({ type: 'error', msg: e?.response?.data?.error || 'Auto-edit failed — keep/cull some work so a house style can be learned first.' }); }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Move ${selected.size} item${selected.size === 1 ? '' : 's'} to Trash? You can restore within 30 days.`)) return;
    for (const aid of Array.from(selected)) { try { await mediaAPI.deleteAsset(aid); } catch {} }
    setSelected(new Set());
    await refreshAssets();
    setBanner({ type: 'ok', msg: 'Deleted' });
  };

  const deleteOne = async (asset) => {
    if (!window.confirm(`Move this ${kindOf(asset) === 'video' ? 'video' : 'photograph'} to Trash? You can restore within 30 days.`)) return;
    try { await mediaAPI.deleteAsset(asset.id); } catch {}
    setSelected(prev => { const n = new Set(prev); n.delete(asset.id); return n; });
    const remaining = await refreshAssets();
    const remainingShown = mediaTab === 'all' ? remaining : remaining.filter(x => kindOf(x) === mediaTab);
    setLightbox(li => (li == null ? li : (remainingShown.length === 0 ? null : Math.min(li, remainingShown.length - 1))));
  };

  const createGallery = async (data) => {
    const res = await mediaAPI.createGallery(id, data);
    setShowNewGallery(false);
    await refreshGalleries();
    if (selected.size > 0) { await mediaAPI.addGalleryAssets(res.data.id, Array.from(selected)); setSelected(new Set()); await refreshGalleries(); }
  };

  const addSelected = async (galleryId) => {
    if (selected.size === 0) return;
    await mediaAPI.addGalleryAssets(galleryId, Array.from(selected));
    setSelected(new Set());
    await refreshGalleries();
    setBanner({ type: 'ok', msg: 'Photos added to gallery' });
  };

  const publish = async (gallery) => {
    try {
      const res = await mediaAPI.publishGallery(gallery.id, { notify: true });
      await refreshGalleries();
      const d = res.data.delivery || {};
      const msg = d.whatsapp === 'sent' ? 'Published & sent to client on WhatsApp ✓'
        : d.whatsapp === 'failed' ? 'Published. WhatsApp not connected — copy the link to share.'
        : 'Published. No client phone on file — copy the link to share.';
      setBanner({ type: 'ok', msg, link: res.data.share_url });
    } catch (err) {
      setBanner({ type: 'error', msg: err.response?.data?.error || 'Publish failed' });
    }
  };

  const copy = (text) => {
    if (!text) { setBanner({ type: 'error', msg: 'No share link yet — publish the gallery first.' }); return; }
    try { navigator.clipboard.writeText(text); setBanner({ type: 'ok', msg: 'Link copied', link: text }); } catch { setBanner({ type: 'error', msg: 'Could not copy', link: text }); }
  };

  const runExport = async (galleryId, variant) => {
    setExports(e => ({ ...e, [galleryId]: { status: 'pending' } }));
    try {
      const exp = (await mediaAPI.exportGallery(galleryId, variant)).data;
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        try {
          const s = (await mediaAPI.getExport(exp.id)).data;
          if (s.status === 'ready') { clearInterval(poll); setExports(e => ({ ...e, [galleryId]: { status: 'ready', url: s.download_url } })); }
          else if (s.status === 'failed' || tries > 40) { clearInterval(poll); setExports(e => ({ ...e, [galleryId]: { status: 'failed', error: s.error } })); setBanner({ type: 'error', msg: s.error ? `Export failed: ${s.error}` : 'Export failed' }); }
        } catch { clearInterval(poll); setExports(e => ({ ...e, [galleryId]: { status: 'failed' } })); }
      }, 2000);
    } catch (err) { setExports(e => ({ ...e, [galleryId]: { status: 'failed' } })); setBanner({ type: 'error', msg: err.response?.data?.error || 'Export failed to start' }); }
  };

  const createProof = async (galleryId, data) => {
    await mediaAPI.createProofing(galleryId, data);
    setProofingFor(null); await refreshGalleries();
    setBanner({ type: 'ok', msg: 'Selection request is now live in the client gallery' });
  };
  const approveProof = async (setId) => { await mediaAPI.proofingApprove(setId); await refreshGalleries(); setBanner({ type: 'ok', msg: 'Selection approved — client notified' }); };
  const requestChangesProof = async (setId) => { await mediaAPI.proofingRequestChanges(setId, ''); await refreshGalleries(); setBanner({ type: 'ok', msg: 'Change request sent to the client' }); };

  if (loading) return <><div className="ms-page"><p className="ms-loading">Loading…</p></div></>;

  return (
    <>
      <div className="ms-page">
        <button onClick={() => router.push('/studio')} className="ms-back"><ArrowLeft size={15} /> All shoots</button>

        <div className="ms-projecthero">
          {assets[0]?.thumb_url
            ? <img className="ms-hero-img" src={mediaUrl(assets[0].variants?.web || assets[0].thumb_url)} alt="" />
            : <div className="ms-hero-fallback" />}
          <div className="ms-hero-veil" />
          <div className="ms-hero-body">
            <div style={{ minWidth: 0 }}>
              <p className="ms-hero-kicker">{(project.project_type || 'general').replace('_', ' ')}{project.client_name ? ` · ${project.client_name}` : ''}</p>
              <h1 className="ms-hero-title" style={{ fontSize: 'clamp(26px, 3.6vw, 44px)' }}>{project.title}</h1>
              <p className="ms-hero-sub">{photoCount} photo{photoCount === 1 ? '' : 's'}{videoCount > 0 ? ` · ${videoCount} video${videoCount === 1 ? '' : 's'}` : ''} · {galleries.length} galler{galleries.length === 1 ? 'y' : 'ies'}</p>
            </div>
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              <input ref={fileRef} type="file" multiple accept="image/*,video/*" onChange={onUpload} style={{ display: 'none' }} />
              {assets.length > 0 && <button onClick={() => router.push(`/studio/${id}/cull`)} className="ms-btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.32)', color: '#fff' }}><ListChecks size={15} /> Cull</button>}
              {assets.length > 0 && <button onClick={() => router.push(`/studio/${id}/albums`)} className="ms-btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.32)', color: '#fff' }}><BookOpen size={15} /> Albums</button>}
              {assets.length > 0 && <button onClick={() => router.push(`/studio/${id}/video`)} className="ms-btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.32)', color: '#fff' }}><Film size={15} /> Reels</button>}
              <button onClick={() => setShowRoom(true)} className="ms-btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.32)', color: '#fff' }}><MessageSquare size={15} /> Team Room</button>
              <button onClick={() => fileRef.current?.click()} disabled={uploading} className="ms-btn-ink" style={{ background: '#fff', color: '#0c0c10' }}>
                {uploading ? <Loader size={16} className="ms-spin" /> : <Upload size={16} />} {uploading ? 'Uploading…' : 'Upload media'}
              </button>
            </div>
          </div>
        </div>

        {banner && (
          <div className="ms-banner">
            <span style={{ fontSize: 13.5, color: banner.type === 'error' ? '#b3261e' : 'var(--ms-ink)', flex: 1 }}>{banner.msg}</span>
            {banner.link && (
              <>
                <code style={{ fontSize: 12, color: 'var(--ms-ink-3)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{banner.link}</code>
                <button onClick={() => copy(banner.link)} className="ms-btn-text"><Copy size={13} /> Copy</button>
                <a href={banner.link} target="_blank" rel="noreferrer" className="ms-btn-text" style={{ textDecoration: 'none' }}><ExternalLink size={13} /> Open</a>
              </>
            )}
            <button onClick={() => setBanner(null)} className="ms-iconbtn" style={{ border: 'none', width: 28, height: 28 }}><X size={15} /></button>
          </div>
        )}

        <div className="ms-workgrid">
        <aside className="ms-workaside">
        {/* Galleries */}
        <div className="ms-section-head">
          <h2 className="ms-h2">Galleries</h2>
          <button onClick={() => setShowNewGallery(true)} className="ms-btn-text"><Plus size={14} /> New gallery</button>
        </div>
        {galleries.length === 0 ? (
          <div className="ms-empty-soft" style={{ marginBottom: 44 }}>No galleries yet. Select photographs below, then create a gallery to deliver them.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16, marginBottom: 48 }}>
            {galleries.map(g => (
              <div key={g.id} className="ms-panel">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                  <span style={{ fontFamily: 'var(--ms-serif)', fontSize: 18, fontWeight: 500, color: 'var(--ms-ink)', flex: 1, lineHeight: 1.2 }}>{g.title}</span>
                  <span className={`ms-status${g.status === 'published' ? ' ms-status-live' : ''}`}>{g.status}</span>
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--ms-ink-3)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 10, textTransform: 'capitalize', flexWrap: 'wrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{g.has_password ? <Lock size={11} /> : g.visibility === 'public' ? <Globe size={11} /> : <Eye size={11} />}{g.visibility} · {g.asset_count || 0}</span>
                  {(g.favorite_count > 0 || g.comment_count > 0) && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9, textTransform: 'none' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Client favourites"><Heart size={11} fill="#c2766a" color="#c2766a" /> {g.favorite_count || 0}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Client comments"><MessageSquare size={11} /> {g.comment_count || 0}</span>
                    </span>
                  )}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selected.size > 0 && <button onClick={() => addSelected(g.id)} className="ms-btn-ghost" style={{ padding: '7px 13px' }}><Plus size={13} /> Add {selected.size}</button>}
                  {g.status === 'published'
                    ? <>
                        <button onClick={() => g.share_url ? window.open(g.share_url, '_blank', 'noopener,noreferrer') : setBanner({ type: 'error', msg: 'Share link not ready — the API needs a restart (pm2 restart wappflow-api), then refresh.' })} className="ms-btn-ghost" style={{ padding: '7px 13px' }}><Eye size={13} /> Open</button>
                        <button onClick={() => copy(g.share_url)} className="ms-btn-ghost" style={{ padding: '7px 13px' }}><Copy size={13} /> Copy link</button>
                      </>
                    : <button onClick={() => publish(g)} disabled={(g.asset_count || 0) === 0} className="ms-btn-ink" style={{ padding: '8px 15px', fontSize: 12.5 }}><Share2 size={13} /> Publish &amp; send</button>}
                  {(() => {
                    const ex = exports[g.id];
                    if (ex?.status === 'ready') return <a href={mediaUrl(ex.url)} download className="ms-btn-ghost" style={{ padding: '7px 13px', textDecoration: 'none' }}><Download size={13} /> Download ZIP</a>;
                    if (ex?.status === 'pending') return <span className="ms-btn-ghost" style={{ padding: '7px 13px', opacity: 0.6 }}>Zipping…</span>;
                    if (ex?.status === 'failed') return <button onClick={() => runExport(g.id, 'original')} className="ms-btn-ghost" style={{ padding: '7px 13px', color: '#b3261e' }}>Retry ZIP</button>;
                    return (g.asset_count || 0) > 0 ? <button onClick={() => runExport(g.id, 'original')} className="ms-btn-ghost" style={{ padding: '7px 13px' }}><Package size={13} /> Export ZIP</button> : null;
                  })()}
                </div>
                <div style={{ marginTop: 13, paddingTop: 13, borderTop: '1px solid var(--ms-line)' }}>
                  {!g.proofing_id ? (
                    <button onClick={() => setProofingFor(g)} disabled={(g.asset_count || 0) === 0} className="ms-btn-text" style={{ opacity: (g.asset_count || 0) === 0 ? 0.5 : 1 }}><ListChecks size={13} /> Request selections</button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--ms-ink-3)' }}>
                        Selections <strong style={{ color: 'var(--ms-ink)', fontWeight: 600 }}>{g.proofing_selected || 0}{g.proofing_quota ? `/${g.proofing_quota}` : ''}</strong>
                        <span className="ms-status" style={{ marginLeft: 8 }}>{g.proofing_status}</span>
                      </span>
                      {g.proofing_status === 'submitted' && (
                        <>
                          <button onClick={() => approveProof(g.proofing_id)} className="ms-btn-text" style={{ color: '#2f7d5b' }}>Approve</button>
                          <button onClick={() => requestChangesProof(g.proofing_id)} className="ms-btn-text">Request changes</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        </aside>
        <div className="ms-workmain">
        {/* Library */}
        <div className="ms-section-head">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'clamp(14px, 2vw, 26px)', flexWrap: 'wrap', minWidth: 0 }}>
            <h2 className="ms-h2">Library</h2>
            {/* media switch — reads as sections, works as a filter */}
            <div className="ms-mediatabs">
              {[['all', 'All', assets.length], ['photo', 'Photos', photoCount], ['video', 'Videos', videoCount]].map(([k, label, n]) => (
                <button key={k} onClick={() => { setMediaTab(k); setLightbox(null); }} className={`ms-mediatab${mediaTab === k ? ' is-active' : ''}`}>
                  {label}{n > 0 && <span className="ms-mediatab-n">{n}</span>}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {selected.size > 0 && (
              <>
                <span style={{ fontSize: 12.5, color: 'var(--ms-ink-3)' }}>{selected.size} selected</span>
                <button onClick={autoEditSelected} className="ms-btn-text" title="AI: grade these photos to your learned house style (non-destructive)"><SlidersHorizontal size={13} /> Auto-edit</button>
                <button onClick={() => setWmModal(true)} className="ms-btn-text"><Droplets size={13} /> Watermark</button>
                <button onClick={deleteSelected} className="ms-btn-text" style={{ color: '#b3261e' }}><Trash2 size={13} /> Delete</button>
                <button onClick={() => setSelected(new Set())} className="ms-btn-text">Clear</button>
                <span style={{ width: 1, height: 16, background: 'var(--ms-line)' }} />
              </>
            )}
            <button onClick={() => setAiPanel(true)} className="ms-btn-ghost" style={{ padding: '7px 12px' }} title="AI selections, albums, reels"><Wand2 size={14} /> Studio AI</button>
            <button onClick={autoOrganize} className="ms-btn-ghost" style={{ padding: '7px 12px' }} title="Group photos into folders by capture time"><Sparkles size={14} /> Auto-organize</button>
            <div className="ms-seg" style={{ padding: 3 }}>
              {[['s', Grid3x3, 'Small grid'], ['m', Grid2x2, 'Medium grid'], ['l', LayoutGrid, 'Large grid'], ['c', LayoutDashboard, 'Collage (natural sizes)']].map(([sz, Icon, label]) => (
                <button key={sz} onClick={() => setViewSize(sz)} className={viewSize === sz ? 'is-active' : ''} style={{ padding: '6px 9px' }} title={label}><Icon size={15} /></button>
              ))}
            </div>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="ms-empty-soft">
            {assets.length === 0 ? 'No media yet — upload photos or videos to begin.'
              : mediaTab === 'video' ? 'No videos yet. Upload video and it lands here — same uploader.'
              : 'No photos yet — upload to begin.'}
          </div>
        ) : (
          <div className={viewSize === 'c' ? undefined : 'ms-photo-grid'}
            style={viewSize === 'c'
              ? { columnWidth: 250, columnGap: 'var(--ms-grid-gap)' }
              : { gridTemplateColumns: `repeat(auto-fill, minmax(${VIEW_SIZES[viewSize]}px, 1fr))` }}>
            {shown.slice(0, visibleCount).map((a, i) => {
              const isSel = selected.has(a.id);
              const collage = viewSize === 'c';
              const isVideo = kindOf(a) === 'video';
              const poster = isVideo ? (a.poster_url || a.thumb_url) : a.thumb_url;
              const dur = isVideo ? fmtDur(a.v_duration_ms) : null;
              return (
                <div key={a.id} onClick={() => setLightbox(i)} className={`ms-photo${isSel ? ' is-selected' : ''}`} title={isVideo ? 'Click to play' : 'Click to view full screen'}
                  style={collage ? { aspectRatio: isVideo && !poster ? '16/9' : 'auto', breakInside: 'avoid', marginBottom: 'var(--ms-grid-gap)', display: 'inline-block', width: '100%' } : undefined}>
                  {poster
                    ? <img src={mediaUrl(poster)} alt={a.filename} loading="lazy" style={{ opacity: (isVideo ? a.poster_url : a.variants?.thumb) ? 1 : 0.7, ...(collage ? { height: 'auto' } : {}) }} />
                    : <div style={{ width: '100%', height: collage ? (isVideo ? 150 : 120) : '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isVideo ? '#101013' : undefined }}>{isVideo ? <Film size={22} color="var(--ms-ink-3)" /> : <ImageIcon size={22} color="var(--ms-ink-3)" />}</div>}

                  {isVideo && (
                    <span className="ms-play-badge" aria-hidden><Play size={18} fill="#fff" color="#fff" /></span>
                  )}

                  <div onClick={(e) => { e.stopPropagation(); toggle(a.id); }} className="ms-photo-check" style={isSel ? { background: 'var(--ms-ink)', borderColor: 'var(--ms-ink)' } : undefined} title="Select">
                    {isSel && <Check size={13} color="var(--ms-paper)" />}
                  </div>

                  <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 4 }}>
                    {!isVideo && aiHints && <FocusChip sharpness={a.sharpness} />}
                    {dur && <span className="ms-chip-float" style={{ background: 'rgba(10,8,6,0.62)' }}>{dur}</span>}
                    {aiHints && a.dup_group && <span className="ms-chip-float" style={{ background: 'rgba(10,8,6,0.55)' }} title="Possible duplicate (perceptual hash) — advisory"><span style={{ width: 5, height: 5, borderRadius: 9, background: '#9bb0e6' }} /> Dup?</span>}
                  </div>
                  {a.type === 'raw' && <span className="ms-chip-float" style={{ top: 8, left: 'auto', right: 8, bottom: 'auto', background: 'rgba(10,8,6,0.6)' }}>RAW</span>}
                  {a.watermarked && <span className="ms-chip-float" style={{ top: 8, left: 'auto', right: 8, bottom: 'auto', background: 'rgba(14,165,233,0.85)', display: 'inline-flex', alignItems: 'center', gap: 3 }} title="Watermark applied (client gallery only)"><Droplets size={10} /> WM</span>}
                </div>
              );
            })}
          </div>
        )}
        {shown.length > visibleCount && (
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <button onClick={() => setVisibleCount(c => c + 400)} className="ms-btn-ghost" style={{ padding: '9px 18px' }}>Show {Math.min(400, shown.length - visibleCount)} more · {visibleCount}/{shown.length}</button>
          </div>
        )}

        <p className="ms-note" style={{ marginTop: 26 }}>
          <Sparkles size={12} /> AI focus &amp; duplicate hints are advisory only — they never select, hide, or deliver a photograph. You stay in control.
        </p>
        </div>
        </div>
      </div>

      {lightbox != null && shown[lightbox] && (
        <Lightbox assets={shown} index={lightbox} selected={selected}
          onClose={() => setLightbox(null)}
          onNav={(d) => setLightbox(i => Math.max(0, Math.min(shown.length - 1, i + d)))}
          onAdvance={() => setLightbox(i => (i + 1) % shown.length)}
          onDelete={deleteOne}
          onToggleSelect={toggle} />
      )}
      {showNewGallery && <CreateGalleryModal onClose={() => setShowNewGallery(false)} onCreate={createGallery} />}
      {proofingFor && <ProofingRequestModal gallery={proofingFor} onClose={() => setProofingFor(null)} onCreate={createProof} />}
      {wmModal && <WatermarkModal projectId={id} count={selected.size} initial={project?.settings?.watermark} sampleUrl={(() => { const a = assets.find(x => selected.has(x.id) && kindOf(x) === 'photo'); return a ? mediaUrl(a.thumb_url || a.url) : null; })()} onClose={() => setWmModal(false)} onApply={applyWatermark} onRemove={removeWatermark} />}
      {showRoom && (
        <div onClick={() => setShowRoom(false)} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(8,8,12,0.55)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, marginTop: 64 }}>
            <RoomPanel type="project" id={id} title={project?.title} />
          </div>
        </div>
      )}
      {aiPanel && <StudioAIModal projectId={id} onClose={() => setAiPanel(false)} onGallery={refreshGalleries} setBanner={setBanner} />}
    </>
  );
}

function WatermarkModal({ projectId, count, initial, sampleUrl, onClose, onApply, onRemove }) {
  const [cfg, setCfg] = useState(() => ({ type: 'text', text: 'PROOF', color: 'white', position: 'tiled', opacity: 0.35, size: 32, logo_url: '', ...(initial || {}) }));
  const [uploading, setUploading] = useState(false);
  const [presets, setPresets] = useState(() => { try { return JSON.parse(localStorage.getItem('ms-wm-presets') || '[]'); } catch { return []; } });
  const canvasRef = useRef(null);
  const set = (patch) => setCfg(c => ({ ...c, ...patch }));
  const pickLogo = async (e) => {
    const f = e.target.files?.[0]; if (!f) return; setUploading(true);
    try { const fd = new FormData(); fd.append('file', f); const r = await mediaAPI.uploadWatermarkLogo(projectId, fd); set({ logo_url: r.data.url, type: 'logo' }); }
    catch {} finally { setUploading(false); }
  };
  const savePreset = () => { const name = (window.prompt('Name this watermark preset') || '').trim(); if (!name) return; const next = [...presets.filter(p => p.name !== name), { name, cfg }]; setPresets(next); try { localStorage.setItem('ms-wm-presets', JSON.stringify(next)); } catch {} };
  const delPreset = (name) => { const next = presets.filter(p => p.name !== name); setPresets(next); try { localStorage.setItem('ms-wm-presets', JSON.stringify(next)); } catch {} };

  // live preview — mirrors the server's placement so what you see is what applies
  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); const W = cv.width, H = cv.height;
    const place = (mw, mh, draw) => {
      const m = Math.min(W, H) * 0.04, p = cfg.position || 'bottom-right';
      if (p === 'tiled') { const sx = mw + W * 0.10, sy = mh + H * 0.12; for (let y = -mh; y < H; y += sy) for (let x = -mw; x < W; x += sx) draw(x, y); return; }
      let x = m, y = m; if (p.includes('right')) x = W - mw - m; if (p.includes('bottom')) y = H - mh - m; if (p === 'center') { x = (W - mw) / 2; y = (H - mh) / 2; } draw(x, y);
    };
    const drawMark = () => {
      ctx.save(); ctx.globalAlpha = Math.max(0.05, Math.min(1, Number(cfg.opacity) || 0.5));
      if (cfg.type === 'logo' && cfg.logo_url) {
        const logo = new Image(); logo.crossOrigin = 'anonymous';
        logo.onload = () => { const mw = W * ((Number(cfg.size) || 28) / 100), mh = mw * (logo.height / Math.max(1, logo.width)); place(mw, mh, (x, y) => ctx.drawImage(logo, x, y, mw, mh)); ctx.restore(); };
        logo.onerror = () => ctx.restore(); logo.src = mediaUrl(cfg.logo_url); return;
      }
      const text = cfg.text || 'PROOF'; let fs = 48; ctx.font = `bold ${fs}px sans-serif`;
      const w0 = ctx.measureText(text).width || 1; fs = fs * ((W * ((Number(cfg.size) || 35) / 100)) / w0); ctx.font = `bold ${fs}px sans-serif`;
      ctx.fillStyle = cfg.color === 'black' ? '#000' : '#fff'; ctx.textBaseline = 'top';
      place(ctx.measureText(text).width, fs, (x, y) => ctx.fillText(text, x, y)); ctx.restore();
    };
    const bg = () => { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#cbd5e1'); g.addColorStop(1, '#94a3b8'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
    ctx.clearRect(0, 0, W, H);
    if (sampleUrl) { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { const r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r; ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); drawMark(); }; img.onerror = () => { bg(); drawMark(); }; img.src = sampleUrl; }
    else { bg(); drawMark(); }
  }, [cfg, sampleUrl]);

  const POS = [['top-left', '↖'], ['top-right', '↗'], ['center', '◉'], ['bottom-left', '↙'], ['bottom-right', '↘'], ['tiled', '▦']];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 460, maxHeight: '88vh', overflowY: 'auto', background: 'var(--ms-paper, #fff)', borderRadius: 16, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--ms-ink, #14120f)', display: 'inline-flex', alignItems: 'center', gap: 8 }}><Droplets size={18} /> Watermark</h3>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ms-ink-3, #888)' }}><X size={17} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ms-ink-3, #888)', margin: '0 0 12px' }}>Applies to {count} selected photo{count === 1 ? '' : 's'}. Originals are kept clean — only the client gallery shows the watermark.</p>

        <canvas ref={canvasRef} width={460} height={290} style={{ width: '100%', height: 'auto', borderRadius: 12, border: '1px solid var(--ms-line, #ddd)', display: 'block', marginBottom: 12, background: '#e2e8f0' }} />

        {presets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {presets.map(p => (
              <span key={p.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 6px 5px 11px', borderRadius: 999, border: '1px solid var(--ms-line,#ddd)', fontSize: 12, fontWeight: 600, color: 'var(--ms-ink,#14120f)' }}>
                <button onClick={() => setCfg(c => ({ ...c, ...p.cfg }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontWeight: 600, fontSize: 12, padding: 0 }}>{p.name}</button>
                <button onClick={() => delPreset(p.name)} title="Delete preset" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ms-ink-3,#888)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
              </span>
            ))}
          </div>
        )}

        <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 9, background: 'var(--ms-line, #eee)', marginBottom: 14 }}>
          {[['text', 'Text'], ['logo', 'Logo']].map(([t, l]) => <button key={t} onClick={() => set({ type: t })} style={{ padding: '6px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', background: cfg.type === t ? 'var(--ms-ink, #14120f)' : 'transparent', color: cfg.type === t ? '#fff' : 'var(--ms-ink-3, #888)', fontSize: 12.5, fontWeight: 700 }}>{l}</button>)}
        </div>

        {cfg.type === 'text' ? (
          <>
            <label style={wmLbl}>Text</label>
            <input value={cfg.text} onChange={e => set({ text: e.target.value })} placeholder="PROOF" style={wmInp} />
            <label style={wmLbl}>Color</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[['white', 'White'], ['black', 'Black']].map(([c, l]) => <button key={c} onClick={() => set({ color: c })} style={{ flex: 1, padding: '9px', borderRadius: 9, border: `1.5px solid ${cfg.color === c ? '#0ea5e9' : 'var(--ms-line,#ddd)'}`, background: c === 'white' ? '#fff' : '#14120f', color: c === 'white' ? '#14120f' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{l}</button>)}
            </div>
          </>
        ) : (
          <>
            <label style={wmLbl}>Logo image (PNG with transparency works best)</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 9, border: `1px dashed ${cfg.logo_url ? '#0ea5e9' : 'var(--ms-line,#ddd)'}`, cursor: 'pointer', marginBottom: 12 }}>
              <Upload size={15} style={{ color: '#0ea5e9' }} />
              <span style={{ fontSize: 13, color: 'var(--ms-ink-3,#888)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploading ? 'Uploading…' : cfg.logo_url ? 'Logo uploaded ✓ — replace' : 'Upload a logo'}</span>
              <input type="file" accept="image/*" onChange={pickLogo} style={{ display: 'none' }} />
            </label>
          </>
        )}

        <label style={wmLbl}>Position</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginBottom: 14 }}>
          {POS.map(([p, ic]) => <button key={p} onClick={() => set({ position: p })} title={p} style={{ padding: '10px 0', borderRadius: 9, border: `1.5px solid ${cfg.position === p ? '#0ea5e9' : 'var(--ms-line,#ddd)'}`, background: cfg.position === p ? 'rgba(14,165,233,0.1)' : 'transparent', cursor: 'pointer', fontSize: 15 }}>{ic}</button>)}
        </div>

        <label style={wmLbl}>Size — {cfg.size}% of width</label>
        <input type="range" min={8} max={80} value={cfg.size} onChange={e => set({ size: Number(e.target.value) })} style={{ width: '100%', marginBottom: 12 }} />
        <label style={wmLbl}>Opacity — {Math.round(cfg.opacity * 100)}%</label>
        <input type="range" min={5} max={100} value={Math.round(cfg.opacity * 100)} onChange={e => set({ opacity: Number(e.target.value) / 100 })} style={{ width: '100%', marginBottom: 16 }} />

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onApply(cfg)} disabled={cfg.type === 'logo' && !cfg.logo_url} style={{ flex: 1, padding: '13px', borderRadius: 11, border: 'none', cursor: 'pointer', background: 'var(--ms-ink, #14120f)', color: '#fff', fontWeight: 800, fontSize: 15, opacity: (cfg.type === 'logo' && !cfg.logo_url) ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Droplets size={15} /> Apply to {count} photo{count === 1 ? '' : 's'}</button>
          <button onClick={savePreset} title="Save these settings as a preset" style={{ padding: '13px 16px', borderRadius: 11, border: '1px solid var(--ms-line,#ddd)', cursor: 'pointer', background: 'transparent', color: 'var(--ms-ink,#14120f)', fontWeight: 700, fontSize: 13.5 }}>Save preset</button>
        </div>
        <button onClick={onRemove} style={{ width: '100%', marginTop: 8, padding: '11px', borderRadius: 11, border: '1px solid var(--ms-line,#ddd)', cursor: 'pointer', background: 'transparent', color: 'var(--ms-ink-3,#888)', fontWeight: 600, fontSize: 13.5 }}>Remove watermark from selection</button>
      </div>
    </div>
  );
}
function StudioAIModal({ projectId, onClose, onGallery, setBanner }) {
  const [busy, setBusy] = useState('');
  const [sels, setSels] = useState([]);
  const [note, setNote] = useState('');
  const [pages, setPages] = useState(30);
  const [reelLen, setReelLen] = useState(30);
  const [reel, setReel] = useState(null);
  const [albumId, setAlbumId] = useState(null);
  const KINDS = [['best_of', 'Best Of'], ['highlights', 'Highlights'], ['portfolio', 'Portfolio'], ['album', 'Album'], ['delivery', 'Delivery']];

  const analyze = async () => { setBusy('analyze'); try { const r = await mediaAPI.analyzeProject(projectId); setNote(`Scored ${r.data.scored}/${r.data.total} photos.`); } catch { setNote('Analyze failed.'); } finally { setBusy(''); } };
  const gen = async (kind) => { setBusy(kind); try { const r = await studioAiAPI.generateSelection(projectId, kind); setSels(s => [{ ...r.data, kind }, ...s.filter(x => x.kind !== kind)]); setNote(`${r.data.label}: ${r.data.count} photos selected.`); } catch (e) { setNote(e?.response?.data?.error || 'Failed.'); } finally { setBusy(''); } };
  const buildGallery = async (sel) => { setBusy('gal-' + sel.kind); try { await studioAiAPI.galleryFromSelection(projectId, { selection_id: sel.id }); setBanner && setBanner({ type: 'ok', msg: `Gallery built from ${sel.label} (${sel.count}).` }); onGallery && onGallery(); } catch { setNote('Gallery build failed.'); } finally { setBusy(''); } };
  const album = async () => { setBusy('album'); try { const r = await studioAiAPI.album(projectId, { pages }); setAlbumId(r.data.album_id); setNote(`Album draft: ${r.data.spreads} spreads, ${r.data.images} images.`); } catch { setNote('Album failed.'); } finally { setBusy(''); } };
  const makeReel = async () => { setBusy('reel'); try { const r = await videoAiAPI.reel(projectId, { length_s: reelLen }); setReel(r.data); setNote(`Reel plan: ${r.data.plan.timeline.length} clips${r.data.template ? ' · ' + r.data.template : ''}.`); } catch (e) { setNote(e?.response?.data?.error || 'Reel failed.'); } finally { setBusy(''); } };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', background: 'var(--ms-paper,#fff)', borderRadius: 16, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--ms-ink,#14120f)', display: 'inline-flex', alignItems: 'center', gap: 8 }}><Wand2 size={18} /> Studio AI</h3>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ms-ink-3,#888)' }}><X size={17} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ms-ink-3,#888)', margin: '0 0 14px' }}>AI advises — you confirm. Selections are explainable and non-destructive.</p>

        <button onClick={analyze} disabled={!!busy} style={btnGhostWide}>{busy === 'analyze' ? 'Analyzing…' : 'Re-score this project'}</button>

        <div style={aiLbl}>Smart selections</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {KINDS.map(([k, l]) => <button key={k} onClick={() => gen(k)} disabled={!!busy} style={chip}>{busy === k ? '…' : l}</button>)}
        </div>
        {sels.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
            {sels.map(s => (
              <div key={s.kind} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: '1px solid var(--ms-line,#ddd)', borderRadius: 10 }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--ms-ink,#14120f)' }}><b>{s.label}</b> · {s.count} photos</span>
                <button onClick={() => buildGallery(s)} disabled={!!busy} style={{ ...chip, background: 'var(--ms-ink,#14120f)', color: '#fff', border: 'none' }}>{busy === 'gal-' + s.kind ? '…' : 'Build gallery'}</button>
              </div>
            ))}
          </div>
        )}

        <div style={aiLbl}>Album draft</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={pages} onChange={e => setPages(Number(e.target.value))} style={aiSel}>{[20, 30, 40, 60].map(n => <option key={n} value={n}>{n} pages</option>)}</select>
          <button onClick={album} disabled={!!busy} style={chip}>{busy === 'album' ? 'Generating…' : 'Generate album'}</button>
          {albumId && <a href={`/studio/${projectId}/albums/${albumId}`} style={{ ...chip, textDecoration: 'none', background: 'var(--ms-ink,#14120f)', color: '#fff', border: 'none' }}>Open editor →</a>}
        </div>

        <div style={aiLbl}>Reel (Story Engine)</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={reelLen} onChange={e => setReelLen(Number(e.target.value))} style={aiSel}>{[15, 30, 60, 90].map(n => <option key={n} value={n}>{n}s</option>)}</select>
          <button onClick={makeReel} disabled={!!busy} style={chip}>{busy === 'reel' ? 'Planning…' : 'Generate reel plan'}</button>
        </div>
        {reel && <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><span style={{ fontSize: 12.5, color: 'var(--ms-ink-3,#888)' }}>{reel.plan.timeline.length} clips · {reel.plan.aspect} · {reel.plan.length_s}s{reel.template ? ` · ${reel.template}` : ''}</span><a href={`/studio/${projectId}/reel/${reel.reel_id}`} style={{ ...chip, textDecoration: 'none', background: 'var(--ms-ink,#14120f)', color: '#fff', border: 'none', padding: '6px 12px' }}>Edit timeline →</a></div>}

        {note && <p style={{ marginTop: 14, fontSize: 13, color: 'var(--ms-ink,#14120f)', background: 'var(--ms-line,#f2f2f4)', padding: '10px 12px', borderRadius: 9 }}>{note}</p>}
      </div>
    </div>
  );
}
const btnGhostWide = { width: '100%', padding: '10px', borderRadius: 10, border: '1px solid var(--ms-line,#ddd)', background: 'transparent', color: 'var(--ms-ink,#14120f)', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginBottom: 6 };
const aiLbl = { fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ms-ink-3,#888)', margin: '16px 0 8px' };
const chip = { padding: '8px 13px', borderRadius: 9, border: '1px solid var(--ms-line,#ddd)', background: 'var(--ms-paper,#fff)', color: 'var(--ms-ink,#14120f)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' };
const aiSel = { padding: '8px 10px', borderRadius: 9, border: '1px solid var(--ms-line,#ddd)', background: 'var(--ms-paper,#fff)', color: 'var(--ms-ink,#14120f)', fontSize: 13, outline: 'none' };
const wmLbl = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--ms-ink-3,#888)', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 6px' };
const wmInp = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--ms-line,#ddd)', background: 'var(--ms-paper,#fff)', color: 'var(--ms-ink,#14120f)', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 12 };

const lbBtn = { position: 'absolute', top: 18, right: 18, width: 42, height: 42, borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const lbArrow = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const lbPill = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'var(--ms-sans)', fontSize: 12.5, fontWeight: 600 };
