'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { fetchPublicContract, signPublicContract, declinePublicContract, publicContractPdfUrl } from '../../../lib/api';

export default function SignPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | missing | expired | error
  const [typedName, setTypedName] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [declining, setDeclining] = useState(false);
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);

  useEffect(() => {
    fetchPublicContract(token)
      .then(d => { setData(d); setState('ok'); if (d.signer_name) setTypedName(d.signer_name); if (d.status === 'signed' || d.status === 'completed') setDone(true); })
      .catch(e => setState(e.message === 'This signing link has expired' ? 'expired' : 'missing'));
  }, [token]);

  // canvas setup (retina-aware)
  const setupCanvas = useCallback(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ratio = window.devicePixelRatio || 1;
    const w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * ratio; cv.height = h * ratio;
    const ctx = cv.getContext('2d'); ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
  }, []);
  useEffect(() => { if (state === 'ok' && !done) { setupCanvas(); } }, [state, done, setupCanvas]);

  const pos = (e) => { const r = canvasRef.current.getBoundingClientRect(); const t = e.touches?.[0]; return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top }; };
  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current.getContext('2d'); const p = pos(e); ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last.current = p; setHasInk(true); };
  const end = () => { drawing.current = false; };
  const clearSig = () => { const cv = canvasRef.current; cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); setHasInk(false); };

  const sign = async () => {
    setErr('');
    if (!consent) { setErr('Please confirm your intent to sign electronically.'); return; }
    if (!typedName.trim()) { setErr('Please type your full legal name.'); return; }
    if (!hasInk) { setErr('Please draw your signature in the box.'); return; }
    setSubmitting(true);
    try {
      await signPublicContract(token, { typed_name: typedName.trim(), signature_data: canvasRef.current.toDataURL('image/png'), consent: true });
      setDone(true);
    } catch (e) { setErr(e.message || 'Could not submit'); }
    setSubmitting(false);
  };
  const decline = async () => {
    const reason = window.prompt('Decline this contract? Optionally tell them why:');
    if (reason === null) return;
    await declinePublicContract(token, reason);
    setState('declined');
  };

  const Shell = ({ children }) => (
    <div style={{ minHeight: '100vh', background: '#f4f4f7', color: '#16161a', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', display: 'flex', flexDirection: 'column' }}>
      <div style={{ borderBottom: '1px solid #e6e6ec', background: '#fff', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 9 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 14 }}>W</div>
        <strong style={{ fontSize: 15 }}>WappFlow</strong>
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: '#8a8a93' }}>Secure e-signature</span>
      </div>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '24px 16px 60px' }}>{children}</div>
    </div>
  );

  if (state === 'loading') return <Shell><p style={{ color: '#8a8a93', marginTop: 60 }}>Loading…</p></Shell>;
  if (state === 'missing' || state === 'expired' || state === 'declined') return (
    <Shell><div style={{ textAlign: 'center', marginTop: 60, maxWidth: 380 }}>
      <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>{state === 'expired' ? 'Link expired' : state === 'declined' ? 'Contract declined' : 'Not available'}</h1>
      <p style={{ color: '#70707a', fontSize: 14 }}>{state === 'expired' ? 'This signing link has expired. Please ask the sender for a new one.' : state === 'declined' ? 'You have declined this contract. The sender has been notified.' : 'This contract may have been voided or the link is incorrect.'}</p>
    </div></Shell>
  );

  if (done) return (
    <Shell><div style={{ textAlign: 'center', marginTop: 50, maxWidth: 460 }}>
      <div style={{ width: 64, height: 64, borderRadius: 999, background: '#10b981', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
      </div>
      <h1 style={{ fontSize: 26, margin: '0 0 8px' }}>Signed &amp; done</h1>
      <p style={{ color: '#70707a', fontSize: 14.5, lineHeight: 1.6, margin: '0 0 22px' }}>Thank you. <strong>{data?.title}</strong> has been signed. A copy with a completion certificate has been saved, and the sender has been notified.</p>
      <a href={publicContractPdfUrl(token)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 10, background: '#16161a', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 14 }}>Download signed PDF</a>
    </div></Shell>
  );

  return (
    <Shell>
      <div style={{ width: '100%', maxWidth: 720 }}>
        <div style={{ background: '#fff', border: '1px solid #e6e6ec', borderRadius: 16, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.05)' }}>
          <div style={{ padding: '22px 26px', borderBottom: '1px solid #eee' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>{data.title}</h1>
            <p style={{ fontSize: 13, color: '#8a8a93', margin: '6px 0 0' }}>Please review the document below, then sign.{data.amount ? ` · Amount: ${data.amount}` : ''}</p>
          </div>
          <div style={{ padding: '22px 26px', whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: 14.5, color: '#33333a', maxHeight: 460, overflowY: 'auto' }}>{data.body || 'No content.'}</div>

          {/* signature block */}
          <div style={{ padding: '22px 26px', borderTop: '1px solid #eee', background: '#fafafc' }}>
            <label style={lbl}>Your full legal name</label>
            <input value={typedName} onChange={e => setTypedName(e.target.value)} placeholder="Type your name" style={inp} />

            <label style={{ ...lbl, marginTop: 16 }}>Draw your signature</label>
            <div style={{ position: 'relative', border: '1.5px dashed #cfcfd8', borderRadius: 12, background: '#fff', height: 170 }}>
              <canvas ref={canvasRef}
                onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
                onTouchStart={start} onTouchMove={move} onTouchEnd={end}
                style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
              {!hasInk && <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#c2c2cc', fontSize: 14, pointerEvents: 'none' }}>Sign here</span>}
              {hasInk && <button onClick={clearSig} style={{ position: 'absolute', top: 8, right: 8, fontSize: 12, color: '#8a8a93', background: '#fff', border: '1px solid #e6e6ec', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>Clear</button>}
            </div>

            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: '#55555e', lineHeight: 1.5 }}>I agree to sign this document electronically and that my electronic signature is the legal equivalent of my handwritten signature, in accordance with the U.S. ESIGN Act and UETA. I consent to my IP address, timestamp and device being recorded as evidence.</span>
            </label>

            {err && <p style={{ color: '#dc2626', fontSize: 13, margin: '12px 0 0' }}>{err}</p>}

            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
              <button onClick={sign} disabled={submitting} style={{ flex: 1, minWidth: 180, padding: '13px', borderRadius: 11, border: 'none', cursor: 'pointer', background: '#16161a', color: '#fff', fontWeight: 800, fontSize: 15 }}>{submitting ? 'Signing…' : 'Adopt & sign'}</button>
              <button onClick={decline} disabled={submitting} style={{ padding: '13px 18px', borderRadius: 11, border: '1px solid #e6e6ec', cursor: 'pointer', background: '#fff', color: '#70707a', fontWeight: 600, fontSize: 14 }}>Decline</button>
            </div>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11.5, color: '#a0a0aa', marginTop: 16 }}>Powered by WappFlow · This signature is recorded with a tamper-evident audit trail.</p>
      </div>
    </Shell>
  );
}

const lbl = { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#55555e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7 };
const inp = { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid #d8d8e0', background: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
