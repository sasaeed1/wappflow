'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Placed fields — the DocuSign-grade half of the Contracts Studio.
//
//  BEFORE: the document had a decorative "signature" block that rendered a
//  dashed box reading "The client signs here in the portal", and the actual
//  signing was one global modal at the end — type your name, draw once, agree.
//  There was no way to say "initial here", "put the event date there", "tick
//  this box", or "this part is for the witness, not the client". Everything a
//  real agreement needs collected was collected as prose or not at all.
//
//  AFTER: a `field` block is placed in the document body before sending. It has
//  a kind, an assigned signer role, and a required flag. The client fills them
//  where they sit in the document, and signing is refused until every field
//  required OF THAT ROLE is complete.
//
//  DESIGN DECISIONS, stated:
//    • Fields are BLOCKS, not a separate overlay layer with x/y coordinates.
//      This document model is a reflowing stack of blocks rendered responsively
//      on phones — pinning fields to page coordinates, the way a PDF-based
//      product must, would break the moment the text wrapped differently. In
//      flow, a field is exactly as placed as the paragraph above it.
//    • VALIDATION LIVES HERE, not in the route, and it is pure — so the rule
//      that decides whether a signature is complete can be tested against every
//      shape a client can submit without booting a server.
//    • REQUIRED IS PER ROLE. A witness must not be blocked by a field addressed
//      to the client, and must not be able to sign on the client's behalf by
//      filling one either.
// ════════════════════════════════════════════════════════════════════════════

const FIELD_KINDS = ['signature', 'initials', 'date', 'text', 'checkbox'];
const SIGNER_ROLES = ['client', 'company', 'witness', 'cosigner'];

// Kinds that constitute an actual mark of assent, as opposed to data collection.
// A document whose only required field is a text box has not been signed.
const SIGNING_KINDS = new Set(['signature', 'initials']);

/** Every field block in a document, flattened and normalised. */
function collectFields(blocks) {
  if (!Array.isArray(blocks)) return [];
  const out = [];
  for (const b of blocks) {
    if (!b || b.type !== 'field' || !b.id) continue;
    const d = b.data || {};
    const kind = FIELD_KINDS.includes(d.kind) ? d.kind : 'text';
    out.push({
      id: String(b.id),
      kind,
      // An unrecognised role would silently make a field nobody is responsible
      // for, so it falls back to the client rather than being dropped.
      role: SIGNER_ROLES.includes(d.role) ? d.role : 'client',
      label: String(d.label || defaultLabel(kind)).slice(0, 80),
      // A signature field is required unless explicitly turned off: an optional
      // signature is almost always a mistake, and the cost of the default being
      // wrong is one click.
      required: d.required === undefined ? SIGNING_KINDS.has(kind) : !!d.required,
    });
  }
  return out;
}

function defaultLabel(kind) {
  return { signature: 'Signature', initials: 'Initials', date: 'Date', text: 'Your answer', checkbox: 'I agree' }[kind] || 'Field';
}

/** The fields one signer is responsible for. */
const fieldsForRole = (blocks, role) => collectFields(blocks).filter(f => f.role === (role || 'client'));

/** Is a submitted value an actual answer for this kind? */
function isFilled(field, raw) {
  if (raw === undefined || raw === null) return false;
  if (field.kind === 'checkbox') return raw === true || raw === 'true' || raw === 1 || raw === '1';
  const s = String(raw).trim();
  if (!s) return false;
  // A signature pad that was opened and closed without a stroke still posts a
  // data URL for a blank canvas. Length is a crude but effective floor: a real
  // stroke is thousands of characters, an empty canvas header is ~100.
  if (SIGNING_KINDS.has(field.kind)) return s.startsWith('data:image') ? s.length > 400 : s.length > 1;
  return true;
}

/**
 * Decide whether this signer may sign.
 *
 * Returns { ok, missing: [{id,label,kind}], values } where `values` is the
 * cleaned map to persist — unknown keys are dropped, so a client cannot post
 * values for fields that are not in the document, or for another role's fields.
 */
function validateSubmission(blocks, role, submitted = {}) {
  const mine = fieldsForRole(blocks, role);
  const values = {};
  const missing = [];

  for (const f of mine) {
    const raw = submitted[f.id];
    if (isFilled(f, raw)) {
      values[f.id] = f.kind === 'checkbox' ? true : String(raw).slice(0, 200000);
    } else if (f.required) {
      missing.push({ id: f.id, label: f.label, kind: f.kind });
    }
  }
  return { ok: missing.length === 0, missing, values };
}

/**
 * Does this document collect its assent through placed fields?
 *
 * Documents created before this feature have no field blocks, and their signing
 * flow is the original global name + drawn signature. Both must keep working, so
 * the route asks this rather than assuming one shape: a document with a required
 * signature/initials field for this role gates on the field, everything else
 * gates on the legacy modal.
 */
function usesPlacedSigning(blocks, role) {
  return fieldsForRole(blocks, role).some(f => SIGNING_KINDS.has(f.kind) && f.required);
}

module.exports = {
  FIELD_KINDS, SIGNER_ROLES, SIGNING_KINDS,
  collectFields, fieldsForRole, isFilled, validateSubmission, usesPlacedSigning, defaultLabel,
};
