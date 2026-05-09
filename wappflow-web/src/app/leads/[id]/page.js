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
  FileText, History, Play, Volume2, Globe, Hash,
  ChevronRight, Activity, Receipt, Workflow, RefreshCw
} from 'lucide-react';
import {
  leadsAPI, presetsAPI, tagsAPI, emailTemplatesAPI,
  invoicesAPI, emailWorkflowsAPI, teamAPI, settingsAPI,
  leadEmailsAPI,
  displayPhone, formatCurrency, BASE_URL,
} from '../../../lib/api';
import { TagChip, TagPicker } from '../../../components/TagPicker';
import NavBar from '../../../components/NavBar';

const STATUS_META = {
  'New':           { dot: '#6366f1', bg: 'rgba(99,102,241,0.15)',  text: '#818cf8', label: 'New' },
  'Contacted':     { dot: '#06b6d4', bg: '#ecfeff',  text: '#0e7490', label: 'Contacted' },
  'Interested':    { dot: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  text: '#fbbf24', label: 'Interested' },
  'Negotiating':   { dot: '#f97316', bg: '#fff7ed',  text: '#c2410c', label: 'Negotiating' },
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

function Modal({ children, maxWidth = 440 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.2)', maxWidth, width: '100%', padding: 30 }}>
        {children}
      </div>
    </div>
  );
}

function DeleteModal({ name, onConfirm, onCancel, loading }) {
  return (
    <Modal>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <AlertTriangle size={22} color="#ef4444" />
        </div>
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Move to Trash?</p>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>Restorable within 90 days</p>
        </div>
      </div>
      <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>Are you sure you want to trash <strong>{name}</strong>?</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '11px', border: '1.5px solid #e5e7eb', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
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
        <div style={{ width: 48, height: 48, borderRadius: 16, background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Trophy size={22} color="#10b981" />
        </div>
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🏆 Close as Won!</p>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>{name}</p>
        </div>
      </div>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>Sale Amount</label>
      <div style={{ display: 'flex', border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        <span style={{ padding: '12px 16px', background: 'var(--surface2)', color: 'var(--text-muted)', fontWeight: 700, fontSize: 14, borderRight: '1.5px solid #e5e7eb' }}>{currencySymbol}</span>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount..." autoFocus
          style={{ flex: 1, padding: '12px 16px', border: 'none', outline: 'none', fontSize: 16, fontWeight: 700 }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '11px', border: '1.5px solid #e5e7eb', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button onClick={() => onConfirm(amount)} disabled={loading} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 12, background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Saving...' : '🏆 Mark as Won'}
        </button>
      </div>
    </Modal>
  );
}

function LostModal({ name, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState(LOST_REASONS[0]);
  return (
    <Modal>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ThumbsDown size={22} color="#ef4444" />
        </div>
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Close as Lost</p>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>{name}</p>
        </div>
      </div>
      <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 10 }}>Reason</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
        {LOST_REASONS.map(r => (
          <button key={r} onClick={() => setReason(r)} style={{ padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${reason === r ? '#ef4444' : 'var(--border)'}`, background: reason === r ? '#fef2f2' : 'white', color: reason === r ? '#ef4444' : '#6b7280', fontWeight: reason === r ? 700 : 500, cursor: 'pointer', fontSize: 12, textAlign: 'left' }}>{r}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '11px', border: '1.5px solid #e5e7eb', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
        <button onClick={() => onConfirm(reason)} disabled={loading} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 12, background: '#ef4444', color: 'white', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Saving...' : 'Mark as Lost'}
        </button>
      </div>
    </Modal>
  );
}

// ── Invoice Modal ─────────────────────────────────────────────────────────────
function InvoiceModal({ lead, company, onClose, onSaved }) {
  const [items, setItems] = useState([{ description: '', qty: 1, rate: 0 }]);
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [taxRate, setTaxRate] = useState(company?.tax_rate || 0);
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
        customer_phone: displayPhone(lead.customer_phone),
        items: items.map(it => ({ ...it, amount: (parseFloat(it.qty) || 0) * (parseFloat(it.rate) || 0) })),
        subtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
        due_date: dueDate, notes, status: 'draft'
      };
      await invoicesAPI.create(payload);
      onSaved();
      onClose();
    } catch (e) { alert('Error creating invoice: ' + e.message); } finally { setSaving(false); }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head><title>Invoice</title>
      <style>body{font-family:system-ui;max-width:680px;margin:40px auto;color:#111}
      table{width:100%;border-collapse:collapse}th,td{padding:10px;text-align:left;border-bottom:1px solid #e5e7eb}
      th{background:#f9fafb;font-weight:700}.total-row{font-weight:900;font-size:18px}</style></head>
      <body>
      <h1 style="color:#6366f1">INVOICE</h1>
      <div style="display:flex;justify-content:space-between;margin-bottom:24px">
        <div><strong>Bill To:</strong><br>${lead.customer_name}<br>${displayPhone(lead.customer_phone)}</div>
        <div style="text-align:right"><strong>${company?.company_name || ''}</strong><br>${company?.company_email || ''}</div>
      </div>
      <table><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
      ${items.map(it => `<tr><td>${it.description}</td><td>${it.qty}</td><td>${sym}${parseFloat(it.rate).toFixed(2)}</td><td>${sym}${((parseFloat(it.qty)||0)*(parseFloat(it.rate)||0)).toFixed(2)}</td></tr>`).join('')}
      <tr><td colspan="3">Subtotal</td><td>${sym}${subtotal.toFixed(2)}</td></tr>
      <tr><td colspan="3">${company?.tax_name||'Tax'} (${taxRate}%)</td><td>${sym}${taxAmount.toFixed(2)}</td></tr>
      <tr class="total-row"><td colspan="3">Total</td><td>${sym}${total.toFixed(2)}</td></tr></table>
      ${notes ? `<p style="margin-top:20px"><strong>Notes:</strong> ${notes}</p>` : ''}
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: '0 32px 80px rgba(0,0,0,0.2)', maxWidth: 680, width: '100%', padding: 32, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Receipt size={22} color="#f59e0b" />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Create Invoice</h2>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>For {lead.customer_name}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer' }}>
            <X size={18} color="#6b7280" />
          </button>
        </div>

        {/* Line items */}
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Line Items</p>
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
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                </td>
                <td style={{ padding: '6px 4px', width: 70 }}>
                  <input type="number" value={item.qty} onChange={e => updateItem(i, 'qty', e.target.value)} min="1"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                </td>
                <td style={{ padding: '6px 4px', width: 110 }}>
                  <input type="number" value={item.rate} onChange={e => updateItem(i, 'rate', e.target.value)} min="0" step="0.01"
                    style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                </td>
                <td style={{ padding: '6px 10px', fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>
                  {sym}{((parseFloat(item.qty)||0) * (parseFloat(item.rate)||0)).toFixed(2)}
                </td>
                <td style={{ padding: '6px 4px' }}>
                  {items.length > 1 && (
                    <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                      <X size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

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
                style={{ width: 60, padding: '4px 8px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 12, outline: 'none' }} />
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 6 }}>Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment terms, notes..."
              style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handlePrint} style={{ padding: '12px 20px', border: '1.5px solid #e5e7eb', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 7 }}>
            <FileText size={15} /> Print / PDF
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            flex: 1, padding: '12px', border: 'none', borderRadius: 12,
            background: saving ? '#9ca3af' : 'linear-gradient(135deg, #f59e0b, #d97706)',
            color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14
          }}>
            {saving ? 'Saving...' : 'Save Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Email Workflow Modal ───────────────────────────────────────────────────────
function EmailWorkflowModal({ lead, templates, onClose, onSaved }) {
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
    } catch (e) { alert('Error: ' + e.message); } finally { setSaving(false); }
  };

  return (
    <Modal>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Start Email Workflow</h2>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>For {lead.customer_name}</p>
        </div>
        <button onClick={onClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer' }}><X size={18} color="#6b7280" /></button>
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
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
            <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)}
              style={{ width: '100%', padding: '11px 14px', border: '1.5px solid #e5e7eb', borderRadius: 11, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '12px', border: '1.5px solid #e5e7eb', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
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

export default function LeadDetailPage() {
  const router = useRouter();
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
  const [history, setHistory] = useState([]);
  const [leadEmails, setLeadEmails] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [company, setCompany] = useState(null);
  const [showEmailCompose, setShowEmailCompose] = useState(false);
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

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showWonModal, setShowWonModal] = useState(false);
  const [showLostModal, setShowLostModal] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
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

  // Scroll the chat container to bottom — uses the container ref so only the chat scrolls, not the full page
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
      setNotes(data.notes || []);
      setReminders(data.reminders || []);
      setHistory(data.history || []);
      setInvoices(data.invoices || []);
      setEmailWorkflows(data.emailWorkflows || []);

      // Load secondary data in parallel — failures are non-fatal
      const [presetsRes, tagsRes, templatesRes, teamRes, companyRes, emailsRes] = await Promise.all([
        presetsAPI.getAll().catch(() => ({ data: { presets: [] } })),
        tagsAPI.getAll().catch(() => ({ data: { tags: [] } })),
        emailTemplatesAPI.getAll().catch(() => ({ data: { templates: [] } })),
        teamAPI.getAll().catch(() => ({ data: { members: [] } })),
        settingsAPI.getCompany().catch(() => ({ data: { company: {} } })),
        leadEmailsAPI.getAll(leadId).catch(() => ({ data: { emails: [] } })),
      ]);

      setPresets(presetsRes.data.presets || []);
      setAllTags(tagsRes.data.tags || []);
      setEmailTemplates(templatesRes.data.templates || []);
      setTeamMembers(teamRes.data.members || []);
      setCompany(companyRes.data.company || {});
      setLeadEmails(emailsRes.data.emails || []);
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

  const fetchMessages = async () => {
    try {
      const res = await leadsAPI.getMessages(leadId);
      setMessages(res.data.messages || []);
    } catch { setMessages([]); }
  };

  const handleSaveEdit = async () => {
    try {
      setActionLoading(true);
      await leadsAPI.update(leadId, editForm);
      await fetchAll();
      setEditing(false);
    } catch (e) { console.error(e); } finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    try { setActionLoading(true); await leadsAPI.deleteLead(leadId); router.push('/dashboard'); }
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
      await leadsAPI.sendMessage(leadId, newMessage);
      setNewMessage('');
      await fetchMessages();
    } catch (e) { alert(e.response?.data?.error || 'Failed to send — is WhatsApp connected?'); } finally { setSendingMessage(false); }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadingFile(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('caption', newMessage);
      await leadsAPI.sendMedia(leadId, fd);
      setNewMessage('');
      await fetchMessages();
    } catch (e) { alert(e.response?.data?.error || 'Failed to send file — is WhatsApp connected?'); }
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
        const fd = new FormData();
        fd.append('audio', blob, `voice.${ext}`);
        try {
          await leadsAPI.sendVoice(leadId, fd);
          await fetchMessages();
        } catch (e) {
          const msg = e.response?.data?.error || e.message || 'Failed to send voice note';
          alert(msg);
        }
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { alert('Microphone access denied'); }
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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
          <button onClick={() => router.push('/dashboard')}
            style={{ padding: '10px 24px', background: 'var(--surface)', color: 'var(--text)', border: '1.5px solid #e5e7eb', borderRadius: 12, cursor: 'pointer', fontWeight: 700 }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );

  const sc = STATUS_META[lead.status] || STATUS_META['New'];

  const TABS = [
  { id: 'notes', label: 'Notes', count: notes.length, color: '#f59e0b' },
  { id: 'reminders', label: 'Reminders', count: reminders.filter(r => !r.is_completed).length, color: '#8b5cf6' },
  { id: 'history', label: 'History', count: history.length, color: '#06b6d4' },
  { id: 'invoices', label: 'Invoices', count: invoices.length, color: '#10b981' },
  { id: 'emails', label: 'Emails', count: leadEmails.length, color: '#10b981' },
  { id: 'email-flow', label: 'Email Flow', count: emailWorkflows.length, color: '#6366f1' },
  { id: 'ai', label: '✨ AI Assistant', count: 0, color: '#8b5cf6' },
  { id: 'vertical', label: '🏭 Industry AI', count: 0, color: '#10b981' },
];

  const HISTORY_ICONS = { message: MessageSquare, note: StickyNote, status_change: Activity, reminder: Bell, invoice: Receipt, email: Mail, assignment: UserCheck, created: Star };
  const HISTORY_COLORS = { message: '#06b6d4', note: '#f59e0b', status_change: '#6366f1', reminder: '#8b5cf6', invoice: '#10b981', email: '#f59e0b', assignment: '#06b6d4', created: '#10b981' };

  return (
    <NavBar>
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* Modals */}
      {showDeleteModal && <DeleteModal name={lead.customer_name} onConfirm={handleDelete} onCancel={() => setShowDeleteModal(false)} loading={actionLoading} />}
      {showWonModal && <WonModal name={lead.customer_name} onConfirm={handleWonConfirm} onCancel={() => setShowWonModal(false)} loading={actionLoading} currencySymbol={sym} />}
      {showLostModal && <LostModal name={lead.customer_name} onConfirm={handleLostConfirm} onCancel={() => setShowLostModal(false)} loading={actionLoading} />}
      {showInvoiceModal && <InvoiceModal lead={lead} company={company} onClose={() => setShowInvoiceModal(false)} onSaved={fetchAll} />}
      {showEmailModal && <EmailWorkflowModal lead={lead} templates={emailTemplates} onClose={() => setShowEmailModal(false)} onSaved={fetchAll} />}

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

      {/* Nav */}
      <nav style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow)', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ maxWidth: 1500, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 62 }}>
          <button onClick={() => router.push('/dashboard')} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 14, padding: '6px 12px', borderRadius: 10 }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
            <ArrowLeft size={16} /> Dashboard
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg, ${sc.dot}, ${sc.dot}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900, color: 'white' }}>
              {lead.customer_name?.[0]?.toUpperCase() || '?'}
            </div>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>{lead.customer_name}</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.label}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Quick actions */}
            <button onClick={() => setShowInvoiceModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              <Receipt size={14} /> Invoice
            </button>
            <button onClick={() => setShowEmailCompose(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
              <Mail size={14} /> Email
            </button>
            <button
              onClick={() => {
                if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('wf:open-chat', { detail: lead }));
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1.5px solid #a7f3d0', background: '#ecfdf5', color: '#059669', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
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

      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '24px', display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>

        {/* ══ LEFT PANEL ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Profile card */}
          <div style={{ background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1.5px solid #e5e7eb' }}>

            <div style={{ background: `linear-gradient(135deg, ${sc.dot}20, ${sc.dot}08)`, padding: '24px 22px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                {!editing ? (
                  <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    <Edit2 size={12} /> Edit
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleSaveEdit} disabled={actionLoading} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#10b981', color: 'white', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      <Save size={12} /> Save
                    </button>
                    <button onClick={() => setEditing(false)} style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                <div style={{ width: 68, height: 68, borderRadius: 22, marginBottom: 10, background: `linear-gradient(135deg, ${sc.dot}, ${sc.dot}88)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: 'white', boxShadow: `0 8px 24px ${sc.dot}44` }}>
                  {lead.customer_name?.[0]?.toUpperCase() || '?'}
                </div>
                {editing ? (
                  <input value={editForm.customer_name} onChange={e => setEditForm(p => ({ ...p, customer_name: e.target.value }))}
                    style={{ textAlign: 'center', fontSize: 17, fontWeight: 800, border: 'none', borderBottom: `2px solid ${sc.dot}`, outline: 'none', background: 'transparent', width: '100%', marginBottom: 8 }} />
                ) : (
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: '0 0 8px' }}>{lead.customer_name || 'Unknown'}</h2>
                )}
                <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 20, background: sc.bg, color: sc.text }}>{sc.label}</span>
              </div>
            </div>

            {/* Contact details */}
            <div style={{ padding: '18px 20px' }}>
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { label: 'Phone', field: 'customer_phone', icon: Phone, type: 'tel' },
                    { label: 'Email', field: 'email', icon: Mail, type: 'email' },
                    { label: 'Date of Birth', field: 'date_of_birth', icon: Calendar, type: 'date' },
                    { label: 'Address', field: 'address', icon: MapPin, type: 'text' },
                    { label: 'Lead Source', field: 'lead_source', icon: Globe, type: 'select' },
                    { label: 'Est. Value', field: 'estimated_value', icon: DollarSign, type: 'number' },
                  ].map(({ label, field, icon: Icon, type }) => (
                    <div key={field}>
                      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</label>
                      {type === 'select' ? (
                        <select value={editForm[field]} onChange={e => setEditForm(p => ({ ...p, [field]: e.target.value }))}
                          style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', background: 'var(--surface)' }}>
                          <option value="">Select source</option>
                          {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <input type={type} value={editForm[field]} onChange={e => setEditForm(p => ({ ...p, [field]: e.target.value }))}
                          style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                      )}
                    </div>
                  ))}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Assigned To</label>
                    <select value={editForm.assigned_to} onChange={e => setEditForm(p => ({ ...p, assigned_to: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', background: 'var(--surface)' }}>
                      <option value="">Unassigned</option>
                      {teamMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    { value: displayPhone(lead.customer_phone), icon: Phone, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
                    { value: lead.email, icon: Mail, color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
                    { value: lead.address, icon: MapPin, color: '#f97316', bg: '#fff7ed' },
                    { value: lead.date_of_birth ? new Date(lead.date_of_birth).toLocaleDateString() : null, icon: Calendar, color: '#a855f7', bg: '#fdf4ff' },
                    { value: lead.lead_source, icon: Globe, color: '#06b6d4', bg: '#ecfeff' },
                  ].filter(x => x.value).map(({ value, icon: Icon, color, bg }, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={13} color={color} />
                      </div>
                      <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, wordBreak: 'break-word' }}>{value}</span>
                    </div>
                  ))}

                  {/* Assigned */}
                  {lead.assigned_to && (() => {
                    const m = teamMembers.find(tm => tm.id === lead.assigned_to);
                    return m ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f0fdf4', borderRadius: 10, border: '1.5px solid #bbf7d0' }}>
                        <div style={{ width: 26, height: 26, borderRadius: 8, background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'white' }}>
                          {m.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#065f46', margin: 0 }}>{m.name}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>Assigned</p>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  <div style={{ height: 1, background: 'var(--surface2)', margin: '4px 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)', fontWeight: 600 }}>Deal Value</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: sc.dot }}>{sym}{(lead.actual_sale || lead.estimated_value || 0).toLocaleString()}</span>
                  </div>

                  <div style={{ height: 1, background: 'var(--surface2)', margin: '4px 0' }} />
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>Tags</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {(lead.tags || []).map(tag => <TagChip key={tag.id} tag={tag} onRemove={() => handleToggleTag(tag, true)} />)}
                      <TagPicker leadId={leadId} assignedTags={lead.tags || []} allTags={allTags} onToggle={handleToggleTag} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pipeline Stage */}
          <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', border: '1.5px solid #e5e7eb' }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pipeline Stage</p>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              {PIPELINE_STEPS.map((step, i) => {
                const meta = STATUS_META[step];
                const isActive = lead.status === step;
                const isPast = PIPELINE_STEPS.indexOf(lead.status) > i;
                return (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <div onClick={() => !actionLoading && handleStatusChange(step)} style={{ width: 26, height: 26, borderRadius: '50%', cursor: 'pointer', border: `2px solid ${isActive || isPast ? meta.dot : 'var(--border)'}`, background: isActive ? meta.dot : isPast ? meta.dot + '44' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', flexShrink: 0 }}>
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
          </div>

          {/* Activity stats */}
          <div style={{ background: 'var(--surface)', borderRadius: 18, padding: '20px', boxShadow: '0 2px 6px rgba(0,0,0,0.06)', border: '1.5px solid #e5e7eb' }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Activity</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Lead Created', value: new Date(lead.created_at).toLocaleDateString() },
                { label: 'Last Message', value: lead.last_message_at ? new Date(lead.last_message_at).toLocaleDateString() : '—' },
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
        </div>

        {/* ══ RIGHT PANEL ══ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* WhatsApp Chat */}
          <div style={{ background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1.5px solid var(--border)', display: 'flex', flexDirection: 'column' }}>

            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface2)' }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg, #25d366, #128c7e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MessageSquare size={17} color="white" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', margin: 0 }}>WhatsApp</p>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{messages.length} messages</p>
              </div>
              {syncingHistory && (
                <span style={{ fontSize: 10, color: '#6366f1', background: 'rgba(99,102,241,0.15)', padding: '3px 8px', borderRadius: 20, fontWeight: 700, marginRight: 6 }}>⟳ Syncing history…</span>
              )}
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#dcfce7', color: '#16a34a' }}>● Live</span>
            </div>

            {/* Messages area — fixed height so the panel never expands; internal scroll only */}
            <div ref={messagesContainerRef} style={{ height: 400, padding: '12px 16px', overflowY: 'auto', background: 'var(--bg)', flexShrink: 0 }}>
              {messages.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 200 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 20, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                    <MessageSquare size={24} color="#9ca3af" />
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>No messages yet</p>
                </div>
              ) : messages.map((msg) => {
                const isVoice = msg.media_type === 'voice' || msg.media_type === 'audio';
                const isImage = msg.media_type === 'image';
                const isFile  = msg.media_type === 'media' || msg.media_type === 'document';
                const mediaSrc = msg.media_url
                  ? (msg.media_url.startsWith('http') ? msg.media_url : `${BASE_URL}${msg.media_url}`)
                  : null;
                return (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.from_me ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                    <div style={{ maxWidth: '72%', padding: '9px 13px', borderRadius: msg.from_me ? '18px 18px 4px 18px' : '18px 18px 18px 4px', background: msg.from_me ? (typeof document !== 'undefined' && document.documentElement.classList.contains('light') ? '#dcf8c6' : '#1a4731') : 'var(--surface2)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', fontSize: 14, lineHeight: 1.5, color: 'var(--text)' }}>
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
                        /* Thumbnail — click to open full-size lightbox */
                        <div
                          onClick={() => setViewImage(mediaSrc)}
                          style={{ cursor: 'pointer', position: 'relative', display: 'inline-block', borderRadius: 8, overflow: 'hidden' }}
                          title="Click to view full size"
                        >
                          <img
                            src={mediaSrc}
                            alt="media"
                            style={{ display: 'block', maxWidth: 180, maxHeight: 130, objectFit: 'cover', borderRadius: 8 }}
                          />
                          <div style={{ position: 'absolute', bottom: 5, right: 7, background: 'rgba(0,0,0,0.45)', borderRadius: 4, padding: '1px 5px', fontSize: 10, color: 'white' }}>
                            View
                          </div>
                        </div>
                      ) : isFile && mediaSrc ? (
                        /* File attachment chip */
                        <a href={mediaSrc} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(0,0,0,0.06)', borderRadius: 10, textDecoration: 'none', color: 'var(--text)', minWidth: 160 }}>
                          <FileText size={20} color="#6366f1" style={{ flexShrink: 0 }} />
                          <div>
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Attachment</p>
                            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-dim)' }}>Tap to open</p>
                          </div>
                        </a>
                      ) : (
                        <p style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif' }}>{msg.body}</p>
                      )}
                      <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, textAlign: 'right', margin: 0, marginTop: 3 }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {msg.from_me && <span style={{ color: '#34b7f1', marginLeft: 4 }}>✓✓</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
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
              <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Emoji" style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: showEmojiPicker ? '#fef9c3' : 'none', color: showEmojiPicker ? '#f59e0b' : '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                😊
              </button>

              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

              {/* Presets */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowPresets(!showPresets)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: showPresets ? '#eef2ff' : 'white', color: showPresets ? '#6366f1' : '#6b7280', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                  <Zap size={13} /> Presets <ChevronDown size={11} />
                </button>
                {showPresets && (
                  <div style={{ position: 'absolute', bottom: '110%', left: 0, width: 280, background: 'var(--surface)', border: '1.5px solid #e5e7eb', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,0.12)', zIndex: 20, overflow: 'hidden' }}>
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
            </div>

            {/* Input */}
            <div style={{ padding: '10px 14px 14px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploadingFile} title="Attach file" style={{ width: 36, height: 36, borderRadius: 10, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text-dim)', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  placeholder="Type a message... (Enter to send)"
                  rows={1}
                  style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #e5e7eb', borderRadius: 14, fontSize: 14, outline: 'none', resize: 'none', lineHeight: 1.5, maxHeight: 120, overflow: 'auto', fontFamily: 'inherit', color: 'var(--text)', background: 'var(--surface2)' }}
                  onFocus={e => { e.target.style.borderColor = '#25d366'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
                  onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
                />
              )}

              {!isRecording && (
                <div style={{ position: 'relative', flexShrink: 0 }} title="Voice notes — coming in V2">
                  <button disabled style={{ width: 36, height: 36, borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-dim)', cursor: 'not-allowed', opacity: 0.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Mic size={15} />
                  </button>
                  <span style={{ position: 'absolute', top: -7, right: -6, fontSize: 8, fontWeight: 800, background: '#f59e0b', color: 'white', borderRadius: 4, padding: '1px 4px', lineHeight: 1.4, pointerEvents: 'none' }}>BETA</span>
                </div>
              )}

              <button onClick={handleSendMessage} disabled={!newMessage.trim() || sendingMessage} style={{ width: 42, height: 42, borderRadius: 13, border: 'none', flexShrink: 0, background: sendingMessage || !newMessage.trim() ? 'var(--border)' : 'linear-gradient(135deg, #25d366, #128c7e)', color: sendingMessage || !newMessage.trim() ? '#9ca3af' : 'white', cursor: !newMessage.trim() || sendingMessage ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Send size={17} />
              </button>
            </div>

            {(uploadingFile) && (
              <div style={{ padding: '8px 14px', background: '#f0fdf4', borderTop: '1px solid #dcfce7', fontSize: 12, color: '#16a34a', fontWeight: 600 }}>
                Sending file...
              </div>
            )}
          </div>

          {/* ── Tabs Panel ── */}
          <div style={{ background: 'var(--surface)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', border: '1.5px solid #e5e7eb' }}>
            {/* Tab bar */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                  flex: 1, padding: '13px 8px', border: 'none', background: 'none', cursor: 'pointer',
                  borderBottom: `2.5px solid ${activeTab === tab.id ? tab.color : 'transparent'}`,
                  color: activeTab === tab.id ? '#111827' : '#9ca3af',
                  fontWeight: activeTab === tab.id ? 800 : 500, fontSize: 12, whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5
                }}>
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: activeTab === tab.id ? tab.color : '#f3f4f6', color: activeTab === tab.id ? 'white' : '#9ca3af' }}>{tab.count}</span>
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
                        <button onClick={() => setAddingNote(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
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
                    <div key={note.id} style={{ padding: '14px 16px', background: '#fffbeb', borderRadius: 12, border: '1.5px solid #fef3c7', marginBottom: 10 }}>
                      <p style={{ fontSize: 14, color: 'var(--text)', margin: '0 0 6px', lineHeight: 1.6 }}>{note.content}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{new Date(note.created_at).toLocaleString()}</p>
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
                    <div style={{ background: '#f5f3ff', border: '1.5px solid #ddd6fe', borderRadius: 14, padding: 16, marginBottom: 14 }}>
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Date & Time</label>
                        <input type="datetime-local" value={newReminder.reminder_date} onChange={e => setNewReminder(p => ({ ...p, reminder_date: e.target.value }))}
                          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #ddd6fe', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface)' }} />
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Note</label>
                        <input type="text" value={newReminder.message} onChange={e => setNewReminder(p => ({ ...p, message: e.target.value }))} placeholder="Follow up with customer..."
                          style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #ddd6fe', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', background: 'var(--surface)' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button onClick={() => setAddingReminder(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
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
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{new Date(r.reminder_date || r.due_date).toLocaleString()}</span>
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{r.message || r.title || 'No note'}</p>
                        </div>
                        <button onClick={() => handleToggleReminder(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
                          <CheckCircle size={20} color={r.is_completed ? '#10b981' : 'var(--border)'} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* CONTACT HISTORY */}
              {activeTab === 'history' && (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>Complete history of all activity on this lead — preserved forever.</p>
                  {history.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--border)' }}>
                      <History size={32} style={{ margin: '0 auto 8px' }} />
                      <p style={{ fontSize: 14, color: 'var(--text-dim)' }}>No history yet</p>
                    </div>
                  ) : (
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 15, top: 0, bottom: 0, width: 2, background: 'var(--surface2)' }} />
                      {history.map((h, i) => {
                        const HistIcon = HISTORY_ICONS[h.type] || Activity;
                        const color = HISTORY_COLORS[h.type] || '#6b7280';
                        return (
                          <div key={h.id || i} style={{ display: 'flex', gap: 14, marginBottom: 16, position: 'relative' }}>
                            <div style={{ width: 32, height: 32, borderRadius: 10, background: color + '18', border: `2px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1, background: 'var(--surface)', boxShadow: `0 0 0 3px white` }}>
                              <HistIcon size={14} color={color} />
                            </div>
                            <div style={{ flex: 1, paddingTop: 4 }}>
                              <p style={{ fontSize: 13, color: 'var(--text)', margin: '0 0 3px', fontWeight: 500 }}>{h.description}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{new Date(h.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
                    <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: '#f0fdf4', borderRadius: 12, border: '1.5px solid #bbf7d0', marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Receipt size={18} color="#10b981" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{inv.invoice_number}</p>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: inv.status === 'paid' ? '#dcfce7' : inv.status === 'sent' ? '#eff6ff' : '#fef9c3', color: inv.status === 'paid' ? '#15803d' : inv.status === 'sent' ? '#1d4ed8' : '#92400e' }}>{inv.status}</span>
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{new Date(inv.created_at).toLocaleDateString()}{inv.due_date ? ` · Due ${new Date(inv.due_date).toLocaleDateString()}` : ''}</p>
                      </div>
                      <p style={{ fontSize: 18, fontWeight: 900, color: '#10b981', margin: 0 }}>{sym}{parseFloat(inv.total).toLocaleString()}</p>
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
                            <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{new Date(em.created_at).toLocaleString()}</span>
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
                      <div key={wf.id || i} style={{ display: 'flex', gap: 14, padding: '14px 16px', background: statusColors[wf.status] || '#f9fafb', borderRadius: 12, border: '1.5px solid #e5e7eb', marginBottom: 10 }}>
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
                            {wf.scheduled_at && <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>Scheduled: {new Date(wf.scheduled_at).toLocaleString()}</p>}
                            {wf.sent_at && <p style={{ fontSize: 11, color: '#10b981', margin: 0 }}>Sent: {new Date(wf.sent_at).toLocaleString()}</p>}
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
                      <div style={{ width: 36, height: 36, border: '3px solid #e5e7eb', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
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
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #c4b5fd', background: '#faf5ff', color: '#7c3aed', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}>
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
                          <div style={{ padding: '16px', background: 'var(--surface2)', borderRadius: 12, border: '1.5px solid #e5e7eb', textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
                            Click "Get AI Suggestion" for personalized recommendations
                          </div>
                        )}
                      </div>

                      {/* Quick Actions */}
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: '0 0 10px' }}>⚡ Quick Actions</p>

                        {verticalActionResult && (
                          <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, background: verticalActionResult.startsWith('✅') ? 'rgba(16,185,129,0.1)' : '#fef2f2', border: `1.5px solid ${verticalActionResult.startsWith('✅') ? '#a7f3d0' : '#fecaca'}`, fontSize: 13, fontWeight: 600, color: verticalActionResult.startsWith('✅') ? '#059669' : '#dc2626' }}>
                            {verticalActionResult}
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {(verticalIndustry.workflow?.actions || []).map(action => (
                            <div key={action.id} style={{ background: 'var(--surface)', borderRadius: 12, border: '1.5px solid #e5e7eb', overflow: 'hidden' }}>
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
                                  }} style={{ padding: '5px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
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
                                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginTop: 10 }}
                                    onFocus={e => e.target.style.borderColor = verticalIndustry.workflow?.color || '#10b981'}
                                    onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                  />
                                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                    <button onClick={() => setEditingActionMsg(null)} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #e5e7eb', background: 'var(--surface)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
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
              {/* AI ASSISTANT */}
              {activeTab === 'ai' && (
                <div>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '16px 20px', background: 'linear-gradient(135deg, #8b5cf620, #6366f110)', borderRadius: 14, border: '1.5px solid #c4b5fd44' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✨</div>
                    <div>
                      <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: 0 }}>AI Assistant</p>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Powered by Gemini · Analyzes this lead's conversation</p>
                    </div>
                  </div>

                  {aiError && (
                    <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 8 }}>
                      ⚠ {aiError}
                    </div>
                  )}

                  {/* 3 Action Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
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
                    <div style={{ background: '#faf5ff', border: '1.5px solid #c4b5fd', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <span style={{ fontSize: 16 }}>🧠</span>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#7c3aed', margin: 0 }}>Chat Summary</p>
                        <button onClick={() => setAiSummary('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={14} /></button>
                      </div>
                      <p style={{ fontSize: 14, color: 'var(--text)', margin: 0, lineHeight: 1.7 }}>{aiSummary}</p>
                    </div>
                  )}

                  {/* Reply Suggestions Result */}
                  {aiSuggestions.length > 0 && (
                    <div style={{ background: '#ecfeff', border: '1.5px solid #a5f3fc', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ fontSize: 16 }}>⚡</span>
                        <p style={{ fontSize: 13, fontWeight: 800, color: '#0891b2', margin: 0 }}>Reply Suggestions</p>
                        <button onClick={() => setAiSuggestions([])} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={14} /></button>
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
                        <button onClick={() => setAiAnalysis(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={14} /></button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                        {/* Lead Score */}
                        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '14px', border: '1.5px solid #fde68a', textAlign: 'center' }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 6px' }}>Lead Score</p>
                          <div style={{ fontSize: 36, fontWeight: 900, color: aiAnalysis.lead_score >= 7 ? '#10b981' : aiAnalysis.lead_score >= 4 ? '#f59e0b' : '#ef4444', lineHeight: 1 }}>{aiAnalysis.lead_score}<span style={{ fontSize: 16, color: 'var(--text-dim)' }}>/10</span></div>
                        </div>
                        {/* Temperature */}
                        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: '14px', border: '1.5px solid #fde68a', textAlign: 'center' }}>
                          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '0 0 6px' }}>Temperature</p>
                          <p style={{ fontSize: 22, margin: 0 }}>
                            {aiAnalysis.temperature === 'urgent' ? '🔥' : aiAnalysis.temperature === 'hot' ? '🟠' : aiAnalysis.temperature === 'warm' ? '🟡' : '🟢'}
                          </p>
                          <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', margin: '4px 0 0', textTransform: 'capitalize' }}>{aiAnalysis.temperature}</p>
                        </div>
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
                              <span key={i} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#fef3c7', color: 'var(--warning-text)', border: '1px solid #fde68a' }}>{e}</span>
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
            </div>
          </div>
        </div>
      </div>

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
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
    </NavBar>
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
      <div style={{ background: 'var(--surface)', borderRadius: 20, padding: 28, maxWidth: 620, width: '100%', boxShadow: '0 32px 80px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={20} color="white" />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Compose Email</h2>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>To: {lead?.customer_name || 'Lead'}</p>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)' }}><X size={18} /></button>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>
            ⚠ {error}
          </div>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>To</label>
          <input value={form.to_email} onChange={e => setForm(f => ({ ...f, to_email: e.target.value }))} placeholder="recipient@email.com" type="email"
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: 'var(--text)' }}
            onFocus={e => e.target.style.borderColor='#6366f1'} onBlur={e => e.target.style.borderColor='var(--border)'} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Subject</label>
          <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="Email subject"
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e5e7eb', borderRadius: 10, fontSize: 14, outline: 'none', boxSizing: 'border-box', color: 'var(--text)' }}
            onFocus={e => e.target.style.borderColor='#6366f1'} onBlur={e => e.target.style.borderColor='var(--border)'} />
        </div>

        {/* Rich text editor */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Message</label>
          <div style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '8px 10px', background: 'var(--surface2)', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
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
                  <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0 }}>
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
          <button onClick={onClose} style={{ flex: 1, padding: '11px', border: '1.5px solid #e5e7eb', borderRadius: 11, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
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