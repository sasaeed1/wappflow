'use client';

import Link from 'next/link';
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

          {/* Real links, not buttons. A <button> + router.push() gives the browser
              no href, so "Open link in new tab", middle-click and ⌘/Ctrl-click all
              did nothing — the menu looked like navigation but could not be treated
              like it. Link keeps plain clicks client-side and hands modified clicks
              to the browser, so a module can be opened in its own tab. */}
          {MODULE_ORDER.map((key) => {
            const m = MODULES[key];
            const Icon = m.icon;
            const isCurrent = key === current;
            return (
              <Link
                key={key}
                href={m.home}
                onClick={(e) => {
                  // Let the browser own ⌘/Ctrl/Shift/Alt and middle clicks.
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  if (isCurrent) e.preventDefault();
                  close();
                }}
                aria-current={isCurrent ? 'page' : undefined}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 10px', borderRadius: 'var(--radius-sm)',
                  background: isCurrent ? 'var(--accent-bg)' : 'transparent',
                  color: 'var(--text)', fontFamily: 'inherit',
                  fontSize: 'var(--fs-body-sm)', textAlign: 'left', textDecoration: 'none',
                  cursor: isCurrent ? 'default' : 'pointer',
                }}
              >
                <span style={{ width: 30, height: 30, borderRadius: 8, background: m.mark, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <Icon size={15} color="#fff" />
                </span>
                <span style={{ flex: 1 }}>{m.label}</span>
                {isCurrent && <Check size={15} aria-hidden="true" style={{ color: 'var(--accent-fg)' }} />}
              </Link>
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
