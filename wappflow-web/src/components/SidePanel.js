'use client';

// Google-style right-side productivity dock (item 23): a thin icon rail pinned
// to the right edge that opens Calendar (agenda), Tasks and Notes/Keep panels.
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, CheckSquare, StickyNote, X, Plus, Trash2, Bell, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { myTasksAPI, quickNotesAPI, remindersAPI } from '../lib/api';
import { formatSmart } from '../lib/datetime';

const NOTE_COLORS = {
  yellow: '#fde68a', green: '#bbf7d0', blue: '#bfdbfe', pink: '#fbcfe8', purple: '#ddd6fe',
};
const RAIL = [
  { id: 'calendar', icon: Calendar, label: 'Calendar', color: '#6366f1' },
  { id: 'tasks', icon: CheckSquare, label: 'Tasks', color: '#10b981' },
  { id: 'notes', icon: StickyNote, label: 'Notes', color: '#f59e0b' },
];

function Spinner() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}>
    <div style={{ width: 26, height: 26, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
  </div>;
}
function Empty({ icon: Icon, text, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-dim)' }}>
      <Icon size={32} style={{ opacity: 0.35, marginBottom: 10 }} />
      <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)', margin: '0 0 3px' }}>{text}</p>
      <p style={{ fontSize: 12, margin: 0 }}>{sub}</p>
    </div>
  );
}

function CalendarPanel({ router }) {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    remindersAPI.getUpcoming()
      .then(r => setReminders(r.data.reminders || []))
      .catch(() => setReminders([]))
      .finally(() => setLoading(false));
  }, []);
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Upcoming</p>
      {loading ? <Spinner /> : reminders.length === 0 ? (
        <Empty icon={Calendar} text="Nothing scheduled" sub="Reminders from your leads appear here." />
      ) : reminders.map(r => (
        <div key={r.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 10, marginBottom: 8 }}>
          <Bell size={14} color="#6366f1" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{r.title || r.message || 'Reminder'}</p>
            <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '2px 0 0' }}>{r.customer_name ? r.customer_name + ' · ' : ''}{formatSmart(r.due_date || r.reminder_date)}</p>
          </div>
        </div>
      ))}
      <button onClick={() => router.push('/settings')}
        style={{ marginTop: 10, width: '100%', padding: '10px', borderRadius: 10, border: '1.5px dashed var(--border)', background: 'transparent', color: 'var(--text-dim)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
        Connect Google Calendar in Settings → Integrations
      </button>
    </div>
  );
}

function TasksPanel() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  useEffect(() => {
    myTasksAPI.getAll().then(r => setTasks(r.data.tasks || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    try { const r = await myTasksAPI.create({ title: t }); setTasks(p => [r.data, ...p]); } catch {}
  };
  const toggle = async (task) => {
    setTasks(p => p.map(x => x.id === task.id ? { ...x, done: task.done ? 0 : 1 } : x));
    try { await myTasksAPI.update(task.id, { done: !task.done }); } catch {}
  };
  const del = async (id) => {
    setTasks(p => p.filter(x => x.id !== id));
    try { await myTasksAPI.delete(id); } catch {}
  };
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }}
          placeholder="Add a task…"
          style={{ flex: 1, padding: '9px 11px', border: '1.5px solid var(--border)', borderRadius: 9, fontSize: 13, outline: 'none', background: 'var(--surface2)', color: 'var(--text)', boxSizing: 'border-box' }} />
        <button onClick={add} style={{ width: 36, borderRadius: 9, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Plus size={16} />
        </button>
      </div>
      {loading ? <Spinner /> : tasks.length === 0 ? (
        <Empty icon={CheckSquare} text="No tasks yet" sub="Add your to-dos above." />
      ) : tasks.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', background: 'var(--surface2)', borderRadius: 9, marginBottom: 6 }}>
          <button onClick={() => toggle(t)}
            style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${t.done ? '#10b981' : 'var(--border)'}`, background: t.done ? '#10b981' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            {!!t.done && <Check size={12} color="white" />}
          </button>
          <span style={{ flex: 1, fontSize: 13, color: t.done ? 'var(--text-dim)' : 'var(--text)', textDecoration: t.done ? 'line-through' : 'none', wordBreak: 'break-word' }}>{t.title}</span>
          <button onClick={() => del(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', display: 'flex', flexShrink: 0 }}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

function NoteCard({ note, onUpdate, onDelete }) {
  const [text, setText] = useState(note.content || '');
  const bg = NOTE_COLORS[note.color] || NOTE_COLORS.yellow;
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '10px 11px', marginBottom: 8 }}>
      <textarea value={text} onChange={e => setText(e.target.value)}
        onBlur={() => { if (text !== note.content) onUpdate(note.id, { content: text }); }}
        placeholder="Write something…" rows={3}
        style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', resize: 'vertical', fontSize: 13, color: '#1f2937', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
        {Object.keys(NOTE_COLORS).map(c => (
          <button key={c} onClick={() => onUpdate(note.id, { color: c })} title={c}
            style={{ width: 15, height: 15, borderRadius: '50%', background: NOTE_COLORS[c], border: note.color === c ? '2px solid #374151' : '1px solid rgba(0,0,0,0.15)', cursor: 'pointer', padding: 0 }} />
        ))}
        <button onClick={() => onDelete(note.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex' }}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function NotesPanel() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    quickNotesAPI.getAll().then(r => setNotes(r.data.notes || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  const add = async () => {
    try { const r = await quickNotesAPI.create({ content: '', color: 'yellow' }); setNotes(p => [r.data, ...p]); } catch {}
  };
  const update = async (id, patch) => {
    setNotes(p => p.map(n => n.id === id ? { ...n, ...patch } : n));
    try { await quickNotesAPI.update(id, patch); } catch {}
  };
  const del = async (id) => {
    setNotes(p => p.filter(n => n.id !== id));
    try { await quickNotesAPI.delete(id); } catch {}
  };
  return (
    <div>
      <button onClick={add}
        style={{ width: '100%', padding: '9px', borderRadius: 9, border: '1.5px dashed var(--border)', background: 'transparent', color: 'var(--text-dim)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Plus size={14} /> New note
      </button>
      {loading ? <Spinner /> : notes.length === 0 ? (
        <Empty icon={StickyNote} text="No notes yet" sub="Jot down quick thoughts here." />
      ) : notes.map(n => <NoteCard key={n.id} note={n} onUpdate={update} onDelete={del} />)}
    </div>
  );
}

export default function SidePanel() {
  const router = useRouter();
  const [open, setOpen] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem('wf_sidepanel_collapsed') === '1'); } catch {}
    const onKey = (e) => { if (e.key === 'Escape') setOpen(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Collapse tucks the rail into a thin edge tab; the choice is remembered.
  const setCollapsedPersist = (v) => {
    setCollapsed(v);
    if (v) setOpen(null);
    try { localStorage.setItem('wf_sidepanel_collapsed', v ? '1' : '0'); } catch {}
  };

  return (
    <>
      {collapsed ? (
        <button onClick={() => setCollapsedPersist(false)} title="Show Calendar / Tasks / Notes"
          style={{ position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 850, width: 20, height: 46, borderRadius: '10px 0 0 10px', border: '1.5px solid var(--border)', borderRight: 'none', background: 'var(--surface)', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '-4px 0 16px rgba(0,0,0,0.10)' }}>
          <ChevronLeft size={15} />
        </button>
      ) : (
        <div style={{ position: 'fixed', right: 0, top: '50%', transform: 'translateY(-50%)', zIndex: 850, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRight: 'none', borderRadius: '14px 0 0 14px', padding: '8px 6px', boxShadow: '-4px 0 20px rgba(0,0,0,0.12)' }}>
          <button onClick={() => setCollapsedPersist(true)} title="Collapse panel"
            style={{ width: 40, height: 22, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', color: 'var(--text-dim)' }}>
            <ChevronRight size={15} />
          </button>
          {RAIL.map(r => (
            <button key={r.id} onClick={() => setOpen(open === r.id ? null : r.id)} title={r.label}
              style={{ width: 40, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: open === r.id ? r.color : 'var(--surface2)', color: open === r.id ? 'white' : 'var(--text-dim)', transition: 'all 0.15s' }}>
              <r.icon size={18} />
            </button>
          ))}
        </div>
      )}

      {open && (
        <div style={{ position: 'fixed', right: 58, top: 72, bottom: 90, width: 340, maxWidth: 'calc(100vw - 80px)', zIndex: 851, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden', animation: 'wfPanelIn 0.18s ease' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{RAIL.find(r => r.id === open)?.label}</span>
            <button onClick={() => setOpen(null)} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
              <X size={16} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {open === 'calendar' && <CalendarPanel router={router} />}
            {open === 'tasks' && <TasksPanel />}
            {open === 'notes' && <NotesPanel />}
          </div>
        </div>
      )}

      <style>{`@keyframes wfPanelIn { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </>
  );
}
