'use client';
import { useEffect, useState, useCallback } from 'react';
import { ccApi, fmtNum } from '@/lib/ccApi';
import { Card, Pill, Stat } from '@/components/control/ControlShell';
import { clickableRow, clickable } from '@/lib/a11y';

const KINDS = ['bug', 'feature', 'escalation', 'question'];
const PRIORITIES = ['low', 'medium', 'high'];
const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

function kindTone(k) { return ({ bug: 'red', feature: 'purple', escalation: 'amber', question: 'blue' })[k] || 'neutral'; }
function prioTone(p) { return ({ low: 'neutral', medium: 'blue', high: 'red' })[p] || 'neutral'; }
function statusTone(s) { return ({ open: 'amber', in_progress: 'blue', resolved: 'green', closed: 'neutral' })[s] || 'neutral'; }
function statusLabel(s) { return ({ open: 'open', in_progress: 'in progress', resolved: 'resolved', closed: 'closed' })[s] || s; }
function age(ts) {
  if (!ts) return '—';
  const ms = Date.now() - new Date(ts + 'Z').getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export default function Support() {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await ccApi.tickets({ status });
      setTickets(r.data.tickets || []);
    } catch { setTickets([]); }
    setLoading(false);
  }, [status]);

  const loadStats = useCallback(() => {
    ccApi.supportStats().then((r) => setStats(r.data)).catch(() => setStats(null));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const refresh = () => { load(); loadStats(); };
  const countFor = (s) => (stats?.byStatus || []).find((x) => x.status === s)?.c || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Support Operations</h1>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNew(true)} style={primaryBtn}>+ New ticket</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <Stat label="Open" value={fmtNum(countFor('open'))} accent="#fbbf24" />
        <Stat label="In progress" value={fmtNum(countFor('in_progress'))} accent="#60a5fa" />
        <Stat label="Resolved" value={fmtNum(countFor('resolved'))} accent="#34d399" />
        <Stat label="Avg resolution" value={stats?.avg_resolution_hours != null ? `${stats.avg_resolution_hours}h` : '—'} sub="across resolved tickets" />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map((f) => (
          <button key={f.key} onClick={() => setStatus(f.key)}
            style={{ ...segBtn, ...(status === f.key ? segActive : {}) }}>{f.label}</button>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-dim,#666)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .4 }}>
              {['Subject', 'Workspace', 'Kind', 'Priority', 'Status', 'Age'].map((h) => (
                <th key={h} style={{ padding: '11px 14px', borderBottom: '1px solid var(--border,#1e1e26)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} style={{ padding: 20, color: 'var(--text-dim,#666)' }}>Loading…</td></tr>}
            {!loading && !tickets.length && <tr><td colSpan={6} style={{ padding: 20, color: 'var(--text-dim,#666)' }}>No tickets.</td></tr>}
            {tickets.map((t) => (
              <tr key={t.id} {...clickableRow(() => setSelId(t.id))} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border,#1e1e26)' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg,#0a0a0f)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                <td style={td}><div style={{ fontWeight: 600 }}>{t.subject || 'Untitled'}</div></td>
                <td style={{ ...td, color: 'var(--text-muted,#9a9aa5)' }}>{t.workspace_name || '—'}</td>
                <td style={td}><Pill tone={kindTone(t.kind)}>{t.kind}</Pill></td>
                <td style={td}><Pill tone={prioTone(t.priority)}>{t.priority}</Pill></td>
                <td style={td}><Pill tone={statusTone(t.status)}>{statusLabel(t.status)}</Pill></td>
                <td style={{ ...td, color: 'var(--text-dim,#666)' }}>{age(t.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); refresh(); }} />}
      {selId && <TicketDetail id={selId} onClose={() => setSelId(null)} onChanged={refresh} />}
    </div>
  );
}

function NewTicketModal({ onClose, onCreated }) {
  const [wsQ, setWsQ] = useState('');
  const [wsResults, setWsResults] = useState([]);
  const [workspace, setWorkspace] = useState(null);
  const [kind, setKind] = useState('question');
  const [priority, setPriority] = useState('medium');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (workspace || wsQ.trim().length < 2) { setWsResults([]); return; }
    const tid = setTimeout(() => {
      ccApi.workspaces({ q: wsQ.trim(), limit: 6 }).then((r) => setWsResults(r.data.rows || [])).catch(() => setWsResults([]));
    }, 250);
    return () => clearTimeout(tid);
  }, [wsQ, workspace]);

  const submit = async () => {
    if (!subject.trim()) { alert('Subject is required'); return; }
    setBusy(true);
    try {
      await ccApi.createTicket({ workspace_id: workspace?.id || null, kind, priority, subject: subject.trim(), body: body.trim(), source: 'command-center' });
      onCreated();
    } catch (e) { alert(e.response?.data?.error || 'Failed to create ticket'); }
    setBusy(false);
  };

  return (
    <Modal title="New ticket" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Workspace (optional)">
          {workspace ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Pill tone="blue">{workspace.name || workspace.id}</Pill>
              <button onClick={() => { setWorkspace(null); setWsQ(''); }} style={linkBtn}>change</button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <input value={wsQ} onChange={(e) => setWsQ(e.target.value)} placeholder="Search workspace name / owner…" style={inp} />
              {wsResults.length > 0 && (
                <div style={dropdown}>
                  {wsResults.map((w) => (
                    <div key={w.id} {...clickable(() => { setWorkspace(w); setWsResults([]); })} style={dropItem}>
                      <span style={{ fontWeight: 600 }}>{w.name || 'Untitled'}</span>
                      <span style={{ color: 'var(--text-dim,#666)', fontSize: 11.5 }}>{w.owner_email || ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Kind" style={{ flex: 1 }}>
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={sel}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </Field>
          <Field label="Priority" style={{ flex: 1 }}>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={sel}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Subject">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary…" style={inp} />
        </Field>
        <Field label="Details">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="What's going on?" rows={5} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
          <button disabled={busy} onClick={submit} style={primaryBtn}>{busy ? 'Creating…' : 'Create ticket'}</button>
        </div>
      </div>
    </Modal>
  );
}

function TicketDetail({ id, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    ccApi.ticket(id).then((r) => setData(r.data)).catch(() => setData(null));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status) => {
    setBusy(true);
    try { await ccApi.updateTicket(id, { status }); load(); onChanged?.(); }
    catch (e) { alert(e.response?.data?.error || 'Failed'); }
    setBusy(false);
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try { await ccApi.ticketComment(id, { body: comment.trim(), internal }); setComment(''); load(); }
    catch (e) { alert(e.response?.data?.error || 'Failed'); }
    setBusy(false);
  };

  const t = data?.ticket;
  const comments = data?.comments || [];

  return (
    <Modal title={t?.subject || 'Ticket'} onClose={onClose} wide>
      {!data && <div style={{ color: 'var(--text-dim,#666)', fontSize: 13 }}>Loading…</div>}
      {t && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <Pill tone={kindTone(t.kind)}>{t.kind}</Pill>
            <Pill tone={prioTone(t.priority)}>{t.priority}</Pill>
            <Pill tone={statusTone(t.status)}>{statusLabel(t.status)}</Pill>
            {t.workspace_name && <span style={{ fontSize: 12, color: 'var(--text-muted,#9a9aa5)' }}>· {t.workspace_name}</span>}
            <span style={{ fontSize: 12, color: 'var(--text-dim,#666)' }}>· opened {age(t.created_at)} ago{t.admin_email ? ` by ${t.admin_email}` : ''}</span>
          </div>

          {t.body && (
            <Card style={{ background: 'var(--bg,#0a0a0f)' }}>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{t.body}</div>
            </Card>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button disabled={busy} onClick={() => setStatus('in_progress')} style={actionBtn('#60a5fa')}>Start</button>
            <button disabled={busy} onClick={() => setStatus('resolved')} style={actionBtn('#34d399')}>Resolve</button>
            <button disabled={busy} onClick={() => setStatus('closed')} style={actionBtn('#9a9aa5')}>Close</button>
          </div>

          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim,#666)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .4, marginBottom: 8 }}>Comments</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!comments.length && <div style={{ fontSize: 13, color: 'var(--text-dim,#666)' }}>No comments yet.</div>}
              {comments.map((c) => (
                <div key={c.id} style={{ borderLeft: `2px solid ${c.internal ? '#fbbf2455' : '#34d39955'}`, padding: '4px 0 4px 12px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{c.admin_email || 'admin'}</span>
                    <Pill tone={c.internal ? 'amber' : 'green'}>{c.internal ? 'internal' : 'public'}</Pill>
                    <span style={{ fontSize: 11, color: 'var(--text-dim,#666)' }}>{age(c.created_at)} ago</span>
                  </div>
                  <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{c.body}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment…" rows={3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted,#9a9aa5)', cursor: 'pointer' }}>
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note
              </label>
              <div style={{ flex: 1 }} />
              <button disabled={busy || !comment.trim()} onClick={addComment} style={primaryBtn}>Add comment</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', zIndex: 50, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--surface,#14141b)', border: '1px solid var(--border,#1e1e26)', borderRadius: 14, padding: 20, width: '100%', maxWidth: wide ? 640 : 480, maxHeight: '86vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>{title}</h2>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={ghostBtn}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <div style={{ fontSize: 11.5, color: 'var(--text-dim,#666)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .4, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = { width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--bg,#0a0a0f)', color: 'var(--text,#e8e8ea)', fontSize: 13 };
const sel = { ...inp };
const td = { padding: '11px 14px' };
const primaryBtn = { padding: '8px 14px', borderRadius: 9, border: '1px solid #818cf855', background: '#818cf81a', color: '#818cf8', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const ghostBtn = { padding: '7px 13px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text-muted,#9a9aa5)', fontSize: 13, cursor: 'pointer' };
const linkBtn = { background: 'none', border: 'none', color: 'var(--accent,#818cf8)', fontSize: 12, cursor: 'pointer', padding: 0 };
const segBtn = { padding: '7px 13px', borderRadius: 9, border: '1px solid var(--border,#1e1e26)', background: 'var(--surface,#14141b)', color: 'var(--text-muted,#9a9aa5)', fontSize: 13, cursor: 'pointer' };
const segActive = { borderColor: '#818cf855', background: '#818cf81a', color: '#818cf8', fontWeight: 600 };
const dropdown = { position: 'absolute', top: 42, left: 0, right: 0, background: 'var(--surface,#14141b)', border: '1px solid var(--border,#1e1e26)', borderRadius: 11, padding: 6, maxHeight: 240, overflow: 'auto', zIndex: 10, boxShadow: '0 16px 40px rgba(0,0,0,.5)' };
const dropItem = { display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px', borderRadius: 8, cursor: 'pointer' };
function actionBtn(color) { return { padding: '8px 14px', borderRadius: 9, border: `1px solid ${color}55`, background: `${color}1a`, color, fontWeight: 600, fontSize: 13, cursor: 'pointer' }; }
