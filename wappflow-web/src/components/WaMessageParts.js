'use client';

// WhatsApp message parts for the lead thread (PROP-004).
//
// The thread used to render text, media and a HARDCODED blue ✓✓ on every
// message we sent — "read" claimed for messages WhatsApp may never have
// delivered. These are the pieces the backend now records: real delivery
// state, the message a reply quotes, reactions, edits, deletions, and
// structured content (location / contact card / poll / call) that has no text
// or file of its own.

import { MapPin, User, BarChart3, Phone, Video, Reply, Smile, Clock, AlertCircle } from 'lucide-react';

const parseJson = (s) => { if (!s) return null; try { return JSON.parse(s); } catch { return null; } };
export const messageMeta = (msg) => parseJson(msg && msg.meta);
export const messageReactions = (msg) => parseJson(msg && msg.reactions) || {};

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '🎉'];

// ✓ sent · ✓✓ delivered · blue ✓✓ read · ! failed. Rows recorded before ticks
// existed (ack null) show a single ✓ — sent, which is all we actually know.
export function WaTicks({ ack }) {
  if (ack === -1) return <span title="Not delivered" style={{ color: 'var(--danger, #ef4444)', marginLeft: 4, display: 'inline-flex', verticalAlign: 'middle' }}><AlertCircle size={11} /></span>;
  if (ack === 0) return <span title="Sending…" style={{ marginLeft: 4, display: 'inline-flex', verticalAlign: 'middle', opacity: 0.7 }}><Clock size={10} /></span>;
  const read = ack >= 3;
  const double = ack >= 2;
  return (
    <span title={read ? 'Read' : double ? 'Delivered' : 'Sent'} style={{ color: read ? '#34b7f1' : 'var(--text-dim)', marginLeft: 4, letterSpacing: -3 }}>
      {double ? '✓✓' : '✓'}
    </span>
  );
}

export function QuotedSnippet({ body, fromMe }) {
  if (!body) return null;
  return (
    <div style={{ borderLeft: `3px solid ${fromMe ? '#25d366' : '#6366f1'}`, background: 'rgba(0,0,0,0.12)', borderRadius: 6, padding: '5px 8px', marginBottom: 6, fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
      {body}
    </div>
  );
}

// Location, contact card, poll or call. Returns null when the message has none.
export function SpecialContent({ meta }) {
  if (!meta) return null;
  const card = { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(0,0,0,0.1)', borderRadius: 10, minWidth: 200, color: 'var(--text)', textDecoration: 'none' };
  const icon = (bg) => ({ width: 34, height: 34, borderRadius: 10, background: bg, display: 'grid', placeItems: 'center', flexShrink: 0 });
  const title = { margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text)' };
  const sub = { margin: 0, fontSize: 11.5, color: 'var(--text-dim)' };

  if (meta.location) {
    const l = meta.location;
    return (
      <a href={l.url} target="_blank" rel="noopener noreferrer" style={card}>
        <span style={icon('#ef4444')}><MapPin size={17} color="#fff" /></span>
        <span style={{ minWidth: 0 }}>
          <p style={title}>{l.name || 'Shared location'}</p>
          <p style={sub}>{l.address || `${Number(l.lat).toFixed(5)}, ${Number(l.lng).toFixed(5)}`} · Open map</p>
        </span>
      </a>
    );
  }
  if (meta.contacts && meta.contacts.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {meta.contacts.map((c, i) => (
          <div key={i} style={card}>
            <span style={icon('#6366f1')}><User size={17} color="#fff" /></span>
            <span style={{ minWidth: 0 }}>
              <p style={title}>{c.name || 'Contact'}</p>
              {c.phones && c.phones.length > 0 && <p style={sub}>{c.phones.join(' · ')}</p>}
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (meta.poll) {
    return (
      <div style={{ ...card, flexDirection: 'column', alignItems: 'stretch' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={16} color="#25d366" />
          <p style={title}>{meta.poll.name || 'Poll'}</p>
        </span>
        {(meta.poll.options || []).map((o, i) => (
          <span key={i} style={{ fontSize: 12.5, padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>{o}</span>
        ))}
        <p style={sub}>{meta.poll.multiple ? 'Several answers allowed' : 'One answer'} · reply in WhatsApp to vote</p>
      </div>
    );
  }
  if (meta.call) {
    const Ico = meta.call.video ? Video : Phone;
    return (
      <div style={card}>
        <span style={icon('#25d366')}><Ico size={16} color="#fff" /></span>
        <span>
          <p style={title}>{meta.call.video ? 'WhatsApp video call' : 'WhatsApp voice call'}</p>
          <p style={sub}>They called you · call back from your phone</p>
        </span>
      </div>
    );
  }
  return null;
}

export function ReactionsRow({ reactions, fromMe }) {
  const entries = Object.entries(reactions || {});
  if (!entries.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: fromMe ? 'flex-end' : 'flex-start', marginTop: -6, marginBottom: 6, padding: '0 8px', position: 'relative', zIndex: 1 }}>
      {entries.map(([who, emoji]) => (
        <span key={who} title={who === 'me' ? 'You reacted' : 'They reacted'}
          style={{ fontSize: 13, lineHeight: 1, padding: '3px 6px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
          {emoji}
        </span>
      ))}
    </div>
  );
}

// Reply / react controls. Shown on hover (desktop) or after a long-press (phone).
export function MessageActions({ fromMe, open, canReact, onReply, onReact, myReaction }) {
  return (
    <div className={`wa-msg-actions${open ? ' is-open' : ''}`} style={{ justifyContent: fromMe ? 'flex-end' : 'flex-start' }}>
      {canReact && QUICK_REACTIONS.map(e => (
        <button key={e} type="button" onClick={() => onReact(myReaction === e ? '' : e)} aria-label={`React ${e}`}
          className={myReaction === e ? 'is-on' : ''}>{e}</button>
      ))}
      <button type="button" onClick={onReply} aria-label="Reply"><Reply size={14} /></button>
      {!canReact && <span style={{ fontSize: 10.5, color: 'var(--text-dim)', padding: '0 4px' }}><Smile size={11} /> reactions need a WhatsApp message</span>}
    </div>
  );
}
