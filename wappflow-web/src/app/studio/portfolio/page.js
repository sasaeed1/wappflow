'use client';
/* eslint-disable @next/next/no-img-element -- portfolio media are dynamic /uploads URLs */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, X, Upload, Eye, EyeOff, Copy, Send, Check, Trash2, Star, ExternalLink,
  Loader, GripVertical, Search, Layout, Globe, Sparkles, Crown, Pencil, Play,
  ChevronLeft, ChevronRight, Image as ImageIcon,
} from 'lucide-react';
import { mediaAPI, leadsAPI, mediaUrl } from '../../../lib/api';
import PortfolioCanvas, { PORTFOLIO_THEME_META, PortfolioThumb } from '../../folio/portfolio-view';
import { clickable } from '@/lib/a11y';
import { startUpload, useUploads, cancel, fmtBytes, fmtEta } from '@/lib/uploads';

const THEME_ORDER = ['atelier', 'noir', 'editorial', 'gallery', 'film', 'brut', 'luxe', 'vivid', 'mono', 'frame'];

export default function PortfolioEditorPage() {
  const router = useRouter();
  const fileRef = useRef(null);
  const dragFrom = useRef(null);
  const [pf, setPf] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [picker, setPicker] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [handleState, setHandleState] = useState(null); // {checking|free|taken, value}
  const [uploadId, setUploadId] = useState(null);
  const [editing, setEditing] = useState(null); // item id open in the item editor
  const upload = useUploads().find(j => j.id === uploadId) || null;

  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const load = useCallback(async () => {
    try { const r = await mediaAPI.getPortfolio(); setPf(r.data); setItems(r.data.items || []); }
    catch { say('Could not load portfolio'); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/studio/portfolio'); return; }
    load();
  }, []);

  // patch portfolio settings on the server, optimistic
  const save = async (patch) => {
    setSaving(true);
    try { const r = await mediaAPI.updatePortfolio(patch); setPf(r.data); if (r.data.items) setItems(r.data.items); }
    catch (e) { say(e.response?.data?.error || 'Save failed'); }
    setSaving(false);
  };
  const setField = (k, v) => setPf(p => ({ ...p, [k]: v }));
  const setSetting = (k, v) => setPf(p => ({ ...p, settings: { ...(p.settings || {}), [k]: v } }));
  const saveSetting = (k, v) => save({ settings: { ...(pf.settings || {}), [k]: v } });

  // handle availability (debounced)
  useEffect(() => {
    if (!pf) return;
    const h = pf.handle || '';
    setHandleState(null);
    const t = setTimeout(async () => {
      try { const r = await mediaAPI.portfolioHandleFree(h); setHandleState({ status: r.data.available ? 'free' : 'taken', value: r.data.handle }); } catch {}
    }, 450);
    return () => clearTimeout(t);
  }, [pf?.handle]); // eslint-disable-line

  // Uploads go through the shared upload manager: live progress, speed and ETA
  // here and in the global tray, and the transfer survives leaving the page.
  const onUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (fileRef.current) fileRef.current.value = '';
    if (!files.length) return;
    const fd = new FormData(); files.forEach(f => fd.append('files', f));
    setUploadId(startUpload({
      url: '/media/portfolio/upload',
      formData: fd,
      label: `${files.length} portfolio file${files.length === 1 ? '' : 's'}`,
      bytes: files.reduce((n, f) => n + (f.size || 0), 0),
      onDone: (r) => { if (r?.data?.items) setItems(r.data.items); },
    }));
  };

  const removeItem = async (id) => {
    setItems(its => its.filter(i => i.id !== id));
    try { await mediaAPI.deletePortfolioItem(id); } catch {}
  };
  const toggleFeatured = async (it) => {
    setItems(its => its.map(i => i.id === it.id ? { ...i, featured: !i.featured } : i));
    try { await mediaAPI.updatePortfolioItem(it.id, { featured: !it.featured }); } catch {}
  };
  const setCaption = async (it, caption) => { try { await mediaAPI.updatePortfolioItem(it.id, { caption }); } catch {} };
  const makeCover = async (it) => {
    // a video's cover is its thumbnail — an .mp4 in an <img> hero renders nothing
    const still = it.kind === 'video' ? it.poster_url : (it.full_url || it.url);
    if (!still) { say('Pick a thumbnail for this video first'); setEditing(it.id); return; }
    await save({ cover_url: still }); say('Cover updated');
  };
  const patchItem = async (it, patch) => {
    setItems(its => its.map(i => i.id === it.id ? { ...i, ...patch } : i));
    try { await mediaAPI.updatePortfolioItem(it.id, patch); } catch { say('Save failed'); }
  };

  // reorder — drag on desktop, or the position controls in the item editor
  const onDrop = (toIdx) => {
    const from = dragFrom.current; dragFrom.current = null;
    moveItem(from, toIdx);
  };
  const moveItem = async (from, toIdx) => {
    if (from == null || from === toIdx || toIdx < 0 || toIdx >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(toIdx, 0, moved);
    setItems(next);
    try { await mediaAPI.reorderPortfolio(next.map(i => i.id)); } catch {}
  };

  const copyLink = () => {
    if (!pf?.share_url) return;
    try { navigator.clipboard.writeText(pf.share_url); say('Link copied'); } catch { say('Copy failed'); }
  };

  if (loading) return <><div className="ms-page"><p className="ms-loading">Opening your portfolio…</p></div></>;
  if (!pf) return <><div className="ms-page"><p className="ms-loading">—</p></div></>;

  const s = pf.settings || {};

  return (
    <>
      <div className="ms-page" style={{ maxWidth: 1500 }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', marginBottom: 8 }}>
          <div>
            <p className="ms-eyebrow" style={{ marginBottom: 8 }}>Your portfolio</p>
            <h1 className="ms-display" style={{ fontSize: 'clamp(30px, 4.6vw, 60px)' }}>Portfolio</h1>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            {saving && <span style={{ fontSize: 11.5, color: 'var(--ms-ink-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Loader size={12} className="ms-spin" /> Saving…</span>}
            <button onClick={() => setPreview(true)} className="ms-btn-ghost"><Eye size={15} /> Preview</button>
            <button onClick={() => save({ is_public: !pf.is_public })} className="ms-btn-ghost" style={pf.is_public ? { borderColor: 'var(--ms-spark)', color: 'var(--ms-spark)' } : undefined}>
              {pf.is_public ? <Globe size={15} /> : <EyeOff size={15} />} {pf.is_public ? 'Public' : 'Private'}
            </button>
            <button onClick={copyLink} className="ms-btn-ghost"><Copy size={15} /> Copy link</button>
            <button onClick={() => setShareOpen(true)} className="ms-btn-ink"><Send size={15} /> Send to client</button>
          </div>
        </div>

        {/* share bar */}
        <div className="ms-banner" style={{ marginTop: 16, marginBottom: 26 }}>
          <Globe size={15} style={{ color: pf.is_public ? 'var(--ms-spark)' : 'var(--ms-ink-3)' }} />
          <span style={{ fontSize: 13, color: 'var(--ms-ink-2)' }}>
            {pf.is_public ? 'Live at' : 'Private — turn on Public to share.'}{' '}
            {pf.is_public && <a href={pf.share_url} target="_blank" rel="noreferrer" style={{ color: 'var(--ms-ink)', fontWeight: 600 }}>{pf.share_url?.replace(/^https?:\/\//, '')}</a>}
          </span>
          {pf.is_public && <a href={pf.share_url} target="_blank" rel="noreferrer" className="ms-btn-text" style={{ marginLeft: 'auto', textDecoration: 'none' }}><ExternalLink size={13} /> Open</a>}
        </div>

        <div className="ms-workgrid r-stack" style={{ gridTemplateColumns: 'minmax(0,1fr) 380px' }}>
          {/* MAIN — the work */}
          <div className="ms-workmain">
            <div className="ms-section-head">
              <h2 className="ms-h2">Your work <span style={{ fontSize: 13, color: 'var(--ms-ink-3)', fontWeight: 400 }}>· {items.length}</span></h2>
              <div style={{ display: 'flex', gap: 8 }}>
                <input ref={fileRef} type="file" multiple accept="image/*,video/*" onChange={onUpload} style={{ display: 'none' }} />
                <button onClick={() => fileRef.current?.click()} disabled={upload?.status === 'uploading'} className="ms-btn-ghost"><Upload size={14} /> {upload?.status === 'uploading' ? `Uploading ${upload.percent}%` : 'Upload'}</button>
                <button onClick={() => setPicker(true)} className="ms-btn-ink"><Plus size={15} /> Add from published</button>
              </div>
            </div>
            {upload && <UploadProgress job={upload} onCancel={() => { cancel(upload.id); setUploadId(null); }} onDismiss={() => setUploadId(null)} />}
            <p className="ms-note" style={{ marginTop: -6, marginBottom: 18 }}><Sparkles size={12} /> Published galleries auto-flow here{pf.auto_include ? '' : ' (off)'}. Drag to reorder · ★ to feature · only what you add is public.</p>

            {items.length === 0 ? (
              <div className="ms-empty-soft">Nothing in your portfolio yet. Add from your published work, or upload showcase pieces directly.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                {items.map((it, i) => (
                  <div key={it.id} draggable onDragStart={() => { dragFrom.current = i; }} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(i)}
                    className="ms-pf-tile" style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: 'var(--ms-surface-2)', aspectRatio: '4/5', border: it.featured ? '2px solid var(--ms-spark)' : '1px solid var(--ms-line)' }}>
                    <button onClick={() => setEditing(it.id)} aria-label={`Open ${it.title || it.filename || (it.kind === 'video' ? 'video' : 'photo')}`} style={{ all: 'unset', position: 'absolute', inset: 0, cursor: 'pointer' }}>
                      <PortfolioThumb item={it} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {it.kind === 'video' && <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 40, height: 40, borderRadius: 999, background: 'rgba(10,10,12,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Play size={17} color="#fff" fill="#fff" /></span>}
                    </button>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent 45%)', opacity: 0, transition: 'opacity .2s', pointerEvents: 'none' }} className="ms-pf-tile-veil" />
                    <div style={{ position: 'absolute', top: 6, left: 6, color: 'rgba(255,255,255,0.85)', cursor: 'grab', pointerEvents: 'none' }}><GripVertical size={16} /></div>
                    {(it.title || it.filename) && <span style={{ position: 'absolute', bottom: 40, left: 8, right: 8, fontSize: 11.5, fontWeight: 600, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'none' }}>{it.title || it.filename}</span>}
                    {it.kind === 'video' && <span style={{ position: 'absolute', top: 7, right: 7, pointerEvents: 'none', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: 5 }}>VIDEO</span>}
                    <div style={{ position: 'absolute', bottom: 6, left: 6, right: 6, display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditing(it.id)} title="Edit — thumbnail, name, position" aria-label="Edit" style={tileBtn}><Pencil size={13} color="#fff" /></button>
                      <button onClick={() => toggleFeatured(it)} title="Feature" style={tileBtn}><Star size={13} fill={it.featured ? '#e6b455' : 'none'} color={it.featured ? '#e6b455' : '#fff'} /></button>
                      <button onClick={() => makeCover(it)} title="Set as cover" style={tileBtn}><Crown size={13} color="#fff" /></button>
                      <button onClick={() => removeItem(it.id)} title="Remove" style={tileBtn}><Trash2 size={13} color="#fff" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ASIDE — design controls */}
          <aside className="ms-workaside">
            {/* theme */}
            <div className="ms-panel" style={{ marginBottom: 18 }}>
              <div className="ms-section-label" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}><Layout size={13} /> Theme</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {THEME_ORDER.map(t => {
                  const m = PORTFOLIO_THEME_META[t] || { label: t, note: '', swatch: ['#ddd', '#333', '#999'] };
                  const active = pf.theme === t;
                  return (
                    <button key={t} onClick={() => save({ theme: t })} style={{
                      textAlign: 'left', border: active ? '2px solid var(--ms-ink)' : '1px solid var(--ms-line)', borderRadius: 9, padding: 9, cursor: 'pointer', background: 'var(--ms-surface)',
                    }}>
                      <div style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
                        {m.swatch.map((c, idx) => <span key={idx} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: '1px solid rgba(0,0,0,0.08)' }} />)}
                      </div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ms-ink)' }}>{m.label}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--ms-ink-3)' }}>{m.note}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* identity */}
            <div className="ms-panel" style={{ marginBottom: 18 }}>
              <div className="ms-section-label" style={{ marginBottom: 12 }}>Identity</div>
              <label className="ms-label">Studio name</label>
              <input className="ms-input" value={pf.title || ''} onChange={e => setField('title', e.target.value)} onBlur={e => save({ title: e.target.value })} style={{ marginBottom: 14 }} placeholder="Your studio name" />
              <label className="ms-label">Tagline</label>
              <input className="ms-input" value={pf.tagline || ''} onChange={e => setField('tagline', e.target.value)} onBlur={e => save({ tagline: e.target.value })} style={{ marginBottom: 14 }} placeholder="Wedding & portrait photography" />
              <label className="ms-label">About</label>
              <textarea className="ms-input" rows={4} value={pf.bio || ''} onChange={e => setField('bio', e.target.value)} onBlur={e => save({ bio: e.target.value })} style={{ marginBottom: 14, resize: 'vertical' }} placeholder="A sentence or two about you and your work." />
              <label className="ms-label">Link handle</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, color: 'var(--ms-ink-3)' }}>/folio/</span>
                <input className="ms-input" value={pf.handle || ''} onChange={e => setField('handle', e.target.value)} onBlur={e => { if (handleState?.status !== 'taken') save({ handle: e.target.value }); }} style={{ flex: 1 }} placeholder="your-name" />
              </div>
              <div style={{ fontSize: 11, marginTop: 5, color: handleState?.status === 'taken' ? '#d4564a' : handleState?.status === 'free' ? '#2f9e6e' : 'var(--ms-ink-3)' }}>
                {handleState?.status === 'taken' ? 'That handle is taken' : handleState?.status === 'free' ? '✓ Available' : 'Letters, numbers and hyphens'}
              </div>
            </div>

            {/* contact */}
            <div className="ms-panel" style={{ marginBottom: 18 }}>
              <div className="ms-section-label" style={{ marginBottom: 12 }}>Contact &amp; social</div>
              {[['email', 'Email', 'you@studio.com'], ['phone', 'Phone', '+1…'], ['instagram', 'Instagram', '@handle'], ['website', 'Website', 'studio.com']].map(([k, lbl, ph]) => (
                <div key={k} style={{ marginBottom: 12 }}>
                  <label className="ms-label">{lbl}</label>
                  <input className="ms-input" value={s[k] || ''} onChange={e => setSetting(k, e.target.value)} onBlur={e => saveSetting(k, e.target.value)} placeholder={ph} />
                </div>
              ))}
            </div>

            {/* settings */}
            <div className="ms-panel">
              <div className="ms-section-label" style={{ marginBottom: 12 }}>Settings</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 12 }}>
                <input type="checkbox" checked={!!pf.auto_include} onChange={e => save({ auto_include: e.target.checked })} />
                <span style={{ fontSize: 13, color: 'var(--ms-ink)' }}>Auto-add my published galleries</span>
              </label>
              <label className="ms-label">Accent colour</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input aria-label="Accent colour" type="color" value={s.accent || '#b07d52'} onChange={e => setSetting('accent', e.target.value)} onBlur={e => saveSetting('accent', e.target.value)} style={{ width: 42, height: 32, border: '1px solid var(--ms-line)', borderRadius: 8, background: 'none', cursor: 'pointer' }} />
                <button onClick={() => saveSetting('accent', '')} className="ms-btn-text">Reset</button>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* full-screen WYSIWYG preview */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: '#000', overflowY: 'auto' }}>
          <button onClick={() => setPreview(false)} style={{ position: 'fixed', top: 16, right: 16, zIndex: 510, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.92)', color: '#111', fontWeight: 600, fontSize: 13 }}><X size={15} /> Exit preview</button>
          <PortfolioCanvas portfolio={pf} items={items} preview />
        </div>
      )}

      {editing && items.some(i => i.id === editing) && (
        <ItemEditor
          key={editing}
          item={items.find(i => i.id === editing)}
          index={items.findIndex(i => i.id === editing)}
          count={items.length}
          onClose={() => setEditing(null)}
          onPatch={patchItem}
          onMove={(to) => moveItem(items.findIndex(i => i.id === editing), to)}
          onItems={setItems}
          say={say}
        />
      )}
      {picker && <CandidatesPicker onClose={() => setPicker(false)} onAdded={(its) => { setItems(its); setPicker(false); }} />}
      {shareOpen && <ShareModal pf={pf} onClose={() => setShareOpen(false)} onCopy={copyLink} say={say} onPublic={() => save({ is_public: true })} />}

      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 600, padding: '9px 18px', borderRadius: 999, background: 'var(--ms-ink)', color: 'var(--ms-paper)', fontSize: 13 }}>{toast}</div>}
    </>
  );
}

function CandidatesPicker({ onClose, onAdded }) {
  const [cands, setCands] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  useEffect(() => { mediaAPI.portfolioCandidates().then(r => setCands(r.data.candidates || [])).catch(() => setCands([])); }, []);
  const toggle = (id) => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const add = async () => {
    if (sel.size === 0) return;
    setSaving(true);
    try { const r = await mediaAPI.addPortfolioItems({ asset_ids: Array.from(sel) }); onAdded(r.data.items || []); }
    catch { setSaving(false); }
  };
  const available = (cands || []).filter(c => !c.in_portfolio);
  return (
    <div {...clickable(onClose)} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal r-modal" style={{ maxWidth: 820, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2>Add from published work</h2>
          <button aria-label="Close" onClick={onClose} className="ms-iconbtn" style={{ border: 'none' }}><X size={18} /></button>
        </div>
        <p className="ms-modal-sub" style={{ marginBottom: 18 }}>Only photos &amp; videos from your published galleries — never raw shoots.</p>
        {cands == null ? <p className="ms-loading">Loading your published work…</p>
          : available.length === 0 ? <div className="ms-empty-soft">Nothing new to add. Publish a gallery first, then it shows up here.</div>
          : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, maxHeight: '52vh', overflowY: 'auto', marginBottom: 18 }}>
                {available.map(c => {
                  const on = sel.has(c.asset_id);
                  return (
                    <button key={c.asset_id} onClick={() => toggle(c.asset_id)} style={{ position: 'relative', aspectRatio: 1, borderRadius: 8, overflow: 'hidden', border: on ? '2px solid var(--ms-accent)' : '1px solid var(--ms-line)', padding: 0, cursor: 'pointer', background: 'var(--ms-surface-2)' }}>
                      {c.thumb_url ? <img src={mediaUrl(c.thumb_url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                      {on && <span style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 999, background: 'var(--ms-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={12} color="var(--ms-on-accent)" /></span>}
                      {c.kind === 'video' && <span style={{ position: 'absolute', bottom: 5, left: 5, fontSize: 8, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.6)', padding: '1px 5px', borderRadius: 4 }}>VIDEO</span>}
                    </button>
                  );
                })}
              </div>
              <button onClick={add} disabled={sel.size === 0 || saving} className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center' }}>{saving ? 'Adding…' : `Add ${sel.size || ''} to portfolio`}</button>
            </>
          )}
      </div>
    </div>
  );
}

function ShareModal({ pf, onClose, onCopy, say, onPublic }) {
  const [leads, setLeads] = useState([]);
  const [q, setQ] = useState('');
  const [sending, setSending] = useState(null);
  useEffect(() => { leadsAPI.getAll(null).then(r => setLeads(r.data.leads || [])).catch(() => {}); }, []);
  const filtered = q ? leads.filter(l => (l.customer_name || '').toLowerCase().includes(q.toLowerCase())) : leads.slice(0, 10);
  const send = async (lead) => {
    if (!pf.is_public) { say('Make it public first'); return; }
    setSending(lead.id);
    try { const r = await mediaAPI.sharePortfolio(lead.id); say(r.data.delivery?.whatsapp === 'sent' ? `Sent to ${lead.customer_name} on WhatsApp ✓` : r.data.delivery?.whatsapp === 'no_phone' ? 'No phone on file — copy the link instead' : 'WhatsApp not connected — copy the link'); }
    catch (e) { say(e.response?.data?.error || 'Send failed'); }
    setSending(null);
  };
  return (
    <div {...clickable(onClose)} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal r-modal" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2>Share portfolio</h2>
          <button aria-label="Close" onClick={onClose} className="ms-iconbtn" style={{ border: 'none' }}><X size={18} /></button>
        </div>
        {!pf.is_public && (
          <div className="ms-banner" style={{ marginBottom: 16 }}>
            <span style={{ fontSize: 13, flex: 1, color: 'var(--ms-ink-2)' }}>Your portfolio is private.</span>
            <button onClick={onPublic} className="ms-btn-text" style={{ color: 'var(--ms-spark)' }}>Make public</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input readOnly value={pf.share_url || ''} className="ms-input" style={{ flex: 1, fontSize: 12.5 }} />
          <button onClick={onCopy} className="ms-btn-ink"><Copy size={14} /> Copy</button>
        </div>
        <label className="ms-label">Send to a client over WhatsApp</label>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ms-ink-3)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…" className="ms-input" style={{ paddingLeft: 34 }} />
        </div>
        <div style={{ maxHeight: 220, overflowY: 'auto' }}>
          {filtered.map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderRadius: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--ms-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: 'var(--ms-ink-2)' }}>{(l.customer_name || '?')[0]?.toUpperCase()}</div>
              <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ms-ink)' }}>{l.customer_name || 'Unnamed'}</span>
              <button onClick={() => send(l)} disabled={sending === l.id} className="ms-btn-ghost" style={{ padding: '6px 12px' }}>{sending === l.id ? '…' : <><Send size={12} /> Send</>}</button>
            </div>
          ))}
          {filtered.length === 0 && <p style={{ fontSize: 13, color: 'var(--ms-ink-3)', padding: '6px' }}>No matching clients.</p>}
        </div>
      </div>
    </div>
  );
}

function UploadProgress({ job, onCancel, onDismiss }) {
  const failed = job.status === 'error';
  const done = job.status === 'done';
  const pct = done ? 100 : job.percent || 0;
  return (
    <div role="status" aria-live="polite" className="ms-panel" style={{ padding: '10px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--ms-ink-2)', marginBottom: 7 }}>
        {!done && !failed && <Loader size={13} className="ms-spin" />}
        {done && <Check size={13} color="#2f9e6e" />}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {failed ? `Upload failed — ${job.error}` : done ? `${job.label} uploaded` : `Uploading ${job.label} · ${pct}%`}
          {!done && !failed && job.bytes ? ` · ${fmtBytes(job.loaded)} of ${fmtBytes(job.bytes)}` : ''}
          {!done && !failed && job.etaSec ? ` · ${fmtEta(job.etaSec)}` : ''}
        </span>
        {!done && !failed
          ? <button onClick={onCancel} className="ms-btn-text">Cancel</button>
          : <button onClick={onDismiss} aria-label="Dismiss" className="ms-iconbtn" style={{ border: 'none', padding: 2 }}><X size={14} /></button>}
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} style={{ height: 6, borderRadius: 999, background: 'var(--ms-surface-2)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: failed ? '#d4564a' : 'var(--ms-spark)', transition: 'width .25s ease' }} />
      </div>
    </div>
  );
}

// Grab one frame of a video as a JPEG. Uses its own CORS-mode <video> so the
// visible player never depends on the media host sending CORS headers; only the
// capture does (a tainted canvas can't be exported).
function grabVideoFrame(src, time) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'auto';
    const fail = (e) => { v.removeAttribute('src'); v.load(); reject(e || new Error('Could not read the video')); };
    v.onerror = () => fail();
    v.onloadedmetadata = () => { v.currentTime = Math.min(Math.max(0, time || 0), Math.max(0, (v.duration || 0) - 0.05)); };
    v.onseeked = () => {
      try {
        const scale = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
        c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
        c.toBlob((b) => { v.removeAttribute('src'); v.load(); if (b) resolve(b); else reject(new Error('Could not capture the frame')); }, 'image/jpeg', 0.88);
      } catch (e) { fail(e); }
    };
    v.src = src;
  });
}

// Open one portfolio piece: play it, pick its thumbnail, rename it, move it, frame it.
function ItemEditor({ item, index, count, onClose, onPatch, onMove, onItems, say }) {
  const videoRef = useRef(null);
  const posterFileRef = useRef(null);
  const [title, setTitle] = useState(item.title || '');
  const [caption, setCaption] = useState(item.caption || '');
  const [busy, setBusy] = useState(false);
  const isVideo = item.kind === 'video';
  const src = mediaUrl(isVideo ? (item.video_url || item.full_url || item.url) : (item.full_url || item.url));
  const [fx, fy] = (item.focus || '50% 50%').split(' ').map(n => parseFloat(n));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sendPoster = async (blob, name) => {
    setBusy(true);
    try {
      const fd = new FormData(); fd.append('file', blob, name);
      const r = await mediaAPI.setPortfolioPoster(item.id, fd);
      if (r.data.items) onItems(r.data.items);
      say('Thumbnail updated');
    } catch (e) { say(e.response?.data?.error || 'Could not save the thumbnail'); }
    setBusy(false);
  };
  const useCurrentFrame = async () => {
    const t = videoRef.current?.currentTime || 0;
    videoRef.current?.pause();
    setBusy(true);
    try { await sendPoster(await grabVideoFrame(src, t), 'poster.jpg'); }
    catch { setBusy(false); say('This video can’t be captured here — upload an image instead'); }
  };
  const onPosterFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) sendPoster(f, f.name);
  };
  const setFocus = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
    const y = Math.round(Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)));
    onPatch(item, { focus: `${x}% ${y}%` });
  };
  const commit = (k, v) => { if ((item[k] || '') !== v) onPatch(item, { [k]: v }); };

  return (
    <div {...clickable(onClose)} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal r-modal" style={{ maxWidth: 920, width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
          <h2 style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || item.filename || (isVideo ? 'Video' : 'Photo')}</h2>
          <button aria-label="Close" onClick={onClose} className="ms-iconbtn" style={{ border: 'none' }}><X size={18} /></button>
        </div>
        <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 20 }}>
          <div>
            <div style={{ background: '#000', borderRadius: 10, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', maxHeight: '60vh' }}>
              {isVideo
                ? <video ref={videoRef} key={src} src={src} poster={item.poster_url ? mediaUrl(item.poster_url) : undefined} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: '60vh', display: 'block' }} />
                : <img src={src} alt={item.title || ''} style={{ maxWidth: '100%', maxHeight: '60vh', display: 'block' }} />}
            </div>
            {isVideo && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button onClick={useCurrentFrame} disabled={busy} className="ms-btn-ink"><ImageIcon size={14} /> {busy ? 'Saving…' : 'Use this frame as thumbnail'}</button>
                <input ref={posterFileRef} type="file" accept="image/*" onChange={onPosterFile} style={{ display: 'none' }} />
                <button onClick={() => posterFileRef.current?.click()} disabled={busy} className="ms-btn-ghost"><Upload size={14} /> Upload thumbnail</button>
              </div>
            )}
            {isVideo && <p className="ms-note" style={{ marginTop: 8 }}>Pause on the moment you want, then use that frame.</p>}
          </div>

          <div>
            <label className="ms-label" htmlFor="pf-item-title">Name</label>
            <input id="pf-item-title" className="ms-input" value={title} maxLength={120} placeholder={item.filename || 'Untitled'}
              onChange={e => setTitle(e.target.value)} onBlur={() => commit('title', title.trim())}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ marginBottom: 14 }} />
            <label className="ms-label" htmlFor="pf-item-caption">Caption</label>
            <input id="pf-item-caption" className="ms-input" value={caption} maxLength={300} placeholder="Optional"
              onChange={e => setCaption(e.target.value)} onBlur={() => commit('caption', caption.trim())}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} style={{ marginBottom: 16 }} />

            <label className="ms-label">Position</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <button onClick={() => onMove(index - 1)} disabled={index <= 0} aria-label="Move earlier" className="ms-btn-ghost" style={{ padding: '6px 9px' }}><ChevronLeft size={15} /></button>
              <select aria-label="Position in portfolio" className="ms-input" value={index} onChange={e => onMove(Number(e.target.value))} style={{ flex: 1 }}>
                {Array.from({ length: count }, (_, i) => <option key={i} value={i}>{i === 0 ? '1 · first' : i === count - 1 ? `${i + 1} · last` : i + 1} of {count}</option>)}
              </select>
              <button onClick={() => onMove(index + 1)} disabled={index >= count - 1} aria-label="Move later" className="ms-btn-ghost" style={{ padding: '6px 9px' }}><ChevronRight size={15} /></button>
            </div>

            <label className="ms-label">Framing</label>
            <p className="ms-note" style={{ marginBottom: 8 }}>Click the part of the thumbnail that should stay in view when it&rsquo;s cropped.</p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <button onClick={setFocus} aria-label="Set framing point" style={{ all: 'unset', position: 'relative', width: 120, aspectRatio: '4/5', borderRadius: 8, overflow: 'hidden', background: 'var(--ms-surface-2)', cursor: 'crosshair', border: '1px solid var(--ms-line)' }}>
                <PortfolioThumb item={item} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
                <span aria-hidden style={{ position: 'absolute', left: `${fx}%`, top: `${fy}%`, width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: 999, border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.5)', pointerEvents: 'none' }} />
              </button>
              {item.focus && <button onClick={() => onPatch(item, { focus: '' })} className="ms-btn-text">Reset</button>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const tileBtn = { width: 28, height: 28, borderRadius: 7, border: 'none', cursor: 'pointer', background: 'rgba(10,10,12,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
