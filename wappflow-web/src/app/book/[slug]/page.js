'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { fetchBookingPublic, createBooking } from '../../../lib/api';

const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (iso) => new Date(iso.replace(' ', 'T')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export default function BookingPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [service, setService] = useState(null);
  const [day, setDay] = useState(null);
  const [time, setTime] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    fetchBookingPublic(slug).then(d => { setData(d); setState('ok'); setService((d.services || [])[0]?.name || null); document.title = `Book · ${d.brand}`; }).catch(() => setState('missing'));
  }, [slug]);

  const days = data?.slots || [];
  const activeDay = useMemo(() => days.find(d => d.date === day) || days[0], [days, day]);

  const book = async () => {
    setErr(''); if (!time) { setErr('Pick a time'); return; } if (!form.name || !(form.phone || form.email)) { setErr('Name and a phone or email are required'); return; }
    setBusy(true);
    try { const r = await createBooking(slug, { service, start_at: time, ...form }); setDone(r); }
    catch (e) { setErr(e.message || 'Could not book'); setBusy(false); }
  };

  if (state === 'loading') return <div style={center}><div style={spinner} /><style>{`@keyframes csp{to{transform:rotate(360deg)}}`}</style></div>;
  if (state !== 'ok') return <div style={{ ...center, flexDirection: 'column', gap: 8, textAlign: 'center', padding: 24 }}><h1 style={{ fontSize: 24, margin: 0 }}>Not available</h1><p style={{ color: '#70707a' }}>This booking link is unavailable.</p></div>;

  if (done) return (
    <div style={{ ...center, flexDirection: 'column', gap: 10, textAlign: 'center', padding: 24 }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28 }}>✓</div>
      <h1 style={{ fontSize: 26, margin: '6px 0 0', color: '#16161a' }}>You’re booked!</h1>
      <p style={{ color: '#70707a', fontSize: 15 }}>{done.service} · {new Date(done.start_at.replace(' ', 'T')).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
      <p style={{ color: '#9aa0aa', fontSize: 13 }}>A confirmation has been sent. See you then.</p>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f6f7f9,#eceef2)' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px 60px' }}>
        <header style={{ textAlign: 'center', padding: '44px 0 28px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20, marginBottom: 14 }}>{(data.brand || 'W')[0].toUpperCase()}</div>
          <h1 style={{ fontSize: 'clamp(24px,5vw,30px)', fontWeight: 800, color: '#16161a', margin: 0, letterSpacing: '-0.02em' }}>Book with {data.brand}</h1>
          <p style={{ fontSize: 14.5, color: '#70707a', margin: '6px 0 0' }}>Choose a service and a time that works for you.</p>
        </header>

        <Card title="Service">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(data.services || []).map((s, i) => (
              <button key={i} onClick={() => setService(s.name)} style={{ padding: '10px 14px', borderRadius: 11, cursor: 'pointer', border: `1.5px solid ${service === s.name ? '#6366f1' : '#e2e2e8'}`, background: service === s.name ? 'rgba(99,102,241,0.08)' : '#fff', textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#16161a' }}>{s.name}</div>
                <div style={{ fontSize: 12, color: '#8a8a93' }}>{s.duration} min{s.price > 0 ? ` · $${s.price}` : ''}</div>
              </button>
            ))}
          </div>
        </Card>

        {days.length === 0 ? <Card title="Availability"><p style={{ color: '#8a8a93', fontSize: 14, margin: 0 }}>No open times right now — please check back soon.</p></Card> : (
          <>
            <Card title="Day">
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                {days.map(d => (
                  <button key={d.date} onClick={() => { setDay(d.date); setTime(null); }} style={{ flexShrink: 0, padding: '10px 14px', borderRadius: 11, cursor: 'pointer', border: `1.5px solid ${(activeDay?.date === d.date) ? '#6366f1' : '#e2e2e8'}`, background: (activeDay?.date === d.date) ? 'rgba(99,102,241,0.08)' : '#fff', fontSize: 13, fontWeight: 700, color: '#16161a' }}>{fmtDate(d.date)}</button>
                ))}
              </div>
            </Card>
            <Card title="Time">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(86px,1fr))', gap: 8 }}>
                {(activeDay?.times || []).map(t => (
                  <button key={t} onClick={() => setTime(t)} style={{ padding: '10px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${time === t ? '#6366f1' : '#e2e2e8'}`, background: time === t ? '#6366f1' : '#fff', color: time === t ? '#fff' : '#16161a', fontSize: 13, fontWeight: 700 }}>{fmtTime(t)}</button>
                ))}
              </div>
            </Card>
            <Card title="Your details">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" style={inp} />
                <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone (for WhatsApp confirmation)" style={inp} />
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email (optional)" style={inp} />
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anything we should know? (optional)" rows={2} style={{ ...inp, resize: 'vertical' }} />
              </div>
              {err && <p style={{ color: '#dc2626', fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
              <button onClick={book} disabled={busy} style={{ width: '100%', marginTop: 14, padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#16161a', color: '#fff', fontWeight: 800, fontSize: 15 }}>{busy ? 'Booking…' : time ? `Confirm ${fmtTime(time)}` : 'Confirm booking'}</button>
            </Card>
          </>
        )}
        <p style={{ textAlign: 'center', fontSize: 12, color: '#a8aeb8', marginTop: 24 }}>Powered by {data.brand}</p>
      </div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #ececf1', borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a8a93', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  );
}
const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eceef2' };
const spinner = { width: 26, height: 26, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: '#16161a', borderRadius: '50%', animation: 'csp .9s linear infinite' };
const inp = { width: '100%', padding: '12px 13px', borderRadius: 10, border: '1px solid #d8d8e0', background: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
