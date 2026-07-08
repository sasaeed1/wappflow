// Lead status registry — stable DOMAIN KEYS (the leads.status DB value) mapped to
// PRESENTATION METADATA only. No rendering, no colors-as-values; the Badge primitive
// turns `tone` into tokens. Keys are the canonical domain values used by logic/API/DB —
// never change them here; change only presentation metadata. (PROP-002 Batch B, D3.)

export const LEAD_STATUS = {
  'New':           { label: 'New',           tone: 'accent',  order: 1 },
  'Contacted':     { label: 'Contacted',     tone: 'info',    order: 2 },
  'Interested':    { label: 'Interested',    tone: 'warning', order: 3 },
  'Negotiating':   { label: 'Negotiating',   tone: 'warning', order: 4 },
  'Closed - Won':  { label: 'Closed - Won',  tone: 'success', order: 5 },
  'Closed - Lost': { label: 'Closed - Lost', tone: 'danger',  order: 6 },
};

// Unknown/legacy keys degrade to a neutral badge (never blank, never a thrown color lookup).
export const leadStatusMeta = (key) => LEAD_STATUS[key] || { label: key || 'New', tone: 'neutral', order: 99 };

// Pipeline order (excludes the synthetic "All" filter, which surfaces own).
export const LEAD_STATUS_KEYS = Object.keys(LEAD_STATUS);
