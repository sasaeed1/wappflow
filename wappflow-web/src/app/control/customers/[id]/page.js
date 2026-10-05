'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Pin, PinOff, Trash2 } from 'lucide-react';
import { ccApi, fmtBytes, fmtNum, fmtWhen, fmtAgo } from '@/lib/ccApi';
import { Card, Pill, useCc, Can } from '@/components/control/ControlShell';
import { FormDialog, Tabs, Sparkline, Btn, H3, Muted, Row, selectStyle } from '@/components/control/kit';
import WorkspaceBilling from '@/components/control/WorkspaceBilling';
import { useConfirm } from '@/lib/confirm';

// Customer 360: everything about one workspace, and every lever on it. Each lever
// is shown only to admins whose role can use it; destructive ones confirm, and
// the server asks for a step-up where it must.
export default function Workspace360() {
  const confirm = useConfirm();
  const fail = (message) => confirm({ title: 'That didn’t work', message, alertOnly: true, tone: 'danger' });
  const { can, admin } = useCc();
  const { id } = useParams();
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  // ?tab=billing deep links (Founder Inbox overdue items link straight to Billing).
  useEffect(() => { try { const t = new URLSearchParams(window.location.search).get('tab'); if (t) setTab(t); } catch {} }, []);
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState([]);
  const [usage, setUsage] = useState(null);
  const [dlg, setDlg] = useState(null);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    ccApi.workspace(id).then((r) => setD(r.data)).catch((e) => setErr(e.response?.data?.error || 'Could not load this customer'));
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { ccApi.plans().then((r) => setPlans(r.data.plans.map((p) => p.key))).catch(() => {}); }, []);
  useEffect(() => { if (tab === 'usage' && !usage) ccApi.usage(id, 60).then((r) => setUsage(r.data.rows)).catch(() => setUsage([])); }, [tab, usage, id]);

  const act = async (fn) => {
    setBusy(true);
    try { await fn(); load(); }
    catch (e) { if (!e.response?.data?.need_step_up) fail(e.response?.data?.error || 'Action failed'); }
    setBusy(false);
  };

  if (err) return <Card><div style={{ color: '#f87171' }}>{err}</div></Card>;
  if (!d) return <Muted>Loading…</Muted>;

  const { workspace, owner, members, plan, entitlements, counts, overrides, grace, notes, scores, activity } = d;
  const features = entitlements?.features || {};
  const limits = entitlements?.limits || {};

  const changePlan = async (next) => {
    if (next === plan.key) return;
    const ok = await confirm({ title: `Move to ${next}?`, message: `${workspace.name || 'This workspace'} switches from ${plan.key} to ${next} immediately. Their features and limits change on their next request. Billing is not changed — update it on the Billing tab.`, confirmLabel: `Move to ${next}` });
    if (ok) act(() => ccApi.setWorkspacePlan(id, next));
  };
  const toggleModule = async (m, on) => {
    if (on) {
      const ok = await confirm({ title: `Turn off ${m.label}?`, message: `${workspace.name} loses access to ${m.label} right away. Links already sent to their clients keep working.`, confirmLabel: 'Turn off', tone: 'danger' });
      if (!ok) return;
    }
    act(() => ccApi.setModule(id, m.key, !on));
  };
  const impersonate = async () => {
    try {
      const r = await ccApi.impersonate(id, 'read');
      // Hand the token over through localStorage (same origin) — never in a URL.
      localStorage.setItem('cc_imp_handoff', r.data.token);
      window.open('/impersonate', '_blank', 'noopener');
    } catch (e) { if (!e.response?.data?.need_step_up) fail(e.response?.data?.error || 'Could not start a support session'); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <button onClick={() => router.push('/control/customers')} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text-dim,#666)', cursor: 'pointer', fontSize: 13, padding: 0 }}>← Customers</button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>{workspace.name || 'Untitled'}</h1>
        {can('manage_plans') ? (
          <select aria-label="Plan" value={plan.key} disabled={busy} onChange={(e) => changePlan(e.target.value)} style={{ ...selectStyle, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600 }}>
            {(plans.length ? plans : [plan.key]).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        ) : <Pill tone="blue">{plan.key}</Pill>}
        <Pill tone={workspace.status === 'suspended' ? 'red' : 'green'}>{workspace.status}</Pill>
        {entitlements.grace_until && <Pill tone="amber">grace until {fmtWhen(entitlements.grace_until).split(',')[0]}</Pill>}
        {plan.trial_ends_at && <Pill tone="blue">trial until {fmtWhen(plan.trial_ends_at).split(',')[0]}</Pill>}
        {plan.trial_ends_at && can('manage_plans') && (<>
          <Btn subtle color="#60a5fa" disabled={busy} onClick={() => act(() => ccApi.setTrial(id, 7))}>Extend trial 7 days</Btn>
          <Btn subtle color="#9a9aa5" disabled={busy} onClick={async () => { if (await confirm({ title: 'End the trial now?', message: 'They move to Creator straight away and get a notice.', confirmLabel: 'End trial' })) act(() => ccApi.setTrial(id, 0)); }}>End trial</Btn>
        </>)}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Can perm="manage_overrides">
          {workspace.status === 'suspended'
            ? <Btn color="#34d399" disabled={busy} onClick={() => act(() => ccApi.restore(id))}>Restore access</Btn>
            : <Btn color="#f87171" disabled={busy} onClick={() => setDlg('suspend')}>Suspend</Btn>}
          <Btn color="#fbbf24" disabled={busy} onClick={() => setDlg('grace')}>Grant grace</Btn>
        </Can>
        <Can perm="impersonate"><Btn color="#60a5fa" disabled={busy} onClick={impersonate}>Open as customer (read-only)</Btn></Can>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[
        ['overview', 'Overview'],
        ...(can('manage_billing') ? [['billing', 'Billing']] : []),
        ['notes', 'Notes', notes.length || null],
        ['usage', 'Usage'],
        ['activity', 'Activity'],
      ]} />

      {tab === 'overview' && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
          <Card>
            <H3>Owner</H3>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{owner?.business_name || owner?.full_name || '—'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted,#9a9aa5)', overflowWrap: 'anywhere' }}>{owner?.email}</div>
            {owner?.phone && <Muted>{owner.phone}</Muted>}
            <Muted style={{ marginTop: 6, fontSize: 12 }}>{members.length} member{members.length !== 1 ? 's' : ''} · joined {fmtWhen(owner?.created_at).split(',')[0]}</Muted>
          </Card>
          <Card>
            <H3>Health scores</H3>
            {scores ? (
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                {['health', 'churn', 'expansion', 'activity'].map((k) => (
                  <div key={k}><div style={{ fontSize: 22, fontWeight: 800 }}>{scores[k] ?? '—'}</div><div style={{ fontSize: 11, color: 'var(--text-dim,#666)', textTransform: 'capitalize' }}>{k}</div></div>
                ))}
              </div>
            ) : <Muted>Scores are calculated nightly. Check back tomorrow.</Muted>}
          </Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 12 }}>
          {[['Leads', counts.leads], ['Clients', counts.clients], ['Messages', counts.messages], ['Projects', counts.projects], ['Galleries', counts.galleries], ['Contracts', counts.contracts], ['Bookings', counts.bookings], ['Invoices', counts.invoices]].map(([l, v]) => (
            <Card key={l} style={{ padding: 14 }}><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtNum(v)}</div><div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{l}</div></Card>
          ))}
          <Card style={{ padding: 14 }}><div style={{ fontSize: 22, fontWeight: 800 }}>{fmtBytes(counts.storage_bytes)}</div><div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>Storage</div></Card>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>
          <Card>
            <H3>Limits</H3>
            {Object.entries(limits).map(([k, v]) => (
              <Row key={k}><span style={{ color: 'var(--text-muted,#9a9aa5)' }}>{k.replace(/_/g, ' ')}</span><span style={{ fontWeight: 600 }}>{v === -1 ? 'unlimited' : String(v)}{entitlements.sources?.[k] ? <em style={src}> {entitlements.sources[k]}</em> : null}</span></Row>
            ))}
          </Card>
          <Card>
            <H3>Features on</H3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(features).filter(([, v]) => v).map(([k]) => (
                <Pill key={k} tone={entitlements.sources?.[k] ? 'amber' : 'neutral'}>{k.replace(/_/g, ' ')}</Pill>
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <H3>Modules</H3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {MODULES.map((m) => {
              const on = features[m.key] !== false;
              const editable = can('manage_overrides');
              return (
                <button key={m.key} disabled={busy || !editable} onClick={() => toggleModule(m, on)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, border: `1px solid ${on ? '#34d399' : '#f87171'}44`, background: on ? '#34d39914' : '#f8717110', color: on ? '#34d399' : '#f87171', fontWeight: 600, fontSize: 13, cursor: editable ? 'pointer' : 'default' }}>
                  {m.label} · {on ? 'on' : 'off'}
                </button>
              );
            })}
          </div>
          <Muted style={{ fontSize: 11.5, marginTop: 10 }}>Turning a module off blocks it for this customer immediately. Links already sent to their clients keep working.</Muted>
        </Card>

        <Card>
          <H3 right={<Can perm="manage_overrides"><Btn subtle onClick={() => setDlg('override')}>+ Add override</Btn></Can>}>Overrides & grace</H3>
          {!overrides.length && !grace?.length && <Muted>None. This customer gets exactly what their plan includes.</Muted>}
          {overrides.map((o) => (
            <Row key={o.id}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}><Pill tone="amber">{o.kind}</Pill> <strong>{o.key}</strong> = {o.value}{o.reason ? <span style={{ color: 'var(--text-dim,#666)' }}> · {o.reason}</span> : null}</span>
              <Can perm="manage_overrides"><button onClick={() => act(() => ccApi.delOverride(o.id))} style={linkBtn('#f87171')}>Remove</button></Can>
            </Row>
          ))}
          {grace?.map((g) => (
            <Row key={g.id}>
              <span><Pill tone="amber">grace</Pill> {g.days} days — all limits lifted{g.reason ? ` · ${g.reason}` : ''}</span>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ color: 'var(--text-dim,#666)', fontSize: 12 }}>ends {fmtWhen(g.ends_at).split(',')[0]}</span>
                <Can perm="manage_overrides"><button onClick={() => act(() => ccApi.endGrace(g.id))} style={linkBtn('#f87171')}>End now</button></Can>
              </span>
            </Row>
          ))}
        </Card>
      </>}

      {tab === 'billing' && <WorkspaceBilling workspaceId={id} plans={plans} />}

      {tab === 'notes' && (
        <Card>
          <H3>Notes</H3>
          {can('manage_support') || can('manage_overrides') || admin?.role === 'founder'
            ? <NoteBox note={note} setNote={setNote} onSave={() => act(async () => { await ccApi.addNote(id, note); setNote(''); })} busy={busy} />
            : <Muted style={{ marginBottom: 10 }}>Your role can read notes but not write them.</Muted>}
          {!notes.length && <Muted>No notes yet. Use them for context the next admin will need: promises made, special pricing, contacts.</Muted>}
          {notes.map((n) => (
            <div key={n.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border,#1e1e26)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>{n.pinned ? '📌 ' : ''}{fmtWhen(n.created_at)}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button aria-label={n.pinned ? 'Unpin' : 'Pin'} onClick={() => act(() => ccApi.pinNote(n.id, !n.pinned))} style={iconBtn}>{n.pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
                  {(n.admin_id === admin?.id || admin?.role === 'founder') && <button aria-label="Delete note" onClick={async () => { if (await confirm({ title: 'Delete this note?', confirmLabel: 'Delete', tone: 'danger' })) act(() => ccApi.deleteNote(n.id)); }} style={iconBtn}><Trash2 size={14} /></button>}
                </span>
              </div>
              <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginTop: 4, overflowWrap: 'anywhere' }}>{n.body}</div>
            </div>
          ))}
        </Card>
      )}

      {tab === 'usage' && (
        <Card>
          <H3>Last 60 days</H3>
          {!usage ? <Muted>Loading…</Muted> : !usage.length ? <Muted>No daily history yet. It builds up from tonight’s rollup.</Muted> : (
            <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
              {[['leads', 'New leads', '#818cf8'], ['messages', 'Messages', '#34d399'], ['ai_calls', 'AI calls', '#a78bfa'], ['contracts', 'Contracts', '#fbbf24'], ['bookings', 'Bookings', '#60a5fa'], ['storage_bytes', 'Storage', '#f472b6']].map(([k, l, c]) => {
                const vals = usage.map((u) => u[k] || 0);
                const total = k === 'storage_bytes' ? fmtBytes(vals[vals.length - 1]) : fmtNum(vals.reduce((a, b) => a + b, 0));
                return (
                  <div key={k}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}><span style={{ color: 'var(--text-muted,#9a9aa5)' }}>{l}</span><strong>{total}</strong></div>
                    <Sparkline values={vals} color={c} label={l} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {tab === 'activity' && (
        <Card>
          <H3>Recent activity</H3>
          {!activity.length && <Muted>Nothing recorded for this customer yet.</Muted>}
          {activity.map((a) => (
            <Row key={a.id}><span>{String(a.type).replace(/_/g, ' ')}{a.actor_type === 'admin' ? <span style={{ color: 'var(--text-dim,#666)' }}> · by admin</span> : null}</span><span style={{ color: 'var(--text-dim,#666)', fontSize: 12 }}>{fmtAgo(a.ts)}</span></Row>
          ))}
        </Card>
      )}

      <FormDialog open={dlg === 'suspend'} title={`Suspend ${workspace.name || 'this workspace'}?`}
        description="Everyone in this workspace is locked out until you restore it. Their clients’ links keep working. You’ll be asked to confirm it’s you."
        fields={[{ name: 'reason', label: 'Reason (kept in the audit log)', type: 'textarea', required: true, placeholder: 'e.g. Unpaid for 30 days' }]}
        submitLabel="Suspend" tone="danger" onClose={() => setDlg(null)}
        onSubmit={async (v) => { await ccApi.suspend(id, v.reason); setDlg(null); load(); }} />
      <FormDialog open={dlg === 'grace'} title="Grant a grace period"
        description="Lifts every limit (leads, storage, seats…) until it ends, so they can keep working while billing or an upgrade is sorted out."
        initial={{ days: '14', reason: '' }}
        fields={[{ name: 'days', label: 'Days', type: 'number', min: 1, max: 365, required: true }, { name: 'reason', label: 'Reason', placeholder: 'e.g. Awaiting bank transfer' }]}
        submitLabel="Grant" onClose={() => setDlg(null)}
        onSubmit={async (v) => { await ccApi.grace(id, { days: Number(v.days), reason: v.reason }); setDlg(null); load(); }} />
      <FormDialog open={dlg === 'override'} title="Add an override"
        description="Applies to this customer only, on top of their plan."
        initial={{ kind: 'limit', key: '', value: '' }}
        fields={[
          { name: 'kind', label: 'Type', type: 'select', options: [['limit', 'Limit (a number; -1 = unlimited)'], ['feature', 'Feature (on/off)'], ['module', 'Module (on/off)']] },
          { name: 'key', label: 'Key', required: true, placeholder: 'e.g. leads, storage_gb, instagram' },
          { name: 'value', label: 'Value', required: true, placeholder: 'e.g. 1000, true, false' },
          { name: 'reason', label: 'Reason', placeholder: 'Optional' },
        ]}
        submitLabel="Add" onClose={() => setDlg(null)}
        onSubmit={async (v) => {
          let value = v.value.trim();
          if (value === 'true') value = true; else if (value === 'false') value = false; else if (value !== '' && !isNaN(Number(value))) value = Number(value);
          await ccApi.addOverride(id, { kind: v.kind, key: v.key.trim(), value, reason: v.reason || 'Command Center' });
          setDlg(null); load();
        }} />
    </div>
  );
}

function NoteBox({ note, setNote, onSave, busy }) {
  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      <label htmlFor="cc-note" style={{ position: 'absolute', left: -9999 }}>New note</label>
      <textarea id="cc-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for other admins…"
        style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--bg,#0a0a0f)', color: 'var(--text,#e8e8ea)', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
      <div><Btn disabled={busy || !note.trim()} onClick={onSave}>Save note</Btn></div>
    </div>
  );
}

const src = { fontSize: 10.5, color: '#fbbf24', fontStyle: 'normal', marginLeft: 6 };
const MODULES = [
  { key: 'media_studio', label: 'Media Studio' },
  { key: 'contracts_studio', label: 'Contracts' },
  { key: 'booking', label: 'Booking' },
  { key: 'print_store', label: 'Print Store' },
  { key: 'payments', label: 'Payments' },
];
const linkBtn = (c) => ({ background: 'none', border: 'none', color: c, cursor: 'pointer', fontSize: 12.5, padding: 4 });
const iconBtn = { background: 'none', border: '1px solid var(--border,#1e1e26)', borderRadius: 7, color: 'var(--text-muted,#9a9aa5)', cursor: 'pointer', padding: 5, display: 'inline-flex' };
