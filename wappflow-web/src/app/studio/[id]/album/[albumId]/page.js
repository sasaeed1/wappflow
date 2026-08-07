'use client';
/* eslint-disable @next/next/no-img-element -- album thumbs are dynamic /uploads URLs */

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Check, ChevronUp, ChevronDown, Plus, X } from 'lucide-react';
import { mediaAPI, studioAiAPI, mediaUrl } from '../../../../../lib/api';

export default function AlbumEditorPage() {
  const router = useRouter();
  const { id, albumId } = useParams();
  const [album, setAlbum] = useState(null);
  const [spreads, setSpreads] = useState([]);
  const [title, setTitle] = useState('');
  const [byId, setById] = useState({});
  const [sel, setSel] = useState(0);
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
    (async () => {
      try {
        const [al, as] = await Promise.all([studioAiAPI.getAlbum(albumId), mediaAPI.listAssets(id, { limit: 500 })]);
        const m = {}; (as.data.assets || []).forEach(a => { m[a.id] = a; }); setById(m);
        setAlbum(al.data.album); setTitle(al.data.album.title || 'Album'); setSpreads((al.data.album.spec && al.data.album.spec.spreads) || []);
      } catch { router.push(`/studio/${id}`); }
    })();
  }, [id, albumId]);

  const usedIds = useMemo(() => new Set(spreads.flatMap(s => s.asset_ids || [])), [spreads]);
  const tray = useMemo(() => Object.values(byId).filter(a => a.type === 'photo' && !usedIds.has(a.id)), [byId, usedIds]);

  const mark = (next) => { setSpreads(next); setSaved(false); };
  const moveSpread = (i, dir) => { const n = [...spreads]; const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; mark(n); setSel(j); };
  const removePhoto = (si, aid) => mark(spreads.map((s, i) => i === si ? { ...s, asset_ids: s.asset_ids.filter(x => x !== aid), layout: `grid-${s.asset_ids.length - 1}` } : s));
  const addPhoto = (aid) => { if (!spreads.length) { mark([{ layout: 'grid-1', asset_ids: [aid] }]); setSel(0); return; } mark(spreads.map((s, i) => i === sel ? { ...s, asset_ids: [...s.asset_ids, aid].slice(0, 6), layout: `grid-${Math.min(6, s.asset_ids.length + 1)}` } : s)); };
  const addSpread = () => { const n = [...spreads, { layout: 'grid-0', asset_ids: [] }]; mark(n); setSel(n.length - 1); };
  const removeSpread = (i) => { mark(spreads.filter((_, j) => j !== i)); setSel(0); };

  const save = async () => {
    setSaving(true);
    try { await studioAiAPI.updateAlbum(albumId, { title, spec: { ...(album.spec || {}), spreads } }); setSaved(true); } catch {} finally { setSaving(false); }
  };

  if (!album) return <><div className="ms-page"><p className="ms-loading">Loading…</p></div></>;

  return (
    <>
      <div className="ms-page" style={{ maxWidth: 1000 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <button onClick={() => router.push(`/studio/${id}`)} className="ms-btn-ghost" style={{ padding: '7px 12px' }}><ArrowLeft size={14} /> Shoot</button>
          <input value={title} onChange={e => { setTitle(e.target.value); setSaved(false); }} className="ms-input" style={{ flex: 1, minWidth: 200, maxWidth: 400, fontWeight: 700 }} />
          <span style={{ fontSize: 12.5, color: 'var(--ms-ink-3)' }}>{spreads.length} spreads · {usedIds.size} photos · {album.page_count || spreads.length * 2}pp</span>
          <button onClick={save} disabled={saving || saved} className="ms-btn-ink" style={{ padding: '8px 16px' }}>{saving ? 'Saving…' : saved ? <><Check size={14} /> Saved</> : 'Save album'}</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {spreads.map((s, i) => (
            <div key={i} onClick={() => setSel(i)} style={{ border: `1.5px solid ${sel === i ? 'var(--ms-ink)' : 'var(--ms-line)'}`, borderRadius: 14, padding: 14, background: 'var(--ms-surface)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ms-ink-3)', letterSpacing: '0.06em' }}>SPREAD {i + 1}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ms-ink-3)' }}>{s.asset_ids.length} photos</span>
                <div style={{ flex: 1 }} />
                <button onClick={e => { e.stopPropagation(); moveSpread(i, -1); }} className="ms-iconbtn" style={{ width: 28, height: 28 }}><ChevronUp size={14} /></button>
                <button onClick={e => { e.stopPropagation(); moveSpread(i, 1); }} className="ms-iconbtn" style={{ width: 28, height: 28 }}><ChevronDown size={14} /></button>
                <button onClick={e => { e.stopPropagation(); removeSpread(i); }} className="ms-iconbtn" style={{ width: 28, height: 28, color: '#d4564a' }}><X size={14} /></button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Math.min(s.asset_ids.length || 1, 4))}, 1fr)`, gap: 8 }}>
                {s.asset_ids.map(aid => {
                  const a = byId[aid];
                  return (
                    <div key={aid} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 8, overflow: 'hidden', background: 'var(--ms-line)' }}>
                      {a && a.thumb_url ? <img src={mediaUrl(a.thumb_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                      <button onClick={e => { e.stopPropagation(); removePhoto(i, aid); }} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 999, border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff', cursor: 'pointer', fontSize: 12 }}>×</button>
                    </div>
                  );
                })}
                {s.asset_ids.length === 0 && <div style={{ gridColumn: '1 / -1', padding: 18, textAlign: 'center', fontSize: 12.5, color: 'var(--ms-ink-3)' }}>Empty — click a photo below to add it here.</div>}
              </div>
            </div>
          ))}
          <button onClick={addSpread} className="ms-btn-ghost" style={{ alignSelf: 'flex-start', padding: '8px 14px' }}><Plus size={14} /> Add spread</button>
        </div>

        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ms-ink-3)', marginBottom: 10 }}>Photo tray — click to add to spread {sel + 1} ({tray.length} unused)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}>
            {tray.map(a => (
              <button key={a.id} onClick={() => addPhoto(a.id)} style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--ms-line)', padding: 0, cursor: 'pointer', background: 'var(--ms-surface)' }} title="Add to selected spread">
                {a.thumb_url ? <img src={mediaUrl(a.thumb_url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
