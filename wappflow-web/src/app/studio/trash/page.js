'use client';
/* eslint-disable @next/next/no-img-element -- trash thumbs are dynamic /uploads URLs */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, RotateCcw, AlertTriangle, Undo2 } from 'lucide-react';
import { mediaAPI, mediaUrl } from '../../../lib/api';
import { useConfirm } from '@/lib/confirm';

const daysLeft = (deletedAt) => {
  try { const elapsed = (Date.now() - new Date(deletedAt + 'Z').getTime()) / 86400000; return Math.max(0, Math.ceil(30 - elapsed)); } catch { return 30; }
};

export default function StudioTrashPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const say = (m) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/studio/trash'); return; }
    load();
  }, []);

  const load = async () => {
    try { const r = await mediaAPI.listTrash(); setItems(r.data.assets || []); } catch { setItems([]); }
  };

  const restore = async (a) => {
    setBusy(a.id);
    try { await mediaAPI.restoreAsset(a.id); setItems(prev => prev.filter(x => x.id !== a.id)); say('Restored'); }
    catch { say('Could not restore'); }
    setBusy(null);
  };
  const purge = async (a) => {
    const ok = await confirm({
      title: 'Delete permanently?',
      message: 'This asset will be permanently deleted. This cannot be undone.',
      tone: 'danger', confirmLabel: 'Delete forever', requireTyped: 'DELETE',
    });
    if (!ok) return;
    setBusy(a.id);
    try { await mediaAPI.purgeAsset(a.id); setItems(prev => prev.filter(x => x.id !== a.id)); say('Permanently deleted'); }
    catch { say('Could not delete'); }
    setBusy(null);
  };

  return (
    <>
      <div className="ms-page" style={{ maxWidth: 1320 }}>
        <button onClick={() => router.push('/studio')} className="ms-back"><Undo2 size={15} /> Back to studio</button>
        <div className="ms-section-head" style={{ marginBottom: 8 }}>
          <div>
            <p className="ms-eyebrow" style={{ marginBottom: 8 }}>Studio</p>
            <h1 className="ms-display" style={{ fontSize: 'clamp(28px, 4.4vw, 52px)' }}>Trash</h1>
          </div>
        </div>
        <p className="ms-note" style={{ marginBottom: 24 }}>
          <AlertTriangle size={13} /> Deleted media is kept here for 90 days, then permanently removed. Restore anything before it expires.
        </p>

        {items === null ? (
          <p className="ms-loading">Loading trash…</p>
        ) : items.length === 0 ? (
          <div className="ms-empty-soft">Trash is empty. Deleted photos &amp; videos will appear here for 90 days.</div>
        ) : (
          <div className="ms-photo-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
            {items.map(a => {
              const left = daysLeft(a.deleted_at);
              const isVideo = a.type === 'video';
              const thumb = isVideo ? (a.poster_url || a.thumb_url) : a.thumb_url;
              return (
                <div key={a.id} style={{ position: 'relative', borderRadius: 'var(--ms-radius-photo)', overflow: 'hidden', background: 'var(--ms-surface-2)', aspectRatio: '1', border: '1px solid var(--ms-line)' }}>
                  {thumb ? <img src={mediaUrl(thumb)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ms-ink-3)', fontSize: 12 }}>{isVideo ? 'Video' : 'File'}</div>}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,8,10,0.82), transparent 55%)' }} />
                  <div style={{ position: 'absolute', top: 8, left: 8, padding: '2px 8px', borderRadius: 999, background: left <= 5 ? 'rgba(212,86,74,0.9)' : 'rgba(8,8,10,0.6)', color: '#fff', fontSize: 10, fontWeight: 700, backdropFilter: 'blur(4px)' }}>
                    {left} day{left === 1 ? '' : 's'} left
                  </div>
                  <div style={{ position: 'absolute', left: 8, right: 8, bottom: 8 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.project_title || 'Shoot'}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => restore(a)} disabled={busy === a.id} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#fff', color: '#0c0c10', fontSize: 11.5, fontWeight: 700 }}><RotateCcw size={12} /> Restore</button>
                      <button onClick={() => purge(a)} disabled={busy === a.id} title="Delete forever" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '7px 9px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'rgba(212,86,74,0.85)', color: '#fff' }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 600, padding: '9px 18px', borderRadius: 999, background: 'var(--ms-ink)', color: 'var(--ms-paper)', fontSize: 13 }}>{toast}</div>}
    </>
  );
}
