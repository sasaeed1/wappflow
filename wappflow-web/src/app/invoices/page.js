'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Plus, Search, X, Eye, Printer, Mail, CheckCircle,
  Clock, AlertCircle, DollarSign, Building2, User, Calendar,
  ArrowLeft, Download, Send, Trash2,
} from 'lucide-react';
import { invoicesAPI, settingsAPI, displayPhone, BASE_URL, paymentsAPI } from '../../lib/api';
import NavBar from '../../components/NavBar';
import { useConfirm } from '@/lib/confirm';
import { formatDate } from '../../lib/datetime';

const STATUS_COLORS = {
  draft:   { bg: 'rgba(148,163,184,0.15)', text: '#64748b', dot: '#94a3b8', label: 'Draft' },
  pending: { bg: 'rgba(245,158,11,0.12)', text: '#b45309', dot: '#f59e0b', label: 'Pending' },
  paid:    { bg: 'rgba(16,185,129,0.12)', text: '#047857', dot: '#10b981', label: 'Paid' },
  overdue: { bg: 'rgba(239,68,68,0.12)', text: '#b91c1c', dot: '#ef4444', label: 'Overdue' },
};

// ── Premium invoice document — used for Print / Save-as-PDF (matches the
// emailed version produced by the backend so customers see one consistent doc).
function buildInvoiceHTML(invoice, company) {
  const accent = '#6366f1';
  const c = company || {};
  const sym = c.currency_symbol || invoice.currency_symbol || '$';
  const money = (n) => sym + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (d) => {
    if (!d) return '—';
    const s = String(d);
    const dt = new Date(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
    return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const statusColors = { paid: '#10b981', pending: '#f59e0b', overdue: '#ef4444', draft: '#94a3b8' };
  const sc = statusColors[invoice.status] || statusColors.draft;
  const logoBlock = c.company_logo
    ? `<img src="${BASE_URL}${esc(c.company_logo)}" alt="" style="max-height:54px;max-width:210px;object-fit:contain;display:block;margin-bottom:10px" />`
    : `<div style="font-size:23px;font-weight:800;color:${accent};margin-bottom:10px">${esc(c.company_name || 'WappFlow')}</div>`;
  const companyLines = [
    c.company_logo ? c.company_name : '',
    c.company_address, c.company_email, c.company_phone, c.company_website,
  ].filter(Boolean).map(l => `<div style="font-size:12px;color:#64748b;line-height:1.7">${esc(l)}</div>`).join('');
  const itemRows = items.length ? items.map((it, i) => `
    <tr style="background:${i % 2 ? '#f8fafc' : '#fff'}">
      <td style="padding:11px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #eef2f6">${esc(it.description || '—')}</td>
      <td style="padding:11px 16px;font-size:13px;color:#475569;text-align:center;border-bottom:1px solid #eef2f6">${esc(it.qty || 1)}</td>
      <td style="padding:11px 16px;font-size:13px;color:#475569;text-align:right;border-bottom:1px solid #eef2f6">${money(it.rate)}</td>
      <td style="padding:11px 16px;font-size:13px;color:#1e293b;font-weight:700;text-align:right;border-bottom:1px solid #eef2f6">${money(it.amount != null ? it.amount : (it.qty || 1) * (it.rate || 0))}</td>
    </tr>`).join('') : `<tr><td colspan="4" style="padding:20px;text-align:center;color:#94a3b8;font-size:13px">No line items</td></tr>`;
  const taxLabel = (c.tax_name || 'Tax') + (invoice.tax_rate ? ` (${invoice.tax_rate}%)` : '');

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Invoice ${esc(invoice.invoice_number || invoice.id || '')}</title></head>
<body style="margin:0;padding:0;background:#eef1f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact">
<div style="max-width:680px;margin:0 auto;padding:28px 16px">
  <div style="background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e9f0;box-shadow:0 8px 30px rgba(15,23,42,0.06)">
    <div style="height:6px;background:linear-gradient(90deg,${accent},#8b5cf6)"></div>
    <div style="padding:32px 34px">
      <table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:top">${logoBlock}${companyLines}</td>
        <td style="vertical-align:top;text-align:right">
          <div style="font-size:30px;font-weight:800;letter-spacing:1px;color:#0f172a">INVOICE</div>
          <div style="font-size:13px;color:#64748b;margin-top:6px"><strong style="color:#0f172a">${esc(invoice.invoice_number || ('#' + invoice.id))}</strong></div>
          <div style="font-size:12px;color:#64748b;margin-top:3px">Issued ${fmt(invoice.created_at)}</div>
          ${invoice.due_date ? `<div style="font-size:12px;color:#64748b;margin-top:2px">Due ${fmt(invoice.due_date)}</div>` : ''}
          <div style="display:inline-block;margin-top:10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:4px 12px;border-radius:20px;background:${sc}22;color:${sc}">${esc(invoice.status || 'draft')}</div>
        </td>
      </tr></table>
      <div style="margin-top:30px;padding:16px 18px;background:#f8fafc;border-radius:12px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:6px">Billed To</div>
        <div style="font-size:16px;font-weight:700;color:#0f172a">${esc(invoice.customer_name || '—')}</div>
        ${invoice.customer_email ? `<div style="font-size:12px;color:#64748b;margin-top:2px">${esc(invoice.customer_email)}</div>` : ''}
        ${invoice.customer_phone ? `<div style="font-size:12px;color:#64748b;margin-top:1px">${esc(displayPhone(invoice.customer_phone))}</div>` : ''}
        ${invoice.customer_address ? `<div style="font-size:12px;color:#64748b;margin-top:1px">${esc(invoice.customer_address)}</div>` : ''}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border-collapse:collapse">
        <thead><tr style="background:#0f172a">
          <th style="padding:10px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#cbd5e1">Description</th>
          <th style="padding:10px 16px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#cbd5e1">Qty</th>
          <th style="padding:10px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#cbd5e1">Rate</th>
          <th style="padding:10px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#cbd5e1">Amount</th>
        </tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px"><tr>
        <td style="width:52%"></td>
        <td style="width:48%">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:6px 2px;font-size:13px;color:#64748b">Subtotal</td><td style="padding:6px 2px;font-size:13px;color:#1e293b;text-align:right">${money(invoice.subtotal)}</td></tr>
            ${invoice.discount ? `<tr><td style="padding:6px 2px;font-size:13px;color:#64748b">Discount</td><td style="padding:6px 2px;font-size:13px;color:#1e293b;text-align:right">-${money(invoice.discount)}</td></tr>` : ''}
            <tr><td style="padding:6px 2px;font-size:13px;color:#64748b">${esc(taxLabel)}</td><td style="padding:6px 2px;font-size:13px;color:#1e293b;text-align:right">${money(invoice.tax_amount)}</td></tr>
          </table>
          <div style="margin-top:8px;background:${accent};border-radius:10px;padding:13px 18px">
            <table width="100%"><tr>
              <td style="font-size:13px;font-weight:700;color:#fff;text-transform:uppercase;letter-spacing:0.5px">Total Due</td>
              <td style="font-size:21px;font-weight:800;color:#fff;text-align:right">${money(invoice.total)}</td>
            </tr></table>
          </div>
        </td>
      </tr></table>
      ${invoice.notes ? `<div style="margin-top:24px;padding:14px 18px;background:#f8fafc;border-left:3px solid ${accent};border-radius:6px"><div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;margin-bottom:4px">Notes</div><div style="font-size:13px;color:#475569;line-height:1.6">${esc(invoice.notes).replace(/\n/g, '<br>')}</div></div>` : ''}
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #eef2f6;text-align:center">
        <div style="font-size:13px;font-weight:700;color:#0f172a">Thank you for your business</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:4px">${esc(c.company_name || 'WappFlow')}${c.company_email ? ' · ' + esc(c.company_email) : ''}</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

function InvoiceViewModal({ invoice, company, onClose, onMarkPaid, onSendEmail, onDelete }) {
  const sym = company?.currency_symbol || '$';
  const sc = STATUS_COLORS[invoice.status] || STATUS_COLORS.draft;
  const [payLink, setPayLink] = useState('');
  const makePayLink = async () => {
    try {
      const r = await paymentsAPI.link({ kind: 'invoice', ref_id: invoice.id, lead_id: invoice.lead_id, amount: invoice.total, currency: invoice.currency, currency_symbol: sym, description: `Invoice ${invoice.invoice_number || invoice.id}` });
      const url = r.data.url || r.data.pay_page;
      setPayLink(url); try { await navigator.clipboard.writeText(url); } catch {}
    } catch {}
  };

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(buildInvoiceHTML(invoice, company));
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch {} }, 400);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
      <div className="r-modal" style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: '0 40px 100px rgba(0,0,0,0.4)', maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}>

        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={22} color="#6366f1" />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : `Invoice #${invoice.id}`}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>● {sc.label}</span>
                {invoice.customer_name && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{invoice.customer_name}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '28px' }}>
          <div className="r-stack" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>From</p>
              {company?.company_logo && (
                <img src={`${BASE_URL}${company.company_logo}`} alt="Logo" style={{ maxHeight: 44, objectFit: 'contain', marginBottom: 8 }} />
              )}
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>{company?.company_name || 'Your Company'}</p>
              {company?.company_address && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{company.company_address}</p>}
              {company?.company_email && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{company.company_email}</p>}
              {company?.company_phone && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{company.company_phone}</p>}
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Bill To</p>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>{invoice.customer_name || '—'}</p>
              {invoice.customer_email && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{invoice.customer_email}</p>}
              {invoice.customer_phone && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{displayPhone(invoice.customer_phone)}</p>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 20, marginBottom: 24, padding: '14px 18px', background: 'var(--surface2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            {[
              { label: 'Invoice #', value: invoice.invoice_number || `#${invoice.id}` },
              { label: 'Date', value: formatDate(invoice.created_at) || '—' },
              { label: 'Due Date', value: invoice.due_date ? formatDate(invoice.due_date) : '—' },
            ].map(m => (
              <div key={m.label}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>{m.label}</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{m.value}</p>
              </div>
            ))}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Description', 'Qty', 'Rate', 'Amount'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Description' ? 'left' : 'right', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '2px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(invoice.items || []).map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 14px', fontSize: 14, color: 'var(--text)' }}>{item.description || '—'}</td>
                  <td style={{ padding: '12px 14px', fontSize: 14, color: 'var(--text)', textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ padding: '12px 14px', fontSize: 14, color: 'var(--text)', textAlign: 'right' }}>{sym}{parseFloat(item.rate || 0).toFixed(2)}</td>
                  <td style={{ padding: '12px 14px', fontSize: 14, fontWeight: 700, color: 'var(--text)', textAlign: 'right' }}>{sym}{parseFloat(item.amount || (item.qty * item.rate) || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginLeft: 'auto', maxWidth: 280 }}>
            {[
              { label: 'Subtotal', value: invoice.subtotal || 0 },
              { label: `${company?.tax_name || 'Tax'} (${invoice.tax_rate || 0}%)`, value: invoice.tax_amount || 0 },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{sym}{parseFloat(row.value).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, padding: '12px 16px', borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'white', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Due</span>
              <span style={{ fontSize: 21, fontWeight: 900, color: 'white' }}>{sym}{parseFloat(invoice.total || 0).toFixed(2)}</span>
            </div>
          </div>

          {invoice.notes && (
            <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--surface2)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 4px' }}>NOTES</p>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0, whiteSpace: 'pre-wrap' }}>{invoice.notes}</p>
            </div>
          )}
        </div>

        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface2)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            <Printer size={14} /> Print / PDF
          </button>
          <button onClick={() => onSendEmail(invoice)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            <Send size={14} /> Send via Email
          </button>
          {invoice.status !== 'paid' && (
            <button onClick={makePayLink} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'transparent', color: 'var(--text)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              {payLink ? '✓ Link copied' : '💳 Payment link'}
            </button>
          )}
          {invoice.status !== 'paid' && (
            <button onClick={() => onMarkPaid(invoice.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: 'none', borderRadius: 12, background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              <CheckCircle size={14} /> Mark as Paid
            </button>
          )}
          <button onClick={() => onDelete(invoice)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', border: '1.5px solid var(--danger-border)', borderRadius: 12, background: 'var(--danger-bg)', color: 'var(--danger)', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function SendInvoiceModal({ invoice, company, onClose, onSent }) {
  const [to, setTo] = useState(invoice.customer_email || '');
  const [subject, setSubject] = useState(`Invoice ${invoice.invoice_number || ''} from ${company?.company_name || 'us'}`.trim());
  const [message, setMessage] = useState(
    `Hi ${invoice.customer_name || 'there'},\n\nPlease find your invoice below. Let me know if you have any questions.\n\nThank you!`
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!to.trim()) { setError('A recipient email is required.'); return; }
    setSending(true);
    setError('');
    try {
      await invoicesAPI.sendEmail(invoice.id, { to: to.trim(), subject: subject.trim(), message });
      onSent();
    } catch (e) {
      setError(e.response?.data?.error || 'Could not send the invoice.');
      setSending(false);
    }
  };

  const field = { width: '100%', padding: '10px 13px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13.5, outline: 'none', boxSizing: 'border-box', background: 'var(--surface2)', color: 'var(--text)' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 320, padding: 16 }}>
      <div className="r-modal" style={{ background: 'var(--surface)', borderRadius: 22, boxShadow: '0 40px 100px rgba(0,0,0,0.4)', maxWidth: 520, width: '100%', border: '1px solid var(--border)' }}>
        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={20} color="#6366f1" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Email Invoice</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>{invoice.invoice_number || `#${invoice.id}`} · A premium invoice will be sent.</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 10, padding: 7, cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={17} />
          </button>
        </div>
        <div style={{ padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && (
            <div style={{ padding: '10px 13px', background: 'var(--danger-bg)', border: '1.5px solid var(--danger-border)', borderRadius: 10, color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>
          )}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Send to</label>
            <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="customer@example.com" style={field} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={field} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 6 }}>Message</label>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} style={{ ...field, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
          </div>
        </div>
        <div style={{ padding: '14px 26px 22px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={sending} style={{ padding: '10px 18px', border: '1.5px solid var(--border)', borderRadius: 11, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
          <button onClick={handleSend} disabled={sending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', border: 'none', borderRadius: 11, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white', fontWeight: 700, cursor: sending ? 'default' : 'pointer', fontSize: 13, opacity: sending ? 0.7 : 1 }}>
            <Send size={14} /> {sending ? 'Sending…' : 'Send Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [invoices, setInvoices] = useState([]);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewInvoice, setViewInvoice] = useState(null);
  const [emailInvoice, setEmailInvoice] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/login'); return; }
    Promise.all([
      invoicesAPI.getAll().catch(() => ({ data: { invoices: [] } })),
      settingsAPI.getCompany().catch(() => ({ data: { company: {} } })),
    ]).then(([invRes, compRes]) => {
      setInvoices(invRes.data.invoices || []);
      setCompany(compRes.data.company || {});
    }).finally(() => setLoading(false));
  }, []);

  const flashToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3200); };

  const handleMarkPaid = async (id) => {
    try {
      await invoicesAPI.update(id, { status: 'paid' });
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'paid' } : inv));
      if (viewInvoice?.id === id) setViewInvoice(prev => ({ ...prev, status: 'paid' }));
      flashToast('Invoice marked as paid.');
    } catch (e) { await confirm({ title: 'Could not update invoice', message: e.message, alertOnly: true, tone: 'danger' }); }
  };

  const handleDelete = async (inv) => {
    const ok = await confirm({
      title: 'Delete this invoice?',
      message: `Invoice ${inv.invoice_number || `#${inv.id}`} for ${inv.customer_name || 'this customer'} will be permanently deleted.`,
      confirmLabel: 'Delete', tone: 'danger',
    });
    if (!ok) return;
    try {
      await invoicesAPI.delete(inv.id);
      setInvoices(prev => prev.filter(i => i.id !== inv.id));
      if (viewInvoice?.id === inv.id) setViewInvoice(null);
      flashToast('Invoice deleted.');
    } catch (e) { await confirm({ title: 'Could not delete invoice', message: e.message, alertOnly: true, tone: 'danger' }); }
  };

  const handleEmailSent = () => {
    const id = emailInvoice?.id;
    setInvoices(prev => prev.map(i => (i.id === id && i.status === 'draft') ? { ...i, status: 'pending' } : i));
    if (viewInvoice?.id === id && viewInvoice.status === 'draft') setViewInvoice(p => ({ ...p, status: 'pending' }));
    setEmailInvoice(null);
    flashToast('Invoice emailed to the customer.');
  };

  const filtered = invoices.filter(inv => {
    const matchSearch = !search || (inv.customer_name || '').toLowerCase().includes(search.toLowerCase()) || String(inv.invoice_number || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const sym = company?.currency_symbol || '$';
  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.total || 0), 0);
  const totalPending = invoices.filter(i => i.status === 'pending').reduce((s, i) => s + parseFloat(i.total || 0), 0);

  return (
    <NavBar>
      <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '28px 28px 40px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

        {viewInvoice && (
          <InvoiceViewModal
            invoice={viewInvoice}
            company={company}
            onClose={() => setViewInvoice(null)}
            onMarkPaid={handleMarkPaid}
            onSendEmail={(inv) => setEmailInvoice(inv)}
            onDelete={handleDelete}
          />
        )}
        {emailInvoice && (
          <SendInvoiceModal
            invoice={emailInvoice}
            company={company}
            onClose={() => setEmailInvoice(null)}
            onSent={handleEmailSent}
          />
        )}
        {toast && (
          <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 12, padding: '12px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 9 }}>
            <CheckCircle size={16} color="#10b981" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{toast}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>Invoices</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>Track, send and manage all your invoices</p>
          </div>
          <button onClick={() => router.push('/dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total Invoices', value: invoices.length, icon: FileText, color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
            { label: 'Paid Revenue', value: `${sym}${totalRevenue.toLocaleString()}`, icon: CheckCircle, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
            { label: 'Pending', value: `${sym}${totalPending.toLocaleString()}`, icon: Clock, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
            { label: 'Overdue', value: invoices.filter(i => i.status === 'overdue').length, icon: AlertCircle, color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
          ].map(stat => (
            <div key={stat.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <stat.icon size={20} color={stat.color} />
              </div>
              <div>
                <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{stat.value}</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search invoices..."
              style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#6366f1'} onBlur={e => e.target.style.borderColor = 'var(--border)'} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['all', 'draft', 'pending', 'paid', 'overdue'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: `1px solid ${filterStatus === s ? '#6366f1' : 'var(--border)'}`,
                  background: filterStatus === s ? 'rgba(99,102,241,0.15)' : 'var(--surface)',
                  color: filterStatus === s ? '#a5b4fc' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                }}>
                {s === 'all' ? 'All' : (STATUS_COLORS[s]?.label || s)}
              </button>
            ))}
          </div>
        </div>

        <div className="r-scroll-x" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 130px 120px 110px 200px', padding: '12px 20px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
            {['#', 'Customer', 'Invoice No.', 'Date', 'Amount', 'Status'].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</span>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <div style={{ width: 36, height: 36, border: '3px solid var(--border)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading invoices...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
              <FileText size={40} color="var(--border)" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>No invoices found</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Create invoices from any lead profile.</p>
            </div>
          ) : filtered.map((inv, idx) => {
            const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.draft;
            return (
              <div key={inv.id}
                style={{ display: 'grid', gridTemplateColumns: '50px 1fr 130px 120px 110px 200px', padding: '14px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                onClick={() => setViewInvoice(inv)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, alignSelf: 'center' }}>{idx + 1}</span>
                <div style={{ alignSelf: 'center', minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.customer_name || 'Unknown'}</p>
                  {inv.customer_email && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.customer_email}</p>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', alignSelf: 'center' }}>{inv.invoice_number ? `${inv.invoice_number}` : `#${inv.id}`}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>{formatDate(inv.created_at) || '—'}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', alignSelf: 'center' }}>{sym}{parseFloat(inv.total || 0).toFixed(2)}</span>
                <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>● {sc.label}</span>
                  <button onClick={e => { e.stopPropagation(); setEmailInvoice(inv); }} title="Email invoice"
                    style={{ padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: '#6366f1', cursor: 'pointer', display: 'flex' }}>
                    <Send size={13} />
                  </button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(inv); }} title="Delete invoice"
                    style={{ padding: 6, borderRadius: 8, border: '1px solid var(--danger-border)', background: 'var(--danger-bg)', color: 'var(--danger)', cursor: 'pointer', display: 'flex' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </NavBar>
  );
}
