'use client';

// Spinner — the ONE loading indicator (PROP-002 Batch E). Rides the single
// `@keyframes spin` already in globals.css; no primitive or page may declare its own.
//
//   <Spinner />                        inline, medium
//   <Spinner size="sm" />              in a dense row
//   <Spinner size="lg" label="Loading invoices" center />   full-panel loader
//
// Accessibility: the wrapper is role="status" with an aria-label, so assistive tech
// announces the wait; the ring itself is aria-hidden decoration. `label` is announced
// but only rendered visibly when `showLabel` is set.

const SIZE = { sm: 14, md: 20, lg: 32 };
const BORDER = { sm: 2, md: 2.5, lg: 3 };

export default function Spinner({
  size = 'md',
  label = 'Loading',
  showLabel = false,
  center = false,
  style,
  ...rest
}) {
  const px = SIZE[size] || SIZE.md;
  const bw = BORDER[size] || BORDER.md;

  const ring = (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: px,
        height: px,
        border: `${bw}px solid var(--border)`,
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
        flexShrink: 0,
      }}
    />
  );

  return (
    <span
      role="status"
      aria-label={showLabel ? undefined : label}
      style={{
        display: center ? 'flex' : 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: showLabel ? 9 : 0,
        ...(center ? { width: '100%', padding: '48px 0' } : null),
        ...style,
      }}
      {...rest}
    >
      {ring}
      {showLabel && <span style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)' }}>{label}</span>}
    </span>
  );
}
