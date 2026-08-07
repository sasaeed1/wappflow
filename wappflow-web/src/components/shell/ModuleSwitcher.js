'use client';

import { useRouter } from 'next/navigation';
import { LayoutGrid, Check, Zap } from 'lucide-react';
import Dropdown from '@/components/ui/Dropdown';
import { MODULES, MODULE_ORDER } from './modules';
import { FLUX_PARKED } from '@/lib/flux';

const FLUX_URL = process.env.NEXT_PUBLIC_FLUX_URL || 'http://localhost:3000';

// ModuleSwitcher — in-app module switching (Phase 2).
//
// THE FIX: switching to Media Studio or Contracts used to open a NEW TAB
// (target="_blank"), which the audit names as the root cause of the "not one product"
// feeling — and it worked only because of a same-origin-referrer trick in the root
// layout that let the new tab inherit the session. Modules are now ordinary in-app
// routes, so switching is a client-side navigation: no tab sprawl, no session hack,
// back button works.
//
// It also replaces a second, drifted copy of this menu that StudioShell hand-rolled
// with different markup and different targets.

export default function ModuleSwitcher({ current }) {
  const router = useRouter();

  return (
    <Dropdown
      label="Switch app"
      align="left"
      width={248}
      trigger={(p) => (
        <button
          {...p}
          title="Apps"
          aria-label="Switch app"
          style={{
            width: 36, height: 36, borderRadius: 'var(--radius)', border: 'none',
            background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            display: 'grid', placeItems: 'center',
          }}
        >
          <LayoutGrid size={18} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 'var(--fw-bold)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '6px 10px 8px' }}>
            Switch app
          </div>

          {MODULE_ORDER.map((key) => {
            const m = MODULES[key];
            const Icon = m.icon;
            const isCurrent = key === current;
            return (
              <button
                key={key}
                onClick={() => { close(); if (!isCurrent) router.push(m.home); }}
                aria-current={isCurrent ? 'true' : undefined}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 10px', borderRadius: 'var(--radius-sm)', border: 'none',
                  background: isCurrent ? 'var(--accent-bg)' : 'transparent',
                  color: 'var(--text)', fontFamily: 'inherit',
                  fontSize: 'var(--fs-body-sm)', textAlign: 'left',
                  cursor: isCurrent ? 'default' : 'pointer',
                }}
              >
                <span style={{ width: 30, height: 30, borderRadius: 8, background: m.mark, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon size={15} color="#fff" />
                </span>
                <span style={{ flex: 1 }}>{m.label}</span>
                {isCurrent && <Check size={15} aria-hidden="true" style={{ color: 'var(--accent-fg)' }} />}
              </button>
            );
          })}

          {/* Flux stays external and is parked — the one genuine new-tab case. */}
          <a
            href={FLUX_PARKED ? undefined : FLUX_URL}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => { if (FLUX_PARKED) e.preventDefault(); else close(); }}
            aria-disabled={FLUX_PARKED || undefined}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 'var(--radius-sm)',
              color: 'var(--text)', fontSize: 'var(--fs-body-sm)', textDecoration: 'none',
              opacity: FLUX_PARKED ? 0.5 : 1, cursor: FLUX_PARKED ? 'default' : 'pointer',
            }}
          >
            <span style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg,#A78BFA,#22D3EE,#EC4899)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Zap size={15} color="#fff" />
            </span>
            <span style={{ flex: 1 }}>Flux</span>
            {FLUX_PARKED && <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Coming soon</span>}
          </a>
        </>
      )}
    </Dropdown>
  );
}
