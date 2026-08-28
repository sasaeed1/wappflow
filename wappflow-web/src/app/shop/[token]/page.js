'use client';
/* eslint-disable @next/next/no-img-element -- client photographs are dynamic /uploads URLs */

// ════════════════════════════════════════════════════════════════════════════
//  PRINT SHOP — the client's copy.
//
//  WHAT THIS REPLACED: a flat grey page of white cards. It sold prints of
//  photographs and displayed not one photograph. The client came here straight
//  from their gallery — dark, serif, gold, genuinely beautiful — and landed on
//  what looked like a form from 2004. Worse, the order it produced said
//  "2 × Fine art print (16×20)" and nothing else, so the studio could not fulfil
//  it without writing back to ask which picture.
//
//  DESIGN DECISIONS, stated:
//
//  • CONTINUITY WITH THE GALLERY IS THE POINT. Same ground (#0b0b0f), same gold
//    (#c2a878), same Fraunces display face. The client is one tap out of their
//    gallery; a different-looking page reads as a different company, and asking
//    for card details on a page that feels unrelated is how carts get abandoned.
//
//  • THE PHOTOGRAPH IS THE PRODUCT, so choosing it comes FIRST and stays visible.
//    You pick the picture, then the size — which is the order the decision is
//    actually made in. A list of sizes with no picture is a spreadsheet.
//
//  • THE WORK IS THE DECORATION. The ambient wash behind the hero is the client's
//    own photographs, blurred. No stock gradients, no abstract shapes: the only
//    thing that should be beautiful on this page is their pictures.
//
//  • QUIET UNTIL IT MATTERS. No animation for its own sake, one accent colour,
//    and the cart stays out of the way until there is something in it.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { fetchShop, createOrder, mediaUrl } from '../../../lib/api';
import PublicBrandMark from '@/components/PublicBrandMark';
import PublicNextSteps from '@/components/PublicNextSteps';
import PublicFooter from '@/components/PublicFooter';
import { PublicShell, AmbientWash } from '@/components/public/PublicShell';

// The palette lives in app/public-theme.css and is consumed as custom
// properties. These names are kept only so the inline styles below read
// clearly — they resolve to the SAME tokens the booking page and the portal use,
// so the three cannot drift apart.
const INK = 'var(--pub-bg)', SURFACE = 'var(--pub-surface)', LINE = 'var(--pub-line)';
const GOLD = 'var(--pub-accent)', ON_GOLD = 'var(--pub-on-accent)';
const MUTED = 'var(--pub-ink-2)', DIM = 'var(--pub-ink-3)';

export default function ShopPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading');
  const [cart, setCart] = useState([]);           // {key, product_id, asset_id, name, option, price, qty}
  const [form, setForm] = useState({ name: '', phone: '', email: '', note: '' });
  const [checkout, setCheckout] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [picked, setPicked] = useState(null);     // the chosen photograph
  const [zoom, setZoom] = useState(false);
  const chooseRef = useRef(null);

  useEffect(() => {
    fetchShop(token)
      .then((d) => {
        setData(d);
        setState('ok');
        document.title = `${d.brand?.name ? d.brand.name + ' · ' : ''}Print Shop`;
        if ((d.photos || []).length) setPicked(d.photos[0]);
      })
      .catch(() => setState('missing'));
  }, [token]);

  const sym = data?.currency_symbol || '$';
  const photos = data?.photos || [];
  const products = data?.products || [];
  const total = useMemo(() => cart.reduce((s, c) => s + c.price * c.qty, 0), [cart]);
  const count = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);

  // One cart line per (photograph, product, size). Ordering the same print of two
  // different photographs must not merge into "2 ×" of one of them.
  const add = (product, opt) => {
    const key = `${picked?.id || 'none'}::${product.id}::${opt.label}`;
    setCart((c) => {
      const found = c.find((x) => x.key === key);
      if (found) return c.map((x) => (x.key === key ? { ...x, qty: x.qty + 1 } : x));
      return [...c, {
        key, product_id: product.id, asset_id: picked?.id || null,
        name: product.name, option: opt.label, price: Number(opt.price) || 0, qty: 1,
      }];
    });
    setCartOpen(true);
  };
  const setQty = (key, q) => setCart((c) => c.map((x) => (x.key === key ? { ...x, qty: Math.max(1, q) } : x)).filter((x) => x.qty > 0));
  const remove = (key) => setCart((c) => c.filter((x) => x.key !== key));
  const photoById = (id) => photos.find((p) => p.id === id) || null;

  const place = async () => {
    setErr('');
    if (!form.name || !(form.phone || form.email)) { setErr('Please add your name and a phone number or email.'); return; }
    setBusy(true);
    try {
      const r = await createOrder(token, {
        items: cart.map((c) => ({ product_id: c.product_id, option: c.option, qty: c.qty, asset_id: c.asset_id })),
        ...form,
      });
      setDone(r);
    } catch (e) { setErr(e.message || 'Could not place your order'); setBusy(false); }
  };

  if (state === 'loading') return <Splash />;
  if (state !== 'ok') return (
    <Shell>
      <div style={{ textAlign: 'center', padding: '22vh 24px' }}>
        <h1 className="sh-display" style={{ fontSize: 30, margin: 0, color: '#fff' }}>Shop unavailable</h1>
        <p style={{ color: MUTED, marginTop: 10, fontSize: 14.5 }}>This link is incorrect, or the shop has closed.</p>
      </div>
    </Shell>
  );

  if (done) return (
    <Shell>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '16vh 24px 80px', textAlign: 'center' }}>
        <div style={{ width: 62, height: 62, borderRadius: 999, background: GOLD, color: ON_GOLD, display: 'grid', placeItems: 'center', margin: '0 auto 22px', fontSize: 28 }}>✓</div>
        <h1 className="sh-display" style={{ fontSize: 'clamp(28px,5vw,42px)', margin: 0, color: '#fff', fontWeight: 400 }}>Order placed</h1>
        <p style={{ color: MUTED, fontSize: 15, lineHeight: 1.65, margin: '14px 0 0' }}>
          {sym}{Number(done.total || 0).toLocaleString()} · {done.pay_url ? 'Settle up whenever you are ready.' : 'We’ll be in touch to finalise it.'}
        </p>
        {done.pay_url && (
          <a href={done.pay_url} style={{ display: 'inline-block', marginTop: 22, padding: '13px 26px', borderRadius: 999, background: GOLD, color: ON_GOLD, fontWeight: 700, fontSize: 14, textDecoration: 'none' }}>
            Pay {sym}{Number(done.total || 0).toLocaleString()}
          </a>
        )}
        <PublicNextSteps next={done.next} brand={data?.brand} style={{ marginTop: 30, justifyContent: 'center' }} />
      </div>
    </Shell>
  );

  return (
    <Shell>
      {/* ── Hero. The wash behind it is the client's own work, blurred. ─────── */}
      <header style={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${LINE}` }}>
        <AmbientWash photos={photos} />
        <div style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: 'clamp(44px,8vw,86px) 20px clamp(30px,5vw,52px)', textAlign: 'center' }}>
          <PublicBrandMark brand={data.brand} style={{ marginBottom: 16 }} />
          <p style={{ fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: GOLD, fontWeight: 600, margin: '0 0 12px' }}>
            {data.brand?.name ? `By ${data.brand.name}` : 'Print shop'}
          </p>
          <h1 className="sh-display" style={{ fontSize: 'clamp(30px,5.4vw,58px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.05, margin: 0, color: '#fff' }}>
            Order your prints
          </h1>
          {data.gallery_title && (
            <p style={{ color: DIM, fontSize: 13.5, margin: '14px 0 0' }}>from “{data.gallery_title}”</p>
          )}
        </div>
      </header>

      {products.length === 0 ? (
        <p style={{ textAlign: 'center', color: DIM, padding: '80px 24px', fontSize: 14 }}>No products available yet.</p>
      ) : (
        <div style={{ maxWidth: 1180, margin: '0 auto', padding: `0 20px ${cart.length ? 140 : 80}px` }}>

          {/* ── 1. The photograph, if the gallery has any ────────────────────── */}
          {photos.length > 0 && (
            <section ref={chooseRef} style={{ paddingTop: 'clamp(30px,5vw,54px)' }}>
              <Step n="1" title="Choose a photograph" hint={`${photos.length} in this gallery`} />
              <div className="sh-strip">
                {photos.map((p) => (
                  <button key={p.id} onClick={() => setPicked(p)}
                    className={`sh-thumb${picked?.id === p.id ? ' is-on' : ''}`}
                    aria-label={`Choose photograph ${p.id}`} aria-pressed={picked?.id === p.id}>
                    <img src={mediaUrl(p.thumb)} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── 2. The size, previewed on the chosen photograph ──────────────── */}
          <section style={{ paddingTop: 'clamp(34px,5vw,58px)' }}>
            <Step n={photos.length ? '2' : '1'} title="Choose a size" hint={picked ? 'Shown on your photograph' : null} />

            <div className="sh-split">
              {picked && (
                <div className="sh-preview">
                  {/* Sticky so the picture stays with you while you read the
                      options — the whole point is judging the print, not the list. */}
                  <button className="sh-preview-img" onClick={() => setZoom(true)} aria-label="View larger">
                    <img src={mediaUrl(picked.web || picked.thumb)} alt="" />
                  </button>
                  <p style={{ color: DIM, fontSize: 11.5, textAlign: 'center', margin: '10px 0 0' }}>Tap to view larger</p>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                {products.map((p) => (
                  <article key={p.id} className="sh-product">
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                      <h3 className="sh-display" style={{ fontSize: 21, fontWeight: 400, color: '#fff', margin: 0 }}>{p.name}</h3>
                      <span style={{ fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: GOLD }}>{p.kind}</span>
                    </div>
                    {p.description && <p style={{ fontSize: 13.5, color: MUTED, margin: '7px 0 0', lineHeight: 1.6 }}>{p.description}</p>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 15 }}>
                      {(p.options || []).map((o, i) => (
                        <button key={i} onClick={() => add(p, o)} className="sh-opt">
                          <span className="sh-opt-size">{o.label}</span>
                          <span className="sh-opt-price">{sym}{Number(o.price).toLocaleString()}</span>
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <PublicFooter brand={data.brand} />
        </div>
      )}

      {/* ── Cart ───────────────────────────────────────────────────────────── */}
      {cart.length > 0 && (
        <>
          <div className="sh-bar">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: DIM }}>{count} {count === 1 ? 'item' : 'items'}</div>
              <div className="sh-display" style={{ fontSize: 25, color: '#fff', lineHeight: 1.15 }}>{sym}{total.toLocaleString()}</div>
            </div>
            <button onClick={() => setCartOpen(true)} className="sh-cta">Review order →</button>
          </div>

          {cartOpen && (
            <div className="sh-scrim" onClick={() => { if (!busy) { setCartOpen(false); setCheckout(false); } }}>
              <aside className="sh-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Your order">
                <div className="sh-drawer-head">
                  <h2 className="sh-display" style={{ fontSize: 22, fontWeight: 400, color: '#fff', margin: 0 }}>{checkout ? 'Your details' : 'Your order'}</h2>
                  <button onClick={() => { setCartOpen(false); setCheckout(false); }} className="sh-x" aria-label="Close">✕</button>
                </div>

                <div className="sh-drawer-body">
                  {!checkout ? (
                    cart.map((c) => {
                      const ph = photoById(c.asset_id);
                      return (
                        <div key={c.key} className="sh-line">
                          {/* Every line carries its photograph. The order the studio
                              receives now names the image too, so it is fulfillable. */}
                          {ph ? <img className="sh-line-img" src={mediaUrl(ph.thumb)} alt="" />
                              : <div className="sh-line-img" style={{ background: SURFACE }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, color: '#fff', fontWeight: 600 }}>{c.name}</div>
                            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>{c.option} · {sym}{c.price.toLocaleString()}</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                              <button className="sh-qty" onClick={() => setQty(c.key, c.qty - 1)} aria-label="Fewer">−</button>
                              <span style={{ fontSize: 13, color: '#fff', minWidth: 16, textAlign: 'center' }}>{c.qty}</span>
                              <button className="sh-qty" onClick={() => setQty(c.key, c.qty + 1)} aria-label="More">+</button>
                              <button onClick={() => remove(c.key)} style={{ marginLeft: 6, background: 'none', border: 'none', color: DIM, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}>Remove</button>
                            </div>
                          </div>
                          <div style={{ fontSize: 13.5, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>{sym}{(c.price * c.qty).toLocaleString()}</div>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ display: 'grid', gap: 12 }}>
                      <Field label="Full name" required>
                        <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="sh-input" placeholder="Your name" />
                      </Field>
                      <div className="sh-two">
                        <Field label="Phone"><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="sh-input" placeholder="+92 300 0000000" /></Field>
                        <Field label="Email"><input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="sh-input" placeholder="you@example.com" /></Field>
                      </div>
                      <p style={{ fontSize: 11.5, color: DIM, margin: '-4px 0 0' }}>A phone number or an email — whichever you prefer to be reached on.</p>
                      <Field label="Anything we should know?">
                        <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={3} className="sh-input" style={{ resize: 'vertical' }} placeholder="Framing, delivery, a deadline…" />
                      </Field>
                    </div>
                  )}
                  {err && <p style={{ color: '#f87171', fontSize: 13, marginTop: 14 }}>{err}</p>}
                </div>

                <div className="sh-drawer-foot">
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 13 }}>
                    <span style={{ color: MUTED, fontSize: 13 }}>Total</span>
                    <span className="sh-display" style={{ fontSize: 22, color: '#fff' }}>{sym}{total.toLocaleString()}</span>
                  </div>
                  {!checkout ? (
                    <button onClick={() => setCheckout(true)} className="sh-cta" style={{ width: '100%' }}>Continue →</button>
                  ) : (
                    <div style={{ display: 'flex', gap: 9 }}>
                      <button onClick={() => setCheckout(false)} disabled={busy} className="sh-ghost">Back</button>
                      <button onClick={place} disabled={busy} className="sh-cta" style={{ flex: 1 }}>
                        {busy ? 'Placing…' : 'Place order'}
                      </button>
                    </div>
                  )}
                </div>
              </aside>
            </div>
          )}
        </>
      )}

      {zoom && picked && (
        <div className="sh-scrim" onClick={() => setZoom(false)} style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <img src={mediaUrl(picked.web || picked.thumb)} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 10, boxShadow: '0 40px 120px rgba(0,0,0,0.7)' }} />
        </div>
      )}
    </Shell>
  );
}

function Step({ n, title, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
      <span style={{ width: 24, height: 24, borderRadius: 999, border: `1px solid ${GOLD}`, color: GOLD, fontSize: 11.5, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{n}</span>
      <h2 className="sh-display" style={{ fontSize: 'clamp(20px,2.6vw,27px)', fontWeight: 400, color: '#fff', margin: 0 }}>{title}</h2>
      {hint && <span style={{ fontSize: 12, color: DIM }}>{hint}</span>}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: MUTED, marginBottom: 7, fontWeight: 600 }}>
        {label}{required && <span style={{ color: GOLD }}> *</span>}
      </span>
      {children}
    </label>
  );
}

function Splash() {
  return (
    <Shell>
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '70vh' }}>
        <div className="sh-spin" />
      </div>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <PublicShell>
      {children}
      <style>{`
        /* Type and the shared tokens come from app/public-theme.css. What is left
           here is only what is specific to a SHOP: the photograph chooser, the
           sticky preview, the cart drawer. */
        .sh-display { font-family: var(--pub-display); font-weight: 400; letter-spacing: -0.02em; }
        .sh-spin { width: 26px; height: 26px; border: 2px solid ${LINE}; border-top-color: ${GOLD}; border-radius: 50%; animation: shspin .9s linear infinite; }
        @keyframes shspin { to { transform: rotate(360deg); } }

        /* The photograph chooser. A horizontal reel on a phone, a grid above it —
           on a small screen a wrapping grid of 40 thumbnails buries the products. */
        .sh-strip { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 10px; }
        @media (max-width: 700px) {
          .sh-strip { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 6px; -webkit-overflow-scrolling: touch; }
          .sh-strip > * { flex: 0 0 108px; scroll-snap-align: start; }
        }
        .sh-thumb { position: relative; padding: 0; border: none; background: ${SURFACE}; border-radius: 10px; overflow: hidden; cursor: pointer; aspect-ratio: 1 / 1; outline: 2px solid transparent; outline-offset: 2px; transition: outline-color .15s, transform .15s; }
        .sh-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; transition: opacity .2s; opacity: .62; }
        .sh-thumb:hover img { opacity: .85; }
        .sh-thumb.is-on { outline-color: ${GOLD}; }
        .sh-thumb.is-on img { opacity: 1; }

        /* Picture left, options right — and the picture stays put while you read. */
        .sh-split { display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr); gap: clamp(18px, 3vw, 38px); align-items: start; }
        @media (max-width: 900px) { .sh-split { grid-template-columns: 1fr; } }
        .sh-preview { position: sticky; top: 22px; }
        @media (max-width: 900px) { .sh-preview { position: static; } }
        .sh-preview-img { display: block; width: 100%; padding: 0; border: 1px solid ${LINE}; background: ${SURFACE}; border-radius: 12px; overflow: hidden; cursor: zoom-in; }
        .sh-preview-img img { width: 100%; display: block; }

        .sh-product { border: 1px solid ${LINE}; border-radius: 14px; padding: clamp(16px, 2.4vw, 22px); background: linear-gradient(180deg, rgba(255,255,255,0.028), transparent); }
        .sh-opt { display: inline-flex; align-items: baseline; gap: 9px; padding: 10px 15px; border-radius: 10px; border: 1px solid ${LINE}; background: ${SURFACE}; color: #fff; font-family: inherit; cursor: pointer; transition: border-color .14s, background .14s; }
        .sh-opt:hover { border-color: ${GOLD}; background: #1b1b22; }
        .sh-opt-size { font-size: 13.5px; font-weight: 600; }
        .sh-opt-price { font-size: 13px; color: ${GOLD}; font-weight: 700; }

        .sh-cta { padding: 13px 26px; border-radius: 999px; border: none; cursor: pointer; background: ${GOLD}; color: ${ON_GOLD}; font-family: inherit; font-size: 14px; font-weight: 700; white-space: nowrap; }
        .sh-cta:disabled { opacity: .6; cursor: wait; }
        .sh-ghost { padding: 13px 20px; border-radius: 999px; border: 1px solid ${LINE}; background: transparent; color: ${MUTED}; font-family: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }

        .sh-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; display: flex; align-items: center; gap: 16px; padding: 13px clamp(14px, 4vw, 34px); background: rgba(13,13,18,0.9); backdrop-filter: blur(18px); border-top: 1px solid ${LINE}; }
        .sh-scrim { position: fixed; inset: 0; z-index: 50; background: rgba(6,6,9,0.72); backdrop-filter: blur(6px); display: flex; justify-content: flex-end; }
        .sh-drawer { width: min(430px, 100%); background: #101016; border-left: 1px solid ${LINE}; display: flex; flex-direction: column; animation: shin .24s cubic-bezier(.2,.8,.3,1); }
        @keyframes shin { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .sh-drawer { animation: none; } }
        @media (max-width: 560px) { .sh-scrim { align-items: flex-end; } .sh-drawer { width: 100%; max-height: 88vh; border-left: none; border-top: 1px solid ${LINE}; border-radius: 18px 18px 0 0; } }
        .sh-drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 20px 22px 14px; border-bottom: 1px solid ${LINE}; }
        .sh-drawer-body { flex: 1; overflow-y: auto; padding: 16px 22px; }
        .sh-drawer-foot { padding: 16px 22px 22px; border-top: 1px solid ${LINE}; }
        .sh-x { width: 30px; height: 30px; border-radius: 8px; border: none; background: ${SURFACE}; color: ${MUTED}; cursor: pointer; font-size: 13px; }

        .sh-line { display: flex; gap: 12px; padding: 13px 0; }
        .sh-line + .sh-line { border-top: 1px solid ${LINE}; }
        .sh-line-img { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
        .sh-qty { width: 26px; height: 26px; border-radius: 7px; border: 1px solid ${LINE}; background: ${SURFACE}; color: #fff; cursor: pointer; font-size: 14px; line-height: 1; }

        .sh-input { width: 100%; padding: 12px 13px; border-radius: 10px; border: 1px solid ${LINE}; background: ${SURFACE}; color: #fff; font-size: 14.5px; font-family: inherit; outline: none; box-sizing: border-box; }
        .sh-input:focus { border-color: ${GOLD}; }
        .sh-input::placeholder { color: #5b5b66; }
        .sh-two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 460px) { .sh-two { grid-template-columns: 1fr; } }
      `}</style>
    </PublicShell>
  );
}
