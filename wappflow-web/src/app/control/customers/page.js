'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ccApi, fmtBytes, fmtNum } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';
import ExportButton from '@/components/control/ExportButton';

export default function Customers() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await ccApi.workspaces({ q, plan, status, limit, offset, sort: 'last_active', dir: 'desc' });
      setRows(r.data.rows); setTotal(r.data.total);
    } catch { setRows([]); }
    setLoading(false);
  }, [q, plan, status, offset]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Customers</h1>
        <span style={{ color: 'var(--text-dim,#666)', fontSize: 13 }}>{fmtNum(total)} workspaces</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={q} onChange={(e) => { setOffset(0); setQ(e.target.value); }} placeholder="Search name / owner email…" style={inp} />
        <select value={plan} onChange={(e) => { setOffset(0); setPlan(e.target.value); }} style={sel}>
          <option value="">All plans</option><option value="free">Free</option><option value="starter">Starter</option><option value="growth">Growth</option><option value="enterprise">Enterprise</option>
        </select>
        <select value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value); }} style={sel}>
          <option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </select>
        <div style={{ flex: 1 }} />
        <ExportButton dataset="customers" params={{ q, plan, status }} />
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-dim,#666)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4 }}>
              {['Workspace', 'Owner', 'Plan', 'Status', 'Users', 'Leads', 'Storage', 'Last active'].map((h) => (
                <th key={h} style={{ padding: '11px 14px', borderBottom: '1px solid var(--border,#1e1e26)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} style={{ padding: 20, color: 'var(--text-dim,#666)' }}>Loading…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={8} style={{ padding: 20, color: 'var(--text-dim,#666)' }}>No workspaces.</td></tr>}
            {rows.map((w) => (
              <tr key={w.id} onClick={() => router.push(`/control/customers/${w.id}`)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border,#1e1e26)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg,#0a0a0f)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <td style={td}><div style={{ fontWeight: 600 }}>{w.name || 'Untitled'}</div></td>
                <td style={td}><div>{w.owner_email || '—'}</div><div style={{ color: 'var(--text-dim,#666)', fontSize: 11.5 }}>{w.owner_name}</div></td>
                <td style={td}><Pill tone={planTone(w.plan)}>{w.plan}</Pill></td>
                <td style={td}><Pill tone={w.status === 'suspended' ? 'red' : 'green'}>{w.status}</Pill></td>
                <td style={td}>{fmtNum(w.users)}</td>
                <td style={td}>{fmtNum(w.leads)}</td>
                <td style={td}>{fmtBytes(w.storage_bytes)}</td>
                <td style={{ ...td, color: 'var(--text-dim,#666)' }}>{w.last_active ? new Date(w.last_active + 'Z').toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} style={pgBtn}>← Prev</button>
          <span style={{ alignSelf: 'center', fontSize: 12.5, color: 'var(--text-dim,#666)' }}>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
          <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} style={pgBtn}>Next →</button>
        </div>
      )}
    </div>
  );
}

const inp = { padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text,#e8e8ea)', fontSize: 13, minWidth: 220 };
const sel = { ...inp, minWidth: 140 };
const td = { padding: '11px 14px' };
const pgBtn = { padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text,#e8e8ea)', fontSize: 13, cursor: 'pointer' };
function planTone(p) { return ({ free: 'neutral', starter: 'blue', growth: 'purple', enterprise: 'green' })[p] || 'neutral'; }
