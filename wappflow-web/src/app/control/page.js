'use client';
import { useEffect, useState } from 'react';
import { ccApi, fmtBytes, fmtMoney, fmtNum } from '@/lib/ccApi';
import { Card, Stat, Pill } from '@/components/control/ControlShell';

export default function Overview() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { ccApi.overview().then((r) => setData(r.data)).catch((e) => setErr(e.response?.data?.error || 'Failed to load')); }, []);

  if (err) return <div style={{ color: '#f87171' }}>{err}</div>;
  if (!data) return <div style={{ color: 'var(--text-dim,#666)' }}>Loading…</div>;

  const { revenue, workspaces, totals, ai } = data;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Executive Overview</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 14 }}>
        <Stat label="Implied MRR" value={fmtMoney(revenue.implied_mrr)} sub="from plan list price" accent="#34d399" />
        <Stat label="Implied ARR" value={fmtMoney(revenue.implied_arr)} sub="implied_mrr × 12" />
        <Stat label="Workspaces" value={fmtNum(workspaces.total)} />
        <Stat label="Users" value={fmtNum(totals.users)} />
        <Stat label="Leads" value={fmtNum(totals.leads)} />
        <Stat label="Storage" value={fmtBytes(totals.storage_bytes)} />
        <Stat label="Contracts" value={fmtNum(totals.contracts)} />
        <Stat label="Galleries" value={fmtNum(totals.galleries)} />
      </div>

      <Card style={{ background: '#fbbf2410', borderColor: '#fbbf2433' }}>
        <div style={{ fontSize: 12.5, color: '#fbbf24' }}>⚠ {revenue.note}</div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <h3 style={h3}>Workspaces by plan</h3>
          {workspaces.by_plan.map((p) => (
            <Row key={p.plan} left={<Pill tone={planTone(p.plan)}>{p.plan}</Pill>} right={fmtNum(p.c)} />
          ))}
        </Card>
        <Card>
          <h3 style={h3}>Workspaces by status</h3>
          {workspaces.by_status.map((s) => (
            <Row key={s.status} left={<Pill tone={s.status === 'suspended' ? 'red' : 'green'}>{s.status}</Pill>} right={fmtNum(s.c)} />
          ))}
        </Card>
      </div>

      <Card>
        <h3 style={h3}>AI usage</h3>
        {ai.metered
          ? <Row left="Total AI calls" right={`${fmtNum(ai.calls)} · ${fmtMoney(ai.cost)}`} />
          : <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>Not metered yet — AI cost tracking activates once <code>ai_usage</code> instrumentation lands in the engine (spec §1.5).</div>}
      </Card>
    </div>
  );
}

const h3 = { fontSize: 13, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-muted,#9a9aa5)' };
function Row({ left, right }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border,#1e1e26)' }}><span>{left}</span><span style={{ fontWeight: 700 }}>{right}</span></div>;
}
function planTone(p) { return ({ free: 'neutral', starter: 'blue', growth: 'purple', enterprise: 'green' })[p] || 'neutral'; }
