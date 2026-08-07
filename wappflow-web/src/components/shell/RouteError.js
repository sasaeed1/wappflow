'use client';

import { useEffect } from 'react';
import ErrorState from '@/components/ui/ErrorState';

// RouteError — the body of every error.js boundary (Phase 2, closes gap-2).
//
// Before this, there were ZERO App Router boundaries across 69 routes: any render
// error anywhere showed Next's raw crash screen. That is the worst possible moment
// to stop looking like a product.
//
// WHERE BOUNDARIES SIT (Next 16 rule): an error.js wraps its segment's page and any
// nested layouts, but NOT the layout.js in its own segment. So a per-module
// error.js (app/studio/error.js) renders INSIDE that module's AppShell and the user
// keeps their navigation — while a failure thrown BY a layout (AppShell itself, e.g.
// its unknown-module throw or useAuthGuard) can only be caught by the parent, which
// is why app/error.js must stay shell-free.
//
// Retry is `unstable_retry`, not `reset`: per Next 16.2's docs, reset() re-renders
// WITHOUT re-fetching, so on the dominant failure here — a failed API call — it would
// re-run the same broken render and look like a dead button. Boundary files own that
// version-specific prop name; this component just takes `onRetry`.

export default function RouteError({ error, onRetry, title, description }) {
  useEffect(() => {
    // Surface it: a swallowed boundary is how a broken page stays broken for weeks.
    // Single hook point if an error service is ever added.
    console.error('[route error]', error);
  }, [error]);

  return (
    <ErrorState
      title={title || 'Something went wrong on this page'}
      description={description || 'This section failed to render. Your data is safe — nothing was lost.'}
      detail={error?.message}
      onRetry={onRetry}
      retryLabel="Try again"
    />
  );
}
