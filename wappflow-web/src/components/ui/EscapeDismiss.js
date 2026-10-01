'use client';

import { useEffect } from 'react';
import { openOverlayCount } from './overlay';

// Escape closes the top-most hand-rolled pop-up.
//
// The Modal / Drawer / Sheet / confirm primitives handle Escape themselves (on
// the shared overlay stack). About thirty older pop-ups are hand-rolled — a fixed
// full-screen backdrop whose onClick closes it — and most of them could only be
// closed with the mouse, which is the "pop-ups feel unnatural" complaint in one
// keystroke. Each of those backdrops carries `data-dismiss`; on Escape this
// clicks the LAST one in the document (the one painted on top), exactly as if
// the backdrop itself had been clicked. Mounted once, in providers.js.
export default function EscapeDismiss() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (openOverlayCount() > 0) return;          // a primitive overlay owns this Escape
      const all = document.querySelectorAll('[data-dismiss]');
      const top = all[all.length - 1];
      if (!top) return;
      e.preventDefault();
      top.click();                                  // target === the backdrop, as a real click would be
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
