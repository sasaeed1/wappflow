'use client';
import { useEffect, useState, useCallback, useContext, createContext, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Flag, Activity, ShieldCheck, Search, LogOut, Sparkles, HeartPulse, TrendingUp, Layers, Inbox,
  LifeBuoy, Database, History, FileBarChart, MonitorSmartphone, HardDrive, Menu, X, Wallet, Server, UserCog, MessagesSquare,
} from 'lucide-react';
import { ccAuth, ccApi, setStepUpHandler, setElevatedToken } from '@/lib/ccApi';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

// `perm` hides an entry from admins whose role can't use it (the server enforces
// regardless; this keeps the menu honest). `founder` = founder role only.
const NAV = [
  { group: 'Overview' },
  { href: '/control', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/control/inbox', label: 'Founder Inbox', icon: Inbox },
  { group: 'Customers' },
  { href: '/control/customers', label: 'Customers', icon: Users },
  { href: '/control/billing', label: 'Billing', icon: Wallet, perm: 'manage_billing' },
  { href: '/control/support', label: 'Support', icon: LifeBuoy },
  { href: '/control/health', label: 'Customer Health', icon: HeartPulse },
  { href: '/control/adoption', label: 'Adoption', icon: TrendingUp },
  { group: 'Product' },
  { href: '/control/plans', label: 'Plans', icon: Layers },
  { href: '/control/flags', label: 'Feature Flags', icon: Flag },
  { href: '/control/ai', label: 'AI Center', icon: Sparkles },
  { href: '/control/storage', label: 'Storage', icon: HardDrive },
  { href: '/control/desktop', label: 'Desktop Fleet', icon: MonitorSmartphone },
  { group: 'Operations' },
  { href: '/control/system', label: 'System Health', icon: Server },
  { href: '/control/events', label: 'Event Stream', icon: Activity },
  { href: '/control/reports', label: 'Reports', icon: FileBarChart },
  { href: '/control/audit', label: 'Audit Center', icon: ShieldCheck },
  { href: '/control/timemachine', label: 'Time Machine', icon: History },
  { group: 'Restricted' },
  { href: '/control/messages', label: 'Message Explorer', icon: MessagesSquare, founder: true },
  { href: '/control/database', label: 'Database', icon: Database, perm: 'run_sql' },
  { href: '/control/admins', label: 'Admins & Security', icon: UserCog },
];

// ── who is signed in, and what they may do ───────────────────────────────────
const CcCtx = createContext({ admin: null, can: () => false, isFounder: false });
export const useCc = () => useContext(CcCtx);
// <Can perm="manage_plans">…</Can> renders children only for admins who have it.
export function Can({ perm, founder = false, children, fallback = null }) {
  const { can, isFounder } = useCc();
  if (founder ? !isFounder : !can(perm)) return fallback;
  return children;
}

// ── the one step-up dialog (password + authenticator code) ───────────────────
function StepUpDialog({ req, onDone }) {
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPw(''); setCode(''); setErr(''); }, [req]);
  if (!req) return null;
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await ccAuth.stepUp(pw, code.trim());
      setElevatedToken(r.data.token, r.data.expires_in || 300);
      onDone(r.data.token);
    } catch (e2) { setErr(e2.response?.data?.error || 'Could not confirm — try again'); }
    setBusy(false);
  };
  return (
    <Modal open onClose={() => onDone(null)} title="Confirm it’s you" size="sm"
      description={req.reason || 'This action is protected. You won’t be asked again for 5 minutes.'}
      footer={<><Button onClick={() => onDone(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Confirm</Button></>}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <label style={lbl} htmlFor="cc-su-pw">Password</label>
        <input id="cc-su-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus style={inp} />
        {req.mfa && <>
          <label style={lbl} htmlFor="cc-su-code">Authenticator code</label>
          <input id="cc-su-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6 digits" style={{ ...inp, letterSpacing: '0.3em', fontVariantNumeric: 'tabular-nums' }} />
        </>}
        {err && <div role="alert" style={{ color: '#f87171', fontSize: 13 }}>{err}</div>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export default function ControlShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [navOpen, setNavOpen] = useState(false);
  const [stepReq, setStepReq] = useState(null);
  const resolver = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('cc_token')) { router.replace('/control/login'); return; }
    ccAuth.me().then((r) => { setAdmin(r.data); setReady(true); })
      .catch(() => { router.replace('/control/login'); });
  }, [router]);

  // Register the step-up dialog with the API client.
  useEffect(() => {
    setStepUpHandler((reason) => new Promise((resolve) => {
      resolver.current = resolve;
      setStepReq({ reason, mfa: true, at: Date.now() });
    }));
    return () => setStepUpHandler(null);
  }, []);
  const finishStepUp = (token) => { setStepReq(null); resolver.current?.(token); resolver.current = null; };

  useEffect(() => { setNavOpen(false); }, [pathname]);

  const doSearch = useCallback(async (val) => {
    setQ(val);
    if (val.trim().length < 2) { setResults(null); return; }
    try { const r = await ccApi.search(val.trim()); setResults(r.data.results || []); } catch { setResults([]); }
  }, []);

  const logout = async () => {
    try { await ccAuth.logout(); } catch {}
    localStorage.removeItem('cc_token'); localStorage.removeItem('cc_admin');
    router.replace('/control/login');
  };

  if (!ready) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #0a0a0f)', color: 'var(--text-muted, #888)' }}>Loading Command Center…</div>;
  }

  const perms = admin?.permissions || {};
  const isFounder = admin?.role === 'founder';
  const ctx = { admin, isFounder, can: (p) => !p || !!perms[p] };
  const visible = NAV.filter((i) => i.group || ((!i.perm || perms[i.perm]) && (!i.founder || isFounder)));
  // drop group headings with nothing under them
  const items = visible.filter((i, n) => !i.group || (visible[n + 1] && !visible[n + 1].group));
  const isActive = (item) => item.exact ? pathname === item.href : pathname.startsWith(item.href);

  const nav = (
    <nav aria-label="Command Center" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map((item, n) => {
        if (item.group) return <div key={'g' + n} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-dim, #666)', padding: '14px 11px 6px' }}>{item.group}</div>;
        const Icon = item.icon; const active = isActive(item);
        return (
          <a key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, fontSize: 13.5, fontWeight: active ? 600 : 500,
              color: active ? 'var(--accent, #818cf8)' : 'var(--text-muted, #9a9aa5)', background: active ? 'color-mix(in srgb, var(--accent, #6366f1) 14%, transparent)' : 'transparent', textDecoration: 'none' }}>
            <Icon size={17} /> {item.label}
          </a>
        );
      })}
    </nav>
  );
  const brand = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 8px' }}>
      <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>W</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1 }}>Command Center</div>
        <div style={{ fontSize: 11, color: 'var(--text-dim, #666)' }}>WappFlow control plane</div>
      </div>
    </div>
  );

  return (
    <CcCtx.Provider value={ctx}>
      <div className="cc-root" style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #e8e8ea)', display: 'flex' }}>
        <aside className="cc-side" style={{ width: 236, borderRight: '1px solid var(--border, #1e1e26)', padding: '18px 12px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', flexShrink: 0 }}>
          {brand}{nav}
        </aside>

        {navOpen && (
          <div className="cc-drawer-veil" onClick={() => setNavOpen(false)} data-dismiss style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60 }}>
            <aside onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 'min(290px, 86vw)', background: 'var(--bg, #0a0a0f)', borderRight: '1px solid var(--border,#1e1e26)', padding: '16px 12px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>{brand}
                <button aria-label="Close menu" onClick={() => setNavOpen(false)} style={iconBtn}><X size={18} /></button>
              </div>
              {nav}
            </aside>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <header style={{ minHeight: 58, borderBottom: '1px solid var(--border, #1e1e26)', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', position: 'sticky', top: 0, background: 'var(--bg, #0a0a0f)', zIndex: 20 }}>
            <button className="cc-burger" aria-label="Open menu" onClick={() => setNavOpen(true)} style={{ ...iconBtn, display: 'none' }}><Menu size={18} /></button>
            <div style={{ position: 'relative', flex: 1, maxWidth: 460, minWidth: 0 }}>
              <Search size={15} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--text-dim, #666)' }} />
              <input aria-label="Search" value={q} onChange={(e) => doSearch(e.target.value)} placeholder="Search workspaces, users, leads…"
                style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9, border: '1px solid var(--border, #1e1e26)', background: 'var(--surface, #14141b)', color: 'var(--text, #e8e8ea)', fontSize: 13 }} />
              {results && (
                <div style={{ position: 'absolute', top: 40, left: 0, right: 0, background: 'var(--surface, #14141b)', border: '1px solid var(--border, #1e1e26)', borderRadius: 11, padding: 6, maxHeight: 380, overflow: 'auto', zIndex: 40, boxShadow: '0 16px 40px rgba(0,0,0,.5)' }}>
                  {!results.length && <div style={{ padding: 12, fontSize: 13, color: 'var(--text-dim, #666)' }}>No matches.</div>}
                  {results.map((r, i) => (
                    <a key={i} href={r.link || '#'} onClick={() => { setResults(null); setQ(''); }}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, textDecoration: 'none', color: 'var(--text, #e8e8ea)', fontSize: 13 }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}{r.sub ? <span style={{ color: 'var(--text-dim,#666)' }}> · {r.sub}</span> : null}</span>
                      <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--text-dim, #666)' }}>{r.type}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
              <div className="cc-who" style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{admin?.name || admin?.email}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim, #666)', textTransform: 'capitalize' }}>{admin?.role}</div>
              </div>
              <button onClick={logout} title="Sign out" aria-label="Sign out" style={iconBtn}><LogOut size={16} /></button>
            </div>
          </header>
          <main className="cc-main" style={{ padding: 24, flex: 1, minWidth: 0 }}>{children}</main>
        </div>
        <StepUpDialog req={stepReq} onDone={finishStepUp} />
        <style>{`
          @media (max-width: 900px) {
            .cc-side { display: none !important; }
            .cc-burger { display: inline-flex !important; }
            .cc-main { padding: 16px !important; }
            .cc-who { display: none; }
          }
        `}</style>
      </div>
    </CcCtx.Provider>
  );
}

const iconBtn = { background: 'var(--surface, #14141b)', border: '1px solid var(--border, #1e1e26)', borderRadius: 9, padding: 8, color: 'var(--text-muted, #9a9aa5)', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' };
const lbl = { fontSize: 12, fontWeight: 600, color: 'var(--text-muted, #9a9aa5)' };
const inp = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border, #1e1e26)', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #e8e8ea)', fontSize: 14 };

// shared UI atoms used across control pages
export function Card({ children, style }) {
  return <div style={{ background: 'var(--surface, #14141b)', border: '1px solid var(--border, #1e1e26)', borderRadius: 14, padding: 18, ...style }}>{children}</div>;
}
export function Stat({ label, value, sub, accent }) {
  return (
    <Card>
      <div style={{ fontSize: 12, color: 'var(--text-dim, #666)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: accent || 'var(--text, #e8e8ea)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-dim, #666)', marginTop: 3 }}>{sub}</div>}
    </Card>
  );
}
export function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: ['#9a9aa5', '#9a9aa522'], green: ['#34d399', '#34d39922'], amber: ['#fbbf24', '#fbbf2422'],
    red: ['#f87171', '#f8717122'], blue: ['#60a5fa', '#60a5fa22'], purple: ['#a78bfa', '#a78bfa22'],
  };
  const [fg, bg] = tones[tone] || tones.neutral;
  return <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, color: fg, background: bg, textTransform: 'capitalize' }}>{children}</span>;
}
