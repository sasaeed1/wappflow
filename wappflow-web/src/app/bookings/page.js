'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Plus, Trash2, Copy, Check, Clock, ExternalLink } from 'lucide-react';
import { bookingAPI } from '../../lib/api';
import NavBar from '../../components/NavBar';

const DOW = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];

export default function BookingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState(null);
  const [url, setUrl] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/bookings'); return; }
    bookingAPI.settings().then(r => { setSettings(r.data.settings); setUrl(r.data.public_url); }).catch(() => setSettings({ services: [], availability: {} }));
    bookingAPI.list().then(r => setBookings(r.data.bookings || [])).catch(() => {});
  }, []); // eslint-disable-line

  const save = async () => {
    const r = await bookingAPI.updateSettings(settings);
    setUrl(r.data.public_url); setSaved(true); setTimeout(() => setSaved(false), 1600);
  };
  const copy = () => { if (!url) return; navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  const setSvc = (i, patch) => setSettings(s => ({ ...s, services: s.services.map((x, j) => j === i ? { ...x, ...patch } : x) }));
  const addSvc = () => setSettings(s => ({ ...s, services: [...(s.services || []), { name: 'New service', duration: 30, price: 0 }] }));
  const delSvc = (i) => setSettings(s => ({ ...s, services: s.services.filter((_, j) => j !== i) }));
  const toggleDay = (dow) => setSettings(s => { const a = { ...(s.availability || {}) }; if (a[dow]) delete a[dow]; else a[dow] = [9, 17]; return { ...s, availability: a }; });
  const setHours = (dow, idx, val) => setSettings(s => { const a = { ...(s.availability || {}) }; const h = [...(a[dow] || [9, 17])]; h[idx] = Math.max(0, Math.min(23, Number(val) || 0)); a[dow] = h; return { ...s, availability: a }; });

  if (!settings) return <NavBar><div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div></NavBar>;

  return (
    <NavBar>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px', display: 'inline-flex', alignItems: 'center', gap: 9 }}><Calendar size={22} /> Bookings</h1>
          {saved && <span style={{ fontSize: 12.5, color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={14} /> Saved</span>}
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 22px' }}>Let clients self-book — each booking drops straight into your pipeline as a lead + reminder.</p>

        {url && (
          <div className="r-wrap" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Your booking link</span>
            <input readOnly value={url} style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 12.5, color: 'var(--text)', outline: 'none' }} />
            <button onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: copied ? '#10b981' : 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 12.5 }}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button>
            <a href={url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', padding: '8px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-muted)' }}><ExternalLink size={14} /></a>
          </div>
        )}

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 14px' }}>Services</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(settings.services || []).map((s, i) => (
              <div key={i} className="r-wrap" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={s.name} onChange={e => setSvc(i, { name: e.target.value })} placeholder="Service name" style={{ flex: 1, ...fld }} />
                <input type="number" value={s.duration} onChange={e => setSvc(i, { duration: Number(e.target.value) })} style={{ width: 76, ...fld }} title="Minutes" />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>min</span>
                <input type="number" value={s.price} onChange={e => setSvc(i, { price: Number(e.target.value) })} style={{ width: 80, ...fld }} title="Price" />
                <button onClick={() => delSvc(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button onClick={addSvc} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Plus size={14} /> Add service</button>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 14px', display: 'inline-flex', alignItems: 'center', gap: 7 }}><Clock size={15} /> Weekly availability</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DOW.map(([dow, label]) => {
              const on = !!(settings.availability && settings.availability[dow]);
              const h = (settings.availability && settings.availability[dow]) || [9, 17];
              return (
                <div key={dow} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button onClick={() => toggleDay(dow)} style={{ width: 54, padding: '7px 0', borderRadius: 8, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'transparent', color: on ? 'var(--accent)' : 'var(--text-muted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{label}</button>
                  {on ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                      <input type="number" value={h[0]} onChange={e => setHours(dow, 0, e.target.value)} style={{ width: 60, ...fld }} />:00 to
                      <input type="number" value={h[1]} onChange={e => setHours(dow, 1, e.target.value)} style={{ width: 60, ...fld }} />:00
                    </span>
                  ) : <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Closed</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 14px' }}>Scheduling rules</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 14 }}>
            <label style={{ fontSize: 13, color: 'var(--text)' }}>Buffer between bookings <input type="number" value={settings.buffer_min || 0} onChange={e => setSettings(s => ({ ...s, buffer_min: Number(e.target.value) }))} style={{ ...fld, width: 70, marginLeft: 6 }} /> min</label>
            <label style={{ fontSize: 13, color: 'var(--text)' }}>Timezone label <input value={settings.timezone || ''} onChange={e => setSettings(s => ({ ...s, timezone: e.target.value }))} placeholder="Asia/Karachi" style={{ ...fld, width: 160, marginLeft: 6 }} /></label>
          </div>
          <label className="ms-label" style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>Blackout dates (YYYY-MM-DD, one per line)</label>
          <textarea value={(settings.blackout || []).join('\n')} onChange={e => setSettings(s => ({ ...s, blackout: e.target.value.split(/\s+/).map(x => x.trim()).filter(Boolean) }))} rows={2} placeholder="2026-12-25" style={{ width: '100%', maxWidth: 320, ...fld, resize: 'vertical', boxSizing: 'border-box' }} />
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 14px' }}>Intake questions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(settings.intake || []).map((q, i) => (
              <div key={i} className="r-wrap" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={q.label} onChange={e => setSettings(s => ({ ...s, intake: s.intake.map((x, j) => j === i ? { ...x, label: e.target.value } : x) }))} placeholder="e.g. What's the occasion?" style={{ flex: 1, ...fld }} />
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><input type="checkbox" checked={!!q.required} onChange={e => setSettings(s => ({ ...s, intake: s.intake.map((x, j) => j === i ? { ...x, required: e.target.checked } : x) }))} /> required</label>
                <button onClick={() => setSettings(s => ({ ...s, intake: s.intake.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button onClick={() => setSettings(s => ({ ...s, intake: [...(s.intake || []), { label: 'Question', required: false }] }))} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Plus size={14} /> Add question</button>
        </div>

        <button onClick={save} style={{ padding: '12px 22px', borderRadius: 11, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: 14.5 }}>Save &amp; publish</button>

        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '28px 0 12px' }}>Upcoming</h2>
        {bookings.length === 0 ? <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>No bookings yet — share your link to get started.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bookings.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{b.name} · {b.service}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{new Date(b.start_at.replace(' ', 'T')).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{b.phone ? ` · ${b.phone}` : ''}</div>
                </div>
                {b.lead_id && <button onClick={() => router.push(`/leads/${b.lead_id}`)} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>Open lead →</button>}
              </div>
            ))}
          </div>
        )}
      </div>
    </NavBar>
  );
}
const fld = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, outline: 'none' };
