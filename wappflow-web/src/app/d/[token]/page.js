'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { fetchPublicDoc, signPublicDoc, declinePublicDoc, askPublicDoc, trackPublicDoc, mediaUrl } from '../../../lib/api';
import { BlockView, DocFrame } from '../../contracts/blocks';
import '../../contracts/contracts.css';
import PublicBrandHeader from '@/components/PublicBrandHeader';
import PublicNextSteps from '@/components/PublicNextSteps';
import PublicFooter from '@/components/PublicFooter';

const money = (c, n) => `${c || '$'}${(Number(n) || 0).toLocaleString()}`;
const outerBg = (t) => (t === 'executive' ? '#080b12' : t === 'editorial' ? '#efe9dd' : '#eceef2');

export default function PublicDocPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | missing | expired | declined
  const [pkgSel, setPkgSel] = useState({});
  const [addonSel, setAddonSel] = useState({});
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);
  const [next, setNext] = useState(null);   // where the client can go after signing
  // What the client has filled into the placed fields, keyed by block id.
  const [fieldVals, setFieldVals] = useState({});

  useEffect(() => {
    fetchPublicDoc(token).then(d => {
      setData(d);
      document.title = d.title || 'Document';
      if (d.status === 'declined') { setState('declined'); return; }
      setState('ok');
      if (['signed', 'completed'].includes(d.status)) setDone(true);
      // seed selections from block defaults
      const pkg = {}, add = {};
      (d.blocks || []).forEach((b, idx) => {
        if (b.type === 'package') { const fi = (b.data?.packages || []).findIndex(p => p.featured); pkg[idx] = fi >= 0 ? fi : 0; }
        if (b.type === 'addons') { add[idx] = new Set((b.data?.items || []).map((it, i) => (it.on ? i : -1)).filter(i => i >= 0)); }
      });
      setPkgSel(pkg); setAddonSel(add);
    }).catch(e => setState(e.message === 'expired' ? 'expired' : 'missing'));
  }, [token]);

  const blocks = data?.blocks || [];
  const hasPricing = useMemo(() => blocks.some(b => ['pricing_table', 'package', 'addons'].includes(b.type)), [blocks]);
  const { currency, total } = useMemo(() => {
    let t = 0, cur = '$';
    blocks.forEach((b, idx) => { const d = b.data || {};
      if (b.type === 'pricing_table') { cur = d.currency || cur; (d.rows || []).forEach(r => t += Number(r.price) || 0); }
      if (b.type === 'package') { cur = d.currency || cur; const p = (d.packages || [])[pkgSel[idx]]; if (p) t += Number(p.price) || 0; }
      if (b.type === 'addons') { cur = d.currency || cur; const on = addonSel[idx] || new Set(); (d.items || []).forEach((it, i) => { if (on.has(i)) t += Number(it.price) || 0; }); }
    });
    return { currency: cur, total: t };
  }, [blocks, pkgSel, addonSel]);

  // Which placed fields still need answering, for the role whose turn it is.
  // Mirrors backend/contract-fields.js — the server is the authority and refuses
  // an incomplete submission regardless, but the client should never be able to
  // press a button that is going to be rejected.
  const pendingRole = (data?.signers || []).find(s => s.status === 'pending')?.role || 'client';
  const myFields = useMemo(
    () => blocks.filter(b => b.type === 'field' && ((b.data?.role) || 'client') === pendingRole),
    [blocks, pendingRole],
  );
  const usesPlacedSigning = useMemo(
    () => myFields.some(f => ['signature', 'initials'].includes(f.data?.kind) && f.data?.required !== false),
    [myFields],
  );
  const fieldsRemaining = useMemo(() => myFields.filter(f => {
    if (f.data?.required === false) return false;
    const v = fieldVals[f.id];
    if ((f.data?.kind) === 'checkbox') return v !== true;
    return !(v && String(v).trim());
  }), [myFields, fieldVals]);

  const toggleAddon = (idx, i) => setAddonSel(s => { const set = new Set(s[idx] || []); set.has(i) ? set.delete(i) : set.add(i); return { ...s, [idx]: set }; });

  // analytics — time-on-page + how far the client read (drop-off)
  const startRef = useRef(0); const deepestRef = useRef(0);
  useEffect(() => {
    if (state !== 'ok') return;
    startRef.current = Date.now();
    const flush = () => { const seconds = Math.round((Date.now() - startRef.current) / 1000); if (seconds >= 2) trackPublicDoc(token, 'time_on_page', { seconds, deepest_block: deepestRef.current, total_blocks: blocks.length }); startRef.current = Date.now(); };
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => { flush(); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', flush); };
  }, [state, token, blocks.length]);
  useEffect(() => {
    if (state !== 'ok') return;
    const els = document.querySelectorAll('[data-bidx]'); if (!els.length) return;
    const obs = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const i = Number(e.target.getAttribute('data-bidx')); if (i > deepestRef.current) deepestRef.current = i; } }), { threshold: 0.4 });
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [state, blocks.length]);

  // Batch F: was a hand-rolled bar with a hardcoded WappFlow "W" mark (sky→indigo
  // gradient) and the literal string 'WappFlow' as the name fallback — above a client's
  // legally-binding signature page. Phase 8 landed the backend that serves real brand
  // data, so this now shows the studio's own logo and name.
  const Brand = () => (
    <PublicBrandHeader
      brand={data?.brand}
      title={data?.title}
      meta={data?.type}
      sticky
      style={{ background: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
    />
  );

  if (state === 'loading') return <div style={center}><div style={spinner} /><style>{`@keyframes csp{to{transform:rotate(360deg)}}`}</style></div>;
  if (state !== 'ok') return (
    <div style={{ ...center, flexDirection: 'column', gap: 8, textAlign: 'center', padding: 24 }}>
      <h1 style={{ fontSize: 24, margin: 0, color: '#16161a' }}>{state === 'expired' ? 'Link expired' : state === 'declined' ? 'Declined' : 'Not available'}</h1>
      <p style={{ color: '#70707a', fontSize: 14, maxWidth: 360 }}>{state === 'expired' ? 'This link has expired — ask the sender for a new one.' : 'This document may have been withdrawn or the link is incorrect.'}</p>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: outerBg(data.theme) }}>
      <Brand />
      <div style={{ padding: 'clamp(20px,4vw,52px) 14px', paddingBottom: hasPricing && !done ? 120 : 60 }}>
        <div className={`cs-doc cs-theme-${data.theme}`}>
          <div className="cs-body" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <DocFrame letterhead={data.letterhead} upload={data.settings?.upload} />
            {done && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 'var(--cs-radius)', background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', flexWrap: 'wrap' }}>
                <span style={{ width: 30, height: 30, borderRadius: 999, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>✓</span>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cs-ink)', flex: 1 }}>Signed — thank you. A copy has been recorded.</div>
                {data.settings?.signed_pdf && <a href={mediaUrl(data.settings.signed_pdf)} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#10b981', padding: '8px 14px', borderRadius: 9, textDecoration: 'none' }}>Download signed PDF</a>}
                {/* Signing is the moment a client is most willing to do the next
                    thing, and it used to end at "thank you". */}
                <div style={{ flexBasis: '100%' }}>
                  <PublicNextSteps next={next} brand={data?.brand} style={{ marginTop: 4, justifyContent: 'flex-start' }} />
                </div>
              </div>
            )}
            {blocks.map((b, idx) => (
              <div key={idx} data-bidx={idx}>
                {/* A field block is not read, it is filled — so the client's copy
                    replaces the studio's configuration view with a real input.
                    Once signed it falls through to BlockView, which renders the
                    static summary rather than an editable control. */}
                {b.type === 'field' && !done ? (
                  <div data-fieldid={b.id}><FillableField block={b}
                    value={fieldVals[b.id]}
                    onChange={(v) => setFieldVals(s => ({ ...s, [b.id]: v }))} /></div>
                ) : (
                  <BlockView block={b}
                    selected={b.type === 'package' ? pkgSel[idx] : b.type === 'addons' ? (addonSel[idx] || new Set()) : undefined}
                    onSelect={b.type === 'package' ? (i) => setPkgSel(s => ({ ...s, [idx]: i })) : b.type === 'addons' ? (i) => toggleAddon(idx, i) : undefined} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* sticky action bar */}
      {!done && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(0,0,0,0.08)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
          {hasPricing && (
            <div style={{ marginRight: 'auto' }}>
              <div style={{ fontSize: 10.5, color: '#8a8a93', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#16161a', lineHeight: 1 }}>{money(currency, total)}</div>
            </div>
          )}
          {/* Named, not just disabled. "Review & sign" greyed out with no
              explanation is the worst version of this: the client is looking at
              a long document and cannot be expected to hunt for what is missing. */}
          {fieldsRemaining.length > 0 && (
            <button onClick={() => {
              const el = document.querySelector(`[data-fieldid="${fieldsRemaining[0].id}"]`);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }} style={{ marginRight: 'auto', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(220,38,38,0.35)', background: 'rgba(220,38,38,0.06)', color: '#b91c1c', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
              {fieldsRemaining.length} still to complete — go to “{fieldsRemaining[0].data?.label || 'field'}”
            </button>
          )}
          <button onClick={() => setSigning(true)} disabled={fieldsRemaining.length > 0}
            title={fieldsRemaining.length > 0 ? `Complete: ${fieldsRemaining.map(f => f.data?.label || 'field').join(', ')}` : undefined}
            style={{ padding: '14px 28px', borderRadius: 12, border: 'none', cursor: fieldsRemaining.length > 0 ? 'not-allowed' : 'pointer', background: fieldsRemaining.length > 0 ? '#c2c2cc' : '#16161a', color: '#fff', fontWeight: 800, fontSize: 15, boxShadow: fieldsRemaining.length > 0 ? 'none' : '0 10px 30px rgba(0,0,0,0.25)' }}>Review &amp; sign →</button>
        </div>
      )}

      {signing && <SignSheet token={token} title={data.title} signerName={(data.signers || []).find(s => s.status === 'pending')?.name} onClose={() => setSigning(false)}
        fieldValues={fieldVals} usesPlacedSigning={usesPlacedSigning}
        selectionPayload={{ packages: pkgSel, addons: Object.fromEntries(Object.entries(addonSel).map(([k, set]) => [k, [...set]])), total, currency }}
        onSigned={(res) => { setSigning(false); setDone(true); setNext(res?.next || null); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        onDeclined={() => { setSigning(false); setState('declined'); }} />}

      <AskWidget token={token} stickyOffset={!done && hasPricing} />
      {/* inside the padded wrapper's flow, so it scrolls above the fixed action bar */}
      <PublicFooter brand={data?.brand} />
    </div>
  );
}

function AskWidget({ token, stickyOffset }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [thread, setThread] = useState([]); // {role, text}
  const [busy, setBusy] = useState(false);
  const ask = async () => {
    const question = q.trim(); if (!question || busy) return;
    setThread(t => [...t, { role: 'you', text: question }]); setQ(''); setBusy(true);
    try { const a = await askPublicDoc(token, question); setThread(t => [...t, { role: 'ai', text: a }]); }
    catch (e) { setThread(t => [...t, { role: 'ai', text: e.message || 'Sorry, I couldn’t answer that — please ask the sender.' }]); }
    finally { setBusy(false); }
  };
  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} style={{ position: 'fixed', right: 16, bottom: stickyOffset ? 86 : 20, zIndex: 40, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 999, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13.5, boxShadow: '0 10px 30px rgba(99,102,241,0.35)' }}>✦ Ask a question</button>
      )}
      {open && (
        <div style={{ position: 'fixed', right: 16, bottom: 20, width: 'min(360px, calc(100vw - 32px))', zIndex: 45, background: '#fff', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', border: '1px solid rgba(0,0,0,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', background: 'var(--accent)', color: '#fff' }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>✦ Ask about this document</span>
            <button onClick={() => setOpen(false)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 80 }}>
            {thread.length === 0 && <p style={{ fontSize: 13, color: '#8a8a93', margin: 0, lineHeight: 1.55 }}>Ask anything about the pricing, timeline, or terms — answered instantly from this document.</p>}
            {thread.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'you' ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: '9px 12px', borderRadius: 12, fontSize: 13.5, lineHeight: 1.5, background: m.role === 'you' ? '#16161a' : '#f1f2f5', color: m.role === 'you' ? '#fff' : '#16161a', whiteSpace: 'pre-wrap' }}>{m.text}</div>
            ))}
            {busy && <div style={{ alignSelf: 'flex-start', fontSize: 13, color: '#8a8a93' }}>Thinking…</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} placeholder="Type your question…" style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e2e8', fontSize: 14, outline: 'none' }} />
            <button onClick={ask} disabled={busy || !q.trim()} style={{ padding: '0 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#16161a', color: '#fff', fontWeight: 700, fontSize: 14, opacity: busy || !q.trim() ? 0.5 : 1 }}>Ask</button>
          </div>
        </div>
      )}
    </>
  );
}

// ── A field the client fills IN the document, where it was placed ────────────
//
// This is the difference between "sign at the bottom" and a real signing flow:
// the initials go beside the clause they initial, the date goes where the date
// belongs, and the client can see what they are agreeing to as they agree to it.
//
// The signature pad is inline for the same reason. Sending someone to a modal to
// draw and then back to the document loses the connection between the mark and
// the thing it marks.
function FillableField({ block, value, onChange }) {
  const d = block.data || {};
  const kind = d.kind || 'signature';
  const label = d.label || 'Field';
  const required = d.required !== false;
  const isInk = kind === 'signature' || kind === 'initials';

  const cv = useRef(null); const drawing = useRef(false); const last = useRef(null);
  const [hasInk, setHasInk] = useState(!!value);

  const setup = useCallback(() => {
    const c = cv.current; if (!c) return;
    const r = window.devicePixelRatio || 1; const w = c.clientWidth, h = c.clientHeight;
    c.width = w * r; c.height = h * r; const x = c.getContext('2d'); x.scale(r, r);
    x.lineWidth = 2.2; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111';
  }, []);
  useEffect(() => { if (isInk) setup(); }, [isInk, setup]);

  const pos = (e) => { const r = cv.current.getBoundingClientRect(); const t = e.touches?.[0]; return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top }; };
  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e) => {
    if (!drawing.current) return; e.preventDefault();
    const x = cv.current.getContext('2d'); const p = pos(e);
    x.beginPath(); x.moveTo(last.current.x, last.current.y); x.lineTo(p.x, p.y); x.stroke();
    last.current = p; setHasInk(true);
  };
  // Commit on stroke END, not on every move: serialising the canvas on each
  // pointermove is what makes a signature pad feel like it is dragging a brick.
  const end = () => { if (!drawing.current) return; drawing.current = false; onChange(cv.current.toDataURL('image/png')); };
  const clear = () => { const c = cv.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setHasInk(false); onChange(''); };

  const filled = kind === 'checkbox' ? value === true : !!(value && String(value).trim());

  return (
    <div style={{
      border: `1.5px ${filled ? 'solid' : 'dashed'} ${filled ? '#10b981' : '#8b8bf0'}`,
      borderRadius: 12, padding: 14,
      background: filled ? 'rgba(16,185,129,0.05)' : 'rgba(99,102,241,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isInk || kind !== 'checkbox' ? 9 : 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#16161a' }}>
          {label}{required && <span style={{ color: '#dc2626' }}> *</span>}
        </span>
        {filled && <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>✓</span>}
        <span style={{ flex: 1 }} />
        {isInk && hasInk && (
          <button onClick={clear} style={{ fontSize: 11.5, color: '#70707a', background: '#fff', border: '1px solid #e6e6ec', borderRadius: 7, padding: '3px 9px', cursor: 'pointer' }}>Clear</button>
        )}
      </div>

      {isInk && (
        <div style={{ position: 'relative', border: '1px dashed #cfcfd8', borderRadius: 10, height: kind === 'initials' ? 76 : 116, background: '#fff' }}>
          <canvas ref={cv}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
          {!hasInk && (
            <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#c2c2cc', fontSize: 13, pointerEvents: 'none' }}>
              {kind === 'initials' ? 'Initial here' : 'Sign here'}
            </span>
          )}
        </div>
      )}

      {kind === 'date' && (
        <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} style={inp} />
      )}
      {kind === 'text' && (
        <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder="Type your answer" style={inp} />
      )}
      {kind === 'checkbox' && (
        <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', cursor: 'pointer', marginTop: 4 }}>
          <input type="checkbox" checked={value === true} onChange={e => onChange(e.target.checked)}
                 style={{ marginTop: 2, width: 17, height: 17, flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: '#55555e', lineHeight: 1.5 }}>{d.help || 'I agree'}</span>
        </label>
      )}
    </div>
  );
}

function SignSheet({ token, title, signerName, onClose, onSigned, onDeclined, selectionPayload, fieldValues, usesPlacedSigning }) {
  const [typed, setTyped] = useState(signerName || '');
  const [consent, setConsent] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cv = useRef(null); const drawing = useRef(false); const last = useRef(null);

  const setup = useCallback(() => {
    const c = cv.current; if (!c) return;
    const r = window.devicePixelRatio || 1; const w = c.clientWidth, h = c.clientHeight;
    c.width = w * r; c.height = h * r; const x = c.getContext('2d'); x.scale(r, r);
    x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#111';
  }, []);
  useEffect(() => { setup(); }, [setup]);
  const pos = (e) => { const r = cv.current.getBoundingClientRect(); const t = e.touches?.[0]; return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top }; };
  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e) => { if (!drawing.current) return; e.preventDefault(); const x = cv.current.getContext('2d'); const p = pos(e); x.beginPath(); x.moveTo(last.current.x, last.current.y); x.lineTo(p.x, p.y); x.stroke(); last.current = p; setHasInk(true); };
  const end = () => { drawing.current = false; };
  const clear = () => { const c = cv.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setHasInk(false); };

  const sign = async () => {
    setErr('');
    if (!consent) return setErr('Please confirm your intent to sign electronically.');
    if (!typed.trim()) return setErr('Please type your full legal name.');
    // When the document has a placed signature field, they have already signed
    // it in context — asking again here is asking twice for the same mark.
    if (!usesPlacedSigning && !hasInk) return setErr('Please draw your signature.');
    setBusy(true);
    try {
      const r = await signPublicDoc(token, {
        typed_name: typed.trim(),
        signature_data: hasInk ? cv.current.toDataURL('image/png') : null,
        consent: true,
        selection: selectionPayload,
        field_values: fieldValues || {},
      });
      onSigned(r);
    }
    catch (e) { setErr(e.message || 'Could not submit'); setBusy(false); }
  };
  const decline = async () => { const reason = window.prompt('Decline this document? (optional reason)'); if (reason === null) return; await declinePublicDoc(token, reason); onDeclined(); };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(8,8,12,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: '20px 20px 0 0', padding: 24, boxShadow: '0 -20px 60px rgba(0,0,0,0.3)', animation: 'csUp .25s ease' }}>
        <div style={{ width: 40, height: 4, borderRadius: 999, background: '#e2e2e8', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#16161a', margin: '0 0 4px' }}>Sign “{title}”</h2>
        <p style={{ fontSize: 13, color: '#70707a', margin: '0 0 16px' }}>Your electronic signature is legally binding.</p>
        <label style={lbl}>Full legal name</label>
        <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type your name" style={inp} />
        {usesPlacedSigning ? (
          <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 10, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', fontSize: 13, color: '#15803d', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>✓</span> You have signed in the document above.
          </div>
        ) : (
          <>
            <label style={{ ...lbl, marginTop: 14 }}>Draw your signature</label>
            <div style={{ position: 'relative', border: '1.5px dashed #cfcfd8', borderRadius: 12, height: 150, background: '#fff' }}>
              <canvas ref={cv} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} style={{ width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
              {!hasInk && <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: '#c2c2cc', fontSize: 14, pointerEvents: 'none' }}>Sign here</span>}
              {hasInk && <button onClick={clear} style={{ position: 'absolute', top: 8, right: 8, fontSize: 12, color: '#8a8a93', background: '#fff', border: '1px solid #e6e6ec', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>Clear</button>}
            </div>
          </>
        )}
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3, width: 17, height: 17, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#55555e', lineHeight: 1.5 }}>I agree to sign electronically; my e-signature is the legal equivalent of my handwritten signature (ESIGN/UETA). I consent to my IP, timestamp and device being recorded.</span>
        </label>
        {err && <p style={{ color: '#dc2626', fontSize: 13, margin: '12px 0 0' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={sign} disabled={busy} style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#16161a', color: '#fff', fontWeight: 800, fontSize: 15 }}>{busy ? 'Signing…' : 'Adopt & sign'}</button>
          <button onClick={decline} disabled={busy} style={{ padding: '14px 18px', borderRadius: 12, border: '1px solid #e6e6ec', cursor: 'pointer', background: '#fff', color: '#70707a', fontWeight: 600, fontSize: 14 }}>Decline</button>
        </div>
      </div>
      <style>{`@keyframes csUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
    </div>
  );
}

const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eceef2' };
const spinner = { width: 26, height: 26, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: '#16161a', borderRadius: '50%', animation: 'csp .9s linear infinite' };
const lbl = { display: 'block', fontSize: 11.5, fontWeight: 700, color: '#55555e', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 7 };
const inp = { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid #d8d8e0', background: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' };
