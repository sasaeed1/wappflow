'use client';

import RouteError from '@/components/shell/RouteError';

// Renders INSIDE this segment's shell, so the user keeps their navigation and can
// leave without the browser back button. Must NOT mount a shell of its own — the
// layout above is already rendering one.
export default function SegmentError({ error, unstable_retry }) {
  return <RouteError error={error} onRetry={unstable_retry} />;
}
