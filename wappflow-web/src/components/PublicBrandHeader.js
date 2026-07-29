'use client';

// PublicBrandHeader — the studio's identity on the pages their clients actually see
// (PROP-002 Batch F).
//
// The defect it closes: today a client signing a contract at /d sees a hardcoded "W"
// mark in WappFlow's sky→indigo gradient, with the literal string "WappFlow" as the
// name fallback; the /g gallery names the photographer nowhere at all. The studio pays
// for the product and their client never learns who delivered the work.
//
//   <PublicBrandHeader brand={data.brand} meta="Proposal" sticky />
//   <PublicBrandHeader brand={data.brand} tone="dark" title={data.title} />
//
// GRACEFUL FALLBACK IS THE POINT (owner decision D6 deferred the backend that will serve
// real brand data): with no `brand` it renders the page's own title alone and suppresses
// the mark entirely — never a generic "W", because a placeholder mark asserts an identity
// that isn't the studio's. `logoUrl` and `brandColor` are the seam the follow-up proposal
// fills; both are optional and unused by every caller today.

const TONE = {
  light: { bg: 'var(--glass)', border: 'var(--border)', text: 'var(--text)', meta: 'var(--text-muted)' },
  dark:  { bg: 'rgba(11,11,15,0.72)', border: '#1a1a22', text: '#fff', meta: '#9aa0aa' },
};

export default function PublicBrandHeader({
  brand,                 // the studio's name — absent until the deferred endpoints land
  logoUrl,               // seam: real logo (unused today)
  brandColor,            // seam: the studio's accent (unused today) — falls back to --accent
  title,                 // page/document/gallery title
  eyebrow,               // small label above the title
  meta,                  // right-hand slot (e.g. document type)
  tone = 'light',
  sticky = false,
  style,
}) {
  const t = TONE[tone] || TONE.light;
  const accent = brandColor || 'var(--accent)';
  const initial = brand ? String(brand).trim().charAt(0).toUpperCase() : null;

  return (
    <header
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 20px',
        background: t.bg,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${t.border}`,
        ...(sticky ? { position: 'sticky', top: 0, zIndex: 'var(--z-sticky)' } : null),
        ...style,
      }}
    >
      {/* The mark renders ONLY with a real brand — no placeholder identity. */}
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- studio logos are dynamic URLs
        <img src={logoUrl} alt={brand || ''} style={{ height: 26, maxWidth: 120, objectFit: 'contain', display: 'block' }} />
      ) : initial ? (
        <span
          aria-hidden="true"
          style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            background: accent, color: 'var(--on-accent)',
            display: 'grid', placeItems: 'center',
            fontWeight: 'var(--fw-bold)', fontSize: 13,
          }}
        >
          {initial}
        </span>
      ) : null}

      <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {eyebrow && (
          <span style={{ fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.meta, fontWeight: 'var(--fw-semibold)' }}>
            {eyebrow}
          </span>
        )}
        <strong style={{ fontSize: 14, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {brand || title || ''}
        </strong>
        {brand && title && (
          <span style={{ fontSize: 12, color: t.meta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        )}
      </span>

      {meta && <span style={{ fontSize: 12.5, color: t.meta, flexShrink: 0, textTransform: 'capitalize' }}>{meta}</span>}
    </header>
  );
}
