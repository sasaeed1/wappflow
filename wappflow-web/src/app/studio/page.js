'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Plus, Image as ImageIcon, X, Search, MapPin, Calendar } from 'lucide-react';
import { mediaAPI, leadsAPI, mediaUrl } from '../../lib/api';
import NavBar from '../../components/NavBar';

const TYPES = ['wedding', 'event', 'portrait', 'real_estate', 'commercial', 'product', 'general'];
const TYPE_COLOR = {
  wedding: '#ec4899', event: '#f59e0b', portrait: '#8b5cf6',
  real_estate: '#06b6d4', commercial: '#10b981', product: '#6366f1', general: '#64748b',
};

function NewProjectModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('wedding');
  const [shootDate, setShootDate] = useState('');
  const [location, setLocation] = useState('');
  const [leadId, setLeadId] = useState('');
  const [leads, setLeads] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    leadsAPI.getAll(null).then(r => setLeads(r.data.leads || [])).catch(() => {});
  }, []);

  const filtered = leadSearch
    ? leads.filter(l => (l.customer_name || '').toLowerCase().includes(leadSearch.toLowerCase()))
    : leads.slice(0, 8);

  const create = async () => {
    if (!title.trim()) { setErr('Give the shoot a name'); return; }
    setSaving(true); setErr('');
    try {
      const res = await mediaAPI.createProject({
        title: title.trim(), project_type: type,
        shoot_date: shootDate || undefined, location: location || undefined,
        lead_id: leadId || undefined,
      });
      onCreated(res.data);
    } catch (e) { setErr(e.response?.data?.error || 'Could not create'); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Camera size={20} color="white" />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>New Shoot</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>A project holds all media + delivery for one shoot</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>

        <label style={labelStyle}>Shoot name</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Ayesha &amp; Bilal — Wedding" style={inputStyle} autoFocus />

        <label style={labelStyle}>Type</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {TYPES.map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              padding: '6px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
              border: `1px solid ${type === t ? TYPE_COLOR[t] : 'var(--border)'}`,
              background: type === t ? TYPE_COLOR[t] + '22' : 'transparent',
              color: type === t ? TYPE_COLOR[t] : 'var(--text-muted)',
            }}>{t.replace('_', ' ')}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 4 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}><Calendar size={11} /> Shoot date</label>
            <input type="date" value={shootDate} onChange={e => setShootDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}><MapPin size={11} /> Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City / venue" style={inputStyle} />
          </div>
        </div>

        <label style={labelStyle}>Client (links to a CRM lead — optional)</label>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-muted)' }} />
          <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)} placeholder="Search your leads…" style={{ ...inputStyle, paddingLeft: 32, marginBottom: 0 }} />
        </div>
        <div style={{ maxHeight: 140, overflowY: 'auto', marginBottom: 18 }}>
          {filtered.map(l => (
            <button key={l.id} onClick={() => setLeadId(leadId === l.id ? '' : l.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 9, marginBottom: 3, textAlign: 'left', cursor: 'pointer',
              border: `1px solid ${leadId === l.id ? 'var(--accent)' : 'transparent'}`,
              background: leadId === l.id ? 'var(--accent-light)' : 'transparent',
            }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                {(l.customer_name || '?')[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{l.customer_name || 'Unnamed lead'}</span>
            </button>
          ))}
          {filtered.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 10px' }}>No matching leads.</p>}
        </div>

        {err && <p style={{ color: '#ef4444', fontSize: 12.5, margin: '0 0 12px' }}>{err}</p>}
        <button onClick={create} disabled={saving} style={{
          width: '100%', padding: '12px', borderRadius: 11, border: 'none', cursor: saving ? 'wait' : 'pointer',
          background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: 'white', fontWeight: 800, fontSize: 14,
        }}>{saving ? 'Creating…' : 'Create shoot'}</button>
      </div>
    </div>
  );
}

export default function StudioPage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login'); return; }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try { const res = await mediaAPI.listProjects(); setProjects(res.data.projects || []); } catch {}
    setLoading(false);
  };

  return (
    <NavBar>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '28px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>Media Studio</h1>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>Shoots, galleries &amp; client delivery — in your CRM.</p>
          </div>
          <button onClick={() => setShowNew(true)} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: 'white', fontWeight: 800, fontSize: 14,
            boxShadow: '0 8px 24px -6px rgba(139,92,246,0.5)',
          }}><Plus size={17} /> New Shoot</button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading shoots…</p>
        ) : projects.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', border: '2px dashed var(--border)', borderRadius: 20 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, margin: '0 auto 16px', background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={28} color="white" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>No shoots yet</h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 18px' }}>Create your first shoot to upload, cull, and deliver galleries.</p>
            <button onClick={() => setShowNew(true)} style={{ padding: '10px 20px', borderRadius: 11, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: 'white', fontWeight: 800, fontSize: 14 }}>Create shoot</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 18 }}>
            {projects.map(p => (
              <div key={p.id} onClick={() => router.push(`/studio/${p.id}`)} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 14px 36px -12px rgba(0,0,0,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ height: 130, background: p.cover_url ? `center/cover url(${mediaUrl(p.cover_url)})` : `linear-gradient(135deg, ${TYPE_COLOR[p.project_type] || '#64748b'}33, ${TYPE_COLOR[p.project_type] || '#64748b'}11)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {!p.cover_url && <ImageIcon size={30} color={TYPE_COLOR[p.project_type] || '#64748b'} style={{ opacity: 0.5 }} />}
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 8px', borderRadius: 6, color: TYPE_COLOR[p.project_type] || '#64748b', background: (TYPE_COLOR[p.project_type] || '#64748b') + '1a' }}>
                      {(p.project_type || 'general').replace('_', ' ')}
                    </span>
                    {p.status === 'archived' && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>archived</span>}
                  </div>
                  <h3 style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.3 }}>{p.title}</h3>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>
                    {p.client_name ? `${p.client_name} · ` : ''}{p.asset_count || 0} photo{p.asset_count === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={(p) => router.push(`/studio/${p.id}`)} />}
    </NavBar>
  );
}

const labelStyle = { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, marginBottom: 16, outline: 'none', boxSizing: 'border-box' };
