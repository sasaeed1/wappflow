'use client';

// Keyboard shortcuts — app-wide (Phase 10, audit platform-5).
//
// The product had exactly ONE hotkey, Ctrl+K for the command palette, and no way
// to discover even that. For software somebody sits in all day that is a real
// cost: every navigation is a trip to the mouse.
//
// DESIGN RULES, because a global key handler is easy to get wrong:
//
//  · Never steal a key while the user is TYPING. A studio writing a message
//    should be able to type "g" without being navigated away. Anything inside an
//    input, textarea or contentEditable is left alone.
//  · Never fight the browser. No single-key binding shadows a native shortcut,
//    and modifier combinations are limited to the one that already existed.
//  · Sequences, not chords, for navigation — "g then l" for leads. This is the
//    convention Gmail, GitHub and Linear share, so it is already in muscle
//    memory for most people who want shortcuts at all.
//  · Discoverable. "?" opens the list. A shortcut nobody can find is a shortcut
//    nobody uses.

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// "g" then <key>. Kept deliberately short: these are the screens a studio moves
// between all day, not every route in the product.
export const GO_TO = [
  ['d', '/dashboard', 'Dashboard'],
  ['l', '/leads-list', 'Leads'],
  ['c', '/clients', 'Clients'],
  ['i', '/invoices', 'Invoices'],
  ['b', '/bookings', 'Bookings'],
  ['m', '/chat', 'Messages'],
  ['s', '/studio', 'Studio'],
  ['t', '/contracts', 'Contracts'],
  ['r', '/reports', 'Analytics'],
];

/** Is the user typing? If so, the keyboard belongs to them. */
function isTyping(target) {
  if (!target) return false;
  const tag = (target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (target.isContentEditable) return true;
  // A dialog with focus inside it is doing its own thing.
  return !!target.closest?.('[role="dialog"]');
}

export function useShortcuts() {
  const router = useRouter();
  const [pending, setPending] = useState(null);   // the 'g' half of a sequence
  const [helpOpen, setHelpOpen] = useState(false);

  const go = useCallback((url) => { router.push(url); }, [router]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      if (isTyping(e.target)) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;   // Ctrl+K is the palette's

      const k = (e.key || '').toLowerCase();

      // Escape always clears a half-typed sequence.
      if (k === 'escape') { setPending(null); setHelpOpen(false); return; }

      // "?" — the list of shortcuts. Discovery matters more than the shortcuts.
      if (e.key === '?') { e.preventDefault(); setHelpOpen((v) => !v); return; }

      if (pending === 'g') {
        const hit = GO_TO.find(([key]) => key === k);
        setPending(null);
        if (hit) { e.preventDefault(); go(hit[1]); }
        return;
      }

      if (k === 'g') { setPending('g'); return; }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, go]);

  // A half-typed "g" must not wait forever for its second key.
  useEffect(() => {
    if (pending !== 'g') return;
    const t = setTimeout(() => setPending(null), 1500);
    return () => clearTimeout(t);
  }, [pending]);

  return { helpOpen, setHelpOpen, pending };
}

export function ShortcutHelp({ open, onClose }) {
  if (!open) return null;
  const Row = ({ keys, label }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, padding: '7px 0' }}>
      <span style={{ fontSize: 13.5, color: 'var(--text)' }}>{label}</span>
      <span style={{ display: 'flex', gap: 4 }}>
        {keys.map((k) => (
          <kbd key={k} style={{
            padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--surface2)', color: 'var(--text-muted)',
            fontSize: 11.5, fontFamily: 'inherit', fontWeight: 700, minWidth: 20, textAlign: 'center',
          }}>{k}</kbd>
        ))}
      </span>
    </div>
  );

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Keyboard shortcuts"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'grid', placeItems: 'center', zIndex: 'var(--z-modal, 1000)', padding: 20 }}
    >
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Keyboard shortcuts</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>Esc</button>
        </div>

        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 12px' }}>Press <kbd>g</kbd> then a letter to jump somewhere.</p>
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {GO_TO.map(([k, , label]) => <Row key={k} keys={['g', k]} label={label} />)}
        </div>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 4 }}>
          <Row keys={['Ctrl', 'K']} label="Search everything" />
          <Row keys={['?']} label="This list" />
        </div>

        <p style={{ fontSize: 11.5, color: 'var(--text-dim)', margin: '14px 0 0' }}>
          Shortcuts are ignored while you are typing, so they never interrupt a message.
        </p>
      </div>
    </div>
  );
}
