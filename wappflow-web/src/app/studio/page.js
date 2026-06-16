'use client';
/* eslint-disable @next/next/no-img-element -- covers are dynamic /uploads URLs */

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Search, MapPin, Calendar, ArrowRight } from 'lucide-react';
import { mediaAPI, leadsAPI, mediaUrl } from '../../lib/api';
import NavBar from '../../components/StudioShell';

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
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--ms-surface-2)', color: 'var(--ms-ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 }}>
                {(l.customer_name || '?')[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize: 13.5, color: 'var(--ms-ink)' }}>{l.customer_name || 'Unnamed lead'}</span>
            </button>
          ))}
          {filtered.length === 0 && <p style={{ fontSize: 13, color: 'var(--ms-ink-3)', padding: '4px 10px' }}>No matching clients.</p>}
        </div>

        {err && <p style={{ color: '#d4564a', fontSize: 13, margin: '0 0 14px' }}>{err}</p>}
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
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    try { const res = await mediaAPI.listProjects(); setProjects(res.data.projects || []); } catch {}
    setLoading(false);
  };

  const live = useMemo(() => projects.filter(p => p.status !== 'archived'), [projects]);
  const featured = live[0] || projects[0] || null;
  const totalPhotos = useMemo(() => projects.reduce((s, p) => s + (p.asset_count || 0), 0), [projects]);
  const clients = useMemo(() => new Set(projects.map(p => p.client_name).filter(Boolean)).size, [projects]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p => `${p.title || ''} ${p.client_name || ''} ${(p.project_type || '').replace('_', ' ')}`.toLowerCase().includes(q));
  }, [projects, query]);

  return (
    <NavBar>
      {loading ? (
        <div className="ms-page"><p className="ms-loading">Opening the studio…</p></div>
      ) : projects.length === 0 ? (
        <div className="ms-stage ms-stage-empty" onClick={() => setShowNew(true)}>
          <div className="ms-hero-fallback" />
          <div className="ms-stage-veil" />
          <div className="ms-stage-content" style={{ alignItems: 'center', textAlign: 'center' }}>
            <p className="ms-eyebrow">Media Studio</p>
            <h1 className="ms-stage-title">Every shoot,<br />delivered.</h1>
            <p className="ms-stage-sub" style={{ maxWidth: 520, marginInline: 'auto' }}>Bring photographs in, cull with AI at your side, and deliver galleries your clients will remember.</p>
            <button onClick={(e) => { e.stopPropagation(); setShowNew(true); }} className="ms-btn-ink ms-stage-cta"><Plus size={16} /> Create your first shoot</button>
          </div>
        </div>
      ) : (
        <div className="ms-home">
          {/* full-bleed cinematic stage — the latest shoot fills the screen */}
          {featured && (
            <section className="ms-stage" onClick={() => router.push(`/studio/${featured.id}`)}>
              {featured.cover_url
                ? <img className="ms-stage-img" src={mediaUrl(featured.cover_url)} alt="" />
                : <div className="ms-hero-fallback" />}
              <div className="ms-stage-veil" />
              <div className="ms-stage-content">
                <p className="ms-eyebrow">Latest shoot — {(featured.project_type || 'general').replace('_', ' ')}</p>
                <h1 className="ms-stage-title">{featured.title}</h1>
                <p className="ms-stage-sub">
                  {featured.client_name ? `${featured.client_name} · ` : ''}{featured.asset_count || 0} photograph{featured.asset_count === 1 ? '' : 's'}
                  <ArrowRight size={15} style={{ display: 'inline', verticalAlign: '-3px', marginLeft: 8 }} />
                </p>
                <div className="ms-statrow" style={{ marginTop: 28 }}>
                  <div className="ms-stat"><b>{projects.length}</b><span>Shoots</span></div>
                  <div className="ms-stat"><b>{totalPhotos.toLocaleString()}</b><span>Photographs</span></div>
                  {clients > 0 && <div className="ms-stat"><b>{clients}</b><span>Clients</span></div>}
                </div>
              </div>
              <div className="ms-stage-scroll"><span className="ms-stage-scrolldot" />Scroll</div>
            </section>
          )}

          {/* edge-to-edge masonry wall — every shoot */}
          <section className="ms-wall">
            <div className="ms-wall-head">
              <h2 className="ms-h2">The work</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div className="ms-shoot-search">
                  <Search size={15} />
                  <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search shoots…" aria-label="Search shoots" />
                  {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>}
                </div>
                <button onClick={() => router.push('/studio/store')} className="ms-btn-ghost">Print store</button>
                <button onClick={() => setShowNew(true)} className="ms-btn-ink"><Plus size={16} /> New shoot</button>
              </div>
            </div>
            {shown.length === 0 ? (
              <div className="ms-empty-soft">No shoots match “{query}”.</div>
            ) : (
              <div className="ms-collection-grid">
                {shown.map((p, i) => (
                  <button key={p.id} onClick={() => router.push(`/studio/${p.id}`)} className="ms-covercard" style={{ animationDelay: `${Math.min(i * 0.06, 0.5)}s` }}>
                    {p.cover_url ? <img src={mediaUrl(p.cover_url)} alt={p.title} /> : <div className="ms-covercard-ph" />}
                    <div className="ms-covercard-veil" />
                    <div className="ms-covercard-body">
                      <span className="ms-covercard-tag">{(p.project_type || 'general').replace('_', ' ')}{p.status === 'archived' ? ' · archived' : ''}</span>
                      <h3 className="ms-covercard-title">{p.title}</h3>
                      <p className="ms-covercard-sub">{p.client_name ? `${p.client_name} · ` : ''}{p.asset_count || 0} photo{p.asset_count === 1 ? '' : 's'}</p>
                    </div>
                  </button>
                ))}
                {!query && (
                  <button className="ms-covercard ms-covercard-add" onClick={() => setShowNew(true)}>
                    <div className="ms-covercard-ph" />
                    <span className="ms-covercard-addlabel"><Plus size={18} /> New shoot</span>
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={(p) => router.push(`/studio/${p.id}`)} />}
    </NavBar>
  );
}
