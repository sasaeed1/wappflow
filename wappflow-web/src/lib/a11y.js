// a11y — the small pieces that make non-standard controls usable without a mouse.
//
// This codebase has ~120 elements that respond to a click but are not buttons:
// cards that open a record, table rows that navigate, custom toggle switches.
// A mouse user never notices. Somebody navigating by keyboard cannot reach any of
// them, and a screen reader does not announce them as things you can do.
//
// The fix is always the same three parts — a role, a place in the tab order, and
// a key handler — which is exactly why it should exist once rather than be typed
// out forty-five times, half of them subtly wrong.
//
// WHAT THIS IS NOT FOR: a modal backdrop that closes on click. That is a mouse
// convenience sitting beside a real Close button and an Escape handler; making it
// focusable would add a tab stop that announces nothing and does nothing useful.
// Nor is it for a wrapper whose onClick only calls stopPropagation.
//
// PREFER A REAL BUTTON. `<button>` gives you all of this for free, plus the right
// cursor, the right focus ring and the right behaviour in forms. Reach for this
// only when the clickable thing genuinely cannot be a button — a table row, or a
// card that already contains its own buttons and links (a button inside a button
// is invalid HTML and behaves badly).

/**
 * Props that make any element behave like a button for keyboard users.
 *
 *   <div {...clickable(() => open(id), 'Open Sana’s shoot')}> … </div>
 *
 * Enter and Space both activate, which is what a screen-reader user expects from
 * something announced as a button. Space is prevented on keydown so the page does
 * not scroll underneath.
 *
 * @param {Function} onActivate  what the click does
 * @param {string}   [label]     accessible name, when the visible content is not enough
 * @param {object}   [opts]      { role, disabled }
 */
export function clickable(onActivate, label, opts = {}) {
  const { role = 'button', disabled = false } = opts;
  if (disabled) return { 'aria-disabled': true };
  return {
    role,
    tabIndex: 0,
    ...(label ? { 'aria-label': label } : null),
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        // Let a real control inside handle its own keys rather than firing twice.
        const t = e.target;
        if (t !== e.currentTarget && t.closest?.('button, a, input, select, textarea')) return;
        e.preventDefault();
        onActivate(e);
      }
    },
  };
}

/**
 * The same, for a table row. A <tr> must keep its row semantics — putting
 * role="button" on it breaks the table for screen-reader users, who navigate
 * tables by rows and columns. So the row becomes focusable and key-operable
 * without pretending to be something else.
 */
export function clickableRow(onActivate, label) {
  const p = clickable(onActivate, label);
  delete p.role;
  return p;
}

/**
 * A custom toggle (a styled div acting as a switch). Announces its state, which
 * a coloured pill cannot do on its own.
 */
export function switchable(checked, onToggle, label) {
  return {
    role: 'switch',
    'aria-checked': !!checked,
    tabIndex: 0,
    ...(label ? { 'aria-label': label } : null),
    onClick: onToggle,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); onToggle(e); }
    },
  };
}
