'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Search, MapPin, Calendar } from 'lucide-react';
import { mediaAPI, leadsAPI, mediaUrl } from '../../lib/api';
import NavBar from '../../components/NavBar';

const TYPES = ['wedding', 'event', 'portrait', 'real_estate', 'commercial', 'product', 'general'];

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
    <div onClick={onClose} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2>New shoot</h2>
            <p className="ms-modal-sub">A collection holds all media &amp; delivery for one shoot.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ms-ink-3)', padding: 4 }}><X size={20} /></button>
        </div>

        <label className="ms-label">Shoot name</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ayesha &amp; Bilal — Wedding" className="ms-input" style={{ marginBottom: 22 }} autoFocus />

        <label className="ms-label">Type</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
          {TYPES.map(t => (
            <button key={t} onClick={() => setType(t)} className={`ms-chip${type === t ? ' ms-chip-active' : ''}`}>{t.replace('_', ' ')}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 22 }}>
          <div style={{ flex: 1 }}>
            <label className="ms-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Calendar size={11} /> Shoot date</label>
            <input type="date" value={shootDate} onChange={e => setShootDate(e.target.value)} className="ms-input" />
          </div>
          <div style={{ flex: 1 }}>
            <label className="ms-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><MapPin size={11} /> Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City / venue" className="ms-input" />
          </div>
        </div>

        <label className="ms-label">Client</label>
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--ms-ink-3)' }} />
          <input value={leadSearch} onChange={e => setLeadSearch(e.target.value)} placeholder="Link a client from your CRM…" className="ms-input" style={{ paddingLeft: 34 }} />
        </div>
        <div style={{ maxHeight: 148, overflowY: 'auto', marginBottom: 24 }}>
          {filtered.map(l => (
            <button key={l.id} onClick={() => setLeadId(leadId === l.id ? '' : l.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 11, padding: '9px 10px', borderRadius: 9, marginBottom: 2, textAlign: 'left', cursor: 'pointer',
              border: '1px solid transparent', background: leadId === l.id ? 'var(--ms-ink-soft)' : 'transparent',
            }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--ms-surface-2)', color: 'var(--ms-ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, fontFamily: 'var(--ms-serif)' }}>
                {(l.customer_name || '?')[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize: 13.5, color: 'var(--ms-ink)' }}>{l.customer_name || 'Unnamed lead'}</span>
            </button>
          ))}
          {filtered.length === 0 && <p style={{ fontSize: 13, color: 'var(--ms-ink-3)', padding: '4px 10px' }}>No matching clients.</p>}
        </div>

        {err && <p style={{ color: '#b3261e', fontSize: 13, margin: '0 0 14px' }}>{err}</p>}
        <button onClick={create} disabled={saving} className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Creating…' : 'Create shoot'}
        </button>
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
      <div className="ms-page">
        <header className="ms-masthead">
          <div>
            <p className="ms-eyebrow">Media Studio</p>
            <h1 className="ms-display">Your shoots</h1>
            <p className="ms-lede">Every collection — from first frame to final delivery — in one quiet, image-first workspace.</p>
          </div>
          <button onClick={() => setShowNew(true)} className="ms-btn-ink"><Plus size={17} /> New shoot</button>
        </header>

        <hr className="ms-rule" />

        {loading ? (
          <p className="ms-loading">Opening the studio…</p>
        ) : projects.length === 0 ? (
          <div className="ms-empty">
            <h2>Nothing on the wall yet</h2>
            <p>Create your first shoot to bring photographs in, cull them, and deliver a gallery your client will remember.</p>
            <button onClick={() => setShowNew(true)} className="ms-btn-ink" style={{ margin: '0 auto' }}><Plus size={17} /> New shoot</button>
          </div>
        ) : (
          <div className="ms-collection-grid">
            {projects.map((p, i) => (
              <button key={p.id} onClick={() => router.push(`/studio/${p.id}`)} className="ms-collection" style={{ animationDelay: `${Math.min(i * 0.04, 0.4)}s` }}>
                <div className="ms-cover">
                  {p.cover_url
                    ? <img src={mediaUrl(p.cover_url)} alt={p.title} />
                    : <div className="ms-cover-ph"><span>{(p.project_type || 'general').replace('_', ' ')}</span></div>}
                </div>
                <div className="ms-collection-meta">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span className="ms-tag">{(p.project_type || 'general').replace('_', ' ')}</span>
                    {p.status === 'archived' && <span className="ms-archived">Archived</span>}
                  </div>
                  <h3 className="ms-collection-title">{p.title}</h3>
                  <p className="ms-collection-sub">
                    {p.client_name ? `${p.client_name} · ` : ''}{p.asset_count || 0} photograph{p.asset_count === 1 ? '' : 's'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={(p) => router.push(`/studio/${p.id}`)} />}
    </NavBar>
  );
}
