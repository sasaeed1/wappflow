'use client';

// Badge — presentation PRIMITIVE. Knows tones, not domains: it has no idea what a lead,
// contract, invoice, booking, gallery, album, or role is. Status/role registries map a
// stable key -> { label, tone, ... }; a surface passes that metadata in. (PROP-002 Batch B.)
//
//   <Badge tone="success" dot>Paid</Badge>
//   <Badge color={tag.color}>{tag.name}</Badge>   // color escape-hatch for tag-style chips
//
// tone -> Batch A semantic status tokens. Never introduces a raw hex of its own.

const TONE = {
  neutral: { bg: 'var(--surface2)',  fg: 'var(--text-dim)' },
  info:    { bg: 'var(--info-bg)',    fg: 'var(--info-fg)' },
  accent:  { bg: 'var(--accent-bg)',  fg: 'var(--accent-fg)' },
  success: { bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
  warning: { bg: 'var(--warning-bg)', fg: 'var(--warning-fg)' },
  danger:  { bg: 'var(--danger-bg)',  fg: 'var(--danger-fg)' },
};

export default function Badge({ tone = 'neutral', size = 'md', dot = false, color, children, style, ...rest }) {
  const t = TONE[tone] || TONE.neutral;
  // color escape-hatch (arbitrary tag colors): tint the bg, use the color as fg.
  const bg = color ? `color-mix(in srgb, ${color} 15%, transparent)` : t.bg;
  const fg = color || t.fg;
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: size === 'sm' ? '2px 8px' : '3px 9px',
        borderRadius: 'var(--radius-pill)',
        fontSize: size === 'sm' ? 'var(--fs-caption)' : 'var(--fs-body-sm)',
        fontWeight: 'var(--fw-semibold)',
        lineHeight: 1.4, whiteSpace: 'nowrap',
        background: bg, color: fg,
        ...style,
      }}
      {...rest}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 'var(--radius-pill)', background: 'currentColor', flexShrink: 0 }} />}
      {children}
    </span>
  );
}
