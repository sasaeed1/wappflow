'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Hash, Plus, Send, Paperclip, Smile, X, Trash2,
  MoreHorizontal, Image, FileText, ChevronDown,
  MessageCircle, Users, Lock, Check, Edit3,
  Bold, Italic, Code, Link2, AtSign, Search,
  Volume2, VolumeX, Bell, BellOff, Video, Phone,
  List, ListOrdered, Quote, Strikethrough, Underline as UnderlineIcon
} from 'lucide-react';
import { chatAPI, BASE_URL } from '../../lib/api';
import NavBar from '../../components/NavBar';
import HuddleModal from '@/components/HuddleModal';
import { useConfirm } from '@/lib/confirm';
import { useSound } from '@/lib/sounds';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '✅', '👀', '🚀'];

// Categorized emoji picker — ~280 emojis across categories
const EMOJI_CATEGORIES = {
  'Smileys': ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','😎','🤓','🧐'],
  'Gestures': ['👍','👎','👊','✊','🤛','🤜','🤞','✌️','🤟','🤘','👌','🤌','🤏','👈','👉','👆','👇','☝️','✋','🤚','🖐️','🖖','👋','🤙','💪','🦾','🙏','👏','🤲','🙌','🤝','✍️'],
  'Hearts': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝','💟','💌'],
  'Activity': ['🎉','🎊','🎈','🎁','🎂','🍰','🥂','🍾','🎯','🎮','🎲','🏆','🥇','🥈','🥉','⚽','🏀','🏈','⚾','🎾','🎱','🏓','🏸','🥊','🚀','✈️','🚗','🏍️','⛵','🏠','🏢'],
  'Symbols': ['✅','❌','⚠️','🚫','💯','✔️','❗','❓','❕','❔','💢','💥','💫','💦','💨','🔥','⭐','🌟','💎','🔑','🔒','🔓','🔔','📌','📍','🎯','🎁','💼','💰','💵','💸','📈','📉','📊','📋','📝','📞','📱','💻','📧','✉️','📅','🗓️','⏰','⌚','🔍','🔎','💡','📚','🌐','🚨','⚡','🌈','🎨','🎵','🎶'],
  'Food': ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑','🥝','🥥','🍍','🥑','🥦','🥕','🌽','🍔','🍟','🍕','🌭','🥪','🌮','🌯','🍝','🍜','🍣','🍱','🍩','🍪','🎂','☕','🍵','🍺','🍷','🥂','🥃'],
  'Nature': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦅','🦉','🦋','🌸','🌹','🌻','🌷','🌳','🌲','🌴','🌵','🌾','☀️','🌙','⭐','🌟','☁️','⛅','🌧️','⛈️','🌈','⚡','❄️','🌊'],
};

const FORMAT_BUTTONS = [
  { cmd: 'bold', label: 'Bold', icon: Bold, shortcut: 'Ctrl+B' },
  { cmd: 'italic', label: 'Italic', icon: Italic, shortcut: 'Ctrl+I' },
  { cmd: 'underline', label: 'Underline', icon: UnderlineIcon, shortcut: 'Ctrl+U' },
  { cmd: 'strikeThrough', label: 'Strike', icon: Strikethrough },
  { cmd: 'insertUnorderedList', label: 'Bullets', icon: List },
  { cmd: 'insertOrderedList', label: 'Numbered', icon: ListOrdered },
  { cmd: 'formatBlock|<blockquote>', label: 'Quote', icon: Quote },
  { cmd: 'formatBlock|<pre>', label: 'Code Block', icon: Code },
];

// Strict allowlist sanitizer — keeps formatting tags, strips scripts/event handlers/styles
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'BR', 'P', 'DIV', 'SPAN', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'A']);
function sanitizeHtml(html) {
  if (typeof window === 'undefined') return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const walk = (node) => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 1) { // ELEMENT
        if (!ALLOWED_TAGS.has(child.tagName)) {
          // Replace disallowed elements with their text content
          const text = document.createTextNode(child.textContent || '');
          node.replaceChild(text, child);
          continue;
        }
        // Strip all attributes except href on <a>
        const attrs = Array.from(child.attributes || []);
        for (const attr of attrs) {
          if (child.tagName === 'A' && attr.name === 'href' && /^https?:|^mailto:/i.test(attr.value)) continue;
          child.removeAttribute(attr.name);
        }
        if (child.tagName === 'A') {
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noreferrer noopener');
        }
        walk(child);
      } else if (child.nodeType !== 3) { // not TEXT
        node.removeChild(child);
      }
    }
  };
  walk(tmp);
  return tmp.innerHTML;
}

// Render message body — supports new HTML format and legacy *markdown*
function FormattedText({ text }) {
  if (!text) return null;
  // Detect HTML (contains tags); otherwise treat as legacy markdown
  const isHtml = /<\/?[a-z][\s\S]*>/i.test(text);
  let html;
  if (isHtml) {
    html = sanitizeHtml(text);
  } else {
    html = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
      .replace(/_([^_\n]+)_/g, '<em>$1</em>')
      .replace(/~([^~\n]+)~/g, '<s>$1</s>')
      .replace(/`([^`\n]+)`/g, '<code style="background:#f3f4f6;padding:2px 5px;border-radius:4px;font-family:monospace;font-size:12px">$1</code>')
      .replace(/\n/g, '<br/>');
  }
  return <span className="wf-msg-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

// Emoji picker with categories
function EmojiPicker({ onPick, onClose }) {
  const [activeCat, setActiveCat] = useState(Object.keys(EMOJI_CATEGORIES)[0]);
  const ref = useRef();
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return (
    <div ref={ref} style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 8, background: 'var(--surface)', border: '1.5px solid #e5e7eb', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.15)', width: 340, maxHeight: 360, display: 'flex', flexDirection: 'column', zIndex: 100, overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', overflowX: 'auto' }}>
        {Object.keys(EMOJI_CATEGORIES).map(cat => (
          <button key={cat} onClick={() => setActiveCat(cat)} style={{ padding: '8px 12px', fontSize: 11, fontWeight: activeCat === cat ? 700 : 600, color: activeCat === cat ? '#6366f1' : '#6b7280', background: activeCat === cat ? 'rgba(99,102,241,0.12)' : 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: `2px solid ${activeCat === cat ? '#6366f1' : 'transparent'}` }}>
            {cat}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 4 }}>
        {EMOJI_CATEGORIES[activeCat].map((e, i) => (
          <button key={`${e}-${i}`} onClick={() => onPick(e)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, padding: 4, borderRadius: 6, lineHeight: 1, transition: 'background 0.1s' }}
            onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface2)'}
            onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

// Channel modal
function ChannelModal({ onSave, onClose }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', borderRadius: 18, padding: 28, width: 440, boxShadow: '0 24px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Create Channel</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={18} /></button>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Channel Name</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', focus: 'outline:none' }}>
            <Hash size={14} color="#9ca3af" />
            <input value={name} onChange={e => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              placeholder="channel-name" style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, color: 'var(--text)' }} />
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Description (optional)</label>
          <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What's this channel for?"
            style={{ width: '100%', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', color: 'var(--text)' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 20 }}>
          <div style={{ width: 36, height: 20, borderRadius: 10, background: isPrivate ? '#6366f1' : 'var(--border)', position: 'relative', transition: 'background 0.2s', cursor: 'pointer' }}
            onClick={() => setIsPrivate(!isPrivate)}>
            <div style={{ position: 'absolute', top: 2, left: isPrivate ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'var(--surface)', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{isPrivate ? <><Lock size={12} style={{ display: 'inline', marginRight: 4 }} />Private channel</> : 'Public channel'}</span>
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', background: 'var(--surface)', color: 'var(--text)' }}>Cancel</button>
          <button onClick={() => name && onSave({ name, description: desc, is_private: isPrivate })} disabled={!name}
            style={{ flex: 2, padding: '10px', background: name ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--border)', color: name ? 'white' : '#9ca3af', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: name ? 'pointer' : 'not-allowed' }}>
            Create Channel
          </button>
        </div>
      </div>
    </div>
  );
}

// Single message bubble
function MessageBubble({ msg, currentUserId, onReact, onDelete, onReplyTo }) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isMe = msg.user_id === currentUserId;
  const time = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Group reactions
  const reactionGroups = (msg.reactions || []).reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { emoji: r.emoji, users: [], count: 0 };
    acc[r.emoji].users.push(r.user_id);
    acc[r.emoji].count++;
    return acc;
  }, {});

  return (
    <div
      style={{ display: 'flex', gap: 10, padding: '4px 0', alignItems: 'flex-start', position: 'relative' }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
    >
      {/* Avatar */}
      <div style={{ width: 32, height: 32, borderRadius: 10, flexShrink: 0, background: `linear-gradient(135deg, ${isMe ? '#6366f1' : '#06b6d4'}, ${isMe ? '#4f46e5' : '#0891b2'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: 'white' }}>
        {msg.sender_name?.[0]?.toUpperCase() || '?'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Sender + time */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isMe ? '#6366f1' : '#111827' }}>{msg.sender_name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{time}</span>
        </div>

        {/* Reply context */}
        {msg.reply_to && (
          <div style={{ background: 'var(--surface2)', borderLeft: '3px solid #6366f1', borderRadius: '0 8px 8px 0', padding: '4px 10px', marginBottom: 4, fontSize: 12, color: 'var(--text-muted)' }}>
            ↩ Replying to a message
          </div>
        )}

        {/* Body */}
        {msg.body && !msg.media_url && (
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, background: isMe ? 'rgba(99,102,241,0.12)' : 'var(--surface2)', border: `1.5px solid ${isMe ? '#c7d2fe' : 'var(--surface2)'}`, borderRadius: '0 12px 12px 12px', padding: '8px 12px', display: 'inline-block', maxWidth: '80%', wordBreak: 'break-word' }}>
            <FormattedText text={msg.body} />
          </div>
        )}

        {/* Media */}
        {msg.media_url && (
          <div style={{ marginTop: 4 }}>
            {msg.media_type === 'image' ? (
              <img src={msg.media_url} alt={msg.body} style={{ maxWidth: 300, maxHeight: 240, borderRadius: 12, border: '1.5px solid #e5e7eb', cursor: 'pointer' }}
                onClick={() => window.open(msg.media_url, '_blank')} />
            ) : (
              <a href={msg.media_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '8px 14px', textDecoration: 'none', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
                <FileText size={16} color="#6366f1" /> {msg.body || 'Download file'}
              </a>
            )}
          </div>
        )}

        {/* Reactions */}
        {Object.values(reactionGroups).length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {Object.values(reactionGroups).map(r => (
              <button key={r.emoji} onClick={() => onReact(msg.id, r.emoji)} style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px',
                background: r.users.includes(currentUserId) ? 'rgba(99,102,241,0.12)' : 'var(--surface2)',
                border: `1.5px solid ${r.users.includes(currentUserId) ? '#c7d2fe' : 'var(--border)'}`,
                borderRadius: 12, cursor: 'pointer', fontSize: 13
              }}>
                {r.emoji} <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{r.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {showActions && (
        <div style={{ position: 'absolute', right: 0, top: -6, display: 'flex', gap: 4, background: 'var(--surface)', border: '1.5px solid #e5e7eb', borderRadius: 10, padding: '4px 6px', boxShadow: '0 4px 14px rgba(0,0,0,0.1)', zIndex: 10 }}>
          {/* Emoji react */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
              title="React">
              <Smile size={15} />
            </button>
            {showEmojiPicker && (
              <div style={{ position: 'absolute', bottom: '100%', right: 0, background: 'var(--surface)', border: '1.5px solid #e5e7eb', borderRadius: 12, padding: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', display: 'flex', gap: 4, flexWrap: 'wrap', width: 220 }}>
                {QUICK_EMOJIS.map(emoji => (
                  <button key={emoji} onClick={() => { onReact(msg.id, emoji); setShowEmojiPicker(false); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '3px 5px', borderRadius: 6, lineHeight: 1 }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Reply */}
          <button onClick={() => onReplyTo(msg)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }} title="Reply">
            <MessageCircle size={15} />
          </button>
          {/* Delete (only own) */}
          {isMe && (
            <button onClick={() => onDelete(msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color: '#ef4444', display: 'flex', alignItems: 'center' }} title="Delete">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const router = useRouter();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const inputRef = useRef(null);
  const pollRef = useRef(null);

  const confirm = useConfirm();
  const { play: playSound } = useSound();
  const lastMsgIdRef = useRef(null);
  const [user, setUser] = useState(null);
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [huddle, setHuddle] = useState(null); // { roomName, video: boolean }
  const [hasContent, setHasContent] = useState(false); // tracks whether contentEditable input has any text
  const [sending, setSending] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [muted, setMuted] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) { router.push('/login'); return; }
    const u = JSON.parse(userData);
    setUser(u);
    loadChannels();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for new messages every 3s when channel is active
  useEffect(() => {
    if (!activeChannel) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => loadMessages(activeChannel.id, true), 3000);
    return () => clearInterval(pollRef.current);
  }, [activeChannel]);

  const loadChannels = async () => {
    try {
      const res = await chatAPI.getChannels();
      const chs = res.data.channels || [];
      setChannels(chs);
      if (chs.length > 0 && !activeChannel) {
        setActiveChannel(chs[0]);
        loadMessages(chs[0].id);
      }
    } catch (e) { console.error(e); }
  };

  const loadMessages = useCallback(async (channelId, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const res = await chatAPI.getMessages(channelId, { limit: 60 });
      const msgs = res.data.messages || [];
      // Play sound if a new message arrived from someone else on a silent poll
      if (silent && msgs.length > 0) {
        const latest = msgs[msgs.length - 1];
        const myUserId = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}')?.id; } catch { return null; } })();
        if (lastMsgIdRef.current && latest.id !== lastMsgIdRef.current && latest.user_id !== myUserId) {
          playSound('team');
        }
        lastMsgIdRef.current = latest.id;
      } else if (msgs.length > 0) {
        lastMsgIdRef.current = msgs[msgs.length - 1].id;
      }
      setMessages(msgs);
      // Mark as read
      setUnreadCounts(prev => ({ ...prev, [channelId]: 0 }));
    } catch (e) { console.error(e); } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, [playSound]);

  const handleChannelSelect = (channel) => {
    setActiveChannel(channel);
    setMessages([]);
    setReplyTo(null);
    loadMessages(channel.id);
  };

  const handleSend = async () => {
    const el = inputRef.current;
    if (!el || !activeChannel || sending) return;
    // Get HTML content; bail if there's nothing meaningful
    const html = el.innerHTML.trim();
    const plain = (el.innerText || '').trim();
    if (!plain) return;

    const cleaned = sanitizeHtml(html);
    setSending(true);
    try {
      const res = await chatAPI.sendMessage(activeChannel.id, { body: cleaned, reply_to: replyTo?.id });
      setMessages(prev => [...prev, res.data.message]);
      el.innerHTML = '';
      setHasContent(false);
      setReplyTo(null);
    } catch (e) { console.error(e); } finally { setSending(false); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    // Keyboard shortcuts: bold/italic/underline are handled natively by contentEditable
  };

  // Track input emptiness for the send button enable/disable
  const handleInputChange = () => {
    const el = inputRef.current;
    const empty = !el || !(el.innerText || '').trim();
    setHasContent(!empty);
  };

  // Strip rich formatting on paste — keep plain text only (avoids importing weird MS Word styles)
  const handlePaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  const handleFileUpload = async (file) => {
    if (!file || !activeChannel) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const result = await chatAPI.sendMedia(activeChannel.id, formData);
      if (result.message) setMessages(prev => [...prev, result.message]);
    } catch (e) { console.error(e); }
  };

  const handleReact = async (messageId, emoji) => {
    try {
      const res = await chatAPI.react(messageId, emoji);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: res.data.reactions } : m));
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    const ok = await confirm({ title: 'Delete this message?', message: 'This cannot be undone.', confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try {
      await chatAPI.deleteMessage(id);
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch (e) { console.error(e); }
  };

  const handleCreateChannel = async (data) => {
    try {
      const res = await chatAPI.createChannel(data);
      const ch = res.data.channel;
      setChannels(prev => [...prev, ch]);
      setActiveChannel(ch);
      setMessages([]);
      setShowCreateChannel(false);
    } catch (e) { console.error(e); }
  };

  // Execute a formatting command on the contentEditable input
  // Supports cmd|arg syntax (e.g. "formatBlock|<blockquote>")
  const applyFormat = (cmd) => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    const [name, arg] = cmd.split('|');
    try {
      document.execCommand(name, false, arg || null);
    } catch (e) { console.error('Format command failed:', e); }
    handleInputChange();
  };

  const insertEmoji = (emoji) => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    document.execCommand('insertText', false, emoji);
    handleInputChange();
    setShowEmojiPicker(false);
  };

  const filteredChannels = channels.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  // Group messages by date
  const groupedMessages = messages.reduce((acc, msg) => {
    const date = new Date(msg.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (!acc[date]) acc[date] = [];
    acc[date].push(msg);
    return acc;
  }, {});

  return (
    <NavBar>
    <div style={{ height: 'calc(100vh - 60px)', background: 'var(--surface2)', display: 'flex', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── SIDEBAR ── */}
      <div style={{ width: 260, background: '#1e1e2e', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Workspace header */}
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageCircle size={14} color="white" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'white' }}>Team Chat</span>
            </div>
            <button onClick={() => setMuted(!muted)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted ? '#6b7280' : '#9ca3af', padding: 4 }}>
              {muted ? <BellOff size={14} /> : <Bell size={14} />}
            </button>
          </div>
          {/* Search */}
          <div style={{ position: 'relative', marginTop: 10 }}>
            <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search channels..."
              style={{ width: '100%', padding: '7px 10px 7px 26px', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, color: 'white', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Channels list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Channels</span>
            <button onClick={() => setShowCreateChannel(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 2 }}
              onMouseEnter={e => e.currentTarget.style.color = 'white'} onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
              <Plus size={14} />
            </button>
          </div>

          {filteredChannels.map(channel => {
            const isActive = activeChannel?.id === channel.id;
            const unread = unreadCounts[channel.id] || 0;
            return (
              <button key={channel.id} onClick={() => handleChannelSelect(channel)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                background: isActive ? 'rgba(99,102,241,0.25)' : 'none',
                color: isActive ? 'white' : '#9ca3af',
                transition: 'all 0.15s',
                marginBottom: 2,
              }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'white'; } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af'; } }}
              >
                <Hash size={14} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{channel.name}</span>
                {unread > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 800, background: '#ef4444', color: 'white', padding: '1px 6px', borderRadius: 10 }}>{unread}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* User info at bottom */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: 'white', flexShrink: 0 }}>
            {user?.business_name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'white', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.business_name}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CHAT AREA ── */}
      {activeChannel ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

          {/* Channel header */}
          <div style={{ background: 'var(--surface)', borderBottom: '1px solid #e5e7eb', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
              <Hash size={18} color="#6366f1" />
              <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>{activeChannel.name}</span>
              {activeChannel.is_private && <Lock size={13} color="#9ca3af" />}
              {activeChannel.description && (
                <span style={{ fontSize: 12, color: 'var(--text-dim)', borderLeft: '1px solid #e5e7eb', paddingLeft: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeChannel.description}</span>
              )}
            </div>
            <button
              onClick={() => setHuddle({ roomName: `wappflow-${activeChannel.id || activeChannel.name}-${Date.now().toString(36)}`, video: false })}
              title="Start voice huddle"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.35)', background: 'rgba(34,197,94,0.10)', color: '#22c55e', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
            >
              <Phone size={13} /> Huddle
            </button>
            <button
              onClick={() => setHuddle({ roomName: `wappflow-${activeChannel.id || activeChannel.name}-${Date.now().toString(36)}`, video: true })}
              title="Start video huddle"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.12)', color: '#818cf8', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
            >
              <Video size={13} /> Video call
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 4 }}>{messages.length} messages</span>
          </div>

          {/* Messages area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loadingMessages ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)', fontSize: 14 }}>Loading messages...</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div style={{ width: 60, height: 60, borderRadius: 18, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                  <Hash size={24} color="#6366f1" />
                </div>
                <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: '0 0 6px' }}>Welcome to #{activeChannel.name}</p>
                <p style={{ fontSize: 14, color: 'var(--text-dim)', margin: 0 }}>
                  {activeChannel.description || 'This is the beginning of this channel. Start the conversation!'}
                </p>
              </div>
            ) : (
              Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  {/* Date divider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0 12px' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{date}</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>
                  {msgs.map(msg => (
                    <MessageBubble
                      key={msg.id}
                      msg={msg}
                      currentUserId={user?.id}
                      onReact={handleReact}
                      onDelete={handleDelete}
                      onReplyTo={setReplyTo}
                    />
                  ))}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div style={{ background: 'var(--surface)', borderTop: '1px solid #e5e7eb', padding: '12px 20px' }}>

            {/* Reply indicator */}
            {replyTo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface2)', borderRadius: 8, padding: '6px 12px', marginBottom: 8, borderLeft: '3px solid #6366f1' }}>
                <MessageCircle size={12} color="#6366f1" />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', flex: 1 }}>
                  Replying to <strong>{replyTo.sender_name}</strong>: {replyTo.body?.slice(0, 60)}...
                </span>
                <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={13} /></button>
              </div>
            )}

            {/* Editor wrapper with toolbar inside */}
            <div style={{ border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface)', overflow: 'visible', position: 'relative' }}>

              {/* Format toolbar — clickable buttons, no markdown shown to user */}
              <div style={{ display: 'flex', gap: 2, padding: '6px 8px', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface2)', borderRadius: '12px 12px 0 0' }}>
                {FORMAT_BUTTONS.map(({ cmd, label, icon: Icon, shortcut }) => (
                  <button key={cmd} onMouseDown={e => e.preventDefault()} onClick={() => applyFormat(cmd)}
                    title={shortcut ? `${label} (${shortcut})` : label}
                    style={{ width: 28, height: 28, padding: 0, background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; e.currentTarget.style.color = '#6366f1'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#6b7280'; }}>
                    <Icon size={14} />
                  </button>
                ))}
                <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 6px' }} />
                {QUICK_EMOJIS.map(e => (
                  <button key={e} onMouseDown={ev => ev.preventDefault()} onClick={() => insertEmoji(e)} style={{ width: 26, height: 26, padding: 0, background: 'none', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}
                    onMouseEnter={ev => ev.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={ev => ev.currentTarget.style.background = 'none'}>
                    {e}
                  </button>
                ))}
                <div style={{ position: 'relative', marginLeft: 'auto' }}>
                  <button onMouseDown={e => e.preventDefault()} onClick={() => setShowEmojiPicker(s => !s)}
                    title="More emojis"
                    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: showEmojiPicker ? 'rgba(99,102,241,0.12)' : 'none', color: showEmojiPicker ? '#6366f1' : '#6b7280', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                    <Smile size={13} /> More
                  </button>
                  {showEmojiPicker && <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmojiPicker(false)} />}
                </div>
              </div>

              {/* WYSIWYG content-editable input */}
              <div
                ref={inputRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                data-placeholder={`Message #${activeChannel.name}…`}
                className="wf-chat-input"
                style={{
                  minHeight: 44, maxHeight: 200, overflow: 'auto',
                  padding: '10px 14px', outline: 'none',
                  fontSize: 14, color: 'var(--text)', lineHeight: 1.5,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                }}
              />

              {/* Bottom action row inside the input box */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: '0 0 12px 12px' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onMouseDown={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
                    title="Attach file"
                    style={{ width: 30, height: 30, padding: 0, borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.12)'; e.currentTarget.style.color = '#6366f1'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#6b7280'; }}>
                    <Paperclip size={14} />
                  </button>
                  <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                  <strong>Enter</strong> to send · <strong>Shift+Enter</strong> new line
                </span>
                <button onClick={handleSend} disabled={!hasContent || sending} style={{
                  height: 30, padding: '0 14px', borderRadius: 8, border: 'none',
                  background: hasContent && !sending ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'var(--border)',
                  color: hasContent && !sending ? 'white' : '#9ca3af',
                  cursor: hasContent && !sending ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
                  boxShadow: hasContent && !sending ? '0 4px 10px rgba(99,102,241,0.35)' : 'none',
                  transition: 'all 0.15s'
                }}>
                  {sending
                    ? <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Sending</>
                    : <><Send size={13} /> Send</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={28} color="#6366f1" />
          </div>
          <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Select a channel</p>
          <p style={{ fontSize: 14, color: 'var(--text-dim)', margin: 0 }}>or create one to start chatting with your team</p>
          <button onClick={() => setShowCreateChannel(true)} style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={15} /> Create Channel
          </button>
        </div>
      )}

      {showCreateChannel && <ChannelModal onSave={handleCreateChannel} onClose={() => setShowCreateChannel(false)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        /* contentEditable empty state placeholder */
        .wf-chat-input:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .wf-chat-input { word-break: break-word; }
        .wf-chat-input ul, .wf-chat-input ol { margin: 4px 0; padding-left: 24px; }
        .wf-chat-input blockquote { margin: 4px 0; padding: 4px 12px; border-left: 3px solid #c7d2fe; color: #4b5563; background: #f9fafb; }
        .wf-chat-input pre { margin: 4px 0; padding: 8px 12px; background: #1f2937; color: #e5e7eb; border-radius: 6px; font-family: ui-monospace, monospace; font-size: 12.5px; white-space: pre-wrap; }
        /* Rendered message body styles */
        .wf-msg-body ul, .wf-msg-body ol { margin: 4px 0; padding-left: 22px; }
        .wf-msg-body li { margin: 2px 0; }
        .wf-msg-body blockquote { margin: 4px 0; padding: 4px 10px; border-left: 3px solid #c7d2fe; color: #4b5563; }
        .wf-msg-body pre { margin: 4px 0; padding: 8px 12px; background: #1f2937; color: #e5e7eb; border-radius: 6px; font-family: ui-monospace, monospace; font-size: 12.5px; white-space: pre-wrap; overflow-x: auto; }
        .wf-msg-body code { background: #f3f4f6; padding: 2px 5px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 12px; }
        .wf-msg-body a { color: #6366f1; text-decoration: underline; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
      `}</style>
      <HuddleModal
        open={!!huddle}
        onClose={() => setHuddle(null)}
        roomName={huddle?.roomName || ''}
        displayName={(() => { try { return JSON.parse(localStorage.getItem('user') || '{}')?.full_name || JSON.parse(localStorage.getItem('user') || '{}')?.business_name || 'Teammate'; } catch { return 'Teammate'; } })()}
        startWithVideo={!!huddle?.video}
      />
    </div>
    </NavBar>
  );
}
