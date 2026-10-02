'use client';
import { useEffect, useState } from 'react';
import { ccApi, fmtBytes, fmtMoney, fmtNum } from '@/lib/ccApi';
import { Card, Stat, Pill, useCc } from '@/components/control/ControlShell';
import { Sparkline, H3, Row, Muted } from '@/components/control/kit';

// Executive Overview. Revenue is REAL where billing is recorded (Billing → MRR),
// with the implied figure (every workspace at list price) beside it for contrast.
export default function Overview() {
  const { can } = useCc();
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    ccApi.overview().then((r) => setData(r.data)).catch((e) => setErr(e.response?.data?.error || 'Could not load the overview'));
    ccApi.platformUsage(30).then((r) => setTrend(r.data.rows)).catch(() => setTrend([]));
  }, []);

  if (err) return <Card><div style={{ color: '#f87171' }}>{err}</div></Card>;
  if (!data) return <Muted>Loading…</Muted>;

  const { revenue, workspaces, totals, ai } = data;
  const series = (k) => (trend || []).map((r) => r[k] || 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Overview</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 180px),1fr))', gap: 12 }}>
        <Stat label="MRR" value={fmtMoney(revenue.mrr)} sub={can('manage_billing') ? `${revenue.paying} paying · recorded in Billing` : 'recorded in Billing'} accent="#34d399" />
        {can('manage_billing') && <Stat label="Outstanding" value={fmtMoney(revenue.outstanding)} sub="owed to you" accent={revenue.outstanding > 0 ? '#f87171' : undefined} />}
        <Stat label="Implied MRR" value={fmtMoney(revenue.implied_mrr)} sub="if every workspace paid list price" />
        <Stat label="Workspaces" value={fmtNum(workspaces.total)} />
        <Stat label="Users" value={fmtNum(totals.users)} />
        <Stat label="Leads" value={fmtNum(totals.leads)} />
        <Stat label="Storage" value={fmtBytes(totals.storage_bytes)} />
        <Stat label="Contracts" value={fmtNum(totals.contracts)} />
      </div>

      <Card>
        <H3>Last 30 days across the platform</H3>
        {!trend ? <Muted>Loading…</Muted> : !trend.length ? <Muted>Daily history starts building from tonight’s rollup.</Muted> : (
          <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
            {[['active_workspaces', 'Active workspaces', '#34d399'], ['leads', 'New leads', '#818cf8'], ['messages', 'Messages', '#60a5fa'], ['contracts', 'Contracts', '#fbbf24']].map(([k, l, c]) => (
              <div key={k}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}><span style={{ color: 'var(--text-muted,#9a9aa5)' }}>{l}</span><strong>{fmtNum(k === 'active_workspaces' ? series(k).slice(-1)[0] : series(k).reduce((a, b) => a + b, 0))}</strong></div>
                <Sparkline values={series(k)} color={c} label={l} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
        <Card>
          <H3>Workspaces by plan</H3>
          {workspaces.by_plan.map((p) => <Row key={p.plan}><Pill tone="blue">{p.plan}</Pill><strong>{fmtNum(p.c)}</strong></Row>)}
        </Card>
        <Card>
          <H3>Workspaces by status</H3>
          {workspaces.by_status.map((s) => <Row key={s.status}><Pill tone={s.status === 'suspended' ? 'red' : 'green'}>{s.status}</Pill><strong>{fmtNum(s.c)}</strong></Row>)}
        </Card>
        <Card>
          <H3>AI usage (all time)</H3>
          {ai.metered
            ? <Row><span>Calls · estimated cost</span><strong>{fmtNum(ai.calls)} · {fmtMoney(ai.cost, true)}</strong></Row>
            : <Muted>No AI calls recorded yet.</Muted>}
        </Card>
      </div>
    </div>
  );
}
