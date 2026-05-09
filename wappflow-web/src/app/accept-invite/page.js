'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Zap, Lock, User, ArrowRight, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';
import { inviteAPI } from '../../lib/api';

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [info, setInfo] = useState(null);   // { email, workspace_name, role }
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ full_name: '', password: '', confirm: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError('Invalid invite link.'); setLoading(false); return; }
    inviteAPI.getInfo(token)
      .then(res => { setInfo(res.data); setLoading(false); })
      .catch(() => { setError('This invite link is invalid or has already been used.'); setLoading(false); });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    setSubmitting(true);
    try {
      const res = await inviteAPI.accept({ token, password: form.password, full_name: form.full_name });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      if (res.data.workspace) localStorage.setItem('workspace', JSON.stringify(res.data.workspace));
      setDone(true);
      setTimeout(() => router.push('/dashboard'), 1800);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to accept invite');
    } finally { setSubmitting(false); }
  };

  const ROLE_LABELS = { super_admin: 'Super Admin', admin: 'Admin', manager: 'Manager', user: 'User' };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eef2ff 0%, #ecfeff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#9ca3af' }}>
          <div style={{ width: 36, height: 36, border: '3px solid #c7d2fe', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ fontWeight: 600 }}>Loading invite...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eef2ff 0%, #ecfeff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(99,102,241,0.3)' }}>
              <Zap size={22} color="white" />
            </div>
            <span style={{ fontSize: 26, fontWeight: 900, color: '#111827', letterSpacing: '-0.5px' }}>WappFlow</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', padding: '3px 10px', borderRadius: 20 }}>PRO</span>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.08)', padding: 32, border: '1.5px solid #f3f4f6' }}>
          {error && !info ? (
            /* Invalid link state */
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: 20, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <AlertCircle size={28} color="#ef4444" />
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Invalid Invite Link</h1>
              <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 24px' }}>{error}</p>
              <button onClick={() => router.push('/login')} style={{ padding: '11px 28px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                Go to Login
              </button>
            </div>
          ) : done ? (
            /* Success state */
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ width: 60, height: 60, borderRadius: 20, background: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CheckCircle size={28} color="#10b981" />
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: '0 0 8px' }}>Welcome aboard!</h1>
              <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Redirecting you to the dashboard...</p>
            </div>
          ) : (
            /* Setup form */
            <>
              {/* Workspace badge */}
              {info && (
                <div style={{ background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 14, padding: '14px 18px', marginBottom: 24 }}>
                  <p style={{ fontSize: 12, color: '#166534', fontWeight: 700, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>You're invited to</p>
                  <p style={{ fontSize: 18, fontWeight: 900, color: '#111827', margin: '0 0 4px' }}>{info.workspace_name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{info.email}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#6366f118', color: '#6366f1' }}>
                      {ROLE_LABELS[info.role] || info.role}
                    </span>
                  </div>
                </div>
              )}

              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>Set up your account</h1>
              <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 24px' }}>Choose a name and password to get started</p>

              {error && (
                <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Full Name</label>
                  <div style={{ position: 'relative' }}>
                    <User size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input
                      type="text" required
                      value={form.full_name}
                      onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                      placeholder="John Smith"
                      style={{ width: '100%', padding: '12px 14px 12px 40px', border: '1.5px solid #e5e7eb', borderRadius: 11, fontSize: 14, color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                      onFocus={e => e.target.style.borderColor = '#6366f1'}
                      onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input
                      type={showPwd ? 'text' : 'password'} required minLength={6}
                      value={form.password}
                      onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                      placeholder="At least 6 characters"
                      style={{ width: '100%', padding: '12px 44px 12px 40px', border: '1.5px solid #e5e7eb', borderRadius: 11, fontSize: 14, color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                      onFocus={e => e.target.style.borderColor = '#6366f1'}
                      onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                    />
                    <button type="button" onClick={() => setShowPwd(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div style={{ marginBottom: 22 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Confirm Password</label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input
                      type={showPwd ? 'text' : 'password'} required
                      value={form.confirm}
                      onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
                      placeholder="Repeat password"
                      style={{ width: '100%', padding: '12px 14px 12px 40px', border: `1.5px solid ${form.confirm && form.confirm !== form.password ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 11, fontSize: 14, color: '#111827', outline: 'none', boxSizing: 'border-box' }}
                      onFocus={e => e.target.style.borderColor = '#6366f1'}
                      onBlur={e => e.target.style.borderColor = (form.confirm && form.confirm !== form.password) ? '#fca5a5' : '#e5e7eb'}
                    />
                  </div>
                </div>

                <button
                  type="submit" disabled={submitting}
                  style={{ width: '100%', padding: '13px', background: submitting ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', border: 'none', borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 20px rgba(99,102,241,0.35)' }}
                >
                  {submitting ? (
                    <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Setting up account…</>
                  ) : (
                    <>Join Workspace <ArrowRight size={15} /></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eef2ff 0%, #ecfeff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#9ca3af', fontFamily: 'system-ui, sans-serif' }}>Loading...</div>
      </div>
    }>
      <AcceptInviteContent />
    </Suspense>
  );
}
