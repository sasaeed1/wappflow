'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Plus, Search, X, Eye, Printer, Mail, CheckCircle,
  Clock, AlertCircle, DollarSign, Building2, User, Calendar,
  ArrowLeft, Download, Send, Trash2,
} from 'lucide-react';
import { invoicesAPI, settingsAPI, displayPhone, BASE_URL, paymentsAPI } from '../../lib/api';
import { useConfirm } from '@/lib/confirm';
import { formatDate } from '../../lib/datetime';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { Field, Input, Textarea } from '@/components/ui/Field';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { SkeletonRow } from '@/components/ui/Skeleton';
import { toast } from '@/components/ui/Toast';
import { invoiceStatusMeta, displayInvoiceStatus } from '@/lib/invoiceStatus';
import { buildInvoiceHTML } from '@/lib/invoiceDoc';

// Invoice status presentation now lives in the shared registry (lib/invoiceStatus.js) rendered
// through <Badge>. The printed-document status colors below (statusColors) are a separate,
// document-template concern and intentionally stay local to buildInvoiceHTML.

// ── Premium invoice document — used for Print / Save-as-PDF (matches the
// emailed version produced by the backend so customers see one consistent doc).

function InvoiceViewModal({ invoice, company, onClose, onMarkPaid, onSendEmail, onDelete }) {
  const sym = company?.currency_symbol || '$';
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
    win.document.write(buildInvoiceHTML(invoice, company, BASE_URL));
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch {} }, 400);
  };

  return (
    <Modal open onClose={onClose} labelledBy="inv-view-title" hideClose padded={false} size="lg" style={{ maxWidth: 720 }}>

        <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText size={22} color="#6366f1" />
            </div>
            <div>
              <h2 id="inv-view-title" style={{ fontSize: 18, fontWeight: 900, color: 'var(--text)', margin: 0 }}>{invoice.invoice_number ? `Invoice ${invoice.invoice_number}` : `Invoice #${invoice.id}`}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <Badge tone={invoiceStatusMeta(displayInvoiceStatus(invoice)).tone} dot>{invoiceStatusMeta(displayInvoiceStatus(invoice)).label}</Badge>
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
          <Button variant="primary" onClick={() => onSendEmail(invoice)}><Send size={14} /> Send via Email</Button>
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
          <Button variant="danger" onClick={() => onDelete(invoice)} style={{ marginLeft: 'auto' }}><Trash2 size={14} /> Delete</Button>
        </div>
    </Modal>
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

  // A field-level problem renders on the field; anything else renders in the banner.
  // Never both — two copies of one message (or a stale banner beside a fresh field
  // error) is worse than either alone.
  const RECIPIENT_ERROR = 'A recipient email is required.';
  const fieldError = error === RECIPIENT_ERROR ? error : null;
  const bannerError = error === RECIPIENT_ERROR ? null : error;

  const handleSend = async () => {
    if (!to.trim()) { setError(RECIPIENT_ERROR); return; }
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

  return (
    <Modal open onClose={onClose} labelledBy="send-inv-title" hideClose padded={false} size="sm" style={{ maxWidth: 520 }} dismissable={!sending}>
        <div style={{ padding: '22px 26px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Mail size={20} color="#6366f1" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 id="send-inv-title" style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Email Invoice</h3>
            <p style={{ fontSize: 12.5, color: 'var(--text-dim)', margin: 0 }}>{invoice.invoice_number || `#${invoice.id}`} · A premium invoice will be sent.</p>
          </div>
          <button onClick={onClose} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 10, padding: 7, cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={17} />
          </button>
        </div>
        <div style={{ padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {bannerError && (
            <div style={{ padding: '10px 13px', background: 'var(--danger-bg)', border: '1.5px solid var(--danger-border)', borderRadius: 10, color: 'var(--danger)', fontSize: 12.5 }}>{bannerError}</div>
          )}
          <Field label="Send to" required error={fieldError}>
            <Input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="customer@example.com" data-autofocus />
          </Field>
          <Field label="Subject">
            <Input value={subject} onChange={e => setSubject(e.target.value)} />
          </Field>
          <Field label="Message">
            <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={5} />
          </Field>
        </div>
        <div style={{ padding: '14px 26px 22px', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button variant="primary" onClick={handleSend} loading={sending}>Send Invoice</Button>
        </div>
    </Modal>
  );
}

export default function InvoicesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [invoices, setInvoices] = useState([]);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [viewInvoice, setViewInvoice] = useState(null);
  const [emailInvoice, setEmailInvoice] = useState(null);

  // The invoice fetch used to swallow its failure into `{invoices: []}`, so an outage
  // rendered as "No invoices found". Company settings are cosmetic, so that one still
  // degrades quietly — only the data fetch decides whether we can show the page.
  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      invoicesAPI.getAll(),
      settingsAPI.getCompany().catch(() => ({ data: { company: {} } })),
    ]).then(([invRes, compRes]) => {
      setInvoices(invRes.data.invoices || []);
      setCompany(compRes.data.company || {});
    }).catch((e) => {
      setError(e?.response?.data?.error || e?.message || 'Request failed');
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!localStorage.getItem('token')) { router.push('/login'); return; }
    load();
  }, []);

  const handleMarkPaid = async (id) => {
    try {
      // Ledger truth: settles via the payments rail (records who/when/how), not a raw status write.
      await paymentsAPI.markInvoicePaid(id);
      setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, status: 'paid' } : inv));
      if (viewInvoice?.id === id) setViewInvoice(prev => ({ ...prev, status: 'paid' }));
      toast.success('Invoice marked as paid.');
    } catch (e) { toast.error('Could not update invoice', { description: e.message }); }
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
      toast.success('Invoice deleted.');
    } catch (e) { toast.error('Could not delete invoice', { description: e.message }); }
  };

  const handleEmailSent = () => {
    const id = emailInvoice?.id;
    setInvoices(prev => prev.map(i => (i.id === id && i.status === 'draft') ? { ...i, status: 'pending' } : i));
    if (viewInvoice?.id === id && viewInvoice.status === 'draft') setViewInvoice(p => ({ ...p, status: 'pending' }));
    setEmailInvoice(null);
    toast.success('Invoice emailed to the customer.');
  };

  const filtered = invoices.filter(inv => {
    const matchSearch = !search || (inv.customer_name || '').toLowerCase().includes(search.toLowerCase()) || String(inv.invoice_number || '').toLowerCase().includes(search.toLowerCase());
    // Overdue is DERIVED (nothing ever wrote it), so the tab has to filter on the
    // displayed status, not the stored one — which is why it always showed nothing.
    const matchStatus = filterStatus === 'all' || displayInvoiceStatus(inv) === filterStatus;
    return matchSearch && matchStatus;
  });

  const sym = company?.currency_symbol || '$';
  const totalRevenue = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.total || 0), 0);
  // Money owed is every unpaid, non-draft invoice — not just the ones stored as
  // 'pending'. Contract and store invoices are written as 'sent', so a studio's
  // biggest receivables were missing from this figure entirely.
  const totalPending = invoices
    .filter(i => !['paid', 'draft', 'cancelled', 'void'].includes(String(i.status || '').toLowerCase()))
    .reduce((s, i) => s + parseFloat(i.total || 0), 0);

  return (
    <>
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
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>Invoices</h1>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '4px 0 0' }}>Track, send and manage all your invoices</p>
          </div>
          {/* Removed: /invoices is a top-level nav item, a SIBLING of /dashboard, so a
              "Back" here promised up and delivered sideways — and the shell nav two rows
              above already offers both destinations. */}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
          {[
            { label: 'Total Invoices', value: invoices.length, icon: FileText, color: '#6366f1', bg: 'rgba(99,102,241,0.12)' },
            { label: 'Paid Revenue', value: `${sym}${totalRevenue.toLocaleString()}`, icon: CheckCircle, color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
            { label: 'Pending', value: `${sym}${totalPending.toLocaleString()}`, icon: Clock, color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
            { label: 'Overdue', value: invoices.filter(i => i.is_overdue).length, icon: AlertCircle, color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
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
              style={{ width: '100%', padding: '10px 12px 10px 36px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['all', 'draft', 'sent', 'pending', 'paid', 'overdue'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{
                  padding: '8px 14px', borderRadius: 8, border: `1px solid ${filterStatus === s ? '#6366f1' : 'var(--border)'}`,
                  background: filterStatus === s ? 'rgba(99,102,241,0.15)' : 'var(--surface)',
                  color: filterStatus === s ? '#a5b4fc' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                }}>
                {s === 'all' ? 'All' : invoiceStatusMeta(s).label}
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

          {/* error → loading → empty → filtered-empty → rows. The filtered branch is
              separate on purpose: telling someone with 300 invoices to "create invoices
              from a lead profile" because they mistyped a search is simply false. */}
          {error ? (
            <ErrorState
              title="Could not load your invoices"
              description="Your invoices are safe — we just couldn’t fetch them right now."
              detail={error}
              onRetry={load}
              compact
            />
          ) : loading ? (
            <SkeletonRow variant="invoice" rows={6} />
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No invoices yet"
              description="Create invoices from any lead profile."
              compact
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              filtered
              icon={Search}
              title="No invoices match those filters"
              description="Try a different search, or clear the filters to see everything."
              action={{ label: 'Clear filters', onClick: () => { setSearch(''); setFilterStatus('all'); } }}
              compact
            />
          ) : filtered.map((inv, idx) => {
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
                  <Badge tone={invoiceStatusMeta(displayInvoiceStatus(inv)).tone} dot>{invoiceStatusMeta(displayInvoiceStatus(inv)).label}</Badge>
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

      </div>
    </>
  );
}
