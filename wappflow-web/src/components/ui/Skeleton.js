'use client';

// Skeleton — placeholder geometry for content that is still loading (PROP-002 Batch E).
//
// Why not just a spinner: on a table, a centred spinner collapses the layout and then
// snaps it back when data lands. A skeleton holds the shape, so nothing jumps — and it
// removes the flash of "No results" that appears when an empty state renders before a
// fetch resolves (a lie this batch exists to stop telling).
//
//   <Skeleton width={180} />              one bar
//   <Skeleton circle size={40} />         an avatar
//   <SkeletonRow variant="leads" rows={8} />
//
// Skeleton is the dumb primitive; SkeletonRow composes it into the THREE real row
// shapes measured in the Batch E inventory. They share no container model (grid /
// grid / flex-card), avatar treatment (34px squircle / none / 40px circle) or height
// (~58 / ~62 / ~72px), so one generic row would fit none of them and reintroduce the
// layout shift the skeleton exists to prevent.
//
// Uses the `pulse` keyframes already in globals.css — no new animation. Everything is
// aria-hidden: the loading announcement belongs to ONE role="status" (Spinner) per
// surface, not to dozens of placeholder bars.

const PULSE = 'pulse 1.4s ease-in-out infinite';

export function Skeleton({ width = '100%', height = 12, circle = false, size = 32, radius, style }) {
  return (
    <span
      aria-hidden="true"
      className="wf-skeleton"
      style={{
        display: 'block',
        width: circle ? size : width,
        height: circle ? size : height,
        borderRadius: circle ? '50%' : (radius ?? 'var(--radius-sm)'),
        background: 'var(--surface2)',
        animation: PULSE,
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

// Two stacked bars — the recurring "name over meta" cell in every list row.
function TwoLine({ top = 130, bottom = 170 }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
      <Skeleton width={top} height={13} />
      <Skeleton width={bottom} height={10} />
    </span>
  );
}

// Geometry copied from the real rows (see proposals/PROP-002-batch-e-inventory.md).
// Heights deliberately match the TALLER real variant: a shell that shrinks when data
// lands is far less jarring than one that grows.
const VARIANTS = {
  // leads-list: 9-column grid, 34px squircle avatar, ~58px rows
  leads: {
    padding: '12px 16px',
    render: () => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        <Skeleton size={34} radius={10} width={34} height={34} />
        <TwoLine top={140} bottom={100} />
        <Skeleton width={70} height={18} radius="var(--radius-pill)" />
        <Skeleton width={60} height={13} />
      </span>
    ),
  },
  // invoices: 6-column grid, NO avatar. Real rows are ~58px (one-line customer) to
  // ~62px (with the optional email line); the extra 2px of padding matches the TALLER
  // variant so the table shrinks slightly on load rather than growing.
  invoice: {
    padding: '16px 20px',
    render: () => (
      <span style={{ display: 'grid', gridTemplateColumns: '50px 1fr 130px 120px 110px 200px', gap: 16, alignItems: 'center', width: '100%' }}>
        <Skeleton width={16} height={13} />
        <TwoLine top={120} bottom={150} />
        <Skeleton width={80} height={13} />
        <Skeleton width={70} height={13} />
        <Skeleton width={60} height={15} />
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
          <Skeleton width={60} height={18} radius="var(--radius-pill)" />
          <Skeleton width={25} height={25} radius={8} />
          <Skeleton width={25} height={25} radius={8} />
        </span>
      </span>
    ),
  },
  // contracts vault: bordered flex card, 40px CIRCLE avatar, ~72px, 12px inter-card gap
  vaultCard: {
    card: true,
    padding: '16px 18px',
    render: () => (
      <span style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
        <Skeleton circle size={40} />
        <TwoLine top={140} bottom={180} />
        <Skeleton width={18} height={18} />
      </span>
    ),
  },
};

export function SkeletonRow({ variant = 'leads', rows = 5, style }) {
  const v = VARIANTS[variant] || VARIANTS.leads;
  return (
    <div
      aria-hidden="true"
      style={{ display: v.card ? 'flex' : 'block', flexDirection: v.card ? 'column' : undefined, gap: v.card ? 12 : undefined, ...style }}
    >
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          style={{
            padding: v.padding,
            // fade successive rows so the placeholder reads as "more below", not as content
            opacity: Math.max(0.35, 1 - r * 0.11),
            ...(v.card
              ? { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }
              : { borderBottom: '1px solid var(--border)' }),
          }}
        >
          {v.render()}
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
