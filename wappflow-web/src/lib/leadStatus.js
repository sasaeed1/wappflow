// Lead status registry — stable DOMAIN KEYS (the leads.status DB value) mapped to
// PRESENTATION METADATA only. No rendering, no colors-as-values; the Badge primitive
// turns `tone` into tokens. Keys are the canonical domain values used by logic/API/DB —
// never change them here; change only presentation metadata. (PROP-002 Batch B, D3.)

import { makeStatusLookup } from './statusRegistry';

export const LEAD_STATUS = {
  'New':           { label: 'New',           tone: 'accent',  order: 1 },
  'Contacted':     { label: 'Contacted',     tone: 'info',    order: 2 },
  'Interested':    { label: 'Interested',    tone: 'warning', order: 3 },
  'Negotiating':   { label: 'Negotiating',   tone: 'warning', order: 4 },
  'Closed - Won':  { label: 'Closed - Won',  tone: 'success', order: 5 },
  'Closed - Lost': { label: 'Closed - Lost', tone: 'danger',  order: 6 },
};

// Unknown/legacy keys (e.g. "Closed Won") → neutral Badge + humanized original value +
// one-shot telemetry. Never crashes, never normalizes an unknown value to a valid status.
export const leadStatusMeta = makeStatusLookup('lead-status', LEAD_STATUS);

// Pipeline order (excludes the synthetic "All" filter, which surfaces own).
export const LEAD_STATUS_KEYS = Object.keys(LEAD_STATUS);
