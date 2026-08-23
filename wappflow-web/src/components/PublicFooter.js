'use client';

// PublicFooter — one sign-off for the public pages (PROP-002 Batch F).
//
// Today three pages say "Powered by {brand}", the gallery says "Delivered with WappFlow
// Media Studio" (naming WappFlow and not the photographer), and shop/pay/d have no
// footer at all. This unifies them: the STUDIO is primary; the platform credit is the
// de-emphasised second line, kept separate so a future white-label entitlement can
// suppress it without touching the studio line.

const TONE = {
  light: { text: 'var(--text-dim)', soft: 'var(--text-muted)' },
  dark:  { text: '#9aa0aa', soft: '#52525b' },
};

export default function PublicFooter({ brand, tone = 'light', style }) {
  const t = TONE[tone] || TONE.light;
  // Takes the brand OBJECT from the public-brand resolver (Phase 8). The studio's
  // own contact details go here because this is the bottom of a page their client
  // is reading — the single most natural place to reach back to them.
  const name = brand?.name || null;
  const site = brand?.website || null;
  const mail = brand?.email || null;
  const href = site && !/^https?:\/\//i.test(site) ? `https://${site}` : site;
  return (
    <footer style={{ textAlign: 'center', padding: '30px 20px 42px', fontSize: 12, color: t.text, ...style }}>
      {name ? (
        <>
          <span style={{ fontWeight: 'var(--fw-semibold)' }}>{name}</span>
          {(href || mail) && (
            <span style={{ display: 'block', marginTop: 5, fontSize: 11.5 }}>
              {href && <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{site}</a>}
              {href && mail && <span style={{ opacity: 0.5 }}>{' · '}</span>}
              {mail && <a href={`mailto:${mail}`} style={{ color: 'inherit' }}>{mail}</a>}
            </span>
          )}
          <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: t.soft }}>Powered by WappFlow</span>
        </>
      ) : (
        <span style={{ color: t.soft }}>Powered by WappFlow</span>
      )}
    </footer>
  );
}
