'use client';
import { useEffect, useState, useCallback } from 'react';
import { Power } from 'lucide-react';
import { ccApi } from '@/lib/ccApi';
import { Card, Pill, useCc } from '@/components/control/ControlShell';
import { FormDialog, Btn, Muted } from '@/components/control/kit';
import { useConfirm } from '@/lib/confirm';

// Feature flags resolve inside getEntitlements(), which the whole app reads — a
// change applies everywhere on the customer's next request (≤30 s cache).
export default function Flags() {
  const { can } = useCc();
  const confirm = useConfirm();
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dlg, setDlg] = useState(null); // { kind: 'new' | 'rollout' | 'workspace', flag }
  const edit = can('manage_flags');

  const load = useCallback(() => {
    setLoading(true);
    ccApi.flags().then((r) => setFlags(r.data.flags)).catch(() => setFlags([])).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    setBusy(true);
    try { await fn(); load(); }
    catch (e) { confirm({ title: 'That didn’t work', message: e.response?.data?.error || 'Try again', alertOnly: true, tone: 'danger' }); }
    setBusy(false);
  };
  const kill = async (f) => {
    if (await confirm({ title: `Kill “${f.key}”?`, message: 'Turns the flag off for every customer right now: default off, rollout 0%, and every active assignment ended.', confirmLabel: 'Turn off everywhere', tone: 'danger' })) act(() => ccApi.killFlag(f.key));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Feature Flags</h1>
        <div style={{ flex: 1 }} />
        {edit && <Btn onClick={() => setDlg({ kind: 'new' })}>+ New flag</Btn>}
      </div>
      <Muted style={{ fontSize: 12.5 }}>A flag can be on by default, rolled out to a percentage of customers, or switched on or off for one customer. Changes reach the whole app within 30 seconds.</Muted>

      {loading && <Muted>Loading…</Muted>}
      {!loading && !flags.length && <Card><Muted>No flags yet. Create one to start.</Muted></Card>}

      {flags.map((f) => (
        <Card key={f.key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{f.key}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-dim,#666)' }}>{f.description || 'No description'}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {f.default_state ? <Pill tone="green">default on</Pill> : <Pill>default off</Pill>}
              {f.rollout_pct > 0 && <Pill tone="blue">{f.rollout_pct}% rollout</Pill>}
              <Pill tone={f.status === 'active' ? 'green' : 'red'}>{f.status}</Pill>
            </div>
          </div>

          {edit && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
              <Btn color="#34d399" subtle disabled={busy} onClick={() => act(() => ccApi.assignFlag(f.key, { scope: 'global', state: 1 }))}>On for everyone</Btn>
              <Btn color="#9a9aa5" subtle disabled={busy} onClick={() => act(() => ccApi.assignFlag(f.key, { scope: 'global', state: 0 }))}>Off for everyone</Btn>
              <Btn color="#60a5fa" subtle disabled={busy} onClick={() => setDlg({ kind: 'rollout', flag: f })}>Rollout %</Btn>
              <Btn color="#a78bfa" subtle disabled={busy} onClick={() => setDlg({ kind: 'workspace', flag: f })}>One customer…</Btn>
              <Btn color="#f87171" subtle disabled={busy} onClick={() => kill(f)}><Power size={13} /> Kill switch</Btn>
            </div>
          )}

          {f.assignments?.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border,#1e1e26)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim,#666)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: .4 }}>Assignments</div>
              {f.assignments.slice(0, 8).map((a) => (
                <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '3px 0' }}>
                  <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{a.scope === 'global' ? 'everyone' : a.scope}{a.scope_id ? ` · ${a.scope_id}` : ''}{a.ends_at ? <span style={{ color: 'var(--text-dim,#666)' }}> · ended</span> : null}</span>
                  <Pill tone={a.state ? 'green' : 'red'}>{a.state ? 'on' : 'off'}</Pill>
                </div>
              ))}
            </div>
          )}
        </Card>
      ))}

      <FormDialog open={dlg?.kind === 'new'} title="New flag" description="Starts off for everyone. Turn it on per customer, by percentage, or globally."
        initial={{ key: '', description: '' }}
        fields={[{ name: 'key', label: 'Key', required: true, placeholder: 'e.g. new_cull_ui', hint: 'Lowercase, no spaces. The code checks for this exact key.' }, { name: 'description', label: 'What it controls' }]}
        submitLabel="Create" onClose={() => setDlg(null)}
        onSubmit={async (v) => { await ccApi.createFlag({ key: v.key.trim(), description: v.description }); setDlg(null); load(); }} />
      <FormDialog open={dlg?.kind === 'rollout'} title={`Rollout for ${dlg?.flag?.key || ''}`} description="The same customers stay in the rollout as you raise the percentage."
        initial={{ pct: String(dlg?.flag?.rollout_pct ?? 0) }}
        fields={[{ name: 'pct', label: 'Percentage of customers', type: 'number', min: 0, max: 100, required: true }]}
        submitLabel="Save" onClose={() => setDlg(null)}
        onSubmit={async (v) => { const pct = Math.max(0, Math.min(100, parseInt(v.pct, 10) || 0)); await ccApi.updateFlag(dlg.flag.key, { rollout_pct: pct }); setDlg(null); load(); }} />
      <FormDialog open={dlg?.kind === 'workspace'} title={`${dlg?.flag?.key || ''} for one customer`} description="Overrides the default and rollout for this customer only."
        initial={{ ws: '', state: 'on' }}
        fields={[{ name: 'ws', label: 'Workspace ID', required: true, hint: 'Copy it from the customer’s page address.' }, { name: 'state', label: 'Set to', type: 'select', options: [['on', 'On'], ['off', 'Off']] }]}
        submitLabel="Apply" onClose={() => setDlg(null)}
        onSubmit={async (v) => { await ccApi.assignFlag(dlg.flag.key, { scope: 'workspace', scope_id: v.ws.trim(), state: v.state === 'on' ? 1 : 0 }); setDlg(null); load(); }} />
    </div>
  );
}
