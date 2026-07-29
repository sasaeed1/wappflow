'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { fetchPayment } from '../../../lib/api';
import PublicScope from '@/components/PublicScope';
import PublicFooter from '@/components/PublicFooter';

export default function PayPage() {
  const { token } = useParams();
  const search = useSearchParams();
  const [p, setP] = useState(null);
  const [state, setState] = useState('loading');
  const status = search.get('status');

  useEffect(() => { fetchPayment(token).then(d => { setP(d); setState('ok'); }).catch(() => setState('missing')); }, [token]);

  if (state === 'loading') return <div style={c}><div style={sp} /><style>{`@keyframes csp{to{transform:rotate(360deg)}}`}</style></div>;
  if (state !== 'ok') return <div style={{ ...c, flexDirection: 'column', gap: 8 }}><h1 style={{ margin: 0, fontSize: 24 }}>Payment not found</h1><p style={{ color: '#70707a' }}>This link is incorrect or expired.</p></div>;

  const paid = p.status === 'paid' || status === 'success';
  return (
    <div className="wf-public" style={{ ...c, flexDirection: 'column' }}>
      <PublicScope />
      <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 18, padding: 28, boxShadow: '0 30px 80px rgba(0,0,0,0.12)', textAlign: 'center' }}>
        {paid ? (
          <>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: '#10b981', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, marginBottom: 14 }}>✓</div>
            <h1 style={{ fontSize: 24, margin: 0, color: '#16161a' }}>Payment received</h1>
            <p style={{ color: '#70707a', fontSize: 14, marginTop: 6 }}>Thank you — {p.currency_symbol}{Number(p.amount).toLocaleString()} paid.</p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8a8a93' }}>Amount due</div>
            <div style={{ fontSize: 40, fontWeight: 800, color: '#16161a', margin: '6px 0 2px', letterSpacing: '-0.02em' }}>{p.currency_symbol}{Number(p.amount).toLocaleString()}</div>
            <p style={{ color: '#70707a', fontSize: 14, marginBottom: 20 }}>{p.description || 'Payment'}</p>
            {status === 'cancelled' && <p style={{ color: '#f59e0b', fontSize: 13, marginBottom: 12 }}>Payment cancelled — you can try again below.</p>}
            {p.checkout_url ? (
              <a href={p.checkout_url} style={{ display: 'block', padding: '14px', borderRadius: 12, background: '#16161a', color: '#fff', fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>Pay securely →</a>
            ) : (
              <div style={{ padding: '14px', borderRadius: 12, background: '#f5f5f7', color: '#55555e', fontSize: 13.5, lineHeight: 1.5 }}>Online payment isn’t enabled yet. Please complete payment with the studio directly — they’ll mark this as paid.</div>
            )}
            <p style={{ fontSize: 11.5, color: '#a8aeb8', marginTop: 16 }}>🔒 Secure payment</p>
          </>
        )}
      </div>
      <PublicFooter style={{ padding: '18px 0 0' }} />
    </div>
  );
}

const c = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(180deg,#f6f7f9,#eceef2)', padding: 16 };
const sp = { width: 26, height: 26, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: '#16161a', borderRadius: '50%', animation: 'csp .9s linear infinite' };
