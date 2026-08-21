'use client';

import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

// Breadcrumbs — the orientation trail (Phase 2, closes navigation-ia-2/6/7).
//
// Mount it through AppShell's `subHeader` slot, NEVER from inside a page: a
// page-mounted trail disappears at exactly the moment a page errors, which is when
// the user most needs a labelled way out. Rendered from the layout it survives the
// per-segment error boundary, because that boundary renders as children BELOW it.
//
// Deliberately NOT router.back(). The audit found the history stack is polluted —
// lead detail deep-links to other leads ("Related leads", "Possible duplicates"), and
// the command palette jumps in from anywhere — so "back" can walk a user through a
// chain of unrelated records. Every crumb is an explicit destination derived from
// what the record IS, not from where the user happened to come from.
//
//   <Breadcrumbs trail={[{ label: 'Leads', href: '/leads-list' }, { label: name }]} />

export default function Breadcrumbs({ trail = [] }) {
  const router = useRouter();
  if (!trail.length) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="wf-crumbs"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        fontSize: 'var(--fs-body-sm)',
        overflowX: 'auto', whiteSpace: 'nowrap',
      }}
    >
      {trail.map((c, i) => {
        const last = i === trail.length - 1;
        return (
          <span key={`${c.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            {i > 0 && <ChevronRight size={13} aria-hidden="true" style={{ color: 'var(--text-dim)', flexShrink: 0 }} />}
            {last || !c.href ? (
              <span aria-current={last ? 'page' : undefined} style={{ color: last ? 'var(--text)' : 'var(--text-muted)', fontWeight: last ? 'var(--fw-semibold)' : 'var(--fw-normal)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.label}
              </span>
            ) : (
              <button
                onClick={() => router.push(c.href)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'inherit', fontFamily: 'inherit' }}
              >
                {c.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
