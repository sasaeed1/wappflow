'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ccApi, fmtBytes, fmtNum } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';

export default function Workspace360() {
  const { id } = useParams();
  const router = useRouter();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [planOpts, setPlanOpts] = useState([]);

  const load = useCallback(() => {
    ccApi.workspace(id).then((r) => setD(r.data)).catch((e) => setErr(e.response?.data?.error || 'Failed to load'));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { ccApi.plans().then((r) => setPlanOpts(r.data.plans.map((p) => p.key))).catch(() => {}); }, []);

  const act = async (fn) => { setBusy(true); try { await fn(); load(); } catch (e) { alert(e.response?.data?.error || 'Action failed'); } setBusy(false); };

  if (err) return <div style={{ color: '#f87171' }}>{err}</div>;
  if (!d) return <div style={{ color: 'var(--text-dim,#666)' }}>Loading…</div>;

  const { workspace, owner, members, plan, entitlements, counts, overrides, grace, notes, scores, activity } = d;
  const features = entitlements?.features || {};
  const limits = entitlements?.limits || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <button onClick={() => router.push('/control/customers')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-dim,#666)', cursor: 'pointer', fontSize: 13 }}>← Customers</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>{workspace.name || 'Untitled'}</h1>
        <select value={plan.key} onChange={(e) => act(() => ccApi.setWorkspacePlan(id, e.target.value))} title="Change plan tier"
          style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text,#e8e8ea)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {(planOpts.length ? planOpts : [plan.key]).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <Pill tone={workspace.status === 'suspended' ? 'red' : 'green'}>{workspace.status}</Pill>
        <div style={{ flex: 1 }} />
        {workspace.status === 'suspended'
          ? <button disabled={busy} onClick={() => act(() => ccApi.restore(id))} style={btn('#34d399')}>Restore</button>
          : <button disabled={busy} onClick={() => { const r = prompt('Reason for suspension?'); if (r !== null) act(() => ccApi.suspend(id, r)); }} style={btn('#f87171')}>Suspend</button>}
        <button disabled={busy} onClick={() => act(async () => { const days = parseInt(prompt('Grace period days?', '14'), 10); if (days > 0) await ccApi.grace(id, { days }); })} style={btn('#fbbf24')}>Grant grace</button>
        <button disabled={busy} onClick={async () => { try { const r = await ccApi.impersonate(id, 'read'); window.open('/impersonate?token=' + encodeURIComponent(r.data.token), '_blank', 'noopener'); } catch (e) { alert(e.response?.data?.error || 'Failed'); } }} style={btn('#60a5fa')}>Impersonate (read-only)</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <Card>
          <h3 style={h3}>Owner</h3>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{owner?.business_name || owner?.full_name || '—'}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted,#9a9aa5)' }}>{owner?.email}</div>
          {owner?.phone && <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>{owner.phone}</div>}
          <div style={{ fontSize: 12, color: 'var(--text-dim,#666)', marginTop: 6 }}>{members.length} member{members.length !== 1 ? 's' : ''} · joined {owner?.created_at ? new Date(owner.created_at + 'Z').toLocaleDateString() : '—'}</div>
        </Card>
        <Card>
          <h3 style={h3}>Health scores</h3>
          {scores ? (
            <div style={{ display: 'flex', gap: 18 }}>
              {['health', 'churn', 'expansion', 'activity'].map((k) => (
                <div key={k}><div style={{ fontSize: 22, fontWeight: 800 }}>{scores[k] ?? '—'}</div><div style={{ fontSize: 11, color: 'var(--text-dim,#666)', textTransform: 'capitalize' }}>{k}</div></div>
              ))}
            </div>
          ) : <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>Not computed yet — scoring activates with the usage rollup (spec §1.5).</div>}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 12 }}>
        {[['Leads', counts.leads], ['Clients', counts.clients], ['Messages', counts.messages], ['Projects', counts.projects], ['Galleries', counts.galleries], ['Contracts', counts.contracts], ['Bookings', counts.bookings], ['Invoices', counts.invoices]].map(([l, v]) => (
          <Card key={l}><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtNum(v)}</div><div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{l}</div></Card>
        ))}
        <Card><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtBytes(counts.storage_bytes)}</div><div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>Storage</div></Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <h3 style={h3}>Entitlements — limits</h3>
          {Object.entries(limits).map(([k, v]) => (
            <div key={k} style={kvRow}><span style={{ color: 'var(--text-muted,#9a9aa5)' }}>{k}</span><span style={{ fontWeight: 600 }}>{v === -1 ? '∞' : String(v)}{entitlements.sources?.[k] ? <em style={src}> {entitlements.sources[k]}</em> : null}</span></div>
          ))}
        </Card>
        <Card>
          <h3 style={h3}>Entitlements — features</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(features).filter(([, v]) => v).map(([k]) => (
              <Pill key={k} tone={entitlements.sources?.[k] ? 'amber' : 'neutral'}>{k}</Pill>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h3 style={h3}>Modules</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {MODULES.map((m) => {
            const on = features[m.key] !== false;
            return (
              <button key={m.key} disabled={busy} onClick={() => act(() => ccApi.setModule(id, m.key, !on))}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, border: `1px solid ${on ? '#34d399' : '#f87171'}44`, background: on ? '#34d39914' : '#f8717110', color: on ? '#34d399' : '#f87171', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {m.label} · {on ? 'on' : 'off'}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)', marginTop: 10 }}>Disabling a module blocks its authenticated routes for this workspace immediately. Client-facing links (delivered galleries/contracts) stay accessible.</div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ ...h3, margin: 0 }}>Overrides</h3>
          <button onClick={() => act(async () => {
            const kind = prompt('kind? (limit | feature | module)', 'feature'); if (!kind) return;
            const key = prompt('key? (e.g. flux, leads)'); if (!key) return;
            let value = prompt('value? (true/false or a number)'); if (value === null) return;
            if (value === 'true') value = true; else if (value === 'false') value = false; else if (!isNaN(Number(value))) value = Number(value);
            await ccApi.addOverride(id, { kind, key, value, reason: 'manual (Command Center)' });
          })} style={btn('#818cf8', true)}>+ Add override</button>
        </div>
        {!overrides.length && <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>No overrides.</div>}
        {overrides.map((o) => (
          <div key={o.id} style={kvRow}>
            <span><Pill tone="amber">{o.kind}</Pill> <strong>{o.key}</strong> = {o.value}</span>
            <button onClick={() => act(() => ccApi.delOverride(o.id))} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 12 }}>revoke</button>
          </div>
        ))}
        {grace?.length > 0 && grace.map((g) => (
          <div key={g.id} style={kvRow}><span><Pill tone="amber">grace</Pill> {g.days} days</span><span style={{ color: 'var(--text-dim,#666)', fontSize: 12 }}>ends {new Date(g.ends_at + 'Z').toLocaleDateString()}</span></div>
        ))}
      </Card>

      <Card>
        <h3 style={h3}>Recent activity</h3>
        {!activity.length && <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>No platform events yet for this workspace.</div>}
        {activity.map((a) => (
          <div key={a.id} style={kvRow}><span>{a.type}</span><span style={{ color: 'var(--text-dim,#666)', fontSize: 12 }}>{new Date(a.ts + 'Z').toLocaleString()}</span></div>
        ))}
      </Card>
    </div>
  );
}

const h3 = { fontSize: 13, fontWeight: 700, margin: '0 0 10px', color: 'var(--text-muted,#9a9aa5)' };
const kvRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border,#1e1e26)', fontSize: 13 };
const src = { fontSize: 10.5, color: '#fbbf24', fontStyle: 'normal', marginLeft: 6 };
const MODULES = [
  { key: 'media_studio', label: 'Media Studio' },
  { key: 'contracts_studio', label: 'Contracts' },
  { key: 'booking', label: 'Booking' },
  { key: 'print_store', label: 'Print Store' },
  { key: 'payments', label: 'Payments' },
];
function btn(color, subtle) { return { padding: '8px 14px', borderRadius: 9, border: `1px solid ${color}55`, background: subtle ? 'transparent' : `${color}1a`, color, fontWeight: 600, fontSize: 13, cursor: 'pointer' }; }
