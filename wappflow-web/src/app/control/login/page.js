'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { ccAuth } from '@/lib/ccApi';

export default function ControlLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('cc_token')) router.replace('/control');
  }, [router]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await ccAuth.login(email.trim().toLowerCase(), password);
      localStorage.setItem('cc_token', r.data.token);
      localStorage.setItem('cc_admin', JSON.stringify(r.data.admin));
      router.replace('/control');
    } catch (e2) {
      setErr(e2.response?.data?.error || 'Login failed');
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #e8e8ea)', padding: 20 }}>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 380, background: 'var(--surface, #14141b)', border: '1px solid var(--border, #1e1e26)', borderRadius: 16, padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#0ea5e9)', display: 'grid', placeItems: 'center' }}><ShieldCheck size={19} /></div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Command Center</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim, #666)' }}>Platform admins only</div>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-dim, #666)', margin: '4px 0 18px' }}>This is the WappFlow control plane. Access is restricted and fully audited.</p>

        <label style={lbl}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus style={inp} />
        <label style={lbl}>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inp} />

        {err && <div style={{ color: '#f87171', fontSize: 13, margin: '4px 0 12px' }}>{err}</div>}

        <button type="submit" disabled={busy} style={{ width: '100%', marginTop: 8, padding: '11px', borderRadius: 10, border: 'none', background: busy ? '#4f46e5aa' : 'linear-gradient(135deg,#6366f1,#0ea5e9)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #9a9aa5)', margin: '12px 0 5px' };
const inp = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border, #1e1e26)', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #e8e8ea)', fontSize: 14 };
