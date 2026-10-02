'use client';
import { useEffect, useState } from 'react';
import { ccApi, fmtWhen } from '@/lib/ccApi';
import { selectStyle } from '@/components/control/kit';
import { Card, Pill } from '@/components/control/ControlShell';
import ExportButton from '@/components/control/ExportButton';
import { clickable } from '@/lib/a11y';

export default function Audit() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [ws, setWs] = useState('');

  // Filters run server-side (the API always supported them; the page never offered them).
  useEffect(() => {
    const t = setTimeout(() => {
      ccApi.audit({ limit: 300, action: action.trim() || undefined, target_type: target || undefined, workspace_id: ws.trim() || undefined })
        .then((r) => setRows(r.data.audit)).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [action, target, ws]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Audit Center</h1>
        <div style={{ flex: 1 }} />
        <ExportButton dataset="audit" />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-dim,#666)', margin: 0 }}>Every Command Center action — who, what, when, before/after. Click a row for the diff.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Action, e.g. workspace_suspend" style={{ ...selectStyle, flex: '1 1 200px', minWidth: 0 }} />
        <select aria-label="Target" value={target} onChange={(e) => setTarget(e.target.value)} style={selectStyle}>
          <option value="">Everything</option>{['workspace', 'admin', 'plan', 'flag', 'ticket', 'sql', 'table', 'messages', 'lead', 'dataset', 'impersonation', 'config', 'system'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input aria-label="Workspace ID" value={ws} onChange={(e) => setWs(e.target.value)} placeholder="Workspace ID" style={{ ...selectStyle, flex: '0 1 220px', minWidth: 0 }} />
      </div>
      <Card style={{ padding: 0 }}>
        {!rows.length && <div style={{ padding: 20, color: 'var(--text-dim,#666)', fontSize: 13 }}>No admin actions match.</div>}
        {rows.map((a) => (
          <div key={a.id} style={{ borderBottom: '1px solid var(--border,#1e1e26)' }}>
            <div {...clickable(() => setOpen(open === a.id ? null : a.id))} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 16px', cursor: 'pointer', fontSize: 13 }}>
              <Pill tone={a.action.includes('suspend') ? 'red' : a.action.includes('login') ? 'blue' : 'amber'}>{a.action}</Pill>
              <span style={{ color: 'var(--text-muted,#9a9aa5)' }}>{a.target_type}{a.target_id ? ` · ${String(a.target_id).slice(0, 14)}` : ''}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>{a.admin_email || a.admin_id}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{fmtWhen(a.created_at)}</span>
            </div>
            {open === a.id && (
              <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12 }}>
                <Diff title="Before" data={a.before} />
                <Diff title="After" data={a.after} />
                {a.reason && <div style={{ gridColumn: '1 / -1', fontSize: 12.5, color: 'var(--text-dim,#666)' }}>Reason: {a.reason}</div>}
                {a.ip && <div style={{ gridColumn: '1 / -1', fontSize: 11.5, color: 'var(--text-dim,#666)' }}>IP {a.ip}</div>}
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

function Diff({ title, data }) {
  let parsed = null; try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
  return (
    <div style={{ background: 'var(--bg,#0a0a0f)', border: '1px solid var(--border,#1e1e26)', borderRadius: 9, padding: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dim,#666)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 6 }}>{title}</div>
      <pre style={{ margin: 0, fontSize: 11.5, color: 'var(--text-muted,#9a9aa5)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{parsed ? JSON.stringify(parsed, null, 2) : '—'}</pre>
    </div>
  );
}
