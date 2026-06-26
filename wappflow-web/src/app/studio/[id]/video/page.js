'use client';
/* eslint-disable @next/next/no-img-element -- dynamic /uploads media */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Film, Trash2, Clock, Sparkles, X, LayoutTemplate, Loader, RefreshCw, Wand2 } from 'lucide-react';
import { mediaAPI, reelAPI } from '../../../../lib/api';
import NavBar from '../../../../components/StudioShell';
import { ASPECTS, ASPECT_LABELS } from '../../video-constants';

const fmtDur = (ms) => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export default function ReelListPage() {
  const router = useRouter();
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [timelines, setTimelines] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [refreshing, setRefreshing] = useState(null);
  const [building, setBuilding] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
    (async () => {
      try {
        const [p, tl, a] = await Promise.all([mediaAPI.getProject(id), mediaAPI.listTimelines(id), mediaAPI.listAssets(id, { limit: 1 })]);
        setProject(p.data); setTimelines(tl.data.timelines || []); setAssets(a.data.assets || []);
      } catch { router.push('/studio'); return; }
      setLoading(false);
    })();
  }, [id]);

  const create = async (aspect) => {
    try {
      const r = await mediaAPI.createTimeline(id, { name: 'Untitled reel', aspect_ratio: aspect });
      router.push(`/studio/${id}/video/${r.data.id}`);
    } catch {}
  };
  const remove = async (tlId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this reel? This cannot be undone.')) return;
    try { await mediaAPI.deleteTimeline(tlId); setTimelines(t => t.filter(x => x.id !== tlId)); } catch {}
  };
  const refresh = async (tlId, e) => {
    e.stopPropagation();
    setRefreshing(tlId);
    try { const r = await mediaAPI.refreshTimeline(tlId); setTimelines(ts => ts.map(x => x.id === tlId ? { ...x, ai_stale: 0, duration_ms: r.data.duration_ms } : x)); } catch {}
    setRefreshing(null);
  };

  // Auto-build a reel from Track-0 scores → renders a real video in the background.
  const autoReel = async () => {
    setBuilding(true);
    try {
      await reelAPI.render(id, { title: project?.title, target_count: 12 });
      const tl = await mediaAPI.listTimelines(id);
      setTimelines(tl.data.timelines || []);
    } catch (e) { alert(e?.response?.data?.error || 'Could not build a reel — run AI analysis on the photos first.'); }
    setBuilding(false);
  };

  if (loading) return <NavBar><div className="ms-page"><p className="ms-loading">Loading…</p></div></NavBar>;

  return (
    <NavBar>
      <div className="ms-page" style={{ paddingTop: 'clamp(16px, 2.4vw, 30px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
          <button onClick={() => router.push(`/studio/${id}`)} className="ms-back" style={{ margin: 0 }}><ArrowLeft size={15} /> Back</button>
          <div style={{ flex: 1, minWidth: 160 }}>
            <p className="ms-eyebrow">Video Studio</p>
            <h1 className="ms-h2" style={{ fontSize: 'clamp(20px, 2.4vw, 28px)' }}>Reels{project?.title ? <span style={{ color: 'var(--ms-ink-3)', fontWeight: 400 }}> · {project.title}</span> : ''}</h1>
          </div>
          <button onClick={autoReel} disabled={building} className="ms-btn-ghost" title="Auto-build a reel from your best shots (Track-0 scores) and render it">
            {building ? <Loader size={15} className="ms-spin" /> : <Wand2 size={15} />} {building ? 'Building…' : 'Auto-reel'}
          </button>
          <button onClick={() => setShowAi(true)} className="ms-btn-ghost"><Sparkles size={15} /> AI drafts</button>
          <button onClick={() => setShowTemplates(true)} className="ms-btn-ghost"><LayoutTemplate size={15} /> Templates</button>
          <button onClick={() => setShowNew(true)} className="ms-btn-ink"><Plus size={16} /> New reel</button>
        </div>

        {timelines.length === 0 ? (
          <div className="ms-hero" onClick={() => setShowNew(true)} style={{ minHeight: '46vh', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <div className="ms-hero-fallback" />
            <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: 24 }}>
              <Film size={32} color="#fff" style={{ opacity: 0.9, marginBottom: 12 }} />
              <h2 className="ms-hero-title" style={{ fontSize: 'clamp(24px, 4vw, 42px)' }}>Make your first reel</h2>
              <p className="ms-hero-sub" style={{ maxWidth: 440, margin: '12px auto 22px' }}>
                Drop in photos and clips, set the beat, and export for Instagram, TikTok, or YouTube — without leaving Studio.
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button onClick={(e) => { e.stopPropagation(); setShowAi(true); }} className="ms-btn-ink" style={{ background: '#fff', color: '#0c0c10' }}><Sparkles size={15} /> Let AI draft a reel</button>
                <button onClick={(e) => { e.stopPropagation(); setShowTemplates(true); }} className="ms-btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.4)', color: '#fff' }}><LayoutTemplate size={15} /> Template</button>
                <button onClick={(e) => { e.stopPropagation(); setShowNew(true); }} className="ms-btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.4)', color: '#fff' }}><Plus size={16} /> Blank</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="ms-collection-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {timelines.map(t => {
              const [aw, ah] = ASPECTS[t.aspect_ratio] || ASPECTS['9:16'];
              const portrait = ah > aw;
              return (
                <button key={t.id} onClick={() => router.push(`/studio/${id}/video/${t.id}`)} className="ms-covercard"
                  style={{ aspectRatio: portrait ? '3 / 4' : '4 / 3' }}>
                  <div className="ms-covercard-ph" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Film size={26} color="var(--ms-ink-3)" />
                  </div>
                  <div className="ms-covercard-veil" />
                  <div className="ms-covercard-body">
                    <span className="ms-covercard-tag">
                      {t.source === 'ai_draft' ? <><Sparkles size={9} style={{ verticalAlign: '-1px' }} /> AI draft · </> : ''}
                      {t.aspect_ratio}{t.ai_stale ? ' · outdated' : ''}
                    </span>
                    <h3 className="ms-covercard-title" style={{ fontSize: 16 }}>{t.name}</h3>
                    <p className="ms-covercard-sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Clock size={11} /> {fmtDur(t.duration_ms)}</p>
                  </div>
                  <span style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6, zIndex: 2 }}>
                    {t.source === 'ai_draft' && t.ai_stale ? (
                      <span onClick={(e) => refresh(t.id, e)} title="New media added — refresh this AI draft"
                        style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--ms-accent)', color: 'var(--ms-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {refreshing === t.id ? <Loader size={12} className="ms-spin" /> : <RefreshCw size={12} />}
                      </span>
                    ) : null}
                    <span onClick={(e) => remove(t.id, e)} title="Delete reel"
                      style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Trash2 size={13} />
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {assets.length === 0 && (
          <p className="ms-note" style={{ marginTop: 22 }}><Sparkles size={12} /> Tip: upload photos &amp; clips to this shoot first — they become the building blocks of your reel.</p>
        )}
      </div>

      {showNew && <NewReelModal onClose={() => setShowNew(false)} onPick={create} />}
      {showTemplates && <TemplateGalleryModal projectId={id} hasMedia={assets.length > 0} onClose={() => setShowTemplates(false)} />}
      {showAi && <AiDraftModal projectId={id} hasMedia={assets.length > 0} onClose={() => setShowAi(false)} />}
    </NavBar>
  );
}

function AiDraftModal({ projectId, hasMedia, onClose }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { mediaAPI.aiDraftStyles(projectId).then(r => setData(r.data)).catch(() => setData({ styles: [], recommended: [] })); }, [projectId]);

  const generate = async (styleId) => {
    if (generating) return;
    setGenerating(styleId); setErr('');
    try {
      const r = await mediaAPI.generateAiDraft(projectId, { style: styleId });
      router.push(`/studio/${projectId}/video/${r.data.id}`);
    } catch (e) { setErr(e.response?.data?.error || 'Could not generate a draft'); setGenerating(null); }
  };

  const recSet = new Set(data?.recommended || []);
  const ordered = (data?.styles || []).slice().sort((a, b) => (recSet.has(b.id) ? 1 : 0) - (recSet.has(a.id) ? 1 : 0));

  return (
    <div onClick={onClose} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--ms-accent)', color: 'var(--ms-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={18} /></span>
            <div>
              <h2>AI reel drafts</h2>
              <p className="ms-modal-sub">Pick a style — AI builds a draft from your best shots. You edit &amp; export it.</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ms-ink-3)', padding: 4 }}><X size={20} /></button>
        </div>

        {!hasMedia && <p style={{ fontSize: 12.5, color: '#d39a3e', margin: '10px 0 0' }}>Upload photos or clips first — AI drafts from your shoot’s media.</p>}
        {err && <p style={{ fontSize: 12.5, color: '#d4564a', margin: '10px 0 0' }}>{err}</p>}

        {data === null ? <p className="ms-loading" style={{ marginTop: 16 }}>Analyzing your shoot…</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16, maxHeight: '54vh', overflowY: 'auto', paddingRight: 4 }}>
            {ordered.map(s => (
              <button key={s.id} onClick={() => generate(s.id)} disabled={!hasMedia || !!generating}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: 12, borderRadius: 12, border: '1px solid var(--ms-line)', background: 'var(--ms-surface)', cursor: hasMedia ? 'pointer' : 'default', textAlign: 'left', opacity: !hasMedia ? 0.5 : 1 }}>
                <span style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 9, overflow: 'hidden', position: 'relative' }}>
                  <span style={{ position: 'absolute', inset: 0, background: `linear-gradient(150deg, ${(s.palette || ['#caa37a', '#3a2c1a'])[0]}, ${(s.palette || ['#caa37a', '#3a2c1a'])[1]})`, filter: s.css === 'none' ? undefined : s.css }} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <b style={{ fontSize: 13.5, color: 'var(--ms-ink)' }}>{s.name}</b>
                    {recSet.has(s.id) && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--ms-accent)', border: '1px solid var(--ms-accent)', borderRadius: 5, padding: '1px 5px' }}>SUGGESTED</span>}
                    <span style={{ fontSize: 10, color: 'var(--ms-ink-3)' }}>{s.aspect}</span>
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ms-ink-3)', marginTop: 2 }}>{s.desc}</span>
                </span>
                {generating === s.id ? <Loader size={16} className="ms-spin" color="var(--ms-accent)" /> : <Wand2 size={16} color="var(--ms-ink-3)" />}
              </button>
            ))}
          </div>
        )}
        <p style={{ fontSize: 10.5, color: 'var(--ms-ink-3)', marginTop: 14, lineHeight: 1.5, display: 'flex', gap: 6 }}>
          <Sparkles size={12} style={{ flexShrink: 0, marginTop: 1 }} /> AI ranks your shots by quality, sharpness, keepers &amp; ratings (skipping rejects &amp; duplicates). It only drafts — you decide what ships.
        </p>
      </div>
    </div>
  );
}

const PACK_DURATIONS = [15, 30, 45, 60];
const POSTER_GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function TemplateGalleryModal({ projectId, hasMedia, onClose }) {
  const router = useRouter();
  const [packs, setPacks] = useState(null);
  const [cat, setCat] = useState('All');
  const [duration, setDuration] = useState(60);
  const [applying, setApplying] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { mediaAPI.videoTemplates().then(r => setPacks(r.data.templates || [])).catch(() => setPacks([])); }, []);

  const cats = ['All', ...Array.from(new Set((packs || []).map(p => p.category)))];
  const shown = (packs || []).filter(p => cat === 'All' || p.category === cat);

  const apply = async (p) => {
    if (applying || !hasMedia) return;
    setApplying(p.id); setErr('');
    try {
      const r = await mediaAPI.applyTemplate(projectId, p.id, { duration_sec: duration });
      router.push(`/studio/${projectId}/video/${r.data.id}`);
    } catch (e) { setErr(e.response?.data?.error || 'Could not apply pack'); setApplying(null); }
  };

  return (
    <div onClick={onClose} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 1160, width: '95vw' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 4 }}>
          <div>
            <h2>Creative packs</h2>
            <p className="ms-modal-sub">Production-ready reels. Pick a look — your {hasMedia ? 'photos & clips' : 'media'} pour straight in, ready to export.</p>
          </div>
          {/* duration selector — 60s is primary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ms-ink-3)' }}>Length</span>
            <div className="ms-seg" style={{ padding: 3 }}>
              {PACK_DURATIONS.map(d => (
                <button key={d} onClick={() => setDuration(d)} className={duration === d ? 'is-active' : ''} style={{ padding: '6px 11px', fontSize: 12 }}>{d}s</button>
              ))}
            </div>
          </div>
        </div>

        {!hasMedia && <p style={{ fontSize: 12.5, color: '#d39a3e', margin: '8px 0 0' }}>Upload photos or clips to this shoot first — packs fill from your media.</p>}
        {err && <p style={{ fontSize: 12.5, color: '#d4564a', margin: '8px 0 0' }}>{err}</p>}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 16px' }}>
          {cats.map(c => (
            <button key={c} onClick={() => setCat(c)} className={`ms-chip${cat === c ? ' ms-chip-active' : ''}`} style={{ fontSize: 11.5 }}>{c}</button>
          ))}
        </div>

        {packs === null ? (
          <p className="ms-loading">Loading packs…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(184px, 1fr))', gap: 16, maxHeight: '60vh', overflowY: 'auto', padding: '2px 4px 4px' }}>
            {shown.map(p => {
              const pal = p.palette || ['#caa37a', '#3a2c1a'];
              return (
                <button key={p.id} onClick={() => apply(p)} disabled={!hasMedia || !!applying} className="ms-poster"
                  style={{ position: 'relative', aspectRatio: '2 / 3', borderRadius: 14, overflow: 'hidden', border: 'none', padding: 0, cursor: hasMedia ? 'pointer' : 'default', textAlign: 'left', opacity: !hasMedia ? 0.55 : 1 }}>
                  {/* art: graded palette + grain + cinematic scrim */}
                  <span style={{ position: 'absolute', inset: 0, background: `linear-gradient(155deg, ${pal[0]}, ${pal[1]})`, filter: p.css && p.css !== 'none' ? p.css : undefined }} />
                  <span style={{ position: 'absolute', inset: 0, opacity: 0.12, mixBlendMode: 'overlay', backgroundImage: POSTER_GRAIN }} />
                  <span style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 75% at 50% 22%, transparent 42%, rgba(0,0,0,0.45)), linear-gradient(to top, rgba(0,0,0,0.82) 4%, rgba(0,0,0,0.05) 52%)' }} />
                  {/* content */}
                  <span style={{ position: 'absolute', inset: 0, padding: 15, display: 'flex', flexDirection: 'column', color: '#fff' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.82 }}>{p.category}</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontFamily: 'var(--ms-font-display)', fontWeight: 800, fontSize: 23, lineHeight: 1.04, letterSpacing: '-0.01em', textShadow: '0 2px 16px rgba(0,0,0,0.5)' }}>{p.name}</span>
                    <span style={{ fontSize: 11, opacity: 0.82, margin: '5px 0 9px', lineHeight: 1.35 }}>{p.mood}</span>
                    <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {[`${duration}s`, p.aspect, p.style].map((chip, j) => (
                        <span key={j} style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', padding: '3px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(4px)' }}>{chip}</span>
                      ))}
                    </span>
                  </span>
                  {/* hover CTA */}
                  <span className="ms-poster-cta" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.32)', opacity: 0, transition: 'opacity .2s' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 999, background: '#fff', color: '#0c0c10', fontSize: 12.5, fontWeight: 700 }}><Film size={14} /> Use this pack</span>
                  </span>
                  {applying === p.id && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}><Loader size={22} className="ms-spin" color="#fff" /></span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function NewReelModal({ onClose, onPick }) {
  const order = ['9:16', '1:1', '4:5', '16:9', '21:9', '3:2'];
  return (
    <div onClick={onClose} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 520 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2>New reel</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ms-ink-3)', padding: 4 }}><X size={20} /></button>
        </div>
        <p className="ms-modal-sub" style={{ marginBottom: 20 }}>Pick a canvas to start — you can switch aspect ratios any time.</p>
        <div className="r-stack-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {order.map(a => {
            const [aw, ah] = ASPECTS[a];
            const r = aw / ah;
            const boxW = r >= 1 ? 76 : 76 * r, boxH = r >= 1 ? 76 / r : 76;
            return (
              <button key={a} onClick={() => onPick(a)} className="ms-chip" style={{ flexDirection: 'column', height: 130, justifyContent: 'center', gap: 10, padding: 10 }}>
                <span style={{ width: boxW, height: boxH, borderRadius: 6, background: 'var(--ms-accent)', opacity: 0.85, display: 'block' }} />
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <b style={{ fontSize: 13, color: 'var(--ms-ink)' }}>{a}</b>
                  <span style={{ fontSize: 10.5, color: 'var(--ms-ink-3)' }}>{ASPECT_LABELS[a]}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
