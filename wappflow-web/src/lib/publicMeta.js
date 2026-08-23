// publicMeta — per-studio link previews for the pages clients actually share.
//
// Phase 8 (audit client-portal-3). Every public link in the product previewed as
// the same generic WappFlow marketing card: paste a gallery of somebody's wedding
// into WhatsApp and the recipient saw "WappFlow — AI-powered customer operations.
// The AI-native WhatsApp CRM." The studio's own client had no idea the link was
// from their photographer, and the studio was advertising their supplier.
//
// These pages are client components, so they cannot export generateMetadata
// themselves. Each public route gets a thin server layout that calls this.
//
// Fetching happens SERVER-side at request time. It must never break the page:
// a crawler getting slightly stale or generic metadata is a cosmetic problem,
// a 500 on a client's gallery is not. Every failure path falls back silently.

const BASE = process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3001';

/** Fetch a public endpoint for metadata purposes only. Never throws. */
async function peek(path) {
  try {
    const res = await fetch(`${BASE}${path}`, {
      // Tells the API this is a PREVIEW, not a client opening the page. Without it
      // this fetch would mark contracts viewed, log gallery accesses and inflate
      // portfolio view counts every time a link was rendered.
      headers: { 'X-WF-Preview': '1' },
      // Link previews are re-fetched by crawlers constantly; a short cache keeps
      // that off the database without making a renamed gallery stale for long.
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Build Next metadata for a public studio page.
 *
 * @param {object} o
 * @param {string} o.path        public API path to read (e.g. `/api/media/portal/abc`)
 * @param {(d)=>string} o.title  page title from the payload
 * @param {(d,brandName)=>string} o.description
 * @param {string} o.fallbackTitle used when the record is gone or the API is down
 */
export async function studioMetadata({ path, title, description, fallbackTitle }) {
  const data = await peek(path);
  const brand = data?.brand || null;
  const studio = brand?.name || null;

  // A private page must not leak its contents into a link preview or a search
  // index. The token is the only credential, and tokens get forwarded.
  const robots = { index: false, follow: false };

  if (!data) {
    return { title: fallbackTitle, robots };
  }

  const pageTitle = (title ? title(data) : fallbackTitle) || fallbackTitle;
  const full = studio ? `${pageTitle} · ${studio}` : pageTitle;
  const desc = (description ? description(data, studio) : null) || undefined;
  const image = brand?.logo || undefined;

  return {
    // Overrides the root layout's '%s · WappFlow' template: the studio's name is
    // the one that belongs beside their client's gallery, not ours.
    title: { absolute: full },
    description: desc,
    robots,
    openGraph: {
      title: full,
      description: desc,
      siteName: studio || 'WappFlow',
      type: 'website',
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: full,
      description: desc,
      ...(image ? { images: [image] } : {}),
    },
  };
}
