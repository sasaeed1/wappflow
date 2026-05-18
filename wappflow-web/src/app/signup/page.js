'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap, Mail, Lock, Building2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { authAPI } from '../../lib/api';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

function SignupContent() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    businessName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const saveAuthData = (data) => {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    if (data.workspace) localStorage.setItem('workspace', JSON.stringify(data.workspace));
    router.push('/dashboard');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const response = await authAPI.register(formData);
      saveAuthData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Sign-up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.google({
        credential: credentialResponse.credential,
        businessName: formData.businessName || undefined,
      });
      saveAuthData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Google sign-up failed');
    } finally {
      setLoading(false);
    }
  };

  const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #eef2ff 0%, #ecfeff 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo + brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(99,102,241,0.3)' }}>
              <Zap size={22} color="white" />
            </div>
            <span style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.5px' }}>WappFlow</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', background: 'rgba(99,102,241,0.12)', border: '1px solid #c7d2fe', padding: '3px 10px', borderRadius: 20 }}>PRO</span>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>Powered by</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#6366f1' }}>RemoteOps</span>
          </div>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>Start managing your WhatsApp leads in minutes</p>
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 20, boxShadow: 'var(--shadow)', padding: 32, border: '1.5px solid var(--border)' }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>Create your free account</h1>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '0 0 24px' }}>No credit card required</p>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.12)', border: '1.5px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Google Sign-Up */}
          {GOOGLE_CLIENT_ID && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError('Google sign-up failed')}
                  width="376"
                  text="signup_with"
                  shape="rectangular"
                  theme="outline"
                  size="large"
                />
              </div>
            </div>
          )}

          {GOOGLE_CLIENT_ID && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>OR</span>
              <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Business name</label>
              <div style={{ position: 'relative' }}>
                <Building2 size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  type="text"
                  required
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  placeholder="My Shop"
                  style={{ width: '100%', padding: '12px 14px 12px 40px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', transition: 'all 0.15s' }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Email</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com"
                  style={{ width: '100%', padding: '12px 14px 12px 40px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', transition: 'all 0.15s' }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="At least 6 characters"
                  style={{ width: '100%', padding: '12px 44px 12px 40px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', transition: 'all 0.15s' }}
                  onFocus={e => e.target.style.borderColor = '#6366f1'}
                  onBlur={e => e.target.style.borderColor = '#e5e7eb'}
                />
                <button type="button" onClick={() => setShowPwd(s => !s)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', padding: '13px', background: loading ? '#a5b4fc' : 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', border: 'none', borderRadius: 11, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 20px rgba(99,102,241,0.35)', transition: 'transform 0.1s' }}
              onMouseDown={e => !loading && (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={e => e.currentTarget.style.transform = 'none'}
            >
              {loading ? (
                <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Creating account…</>
              ) : (
                <>Create account <ArrowRight size={15} /></>
              )}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
            <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>OR</span>
            <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
          </div>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', margin: 0 }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#6366f1', fontWeight: 700, textDecoration: 'none' }}>
              Sign in
            </Link>
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 20 }}>
          By creating an account you agree to our terms and privacy policy
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function SignupPage() {
  return (
    <GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'placeholder'}>
      <SignupContent />
    </GoogleOAuthProvider>
  );
}
