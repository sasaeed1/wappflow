'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, LogOut, User, Lock } from 'lucide-react';
import Dropdown, { MenuItem } from '@/components/ui/Dropdown';
import Drawer from '@/components/ui/Drawer';
import ModuleSwitcher from './ModuleSwitcher';
import ShellNotifications from './ShellNotifications';
import CommandPalette from './CommandPalette';
import { useShortcuts, ShortcutHelp } from './shortcuts';
import { MODULES, isNavActive } from './modules';
import { useSession, useSignOut, useAuthGuard } from './session';
import { useSummary } from './summary';
import { usePlan } from '@/lib/plan';
import { usePermissions } from '@/lib/permissions';
import { clickable } from '@/lib/a11y';

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

// Routes whose content is a full-height app surface rather than a scrolling page
// of cards — chat panes, the lead conversation, the Studio canvases. Those own the
// whole viewport, so the desktop FAB gutter (globals.css) would leave a dead strip
// down their right edge instead of protecting anything. Card/list pages, where row
// actions sit on the right edge and the FABs were genuinely swallowing clicks, keep
// the gutter.
// `(\/|$)` matters: /^\/studio\// missed the module index itself, so the Studio
// landing page — a full-bleed cinematic hero — got the gutter and showed a pale
// strip of its own backdrop down the right edge.
// The lead page used to be listed here, but it is a scrolling page of cards like
// any other: its outgoing bubbles and their Reply/React bar sit on the right edge,
// and the FABs covered them (measured). It takes the gutter now.
const BLEED_ROUTES = [/^\/chat(\/|$)/, /^\/studio(\/|$)/, /^\/contracts\/[^/]+$/];
const isBleedRoute = (pathname) => !!pathname && BLEED_ROUTES.some((re) => re.test(pathname));

// Phone-width routes that bring their own full-screen chrome — Team Chat's composer,
// the cull viewer, the reel editor. A floating button there always lands on a
// control (Send, photo info, the zoom tool), so the FABs stand down entirely.
const NO_FAB_PHONE_ROUTES = [/^\/chat(\/|$)/, /^\/studio\/[^/]+\/cull$/, /^\/studio\/[^/]+\/video\/[^/]+$/];

// Everywhere else on a phone the FABs get out of the way while you scroll down
// and come back when you scroll up — the usual mobile pattern — so a row under
// them is never unreachable. (Hiding them while typing is pure CSS, globals.css.)
function useFabsTuckedOnScroll() {
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setTucked(y > last && y > 80);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return tucked;
}

export default function AppShell({ module: moduleKey, children, actions, subHeader }) {
  const mod = MODULES[moduleKey];
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useSession();
  // App-wide keyboard shortcuts. The product had exactly one hotkey (Ctrl+K) and
  // no way to discover even that.
  const { helpOpen, setHelpOpen } = useShortcuts();
  const signOut = useSignOut();
  const plan = usePlan();
  const perms = usePermissions();
  // Items a member's role can't use are hidden, not locked: unlike a plan lock there is
  // nothing for them to upgrade (PROP-006).
  const navItems = (mod?.nav || []).filter((i) => !i.perm || perms.can(i.perm));
  const summary = useSummary();
  const [drawer, setDrawer] = useState(false);
  const fabsTucked = useFabsTuckedOnScroll();
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
      {/* Off-screen until focused. The first Tab on any page offers to jump past
          the navigation — without it a keyboard user tabs through every nav item,
          on every page, before reaching what they came for. */}
      <a href="#wf-main" className="wf-skip-link">Skip to main content</a>
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
          {...clickable(() => router.push(mod.home))}
          style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', marginRight: 6 }}
        >
          <span style={{ width: 28, height: 28, borderRadius: 8, background: mod.mark, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Mark size={15} color="#fff" />
          </span>
          <b className="wf-shell-wordmark" style={{ fontSize: 15.5, color: 'var(--text)', letterSpacing: '-0.3px' }}>{mod.label}</b>
        </div>

        <nav className="wf-shell-nav" aria-label={`${mod.label} navigation`} style={{ display: 'flex', gap: 2, marginLeft: 6 }}>
          {navItems.map((i) => navButton(i))}
        </nav>

        <div style={{ flex: 1 }} />
        {actions}
        {/* Module-declared chrome (e.g. Studio's theme switcher) — the seam that lets
            one shell host a dialect's own controls without flattening it (D8). */}
        {mod.actions && <mod.actions />}
        {mod.notifications && <ShellNotifications />}
        {/* Ctrl+K, in every module — the old binding lived in a CRM-only fab. */}
        <CommandPalette />
        {/* "g then a letter" to navigate, "?" for the list. Mounted on the ONE
            shell, so every module gets them and nothing binds keys twice. */}
        <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

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

      {/* .wf-page is load-bearing: the mobile rules in globals.css key off it, as
          does the desktop FAB gutter. .wf-bleed opts a route out of that gutter —
          see isBleedRoute above. */}
      <TrialBanner endsAt={plan.trialEndsAt} planName={plan.planName} />
      <VerifyEmailBanner show={perms.emailVerified === false} />
      <main
        id="wf-main"
        className={[
          'wf-page',
          mod.dialectClass || '',
          isBleedRoute(pathname) ? 'wf-bleed' : '',
        ].filter(Boolean).join(' ')}
      >
        {children}
      </main>

      {/* Module-scoped floating assistants. These used to be mounted by NavBar, which
          meant they existed only on CRM pages by accident of which shell a page picked.

          They must render INSIDE the module's dialect scope. The dialect class is a
          token scope (.ms-root defines every --ms-*), and these sit outside <main>,
          so Studio Copilot's `background: var(--ms-panel-bg)` resolved to nothing —
          a fully transparent panel with its text laid straight over the photograph
          behind it. .wf-fab-scope is display:contents, so the tokens cascade while
          .ms-root's own min-height/backdrop paint nothing. */}
      {mod.fabs?.length > 0 && (
        <div
          className={['wf-fab-scope', mod.dialectClass].filter(Boolean).join(' ')}
          data-fab-tucked={fabsTucked ? '' : undefined}
          data-fab-phone-off={NO_FAB_PHONE_ROUTES.some((re) => re.test(pathname || '')) ? '' : undefined}
        >
          {mod.fabs.map((Fab, i) => <Fab key={i} />)}
        </div>
      )}

      <Drawer open={drawer} onClose={() => setDrawer(false)} title={mod.label}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }} aria-label={`${mod.label} navigation`}>
          {navItems.map((i) => navButton(i, true))}
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

// A gentle, dismissible nudge until the account's email is confirmed (PROP-006).
// Never blocks anything: mail may not even be configured on the server.
function VerifyEmailBanner({ show }) {
  const [hidden, setHidden] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { try { setHidden(sessionStorage.getItem('wf_verify_dismissed') === '1'); } catch {} }, []);
  if (!show || hidden) return null;
  const resend = async () => {
    try { const { accountAPI } = await import('@/lib/api'); await accountAPI.resendVerify(); setMsg('Sent. Check your inbox.'); }
    catch (e) { setMsg(e?.response?.data?.error || 'Could not send it. Try again later.'); }
  };
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 16px', fontSize: 13, background: 'var(--info-bg)', color: 'var(--info-fg)' }}>
      <span style={{ flex: '1 1 220px' }}>{msg || 'Confirm your email address so we can reach you about your account.'}</span>
      {!msg && <button type="button" onClick={resend} style={{ background: 'none', border: 'none', color: 'inherit', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', fontSize: 13 }}>Send the link</button>}
      <button type="button" aria-label="Dismiss" onClick={() => { setHidden(true); try { sessionStorage.setItem('wf_verify_dismissed', '1'); } catch {} }}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}

// Trial countdown (PROP-006): new workspaces get 14 days of Studio, then Creator.
function TrialBanner({ endsAt, planName }) {
  if (!endsAt) return null;
  const ms = new Date(String(endsAt).includes('T') ? endsAt : String(endsAt).replace(' ', 'T') + 'Z') - Date.now();
  if (!(ms > 0)) return null;
  const days = Math.ceil(ms / 86400000);
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 16px', fontSize: 13, background: 'var(--accent-bg)', color: 'var(--accent-fg)' }}>
      <span style={{ flex: '1 1 220px' }}>{`You’re trying ${planName || 'Studio'}: ${days} day${days === 1 ? '' : 's'} left. After that you’ll move to Creator and keep all your data.`}</span>
      <a href="/settings?tab=plan" style={{ color: 'inherit', fontWeight: 700 }}>See plans</a>
    </div>
  );
}

