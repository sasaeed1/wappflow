'use client';

// ════════════════════════════════════════════════════════════════════════════
//  HTML sanitiser — the one place untrusted HTML is made safe to render.
//
//  WHY THIS EXISTS AS A SHARED MODULE: an identical sanitiser lived inside
//  app/chat/page.js and was used there correctly, while the lead page rendered
//  INBOUND EMAIL BODIES raw:
//
//      <div dangerouslySetInnerHTML={{ __html: em.body || '' }} />
//
//  An inbound email is attacker-controlled by definition — anyone who knows a
//  studio's connected address can send one. That is stored XSS in an
//  authenticated CRM session: a single <img onerror> could read the session
//  token out of localStorage and walk the entire workspace through the API.
//  A sanitiser that exists in one file and is forgotten in another is the same
//  class of bug as three copies of a WhatsApp type mapping that disagreed.
//
//  HARDENING over the original: parsing happens in an INERT document produced by
//  DOMParser, not by assigning innerHTML on a div belonging to the live one.
//  Assigning innerHTML constructs real elements — an <img src=x onerror=…> can
//  begin loading and fire its handler during parsing, BEFORE the sanitiser walks
//  the tree and replaces it. A DOMParser document does not load resources and
//  does not run scripts, so nothing can execute while we are still deciding
//  whether to allow it.
//
//  STRATEGY: allowlist. Anything not named here is replaced by its text content,
//  so the message stays readable and nothing unknown is ever rendered. Every
//  attribute is dropped except href on <a>, restricted to http/https/mailto —
//  which is what blocks javascript: URLs and every on* handler at once.
// ════════════════════════════════════════════════════════════════════════════

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'BR', 'P', 'DIV', 'SPAN',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'A',
  // Email-specific structure. Without these an HTML email collapses into one
  // run-on paragraph, which is why the lead page rendered raw in the first place.
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'HR',
]);

const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

/**
 * @param {string} html untrusted HTML
 * @returns {string} HTML safe to pass to dangerouslySetInnerHTML
 */
export function sanitizeHtml(html) {
  if (!html) return '';
  // SSR has no DOM. Returning the input would render it unsanitised on the
  // server pass, so return nothing and let the client render the safe version.
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return '';

  let doc;
  try {
    doc = new DOMParser().parseFromString(String(html), 'text/html');
  } catch {
    return '';
  }
  if (!doc || !doc.body) return '';

  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        if (!ALLOWED_TAGS.has(child.tagName)) {
          // Text content, not removal: the words of a <font> or <table> wrapper
          // are the message. Dropping the node would delete the email.
          node.replaceChild(doc.createTextNode(child.textContent || ''), child);
          continue;
        }
        for (const attr of Array.from(child.attributes || [])) {
          const keepHref = child.tagName === 'A' && attr.name.toLowerCase() === 'href' && SAFE_HREF.test(attr.value.trim());
          if (!keepHref) child.removeAttribute(attr.name);
        }
        if (child.tagName === 'A') {
          // A link in an email points somewhere we do not control.
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noreferrer noopener nofollow');
        }
        walk(child);
      } else if (child.nodeType !== 3) {
        // Comments, CDATA, processing instructions — conditional comments are a
        // known IE-era XSS vector and carry nothing worth showing.
        node.removeChild(child);
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

export default sanitizeHtml;
