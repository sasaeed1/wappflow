'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, BookOpen, X, FileText } from 'lucide-react';
import { mediaAPI } from '../../../../lib/api';
import { clickable } from '@/lib/a11y';

const SIZES = [
  { label: '30×30 cm square', spec: { w_mm: 300, h_mm: 300, margin_mm: 12 } },
  { label: '20×20 cm square', spec: { w_mm: 200, h_mm: 200, margin_mm: 10 } },
  { label: '30×20 cm landscape', spec: { w_mm: 300, h_mm: 200, margin_mm: 12 } },
  { label: 'A4 portrait', spec: { w_mm: 210, h_mm: 297, margin_mm: 14 } },
];

function NewAlbumModal({ projectId, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [sizeIdx, setSizeIdx] = useState(0);
  const [saving, setSaving] = useState(false);
  const create = async () => {
    setSaving(true);
    try { const r = await mediaAPI.createAlbum(projectId, { title: title.trim() || 'Album', spec: SIZES[sizeIdx].spec }); onCreated(r.data); }
    catch { setSaving(false); }
  };
  return (
    <div {...clickable(onClose)} style={overlay}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={modalBox}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>New album</h2>
          <button aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <label style={labelStyle}>Album name</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Wedding Album" style={inputStyle} autoFocus />
        <label style={labelStyle}>Size</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
          {SIZES.map((s, i) => (
            <button key={i} onClick={() => setSizeIdx(i)} style={{
              padding: '10px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: `1px solid ${sizeIdx === i ? 'var(--accent)' : 'var(--border)'}`,
              background: sizeIdx === i ? 'var(--accent-light)' : 'transparent', color: sizeIdx === i ? 'var(--accent)' : 'var(--text-muted)',
            }}>{s.label}</button>
          ))}
        </div>
        <button onClick={create} disabled={saving} style={primaryBtn}>{saving ? 'Creating…' : 'Create album'}</button>
      </div>
    </div>
  );
}

export default function AlbumsPage() {
  const router = useRouter();
  const { id } = useParams();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
    mediaAPI.listAlbums(id).then(r => setAlbums(r.data.albums || [])).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '22px 20px 60px' }}>
        <button onClick={() => router.push(`/studio/${id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', marginBottom: 14 }}>
          <ArrowLeft size={15} /> Back to shoot
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Albums</h1>
          <button onClick={() => setShowNew(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 11, border: 'none', cursor: 'pointer', background: 'var(--ms-ink)', color: 'var(--ms-paper)', fontWeight: 800, fontSize: 14 }}><Plus size={16} /> New album</button>
        </div>

        {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p> : albums.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', border: '2px dashed var(--border)', borderRadius: 18 }}>
            <BookOpen size={30} color="var(--text-muted)" style={{ opacity: 0.5 }} />
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '12px 0 0' }}>No albums yet — design one and export a print-ready PDF.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {albums.map(a => (
              <div key={a.id} {...clickable(() => router.push(`/studio/${id}/albums/${a.id}`))} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18, cursor: 'pointer' }}>
                <div style={{ width: 44, height: 44, borderRadius: 11, background: 'var(--ms-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><BookOpen size={20} color="var(--ms-paper)" /></div>
                <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>{a.title}</h3>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
                  {a.page_count || 0} page{a.page_count === 1 ? '' : 's'}
                  {a.spec?.w_mm ? ` · ${a.spec.w_mm}×${a.spec.h_mm}mm` : ''}
                </p>
                {a.pdf_status === 'ready' && a.pdf_url && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 11.5, color: '#10b981', fontWeight: 700 }}><FileText size={12} /> PDF ready</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {showNew && <NewAlbumModal projectId={id} onClose={() => setShowNew(false)} onCreated={(a) => router.push(`/studio/${id}/albums/${a.id}`)} />}
    </>
  );
}

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 };
const modalBox = { background: 'var(--surface)', borderRadius: 18, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.25)' };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, marginBottom: 16, outline: 'none', boxSizing: 'border-box' };
const primaryBtn = { width: '100%', padding: '11px', borderRadius: 11, border: 'none', cursor: 'pointer', background: 'var(--ms-ink)', color: 'var(--ms-paper)', fontWeight: 800, fontSize: 14 };
