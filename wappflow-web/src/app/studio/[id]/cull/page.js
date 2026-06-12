'use client';
/* eslint-disable @next/next/no-img-element -- cull viewer shows dynamic /uploads photos; next/image isn't configured for them */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Check, X, HelpCircle, Star, ChevronLeft, ChevronRight, Sparkles, Copy as Dup, Images,
} from 'lucide-react';
import { mediaAPI, mediaUrl } from '../../../../lib/api';
import NavBar from '../../../../components/StudioShell';

const FILTERS = [
  ['all', 'All'], ['undecided', 'To review'], ['keep', 'Keepers'], ['maybe', 'Maybe'], ['reject', 'Rejected'],
];
const DEC_META = {
  keep:   { label: 'KEEP',   color: '#2f9e6e', Icon: Check },
  reject: { label: 'REJECT', color: '#d4564a', Icon: X },
  maybe:  { label: 'MAYBE',  color: '#d39a3e', Icon: HelpCircle },
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
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
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

  if (loading) return <NavBar><div className="ms-page"><p className="ms-loading">Loading…</p></div></NavBar>;

  const sharp = current?.sharpness != null ? current.sharpness >= 120 : null;
  const expo = current?.exposure;
  const overE = (current?.high_clip || 0) > 0.06 || (expo != null && expo > 0.78);
  const underE = (current?.shadow_clip || 0) > 0.10 || (expo != null && expo < 0.22);
  const expoLabel = expo == null ? '—' : overE ? 'Bright' : underE ? 'Dark' : 'Balanced';
  const expoColor = (overE || underE) ? '#d39a3e' : '#2f9e6e';
  const q = current?.quality;
  const qualLabel = q == null ? '—' : q >= 0.66 ? 'Great' : q >= 0.4 ? 'Good' : 'Weak';
  const qualColor = q == null ? 'var(--ms-ink-3)' : q >= 0.66 ? '#2f9e6e' : q >= 0.4 ? '#d39a3e' : '#d4564a';

  return (
    <NavBar>
      <div className="ms-page" style={{ paddingTop: 'clamp(20px, 3vw, 36px)' }}>
        {/* top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <button onClick={() => router.push(`/studio/${id}`)} className="ms-back" style={{ margin: 0 }}><ArrowLeft size={15} /> Back</button>
          <div style={{ flex: 1, minWidth: 160 }}>
            <h1 className="ms-h2" style={{ fontSize: 'clamp(20px, 2.6vw, 28px)' }}>Culling<span style={{ color: 'var(--ms-ink-3)', fontStyle: 'italic' }}>{project?.title ? ` — ${project.title}` : ''}</span></h1>
          </div>
          {counts.keep > 0 && (
            <button onClick={() => setShowGallery(true)} className="ms-btn-ink" style={{ padding: '9px 16px', fontSize: 12.5 }}>
              <Images size={15} /> Gallery from {counts.keep} keeper{counts.keep === 1 ? '' : 's'}
            </button>
          )}
        </div>

        <div className="ms-seg" style={{ marginBottom: 20 }}>
          {FILTERS.map(([f, label]) => (
            <button key={f} onClick={() => { setFilter(f); setCursor(0); }} className={filter === f ? 'is-active' : ''}>
              {label} <span style={{ opacity: 0.6 }}>{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>

        {!current ? (
          <div className="ms-empty-soft">{assets.length === 0 ? 'Upload photographs first.' : 'Nothing in this filter.'}</div>
        ) : (
          <>
            {/* stage */}
            <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 280, position: 'relative', background: '#0c0b09', borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 460, maxHeight: '70vh' }}>
                <img key={current.id} src={mediaUrl(current.variants?.web || current.url)} alt={current.filename}
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} />

                {/* decision badge */}
                {current.cull_decision && DEC_META[current.cull_decision] && (
                  <div style={{ position: 'absolute', top: 16, left: 16, display: 'flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 999, background: DEC_META[current.cull_decision].color, color: 'white', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em' }}>
                    {(() => { const I = DEC_META[current.cull_decision].Icon; return <I size={13} />; })()}
                    {DEC_META[current.cull_decision].label}
                  </div>
                )}

                {/* nav arrows */}
                <button onClick={prev} disabled={idx === 0} style={navArrow('left', idx === 0)}><ChevronLeft size={22} /></button>
                <button onClick={next} disabled={idx >= view.length - 1} style={navArrow('right', idx >= view.length - 1)}><ChevronRight size={22} /></button>

                {/* progress */}
                <div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', padding: '4px 13px', borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 11.5, fontWeight: 500, letterSpacing: '0.04em' }}>
                  {idx + 1} / {view.length}
                </div>
              </div>

              {/* right rail: AI advisory (clearly separated from the human decision) */}
              <aside style={{ width: 234, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="ms-panel">
                  <div className="ms-note" style={{ marginBottom: 12, color: 'var(--ms-ink-3)', textTransform: 'uppercase', letterSpacing: '0.14em', fontSize: 10.5, fontWeight: 600 }}>
                    <Sparkles size={12} /> AI suggests
                  </div>
                  {sharp == null ? (
                    <p style={{ fontSize: 12.5, color: 'var(--ms-ink-3)', margin: 0 }}>No analysis yet (RAW, or still processing).</p>
                  ) : (
                    <>
                      <Row label="Focus" value={sharp ? 'Sharp' : 'Soft'} color={sharp ? '#2f9e6e' : '#d39a3e'} />
                      <Row label="Exposure" value={expoLabel} color={expoColor} />
                      {q != null && <Row label="Quality" value={qualLabel} color={qualColor} />}
                      {current.dup_group && <Row label="Duplicate" value="Possible" color="var(--ms-ink-2)" icon={<Dup size={11} />} />}
                    </>
                  )}
                  <p style={{ fontSize: 11, color: 'var(--ms-ink-3)', margin: '14px 0 0', lineHeight: 1.5, borderTop: '1px solid var(--ms-line)', paddingTop: 12 }}>
                    Advisory only. AI never keeps, rejects, or hides a photograph — that&apos;s your call.
                  </p>
                </div>

                {/* rating */}
                <div className="ms-panel">
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--ms-ink-3)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 12 }}>Your rating</div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <button key={n} onClick={() => rate(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        <Star size={22} fill={(current.cull_rating || 0) >= n ? '#d39a3e' : 'none'} color={(current.cull_rating || 0) >= n ? '#d39a3e' : 'var(--ms-ink-3)'} />
                      </button>
                    ))}
                  </div>
                </div>
              </aside>
            </div>

            {/* decision bar (human action) */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, margin: '18px 0 16px', flexWrap: 'wrap' }}>
              <DecBtn onClick={() => decide('reject')} active={current.cull_decision === 'reject'} color="#d4564a" Icon={X} label="Reject" hint="X" />
              <DecBtn onClick={() => decide('maybe')} active={current.cull_decision === 'maybe'} color="#d39a3e" Icon={HelpCircle} label="Maybe" hint="M" />
              <DecBtn onClick={() => decide('keep')} active={current.cull_decision === 'keep'} color="#2f9e6e" Icon={Check} label="Keep" hint="P" />
            </div>

            {/* filmstrip */}
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '6px 2px' }}>
              {view.map((a, i) => {
                const dec = a.cull_decision;
                const meta = dec && DEC_META[dec];
                return (
                  <button key={a.id} onClick={() => setCursor(i)} style={{
                    position: 'relative', flexShrink: 0, width: 74, height: 74, borderRadius: 4, overflow: 'hidden', cursor: 'pointer', padding: 0,
                    outline: i === idx ? '2px solid var(--ms-ink)' : '1px solid var(--ms-line)', outlineOffset: -1, border: 'none', background: 'var(--ms-surface-2)',
                  }}>
                    {a.thumb_url
                      ? <img src={mediaUrl(a.thumb_url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: dec === 'reject' ? 0.4 : 1 }} />
                      : null}
                    {meta && (
                      <span style={{ position: 'absolute', top: 3, right: 3, width: 15, height: 15, borderRadius: '50%', background: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <meta.Icon size={9} color="white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <p style={{ marginTop: 16, fontSize: 11.5, color: 'var(--ms-ink-3)', textAlign: 'center' }}>
              <Kbd>←</Kbd><Kbd>→</Kbd> navigate · <Kbd>P</Kbd> keep · <Kbd>X</Kbd> reject · <Kbd>M</Kbd> maybe · <Kbd>U</Kbd> undo · <Kbd>1–5</Kbd> rate
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
    <div onClick={onClose} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--ms-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Images size={18} color="var(--ms-paper)" /></div>
          <div>
            <h2 style={{ fontSize: 19 }}>Gallery from keepers</h2>
            <p className="ms-modal-sub">{keepers} photo{keepers === 1 ? '' : 's'} marked Keep</p>
          </div>
        </div>
        <label className="ms-label">Gallery name</label>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Keepers" className="ms-input" style={{ marginBottom: 18 }} autoFocus />
        <label className="ms-label">Visibility</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {['private', 'password', 'public'].map(v => (
            <button key={v} onClick={() => setVisibility(v)} className={`ms-chip${visibility === v ? ' ms-chip-active' : ''}`} style={{ flex: 1 }}>{v}</button>
          ))}
        </div>
        {visibility === 'password' && <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Gallery password" className="ms-input" style={{ marginBottom: 18 }} />}
        {err && <p style={{ color: '#b3261e', fontSize: 12.5, margin: '0 0 12px' }}>{err}</p>}
        <button onClick={submit} disabled={saving} className="ms-btn-ink" style={{ width: '100%', justifyContent: 'center' }}>
          {saving ? 'Creating…' : `Create gallery with ${keepers} photo${keepers === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, color, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 12.5, color: 'var(--ms-ink-3)' }}>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 600, color }}>{icon}{value}</span>
    </div>
  );
}

function DecBtn({ onClick, active, color, Icon, label, hint }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '11px 24px', borderRadius: 999, cursor: 'pointer',
      border: `1px solid ${active ? color : 'var(--ms-line)'}`, background: active ? color : 'transparent', color: active ? 'white' : 'var(--ms-ink)',
      fontFamily: 'var(--ms-sans)', fontWeight: 600, fontSize: 13.5, transition: 'all 0.15s ease',
    }}>
      <Icon size={16} color={active ? 'white' : color} /> {label}
      <span style={{ fontSize: 10, opacity: 0.6, border: `1px solid ${active ? 'rgba(255,255,255,0.5)' : 'var(--ms-line)'}`, borderRadius: 4, padding: '1px 5px' }}>{hint}</span>
    </button>
  );
}

function Kbd({ children }) {
  return <span style={{ display: 'inline-block', padding: '1px 6px', margin: '0 2px', borderRadius: 4, border: '1px solid var(--ms-line)', background: 'var(--ms-surface-2)', fontSize: 11, fontWeight: 600, color: 'var(--ms-ink-2)' }}>{children}</span>;
}

const navArrow = (side, disabled) => ({
  position: 'absolute', [side]: 12, top: '50%', transform: 'translateY(-50%)',
  width: 42, height: 42, borderRadius: '50%', border: 'none', cursor: disabled ? 'default' : 'pointer',
  background: 'rgba(0,0,0,0.45)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  opacity: disabled ? 0.2 : 1, backdropFilter: 'blur(4px)',
});
