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

// Advisory-only focus chip. Renders the CV sharpness estimate; it never selects or
// rejects — the photographer decides. Threshold is a soft visual cue.
function FocusChip({ sharpness }) {
  if (sharpness == null) return null;
  const sharp = sharpness >= 120;
  return (
    <span title="AI focus estimate — advisory only, never auto-applied"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 6, fontSize: 9.5, fontWeight: 800,
        background: sharp ? 'rgba(16,185,129,0.85)' : 'rgba(245,158,11,0.85)', color: 'white', backdropFilter: 'blur(4px)' }}>
      <Sparkles size={9} /> {sharp ? 'Sharp' : 'Soft'}
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
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modal, maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>New Gallery</h2>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>
        <label style={labelStyle}>Gallery name</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Highlights" style={inputStyle} autoFocus />
        <label style={labelStyle}>Visibility</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['private', Lock, 'Private'], ['password', Lock, 'Password'], ['public', Globe, 'Public']].map(([v, Icon, lbl]) => (
            <button key={v} onClick={() => setVisibility(v)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '8px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${visibility === v ? 'var(--accent)' : 'var(--border)'}`, background: visibility === v ? 'var(--accent-light)' : 'transparent', color: visibility === v ? 'var(--accent)' : 'var(--text-muted)',
            }}><Icon size={13} /> {lbl}</button>
          ))}
        </div>
        {visibility === 'password' && (
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Gallery password" style={inputStyle} />
        )}
        <label style={labelStyle}>Downloads</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {[['none', 'No download'], ['web', 'Web size'], ['high-res', 'High-res']].map(([v, lbl]) => (
            <button key={v} onClick={() => setPolicy(v)} style={{
              flex: 1, padding: '8px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${policy === v ? 'var(--accent)' : 'var(--border)'}`, background: policy === v ? 'var(--accent-light)' : 'transparent', color: policy === v ? 'var(--accent)' : 'var(--text-muted)',
            }}>{lbl}</button>
          ))}
        </div>
        <button onClick={submit} disabled={saving} style={primaryBtn}>{saving ? 'Creating…' : 'Create gallery'}</button>
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
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modal, maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Request client selections</h2>
          <button onClick={onClose} style={iconBtn}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 16px' }}>Your client picks their favourites right inside the gallery, then submits.</p>
        <label style={labelStyle}>Prompt</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Select your favourites" style={inputStyle} autoFocus />
        <label style={labelStyle}>How many? (optional)</label>
        <input type="number" min="1" value={quota} onChange={e => setQuota(e.target.value)} placeholder="e.g. 40" style={inputStyle} />
        <label style={labelStyle}>Instructions (optional)</label>
        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={2} placeholder="Anything they should know…" style={{ ...inputStyle, resize: 'vertical' }} />
        <button onClick={submit} disabled={saving} style={primaryBtn}>{saving ? 'Sending…' : 'Send selection request'}</button>
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

  if (loading) return <NavBar><div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div></NavBar>;

  return (
    <NavBar>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '22px 20px 60px' }}>
        <button onClick={() => router.push('/studio')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
          <ArrowLeft size={15} /> All shoots
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 25, fontWeight: 900, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>{project.title}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '5px 0 0' }}>
              <span style={{ textTransform: 'capitalize' }}>{(project.project_type || 'general').replace('_', ' ')}</span>
              {project.client_name ? ` · ${project.client_name}` : ''} · {assets.length} photo{assets.length === 1 ? '' : 's'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" onChange={onUpload} style={{ display: 'none' }} />
            {assets.length > 0 && (
              <button onClick={() => router.push(`/studio/${id}/cull`)} style={{ ...ghostBtn, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <ListChecks size={16} /> Cull
              </button>
            )}
            {assets.length > 0 && (
              <button onClick={() => router.push(`/studio/${id}/albums`)} style={{ ...ghostBtn, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={16} /> Albums
              </button>
            )}
            {assets.some(a => a.type === 'video') && (
              <button onClick={() => router.push(`/studio/${id}/video`)} style={{ ...ghostBtn, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Film size={16} /> Video
              </button>
            )}
            <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...primaryBtn, width: 'auto', padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {uploading ? <Loader size={16} className="spin" /> : <Upload size={16} />} {uploading ? 'Uploading…' : 'Upload photos'}
            </button>
          </div>
        </div>

        {banner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, marginBottom: 18,
            background: banner.type === 'error' ? 'rgba(239,68,68,0.10)' : 'rgba(16,185,129,0.10)',
            border: `1px solid ${banner.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}` }}>
            <span style={{ fontSize: 13.5, color: 'var(--text)', flex: 1 }}>{banner.msg}</span>
            {banner.link && (
              <>
                <code style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{banner.link}</code>
                <button onClick={() => copy(banner.link)} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5 }}><Copy size={13} /> Copy</button>
                <a href={banner.link} target="_blank" rel="noreferrer" style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}><ExternalLink size={13} /> Open</a>
              </>
            )}
            <button onClick={() => setBanner(null)} style={iconBtn}><X size={15} /></button>
          </div>
        )}

        {/* Galleries */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={sectionH}>Galleries</h2>
          <button onClick={() => setShowNewGallery(true)} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> New gallery</button>
        </div>
        {galleries.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 26px' }}>No galleries yet. Select photos below, then create a gallery to deliver them.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginBottom: 28 }}>
            {galleries.map(g => (
              <div key={g.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text)', flex: 1 }}>{g.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6,
                    background: g.status === 'published' ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)',
                    color: g.status === 'published' ? '#10b981' : 'var(--text-muted)' }}>{g.status}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {g.has_password ? <Lock size={11} /> : g.visibility === 'public' ? <Globe size={11} /> : <Eye size={11} />}
                  {g.visibility} · {g.asset_count || 0} photos
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {selected.size > 0 && (
                    <button onClick={() => addSelected(g.id)} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={13} /> Add {selected.size}</button>
                  )}
                  {g.status === 'published'
                    ? <button onClick={() => copy(g.share_url || '')} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5 }}><Share2 size={13} /> Copy link</button>
                    : <button onClick={() => publish(g)} disabled={(g.asset_count || 0) === 0} style={{ ...primaryBtn, width: 'auto', padding: '7px 14px', fontSize: 12.5, opacity: (g.asset_count || 0) === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 5 }}><Share2 size={13} /> Publish &amp; send</button>}
                  {(() => {
                    const ex = exports[g.id];
                    if (ex?.status === 'ready') return <a href={mediaUrl(ex.url)} download style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}><Download size={13} /> Download ZIP</a>;
                    if (ex?.status === 'pending') return <span style={{ ...ghostBtn, opacity: 0.65 }}>Zipping…</span>;
                    if (ex?.status === 'failed') return <button onClick={() => runExport(g.id, 'original')} style={{ ...ghostBtn, color: '#ef4444' }}>Retry ZIP</button>;
                    return (g.asset_count || 0) > 0 ? <button onClick={() => runExport(g.id, 'original')} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5 }}><Package size={13} /> Export ZIP</button> : null;
                  })()}
                </div>
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  {!g.proofing_id ? (
                    <button onClick={() => setProofingFor(g)} disabled={(g.asset_count || 0) === 0} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, opacity: (g.asset_count || 0) === 0 ? 0.5 : 1 }}><ListChecks size={13} /> Request selections</button>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                        Selections <strong style={{ color: 'var(--text)' }}>{g.proofing_selected || 0}{g.proofing_quota ? `/${g.proofing_quota}` : ''}</strong>
                        <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 6, fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
                          background: g.proofing_status === 'submitted' ? 'rgba(245,158,11,0.16)' : g.proofing_status === 'approved' ? 'rgba(16,185,129,0.16)' : 'rgba(99,102,241,0.14)',
                          color: g.proofing_status === 'submitted' ? '#f59e0b' : g.proofing_status === 'approved' ? '#10b981' : '#6366f1' }}>{g.proofing_status}</span>
                      </span>
                      {g.proofing_status === 'submitted' && (
                        <>
                          <button onClick={() => approveProof(g.proofing_id)} style={{ ...ghostBtn, color: '#10b981', fontSize: 12, padding: '5px 10px' }}>Approve</button>
                          <button onClick={() => requestChangesProof(g.proofing_id)} style={{ ...ghostBtn, fontSize: 12, padding: '5px 10px' }}>Request changes</button>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={sectionH}>Library</h2>
          {selected.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{selected.size} selected</span>
              <button onClick={() => setSelected(new Set())} style={ghostBtn}>Clear</button>
            </div>
          )}
        </div>

        {assets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '70px 20px', border: '2px dashed var(--border)', borderRadius: 18 }}>
            <ImageIcon size={30} color="var(--text-muted)" style={{ opacity: 0.5 }} />
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '12px 0 0' }}>No photos yet — upload to get started.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {assets.map(a => {
              const isSel = selected.has(a.id);
              return (
                <div key={a.id} onClick={() => toggle(a.id)} style={{
                  position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                  border: `2px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: 'var(--surface2)',
                }}>
                  {a.thumb_url
                    ? <img src={mediaUrl(a.thumb_url)} alt={a.filename} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: a.variants?.thumb ? 1 : 0.7 }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={22} color="var(--text-muted)" /></div>}

                  {/* selection check */}
                  <div style={{ position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isSel ? 'var(--accent)' : 'rgba(0,0,0,0.4)', border: '2px solid white' }}>
                    {isSel && <Check size={13} color="white" />}
                  </div>

                  {/* advisory chips */}
                  <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', gap: 4 }}>
                    <FocusChip sharpness={a.sharpness} />
                    {a.dup_group && <span title="Possible duplicate (perceptual hash) — advisory" style={{ padding: '2px 6px', borderRadius: 6, fontSize: 9.5, fontWeight: 800, background: 'rgba(99,102,241,0.85)', color: 'white' }}>Dup?</span>}
                  </div>
                  {a.type === 'raw' && <span style={{ position: 'absolute', top: 8, right: 8, padding: '2px 6px', borderRadius: 6, fontSize: 9, fontWeight: 800, background: 'rgba(0,0,0,0.55)', color: 'white' }}>RAW</span>}
                </div>
              );
            })}
          </div>
        )}

        <p style={{ marginTop: 22, fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={12} /> AI focus/duplicate hints are advisory only — they never select, hide, or deliver a photo. You stay in control.
        </p>
      </div>

      {showNewGallery && <CreateGalleryModal onClose={() => setShowNewGallery(false)} onCreate={createGallery} />}
      {proofingFor && <ProofingRequestModal gallery={proofingFor} onClose={() => setProofingFor(null)} onCreate={createProof} />}
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </NavBar>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 };
const modal = { background: 'var(--surface)', borderRadius: 20, padding: 26, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.25)' };
const sectionH = { fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 };
const labelStyle = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, marginBottom: 16, outline: 'none', boxSizing: 'border-box' };
const primaryBtn = { width: '100%', padding: '11px', borderRadius: 11, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: 'white', fontWeight: 800, fontSize: 14 };
const ghostBtn = { padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
const iconBtn = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' };
