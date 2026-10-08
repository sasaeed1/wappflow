'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  Plain-language errors, server side.
//
//  Hundreds of routes end in `res.status(500).json({ error: e.message })`, so a
//  studio could be shown "SQLITE_CONSTRAINT: UNIQUE constraint failed: tags.name",
//  "Cannot read properties of undefined (reading 'id')" or "asset_ids[] required".
//  That tells a person nothing and tells an attacker a lot.
//
//  This middleware rewrites the `error` of every 4xx/5xx JSON reply on /api:
//  • a message that already reads like a sentence for a person is kept;
//  • a recognisable technical one is translated (duplicate, missing item,
//    WhatsApp not connected, AI not set up, outside service unreachable…);
//  • anything else technical becomes a plain sentence with a short reference,
//    and the original is written to the server log under that reference.
//  Other fields of the reply (existing_id, needs_password, upgrade…) are kept.
// ════════════════════════════════════════════════════════════════════════════
const crypto = require('crypto');

const TECHNICAL = [
  /SQLITE|constraint failed|no such (table|column)|\bSQL\b/i,
  /Cannot read propert|Cannot set propert|is not a function|is not defined|is not iterable|undefined|\bnull\b|NaN/,
  /\b(TypeError|ReferenceError|SyntaxError|RangeError)\b|Unexpected (token|end of JSON)|JSON/,
  /\b(ECONN\w*|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENOENT|EACCES|EPIPE|EADDRINUSE)\b|fetch failed|socket hang up/i,
  /status code \d{3}|\bat [\w.<>]+ \(|\n\s+at /,
  /\b[a-z]+_[a-z_]+\b|\w+\[\]/, // snake_case field names, "asset_ids[]"
];
const looksTechnical = (msg) => TECHNICAL.some((re) => re.test(msg));

const humanize = (s) => String(s).replace(/\[\]/g, '').replace(/_ids\b/g, 's').replace(/_id\b/g, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

// Known technical failures → what a person should hear.
const KNOWN = [
  [/UNIQUE constraint failed/i, () => 'That already exists, so it wasn’t added again.'],
  [/FOREIGN KEY constraint failed/i, () => 'That item has been changed or removed. Refresh the page and try again.'],
  [/NOT NULL constraint failed: \w+\.(\w+)/i, (m) => `Please fill in the ${humanize(m[1])}.`],
  [/SQLITE_BUSY|database is locked/i, () => 'We’re a little busy right now. Please try again in a moment.'],
  [/WhatsApp client is not ready|No WhatsApp number is connected|WhatsApp not connected/i, () => 'WhatsApp isn’t connected right now. Reconnect it in Settings → WhatsApp, then try again.'],
  [/No AI provider configured/i, () => 'The AI isn’t set up on this server yet. Ask your administrator to add an AI key.'],
  [/rate.?limit|too many requests|\b429\b/i, () => 'That service is busy right now. Please wait a minute and try again.'],
  [/\b(ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)\b|fetch failed|socket hang up/i, () => 'We couldn’t reach an outside service just now. Please try again in a moment.'],
  [/ENOENT|no such file/i, () => 'That file couldn’t be found. It may have been moved or deleted.'],
  [/^([a-z][\w\[\]]*(?:(?:,\s*and\s+|,\s*|\s+and\s+)[a-z][\w\[\]]*)*),? (?:array )?(?:is |are )?required\.?$/i, (m) => `Please fill in: ${humanize(m[1])}.`],
  [/^invalid ([a-z_]+)$/, (m) => `That ${humanize(m[1])} isn’t valid. Please check it and try again.`],
];

function byStatus(status) {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'You don’t have permission to do that. Ask your workspace owner if you need access.';
  if (status === 404) return 'We couldn’t find that. It may have been deleted.';
  if (status === 409) return 'That clashes with something that already exists. Refresh the page and try again.';
  if (status === 413) return 'That file is too large.';
  if (status === 429) return 'You’re going a bit fast. Please wait a minute and try again.';
  if (status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
  return 'That didn’t work. Please check what you entered and try again.';
}

/** Turn any error message into something a person can read. */
function translate(status, msg) {
  const raw = typeof msg === 'string' ? msg.trim() : '';
  if (!raw) return { text: byStatus(status), technical: true };
  for (const [re, fn] of KNOWN) { const m = raw.match(re); if (m) return { text: fn(m), technical: true }; }
  if (!looksTechnical(raw)) {
    // A plain but lazily written message ("view not found") just gets tidied.
    const tidy = raw[0].toUpperCase() + raw.slice(1) + (/[.!?…)]$/.test(raw) ? '' : '.');
    return { text: tidy, technical: false };
  }
  return { text: byStatus(status), technical: true };
}

function middleware(req, res, next) {
  const json = res.json.bind(res);
  res.json = (body) => {
    try {
      if (res.statusCode >= 400 && body && typeof body === 'object' && !Array.isArray(body) && ('error' in body || 'message' in body)) {
        const original = typeof body.error === 'string' ? body.error : typeof body.message === 'string' ? body.message : '';
        const { text, technical } = translate(res.statusCode, original);
        if (technical && original !== text) {
          const ref = crypto.randomBytes(3).toString('hex').toUpperCase();
          console.error(`[error ${ref}] ${req.method} ${req.originalUrl.split('?')[0]} → ${res.statusCode}: ${original || '(no message)'}`);
          body = { ...body, error: res.statusCode >= 500 ? `${text} (Ref ${ref})` : text };
          if (typeof body.message === 'string') delete body.message;
        } else if (original !== text) {
          body = { ...body, error: text }; // a plain message, just tidied
        }
      }
    } catch { /* never let error-wording break a reply */ }
    return json(body);
  };
  next();
}

module.exports = { middleware, translate, looksTechnical };
