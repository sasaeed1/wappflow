'use client';

// ════════════════════════════════════════════════════════════════════════════
//  LeadAssistStrip — the assistant that reads the conversation and proposes
//  things you can do about it, INLINE on the lead page.
//
//  Deliberately not a popup, not a floating bubble, not a side panel. The whole
//  point is that it sits in the same column as the conversation it is reading:
//  a suggestion about a message you are looking at should not require opening
//  something, and an assistant you have to summon is one you forget exists.
//
//  DESIGN DECISIONS, stated:
//    • EVERY proposal shows its evidence. "Set the email to x@y.com" is a button
//      you have to verify by hand; "…because they wrote it in Tuesday's message"
//      is one you can accept. The `why` line is not decoration.
//    • NOTHING happens without a click. The model is wrong often enough that an
//      assistant which silently edited the CRM would be a liability, and the
//      damage would be discovered long after the conversation scrolled away.
//    • DISMISSALS STICK, per lead, per browser. A suggestion you have already
//      rejected reappearing on every visit is how these things become noise
//      people learn to ignore.
//    • It only asks the model when there is something new to read. The message
//      count is the cache key, so re-opening a lead you have already triaged
//      costs nothing.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Bell, Receipt, UserPen, MessageSquareQuote, Check, X, Loader, RefreshCw } from 'lucide-react';
import { aiAPI, leadsAPI } from '@/lib/api';

const FIELD_LABELS = {
  customer_name: 'name',
  email: 'email',
  address: 'address',
  estimated_value: 'estimated value',
  date_of_birth: 'date of birth',
  lead_source: 'lead source',
};

const META = {
  reminder: { Icon: Bell, tint: '#8b5cf6', verb: 'Set reminder' },
  invoice:  { Icon: Receipt, tint: '#10b981', verb: 'Draft invoice' },
  field:    { Icon: UserPen, tint: '#6366f1', verb: 'Save to lead' },
  ask:      { Icon: MessageSquareQuote, tint: '#f59e0b', verb: 'Use this message' },
};

const dismissKey = (leadId) => `wf_assist_dismissed_${leadId}`;
// A stable identity for a proposal, so a dismissal survives the model rewording
// the same suggestion on the next run.
const idOf = (p) =>
  p.type === 'field' ? `field:${p.field}:${p.value}`
  : p.type === 'ask' ? `ask:${p.field}`
  : p.type === 'invoice' ? `invoice:${p.amount}`
  : `reminder:${String(p.title).toLowerCase().slice(0, 40)}`;

export default function LeadAssistStrip({ lead, messageCount, onApplied, onDraftMessage, onDraftInvoice }) {
  const leadId = lead?.id;
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    if (!leadId) return;
    try { setDismissed(new Set(JSON.parse(localStorage.getItem(dismissKey(leadId)) || '[]'))); }
    catch { setDismissed(new Set()); }
  }, [leadId]);

  const run = useCallback(async (force) => {
    if (!leadId || !messageCount) return;
    // Re-reading a conversation that has not changed costs a metered AI call and
    // returns the same answer, so the message count gates it.
    const seenKey = `wf_assist_seen_${leadId}`;
    if (!force) {
      try { if (localStorage.getItem(seenKey) === String(messageCount)) return; } catch {}
    }
    setLoading(true); setErr('');
    try {
      const r = await aiAPI.assist(leadId);
      setProposals(r.data.proposals || []);
      try { localStorage.setItem(seenKey, String(messageCount)); } catch {}
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not read the conversation');
    } finally { setLoading(false); }
  }, [leadId, messageCount]);

  useEffect(() => { run(false); }, [run]);

  const dismiss = (p) => {
    const next = new Set(dismissed); next.add(idOf(p));
    setDismissed(next);
    try { localStorage.setItem(dismissKey(leadId), JSON.stringify([...next])); } catch {}
  };

  const accept = async (p) => {
    setBusy(idOf(p)); setErr('');
    try {
      if (p.type === 'field') {
        await leadsAPI.update(leadId, { [p.field]: p.value });
        onApplied?.(`${FIELD_LABELS[p.field] || p.field} saved`);
      } else if (p.type === 'reminder') {
        await leadsAPI.addReminder(leadId, {
          // The API stores reminder_date; title doubles as the message when the
          // caller does not supply one.
          reminder_date: p.due_at.slice(0, 19).replace('T', ' '),
          title: p.title,
          message: p.title,
        });
        onApplied?.('Reminder set');
      } else if (p.type === 'ask') {
        // Not sent — put into the composer. An assistant that messages a customer
        // on its own is a different product, and not one anybody asked for.
        onDraftMessage?.(p.question);
      } else if (p.type === 'invoice') {
        onDraftInvoice?.(p);
      }
      dismiss(p);
    } catch (e) {
      setErr(e.response?.data?.error || 'Could not apply that');
    } finally { setBusy(null); }
  };

  if (!leadId || !messageCount) return null;

  const shown = proposals.filter(p => !dismissed.has(idOf(p)));
  // Nothing to say and nothing loading: stay out of the way entirely rather than
  // occupying space with an empty box.
  if (!loading && !err && shown.length === 0) return null;

  return (
    <div className="wf-assist" role="region" aria-label="Assistant suggestions">
      <div className="wf-assist-head">
        <Sparkles size={14} className="wf-assist-spark" />
        <span className="wf-assist-title">
          {loading ? 'Reading the conversation…' : `${shown.length} suggestion${shown.length === 1 ? '' : 's'} from this chat`}
        </span>
        <button className="wf-assist-refresh" onClick={() => run(true)} disabled={loading}
                title="Read the conversation again" aria-label="Refresh suggestions">
          {loading ? <Loader size={13} className="wf-assist-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>

      {err && <p className="wf-assist-err">{err}</p>}

      <div className="wf-assist-list">
        {shown.map((p) => {
          const meta = META[p.type];
          const Icon = meta.Icon;
          const id = idOf(p);
          return (
            <div key={id} className="wf-assist-card">
              <span className="wf-assist-icon" style={{ background: `${meta.tint}22`, color: meta.tint }}>
                <Icon size={14} />
              </span>
              <div className="wf-assist-body">
                <p className="wf-assist-what">
                  {p.type === 'reminder' && <>{p.title} <span className="wf-assist-dim">· {new Date(p.due_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></>}
                  {p.type === 'invoice' && <>Invoice for {p.description} <span className="wf-assist-dim">· {Number(p.amount).toLocaleString()}</span></>}
                  {p.type === 'field' && <>Set {FIELD_LABELS[p.field] || p.field} to “{p.value}”{p.current ? <span className="wf-assist-dim"> · currently “{p.current}”</span> : null}</>}
                  {p.type === 'ask' && <>Ask for their {FIELD_LABELS[p.field] || p.field}</>}
                </p>
                {p.type === 'ask' && <p className="wf-assist-quote">“{p.question}”</p>}
                {/* The evidence. Without it this is a button you have to check by
                    hand, which is slower than doing the thing yourself. */}
                <p className="wf-assist-why">{p.why}</p>
              </div>
              <div className="wf-assist-actions">
                <button className="wf-assist-accept" onClick={() => accept(p)} disabled={busy === id}>
                  {busy === id ? <Loader size={12} className="wf-assist-spin" /> : <Check size={12} />} {meta.verb}
                </button>
                <button className="wf-assist-x" onClick={() => dismiss(p)} aria-label="Dismiss this suggestion" title="Dismiss">
                  <X size={13} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <style>{`
        .wf-assist {
          border: 1px solid var(--border); border-radius: 14px;
          background: var(--surface); margin-bottom: 14px; overflow: hidden;
        }
        .wf-assist-head {
          display: flex; align-items: center; gap: 8px; padding: 9px 13px;
          background: linear-gradient(90deg, rgba(99,102,241,0.10), transparent);
          border-bottom: 1px solid var(--border);
        }
        .wf-assist-spark { color: #6366f1; flex-shrink: 0; }
        .wf-assist-title { flex: 1; font-size: 12.5px; font-weight: 700; color: var(--text); }
        .wf-assist-refresh {
          width: 24px; height: 24px; display: grid; place-items: center;
          background: none; border: none; border-radius: 6px; color: var(--text-dim); cursor: pointer;
        }
        .wf-assist-refresh:hover:not(:disabled) { background: var(--surface2); color: var(--text); }
        .wf-assist-err { margin: 0; padding: 9px 13px; font-size: 12px; color: var(--danger-fg, #ef4444); }
        .wf-assist-list { display: flex; flex-direction: column; }
        .wf-assist-card {
          display: flex; align-items: flex-start; gap: 10px; padding: 11px 13px;
        }
        .wf-assist-card + .wf-assist-card { border-top: 1px solid var(--border); }
        .wf-assist-icon { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; flex-shrink: 0; }
        .wf-assist-body { flex: 1; min-width: 0; }
        .wf-assist-what { margin: 0; font-size: 13px; font-weight: 600; color: var(--text); line-height: 1.45; }
        .wf-assist-dim { font-weight: 400; color: var(--text-dim); }
        .wf-assist-quote {
          margin: 5px 0 0; padding: 6px 9px; border-radius: 7px;
          background: var(--surface2); font-size: 12.5px; color: var(--text-muted); line-height: 1.5;
        }
        .wf-assist-why { margin: 4px 0 0; font-size: 11.5px; color: var(--text-dim); line-height: 1.5; }
        .wf-assist-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .wf-assist-accept {
          display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;
          padding: 6px 11px; border-radius: 8px; border: 1px solid var(--border);
          background: var(--surface2); color: var(--text);
          font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .wf-assist-accept:hover:not(:disabled) { background: var(--accent); color: #fff; border-color: transparent; }
        .wf-assist-accept:disabled { opacity: 0.6; cursor: wait; }
        .wf-assist-x {
          width: 24px; height: 24px; display: grid; place-items: center;
          background: none; border: none; border-radius: 6px; color: var(--text-dim); cursor: pointer;
        }
        .wf-assist-x:hover { background: var(--surface2); color: var(--text); }
        .wf-assist-spin { animation: spin 0.8s linear infinite; }
        @media (max-width: 700px) {
          .wf-assist-card { flex-wrap: wrap; }
          .wf-assist-actions { width: 100%; justify-content: flex-end; }
        }
      `}</style>
    </div>
  );
}
