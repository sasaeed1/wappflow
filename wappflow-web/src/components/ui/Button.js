'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

// Button — visual + interaction PRIMITIVE. No domain knowledge, no business-specific props.
// Four variants collapse the 6+ CTA identities; token-driven so it themes light/dark. Domain
// behavior (WhatsApp send, merge-duplicates, etc.) lives in a DOMAIN component that *uses* a
// Button — never a `gradient`/`color`/`whatsapp` prop here. (PROP-002 Batch B, D1.)
//
//   <Button variant="primary" onClick={save}>Save</Button>
//   <Button variant="danger" loading={busy}>Delete</Button>

const VARIANT = {
  primary:   { bg: 'var(--accent)',  fg: 'var(--on-accent)', border: 'none',                    hoverBg: 'var(--accent-hover)' },
  secondary: { bg: 'var(--surface)', fg: 'var(--text)',      border: '1px solid var(--border)', hoverBg: 'var(--surface2)' },
  ghost:     { bg: 'transparent',    fg: 'var(--text)',      border: '1px solid transparent',   hoverBg: 'var(--surface2)' },
  danger:    { bg: 'var(--danger)',  fg: 'var(--on-accent)', border: 'none',                    hoverBg: 'var(--danger)' },
};
const SIZE = {
  sm: { padding: '6px 12px', fontSize: 'var(--fs-body-sm)' },
  md: { padding: '9px 16px', fontSize: 'var(--fs-body)' },
};

export default function Button({
  variant = 'secondary', size = 'md',
  loading = false, disabled = false, type = 'button',
  children, style, onClick, ...rest
}) {
  const [hover, setHover] = useState(false);
  const v = VARIANT[variant] || VARIANT.secondary;
  const s = SIZE[size] || SIZE.md;
  const off = disabled || loading;
  return (
    <button
      type={type}
      disabled={off}
      aria-busy={loading || undefined}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        padding: s.padding, fontSize: s.fontSize, fontWeight: 'var(--fw-bold)',
        fontFamily: 'inherit', lineHeight: 1.2,
        background: (hover && !off) ? v.hoverBg : v.bg,
        color: v.fg, border: v.border, borderRadius: 'var(--radius)',
        cursor: off ? 'not-allowed' : 'pointer',
        opacity: off ? 0.6 : 1,
        transition: 'background var(--dur), opacity var(--dur)',
        whiteSpace: 'nowrap',
        // No inline box-shadow: keeps the Batch A :focus-visible ring visible on keyboard focus.
        ...style,
      }}
      {...rest}
    >
      {loading && <RefreshCw size={15} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
