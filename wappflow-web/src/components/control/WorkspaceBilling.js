'use client';
// One customer's billing (manual, PROP-005): subscription, balance, ledger, and the
// actions to record money. Used on the customer page's Billing tab.
import { useCallback, useEffect, useState } from 'react';
import { ccApi, fmtMoney, fmtWhen } from '@/lib/ccApi';
import { Card, Pill, useCc } from '@/components/control/ControlShell';
import { FormDialog, Btn, H3, Muted, Row } from '@/components/control/kit';
import { useConfirm } from '@/lib/confirm';

const STATUS_TONE = { active: 'green', trialing: 'blue', past_due: 'red', paused: 'amber', cancelled: 'neutral', comped: 'purple' };
const KIND_LABEL = { charge: 'Charge', payment: 'Payment received', credit: 'Credit', refund: 'Refund', adjustment: 'Adjustment' };
const METHODS = [['bank_transfer', 'Bank transfer'], ['card', 'Card'], ['cash', 'Cash'], ['wise', 'Wise'], ['paypal', 'PayPal'], ['other', 'Other']];

export default function WorkspaceBilling({ workspaceId, plans = [] }) {
  const { can } = useCc();
  const confirm = useConfirm();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [dlg, setDlg] = useState(null); // 'sub' | 'payment' | 'credit' | 'charge' | 'refund' | 'adjustment'

  const load = useCallback(() => {
    ccApi.wsBilling(workspaceId).then((r) => setD(r.data)).catch((e) => setErr(e.response?.data?.error || 'Could not load billing'));
  }, [workspaceId]);
  useEffect(() => { load(); }, [load]);

  if (!can('manage_billing')) return <Card><Muted>Your role can’t see billing. Ask a founder or finance admin.</Muted></Card>;
  if (err) return <Card><div style={{ color: '#f87171', fontSize: 13 }}>{err}</div></Card>;
  if (!d) return <Card><Muted>Loading billing…</Muted></Card>;

  const sub = d.subscription;
  const owes = d.balance > 0.004;
  const action = async (a, label, tone) => {
    const ok = await confirm({ title: `${label}?`, message: a === 'renew' ? 'This adds the next period’s charge now and moves the renewal date forward.' : `The subscription will be marked ${label.toLowerCase()}.`, confirmLabel: label, tone });
    if (!ok) return;
    try { await ccApi.subscriptionAction(workspaceId, a); load(); }
    catch (e) { await confirm({ title: 'Could not update', message: e.response?.data?.error || 'Try again', alertOnly: true, tone: 'danger' }); }
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
        <Card>
          <div style={lab}>Balance</div>
          <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4, color: owes ? '#f87171' : '#34d399' }}>{fmtMoney(Math.abs(d.balance), true)}</div>
          <Muted>{owes ? 'owed by the customer' : d.balance < -0.004 ? 'in credit' : 'nothing owed'}</Muted>
        </Card>
        <Card>
          <div style={lab}>Subscription</div>
          {sub ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{fmtMoney(sub.amount, true)}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-dim,#666)' }}> / {sub.interval}</span></div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}><Pill tone={STATUS_TONE[sub.status]}>{sub.status.replace('_', ' ')}</Pill><Muted>{sub.plan}</Muted></div>
            </>
          ) : <Muted style={{ marginTop: 6 }}>No subscription recorded yet.</Muted>}
        </Card>
        <Card>
          <div style={lab}>Current period</div>
          {sub ? <>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{fmtWhen(sub.current_period_start).split(',')[0]} → {fmtWhen(sub.current_period_end).split(',')[0]}</div>
            <Muted>renews automatically on the end date</Muted>
          </> : <Muted style={{ marginTop: 6 }}>—</Muted>}
        </Card>
      </div>

      <Card>
        <H3 right={<Btn onClick={() => setDlg('sub')}>{sub ? 'Edit subscription' : 'Set up subscription'}</Btn>}>Actions</H3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn color="#34d399" onClick={() => setDlg('payment')} disabled={!sub && d.balance <= 0}>Record payment</Btn>
          <Btn color="#60a5fa" onClick={() => setDlg('credit')}>Give credit</Btn>
          <Btn color="#818cf8" subtle onClick={() => setDlg('charge')}>Add charge</Btn>
          <Btn color="#fbbf24" subtle onClick={() => setDlg('refund')}>Refund</Btn>
          <Btn color="#9a9aa5" subtle onClick={() => setDlg('adjustment')}>Adjust</Btn>
          {sub && <>
            <span style={{ flexBasis: '100%', height: 0 }} />
            <Btn subtle onClick={() => action('renew', 'Bill next period')}>Bill next period now</Btn>
            {sub.status === 'paused' || sub.status === 'cancelled' || sub.status === 'comped'
              ? <Btn color="#34d399" subtle onClick={() => action('resume', 'Resume')}>Resume</Btn>
              : <Btn color="#fbbf24" subtle onClick={() => action('pause', 'Pause')}>Pause</Btn>}
            {sub.status !== 'comped' && <Btn color="#a78bfa" subtle onClick={() => action('comp', 'Comp (free)')}>Comp</Btn>}
            {sub.status !== 'cancelled' && <Btn color="#f87171" subtle onClick={() => action('cancel', 'Cancel subscription', 'danger')}>Cancel</Btn>}
          </>}
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 4px' }}><H3>Ledger</H3></div>
        {!d.ledger.length && <Muted style={{ padding: '0 18px 16px' }}>No entries yet. Set up the subscription and record the first payment.</Muted>}
        <div style={{ overflowX: 'auto' }}>
          {d.ledger.map((e) => {
            const out = e.kind === 'payment' || e.kind === 'credit';
            return (
              <Row key={e.id} style={{ padding: '10px 18px', minWidth: 520 }}>
                <span style={{ minWidth: 0 }}>
                  <strong style={{ fontWeight: 600 }}>{KIND_LABEL[e.kind] || e.kind}</strong>
                  <span style={{ color: 'var(--text-dim,#666)' }}>{e.description ? ` · ${e.description}` : ''}{e.method ? ` · ${e.method.replace('_', ' ')}` : ''}{e.reference ? ` · ref ${e.reference}` : ''}</span>
                </span>
                <span style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>{fmtWhen(e.created_at)}</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: out ? '#34d399' : 'var(--text,#e8e8ea)' }}>{out ? '−' : '+'}{fmtMoney(Math.abs(e.amount), true)}</span>
                </span>
              </Row>
            );
          })}
        </div>
      </Card>

      <FormDialog open={dlg === 'sub'} title={sub ? 'Edit subscription' : 'Set up subscription'}
        description="What this customer pays you. Prices are in US dollars."
        initial={{ plan: sub?.plan || d.suggested.plan, amount: String(sub?.amount ?? d.suggested.amount), interval: sub?.interval || 'month', status: sub?.status || 'active', charge_now: sub ? 'no' : 'yes', apply_plan: 'yes' }}
        fields={[
          { name: 'plan', label: 'Plan', type: 'select', options: (plans.length ? plans : [d.suggested.plan]).map((p) => [p, p]) },
          { name: 'amount', label: 'Price (USD)', type: 'number', min: 0, step: '0.01', required: true, hint: 'Founding customers: enter their locked-in price.' },
          { name: 'interval', label: 'Billed every', type: 'select', options: [['month', 'Month'], ['year', 'Year']] },
          { name: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['trialing', 'Trial'], ['past_due', 'Past due'], ['paused', 'Paused'], ['comped', 'Comped (free)'], ['cancelled', 'Cancelled']] },
          ...(sub ? [] : [{ name: 'charge_now', label: 'Bill the first period now?', type: 'select', options: [['yes', 'Yes — add the charge'], ['no', 'No']] }]),
          { name: 'apply_plan', label: 'Also switch the product to this plan?', type: 'select', options: [['yes', 'Yes'], ['no', 'No — billing only']] },
        ]}
        submitLabel="Save"
        onClose={() => setDlg(null)}
        onSubmit={async (v) => {
          await ccApi.saveSubscription(workspaceId, { plan: v.plan, amount: Number(v.amount), interval: v.interval, status: v.status, charge_now: v.charge_now === 'yes', apply_plan: v.apply_plan === 'yes' });
          setDlg(null); load();
        }} />

      <FormDialog open={['payment', 'credit', 'charge', 'refund', 'adjustment'].includes(dlg)} title={KIND_LABEL[dlg] || ''}
        description={{
          payment: 'Money the customer paid you.', credit: 'Reduce what they owe (goodwill, downtime…).', charge: 'Something extra they owe.',
          refund: 'Money you paid back. Needs confirmation.', adjustment: 'A correction. Positive adds to what they owe, negative reduces it.',
        }[dlg]}
        initial={{ amount: dlg === 'payment' && owes ? String(d.balance) : '', method: 'bank_transfer', reference: '', description: '' }}
        fields={[
          { name: 'amount', label: 'Amount (USD)', type: 'number', step: '0.01', required: true },
          ...(dlg === 'payment' || dlg === 'refund' ? [{ name: 'method', label: 'Method', type: 'select', options: METHODS }, { name: 'reference', label: 'Reference', placeholder: 'Transfer ID, receipt no.' }] : []),
          { name: 'description', label: 'Note', placeholder: 'Optional' },
        ]}
        submitLabel="Record" tone={dlg === 'refund' ? 'danger' : 'primary'}
        onClose={() => setDlg(null)}
        onSubmit={async (v) => {
          await ccApi.billingEntry(workspaceId, { kind: dlg, amount: Number(v.amount), method: v.method, reference: v.reference || null, description: v.description || null });
          setDlg(null); load();
        }} />
    </div>
  );
}

const lab = { fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-dim,#666)' };
