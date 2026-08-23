'use client';

// PublicBrandMark — the studio's logo (or, failing that, their initial) on the pages
// their clients see.
//
// Phase 8. Four public pages each hand-rolled the same 44px accent-coloured box with
// the first letter of the studio name in it, and none of them rendered company_logo -
// which had existed in company_settings since the beginning and was shown on exactly
// one screen: the studio's own settings page. Their clients never saw it.
//
// Renders NOTHING when there is no brand at all. A placeholder mark asserts an
// identity that isn't the studio's, which is worse than an honest gap.

export default function PublicBrandMark({ brand, size = 44, radius = 12, style }) {
  const name = brand?.name || null;
  const logo = brand?.logo || null;
  const accent = brand?.accent || 'var(--accent)';
  if (!logo && !name) return null;

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- studio logos are dynamic URLs
      <img
        src={logo}
        alt={name || 'Studio logo'}
        style={{ height: size, maxWidth: size * 3.2, objectFit: 'contain', display: 'block', ...style }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: radius, background: accent,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 900, fontSize: Math.round(size * 0.45), flexShrink: 0,
        ...style,
      }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}
