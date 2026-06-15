'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Eye, X, Check, Cloud } from 'lucide-react';
import { csAPI } from '../../../lib/api';
import ContractsStudioShell from '../../../components/ContractsStudioShell';
import { BLOCK_TYPES, defaultData, BlockView, computeTotals } from '../blocks';
import '../contracts.css';

const uid = () => Math.random().toString(36).slice(2, 10);
const THEMES = [['monochrome', 'Monochrome'], ['editorial', 'Editorial'], ['executive', 'Executive']];
const GROUPS = ['Basic', 'Media', 'Pricing', 'Content', 'Action'];

export default function BuilderPage() {
  const router = useRouter();
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [theme, setTheme] = useState('monochrome');
  const [selected, setSelected] = useState(null);
  const [addAt, setAddAt] = useState(null);
  const [saved, setSaved] = useState('saved');
  const [preview, setPreview] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/contracts'); return; }
    csAPI.get(id).then(r => { setDoc(r.data); setTitle(r.data.title || ''); setBlocks((r.data.blocks || []).map(b => b.id ? b : { ...b, id: uid() })); setTheme(r.data.theme || 'monochrome'); })
      .catch(() => router.push('/contracts'));
  }, [id]);

  // debounced autosave
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved('saving');
    const t = setTimeout(async () => {
      try { await csAPI.update(id, { title, blocks, theme, totals: computeTotals(blocks) }); setSaved('saved'); } catch { setSaved('error'); }
    }, 1100);
    return () => clearTimeout(t);
  }, [title, blocks, theme]); // eslint-disable-line

  const updateBlock = (bid, data) => setBlocks(bs => bs.map(b => (b.id === bid ? { ...b, data } : b)));
  const addBlock = (type) => { const nb = { id: uid(), type, data: defaultData(type) }; setBlocks(bs => { const n = [...bs]; n.splice(addAt ?? n.length, 0, nb); return n; }); setSelected(nb.id); setAddAt(null); };
  const move = (i, dir) => setBlocks(bs => { const n = [...bs]; const j = i + dir; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const del = (bid) => { setBlocks(bs => bs.filter(b => b.id !== bid)); setSelected(null); };

  if (!doc) return <ContractsStudioShell><p style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</p></ContractsStudioShell>;
  const outerBg = theme === 'executive' ? '#080b12' : theme === 'editorial' ? '#efe9dd' : '#eceef2';

  const AddBtn = ({ at }) => (
    <button onClick={() => setAddAt(at)} title="Add block" style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, border: '1px dashed var(--cs-line)', background: 'transparent', color: 'var(--cs-ink-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: 0.7 }}>
      <Plus size={13} /> Add block
    </button>
  );

  return (
    <ContractsStudioShell>
      {/* builder toolbar */}
      <div style={{ position: 'sticky', top: 58, zIndex: 50, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/contracts')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}><ArrowLeft size={15} /> Back</button>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Untitled document" style={{ flex: 1, minWidth: 160, maxWidth: 420, border: '1px solid transparent', borderRadius: 8, padding: '6px 10px', fontSize: 15, fontWeight: 700, color: 'var(--text)', background: 'transparent', outline: 'none' }} onFocus={e => e.target.style.borderColor = 'var(--border)'} onBlur={e => e.target.style.borderColor = 'transparent'} />
        <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {THEMES.map(([t, l]) => <button key={t} onClick={() => setTheme(t)} style={{ padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', background: theme === t ? 'var(--accent)' : 'transparent', color: theme === t ? '#fff' : 'var(--text-muted)', fontSize: 12, fontWeight: theme === t ? 700 : 500 }}>{l}</button>)}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 70 }}>
          {saved === 'saving' ? <><Cloud size={13} /> Saving…</> : saved === 'error' ? <span style={{ color: '#ef4444' }}>Save failed</span> : <><Check size={13} /> Saved</>}
        </span>
        <button onClick={() => setPreview(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Eye size={14} /> Preview</button>
      </div>

      {/* canvas */}
      <div style={{ background: outerBg, minHeight: 'calc(100vh - 110px)', padding: 'clamp(20px,4vw,48px) 16px 140px' }}>
        <div className={`cs-doc cs-theme-${theme}`}>
          <div className="cs-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {blocks.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <p style={{ color: 'var(--cs-ink-2)', fontSize: 14, marginBottom: 16 }}>An empty canvas. Add your first block.</p>
                <AddBtn at={0} />
              </div>
            )}
            {blocks.map((b, i) => (
              <div key={b.id}>
                <div className={`cs-blockwrap ${selected === b.id ? 'is-sel' : ''}`} onClick={() => setSelected(b.id)}>
                  <div className="cs-block-ctl">
                    <Ctl onClick={(e) => { e.stopPropagation(); move(i, -1); }}><ChevronUp size={13} /></Ctl>
                    <Ctl onClick={(e) => { e.stopPropagation(); move(i, 1); }}><ChevronDown size={13} /></Ctl>
                    <Ctl onClick={(e) => { e.stopPropagation(); del(b.id); }} danger><Trash2 size={12} /></Ctl>
                  </div>
                  <BlockView block={b} editing onChange={(data) => updateBlock(b.id, data)} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}><AddBtn at={i + 1} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* block palette */}
      {addAt != null && (
        <div onClick={() => setAddAt(null)} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(8,8,12,0.55)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '82vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: '0 30px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Add a block</h3>
              <button onClick={() => setAddAt(null)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={17} /></button>
            </div>
            {GROUPS.map(g => (
              <div key={g} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{g}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 8 }}>
                  {BLOCK_TYPES.filter(b => b.group === g).map(b => (
                    <button key={b.type} onClick={() => addBlock(b.type)} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                      <b.icon size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} /> {b.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* live preview (view mode — exactly what the client will see) */}
      {preview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: outerBg, overflowY: 'auto' }}>
          <button onClick={() => setPreview(false)} style={{ position: 'fixed', top: 16, right: 16, zIndex: 510, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', background: 'rgba(255,255,255,0.92)', color: '#111', fontWeight: 600, fontSize: 13, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}><X size={15} /> Exit preview</button>
          <div style={{ padding: 'clamp(24px,5vw,60px) 16px 80px' }}>
            <div className={`cs-doc cs-theme-${theme}`}>
              <div className="cs-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {blocks.map(b => <BlockView key={b.id} block={b} />)}
              </div>
            </div>
          </div>
        </div>
      )}
    </ContractsStudioShell>
  );
}

const Ctl = ({ children, onClick, danger }) => (
  <button onClick={onClick} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--cs-line)', background: 'var(--cs-bg)', color: danger ? '#ef4444' : 'var(--cs-ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</button>
);
