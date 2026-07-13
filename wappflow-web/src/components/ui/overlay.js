'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Shared overlay infrastructure (PROP-002 Batch C). ONE foundation that Modal, Toast,
// and lib/confirm share today, and that future overlay primitives (Drawer, Popover,
// Tooltip, Command Palette, Dropdown) can adopt without a rewrite. Deliberately NOT an
// "Overlay Manager": no global controller, no context, no scheduling — just a portal,
// a stacking registry, and four composable hooks. Each primitive stays self-contained.
//
//   Portal           — SSR-safe portal to document.body
//   useOverlayStack  — registration order = stacking order; answers "am I on top?"
//                      (Escape and backdrop-close must only act on the TOP overlay)
//   useEscape        — Escape-to-close, wired through the stack
//   useScrollLock    — reference-counted body scroll lock (nested overlays safe)
//   useFocusTrap     — Tab/Shift+Tab cycle inside a container + focus restore to opener
//
// Stacking rule (Constitution/PROP-002): every overlay sits on its ladder rung
// (--z-modal, --z-toast, …); overlays on the SAME rung stack by DOM order. Never 1301.

export function Portal({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

// ── Overlay stack ───────────────────────────────────────────────────────────────────
let seq = 0;
const stack = [];
const stackSubs = new Set();
const notifyStack = () => stackSubs.forEach((fn) => fn());

/** Register while `active`; returns true only when this overlay is top of the stack. */
export function useOverlayStack(active) {
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = ++seq;
  const [isTop, setIsTop] = useState(false);

  useEffect(() => {
    if (!active) { setIsTop(false); return; }
    const id = idRef.current;
    stack.push(id);
    const check = () => setIsTop(stack[stack.length - 1] === id);
    stackSubs.add(check);
    notifyStack();
    return () => {
      const i = stack.indexOf(id);
      if (i !== -1) stack.splice(i, 1);
      stackSubs.delete(check);
      notifyStack();
    };
  }, [active]);

  return isTop;
}

// ── Escape ──────────────────────────────────────────────────────────────────────────
/** Escape closes the overlay — but only the top one, so nested overlays peel one by one. */
export function useEscape(active, isTop, onEscape) {
  const cb = useRef(onEscape);
  cb.current = onEscape;
  useEffect(() => {
    if (!active || !isTop) return;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      cb.current?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, isTop]);
}

// ── Scroll lock ─────────────────────────────────────────────────────────────────────
let lockCount = 0;
let savedOverflow = '';

/** Locks body scroll while `active`. Reference-counted: nested overlays don't fight. */
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount++;
    return () => {
      lockCount--;
      if (lockCount === 0) document.body.style.overflow = savedOverflow;
    };
  }, [active]);
}

// ── Focus trap + restore ────────────────────────────────────────────────────────────
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * While `active`: moves focus into `container` (autofocus target, first focusable,
 * or the container itself), cycles Tab/Shift+Tab inside it, and on deactivation
 * restores focus to the element that was focused when the trap engaged.
 *
 * Takes the container ELEMENT (from a callback ref), not a ref object: overlay
 * content mounts through Portal one tick after the primitive renders, so a plain
 * ref would still be null when this effect first runs and the trap would never
 * engage. An element-in-state re-fires the effect at the moment the node exists.
 */
export function useFocusTrap(container, active) {
  useEffect(() => {
    if (!active || !container) return;
    const previouslyFocused = document.activeElement;

    const initial =
      container.querySelector('[data-autofocus]') ||
      container.querySelector(FOCUSABLE) ||
      container;
    if (initial === container) container.setAttribute('tabindex', '-1');
    initial.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const nodes = Array.from(container.querySelectorAll(FOCUSABLE))
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (nodes.length === 0) { e.preventDefault(); return; }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !container.contains(current)) { e.preventDefault(); last.focus(); }
      } else {
        if (current === last || !container.contains(current)) { e.preventDefault(); first.focus(); }
      }
    };
    container.addEventListener('keydown', onKey);

    return () => {
      container.removeEventListener('keydown', onKey);
      if (previouslyFocused && previouslyFocused.isConnected && previouslyFocused.focus) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [active, container]);
}
