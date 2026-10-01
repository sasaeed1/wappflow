'use client';

import { useEffect } from 'react';

/**
 * Keep the active item of a section side-nav visible.
 *
 * On phones the side-nav (.wf-sidenav, see globals.css) becomes a horizontal,
 * swipeable tab strip; picking a tab off to the right — or arriving on a deep
 * link like /settings?tab=tags — would otherwise leave the active tab scrolled
 * out of sight. Desktop is untouched: the vertical list doesn't scroll sideways.
 *
 *   const navRef = useRef(null);
 *   useScrollActiveIntoView(navRef, activeTab);
 *   <div ref={navRef} className="wf-sidenav"> … <button aria-current="page"> … </div>
 */
export function useScrollActiveIntoView(navRef, activeKey) {
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const el = nav.querySelector('[aria-current="page"]');
    if (!el) return;
    const left = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
  }, [navRef, activeKey]);
}
