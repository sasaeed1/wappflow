'use client';

import Button from './Button';

// EmptyState — "there is nothing here", and it must say WHY (PROP-002 Batch E).
//
// The distinction this primitive exists to enforce: an empty LIST and an empty
// FILTER RESULT are different situations. "Add your first client" is wrong — and
// slightly insulting — when the user has 400 clients and simply typed a bad search.
// `filtered` swaps the copy and offers "Clear filters" instead of the create CTA.
//
//   <EmptyState icon={Users} title="No clients yet"
//               description="Won leads become clients automatically."
//               action={{ label: 'Add client', onClick: create }} />
//
//   <EmptyState filtered icon={Search} title="No clients match those filters"
//               action={{ label: 'Clear filters', onClick: reset }} />
//
// Presentational only: it never fetches, never knows a domain. Never render it while
// data is still loading — that is what Skeleton/Spinner are for (showing "nothing
// here" during a fetch is a lie that this batch is explicitly fixing).

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,          // { label, onClick } — rendered with the Button primitive
  filtered = false,
  compact = false,
  children,
  style,
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '32px 20px' : '56px 24px',
        ...style,
      }}
    >
      {Icon && (
        <div
          aria-hidden="true"
          style={{
            width: compact ? 40 : 52,
            height: compact ? 40 : 52,
            borderRadius: 'var(--radius-lg)',
            display: 'grid',
            placeItems: 'center',
            background: filtered ? 'var(--surface2)' : 'var(--accent-bg)',
            color: filtered ? 'var(--text-dim)' : 'var(--accent-fg)',
            marginBottom: 14,
          }}
        >
          <Icon size={compact ? 19 : 24} />
        </div>
      )}

      {title && (
        <p style={{ fontSize: compact ? 'var(--fs-body)' : 'var(--fs-lg)', fontWeight: 'var(--fw-bold)', color: 'var(--text)', margin: 0 }}>
          {title}
        </p>
      )}

      {description && (
        <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', margin: '6px 0 0', maxWidth: 380, lineHeight: 1.55 }}>
          {description}
        </p>
      )}

      {action && (
        <div style={{ marginTop: 18 }}>
          <Button variant={filtered ? 'secondary' : 'primary'} onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}

      {children}
    </div>
  );
}
