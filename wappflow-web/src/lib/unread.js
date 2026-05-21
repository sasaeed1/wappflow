// ───────────────────────────────────────────────────────────────────────────
// Per-viewer "unread lead" tracking (item 4).
//
// A lead is "unread" when a message has landed on it more recently than the
// current user last opened it. State is stored locally so each teammate gets
// their own unread view — opening a lead on one device doesn't clear the badge
// for everyone.
//
// A baseline timestamp (set the first time this runs) stops every existing
// lead from being flagged unread on first use — only activity from then on
// counts.
// ───────────────────────────────────────────────────────────────────────────
import { toDate } from './datetime';

const SEEN_KEY = 'wf_lead_seen';
const BASE_KEY = 'wf_unread_baseline';

function readSeen() {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; }
}

function baselineMs() {
  if (typeof window === 'undefined') return Date.now();
  let b = localStorage.getItem(BASE_KEY);
  if (!b) {
    b = new Date().toISOString();
    try { localStorage.setItem(BASE_KEY, b); } catch {}
  }
  const d = toDate(b);
  return d ? d.getTime() : Date.now();
}

/** Record that the current user just viewed this lead's conversation. */
export function markLeadSeen(leadId) {
  if (typeof window === 'undefined' || !leadId) return;
  try {
    const m = readSeen();
    m[leadId] = new Date().toISOString();
    localStorage.setItem(SEEN_KEY, JSON.stringify(m));
  } catch {}
}

/** True when this lead has a message newer than the user last saw it. */
export function isLeadUnread(lead) {
  if (!lead || !lead.last_message_at) return false;
  const last = toDate(lead.last_message_at);
  if (!last) return false;
  const seenRaw = readSeen()[lead.id];
  const seenMs = seenRaw ? (toDate(seenRaw)?.getTime() || 0) : 0;
  const threshold = Math.max(seenMs, baselineMs());
  return last.getTime() > threshold;
}
