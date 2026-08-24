// Invoice status registry — stable DOMAIN KEYS (invoices.status DB value) → PRESENTATION
// METADATA only. The Badge primitive resolves `tone` to tokens. Keys are canonical domain
// values (logic/API/DB) — change only presentation metadata here. (PROP-002 Batch B, D3.)

import { makeStatusLookup } from './statusRegistry';

export const INVOICE_STATUS = {
  draft:   { label: 'Draft',   tone: 'neutral', order: 0 },
  // 'sent' is what the contract automation and the print store write, and it was
  // missing here — so every invoice the product raised on its own rendered with an
  // unknown-status badge on the screen the studio uses to chase money.
  sent:    { label: 'Sent',    tone: 'info',    order: 1 },
  pending: { label: 'Pending', tone: 'warning', order: 2 },
  paid:    { label: 'Paid',    tone: 'success', order: 3 },
  // Derived, never stored: the backend sets is_overdue on every invoice it returns
  // (see isOverdue in server.js). Kept in the registry so the badge and the filter
  // tab have one definition of how "overdue" looks.
  overdue: { label: 'Overdue', tone: 'danger',  order: 4 },
};

/** The status to DISPLAY: the stored one, unless it is past due. */
export const displayInvoiceStatus = (inv) => (inv?.is_overdue ? 'overdue' : (inv?.status || 'draft'));

// Unknown/legacy status → neutral Badge + humanized value + telemetry. Critically, an unknown
// value is NOT silently shown as "Draft" (that would pretend an invalid status is valid).
export const invoiceStatusMeta = makeStatusLookup('invoice-status', INVOICE_STATUS);

export const INVOICE_STATUS_KEYS = Object.keys(INVOICE_STATUS);
