'use client';
import { useEffect, useState, useCallback } from 'react';
import { ccApi } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';

export default function Flags() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    ccApi.flags().then((r) => setFlags(r.data.flags)).catch(() => setFlags([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn) => { setBusy(true); try { await fn(); load(); } catch (e) { alert(e.response?.data?.error || 'Failed'); } setBusy(false); };

  const newFlag = () => {
    const key = prompt('Flag key (e.g. NEW_CULL_UI):'); if (!key) return;
    const description = prompt('Description:', '') || '';
    act(() => ccApi.createFlag({ key: key.trim(), description }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Feature Flags</h1>
        <div style={{ flex: 1 }} />
        <button onClick={newFlag} style={btn('#818cf8')}>+ New flag</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-dim,#666)', margin: 0 }}>
        Flags resolve through <code>getEntitlements()</code>. Global default, percentage rollout, or per-workspace assignment.
        Changes take effect immediately for the Command Center; app-wide enforcement lands when <code>plan-info</code> is migrated to the resolver (spec §6).
      </p>

      {loading && <div style={{ color: 'var(--text-dim,#666)' }}>Loading…</div>}
      {!loading && !flags.length && <Card><div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>No flags yet. Create one to start.</div></Card>}

      {flags.map((f) => {
        const globalOn = f.assignments?.find((a) => a.scope === 'global');
        return (
          <Card key={f.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{f.key}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-dim,#666)' }}>{f.description || 'No description'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {f.default_state ? <Pill tone="green">default on</Pill> : <Pill>default off</Pill>}
                {f.rollout_pct > 0 && <Pill tone="blue">{f.rollout_pct}% rollout</Pill>}
                <Pill tone={f.status === 'active' ? 'green' : 'red'}>{f.status}</Pill>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <button disabled={busy} onClick={() => act(() => ccApi.assignFlag(f.key, { scope: 'global', state: 1 }))} style={btn('#34d399', true)}>Enable globally</button>
              <button disabled={busy} onClick={() => act(() => ccApi.assignFlag(f.key, { scope: 'global', state: 0 }))} style={btn('#f87171', true)}>Disable globally</button>
              <button disabled={busy} onClick={() => { const pct = parseInt(prompt('Rollout %?', String(f.rollout_pct)), 10); if (pct >= 0 && pct <= 100) act(() => ccApi.updateFlag(f.key, { rollout_pct: pct })); }} style={btn('#60a5fa', true)}>Set rollout %</button>
              <button disabled={busy} onClick={() => { const ws = prompt('Workspace ID to enable for:'); if (ws) act(() => ccApi.assignFlag(f.key, { scope: 'workspace', scope_id: ws.trim(), state: 1 })); }} style={btn('#a78bfa', true)}>Enable for workspace…</button>
            </div>

            {f.assignments?.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border,#1e1e26)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim,#666)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .4 }}>Assignments</div>
                {f.assignments.slice(0, 8).map((a) => (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '3px 0' }}>
                    <span>{a.scope}{a.scope_id ? ` · ${a.scope_id}` : ''}</span>
                    <Pill tone={a.state ? 'green' : 'red'}>{a.state ? 'on' : 'off'}</Pill>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function btn(color, subtle) { return { padding: '8px 13px', borderRadius: 9, border: `1px solid ${color}55`, background: subtle ? 'transparent' : `${color}1a`, color, fontWeight: 600, fontSize: 12.5, cursor: 'pointer' }; }
