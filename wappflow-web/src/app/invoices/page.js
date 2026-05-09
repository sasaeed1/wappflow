'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Plus, Search, X, Eye, Printer, Mail, CheckCircle,
  Clock, AlertCircle, DollarSign, Building2, User, Calendar,
  ArrowLeft, Download, Send
} from 'lucide-react';
import { invoicesAPI, settingsAPI, leadEmailsAPI, BASE_URL } from '../../lib/api';
import NavBar from '../../components/NavBar';

const STATUS_COLORS = {
  draft:   { bg: '#f1f5f9', text: '#64748b', dot: '#94a3b8', label: 'Draft' },
  pending: { bg: '#fffbeb', text: '#b45309', dot: '#f59e0b', label: 'Pending' },
  paid:    { bg: '#ecfdf5', text: '#047857', dot: '#10b981', label: 'Paid' },
  overdue: { bg: '#fef2f2', text: '#b91c1c', dot: '#ef4444', label: 'Overdue' },
};

function InvoiceViewModal({ invoice, company, onClose, onMarkPaid }) {
  const sym = company?.currency_symbol || '$';
  const sc = STATUS_COLORS[invoice.status] || STATUS_COLORS.draft;

  const handlePrint = () => {
    const logoHtml = company?.company_logo
      ? `<img src="${BASE_URL}${company.company_logo}" alt="Logo" style="max-height:64px;object-fit:contain;" />`
      : `<div style="font-size:22px;font-weight:900;color:#6366f1">${company?.company_name || 'WappFlow'}</div>`;

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
<html><head><title>Invoice ${invoice.invoice_number || invoice.id}</title>
<style>
  body { font-family: -apple-system, sans-serif; margin: 0; padding: 40px; color: #111; background: white; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .invoice-title { font-size: 36px; font-weight: 900; color: #6366f1; letter-spacing: -1px; }
  .meta p { margin: 2px 0; font-size: 13px; color: #555; }
  .meta strong { color: #111; }
  .bill-to { margin-bottom: 32px; }
  .bill-to label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; display: block; margin-bottom: 6px; }
  .bill-to .name { font-size: 17px; font-weight: 800; color: #111; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { background: #f8fafc; padding: 10px 14px; text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
  td { padding: 12px 14px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .totals { margin-left: auto; width: 280px; }
  .totals .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
  .totals .total-row { display: flex; justify-content: space-between; padding: 12px 0; font-size: 20px; font-weight: 900; color: #10b981; }
  .footer { margin-top: 48px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 20px; }
  @media print { body { padding: 20px; } }
</style></head>
<body>
<div class="header">
  <div>${logoHtml}</div>
  <div style="text-align:right">
    <div class="invoice-title">INVOICE</div>
    <div class="meta" style="margin-top:8px">
      <p><strong>Invoice #:</strong> ${invoice.invoice_number || invoice.id}</p>
      <p><strong>Date:</strong> ${invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : '—'}</p>
      ${invoice.due_date ? `<p><strong>Due:</strong> ${new Date(invoice.due_date).toLocaleDateString()}</p>` : ''}
    </div>
  </div>
</div>

<div class="bill-to">
  <label>Bill To</label>
  <div class="name">${invoice.customer_name || '—'}</div>
  ${invoice.customer_email ? `<div style="font-size:13px;color:#555">${invoice.customer_email}</div>` : ''}
  ${invoice.customer_phone ? `<div style="font-size:13px;color:#555">${invoice.customer_phone}</div>` : ''}
</div>

<table>
  <tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
  ${(invoice.items || []).map(it => `<tr>
    <td>${it.description || '—'}</td>
    <td>${it.qty || 1}</td>
    <td>${sym}${parseFloat(it.rate || 0).toFixed(2)}</td>
    <td>${sym}${parseFloat(it.amount || (it.qty * it.rate) || 0).toFixed(2)}</td>
  </tr>`).join('')}
</table>

<div class="totals">
  <div class="row"><span>Subtotal</span><span>${sym}${parseFloat(invoice.subtotal || 0).toFixed(2)}</span></div>
  <div class="row"><span>Tax (${invoice.tax_rate || 0}%)</span><span>${sym}${parseFloat(invoice.tax_amount || 0).toFixed(2)}</span></div>
  <div class="total-row"><span>Total</span><span>${sym}${parseFloat(invoice.total || 0).toFixed(2)}</span></div>
</div>

${invoice.notes ? `<div style="margin-top:24px;padding:16px;background:#f8fafc;border-radius:10px"><strong>Notes:</strong><br>${invoice.notes}</div>` : ''}

<div class="footer">This is a computer generated invoice and does not require a signature.</div>
</body></html>`);
    win.document.close();
    win.print();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 24, boxShadow: '0 40px 100px rgba(0,0,0,0.4)', maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={22} color="#f59e0b" />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>Invoice {invoice.invoice_number ? `#${invoice.invoice_number}` : `#${invoice.id}`}</h2>
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

        {/* Invoice body */}
        <div style={{ padding: '28px' }}>
          {/* Company + Bill To */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>From</p>
              {company?.company_logo && (
                <img src={`${BASE_URL}${company.company_logo}`} alt="Logo" style={{ maxHeight: 44, objectFit: 'contain', marginBottom: 8 }} />
              )}
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>{company?.company_name || 'Your Company'}</p>
              {company?.company_email && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{company.company_email}</p>}
              {company?.company_phone && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{company.company_phone}</p>}
            </div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>Bill To</p>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>{invoice.customer_name || '—'}</p>
              {invoice.customer_email && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{invoice.customer_email}</p>}
              {invoice.customer_phone && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>{invoice.customer_phone}</p>}
            </div>
          </div>

          {/* Invoice meta */}
          <div style={{ display: 'flex', gap: 20, marginBottom: 24, padding: '14px 18px', background: 'var(--surface2)', borderRadius: 12, border: '1px solid var(--border)' }}>
            {[
              { label: 'Invoice #', value: invoice.invoice_number || `#${invoice.id}` },
              { label: 'Date', value: invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : '—' },
              { label: 'Due Date', value: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—' },
            ].map(m => (
              <div key={m.label}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 3px' }}>{m.label}</p>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Line items */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Description', 'Qty', 'Rate', 'Amount'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Qty' || h === 'Rate' || h === 'Amount' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '2px solid var(--border)' }}>{h}</th>
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

          {/* Totals */}
          <div style={{ marginLeft: 'auto', maxWidth: 280 }}>
            {[
              { label: 'Subtotal', value: invoice.subtotal || 0 },
              { label: `Tax (${invoice.tax_rate || 0}%)`, value: invoice.tax_amount || 0 },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{sym}{parseFloat(row.value).toFixed(2)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0' }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#10b981' }}>{sym}{parseFloat(invoice.total || 0).toFixed(2)}</span>
            </div>
          </div>

          {invoice.notes && (
            <div style={{ marginTop: 16, padding: '14px 18px', background: 'var(--surface2)', borderRadius: 12, border: '1px solid var(--border)' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 4px' }}>NOTES</p>
              <p style={{ fontSize: 13, color: 'var(--text)', margin: 0 }}>{invoice.notes}</p>
            </div>
          )}

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
            This is a computer generated invoice and does not require a signature.
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 28px 24px', display: 'flex', gap: 10 }}>
          <button onClick={handlePrint} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'var(--surface2)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            <Printer size={14} /> Print / PDF
          </button>
          {invoice.status !== 'paid' && (
            <button onClick={() => onMarkPaid(invoice.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', border: 'none', borderRadius: 12, background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              <CheckCircle size={14} /> Mark as Paid
            </button>
          )}
          <button onClick={onClose} style={{ marginLeft: 'auto', padding: '10px 18px', border: '1.5px solid var(--border)', borderRadius: 12, background: 'transparent', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState([]);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewInvoice, setViewInvoice] = useState(null);
  const [sendEmailModal, setSendEmailModal] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

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

  const handleMarkPaid = async (id) => {
    try {
      await invoicesAPI.update(id, { status: 'paid' });
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'paid' } : inv));
      if (viewInvoice?.id === id) setViewInvoice(prev => ({ ...prev, status: 'paid' }));
    } catch (e) { alert('Failed to update: ' + e.message); }
  };

  const filtered = invoices.filter(inv => {
    const matchSearch = !search || (inv.customer_name || '').toLowerCase().includes(search.toLowerCase()) || String(inv.invoice_number || '').includes(search);
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
          />
        )}

        {/* Page header */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>Invoices</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>Track and manage all your invoices</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: '1.5px solid var(--border)', borderRadius: 10, background: 'var(--surface)', color: 'var(--text-muted)', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}
          >
            <ArrowLeft size={14} /> Back
          </button>
        </div>

        {/* Stats */}
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

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoices..."
              style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#6366f1'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['all', 'draft', 'pending', 'paid', 'overdue'].map(s => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: `1px solid ${filterStatus === s ? '#6366f1' : 'var(--border)'}`,
                  background: filterStatus === s ? 'rgba(99,102,241,0.15)' : 'var(--surface)',
                  color: filterStatus === s ? '#a5b4fc' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize'
                }}
              >
                {s === 'all' ? 'All' : (STATUS_COLORS[s]?.label || s)}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 140px 120px 110px 140px', padding: '12px 20px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
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
              <div
                key={inv.id}
                style={{ display: 'grid', gridTemplateColumns: '60px 1fr 140px 120px 110px 140px', padding: '14px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                onClick={() => setViewInvoice(inv)}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600, alignSelf: 'center' }}>{idx + 1}</span>
                <div style={{ alignSelf: 'center' }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{inv.customer_name || 'Unknown'}</p>
                  {inv.customer_email && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{inv.customer_email}</p>}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', alignSelf: 'center' }}>{inv.invoice_number ? `#${inv.invoice_number}` : `#${inv.id}`}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', alignSelf: 'center' }}>
                  {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '—'}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', alignSelf: 'center' }}>{sym}{parseFloat(inv.total || 0).toFixed(2)}</span>
                <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.text }}>● {sc.label}</span>
                  <button
                    onClick={e => { e.stopPropagation(); setViewInvoice(inv); }}
                    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                    title="View invoice"
                  >
                    <Eye size={11} /> View
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
