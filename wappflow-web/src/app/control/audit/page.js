'use client';
import { useEffect, useState } from 'react';
import { ccApi } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';
import ExportButton from '@/components/control/ExportButton';

export default function Audit() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => { ccApi.audit({ limit: 200 }).then((r) => setRows(r.data.audit)).catch(() => {}); }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Audit Center</h1>
        <div style={{ flex: 1 }} />
        <ExportButton dataset="audit" />
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-dim,#666)', margin: 0 }}>Every Command Center action — who, what, when, before/after. Click a row for the diff.</p>
      <Card style={{ padding: 0 }}>
        {!rows.length && <div style={{ padding: 20, color: 'var(--text-dim,#666)', fontSize: 13 }}>No admin actions recorded yet.</div>}
        {rows.map((a) => (
          <div key={a.id} style={{ borderBottom: '1px solid var(--border,#1e1e26)' }}>
            <div onClick={() => setOpen(open === a.id ? null : a.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', fontSize: 13 }}>
              <Pill tone={a.action.includes('suspend') ? 'red' : a.action.includes('login') ? 'blue' : 'amber'}>{a.action}</Pill>
              <span style={{ color: 'var(--text-muted,#9a9aa5)' }}>{a.target_type}{a.target_id ? ` · ${String(a.target_id).slice(0, 14)}` : ''}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>{a.admin_email || a.admin_id}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{a.created_at ? new Date(a.created_at + 'Z').toLocaleString() : ''}</span>
            </div>
            {open === a.id && (
              <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
