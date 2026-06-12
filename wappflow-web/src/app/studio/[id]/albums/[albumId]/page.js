'use client';
/* eslint-disable @next/next/no-img-element -- album picker shows dynamic /uploads thumbs; next/image isn't configured for them */

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, FileText, Download, Loader, Sparkles, X } from 'lucide-react';
import { mediaAPI, mediaUrl } from '../../../../../lib/api';
import NavBar from '../../../../../components/StudioShell';

const SLOTS = { single: 1, 'two-h': 2, 'two-v': 2, three: 3, grid4: 4 };
const LAYOUT_OPTIONS = [['single', 'Single'], ['two-h', '2 across'], ['two-v', '2 stacked'], ['three', '3 across'], ['grid4', 'Grid of 4']];

function PagePreview({ page, activeIndex, ratio, onSlot }) {
  const n = page.slot_count || SLOTS[page.layout_template] || 1;
  const box = (i) => {
    const s = page.slots[i];
    const active = activeIndex === i;
    return (
      <div key={i} onClick={() => onSlot(i)} style={{
        position: 'relative', flex: 1, minWidth: 0, minHeight: 0, borderRadius: 5, cursor: 'pointer',
        background: s?.thumb_url ? `center/cover no-repeat url(${mediaUrl(s.thumb_url)})` : 'var(--surface2)',
        border: active ? '2px solid var(--accent)' : '1px dashed var(--border)',
      }}>
        {!s?.thumb_url && <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 20 }}>+</span>}
      </div>
    );
  };
  const els = Array.from({ length: n }, (_, i) => box(i));
  let inner;
  if (page.layout_template === 'grid4') inner = <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 5, width: '100%', height: '100%' }}>{els}</div>;
  else if (page.layout_template === 'two-v') inner = <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: '100%', height: '100%' }}>{els}</div>;
  else inner = <div style={{ display: 'flex', gap: 5, width: '100%', height: '100%' }}>{els}</div>;
  return <div style={{ width: '100%', aspectRatio: String(ratio), background: 'white', padding: 8, borderRadius: 8, boxShadow: '0 2px 10px rgba(0,0,0,0.12)' }}>{inner}</div>;
}

export default function AlbumEditor() {
  const router = useRouter();
  const { id, albumId } = useParams();
  const [album, setAlbum] = useState(null);
  const [assets, setAssets] = useState([]);
  const [active, setActive] = useState(null); // { pageId, index }
  const [loading, setLoading] = useState(true);
  const [pdf, setPdf] = useState(null); // { status, url }
  const [adding, setAdding] = useState(false);

  const refetch = useCallback(async () => {
    const r = await mediaAPI.getAlbum(albumId);
    setAlbum(r.data);
    if (r.data.pdf_status === 'ready' && r.data.pdf_url) setPdf({ status: 'ready', url: r.data.pdf_url });
    return r.data;
  }, [albumId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login'); return; }
    (async () => {
      try {
        const [, a] = await Promise.all([refetch(), mediaAPI.listAssets(id, { limit: 500 })]);
        setAssets(a.data.assets || []);
      } catch { router.push(`/studio/${id}/albums`); return; }
      setLoading(false);
    })();
  }, [id, albumId]);

  const ratio = album?.spec?.w_mm && album?.spec?.h_mm ? album.spec.w_mm / album.spec.h_mm : 1;

  const persistSlots = async (pageId, slots) => {
    setAlbum(prev => ({ ...prev, pages: prev.pages.map(p => p.id === pageId ? { ...p, slots } : p) }));
    try { await mediaAPI.updateAlbumPage(albumId, pageId, { slots: slots.map(s => ({ asset_id: s.asset_id || null })) }); } catch {}
  };

  const pickPhoto = (asset) => {
    if (!active) return;
    const page = album.pages.find(p => p.id === active.pageId);
    if (!page) return;
    const slots = [...page.slots];
    while (slots.length < (page.slot_count || 1)) slots.push({ asset_id: null });
    slots[active.index] = { asset_id: asset.id, thumb_url: asset.thumb_url };
    persistSlots(page.id, slots);
  };
  const clearActive = () => {
    if (!active) return;
    const page = album.pages.find(p => p.id === active.pageId);
    const slots = [...page.slots]; if (slots[active.index]) slots[active.index] = { asset_id: null };
    persistSlots(page.id, slots);
  };

  const addPage = async (layout_template) => { setAdding(true); try { await mediaAPI.addAlbumPage(albumId, { layout_template }); await refetch(); } finally { setAdding(false); } };
  const changeLayout = async (pageId, layout_template) => { await mediaAPI.updateAlbumPage(albumId, pageId, { layout_template }); setActive(null); await refetch(); };
  const deletePage = async (pageId) => { await mediaAPI.deleteAlbumPage(albumId, pageId); setActive(null); await refetch(); };
  const movePage = async (idx, dir) => {
    const order = album.pages.map(p => p.id);
    const j = idx + dir; if (j < 0 || j >= order.length) return;
    [order[idx], order[j]] = [order[j], order[idx]];
    await mediaAPI.reorderAlbumPages(albumId, order); await refetch();
  };
  const autofill = async () => { try { await mediaAPI.autofillAlbum(albumId, 'keep'); await refetch(); } catch (e) { alert(e.response?.data?.error || 'No keepers yet — mark some in Cull first.'); } };

  const exportPdf = async () => {
    setPdf({ status: 'pending' });
    try {
      await mediaAPI.exportAlbum(albumId);
      let tries = 0;
      const poll = setInterval(async () => {
        tries++;
        const a = await refetch();
        if (a.pdf_status === 'ready') { clearInterval(poll); setPdf({ status: 'ready', url: a.pdf_url }); }
        else if (a.pdf_status === 'failed' || tries > 40) { clearInterval(poll); setPdf({ status: 'failed' }); }
      }, 2000);
    } catch { setPdf({ status: 'failed' }); }
  };

  if (loading) return <NavBar><div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div></NavBar>;

  return (
    <NavBar>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '18px 16px 60px' }}>
        <button onClick={() => router.push(`/studio/${id}/albums`)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
          <ArrowLeft size={15} /> Albums
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{album.title}</h1>
            <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>{album.pages.length} pages · {album.spec?.w_mm}×{album.spec?.h_mm}mm</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={autofill} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} /> Autofill keepers</button>
            {pdf?.status === 'ready'
              ? <a href={mediaUrl(pdf.url)} download style={{ ...primaryBtnSm, display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}><Download size={15} /> Download PDF</a>
              : <button onClick={exportPdf} disabled={pdf?.status === 'pending' || album.pages.length === 0} style={{ ...primaryBtnSm, display: 'flex', alignItems: 'center', gap: 6, opacity: album.pages.length === 0 ? 0.5 : 1 }}>
                  {pdf?.status === 'pending' ? <Loader size={15} className="spin" /> : <FileText size={15} />} {pdf?.status === 'pending' ? 'Building…' : 'Export PDF'}
                </button>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* pages */}
          <div style={{ flex: 1, minWidth: 280 }}>
            {album.pages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '50px 20px', border: '2px dashed var(--border)', borderRadius: 16, color: 'var(--text-muted)', marginBottom: 16 }}>No pages yet — add one below.</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 18 }}>
              {album.pages.map((p, idx) => (
                <div key={p.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
                  <PagePreview page={p} ratio={ratio} activeIndex={active?.pageId === p.id ? active.index : null}
                    onSlot={(i) => setActive({ pageId: p.id, index: i })} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)' }}>#{idx + 1}</span>
                    <select value={p.layout_template} onChange={e => changeLayout(p.id, e.target.value)} style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }}>
                      {LAYOUT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <button onClick={() => movePage(idx, -1)} disabled={idx === 0} style={iconBtn} title="Move up"><ChevronUp size={14} /></button>
                    <button onClick={() => movePage(idx, 1)} disabled={idx === album.pages.length - 1} style={iconBtn} title="Move down"><ChevronDown size={14} /></button>
                    <button onClick={() => deletePage(p.id)} style={{ ...iconBtn, color: '#ef4444' }} title="Delete page"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>

            {/* add page */}
            <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 700 }}>Add page:</span>
              {LAYOUT_OPTIONS.map(([v, l]) => (
                <button key={v} onClick={() => addPage(v)} disabled={adding} style={{ ...ghostBtn, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}><Plus size={13} /> {l}</button>
              ))}
            </div>
          </div>

          {/* photo picker */}
          <aside style={{ width: 300, flexShrink: 0, position: 'sticky', top: 76, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, maxHeight: '78vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Photos</h3>
              {active && <button onClick={clearActive} style={{ ...ghostBtn, fontSize: 11, padding: '4px 9px', display: 'flex', alignItems: 'center', gap: 4 }}><X size={11} /> Clear slot</button>}
            </div>
            <p style={{ fontSize: 11.5, color: active ? 'var(--accent)' : 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
              {active ? 'Now click a photo to place it.' : 'Click a slot on a page, then pick a photo.'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {assets.map(a => (
                <button key={a.id} onClick={() => pickPhoto(a)} disabled={!active} style={{ aspectRatio: '1', borderRadius: 7, overflow: 'hidden', border: 'none', padding: 0, cursor: active ? 'pointer' : 'default', opacity: active ? 1 : 0.65, background: 'var(--surface2)' }}>
                  {a.thumb_url ? <img src={mediaUrl(a.thumb_url)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                </button>
              ))}
            </div>
          </aside>
        </div>
      </div>
      <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </NavBar>
  );
}

const ghostBtn = { padding: '8px 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' };
const primaryBtnSm = { padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--ms-ink)', color: 'var(--ms-paper)', fontWeight: 800, fontSize: 13.5 };
const iconBtn = { width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
