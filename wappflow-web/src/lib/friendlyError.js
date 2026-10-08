// Plain-language errors, app side. The server already rewrites its own error
// replies (backend/friendly-errors.js); this covers what the browser produces on
// its own — "Network Error", "Failed to fetch", "Request failed with status code
// 500", "timeout of 30000ms exceeded", "Cannot read properties of undefined" —
// and anything technical that reaches a toast or an error box.
//
//   friendlyMessage(err)  → a sentence for any axios/fetch/Error/string
//   plainMessage(text)    → text, unless it is technical, then a sentence
//   installFetchFriendlyErrors() → fetch() network failures carry a sentence

const TECHNICAL = [
  /SQLITE|constraint failed|no such (table|column)/i,
  /Cannot read propert|Cannot set propert|is not a function|is not defined|is not iterable|\bundefined\b|\bnull\b|NaN/,
  /\b(TypeError|ReferenceError|SyntaxError|RangeError)\b|Unexpected (token|end of JSON)|JSON\.parse|is not valid JSON/,
  /\b(ECONN\w*|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENOENT)\b/,
  /status code \d{3}|^HTTP \d{3}|^\d{3}\b|\bat [\w.<>]+ \(/,
  /Network ?Error|Failed to fetch|Load failed|NetworkError when attempting|timeout of \d+ms exceeded|ERR_[A-Z_]+/i,
  /\b[a-z]+_[a-z_]+\b|\w+\[\]/,
];
export const looksTechnical = (msg) => typeof msg === 'string' && TECHNICAL.some((re) => re.test(msg));

const OFFLINE = 'You seem to be offline. Check your internet connection and try again.';
const UNREACHABLE = 'We couldn’t reach WappFlow. Check your internet connection and try again.';
const GENERIC = 'Something went wrong. Please try again in a moment.';

export function byStatus(status) {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 402) return 'This needs a higher plan. Upgrade in Settings → Plan to use it.';
  if (status === 403) return 'You don’t have permission to do that. Ask your workspace owner if you need access.';
  if (status === 404) return 'We couldn’t find that. It may have been deleted.';
  if (status === 409) return 'That clashes with something that already exists. Refresh the page and try again.';
  if (status === 413) return 'That file is too large.';
  if (status === 429) return 'You’re going a bit fast. Please wait a minute and try again.';
  if (status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
  if (status >= 400) return 'That didn’t work. Please check what you entered and try again.';
  return GENERIC;
}

function forTechnical(msg) {
  if (/Network ?Error|Failed to fetch|Load failed|NetworkError when attempting|ERR_NETWORK|ERR_INTERNET/i.test(msg)) {
    return typeof navigator !== 'undefined' && navigator.onLine === false ? OFFLINE : UNREACHABLE;
  }
  if (/timeout of \d+ms exceeded|ETIMEDOUT|ECONNABORTED/i.test(msg)) return 'That took too long. Please try again.';
  const code = msg.match(/status code (\d{3})|^HTTP (\d{3})|^(\d{3})\b/);
  if (code) return byStatus(Number(code[1] || code[2] || code[3]));
  return GENERIC;
}

/** Keep a sentence; replace anything technical with one. */
export function plainMessage(text) {
  if (text == null || text === '') return text;
  const s = String(text);
  return looksTechnical(s) ? forTechnical(s) : s;
}

/** A sentence for any error shape: axios error, fetch error, Error, or string. */
export function friendlyMessage(err) {
  if (!err) return GENERIC;
  if (typeof err === 'string') return plainMessage(err);
  const res = err.response;
  if (res) {
    const d = res.data;
    const msg = d && typeof d === 'object' ? (typeof d.error === 'string' ? d.error : typeof d.message === 'string' ? d.message : '') : '';
    if (msg && !looksTechnical(msg)) return msg;
    return byStatus(res.status);
  }
  if (err.code === 'ECONNABORTED' || /timeout of \d+ms exceeded/i.test(err.message || '')) return 'That took too long. Please try again.';
  if (err.request && !err.response) return typeof navigator !== 'undefined' && navigator.onLine === false ? OFFLINE : UNREACHABLE;
  return plainMessage(err.message || '') || GENERIC;
}

/** fetch() rejects with "Failed to fetch" / "Load failed" on network trouble; give it a sentence. */
export function installFetchFriendlyErrors() {
  if (typeof window === 'undefined' || window.__wfFriendlyFetch) return;
  window.__wfFriendlyFetch = true;
  const orig = window.fetch.bind(window);
  window.fetch = (...args) => orig(...args).catch((e) => {
    if (e && e.name !== 'AbortError' && looksTechnical(e.message)) {
      try { e.message = friendlyMessage(e.message); } catch { /* read-only message: leave it */ }
    }
    throw e;
  });
}
