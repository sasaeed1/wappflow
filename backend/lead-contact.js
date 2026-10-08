'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  How a contact can be reached, cleaned up and checked, for leads added by
//  hand. A lead can be added with a WhatsApp number, an Instagram username, a
//  Facebook name/link, or any combination; at least one is required.
//
//  Pure functions (no I/O), so every message a studio can see is testable.
//  Each returns { value } or { error } where error is a sentence for a person,
//  not a code.
// ════════════════════════════════════════════════════════════════════════════

/** "+44 7700 900-123" → "+447700900123". */
function normalizePhone(raw) {
  const s = String(raw || '').trim();
  if (!s) return { value: null };
  if (/[a-z]/i.test(s.replace(/^tel:/i, ''))) return { error: 'That WhatsApp number has letters in it. Use digits only, with the country code, e.g. +44 7700 900123.' };
  const plus = s.replace(/^tel:/i, '').trim().startsWith('+') || s.startsWith('00');
  const digits = s.replace(/\D/g, '').replace(/^00/, '');
  if (digits.length < 7) return { error: 'That WhatsApp number is too short. Include the country code, e.g. +44 7700 900123.' };
  if (digits.length > 15) return { error: 'That WhatsApp number is too long. Check it and include the country code only once.' };
  return { value: (plus ? '+' : '') + digits };
}

/** "@lumen.studio", "instagram.com/lumen.studio/", "https://www.instagram.com/lumen.studio?igsh=x" → "lumen.studio". */
function normalizeInstagram(raw) {
  let s = String(raw || '').trim();
  if (!s) return { value: null };
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@+/, '').replace(/\/+$/, '').trim();
  if (!/^[a-z0-9._]{1,30}$/i.test(s) || /^\.|\.$|\.\./.test(s)) {
    return { error: 'That Instagram username doesn’t look right. Use just the name, like @lumen.studio (letters, numbers, dots and underscores).' };
  }
  return { value: s.toLowerCase() };
}

/** A Facebook profile/page link, a page username, or the person's name as shown on Facebook. */
function normalizeFacebook(raw) {
  let s = String(raw || '').trim();
  if (!s) return { value: null };
  const id = s.match(/facebook\.com\/profile\.php\?id=(\d+)/i);
  if (id) return { value: `id:${id[1]}`, display: `Facebook profile ${id[1]}` };
  const m = s.match(/(?:facebook|fb)\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@+/, '').replace(/\/+$/, '').trim();
  if (s.length < 2) return { error: 'That Facebook name is too short. Paste their profile link, or type their name as it appears on Facebook.' };
  if (s.length > 80) return { error: 'That Facebook name is too long. Paste their profile link instead.' };
  return { value: s, display: s };
}

/** Validate a new lead's contact details. Returns { phone, instagram, facebook } or { error }. */
function checkContact({ customer_phone, instagram, facebook } = {}) {
  const p = normalizePhone(customer_phone); if (p.error) return { error: p.error };
  const i = normalizeInstagram(instagram); if (i.error) return { error: i.error };
  const f = normalizeFacebook(facebook); if (f.error) return { error: f.error };
  if (!p.value && !i.value && !f.value) return { error: 'Add a WhatsApp number, an Instagram username or a Facebook name, so you can reach this contact.' };
  return { phone: p.value, instagram: i.value, facebook: f.value, facebookDisplay: f.display || null };
}

module.exports = { normalizePhone, normalizeInstagram, normalizeFacebook, checkContact };
