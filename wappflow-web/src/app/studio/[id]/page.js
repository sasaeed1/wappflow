'use client';
/* eslint-disable @next/next/no-img-element -- gallery thumbs are dynamic /uploads URLs; next/image isn't configured for them */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Upload, Image as ImageIcon, Check, X, Plus, Share2, Copy,
  Lock, Globe, Eye, Sparkles, Loader, ExternalLink, ListChecks, Download, Package, BookOpen, Film,
} from 'lucide-react';
import { mediaAPI, mediaUrl } from '../../../lib/api';
import NavBar from '../../../components/NavBar';

// Advisory-only focus chip — quiet by design. Renders the CV sharpness estimate;
// it never selects or rejects. The photographer decides.
function FocusChip({ sharpness }) {
  if (sharpness == null) return null;
  const sharp = sharpness >= 120;
  return (
    <span className="ms-chip-float" style={{ background: 'rgba(10,8,6,0.55)' }} title="AI focus estimate — advisory only, never auto-applied">
      <span style={{ width: 5, height: 5, borderRadius: 9, background: sharp ? '#5fd0a0' : '#e6b455' }} /> {sharp ? 'Sharp' : 'Soft'}
    </span>
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
    try {
      await onCreate({ title: title.trim(), visibility, password: visibility === 'password' ? password : undefined, settings: { download_policy: policy } });
    } finally { setSaving(false); }
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
  const [banner, setBanner] = useState(null); // { type, msg, link }
  const [exports, setExports] = useState({}); // galleryId -> { status, url }
  const [proofingFor, setProofingFor] = useState(null); // gallery awaiting a selection request

  const refreshAssets = useCallback(async () => {
    try { const r = await mediaAPI.listAssets(id, { limit: 500 }); setAssets(r.data.assets || []); return r.data.assets || []; } catch { return []; }
  }, [id]);
  const refreshGalleries = useCallback(async () => {
    try { const r = await mediaAPI.listGalleries(id); setGalleries(r.data.galleries || []); } catch {}
  }, [id]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login'); return; }
    (async () => {
      setLoading(true);
      try { const p = await mediaAPI.getProject(id); setProject(p.data); } catch { router.push('/studio'); return; }
      await Promise.all([refreshAssets(), refreshGalleries()]);
      setLoading(false);
    })();
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
      // Poll a few times while the worker generates variants + advisory scores.
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

  const createGallery = async (data) => {
    const res = await mediaAPI.createGallery(id, data);
    setShowNewGallery(false);
    await refreshGalleries();
    // if photos are selected, drop them straight in
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

  const copy = (text) => { try { navigator.clipboard.writeText(text); setBanner({ type: 'ok', msg: 'Link copied' }); } catch {} };

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
          else if (s.status === 'failed' || tries > 30) { clearInterval(poll); setExports(e => ({ ...e, [galleryId]: { status: 'failed' } })); }
        } catch { clearInterval(poll); setExports(e => ({ ...e, [galleryId]: { status: 'failed' } })); }
      }, 2000);
    } catch { setExports(e => ({ ...e, [galleryId]: { status: 'failed' } })); }
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

        <header className="ms-masthead" style={{ marginBottom: 8 }}>
          <div>
            <p className="ms-eyebrow" style={{ textTransform: 'capitalize' }}>{(project.project_type || 'general').replace('_', ' ')}</p>
            <h1 className="ms-display" style={{ fontSize: 'clamp(28px, 4vw, 46px)' }}>{project.title}</h1>
            <p className="ms-collection-sub" style={{ marginTop: 8 }}>
              {project.client_name ? `${project.client_name} · ` : ''}{assets.length} photograph{assets.length === 1 ? '' : 's'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" onChange={onUpload} style={{ display: 'none' }} />
            {assets.length > 0 && (
              <button onClick={() => router.push(`/studio/${id}/cull`)} className="ms-btn-ghost"><ListChecks size={15} /> Cull</button>
            )}
            {assets.length > 0 && (
              <button onClick={() => router.push(`/studio/${id}/albums`)} className="ms-btn-ghost"><BookOpen size={15} /> Albums</button>
            )}
            {assets.some(a => a.type === 'video') && (
              <button onClick={() => router.push(`/studio/${id}/video`)} className="ms-btn-ghost"><Film size={15} /> Video</button>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={uploading} className="ms-btn-ink">
              {uploading ? <Loader size={16} className="ms-spin" /> : <Upload size={16} />} {uploading ? 'Uploading…' : 'Upload photos'}
            </button>
          </div>
        </header>

        <hr className="ms-rule" />

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
                <p style={{ fontSize: 12.5, color: 'var(--ms-ink-3)', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'capitalize' }}>
                  {g.has_password ? <Lock size={11} /> : g.visibility === 'public' ? <Globe size={11} /> : <Eye size={11} />}
                  {g.visibility} · {g.asset_count || 0} photos
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selected.size > 0 && (
                    <button onClick={() => addSelected(g.id)} className="ms-btn-ghost" style={{ padding: '7px 13px' }}><Plus size={13} /> Add {selected.size}</button>
                  )}
                  {g.status === 'published'
                    ? <button onClick={() => copy(g.share_url || '')} className="ms-btn-ghost" style={{ padding: '7px 13px' }}><Share2 size={13} /> Copy link</button>
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

        {/* Library */}
        <div className="ms-section-head">
          <h2 className="ms-h2">Library</h2>
          {selected.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 12.5, color: 'var(--ms-ink-3)' }}>{selected.size} selected</span>
              <button onClick={() => setSelected(new Set())} className="ms-btn-text">Clear</button>
            </div>
          )}
        </div>

        {assets.length === 0 ? (
          <div className="ms-empty-soft">No photographs yet — upload to begin.</div>
        ) : (
          <div className="ms-photo-grid">
            {assets.map(a => {
              const isSel = selected.has(a.id);
              return (
                <div key={a.id} onClick={() => toggle(a.id)} className={`ms-photo${isSel ? ' is-selected' : ''}`}>
                  {a.thumb_url
                    ? <img src={mediaUrl(a.thumb_url)} alt={a.filename} loading="lazy" style={{ opacity: a.variants?.thumb ? 1 : 0.7 }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={22} color="var(--ms-ink-3)" /></div>}

                  <div className="ms-photo-check" style={isSel ? { background: 'var(--ms-ink)', borderColor: 'var(--ms-ink)' } : undefined}>
                    {isSel && <Check size={13} color="var(--ms-paper)" />}
                  </div>

                  <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 4 }}>
                    <FocusChip sharpness={a.sharpness} />
                    {a.dup_group && <span className="ms-chip-float" style={{ background: 'rgba(10,8,6,0.55)' }} title="Possible duplicate (perceptual hash) — advisory"><span style={{ width: 5, height: 5, borderRadius: 9, background: '#9bb0e6' }} /> Dup?</span>}
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

      {showNewGallery && <CreateGalleryModal onClose={() => setShowNewGallery(false)} onCreate={createGallery} />}
      {proofingFor && <ProofingRequestModal gallery={proofingFor} onClose={() => setProofingFor(null)} onCreate={createProof} />}
    </NavBar>
  );
}
