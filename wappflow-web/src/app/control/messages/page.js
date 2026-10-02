'use client';
import { useState } from 'react';
import { ShieldAlert, Search } from 'lucide-react';
import { ccApi, fmtWhen } from '@/lib/ccApi';
import { Card, Pill, Can } from '@/components/control/ControlShell';
import { Btn, Muted, selectStyle } from '@/components/control/kit';

// Message Explorer — founder only. Every search and every opened conversation is
// logged in the Audit Center AND in the customer's own activity log
// ("WappFlow support viewed conversations"). Read-only.
export default function Messages() {
  const [q, setQ] = useState('');
  const [ws, setWs] = useState('');
  const [results, setResults] = useState(null);
  const [thread, setThread] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const search = async (e) => {
    e?.preventDefault();
    if (q.trim().length < 3) { setErr('Search for at least 3 characters'); return; }
    setBusy(true); setErr(''); setThread(null);
    try { const r = await ccApi.searchMessages({ q: q.trim(), workspace_id: ws.trim() || undefined }); setResults(r.data.results); }
    catch (e2) { setErr(e2.response?.data?.need_step_up ? 'Confirmation cancelled.' : (e2.response?.data?.error || 'Search failed')); }
    setBusy(false);
  };
  const open = async (leadId) => {
    setBusy(true); setErr('');
    try { const r = await ccApi.thread(leadId); setThread(r.data); }
    catch (e2) { setErr(e2.response?.data?.error || 'Could not open the conversation'); }
    setBusy(false);
  };

  return (
    <Can founder fallback={<Card><Muted>Only founders can read customer conversations.</Muted></Card>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Message Explorer</h1>
        <Card style={{ borderColor: '#fbbf2455', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <ShieldAlert size={18} color="#fbbf24" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, lineHeight: 1.55 }}>These are your customers’ private conversations with their clients. Use this only to investigate a support issue. Every search and every conversation you open is recorded in the Audit Center and shown in that customer’s own activity log.</div>
        </Card>

        <form onSubmit={search} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input aria-label="Search text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Text to find in messages" style={{ ...selectStyle, flex: '1 1 220px', minWidth: 0 }} />
          <input aria-label="Workspace ID" value={ws} onChange={(e) => setWs(e.target.value)} placeholder="Workspace ID (optional)" style={{ ...selectStyle, flex: '0 1 240px', minWidth: 0 }} />
          <Btn type="submit" disabled={busy}><Search size={14} /> {busy ? 'Searching…' : 'Search'}</Btn>
        </form>
        {err && <div role="alert" style={{ color: '#f87171', fontSize: 13 }}>{err}</div>}

        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: thread ? 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))' : '1fr' }}>
          {results && (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {!results.length && <Muted style={{ padding: 16 }}>No messages match.</Muted>}
              {results.map((m) => (
                <button key={m.id} onClick={() => open(m.lead_id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', background: thread?.lead?.id === m.lead_id ? 'color-mix(in srgb,#818cf8 10%,transparent)' : 'transparent', border: 'none', borderBottom: '1px solid var(--border,#1e1e26)', color: 'var(--text,#e8e8ea)', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--text-dim,#666)', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--text-muted,#9a9aa5)' }}>{m.workspace_name || 'workspace'}</strong> · {m.customer_name || 'contact'} · {m.from_me ? 'sent' : 'received'} · {fmtWhen(m.timestamp)}
                  </div>
                  <div style={{ fontSize: 13.5, marginTop: 4, overflowWrap: 'anywhere' }}>{m.body}</div>
                </button>
              ))}
            </Card>
          )}
          {thread && (
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <strong>{thread.lead.customer_name || thread.lead.customer_phone}</strong>
                <Pill tone="neutral">{thread.lead.workspace_name}</Pill>
                {thread.lead.platform_source && <Pill tone="blue">{thread.lead.platform_source}</Pill>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '60vh', overflowY: 'auto' }}>
                {thread.messages.map((m) => (
                  <div key={m.id} style={{ alignSelf: m.from_me ? 'flex-end' : 'flex-start', maxWidth: '82%', padding: '8px 11px', borderRadius: 12, background: m.from_me ? '#1a4731' : 'var(--bg,#0a0a0f)', border: '1px solid var(--border,#1e1e26)', fontSize: 13.5 }}>
                    <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body || (m.media_type ? `[${m.media_type}]` : '')}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-dim,#666)', marginTop: 3, textAlign: 'right' }}>{fmtWhen(m.timestamp)}</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </Can>
  );
}
