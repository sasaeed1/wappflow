// Shared status-registry contract (PROP-002 Batch B).
//
// A registry maps a STABLE DOMAIN KEY (the DB value — drives logic/API/filtering/
// analytics) to PRESENTATION METADATA only. This module defines the ONE deliberate
// fallback for keys not in a registry, so no surface improvises its own.
//
// Fallback contract for an unknown/legacy key (e.g. "Closed Won" vs "Closed - Won",
// or a brand-new status the UI hasn't shipped yet):
//   • NEVER crash (no `meta.label` on undefined).
//   • NEVER silently normalize to a valid-looking status — an unknown value must NOT
//     masquerade as "Draft"/"New". We surface the REAL value, humanized.
//   • Render a NEUTRAL Badge (no false success/danger signal).
//   • Emit a one-shot dev/telemetry warning so bad data is visible, not hidden.
//   • Data normalization, if ever wanted, is a deliberate DATA-LAYER decision — never here.

export function humanizeStatus(key) {
  if (key == null || key === '') return 'Unknown';
  return String(key)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const _warned = new Set();
function warnUnknown(registry, key) {
  if (typeof window === 'undefined') return; // no SSR log noise
  const id = registry + '::' + String(key);
  if (_warned.has(id)) return;
  _warned.add(id);
  console.warn(
    `[status-registry] Unknown ${registry} value ${JSON.stringify(key)} — rendering a neutral ` +
    `fallback. Add it to the registry or investigate the data source (values are NOT normalized in the UI).`
  );
}

// Build a lookup: key -> presentation metadata, with the deliberate neutral fallback.
// The fallback is flagged (`unknown: true`) so callers/tests can detect it.
export function makeStatusLookup(name, map) {
  return function statusMeta(key) {
    const meta = map[key];
    if (meta) return meta;
    warnUnknown(name, key);
    return { label: humanizeStatus(key), tone: 'neutral', order: 999, unknown: true };
  };
}
