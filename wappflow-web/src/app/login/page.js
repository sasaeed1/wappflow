'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Zap, Mail, Lock, ArrowRight, Eye, EyeOff, CheckCircle2,
  MessageCircle, Brain, Users, Sparkles, ShieldCheck, Star,
} from 'lucide-react';
import { authAPI } from '@/lib/api';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

function LoginContent() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '' });
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
    setLoading(true);
    try {
      const response = await authAPI.login(formData);
      saveAuthData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.google({ credential: credentialResponse.credential });
      saveAuthData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <AuthStyles />

      {/* LEFT — Brand / promo panel */}
      <aside className="auth-promo">
        <div className="auth-promo-bg" />
        <div className="auth-promo-grid" />
        <div className="auth-promo-glow auth-glow-1" />
        <div className="auth-promo-glow auth-glow-2" />

        <Link href="/" className="auth-brand">
          <div className="auth-brand-mark"><Zap size={18} /></div>
          <span>WappFlow</span>
        </Link>

        <div className="auth-promo-content">
          <div className="auth-promo-badge">
            <Sparkles size={13} />
            <span>The AI-native WhatsApp CRM</span>
          </div>

          <h1 className="auth-promo-title">
            Welcome back to your <span className="auth-grad">unified inbox</span>.
          </h1>
          <p className="auth-promo-sub">
            Every WhatsApp, Instagram, and Facebook conversation in one timeline —
            scored, summarized, and ready to reply with one click.
          </p>

          <div className="auth-promo-features">
            <Feature icon={<MessageCircle size={16} />} title="Unified inbox" desc="WhatsApp + IG + FB + Web — one thread per lead" />
            <Feature icon={<Brain size={16} />} title="AI sales brain" desc="Score, sentiment, and 3 ready-to-send replies" />
            <Feature icon={<Users size={16} />} title="Built for teams" desc="9 permissions · audit logs · round-robin" />
            <Feature icon={<ShieldCheck size={16} />} title="Your data, your server" desc="Self-hosted · HTTPS · no third parties" />
          </div>

          <div className="auth-testimonial">
            <div className="auth-stars">
              {[0,1,2,3,4].map(i => <Star key={i} size={12} fill="#fbbf24" stroke="#fbbf24" />)}
            </div>
            <p>{`"We were losing 40% of WhatsApp leads to "I'll get back to you" replies. WappFlow's AI drafts the response before the customer finishes typing."`}</p>
            <div className="auth-test-meta">— Sales lead, Karachi real estate</div>
          </div>
        </div>

        <div className="auth-promo-foot">
          <span>© {new Date().getFullYear()} WappFlow</span>
          <span className="auth-status"><span className="auth-status-dot" /> All systems operational</span>
        </div>
      </aside>

      {/* RIGHT — Form */}
      <main className="auth-form-wrap">
        <div className="auth-topbar">
          <Link href="/" className="auth-topbar-brand">
            <div className="auth-brand-mark sm"><Zap size={14} /></div>
            <span>WappFlow</span>
          </Link>
          <div className="auth-topbar-link">
            New here? <Link href="/signup">Create account →</Link>
          </div>
        </div>

        <div className="auth-form">
          <div className="auth-form-head">
            <h2>Sign in</h2>
            <p>Welcome back. Pick up where you left off.</p>
          </div>

          {error && (
            <div className="auth-error">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {GOOGLE_CLIENT_ID ? (
            <div className="auth-google">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Google sign-in failed')}
                width="380"
                text="continue_with"
                shape="rectangular"
                theme="filled_black"
                size="large"
              />
            </div>
          ) : (
            <button type="button" className="auth-google-fallback" disabled>
              Google sign-in not configured
            </button>
          )}

          <div className="auth-divider">
            <span>or sign in with email</span>
          </div>

          <form onSubmit={handleSubmit} className="auth-form-fields">
            <div className="auth-field">
              <label>Email</label>
              <div className="auth-input-wrap">
                <Mail size={16} />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="auth-field">
              <div className="auth-field-row">
                <label>Password</label>
                {/* placeholder for forgot-password */}
              </div>
              <div className="auth-input-wrap">
                <Lock size={16} />
                <input
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPwd(s => !s)} className="auth-eye" aria-label="Toggle password visibility">
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="auth-submit">
              {loading ? (
                <><span className="auth-spinner" /> Signing in…</>
              ) : (
                <>Sign in <ArrowRight size={16} /></>
              )}
            </button>
          </form>

          <p className="auth-bottom">
            Don&apos;t have an account?{' '}
            <Link href="/signup">Create one free</Link>
          </p>

          <p className="auth-legal">
            By signing in, you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
          </p>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, desc }) {
  return (
    <div className="auth-feature">
      <div className="auth-feature-icon">{icon}</div>
      <div>
        <div className="auth-feature-title">{title}</div>
        <div className="auth-feature-desc">{desc}</div>
      </div>
    </div>
  );
}

function AuthStyles() {
  return (
    <style>{`
      :root {
        --auth-bg: #07080d;
        --auth-bg-2: #0b0d16;
        --auth-surface: #14161f;
        --auth-surface-2: rgba(255,255,255,0.04);
        --auth-border: rgba(255,255,255,0.10);
        --auth-border-strong: rgba(255,255,255,0.18);
        --auth-text: #f3f4f6;
        --auth-text-dim: #b5bac9;
        --auth-text-muted: #7f8499;
        --auth-accent: #818cf8;
        --auth-accent-2: #c084fc;
        --auth-error-bg: rgba(239,68,68,0.10);
        --auth-error-border: rgba(239,68,68,0.35);
        --auth-error-text: #fca5a5;
      }
      html, body { background: var(--auth-bg); color: var(--auth-text); margin: 0; padding: 0; }
      body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; -webkit-font-smoothing: antialiased; min-height: 100vh; }
      * { box-sizing: border-box; }

      .auth-page {
        min-height: 100vh;
        display: grid;
        grid-template-columns: 1.05fr 1fr;
        background: var(--auth-bg);
      }

      /* ============ LEFT PROMO PANEL ============ */
      .auth-promo {
        position: relative; overflow: hidden;
        padding: 36px 48px 32px;
        display: flex; flex-direction: column;
        color: var(--auth-text);
        background: linear-gradient(180deg, #0b0d16 0%, #0a0c14 100%);
        border-right: 1px solid var(--auth-border);
      }
      .auth-promo-bg {
        position: absolute; inset: 0;
        background:
          radial-gradient(ellipse 700px 400px at 20% 0%, rgba(99,102,241,0.22), transparent 60%),
          radial-gradient(ellipse 600px 500px at 90% 80%, rgba(168,85,247,0.18), transparent 60%);
        pointer-events: none;
      }
      .auth-promo-grid {
        position: absolute; inset: 0;
        background-image:
          linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px);
        background-size: 56px 56px;
        mask-image: radial-gradient(ellipse 80% 60% at 30% 30%, #000 30%, transparent 75%);
        -webkit-mask-image: radial-gradient(ellipse 80% 60% at 30% 30%, #000 30%, transparent 75%);
        pointer-events: none;
      }
      .auth-promo-glow {
        position: absolute; border-radius: 50%;
        filter: blur(100px); opacity: 0.4;
        pointer-events: none;
      }
      .auth-glow-1 { width: 380px; height: 380px; background: #6366f1; top: -80px; left: -80px; }
      .auth-glow-2 { width: 320px; height: 320px; background: #a855f7; bottom: -60px; right: -60px; opacity: 0.3; }

      .auth-brand {
        position: relative; z-index: 1;
        display: inline-flex; align-items: center; gap: 10px;
        text-decoration: none; color: var(--auth-text);
        font-weight: 800; font-size: 18px; letter-spacing: -0.02em;
        margin-bottom: auto;
      }
      .auth-brand-mark {
        width: 32px; height: 32px; border-radius: 9px;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        display: grid; place-items: center; color: #fff;
        box-shadow: 0 6px 16px rgba(99,102,241,0.45);
      }
      .auth-brand-mark.sm { width: 26px; height: 26px; border-radius: 8px; }

      .auth-promo-content {
        position: relative; z-index: 1;
        max-width: 460px;
        padding: 48px 0 32px;
      }
      .auth-promo-badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 6px 13px; border-radius: 999px;
        background: rgba(99,102,241,0.12);
        border: 1px solid rgba(99,102,241,0.3);
        color: #c7d2fe;
        font-size: 12px; font-weight: 500;
        margin-bottom: 22px;
      }
      .auth-promo-title {
        font-size: clamp(28px, 3.5vw, 40px);
        line-height: 1.1;
        font-weight: 800;
        letter-spacing: -0.025em;
        margin: 0 0 16px;
        color: #fff;
      }
      .auth-grad {
        background: linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #f472b6 100%);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .auth-promo-sub {
        font-size: 15px; line-height: 1.6;
        color: var(--auth-text-dim);
        margin: 0 0 32px;
      }

      .auth-promo-features {
        display: flex; flex-direction: column; gap: 14px;
        margin-bottom: 28px;
      }
      .auth-feature { display: flex; align-items: flex-start; gap: 12px; }
      .auth-feature-icon {
        width: 32px; height: 32px; border-radius: 9px;
        background: rgba(99,102,241,0.13);
        border: 1px solid rgba(99,102,241,0.28);
        color: #a5b4fc;
        display: grid; place-items: center;
        flex-shrink: 0;
      }
      .auth-feature-title { font-weight: 600; font-size: 14px; color: #fff; margin-bottom: 2px; }
      .auth-feature-desc { font-size: 12.5px; color: var(--auth-text-muted); line-height: 1.5; }

      .auth-testimonial {
        padding: 18px;
        background: rgba(255,255,255,0.03);
        border: 1px solid var(--auth-border);
        border-radius: 12px;
        backdrop-filter: blur(10px);
      }
      .auth-stars { display: flex; gap: 2px; margin-bottom: 10px; }
      .auth-testimonial p {
        font-size: 13.5px; line-height: 1.6;
        color: var(--auth-text-dim);
        margin: 0 0 8px;
      }
      .auth-test-meta { font-size: 12px; color: var(--auth-text-muted); }

      .auth-promo-foot {
        position: relative; z-index: 1;
        display: flex; justify-content: space-between; align-items: center;
        font-size: 12px; color: var(--auth-text-muted);
        margin-top: auto;
        padding-top: 24px;
      }
      .auth-status { display: inline-flex; align-items: center; gap: 6px; }
      .auth-status-dot {
        width: 6px; height: 6px; border-radius: 50%; background: #34d399;
        box-shadow: 0 0 8px #34d399;
      }

      /* ============ RIGHT FORM PANEL ============ */
      .auth-form-wrap {
        position: relative;
        display: flex; flex-direction: column;
        min-height: 100vh;
        padding: 24px 32px;
        background: var(--auth-bg);
      }
      .auth-topbar {
        display: flex; justify-content: space-between; align-items: center;
      }
      .auth-topbar-brand {
        display: none;
        align-items: center; gap: 8px;
        text-decoration: none; color: var(--auth-text);
        font-weight: 700; font-size: 16px;
      }
      .auth-topbar-link { font-size: 13px; color: var(--auth-text-muted); margin-left: auto; }
      .auth-topbar-link a { color: var(--auth-accent); font-weight: 600; text-decoration: none; }
      .auth-topbar-link a:hover { color: #a5b4fc; }

      .auth-form {
        width: 100%; max-width: 420px;
        margin: auto;
        padding: 32px 0;
      }
      .auth-form-head { margin-bottom: 28px; }
      .auth-form-head h2 {
        font-size: 30px; font-weight: 800;
        letter-spacing: -0.025em;
        margin: 0 0 8px;
        color: #fff;
      }
      .auth-form-head p {
        font-size: 14.5px;
        color: var(--auth-text-dim);
        margin: 0;
      }

      .auth-error {
        display: flex; align-items: center; gap: 10px;
        padding: 11px 14px;
        background: var(--auth-error-bg);
        border: 1px solid var(--auth-error-border);
        color: var(--auth-error-text);
        border-radius: 10px;
        font-size: 13px;
        margin-bottom: 18px;
      }

      .auth-google {
        display: flex; justify-content: center;
        margin-bottom: 18px;
        color-scheme: dark;
      }
      .auth-google > div {
        width: 100% !important;
        max-width: 380px;
      }
      .auth-google iframe { color-scheme: light; border-radius: 10px !important; }
      .auth-google-fallback {
        width: 100%; padding: 13px;
        background: rgba(255,255,255,0.04);
        border: 1px solid var(--auth-border);
        color: var(--auth-text-muted);
        border-radius: 10px; font-size: 14px;
        cursor: not-allowed;
      }

      .auth-divider {
        display: flex; align-items: center; gap: 12px;
        margin: 20px 0;
      }
      .auth-divider::before, .auth-divider::after {
        content: ''; flex: 1; height: 1px;
        background: var(--auth-border);
      }
      .auth-divider span {
        font-size: 11.5px;
        color: var(--auth-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-weight: 600;
      }

      .auth-form-fields { display: flex; flex-direction: column; gap: 14px; }
      .auth-field { display: flex; flex-direction: column; gap: 7px; }
      .auth-field-row { display: flex; justify-content: space-between; align-items: center; }
      .auth-field label {
        font-size: 13px; font-weight: 600;
        color: var(--auth-text-dim);
        letter-spacing: -0.005em;
      }

      .auth-input-wrap {
        position: relative;
        display: flex; align-items: center;
        background: rgba(255,255,255,0.04);
        border: 1px solid var(--auth-border);
        border-radius: 10px;
        transition: all 0.15s;
      }
      .auth-input-wrap:focus-within {
        border-color: var(--auth-accent);
        background: rgba(99,102,241,0.06);
        box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
      }
      .auth-input-wrap > svg {
        position: absolute; left: 14px;
        color: var(--auth-text-muted);
        pointer-events: none;
      }
      .auth-input-wrap input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        padding: 13px 14px 13px 42px;
        font-size: 14.5px;
        color: var(--auth-text);
        font-family: inherit;
        width: 100%;
      }
      .auth-input-wrap input::placeholder { color: #5a5f72; }
      .auth-input-wrap input:-webkit-autofill {
        -webkit-text-fill-color: var(--auth-text);
        -webkit-box-shadow: 0 0 0 100px rgba(99,102,241,0.06) inset;
        caret-color: var(--auth-text);
      }
      .auth-eye {
        background: none; border: none;
        color: var(--auth-text-muted);
        padding: 12px 14px;
        cursor: pointer;
        display: grid; place-items: center;
      }
      .auth-eye:hover { color: var(--auth-text-dim); }

      .auth-submit {
        margin-top: 10px;
        padding: 14px;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        color: #fff;
        border: none;
        border-radius: 10px;
        font-size: 14.5px; font-weight: 700;
        letter-spacing: -0.01em;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center; gap: 8px;
        box-shadow: 0 8px 24px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.18);
        transition: all 0.15s;
      }
      .auth-submit:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 12px 32px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.22);
      }
      .auth-submit:disabled { opacity: 0.7; cursor: not-allowed; }

      .auth-spinner {
        width: 14px; height: 14px;
        border: 2px solid rgba(255,255,255,0.35);
        border-top-color: #fff;
        border-radius: 50%;
        animation: auth-spin 0.8s linear infinite;
      }
      @keyframes auth-spin { to { transform: rotate(360deg); } }

      .auth-bottom {
        text-align: center;
        font-size: 14px;
        color: var(--auth-text-dim);
        margin: 26px 0 0;
      }
      .auth-bottom a {
        color: var(--auth-accent);
        font-weight: 600;
        text-decoration: none;
      }
      .auth-bottom a:hover { color: #a5b4fc; }

      .auth-legal {
        text-align: center;
        font-size: 12px;
        color: var(--auth-text-muted);
        margin: 16px 0 0;
      }
      .auth-legal a { color: var(--auth-text-dim); text-decoration: underline; }
      .auth-legal a:hover { color: var(--auth-text); }

      /* ============ RESPONSIVE ============ */
      @media (max-width: 1024px) {
        .auth-page { grid-template-columns: 1fr; }
        .auth-promo { display: none; }
        .auth-topbar-brand { display: inline-flex; }
      }
      @media (max-width: 480px) {
        .auth-form-wrap { padding: 20px 20px; }
        .auth-form-head h2 { font-size: 26px; }
        .auth-topbar-link { font-size: 12px; }
      }
    `}</style>
  );
}

export default function LoginPage() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID || 'placeholder'}>
      <LoginContent />
    </GoogleOAuthProvider>
  );
}
