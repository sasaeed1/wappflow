'use client';
/* eslint-disable @next/next/no-img-element -- dynamic /uploads media */

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Film, Trash2, Clock, Sparkles, X } from 'lucide-react';
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
              <button onClick={(e) => { e.stopPropagation(); setShowNew(true); }} className="ms-btn-ink" style={{ background: '#fff', color: '#0c0c10' }}><Plus size={16} /> New reel</button>
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
    </NavBar>
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
