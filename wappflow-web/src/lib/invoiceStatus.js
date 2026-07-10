// Invoice status registry — stable DOMAIN KEYS (invoices.status DB value) → PRESENTATION
// METADATA only. The Badge primitive resolves `tone` to tokens. Keys are canonical domain
// values (logic/API/DB) — change only presentation metadata here. (PROP-002 Batch B, D3.)

import { makeStatusLookup } from './statusRegistry';

export const INVOICE_STATUS = {
  draft:   { label: 'Draft',   tone: 'neutral', order: 0 },
  pending: { label: 'Pending', tone: 'warning', order: 1 },
  paid:    { label: 'Paid',    tone: 'success', order: 2 },
  overdue: { label: 'Overdue', tone: 'danger',  order: 3 },
};

// Unknown/legacy status → neutral Badge + humanized value + telemetry. Critically, an unknown
// value is NOT silently shown as "Draft" (that would pretend an invalid status is valid).
export const invoiceStatusMeta = makeStatusLookup('invoice-status', INVOICE_STATUS);

export const INVOICE_STATUS_KEYS = Object.keys(INVOICE_STATUS);
