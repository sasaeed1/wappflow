'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { useOverlayStack, useEscape } from './overlay';

// Dropdown — anchored menu primitive (Phase 2 shell foundation).
//
// Replaces SEVEN hand-rolled copies of the same thing (NavBar notifications + user
// menu, StudioShell waffle + user menu, ContractsStudioShell user menu, AppSwitcher
// panel, ControlShell search flyout). Every one re-implemented the same
// document-mousedown-outside listener and none handled Escape or the overlay stack.
//
//   <Dropdown trigger={(props) => <button {...props}>Menu</button>} align="right">
//     {(close) => <><MenuItem onClick={() => { close(); go(); }}>…</MenuItem></>}
//   </Dropdown>
//
// NOT portaled, unlike Modal/Toast: a menu is anchored to its trigger, and portaling
// would cost us that positioning for no benefit — the shell's own stacking context is
// the nav bar, which sits on --z-sticky, and the menu rides --z-dropdown above it.
// Escape only closes when this is the TOP overlay, so a menu inside a modal peels first.

export function MenuItem({ icon: Icon, children, tone, ...rest }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '9px 11px', borderRadius: 'var(--radius-sm)', border: 'none',
        background: hover ? 'var(--surface2)' : 'transparent',
        color: tone === 'danger' ? 'var(--danger-fg)' : 'var(--text)',
        fontSize: 'var(--fs-body-sm)', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
        transition: 'background var(--dur)',
      }}
      {...rest}
    >
      {Icon && <Icon size={14} aria-hidden="true" />}
      {children}
    </button>
  );
}

export default function Dropdown({
  trigger,              // (props) => ReactNode — props carry the a11y wiring + onClick
  children,             // ReactNode | (close) => ReactNode
  align = 'right',      // which edge of the trigger the panel aligns to
  width = 200,
  label = 'Menu',
  panelStyle,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const uid = useId();
  const isTop = useOverlayStack(open);
  useEscape(open, isTop, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // ── Viewport fitting ───────────────────────────────────────────────────────
  // This menu had NO viewport awareness: `top: calc(100% + 8px)` and nothing
  // else. A menu longer than the space beneath its trigger simply ran off the
  // bottom of the screen with no scrollbar and no way to reach the last item —
  // and it never flipped up, so a trigger low on the page was unusable. On a
  // short viewport (the owner's is 503px tall — 1080p at 150% scaling) that is
  // most menus, which is what "popups feel glitchy" actually was.
  //
  // Measured on open and kept correct on scroll/resize: pick the side with more
  // room, cap the height to what is actually there, and let the menu scroll
  // inside itself. GAP keeps it off the fixed nav and the window edge instead of
  // sitting flush against them.
  const GAP = 12;
  const MIN_USABLE = 140;   // below this a flip is better than a stub of a menu
  const [fit, setFit] = useState({ side: 'bottom', maxHeight: null });

  useEffect(() => {
    if (!open) return;
    const el = wrapRef.current;
    if (!el) return;

    const measure = () => {
      const r = el.getBoundingClientRect();
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--shell-h')) || 0;
      const below = window.innerHeight - r.bottom - GAP * 2;
      // The fixed shell is the real ceiling, not y=0 — a menu tucked under the
      // nav bar is exactly the "no gap from the nav" complaint.
      const above = r.top - navH - GAP * 2;
      const side = (below >= MIN_USABLE || below >= above) ? 'bottom' : 'top';
      setFit({ side, maxHeight: Math.max(MIN_USABLE, Math.floor(side === 'bottom' ? below : above)) });
    };

    measure();
    // capture:true — the scroll that matters is usually an inner container's,
    // and those do not bubble.
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {trigger({
        onClick: () => setOpen((v) => !v),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? `${uid}-menu` : undefined,
      })}
      {open && (
        <div
          id={`${uid}-menu`}
          role="menu"
          aria-label={label}
          style={{
            position: 'absolute',
            // Flips to `bottom` when there is more room above the trigger.
            ...(fit.side === 'bottom'
              ? { top: 'calc(100% + 8px)' }
              : { bottom: 'calc(100% + 8px)' }),
            [align]: 0,
            minWidth: width, zIndex: 'var(--z-dropdown)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--elev-3)', padding: 6,
            // Scroll INSIDE the menu rather than off the end of the window.
            maxHeight: fit.maxHeight ?? undefined,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            ...panelStyle,
          }}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
