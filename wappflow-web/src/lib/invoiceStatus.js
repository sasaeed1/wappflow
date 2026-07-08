// Invoice status registry — stable DOMAIN KEYS (invoices.status DB value) → PRESENTATION
// METADATA only. The Badge primitive resolves `tone` to tokens. Keys are canonical domain
// values (logic/API/DB) — change only presentation metadata here. (PROP-002 Batch B, D3.)

export const INVOICE_STATUS = {
  draft:   { label: 'Draft',   tone: 'neutral', order: 0 },
  pending: { label: 'Pending', tone: 'warning', order: 1 },
  paid:    { label: 'Paid',    tone: 'success', order: 2 },
  overdue: { label: 'Overdue', tone: 'danger',  order: 3 },
};

export const invoiceStatusMeta = (key) => INVOICE_STATUS[key] || INVOICE_STATUS.draft;

export const INVOICE_STATUS_KEYS = Object.keys(INVOICE_STATUS);
