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
// PHASE 8 — the deferred backend (D6) now exists. Every public endpoint returns a
// `brand` OBJECT from backend/public-brand.js: { name, logo, accent, website, email,
// phone, tagline }. This component takes that object whole.
//
// GRACEFUL FALLBACK IS STILL THE POINT: a studio that has uploaded nothing gets their
// name and an initial mark; a studio that has uploaded a logo gets the logo; a studio
// with neither gets the page's own title and NO mark at all — never a generic "W",
// because a placeholder mark asserts an identity that isn't theirs.

const TONE = {
  light: { bg: 'var(--glass)', border: 'var(--border)', text: 'var(--text)', meta: 'var(--text-muted)' },
  dark:  { bg: 'rgba(11,11,15,0.72)', border: '#1a1a22', text: '#fff', meta: '#9aa0aa' },
};

export default function PublicBrandHeader({
  brand,                 // { name, logo, accent, … } from the public-brand resolver
  title,                 // page/document/gallery title
  eyebrow,               // small label above the title
  meta,                  // right-hand slot (e.g. document type)
  tone = 'light',
  sticky = false,
  style,
}) {
  const t = TONE[tone] || TONE.light;
  const name = brand?.name || null;
  const logoUrl = brand?.logo || null;
  const accent = brand?.accent || 'var(--accent)';
  const initial = name ? name.trim().charAt(0).toUpperCase() : null;

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
        <img src={logoUrl} alt={name || ''} style={{ height: 26, maxWidth: 120, objectFit: 'contain', display: 'block' }} />
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
          {name || title || ''}
        </strong>
        {name && title && (
          <span style={{ fontSize: 12, color: t.meta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        )}
      </span>

      {meta && <span style={{ fontSize: 12.5, color: t.meta, flexShrink: 0, textTransform: 'capitalize' }}>{meta}</span>}
    </header>
  );
}
