'use client';

import RouteError from '@/components/shell/RouteError';

// Last-resort boundary. It catches anything the per-module boundaries could not —
// most importantly a throw from a module LAYOUT (AppShell's unknown-module guard,
// useAuthGuard, usePlan), because error.js never wraps the layout in its own segment.
//
// Deliberately shell-free: if a module layout is what threw, rendering that same
// layout here would just throw again.
export default function AppError({ error, unstable_retry }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'grid', placeItems: 'center', padding: 24 }}>
      <RouteError error={error} onRetry={unstable_retry} />
    </div>
  );
}
