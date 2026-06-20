'use client';
/* eslint-disable @next/next/no-img-element -- client gallery shows dynamic /uploads photos; next/image isn't configured for them */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Heart, Download, Lock, MessageSquare, X, Loader, Check, ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react';
import { BASE_URL } from '../../../lib/api';

const imgUrl = (p) => (!p ? '' : /^https?:\/\//.test(p) ? p : `${BASE_URL}${p}`);

export default function ClientGalleryPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsPw, setNeedsPw] = useState(false);
  const [pw, setPw] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [contact, setContact] = useState('');
  const [faved, setFaved] = useState(() => new Set());
  const [counts, setCounts] = useState({});
  const [lightbox, setLightbox] = useState(null); // index into assets | null
  const [playing, setPlaying] = useState(false);
  const [commentFor, setCommentFor] = useState(null);
  const [favOnly, setFavOnly] = useState(false);

  // client slideshow — auto-advance every 3.5s while the lightbox is open
  useEffect(() => {
    if (lightbox == null || !playing) return;
    const all = data?.assets || [];
    const n = (favOnly ? all.filter(a => faved.has(a.asset_id)) : all).length;
    if (n <= 1) return;
    const t = setInterval(() => setLightbox(i => (i + 1) % n), 3500);
    return () => clearInterval(t);
  }, [lightbox, playing, data, favOnly, faved]);
  const [dl, setDl] = useState(null); // { status, url }
  const [proof, setProof] = useState(null);          // active selection set
  const [sel, setSel] = useState(() => new Set());   // selected asset ids
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try { setContact(localStorage.getItem('wf_gallery_contact') || ''); } catch {}
  }, []);

  const load = useCallback(async (password) => {
    setLoading(true);
    try {
      const url = `${BASE_URL}/api/media/portal/${token}${password ? `?pw=${encodeURIComponent(password)}` : ''}`;
      const res = await fetch(url);
      if (res.status === 404) { setNotFound(true); setLoading(false); return; }
      if (res.status === 401) { setNeedsPw(true); setLoading(false); return; }
      const json = await res.json();
      setData(json); setNeedsPw(false);
      const c = {}; (json.assets || []).forEach(a => { c[a.asset_id] = a.favorites || 0; });
      setCounts(c);
      if (json.proofing) { setProof(json.proofing); setSel(new Set(json.proofing.selected_asset_ids || [])); }
      else { setProof(null); setSel(new Set()); }
    } catch { setNotFound(true); }
    setLoading(false);
  }, [token]);

  useEffect(() => { load(''); }, [load]);

  const saveContact = (v) => { setContact(v); try { localStorage.setItem('wf_gallery_contact', v); } catch {} };

  const toggleFav = async (assetId) => {
    try {
      const res = await fetch(`${BASE_URL}/api/media/portal/${token}/favorite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId, contact: contact || 'guest', pw }),
      });
      const json = await res.json();
      setCounts(c => ({ ...c, [assetId]: json.favorites }));
      setFaved(s => { const n = new Set(s); json.favorited ? n.add(assetId) : n.delete(assetId); return n; });
    } catch {}
  };

  const [savedColl, setSavedColl] = useState(false);
  const saveCollection = async () => {
    const name = window.prompt('Name this selection (e.g. "For the album", "Parents\' favourites")'); if (!name) return;
    try { const r = await fetch(`${BASE_URL}/api/media/portal/${token}/collection`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, contact: contact || 'guest', asset_ids: [...faved], pw }) }); if (r.ok) { setSavedColl(true); setTimeout(() => setSavedColl(false), 2500); } } catch {}
  };

  const sendComment = async (assetId, body) => {
    if (!body.trim()) return;
    try {
      await fetch(`${BASE_URL}/api/media/portal/${token}/comment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId, contact: contact || 'guest', body, pw }),
      });
      setCommentFor(null);
    } catch {}
  };

  const downloadAll = async () => {
    setDl({ status: 'pending' });
    try {
      const res = await fetch(`${BASE_URL}/api/media/portal/${token}/export`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pw }),
      });
      if (!res.ok) { setDl({ status: 'error' }); return; }
      const { export_id } = await res.json();
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const s = await fetch(`${BASE_URL}/api/media/portal/${token}/export/${export_id}`).then(r => r.json()).catch(() => ({}));
        if (s.status === 'ready') { clearInterval(poll); const u = imgUrl(s.download_url); setDl({ status: 'ready', url: u }); window.location.href = u; }
        else if (s.status === 'failed' || tries > 40) { clearInterval(poll); setDl({ status: 'error' }); }
      }, 2000);
    } catch { setDl({ status: 'error' }); }
  };

  const selectable = proof && ['open', 'revision'].includes(proof.status);
  const toggleSelect = async (assetId) => {
    if (!selectable) return;
    const want = !sel.has(assetId);
    setSel(s => { const n = new Set(s); want ? n.add(assetId) : n.delete(assetId); return n; });
    try {
      await fetch(`${BASE_URL}/api/media/portal/${token}/proofing/${proof.id}/select`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_id: assetId, selected: want, contact: contact || 'guest', pw }),
      });
    } catch {}
  };
  const submitSelections = async () => {
    if (sel.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/media/portal/${token}/proofing/${proof.id}/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pw }),
      });
      if (res.ok) setProof(p => ({ ...p, status: 'submitted' }));
    } catch {}
    setSubmitting(false);
  };

  // ── states ──
  if (loading) return <Centered><Loader size={26} className="gspin" /></Centered>;
  if (notFound) return <Centered><p style={{ color: '#aaa' }}>This gallery isn’t available.</p></Centered>;

  if (needsPw) {
    return (
      <Centered>
        <div style={{ textAlign: 'center', maxWidth: 320, width: '100%' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 18px', background: '#c2a878', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Lock size={24} color="#14120f" /></div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Private gallery</h1>
          <p style={{ fontSize: 13.5, color: '#9aa0aa', margin: '0 0 20px' }}>Enter the password your photographer shared.</p>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(pw)} placeholder="Password"
            style={{ width: '100%', padding: '12px 14px', borderRadius: 11, border: '1px solid #2a2a33', background: '#15151b', color: '#fff', fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} autoFocus />
          <button onClick={() => load(pw)} style={{ width: '100%', padding: 12, borderRadius: 11, border: 'none', cursor: 'pointer', background: '#c2a878', color: '#14120f', fontWeight: 700, fontSize: 14 }}>View gallery</button>
        </div>
      </Centered>
    );
  }

  const assets = data?.assets || [];
  const shown = favOnly ? assets.filter(a => faved.has(a.asset_id)) : assets;
  // Story sections: group photos by folder/chapter (only in the full view, when the photographer organised them)
  const useSections = !favOnly && Array.isArray(data?.sections) && data.sections.length > 1;
  const sectionGroups = (() => {
    const all = shown.map((a, i) => ({ a, i }));
    if (!useSections) return [{ name: null, items: all }];
    const sectionIds = new Set(data.sections.map(s => s.id));
    const groups = data.sections
      .map(s => ({ name: s.name, items: all.filter(x => (x.a.folder_id || null) === s.id) }))
      .filter(g => g.items.length);
    // Safety net: never drop a photo whose folder isn't a known section (e.g. a
    // deleted folder leaves an orphaned folder_id). Collect any leftovers.
    const leftovers = all.filter(x => !sectionIds.has(x.a.folder_id || null));
    if (leftovers.length) {
      const more = groups.find(g => g.name === 'More photos');
      if (more) leftovers.forEach(l => { if (!more.items.includes(l)) more.items.push(l); });
      else groups.push({ name: 'More photos', items: leftovers });
    }
    return groups;
  })();
  return (
    <div style={{ minHeight: '100vh', background: '#0b0b0f', color: '#fff' }}>
      {/* header */}
      <header style={{ padding: '46px 24px 30px', textAlign: 'center', borderBottom: '1px solid #1a1a22' }}>
        <p style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#c2a878', margin: '0 0 12px', fontWeight: 600 }}>Your Gallery</p>
        <h1 className="ghero" style={{ fontSize: 'clamp(32px, 5.5vw, 60px)', fontWeight: 400, margin: 0, letterSpacing: '-0.02em', lineHeight: 1.04 }}>{data?.title}</h1>
        <p style={{ fontSize: 13, color: '#71717a', margin: '12px 0 0' }}>{assets.length} photos · tap the heart to mark your favourites</p>
        {faved.size > 0 && (
          <div style={{ marginTop: 14, display: 'inline-flex', gap: 2, padding: 3, borderRadius: 999, background: '#15151b', border: '1px solid #2a2a33' }}>
            <button onClick={() => { setFavOnly(false); setLightbox(null); }} style={{ padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', background: favOnly ? 'transparent' : '#c2a878', color: favOnly ? '#9aa0aa' : '#14120f', fontSize: 12.5, fontWeight: 700 }}>All {assets.length}</button>
            <button onClick={() => { setFavOnly(true); setLightbox(null); }} style={{ padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', background: favOnly ? '#c2a878' : 'transparent', color: favOnly ? '#14120f' : '#9aa0aa', fontSize: 12.5, fontWeight: 700 }}>♥ My favourites {faved.size}</button>
          </div>
        )}
        {faved.size > 0 && (
          <div style={{ marginTop: 10 }}>
            <button onClick={saveCollection} style={{ padding: '7px 16px', borderRadius: 999, border: '1px solid #2a2a33', background: savedColl ? '#16a34a' : '#15151b', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{savedColl ? '✓ Saved — your photographer can see it' : '+ Save selection as a collection'}</button>
          </div>
        )}
        <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
          <input value={contact} onChange={e => saveContact(e.target.value)} placeholder="Your name (optional)"
            style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid #2a2a33', background: '#15151b', color: '#fff', fontSize: 12.5, outline: 'none', width: 200 }} />
          {data?.download_policy !== 'none' && (
            <button onClick={downloadAll} disabled={dl?.status === 'pending'} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, border: 'none', cursor: dl?.status === 'pending' ? 'wait' : 'pointer', background: '#c2a878', color: '#14120f', fontWeight: 700, fontSize: 13 }}>
              <Download size={15} /> {dl?.status === 'pending' ? 'Preparing ZIP…' : dl?.status === 'ready' ? 'Download ready ✓' : dl?.status === 'error' ? 'Try again' : 'Download all'}
            </button>
          )}
          {data?.store_enabled && (
            <a href={`/shop/${token}`} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 10, border: '1px solid #2a2a33', background: '#15151b', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>🛍️ Order prints</a>
          )}
        </div>
      </header>

      {/* proofing / selection banner */}
      {proof && (
        <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#13131a', borderBottom: '1px solid #2a2a33', padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: '#fff' }}>{proof.title || 'Select your favourites'}</span>
          {proof.instructions && <span style={{ fontSize: 12, color: '#9aa0aa' }}>{proof.instructions}</span>}
          {selectable ? (
            <>
              <span style={{ fontSize: 13, fontWeight: 800, color: (proof.quota && sel.size > proof.quota) ? '#f59e0b' : '#a5b4fc' }}>{sel.size}{proof.quota ? `/${proof.quota}` : ''} selected</span>
              {proof.status === 'revision' && <span style={{ fontSize: 11.5, color: '#f59e0b' }}>Changes requested — update your picks</span>}
              <button onClick={submitSelections} disabled={sel.size === 0 || submitting} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', cursor: sel.size === 0 ? 'not-allowed' : 'pointer', background: sel.size === 0 ? '#2a2a33' : '#c2a878', color: sel.size === 0 ? '#7a7a85' : '#14120f', fontWeight: 700, fontSize: 12.5, opacity: sel.size === 0 ? 0.7 : 1 }}>
                {submitting ? 'Submitting…' : 'Submit selections'}
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12.5, color: '#10b981', fontWeight: 700 }}>✓ Selections submitted — your photographer will be in touch</span>
          )}
        </div>
      )}

      {/* masonry grid — grouped into story sections when the photographer organised the gallery */}
      <main style={{ padding: 16 }}>
        {shown.length === 0 && <p style={{ textAlign: 'center', color: '#71717a', fontSize: 13, padding: 24 }}>No favourites yet — tap the heart on the photos you love.</p>}
        {sectionGroups.map((g, gi) => (
          <section key={g.name || `sec-${gi}`} style={{ marginBottom: g.name ? 28 : 0 }}>
            {g.name && (
              <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#c2a878', margin: '8px 4px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                {g.name}<span style={{ flex: 1, height: 1, background: 'rgba(194,168,120,0.25)' }} /><span style={{ fontSize: 11, color: '#71717a', letterSpacing: 0 }}>{g.items.length}</span>
              </h2>
            )}
            <div style={{ columnGap: 10, columnWidth: 280 }}>
              {g.items.map(({ a, i }) => (
                <figure key={a.asset_id} style={{ margin: '0 0 10px', breakInside: 'avoid', position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#15151b' }}>
                  <img src={imgUrl(a.web_url)} alt={a.filename} loading="lazy" onClick={() => setLightbox(i)} style={{ width: '100%', display: 'block', cursor: 'zoom-in' }} />
                  {selectable && (
                    <button onClick={(e) => { e.stopPropagation(); toggleSelect(a.asset_id); }} title="Select for your order"
                      style={{ position: 'absolute', top: 10, left: 10, zIndex: 2, width: 30, height: 30, borderRadius: '50%', border: '2px solid #fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: sel.has(a.asset_id) ? '#10b981' : 'rgba(0,0,0,0.45)' }}>
                      {sel.has(a.asset_id) && <Check size={16} color="#fff" />}
                    </button>
                  )}
                  <figcaption style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: 10, background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent 45%)', opacity: 0, transition: 'opacity 0.18s' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <IconCircle onClick={(e) => { e.stopPropagation(); toggleFav(a.asset_id); }} active={faved.has(a.asset_id)}>
                        <Heart size={16} fill={faved.has(a.asset_id) ? '#c2a878' : 'none'} color={faved.has(a.asset_id) ? '#c2a878' : '#fff'} />
                        {counts[a.asset_id] > 0 && <span style={{ fontSize: 11, fontWeight: 700 }}>{counts[a.asset_id]}</span>}
                      </IconCircle>
                      <IconCircle onClick={(e) => { e.stopPropagation(); setCommentFor(a.asset_id); }}><MessageSquare size={15} color="#fff" /></IconCircle>
                    </div>
                    {a.download_url && (
                      <a href={imgUrl(a.download_url)} download onClick={e => e.stopPropagation()} style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                        <Download size={15} color="#fff" />
                      </a>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer style={{ textAlign: 'center', padding: '30px 20px 50px', color: '#52525b', fontSize: 12 }}>Delivered with WappFlow Media Studio</footer>

      {/* floating slideshow launcher */}
      {shown.length > 1 && lightbox == null && (
        <button onClick={() => { setLightbox(0); setPlaying(true); }} title="Play slideshow"
          style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 290, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', background: '#c2a878', color: '#14120f', fontWeight: 800, fontSize: 13, boxShadow: '0 12px 32px rgba(0,0,0,0.4)' }}>
          <Play size={16} /> Slideshow
        </button>
      )}

      {/* lightbox + slideshow */}
      {lightbox != null && shown[lightbox] && (
        <div onClick={() => { setLightbox(null); setPlaying(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <button onClick={(e) => { e.stopPropagation(); setLightbox(null); setPlaying(false); }} style={{ position: 'absolute', top: 18, right: 18, background: 'none', border: 'none', cursor: 'pointer', color: '#fff' }}><X size={26} /></button>
          <button onClick={(e) => { e.stopPropagation(); setLightbox(i => (i - 1 + shown.length) % shown.length); }} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.12)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={26} /></button>
          <img src={imgUrl(shown[lightbox].web_url)} alt={shown[lightbox].filename} onClick={e => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 8 }} />
          <button onClick={(e) => { e.stopPropagation(); setLightbox(i => (i + 1) % shown.length); }} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.12)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={26} /></button>
          {/* Lightbox controls — these are the favourite/comment/download path on touch
              devices, where the grid's hover-revealed figcaption isn't reachable. */}
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', maxWidth: '94vw', flexWrap: 'wrap', justifyContent: 'center' }}>
            <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12 }}>{lightbox + 1} / {shown.length}</span>
            <button onClick={() => toggleFav(shown[lightbox].asset_id)} title="Favourite" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999, border: 'none', cursor: 'pointer', background: faved.has(shown[lightbox].asset_id) ? 'rgba(194,168,120,0.22)' : 'rgba(255,255,255,0.14)', color: '#fff', fontSize: 12.5, fontWeight: 700 }}>
              <Heart size={15} fill={faved.has(shown[lightbox].asset_id) ? '#c2a878' : 'none'} color={faved.has(shown[lightbox].asset_id) ? '#c2a878' : '#fff'} />
              {counts[shown[lightbox].asset_id] > 0 && counts[shown[lightbox].asset_id]}
            </button>
            <button onClick={() => setCommentFor(shown[lightbox].asset_id)} title="Comment" style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 11px', borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.14)', color: '#fff' }}><MessageSquare size={15} /></button>
            {shown[lightbox].download_url && <a href={imgUrl(shown[lightbox].download_url)} download onClick={e => e.stopPropagation()} title="Download" style={{ display: 'inline-flex', alignItems: 'center', padding: '7px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', color: '#fff', textDecoration: 'none' }}><Download size={15} /></a>}
            <button onClick={() => setPlaying(p => !p)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', background: playing ? '#fff' : 'rgba(255,255,255,0.14)', color: playing ? '#14120f' : '#fff', fontSize: 12.5, fontWeight: 700 }}>{playing ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Slideshow</>}</button>
          </div>
        </div>
      )}

      {/* comment modal */}
      {commentFor && <CommentModal onClose={() => setCommentFor(null)} onSend={(b) => sendComment(commentFor, b)} />}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400&display=swap');.gspin{animation:gspin 1s linear infinite;color:#c2a878}@keyframes gspin{to{transform:rotate(360deg)}}.ghero{font-family:'Fraunces',Georgia,serif}`}</style>
    </div>
  );
}

function IconCircle({ children, onClick, active }) {
  return (
    <button onClick={onClick} style={{ minWidth: 34, height: 34, padding: '0 9px', borderRadius: 17, border: 'none', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 5, color: '#fff',
      background: active ? 'rgba(236,72,153,0.18)' : 'rgba(0,0,0,0.5)' }}>{children}</button>
  );
}

function CommentModal({ onClose, onSend }) {
  const [body, setBody] = useState('');
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ background: '#15151b', border: '1px solid #2a2a33', borderRadius: 16, padding: 22, maxWidth: 380, width: '100%' }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: '0 0 12px' }}>Leave a note</h3>
        <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Tell your photographer what you think…" rows={3}
          style={{ width: '100%', padding: 12, borderRadius: 10, border: '1px solid #2a2a33', background: '#0b0b0f', color: '#fff', fontSize: 13.5, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 14 }} autoFocus />
        <button onClick={() => onSend(body)} style={{ width: '100%', padding: 11, borderRadius: 10, border: 'none', cursor: 'pointer', background: '#c2a878', color: '#14120f', fontWeight: 700, fontSize: 13.5 }}>Send</button>
      </div>
    </div>
  );
}

function Centered({ children }) {
  return <div style={{ minHeight: '100vh', background: '#0b0b0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>{children}</div>;
}
