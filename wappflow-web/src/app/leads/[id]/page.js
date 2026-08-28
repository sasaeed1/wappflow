'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Phone, MessageSquare, Calendar, DollarSign,
  Edit2, Save, X, Plus, Clock, CheckCircle, StickyNote,
  Bell, Trash2, AlertTriangle, TrendingUp, UserCheck,
  Trophy, ThumbsDown, Send, Paperclip, Bold,
  Italic, List, Zap, ChevronDown, Tag, Star,
  Mail, MapPin, User, Smile, Mic, MicOff, Square,
  FileText, Play, Volume2, Globe, Hash,
  ChevronRight, Activity, Receipt, Workflow, RefreshCw,
  Layers, Link2, GitMerge, Network, Lock, MessageCircle,
  Camera, MonitorSmartphone, Video,
  FileSignature, Banknote, ShoppingBag, Film, Eye
} from 'lucide-react';
import {
  leadsAPI, presetsAPI, tagsAPI, emailTemplatesAPI,
  invoicesAPI, emailWorkflowsAPI, teamAPI, settingsAPI,
  leadEmailsAPI, leadChannelsAPI, leadRelationsAPI, timelineAPI, aiAPI, lostReasonsAPI,
  displayPhone, formatCurrency, BASE_URL, mediaAPI, mediaUrl,
} from '../../../lib/api';
import { formatSmart, formatDateTime, formatRelative, formatFull, formatDate, formatTime } from '../../../lib/datetime';
import { markLeadSeen } from '../../../lib/unread';
import ScheduleMeetingModal from '@/components/ScheduleMeetingModal';
import SendInvoiceModal from '@/components/SendInvoiceModal';
import ContactActions from '@/components/ContactActions';
import { useConfirm } from '@/lib/confirm';
import { TagChip, TagPicker } from '../../../components/TagPicker';
import RoomPanel from '@/components/RoomPanel';
import { buildInvoiceHTML } from '@/lib/invoiceDoc';
import { useRealtime } from '@/components/shell/realtime';
import { clickable } from '@/lib/a11y';

// Click-to-edit field — any lead detail can be edited in place (item 26):
// click the value, it becomes an input/select, saves on blur/Enter, Esc cancels.
function InlineEditField({ icon: Icon, color, bg, label, value, display, type = 'text', selectOptions, placeholder, onSave, heading }) {
  const norm = (v) => (type === 'date' && v ? String(v).slice(0, 10) : (v ?? ''));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(norm(value));
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!editing) setDraft(norm(value)); }, [value]);

  const commitValue = async (val) => {
    if (String(val) === String(norm(value))) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(val); setEditing(false); }
    catch (e) { /* keep the field open so the user can retry */ }
    finally { setSaving(false); }
  };
  const cancel = () => { setDraft(norm(value)); setEditing(false); };

  if (editing) {
    const fieldStyle = { padding: '6px 9px', border: `1.5px solid ${color || 'var(--accent)'}`, borderRadius: 8, fontSize: 13, outline: 'none', background: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' };
    const field = type === 'select' ? (
      <select autoFocus value={draft} disabled={saving}
        onChange={e => { setDraft(e.target.value); commitValue(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
        style={{ ...fieldStyle, flex: 1, minWidth: 0 }}>
        {(selectOptions || []).map(o => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
      </select>
    ) : (
      <input autoFocus type={type} value={draft} placeholder={placeholder || label} disabled={saving}
        onChange={e => setDraft(e.target.value)} onBlur={() => commitValue(draft)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === 'Escape') cancel(); }}
        style={{ ...fieldStyle, flex: 1, minWidth: 0, textAlign: heading ? 'center' : 'left', fontWeight: heading ? 800 : 400, fontSize: heading ? 16 : 13 }} />
    );
    if (heading) return <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: 8 }}>{field}</div>;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={13} color={color} />
        </div>
        {field}
        {saving && <div style={{ width: 14, height: 14, border: '2px solid var(--border)', borderTopColor: color, borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />}
      </div>
    );
  }

  if (heading) {
    return (
      <h2 onClick={() => setEditing(true)} title="Click to edit name"
        style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px', cursor: 'pointer', borderRadius: 6, padding: '2px 8px', transition: 'background 0.12s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        {value || 'Unknown'}
      </h2>
    );
  }

  return (
    <div {...clickable(() => setEditing(true))} title={`Click to edit ${label.toLowerCase()}`}
      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderRadius: 8, padding: 3, margin: -3, transition: 'background 0.12s' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={13} color={color} />
      </div>
      {value
        ? <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, wordBreak: 'break-word', flex: 1, minWidth: 0 }}>{display ?? value}</span>
        : <span style={{ fontSize: 13, color: 'var(--text-dim)', fontStyle: 'italic', flex: 1, minWidth: 0 }}>Add {label.toLowerCase()}</span>}
      <Edit2 size={11} color="var(--text-dim)" style={{ flexShrink: 0, opacity: 0.55 }} />
    </div>
  );
}

const STATUS_META = {
  'New':           { dot: '#6366f1', bg: 'rgba(99,102,241,0.15)',  text: '#818cf8', label: 'New' },
  'Contacted':     { dot: '#06b6d4', bg: 'rgba(6,182,212,0.10)',  text: '#0e7490', label: 'Contacted' },
  'Interested':    { dot: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24', label: 'Interested' },
  'Negotiating':   { dot: '#f97316', bg: 'rgba(249,115,22,0.10)',  text: '#c2410c', label: 'Negotiating' },
  'Closed - Won':  { dot: '#10b981', bg: 'rgba(16,185,129,0.15)',  text: '#34d399', label: '🏆 Won' },
  'Closed - Lost': { dot: '#ef4444', bg: 'rgba(239,68,68,0.15)',   text: '#f87171', label: '❌ Lost' },
};
const PIPELINE_STEPS = ['New','Contacted','Interested','Negotiating'];
const LOST_REASONS = ['Price too high','Went with competitor','No longer interested','No budget','No response','Other'];
const LEAD_SOURCES = ['WhatsApp','Instagram','Facebook','Website','Referral','Cold Call','Email','Walk-in','Other'];

const EMOJI_LIST = [
  '😊','😂','❤️','👍','👋','🙏','😍','🔥','✅','⭐',
  '💯','🎉','😎','🤝','💪','📞','📱','💰','🏠','🚀',
  '👀','😅','🤣','😢','😮','🙌','💡','🔍','🎯','⚡',
  '✨','🌟','💎','🔒','📊','📈','📉','🗓️','⏰','🔔'
];

function wrapSelection(textarea, before, after) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const replacement = before + selected + (after || before);
  const newVal = textarea.value.slice(0, start) + replacement + textarea.value.slice(end);
  return { value: newVal, cursor: start + replacement.length };
}

function EmailBodyRow({ em }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <div style={{ padding: '0 16px 4px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setOpen(v => !v)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          {open ? '▲ Collapse' : '▼ Expand'}
        </button>
      </div>
      {open && (
        <div style={{ padding: '8px 16px 14px' }}>
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}
            dangerouslySetInnerHTML={{ __html: em.body || '' }} />
        </div>
      )}
    </div>
  );
}

// Image bubble that gracefully degrades to a clickable file-chip when the image
// 404s or fails to load (broken filenames, missing files, etc.). The console
// gets a one-line warn with the failed URL so the dev can find the issue.
function ImageMessage({ src, onOpen }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    const fname = decodeURIComponent((src.split('/').pop() || 'image').split('?')[0]).replace(/^\d+-/, '');
    return (
      <a href={src} target="_blank" rel="noopener noreferrer"
         style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.06)', borderRadius: 10, textDecoration: 'none', color: 'var(--text)', minWidth: 180 }}>
        <FileText size={22} color="#ef4444" style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{fname}</p>
          <p style={{ margin: 0, fontSize: 10, color: '#ef4444' }}>Image failed to load — tap to open</p>
        </div>
      </a>
    );
  }
  return (
    <div
      {...clickable(onOpen)}
      style={{ cursor: 'pointer', position: 'relative', display: 'inline-block', borderRadius: 8, overflow: 'hidden' }}
      title="Click to view full size"
    >
      <img
        src={src}
        alt="image"
        onError={() => { console.warn('Image failed to load:', src); setFailed(true); }}
        style={{ display: 'block', maxWidth: 220, maxHeight: 160, objectFit: 'cover', borderRadius: 8 }}
      />
      <div style={{ position: 'absolute', bottom: 5, right: 7, background: 'rgba(0,0,0,0.45)', borderRadius: 4, padding: '1px 5px', fontSize: 10, color: 'white' }}>
        View
      </div>
    </div>
  );
}

function Modal({ children, maxWidth = 440 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div className="r-modal" style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.2)', maxWidth, width: '100%', padding: 30 }}>
        {children}
      </div>
    </div>
  );
}

function DeleteModal({ name, onConfirm, onCancel, loading }) {
  return (
    <Modal>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AlertTriangle size={22} color="#ef4444" />
        </div>
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Move to Trash?</p>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Restorable within 90 days</p>
        </div>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>Are you sure you want to trash <strong>{name}</strong>?</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '11px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 12, background: '#ef4444', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Moving...' : 'Move to Trash'}
        </button>
      </div>
    </Modal>
  );
}

function WonModal({ name, onConfirm, onCancel, loading, currencySymbol }) {
  const [amount, setAmount] = useState('');
  return (
    <Modal>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trophy size={22} color="#10b981" />
        </div>
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🏆 Close as Won!</p>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>{name}</p>
        </div>
      </div>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>Sale Amount</label>
      <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <span style={{ padding: '12px 16px', background: 'var(--surface2)', color: 'var(--text-muted)', fontWeight: 700, fontSize: 14, borderRight: '1.5px solid var(--border)' }}>{currencySymbol}</span>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount..." autoFocus
          style={{ flex: 1, padding: '12px 16px', border: 'none', outline: 'none', fontSize: 16, fontWeight: 700 }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '11px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button onClick={() => onConfirm(amount)} disabled={loading} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 12, background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Saving...' : '🏆 Mark as Won'}
        </button>
      </div>
    </Modal>
  );
}

function LostModal({ name, onConfirm, onCancel, loading }) {
  const [reasons, setReasons] = useState(LOST_REASONS);
  const [reason, setReason] = useState(LOST_REASONS[0] || '');
  useEffect(() => {
    lostReasonsAPI.getAll()
      .then(res => {
        const custom = (res.data?.reasons || []).map(r => r.reason).filter(Boolean);
        if (custom.length) { setReasons(custom); setReason(custom[0]); }
      })
      .catch(() => {});
  }, []);
  return (
    <Modal>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ThumbsDown size={22} color="#ef4444" />
        </div>
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Close as Lost</p>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>{name}</p>
        </div>
      </div>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 10 }}>Reason</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {reasons.map(r => (
          <button key={r} onClick={() => setReason(r)} style={{ padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${reason === r ? '#ef4444' : 'var(--border)'}`, background: reason === r ? 'rgba(239,68,68,0.12)' : 'var(--surface)', color: reason === r ? '#ef4444' : 'var(--text-muted)', fontWeight: reason === r ? 700 : 500, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}>{r}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '11px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button onClick={() => onConfirm(reason)} disabled={loading} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 12, background: '#ef4444', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Saving...' : 'Mark as Lost'}
        </button>
      </div>
    </Modal>
  );
}

// ── Invoice Modal ─────────────────────────────────────────────────────────────
// `invoice` present = editing an existing one. The create and edit forms were
// never going to differ — same fields, same totals, same preview — and keeping
// one component is what stops the edit form drifting away from the create form
// the first time either gains a field.
function InvoiceModal({ lead, company, invoice, onClose, onSaved }) {
  const confirm = useConfirm();
  const editing = !!invoice;
  const [items, setItems] = useState(() => (
    invoice?.items?.length
      ? invoice.items.map((it) => ({ description: it.description || '', qty: it.qty ?? 1, rate: it.rate ?? 0 }))
      : [{ description: '', qty: 1, rate: 0 }]
  ));
  const [notes, setNotes] = useState(invoice?.notes || '');
  const [dueDate, setDueDate] = useState(String(invoice?.due_date || '').slice(0, 10));
  const [taxRate, setTaxRate] = useState(invoice?.tax_rate ?? company?.tax_rate ?? 0);
  const [saving, setSaving] = useState(false);

  const sym = company?.currency_symbol || '$';
  const subtotal = items.reduce((acc, it) => acc + (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0), 0);
  const taxAmount = subtotal * (parseFloat(taxRate) / 100);
  const total = subtotal + taxAmount;

  const updateItem = (i, field, val) => {
    const updated = [...items];
    updated[i] = { ...updated[i], [field]: val };
    setItems(updated);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        lead_id: lead.id,
        customer_name: lead.customer_name,
        customer_email: lead.email,
        customer_phone: displayPhone(lead.customer_phone, lead.platform_source),
        items: items.map(it => ({ ...it, amount: (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0) })),
        subtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
        due_date: dueDate, notes,
        // Editing must not silently reset a sent invoice back to draft. (The
        // route refuses a direct flip TO paid regardless — that goes through the
        // payments ledger — so echoing the current status back is safe.)
        status: editing ? invoice.status : 'draft',
      };
      if (editing) await invoicesAPI.update(invoice.id, payload);
      else await invoicesAPI.create(payload);
      onSaved();
      onClose();
    } catch (e) { await confirm({ title: editing ? 'Could not save invoice' : 'Could not create invoice', message: e.message, alertOnly: true, tone: 'danger' }); } finally { setSaving(false); }
  };

  // Phase 6: this used to hand-roll its own invoice HTML and interpolate the
  // customer name, every line-item description and the notes field RAW into a
  // same-origin document.write — and a lead's name comes from whatever a stranger
  // types into the public booking form. It now renders the one shared, escaped
  // document, which also means a printed draft finally looks like the real
  // invoice instead of a stripped-down table with no branding or invoice number.
  const handlePrint = () => {
    const draft = {
      invoice_number: invoice?.invoice_number || '',  // unsaved: the template falls back gracefully
      customer_name: lead.customer_name,
      customer_phone: lead.customer_phone,
      customer_email: lead.email,
      items: items.map((it) => ({
        description: it.description,
        qty: it.qty,
        rate: it.rate,
        amount: (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0),
      })),
      subtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
      currency_symbol: sym,
      due_date: dueDate || null,
      notes,
      status: 'draft',
      created_at: null,                         // renders as an em dash, not a wrong date
    };
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(buildInvoiceHTML(draft, company, BASE_URL));
    win.document.close();
    win.print();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
      <div className="r-modal" style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.2)', maxWidth: 680, width: '100%', padding: 32, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={22} color="#f59e0b" />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{editing ? `Edit ${invoice.invoice_number || 'Invoice'}` : 'Create Invoice'}</h2>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>For {lead.customer_name}</p>
            </div>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer' }}>
            <X size={18} color="#6b7280" />
          </button>
        </div>

        {/* Line items */}
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Line Items</p>
        <div className="r-scroll-x">
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)' }}>
              {['Description', 'Qty', `Rate (${sym})`, `Amount`].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{h}</th>
              ))}
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td style={{ padding: '6px 4px' }}>
                  <input value={item.description} onChange={e => updateItem(i, 'description', e.target.value)} placeholder="Item description..."
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </td>
                <td style={{ padding: '6px 4px', width: 70 }}>
                  <input type="number" value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} min="1"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                </td>
                <td style={{ padding: '6px 4px', width: 110 }}>
                  <input type="number" value={item.rate} onChange={e => updateItem(i, 'rate', e.target.value)} min="0" step="0.01"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                </td>
                <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                  {sym}{((parseFloat(item.qty)||0) * (parseFloat(item.rate)||0)).toFixed(2)}
                </td>
                <td style={{ padding: '6px 4px' }}>
                  {items.length > 1 && (
                    <button aria-label="Close" onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                      <X size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <button onClick={() => setItems([...items, { description: '', qty: 1, rate: 0 }])} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1.5px dashed #d1d5db', borderRadius: 8, background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 20 }}>
          <Plus size={14} /> Add Line Item
        </button>

        {/* Totals */}
        <div style={{ background: 'var(--surface2)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Subtotal</span>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{sym}{subtotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{company?.tax_name || 'Tax'}</span>
              <input type="number" value={taxRate} onChange={e => setTaxRate(parseFloat(e.target.value) || 0)} min="0" max="100" step="0.1"
                style={{ width: 60, padding: '4px 8px', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 12, outline: 'none' }} />
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>%</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{sym}{taxAmount.toFixed(2)}</span>
          </div>
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Total</span>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#10b981' }}>{sym}{total.toFixed(2)}</span>
          </div>
        </div>

        <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Due Date</label>
            <input aria-label="Due Date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment terms, notes..."
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handlePrint} style={{ padding: '12px 20px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <FileText size={15} /> Print / PDF
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: '12px', border: 'none', borderRadius: 12,
            background: saving ? '#9ca3af' : 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14
          }}>
            {saving ? 'Saving...' : editing ? 'Save changes' : 'Save Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Email Workflow Modal ───────────────────────────────────────────────────────
function EmailWorkflowModal({ lead, templates, onClose, onSaved }) {
  const confirm = useConfirm();
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [saving, setSaving] = useState(false);

  const handle = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      await leadsAPI.createEmailWorkflow(lead.id, { template_id: selectedTemplate, scheduled_at: scheduledAt });
      onSaved();
      onClose();
    } catch (e) { await confirm({ title: 'Could not schedule workflow', message: e.message, alertOnly: true, tone: 'danger' }); } finally { setSaving(false); }
  };

  return (
    <Modal>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Start Email Workflow</h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>For {lead.customer_name}</p>
        </div>
        <button aria-label="Close" onClick={onClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer' }}><X size={18} color="#6b7280" /></button>
      </div>

      {templates.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', background: 'var(--surface2)', borderRadius: 14, marginBottom: 20 }}>
          <Mail size={32} color="#d1d5db" style={{ margin: '0 auto 8px' }} />
          <p style={{ color: 'var(--text-dim)', fontSize: 14 }}>No email templates yet. Create them in Settings.</p>
        </div>
      ) : (
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 10 }}>Select Template</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {templates.map(t => (
              <button key={t.id} onClick={() => setSelectedTemplate(t.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px', borderRadius: 14,
                border: `2px solid ${selectedTemplate === t.id ? '#6366f1' : 'var(--border)'}`,
                background: selectedTemplate === t.id ? 'rgba(99,102,241,0.15)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left'
              }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(245,158,11,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Mail size={16} color="#f59e0b" />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 700, color: selectedTemplate === t.id ? '#6366f1' : '#111827', margin: 0 }}>{t.name}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>Subject: {t.subject}</p>
                </div>
                {selectedTemplate === t.id && <CheckCircle size={18} color="#6366f1" style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>Schedule (optional)</label>
            <input aria-label="Schedule (optional)" type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
              style={{ width: '100%', padding: '11px 14px', border: '1.5px solid var(--border)', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '12px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button onClick={handle} disabled={saving || !selectedTemplate} style={{
          flex: 2, padding: '12px', border: 'none', borderRadius: 12,
          background: saving || !selectedTemplate ? '#9ca3af' : 'linear-gradient(135deg, #6366f1, #4f46e5)',
          color: 'white', fontWeight: 700, cursor: !selectedTemplate ? 'not-allowed' : 'pointer'
        }}>
          {saving ? 'Starting...' : 'Start Workflow'}
        </button>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
//  MAIN PAGE
// ════════════════════════════════════════════════════════════

// Studio shoots linked to this lead. Renders only when shoots exist (i.e. the
// number has been connected to a shoot in Media Studio). Opens in the Studio tab.
function LeadStudioSection({ leadId }) {
  const [shoots, setShoots] = useState(null);
  useEffect(() => {
    let on = true;
    mediaAPI.listProjects({ lead_id: leadId }).then(r => { if (on) setShoots(r.data.projects || []); }).catch(() => { if (on) setShoots([]); });
    return () => { on = false; };
  }, [leadId]);
  if (!shoots || shoots.length === 0) return null;
  // noopener only. 'noreferrer' also strips document.referrer, and the session
  // boot script used to read that to decide whether a tab inherits the session —
  // so opening a shoot here logged the user out of every tab. Same-origin links
  // gain nothing from noreferrer anyway; noopener already severs window.opener.
  const open = (path) => window.open(path, '_blank', 'noopener');
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#0ea5e9,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Camera size={14} color="#fff" /></span>
          Studio
        </div>
        <button onClick={() => open('/studio')} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>Open <ChevronRight size={12} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shoots.map(s => (
          <button key={s.id} onClick={() => open(`/studio/${s.id}`)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {s.cover_url ? <img src={mediaUrl(s.cover_url)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Camera size={16} color="var(--text-muted)" />}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{(s.project_type || 'general').replace('_', ' ')} · {s.asset_count || 0} photo{s.asset_count === 1 ? '' : 's'}</div>
            </div>
            {s.status && <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>{s.status}</span>}
          </button>
        ))}
      </div>
      <button onClick={() => open('/studio')} style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 9, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}><Plus size={13} /> New shoot</button>
    </div>
  );
}

export default function LeadDetailPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const params = useParams();
  const leadId = params.id;
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [lead, setLead] = useState(null);
  const [notes, setNotes] = useState([]);
  const [reminders, setReminders] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [messages, setMessages] = useState([]);
  const [presets, setPresets] = useState([]);
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailWorkflows, setEmailWorkflows] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [leadEmails, setLeadEmails] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [company, setCompany] = useState(null);
  const [showEmailCompose, setShowEmailCompose] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [verticalIndustry, setVerticalIndustry] = useState(null);
const [verticalLoading, setVerticalLoading] = useState(false);
const [verticalSuggestion, setVerticalSuggestion] = useState(null);
const [verticalSuggestLoading, setVerticalSuggestLoading] = useState(false);
const [verticalActionLoading, setVerticalActionLoading] = useState(null);
const [verticalActionResult, setVerticalActionResult] = useState('');
const [editingActionMsg, setEditingActionMsg] = useState(null);
const [customActionMsg, setCustomActionMsg] = useState('');
  const [aiSummary, setAiSummary] = useState('');
const [aiSuggestions, setAiSuggestions] = useState([]);
const [aiAnalysis, setAiAnalysis] = useState(null);
const [aiLoading, setAiLoading] = useState({ summary: false, suggestions: false, analysis: false });
const [aiError, setAiError] = useState('');
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('notes');
  const [channels, setChannels] = useState([]);
  const [relatedLeads, setRelatedLeads] = useState({ suggestions: [], linked: [] });
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // The Timeline tab used to open empty above a "Click Refresh Timeline to load
  // all activity" message - the one view meant to tell you the story of a client
  // asked you to fetch it yourself, so most people assumed it was broken.
  const loadTimeline = useCallback(async () => {
    if (!leadId) return;
    setTimelineLoading(true);
    try { const r = await timelineAPI.get(leadId); setTimeline(r.data.timeline || []); }
    catch { /* leave whatever we already have on screen */ }
    finally { setTimelineLoading(false); }
  }, [leadId]);

  useEffect(() => { if (activeTab === 'timeline') loadTimeline(); }, [activeTab, loadTimeline]);
  const [addingChannel, setAddingChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({ platform: 'whatsapp', identifier: '', display_name: '' });
  // Active chat platform — defaults to the lead's source. The 4 platform tabs above the chat
  // box switch which platform's conversation is displayed and which platform messages go to.
  const [activePlatform, setActivePlatform] = useState(null); // set after lead loads
  // Keep a live ref to activePlatform — the SSE effect only re-runs on leadId,
  // so its handler closure would otherwise read a stale (null) activePlatform
  // and never refresh the thread.
  const activePlatformRef = useRef(activePlatform);
  activePlatformRef.current = activePlatform;
  const [platformCounts, setPlatformCounts] = useState({});   // { whatsapp: 23, instagram: 4, ... }
  const [unreadByPlatform, setUnreadByPlatform] = useState({}); // bumped via SSE when a non-active platform gets a message

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showWonModal, setShowWonModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showAiTools, setShowAiTools] = useState(false);
  const [aiToolLoading, setAiToolLoading] = useState(null); // 'rewrite-pro' | 'translate-en' | ...
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  // The invoices tab used to be a read-only list: you could see that an invoice
  // existed and do nothing about it, on the one page where you are actually
  // talking to the customer. These drive preview / send / edit / delete inline.
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [sendingInvoice, setSendingInvoice] = useState(null);
  const [invoiceBusy, setInvoiceBusy] = useState(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [viewImage, setViewImage] = useState(null);   // full-size image lightbox URL
  const [syncingHistory, setSyncingHistory] = useState(false);

  const [editForm, setEditForm] = useState({
    customer_name: '', customer_phone: '', email: '',
    address: '', date_of_birth: '', lead_source: '', assigned_to: '',
    estimated_value: '', actual_sale: ''
  });

  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [newReminder, setNewReminder] = useState({ reminder_date: '', message: '' });
  const [addingReminder, setAddingReminder] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type, ts: Date.now() });
    setTimeout(() => setToast(t => (t && t.ts === Date.now() ? null : t)), 3500);
  }, []);
  // Auto-dismiss helper that doesn't get stale-closured
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => { fetchAll(); }, [leadId]);

  // Pull WhatsApp chat history — only auto-syncs once per session per lead.
  // Repeated opens of the same lead won't trigger duplicate Puppeteer calls.
  // The server also has a 5-minute cooldown as a safety net.
  useEffect(() => {
    if (!leadId) return;
    const sessionKey = `wf_synced_${leadId}`;
    if (sessionStorage.getItem(sessionKey)) return; // already synced this session
    sessionStorage.setItem(sessionKey, '1');
    setSyncingHistory(true);
    leadsAPI.syncMessages(leadId)
      .then(res => {
        if ((res.data?.imported || 0) > 0) fetchMessages(); // refresh if new messages found
      })
      .catch(() => {}) // non-fatal — WhatsApp might not be connected
      .finally(() => setSyncingHistory(false));
  }, [leadId]);

  // ── Real-time for THIS lead, over the shell's single connection (Phase 5) ────
  // Also picks up email_received, which the backend has always broadcast with
  // this lead's id and which this page used to ignore — an inbound email only
  // surfaced when the 8s poll below happened to catch it.
  useRealtime(['new_message', 'lead_updated', 'email_received'], (data) => {
    if (data.type === 'lead_updated') {
      const updated = data.lead || data;
      if (!updated?.id || updated.id !== leadId) return;
      setLead(prev => ({ ...prev, ...updated }));
      return;
    }
    if (data.lead_id !== leadId) return; // ignore other leads
    if (data.type === 'email_received') { fetchMessages(activePlatformRef.current || undefined); return; }
    const incomingPlatform = (data.message?.platform || 'whatsapp').toLowerCase();
    const viewing = activePlatformRef.current;
    // If the message arrived on the platform the user is currently viewing
    // (or the platform isn't set yet), refresh inline. Otherwise bump the
    // unread counter so the tab shows a "(1)" badge.
    if (!viewing || incomingPlatform === viewing) {
      fetchMessages(viewing || undefined);
    } else {
      setUnreadByPlatform(prev => ({ ...prev, [incomingPlatform]: (prev[incomingPlatform] || 0) + 1 }));
      // Also bump the total count so the tab number stays accurate
      setPlatformCounts(prev => ({ ...prev, [incomingPlatform]: (prev[incomingPlatform] || 0) + 1 }));
    }
  });

  // ── Polling fallback — guarantees the thread auto-refreshes even if the SSE
  // stream drops or is buffered by a proxy. Only polls while the tab is visible.
  useEffect(() => {
    if (!leadId) return;
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchMessages(activePlatformRef.current || undefined);
      }
    }, 8000);
    return () => clearInterval(iv);
  }, [leadId]);

  // Track whether the user has scrolled away from the bottom — used to show a "jump to latest" pill
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const isNearBottomRef = useRef(true);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      isNearBottomRef.current = near;
      setShowJumpToLatest(!near);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [messages.length > 0]);

  // Only auto-scroll if user is already near the bottom — preserves their position when reviewing history
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    if (isNearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const scrollToLatest = useCallback(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  const fetchAll = async () => {
    try {
      // Fetch the lead first — if this fails, show a meaningful error
      let leadRes;
      try {
        leadRes = await leadsAPI.getById(leadId);
      } catch (e) {
        const msg = e?.response?.data?.error || e?.message || 'Failed to load lead';
        const status = e?.response?.status;
        setFetchError(status === 404 ? 'Lead not found. It may have been deleted.' : `Error: ${msg}`);
        setLoading(false);
        return;
      }

      const data = leadRes.data;
      const leadData = data.lead || data;
      if (!leadData || !leadData.id) {
        setFetchError('Lead not found. It may have been deleted.');
        setLoading(false);
        return;
      }

      setLead(leadData);
      // Default the active chat tab to the lead's source platform (only once)
      setActivePlatform(prev => prev || (leadData.platform_source || 'whatsapp').toLowerCase());
      setNotes(data.notes || []);
      setReminders(data.reminders || []);
      setInvoices(data.invoices || []);
      setEmailWorkflows(data.emailWorkflows || []);

      // Load secondary data in parallel — failures are non-fatal
      const [presetsRes, tagsRes, templatesRes, teamRes, companyRes, emailsRes, channelsRes, relatedRes] = await Promise.all([
        presetsAPI.getAll().catch(() => ({ data: { presets: [] } })),
        tagsAPI.getAll().catch(() => ({ data: { tags: [] } })),
        emailTemplatesAPI.getAll().catch(() => ({ data: { templates: [] } })),
        teamAPI.getAll().catch(() => ({ data: { members: [] } })),
        settingsAPI.getCompany().catch(() => ({ data: { company: {} } })),
        leadEmailsAPI.getAll(leadId).catch(() => ({ data: { emails: [] } })),
        leadChannelsAPI.getAll(leadId).catch(() => ({ data: { channels: [] } })),
        leadRelationsAPI.getSuggested(leadId).catch(() => ({ data: { suggestions: [], linked: [] } })),
      ]);

      setPresets(presetsRes.data.presets || []);
      setAllTags(tagsRes.data.tags || []);
      setEmailTemplates(templatesRes.data.templates || []);
      setTeamMembers(teamRes.data.members || []);
      setCompany(companyRes.data.company || {});
      setLeadEmails(emailsRes.data.emails || []);
      setChannels(channelsRes.data.channels || []);
      setRelatedLeads({ suggestions: relatedRes.data?.suggestions || [], linked: relatedRes.data?.linked || [] });
      setEditForm({
        customer_name: leadData.customer_name || '',
        customer_phone: leadData.customer_phone || '',
        email: leadData.email || '',
        address: leadData.address || '',
        date_of_birth: leadData.date_of_birth || '',
        lead_source: leadData.lead_source || '',
        assigned_to: leadData.assigned_to || '',
        estimated_value: leadData.estimated_value || '',
        actual_sale: leadData.actual_sale || '',
      });
      await fetchMessages();
    } catch (e) {
      console.error('fetchAll error:', e);
      setFetchError(e?.message || 'Something went wrong loading this lead.');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (platformOverride) => {
    try {
      const p = platformOverride || activePlatform || undefined;
      const res = await leadsAPI.getMessages(leadId, p);
      setMessages(res.data.messages || []);
      if (res.data.platform_counts) setPlatformCounts(res.data.platform_counts);
      // Clear unread badge for the platform we just opened
      if (p) setUnreadByPlatform(prev => ({ ...prev, [p]: 0 }));
    } catch { setMessages([]); }
  };

  // Re-fetch whenever the active platform changes
  useEffect(() => {
    if (activePlatform && leadId) fetchMessages(activePlatform);
  }, [activePlatform]);

  // Mark this lead as seen so its unread badge clears across the lead views (item 4)
  useEffect(() => { if (leadId) markLeadSeen(leadId); }, [leadId, messages]);

  // ── Invoice actions ────────────────────────────────────────────────────────
  // A list row can come from a fetch that did not include line items, and a
  // preview or an edit form built from half a document is worse than a moment's
  // wait — so both re-read the invoice before they open.
  const withFullInvoice = async (inv) => {
    if (Array.isArray(inv.items) && inv.items.length) return inv;
    try { return (await invoicesAPI.getById(inv.id)).data.invoice || inv; } catch { return inv; }
  };

  const previewInvoice = async (inv) => {
    setInvoiceBusy(inv.id);
    try {
      const full = await withFullInvoice(inv);
      // Same escaped, branded document the customer is emailed — a preview that
      // does not match what gets sent is not a preview.
      const win = window.open('', '_blank');
      if (!win) return;                       // popup blocked; nothing to clean up
      win.document.write(buildInvoiceHTML(full, company, BASE_URL));
      win.document.close();
    } finally { setInvoiceBusy(null); }
  };

  const openInvoiceEditor = async (inv) => {
    setInvoiceBusy(inv.id);
    try { setEditingInvoice(await withFullInvoice(inv)); }
    finally { setInvoiceBusy(null); }
  };

  const removeInvoice = async (inv) => {
    const ok = await confirm({
      title: `Delete ${inv.invoice_number || 'this invoice'}?`,
      // Say what actually happens. The route soft-deletes to a bin the retention
      // sweep deliberately skips, so this is reversible — and a scarier warning
      // than the truth makes people avoid a safe action.
      message: 'It moves to the invoice bin, where it can be restored. Nothing is destroyed.',
      confirmText: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setInvoiceBusy(inv.id);
    try { await invoicesAPI.delete(inv.id); await fetchAll(); }
    catch (e) { await confirm({ title: 'Could not delete', message: e.response?.data?.error || e.message, alertOnly: true, tone: 'danger' }); }
    finally { setInvoiceBusy(null); }
  };

  const handleSaveEdit = async () => {
    try {
      setActionLoading(true);
      await leadsAPI.update(leadId, editForm);
      await fetchAll();
      setEditing(false);
    } catch (e) { console.error(e); } finally { setActionLoading(false); }
  };

  // Inline single-field save (item 26) — sends the full record with one field
  // changed so nothing else is clobbered, then refreshes.
  const saveField = async (field, value) => {
    await leadsAPI.update(leadId, {
      customer_name: lead.customer_name || '',
      customer_phone: lead.customer_phone || '',
      email: lead.email || '',
      address: lead.address || '',
      date_of_birth: lead.date_of_birth || '',
      lead_source: lead.lead_source || '',
      assigned_to: lead.assigned_to || '',
      estimated_value: lead.estimated_value || '',
      actual_sale: lead.actual_sale || '',
      [field]: value,
    });
    await fetchAll();
  };

  const handleDelete = async () => {
    // Return to the list this record lived in, not the dashboard — after deleting you
    // are almost always working through a list, and landing on the Kanban board loses
    // your place.
    try { setActionLoading(true); await leadsAPI.deleteLead(leadId); router.push(lead?.is_client ? '/clients' : '/leads-list'); }
    catch (e) { console.error(e); setActionLoading(false); }
  };

  const handleStatusChange = async (newStatus) => {
    if (newStatus === 'Closed - Won') { setShowWonModal(true); return; }
    if (newStatus === 'Closed - Lost') { setShowLostModal(true); return; }
    try {
      setActionLoading(true);
      await leadsAPI.updateStatus(leadId, { status: newStatus });
      await fetchAll();
    } catch (e) { console.error(e); } finally { setActionLoading(false); }
  };

  const handleWonConfirm = async (amount) => {
    try {
      setActionLoading(true);
      await leadsAPI.updateStatus(leadId, { status: 'Closed - Won', actual_sale: amount });
      setShowWonModal(false);
      await fetchAll();
    } catch (e) { console.error(e); } finally { setActionLoading(false); }
  };

  // Promote this won lead to a client — hides from Leads, keeps chat + analytics.
  const moveToClient = async () => {
    try {
      setActionLoading(true);
      await leadsAPI.setClient(leadId, true);
      router.push('/clients');
    } catch (e) { console.error(e); setActionLoading(false); }
  };

  const handleLostConfirm = async (reason) => {
    try {
      setActionLoading(true);
      await leadsAPI.updateStatus(leadId, { status: 'Closed - Lost', lost_reason: reason });
      setShowLostModal(false);
      await fetchAll();
    } catch (e) { console.error(e); } finally { setActionLoading(false); }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    try { await leadsAPI.addNote(leadId, newNote); setNewNote(''); setAddingNote(false); await fetchAll(); }
    catch (e) { console.error(e); }
  };

  const handleAddReminder = async () => {
    if (!newReminder.reminder_date) return;
    try { await leadsAPI.addReminder(leadId, newReminder); setNewReminder({ reminder_date: '', message: '' }); setAddingReminder(false); await fetchAll(); }
    catch (e) { console.error(e); }
  };

  const handleToggleReminder = async (id) => {
    try { await leadsAPI.toggleReminder(id); await fetchAll(); } catch (e) { console.error(e); }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      setSendingMessage(true);
      const res = await leadsAPI.sendMessage(leadId, newMessage, activePlatform);
      // Outbound delivery is only wired for WhatsApp today. For other platforms the message
      // is persisted locally so the user sees their draft, and the server returns delivered:false.
      if (res.data?.delivered === false) {
        showToast(`Saved as draft — ${activePlatform} sending isn't connected yet`, 'info');
      }
      setNewMessage('');
      await fetchMessages();
    } catch (e) {
      const msg = e.response?.data?.error || e.message || `Failed to send on ${activePlatform || 'WhatsApp'}`;
      showToast(msg);
    } finally { setSendingMessage(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingFile(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('caption', newMessage);
      fd.append('platform', activePlatform || 'whatsapp');
      const res = await leadsAPI.sendMedia(leadId, fd);
      if (res.data?.delivered === false) {
        showToast(`File saved — ${activePlatform} sending isn't connected yet`, 'info');
      }
      setNewMessage('');
      await fetchMessages();
    } catch (err) {
      let msg = err?.response?.data?.error
             || err?.response?.statusText
             || err?.message
             || 'Failed to send file — is WhatsApp connected?';
      if (!msg || msg.length < 3) msg = `File send failed (HTTP ${err?.response?.status || '?'})`;
      showToast(msg);
      console.error('File send error:', err);
    }
    finally { setUploadingFile(false); e.target.value = ''; }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Let the browser pick the best supported codec; don't force webm to avoid DOMException
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const actualMime = recorder.mimeType || 'audio/webm';
        const ext = actualMime.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(audioChunksRef.current, { type: actualMime });
        // Bail out if the recording is too short / empty — these would 400 on the server.
        if (blob.size < 1000) {
          showToast('Recording too short — hold the mic button longer');
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        const fd = new FormData();
        fd.append('audio', blob, `voice.${ext}`);
        fd.append('platform', activePlatform || 'whatsapp');
        try {
          const res = await leadsAPI.sendVoice(leadId, fd);
          if (res.data?.delivered === false) {
            showToast(`Voice saved — ${activePlatform} sending isn't connected yet`, 'info');
          }
          await fetchMessages();
        } catch (err) {
          // Surface a meaningful message — server may return { error }, or axios may have a message
          let msg = err?.response?.data?.error
                 || err?.response?.statusText
                 || err?.message
                 || 'Failed to send voice note';
          if (!msg || msg.length < 3) msg = `Voice send failed (HTTP ${err?.response?.status || '?'})`;
          showToast(msg);
          console.error('Voice send error:', err, 'response body:', err?.response?.data);
        }
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { showToast('Microphone access denied — check browser permissions'); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      setRecordingTime(0);
    }
  };

  const applyFormat = (before, after = before) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { value, cursor } = wrapSelection(ta, before, after);
    setNewMessage(value);
    setTimeout(() => { ta.focus(); ta.setSelectionRange(cursor, cursor); }, 0);
  };

const API_BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

const handleDetectIndustry = async () => {
  setVerticalLoading(true);
  try {
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/industry`, { headers: authHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setVerticalIndustry(data);
  } catch (e) { console.error(e); } finally { setVerticalLoading(false); }
};

const handleVerticalSuggest = async (industry) => {
  setVerticalSuggestLoading(true);
  try {
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/vertical-suggest`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ industry }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setVerticalSuggestion(data.suggestion);
  } catch (e) { console.error(e); } finally { setVerticalSuggestLoading(false); }
};

const handleVerticalAction = async (actionId, industry, customMsg) => {
  setVerticalActionLoading(actionId);
  setVerticalActionResult('');
  try {
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/vertical-action`, {
      method: 'POST',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ action_id: actionId, industry, custom_message: customMsg }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setVerticalActionResult(`✅ ${data.action} sent successfully!`);
    setEditingActionMsg(null);
    await fetchMessages();
  } catch (e) { setVerticalActionResult(`❌ ${e.message}`); }
  finally { setVerticalActionLoading(null); }
};
const handleAISummary = async () => {
  setAiLoading(p => ({ ...p, summary: true })); setAiError('');
  try {
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/ai/summary`, { method: 'POST', headers: authHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setAiSummary(data.summary);
  } catch (e) { setAiError(e.message); } finally { setAiLoading(p => ({ ...p, summary: false })); }
};

const handleAISuggestions = async () => {
  setAiLoading(p => ({ ...p, suggestions: true })); setAiError('');
  try {
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/ai/reply-suggestions`, { method: 'POST', headers: authHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setAiSuggestions(data.suggestions || []);
  } catch (e) { setAiError(e.message); } finally { setAiLoading(p => ({ ...p, suggestions: false })); }
};

const handleAIAnalysis = async () => {
  setAiLoading(p => ({ ...p, analysis: true })); setAiError('');
  try {
    const res = await fetch(`${API_BASE}/api/leads/${leadId}/ai/analyze`, { method: 'POST', headers: authHeader() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setAiAnalysis(data.analysis);
    // Refresh the lead so the left-panel Lead Intelligence card updates immediately
    try {
      const r = await leadsAPI.getById(leadId);
      const fresh = r.data?.lead || r.data;
      if (fresh?.id) setLead(prev => ({ ...prev, ...fresh }));
    } catch {}
  } catch (e) { setAiError(e.message); } finally { setAiLoading(p => ({ ...p, analysis: false })); }
};

  const handleToggleTag = async (tag, isAssigned) => {
    try {
      if (isAssigned) await tagsAPI.remove(leadId, tag.id);
      else await tagsAPI.assign(leadId, tag.id);
      setLead(prev => ({
        ...prev,
        tags: isAssigned ? (prev.tags || []).filter(t => t.id !== tag.id) : [...(prev.tags || []), tag]
      }));
    } catch (e) { console.error(e); }
  };

  const sym = company?.currency_symbol || '$';
useEffect(() => {
  if (activeTab === 'vertical' && !verticalIndustry && leadId) {
    handleDetectIndustry();
  }
}, [activeTab]);
  if (loading) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 44, height: 44, border: '3px solid var(--border)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
        <p style={{ color: 'var(--text-muted)', marginTop: 12, fontSize: 14 }}>Loading lead...</p>
      </div>
    </div>
  );

  if (!lead) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: fetchError ? 'rgba(239,68,68,0.15)' : 'var(--surface2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <AlertTriangle size={28} color={fetchError ? '#ef4444' : '#9ca3af'} />
        </div>
        <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          {fetchError ? 'Could not load lead' : 'Lead not found'}
        </p>
        {fetchError && (
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 320 }}>{fetchError}</p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {fetchError && (
            <button onClick={() => { setFetchError(null); setLoading(true); fetchAll(); }}
              style={{ padding: '10px 24px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
              Retry
            </button>
          )}
          {/* On this branch `lead` is null, so is_client is unknown — fall back to the
              list this record would have lived in, never /dashboard. */}
          <button onClick={() => router.push('/leads-list')}
            style={{ padding: '10px 24px', background: 'var(--surface)', color: 'var(--text)', border: '1.5px solid var(--border)', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
            Back to Leads
          </button>
        </div>
      </div>
    </div>
  );

  const sc = STATUS_META[lead.status] || STATUS_META['New'];

  const TABS = [
  { id: 'timeline', label: 'Timeline', count: 0, color: '#6366f1' },
  { id: 'notes', label: 'Notes', count: notes.length, color: '#f59e0b' },
  { id: 'reminders', label: 'Reminders', count: reminders.filter(r => !r.is_completed).length, color: '#8b5cf6' },
  { id: 'invoices', label: 'Invoices', count: invoices.length, color: '#10b981' },
  { id: 'emails', label: 'Emails', count: leadEmails.length, color: '#10b981' },
  { id: 'email-flow', label: 'Email Flow', count: emailWorkflows.length, color: '#6366f1' },
  { id: 'related', label: 'Related', count: relatedLeads.linked.length + relatedLeads.suggestions.length, color: '#ec4899' },
  { id: 'room', label: '💬 Team Room', count: 0, color: '#8b5cf6' },
  { id: 'ai', label: '✨ AI Assistant', count: 0, color: '#8b5cf6' },
  { id: 'vertical', label: '🏭 Industry AI', count: 0, color: '#10b981' },
];

  const HISTORY_ICONS = { message: MessageSquare, note: StickyNote, status_change: Activity, reminder: Bell, invoice: Receipt, email: Mail, assignment: UserCheck, created: Star };
  const HISTORY_COLORS = { message: '#06b6d4', note: '#f59e0b', status_change: '#6366f1', reminder: '#8b5cf6', invoice: '#10b981', email: '#f59e0b', assignment: '#06b6d4', created: '#10b981' };

  return (
    <>
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Modals */}
      {showDeleteModal && <DeleteModal name={lead.customer_name} onConfirm={handleDelete} onCancel={() => setShowDeleteModal(false)} loading={actionLoading} />}
      {showWonModal && <WonModal name={lead.customer_name} onConfirm={handleWonConfirm} onCancel={() => setShowWonModal(false)} loading={actionLoading} currencySymbol={sym} />}
      {showLostModal && <LostModal name={lead.customer_name} onConfirm={handleLostConfirm} onCancel={() => setShowLostModal(false)} loading={actionLoading} />}
      {showInvoiceModal && <InvoiceModal lead={lead} company={company} onClose={() => setShowInvoiceModal(false)} onSaved={fetchAll} />}
      {editingInvoice && (
        <InvoiceModal lead={lead} company={company} invoice={editingInvoice}
                      onClose={() => setEditingInvoice(null)} onSaved={fetchAll} />
      )}
      {sendingInvoice && (
        <SendInvoiceModal invoice={sendingInvoice} company={company}
                          onClose={() => setSendingInvoice(null)}
                          onSent={() => { setSendingInvoice(null); fetchAll(); }} />
      )}
      {showEmailModal && <EmailWorkflowModal lead={lead} templates={emailTemplates} onClose={() => setShowEmailModal(false)} onSaved={fetchAll} />}
      <ScheduleMeetingModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        lead={lead ? { id: lead.id, name: lead.customer_name, email: lead.email } : null}
        onScheduled={() => fetchAll()}
      />

      {/* Full-size image lightbox */}
      {viewImage && (
        <div
          onClick={() => setViewImage(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <button onClick={() => setViewImage(null)} style={{ position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: 40, height: 40, color: 'white', fontSize: 22, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          <img src={viewImage} alt="Full size" onClick={e => e.stopPropagation()} style={{ maxWidth: '92vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }} />
        </div>
      )}

      {/* Toast notifications */}
      {toast && (() => {
        const palette = {
          error:   { bg: 'rgba(239,68,68,0.95)', icon: '⚠️' },
          success: { bg: 'rgba(16,185,129,0.95)', icon: '✓' },
          info:    { bg: 'rgba(99,102,241,0.95)', icon: 'ℹ️' },
        };
        const p = palette[toast.type] || palette.error;
        return (
          <div
            role="alert"
            style={{
              position: 'fixed', bottom: 24, right: 24, zIndex: 10000,
              background: p.bg, color: 'white', padding: '12px 18px',
              borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
              fontSize: 14, fontWeight: 600, maxWidth: 380,
              display: 'flex', alignItems: 'center', gap: 10,
              animation: 'slideIn 0.18s ease-out',
            }}
          >
            <span style={{ fontSize: 16 }}>{p.icon}</span>
            <span style={{ flex: 1 }}>{toast.message}</span>
            <button aria-label="Dismiss this message" onClick={() => setToast(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, width: 22, height: 22, color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <X size={12} />
            </button>
          </div>
        );
      })()}

      {/* Nav */}
      <nav style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div className="lead-subnav" style={{ maxWidth: 1500, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 62 }}>
          {/* The parent is derived from what this record IS, not from history: a lead
              lives under Leads, a converted one under Clients. It used to say
              "Dashboard" unconditionally — wrong for all eight entry points, and
              /dashboard is not the parent of a lead under any of them. */}
          <button onClick={() => router.push(lead.is_client ? '/clients' : '/leads-list')} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, padding: '6px 12px', borderRadius: 10 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <ArrowLeft size={16} /> {lead.is_client ? 'Clients' : 'Leads'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${sc.dot}, ${sc.dot}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: 'white' }}>
              {lead.customer_name?.[0]?.toUpperCase() || '?'}
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{lead.customer_name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.label}</span>
          </div>
          <div className="lead-nav-actions" style={{ display: 'flex', gap: 8 }}>
            {/* Quick actions */}
            <ContactActions lead={lead} onDone={fetchAll} />
            <button onClick={() => setShowInvoiceModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              <Receipt size={14} /> Invoice
            </button>
            <button onClick={() => setShowEmailCompose(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              <Mail size={14} /> Email
            </button>
            <button onClick={() => setShowScheduleModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1.5px solid rgba(99,102,241,0.35)', background: 'rgba(99,102,241,0.12)', color: '#818cf8', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              <Video size={14} /> Schedule
            </button>
            {lead.customer_phone && (() => {
              const waPhone = lead.customer_phone.replace(/\D/g, '');
              // Only show call button for real phone numbers (not platform user IDs)
              if (waPhone.length < 7 || waPhone.length > 15) return null;
              return (
                <a
                  href={`https://wa.me/${waPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1.5px solid #a7f3d0', background: 'rgba(16,185,129,0.12)', color: '#059669', fontWeight: 600, cursor: 'pointer', fontSize: 13, textDecoration: 'none' }}
                  title="Open WhatsApp call"
                >
                  <Phone size={14} /> WA Call
                </a>
              );
            })()}
            <button
              onClick={() => {
                if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('wf:open-chat', { detail: lead }));
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1.5px solid #a7f3d0', background: 'rgba(16,185,129,0.12)', color: '#059669', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
              title="Open WhatsApp chat in floating bar"
            >
              <MessageSquare size={14} /> Chat Bar
            </button>
            <button onClick={() => setShowDeleteModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1.5px solid #fecaca', borderRadius: 10, background: 'var(--surface)', color: '#ef4444', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              <Trash2 size={14} /> Trash
            </button>
          </div>
        </div>
      </nav>

      {/* Status banners */}
      {lead.status === 'Closed - Won' && (
        <div style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', textAlign: 'center', padding: '12px', fontWeight: 800, fontSize: 15 }}>
          🏆 Deal Won! {sym}{(lead.actual_sale || 0).toLocaleString()}
        </div>
      )}
      {lead.status === 'Closed - Lost' && (
        <div style={{ background: '#ef4444', color: 'white', textAlign: 'center', padding: '12px', fontWeight: 800, fontSize: 15 }}>
          ❌ Deal Lost — {lead.lost_reason || 'No reason given'}
        </div>
      )}

      <div className="lead-grid">

        {/* ══ LEFT PANEL ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Profile card */}
          <div style={{ background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1.5px solid var(--border)' }}>

            <div style={{ background: `linear-gradient(135deg, ${sc.dot}20, ${sc.dot}08)`, padding: '24px 22px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Edit2 size={10} /> Tap any field to edit
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ width: 68, height: 68, borderRadius: 22, marginBottom: 10, background: `linear-gradient(135deg, ${sc.dot}, ${sc.dot}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: 'white', boxShadow: `0 8px 24px ${sc.dot}44` }}>
                  {lead.customer_name?.[0]?.toUpperCase() || '?'}
                </div>
                <InlineEditField heading color={sc.dot} label="Name" value={lead.customer_name}
                  onSave={(v) => saveField('customer_name', v)} />
                <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.label}</span>
              </div>
            </div>

            {/* Contact details */}
            <div style={{ padding: '18px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <InlineEditField icon={Phone} color="#10b981" bg="rgba(16,185,129,0.12)" label="Phone"
                  value={lead.customer_phone} display={displayPhone(lead.customer_phone, lead.platform_source)}
                  type="tel" onSave={(v) => saveField('customer_phone', v)} />
                <InlineEditField icon={Mail} color="#6366f1" bg="rgba(99,102,241,0.12)" label="Email"
                  value={lead.email} type="email" onSave={(v) => saveField('email', v)} />
                <InlineEditField icon={MapPin} color="#f97316" bg="rgba(249,115,22,0.10)" label="Address"
                  value={lead.address} type="text" onSave={(v) => saveField('address', v)} />
                <InlineEditField icon={Calendar} color="#a855f7" bg="rgba(168,85,247,0.10)" label="Date of Birth"
                  value={lead.date_of_birth} display={lead.date_of_birth ? formatDate(lead.date_of_birth) : null}
                  type="date" onSave={(v) => saveField('date_of_birth', v)} />
                <InlineEditField icon={Globe} color="#06b6d4" bg="rgba(6,182,212,0.10)" label="Lead Source"
                  value={lead.lead_source} type="select"
                  selectOptions={[{ value: '', label: 'Select source' }, ...LEAD_SOURCES.map(s => ({ value: s, label: s }))]}
                  onSave={(v) => saveField('lead_source', v)} />
                <InlineEditField icon={UserCheck} color="#10b981" bg="rgba(16,185,129,0.12)" label="Assigned To"
                  value={lead.assigned_to}
                  display={teamMembers.find(m => m.id === lead.assigned_to)?.name || null}
                  type="select"
                  selectOptions={[{ value: '', label: 'Unassigned' }, ...teamMembers.map(m => ({ value: m.id, label: m.name }))]}
                  onSave={(v) => saveField('assigned_to', v)} />

                <div style={{ height: 1, background: 'var(--surface2)', margin: '6px 0 2px' }} />
                <InlineEditField icon={DollarSign} color={sc.dot} bg={sc.bg} label="Deal Value"
                  value={lead.actual_sale || lead.estimated_value || ''}
                  display={(lead.actual_sale || lead.estimated_value)
                    ? `${sym}${Number(lead.actual_sale || lead.estimated_value).toLocaleString()}` : null}
                  type="number"
                  onSave={(v) => saveField(lead.status === 'Closed - Won' ? 'actual_sale' : 'estimated_value', v)} />

                <div style={{ height: 1, background: 'var(--surface2)', margin: '6px 0 2px' }} />
                <div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>Tags</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {(lead.tags || []).map(tag => <TagChip key={tag.id} tag={tag} onRemove={() => handleToggleTag(tag, true)} />)}
                    <TagPicker leadId={leadId} assignedTags={lead.tags || []} allTags={allTags} onToggle={handleToggleTag} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pipeline Stage */}
          <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', border: '1.5px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pipeline Stage</p>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              {PIPELINE_STEPS.map((step, i) => {
                const meta = STATUS_META[step];
                const isActive = lead.status === step;
                const isPast = PIPELINE_STEPS.indexOf(lead.status) > i;
                return (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div {...clickable(() => !actionLoading && handleStatusChange(step))} style={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', border: `2px solid ${isActive || isPast ? meta.dot : 'var(--border)'}`, background: isActive ? meta.dot : isPast ? meta.dot + '44' : 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0 }}>
                      {isPast ? <CheckCircle size={13} color={meta.dot} /> : isActive ? <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--surface)' }} /> : <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--border)' }} />}
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: isPast ? meta.dot + '66' : 'var(--border)' }} />}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              {PIPELINE_STEPS.map(step => (
                <span key={step} style={{ fontSize: 9, fontWeight: 700, color: lead.status === step ? STATUS_META[step].dot : '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                  {step === 'Negotiating' ? 'Nego.' : step}
                </span>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button onClick={() => handleStatusChange('Closed - Won')} disabled={actionLoading} style={{ padding: '9px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <Trophy size={13} /> Won
              </button>
              <button onClick={() => handleStatusChange('Closed - Lost')} disabled={actionLoading} style={{ padding: '9px', borderRadius: 10, border: 'none', background: '#ef4444', color: 'white', fontWeight: 800, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <ThumbsDown size={13} /> Lost
              </button>
            </div>
            {!lead.is_client && (
              <button onClick={moveToClient} disabled={actionLoading} title="Mark as a client — hides from Leads but keeps the chat, history & analytics"
                style={{ marginTop: 8, width: '100%', padding: '9px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 800, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <UserCheck size={13} /> Move to Clients
              </button>
            )}
            {!!lead.is_client && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 11px', borderRadius: 10, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.3)' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: 5 }}><UserCheck size={12} /> Client</span>
                <button onClick={async () => { try { setActionLoading(true); await leadsAPI.setClient(leadId, false); await fetchAll(); } catch (e) { console.error(e); } finally { setActionLoading(false); } }} disabled={actionLoading} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Move back to Leads</button>
              </div>
            )}
          </div>

          {/* Media Studio — linked shoots for this client (appears once a shoot is connected) */}
          <LeadStudioSection leadId={leadId} />

          {/* Lead Intelligence — shows AI-derived score / sentiment / urgency once analysis has run */}
          {(Number(lead.lead_score) > 0 || lead.sentiment || lead.urgency) && (() => {
            const SENT_META = {
              positive:   { emoji: '😊', color: '#10b981', label: 'Positive' },
              neutral:    { emoji: '😐', color: '#6b7280', label: 'Neutral' },
              negative:   { emoji: '😟', color: '#f59e0b', label: 'Negative' },
              frustrated: { emoji: '😠', color: '#ef4444', label: 'Frustrated' },
            };
            const URG_META = {
              low:      { color: '#10b981', label: 'Low' },
              medium:   { color: '#f59e0b', label: 'Medium' },
              high:     { color: '#f97316', label: 'High' },
              critical: { color: '#ef4444', label: 'Critical' },
            };
            const sent = SENT_META[lead.sentiment] || null;
            const urg = URG_META[lead.urgency] || null;
            const score = lead.lead_score || 0;
            const scoreColor = score >= 7 ? '#10b981' : score >= 4 ? '#f59e0b' : '#ef4444';
            return (
              <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '18px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', border: '1.5px solid var(--border)' }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>Lead Intelligence ✨</p>
                {score > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>Score</p>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: 22, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{score}</span>
                        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>/10</span>
                      </div>
                    </div>
                    <div style={{ flex: 2, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${score * 10}%`, background: scoreColor, borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                )}
                {(sent || urg) && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {sent && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: sent.color + '18', color: sent.color, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {sent.emoji} {sent.label}
                      </span>
                    )}
                    {urg && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: urg.color + '18', color: urg.color }}>
                        ⚡ {urg.label} urgency
                      </span>
                    )}
                  </div>
                )}
                {lead.ai_last_analyzed_at && (
                  <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '10px 0 0' }}>
                    Last analyzed {formatSmart(lead.ai_last_analyzed_at)}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Activity stats */}
          <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', border: '1.5px solid var(--border)' }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Activity</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Lead Created', value: formatSmart(lead.created_at) },
                { label: 'Last Message', value: lead.last_message_at ? formatSmart(lead.last_message_at) : '—' },
                { label: 'Messages', value: messages.length },
                { label: 'Notes', value: notes.length },
                { label: 'Reminders', value: reminders.length },
                { label: 'Invoices', value: invoices.length },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Source Platform */}
          {(() => {
            const PLATFORM_COLORS = { whatsapp: '#25d366', instagram: '#c13584', facebook: '#1877f2', website: '#6366f1' };
            const PLATFORM_LABELS = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', website: 'Website' };
            const src = lead.platform_source || 'whatsapp';
            const color = PLATFORM_COLORS[src] || '#6b7280';
            return (
              <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '18px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', border: `1.5px solid ${color}33` }}>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Lead Source</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Globe size={16} color={color} />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{PLATFORM_LABELS[src] || src}</p>
                    {lead.platform_account_id && (
                      <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>via account</p>
                    )}
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: color + '18', color }}>{PLATFORM_LABELS[src] || src}</span>
                </div>
              </div>
            );
          })()}

          {/* Connected Channels */}
          <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '18px 20px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', border: '1.5px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>Connected Channels</p>
              <button onClick={() => setAddingChannel(v => !v)} style={{ padding: '4px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: '#6366f1', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                <Plus size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />Add
              </button>
            </div>
            {addingChannel && (
              <div style={{ background: 'rgba(139,92,246,0.12)', border: '1.5px solid #ddd6fe', borderRadius: 12, padding: 12, marginBottom: 10 }}>
                <select value={newChannel.platform} onChange={e => setNewChannel(p => ({ ...p, platform: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #ddd6fe', borderRadius: 8, fontSize: 12, marginBottom: 6, background: 'var(--surface)', outline: 'none' }}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                </select>
                <input value={newChannel.identifier} onChange={e => setNewChannel(p => ({ ...p, identifier: e.target.value }))} placeholder="Phone / username / email..."
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #ddd6fe', borderRadius: 8, fontSize: 12, marginBottom: 8, boxSizing: 'border-box', outline: 'none' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setAddingChannel(false)} style={{ flex: 1, padding: '6px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={async () => {
                    if (!newChannel.identifier.trim()) return;
                    try { await leadChannelsAPI.add(leadId, newChannel); const r = await leadChannelsAPI.getAll(leadId); setChannels(r.data.channels || []); setAddingChannel(false); setNewChannel({ platform: 'whatsapp', identifier: '', display_name: '' }); } catch {}
                  }} style={{ flex: 1, padding: '6px', borderRadius: 8, border: 'none', background: '#6366f1', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                </div>
              </div>
            )}
            {channels.length === 0 && !addingChannel ? (
              <p style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'center', padding: '8px 0' }}>No additional channels linked</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {channels.map(ch => {
                  const PCOLORS = { whatsapp: '#25d366', instagram: '#c13584', facebook: '#1877f2', email: '#f59e0b', phone: '#6366f1' };
                  const color = PCOLORS[ch.platform] || '#9ca3af';
                  return (
                    <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 10, border: `1.5px solid ${color}22` }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Globe size={12} color={color} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color, margin: 0, textTransform: 'capitalize' }}>{ch.platform}</p>
                        <p style={{ fontSize: 12, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.identifier}</p>
                      </div>
                      <button aria-label="Close" onClick={async () => { await leadChannelsAPI.remove(leadId, ch.id); setChannels(prev => prev.filter(c => c.id !== ch.id)); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                        <X size={13} color="#9ca3af" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div className="lead-center" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Multi-platform chat — tabs determine which platform's conversation is shown */}
          <div style={{ background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1.5px solid var(--border)', display: 'flex', flexDirection: 'column' }}>

            {/* Platform tab bar */}
            {(() => {
              const PLATFORMS = [
                { id: 'whatsapp',  label: 'WhatsApp',  icon: MessageCircle, color: '#25d366', grad: 'linear-gradient(135deg, #25d366, #128c7e)' },
                { id: 'instagram', label: 'Instagram', icon: Camera,        color: '#e1306c', grad: 'linear-gradient(135deg, #f58529, #dd2a7b, #8134af)' },
                { id: 'facebook',  label: 'Facebook',  icon: MonitorSmartphone, color: '#1877f2', grad: 'linear-gradient(135deg, #1877f2, #0a5cb8)' },
                { id: 'website',   label: 'Website',   icon: Globe,         color: '#6366f1', grad: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
              ];
              const sourceP = (lead.platform_source || 'whatsapp').toLowerCase();
              const isUnlocked = (id) => {
                if (id === sourceP) return true;
                if ((platformCounts[id] || 0) > 0) return true;
                if (channels.some(c => (c.platform || '').toLowerCase() === id)) return true;
                return false;
              };
              return (
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', overflowX: 'auto' }}>
                  {PLATFORMS.map(p => {
                    const active = activePlatform === p.id;
                    const unlocked = isUnlocked(p.id);
                    const unread = unreadByPlatform[p.id] || 0;
                    const totalMsgs = platformCounts[p.id] || 0;
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          if (unlocked) setActivePlatform(p.id);
                          else showToast(`${p.label} isn't connected for this lead yet. Add it under "Connected Channels" on the left.`, 'info');
                        }}
                        title={unlocked ? `Switch to ${p.label}` : `${p.label} not connected — link it under Connected Channels`}
                        style={{
                          flex: 1, minWidth: 110, padding: '12px 14px', border: 'none', background: 'none', cursor: 'pointer',
                          borderBottom: `3px solid ${active ? p.color : 'transparent'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          opacity: unlocked ? 1 : 0.45,
                          position: 'relative',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={e => { if (unlocked && !active) e.currentTarget.style.background = 'var(--surface)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                      >
                        <div style={{
                          width: 26, height: 26, borderRadius: 8,
                          background: active ? p.grad : (unlocked ? p.color + '22' : 'var(--surface)'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: unlocked ? 'none' : `1.5px dashed ${p.color}55`,
                        }}>
                          <Icon size={13} color={active ? 'white' : p.color} />
                        </div>
                        <div style={{ textAlign: 'left', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: active ? 800 : 600, color: active ? 'var(--text)' : 'var(--text-muted)' }}>
                              {p.label}
                            </span>
                            {!unlocked && <Lock size={10} color="var(--text-dim)" />}
                            {unread > 0 && (
                              <span style={{
                                fontSize: 10, fontWeight: 800,
                                background: p.color, color: 'white',
                                borderRadius: 10, padding: '1px 6px',
                                minWidth: 16, textAlign: 'center', lineHeight: 1.3,
                                animation: 'pulse 1.4s ease-in-out infinite',
                              }}>{unread > 9 ? '9+' : unread}</span>
                            )}
                          </div>
                          {unlocked && totalMsgs > 0 && (
                            <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: 0 }}>{totalMsgs} msgs</p>
                          )}
                          {!unlocked && (
                            <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: 0 }}>Not connected</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* Active-platform header bar */}
            {(() => {
              const P_META = {
                whatsapp:  { label: 'WhatsApp',  icon: MessageCircle,     color: '#25d366', grad: 'linear-gradient(135deg, #25d366, #128c7e)' },
                instagram: { label: 'Instagram', icon: Camera,            color: '#e1306c', grad: 'linear-gradient(135deg, #f58529, #dd2a7b, #8134af)' },
                facebook:  { label: 'Facebook',  icon: MonitorSmartphone, color: '#1877f2', grad: 'linear-gradient(135deg, #1877f2, #0a5cb8)' },
                website:   { label: 'Website',   icon: Globe,             color: '#6366f1', grad: 'linear-gradient(135deg, #6366f1, #4f46e5)' },
              };
              const meta = P_META[activePlatform] || P_META.whatsapp;
              const Icon = meta.icon;
              const sendableHere = activePlatform === 'whatsapp';
              return (
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: meta.grad, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={15} color="white" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{meta.label}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{messages.length} message{messages.length !== 1 ? 's' : ''}</p>
                  </div>
                  {syncingHistory && activePlatform === 'whatsapp' && (
                    <span style={{ fontSize: 10, color: '#6366f1', background: 'rgba(99,102,241,0.15)', padding: '3px 8px', borderRadius: 20, fontWeight: 700, marginRight: 6 }}>⟳ Syncing…</span>
                  )}
                  {sendableHere
                    ? <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.15)', color: '#16a34a' }}>● Live</span>
                    : <span title="Outbound sending is not wired for this platform yet — messages will be saved as drafts" style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.15)', color: '#d97706' }}>● Read-only</span>}
                </div>
              );
            })()}

            {/* Messages area — fills available viewport height, internal scroll only */}
            <div style={{ position: 'relative' }}>
            <div ref={messagesContainerRef} className="messages-area" style={{ height: 480, padding: '12px 16px', overflowY: 'auto', background: 'var(--bg)', flexShrink: 0 }}>
              {messages.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 20, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                    <MessageSquare size={24} color="#9ca3af" />
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>No messages yet</p>
                </div>
              ) : messages.map((msg, idx) => {
                const isVoice = msg.media_type === 'voice' || msg.media_type === 'audio';
                const isImage = msg.media_type === 'image';
                const isVideo = msg.media_type === 'video';
                const isFile  = msg.media_type === 'media' || msg.media_type === 'document' || msg.media_type === 'file';
                // Build the media URL. URL-encode each path segment so legacy filenames
                // with spaces / special chars still resolve through express.static.
                const mediaSrc = msg.media_url
                  ? (msg.media_url.startsWith('http')
                      ? msg.media_url
                      : `${BASE_URL}${msg.media_url.split('/').map((p, i) => i === 0 ? p : encodeURIComponent(p)).join('/')}`)
                  : null;
                // Grouping: tight spacing when previous message is from same sender within 2 min
                const prev = idx > 0 ? messages[idx - 1] : null;
                const tsCur = new Date(msg.timestamp).getTime();
                const tsPrev = prev ? new Date(prev.timestamp).getTime() : 0;
                const sameSender = prev && prev.from_me === msg.from_me && (tsCur - tsPrev) < 2 * 60 * 1000;
                // Date separator when day differs from previous
                const curDay = new Date(msg.timestamp).toDateString();
                const prevDay = prev ? new Date(prev.timestamp).toDateString() : null;
                const showDateBreak = !prev || curDay !== prevDay;
                const today = new Date().toDateString();
                const yesterday = new Date(Date.now() - 86400000).toDateString();
                const dayLabel = curDay === today ? 'Today' : curDay === yesterday ? 'Yesterday' : formatDate(msg.timestamp);
                return (
                  <div key={msg.id}>
                    {showDateBreak && (
                      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 8px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{dayLabel}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: msg.from_me ? 'flex-end' : 'flex-start', marginBottom: sameSender ? 2 : 8, marginTop: sameSender ? 0 : 0 }}>
                    <div style={{ maxWidth: '72%', padding: '9px 13px', borderRadius: msg.from_me
                          ? (sameSender ? '14px 4px 4px 14px' : '18px 18px 4px 18px')
                          : (sameSender ? '4px 14px 14px 4px' : '18px 18px 18px 4px'),
                        background: msg.from_me ? (typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? '#dcf8c6' : '#1a4731') : 'var(--surface2)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontSize: 14, lineHeight: 1.5, color: 'var(--text)' }}>
                      {isVoice ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Volume2 size={15} color="white" />
                          </div>
                          {mediaSrc ? (
                            <audio controls style={{ height: 32, maxWidth: 180 }}>
                              <source src={mediaSrc} />
                            </audio>
                          ) : (
                            <div style={{ width: 120, height: 4, background: 'var(--border)', borderRadius: 2 }}>
                              <div style={{ height: '100%', width: '40%', background: '#25d366', borderRadius: 2 }} />
                            </div>
                          )}
                        </div>
                      ) : isImage && mediaSrc ? (
                        /* Thumbnail — click to open full-size lightbox; onError falls back to a file chip
                           so a 404'd image still shows the user something useful (filename + open link). */
                        <ImageMessage src={mediaSrc} onOpen={() => setViewImage(mediaSrc)} />
                      ) : isVideo && mediaSrc ? (
                        <video controls src={mediaSrc} style={{ display: 'block', maxWidth: 240, maxHeight: 180, borderRadius: 8 }} />
                      ) : isFile && mediaSrc ? (
                        /* File attachment chip — show filename from the URL */
                        (() => {
                          const fname = decodeURIComponent((mediaSrc.split('/').pop() || 'Attachment').split('?')[0]);
                          const cleanName = fname.replace(/^\d+-/, ''); // strip the timestamp prefix
                          return (
                            <a href={mediaSrc} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'rgba(0,0,0,0.06)', borderRadius: 10, textDecoration: 'none', color: 'var(--text)', minWidth: 180 }}>
                              <FileText size={22} color="#6366f1" style={{ flexShrink: 0 }} />
                              <div style={{ minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{cleanName}</p>
                                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-dim)' }}>Tap to open</p>
                              </div>
                            </a>
                          );
                        })()
                      ) : (
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif' }}>{msg.body}</p>
                      )}
                      <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, textAlign: 'right', margin: 0, marginTop: 3 }}>
                        {formatTime(msg.timestamp)}
                        {!!msg.from_me && <span style={{ color: '#34b7f1', marginLeft: 4 }}>✓✓</span>}
                      </p>
                    </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            {/* Jump-to-latest pill — only when user has scrolled away from the bottom */}
            {showJumpToLatest && (
              <button
                onClick={scrollToLatest}
                title="Jump to latest"
                style={{
                  position: 'absolute', bottom: 12, right: 14, zIndex: 5,
                  background: 'var(--accent)', color: 'white', border: 'none',
                  borderRadius: 24, padding: '6px 14px', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.25)',
                  display: 'flex', alignItems: 'center', gap: 6,
                  animation: 'fadeIn 0.15s ease-out',
                }}
              >
                ↓ Latest
              </button>
            )}
            </div>

            {/* Emoji picker */}
            {showEmojiPicker && (
              <div style={{ padding: '12px 14px', background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {EMOJI_LIST.map(emoji => (
                  <button key={emoji} onClick={() => { setNewMessage(p => p + emoji); setShowEmojiPicker(false); textareaRef.current?.focus(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '4px', borderRadius: 6, transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {/* Toolbar */}
            <div style={{ padding: '8px 14px 0', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 2 }}>
              {[
                { icon: Bold, title: 'Bold (*text*)', action: () => applyFormat('*') },
                { icon: Italic, title: 'Italic (_text_)', action: () => applyFormat('_') },
                { icon: List, title: 'Bullet', action: () => { const ta = textareaRef.current; if (!ta) return; const pos = ta.selectionStart; const nv = newMessage.slice(0, pos) + '\n• ' + newMessage.slice(pos); setNewMessage(nv); } },
              ].map(({ icon: Icon, title, action }) => (
                <button key={title} onClick={action} title={title} style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af'; }}>
                  <Icon size={15} />
                </button>
              ))}
              <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Emoji" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: showEmojiPicker ? 'rgba(245,158,11,0.18)' : 'none', color: showEmojiPicker ? '#f59e0b' : '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                😊
              </button>

              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

              {/* Presets */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowPresets(!showPresets)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: showPresets ? 'rgba(99,102,241,0.12)' : 'var(--surface)', color: showPresets ? '#6366f1' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  <Zap size={13} /> Presets <ChevronDown size={11} />
                </button>
                {showPresets && (
                  <div style={{ position: 'absolute', bottom: '110%', left: 0, width: 280, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Quick Replies</span>
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                      {presets.length === 0 ? (
                        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>No presets yet.</div>
                      ) : presets.map(p => (
                        <button key={p.id} onClick={() => { setNewMessage(p.body); setShowPresets(false); textareaRef.current?.focus(); }}
                          style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', borderBottom: '1px solid #f9fafb' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>{p.title}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.body}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* AI Tools — rewrite / translate / shorten */}
              <div style={{ position: 'relative', marginLeft: 4 }}>
                <button
                  onClick={() => setShowAiTools(v => !v)}
                  disabled={!newMessage.trim() || !!aiToolLoading}
                  title={!newMessage.trim() ? 'Type a message first' : 'AI Tools'}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: showAiTools ? 'rgba(139,92,246,0.10)' : 'var(--surface)', color: showAiTools ? '#8b5cf6' : 'var(--text-muted)', cursor: !newMessage.trim() ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600, opacity: !newMessage.trim() ? 0.55 : 1 }}
                >
                  ✨ AI <ChevronDown size={11} />
                </button>
                {showAiTools && newMessage.trim() && (
                  <div style={{ position: 'absolute', bottom: '110%', left: 0, width: 220, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,0.18)', zIndex: 30, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Transform message</span>
                    </div>
                    {[
                      { id: 'rewrite-pro', label: 'Rewrite — Professional', fn: () => aiAPI.rewrite(newMessage, 'professional') },
                      { id: 'rewrite-friendly', label: 'Rewrite — Friendly', fn: () => aiAPI.rewrite(newMessage, 'friendly') },
                      { id: 'rewrite-empathetic', label: 'Rewrite — Empathetic', fn: () => aiAPI.rewrite(newMessage, 'empathetic') },
                      { id: 'shorten', label: 'Shorten', fn: () => aiAPI.shorten(newMessage) },
                      { id: 'translate-en', label: 'Translate to English', fn: () => aiAPI.translate(newMessage, 'English') },
                      { id: 'translate-es', label: 'Translate to Spanish', fn: () => aiAPI.translate(newMessage, 'Spanish') },
                    ].map(tool => (
                      <button
                        key={tool.id}
                        disabled={!!aiToolLoading}
                        onClick={async () => {
                          setAiToolLoading(tool.id);
                          try {
                            const res = await tool.fn();
                            if (res?.data?.text) setNewMessage(res.data.text);
                          } catch (e) {
                            showToast(e.response?.data?.error || 'AI tool failed');
                          } finally {
                            setAiToolLoading(null);
                            setShowAiTools(false);
                            textareaRef.current?.focus();
                          }
                        }}
                        style={{ width: '100%', padding: '10px 14px', border: 'none', background: 'none', textAlign: 'left', cursor: aiToolLoading ? 'wait' : 'pointer', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        onMouseEnter={e => { if (!aiToolLoading) e.currentTarget.style.background = 'var(--surface2)'; }}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                      >
                        <span>{tool.label}</span>
                        {aiToolLoading === tool.id && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>…</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Input */}
            <div style={{ padding: '10px 14px 14px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile} title="Attach file" style={{ width: 36, height: 36, borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-dim)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Paperclip size={15} />
              </button>

              {isRecording ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1.5px solid #fecaca', borderRadius: 14 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' }} />
                  <span style={{ fontSize: 14, color: '#ef4444', fontWeight: 700 }}>Recording {recordingTime}s</span>
                  <button onClick={stopRecording} style={{ marginLeft: 'auto', padding: '5px 12px', border: 'none', borderRadius: 8, background: '#ef4444', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Square size={12} /> Stop & Send
                  </button>
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                  placeholder={activePlatform && activePlatform !== 'whatsapp'
                    ? `Type a ${activePlatform} message... (saved as draft)`
                    : 'Type a message... (Enter to send)'}
                  rows={1}
                  style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 14, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5, maxHeight: 120, overflow: 'auto', fontFamily: 'inherit', color: 'var(--text)', background: 'var(--surface2)' }}
                  onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                />
              )}

              {!isRecording && (
                <button
                  onClick={startRecording}
                  title="Record voice note"
                  style={{ width: 36, height: 36, borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: '#25d366', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Mic size={15} />
                </button>
              )}

              <button aria-label="Send" onClick={handleSendMessage} disabled={!newMessage.trim() || sendingMessage} style={{ width: 42, height: 42, borderRadius: 13, border: 'none', flexShrink: 0, background: sendingMessage || !newMessage.trim() ? 'var(--border)' : 'linear-gradient(135deg, #25d366, #128c7e)', color: sendingMessage || !newMessage.trim() ? '#9ca3af' : 'white', cursor: !newMessage.trim() || sendingMessage ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={17} />
              </button>
            </div>

            {(uploadingFile) && (
              <div style={{ padding: '8px 14px', background: 'rgba(16,185,129,0.10)', borderTop: '1px solid #dcfce7', fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                Sending file...
              </div>
            )}
          </div>

          {/* Tabs Panel — sits BELOW the chat in the main column */}
          <div style={{ background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1.5px solid var(--border)', marginTop: 16 }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  flex: 1, padding: '13px 8px', border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: `2.5px solid ${activeTab === tab.id ? tab.color : 'transparent'}`,
                  color: activeTab === tab.id ? 'var(--text)' : 'var(--text-dim)',
                  fontWeight: activeTab === tab.id ? 800 : 500, fontSize: 12, whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5
                }}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: activeTab === tab.id ? tab.color : 'var(--surface2)', color: activeTab === tab.id ? 'white' : '#9ca3af' }}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>

            <div style={{ padding: '20px' }}>

              {/* NOTES */}
              {activeTab === 'notes' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <button onClick={() => setAddingNote(!addingNote)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      <Plus size={14} /> Add Note
                    </button>
                  </div>
                  {addingNote && (
                    <div style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                      <textarea value={newNote} onChange={e => setNewNote(e.target.value)} rows={3} placeholder="Write your note..."
                        style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #fde68a', borderRadius: 10, fontSize: 14, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--surface)' }} />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                        <button onClick={() => setAddingNote(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                        <button onClick={handleAddNote} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Save</button>
                      </div>
                    </div>
                  )}
                  {notes.length === 0 && !addingNote ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--border)' }}>
                      <StickyNote size={32} style={{ margin: '0 auto 8px' }} />
                      <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>No notes yet</p>
                    </div>
                  ) : notes.map(note => (
                    <div key={note.id} style={{ padding: '14px 16px', background: 'rgba(245,158,11,0.12)', borderRadius: 12, border: '1.5px solid #fef3c7', marginBottom: 10 }}>
                      <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.6 }}>{note.content}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{formatSmart(note.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* REMINDERS */}
              {activeTab === 'reminders' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <button onClick={() => setAddingReminder(!addingReminder)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      <Plus size={14} /> Add Reminder
                    </button>
                  </div>
                  {addingReminder && (
                    <div style={{ background: 'rgba(139,92,246,0.12)', border: '1.5px solid #ddd6fe', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Date & Time</label>
                        <input aria-label="Date & Time" type="datetime-local" value={newReminder.reminder_date} onChange={e => setNewReminder(p => ({ ...p, reminder_date: e.target.value }))}
                          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #ddd6fe', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface)' }} />
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Note</label>
                        <input type="text" value={newReminder.message} onChange={e => setNewReminder(p => ({ ...p, message: e.target.value }))} placeholder="Follow up with customer..."
                          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #ddd6fe', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface)' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button onClick={() => setAddingReminder(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                        <button onClick={handleAddReminder} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#8b5cf6', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Save</button>
                      </div>
                    </div>
                  )}
                  {reminders.length === 0 && !addingReminder ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                      <Bell size={32} color="#d1d5db" style={{ margin: '0 auto 8px' }} />
                      <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>No reminders set</p>
                    </div>
                  ) : reminders.map(r => (
                    <div key={r.id} style={{ padding: '14px 16px', background: r.is_completed ? 'var(--surface2)' : 'rgba(139,92,246,0.1)', borderRadius: 12, border: `1.5px solid ${r.is_completed ? 'var(--border)' : '#ddd6fe'}`, marginBottom: 10, opacity: r.is_completed ? 0.7 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Clock size={13} color="#8b5cf6" />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{formatSmart(r.reminder_date || r.due_date)}</span>
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{r.message || r.title || 'No note'}</p>
                        </div>
                        <button aria-label="Mark reminder as done" onClick={() => handleToggleReminder(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                          <CheckCircle size={20} color={r.is_completed ? '#10b981' : 'var(--border)'} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}


              {/* INVOICES */}
              {activeTab === 'invoices' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <button onClick={() => setShowInvoiceModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      <Plus size={14} /> Create Invoice
                    </button>
                  </div>
                  {invoices.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--border)' }}>
                      <Receipt size={32} style={{ margin: '0 auto 8px' }} />
                      <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>No invoices yet</p>
                    </div>
                  ) : invoices.map(inv => (
                    <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'rgba(16,185,129,0.10)', borderRadius: 12, border: '1.5px solid #bbf7d0', marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Receipt size={18} color="#10b981" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{inv.invoice_number}</p>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: inv.status === 'paid' ? 'rgba(16,185,129,0.15)' : inv.status === 'sent' ? 'rgba(59,130,246,0.10)' : 'rgba(245,158,11,0.18)', color: inv.status === 'paid' ? '#15803d' : inv.status === 'sent' ? '#1d4ed8' : '#92400e' }}>{inv.status}</span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{formatDate(inv.created_at)}{inv.due_date ? ` · Due ${formatDate(inv.due_date)}` : ''}</p>
                      </div>
                      <p style={{ fontSize: 18, fontWeight: 900, color: '#10b981', margin: 0 }}>{sym}{parseFloat(inv.total).toLocaleString()}</p>
                      {/* Preview / Send / Edit / Delete. A paid invoice is a
                          settled financial record, so it can be looked at and
                          sent but not edited or binned from here. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                        {[
                          { key: 'preview', Icon: Eye,    label: 'Preview',      onClick: () => previewInvoice(inv),    show: true },
                          { key: 'send',    Icon: Send,   label: 'Email to client', onClick: () => setSendingInvoice(inv), show: true },
                          { key: 'edit',    Icon: Edit2,  label: 'Edit',         onClick: () => openInvoiceEditor(inv), show: inv.status !== 'paid' },
                          { key: 'delete',  Icon: Trash2, label: 'Delete',       onClick: () => removeInvoice(inv),     show: inv.status !== 'paid', danger: true },
                        ].filter(a => a.show).map(({ key, Icon, label, onClick, danger }) => (
                          <button key={key} onClick={onClick} disabled={invoiceBusy === inv.id}
                            title={label} aria-label={`${label} ${inv.invoice_number || 'invoice'}`}
                            style={{
                              width: 30, height: 30, display: 'grid', placeItems: 'center',
                              background: 'none', border: 'none', borderRadius: 8,
                              cursor: invoiceBusy === inv.id ? 'wait' : 'pointer',
                              opacity: invoiceBusy === inv.id ? 0.45 : 1,
                              color: danger ? '#dc2626' : 'var(--text-muted)',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(16,185,129,0.14)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                            <Icon size={14} />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* EMAILS — compose & send */}
              {activeTab === 'emails' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 14 }}>
                    <button onClick={async () => {
                      try {
                        await leadEmailsAPI.pollNow();
                        const res = await leadEmailsAPI.getAll(leadId);
                        setLeadEmails(res.data.emails || []);
                      } catch {}
                    }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
                      <RefreshCw size={13} /> Refresh
                    </button>
                    <button onClick={() => setShowEmailCompose(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      <Send size={14} /> Compose Email
                    </button>
                  </div>
                  {leadEmails.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                      <Mail size={32} color="#d1d5db" style={{ margin: '0 auto 8px' }} />
                      <p style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 600 }}>No emails yet</p>
                      <p style={{ fontSize: 12, color: 'var(--border)' }}>Click "Compose Email" to send the first one.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {leadEmails.map(em => (
                        <div key={em.id} style={{ background: 'var(--surface2)', borderRadius: 12, border: '1.5px solid var(--border)', overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: em.direction === 'sent' ? '#10b98115' : '#6366f115', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ width: 32, height: 32, borderRadius: 8, background: em.direction === 'sent' ? '#10b98125' : '#6366f125', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Mail size={14} color={em.direction === 'sent' ? '#10b981' : '#6366f1'} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{em.subject || '(no subject)'}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                                {em.direction === 'sent' ? `To: ${em.to_email}` : `From: ${em.from_email}`}
                              </p>
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: em.direction === 'sent' ? '#10b98125' : '#6366f125', color: em.direction === 'sent' ? '#10b981' : '#6366f1', flexShrink: 0 }}>
                              {em.direction === 'sent' ? '↑ Sent' : '↓ Received'}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{formatSmart(em.created_at)}</span>
                          </div>
                          <EmailBodyRow em={em} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* EMAIL WORKFLOWS */}
              {activeTab === 'email-flow' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <button onClick={() => setShowEmailModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                      <Plus size={14} /> Start Email Workflow
                    </button>
                  </div>
                  {emailWorkflows.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--border)' }}>
                      <Mail size={32} style={{ margin: '0 auto 8px' }} />
                      <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>No email workflows yet</p>
                      <p style={{ fontSize: 12, color: 'var(--border)' }}>Create email templates in Settings first.</p>
                    </div>
                  ) : emailWorkflows.map((wf, i) => {
                    const statusColors = { pending: 'rgba(245,158,11,0.1)', sent: 'rgba(16,185,129,0.1)', failed: 'rgba(239,68,68,0.1)', skipped: 'var(--surface2)' };
                    const statusText = { pending: '#92400e', sent: '#15803d', failed: '#b91c1c', skipped: '#6b7280' };
                    return (
                      <div key={wf.id || i} style={{ display: 'flex', gap: 14, padding: '14px 16px', background: statusColors[wf.status] || 'var(--surface2)', borderRadius: 12, border: '1.5px solid var(--border)', marginBottom: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Mail size={18} color="#6366f1" />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{wf.template_name || 'Email'}</p>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: statusColors[wf.status], color: statusText[wf.status] }}>{wf.status}</span>
                          </div>
                          {wf.template_subject && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 4px' }}>Subject: {wf.template_subject}</p>}
                          <div style={{ display: 'flex', gap: 12 }}>
                            {wf.scheduled_at && <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>Scheduled: {formatSmart(wf.scheduled_at)}</p>}
                            {wf.sent_at && <p style={{ fontSize: 11, color: '#10b981', margin: 0 }}>Sent: {formatSmart(wf.sent_at)}</p>}
                          </div>
                        </div>
                        {wf.status === 'pending' && (
                          <button onClick={async () => {
                            await emailWorkflowsAPI.updateStatus(wf.id, 'sent');
                            fetchAll();
                          }} style={{ padding: '6px 12px', border: 'none', borderRadius: 8, background: '#6366f1', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                            Mark Sent
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* VERTICAL INTELLIGENCE */}
              {activeTab === 'vertical' && (
                <div>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '16px 20px', background: 'linear-gradient(135deg, #10b98120, #06b6d410)', borderRadius: 14, border: '1.5px solid #a7f3d044' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #10b981, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏭</div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Industry Intelligence</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>AI detects your industry and suggests the best actions</p>
                    </div>
                    <button onClick={handleDetectIndustry} disabled={verticalLoading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1.5px solid #a7f3d0', background: 'var(--surface)', color: '#059669', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                      {verticalLoading ? '🔄 Detecting...' : '🏭 Detect Industry'}
                    </button>
                  </div>

                  {/* Loading */}
                  {verticalLoading && (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                      <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
                      <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Analyzing conversation...</p>
                    </div>
                  )}

                  {/* Industry detected */}
                  {verticalIndustry && !verticalLoading && (
                    <div>
                      {/* Industry badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: 'var(--surface)', borderRadius: 14, border: `2px solid ${verticalIndustry.workflow?.color || '#10b981'}33`, marginBottom: 16 }}>
                        <div style={{ fontSize: 36 }}>{verticalIndustry.workflow?.emoji || '🏭'}</div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)', margin: '0 0 4px' }}>{verticalIndustry.workflow?.name || 'General Business'}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${verticalIndustry.confidence}%`, background: `linear-gradient(90deg, ${verticalIndustry.workflow?.color || '#10b981'}, ${verticalIndustry.workflow?.color || '#10b981'}88)`, borderRadius: 3, transition: 'width 0.8s ease' }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 800, color: verticalIndustry.workflow?.color || '#10b981', flexShrink: 0 }}>{verticalIndustry.confidence}% confidence</span>
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '4px 0 0' }}>Detected via {verticalIndustry.source === 'ai' ? 'AI analysis' : 'keyword matching'}</p>
                        </div>
                      </div>

                      {/* AI Suggestion */}
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🧠 AI Recommendation</p>
                          <button onClick={() => handleVerticalSuggest(verticalIndustry.industry)} disabled={verticalSuggestLoading}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #c4b5fd', background: 'rgba(139,92,246,0.10)', color: '#7c3aed', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}>
                            {verticalSuggestLoading ? '🔄 Analyzing...' : '✨ Get AI Suggestion'}
                          </button>
                        </div>

                        {verticalSuggestion ? (
                          <div style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', borderRadius: 14, padding: '16px 18px' }}>
                            {/* Buying stage */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                              <span style={{ fontSize: 14 }}>
                                {verticalSuggestion.buying_stage === 'urgent' ? '🔥' :
                                 verticalSuggestion.buying_stage === 'ready_to_buy' ? '🟢' :
                                 verticalSuggestion.buying_stage === 'considering' ? '🟡' : '🟢'}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 800, color: '#b45309', textTransform: 'capitalize' }}>
                                {(verticalSuggestion.buying_stage || '').replace(/_/g, ' ')}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>— {verticalSuggestion.buying_stage_reason}</span>
                            </div>

                            {/* Next action */}
                            <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Recommended Action</p>
                              <p style={{ fontSize: 13, fontWeight: 700, color: '#059669', margin: 0 }}>→ {verticalSuggestion.next_action}</p>
                            </div>

                            {/* Suggested message */}
                            <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1.5px solid #fde68a' }}>
                              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>Suggested Message</p>
                              <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 10px', lineHeight: 1.6 }}>{verticalSuggestion.suggested_message}</p>
                              <button onClick={() => setNewMessage(verticalSuggestion.suggested_message)}
                                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#f59e0b', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
                                Use This Message
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: 12, border: '1.5px solid var(--border)', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                            Click "Get AI Suggestion" for personalized recommendations
                          </div>
                        )}
                      </div>

                      {/* Quick Actions */}
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: '0 0 10px' }}>⚡ Quick Actions</p>

                        {verticalActionResult && (
                          <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, background: verticalActionResult.startsWith('✅') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.12)', border: `1.5px solid ${verticalActionResult.startsWith('✅') ? '#a7f3d0' : '#fecaca'}`, fontSize: 13, fontWeight: 600, color: verticalActionResult.startsWith('✅') ? '#059669' : '#dc2626' }}>
                            {verticalActionResult}
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {(verticalIndustry.workflow?.actions || []).map(action => (
                            <div key={action.id} style={{ background: 'var(--surface)', borderRadius: 12, border: '1.5px solid var(--border)', overflow: 'hidden' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                                <span style={{ fontSize: 20, flexShrink: 0 }}>{action.icon}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{action.label}</p>
                                  <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{action.message.substring(0, 60)}...</p>
                                </div>
                                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                                  <button onClick={() => {
                                    if (editingActionMsg === action.id) { setEditingActionMsg(null); }
                                    else { setEditingActionMsg(action.id); setCustomActionMsg(action.message); }
                                  }} style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleVerticalAction(action.id, verticalIndustry.industry, editingActionMsg === action.id ? customActionMsg : null)}
                                    disabled={verticalActionLoading === action.id}
                                    style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: verticalActionLoading === action.id ? 'var(--border)' : `linear-gradient(135deg, ${verticalIndustry.workflow?.color}, ${verticalIndustry.workflow?.color}bb)`, color: verticalActionLoading === action.id ? '#9ca3af' : 'white', cursor: verticalActionLoading === action.id ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700 }}>
                                    {verticalActionLoading === action.id ? 'Sending...' : '▶ Send'}
                                  </button>
                                </div>
                              </div>

                              {/* Edit message */}
                              {editingActionMsg === action.id && (
                                <div style={{ padding: '0 14px 14px', borderTop: '1px solid var(--border)' }}>
                                  <textarea
                                    value={customActionMsg}
                                    onChange={e => setCustomActionMsg(e.target.value)}
                                    rows={3}
                                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: 10 }}
                                  />
                                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                    <button onClick={() => setEditingActionMsg(null)} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
                                    <button onClick={() => handleVerticalAction(action.id, verticalIndustry.industry, customActionMsg)}
                                      disabled={verticalActionLoading === action.id}
                                      style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: verticalIndustry.workflow?.color || '#10b981', color: 'white', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                                      Send Custom
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Empty state */}
                  {!verticalIndustry && !verticalLoading && (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-dim)' }}>
                      <div style={{ fontSize: 48, marginBottom: 10 }}>🏭</div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Industry not detected yet</p>
                      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>Click "Detect Industry" to analyze this lead's conversation.</p>
                      <button onClick={handleDetectIndustry} style={{ padding: '10px 24px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #10b981, #06b6d4)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                        🏭 Detect Industry
                      </button>
                    </div>
                  )}
                </div>
              )}
              {/* TEAM ROOM */}
              {activeTab === 'room' && (
                <div style={{ padding: '4px 0' }}>
                  <RoomPanel type="lead" id={leadId} title={lead?.customer_name} />
                </div>
              )}
              {/* AI ASSISTANT */}
              {activeTab === 'ai' && (
                <div>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '16px 20px', background: 'linear-gradient(135deg, #8b5cf620, #6366f110)', borderRadius: 14, border: '1.5px solid #c4b5fd44' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✨</div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: 0 }}>AI Assistant</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Analyzes this lead's conversation</p>
                    </div>
                  </div>

                  {aiError && (
                    <div style={{ background: 'rgba(239,68,68,0.12)', border: '1.5px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 8 }}>
                      ⚠ {aiError}
                    </div>
                  )}

                  {/* 3 Action Cards */}
                  <div className="r-stack-tablet" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
                    {[
                      { label: 'Summarize Chat', icon: '🧠', desc: 'Get a quick summary', key: 'summary', action: handleAISummary, color: '#8b5cf6' },
                      { label: 'Reply Suggestions', icon: '✨', desc: '3 ready-to-send replies', key: 'suggestions', action: handleAISuggestions, color: '#06b6d4' },
                      { label: 'Analyze Lead', icon: '🎯', desc: 'Intent, score & action', key: 'analysis', action: handleAIAnalysis, color: '#f59e0b' },
                    ].map(card => (
                      <button key={card.key} onClick={card.action} disabled={aiLoading[card.key]}
                        style={{ padding: '16px 12px', borderRadius: 14, border: `1.5px solid ${card.color}33`, background: aiLoading[card.key] ? 'var(--surface2)' : `${card.color}08`, cursor: aiLoading[card.key] ? 'not-allowed' : 'pointer', textAlign: 'center', transition: 'all 0.2s' }}
                        onMouseEnter={e => { if (!aiLoading[card.key]) e.currentTarget.style.background = card.color + '18'; }}
                        onMouseLeave={e => { if (!aiLoading[card.key]) e.currentTarget.style.background = card.color + '08'; }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>
                          {aiLoading[card.key] ? <div style={{ width: 24, height: 24, border: `2px solid ${card.color}44`, borderTopColor: card.color, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} /> : card.icon}
                        </div>
                        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', margin: '0 0 3px' }}>{card.label}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{card.desc}</p>
                      </button>
                    ))}
                  </div>

                  {/* Summary Result */}
                  {aiSummary && (
                    <div style={{ background: 'rgba(139,92,246,0.10)', border: '1.5px solid #c4b5fd', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 16 }}>🧠</span>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#7c3aed', margin: 0 }}>Chat Summary</p>
                        <button aria-label="Close" onClick={() => setAiSummary('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={14} /></button>
                      </div>
                      <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, lineHeight: 1.7 }}>{aiSummary}</p>
                    </div>
                  )}

                  {/* Reply Suggestions Result */}
                  {aiSuggestions.length > 0 && (
                    <div style={{ background: 'rgba(6,182,212,0.10)', border: '1.5px solid #a5f3fc', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 16 }}>⚡</span>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#0891b2', margin: 0 }}>Reply Suggestions</p>
                        <button aria-label="Close" onClick={() => setAiSuggestions([])} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={14} /></button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {aiSuggestions.map((s, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', background: 'var(--surface)', borderRadius: 10, border: '1.5px solid #cffafe' }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#0891b2', background: '#cffafe', padding: '2px 7px', borderRadius: 6, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                            <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, flex: 1, lineHeight: 1.6 }}>{s}</p>
                            <button onClick={() => { setNewMessage(s); setActiveTab('notes'); setTimeout(() => setActiveTab('ai'), 10); textareaRef.current?.focus(); }}
                              style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: '#0891b2', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                              Use
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Analysis Result */}
                  {aiAnalysis && (
                    <div style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <span style={{ fontSize: 16 }}>🎯</span>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#b45309', margin: 0 }}>Lead Analysis</p>
                        <button aria-label="Close" onClick={() => setAiAnalysis(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={14} /></button>
                      </div>

                      <div className="r-stack-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                        {/* Lead Score */}
                        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '12px 10px', border: '1.5px solid #fde68a', textAlign: 'center' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Score</p>
                          <div style={{ fontSize: 28, fontWeight: 900, color: aiAnalysis.lead_score >= 7 ? '#10b981' : aiAnalysis.lead_score >= 4 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>{aiAnalysis.lead_score}<span style={{ fontSize: 13, color: 'var(--text-dim)' }}>/10</span></div>
                        </div>
                        {/* Temperature */}
                        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '12px 10px', border: '1.5px solid #fde68a', textAlign: 'center' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Temperature</p>
                          <p style={{ fontSize: 18, margin: 0 }}>
                            {aiAnalysis.temperature === 'urgent' ? '🔥' : aiAnalysis.temperature === 'hot' ? '🟠' : aiAnalysis.temperature === 'warm' ? '🟡' : '🟢'}
                          </p>
                          <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', margin: '2px 0 0', textTransform: 'capitalize' }}>{aiAnalysis.temperature}</p>
                        </div>
                        {/* Sentiment — new */}
                        {aiAnalysis.sentiment && (() => {
                          const sent = {
                            positive:   { emoji: '😊', label: 'Positive' },
                            neutral:    { emoji: '😐', label: 'Neutral' },
                            negative:   { emoji: '😟', label: 'Negative' },
                            frustrated: { emoji: '😠', label: 'Frustrated' },
                          }[aiAnalysis.sentiment];
                          return sent ? (
                            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '12px 10px', border: '1.5px solid #fde68a', textAlign: 'center' }}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Sentiment</p>
                              <p style={{ fontSize: 18, margin: 0 }}>{sent.emoji}</p>
                              <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text)', margin: '2px 0 0' }}>{sent.label}</p>
                            </div>
                          ) : null;
                        })()}
                        {/* Urgency — new */}
                        {aiAnalysis.urgency && (() => {
                          const urg = {
                            low:      { color: '#10b981', label: 'Low' },
                            medium:   { color: '#f59e0b', label: 'Medium' },
                            high:     { color: '#f97316', label: 'High' },
                            critical: { color: '#ef4444', label: 'Critical' },
                          }[aiAnalysis.urgency];
                          return urg ? (
                            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '12px 10px', border: '1.5px solid #fde68a', textAlign: 'center' }}>
                              <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Urgency</p>
                              <p style={{ fontSize: 18, margin: 0, color: urg.color }}>⚡</p>
                              <p style={{ fontSize: 11, fontWeight: 800, color: urg.color, margin: '2px 0 0' }}>{urg.label}</p>
                            </div>
                          ) : null;
                        })()}
                      </div>

                      {/* Intent */}
                      <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1.5px solid #fde68a', marginBottom: 10 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Customer Intent</p>
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{aiAnalysis.intent}</p>
                      </div>

                      {/* Next Action */}
                      <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 10, padding: '12px 14px', border: '1.5px solid rgba(16,185,129,0.3)', marginBottom: 10 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Recommended Next Action</p>
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#059669', margin: 0 }}>→ {aiAnalysis.next_action}</p>
                      </div>

                      {/* Score reason */}
                      {aiAnalysis.lead_score_reason && (
                        <div style={{ background: 'var(--surface)', borderRadius: 10, padding: '12px 14px', border: '1.5px solid #fde68a', marginBottom: 10 }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 4px' }}>Score Reasoning</p>
                          <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{aiAnalysis.lead_score_reason}</p>
                        </div>
                      )}

                      {/* Key entities */}
                      {aiAnalysis.key_entities?.length > 0 && (
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 8px' }}>Key Topics</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {aiAnalysis.key_entities.map((e, i) => (
                              <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(245,158,11,0.18)', color: 'var(--warning-text)', border: '1px solid #fde68a' }}>{e}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Empty state */}
                  {!aiSummary && aiSuggestions.length === 0 && !aiAnalysis && (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-dim)' }}>
                      <div style={{ fontSize: 40, marginBottom: 10 }}>✨</div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>AI Assistant Ready</p>
                      <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>Click any button above to analyze this lead's conversation.</p>
                    </div>
                  )}
                </div>
              )}

              {/* UNIFIED TIMELINE */}
              {activeTab === 'timeline' && (() => {
                const TIMELINE_ICONS = {
                  message_in: MessageSquare, message_out: Send, note: StickyNote, reminder: Bell,
                  reminder_done: CheckCircle, status_change: Activity, assignment: UserCheck,
                  invoice: Receipt, email: Mail, channel_added: Layers, relation_linked: Link2,
                  lead_created: Star, created: Star, message: MessageSquare,
                  // Everything below now reaches the spine and used to render as a
                  // generic grey dot - a booking was indistinguishable from a note.
                  booking: Calendar, meeting_scheduled: Video, contract: FileSignature,
                  payment: Banknote, order: ShoppingBag, media: Camera, media_project: Camera,
                  reel: Film, portfolio: Globe, client: UserCheck, pipeline: TrendingUp,
                };
                const TIMELINE_COLORS = {
                  message_in: '#25d366', message_out: '#6366f1', note: '#f59e0b', reminder: '#8b5cf6',
                  reminder_done: '#10b981', status_change: '#06b6d4', assignment: '#06b6d4',
                  invoice: '#10b981', email: '#f59e0b', channel_added: '#ec4899', relation_linked: '#6366f1',
                  lead_created: '#10b981', created: '#10b981', message: '#25d366',
                  booking: '#0ea5e9', meeting_scheduled: '#6366f1', contract: '#8b5cf6',
                  payment: '#10b981', order: '#f97316', media: '#ec4899', media_project: '#ec4899',
                  reel: '#a855f7', portfolio: '#0ea5e9', client: '#10b981', pipeline: '#06b6d4',
                };
                const PLATFORM_LABELS = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', website: 'Website', email: 'Email', system: 'System' };
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                      <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>
                        Everything that has happened with this contact — messages, notes, bookings, contracts, invoices, payments, shoots and deliveries.
                      </p>
                      <button onClick={loadTimeline} disabled={timelineLoading}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                        <RefreshCw size={12} /> {timelineLoading ? 'Loading…' : 'Refresh'}
                      </button>
                    </div>
                    {timeline.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <Activity size={36} color="#d1d5db" style={{ margin: '0 auto 10px' }} />
                        <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                          {timelineLoading ? 'Loading the timeline…' : 'Nothing has happened yet'}
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                          {timelineLoading ? '' : 'Messages, bookings, contracts and invoices will appear here as they happen.'}
                        </p>
                      </div>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 2, background: 'var(--surface2)' }} />
                        {timeline.map((item, i) => {
                          const type = item.activity_type || item.type || 'message';
                          const Icon = TIMELINE_ICONS[type] || Activity;
                          const color = TIMELINE_COLORS[type] || '#6b7280';
                          const platform = item.platform;
                          const nickname = item.account_nickname;
                          return (
                            <div key={item.id || i} style={{ display: 'flex', gap: 14, marginBottom: 14, position: 'relative' }}>
                              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--surface)', border: `2px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, boxShadow: `0 0 0 3px var(--surface)` }}>
                                <Icon size={14} color={color} />
                              </div>
                              <div style={{ flex: 1, paddingTop: 3 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                                  {platform && (
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: color + '18', color }}>
                                      {PLATFORM_LABELS[platform] || platform}{nickname ? ` · ${nickname}` : ''}
                                    </span>
                                  )}
                                  {item.actor_name && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>by {item.actor_name}</span>}
                                </div>
                                {item.title && <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px' }}>{item.title}</p>}
                                {item.body && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>{item.body?.slice(0, 120)}{item.body?.length > 120 ? '…' : ''}</p>}
                                <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0' }}>{formatSmart(item.created_at)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* RELATED LEADS */}
              {activeTab === 'related' && (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
                    Leads that may represent the same person across different platforms or sources.
                  </p>

                  {/* Linked */}
                  {relatedLeads.linked.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Linked Leads</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {relatedLeads.linked.map(rel => (
                          <div key={rel.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(99,102,241,0.08)', borderRadius: 12, border: '1.5px solid rgba(99,102,241,0.2)' }}>
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                              {rel.customer_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{rel.customer_name || 'Unknown'}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{rel.platform_source || 'whatsapp'} · {rel.status}</p>
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <a href={`/leads/${rel.other_lead_id}`} style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}>View</a>
                              <button onClick={async () => { try { await leadRelationsAPI.unlink(rel.id); setRelatedLeads(prev => ({ ...prev, linked: prev.linked.filter(l => l.id !== rel.id) })); } catch {} }}
                                style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #fecaca', background: 'var(--surface)', color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Unlink</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggestions */}
                  {relatedLeads.suggestions.length > 0 && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>Possible Matches</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {relatedLeads.suggestions.map(sug => (
                          <div key={sug.id} style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 12, border: '1.5px solid #fde68a' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#f59e0b22', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
                                {sug.customer_name?.[0]?.toUpperCase() || '?'}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{sug.customer_name || 'Unknown'}</p>
                                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>Matched by {sug.match_reason} · {sug.platform_source || 'whatsapp'}</p>
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: 'rgba(245,158,11,0.18)', color: '#92400e' }}>Possible match</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <a href={`/leads/${sug.id}`} style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>View</a>
                              <button onClick={async () => {
                                try {
                                  await leadRelationsAPI.link({ lead_id_a: leadId, lead_id_b: sug.id, relation_type: 'linked' });
                                  setRelatedLeads(prev => ({ suggestions: prev.suggestions.filter(s => s.id !== sug.id), linked: [...prev.linked, { ...sug, other_lead_id: sug.id }] }));
                                } catch {}
                              }} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #6366f1, #4f46e5)', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Link</button>
                              <button onClick={() => setRelatedLeads(prev => ({ ...prev, suggestions: prev.suggestions.filter(s => s.id !== sug.id) }))}
                                style={{ flex: 1, padding: '7px', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Ignore</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {relatedLeads.suggestions.length === 0 && relatedLeads.linked.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                      <Network size={36} color="#d1d5db" style={{ margin: '0 auto 10px' }} />
                      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>No Related Leads Found</p>
                      <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>No other leads share the same phone, email, or name.</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </div>{/* /lead-grid */}

      {/* Email Compose Modal */}
      {showEmailCompose && (
        <EmailComposeModal
          lead={lead}
          onClose={() => setShowEmailCompose(false)}
          onSent={async (email) => {
            setLeadEmails(prev => [email, ...prev]);
            setShowEmailCompose(false);
            setActiveTab('emails');
          }}
        />
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
    </>
  );
}

// ── Email Compose Modal ─────────────────────────────────────────────────────
function EmailComposeModal({ lead, onClose, onSent }) {
  const leadId = lead?.id;
  const [form, setForm] = useState({ to_email: lead?.email || '', subject: '' });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef(null);
  const fileInputRef = useRef(null);
  const [attachments, setAttachments] = useState([]);

  const execCmd = (cmd, value = null) => {
    bodyRef.current?.focus();
    document.execCommand(cmd, false, value);
  };

  const handleAttach = (e) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
    e.target.value = '';
  };

  const handleSend = async () => {
    const body = bodyRef.current?.innerHTML || '';
    if (!form.to_email || !form.subject || !body.trim()) { setError('All fields are required'); return; }
    setSending(true); setError('');
    try {
      const res = await leadEmailsAPI.send(leadId, { ...form, body });
      onSent(res.data.email);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to send email');
    } finally { setSending(false); }
  };

  const toolbarBtns = [
    { title: 'Bold', label: <strong>B</strong>, cmd: 'bold' },
    { title: 'Italic', label: <em>I</em>, cmd: 'italic' },
    { title: 'Underline', label: <u>U</u>, cmd: 'underline' },
    { title: 'Bullet list', label: '•—', cmd: 'insertUnorderedList' },
    { title: 'Numbered list', label: '1.', cmd: 'insertOrderedList' },
    { title: 'Link', label: '🔗', cmd: 'createLink', prompt: true },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
      <div className="r-modal" style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, maxWidth: 620, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={20} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Compose Email</h2>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>To: {lead?.customer_name || 'Lead'}</p>
          </div>
          <button aria-label="Close" onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={18} /></button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>To</label>
          <input value={form.to_email} onChange={e => setForm(f => ({ ...f, to_email: e.target.value }))} placeholder="recipient@email.com" type="email"
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: 'var(--text)' }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Subject</label>
          <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Email subject"
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: 'var(--text)' }} />
        </div>

        {/* Rich text editor */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Message</label>
          <div style={{ border: '1.5px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 10px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              {toolbarBtns.map(btn => (
                <button
                  key={btn.title}
                  title={btn.title}
                  onMouseDown={e => {
                    e.preventDefault();
                    if (btn.prompt) {
                      const url = window.prompt('Enter URL:');
                      if (url) execCmd(btn.cmd, url);
                    } else {
                      execCmd(btn.cmd);
                    }
                  }}
                  style={{ padding: '4px 9px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontFamily: 'inherit' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {btn.label}
                </button>
              ))}
              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
              <button
                title="Attach file"
                onMouseDown={e => { e.preventDefault(); fileInputRef.current?.click(); }}
                style={{ padding: '4px 9px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <Paperclip size={13} /> Attach
              </button>
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleAttach} />
            </div>
            {/* Content-editable body */}
            <div
              ref={bodyRef}
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Write your email here…"
              style={{
                minHeight: 160, padding: '14px 16px', outline: 'none',
                fontSize: 14, lineHeight: 1.7, color: 'var(--text)',
                fontFamily: 'inherit',
              }}
              onFocus={e => { e.currentTarget.parentElement.style.borderColor = '#6366f1'; }}
              onBlur={e => { e.currentTarget.parentElement.style.borderColor = 'var(--border)'; }}
            />
          </div>
          {/* Attachments list */}
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {attachments.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', background: 'var(--surface2)', borderRadius: 20, fontSize: 12, color: 'var(--text)' }}>
                  <Paperclip size={11} />
                  {f.name}
                  <button aria-label="Close" onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ background: 'var(--warning-bg)', border: '1.5px solid var(--warning-border)', borderRadius: 10, padding: '10px 14px', marginBottom: 18 }}>
          <p style={{ fontSize: 12, color: 'var(--warning-text)', margin: 0 }}>
            📧 Emails are sent via your SMTP settings. Configure them in <strong>Settings → Email Sending</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', border: '1.5px solid var(--border)', borderRadius: 11, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          <button onClick={handleSend} disabled={sending} style={{
            flex: 2, padding: '11px', background: sending ? '#6ee7b7' : 'linear-gradient(135deg, #10b981, #059669)',
            border: 'none', borderRadius: 11, color: 'white', fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer', fontSize: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
          }}>
            {sending ? <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Sending…</> : <><Send size={15} /> Send Email</>}
          </button>
        </div>
      </div>
    </div>
  );
}