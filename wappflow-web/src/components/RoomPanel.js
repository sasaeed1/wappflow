'use client';

// RoomPanel (Phase 5) — a contextual collaboration panel for any business entity
// (lead / project / gallery / contract / booking). Drop it into a detail page:
//
//   <RoomPanel type="lead" id={lead.id} title={lead.customer_name} />
//
// It find-or-creates the entity's room (a private channel + LiveKit room), shows the
// team discussion, lets the team chat + start a call (reuses HuddleModal). Messages in
// the room mirror to the lead timeline server-side. Lightweight 6s poll keeps it fresh.

import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageSquare, Video, Send, Loader2 } from 'lucide-react';
import { commsAPI, chatAPI } from '../lib/api';
import HuddleModal from './HuddleModal';

export default function RoomPanel({ type, id, title }) {
  const [channelId, setChannelId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [huddle, setHuddle] = useState(false);
  const scrollRef = useRef(null);
  const me = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();

  const load = useCallback(async (cid) => {
    try {
      const r = await chatAPI.getMessages(cid, { limit: 50 });
      const list = r.data.messages || r.data || [];
      setMessages(Array.isArray(list) ? list : []);
    } catch { /* keep what we have */ }
  }, []);

  // find-or-create the room, then load + poll
  useEffect(() => {
    if (!type || !id) return;
    let timer = null, cancelled = false;
    (async () => {
      try {
        const r = await commsAPI.room(type, id);
        const cid = r.data.channel_id;
        if (cancelled) return;
        setChannelId(cid);
        await load(cid);
        timer = setInterval(() => load(cid), 6000);
      } catch { /* room unavailable */ }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [type, id, load]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages]);

  const send = async () => {
    const body = text.trim();
    if (!body || !channelId || sending) return;
    setSending(true);
    // optimistic
    const optimistic = { id: 'tmp_' + Date.now(), user_id: me.id, sender_name: me.name || 'You', body, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setText('');
    try { await chatAPI.sendMessage(channelId, { body }); await load(channelId); }
    catch { setMessages((m) => m.filter((x) => x.id !== optimistic.id)); }
    finally { setSending(false); }
  };

  return (
    <div style={{ background: 'var(--surface,#14141b)', border: '1px solid var(--border,#1e1e26)', borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border,#1e1e26)' }}>
        <MessageSquare size={16} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>Team Room</span>
        <span style={{ fontSize: 12, color: 'var(--text-dim,#666)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title ? `· ${title}` : ''}</span>
        <button onClick={() => setHuddle(true)} title="Start a call" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 9, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <Video size={14} /> Call
        </button>
      </div>

      <div ref={scrollRef} style={{ maxHeight: 320, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-dim,#666)', fontSize: 13 }}><Loader2 size={14} className="spin" /> Loading…</div>}
        {!loading && !messages.length && <div style={{ fontSize: 13, color: 'var(--text-dim,#666)', textAlign: 'center', padding: '18px 0' }}>No messages yet. Start the discussion for this {type}.</div>}
        {messages.map((m) => {
          const mine = m.user_id && me.id && m.user_id === me.id;
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
              <div style={{ fontSize: 10.5, color: 'var(--text-dim,#666)', marginBottom: 2 }}>{mine ? 'You' : (m.sender_name || 'Teammate')}</div>
              <div style={{ maxWidth: '80%', padding: '8px 11px', borderRadius: 12, fontSize: 13, lineHeight: 1.4, background: mine ? 'color-mix(in srgb, #6366f1 22%, transparent)' : 'var(--bg,#0a0a0f)', border: '1px solid var(--border,#1e1e26)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: 12, borderTop: '1px solid var(--border,#1e1e26)' }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message the team…"
          style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--bg,#0a0a0f)', color: 'var(--text,#e8e8ea)', fontSize: 13, outline: 'none' }}
        />
        <button onClick={send} disabled={!text.trim() || sending} style={{ background: 'var(--accent,#6366f1)', color: '#fff', border: 'none', borderRadius: 9, padding: '0 14px', cursor: text.trim() ? 'pointer' : 'default', opacity: text.trim() ? 1 : 0.5 }}>
          <Send size={15} />
        </button>
      </div>

      {huddle && (
        <HuddleModal open={huddle} onClose={() => setHuddle(false)} roomName={channelId || `room_${type}_${id}`} displayName={me.name || 'Teammate'} startWithVideo={false} />
      )}
    </div>
  );
}
