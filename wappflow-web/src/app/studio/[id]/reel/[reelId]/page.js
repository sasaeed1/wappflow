'use client';
/* eslint-disable @next/next/no-img-element -- reel thumbs are dynamic /uploads URLs */

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Check, ChevronUp, ChevronDown, X } from 'lucide-react';
import { mediaAPI, videoAiAPI, mediaUrl } from '../../../../../lib/api';
import NavBar from '../../../../../components/StudioShell';

const TRANSITIONS = ['cut', 'fade', 'whip'];
const MOTIONS = ['kenburns', 'pan', 'static'];

export default function ReelEditorPage() {
  const router = useRouter();
  const { id, reelId } = useParams();
  const [reel, setReel] = useState(null);
  const [plan, setPlan] = useState(null);
  const [byId, setById] = useState({});
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=' + encodeURIComponent(window.location.pathname)); return; }
    (async () => {
      try {
        const [r, as] = await Promise.all([videoAiAPI.getReel(reelId), mediaAPI.listAssets(id, { limit: 500 })]);
        const m = {}; (as.data.assets || []).forEach(a => { m[a.id] = a; }); setById(m);
        setReel(r.data.reel); setPlan(r.data.reel.plan || { timeline: [] });
      } catch { router.push(`/studio/${id}`); }
    })();
  }, [id, reelId]);

  const timeline = (plan && plan.timeline) || [];
  const totalMs = useMemo(() => timeline.reduce((s, c) => s + (Number(c.duration_ms) || 0), 0), [timeline]);
  const mark = (tl) => { setPlan(p => ({ ...p, timeline: tl })); setSaved(false); };
  const set = (i, patch) => mark(timeline.map((c, j) => j === i ? { ...c, ...patch } : c));
  const move = (i, dir) => { const n = [...timeline]; const j = i + dir; if (j < 0 || j >= n.length) return; [n[i], n[j]] = [n[j], n[i]]; mark(n); };
  const remove = (i) => mark(timeline.filter((_, j) => j !== i));

  const save = async () => { setSaving(true); try { await videoAiAPI.updateReel(reelId, { plan: { ...plan, length_s: Math.round(totalMs / 1000) } }); setSaved(true); } catch {} finally { setSaving(false); } };

  if (!plan) return <NavBar><div className="ms-page"><p className="ms-loading">Loading…</p></div></NavBar>;

  return (
    <NavBar>
      <div className="ms-page" style={{ maxWidth: 880 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <button onClick={() => router.push(`/studio/${id}`)} className="ms-btn-ghost" style={{ padding: '7px 12px' }}><ArrowLeft size={14} /> Shoot</button>
          <h1 className="ms-h2" style={{ margin: 0, flex: 1, minWidth: 160 }}>Reel timeline</h1>
          <span style={{ fontSize: 12.5, color: 'var(--ms-ink-3)' }}>{timeline.length} clips · {(totalMs / 1000).toFixed(1)}s · {plan.aspect || '9:16'}</span>
          <button onClick={save} disabled={saving || saved} className="ms-btn-ink" style={{ padding: '8px 16px' }}>{saving ? 'Saving…' : saved ? <><Check size={14} /> Saved</> : 'Save reel'}</button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ms-ink-3)', margin: '0 0 18px' }}>Edit the Story-Engine plan before render — reorder, retime, set transitions & motion. The render uses your existing video engine.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {timeline.map((c, i) => {
            const a = byId[c.asset_id];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, border: '1px solid var(--ms-line)', borderRadius: 12, background: 'var(--ms-surface)' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--ms-ink-3)', width: 22, textAlign: 'center' }}>{i + 1}</span>
                <div style={{ width: 80, height: 56, borderRadius: 8, overflow: 'hidden', background: 'var(--ms-line)', flexShrink: 0 }}>
                  {a && (a.poster_url || a.thumb_url) ? <img src={mediaUrl(a.poster_url || a.thumb_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ms-accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.role || 'clip'}</div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={lbl}>Dur
                      <input type="number" step="0.1" min="0.3" value={((c.duration_ms || 0) / 1000).toFixed(1)} onChange={e => { const ms = Math.max(300, Math.round(Number(e.target.value) * 1000)); set(i, { duration_ms: ms, out_ms: ms }); }} style={inp} />s
                    </label>
                    <label style={lbl}>In
                      <select value={c.transition || 'cut'} onChange={e => set(i, { transition: e.target.value })} style={sel}>{TRANSITIONS.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    </label>
                    <label style={lbl}>Motion
                      <select value={c.motion || 'static'} onChange={e => set(i, { motion: e.target.value })} style={sel}>{MOTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select>
                    </label>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button onClick={() => move(i, -1)} className="ms-iconbtn" style={{ width: 26, height: 26 }}><ChevronUp size={13} /></button>
                  <button onClick={() => move(i, 1)} className="ms-iconbtn" style={{ width: 26, height: 26 }}><ChevronDown size={13} /></button>
                </div>
                <button onClick={() => remove(i)} className="ms-iconbtn" style={{ width: 28, height: 28, color: '#d4564a' }}><X size={14} /></button>
              </div>
            );
          })}
          {timeline.length === 0 && <p style={{ fontSize: 13, color: 'var(--ms-ink-3)' }}>This reel has no clips. Generate a reel from the Studio AI panel first.</p>}
        </div>
      </div>
    </NavBar>
  );
}
const lbl = { display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--ms-ink-3)' };
const inp = { width: 52, padding: '4px 6px', borderRadius: 7, border: '1px solid var(--ms-line)', background: 'var(--ms-paper)', color: 'var(--ms-ink)', fontSize: 12.5, outline: 'none', margin: '0 3px' };
const sel = { padding: '4px 6px', borderRadius: 7, border: '1px solid var(--ms-line)', background: 'var(--ms-paper)', color: 'var(--ms-ink)', fontSize: 12.5, outline: 'none', marginLeft: 3 };
