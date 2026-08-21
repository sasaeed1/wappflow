'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Portal, useOverlayStack, useEscape, useScrollLock, useFocusTrap } from './overlay';

// Drawer — edge-anchored panel (Phase 2 shell foundation).
//
// Batch C deliberately declared drawers out of scope and left the seam in overlay.js.
// The shell's mobile navigation IS a drawer, so this is where that debt comes due:
// today NavBar hand-rolls one with no focus trap, no Escape, and no scroll lock — Tab
// walks straight out of the open menu into the page behind it. Built on the same
// overlay hooks as Modal, so it inherits all three for free.
//
//   <Drawer open={open} onClose={close} side="right" title="Menu">…</Drawer>
//
// Rides --z-overlay (below --z-modal) so a modal opened FROM a drawer still covers it.

export default function Drawer({
  open,
  onClose,
  side = 'right',
  width = 280,
  title,
  dismissable = true,
  children,
}) {
  const [panelEl, setPanelEl] = useState(null);
  const isTop = useOverlayStack(open);
  useScrollLock(open);
  useEscape(open, isTop, dismissable ? () => onClose?.() : null);
  useFocusTrap(panelEl, open);

  if (!open) return null;

  return (
    <Portal>
      <div
        className="wf-drawer-backdrop"
        onMouseDown={(e) => { if (dismissable && isTop && e.target === e.currentTarget) onClose?.(); }}
      >
        <div
          ref={setPanelEl}
          role="dialog"
          aria-modal="true"
          aria-label={title || 'Navigation'}
          className="wf-drawer-panel"
          style={{ width, [side]: 0 }}
        >
          {title && (
            <div className="wf-drawer-head">
              <span className="wf-drawer-title">{title}</span>
              {dismissable && (
                <button type="button" className="wf-drawer-x" onClick={() => onClose?.()} aria-label="Close menu">
                  <X size={17} />
                </button>
              )}
            </div>
          )}
          <div className="wf-drawer-body">{children}</div>
        </div>

        <style>{`
          .wf-drawer-backdrop {
            position: fixed; inset: 0; z-index: var(--z-overlay);
            background: var(--overlay-bg);
            animation: wf-drawer-fade var(--dur) var(--ease);
          }
          @keyframes wf-drawer-fade { from { opacity: 0; } to { opacity: 1; } }
          .wf-drawer-panel {
            position: fixed; top: 0; bottom: 0;
            display: flex; flex-direction: column;
            background: var(--surface);
            border-left: 1px solid var(--border);
            box-shadow: var(--elev-3);
            outline: none;
            animation: wf-drawer-in var(--dur-slow) var(--ease);
          }
          @keyframes wf-drawer-in { from { transform: translateX(100%); } to { transform: translateX(0); } }
          .wf-drawer-head {
            display: flex; align-items: center; justify-content: space-between;
            padding: 16px 18px; border-bottom: 1px solid var(--border);
          }
          .wf-drawer-title { font-size: var(--fs-body); font-weight: var(--fw-bold); color: var(--text); }
          .wf-drawer-x {
            background: var(--surface2); border: 1px solid var(--border); color: var(--text-dim);
            width: 30px; height: 30px; border-radius: var(--radius-sm);
            display: grid; place-items: center; cursor: pointer;
          }
          .wf-drawer-body { flex: 1; overflow-y: auto; padding: 12px; }
        `}</style>
      </div>
    </Portal>
  );
}
