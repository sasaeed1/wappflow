'use client';

import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, Plus, ArrowLeft, Send } from 'lucide-react';
import { supportAPI } from '@/lib/api';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Field, Input, Textarea, Select } from '@/components/ui/Field';
import { toast } from '@/components/ui/Toast';

// The customer side of the help desk (PROP-005 §E). Requests land in the founder's
// Command Center (Support + Inbox); replies come back here, to the bell and by email.
// Internal staff notes never leave the server. Deep link: /help?ticket=<id>.

const STATUS = {
  open:        { label: 'Open', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'warning' },
  resolved:    { label: 'Resolved', tone: 'success' },
  closed:      { label: 'Closed', tone: 'neutral' },
};
const KINDS = [['question', 'A question'], ['bug', 'Something is broken'], ['feature', 'A feature idea'], ['billing', 'Billing or my plan']];

const when = (s) => {
  if (!s) return '';
  const d = new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z');
  return isNaN(d) ? s : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};
const errMsg = (e, fallback) => e?.response?.data?.error || fallback;

export default function SupportDesk() {
  const [tickets, setTickets] = useState(null);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    supportAPI.list().then((r) => { setTickets(r.data.tickets || []); setFailed(false); }).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  // Read the deep link directly (useSearchParams would force a Suspense boundary).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('ticket');
    if (id) setOpenId(id);
  }, []);

  const awaiting = (tickets || []).filter((t) => t.last_author === 'admin' && (t.status === 'open' || t.status === 'in_progress')).length;

  return (
    <section aria-labelledby="support-desk-title" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', marginBottom: 24, boxShadow: 'var(--shadow)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-bg)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <LifeBuoy size={19} color="var(--accent-fg)" />
        </div>
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <h2 id="support-desk-title" style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Contact support</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '2px 0 0' }}>Can’t find the answer below? Ask us. We reply here and by email.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}><Plus size={15} /> New request</Button>
      </div>

      {failed && <p role="alert" style={{ fontSize: 13, color: 'var(--danger-fg)', margin: '14px 0 0' }}>Couldn’t load your requests. <button onClick={load} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 13 }}>Try again</button></p>}
      {tickets?.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 6px' }}>
            Your requests{awaiting ? ` · ${awaiting} with a new reply` : ''}
          </p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {tickets.slice(0, 8).map((t) => {
              const s = STATUS[t.status] || STATUS.open;
              const replied = t.last_author === 'admin' && (t.status === 'open' || t.status === 'in_progress');
              return (
                <li key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => setOpenId(t.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: replied ? 700 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)' }}>Updated {when(t.updated_at)}</span>
                    </span>
                    {replied && <Badge tone="accent" dot>New reply</Badge>}
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <NewRequest open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); load(); setOpenId(id); }} />
      <TicketThread id={openId} onClose={() => {
        setOpenId(null);
        if (new URLSearchParams(window.location.search).has('ticket')) window.history.replaceState(null, '', window.location.pathname);
      }} onChanged={load} />
    </section>
  );
}

function NewRequest({ open, onClose, onCreated }) {
  const [v, setV] = useState({ kind: 'question', subject: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (open) { setV({ kind: 'question', subject: '', body: '' }); setErr(''); } }, [open]);

  const submit = async (e) => {
    e?.preventDefault();
    if (!v.subject.trim() || !v.body.trim()) { setErr('Add a subject and describe the problem'); return; }
    setBusy(true); setErr('');
    try {
      const r = await supportAPI.create({ kind: v.kind, subject: v.subject.trim(), body: v.body.trim() });
      toast.success('Request sent', { description: 'We’ll reply here and by email.' });
      onCreated(r.data.id);
    } catch (e2) { setErr(errMsg(e2, 'Could not send your request. Try again.')); }
    setBusy(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="New support request" description="Tell us what’s going on. The more detail, the faster we can help." size="sm"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Send request</Button></>}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="This is about">
          <Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>
            {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Subject" required>
          <Input value={v.subject} maxLength={160} onChange={(e) => setV({ ...v, subject: e.target.value })} placeholder="e.g. Contract won’t send to my client" />
        </Field>
        <Field label="Details" required hint="What did you do, what happened, and what did you expect?">
          <Textarea rows={6} value={v.body} maxLength={10000} onChange={(e) => setV({ ...v, body: e.target.value })} />
        </Field>
        {err && <p role="alert" style={{ fontSize: 13, color: 'var(--danger-fg)', margin: 0 }}>{err}</p>}
      </form>
    </Modal>
  );
}

function TicketThread({ id, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    supportAPI.get(id).then((r) => { setD(r.data); setErr(''); }).catch((e) => setErr(errMsg(e, 'Could not open this request')));
  }, [id]);
  useEffect(() => { setD(null); setReply(''); setErr(''); load(); }, [load]);

  const send = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try { await supportAPI.reply(id, reply.trim()); setReply(''); load(); onChanged?.(); }
    catch (e) { toast.error(errMsg(e, 'Could not send your reply')); }
    setBusy(false);
  };

  const t = d?.ticket;
  const s = t ? (STATUS[t.status] || STATUS.open) : null;
  const done = t && (t.status === 'resolved' || t.status === 'closed');
  return (
    <Modal open={!!id} onClose={onClose} title={t?.subject || 'Support request'} size="md"
      footer={t ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <Textarea aria-label="Your reply" rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={done ? 'Still not fixed? Reply to reopen this request.' : 'Write a reply…'} />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <Button onClick={onClose}><ArrowLeft size={14} /> Back</Button>
            <Button variant="primary" loading={busy} disabled={!reply.trim()} onClick={send}><Send size={14} /> {done ? 'Reply & reopen' : 'Send reply'}</Button>
          </div>
        </div>
      ) : null}>
      {err && <p role="alert" style={{ fontSize: 13, color: 'var(--danger-fg)', margin: 0 }}>{err}</p>}
      {!err && !t && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Loading…</p>}
      {t && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--text-muted)' }}>
            <Badge tone={s.tone}>{s.label}</Badge> Opened {when(t.created_at)}
          </div>
          <Bubble who="You" text={t.body} at={t.created_at} mine />
          {d.comments.map((c) => (
            <Bubble key={c.id} who={c.author_type === 'customer' ? (c.customer_name || 'Your team') : 'WappFlow support'} text={c.body} at={c.created_at} mine={c.author_type === 'customer'} />
          ))}
          {!d.comments.length && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>We’ve got your request and will reply soon. You’ll get a notification and an email.</p>}
        </div>
      )}
    </Modal>
  );
}

function Bubble({ who, text, at, mine }) {
  return (
    <div style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', padding: '10px 13px', borderRadius: 12, background: mine ? 'var(--accent-bg)' : 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: mine ? 'var(--accent-fg)' : 'var(--text)', marginBottom: 3 }}>{who}</div>
      <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.55 }}>{text}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{when(at)}</div>
    </div>
  );
}
