'use strict';
// ════════════════════════════════════════════════════════════════════════════
//  public-brand — who the client is actually dealing with.
//
//  Phase 8. A studio pays for this product and then every surface their client
//  touches — the gallery of their photographs, the contract they sign, the page
//  where they pay — was branded WappFlow or branded nothing. company_logo has
//  existed in company_settings since the beginning and was rendered on exactly
//  one screen: the studio's own settings page. The client never saw it.
//
//  Six public endpoints each answered the brand question differently: three
//  returned a bare name string, one returned a letterhead URL, two returned
//  nothing at all. This is the single resolver they all use now, so a studio
//  that uploads a logo sees it everywhere at once instead of on whichever pages
//  someone remembered to wire up.
//
//  The shape is deliberately small and stable — public pages are cached and
//  shared, so this is a contract with the outside world, not an internal blob.
//  It carries NOTHING that is not meant for a stranger's eyes: no ids, no
//  counts, no settings. A capability token is the only credential on these
//  pages, so anything added here is effectively public.
// ════════════════════════════════════════════════════════════════════════════

const EMPTY = Object.freeze({
  name: null, logo: null, accent: null, website: null, email: null, phone: null, tagline: null,
});

/** Absolute-ise an uploaded asset path. Stored as '/uploads/…'; a client's
 *  browser (and every Open Graph crawler) needs the full origin. */
function absolute(url, baseUrl) {
  if (!url) return null;
  const s = String(url).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
  if (!baseUrl) return null;                       // relative is useless off-site
  return `${String(baseUrl).replace(/\/+$/, '')}/${s.replace(/^\/+/, '')}`;
}

/** Only allow a colour we are willing to interpolate into a style attribute.
 *  brand.accent is rendered into inline CSS on public pages, so an unvalidated
 *  value is a CSS-injection foothold on a page a stranger can reach. */
function safeColor(v) {
  const s = String(v || '').trim();
  return /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(s) ? s : null;
}

/**
 * Resolve the studio identity shown to clients on public pages.
 *
 * @param {object}  db          better-sqlite3 handle
 * @param {string}  workspaceId the workspace whose brand to resolve
 * @param {string}  baseUrl     public origin, for absolute asset URLs (FRONTEND_URL)
 * @returns {{name, logo, accent, website, email, phone, tagline}}
 */
function publicBrand(db, workspaceId, baseUrl = '') {
  if (!workspaceId) return { ...EMPTY };
  try {
    // Brand lives on the OWNER's company_settings row — the workspace's identity
    // is the studio's identity, not whichever member happened to act.
    const owner = db.prepare(
      "SELECT user_id FROM workspace_members WHERE workspace_id = ? AND role = 'super_admin' LIMIT 1"
    ).get(workspaceId);
    if (!owner) return { ...EMPTY };

    const cs = db.prepare(
      'SELECT company_name, company_logo, company_website, company_email, company_phone, brand_accent, brand_tagline FROM company_settings WHERE user_id = ?'
    ).get(owner.user_id);
    if (!cs) return { ...EMPTY };

    return {
      name: cs.company_name || null,
      logo: absolute(cs.company_logo, baseUrl),
      accent: safeColor(cs.brand_accent),
      website: cs.company_website || null,
      email: cs.company_email || null,
      phone: cs.company_phone || null,
      tagline: cs.brand_tagline || null,
    };
  } catch {
    // Never fail a client-facing page over branding.
    return { ...EMPTY };
  }
}

/** Ensure the brand columns exist. company_settings is owned by server.js; these
 *  two are additive and idempotent, declared here beside their only reader. */
function ensureBrandColumns(db) {
  for (const c of ['brand_accent TEXT', 'brand_tagline TEXT']) {
    try { db.exec(`ALTER TABLE company_settings ADD COLUMN ${c}`); } catch { /* exists */ }
  }
}

/**
 * Where a client can go next.
 *
 * Every conversion point in the product was a dead end: "Payment received",
 * "Thanks for signing", "You're booked" — then nothing. The client closed the
 * tab, and the next thing the studio wanted them to do (pick a date, see their
 * gallery, order prints) depended on the studio remembering to message them.
 *
 * Returns only links that actually exist, so a caller can render whatever it
 * gets without checking for empty studios.
 *
 * @returns {{portal: string|null, book: string|null}}
 */
function journeyLinks(db, workspaceId, leadId, baseUrl = '') {
  const out = { portal: null, book: null };
  if (!workspaceId) return out;
  const rel = (p) => (baseUrl ? `${String(baseUrl).replace(/\/+$/, '')}${p}` : p);
  try {
    if (leadId) {
      const p = db.prepare('SELECT token FROM client_portals WHERE lead_id = ? AND workspace_id = ?').get(leadId, workspaceId);
      if (p?.token) out.portal = rel(`/client/${p.token}`);
    }
  } catch { /* portal is optional */ }
  try {
    const bs = db.prepare('SELECT slug FROM booking_settings WHERE workspace_id = ?').get(workspaceId);
    if (bs?.slug) out.book = rel(`/book/${bs.slug}`);
  } catch { /* booking page is optional */ }
  return out;
}

module.exports = { publicBrand, journeyLinks, ensureBrandColumns, absolute, safeColor };
