'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone, CheckCircle, XCircle, RefreshCw, LogOut,
  Wifi, WifiOff, Zap, Clock, Shield
} from 'lucide-react';
import NavBar from '../../components/NavBar';
import { BASE_URL } from '../../lib/api';

export default function WhatsAppPage() {
  const router = useRouter();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) { router.push('/login'); return; }
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${BASE_URL}/api/whatsapp/status`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (res.status === 401) { router.push('/login'); return; }
      const data = await res.json();
      setStatus(data);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  const handleRetryConnect = async () => {
    setReconnecting(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${BASE_URL}/api/whatsapp/reconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchStatus();
    } catch { /* ignore */ }
    setReconnecting(false);
  };

  const handleDisconnect = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${BASE_URL}/api/whatsapp/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchStatus();
    } catch { /* ignore */ }
  };

  const getStatusMeta = () => {
    if (!status) return { color: 'var(--text-muted)', label: 'Loading...' };
    switch (status.status) {
      case 'connected':    return { color: '#10b981', label: 'Connected' };
      case 'qr_ready':     return { color: '#6366f1', label: 'Scan QR Code' };
      case 'authenticated':return { color: '#10b981', label: 'Authenticating…' };
      case 'disconnected': return { color: '#ef4444', label: 'Disconnected' };
      case 'not_initialized': return { color: '#ef4444', label: 'Disconnected' };
      case 'auth_failed':  return { color: '#ef4444', label: 'Authentication Failed' };
      case 'error':        return { color: '#ef4444', label: 'Connection Error' };
      case 'initializing': return { color: '#f59e0b', label: 'Initializing…' };
      default:             return { color: '#f59e0b', label: 'Initializing…' };
    }
  };

  const meta = getStatusMeta();
  const isError = ['disconnected', 'not_initialized', 'error', 'auth_failed'].includes(status?.status);

  return (
    <NavBar>
      <div className="r-pad" style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
            WhatsApp Connection
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Connect your WhatsApp account to start capturing leads automatically
          </p>
        </div>

        {/* Status Card */}
        <div style={{
          background: 'var(--surface)', border: '1.5px solid var(--border)',
          borderRadius: 20, padding: 28, marginBottom: 20, boxShadow: 'var(--shadow)',
        }}>
          {/* Status row */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 28, flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: meta.color + '20',
              }}>
                {status?.isReady
                  ? <Wifi size={24} color={meta.color} />
                  : isError
                    ? <WifiOff size={24} color={meta.color} />
                    : <RefreshCw size={24} color={meta.color}
                        style={{ animation: 'spin 1.5s linear infinite' }} />
                }
              </div>
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                  Connection Status
                </p>
                <p style={{ fontSize: 22, fontWeight: 800, color: meta.color }}>
                  {meta.label}
                </p>
              </div>
            </div>
            {status?.phoneNumber && (
              <div style={{
                background: '#10b98115', border: '1px solid #10b98130',
                borderRadius: 12, padding: '10px 18px', textAlign: 'right',
              }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                  Connected Number
                </p>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#10b981' }}>
                  +{status.phoneNumber}
                </p>
              </div>
            )}
          </div>

          {/* QR Code state */}
          {(status?.qrCode || status?.status === 'qr_ready') ? (
            <div style={{ textAlign: 'center' }}>
              {status?.qrCode ? (
                <div style={{
                  display: 'inline-block', padding: 16,
                  background: 'var(--surface)', borderRadius: 20,
                  boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
                  border: '3px solid #6366f130', marginBottom: 24,
                }}>
                  <img src={status.qrCode} alt="WhatsApp QR Code"
                    style={{ width: 260, height: 260, display: 'block' }} />
                </div>
              ) : (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 260, height: 260, background: 'var(--surface2)',
                  borderRadius: 20, border: '3px solid var(--border)', marginBottom: 24,
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <RefreshCw size={40} color="var(--accent)"
                      style={{ animation: 'spin 1.5s linear infinite', marginBottom: 12 }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      Generating QR code…
                    </p>
                  </div>
                </div>
              )}

              <div style={{
                background: 'var(--surface2)', borderRadius: 16,
                padding: '20px 24px', textAlign: 'left', maxWidth: 480, margin: '0 auto',
              }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 14 }}>
                  📱 How to Connect
                </p>
                {[
                  'Open WhatsApp on your phone',
                  'Tap Menu (⋮) or Settings (⚙️)',
                  'Tap Linked Devices',
                  'Tap Link a Device',
                  'Point your phone at this QR code',
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'var(--accent)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 800, flexShrink: 0,
                    }}>{i + 1}</div>
                    <span style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.6 }}>{step}</span>
                  </div>
                ))}
              </div>
            </div>

          ) : status?.isReady ? (
            /* Connected state */
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: '#10b98120', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <CheckCircle size={40} color="#10b981" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
                ✅ WhatsApp Connected!
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
                All incoming WhatsApp messages will automatically become leads.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={() => router.push('/dashboard')} style={{
                  padding: '11px 28px', background: 'var(--accent)', color: '#fff',
                  border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}>
                  Go to Dashboard
                </button>
                <button onClick={handleDisconnect} style={{
                  padding: '11px 24px', background: 'transparent',
                  border: '1.5px solid #ef4444', color: '#ef4444',
                  borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 7,
                }}>
                  <LogOut size={15} /> Disconnect
                </button>
              </div>
            </div>

          ) : isError ? (
            /* Error / disconnected state */
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: '#ef444420', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <XCircle size={40} color="#ef4444" />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
                WhatsApp Not Connected
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24 }}>
                {status?.status === 'auth_failed'
                  ? 'Authentication failed. Please reconnect and scan a fresh QR code.'
                  : 'WhatsApp is disconnected. Click below to reconnect.'}
              </p>
              <button onClick={handleRetryConnect} disabled={reconnecting} style={{
                padding: '12px 32px', background: 'var(--accent)', color: '#fff',
                border: 'none', borderRadius: 12, fontWeight: 700, fontSize: 14,
                cursor: reconnecting ? 'not-allowed' : 'pointer',
                opacity: reconnecting ? 0.7 : 1,
                display: 'inline-flex', alignItems: 'center', gap: 8,
              }}>
                <RefreshCw size={16} style={reconnecting ? { animation: 'spin 1s linear infinite' } : {}} />
                {reconnecting ? 'Reconnecting…' : 'Reconnect WhatsApp'}
              </button>
            </div>

          ) : (
            /* Initializing state */
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{
                width: 72, height: 72, borderRadius: '50%',
                background: 'var(--surface2)', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <RefreshCw size={40} color="var(--text-muted)"
                  style={{ animation: 'spin 1.5s linear infinite' }} />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
                Initializing…
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                Setting up WhatsApp connection. This may take a few seconds.
              </p>
            </div>
          )}
        </div>

        {/* Feature cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          {[
            { icon: Zap, color: '#6366f1', title: 'Auto Lead Capture', desc: 'Every WhatsApp message creates a CRM lead automatically' },
            { icon: Clock, color: '#06b6d4', title: 'Real-time Sync', desc: 'Messages sync instantly — no delays, no manual entry' },
            { icon: Shield, color: '#10b981', title: '24/7 Active', desc: 'Works round the clock, even when you\'re offline' },
          ].map(({ icon: Icon, color, title, desc }) => (
            <div key={title} style={{
              background: 'var(--surface)', border: '1.5px solid var(--border)',
              borderRadius: 16, padding: 20, boxShadow: 'var(--shadow)',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: color + '20', display: 'flex',
                alignItems: 'center', justifyContent: 'center', marginBottom: 14,
              }}>
                <Icon size={22} color={color} />
              </div>
              <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 6 }}>{title}</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</p>
            </div>
          ))}
        </div>

        <style>{`
        `}</style>
      </div>
    </NavBar>
  );
}
