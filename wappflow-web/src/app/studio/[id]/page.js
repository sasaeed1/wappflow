'use client';
/* eslint-disable @next/next/no-img-element -- gallery thumbs are dynamic /uploads URLs; next/image isn't configured for them */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Upload, Image as ImageIcon, Check, X, Plus, Share2, Copy, Trash2,
  Lock, Globe, Eye, Sparkles, Loader, ExternalLink, ListChecks, Download, Package, BookOpen, Film,
  Heart, MessageSquare, ChevronLeft, ChevronRight, Grid2x2, Grid3x3, LayoutGrid, LayoutDashboard, Play,
} from 'lucide-react';

// photo | video — RAW and stills both live under "photo"
const kindOf = (a) => (a?.type === 'video' ? 'video' : 'photo');
const fmtDur = (ms) => { if (!ms) return null; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
import { mediaAPI, mediaUrl } from '../../../lib/api';
import NavBar from '../../../components/StudioShell';

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
function Lightbox({ assets, index, onClose, onNav, onDelete, selected, onToggleSelect }) {
  const a = assets[index];
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onNav(1);
      else if (e.key === 'ArrowLeft') onNav(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onNav]);
  if (!a) return null;
  const isSel = selected.has(a.id);
  const isVideo = kindOf(a) === 'video';
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

  // apply per-device studio preferences (set in Studio → Settings)
  useEffect(() => {
    try { const p = JSON.parse(localStorage.getItem('ms-prefs') || '{}'); if (p.libraryView) setViewSize(p.libraryView); if (p.aiHints === false) setAiHints(false); } catch {}
  }, []);

  const photoCount = assets.filter(a => kindOf(a) === 'photo').length;
  const videoCount = assets.length - photoCount;
  const shown = mediaTab === 'all' ? assets : assets.filter(a => kindOf(a) === mediaTab);

  const refreshAssets = useCallback(async () => {
    try { const r = await mediaAPI.listAssets(id, { limit: 500 }); setAssets(r.data.assets || []); return r.data.assets || []; } catch { return []; }
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

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} photograph${selected.size === 1 ? '' : 's'}? This permanently removes the file and can’t be undone.`)) return;
    for (const aid of Array.from(selected)) { try { await mediaAPI.deleteAsset(aid); } catch {} }
    setSelected(new Set());
    await refreshAssets();
    setBanner({ type: 'ok', msg: 'Deleted' });
  };

  const deleteOne = async (asset) => {
    if (!window.confirm(`Delete this ${kindOf(asset) === 'video' ? 'video' : 'photograph'}? This can’t be undone.`)) return;
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

  if (loading) return <NavBar><div className="ms-page"><p className="ms-loading">Loading…</p></div></NavBar>;

  return (
    <NavBar>
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
                <button onClick={deleteSelected} className="ms-btn-text" style={{ color: '#b3261e' }}><Trash2 size={13} /> Delete</button>
                <button onClick={() => setSelected(new Set())} className="ms-btn-text">Clear</button>
                <span style={{ width: 1, height: 16, background: 'var(--ms-line)' }} />
              </>
            )}
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
            {shown.map((a, i) => {
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
                </div>
              );
            })}
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
          onDelete={deleteOne}
          onToggleSelect={toggle} />
      )}
      {showNewGallery && <CreateGalleryModal onClose={() => setShowNewGallery(false)} onCreate={createGallery} />}
      {proofingFor && <ProofingRequestModal gallery={proofingFor} onClose={() => setProofingFor(null)} onCreate={createProof} />}
    </NavBar>
  );
}

const lbBtn = { position: 'absolute', top: 18, right: 18, width: 42, height: 42, borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.1)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const lbArrow = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 48, height: 48, borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.08)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const lbPill = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'var(--ms-sans)', fontSize: 12.5, fontWeight: 600 };
