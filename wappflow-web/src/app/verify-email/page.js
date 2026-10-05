'use client';

// Confirm email (PROP-006). The link in the sign-up email lands here; confirming
// needs no sign-in, because owning the mailbox is exactly what is being proved.

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, AlertTriangle } from 'lucide-react';
import { authAPI } from '@/lib/api';

function VerifyInner() {
  const token = useSearchParams().get('token') || '';
  const [state, setState] = useState('checking'); // checking | done | invalid
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    authAPI.verifyEmail(token)
      .then(() => setState('done'))
      .catch((e) => { setMsg(e?.response?.data?.error || ''); setState('invalid'); });
  }, [token]);

  return (
    <div style={wrap}>
      <div style={card}>
        {state === 'checking' && <p style={sub}>Confirming your email…</p>}
        {state === 'done' && (
          <>
            <div style={tick}><Check size={26} /></div>
            <h1 style={h1}>Email confirmed</h1>
            <p style={sub}>Thanks. We&apos;ll use this address for account and security messages.</p>
            <a href="/dashboard" style={btn}>Go to WappFlow</a>
          </>
        )}
        {state === 'invalid' && (
          <>
            <div style={{ ...tick, background: 'var(--danger-bg, rgba(239,68,68,0.14))', color: 'var(--danger-fg, #ef4444)' }}><AlertTriangle size={24} /></div>
            <h1 style={h1}>That link doesn&apos;t work</h1>
            <p style={sub}>{msg || 'It may have been used already.'} You can send a fresh one from Settings, Password & Security.</p>
            <a href="/settings?tab=password" style={btn}>Open Settings</a>
          </>
        )}
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary in the App Router.
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div style={wrap}><div style={card}><p style={sub}>Loading…</p></div></div>}>
      <VerifyInner />
    </Suspense>
  );
}

const wrap = { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)' };
const card = { width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 30 };
const h1 = { fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-0.02em' };
const sub = { fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 };
const btn = { display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 18, padding: '12px', borderRadius: 10, background: 'var(--accent)', color: '#fff', fontSize: 14.5, fontWeight: 700 };
const tick = { width: 52, height: 52, borderRadius: 999, background: 'var(--success-bg, rgba(16,185,129,0.15))', color: 'var(--success-fg, #10b981)', display: 'grid', placeItems: 'center', marginBottom: 16 };
