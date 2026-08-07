'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, Eye, Clock, CheckCircle2, DollarSign, Timer } from 'lucide-react';
import { csAPI } from '../../../lib/api';

const fmtSecs = (s) => (s >= 60 ? `${Math.round(s / 60)}m ${s % 60}s` : `${s}s`);

export default function AnalyticsPage() {
  const router = useRouter();
  const [a, setA] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/contracts/analytics'); return; }
    csAPI.analytics().then(r => setA(r.data)).catch(() => setErr(true));
  }, []); // eslint-disable-line

  const Stat = ({ icon: Icon, label, value, tint }) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, background: tint || 'var(--accent-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={16} style={{ color: 'var(--accent)' }} /></span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.5px' }}>{value}</div>
    </div>
  );

  const funnel = a?.funnel || { sent: 0, viewed: 0, completed: 0 };
  const fmax = Math.max(funnel.sent, 1);
  const stages = [['Sent', funnel.sent, '#6366f1'], ['Viewed', funnel.viewed, '#0ea5e9'], ['Signed', funnel.completed, '#10b981']];

  return (
    <>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 20px 60px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px', letterSpacing: '-0.5px' }}>Analytics</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 24px' }}>How your documents perform — from sent to signed.</p>

        {err && <p style={{ color: 'var(--text-muted)' }}>Couldn’t load analytics.</p>}
        {!a && !err && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

        {a && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px,1fr))', gap: 14, marginBottom: 26 }}>
              <Stat icon={DollarSign} label="Signed revenue" value={`$${(a.revenue || 0).toLocaleString()}`} />
              <Stat icon={CheckCircle2} label="Acceptance rate" value={`${a.acceptanceRate || 0}%`} />
              <Stat icon={Eye} label="Total views" value={(a.totalViews || 0).toLocaleString()} />
              <Stat icon={Clock} label="Avg. time on page" value={fmtSecs(a.avgViewSeconds || 0)} />
              <Stat icon={Timer} label="Avg. time to sign" value={a.avgSignHours ? `${a.avgSignHours}h` : '—'} />
              <Stat icon={TrendingUp} label="Total documents" value={a.totalDocs || 0} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 18 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 18px' }}>Conversion funnel</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {stages.map(([label, val, color]) => (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span><span style={{ color: 'var(--text)', fontWeight: 800 }}>{val}</span></div>
                      <div style={{ height: 10, borderRadius: 999, background: 'var(--surface2)', overflow: 'hidden' }}><div style={{ width: `${Math.round((val / fmax) * 100)}%`, height: '100%', borderRadius: 999, background: color, transition: 'width .5s' }} /></div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 16px' }}>Most-viewed documents</h3>
                {(a.topViewed || []).length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No views yet — send a document to start tracking.</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {a.topViewed.map((d, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', width: 18 }}>{i + 1}</span>
                        <span style={{ flex: 1, fontSize: 13.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title || 'Untitled'}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Eye size={13} /> {d.views}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
