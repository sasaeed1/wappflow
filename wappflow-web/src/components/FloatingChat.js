'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, X, Minus, Maximize2, Send, Paperclip, Phone, ChevronDown, Smile, Search } from 'lucide-react';
import { leadsAPI, BASE_URL, displayPhone } from '../lib/api';
import { useConfirm } from '@/lib/confirm';
import { formatTime } from '../lib/datetime';

const EMOJI_LIST = ['😊','😂','❤️','👍','👋','🙏','✅','🔥','🎉','💯','😎','🤝','💪','📞','💰','🚀'];

// Key used in localStorage for persisting which lead is open in floating chat
const STORAGE_KEY = 'wf_floating_chat_lead';

export default function FloatingChat() {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [activeLead, setActiveLead] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showLeadSearch, setShowLeadSearch] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [recentLeads, setRecentLeads] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  // Restore from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setActiveLead(JSON.parse(saved)); setOpen(true); } catch {}
    }
    // Listen for custom event from lead pages to open a lead
    const handler = (e) => {
      if (e.detail) { openLead(e.detail); }
    };
    window.addEventListener('wf:open-chat', handler);
    return () => window.removeEventListener('wf:open-chat', handler);
  }, []);

  // Fetch messages when lead changes
  useEffect(() => {
    if (activeLead) {
      fetchMessages(activeLead.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeLead));
    }
  }, [activeLead?.id]);

  // Scroll to bottom when messages arrive
  useEffect(() => {
    if (open && !minimized) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, minimized]);

  // SSE — subscribe to real-time messages
  useEffect(() => {
    if (!token || !activeLead) return;
    const url = `${BASE_URL}/api/events?token=${token}`;
    const evtSource = new EventSource(url);
    evtSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if ((data.type === 'new_message' || data.type === 'message_update') && data.leadId === activeLead.id) {
          fetchMessages(activeLead.id);
        }
      } catch {}
    };
    return () => evtSource.close();
  }, [token, activeLead?.id]);

  const fetchMessages = async (leadId) => {
    setLoadingMsgs(true);
    try {
      const res = await leadsAPI.getMessages(leadId);
      setMessages(res.data.messages || []);
    } catch {} finally { setLoadingMsgs(false); }
  };

  const openLead = (lead) => {
    setActiveLead(lead);
    setOpen(true);
    setMinimized(false);
    setShowLeadSearch(false);
  };

  const closeLead = () => {
    setActiveLead(null);
    setMessages([]);
    setOpen(false);
    localStorage.removeItem(STORAGE_KEY);
  };

  const loadLeads = async () => {
    try {
      const res = await leadsAPI.getAll(null);
      const all = res.data.leads || [];
      setAllLeads(all);
      setRecentLeads(all.slice(0, 5));
    } catch {}
  };

  const handleOpenSearch = () => {
    setShowLeadSearch(true);
    loadLeads();
  };

  const filteredLeads = leadSearch
    ? allLeads.filter(l => l.customer_name?.toLowerCase().includes(leadSearch.toLowerCase()) || l.customer_phone?.includes(leadSearch))
    : recentLeads;

  const handleSend = async () => {
    if (!newMsg.trim() || !activeLead) return;
    const text = newMsg.trim();
    setNewMsg('');
    setSending(true);
    try {
      await leadsAPI.sendMessage(activeLead.id, text);
      await fetchMessages(activeLead.id);
    } catch { await confirm({ title: 'Send failed', message: 'Could not send the message. Is WhatsApp connected?', alertOnly: true, tone: 'danger' }); }
    finally { setSending(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeLead) return;
    try {
      const fd = new FormData();
      fd.append('file', file);
      await leadsAPI.sendMedia(activeLead.id, fd);
      await fetchMessages(activeLead.id);
    } catch { await confirm({ title: 'Upload failed', message: 'Could not send that file.', alertOnly: true, tone: 'danger' }); }
    e.target.value = '';
  };

  // ─── Minimized bubble ────────────────────────────────────────────────────
  if (!open) {
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9000 }}>
        <button
          onClick={handleOpenSearch}
          title="Open floating chat"
          style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg, #25d366, #128c7e)',
            border: 'none', cursor: 'pointer', boxShadow: '0 4px 24px rgba(37,211,102,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.15s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform='scale(1.08)'}
          onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}
        >
          <MessageSquare size={22} color="white" />
        </button>

        {/* Lead picker dropdown */}
        {showLeadSearch && (
          <div style={{ position: 'absolute', bottom: 60, right: 0, width: 300, background: 'var(--surface)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.18)', border: '1.5px solid var(--border)', overflow: 'hidden', zIndex: 9001 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Search size={14} color="#9ca3af" />
              <input autoFocus value={leadSearch} onChange={e => setLeadSearch(e.target.value)} placeholder="Search leads to chat…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)' }} />
              <button onClick={() => setShowLeadSearch(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={14} /></button>
            </div>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {filteredLeads.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>No leads found</div>
              ) : filteredLeads.map(l => (
                <button key={l.id} onClick={() => openLead(l)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f9fafb' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background='none'}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #25d366, #128c7e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                    {(l.customer_name||'?')[0].toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.customer_name || 'Unknown'}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{displayPhone(l.customer_phone, l.platform_source)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Chat window ─────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
      width: 340, background: 'var(--surface)', borderRadius: 20,
      boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
      border: '1.5px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      height: minimized ? 'auto' : 520,
      transition: 'height 0.2s ease',
      overflow: 'hidden',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1e3a2f, #128c7e)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: 'white', flexShrink: 0 }}>
          {(activeLead?.customer_name||'?')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeLead?.customer_name || 'Unknown'}</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{displayPhone(activeLead?.customer_phone, activeLead?.platform_source)}</p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={handleOpenSearch} title="Switch lead" style={{ width: 26, height: 26, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Search size={12} />
          </button>
          <button onClick={() => setMinimized(v => !v)} style={{ width: 26, height: 26, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            {minimized ? <Maximize2 size={12} /> : <Minus size={12} />}
          </button>
          <button onClick={closeLead} style={{ width: 26, height: 26, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <X size={12} />
          </button>
        </div>

        {/* Lead search overlay when searching from open window */}
        {showLeadSearch && (
          <div style={{ position: 'absolute', top: 56, left: 0, right: 0, background: 'var(--surface)', borderRadius: '0 0 16px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Search size={13} color="#9ca3af" />
              <input autoFocus value={leadSearch} onChange={e => setLeadSearch(e.target.value)} placeholder="Search leads…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)' }} />
              <button onClick={() => setShowLeadSearch(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={13} /></button>
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {filteredLeads.map(l => (
                <button key={l.id} onClick={() => openLead(l)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #f9fafb' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--surface2)'}
                  onMouseLeave={e => e.currentTarget.style.background='none'}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'white', flexShrink: 0 }}>
                    {(l.customer_name||'?')[0].toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.customer_name || 'Unknown'}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{displayPhone(l.customer_phone, l.platform_source)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {!minimized && (
        <>
          {/* Messages area */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 12px 8px',
            background: 'var(--surface2)',
            display: 'flex', flexDirection: 'column', gap: 6
          }}>
            {loadingMsgs ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                <div style={{ width: 24, height: 24, border: '3px solid var(--border)', borderTopColor: '#25d366', borderRadius: '50%', animation: 'fcSpin 0.8s linear infinite' }} />
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--text-dim)' }}>
                <MessageSquare size={24} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: 12, margin: 0 }}>No messages yet</p>
              </div>
            ) : (
              messages.map((msg, i) => {
                const fromMe = !!msg.from_me;
                const isMedia = msg.media_url;
                return (
                  <div key={msg.id || i} style={{ display: 'flex', justifyContent: fromMe ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '78%', padding: '7px 10px',
                      background: fromMe
                        ? (typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? '#dcf8c6' : '#1a4731')
                        : 'var(--surface2)',
                      color: 'var(--text)',
                      borderRadius: fromMe ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                    }}>
                      {isMedia ? (
                        msg.media_type?.startsWith('image') ? (
                          <img src={`${BASE_URL}${msg.media_url}`} alt="media" style={{ maxWidth: '100%', borderRadius: 8, display: 'block', marginBottom: msg.body ? 4 : 0 }} />
                        ) : (
                          <a href={`${BASE_URL}${msg.media_url}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#6366f1', fontWeight: 600 }}>📎 Attachment</a>
                        )
                      ) : null}
                      {msg.body && <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{msg.body}</p>}
                      <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '3px 0 0', textAlign: 'right' }}>{formatTime(msg.timestamp)}</p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Emoji picker */}
          {showPicker && (
            <div style={{ background: 'var(--surface)', borderTop: '1px solid #f3f4f6', padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 80, overflowY: 'auto' }}>
              {EMOJI_LIST.map(e => (
                <button key={e} onClick={() => { setNewMsg(m => m + e); setShowPicker(false); inputRef.current?.focus(); }}
                  style={{ fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', padding: 2, lineHeight: 1 }}>{e}</button>
              ))}
            </div>
          )}

          {/* Input row */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid #f3f4f6', display: 'flex', alignItems: 'flex-end', gap: 6, background: 'var(--surface)', flexShrink: 0 }}>
            <button onClick={() => setShowPicker(v => !v)} style={{ width: 30, height: 30, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Smile size={16} />
            </button>
            <button onClick={() => fileInputRef.current?.click()} style={{ width: 30, height: 30, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Paperclip size={16} />
            </button>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
            <textarea ref={inputRef} value={newMsg} onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Type a message…" rows={1}
              style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: 20, padding: '7px 12px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5, minHeight: 34, maxHeight: 80, overflowY: 'auto', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor='#25d366'} onBlur={e => e.target.style.borderColor='var(--border)'}
            />
            <button onClick={handleSend} disabled={sending || !newMsg.trim()}
              style={{ width: 34, height: 34, background: newMsg.trim() ? 'linear-gradient(135deg, #25d366, #128c7e)' : 'var(--surface2)', border: 'none', borderRadius: '50%', cursor: newMsg.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.15s' }}>
              <Send size={14} color={newMsg.trim() ? 'white' : '#d1d5db'} />
            </button>
          </div>
        </>
      )}

      <style>{`@keyframes fcSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Utility — call this from any page to open a lead in the floating chat
export function openInFloatingChat(lead) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('wf:open-chat', { detail: lead }));
  }
}
