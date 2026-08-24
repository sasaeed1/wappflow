'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ccApi, fmtNum } from '@/lib/ccApi';
import { Card } from '@/components/control/ControlShell';
import { clickable } from '@/lib/a11y';

export default function Adoption() {
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { ccApi.adoption().then((r) => setD(r.data)).catch((e) => setErr(e.response?.data?.error || 'Failed')); }, []);

  if (err) return <div style={{ color: '#f87171' }}>{err}</div>;
  if (!d) return <div style={{ color: 'var(--text-dim,#666)' }}>Loading…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Feature Adoption</h1>
        <span style={{ color: 'var(--text-dim,#666)', fontSize: 13 }}>across {fmtNum(d.total)} workspaces</span>
      </div>

      <Card>
        <h3 style={h3}>Module adoption</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {d.modules.map((m) => (
            <div key={m.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                <span style={{ fontWeight: 600 }}>{m.label}</span>
                <span style={{ color: 'var(--text-dim,#666)' }}>{fmtNum(m.count)} · {m.pct}%</span>
              </div>
              <div style={{ height: 9, borderRadius: 999, background: 'var(--bg,#0a0a0f)', overflow: 'hidden' }}>
                <div style={{ width: `${m.pct}%`, height: '100%', borderRadius: 999, background: m.pct >= 50 ? '#34d399' : m.pct >= 20 ? '#60a5fa' : '#fbbf24' }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)', marginTop: 12 }}>Low-adoption modules are expansion opportunities — surface them in onboarding or upsell.</div>
      </Card>

      <Card>
        <h3 style={h3}>Power users (top health)</h3>
        {!d.powerUsers.length && <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>No scores yet — run a rollup from Customer Health.</div>}
        {d.powerUsers.map((w) => (
          <div key={w.id} {...clickable(() => router.push(`/control/customers/${w.id}`))} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border,#1e1e26)', cursor: 'pointer', fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{w.name || 'Untitled'}</span>
            <span style={{ color: 'var(--text-dim,#666)' }}>health {w.health} · expansion {w.expansion}</span>
          </div>
        ))}
      </Card>
    </div>
  );
}

const h3 = { fontSize: 13, fontWeight: 700, margin: '0 0 14px', color: 'var(--text-muted,#9a9aa5)' };
