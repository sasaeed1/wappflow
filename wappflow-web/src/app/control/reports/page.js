'use client';
import { useEffect, useState, useCallback } from 'react';
import { ccApi, BASE_URL } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';

const DATASETS = [
  { key: 'customers', label: 'Customers' },
  { key: 'health', label: 'Customer Health' },
  { key: 'audit', label: 'Audit log' },
  { key: 'ai_usage', label: 'AI usage' },
];
const SCHEDULES = ['none', 'daily', 'weekly', 'monthly'];

export default function Reports() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', dataset: 'customers', schedule: 'none', recipients: '' });

  const load = useCallback(() => { ccApi.reports().then((r) => setRows(r.data.reports || [])).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  const toast = (t) => { setMsg(t); setTimeout(() => setMsg(''), 3000); };

  const create = async () => {
    if (!form.name.trim()) return alert('Name required');
    try {
      await ccApi.createReport({
        name: form.name.trim(),
        definition: { dataset: form.dataset },
        schedule: form.schedule,
        recipients: form.recipients.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setShowNew(false); setForm({ name: '', dataset: 'customers', schedule: 'none', recipients: '' }); load();
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
  };

  const run = async (r) => {
    setBusy(r.id);
    try { const res = await ccApi.runReport(r.id); toast(`${r.name}: ${res.data.count} rows${res.data.emailed ? ' · emailed' : ''}`); load(); }
    catch (e) { alert(e.response?.data?.error || 'Failed'); }
    setBusy(null);
  };

  const download = (r) => {
    const token = (typeof window !== 'undefined' && localStorage.getItem('cc_token')) || '';
    const ds = r.definition?.dataset || 'customers';
    window.open(`${BASE_URL}/api/cc/export?dataset=${ds}&format=csv&token=${token}`, '_blank');
  };

  const del = async (r) => {
    if (!confirm(`Delete report "${r.name}"?`)) return;
    try { await ccApi.deleteReport(r.id); load(); } catch (e) { alert(e.response?.data?.error || 'Failed'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Reports</h1>
        {msg && <span style={{ fontSize: 12.5, color: '#34d399' }}>{msg}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNew(true)} style={btn('#818cf8')}>+ New report</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-dim,#666)', margin: 0 }}>Saved datasets you can run on demand or on a schedule (emailed via your SMTP settings). Run-now downloads the live CSV.</p>

      <Card style={{ padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text-dim,#666)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4 }}>
            {['Report', 'Dataset', 'Schedule', 'Recipients', 'Last run', ''].map((h) => <th key={h} style={{ padding: '11px 14px', borderBottom: '1px solid var(--border,#1e1e26)' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={6} style={{ padding: 20, color: 'var(--text-dim,#666)' }}>No reports yet.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--border,#1e1e26)' }}>
                <td style={{ ...td, fontWeight: 600 }}>{r.name}</td>
                <td style={td}><Pill tone="blue">{r.definition?.dataset || '—'}</Pill></td>
                <td style={td}><Pill tone={r.schedule === 'none' ? 'neutral' : 'purple'}>{r.schedule}</Pill></td>
                <td style={{ ...td, color: 'var(--text-dim,#666)' }}>{(r.recipients || []).join(', ') || '—'}</td>
                <td style={{ ...td, color: 'var(--text-dim,#666)' }}>{r.last_run_at ? new Date(r.last_run_at + 'Z').toLocaleString() : 'never'}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button disabled={busy === r.id} onClick={() => run(r)} style={mini('#34d399')}>{busy === r.id ? '…' : 'Run now'}</button>{' '}
                  <button onClick={() => download(r)} style={mini('#60a5fa')}>CSV</button>{' '}
                  <button onClick={() => del(r)} style={mini('#f87171')}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showNew && (
        <div onClick={() => setShowNew(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'var(--surface,#14141b)', border: '1px solid var(--border,#1e1e26)', borderRadius: 14, padding: 22 }}>
            <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700 }}>New report</h3>
            <label style={lbl}>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inp} autoFocus />
            <label style={lbl}>Dataset</label>
            <select value={form.dataset} onChange={(e) => setForm({ ...form, dataset: e.target.value })} style={inp}>
              {DATASETS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <label style={lbl}>Schedule</label>
            <select value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} style={inp}>
              {SCHEDULES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <label style={lbl}>Recipients (comma-separated emails)</label>
            <input value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} placeholder="you@studio.com" style={inp} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowNew(false)} style={btn('#9a9aa5')}>Cancel</button>
              <button onClick={create} style={btn('#34d399')}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const td = { padding: '11px 14px' };
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted,#9a9aa5)', margin: '12px 0 5px' };
const inp = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--bg,#0a0a0f)', color: 'var(--text,#e8e8ea)', fontSize: 13 };
function btn(color) { return { padding: '8px 14px', borderRadius: 9, border: `1px solid ${color}55`, background: `${color}1a`, color, fontWeight: 600, fontSize: 13, cursor: 'pointer' }; }
function mini(color) { return { padding: '5px 10px', borderRadius: 7, border: `1px solid ${color}44`, background: 'transparent', color, fontWeight: 600, fontSize: 12, cursor: 'pointer' }; }
