'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sparkles, X, Send, Loader } from 'lucide-react';
import { mediaAPI } from '../lib/api';
import { PRESETS } from '../app/studio/presets';

const QUICK = [
  'Analyze this shoot',
  'Which photos are weakest?',
  'What should I deliver next?',
  'Summarize client feedback',
];

// Studio Copilot — a control-first assistant. It analyzes real shoot data and
// answers questions; it can SUGGEST actions which render as buttons here.
// Nothing happens until the photographer clicks.
export default function StudioCopilot() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]); // { role, content, actions? }
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const projectId = (pathname || '').match(/^\/studio\/([^/]+)/)?.[1] || null;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);

  const send = async (text) => {
    const message = (text || input).trim();
    if (!message || busy) return;
    setInput('');
    setMsgs(m => [...m, { role: 'user', content: message }]);
    setBusy(true);
    try {
      const res = await mediaAPI.copilot({
        message,
        project_id: projectId,
        history: msgs.slice(-6).map(({ role, content }) => ({ role, content })),
        presets: PRESETS.map(p => p.id),
      });
      setMsgs(m => [...m, { role: 'assistant', content: res.data.reply, actions: res.data.actions || [] }]);
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: e.response?.data?.error || 'Something went wrong — is an AI provider key configured on the server?', actions: [] }]);
    }
    setBusy(false);
  };

  const runAction = async (a) => {
    if (!projectId && a.type !== 'navigate') return;
    try {
      if (a.type === 'navigate') {
        router.push(`/studio/${projectId || ''}${a.to === 'project' || !projectId ? '' : '/' + a.to}`);
        setOpen(false);
      } else if (a.type === 'create_gallery_from_keepers') {
        await mediaAPI.createGalleryFromCull(projectId, { decision: 'keep' });
        setMsgs(m => [...m, { role: 'assistant', content: 'Done — gallery created from your keepers. It’s on the shoot page, ready to publish.', actions: [{ type: 'navigate', label: 'Open shoot', to: 'project' }] }]);
      } else if (a.type === 'preset_keepers') {
        const preset = PRESETS.find(p => p.id === a.preset);
        if (!preset) return;
        const keepers = (await mediaAPI.listAssets(projectId, { decision: 'keep', limit: 500 })).data.assets || [];
        if (!keepers.length) { setMsgs(m => [...m, { role: 'assistant', content: 'No keepers yet — mark some photos Keep in Cull first.', actions: [{ type: 'navigate', label: 'Open Cull', to: 'cull' }] }]); return; }
        await mediaAPI.batchEdits(projectId, keepers.map(k => k.id), preset.p);
        setMsgs(m => [...m, { role: 'assistant', content: `Applying “${preset.name}” to ${keepers.length} keeper${keepers.length === 1 ? '' : 's'} — rendering in the background now.`, actions: [] }]);
      }
    } catch (e) {
      setMsgs(m => [...m, { role: 'assistant', content: e.response?.data?.error || 'That action failed.', actions: [] }]);
    }
  };

  return (
    <>
      <button onClick={() => setOpen(v => !v)} aria-label="Studio Copilot" title="Studio Copilot" className="wf-fab wf-fab-studio"
        style={{ position: 'fixed', bottom: 22, right: 22, zIndex: 380, width: 52, height: 52, borderRadius: 999, border: 'none', cursor: 'pointer',
          background: 'var(--ms-accent)', color: 'var(--ms-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 12px 36px -10px rgba(0,0,0,0.5)', transition: 'transform .2s ease' }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}>
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>

      {open && (
        <div style={{ position: 'fixed', bottom: 86, right: 22, zIndex: 380, width: 'min(390px, calc(100vw - 32px))', height: 'min(560px, calc(100vh - 130px))',
          display: 'flex', flexDirection: 'column', background: 'var(--ms-panel-bg)', backdropFilter: 'var(--ms-panel-blur)',
          border: 'var(--ms-panel-border)', borderRadius: 18, boxShadow: 'var(--ms-shadow)', overflow: 'hidden', animation: 'ms-rise .3s var(--ms-ease) both' }}>
          {/* header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--ms-line)' }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--ms-accent)', color: 'var(--ms-on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Sparkles size={15} /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ms-ink)' }}>Studio Copilot</div>
              <div style={{ fontSize: 10.5, color: 'var(--ms-ink-3)' }}>{projectId ? 'Knows this shoot — suggests, never decides' : 'Open a shoot for deeper analysis'}</div>
            </div>
          </div>

          {/* messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.length === 0 && (
              <div style={{ marginTop: 6 }}>
                <p style={{ fontSize: 12.5, color: 'var(--ms-ink-2)', margin: '0 0 12px', lineHeight: 1.5 }}>
                  Ask me anything about this shoot — culling progress, weakest frames, client feedback, what to deliver next.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {QUICK.map(qc => (
                    <button key={qc} onClick={() => send(qc)} className="ms-chip" style={{ textTransform: 'none', fontSize: 11.5 }}>{qc}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
                <div style={{ padding: '9px 13px', borderRadius: 13, fontSize: 12.5, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                  background: m.role === 'user' ? 'var(--ms-accent)' : 'var(--ms-surface-2)',
                  color: m.role === 'user' ? 'var(--ms-on-accent)' : 'var(--ms-ink)' }}>
                  {m.content}
                </div>
                {m.actions?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}>
                    {m.actions.map((a, j) => (
                      <button key={j} onClick={() => runAction(a)} className="ms-btn-ghost" style={{ padding: '6px 12px', fontSize: 11.5 }}>{a.label || a.type}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ms-ink-3)', fontSize: 12 }}><Loader size={13} className="ms-spin" /> thinking…</div>}
            <div ref={endRef} />
          </div>

          {/* input */}
          <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--ms-line)' }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask your copilot…" className="ms-input" style={{ flex: 1, marginBottom: 0 }} />
            <button onClick={() => send()} disabled={busy || !input.trim()} className="ms-btn-ink" style={{ padding: '0 16px' }}><Send size={15} /></button>
          </div>
        </div>
      )}
    </>
  );
}
