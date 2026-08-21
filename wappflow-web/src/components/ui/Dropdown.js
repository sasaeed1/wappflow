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
            position: 'absolute', top: 'calc(100% + 8px)', [align]: 0,
            minWidth: width, zIndex: 'var(--z-dropdown)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', boxShadow: 'var(--elev-3)', padding: 6,
            ...panelStyle,
          }}
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
