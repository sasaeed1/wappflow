'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ccApi } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';
import ExportButton from '@/components/control/ExportButton';
import { clickableRow } from '@/lib/a11y';

const RISK_LABELS = {
  inactive_30d: 'Inactive 30d+', inactive_14d: 'Inactive 14d+', no_messages: 'No messages',
  no_contracts: 'No contracts', no_projects: 'No projects', no_ai: 'No AI use', low_adoption: 'Low adoption',
};

export default function Health() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [computed, setComputed] = useState(true);
  const [sort, setSort] = useState('churn');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    ccApi.health(sort).then((r) => { setRows(r.data.rows); setComputed(r.data.computed); }).catch(() => setRows([]));
  }, [sort]);
  useEffect(() => { load(); }, [load]);

  const recompute = async () => { setBusy(true); try { await ccApi.runRollup(); load(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } setBusy(false); };

  const scoreColor = (n, invert) => {
    if (n == null) return 'var(--text-dim,#666)';
    const good = invert ? n < 34 : n >= 67; const bad = invert ? n > 66 : n < 34;
    return good ? '#34d399' : bad ? '#f87171' : '#fbbf24';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Customer Health</h1>
        <div style={{ flex: 1 }} />
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={sel}>
          <option value="churn">Sort: churn risk</option><option value="health">Sort: health</option>
          <option value="expansion">Sort: expansion</option><option value="activity">Sort: activity</option>
        </select>
        <button disabled={busy} onClick={recompute} style={btn}>{busy ? 'Recomputing…' : 'Recompute now'}</button>
        <ExportButton dataset="health" params={{ sort }} />
      </div>

      {!computed && <Card style={{ background: '#fbbf2410', borderColor: '#fbbf2433' }}><div style={{ fontSize: 12.5, color: '#fbbf24' }}>⚠ Scores not computed yet — they run nightly + ~8s after API boot. Click “Recompute now”.</div></Card>}

      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-dim,#666)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4 }}>
            {['Workspace', 'Plan', 'Health', 'Churn', 'Expansion', 'Activity', 'Risk factors'].map((h) => (
              <th key={h} style={{ padding: '11px 14px', borderBottom: '1px solid var(--border,#1e1e26)' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={7} style={{ padding: 20, color: 'var(--text-dim,#666)' }}>No data.</td></tr>}
            {rows.map((w) => (
              <tr key={w.id} {...clickableRow(() => router.push(`/control/customers/${w.id}`))} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border,#1e1e26)' }}>
                <td style={td}><div style={{ fontWeight: 600 }}>{w.name || 'Untitled'}</div></td>
                <td style={td}><Pill tone={w.plan === 'enterprise' ? 'green' : w.plan === 'growth' ? 'purple' : 'blue'}>{w.plan}</Pill></td>
                <td style={{ ...td, fontWeight: 700, color: scoreColor(w.health) }}>{w.health ?? '—'}</td>
                <td style={{ ...td, fontWeight: 700, color: scoreColor(w.churn, true) }}>{w.churn ?? '—'}</td>
                <td style={{ ...td, fontWeight: 700, color: scoreColor(w.expansion) }}>{w.expansion ?? '—'}</td>
                <td style={{ ...td, fontWeight: 700, color: scoreColor(w.activity) }}>{w.activity ?? '—'}</td>
                <td style={td}>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {(w.risk_factors || []).map((r) => <Pill key={r} tone="red">{RISK_LABELS[r] || r}</Pill>)}
                    {!(w.risk_factors || []).length && <span style={{ color: 'var(--text-dim,#666)', fontSize: 12 }}>—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const sel = { padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text,#e8e8ea)', fontSize: 13 };
const btn = { padding: '8px 14px', borderRadius: 9, border: '1px solid #818cf855', background: '#818cf81a', color: '#818cf8', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const td = { padding: '11px 14px' };
