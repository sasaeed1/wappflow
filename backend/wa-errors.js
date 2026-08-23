// ── Making whatsapp-web.js / puppeteer failures readable ──────────────────────
//
// Anything that fails inside the WhatsApp Web page reaches Node through puppeteer's
// evaluate boundary. Puppeteer can only rebuild an Error from what CDP hands it, and
// WhatsApp's own error objects are not real Errors — they are minified FBLOGGER
// objects. The result is that `e.message` in Node is the MINIFIED CLASS NAME:
//
//     ❌ Missed-message sync error: r          ← e.message === 'r'
//     Voice send via WhatsApp failed: t: t     ← e.name === 't', e.message === 't'
//
// which tells the next person nothing at all. `describeWaError` prints everything
// that does survive the crossing — name, stack, cause chain, and any own properties
// the library attached — and says outright when the message is a minified stub, so
// nobody burns an afternoon deciding whether 'r' is meaningful.
//
// The real detail for a page-side throw only exists INSIDE the page, so where it
// matters, catch in the `page.evaluate` callback and return the error as data rather
// than letting it cross the boundary.

const SKIP_PROPS = new Set(['name', 'message', 'stack', 'cause']);

// A message that is only a short identifier-shaped token ('r', 't: t', 'e') is a
// minifier artefact, not a description.
const MINIFIED_MESSAGE = /^[A-Za-z$_]{1,3}(\s*:\s*[A-Za-z$_]{1,3})?$/;

function isMinifiedMessage(name, message) {
  if (!message) return true;
  if (message === name) return true;
  return MINIFIED_MESSAGE.test(message);
}

// whatsapp-web.js and WhatsApp itself hang the useful payload off own properties
// (`messageFormat`, `messageParams`, `errorName`, …) rather than off `message`.
function ownDetails(err) {
  const out = [];
  let props;
  try { props = Object.getOwnPropertyNames(err); } catch { return out; }
  for (const key of props) {
    if (SKIP_PROPS.has(key)) continue;
    let value;
    try { value = err[key]; } catch { continue; }
    if (value === undefined || value === null || typeof value === 'function') continue;
    let rendered;
    if (typeof value === 'object') {
      try { rendered = JSON.stringify(value); } catch { rendered = '[unserializable]'; }
      if (!rendered || rendered === '{}' || rendered === '[]') continue;
    } else {
      rendered = String(value);
      if (!rendered) continue;
    }
    out.push(`${key}=${rendered.length > 400 ? rendered.slice(0, 400) + '…' : rendered}`);
  }
  return out;
}

/**
 * Render a thrown value as something a human can act on.
 *
 * @param {*} err            the caught value (need not be an Error)
 * @param {object} [options]
 * @param {number} [options.stackLines]  how many stack frames to keep (default 6)
 * @returns {string} a multi-line description, safe to hand straight to console.error
 */
function describeWaError(err, { stackLines = 6 } = {}) {
  if (err === null || err === undefined) return 'unknown error (nothing was thrown)';
  if (typeof err !== 'object') return `${typeof err} thrown: ${String(err)}`;

  const name = err.name || (err.constructor && err.constructor.name) || 'Error';
  const message = typeof err.message === 'string' ? err.message : '';
  const lines = [];

  if (isMinifiedMessage(name, message)) {
    lines.push(`${name}: <minified by whatsapp-web.js/puppeteer — message "${message}" carries no detail>`);
  } else {
    lines.push(`${name}: ${message.split('\n')[0]}`);
    // WhatsApp re-prints the message inside itself; keep the remainder only if it adds something.
    const rest = message.split('\n').slice(1).map(l => l.trim()).filter(l => l && !lines[0].includes(l));
    for (const line of rest.slice(0, 3)) lines.push(`  … ${line}`);
  }

  const details = ownDetails(err);
  if (details.length) lines.push(`  props: ${details.join(' ')}`);

  // Unwrap the cause chain — an aggregated/wrapped error often hides the real one.
  let cause = err.cause;
  let depth = 0;
  while (cause && depth < 3) {
    const causeName = cause.name || 'Error';
    const causeMessage = typeof cause.message === 'string' ? cause.message : String(cause);
    lines.push(`  caused by: ${causeName}: ${isMinifiedMessage(causeName, causeMessage) ? '<minified>' : causeMessage.split('\n')[0]}`);
    const causeDetails = ownDetails(cause);
    if (causeDetails.length) lines.push(`    props: ${causeDetails.join(' ')}`);
    cause = cause.cause;
    depth++;
  }

  if (typeof err.stack === 'string') {
    const frames = err.stack.split('\n').filter(l => l.trim().startsWith('at ')).slice(0, stackLines);
    for (const frame of frames) lines.push(`  ${frame.trim()}`);
  } else {
    lines.push('  (no stack — the throw did not originate from a real Error)');
  }

  return lines.join('\n');
}

// True when the failure is "the browser went away", not "the call is broken".
// Worth separating: the first is expected during a restart or reconnect and should
// not be read as a bug, the second needs a human.
function isPageContextGone(err) {
  const text = `${(err && err.name) || ''} ${(err && err.message) || ''} ${(err && err.stack) || ''}`;
  return /Target closed|Session closed|Protocol error|detached Frame|Execution context was destroyed|Navigating frame was detached|Connection closed/i.test(text);
}

module.exports = { describeWaError, isPageContextGone };
