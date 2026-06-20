'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileSignature, Plus, X, Search, CheckCircle2, TrendingUp, FileText,
  Trash2, Activity, Send, FileEdit, Upload,
} from 'lucide-react';
import { csAPI, leadsAPI } from '../../lib/api';
import ContractsStudioShell from '../../components/ContractsStudioShell';

const TYPES = ['contract', 'proposal', 'quote', 'nda', 'sow', 'retainer', 'agreement'];
const STATUS = {
  draft:            { label: 'Draft',     color: '#94a3b8', bg: 'rgba(148,163,184,0.14)' },
  pending_approval: { label: 'Approval',  color: '#a855f7', bg: 'rgba(168,85,247,0.14)' },
  sent:             { label: 'Sent',      color: '#3b82f6', bg: 'rgba(59,130,246,0.14)' },
  viewed:           { label: 'Viewed',    color: '#6366f1', bg: 'rgba(99,102,241,0.14)' },
  signed:           { label: 'Signed',    color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
  completed:        { label: 'Completed', color: '#10b981', bg: 'rgba(16,185,129,0.14)' },
  declined:         { label: 'Declined',  color: '#ef4444', bg: 'rgba(239,68,68,0.14)' },
  expired:          { label: 'Expired',   color: '#f59e0b', bg: 'rgba(245,158,11,0.14)' },
};
const Pill = ({ s }) => { const m = STATUS[s] || STATUS.draft; return <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: m.color, background: m.bg, padding: '3px 9px', borderRadius: 999 }}>{m.label}</span>; };
const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d + (String(d).includes('Z') ? '' : 'Z')).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return '—'; } };
const fmtMoney = (n) => { if (!n) return '0'; try { return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n); } catch { return String(n); } };

export default function ContractsStudioPage() {
  const router = useRouter();
  const [docs, setDocs] = useState([]);
  const [ov, setOv] = useState({ byStatus: {}, activity: [], revenue: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [toast, setToast] = useState(null);
  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/contracts'); return; }
    load();
  }, []);
  const load = async () => {
    setLoading(true);
    try { const [d, o] = await Promise.all([csAPI.list(), csAPI.overview()]); setDocs(d.data.documents || []); setOv(o.data || {}); } catch {}
    setLoading(false);
  };

  const awaiting = (ov.byStatus?.sent || 0) + (ov.byStatus?.viewed || 0);
  const completed = (ov.byStatus?.signed || 0) + (ov.byStatus?.completed || 0);
  const shown = useMemo(() => {
    let list = docs;
    if (filter === 'awaiting') list = list.filter(d => ['sent', 'viewed'].includes(d.status));
    else if (filter === 'completed') list = list.filter(d => ['signed', 'completed'].includes(d.status));
    else if (filter !== 'all') list = list.filter(d => d.status === filter);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(d => `${d.title} ${d.client_name || ''} ${d.type}`.toLowerCase().includes(q));
    return list;
  }, [docs, filter, query]);

  return (
    <ContractsStudioShell>
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: 'clamp(20px, 3.5vw, 38px)' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}><FileSignature size={14} /> Contracts Studio</div>
            <h1 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)', margin: 0 }}>Overview</h1>
          </div>
          <button onClick={() => setShowBulk(true)} style={{ ...btnPrimary, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }}><Send size={15} /> Bulk send</button>
          <button onClick={() => setShowNew(true)} style={btnPrimary}><Plus size={16} /> New document</button>
        </div>

        {/* impact stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 26 }}>
          <Stat icon={<FileText size={16} />} label="Total" value={ov.total || 0} />
          <Stat icon={<Send size={16} />} label="Awaiting signature" value={awaiting} accent="#3b82f6" />
          <Stat icon={<CheckCircle2 size={16} />} label="Completed" value={completed} accent="#10b981" />
          <Stat icon={<TrendingUp size={16} />} label="Revenue impact" value={fmtMoney(ov.revenue)} accent="#8b5cf6" />
        </div>

        <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 22, alignItems: 'start' }}>
          {/* documents */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 11, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                {[['all', 'All'], ['draft', 'Drafts'], ['awaiting', 'Awaiting'], ['completed', 'Signed']].map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)} style={{ padding: '7px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', background: filter === k ? 'var(--surface)' : 'transparent', color: filter === k ? 'var(--text)' : 'var(--text-muted)', fontSize: 12.5, fontWeight: filter === k ? 700 : 500 }}>{l}</button>
                ))}
              </div>
              <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--text-muted)' }} />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search documents…" style={{ width: '100%', height: 40, padding: '0 12px 0 36px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {loading ? <p style={{ color: 'var(--text-muted)', padding: '30px 0' }}>Loading…</p>
              : docs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 'clamp(50px,10vh,110px) 20px', border: '1px dashed var(--border)', borderRadius: 16 }}>
                  <div style={{ width: 54, height: 54, borderRadius: 14, background: 'var(--accent-light)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FileSignature size={26} /></div>
                  <h2 style={{ fontSize: 21, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>Your contract workspace</h2>
                  <p style={{ fontSize: 14.5, color: 'var(--text-muted)', margin: '0 auto 20px', maxWidth: 420, lineHeight: 1.6 }}>Build beautiful, interactive proposals &amp; contracts your clients actually enjoy signing — connected to every lead, project and pipeline.</p>
                  <button onClick={() => setShowNew(true)} style={btnPrimary}><Plus size={15} /> Create your first document</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {shown.map(d => (
                    <div key={d.id} onClick={() => router.push(`/contracts/${d.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 13, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', transition: 'border-color .12s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={17} /></div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{d.type}{d.client_name ? ` · ${d.client_name}` : ''} · {d.updated_at ? `updated ${fmtDate(d.updated_at)}` : ''}</div>
                      </div>
                      <Pill s={d.status} />
                      <button onClick={async (e) => { e.stopPropagation(); if (window.confirm(`Delete "${d.title}"?`)) { try { await csAPI.remove(d.id); load(); } catch {} } }} title="Delete" style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={15} /></button>
                    </div>
                  ))}
                  {shown.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14, padding: '20px 0' }}>No documents match.</p>}
                </div>
              )}
          </div>

          {/* activity */}
          <aside style={{ position: 'sticky', top: 78 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}><Activity size={15} /> Recent activity</div>
              {(ov.activity || []).length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0 }}>Nothing yet.</p>
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderLeft: '2px solid var(--border)', paddingLeft: 14 }}>
                    {ov.activity.map((e, i) => (
                      <div key={i} style={{ position: 'relative', paddingBottom: 12 }}>
                        <span style={{ position: 'absolute', left: -20, top: 3, width: 9, height: 9, borderRadius: 999, background: 'var(--accent)' }} />
                        <div style={{ fontSize: 12.5, color: 'var(--text)' }}><strong style={{ textTransform: 'capitalize' }}>{e.type.replace('_', ' ')}</strong> — {e.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(e.created_at)}</div>
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </aside>
        </div>
      </div>

      {showNew && <NewDocModal onClose={() => setShowNew(false)} onCreated={(id) => { setShowNew(false); router.push(`/contracts/${id}`); }} say={say} />}
      {showBulk && <BulkSendModal onClose={() => setShowBulk(false)} say={say} />}
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 700, padding: '10px 18px', borderRadius: 999, background: 'var(--text)', color: 'var(--surface)', fontSize: 13 }}>{toast}</div>}
    </ContractsStudioShell>
  );
}

function Stat({ icon, label, value, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: accent ? accent + '1f' : 'var(--accent-light)', color: accent || 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', lineHeight: 1.05 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      </div>
    </div>
  );
}

function NewDocModal({ onClose, onCreated, say }) {
  const [type, setType] = useState('proposal');
  const [title, setTitle] = useState('');
  const [leadId, setLeadId] = useState('');
  const [leads, setLeads] = useState([]);
  const [packs, setPacks] = useState([]);
  const [packId, setPackId] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    leadsAPI.getAll(null).then(r => setLeads(r.data.leads || [])).catch(() => {});
    csAPI.packs().then(r => setPacks(r.data.packs || [])).catch(() => {});
    csAPI.templates().then(r => setTemplates(r.data.templates || [])).catch(() => {});
  }, []);
  const filtered = q ? leads.filter(l => (l.customer_name || '').toLowerCase().includes(q.toLowerCase())) : leads.slice(0, 6);

  const [file, setFile] = useState(null);
  const pickPack = (p) => { setTemplateId(''); if (packId === p.id) { setPackId(''); return; } setPackId(p.id); setType(p.type); if (!title.trim()) setTitle(p.title); };
  const pickTemplate = (t) => { setPackId(''); if (templateId === t.id) { setTemplateId(''); return; } setTemplateId(t.id); setType(t.type || 'contract'); if (!title.trim()) setTitle(t.title); };

  const create = async () => {
    if (!title.trim()) { setErr('Give it a title'); return; }
    setSaving(true); setErr('');
    try {
      const r = await csAPI.create({ type, title: title.trim(), lead_id: leadId || undefined, pack_id: file ? undefined : (packId || undefined), template_id: file ? undefined : (templateId || undefined) });
      if (file) { const fd = new FormData(); fd.append('file', file); try { await csAPI.uploadDocFile(r.data.id, fd); } catch {} }
      onCreated(r.data.id);
    }
    catch (e) { setErr(e.response?.data?.error || 'Could not create'); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 24, boxShadow: '0 30px 80px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>New document</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        {packs.length > 0 && (
          <>
            <label style={lbl}>Start from a pack</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {packs.map(p => (
                <button key={p.id} onClick={() => pickPack(p)} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minWidth: 0, minHeight: 62, padding: '11px 13px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${packId === p.id ? 'var(--accent)' : 'var(--border)'}`, background: packId === p.id ? 'var(--accent-light)' : 'var(--bg)' }}>
                  <span style={{ fontSize: 19, flexShrink: 0, lineHeight: 1.2 }}>{p.emoji || '📄'}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.title}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.industry}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
        {templates.length > 0 && (
          <>
            <label style={lbl}>Your templates</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {templates.map(t => (
                <button key={t.id} onClick={() => pickTemplate(t)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%', padding: '8px 12px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${templateId === t.id ? 'var(--accent)' : 'var(--border)'}`, background: templateId === t.id ? 'var(--accent-light)' : 'var(--bg)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600 }}>
                  <FileText size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <label style={lbl}>Type</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {TYPES.map(t => <button key={t} onClick={() => setType(t)} style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${type === t ? 'var(--accent)' : 'var(--border)'}`, background: type === t ? 'var(--accent-light)' : 'transparent', color: type === t ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>)}
        </div>
        <label style={lbl}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Wedding Photography Proposal" style={inp} autoFocus />
        <label style={lbl}>Or upload a file to sign (optional)</label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: `1px dashed ${file ? 'var(--accent)' : 'var(--border)'}`, background: file ? 'var(--accent-light)' : 'var(--bg)', cursor: 'pointer', marginBottom: 4 }}>
          <Upload size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: file ? 'var(--text)' : 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file ? file.name : 'PDF or image — attach an existing document'}</span>
          {file && <button type="button" onClick={(e) => { e.preventDefault(); setFile(null); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}>×</button>}
          <input type="file" accept="application/pdf,image/*" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
        </label>
        <label style={lbl}>Client (optional)</label>
        <div style={{ position: 'relative', marginBottom: 6 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Link a client…" style={{ ...inp, paddingLeft: 34, marginBottom: 0 }} />
        </div>
        {q && !leadId && filtered.length > 0 && (
          <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 9, marginBottom: 8 }}>
            {filtered.map(l => <button key={l.id} onClick={() => { setLeadId(l.id); setQ(l.customer_name || ''); }} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>{l.customer_name || 'Unnamed'}</button>)}
          </div>
        )}
        {err && <p style={{ color: '#ef4444', fontSize: 13, margin: '8px 0 0' }}>{err}</p>}
        <button onClick={create} disabled={saving} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', marginTop: 14 }}><FileEdit size={15} /> {saving ? 'Creating…' : 'Create draft'}</button>
      </div>
    </div>
  );
}

function BulkSendModal({ onClose, say }) {
  const [packs, setPacks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [leads, setLeads] = useState([]);
  const [source, setSource] = useState(null);
  const [picked, setPicked] = useState(() => new Set());
  const [channels, setChannels] = useState(['whatsapp', 'email']);
  const [q, setQ] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    csAPI.packs().then(r => setPacks(r.data.packs || [])).catch(() => {});
    csAPI.templates().then(r => setTemplates(r.data.templates || [])).catch(() => {});
    leadsAPI.getAll(null).then(r => setLeads(r.data.leads || [])).catch(() => {});
  }, []);
  const filtered = q ? leads.filter(l => (l.customer_name || '').toLowerCase().includes(q.toLowerCase())) : leads.slice(0, 50);
  const toggleLead = (id) => setPicked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const send = async () => {
    if (!source) { setErr('Pick a template or pack'); return; }
    if (picked.size === 0) { setErr('Pick at least one client'); return; }
    setSending(true); setErr('');
    try { const body = { lead_ids: [...picked], channels }; if (source.type === 'pack') body.pack_id = source.id; else body.template_id = source.id; const r = await csAPI.bulkSend(body); say && say(`Sent to ${r.data.sent} client${r.data.sent === 1 ? '' : 's'}`); onClose(); }
    catch (e) { setErr(e.response?.data?.error || 'Bulk send failed'); setSending(false); }
  };
  const srcChip = (type, id, title) => { const on = source && source.type === type && source.id === id; return <button key={type + id} onClick={() => setSource({ type, id, title })} style={{ padding: '7px 12px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--bg)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600 }}>{title}</button>; };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 24, boxShadow: '0 30px 80px rgba(0,0,0,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Bulk send</h2>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <label style={lbl}>Document</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {packs.map(p => srcChip('pack', p.id, p.title))}
          {templates.map(t => srcChip('template', t.id, t.title))}
          {packs.length === 0 && templates.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>No packs or templates yet.</span>}
        </div>
        <label style={lbl}>Clients ({picked.size} selected)</label>
        <div style={{ position: 'relative', marginBottom: 6 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search clients…" style={{ ...inp, paddingLeft: 34, marginBottom: 0 }} />
        </div>
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 9, marginBottom: 14 }}>
          {filtered.map(l => (
            <button key={l.id} onClick={() => toggleLead(l.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: picked.has(l.id) ? 'var(--accent-light)' : 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 17, height: 17, borderRadius: 5, border: `1.5px solid ${picked.has(l.id) ? 'var(--accent)' : 'var(--border)'}`, background: picked.has(l.id) ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{picked.has(l.id) && <CheckCircle2 size={12} color="#fff" />}</span>
              <span style={{ flex: 1 }}>{l.customer_name || 'Unnamed'}</span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[['whatsapp', 'WhatsApp'], ['email', 'Email']].map(([c, label]) => (
            <button key={c} onClick={() => setChannels(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c])} style={{ flex: 1, padding: '9px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${channels.includes(c) ? 'var(--accent)' : 'var(--border)'}`, background: channels.includes(c) ? 'var(--accent-light)' : 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{label}</button>
          ))}
        </div>
        {err && <p style={{ color: '#ef4444', fontSize: 13, margin: '0 0 10px' }}>{err}</p>}
        <button onClick={send} disabled={sending} style={{ ...btnPrimary, width: '100%', justifyContent: 'center' }}><Send size={15} /> {sending ? 'Sending…' : `Send to ${picked.size || ''} client${picked.size === 1 ? '' : 's'}`}</button>
      </div>
    </div>
  );
}

const lbl = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', margin: '10px 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const inp = { width: '100%', padding: '11px 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: 4 };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700 };
