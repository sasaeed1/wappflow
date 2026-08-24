'use client';

// Reset password — choosing a new one (Phase 9).
//
// The link's validity is checked BEFORE asking for a password, so somebody who
// clicks an expired link is told immediately rather than typing a new password
// twice and only then being refused.
//
// Deliberately does not sign the user in on success. Possession of a mailbox is
// enough to choose a new password; it is not enough to become them. They prove
// the change worked by signing in with it.

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Lock, ArrowLeft, Check, AlertTriangle } from 'lucide-react';
import { BASE_URL } from '@/lib/api';

function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') || '';

  const [state, setState] = useState('checking');   // checking | ok | invalid | done
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    fetch(`${BASE_URL}/api/auth/reset-password/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setState(d.valid ? 'ok' : 'invalid'))
      .catch(() => setState('invalid'));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (pw !== pw2) { setErr('Those two passwords do not match.'); return; }
    if (pw.length < 8) { setErr('Use at least 8 characters.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${BASE_URL}/api/auth/reset-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: pw }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || 'Could not reset the password.'); return; }
      setState('done');
      setTimeout(() => router.push('/login'), 2600);
    } catch {
      setErr('Something went wrong. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <a href="/login" style={back}><ArrowLeft size={14} /> Back to sign in</a>

        {state === 'checking' && <p style={sub}>Checking your link…</p>}

        {state === 'invalid' && (
          <>
            <div style={{ ...tick, background: 'var(--danger-bg, rgba(239,68,68,0.14))', color: 'var(--danger-fg, #ef4444)' }}>
              <AlertTriangle size={24} />
            </div>
            <h1 style={h1}>That link no longer works</h1>
            <p style={sub}>Reset links can be used once and expire after an hour. Request a fresh one and it will work.</p>
            <a href="/forgot-password" style={{ ...btn, display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 18 }}>
              Send a new link
            </a>
          </>
        )}

        {state === 'done' && (
          <>
            <div style={tick}><Check size={26} /></div>
            <h1 style={h1}>Password changed</h1>
            <p style={sub}>You have been signed out everywhere else. Taking you to sign in…</p>
          </>
        )}

        {state === 'ok' && (
          <>
            <h1 style={h1}>Choose a new password</h1>
            <p style={sub}>This also signs you out on any other device, in case somebody else had your old one.</p>
            <form onSubmit={submit} style={{ marginTop: 20 }}>
              <label style={lbl}>New password</label>
              <div style={inputWrap}>
                <Lock size={16} />
                <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)}
                       placeholder="At least 8 characters" autoComplete="new-password" style={input} />
              </div>
              <label style={{ ...lbl, marginTop: 14 }}>Confirm it</label>
              <div style={inputWrap}>
                <Lock size={16} />
                <input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)}
                       placeholder="Type it again" autoComplete="new-password" style={input} />
              </div>
              {err && <p role="alert" style={errStyle}>{err}</p>}
              <button type="submit" disabled={busy || !pw || !pw2} style={btn}>
                {busy ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// useSearchParams needs a Suspense boundary in the App Router.
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={wrap}><div style={card}><p style={sub}>Loading…</p></div></div>}>
      <ResetPasswordInner />
    </Suspense>
  );
}

const wrap = { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--bg)' };
const card = { width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 30 };
const back = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 20 };
const h1 = { fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', letterSpacing: '-0.02em' };
const sub = { fontSize: 14, color: 'var(--text-muted)', margin: 0, lineHeight: 1.55 };
const lbl = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text)', marginBottom: 6 };
const inputWrap = { display: 'flex', alignItems: 'center', gap: 9, padding: '11px 13px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--bg)', color: 'var(--text-muted)' };
const input = { flex: 1, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 14, outline: 'none' };
const btn = { width: '100%', marginTop: 16, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer' };
const errStyle = { fontSize: 13, color: 'var(--danger-fg, #b91c1c)', margin: '10px 0 0' };
const tick = { width: 52, height: 52, borderRadius: 999, background: 'var(--success-bg, rgba(16,185,129,0.15))', color: 'var(--success-fg, #10b981)', display: 'grid', placeItems: 'center', marginBottom: 16 };
