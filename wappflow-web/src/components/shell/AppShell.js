'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, LogOut, User, Lock } from 'lucide-react';
import Dropdown, { MenuItem } from '@/components/ui/Dropdown';
import Drawer from '@/components/ui/Drawer';
import ModuleSwitcher from './ModuleSwitcher';
import ShellNotifications from './ShellNotifications';
import CommandPalette from './CommandPalette';
import { MODULES, isNavActive } from './modules';
import { useSession, useSignOut, useAuthGuard } from './session';
import { useSummary } from './summary';
import { usePlan } from '@/lib/plan';

// AppShell — ONE shell for every authenticated module (Phase 2).
//
// Replaces three per-page shells (NavBar, StudioShell, ContractsStudioShell) that were
// imported and wrapped by 36 pages across 45 JSX call sites — pages re-wrapped
// themselves on every return path, so a loading state and its loaded state each
// mounted the chrome separately. Mounted from a route layout instead, the chrome
// simply persists across navigation.
//
//   // app/contracts/layout.js
//   export default function Layout({ children }) {
//     return <AppShell module="contracts">{children}</AppShell>;
//   }
//
// Dialects survive (D8): `module.dialectClass` wraps content in .ms-root so Studio's
// token remap — and its focus-ring neutralizer, which is keyed to that class — keep
// working exactly as ratified. Height is published as --shell-h because pages depend
// on it (chat computes calc(100vh - 60px); the Studio canvases pin top:58).

export default function AppShell({ module: moduleKey, children, actions, subHeader }) {
  const mod = MODULES[moduleKey];
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  const signOut = useSignOut();
  const plan = usePlan();
  const summary = useSummary();
  const [drawer, setDrawer] = useState(false);
  useAuthGuard();

  if (!mod) throw new Error(`AppShell: unknown module "${moduleKey}"`);

  // Defensive, matching the previous behaviour: while plan info is still loading we
  // show items unlocked rather than flashing a lock and snapping open.
  const featureLocked = (key) => (key && !plan.loading ? !plan.hasFeature(key) : false);
  const Mark = mod.icon;
  const initial = (user?.full_name || user?.email || 'U')[0]?.toUpperCase();

  const go = (href) => { setDrawer(false); router.push(href); };

  const navButton = (item, inDrawer = false) => {
    const active = isNavActive(pathname, item);
    const locked = featureLocked(item.lockFeature);
    const Icon = locked ? Lock : item.icon;
    // Unread team messages were only ever visible once you were already inside
    // /chat, which is the one place you no longer need telling (audit comms-5).
    // The count rides the summary the bell already fetches — no extra polling.
    const badgeCount = item.badge === 'comms' && !locked ? (summary.comms || 0) : 0;
    return (
      <button
        key={item.href}
        onClick={() => go(item.href)}
        title={locked ? `${item.label} — available on ${item.requiredPlan}` : undefined}
        aria-current={active ? 'page' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: inDrawer ? '100%' : undefined,
          padding: inDrawer ? '11px 12px' : '7px 14px',
          borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer',
          background: active ? 'var(--accent-bg)' : 'transparent',
          color: active ? 'var(--accent-fg)' : 'var(--text-muted)',
          fontSize: 'var(--fs-body-sm)', fontFamily: 'inherit',
          fontWeight: active ? 'var(--fw-bold)' : 'var(--fw-normal)',
          whiteSpace: 'nowrap',
        }}
      >
        {Icon && <Icon size={15} aria-hidden="true" />}
        {item.label}
        {badgeCount > 0 && (
          <span
            aria-label={`${badgeCount} unread`}
            style={{
              minWidth: 17, height: 17, padding: '0 5px', marginLeft: 2,
              borderRadius: 'var(--radius-pill)', background: 'var(--danger)',
              color: 'var(--on-accent)', fontSize: 10, fontWeight: 'var(--fw-bold)',
              display: 'grid', placeItems: 'center',
            }}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header
        className="wf-shell"
        style={{
          position: 'sticky', top: 0, zIndex: 'var(--z-sticky)',
          height: 'var(--shell-h)', display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 18px', background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <ModuleSwitcher current={mod.key} />

        <div
          onClick={() => router.push(mod.home)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', marginRight: 6 }}
        >
          <span style={{ width: 28, height: 28, borderRadius: 8, background: mod.mark, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Mark size={15} color="#fff" />
          </span>
          <b className="wf-shell-wordmark" style={{ fontSize: 15.5, color: 'var(--text)', letterSpacing: '-0.3px' }}>{mod.label}</b>
        </div>

        <nav className="wf-shell-nav" aria-label={`${mod.label} navigation`} style={{ display: 'flex', gap: 2, marginLeft: 6 }}>
          {mod.nav.map((i) => navButton(i))}
        </nav>

        <div style={{ flex: 1 }} />
        {actions}
        {/* Module-declared chrome (e.g. Studio's theme switcher) — the seam that lets
            one shell host a dialect's own controls without flattening it (D8). */}
        {mod.actions && <mod.actions />}
        {mod.notifications && <ShellNotifications />}
        {/* Ctrl+K, in every module — the old binding lived in a CRM-only fab. */}
        <CommandPalette />

        <button
          className="wf-shell-burger"
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          style={{ display: 'none', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6 }}
        >
          <Menu size={20} />
        </button>

        <Dropdown
          label="Account"
          width={200}
          trigger={(p) => (
            <button
              {...p}
              aria-label="Account menu"
              style={{
                width: 34, height: 34, borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border)', cursor: 'pointer',
                background: 'var(--surface2)', color: 'var(--text)',
                fontSize: 13, fontWeight: 'var(--fw-bold)', display: 'grid', placeItems: 'center',
              }}
            >
              {initial}
            </button>
          )}
        >
          {(close) => (
            <>
              <div style={{ padding: '8px 11px 10px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 'var(--fw-semibold)', color: 'var(--text)' }}>{user?.full_name || user?.email || 'Account'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{user?.email || ''}</div>
              </div>
              {/* Destinations come from the module registry — they are NOT derivable
                  from `home` (CRM's settings/help are top-level routes, not children
                  of /dashboard). */}
              {mod.menu?.map((m) => (
                <MenuItem key={m.href} icon={m.icon} onClick={() => { close(); router.push(m.href); }}>{m.label}</MenuItem>
              ))}
              <MenuItem icon={User} onClick={() => { close(); router.push('/profile'); }}>My profile</MenuItem>
              <MenuItem icon={LogOut} tone="danger" onClick={signOut}>Sign out</MenuItem>
            </>
          )}
        </Dropdown>
      </header>

      {subHeader}

      {/* .wf-page is load-bearing: the mobile rules in globals.css key off it. */}
      <div className={mod.dialectClass ? `wf-page ${mod.dialectClass}` : 'wf-page'}>{children}</div>

      {/* Module-scoped floating assistants. These used to be mounted by NavBar, which
          meant they existed only on CRM pages by accident of which shell a page picked. */}
      {mod.fabs?.map((Fab, i) => <Fab key={i} />)}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={mod.label}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }} aria-label={`${mod.label} navigation`}>
          {mod.nav.map((i) => navButton(i, true))}
        </nav>
      </Drawer>

      <style>{`
        @media (max-width: 860px) {
          .wf-shell-nav, .wf-shell-wordmark { display: none !important; }
          .wf-shell-burger { display: inline-flex !important; }
        }
      `}</style>
    </div>
  );
}
