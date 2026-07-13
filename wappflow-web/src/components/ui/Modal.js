'use client';

import { useState, useRef, useCallback, useId } from 'react';
import { X } from 'lucide-react';
import { Portal, useOverlayStack, useEscape, useScrollLock, useFocusTrap } from './overlay';
// (useFocusTrap takes the card ELEMENT via callback ref — see overlay.js for why)

// Modal — the overlay PRIMITIVE (PROP-002 Batch C). Centered card dialogs only:
// drawers, popovers, tooltips, palettes, and full-page takeovers are explicitly
// NOT this component. Built on components/ui/overlay.js, so it gets focus trap +
// restore, Escape (top-of-stack only), reference-counted scroll lock, and portal
// rendering for free — and nested Modals stack naturally by DOM order on the one
// --z-modal rung.
//
//   <Modal open={modal.isOpen} onClose={modal.close} title="Send invoice" size="sm"
//          footer={<><Button onClick={modal.close}>Cancel</Button>
//                   <Button variant="primary" onClick={send}>Send</Button></>}>
//     …body…
//   </Modal>
//
// dismissable={false} disables backdrop-close AND Escape-close (live calls, wizards,
// destructive flows) — the X button is also hidden; closing becomes the owner's job.

const SIZE = { sm: 440, md: 600, lg: 780 };

export default function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  dismissable = true,
  hideClose = false,
  padded = true, // false = body has no padding; for surfaces with their own internal chrome
  footer,
  children,
  labelledBy,
  describedBy,
  style,
}) {
  const uid = useId();
  const [cardEl, setCardEl] = useState(null);
  const isTop = useOverlayStack(open);
  useScrollLock(open);
  useEscape(open, isTop, dismissable ? () => onClose?.('dismissed') : null);
  useFocusTrap(cardEl, open);

  if (!open) return null;

  const titleId = labelledBy || (title ? `${uid}-title` : undefined);
  const descId = describedBy || (description ? `${uid}-desc` : undefined);

  return (
    <Portal>
      <div
        className="wf-modal-backdrop"
        onMouseDown={(e) => {
          if (!dismissable || !isTop) return;
          if (e.target === e.currentTarget) onClose?.('dismissed');
        }}
      >
        <div
          ref={setCardEl}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="wf-modal-card"
          style={{ maxWidth: SIZE[size] || SIZE.md, ...style }}
        >
          {(title || (dismissable && !hideClose)) && (
            <div className="wf-modal-head">
              <div>
                {title && <div id={titleId} className="wf-modal-title">{title}</div>}
                {description && <div id={descId} className="wf-modal-desc">{description}</div>}
              </div>
              {dismissable && !hideClose && (
                <button
                  type="button"
                  className="wf-modal-close"
                  onClick={() => onClose?.('dismissed')}
                  aria-label="Close dialog"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          <div className="wf-modal-body" style={padded ? undefined : { padding: 0 }}>{children}</div>

          {footer && <div className="wf-modal-foot">{footer}</div>}
        </div>

        <style>{`
          .wf-modal-backdrop {
            position: fixed; inset: 0; z-index: var(--z-modal);
            background: var(--overlay-bg);
            backdrop-filter: blur(var(--overlay-blur));
            -webkit-backdrop-filter: blur(var(--overlay-blur));
            display: flex; align-items: center; justify-content: center;
            padding: 20px;
            animation: wf-modal-fade var(--dur) var(--ease);
          }
          @keyframes wf-modal-fade { from { opacity: 0; } to { opacity: 1; } }

          .wf-modal-card {
            width: 100%;
            max-height: 90vh;
            display: flex; flex-direction: column;
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            color: var(--text);
            box-shadow: var(--elev-3);
            animation: wf-modal-pop var(--dur-slow) var(--ease-spring);
            outline: none;
          }
          @keyframes wf-modal-pop {
            from { opacity: 0; transform: scale(0.95) translateY(8px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }

          .wf-modal-head {
            display: flex; align-items: flex-start; justify-content: space-between;
            gap: 12px;
            padding: 20px 24px 0;
          }
          .wf-modal-title {
            font-size: var(--fs-h3); font-weight: var(--fw-bold);
            letter-spacing: -0.01em;
          }
          .wf-modal-desc {
            margin-top: 4px;
            font-size: var(--fs-body-sm); color: var(--text-dim);
            line-height: 1.5;
          }
          .wf-modal-close {
            flex-shrink: 0;
            background: var(--surface2);
            border: 1px solid var(--border);
            color: var(--text-dim);
            width: 28px; height: 28px;
            border-radius: var(--radius-sm);
            display: grid; place-items: center;
            cursor: pointer;
            transition: background var(--dur), color var(--dur);
          }
          .wf-modal-close:hover { background: var(--border); color: var(--text); }

          .wf-modal-body {
            padding: 16px 24px;
            overflow-y: auto;
            font-size: var(--fs-body);
            line-height: 1.55;
          }

          .wf-modal-foot {
            display: flex; justify-content: flex-end; align-items: center;
            gap: 10px;
            padding: 0 24px 20px;
          }
        `}</style>
      </div>
    </Portal>
  );
}

/**
 * useModal — the standard modal lifecycle helper (replaces scattered useState pairs).
 *
 *   const modal = useModal();
 *   modal.open(); modal.close(); modal.toggle();
 *   <Modal open={modal.isOpen} onClose={modal.close} …>
 *
 * Promise seam (architecture-compatible, not over-built): open() returns a Promise
 * that resolves when the modal closes — close('confirmed') / close('cancelled') /
 * close() → 'dismissed'. Callers that don't await lose nothing.
 */
export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const resolver = useRef(null);

  const open = useCallback(() => {
    setIsOpen(true);
    return new Promise((resolve) => { resolver.current = resolve; });
  }, []);

  const close = useCallback((result = 'dismissed') => {
    setIsOpen(false);
    // React synthetic events pass the event object — coerce anything non-string.
    const value = typeof result === 'string' ? result : 'dismissed';
    resolver.current?.(value);
    resolver.current = null;
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((v) => {
      if (v) { resolver.current?.('dismissed'); resolver.current = null; }
      return !v;
    });
  }, []);

  return { isOpen, open, close, toggle };
}
