'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Film, Scissors, Play, Trash2, ChevronUp, ChevronDown, FlagTriangleRight, Sparkles } from 'lucide-react';
import { mediaAPI, mediaUrl } from '../../../../lib/api';
import NavBar from '../../../../components/StudioShell';

const fmt = (ms) => {
  const s = Math.max(0, (ms || 0) / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};

export default function VideoPage() {
  const router = useRouter();
  const { id } = useParams();
  const videoRef = useRef(null);
  const [videos, setVideos] = useState([]);
  const [selected, setSelected] = useState(null);
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [curMs, setCurMs] = useState(0);
  const [markIn, setMarkIn] = useState(null);
  const [markOut, setMarkOut] = useState(null);
  const [label, setLabel] = useState('');
  const [playingOut, setPlayingOut] = useState(null);

  const loadClips = useCallback(async (assetId) => {
    try { setClips((await mediaAPI.listClips(assetId)).data.clips || []); } catch { setClips([]); }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login'); return; }
    mediaAPI.listVideos(id).then(r => {
      const vids = r.data.videos || [];
      setVideos(vids);
      if (vids[0]) { setSelected(vids[0]); loadClips(vids[0].id); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const pickVideo = (v) => { setSelected(v); setClips([]); setMarkIn(null); setMarkOut(null); setLabel(''); setPlayingOut(null); loadClips(v.id); };

  const onLoadedMeta = async () => {
    const el = videoRef.current; if (!el || !selected) return;
    const dur = Math.round(el.duration * 1000);
    if (dur && !selected.duration_ms) {
      try { await mediaAPI.setAssetMeta(selected.id, { duration_ms: dur, width: el.videoWidth, height: el.videoHeight }); } catch {}
      setVideos(vs => vs.map(v => v.id === selected.id ? { ...v, duration_ms: dur } : v));
      setSelected(s => ({ ...s, duration_ms: dur }));
    }
  };
  const onTimeUpdate = () => {
    const el = videoRef.current; if (!el) return;
    const ms = el.currentTime * 1000; setCurMs(ms);
    if (playingOut != null && ms >= playingOut) { el.pause(); setPlayingOut(null); }
  };

  const addClip = async () => {
    if (markIn == null || markOut == null || markOut <= markIn) return;
    try {
      await mediaAPI.addClip(selected.id, { label: label.trim() || undefined, in_ms: Math.round(markIn), out_ms: Math.round(markOut) });
      setMarkIn(null); setMarkOut(null); setLabel('');
      await loadClips(selected.id);
      setVideos(vs => vs.map(v => v.id === selected.id ? { ...v, clip_count: (v.clip_count || 0) + 1 } : v));
    } catch {}
  };
  const playClip = (c) => {
    const el = videoRef.current; if (!el) return;
    el.currentTime = c.in_ms / 1000; setPlayingOut(c.out_ms); el.play();
  };
  const removeClip = async (c) => { await mediaAPI.deleteClip(c.id); await loadClips(selected.id); };
  const moveClip = async (idx, dir) => {
    const order = clips.map(c => c.id); const j = idx + dir; if (j < 0 || j >= order.length) return;
    [order[idx], order[j]] = [order[j], order[idx]];
    await mediaAPI.reorderClips(selected.id, order); await loadClips(selected.id);
  };

  if (loading) return <NavBar><div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div></NavBar>;

  return (
    <NavBar>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '18px 16px 60px' }}>
        <button onClick={() => router.push(`/studio/${id}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
          <ArrowLeft size={15} /> Back to shoot
        </button>
        <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: '0 0 16px' }}>Video — clip selection</h1>

        {videos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', border: '2px dashed var(--border)', borderRadius: 18 }}>
            <Film size={30} color="var(--text-muted)" style={{ opacity: 0.5 }} />
            <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '12px 0 0' }}>No videos in this shoot. Upload some from the shoot page.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* video list */}
            <aside style={{ width: 230, flexShrink: 0 }}>
              {videos.map(v => (
                <button key={v.id} onClick={() => pickVideo(v)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, marginBottom: 6, textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${selected?.id === v.id ? 'var(--accent)' : 'var(--border)'}`, background: selected?.id === v.id ? 'var(--accent-light)' : 'var(--surface)',
                }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Film size={16} color="var(--text-muted)" /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.filename}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{v.duration_ms ? fmt(v.duration_ms) : '—'} · {v.clip_count || 0} clips</div>
                  </div>
                </button>
              ))}
            </aside>

            {/* player + clips */}
            <div style={{ flex: 1, minWidth: 300 }}>
              {selected && (
                <>
                  <video ref={videoRef} src={mediaUrl(selected.url)} controls onLoadedMetadata={onLoadedMeta} onTimeUpdate={onTimeUpdate}
                    style={{ width: '100%', borderRadius: 12, background: '#000', maxHeight: '52vh' }} />

                  {/* mark in/out */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '14px 0' }}>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Playhead <strong style={{ color: 'var(--text)' }}>{fmt(curMs)}</strong></span>
                    <button onClick={() => setMarkIn(curMs)} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5 }}><FlagTriangleRight size={13} /> Mark In {markIn != null ? `(${fmt(markIn)})` : ''}</button>
                    <button onClick={() => setMarkOut(curMs)} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5 }}><FlagTriangleRight size={13} style={{ transform: 'scaleX(-1)' }} /> Mark Out {markOut != null ? `(${fmt(markOut)})` : ''}</button>
                    <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Clip label (optional)" style={{ flex: 1, minWidth: 120, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12.5, outline: 'none' }} />
                    <button onClick={addClip} disabled={markIn == null || markOut == null || markOut <= markIn} style={{ padding: '8px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', background: (markIn == null || markOut == null || markOut <= markIn) ? 'transparent' : 'var(--ms-ink)', color: (markIn == null || markOut == null || markOut <= markIn) ? 'var(--ms-ink-3)' : 'var(--ms-paper)', fontWeight: 600, fontSize: 12.5, opacity: (markIn == null || markOut == null || markOut <= markIn) ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 5 }}><Scissors size={13} /> Add clip</button>
                  </div>

                  {/* clip list */}
                  {clips.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No clips yet. Scrub the video, Mark In and Mark Out, then Add clip.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {clips.map((c, idx) => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-muted)', width: 20 }}>{idx + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{c.label || 'Untitled clip'}</div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{fmt(c.in_ms)} → {fmt(c.out_ms)} · {fmt(c.out_ms - c.in_ms)}</div>
                          </div>
                          <button onClick={() => playClip(c)} style={iconBtn} title="Play clip"><Play size={14} /></button>
                          <button onClick={() => moveClip(idx, -1)} disabled={idx === 0} style={iconBtn} title="Up"><ChevronUp size={14} /></button>
                          <button onClick={() => moveClip(idx, 1)} disabled={idx === clips.length - 1} style={iconBtn} title="Down"><ChevronDown size={14} /></button>
                          <button onClick={() => removeClip(c)} style={{ ...iconBtn, color: '#ef4444' }} title="Delete"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p style={{ marginTop: 16, fontSize: 11.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={12} /> Clips are your manual selections. There’s no auto-reel — any future AI clip scoring will only highlight candidates for you to choose.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </NavBar>
  );
}

const ghostBtn = { padding: '8px 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
const iconBtn = { width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
