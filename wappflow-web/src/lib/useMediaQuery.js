'use client';

import { useSyncExternalStore } from 'react';

/**
 * Live boolean for a CSS media query — `useMediaQuery('(max-width: 640px)')`.
 *
 * For the rare case where JS, not CSS, needs to know the layout: e.g. a
 * VirtualList's fixed rowHeight must match the row height the stylesheet gives
 * that row at the current breakpoint. Prefer plain CSS everywhere else.
 * Server render and first paint report `false` (the desktop layout).
 */
export function useMediaQuery(query) {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches),
    () => false,
  );
}
