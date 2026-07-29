'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { fetchBookingManage, rescheduleBookingPublic, cancelBookingPublic } from '../../../../lib/api';
import { useConfirm } from '@/lib/confirm';

import PublicScope from '@/components/PublicScope';
import PublicFooter from '@/components/PublicFooter';

const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtTime = (iso) => new Date(iso.replace(' ', 'T')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const fmtFull = (iso) => new Date(iso.replace(' ', 'T')).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function BookingManagePage() {
  const { token } = useParams();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [mode, setMode] = useState(null); // null | reschedule
  const [day, setDay] = useState(null);
  const [time, setTime] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = () => fetchBookingManage(token).then(d => { setData(d); setState('ok'); }).catch(() => setState('missing'));
  useEffect(() => { load(); }, [token]);

  const days = data?.slots || [];
  const activeDay = useMemo(() => days.find(d => d.date === day) || days[0], [days, day]);

  const reschedule = async () => { if (!time) return; setBusy(true); try { await rescheduleBookingPublic(token, time); setMsg('Rescheduled — see you then!'); setMode(null); load(); } catch (e) { setMsg(e.message || 'Failed'); } finally { setBusy(false); } };
  const cancel = async () => {
    const ok = await confirm({ title: 'Cancel this booking?', message: 'Your reserved time slot will be released.', tone: 'danger', confirmLabel: 'Cancel booking', cancelLabel: 'Keep booking', requireTyped: 'CANCEL' });
    if (!ok) return;
    setBusy(true);
    try { await cancelBookingPublic(token); setMsg('Your booking has been cancelled.'); load(); } finally { setBusy(false); }
  };

  if (state === 'loading') return <div style={c}><div style={sp} /><style>{`@keyframes csp{to{transform:rotate(360deg)}}`}</style></div>;
  if (state !== 'ok') return <div style={{ ...c, flexDirection: 'column', gap: 8 }}><h1 style={{ margin: 0, fontSize: 24 }}>Booking not found</h1><p style={{ color: '#70707a' }}>This link is incorrect or expired.</p></div>;
  const b = data.booking;

  return (
    <div className="wf-public" style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f6f7f9,#eceef2)' }}>
      <PublicScope />
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '0 16px 60px' }}>
        <header style={{ textAlign: 'center', padding: '44px 0 24px' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 20, marginBottom: 14 }}>{(data.brand || '')[0]?.toUpperCase()}</div>
          <h1 style={{ fontSize: 'clamp(22px,5vw,28px)', fontWeight: 800, color: '#16161a', margin: 0 }}>Manage your booking</h1>
        </header>

        <div style={{ background: '#fff', border: '1px solid #ececf1', borderRadius: 16, padding: 18, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#16161a' }}>{b.service}</div>
          <div style={{ fontSize: 14, color: '#70707a', marginTop: 4 }}>{fmtFull(b.start_at)}</div>
          <div style={{ marginTop: 8, display: 'inline-block', fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: b.status === 'cancelled' ? '#fee2e2' : '#dcfce7', color: b.status === 'cancelled' ? '#dc2626' : '#16a34a', textTransform: 'capitalize' }}>{b.status}</div>
        </div>

        {msg && <div style={{ padding: '12px 14px', borderRadius: 12, background: '#eef2ff', color: '#3730a3', fontSize: 13.5, marginBottom: 14 }}>{msg}</div>}

        {b.status !== 'cancelled' && (
          mode === 'reschedule' ? (
            <div style={{ background: '#fff', border: '1px solid #ececf1', borderRadius: 16, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#16161a', marginBottom: 10 }}>Pick a new time</div>
              <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
                {days.map(d => <button key={d.date} onClick={() => { setDay(d.date); setTime(null); }} style={{ flexShrink: 0, padding: '9px 13px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${(activeDay?.date === d.date) ? '#6366f1' : '#e2e2e8'}`, background: (activeDay?.date === d.date) ? 'rgba(99,102,241,0.08)' : '#fff', fontSize: 13, fontWeight: 700 }}>{fmtDate(d.date)}</button>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(84px,1fr))', gap: 8, marginTop: 10 }}>
                {(activeDay?.times || []).map(t => <button key={t} onClick={() => setTime(t)} style={{ padding: '10px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${time === t ? '#6366f1' : '#e2e2e8'}`, background: time === t ? '#6366f1' : '#fff', color: time === t ? '#fff' : '#16161a', fontSize: 13, fontWeight: 700 }}>{fmtTime(t)}</button>)}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button onClick={() => setMode(null)} style={{ padding: '12px 16px', borderRadius: 11, border: '1px solid #e2e2e8', background: '#fff', cursor: 'pointer', fontWeight: 600, color: '#70707a' }}>Back</button>
                <button onClick={reschedule} disabled={busy || !time} style={{ flex: 1, padding: '12px', borderRadius: 11, border: 'none', cursor: 'pointer', background: '#16161a', color: '#fff', fontWeight: 800 }}>{busy ? 'Saving…' : 'Confirm new time'}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setMode('reschedule')} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid #e2e2e8', background: '#fff', cursor: 'pointer', fontWeight: 700, color: '#16161a' }}>Reschedule</button>
              <button onClick={cancel} disabled={busy} style={{ flex: 1, padding: '13px', borderRadius: 12, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', fontWeight: 700, color: '#dc2626' }}>Cancel booking</button>
            </div>
          )
        )}
        <PublicFooter brand={data.brand} style={{ padding: '14px 0 0' }} />
      </div>
    </div>
  );
}
const c = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eceef2', padding: 16 };
const sp = { width: 26, height: 26, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: '#16161a', borderRadius: '50%', animation: 'csp .9s linear infinite' };
