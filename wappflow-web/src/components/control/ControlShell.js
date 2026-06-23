'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Flag, Activity, ShieldCheck, Search, LogOut, Sparkles, HeartPulse, TrendingUp, Layers, Inbox,
  LifeBuoy, Database, History, FileBarChart, MonitorSmartphone, HardDrive,
} from 'lucide-react';
import { ccAuth, ccApi } from '@/lib/ccApi';

const NAV = [
  { href: '/control', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/control/inbox', label: 'Founder Inbox', icon: Inbox },
  { href: '/control/customers', label: 'Customers', icon: Users },
  { href: '/control/health', label: 'Customer Health', icon: HeartPulse },
  { href: '/control/adoption', label: 'Adoption', icon: TrendingUp },
  { href: '/control/plans', label: 'Plans', icon: Layers },
  { href: '/control/flags', label: 'Feature Flags', icon: Flag },
  { href: '/control/desktop', label: 'Desktop Fleet', icon: MonitorSmartphone },
  { href: '/control/storage', label: 'Storage', icon: HardDrive },
  { href: '/control/ai', label: 'AI Center', icon: Sparkles },
  { href: '/control/support', label: 'Support', icon: LifeBuoy },
  { href: '/control/reports', label: 'Reports', icon: FileBarChart },
  { href: '/control/events', label: 'Event Stream', icon: Activity },
  { href: '/control/audit', label: 'Audit Center', icon: ShieldCheck },
  { href: '/control/database', label: 'Database', icon: Database },
  { href: '/control/timemachine', label: 'Time Machine', icon: History },
];

export default function ControlShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState(null);
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!localStorage.getItem('cc_token')) { router.replace('/control/login'); return; }
    ccAuth.me().then((r) => { setAdmin(r.data); setReady(true); })
      .catch(() => { router.replace('/control/login'); });
  }, [router]);

  const doSearch = useCallback(async (val) => {
    setQ(val);
    if (val.trim().length < 2) { setResults(null); return; }
    try { const r = await ccApi.search(val.trim()); setResults(r.data.results || []); } catch { setResults([]); }
  }, []);

  const logout = () => {
    localStorage.removeItem('cc_token'); localStorage.removeItem('cc_admin');
    router.replace('/control/login');
  };

  if (!ready) {
    return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #0a0a0f)', color: 'var(--text-muted, #888)' }}>Loading Command Center…</div>;
  }

  const isActive = (item) => item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg, #0a0a0f)', color: 'var(--text, #e8e8ea)', display: 'flex' }}>
      {/* Sidebar */}
      <aside style={{ width: 232, borderRight: '1px solid var(--border, #1e1e26)', padding: '18px 12px', position: 'sticky', top: 0, height: '100vh', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 18px' }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#0ea5e9)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>W</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1 }}>Command Center</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim, #666)' }}>Control Plane</div>
          </div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV.map((item) => {
            const Icon = item.icon; const active = isActive(item);
            return (
              <a key={item.href} href={item.href}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 9, fontSize: 13.5, fontWeight: active ? 600 : 500,
                  color: active ? 'var(--accent, #818cf8)' : 'var(--text-muted, #9a9aa5)', background: active ? 'color-mix(in srgb, var(--accent, #6366f1) 14%, transparent)' : 'transparent', textDecoration: 'none' }}>
                <Icon size={17} /> {item.label}
              </a>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Topbar */}
        <header style={{ height: 58, borderBottom: '1px solid var(--border, #1e1e26)', display: 'flex', alignItems: 'center', gap: 16, padding: '0 20px', position: 'sticky', top: 0, background: 'var(--bg, #0a0a0f)', zIndex: 20 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 460 }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: 10, color: 'var(--text-dim, #666)' }} />
            <input value={q} onChange={(e) => doSearch(e.target.value)} placeholder="Search workspaces, users, leads, contracts…"
              style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9, border: '1px solid var(--border, #1e1e26)', background: 'var(--surface, #14141b)', color: 'var(--text, #e8e8ea)', fontSize: 13 }} />
            {results && (
              <div style={{ position: 'absolute', top: 40, left: 0, right: 0, background: 'var(--surface, #14141b)', border: '1px solid var(--border, #1e1e26)', borderRadius: 11, padding: 6, maxHeight: 380, overflow: 'auto', zIndex: 40, boxShadow: '0 16px 40px rgba(0,0,0,.5)' }}>
                {!results.length && <div style={{ padding: 12, fontSize: 13, color: 'var(--text-dim, #666)' }}>No matches.</div>}
                {results.map((r, i) => (
                  <a key={i} href={r.link || '#'} onClick={() => { setResults(null); setQ(''); }}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 8, textDecoration: 'none', color: 'var(--text, #e8e8ea)', fontSize: 13 }}>
                    <span>{r.label}{r.sub ? <span style={{ color: 'var(--text-dim,#666)' }}> · {r.sub}</span> : null}</span>
                    <span style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: .5, color: 'var(--text-dim, #666)' }}>{r.type}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{admin?.name || admin?.email}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim, #666)', textTransform: 'capitalize' }}>{admin?.role}</div>
            </div>
            <button onClick={logout} title="Sign out" style={{ background: 'var(--surface, #14141b)', border: '1px solid var(--border, #1e1e26)', borderRadius: 9, padding: 8, color: 'var(--text-muted, #9a9aa5)', cursor: 'pointer' }}><LogOut size={16} /></button>
          </div>
        </header>
        <main style={{ padding: 24, flex: 1 }}>{children}</main>
      </div>
    </div>
  );
}

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
