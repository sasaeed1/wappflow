'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImageIcon, Upload, Trash2, Check, FileText, Clock, Palette } from 'lucide-react';
import { csAPI, mediaUrl } from '../../../lib/api';
import ContractsStudioShell from '../../../components/ContractsStudioShell';

const THEMES = [['monochrome', 'Monochrome'], ['editorial', 'Editorial'], ['executive', 'Executive']];

export default function ContractsSettingsPage() {
  const router = useRouter();
  const [letterhead, setLetterhead] = useState(null);
  const [settings, setSettings] = useState({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/contracts/settings'); return; }
    csAPI.getSettings().then(r => { setLetterhead(r.data.letterhead_url || null); setSettings(r.data.settings || {}); }).catch(() => {});
  }, []); // eslint-disable-line

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
    <ContractsStudioShell>
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
      </div>
    </ContractsStudioShell>
  );
}

const btn = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
