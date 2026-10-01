'use client';

import { useState, useRef, Fragment } from 'react';
import { Portal, useOverlayStack, useEscape, useScrollLock, useFocusTrap } from './overlay';

// Sheet — a bottom sheet for phones (the Instagram / Snapchat pattern).
//
// Full-screen mobile surfaces (Studio culling, the reel editor) keep the photo or
// video as the whole screen and push every secondary control — filters, AI info,
// clip settings, track tools — into a sheet that rises from the bottom, within
// thumb reach, and goes away again. Built on the same overlay hooks as Modal and
// Drawer, so Escape, focus trapping and scroll locking come for free.
//
//   <Sheet open={open} onClose={close} title="Filter">…</Sheet>
//
// `inline` renders in place instead of portalling to <body>, so a sheet opened
// inside a themed scope (Studio's .ms-root tokens) keeps those tokens.
//
// Drag the grab handle down (or tap the scrim) to dismiss. `tone="dark"` is the
// default because the surfaces that use it are dark canvases; `tone="app"` takes
// the app's own surface tokens.
//
// Rides --z-modal: it opens from surfaces that already sit above the app shell.

export default function Sheet({
  open,
  onClose,
  title,
  action,            // optional node rendered at the right of the title row
  tone = 'dark',
  maxHeight = '78vh',
  inline = false,
  children,
}) {
  const [panelEl, setPanelEl] = useState(null);
  const [dragY, setDragY] = useState(0);
  const drag = useRef(null);
  const isTop = useOverlayStack(open);
  useScrollLock(open);
  useEscape(open, isTop, () => onClose?.());
  useFocusTrap(panelEl, open);

  if (!open) return null;

  // Pull-down-to-dismiss on the handle row only, so sliders and scrolling lists
  // inside the sheet keep their own gestures.
  const onDown = (e) => { drag.current = { y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => { if (drag.current) setDragY(Math.max(0, e.clientY - drag.current.y)); };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dragY > 90) onClose?.();
    setDragY(0);
  };

  const Wrap = inline ? Fragment : Portal;
  return (
    <Wrap>
      <div
        className={`wf-sheet-scrim wf-sheet-${tone}`}
        onMouseDown={(e) => { if (isTop && e.target === e.currentTarget) onClose?.(); }}
      >
        <div
          ref={setPanelEl}
          role="dialog"
          aria-modal="true"
          aria-label={title || 'Options'}
          className="wf-sheet"
          style={{ maxHeight, transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? 'none' : undefined }}
        >
          <div className="wf-sheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
            <span aria-hidden="true" />
          </div>
          {(title || action) && (
            <div className="wf-sheet-head">
              {title && <span className="wf-sheet-title">{title}</span>}
              {action}
            </div>
          )}
          <div className="wf-sheet-body">{children}</div>
        </div>

        <style>{`
          .wf-sheet-scrim {
            position: fixed; inset: 0; z-index: var(--z-modal);
            background: rgba(0,0,0,0.45);
            display: flex; align-items: flex-end; justify-content: center;
            animation: wf-sheet-fade .18s ease;
          }
          @keyframes wf-sheet-fade { from { opacity: 0; } to { opacity: 1; } }
          .wf-sheet {
            width: 100%; max-width: 560px;
            display: flex; flex-direction: column;
            border-radius: 22px 22px 0 0;
            padding-bottom: env(safe-area-inset-bottom, 0px);
            outline: none;
            animation: wf-sheet-up .26s cubic-bezier(.2,.8,.2,1);
            transition: transform .2s ease;
          }
          @keyframes wf-sheet-up { from { transform: translateY(100%); } to { transform: none; } }
          .wf-sheet-dark .wf-sheet {
            background: rgba(22,22,26,0.96); color: #f2f2f5;
            backdrop-filter: blur(24px) saturate(1.3);
            border-top: 1px solid rgba(255,255,255,0.08);
          }
          .wf-sheet-app .wf-sheet {
            background: var(--surface); color: var(--text);
            border-top: 1px solid var(--border);
          }
          .wf-sheet-grab { display: flex; justify-content: center; padding: 10px 0 6px; cursor: grab; touch-action: none; }
          .wf-sheet-grab span { width: 38px; height: 5px; border-radius: 99px; background: currentColor; opacity: 0.28; }
          .wf-sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 2px 20px 10px; }
          .wf-sheet-title { font-size: 16px; font-weight: 700; letter-spacing: -0.01em; }
          .wf-sheet-body { overflow-y: auto; overscroll-behavior: contain; padding: 4px 20px 20px; }
        `}</style>
      </div>
    </Wrap>
  );
}
