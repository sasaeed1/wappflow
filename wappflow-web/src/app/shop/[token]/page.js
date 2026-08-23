'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { fetchShop, createOrder } from '../../../lib/api';

import PublicScope from '@/components/PublicScope';
import PublicBrandMark from '@/components/PublicBrandMark';
import PublicNextSteps from '@/components/PublicNextSteps';
import PublicFooter from '@/components/PublicFooter';

export default function ShopPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [cart, setCart] = useState([]); // {product_id, name, option, price, qty}
  const [form, setForm] = useState({ name: '', phone: '', email: '', note: '' });
  const [checkout, setCheckout] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { fetchShop(token).then(d => { setData(d); setState('ok'); document.title = `Shop · ${d.brand?.name || 'Print Shop'}`; }).catch(() => setState('missing')); }, [token]);

  const sym = data?.currency_symbol || '$';
  const total = useMemo(() => cart.reduce((s, c) => s + c.price * c.qty, 0), [cart]);
  const add = (p, opt) => setCart(c => {
    const key = `${p.id}::${opt.label}`;
    const ex = c.find(x => `${x.product_id}::${x.option}` === key);
    if (ex) return c.map(x => x === ex ? { ...x, qty: x.qty + 1 } : x);
    return [...c, { product_id: p.id, name: p.name, option: opt.label, price: Number(opt.price) || 0, qty: 1 }];
  });
  const setQty = (i, q) => setCart(c => c.map((x, j) => j === i ? { ...x, qty: Math.max(1, q) } : x).filter(x => x.qty > 0));
  const remove = (i) => setCart(c => c.filter((_, j) => j !== i));

  const place = async () => {
    setErr(''); if (!form.name || !(form.phone || form.email)) { setErr('Name and a phone or email are required'); return; }
    setBusy(true);
    try { const r = await createOrder(token, { items: cart.map(c => ({ product_id: c.product_id, option: c.option, qty: c.qty })), ...form }); setDone(r); }
    catch (e) { setErr(e.message || 'Could not place order'); setBusy(false); }
  };

  if (state === 'loading') return <div style={center}><div style={spinner} /><style>{`@keyframes csp{to{transform:rotate(360deg)}}`}</style></div>;
  if (state !== 'ok') return <div style={{ ...center, flexDirection: 'column', gap: 8, textAlign: 'center', padding: 24 }}><h1 style={{ fontSize: 24, margin: 0 }}>Shop unavailable</h1><p style={{ color: '#70707a' }}>This link is incorrect or the shop is closed.</p></div>;
  if (done) return (
    <div style={{ ...center, flexDirection: 'column', gap: 10, textAlign: 'center', padding: 24 }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28 }}>✓</div>
      <h1 style={{ fontSize: 26, margin: '6px 0 0', color: '#16161a' }}>Order placed!</h1>
      <p style={{ color: '#70707a', fontSize: 15 }}>
        Total {sym}{done.total?.toLocaleString()}.{done.pay_url ? ' Settle up whenever you are ready.' : ' We’ll be in touch to finalize it.'}
      </p>
      {/* The store priced the order and then told the customer to wait for a
          message. If a pay link was minted, let them finish now. */}
      {done.pay_url && (
        <a href={done.pay_url} style={{ display: 'inline-flex', padding: '11px 22px', borderRadius: 999, background: '#16161a', color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none', marginTop: 4 }}>
          Pay {sym}{done.total?.toLocaleString()}
        </a>
      )}
      <PublicNextSteps next={done.next} brand={data?.brand} />
    </div>
  );

  return (
    <div className="wf-public" style={{ minHeight: '100vh', background: 'linear-gradient(180deg,#f6f7f9,#eceef2)' }}>
      <PublicScope />
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '0 16px 140px' }}>
        <header style={{ textAlign: 'center', padding: '44px 0 26px' }}>
          <PublicBrandMark brand={data.brand} style={{ marginBottom: 14 }} />
          <h1 style={{ fontSize: 'clamp(24px,5vw,30px)', fontWeight: 800, color: '#16161a', margin: 0, letterSpacing: '-0.02em' }}>{data.brand?.name ? `${data.brand.name} Print Shop` : 'Print Shop'}</h1>
          {data.gallery_title && <p style={{ fontSize: 14.5, color: '#70707a', margin: '6px 0 0' }}>From “{data.gallery_title}”</p>}
        </header>

        {(data.products || []).length === 0 ? <p style={{ textAlign: 'center', color: '#8a8a93' }}>No products available yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.products.map(p => (
              <div key={p.id} style={{ background: '#fff', border: '1px solid #ececf1', borderRadius: 16, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: '#16161a' }}>{p.name}</span>
                  <span style={{ fontSize: 11.5, color: '#8a8a93', textTransform: 'capitalize' }}>{p.kind}</span>
                </div>
                {p.description && <p style={{ fontSize: 13.5, color: '#70707a', margin: '0 0 12px' }}>{p.description}</p>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(p.options || []).map((o, i) => (
                    <button key={i} onClick={() => add(p, o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 13px', borderRadius: 10, border: '1.5px solid #e2e2e8', background: '#fafafa', cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#16161a' }}>
                      {o.label} <span style={{ color: '#6366f1', fontWeight: 800 }}>{sym}{Number(o.price).toLocaleString()}</span> <span style={{ color: '#8a8a93' }}>+</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <PublicFooter brand={data.brand} />
      </div>

      {cart.length > 0 && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(14px)', borderTop: '1px solid rgba(0,0,0,0.08)', padding: '12px 16px' }}>
          <div style={{ maxWidth: 620, margin: '0 auto' }}>
            {!checkout ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 1 }}><div style={{ fontSize: 11, color: '#8a8a93', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cart.reduce((s, c) => s + c.qty, 0)} items</div><div style={{ fontSize: 22, fontWeight: 800, color: '#16161a' }}>{sym}{total.toLocaleString()}</div></div>
                <button onClick={() => setCheckout(true)} style={{ padding: '13px 26px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#16161a', color: '#fff', fontWeight: 800, fontSize: 15 }}>Checkout →</button>
              </div>
            ) : (
              <div>
                <div style={{ maxHeight: 130, overflowY: 'auto', marginBottom: 10 }}>
                  {cart.map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', fontSize: 13.5 }}>
                      <span style={{ flex: 1, color: '#16161a' }}>{c.name}{c.option ? ` · ${c.option}` : ''}</span>
                      <input type="number" value={c.qty} onChange={e => setQty(i, Number(e.target.value))} style={{ width: 50, padding: '5px', borderRadius: 7, border: '1px solid #ddd', textAlign: 'center' }} />
                      <span style={{ width: 64, textAlign: 'right', fontWeight: 700, color: '#16161a' }}>{sym}{(c.price * c.qty).toLocaleString()}</span>
                      <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  ))}
                </div>
                <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" style={inp} />
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="Phone" style={inp} />
                  <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email (optional)" style={{ ...inp, gridColumn: '1 / -1' }} />
                </div>
                {err && <p style={{ color: '#dc2626', fontSize: 13, margin: '0 0 8px' }}>{err}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setCheckout(false)} style={{ padding: '13px 16px', borderRadius: 12, border: '1px solid #e2e2e8', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 14, color: '#70707a' }}>Back</button>
                  <button onClick={place} disabled={busy} style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#16161a', color: '#fff', fontWeight: 800, fontSize: 15 }}>{busy ? 'Placing…' : `Place order · ${sym}${total.toLocaleString()}`}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eceef2' };
const spinner = { width: 26, height: 26, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: '#16161a', borderRadius: '50%', animation: 'csp .9s linear infinite' };
const inp = { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #d8d8e0', background: '#fff', fontSize: 14.5, outline: 'none', boxSizing: 'border-box' };
