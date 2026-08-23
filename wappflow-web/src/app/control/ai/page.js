'use client';
import { useEffect, useState } from 'react';
import { ccApi, fmtMoney, fmtNum } from '@/lib/ccApi';
import { Card, Stat, Pill } from '@/components/control/ControlShell';
import ExportButton from '@/components/control/ExportButton';

export default function AICenter() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { ccApi.ai().then((r) => setD(r.data)).catch((e) => setErr(e.response?.data?.error || 'Failed')); }, []);

  if (err) return <div style={{ color: '#f87171' }}>{err}</div>;
  if (!d) return <div style={{ color: 'var(--text-dim,#666)' }}>Loading…</div>;

  if (!d.metered) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>AI Control Center</h1>
        <Card><div style={{ fontSize: 13.5, color: 'var(--text-muted,#9a9aa5)' }}>
          No AI calls metered yet. Metering is live (every LLM call now records provider, tokens, latency, cost &amp; success to <code>ai_usage</code>) — this page populates as the app makes AI requests (summaries, reply suggestions, AI command, industry, knowledge).
        </div></Card>
      </div>
    );
  }

  const { totals, byProvider, byFeature, recent } = d;
  const successRate = totals.calls ? Math.round((totals.ok / totals.calls) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>AI Control Center</h1>
        <div style={{ flex: 1 }} />
        <ExportButton dataset="ai_usage" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 14 }}>
        <Stat label="Total AI calls" value={fmtNum(totals.calls)} />
        <Stat label="Est. cost" value={fmtMoney((totals.cost || 0).toFixed(4))} sub="rough estimate" accent="#34d399" />
        <Stat label="Tokens" value={fmtNum(totals.tokens)} />
        <Stat label="Avg latency" value={`${Math.round(totals.avg_latency)} ms`} />
        <Stat label="Success rate" value={`${successRate}%`} accent={successRate >= 95 ? '#34d399' : '#fbbf24'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16 }}>
        <Card>
          <h3 style={h3}>By provider</h3>
          {byProvider.map((p) => (
            <div key={p.provider} style={row}><span><Pill tone="purple">{p.provider}</Pill></span><span style={{ fontWeight: 700 }}>{fmtNum(p.calls)} · {fmtMoney((p.cost || 0).toFixed(4))}</span></div>
          ))}
        </Card>
        <Card>
          <h3 style={h3}>By feature</h3>
          {byFeature.map((f) => (
            <div key={f.feature} style={row}>
              <span>{f.feature}</span>
              <span style={{ color: 'var(--text-dim,#666)', fontSize: 12.5 }}>{fmtNum(f.calls)} calls · {Math.round(f.avg_latency)}ms · {fmtMoney((f.cost || 0).toFixed(4))}</span>
            </div>
          ))}
          {byFeature.some((f) => f.feature === '(unattributed)') && (
            <div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)', marginTop: 8 }}>Per-feature/workspace attribution fills in as call sites pass context (callAI accepts an optional ctx arg).</div>
          )}
        </Card>
      </div>

      <Card style={{ padding: 0 }}>
        <h3 style={{ ...h3, padding: '16px 16px 0' }}>Recent calls</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 8 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-dim,#666)', fontSize: 11 }}>
            {['When', 'Provider', 'Model', 'Tokens', 'Latency', 'OK'].map((h) => <th key={h} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border,#1e1e26)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {recent.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border,#1e1e26)' }}>
                <td style={td}>{r.ts ? new Date(r.ts + 'Z').toLocaleTimeString() : ''}</td>
                <td style={td}>{r.provider}</td>
                <td style={td}>{r.model}</td>
                <td style={td}>{fmtNum((r.prompt_tokens || 0) + (r.completion_tokens || 0))}</td>
                <td style={td}>{r.latency_ms}ms</td>
                <td style={td}>{r.success ? <Pill tone="green">ok</Pill> : <Pill tone="red">fail</Pill>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const h3 = { fontSize: 13, fontWeight: 700, margin: '0 0 12px', color: 'var(--text-muted,#9a9aa5)' };
const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border,#1e1e26)', fontSize: 13 };
const td = { padding: '8px 14px' };
