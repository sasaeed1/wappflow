'use client';

import { AlertTriangle } from 'lucide-react';
import Button from './Button';

// ErrorState — "we could not load this" (PROP-002 Batch E).
//
// This primitive exists to close a real defect class: pages that `catch {}` a failed
// fetch and fall through to their empty state, so a backend outage renders as
// "No clients yet". That is worse than an error — it is a confident lie about the
// user's data, and it invites them to re-create records they already have.
//
//   catch (e) { setError(e); }        // then:
//   {error ? <ErrorState onRetry={load} detail={error.message} /> : …}
//
// `detail` is for the technical message (surfaced but de-emphasised, and never
// instead of the human sentence). Presentational only — retrying is the caller's job.

export default function ErrorState({
  title = 'Could not load this',
  description = 'Something went wrong fetching this data. Your information is safe — this is a display problem, not data loss.',
  detail,
  onRetry,
  retryLabel = 'Try again',
  compact = false,
  style,
}) {
  return (
    <div
      role="alert"
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
      <div
        aria-hidden="true"
        style={{
          width: compact ? 40 : 52,
          height: compact ? 40 : 52,
          borderRadius: 'var(--radius-lg)',
          display: 'grid',
          placeItems: 'center',
          background: 'var(--danger-bg)',
          color: 'var(--danger-fg)',
          marginBottom: 14,
        }}
      >
        <AlertTriangle size={compact ? 19 : 24} />
      </div>

      <p style={{ fontSize: compact ? 'var(--fs-body)' : 'var(--fs-lg)', fontWeight: 'var(--fw-bold)', color: 'var(--text)', margin: 0 }}>
        {title}
      </p>

      {description && (
        <p style={{ fontSize: 'var(--fs-body-sm)', color: 'var(--text-dim)', margin: '6px 0 0', maxWidth: 400, lineHeight: 1.55 }}>
          {description}
        </p>
      )}

      {detail && (
        <p style={{ fontSize: 'var(--fs-caption)', color: 'var(--text-muted)', margin: '10px 0 0', maxWidth: 400, wordBreak: 'break-word' }}>
          {String(detail)}
        </p>
      )}

      {onRetry && (
        <div style={{ marginTop: 18 }}>
          <Button variant="secondary" onClick={onRetry}>{retryLabel}</Button>
        </div>
      )}
    </div>
  );
}
