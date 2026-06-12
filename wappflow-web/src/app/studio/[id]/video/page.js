'use client';
/* eslint-disable @next/next/no-img-element -- dynamic /uploads media */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Film, Trash2, Clock, Sparkles, X, LayoutTemplate, Loader } from 'lucide-react';
import { mediaAPI } from '../../../../lib/api';
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
                <button onClick={(e) => { e.stopPropagation(); setShowTemplates(true); }} className="ms-btn-ink" style={{ background: '#fff', color: '#0c0c10' }}><LayoutTemplate size={15} /> Start from a template</button>
                <button onClick={(e) => { e.stopPropagation(); setShowNew(true); }} className="ms-btn-ghost" style={{ borderColor: 'rgba(255,255,255,0.4)', color: '#fff' }}><Plus size={16} /> Blank reel</button>
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
                  <span onClick={(e) => remove(t.id, e)} title="Delete reel"
                    style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 8, background: 'rgba(0,0,0,0.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
                    <Trash2 size={13} />
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
    </NavBar>
  );
}

function TemplateGalleryModal({ projectId, hasMedia, onClose }) {
  const router = useRouter();
  const [templates, setTemplates] = useState(null);
  const [cat, setCat] = useState('All');
  const [applying, setApplying] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => { mediaAPI.videoTemplates().then(r => setTemplates(r.data.templates || [])).catch(() => setTemplates([])); }, []);

  const cats = ['All', ...Array.from(new Set((templates || []).map(t => t.category)))];
  const shown = (templates || []).filter(t => cat === 'All' || t.category === cat);

  const apply = async (t) => {
    if (applying) return;
    setApplying(t.id); setErr('');
    try {
      const r = await mediaAPI.applyTemplate(projectId, t.id, {});
      router.push(`/studio/${projectId}/video/${r.data.id}`);
    } catch (e) { setErr(e.response?.data?.error || 'Could not apply template'); setApplying(null); }
  };

  return (
    <div onClick={onClose} className="ms-modal-overlay">
      <div onClick={e => e.stopPropagation()} className="ms-modal" style={{ maxWidth: 720, width: '92vw' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <h2>Reel templates</h2>
            <p className="ms-modal-sub">Pick a look — we’ll drop your {hasMedia ? 'photos & clips' : 'media'} into it. Fully editable after.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ms-ink-3)', padding: 4 }}><X size={20} /></button>
        </div>

        {!hasMedia && <p style={{ fontSize: 12.5, color: '#d39a3e', margin: '8px 0 0' }}>Upload photos or clips to this shoot first — templates fill from your media.</p>}
        {err && <p style={{ fontSize: 12.5, color: '#d4564a', margin: '8px 0 0' }}>{err}</p>}

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '16px 0' }}>
          {cats.map(c => (
            <button key={c} onClick={() => setCat(c)} className={`ms-chip${cat === c ? ' ms-chip-active' : ''}`} style={{ fontSize: 11.5 }}>{c}</button>
          ))}
        </div>

        {templates === null ? (
          <p className="ms-loading">Loading templates…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, maxHeight: '52vh', overflowY: 'auto', paddingRight: 4 }}>
            {shown.map(t => {
              const [aw, ah] = ASPECTS[t.aspect] || ASPECTS['9:16'];
              const portrait = ah > aw;
              return (
                <button key={t.id} onClick={() => apply(t)} disabled={!hasMedia || !!applying}
                  style={{ border: '1px solid var(--ms-line)', borderRadius: 12, overflow: 'hidden', cursor: hasMedia ? 'pointer' : 'default', background: 'var(--ms-surface-2)', padding: 0, textAlign: 'left', opacity: !hasMedia ? 0.5 : 1 }}>
                  <div style={{ position: 'relative', aspectRatio: portrait ? '3 / 4' : '4 / 3', overflow: 'hidden' }}>
                    <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,#caa37a 0%,#9c7bb0 45%,#6b8aa6 100%)', filter: t.css === 'none' ? undefined : t.css }} />
                    <span style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 -40px 40px -20px rgba(0,0,0,0.5)' }} />
                    {applying === t.id && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}><Loader size={20} className="ms-spin" color="#fff" /></span>}
                    <span style={{ position: 'absolute', top: 7, right: 7, padding: '2px 7px', borderRadius: 999, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 9.5, fontWeight: 600 }}>{t.aspect}</span>
                    <span style={{ position: 'absolute', bottom: 7, left: 8, color: '#fff', fontSize: 9.5, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>{t.slotCount} clips · {Math.round(t.durationMs / 1000)}s</span>
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ms-ink)' }}>{t.name}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--ms-ink-3)' }}>{t.category}</div>
                  </div>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
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
