'use client';
/* eslint-disable @next/next/no-img-element -- cull viewer shows dynamic /uploads photos; next/image isn't configured for them */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Check, X, HelpCircle, Star, ChevronLeft, ChevronRight, Sparkles, Copy as Dup, Images,
} from 'lucide-react';
import { mediaAPI, mediaUrl } from '../../../../lib/api';
import NavBar from '../../../../components/NavBar';

const FILTERS = [
  ['all', 'All'], ['undecided', 'To review'], ['keep', 'Keepers'], ['maybe', 'Maybe'], ['reject', 'Rejected'],
];
const DEC_META = {
  keep:   { label: 'KEEP',   color: '#10b981', Icon: Check },
  reject: { label: 'REJECT', color: '#ef4444', Icon: X },
  maybe:  { label: 'MAYBE',  color: '#f59e0b', Icon: HelpCircle },
};

export default function CullPage() {
  const router = useRouter();
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [assets, setAssets] = useState([]);
  const [filter, setFilter] = useState('all');
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login'); return; }
    (async () => {
      try {
        const [p, a] = await Promise.all([mediaAPI.getProject(id), mediaAPI.listAssets(id, { limit: 500 })]);
        setProject(p.data); setAssets(a.data.assets || []);
      } catch { router.push('/studio'); return; }
      setLoading(false);
    })();
  }, [id]);

  const counts = useMemo(() => {
    const c = { all: assets.length, keep: 0, reject: 0, maybe: 0, undecided: 0 };
    assets.forEach(a => { const d = a.cull_decision || 'undecided'; c[d] = (c[d] || 0) + 1; });
    return c;
  }, [assets]);

  const view = useMemo(
    () => (filter === 'all' ? assets : assets.filter(a => (a.cull_decision || 'undecided') === filter)),
    [assets, filter]
  );
  const idx = Math.min(cursor, Math.max(0, view.length - 1));
  const current = view[idx];

  const applyLocal = (assetId, patch) => setAssets(prev => prev.map(a => (a.id === assetId ? { ...a, ...patch } : a)));

  const decide = useCallback(async (decision) => {
    if (!current) return;
    applyLocal(current.id, { cull_decision: decision });
    if (filter === 'all') setCursor(c => Math.min(c + 1, view.length - 1));
    try { await mediaAPI.cullAsset(current.id, { decision }); } catch {}
  }, [current, filter, view.length]);

  const rate = useCallback(async (n) => {
    if (!current) return;
    const v = current.cull_rating === n ? 0 : n;
    applyLocal(current.id, { cull_rating: v });
    try { await mediaAPI.cullAsset(current.id, { rating: v }); } catch {}
  }, [current]);

  const next = useCallback(() => setCursor(c => Math.min(c + 1, view.length - 1)), [view.length]);
  const prev = useCallback(() => setCursor(c => Math.max(c - 1, 0)), []);

  // keyboard: the cull workspace is keyboard-first (Lightroom-style)
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowright' || k === ' ') { e.preventDefault(); next(); }
      else if (k === 'arrowleft') { e.preventDefault(); prev(); }
      else if (k === 'p' || k === 'k') { e.preventDefault(); decide('keep'); }
      else if (k === 'x') { e.preventDefault(); decide('reject'); }
      else if (k === 'm') { e.preventDefault(); decide('maybe'); }
      else if (k === 'u' || k === 'backspace') { e.preventDefault(); decide(null); }
      else if (k >= '1' && k <= '5') { e.preventDefault(); rate(Number(k)); }
      else if (k === '0') { e.preventDefault(); rate(0); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [decide, rate, next, prev]);

  if (loading) return <NavBar><div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div></NavBar>;

  const sharp = current?.sharpness != null ? current.sharpness >= 120 : null;

  return (
    <NavBar>
      <div style={{ maxWidth: 1320, margin: '0 auto', padding: '16px 16px 40px' }}>
        {/* top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          <button onClick={() => router.push(`/studio/${id}`)} style={ghostBtn}><ArrowLeft size={15} /> Back</button>
          <div style={{ flex: 1, minWidth: 140 }}>
            <h1 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Culling — {project?.title}</h1>
          </div>
          {counts.keep > 0 && (
            <button onClick={() => setShowGallery(true)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', color: 'white', fontWeight: 800, fontSize: 12.5 }}>
              <Images size={15} /> Gallery from {counts.keep} keeper{counts.keep === 1 ? '' : 's'}
            </button>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {FILTERS.map(([f, label]) => (
              <button key={f} onClick={() => { setFilter(f); setCursor(0); }} style={{
                padding: '6px 11px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
                background: filter === f ? 'var(--accent-light)' : 'transparent',
                color: filter === f ? 'var(--accent)' : 'var(--text-muted)',
              }}>{label} <span style={{ opacity: 0.7 }}>{counts[f] ?? 0}</span></button>
            ))}
          </div>
        </div>

        {!current ? (
          <div style={{ textAlign: 'center', padding: '90px 20px', border: '2px dashed var(--border)', borderRadius: 18, color: 'var(--text-muted)' }}>
            {assets.length === 0 ? 'Upload photos first.' : 'No photos in this filter.'}
          </div>
        ) : (
          <>
            {/* stage */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280, position: 'relative', background: '#0c0c11', borderRadius: 16, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 420, maxHeight: '64vh' }}>
                <img key={current.id} src={mediaUrl(current.variants?.web || current.url)} alt={current.filename}
                  style={{ maxWidth: '100%', maxHeight: '64vh', objectFit: 'contain', display: 'block' }} />

                {/* decision badge */}
                {current.cull_decision && DEC_META[current.cull_decision] && (
                  <div style={{ position: 'absolute', top: 14, left: 14, display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 10, background: DEC_META[current.cull_decision].color, color: 'white', fontWeight: 900, fontSize: 12, letterSpacing: '0.05em' }}>
                    {(() => { const I = DEC_META[current.cull_decision].Icon; return <I size={14} />; })()}
                    {DEC_META[current.cull_decision].label}
                  </div>
                )}

                {/* nav arrows */}
                <button onClick={prev} disabled={idx === 0} style={navArrow('left', idx === 0)}><ChevronLeft size={22} /></button>
                <button onClick={next} disabled={idx >= view.length - 1} style={navArrow('right', idx >= view.length - 1)}><ChevronRight size={22} /></button>

                {/* progress */}
                <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', padding: '4px 12px', borderRadius: 20, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                  {idx + 1} / {view.length}
                </div>
              </div>

              {/* right rail: AI advisory (clearly separated from the human decision) */}
              <aside style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    <Sparkles size={12} /> AI suggests
                  </div>
                  {sharp == null ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>No analysis yet (RAW, or still processing).</p>
                  ) : (
                    <>
                      <Row label="Focus" value={sharp ? 'Sharp' : 'Soft'} color={sharp ? '#10b981' : '#f59e0b'} />
                      {current.dup_group && <Row label="Duplicate" value="Possible" color="#6366f1" icon={<Dup size={11} />} />}
                    </>
                  )}
                  <p style={{ fontSize: 10.5, color: 'var(--text-muted)', margin: '12px 0 0', lineHeight: 1.5, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    Advisory only. AI never keeps, rejects, or hides a photo — that&apos;s your call.
                  </p>
                </div>

                {/* rating */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Your rating</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => rate(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        <Star size={22} fill={(current.cull_rating || 0) >= n ? '#f59e0b' : 'none'} color={(current.cull_rating || 0) >= n ? '#f59e0b' : 'var(--text-muted)'} />
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            </div>

            {/* decision bar (human action) */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '16px 0 14px', flexWrap: 'wrap' }}>
              <DecBtn onClick={() => decide('reject')} active={current.cull_decision === 'reject'} color="#ef4444" Icon={X} label="Reject" hint="X" />
              <DecBtn onClick={() => decide('maybe')} active={current.cull_decision === 'maybe'} color="#f59e0b" Icon={HelpCircle} label="Maybe" hint="M" />
              <DecBtn onClick={() => decide('keep')} active={current.cull_decision === 'keep'} color="#10b981" Icon={Check} label="Keep" hint="P" />
            </div>

            {/* filmstrip */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 2px' }}>
              {view.map((a, i) => {
                const dec = a.cull_decision;
                const meta = dec && DEC_META[dec];
                return (
                  <button key={a.id} onClick={() => setCursor(i)} style={{
                    position: 'relative', flexShrink: 0, width: 76, height: 76, borderRadius: 9, overflow: 'hidden', cursor: 'pointer', padding: 0,
                    border: `2px solid ${i === idx ? 'var(--accent)' : 'transparent'}`, background: 'var(--surface2)',
                  }}>
                    {a.thumb_url
                      ? <img src={mediaUrl(a.thumb_url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: dec === 'reject' ? 0.45 : 1 }} />
                      : null}
                    {meta && (
                      <span style={{ position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: '50%', background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <meta.Icon size={10} color="white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <p style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center' }}>
              Keyboard: <Kbd>←</Kbd><Kbd>→</Kbd> navigate · <Kbd>P</Kbd> keep · <Kbd>X</Kbd> reject · <Kbd>M</Kbd> maybe · <Kbd>U</Kbd> undo · <Kbd>1–5</Kbd> rate
            </p>
          </>
        )}
      </div>
      {showGallery && (
        <GalleryFromKeepersModal projectId={id} keepers={counts.keep}
          onClose={() => setShowGallery(false)} onDone={() => router.push(`/studio/${id}`)} />
      )}
    </NavBar>
  );
}

function GalleryFromKeepersModal({ projectId, keepers, onClose, onDone }) {
  const [title, setTitle] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setSaving(true); setErr('');
    try {
      await mediaAPI.createGalleryFromCull(projectId, {
        title: title.trim() || undefined, visibility,
        password: visibility === 'password' ? password : undefined, decision: 'keep',
      });
      onDone();
    } catch (e) { setErr(e.response?.data?.error || 'Could not create gallery'); setSaving(false); }
  };

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={modalBox}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#ec4899,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Images size={18} color="white" /></div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Gallery from keepers</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{keepers} photo{keepers === 1 ? '' : 's'} marked Keep</p>
          </div>
        </div>
        <label style={labelStyle}>Gallery name</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Keepers" style={inputStyle} autoFocus />
        <label style={labelStyle}>Visibility</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {['private', 'password', 'public'].map(v => (
            <button key={v} onClick={() => setVisibility(v)} style={{
              flex: 1, padding: '8px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
              border: `1px solid ${visibility === v ? 'var(--accent)' : 'var(--border)'}`,
              background: visibility === v ? 'var(--accent-light)' : 'transparent', color: visibility === v ? 'var(--accent)' : 'var(--text-muted)',
            }}>{v}</button>
          ))}
        </div>
        {visibility === 'password' && <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Gallery password" style={inputStyle} />}
        {err && <p style={{ color: '#ef4444', fontSize: 12.5, margin: '0 0 10px' }}>{err}</p>}
        <button onClick={submit} disabled={saving} style={{ width: '100%', padding: 11, borderRadius: 11, border: 'none', cursor: saving ? 'wait' : 'pointer', background: 'linear-gradient(135deg,#ec4899,#8b5cf6)', color: 'white', fontWeight: 800, fontSize: 13.5 }}>
          {saving ? 'Creating…' : `Create gallery with ${keepers} photo${keepers === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, color, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 800, color }}>{icon}{value}</span>
    </div>
  );
}

function DecBtn({ onClick, active, color, Icon, label, hint }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '11px 22px', borderRadius: 12, cursor: 'pointer',
      border: `1.5px solid ${color}`, background: active ? color : 'transparent', color: active ? 'white' : color,
      fontWeight: 800, fontSize: 14, transition: 'all 0.12s',
    }}>
      <Icon size={17} /> {label}
      <span style={{ fontSize: 10, opacity: 0.7, border: `1px solid ${active ? 'rgba(255,255,255,0.5)' : color}`, borderRadius: 4, padding: '1px 5px' }}>{hint}</span>
    </button>
  );
}

function Kbd({ children }) {
  return <span style={{ display: 'inline-block', padding: '1px 6px', margin: '0 2px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface2)', fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{children}</span>;
}

const ghostBtn = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 };
const modalBox = { background: 'var(--surface)', borderRadius: 18, padding: 24, maxWidth: 400, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.25)' };
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, marginBottom: 14, outline: 'none', boxSizing: 'border-box' };
const navArrow = (side, disabled) => ({
  position: 'absolute', [side]: 10, top: '50%', transform: 'translateY(-50%)',
  width: 40, height: 40, borderRadius: '50%', border: 'none', cursor: disabled ? 'default' : 'pointer',
  background: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  opacity: disabled ? 0.25 : 1,
});
