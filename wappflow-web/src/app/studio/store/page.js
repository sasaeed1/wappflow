'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Store, Plus, Trash2, Check } from 'lucide-react';
import { storeAPI } from '../../../lib/api';

const KINDS = ['print', 'album', 'digital', 'frame'];
const ORDER_STATUS = ['new', 'in_production', 'fulfilled', 'cancelled'];

export default function StudioStorePage() {
  const router = useRouter();
  const [products, setProducts] = useState(null);
  const [orders, setOrders] = useState([]);
  const [savedId, setSavedId] = useState('');

  const load = () => { storeAPI.products().then(r => setProducts(r.data.products || [])).catch(() => setProducts([])); storeAPI.orders().then(r => setOrders(r.data.orders || [])).catch(() => {}); };
  useEffect(() => { if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/studio/store'); return; } load(); }, []); // eslint-disable-line

  const patch = (i, p) => setProducts(ps => ps.map((x, j) => j === i ? { ...x, ...p } : x));
  const addProduct = async () => { const r = await storeAPI.createProduct({ name: 'New product', kind: 'print', options: [{ label: '8×10', price: 25 }] }); setProducts(ps => [...(ps || []), r.data]); };
  const saveProduct = async (p) => { await storeAPI.updateProduct(p.id, { name: p.name, kind: p.kind, description: p.description, options: p.options, active: p.active }); setSavedId(p.id); setTimeout(() => setSavedId(''), 1500); };
  const delProduct = async (id) => { await storeAPI.deleteProduct(id); setProducts(ps => ps.filter(x => x.id !== id)); };
  const setOrderStatus = async (id, status) => { await storeAPI.orderStatus(id, status); setOrders(os => os.map(o => o.id === id ? { ...o, status } : o)); };

  const setOpt = (pi, oi, k, v) => patch(pi, { options: products[pi].options.map((o, j) => j === oi ? { ...o, [k]: k === 'price' ? Number(v) : v } : o) });
  const addOpt = (pi) => patch(pi, { options: [...(products[pi].options || []), { label: 'Size', price: 0 }] });
  const delOpt = (pi, oi) => patch(pi, { options: products[pi].options.filter((_, j) => j !== oi) });

  if (!products) return <><div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div></>;

  return (
    <>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 60px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px', letterSpacing: '-0.5px', display: 'inline-flex', alignItems: 'center', gap: 9 }}><Store size={22} /> Print Store</h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 22px' }}>Sell prints, albums &amp; digitals. Clients order from any published gallery’s shop link (<code style={{ fontSize: 12 }}>/shop/&lt;gallery-token&gt;</code>); orders land here and in the client’s CRM record.</p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Products</h2>
          <button onClick={addProduct} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700 }}><Plus size={14} /> Add product</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          {products.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No products yet — add your first.</p>}
          {products.map((p, i) => (
            <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
              <div className="r-wrap" style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={p.name} onChange={e => patch(i, { name: e.target.value })} placeholder="Product name" style={{ flex: 1, ...fld }} />
                <select value={p.kind} onChange={e => patch(i, { kind: e.target.value })} style={{ ...fld, textTransform: 'capitalize' }}>{KINDS.map(k => <option key={k} value={k}>{k}</option>)}</select>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)' }}><input type="checkbox" checked={!!p.active} onChange={e => patch(i, { active: e.target.checked })} /> Active</label>
              </div>
              <input value={p.description || ''} onChange={e => patch(i, { description: e.target.value })} placeholder="Short description (optional)" style={{ width: '100%', ...fld, marginBottom: 10 }} />
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Options &amp; pricing</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(p.options || []).map((o, oi) => (
                  <div key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={o.label} onChange={e => setOpt(i, oi, 'label', e.target.value)} placeholder="e.g. 8×10" style={{ flex: 1, ...fld }} />
                    <input type="number" value={o.price} onChange={e => setOpt(i, oi, 'price', e.target.value)} style={{ width: 90, ...fld }} />
                    <button onClick={() => delOpt(i, oi)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
              <button onClick={() => addOpt(i)} style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>+ Add option</button>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => saveProduct(p)} style={{ padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer', background: savedId === p.id ? '#10b981' : 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>{savedId === p.id ? <><Check size={14} /> Saved</> : 'Save'}</button>
                <button onClick={() => delProduct(p.id)} style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: '#ef4444', fontSize: 13, fontWeight: 600 }}>Delete</button>
              </div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 12px' }}>Orders</h2>
        {orders.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No orders yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {orders.map(o => (
              <div key={o.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
                <div className="r-wrap" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{o.customer_name} · <span style={{ color: 'var(--accent)' }}>{o.currency_symbol}{Number(o.total).toLocaleString()}</span></div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{(o.items || []).map(it => `${it.qty}× ${it.name}${it.option ? ` (${it.option})` : ''}`).join(', ')}</div>
                  </div>
                  <select value={o.status} onChange={e => setOrderStatus(o.id, e.target.value)} style={{ ...fld, textTransform: 'capitalize' }}>{ORDER_STATUS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select>
                  {o.lead_id && <button onClick={() => router.push(`/leads/${o.lead_id}`)} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>Lead →</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
const fld = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, outline: 'none' };
