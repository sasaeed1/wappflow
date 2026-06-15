'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Plus, X, Trash2, Save } from 'lucide-react';
import { contractsAPI } from '../../../lib/api';
import ContractsShell from '../../../components/ContractsShell';

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {title, body} for the create form, or null
  const [toast, setToast] = useState(null);
  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2400); };

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/contracts/templates'); return; }
    load();
  }, []);
  const load = async () => { setLoading(true); try { const r = await contractsAPI.templates(); setTemplates(r.data.templates || []); } catch {} setLoading(false); };

  const save = async () => {
    if (!editing.title.trim()) { say('Give the template a title'); return; }
    try { await contractsAPI.createTemplate({ title: editing.title.trim(), body: editing.body || '' }); setEditing(null); load(); say('Template saved'); }
    catch { say('Could not save'); }
  };
  const del = async (t) => { if (!window.confirm(`Delete template "${t.title}"?`)) return; try { await contractsAPI.deleteTemplate(t.id); setTemplates(prev => prev.filter(x => x.id !== t.id)); } catch {} };

  return (
    <ContractsShell>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'clamp(20px, 4vw, 40px)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 'clamp(24px, 3.6vw, 34px)', fontWeight: 900, letterSpacing: '-0.02em', color: 'var(--text)', margin: 0 }}>Templates</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 0', maxWidth: 560 }}>Reusable contracts. Use <code>{'{{client_name}}'}</code>, <code>{'{{date}}'}</code> and <code>{'{{amount}}'}</code> — they auto-fill from the linked client when you create a contract.</p>
          </div>
          {!editing && <button onClick={() => setEditing({ title: '', body: '' })} style={btnPrimary}><Plus size={16} /> New template</button>}
        </div>

        {editing && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 18, marginBottom: 22, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <strong style={{ fontSize: 15, color: 'var(--text)' }}>New template</strong>
              <button onClick={() => setEditing(null)} style={iconBtn}><X size={18} /></button>
            </div>
            <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="Template title (e.g. Wedding Photography Agreement)" style={input} autoFocus />
            <textarea value={editing.body} onChange={e => setEditing({ ...editing, body: e.target.value })} rows={10} placeholder="Contract terms…" style={{ ...input, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.55, marginTop: 10 }} />
            <button onClick={save} style={{ ...btnPrimary, marginTop: 12 }}><Save size={15} /> Save template</button>
          </div>
        )}

        {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading…</p>
          : templates.length === 0 && !editing ? (
            <div style={{ textAlign: 'center', padding: 'clamp(40px,8vh,90px) 20px', border: '1px dashed var(--border)', borderRadius: 16 }}>
              <div style={{ width: 50, height: 50, borderRadius: 13, background: 'var(--accent-light)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><FileText size={22} /></div>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>No templates yet</h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 auto 18px', maxWidth: 360 }}>Save your common agreements once, then spin up a ready-to-send contract in seconds.</p>
              <button onClick={() => setEditing({ title: '', body: '' })} style={btnPrimary}><Plus size={15} /> New template</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {templates.map(t => (
                <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><FileText size={16} /></div>
                    <strong style={{ fontSize: 14.5, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</strong>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5, maxHeight: 60, overflow: 'hidden' }}>{(t.body || 'No content').slice(0, 140)}{(t.body || '').length > 140 ? '…' : ''}</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                    <button onClick={() => router.push('/contracts')} style={{ ...btnGhost, flex: 1, justifyContent: 'center' }}>Use in a contract</button>
                    <button onClick={() => del(t)} style={{ ...btnGhost, color: '#ef4444' }} title="Delete"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 600, padding: '10px 18px', borderRadius: 999, background: 'var(--text)', color: 'var(--surface)', fontSize: 13 }}>{toast}</div>}
    </ContractsShell>
  );
}

const input = { width: '100%', padding: '11px 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' };
const btnPrimary = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700 };
const btnGhost = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 13px', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600 };
const iconBtn = { width: 32, height: 32, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
