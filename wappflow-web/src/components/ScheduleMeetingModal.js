'use client';

import { useEffect, useState } from 'react';
import { Calendar, Video, Copy, Check, ExternalLink, Loader2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import api from '@/lib/api';

/**
 * ScheduleMeetingModal — schedule a meeting with a lead.
 *
 * Modes:
 *   - Google Calendar (creates real event with Google Meet link, sends invite to lead's email)
 *   - Calendly (sends the workspace's Calendly URL to the lead)
 *
 * Batch C migration: the styled-jsx overlay sat at z-index 9998, ABOVE the confirm
 * dialog (1300) — its own success/error dialogs rendered invisibly underneath while
 * capturing Enter/Escape. Now a Modal-primitive adopter on --z-modal; outcome notices
 * are toasts; the hardcoded #14161f palette is tokenized so it themes in light mode.
 */
export default function ScheduleMeetingModal({ open, onClose, lead, onScheduled }) {
  const [tab, setTab] = useState('google'); // google | calendly
  const [integrations, setIntegrations] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState(() => {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    next.setMinutes(0, 0, 0);
    const yyyy = next.getFullYear();
    const mm = String(next.getMonth() + 1).padStart(2, '0');
    const dd = String(next.getDate()).padStart(2, '0');
    const hh = String(next.getHours()).padStart(2, '0');
    return {
      title: lead?.name ? `Meeting with ${lead.name}` : 'Meeting',
      date: `${yyyy}-${mm}-${dd}`,
      time: `${hh}:00`,
      duration: 30,
      notes: '',
      sendInvite: true,
    };
  });

  useEffect(() => {
    if (!open) return;
    api.get('/integrations/status').then(r => setIntegrations(r.data)).catch(() => setIntegrations({}));
  }, [open]);

  if (!open) return null;

  const googleConnected = integrations?.googleCalendar?.connected;
  const calendlyUrl = integrations?.calendly?.url;

  async function handleGoogleSchedule(e) {
    e.preventDefault();
    if (!googleConnected) {
      toast.warning('Google Calendar not connected', { description: 'Connect your Google Calendar in Settings → Integrations first.' });
      return;
    }
    setLoading(true);
    try {
      const startsAt = new Date(`${form.date}T${form.time}:00`);
      const endsAt = new Date(startsAt.getTime() + form.duration * 60 * 1000);
      const res = await api.post(`/leads/${lead.id}/meetings`, {
        provider: 'google',
        title: form.title,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        notes: form.notes,
        send_invite: form.sendInvite,
      });
      toast.success('Meeting scheduled', {
        description: 'A Google Meet event has been added to your calendar.' + (form.sendInvite && lead.email ? ` Invite sent to ${lead.email}.` : ''),
      });
      onScheduled?.(res.data);
      onClose();
    } catch (err) {
      toast.error('Could not schedule', { description: err.response?.data?.error || err.message || 'Unknown error' });
    } finally {
      setLoading(false);
    }
  }

  async function copyCalendlyLink() {
    if (!calendlyUrl) return;
    try {
      await navigator.clipboard.writeText(calendlyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  async function sendCalendlyToLead() {
    if (!calendlyUrl) return;
    setLoading(true);
    try {
      await api.post(`/leads/${lead.id}/messages`, {
        body: `Hi ${lead.name || 'there'}! Pick a time that works for you: ${calendlyUrl}`,
        channel: 'whatsapp',
      });
      toast.success('Sent', { description: 'Calendly link sent to the lead on WhatsApp.' });
      onClose();
    } catch (err) {
      toast.error('Could not send', { description: err.response?.data?.error || 'Send failed' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open onClose={onClose} labelledBy="sm-title" size="sm" style={{ maxWidth: 540 }} dismissable={!loading}>
      <div className="sm-body">
        <div className="sm-head">
          <div className="sm-icon"><Calendar size={20} /></div>
          <div>
            <div className="sm-title" id="sm-title">Schedule a meeting</div>
            <div className="sm-sub">{lead?.name ? `with ${lead.name}` : 'with this lead'}</div>
          </div>
        </div>

        <div className="sm-tabs">
          <button className={`sm-tab ${tab === 'google' ? 'on' : ''}`} onClick={() => setTab('google')}>
            <Video size={14} /> Google Meet
          </button>
          <button className={`sm-tab ${tab === 'calendly' ? 'on' : ''}`} onClick={() => setTab('calendly')}>
            <Calendar size={14} /> Calendly link
          </button>
        </div>

        {tab === 'google' && (
          <>
            {!googleConnected && integrations !== null && (
              <div className="sm-warn">
                Google Calendar isn&apos;t connected. <a href="/settings?tab=integrations">Connect in Settings →</a>
              </div>
            )}
            <form onSubmit={handleGoogleSchedule} className="sm-form">
              <div className="sm-field">
                <label>Title</label>
                <input aria-label="Title"
                  type="text"
                  data-autofocus
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
              </div>

              <div className="sm-row">
                <div className="sm-field">
                  <label>Date</label>
                  <input aria-label="Date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                  />
                </div>
                <div className="sm-field">
                  <label>Time</label>
                  <input aria-label="Time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    required
                  />
                </div>
                <div className="sm-field" style={{ maxWidth: 120 }}>
                  <label>Duration</label>
                  <select aria-label="Duration"
                    value={form.duration}
                    onChange={(e) => setForm({ ...form, duration: parseInt(e.target.value, 10) })}
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                  </select>
                </div>
              </div>

              <div className="sm-field">
                <label>Notes (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Agenda, dial-in instructions, etc."
                />
              </div>

              {lead?.email && (
                <label className="sm-checkbox">
                  <input
                    type="checkbox"
                    checked={form.sendInvite}
                    onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })}
                  />
                  <span>Send calendar invite to <strong>{lead.email}</strong></span>
                </label>
              )}

              <button type="submit" className="sm-submit" disabled={loading || !googleConnected}>
                {loading
                  ? <><Loader2 size={15} className="sm-spin" /> Scheduling…</>
                  : <><Video size={15} /> Create event with Google Meet</>}
              </button>
            </form>
          </>
        )}

        {tab === 'calendly' && (
          <div className="sm-cly">
            {!calendlyUrl ? (
              <div className="sm-empty">
                <p>No Calendly URL set.</p>
                <a href="/settings?tab=integrations" className="sm-link">Add your Calendly URL in Settings →</a>
              </div>
            ) : (
              <>
                <div className="sm-cly-url">
                  <span>Your Calendly</span>
                  <code>{calendlyUrl}</code>
                </div>
                <div className="sm-cly-actions">
                  <button onClick={copyCalendlyLink} className="sm-btn sm-btn-ghost">
                    {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy link</>}
                  </button>
                  <a href={calendlyUrl} target="_blank" rel="noopener noreferrer" className="sm-btn sm-btn-ghost">
                    <ExternalLink size={14} /> Open
                  </a>
                  <button onClick={sendCalendlyToLead} className="sm-btn sm-btn-primary" disabled={loading}>
                    {loading ? <><Loader2 size={14} className="sm-spin" /> Sending…</> : <>Send to lead on WhatsApp</>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <style>{`
          .sm-head { display: flex; gap: 14px; align-items: center; margin-bottom: 18px; }
          .sm-icon {
            width: 40px; height: 40px;
            border-radius: 10px;
            background: linear-gradient(135deg, var(--accent), #a855f7);
            color: var(--on-accent);
            display: grid; place-items: center;
          }
          .sm-title { font-size: 18px; font-weight: 700; color: var(--text); }
          .sm-sub { font-size: 13px; color: var(--text-dim); margin-top: 2px; }

          .sm-tabs { display: flex; gap: 4px; padding: 4px; background: var(--surface2); border-radius: 10px; margin-bottom: 18px; }
          .sm-tab {
            flex: 1;
            display: inline-flex; align-items: center; justify-content: center; gap: 6px;
            padding: 9px 12px;
            background: none; border: none;
            color: var(--text-dim); font-size: 13px; font-weight: 600;
            border-radius: 7px;
            cursor: pointer;
            font-family: inherit;
            transition: all 0.15s;
          }
          .sm-tab.on { background: var(--accent-bg); color: var(--accent-fg); box-shadow: inset 0 0 0 1px var(--accent-light); }

          .sm-form { display: flex; flex-direction: column; gap: 12px; }
          .sm-row { display: flex; gap: 10px; }
          .sm-row .sm-field { flex: 1; min-width: 0; }
          .sm-field { display: flex; flex-direction: column; gap: 5px; }
          .sm-field label { font-size: 12px; font-weight: 600; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.04em; }
          .sm-field input, .sm-field select, .sm-field textarea {
            padding: 10px 12px;
            background: var(--surface2);
            border: 1px solid var(--border);
            border-radius: 9px;
            color: var(--text);
            font-size: 14px;
            font-family: inherit;
            outline: none;
            transition: all 0.15s;
          }
          .sm-field input:focus, .sm-field select:focus, .sm-field textarea:focus {
            border-color: var(--accent);
            box-shadow: 0 0 0 3px var(--accent-light);
          }
          .sm-checkbox { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-dim); }
          .sm-checkbox strong { color: var(--text); }

          .sm-submit {
            margin-top: 6px;
            padding: 13px;
            background: linear-gradient(135deg, var(--accent), #a855f7);
            color: var(--on-accent);
            border: none;
            border-radius: 10px;
            font-size: 14px; font-weight: 700;
            cursor: pointer;
            display: flex; align-items: center; justify-content: center; gap: 8px;
            font-family: inherit;
            transition: all 0.15s;
            box-shadow: var(--elev-1);
          }
          .sm-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: var(--elev-2); }
          .sm-submit:disabled { opacity: 0.6; cursor: not-allowed; }
          .sm-spin { animation: sm-spin 1s linear infinite; }
          @keyframes sm-spin { to { transform: rotate(360deg); } }

          .sm-warn {
            padding: 10px 14px;
            background: var(--warning-bg);
            border: 1px solid var(--warning-border);
            color: var(--warning-fg);
            border-radius: 9px;
            font-size: 13px;
            margin-bottom: 14px;
          }
          .sm-warn a { color: var(--warning-fg); font-weight: 600; }

          .sm-cly { display: flex; flex-direction: column; gap: 16px; }
          .sm-cly-url {
            padding: 14px;
            background: var(--surface2);
            border: 1px solid var(--border);
            border-radius: 10px;
          }
          .sm-cly-url span { display: block; font-size: 11px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
          .sm-cly-url code { font-size: 13px; color: var(--accent-fg); word-break: break-all; }
          .sm-cly-actions { display: flex; gap: 8px; flex-wrap: wrap; }
          .sm-btn {
            display: inline-flex; align-items: center; gap: 6px;
            padding: 9px 14px;
            border-radius: 9px;
            font-size: 13px; font-weight: 600;
            cursor: pointer;
            border: none;
            font-family: inherit;
            transition: all 0.15s;
          }
          .sm-btn-ghost {
            background: var(--surface2);
            color: var(--text);
            border: 1px solid var(--border);
            text-decoration: none;
          }
          .sm-btn-ghost:hover { background: var(--border); }
          .sm-btn-primary {
            background: linear-gradient(135deg, var(--accent), #a855f7);
            color: var(--on-accent);
          }
          .sm-empty { text-align: center; padding: 24px; }
          .sm-empty p { color: var(--text-dim); margin: 0 0 8px; }
          .sm-link { color: var(--accent); font-weight: 600; }
        `}</style>
      </div>
    </Modal>
  );
}
