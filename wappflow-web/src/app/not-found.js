import Link from 'next/link';

// Catches unmatched routes and any notFound() call. Shell-free on purpose: a 404 can
// be hit by a logged-out visitor, or by a client following a dead public link, and
// neither should be shown app navigation they cannot use.
export default function NotFound() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <p style={{ fontSize: 44, fontWeight: 800, margin: 0, color: 'var(--text-dim)', letterSpacing: '-0.02em' }}>404</p>
        <h1 style={{ fontSize: 19, fontWeight: 700, margin: '6px 0 0' }}>This page doesn’t exist</h1>
        <p style={{ fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.55, margin: '8px 0 0' }}>
          The link may be out of date, or the item may have been deleted.
        </p>
        {/* NOT /dashboard: that route is shell-guarded, so a logged-out visitor — or a
            studio's client following a dead gallery link — would be bounced straight to
            a login screen for a product they have no account for. Offer both doors. */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
          <Link
            href="/"
            style={{ padding: '10px 18px', borderRadius: 'var(--radius)', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}
          >
            Go to WappFlow
          </Link>
          <Link
            href="/login"
            style={{ padding: '10px 18px', borderRadius: 'var(--radius)', background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
