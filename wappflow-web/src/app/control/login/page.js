'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Smartphone, KeyRound, Copy, Check } from 'lucide-react';
import { ccAuth } from '@/lib/ccApi';

// Command Center sign-in: password, then a 6-digit code from an authenticator app.
// An admin without 2FA is walked through setting it up before any session exists.
//   step: password → code            (2FA already on)
//   step: password → setup → codes   (first sign-in after PROP-005)
export default function ControlLogin() {
  const router = useRouter();
  const [step, setStep] = useState('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState(null);     // { secret, uri, qr }
  const [recovery, setRecovery] = useState(null); // shown once
  const [pending, setPending] = useState(null);   // session held until codes are acknowledged
  const [useRecovery, setUseRecovery] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('cc_token')) router.replace('/control');
  }, [router]);

  const finish = (data) => {
    localStorage.setItem('cc_token', data.token);
    localStorage.setItem('cc_admin', JSON.stringify(data.admin));
    router.replace('/control');
  };
  const fail = (e2, fallback) => { setErr(e2.response?.data?.error || fallback); setBusy(false); };
  const restart = () => { setStep('password'); setCode(''); setSetup(null); setErr(''); setBusy(false); };

  const submitPassword = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await ccAuth.login(email.trim().toLowerCase(), password);
      setMfaToken(r.data.mfa_token); setPassword('');
      if (r.data.mfa_required) { setStep('code'); setBusy(false); return; }
      // First time: create the authenticator secret straight away.
      const s = await ccAuth.mfaSetup(r.data.mfa_token);
      setSetup(s.data); setStep('setup'); setBusy(false);
    } catch (e2) { fail(e2, 'Sign-in failed'); }
  };

  const submitCode = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await ccAuth.loginMfa(mfaToken, code.trim()); finish(r.data); }
    catch (e2) {
      if (e2.response?.status === 401 && /expired/i.test(e2.response?.data?.error || '')) { restart(); setErr(e2.response.data.error); return; }
      fail(e2, 'That code did not work');
    }
  };

  const submitEnable = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await ccAuth.mfaEnable(mfaToken, code.trim());
      setRecovery(r.data.recovery_codes); setPending(r.data); setStep('codes'); setBusy(false);
    } catch (e2) { fail(e2, 'That code did not work'); }
  };

  const copyCodes = async () => {
    try { await navigator.clipboard.writeText(recovery.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #e8e8ea)', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--surface, #14141b)', border: '1px solid var(--border, #1e1e26)', borderRadius: 16, padding: 'clamp(20px, 5vw, 28px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'grid', placeItems: 'center' }}><ShieldCheck size={19} /></div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Command Center</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim, #666)' }}>Platform admins only · every action is audited</div>
          </div>
        </div>

        {step === 'password' && (
          <form onSubmit={submitPassword}>
            <label style={lbl} htmlFor="cc-email">Email</label>
            <input id="cc-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus style={inp} />
            <label style={lbl} htmlFor="cc-pass">Password</label>
            <input id="cc-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inp} />
            {err && <Err>{err}</Err>}
            <Primary busy={busy}>{busy ? 'Checking…' : 'Continue'}</Primary>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={submitCode}>
            <Step icon={useRecovery ? KeyRound : Smartphone} title={useRecovery ? 'Enter a recovery code' : 'Enter your authenticator code'}
              sub={useRecovery ? 'One of the 8-character codes you saved when you set up two-step verification. Each works once.' : 'Open your authenticator app and type the 6-digit code for WappFlow Command Center.'} />
            <input aria-label={useRecovery ? 'Recovery code' : 'Authenticator code'} autoFocus value={code}
              onChange={(e) => setCode(useRecovery ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode={useRecovery ? 'text' : 'numeric'} autoComplete="one-time-code" placeholder={useRecovery ? 'XXXX-XXXX' : '123456'}
              style={{ ...inp, fontSize: 22, letterSpacing: '0.3em', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
            {err && <Err>{err}</Err>}
            <Primary busy={busy}>{busy ? 'Verifying…' : 'Sign in'}</Primary>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
              <Link onClick={() => { setUseRecovery((v) => !v); setCode(''); setErr(''); }}>{useRecovery ? 'Use authenticator code' : 'Lost your phone? Use a recovery code'}</Link>
              <Link onClick={restart}>Start over</Link>
            </div>
          </form>
        )}

        {step === 'setup' && setup && (
          <form onSubmit={submitEnable}>
            <Step icon={Smartphone} title="Set up two-step verification" sub="Required for every Command Center admin. It takes a minute." />
            <ol style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--text-muted,#9a9aa5)' }}>
              <li>Install an authenticator app: Google Authenticator, Microsoft Authenticator or 1Password.</li>
              <li>Scan this code, or enter the key by hand.</li>
              <li>Type the 6-digit code it shows.</li>
            </ol>
            {setup.qr && <div style={{ display: 'grid', placeItems: 'center', margin: '4px 0 10px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated by our own API */}
              <img src={setup.qr} alt="QR code for your authenticator app" width={200} height={200} style={{ borderRadius: 12, background: '#fff', padding: 8 }} />
            </div>}
            <div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)', marginBottom: 4 }}>Setup key (if you can’t scan)</div>
            <code style={{ display: 'block', wordBreak: 'break-all', fontSize: 13, padding: '8px 10px', borderRadius: 8, background: 'var(--bg,#0a0a0f)', border: '1px solid var(--border,#1e1e26)', letterSpacing: '.08em' }}>{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
            <label style={lbl} htmlFor="cc-setup-code">6-digit code from the app</label>
            <input id="cc-setup-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="123456"
              style={{ ...inp, fontSize: 22, letterSpacing: '0.3em', textAlign: 'center' }} />
            {err && <Err>{err}</Err>}
            <Primary busy={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on two-step verification'}</Primary>
            <div style={{ marginTop: 12 }}><Link onClick={restart}>Start over</Link></div>
          </form>
        )}

        {step === 'codes' && recovery && (
          <div>
            <Step icon={KeyRound} title="Save your recovery codes" sub="If you lose your phone, each of these lets you sign in once. This is the only time they are shown." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6, padding: 12, borderRadius: 10, background: 'var(--bg,#0a0a0f)', border: '1px solid var(--border,#1e1e26)', fontFamily: 'ui-monospace, monospace', fontSize: 14, letterSpacing: '.06em' }}>
              {recovery.map((c) => <span key={c}>{c}</span>)}
            </div>
            <button type="button" onClick={copyCodes} style={{ ...ghost, marginTop: 10 }}>{copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy codes</>}</button>
            <p style={{ fontSize: 12.5, color: 'var(--text-dim,#666)', margin: '12px 0 0' }}>Store them in a password manager or print them. Don’t keep them only on the phone that has the authenticator.</p>
            <button type="button" onClick={() => finish(pending)} style={{ ...primaryBtn, marginTop: 14 }}>I’ve saved them — continue</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Step({ icon: Icon, title, sub }) {
  return (
    <div style={{ margin: '14px 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}><Icon size={16} /> {title}</div>
      <p style={{ fontSize: 12.5, color: 'var(--text-dim, #777)', margin: '4px 0 0', lineHeight: 1.55 }}>{sub}</p>
    </div>
  );
}
const Err = ({ children }) => <div role="alert" style={{ color: '#f87171', fontSize: 13, margin: '8px 0 4px' }}>{children}</div>;
const Primary = ({ busy, children }) => <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.65 : 1, cursor: busy ? 'default' : 'pointer' }}>{children}</button>;
const Link = ({ onClick, children }) => <button type="button" onClick={onClick} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent,#818cf8)', fontSize: 12.5, cursor: 'pointer' }}>{children}</button>;

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #9a9aa5)', margin: '12px 0 5px' };
const inp = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border, #1e1e26)', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #e8e8ea)', fontSize: 14, boxSizing: 'border-box' };
const primaryBtn = { width: '100%', marginTop: 12, padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#6366f1,#a855f7)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const ghost = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border,#1e1e26)', background: 'transparent', color: 'var(--text,#e8e8ea)', fontSize: 13, cursor: 'pointer' };
