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
  return (
    <footer style={{ textAlign: 'center', padding: '30px 20px 42px', fontSize: 12, color: t.text, ...style }}>
      {brand ? (
        <>
          <span style={{ fontWeight: 'var(--fw-semibold)' }}>{brand}</span>
          <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: t.soft }}>Powered by WappFlow</span>
        </>
      ) : (
        <span style={{ color: t.soft }}>Powered by WappFlow</span>
      )}
    </footer>
  );
}
