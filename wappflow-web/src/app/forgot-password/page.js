'use client';

// Forgot password — the way back in (Phase 9).
//
// There was no reset flow of any kind and the login page carried a placeholder
// comment where this link should be, so a studio owner who forgot their password
// was locked out of their own business with no self-serve route at all.
//
// The response is deliberately the SAME whether or not the email is registered:
// anything else turns this page into a way to ask "does this person have an
// account?" about anybody on the platform.

import { useState } from 'react';
import { Mail, ArrowLeft, Check } from 'lucide-react';
import { BASE_URL } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!r.ok) throw new Error();
      setSent(true);
    } catch {
      setErr('Something went wrong. Please try again in a moment.');
    } finally { setBusy(false); }
  };

  return (
    <div style={wrap}>
      <div style={card}>
        <a href="/login" style={back}><ArrowLeft size={14} /> Back to sign in</a>
        {sent ? (
          <>
            <div style={tick}><Check size={26} /></div>
            <h1 style={h1}>Check your email</h1>
            <p style={sub}>
              If that email has an account, a reset link is on its way. It works once and
              expires in an hour.
            </p>
            <p style={{ ...sub, fontSize: 12.5, marginTop: 14 }}>
              Nothing arrived? Check spam, or ask your studio owner — if your workspace has
              no email sending configured, they may need to set it up.
            </p>
          </>
        ) : (
          <>
            <h1 style={h1}>Forgot your password?</h1>
            <p style={sub}>Tell us the email you sign in with and we will send you a link to choose a new password.</p>
            <form onSubmit={submit} style={{ marginTop: 20 }}>
              <label style={lbl}>Email</label>
              <div style={inputWrap}>
                <Mail size={16} />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                       placeholder="you@studio.com" autoComplete="email" style={input} />
              </div>
              {err && <p role="alert" style={errStyle}>{err}</p>}
              <button type="submit" disabled={busy || !email.trim()} style={btn}>
                {busy ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
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
