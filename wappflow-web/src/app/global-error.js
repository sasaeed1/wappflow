'use client';

// global-error.js is the ONLY boundary that catches a failure in the ROOT layout.
// When it renders, the root layout is gone — so this file must supply its own
// <html>/<body>, and it cannot rely on providers, the shell, or anything mounted
// above it. It also cannot use the token variables, because globals.css is imported
// by the root layout that just died: every colour here is a literal on purpose.
export default function GlobalError({ error, unstable_retry }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#0f1117', color: '#e2e8f0' }}>
        {/* metadata/generateMetadata are unsupported in global-error; React hoists this. */}
        <title>WappFlow — error</title>
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <div
              aria-hidden="true"
              style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(239,68,68,0.15)', color: '#f87171', display: 'grid', placeItems: 'center', margin: '0 auto 14px', fontSize: 24 }}
            >
              !
            </div>
            <h1 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>WappFlow could not start</h1>
            <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.55, margin: '8px 0 0' }}>
              Something failed before the app could load. Your data is safe — this is a display problem.
            </p>
            {error?.message && (
              <p style={{ fontSize: 12, color: '#64748b', margin: '10px 0 0', wordBreak: 'break-word' }}>{error.message}</p>
            )}
            <button
              onClick={() => unstable_retry()}
              style={{ marginTop: 18, padding: '10px 18px', borderRadius: 10, border: '1px solid #2a2d3e', background: '#1a1d27', color: '#e2e8f0', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
