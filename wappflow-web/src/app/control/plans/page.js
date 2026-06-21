'use client';
import { useEffect, useState, useCallback } from 'react';
import { ccApi } from '@/lib/ccApi';
import { Card, Pill } from '@/components/control/ControlShell';

export default function Plans() {
  const [plans, setPlans] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    ccApi.plans().then((r) => setPlans(r.data.plans.map((p) => ({
      ...p, limits: { ...(p.limits || {}) }, features: { ...(p.features || {}) }, prices: [...(p.prices || [])],
    })))).catch(() => setPlans([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const patch = (key, fn) => setPlans((prev) => prev.map((p) => (p.key === key ? fn({ ...p }) : p)));
  const toast = (t) => { setMsg(t); setTimeout(() => setMsg(''), 2500); };

  const save = async (p) => {
    setBusy(p.key);
    try {
      await ccApi.updatePlan(p.key, { name: p.name, status: p.status, limits: p.limits, features: p.features, prices: p.prices });
      toast(`Saved ${p.name}. Changes enforce app-wide now.`);
    } catch (e) { alert(e.response?.data?.error || 'Save failed'); }
    setBusy(null); load();
  };

  const newPlan = async () => {
    const key = prompt('New plan key (e.g. studio_pro):'); if (!key) return;
    const name = prompt('Display name:', key) || key;
    try { await ccApi.createPlan({ key: key.trim(), name }); load(); } catch (e) { alert(e.response?.data?.error || 'Failed'); }
  };

  const addLimit = (k) => { const lk = prompt('Limit key (e.g. leads, users):'); if (!lk) return; const v = prompt('Value (-1 = unlimited):', '0'); patch(k, (p) => { p.limits = { ...p.limits, [lk.trim()]: parseInt(v, 10) || 0 }; return p; }); };
  const addFeature = (k) => { const fk = prompt('Feature key (e.g. flux, api_access):'); if (!fk) return; let v = prompt('Value (true / false / text):', 'true'); if (v === 'true') v = true; else if (v === 'false') v = false; patch(k, (p) => { p.features = { ...p.features, [fk.trim()]: v }; return p; }); };
  const addPrice = (k) => { const interval = prompt('Interval (month / year / lifetime):', 'month'); if (!interval) return; const amount = parseFloat(prompt('Amount (USD):', '0')) || 0; patch(k, (p) => { p.prices = [...p.prices, { interval, currency: 'USD', amount }]; return p; }); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Plans</h1>
        {msg && <span style={{ fontSize: 12.5, color: '#34d399' }}>{msg}</span>}
        <div style={{ flex: 1 }} />
        <button onClick={newPlan} style={btn('#818cf8')}>+ New plan</button>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-dim,#666)', margin: 0 }}>Configuration as data — edits to limits/features here resolve through <code>getEntitlements()</code> and take effect across the app immediately (no deploy).</p>

      {plans.map((p) => (
        <Card key={p.key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <input value={p.name || ''} onChange={(e) => patch(p.key, (x) => { x.name = e.target.value; return x; })} style={{ ...inp, fontWeight: 700, fontSize: 15, minWidth: 160 }} />
            <Pill tone="neutral">{p.key}</Pill>
            <select value={p.status} onChange={(e) => patch(p.key, (x) => { x.status = e.target.value; return x; })} style={inp}>
              <option value="active">active</option><option value="archived">archived</option><option value="retired">retired</option>
            </select>
            <div style={{ flex: 1 }} />
            <button disabled={busy === p.key} onClick={() => save(p)} style={btn('#34d399')}>{busy === p.key ? 'Saving…' : 'Save plan'}</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <div style={secHdr}><span>Limits</span><button onClick={() => addLimit(p.key)} style={mini}>+ add</button></div>
              {Object.entries(p.limits).map(([k, v]) => (
                <div key={k} style={kvRow}>
                  <span style={{ color: 'var(--text-muted,#9a9aa5)' }}>{k}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="number" value={v} onChange={(e) => patch(p.key, (x) => { x.limits = { ...x.limits, [k]: parseInt(e.target.value, 10) }; return x; })} style={{ ...inp, width: 90, textAlign: 'right' }} />
                    {v === -1 && <span style={{ fontSize: 11, color: '#34d399' }}>∞</span>}
                    <button onClick={() => patch(p.key, (x) => { const l = { ...x.limits }; delete l[k]; x.limits = l; return x; })} style={xBtn}>×</button>
                  </span>
                </div>
              ))}
              <div style={{ ...secHdr, marginTop: 16 }}><span>Pricing</span><button onClick={() => addPrice(p.key)} style={mini}>+ add</button></div>
              {p.prices.map((pr, i) => (
                <div key={i} style={kvRow}>
                  <span style={{ color: 'var(--text-muted,#9a9aa5)' }}>{pr.interval}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    ${' '}<input type="number" value={pr.amount} onChange={(e) => patch(p.key, (x) => { x.prices = x.prices.map((q, j) => j === i ? { ...q, amount: parseFloat(e.target.value) || 0 } : q); return x; })} style={{ ...inp, width: 90, textAlign: 'right' }} />
                    <button onClick={() => patch(p.key, (x) => { x.prices = x.prices.filter((_, j) => j !== i); return x; })} style={xBtn}>×</button>
                  </span>
                </div>
              ))}
              {!p.prices.length && <div style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>No price (custom / contact sales).</div>}
            </div>

            <div>
              <div style={secHdr}><span>Features</span><button onClick={() => addFeature(p.key)} style={mini}>+ add</button></div>
              <div style={{ maxHeight: 320, overflow: 'auto' }}>
                {Object.entries(p.features).map(([k, v]) => (
                  <div key={k} style={kvRow}>
                    <span style={{ color: 'var(--text-muted,#9a9aa5)', fontSize: 12.5 }}>{k}</span>
                    {typeof v === 'boolean' ? (
                      <button onClick={() => patch(p.key, (x) => { x.features = { ...x.features, [k]: !v }; return x; })}
                        style={{ ...toggle, background: v ? '#34d39922' : '#f8717118', color: v ? '#34d399' : '#f87171', borderColor: (v ? '#34d399' : '#f87171') + '55' }}>{v ? 'on' : 'off'}</button>
                    ) : (
                      <input value={String(v)} onChange={(e) => patch(p.key, (x) => { x.features = { ...x.features, [k]: e.target.value }; return x; })} style={{ ...inp, width: 100 }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

const inp = { padding: '6px 9px', borderRadius: 8, border: '1px solid var(--border,#1e1e26)', background: 'var(--bg,#0a0a0f)', color: 'var(--text,#e8e8ea)', fontSize: 13 };
const kvRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border,#1e1e26)', fontSize: 13 };
const secHdr = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4, color: 'var(--text-dim,#666)', fontWeight: 700, marginBottom: 8 };
const mini = { background: 'none', border: '1px solid var(--border,#1e1e26)', borderRadius: 7, padding: '2px 8px', color: 'var(--accent,#818cf8)', fontSize: 11, cursor: 'pointer' };
const xBtn = { background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 15, lineHeight: 1 };
const toggle = { border: '1px solid', borderRadius: 999, padding: '2px 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' };
function btn(color) { return { padding: '8px 14px', borderRadius: 9, border: `1px solid ${color}55`, background: `${color}1a`, color, fontWeight: 600, fontSize: 13, cursor: 'pointer' }; }
