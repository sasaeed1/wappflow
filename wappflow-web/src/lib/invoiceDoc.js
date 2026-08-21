// The invoice document — ONE definition (Phase 6).
//
// There were three. This branded, HTML-escaped builder (the invoices page); a
// hand-maintained copy in backend/server.js for emailing, carrying a comment
// asking future editors to "change BOTH and keep them in sync"; and a third,
// much thinner one inside the lead page's Create Invoice modal.
//
// That third one was the dangerous one. It interpolated the customer name, every
// line-item description and the notes field RAW into a document.write on a
// same-origin window — and a lead's name is attacker-supplied, because the public
// booking form creates leads from whatever a stranger types. Booking under a
// crafted name and waiting for the studio to print an invoice was a path to
// running script with access to localStorage, where the auth token lives.
//
// Keeping one escaped implementation is what makes that class of bug impossible
// rather than merely absent today.

export function buildInvoiceHTML(invoice, company, baseUrl = '') {
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
    ? `<img src="${baseUrl}${esc(c.company_logo)}" alt="" style="max-height:54px;max-width:210px;object-fit:contain;display:block;margin-bottom:10px" />`
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
