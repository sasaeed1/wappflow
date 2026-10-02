'use client';
import { useCallback, useEffect, useState } from 'react';
import { ccApi, fmtMoney, fmtWhen } from '@/lib/ccApi';
import { Card, Stat, Pill, Can } from '@/components/control/ControlShell';
import { Btn, H3, Muted, Row, selectStyle } from '@/components/control/kit';

// Billing (manual, PROP-005): what customers pay WappFlow, recorded by hand until
// a payment gateway is connected. Real MRR comes from these subscriptions.
const TONE = { active: 'green', trialing: 'blue', past_due: 'red', paused: 'amber', cancelled: 'neutral', comped: 'purple' };

export default function Billing() {
  const [ov, setOv] = useState(null);
  const [subs, setSubs] = useState([]);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    ccApi.billingOverview().then((r) => setOv(r.data)).catch((e) => setErr(e.response?.data?.error || 'Could not load billing'));
    ccApi.subscriptions(status || undefined).then((r) => setSubs(r.data.subscriptions)).catch(() => setSubs([]));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setRunning(true);
    try { const r = await ccApi.runBilling(); setMsg(`Renewed ${r.data.renewed} period${r.data.renewed === 1 ? '' : 's'}; ${r.data.overdue} newly overdue.`); load(); }
    catch (e) { setMsg(e.response?.data?.error || 'Could not run billing'); }
    setRunning(false);
  };

  return (
    <Can perm="manage_billing" fallback={<Card><Muted>Billing is for founders and finance admins.</Muted></Card>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Billing</h1>
          <Pill tone="neutral">manual · USD</Pill>
          <span style={{ flex: 1 }} />
          <Btn subtle onClick={run} disabled={running}>{running ? 'Running…' : 'Run renewals now'}</Btn>
        </div>
        <Muted>Customers pay you outside WappFlow (bank transfer, card, Wise…). Record each payment on the customer’s Billing tab. Renewals bill themselves every night; anything unpaid for 7 days becomes past due and lands in your Founder Inbox.</Muted>
        {msg && <div role="status" style={{ fontSize: 13, color: '#34d399' }}>{msg}</div>}
        {err && <Card><div style={{ color: '#f87171', fontSize: 13 }}>{err}</div></Card>}

        {ov && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))' }}>
            <Stat label="MRR" value={fmtMoney(ov.mrr)} sub={`${ov.paying} paying customer${ov.paying === 1 ? '' : 's'}`} accent="#34d399" />
            <Stat label="ARR" value={fmtMoney(ov.arr)} sub="MRR × 12" />
            <Stat label="Outstanding" value={fmtMoney(ov.outstanding_total)} sub={`${ov.outstanding.length} customer${ov.outstanding.length === 1 ? '' : 's'} owe`} accent={ov.outstanding_total > 0 ? '#f87171' : undefined} />
            <Stat label="Collected (30 days)" value={fmtMoney(ov.collected_30d)} sub="payments − refunds" />
            <Stat label="No subscription" value={ov.workspaces_without_subscription} sub="workspaces not yet set up" />
          </div>
        )}

        {ov && (
          <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))' }}>
            <Card>
              <H3>Who owes money</H3>
              {!ov.outstanding.length && <Muted>Nobody — every balance is settled.</Muted>}
              {ov.outstanding.map((o) => (
                <Row key={o.workspace_id}><a href={`/control/customers/${o.workspace_id}?tab=billing`} style={lnk}>{o.name || o.workspace_id.slice(0, 8)}</a><strong style={{ color: '#f87171', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(o.balance, true)}</strong></Row>
              ))}
            </Card>
            <Card>
              <H3>Renewing in the next 14 days</H3>
              {!ov.renewals.length && <Muted>No renewals coming up.</Muted>}
              {ov.renewals.map((s) => (
                <Row key={s.id}><a href={`/control/customers/${s.workspace_id}?tab=billing`} style={lnk}>{s.name || s.workspace_id.slice(0, 8)}</a><span style={{ fontSize: 12.5, color: 'var(--text-dim,#666)' }}>{fmtMoney(s.amount, true)} · {fmtWhen(s.current_period_end).split(',')[0]}</span></Row>
              ))}
            </Card>
          </div>
        )}

        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px 6px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <H3>Subscriptions</H3>
            <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...selectStyle, marginLeft: 'auto' }}>
              <option value="">All statuses</option>{Object.keys(TONE).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--text-dim,#666)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4 }}>
                {['Customer', 'Plan', 'Price', 'Status', 'Renews', 'Balance'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {!subs.length && <tr><td colSpan={6} style={{ padding: 18, color: 'var(--text-dim,#666)' }}>No subscriptions yet. Open a customer and use the Billing tab to set one up.</td></tr>}
                {subs.map((s) => (
                  <tr key={s.id} style={{ borderTop: '1px solid var(--border,#1e1e26)' }}>
                    <td style={td}><a href={`/control/customers/${s.workspace_id}?tab=billing`} style={lnk}>{s.workspace_name || 'Untitled'}</a><div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)' }}>{s.owner_email}</div></td>
                    <td style={td}>{s.plan}</td>
                    <td style={{ ...td, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(s.amount, true)} / {s.interval}</td>
                    <td style={td}><Pill tone={TONE[s.status]}>{s.status.replace('_', ' ')}</Pill></td>
                    <td style={{ ...td, color: 'var(--text-dim,#666)' }}>{fmtWhen(s.current_period_end).split(',')[0]}</td>
                    <td style={{ ...td, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: s.balance > 0 ? '#f87171' : 'var(--text,#e8e8ea)' }}>{fmtMoney(s.balance, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Can>
  );
}

const th = { padding: '10px 14px' };
const td = { padding: '11px 14px' };
const lnk = { color: 'var(--text,#e8e8ea)', fontWeight: 600, textDecoration: 'none' };
