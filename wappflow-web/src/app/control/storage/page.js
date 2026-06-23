'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ccApi, fmtBytes, fmtNum } from '@/lib/ccApi';
import { Card } from '@/components/control/ControlShell';

// Command Center · Storage dashboard (Phase 10). Global R2 usage + cost + the
// largest workspaces, from the per-asset storage_size tracking.
export default function StorageDashboard() {
  const router = useRouter();
  const [ov, setOv] = useState(null);
  const [ws, setWs] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    ccApi.storageOverview().then((r) => setOv(r.data)).catch((e) => setErr(e.response?.data?.error || 'Failed'));
    ccApi.storageWorkspaces().then((r) => setWs(r.data.workspaces || [])).catch(() => {});
  }, []);

  if (err) return <div style={{ color: '#f87171' }}>{err}</div>;
  if (!ov) return <div style={{ color: 'var(--text-dim,#666)' }}>Loading…</div>;

  const maxBytes = Math.max(1, ...ws.map((w) => w.bytes));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Storage</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Stat label="Total stored" value={fmtBytes(ov.total_bytes)} />
        <Stat label="On Cloudflare R2" value={`${ov.r2_gb} GB`} />
        <Stat label="Est. next invoice" value={`$${ov.est_monthly_cost_usd}`} sub={`first ${ov.free_gb} GB free · $${ov.rate_per_gb_usd}/GB`} />
        <Stat label="Growth (30d)" value={fmtBytes(ov.growth_30d_bytes)} />
      </div>

      <Card>
        <h3 style={h3}>By provider</h3>
        {ov.by_provider.map((p) => (
          <div key={p.provider} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border,#1e1e26)', fontSize: 13 }}>
            <span style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{p.provider}</span>
            <span style={{ color: 'var(--text-dim,#666)' }}>{fmtBytes(p.bytes)} · {fmtNum(p.files)} files</span>
          </div>
        ))}
      </Card>

      <Card>
        <h3 style={h3}>Largest workspaces (top 20)</h3>
        {!ws.length && <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>No storage tracked yet.</div>}
        {ws.map((w) => (
          <div key={w.workspace_id} onClick={() => router.push(`/control/customers/${w.workspace_id}`)} style={{ cursor: 'pointer', padding: '8px 0', borderBottom: '1px solid var(--border,#1e1e26)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
              <span style={{ fontFamily: 'monospace' }}>{String(w.workspace_id).slice(0, 14)}</span>
              <span style={{ color: 'var(--text-dim,#666)' }}>{fmtBytes(w.bytes)} · {fmtNum(w.files)} files</span>
            </div>
            <div style={{ height: 7, borderRadius: 999, background: 'var(--bg,#0a0a0f)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round((w.bytes / maxBytes) * 100)}%`, height: '100%', borderRadius: 999, background: '#a855f7' }} />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={{ background: 'var(--surface,#13131a)', border: '1px solid var(--border,#1e1e26)', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim,#666)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: 'var(--text-dim,#666)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const h3 = { fontSize: 13, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-muted,#9a9aa5)' };
