'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bookmark, X } from 'lucide-react';
import { ccApi, fmtBytes, fmtNum, fmtAgo } from '@/lib/ccApi';
import { Card, Pill, useCc } from '@/components/control/ControlShell';
import ExportButton from '@/components/control/ExportButton';
import { FormDialog, Btn, Muted, selectStyle } from '@/components/control/kit';

// All customers. Plan options come from the live plan catalogue (the old filter
// offered free/starter/growth — tiers that no longer exist, so it matched nothing).
// Saved views keep filter sets per admin; selecting rows enables bulk actions.
const TONES = ['blue', 'purple', 'green', 'amber', 'neutral'];

export default function Customers() {
  const router = useRouter();
  const { can } = useCc();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('last_active');
  const [offset, setOffset] = useState(0);
  const [plans, setPlans] = useState([]);
  const [views, setViews] = useState([]);
  const [sel, setSel] = useState(new Set());
  const [dlg, setDlg] = useState(null);
  const [flash, setFlash] = useState('');
  const limit = 50;
  const bulkOk = can('bulk_actions');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await ccApi.workspaces({ q, plan, status, limit, offset, sort, dir: sort === 'name' ? 'asc' : 'desc' });
      setRows(r.data.rows); setTotal(r.data.total);
    } catch { setRows([]); }
    setLoading(false);
  }, [q, plan, status, offset, sort]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { ccApi.plans().then((r) => setPlans(r.data.plans.map((p) => ({ key: p.key, name: p.name })))).catch(() => {}); }, []);
  const loadViews = useCallback(() => { ccApi.views('customers').then((r) => setViews(r.data.views)).catch(() => {}); }, []);
  useEffect(() => { loadViews(); }, [loadViews]);

  const tone = (k) => TONES[Math.max(0, plans.findIndex((p) => p.key === k)) % TONES.length];
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOnPage = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const applyView = (v) => { setQ(v.query.q || ''); setPlan(v.query.plan || ''); setStatus(v.query.status || ''); setSort(v.query.sort || 'last_active'); setOffset(0); };
  const bulk = async (action, params = {}) => {
    const r = await ccApi.bulk(action, [...sel], params);
    setFlash(`${r.data.count} customer${r.data.count === 1 ? '' : 's'} updated.`); setTimeout(() => setFlash(''), 3500);
    setSel(new Set()); setDlg(null); load();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Customers</h1>
        <span style={{ color: 'var(--text-dim,#666)', fontSize: 13 }}>{fmtNum(total)} workspaces</span>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input aria-label="Search customers" value={q} onChange={(e) => { setOffset(0); setQ(e.target.value); }} placeholder="Search name or owner email…" style={{ ...selectStyle, flex: '1 1 200px', minWidth: 0 }} />
        <select aria-label="Plan" value={plan} onChange={(e) => { setOffset(0); setPlan(e.target.value); }} style={selectStyle}>
          <option value="">All plans</option>
          {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => { setOffset(0); setStatus(e.target.value); }} style={selectStyle}>
          <option value="">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)} style={selectStyle}>
          <option value="last_active">Recently active</option><option value="name">Name</option><option value="leads">Most leads</option><option value="storage">Most storage</option><option value="users">Most users</option>
        </select>
        <Btn subtle onClick={() => setDlg('save')}><Bookmark size={14} /> Save view</Btn>
        <ExportButton dataset="customers" params={{ q, plan, status }} />
      </div>

      {views.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {views.map((v) => (
            <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)' }}>
              <button onClick={() => applyView(v)} style={{ background: 'none', border: 'none', color: 'var(--text,#e8e8ea)', fontSize: 12.5, padding: '5px 4px 5px 11px', cursor: 'pointer' }}>{v.name}</button>
              <button aria-label={`Delete view ${v.name}`} onClick={() => ccApi.deleteView(v.id).then(loadViews)} style={{ background: 'none', border: 'none', color: 'var(--text-dim,#666)', padding: '5px 8px', cursor: 'pointer', display: 'inline-flex' }}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      {bulkOk && sel.size > 0 && (
        <Card style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderColor: '#818cf855' }}>
          <strong style={{ fontSize: 13 }}>{sel.size} selected</strong>
          {can('manage_plans') && <Btn onClick={() => setDlg('plan')}>Change plan</Btn>}
          {can('manage_overrides') && <>
            <Btn color="#fbbf24" onClick={() => setDlg('grace')}>Grant grace</Btn>
            <Btn color="#34d399" subtle onClick={() => setDlg('restore')}>Restore</Btn>
            <Btn color="#f87171" subtle onClick={() => setDlg('suspend')}>Suspend</Btn>
          </>}
          {can('manage_flags') && <Btn color="#a78bfa" subtle onClick={() => setDlg('flag')}>Turn on a flag</Btn>}
          <button onClick={() => setSel(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-dim,#666)', cursor: 'pointer', fontSize: 12.5 }}>Clear</button>
        </Card>
      )}
      {flash && <div role="status" style={{ fontSize: 13, color: '#34d399' }}>{flash}</div>}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-dim,#666)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4 }}>
                {bulkOk && <th style={{ ...th, width: 36 }}><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={() => setSel((s) => { const n = new Set(s); rows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id))); return n; })} /></th>}
                {['Workspace', 'Owner', 'Plan', 'Status', 'Users', 'Leads', 'Storage', 'Last active'].map((h) => <th key={h} style={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} style={{ padding: 20, color: 'var(--text-dim,#666)' }}>Loading…</td></tr>}
              {!loading && !rows.length && <tr><td colSpan={9} style={{ padding: 20, color: 'var(--text-dim,#666)' }}>No customers match these filters.</td></tr>}
              {rows.map((w) => (
                <tr key={w.id} style={{ borderBottom: '1px solid var(--border,#1e1e26)', background: sel.has(w.id) ? 'color-mix(in srgb,#818cf8 8%,transparent)' : 'transparent' }}>
                  {bulkOk && <td style={td}><input type="checkbox" aria-label={`Select ${w.name || 'workspace'}`} checked={sel.has(w.id)} onChange={() => toggle(w.id)} /></td>}
                  <td style={td}><a href={`/control/customers/${w.id}`} onClick={(e) => { e.preventDefault(); router.push(`/control/customers/${w.id}`); }} style={{ fontWeight: 600, color: 'var(--text,#e8e8ea)', textDecoration: 'none' }}>{w.name || 'Untitled'}</a></td>
                  <td style={td}><div>{w.owner_email || '—'}</div><div style={{ color: 'var(--text-dim,#666)', fontSize: 11.5 }}>{w.owner_name}</div></td>
                  <td style={td}><Pill tone={tone(w.plan)}>{w.plan}</Pill></td>
                  <td style={td}><Pill tone={w.status === 'suspended' ? 'red' : 'green'}>{w.status}</Pill></td>
                  <td style={td}>{fmtNum(w.users)}</td>
                  <td style={td}>{fmtNum(w.leads)}</td>
                  <td style={td}>{fmtBytes(w.storage_bytes)}</td>
                  <td style={{ ...td, color: 'var(--text-dim,#666)' }}>{w.last_active ? fmtAgo(w.last_active) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} style={pgBtn}>← Prev</button>
          <span style={{ alignSelf: 'center', fontSize: 12.5, color: 'var(--text-dim,#666)' }}>{offset + 1}–{Math.min(offset + limit, total)} of {total}</span>
          <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} style={pgBtn}>Next →</button>
        </div>
      )}
      {!bulkOk && <Muted style={{ fontSize: 12 }}>Bulk actions are available to founders and ops admins.</Muted>}

      <FormDialog open={dlg === 'save'} title="Save this view" description="Saves the current search, filters and sort for you."
        fields={[{ name: 'name', label: 'Name', required: true, placeholder: 'e.g. Suspended studios' }]} submitLabel="Save"
        onClose={() => setDlg(null)} onSubmit={async (v) => { await ccApi.saveView('customers', v.name, { q, plan, status, sort }); setDlg(null); loadViews(); }} />
      <FormDialog open={dlg === 'plan'} title={`Change plan for ${sel.size} customer${sel.size === 1 ? '' : 's'}`} description="Takes effect immediately. Billing is not changed."
        initial={{ plan: plans[0]?.key || '' }} fields={[{ name: 'plan', label: 'New plan', type: 'select', options: plans.map((p) => [p.key, p.name]) }]}
        submitLabel="Change plan" onClose={() => setDlg(null)} onSubmit={(v) => bulk('plan', { plan: v.plan })} />
      <FormDialog open={dlg === 'grace'} title={`Grace for ${sel.size} customer${sel.size === 1 ? '' : 's'}`} description="Lifts every limit until it ends."
        initial={{ days: '14', reason: '' }} fields={[{ name: 'days', label: 'Days', type: 'number', min: 1, max: 365, required: true }, { name: 'reason', label: 'Reason', placeholder: 'Optional' }]}
        submitLabel="Grant grace" onClose={() => setDlg(null)} onSubmit={(v) => bulk('grace', { days: Number(v.days), reason: v.reason })} />
      <FormDialog open={dlg === 'suspend'} title={`Suspend ${sel.size} customer${sel.size === 1 ? '' : 's'}?`} description="Everyone in these workspaces is locked out until restored."
        fields={[{ name: 'reason', label: 'Reason (audit log)', type: 'textarea', required: true }]} submitLabel="Suspend" tone="danger"
        onClose={() => setDlg(null)} onSubmit={(v) => bulk('suspend', { reason: v.reason })} />
      <FormDialog open={dlg === 'restore'} title={`Restore ${sel.size} customer${sel.size === 1 ? '' : 's'}?`} description="They can sign in and work again immediately."
        fields={[]} submitLabel="Restore" onClose={() => setDlg(null)} onSubmit={() => bulk('restore')} />
      <FlagBulk open={dlg === 'flag'} count={sel.size} onClose={() => setDlg(null)} onSubmit={(flag) => bulk('flag', { flag, state: true })} />
    </div>
  );
}

function FlagBulk({ open, count, onClose, onSubmit }) {
  const [flags, setFlags] = useState([]);
  useEffect(() => { if (open) ccApi.flags().then((r) => setFlags(r.data.flags.map((f) => f.key))).catch(() => setFlags([])); }, [open]);
  return (
    <FormDialog open={open} title={`Turn on a flag for ${count} customer${count === 1 ? '' : 's'}`} description="Adds a workspace-level ON assignment."
      initial={{ flag: '' }} fields={[{ name: 'flag', label: 'Flag', type: 'select', options: [['', flags.length ? 'Choose a flag' : 'No flags yet'], ...flags.map((f) => [f, f])], required: true }]}
      submitLabel="Turn on" onClose={onClose} onSubmit={(v) => onSubmit(v.flag)} />
  );
}

const th = { padding: '11px 14px', borderBottom: '1px solid var(--border,#1e1e26)' };
const td = { padding: '11px 14px' };
const pgBtn = { padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text,#e8e8ea)', fontSize: 13, cursor: 'pointer' };
