'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// VirtualList — window-scroll list virtualization (Phase 4).
//
// The leads list rendered EVERY row of an all-leads fetch — thousands of DOM nodes,
// re-created on every state change, which is the audit's "god-page" class in one
// line. This renders only the rows in (and near) the viewport, with spacer blocks
// holding the scroll geometry, so the page scrollbar and Ctrl+F-era instincts keep
// working — no inner scroll container, no library.
//
//   <VirtualList items={leads} rowHeight={64} overscan={8}
//     renderRow={(lead, i) => <Row … />} />
//
// DELIBERATE CONSTRAINTS, stated rather than discovered:
//   • rowHeight is fixed. The consuming lists (leads/invoices) render uniform rows
//     with single-line ellipsis cells, so this holds; variable-height content needs
//     a measuring virtualizer, which is a different, much heavier component.
//   • Below `threshold` items it renders everything — virtualization overhead is a
//     net loss on a list of forty, and small lists keep exact today-behaviour.

export default function VirtualList({
  items,
  rowHeight,
  renderRow,
  overscan = 8,
  threshold = 120,
  style,
}) {
  const hostRef = useRef(null);
  const [range, setRange] = useState({ start: 0, end: threshold });
  const frame = useRef(0);

  const measure = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const viewTop = -rect.top;                       // how far the host is above the viewport top
    const viewH = window.innerHeight;
    const start = Math.max(0, Math.floor(viewTop / rowHeight) - overscan);
    const end = Math.min(items.length, Math.ceil((viewTop + viewH) / rowHeight) + overscan);
    // functional update so the scroll handler never closes over a stale range
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
  }, [items.length, rowHeight, overscan]);

  useEffect(() => {
    if (items.length <= threshold) return;           // small list: no listeners at all
    const onScroll = () => {
      // Timer throttle (~1 frame), NOT requestAnimationFrame: rAF never fires while a
      // document is hidden, which made the windowing silently stop updating in any
      // hidden/backgrounded context — including the test harness that caught this.
      // setTimeout behaves the same for a visible user and stays verifiable.
      if (frame.current) return;
      frame.current = setTimeout(() => { frame.current = 0; measure(); }, 16);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame.current) clearTimeout(frame.current);
    };
  }, [items.length, threshold, measure]);

  if (items.length <= threshold) {
    return <div style={style}>{items.map((item, i) => renderRow(item, i))}</div>;
  }

  const start = Math.min(range.start, items.length);
  const end = Math.min(range.end, items.length);

  return (
    <div ref={hostRef} style={style}>
      {/* spacers preserve total height so the page scrollbar stays honest */}
      {start > 0 && <div aria-hidden="true" style={{ height: start * rowHeight }} />}
      {items.slice(start, end).map((item, i) => renderRow(item, start + i))}
      {end < items.length && <div aria-hidden="true" style={{ height: (items.length - end) * rowHeight }} />}
    </div>
  );
}
