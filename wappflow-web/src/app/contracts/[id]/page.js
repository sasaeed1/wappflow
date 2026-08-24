'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Eye, X, Check, Cloud, Send, Copy, MessageCircle, Mail, Settings, Zap, CreditCard, ShieldCheck, FolderPlus, Sparkles, Wand2, AlertTriangle, FileText, Clock, Users, UserPlus, Bell, Paperclip, Image as ImageIcon, BookMarked, History, RotateCcw } from 'lucide-react';
import { csAPI, mediaUrl } from '../../../lib/api';
import RoomPanel from '@/components/RoomPanel';
import { BLOCK_TYPES, defaultData, BlockView, DocFrame, computeTotals } from '../blocks';
import '../contracts.css';
import { clickable } from '@/lib/a11y';

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
  const [settings, setSettings] = useState({});
  const [selected, setSelected] = useState(null);
  const [addAt, setAddAt] = useState(null);
  const [saved, setSaved] = useState('saved');
  const [preview, setPreview] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showClauses, setShowClauses] = useState(false);
  const [showRoom, setShowRoom] = useState(false);
  const [tplSaved, setTplSaved] = useState(false);
  const [wsLetterhead, setWsLetterhead] = useState(null);
  const [wsDefaults, setWsDefaults] = useState({});
  const first = useRef(true);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) { router.push('/login?next=/contracts'); return; }
    csAPI.get(id).then(r => { setDoc(r.data); setTitle(r.data.title || ''); setBlocks((r.data.blocks || []).map(b => b.id ? b : { ...b, id: uid() })); setTheme(r.data.theme || 'monochrome'); setSettings(r.data.settings || {}); })
      .catch(() => router.push('/contracts'));
    csAPI.getSettings().then(r => { setWsLetterhead(r.data.letterhead_url || null); setWsDefaults(r.data.settings || {}); }).catch(() => {});
  }, [id]);

  // debounced autosave
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setSaved('saving');
    const t = setTimeout(async () => {
      try { await csAPI.update(id, { title, blocks, theme, settings, totals: computeTotals(blocks) }); setSaved('saved'); } catch { setSaved('error'); }
    }, 1100);
    return () => clearTimeout(t);
  }, [title, blocks, theme, settings]); // eslint-disable-line

  const updateBlock = (bid, data) => setBlocks(bs => bs.map(b => (b.id === bid ? { ...b, data } : b)));
  const addBlock = (type) => { const nb = { id: uid(), type, data: defaultData(type) }; setBlocks(bs => { const n = [...bs]; n.splice(addAt ?? n.length, 0, nb); return n; }); setSelected(nb.id); setAddAt(null); };
  const move = (i, dir) => setBlocks(bs => { const n = [...bs]; const j = i + dir; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const del = (bid) => { setBlocks(bs => bs.filter(b => b.id !== bid)); setSelected(null); };
  const saveAsTemplate = async () => { try { await csAPI.createTemplate({ title: title || 'Untitled', type: doc.type, blocks }); setTplSaved(true); setTimeout(() => setTplSaved(false), 2200); } catch {} };

  if (!doc) return <><p style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</p></>;
  const outerBg = theme === 'executive' ? '#080b12' : theme === 'editorial' ? '#efe9dd' : '#eceef2';
  const docLetterhead = (settings.letterhead !== false && wsLetterhead) ? wsLetterhead : null;

  const AddBtn = ({ at }) => (
    <button onClick={() => setAddAt(at)} title="Add block" style={{ alignSelf: 'center', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 999, border: '1px dashed var(--cs-line)', background: 'transparent', color: 'var(--cs-ink-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: 0.7 }}>
      <Plus size={13} /> Add block
    </button>
  );

  return (
    <>
      {/* builder toolbar */}
      <div style={{ position: 'sticky', top: 58, zIndex: 50, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/contracts')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}><ArrowLeft size={15} /> Back</button>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Untitled document" style={{ flex: 1, minWidth: 160, maxWidth: 420, border: '1px solid transparent', borderRadius: 8, padding: '6px 10px', fontSize: 15, fontWeight: 700, color: 'var(--text)', background: 'transparent', outline: 'none' }} />
        <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          {THEMES.map(([t, l]) => <button key={t} onClick={() => setTheme(t)} style={{ padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', background: theme === t ? 'var(--accent)' : 'transparent', color: theme === t ? '#fff' : 'var(--text-muted)', fontSize: 12, fontWeight: theme === t ? 700 : 500 }}>{l}</button>)}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 70 }}>
          {saved === 'saving' ? <><Cloud size={13} /> Saving…</> : saved === 'error' ? <span style={{ color: '#ef4444' }}>Save failed</span> : <><Check size={13} /> Saved</>}
        </span>
        <button onClick={() => setShowAI(true)} title="AI assistant" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 9, border: '1px solid transparent', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><Sparkles size={14} /> AI</button>
        <button onClick={() => setShowPeople(true)} title="Signers & activity" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Users size={14} /></button>
        <button onClick={() => setShowRoom(true)} title="Team room — discuss & call" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><MessageCircle size={14} /></button>
        <button onClick={() => setShowVersions(true)} title="Version history" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><History size={14} /></button>
        <button onClick={() => setShowClauses(true)} title="Insert a saved clause" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>¶</button>
        <button onClick={saveAsTemplate} title="Save as template" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: tplSaved ? '#10b981' : 'transparent', color: tplSaved ? '#fff' : 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{tplSaved ? <><Check size={14} /> Saved</> : <BookMarked size={14} />}</button>
        <button onClick={() => setShowSettings(true)} title="Automations & settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Settings size={14} /></button>
        <button onClick={() => setPreview(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Eye size={14} /> Preview</button>
        <button onClick={() => setShowSend(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}><Send size={14} /> Send</button>
      </div>

      {/* canvas */}
      <div style={{ background: outerBg, minHeight: 'calc(100vh - 110px)', padding: 'clamp(20px,4vw,48px) 16px 140px' }}>
        <div className={`cs-doc cs-theme-${theme}`}>
          <div className="cs-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <DocFrame letterhead={docLetterhead} upload={settings.upload} />
            {blocks.length === 0 && !settings.upload && (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <p style={{ color: 'var(--cs-ink-2)', fontSize: 14, marginBottom: 16 }}>An empty canvas. Add your first block.</p>
                <AddBtn at={0} />
              </div>
            )}
            {blocks.map((b, i) => (
              <div key={b.id}>
                <div className={`cs-blockwrap ${selected === b.id ? 'is-sel' : ''}`} {...clickable(() => setSelected(b.id))}>
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
          <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 560, maxHeight: '82vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: '0 30px 80px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Add a block</h3>
              <button aria-label="Close" onClick={() => setAddAt(null)} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={17} /></button>
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
                <DocFrame letterhead={docLetterhead} upload={settings.upload} />
                {blocks.map(b => <BlockView key={b.id} block={b} />)}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSend && <SendModal id={id} doc={doc} hasLead={!!doc.lead_id} defaultExpire={wsDefaults.default_expire_days || 0} onClose={() => setShowSend(false)} />}
      {showSettings && <SettingsModal id={id} settings={settings} setSettings={setSettings} hasLead={!!doc.lead_id} wsLetterhead={wsLetterhead} onClose={() => setShowSettings(false)} />}
      {showAI && <AIModal id={id} type={doc.type} blocks={blocks} setBlocks={setBlocks} selectedBlock={blocks.find(b => b.id === selected)} updateBlock={updateBlock} onClose={() => setShowAI(false)} />}
      {showPeople && <PeopleModal id={id} onClose={() => setShowPeople(false)} />}
      {showRoom && (
        <div onClick={() => setShowRoom(false)} style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(8,8,12,0.55)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, marginTop: 64 }}>
            <RoomPanel type="contract" id={id} title={title} />
          </div>
        </div>
      )}
      {showVersions && <VersionsModal id={id} onClose={() => setShowVersions(false)} />}
      {showClauses && <ClausePickerModal onClose={() => setShowClauses(false)} onInsert={(c) => { setBlocks(bs => [...bs, { id: uid(), type: 'heading', data: { text: c.title, level: 2 } }, { id: uid(), type: 'text', data: { text: c.body } }]); setShowClauses(false); }} />}
    </>
  );
}

function ClausePickerModal({ onClose, onInsert }) {
  const [clauses, setClauses] = useState(null);
  useEffect(() => { csAPI.clauses().then(r => setClauses(r.data.clauses || [])).catch(() => setClauses([])); }, []);
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 460, maxHeight: '80vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Insert a clause</h3>
          <button aria-label="Close" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={17} /></button>
        </div>
        {!clauses ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
          : clauses.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No clauses yet — add them in Contracts Studio → Settings → Clause library.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clauses.map(c => (
                <button key={c.id} onClick={() => onInsert(c)} style={{ textAlign: 'left', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer' }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.body}</div>
                </button>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

function VersionsModal({ id, onClose }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [viewing, setViewing] = useState(null);
  useEffect(() => { csAPI.versions(id).then(r => setData(r.data)).catch(() => setData({ versions: [] })); }, []); // eslint-disable-line
  const viewDiff = async (vid) => { try { const r = await csAPI.getVersion(id, vid); setViewing(r.data); } catch {} };
  const restore = async (vid) => {
    if (!window.confirm('Restore this version? Your current content will be replaced (sent copies are unaffected).')) return;
    setBusy(vid);
    try { await csAPI.restoreVersion(id, vid); window.location.reload(); } catch { setBusy(''); }
  };
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 460, maxHeight: '82vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><History size={18} style={{ color: 'var(--accent)' }} /> Version history</h3>
          <button aria-label="Close" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={17} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 14px' }}>A snapshot is saved every time you send. Restore brings back that content.</p>
        {!data ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
          : data.versions.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No snapshots yet — they’re created each time you send this document.</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.versions.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', border: '1px solid var(--border)', borderRadius: 11, background: 'var(--bg)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{v.label || `v${v.version}`}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{new Date(v.created_at + 'Z').toLocaleString()}{v.author ? ` · ${v.author}` : ''}</div>
                  </div>
                  <button onClick={() => viewDiff(v.id)} style={{ padding: '7px 11px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', fontSize: 12.5, fontWeight: 600 }}>Compare</button>
                  <button onClick={() => restore(v.id)} disabled={busy === v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text)', fontSize: 12.5, fontWeight: 600 }}><RotateCcw size={13} /> {busy === v.id ? 'Restoring…' : 'Restore'}</button>
                </div>
              ))}
            </div>
          )}
        {viewing && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>{viewing.version.label || `v${viewing.version.version}`} vs current</span>
              <button onClick={() => setViewing(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12.5 }}>Close</button>
            </div>
            <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>This version</div><pre style={diffPre}>{viewing.version.text || '(empty)'}</pre></div>
              <div><div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 4 }}>Current</div><pre style={diffPre}>{viewing.current_text || '(empty)'}</pre></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
const diffPre = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.5, color: 'var(--text)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, maxHeight: 240, overflowY: 'auto', margin: 0, fontFamily: 'inherit' };

const SIGNER_ROLES = [['client', 'Client'], ['company', 'Company'], ['witness', 'Witness'], ['cosigner', 'Co-signer']];
const EVENT_LABEL = {
  created: 'Created', sent: 'Sent', viewed: 'Viewed by client', signed: 'Signed', reminded: 'Reminder sent',
  declined: 'Declined', approval_requested: 'Approval requested', approved: 'Approved', rejected: 'Rejected',
  automation: 'Automations ran', ai_assist: 'AI assist used', client_question: 'Client asked a question', expired: 'Expired',
};
const SST = { pending: ['#f59e0b', 'Pending'], viewed: ['#0ea5e9', 'Viewed'], signed: ['#10b981', 'Signed'], declined: ['#ef4444', 'Declined'] };

function PeopleModal({ id, onClose }) {
  const [data, setData] = useState(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ role: 'cosigner', name: '', email: '', phone: '' });
  const [remindState, setRemindState] = useState('');
  const load = () => csAPI.get(id).then(r => setData(r.data)).catch(() => setData({ signers: [], events: [] }));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const signers = data?.signers || [];
  const events = (data?.events || []).slice().reverse();
  const status = data?.status;
  const canRemind = ['sent', 'viewed', 'pending_approval'].includes(status);

  const addSigner = async () => { if (!draft.name && !draft.email && !draft.phone) return; await csAPI.addSigner(id, draft); setDraft({ role: 'cosigner', name: '', email: '', phone: '' }); setAdding(false); load(); };
  const removeSigner = async (sid) => { await csAPI.removeSigner(sid); load(); };
  const remind = async () => { setRemindState('working'); try { await csAPI.remind(id, ['whatsapp', 'email']); setRemindState('done'); setTimeout(() => setRemindState(''), 2500); load(); } catch { setRemindState('err'); } };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Users size={18} style={{ color: 'var(--accent)' }} /> Signers & activity</h3>
          <button aria-label="Close" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={17} /></button>
        </div>

        {!data ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p> : (
          <>
            {data.settings?.signed_pdf && (
              <a href={mediaUrl(data.settings.signed_pdf)} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', marginBottom: 16, padding: '11px', borderRadius: 11, background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none' }}><FileText size={15} /> Download signed PDF &amp; certificate</a>
            )}
            {canRemind && (
              <button onClick={remind} disabled={remindState === 'working'} style={{ width: '100%', marginBottom: 16, padding: '11px', borderRadius: 11, border: 'none', cursor: 'pointer', background: remindState === 'done' ? '#10b981' : 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {remindState === 'done' ? <><Check size={15} /> Reminder sent</> : <><Bell size={15} /> {remindState === 'working' ? 'Sending…' : 'Send a reminder to pending signers'}</>}
              </button>
            )}

            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '4px 0 8px' }}>Signers ({signers.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {signers.map(s => { const [c, l] = SST[s.status] || ['#64748b', s.status]; return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px', border: '1px solid var(--border)', borderRadius: 11, background: 'var(--bg)' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{(s.name || '?')[0].toUpperCase()}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{s.name || 'Unnamed'} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'capitalize' }}>· {s.role}</span></div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email || s.phone || 'No contact'}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: c, background: `${c}1f`, padding: '2px 9px', borderRadius: 999, flexShrink: 0 }}>{l}</span>
                  {s.status === 'pending' && <button onClick={() => removeSigner(s.id)} title="Remove" style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}><Trash2 size={13} /></button>}
                </div>
              ); })}
            </div>

            {adding ? (
              <div style={{ marginTop: 10, padding: 12, border: '1px dashed var(--border)', borderRadius: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Sel value={draft.role} onChange={e => setDraft(d => ({ ...d, role: e.target.value }))} style={{ flex: '0 0 110px' }}>{SIGNER_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
                  <input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Name" style={miniInp} />
                </div>
                <input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} placeholder="Email" style={miniInp} />
                <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} placeholder="Phone (for WhatsApp)" style={miniInp} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={addSigner} style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13 }}>Add signer</button>
                  <button onClick={() => setAdding(false)} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', fontSize: 13 }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 10, border: '1px dashed var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><UserPlus size={15} /> Add a signer</button>
            )}

            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '20px 0 8px' }}>Activity</div>
            {events.length === 0 ? <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>No activity yet.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderLeft: '2px solid var(--border)', paddingLeft: 16, marginLeft: 4 }}>
                {events.map((e, i) => (
                  <div key={i} style={{ position: 'relative', paddingBottom: 14 }}>
                    <span style={{ position: 'absolute', left: -21, top: 3, width: 8, height: 8, borderRadius: 999, background: 'var(--accent)' }} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{EVENT_LABEL[e.type] || e.type}{e.actor === 'client' ? '' : ''}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{new Date(e.created_at + 'Z').toLocaleString()}{e.ip ? ` · ${e.ip}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
const miniInp = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' };

function AIModal({ id, type, blocks, setBlocks, selectedBlock, updateBlock, onClose }) {
  const [tab, setTab] = useState('assist'); // assist | draft
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState('');
  const [out, setOut] = useState(null);
  const [err, setErr] = useState('');
  const canImprove = selectedBlock && typeof (selectedBlock.data || {}).text === 'string';

  const run = async (action) => {
    setErr(''); setOut(null); setBusy(action);
    try {
      if (action === 'draft') {
        const r = await csAPI.aiAssist({ action: 'draft', type, instruction: brief });
        const nb = (r.data.blocks || []).map(b => ({ ...b, id: uid() }));
        if (!nb.length) throw new Error('The AI did not return any blocks — try a more specific brief.');
        setBlocks(bs => [...bs, ...nb]); setOut({ kind: 'draft', count: nb.length });
      } else if (action === 'improve') {
        const r = await csAPI.aiAssist({ action: 'improve', doc_id: id, text: selectedBlock.data.text });
        setOut({ kind: 'improve', text: r.data.result });
      } else {
        const r = await csAPI.aiAssist({ action, doc_id: id });
        setOut({ kind: action, text: r.data.result });
      }
    } catch (e) { setErr(e?.response?.data?.error || e.message || 'AI request failed'); }
    finally { setBusy(''); }
  };
  const applyImprove = () => { updateBlock(selectedBlock.id, { ...selectedBlock.data, text: out.text }); setOut(null); onClose(); };

  const Act = ({ icon: Icon, label, sub, action, disabled }) => (
    <button onClick={() => run(action)} disabled={!!busy || disabled} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 14px', borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'left', border: '1px solid var(--border)', background: 'var(--bg)', opacity: disabled ? 0.5 : 1 }}>
      <Icon size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{label}</div><div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{sub}</div></div>
      {busy === action && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Working…</span>}
    </button>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Sparkles size={18} style={{ color: 'var(--accent)' }} /> AI assistant</h3>
          <button aria-label="Close" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={17} /></button>
        </div>
        <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)', marginBottom: 16 }}>
          {[['assist', 'Assist'], ['draft', 'Draft new']].map(([t, l]) => <button key={t} onClick={() => { setTab(t); setOut(null); setErr(''); }} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', background: tab === t ? 'var(--accent)' : 'transparent', color: tab === t ? '#fff' : 'var(--text-muted)', fontSize: 12.5, fontWeight: tab === t ? 700 : 500 }}>{l}</button>)}
        </div>

        {tab === 'assist' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Act icon={Wand2} label="Improve the selected block" sub={canImprove ? 'Polish the wording of the block you clicked' : 'Select a text block first'} action="improve" disabled={!canImprove} />
            <Act icon={FileText} label="Summarize this document" sub="A quick owner-facing recap" action="summarize" />
            <Act icon={AlertTriangle} label="Flag risks & gaps" sub="Missing clauses, weak terms (not legal advice)" action="risks" />
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>Describe the document and AI will draft the blocks for you — appended to your canvas.</p>
            <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={4} placeholder={`e.g. A wedding photography contract for a 2-day event, 2 shooters, $4,500, 50% deposit, cancellation terms`} style={{ width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
            <button onClick={() => run('draft')} disabled={!!busy || !brief.trim()} style={{ width: '100%', marginTop: 12, padding: '13px', borderRadius: 11, border: 'none', cursor: brief.trim() ? 'pointer' : 'not-allowed', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff', fontWeight: 800, fontSize: 15, opacity: brief.trim() ? 1 : 0.6, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Sparkles size={15} /> {busy === 'draft' ? 'Drafting…' : 'Draft document'}</button>
          </div>
        )}

        {err && <p style={{ color: '#ef4444', fontSize: 13, margin: '14px 0 0' }}>{err}</p>}
        {out && out.kind === 'draft' && <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>✓ Added {out.count} blocks to your canvas.</div>}
        {out && out.kind === 'improve' && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Suggested rewrite</div>
            <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{out.text}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={applyImprove} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 14 }}>Replace block</button>
              <button onClick={() => setOut(null)} style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, fontSize: 14 }}>Discard</button>
            </div>
          </div>
        )}
        {out && (out.kind === 'summarize' || out.kind === 'risks') && (
          <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 10, background: 'var(--bg)', border: '1px solid var(--border)', fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{out.text}</div>
        )}
      </div>
    </div>
  );
}

const STAGES = ['New', 'Contacted', 'Interested', 'Negotiating', 'Closed - Won', 'Closed - Lost'];
const PROJECT_TYPES = ['general', 'wedding', 'event', 'real_estate', 'commercial', 'portrait', 'product'];
const PAY_TYPES = [['deposit', 'Deposit'], ['full', 'Full payment'], ['milestone', 'Milestones'], ['plan', 'Payment plan'], ['retainer', 'Retainer']];

function Toggle({ on, onClick }) {
  return <button onClick={onClick} style={{ width: 40, height: 23, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? 'var(--accent)' : 'var(--border)', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
    <span style={{ position: 'absolute', top: 2, left: on ? 19 : 2, width: 19, height: 19, borderRadius: 999, background: '#fff', transition: 'left .15s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} /></button>;
}
const Sel = (props) => <select {...props} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, outline: 'none', ...props.style }} />;

const SRow = ({ icon: Icon, title, sub, on, toggle, children, disabled }) => (
  <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)', opacity: disabled ? 0.5 : 1 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Icon size={17} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{title}</div><div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{sub}</div></div>
      {toggle !== undefined && <Toggle on={on} onClick={disabled ? undefined : toggle} />}
    </div>
    {on && children && <div style={{ marginTop: 12, marginLeft: 29, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>{children}</div>}
  </div>
);

function SettingsModal({ id, settings, setSettings, hasLead, wsLetterhead, onClose }) {
  const a = settings.automations || {};
  const pay = settings.payment || {};
  const setA = (patch) => setSettings(s => ({ ...s, automations: { ...(s.automations || {}), ...patch } }));
  const setPay = (patch) => setSettings(s => ({ ...s, payment: { ...(s.payment || {}), ...patch } }));
  const [approve, setApprove] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const doApprove = async () => { setApprove('working'); try { await csAPI.decideApproval(id, { decision: 'approved' }); setApprove('done'); } catch { setApprove('err'); } };
  const onPickFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { const fd = new FormData(); fd.append('file', f); const r = await csAPI.uploadDocFile(id, fd); setSettings(s => ({ ...s, upload: r.data.upload })); }
    catch {} finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const removeFile = async () => { await csAPI.removeDocFile(id); setSettings(s => { const n = { ...s }; delete n.upload; return n; }); };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Automations & settings</h3>
          <button aria-label="Close" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={17} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 8px' }}>What happens the moment this document is signed — the contract acts on the relationship.</p>

        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '14px 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={12} /> Document</div>
        <SRow icon={Paperclip} title="Attach a file to sign" sub={settings.upload ? settings.upload.filename : 'Upload a PDF or image and send it for signing'}>
        </SRow>
        <div style={{ marginTop: -6, marginBottom: 4, marginLeft: 29, display: 'flex', gap: 8 }}>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" onChange={onPickFile} style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg)', color: 'var(--text)', fontSize: 12.5, fontWeight: 600 }}>{uploading ? 'Uploading…' : settings.upload ? 'Replace file' : 'Upload file'}</button>
          {settings.upload && <button onClick={removeFile} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: '#ef4444', fontSize: 12.5, fontWeight: 600 }}>Remove</button>}
        </div>
        <SRow icon={ImageIcon} title="Show letterhead" sub={wsLetterhead ? 'Display your workspace letterhead on this document' : 'Upload a letterhead in Contracts Studio settings first'} on={settings.letterhead !== false && !!wsLetterhead} toggle={() => setSettings(s => ({ ...s, letterhead: s.letterhead === false ? true : false }))} disabled={!wsLetterhead} />

        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '18px 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={12} /> When signed</div>
        <SRow icon={Zap} title="Move the client down the pipeline" sub={hasLead ? 'Update the linked lead’s stage automatically' : 'Link a client to enable'} on={!!a.move_pipeline} toggle={() => setA({ move_pipeline: !a.move_pipeline })} disabled={!hasLead}>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Move to</span>
          <Sel value={a.pipeline_stage || 'Closed - Won'} onChange={e => setA({ pipeline_stage: e.target.value })}>{STAGES.map(s => <option key={s} value={s}>{s}</option>)}</Sel>
        </SRow>
        <SRow icon={CreditCard} title="Create an invoice" sub="Bill the client’s selected packages & add-ons" on={!!a.create_invoice} toggle={() => setA({ create_invoice: !a.create_invoice })} />
        <SRow icon={FolderPlus} title="Create a Media Studio project" sub="Spin up the project so delivery is ready" on={!!a.create_project} toggle={() => setA({ create_project: !a.create_project })}>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Type</span>
          <Sel value={a.project_type || 'general'} onChange={e => setA({ project_type: e.target.value })}>{PROJECT_TYPES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</Sel>
        </SRow>

        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '18px 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}><CreditCard size={12} /> Payment</div>
        <SRow icon={CreditCard} title="Collect payment" sub="How the client pays once they accept" on={!!pay.enabled} toggle={() => setPay({ enabled: !pay.enabled })}>
          <Sel value={pay.type || 'deposit'} onChange={e => setPay({ type: e.target.value })}>{PAY_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel>
          {(pay.type || 'deposit') === 'deposit' && <>
            <Sel value={pay.deposit_type || 'percent'} onChange={e => setPay({ deposit_type: e.target.value })}><option value="percent">%</option><option value="fixed">Fixed</option></Sel>
            <input type="number" value={pay.deposit_value ?? 50} onChange={e => setPay({ deposit_value: e.target.value })} style={{ width: 80, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, outline: 'none' }} />
          </>}
        </SRow>

        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '18px 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}><ShieldCheck size={12} /> Approval</div>
        <SRow icon={ShieldCheck} title="Require internal approval before sending" sub="Lock sending until someone signs off" on={!!settings.require_approval} toggle={() => setSettings(s => ({ ...s, require_approval: !s.require_approval }))}>
          {approve === 'done' ? <span style={{ fontSize: 12.5, color: '#10b981', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Check size={14} /> Approved — ready to send</span>
            : <button onClick={doApprove} disabled={approve === 'working'} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: 12.5, fontWeight: 700 }}>{approve === 'working' ? 'Approving…' : 'Approve now'}</button>}
        </SRow>

        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '18px 0 2px', display: 'flex', alignItems: 'center', gap: 6 }}><Bell size={12} /> Reminders</div>
        <SRow icon={Bell} title="Auto-remind unsigned signers" sub="Nudge over WhatsApp & email on a schedule until they sign" on={!!(settings.auto_remind && settings.auto_remind.enabled)} toggle={() => setSettings(s => ({ ...s, auto_remind: { ...(s.auto_remind || {}), enabled: !(s.auto_remind && s.auto_remind.enabled) } }))}>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Every</span>
          <Sel value={(settings.auto_remind && settings.auto_remind.every_days) || 3} onChange={e => setSettings(s => ({ ...s, auto_remind: { ...(s.auto_remind || {}), every_days: Number(e.target.value) } }))}>{[2, 3, 5, 7].map(n => <option key={n} value={n}>{n}</option>)}</Sel>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>days · up to</span>
          <Sel value={(settings.auto_remind && settings.auto_remind.max) || 2} onChange={e => setSettings(s => ({ ...s, auto_remind: { ...(s.auto_remind || {}), max: Number(e.target.value) } }))}>{[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}</Sel>
          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>times</span>
        </SRow>

        <button onClick={onClose} style={{ width: '100%', marginTop: 18, padding: '12px', borderRadius: 11, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: 14.5 }}>Done</button>
      </div>
    </div>
  );
}

function SendModal({ id, doc, hasLead, defaultExpire = 0, onClose }) {
  const [channels, setChannels] = useState(hasLead ? ['whatsapp', 'email'] : []);
  const [expireDays, setExpireDays] = useState(defaultExpire);
  const [phase, setPhase] = useState('compose'); // compose | sending | sent
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const toggle = (c) => setChannels(s => s.includes(c) ? s.filter(x => x !== c) : [...s, c]);
  const send = async () => {
    setErr(''); setPhase('sending');
    try { const r = await csAPI.send(id, channels, expireDays); setResult(r.data); setPhase('sent'); }
    catch (e) { setErr(e?.response?.data?.error || e.message || 'Could not send'); setPhase('compose'); }
  };
  const link = result?.share_url || '';
  const copy = () => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  const Chan = ({ id: c, icon: Icon, label, sub }) => (
    <button onClick={() => toggle(c)} disabled={!hasLead && c !== 'link'} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 14px', borderRadius: 12, cursor: hasLead ? 'pointer' : 'not-allowed', textAlign: 'left',
      border: `1.5px solid ${channels.includes(c) ? 'var(--accent)' : 'var(--border)'}`, background: channels.includes(c) ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--bg)', opacity: !hasLead ? 0.5 : 1 }}>
      <Icon size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{label}</div><div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{sub}</div></div>
      <span style={{ width: 19, height: 19, borderRadius: 6, border: `1.5px solid ${channels.includes(c) ? 'var(--accent)' : 'var(--border)'}`, background: channels.includes(c) ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{channels.includes(c) && <Check size={13} color="#fff" />}</span>
    </button>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(8,8,12,0.6)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} className="r-modal" style={{ width: '100%', maxWidth: 460, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 22, boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        {phase !== 'sent' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Send document</h3>
              <button aria-label="Close" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={17} /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>{doc.title || 'Untitled'} — deliver to the client and generate a secure signing link.</p>
            {!hasLead && <div style={{ padding: '10px 12px', borderRadius: 9, background: 'color-mix(in srgb, #f59e0b 14%, transparent)', border: '1px solid color-mix(in srgb, #f59e0b 40%, transparent)', fontSize: 12.5, color: 'var(--text)', marginBottom: 14 }}>No client linked — you’ll still get a shareable link to send manually.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <Chan id="whatsapp" icon={MessageCircle} label="WhatsApp" sub={hasLead ? 'Send to the linked client’s number' : 'Requires a linked client'} />
              <Chan id="email" icon={Mail} label="Email" sub={hasLead ? 'Send to the linked client’s email' : 'Requires a linked client'} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <Clock size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>Link expires</span>
              <Sel value={expireDays} onChange={e => setExpireDays(Number(e.target.value))}>
                <option value={0}>Never</option><option value={3}>In 3 days</option><option value={7}>In 7 days</option><option value={14}>In 14 days</option><option value={30}>In 30 days</option>
              </Sel>
            </div>
            {err && <p style={{ color: '#ef4444', fontSize: 13, margin: '12px 0 0' }}>{err}</p>}
            <button onClick={send} disabled={phase === 'sending'} style={{ width: '100%', marginTop: 18, padding: '13px', borderRadius: 11, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontWeight: 800, fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Send size={15} /> {phase === 'sending' ? 'Sending…' : channels.length ? `Send & get link` : 'Generate link only'}
            </button>
          </>
        ) : (
          <>
            {(() => {
              const dv = result?.delivery || {};
              const okList = Object.entries(dv).filter(([, v]) => v === 'sent').map(([k]) => k);
              const issues = Object.entries(dv).filter(([, v]) => v !== 'sent');
              return (
                <div style={{ textAlign: 'center', marginBottom: 6 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 999, background: '#10b981', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}><Check size={24} color="#fff" /></div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{okList.length ? 'Sent' : 'Link ready'}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{okList.length ? `Delivered via ${okList.join(' & ')}.` : 'Share this secure link with your client.'}</p>
                  {issues.length > 0 && <p style={{ fontSize: 12, color: '#f59e0b', margin: '6px 0 0' }}>{issues.map(([k, v]) => `${k}: ${v.replace('_', ' ')}`).join(' · ')}</p>}
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <input readOnly value={link} style={{ flex: 1, padding: '11px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12.5, outline: 'none' }} />
              <button onClick={copy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: copied ? '#10b981' : 'var(--accent)', color: '#fff', fontWeight: 700, fontSize: 13 }}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <button onClick={onClose} style={{ width: '100%', marginTop: 14, padding: '12px', borderRadius: 11, border: '1px solid var(--border)', cursor: 'pointer', background: 'transparent', color: 'var(--text)', fontWeight: 600, fontSize: 14 }}>Done</button>
          </>
        )}
      </div>
    </div>
  );
}

const Ctl = ({ children, onClick, danger }) => (
  <button onClick={onClick} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--cs-line)', background: 'var(--cs-bg)', color: danger ? '#ef4444' : 'var(--cs-ink-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</button>
);
