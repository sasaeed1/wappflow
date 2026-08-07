'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImageIcon, Upload, Trash2, Check, FileText, Clock, Palette } from 'lucide-react';
import { csAPI, mediaUrl } from '../../../lib/api';

const THEMES = [['monochrome', 'Monochrome'], ['editorial', 'Editorial'], ['executive', 'Executive']];

export default function ContractsSettingsPage() {
  const router = useRouter();
  const [letterhead, setLetterhead] = useState(null);
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clauses, setClauses] = useState([]);
  const fileRef = useRef(null);

  const loadClauses = () => csAPI.clauses().then(r => setClauses(r.data.clauses || [])).catch(() => {});
  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/contracts/settings'); return; }
    csAPI.getSettings().then(r => { setLetterhead(r.data.letterhead_url || null); setSettings(r.data.settings || {}); }).catch(() => {});
    loadClauses();
  }, []); // eslint-disable-line
  const addClause = async () => { await csAPI.createClause({ title: 'New clause', body: '' }); loadClauses(); };
  const saveClause = async (c) => { await csAPI.updateClause(c.id, { title: c.title, body: c.body }); setSaved(true); setTimeout(() => setSaved(false), 1200); };
  const delClause = async (id) => { await csAPI.deleteClause(id); setClauses(cs => cs.filter(x => x.id !== id)); };
  const patchClause = (id, p) => setClauses(cs => cs.map(x => x.id === id ? { ...x, ...p } : x));

  const save = async (patch) => {
    const next = { ...settings, ...patch }; setSettings(next);
    try { await csAPI.updateSettings(next); setSaved(true); setTimeout(() => setSaved(false), 1500); } catch {}
  };
  const onPick = async (e) => {
    const f = e.target.files?.[0]; if (!f) return; setBusy(true);
    try { const fd = new FormData(); fd.append('file', f); const r = await csAPI.uploadLetterhead(fd); setLetterhead(r.data.letterhead_url); }
    catch {} finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const removeLh = async () => { await csAPI.removeLetterhead(); setLetterhead(null); };

  const Card = ({ icon: Icon, title, sub, children }) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={17} style={{ color: 'var(--accent)' }} /></span>
        <div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{title}</div><div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{sub}</div></div>
      </div>
      {children}
    </div>
  );

  return (
    <>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>Settings</h1>
          {saved && <span style={{ fontSize: 12.5, color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={14} /> Saved</span>}
        </div>

        <Card icon={ImageIcon} title="Letterhead" sub="Optional — appears at the top of every document (toggle per document in its ⚙ settings).">
          {letterhead ? (
            <div>
              <img src={mediaUrl(letterhead)} alt="Letterhead" style={{ width: '100%', borderRadius: 10, border: '1px solid var(--border)', marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => fileRef.current?.click()} disabled={busy} style={btn}>{busy ? 'Uploading…' : 'Replace'}</button>
                <button onClick={removeLh} style={{ ...btn, color: '#ef4444' }}><Trash2 size={14} /> Remove</button>
              </div>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ width: '100%', padding: '28px', borderRadius: 12, border: '1.5px dashed var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <Upload size={22} style={{ color: 'var(--accent)' }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{busy ? 'Uploading…' : 'Upload a letterhead image'}</span>
              <span style={{ fontSize: 12 }}>PNG or JPG, full document width (e.g. 1600px wide)</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />
        </Card>

        <Card icon={Palette} title="Default theme" sub="The workspace style applied to new documents.">
          <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {THEMES.map(([t, l]) => <button key={t} onClick={() => save({ default_theme: t })} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: (settings.default_theme || 'monochrome') === t ? 'var(--accent)' : 'transparent', color: (settings.default_theme || 'monochrome') === t ? '#fff' : 'var(--text-muted)', fontSize: 12.5, fontWeight: 600 }}>{l}</button>)}
          </div>
        </Card>

        <Card icon={Clock} title="Default link expiry" sub="Suggested expiry preselected when you send a document.">
          <select value={settings.default_expire_days ?? 0} onChange={e => save({ default_expire_days: Number(e.target.value) })} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, outline: 'none' }}>
            <option value={0}>Never</option><option value={3}>3 days</option><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option>
          </select>
        </Card>

        <Card icon={FileText} title="Sender name" sub="Shown to clients on delivery emails (defaults to your company name).">
          <input value={settings.sender_name || ''} onChange={e => setSettings(s => ({ ...s, sender_name: e.target.value }))} onBlur={e => save({ sender_name: e.target.value })} placeholder="e.g. Sami Studios" style={{ width: '100%', maxWidth: 360, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </Card>

        <Card icon={FileText} title="Clause library" sub="Reusable clauses you can drop into any document from the builder.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {clauses.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No clauses yet — add cancellation, usage rights, payment terms…</p>}
            {clauses.map(c => (
              <div key={c.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                  <input value={c.title} onChange={e => patchClause(c.id, { title: e.target.value })} onBlur={() => saveClause(c)} style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, fontWeight: 600, outline: 'none' }} />
                  <button onClick={() => delClause(c.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={15} /></button>
                </div>
                <textarea value={c.body} onChange={e => patchClause(c.id, { body: e.target.value })} onBlur={() => saveClause(c)} rows={2} placeholder="Clause text…" style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <button onClick={addClause} style={{ ...btn, marginTop: 12 }}>+ Add clause</button>
        </Card>
      </div>
    </>
  );
}

const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
