'use client';

import { useState } from 'react';
import { Smartphone, Copy, Check } from 'lucide-react';
import api from '@/lib/api';

// "Link with phone number instead" — the alternative to scanning the QR.
//
// The QR has to be scanned by ANOTHER device's camera, which is impossible when
// the phone that should scan it is the one displaying it (WappFlow open in the
// phone's own browser). WhatsApp's answer is an 8-character code: WhatsApp →
// Linked devices → Link a device → "Link with phone number instead".
//
//   <PairWithPhone endpoint={`/whatsapp/accounts/${id}/pair-code`} />
export default function PairWithPhone({ endpoint }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const request = async () => {
    setBusy(true); setErr(''); setCode(null);
    try {
      const r = await api.post(endpoint, { phone });
      setCode(r.data.code);
    } catch (e) { setErr(e.response?.data?.error || 'Could not get a code — try again in a moment'); }
    setBusy(false);
  };
  const copy = () => {
    try { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch {}
  };
  const pretty = code ? `${code.slice(0, 4)}-${code.slice(4)}` : '';

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 999, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
        <Smartphone size={14} /> Link with phone number instead
      </button>
    );
  }

  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: 'var(--surface2)', textAlign: 'left', maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
      {!code ? (
        <>
          <label htmlFor="wa-pair-phone" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Your WhatsApp number</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="wa-pair-phone" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !busy) request(); }}
              placeholder="923001234567" style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14 }} />
            <button type="button" onClick={request} disabled={busy || phone.replace(/\D/g, '').length < 8}
              style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: '#25d366', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: busy || phone.replace(/\D/g, '').length < 8 ? 0.5 : 1 }}>
              {busy ? '…' : 'Get code'}
            </button>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: '6px 0 0' }}>With country code, no + or spaces needed.</p>
          {err && <p role="alert" style={{ fontSize: 12, color: 'var(--danger, #ef4444)', margin: '8px 0 0' }}>{err}</p>}
        </>
      ) : (
        <>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: '0 0 8px' }}>Enter this code in WhatsApp</p>
          <button type="button" onClick={copy} aria-label="Copy code"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px', borderRadius: 12, border: '1.5px dashed var(--border)', background: 'var(--surface)', cursor: 'pointer' }}>
            <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: '0.18em', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{pretty}</span>
            {copied ? <Check size={16} color="#25d366" /> : <Copy size={16} color="var(--text-dim)" />}
          </button>
          <ol style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.7 }}>
            <li>Open WhatsApp on that phone → <b>Settings → Linked devices</b></li>
            <li>Tap <b>Link a device</b>, then <b>Link with phone number instead</b></li>
            <li>Type the code above — this page connects by itself</li>
          </ol>
          <button type="button" onClick={() => setCode(null)} style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer', padding: 0 }}>Use a different number</button>
        </>
      )}
    </div>
  );
}
