'use client';

import { useEffect } from 'react';

// PublicScope — pins a public token page to the fixed-light palette (PROP-002 Batch F).
//
// Drop it anywhere inside a public route. It adds `wf-public` to <html>, which is the
// ONLY placement that works: confirm/Toast/Modal render through
// createPortal(children, document.body), so a wrapper class would never reach them —
// and neither would <body>'s background or the scrollbar chrome. The class is removed
// on unmount, otherwise navigating from /book back into the app leaves the whole
// dashboard stuck light.
//
// Render the same className on your page wrapper too, so server-rendered content is
// already light on first paint (the <html> class only lands after hydration).
//
//   <div className="wf-public" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
//     <PublicScope />
//     …
//   </div>
//
// NOT for the deliberately dark public surfaces (/g gallery, /d executive theme) —
// those take PublicBrandHeader/PublicFooter with tone="dark" and keep their own palette.

export default function PublicScope() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add('wf-public');
    return () => el.classList.remove('wf-public');
  }, []);
  return null;
}
