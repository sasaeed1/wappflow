'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
  Zap, LayoutDashboard, Users, BarChart2, UserCheck,
  HelpCircle, Settings, Bell, LogOut, MessageSquare,
  MessageCircle, X, Clock, CheckCircle, CheckCircle2, Brain,
  FileText, Inbox, Menu, ChevronDown, ChevronRight,
  Camera, Globe, MonitorSmartphone, Layers, Sparkles,
  ExternalLink, Crown
} from 'lucide-react';

// Flux — sibling AI content engine. Opens in a new tab.
const FLUX_URL = process.env.NEXT_PUBLIC_FLUX_URL || 'http://localhost:3000';
import { leadsAPI, remindersAPI, displayPhone, BASE_URL, platformAccountsAPI, ssoAPI } from '../lib/api';
import { usePlan } from '@/lib/plan';
import FloatingChat from './FloatingChat';
import AICommandCenter from './AICommandCenter';

// ─────────────────────────────────────────────────────────────────────────────
//  PlanBadge — visible tier indicator that lives between the More dropdown
//  and the right-side action icons. Click it to land on Settings → billing.
//  Styled per-tier so a user can tell at a glance what they're paying for.
// ─────────────────────────────────────────────────────────────────────────────
function PlanBadge() {
  const { plan, planName, loading } = usePlan();
  const router = useRouter();
  if (loading || !plan) return null;

  const TIER_STYLE = {
    free: {
      bg: 'rgba(148,163,184,0.12)',
      border: 'rgba(148,163,184,0.32)',
      color: '#cbd5e1',
      crown: false,
    },
    starter: {
      bg: 'linear-gradient(135deg, rgba(96,165,250,0.18), rgba(99,102,241,0.18))',
      border: 'rgba(99,102,241,0.45)',
      color: '#a5b4fc',
      crown: false,
    },
    growth: {
      bg: 'linear-gradient(135deg, rgba(167,139,250,0.20), rgba(236,72,153,0.20))',
      border: 'rgba(167,139,250,0.55)',
      color: '#e9d5ff',
      crown: true,
    },
    enterprise: {
      bg: 'linear-gradient(135deg, rgba(250,204,21,0.20), rgba(245,158,11,0.20))',
      border: 'rgba(250,204,21,0.55)',
      color: '#fde68a',
      crown: true,
    },
  };
  const style = TIER_STYLE[plan] || TIER_STYLE.free;
  const label = (planName || plan).toUpperCase();

  return (
    <button
      type="button"
      onClick={() => router.push('/settings?tab=billing')}
      title={`You're on the ${planName || plan} plan. Click to manage billing.`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 12px',
        marginRight: 4,
        borderRadius: 999,
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.color,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.08em',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.filter = 'brightness(1.15)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.filter = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {style.crown && <Crown size={12} />}
      {label}
    </button>
  );
}

const PLATFORM_META = {
  whatsapp:  { label: 'WhatsApp',  color: '#25d366', icon: MessageCircle },
  instagram: { label: 'Instagram', color: '#e1306c', icon: Camera },
  facebook:  { label: 'Facebook',  color: '#1877f2', icon: MonitorSmartphone },
  website:   { label: 'Website',   color: '#6366f1', icon: Globe },
};

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Leads',     icon: Users,           path: '/leads-list' },
  { label: 'Inbox',     icon: Inbox,           path: '/chat' },
  { label: 'Invoices',  icon: FileText,        path: '/invoices' },
  { label: 'Analytics', icon: BarChart2,       path: '/reports' },
];

const MORE_ITEMS = [
  { label: 'Team',      icon: UserCheck,       path: '/team' },
  { label: 'Knowledge', icon: Brain,           path: '/knowledge' },
  {
    label: 'Flux',
    icon: Sparkles,
    href: FLUX_URL,
    external: true,
    badge: 'NEW',
    description: 'AI Instagram content engine',
  },
  { label: 'Help',      icon: HelpCircle,      path: '/help' },
];

export default function NavBar({ children }) {
  const router   = useRouter();
  const pathname = usePathname();
  const notifRef   = useRef(null);
  const moreRef    = useRef(null);
  const platformRef = useRef(null);
  const userMenuRef = useRef(null);

  const [user, setUser]                     = useState(null);
  const [workspace, setWorkspace]           = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifBadge, setNotifBadge]         = useState(0);
  const [reminders, setReminders]           = useState([]);
  const [todayLeads, setTodayLeads]         = useState([]);
  const [mobileOpen, setMobileOpen]         = useState(false);
  const [showMore, setShowMore]             = useState(false);
  const [showUserMenu, setShowUserMenu]     = useState(false);
  const [showPlatform, setShowPlatform]     = useState(false);
  const [platformAccounts, setPlatformAccounts] = useState([]);
  const [expandedPlatform, setExpandedPlatform] = useState(null);
  const [fluxLoading, setFluxLoading]       = useState(false);
  const [fluxUpgrade, setFluxUpgrade]       = useState(null); // { plan } when locked

  // Click handler for Flux nav entry — fetches signed SSO token, opens Flux
  // in a new tab, or surfaces an upgrade prompt if plan tier doesn't include it.
  const handleFluxClick = async () => {
    if (fluxLoading) return;
    setFluxLoading(true);
    try {
      const res = await ssoAPI.mintFluxToken();
      const { ssoUrl, unlocked, plan } = res.data || {};
      if (!unlocked) {
        setFluxUpgrade({ plan: plan || 'free' });
        setShowMore(false);
        return;
      }
      // Open in a new tab. We can't use window.open after an async tick
      // without losing the user gesture context on Safari — but Chrome is fine.
      window.open(ssoUrl, '_blank', 'noopener,noreferrer');
      setShowMore(false);
    } catch (err) {
      console.error('Flux SSO failed:', err);
      // Fall back to opening Flux landing (user will see the public site).
      window.open(FLUX_URL, '_blank', 'noopener,noreferrer');
    } finally {
      setFluxLoading(false);
    }
  };

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
    const wsData = localStorage.getItem('workspace');
    if (wsData) setWorkspace(JSON.parse(wsData));
    loadNotifData();
    loadPlatformAccounts();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
      if (moreRef.current  && !moreRef.current.contains(e.target))  setShowMore(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
      if (platformRef.current && !platformRef.current.contains(e.target)) { setShowPlatform(false); setExpandedPlatform(null); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadNotifData = async () => {
    try {
      const now = new Date();
      const [leadsRes, remindersRes] = await Promise.all([
        leadsAPI.getAll(null).catch(() => ({ data: { leads: [] } })),
        remindersAPI.getUpcoming().catch(() => ({ data: { reminders: [] } })),
      ]);
      const all   = leadsRes.data.leads || [];
      const today = all.filter(l => new Date(l.created_at).toDateString() === now.toDateString());
      setTodayLeads(today);
      const allUp  = remindersRes.data.reminders || [];
      const urgent = allUp.filter(r => {
        const due = new Date(r.due_date || r.reminder_date);
        return (due - now) / 36e5 <= 24;
      });
      setReminders(urgent);
      const dismissed = new Set(JSON.parse(localStorage.getItem('wf_dismissed_notifications') || '[]'));
      const count = [
        ...today.map(l => `lead-${l.id}`),
        ...urgent.map(r => `rem-${r.id}`),
      ].filter(id => !dismissed.has(id)).length;
      setNotifBadge(count);
    } catch {}
  };

  const loadPlatformAccounts = async () => {
    try {
      const res = await platformAccountsAPI.getAll();
      setPlatformAccounts(res.data.accounts || []);
    } catch {}
  };

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  const isActive = (path) =>
    pathname === path || (path !== '/dashboard' && pathname?.startsWith(path));

  const isPlatformActive = () => {
    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    return params?.has('platform');
  };

  const NavBtn = ({ label, icon: Icon, path, onClick }) => {
    const active = isActive(path);
    return (
      <button
        onClick={onClick || (() => { router.push(path); setMobileOpen(false); })}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '7px 13px', borderRadius: 9, border: 'none',
          background: active ? 'var(--accent-light)' : 'transparent',
          color: active ? 'var(--accent)' : 'var(--text-muted)',
          fontSize: 13, fontWeight: active ? 700 : 500,
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.12s',
        }}
        onMouseEnter={e => {
          if (!active) { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }
        }}
        onMouseLeave={e => {
          if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }
        }}
      >
        <Icon size={15} />
        {label}
      </button>
    );
  };

  const accountsByPlatform = ['whatsapp', 'instagram', 'facebook', 'website'].reduce((acc, p) => {
    acc[p] = platformAccounts.filter(a => a.platform === p);
    return acc;
  }, {});

  return (
    <>
      {/* ── Top NavBar ── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, height: 60, zIndex: 100,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 8,
        boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
      }}>
        {/* Logo */}
        <div
          onClick={() => router.push('/dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', marginRight: 12, flexShrink: 0 }}
        >
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
          }}>
            <Zap size={17} color="white" />
          </div>
          <div>
            <div style={{
              fontSize: 16, fontWeight: 900, letterSpacing: '-0.4px',
              background: 'linear-gradient(135deg, var(--text), var(--accent))',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>WappFlow</div>
          </div>
        </div>

        {/* Nav items — desktop */}
        <div className="nav-links" style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
          {NAV_ITEMS.map(item => <NavBtn key={item.path} {...item} />)}

          {/* Platform dropdown */}
          <div ref={platformRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { setShowPlatform(v => !v); if (showPlatform) setExpandedPlatform(null); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 11px', borderRadius: 9, border: 'none',
                background: showPlatform || isPlatformActive() ? 'var(--accent-light)' : 'transparent',
                color: showPlatform || isPlatformActive() ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => {
                const a = showPlatform || isPlatformActive();
                e.currentTarget.style.background = a ? 'var(--accent-light)' : 'transparent';
                e.currentTarget.style.color = a ? 'var(--accent)' : 'var(--text-muted)';
              }}
            >
              <Layers size={15} /> Platform <ChevronDown size={13} />
            </button>

            {showPlatform && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 220,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.18)',
                zIndex: 300, overflow: 'visible', animation: 'navFadeIn 0.12s ease',
              }}>
                {/* All in One */}
                <button
                  onClick={() => { router.push('/leads-list'); setShowPlatform(false); setExpandedPlatform(null); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 16px', border: 'none', borderRadius: '14px 14px 0 0',
                    background: 'transparent', color: 'var(--text)',
                    fontSize: 13, fontWeight: 700, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                    borderBottom: '1px solid var(--border)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Layers size={13} color="white" />
                  </div>
                  All in One
                </button>

                {/* Per-platform sections */}
                {['whatsapp', 'instagram', 'facebook', 'website'].map((p, idx, arr) => {
                  const meta = PLATFORM_META[p];
                  const Icon = meta.icon;
                  const accounts = accountsByPlatform[p];
                  const isExpanded = expandedPlatform === p;
                  const isLast = idx === arr.length - 1;

                  return (
                    <div key={p}>
                      <button
                        onClick={() => {
                          if (accounts.length === 0) {
                            router.push('/settings?tab=connections');
                            setShowPlatform(false); setExpandedPlatform(null);
                          } else if (accounts.length === 1) {
                            router.push(`/leads-list?platform=${p}&account=${accounts[0].id}`);
                            setShowPlatform(false); setExpandedPlatform(null);
                          } else {
                            setExpandedPlatform(isExpanded ? null : p);
                          }
                        }}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 16px', border: 'none',
                          borderRadius: isLast && !isExpanded ? '0 0 14px 14px' : 0,
                          background: 'transparent', color: 'var(--text)',
                          fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                          borderBottom: isLast && !isExpanded ? 'none' : '1px solid var(--border)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ width: 26, height: 26, borderRadius: 8, background: meta.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={13} color={meta.color} />
                        </div>
                        <span style={{ flex: 1 }}>{meta.label}</span>
                        {accounts.length > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 6, background: meta.color + '20', color: meta.color }}>{accounts.length}</span>
                        )}
                        {accounts.length > 1 && <ChevronRight size={12} color="var(--text-muted)" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />}
                      </button>

                      {/* Sub-accounts */}
                      {isExpanded && accounts.map((acc, ai) => (
                        <button
                          key={acc.id}
                          onClick={() => { router.push(`/leads-list?platform=${p}&account=${acc.id}`); setShowPlatform(false); setExpandedPlatform(null); }}
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                            padding: '9px 16px 9px 52px', border: 'none',
                            borderRadius: isLast && ai === accounts.length - 1 ? '0 0 14px 14px' : 0,
                            background: 'var(--surface2)', color: 'var(--text-muted)',
                            fontSize: 12, fontWeight: 500, cursor: 'pointer', textAlign: 'left',
                            borderBottom: isLast && ai === accounts.length - 1 ? 'none' : '1px solid var(--border)',
                            transition: 'background 0.1s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = meta.color + '12'; e.currentTarget.style.color = meta.color; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: acc.status === 'connected' ? '#10b981' : '#9ca3af', flexShrink: 0 }} />
                          {acc.account_name}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* More dropdown */}
          <div ref={moreRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMore(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 11px', borderRadius: 9, border: 'none',
                background: MORE_ITEMS.some(i => i.path && isActive(i.path)) ? 'var(--accent-light)' : 'transparent',
                color: MORE_ITEMS.some(i => i.path && isActive(i.path)) ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => {
                const anyActive = MORE_ITEMS.some(i => i.path && isActive(i.path));
                e.currentTarget.style.background = anyActive ? 'var(--accent-light)' : 'transparent';
                e.currentTarget.style.color = anyActive ? 'var(--accent)' : 'var(--text-muted)';
              }}
            >
              More <ChevronDown size={13} />
            </button>
            {showMore && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 220,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                zIndex: 300, overflow: 'hidden', animation: 'navFadeIn 0.12s ease',
              }}>
                {MORE_ITEMS.map(item => {
                  const active = item.path ? isActive(item.path) : false;
                  const ItemIcon = item.icon;

                  if (item.external) {
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={handleFluxClick}
                        disabled={fluxLoading}
                        style={{
                          position: 'relative',
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '12px 16px', textDecoration: 'none', border: 'none',
                          background: 'linear-gradient(135deg, rgba(167,139,250,0.10) 0%, rgba(34,211,238,0.08) 50%, rgba(236,72,153,0.10) 100%)',
                          color: 'var(--text)',
                          fontSize: 13, fontWeight: 600,
                          cursor: fluxLoading ? 'wait' : 'pointer', textAlign: 'left',
                          borderTop: '1px solid var(--border)',
                          borderBottom: '1px solid var(--border)',
                          transition: 'all 0.15s',
                          opacity: fluxLoading ? 0.6 : 1,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                      >
                        <div style={{
                          width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                          background: 'linear-gradient(135deg, #A78BFA 0%, #22D3EE 50%, #EC4899 100%)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 4px 14px -2px rgba(34,211,238,0.5)',
                        }}>
                          <ItemIcon size={14} color="white" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              fontWeight: 800, fontSize: 13,
                              background: 'linear-gradient(135deg, #A78BFA 0%, #22D3EE 50%, #EC4899 100%)',
                              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                              backgroundClip: 'text',
                            }}>{item.label}</span>
                            {item.badge && (
                              <span style={{
                                fontSize: 8.5, fontWeight: 900, letterSpacing: '0.05em',
                                padding: '1.5px 5px', borderRadius: 4,
                                background: 'linear-gradient(135deg, #A78BFA, #EC4899)',
                                color: 'white',
                              }}>{item.badge}</span>
                            )}
                          </div>
                          {item.description && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                              {fluxLoading ? 'Opening Flux…' : item.description}
                            </div>
                          )}
                        </div>
                        <ExternalLink size={12} color="var(--text-muted)" />
                      </button>
                    );
                  }

                  return (
                    <button key={item.path}
                      onClick={() => { router.push(item.path); setShowMore(false); }}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '11px 16px', border: 'none',
                        background: active ? 'var(--accent-light)' : 'transparent',
                        color: active ? 'var(--accent)' : 'var(--text)',
                        fontSize: 13, fontWeight: active ? 700 : 500,
                        cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)'; }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <ItemIcon size={14} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>

          {/* Plan tier badge — between More and Settings */}
          <PlanBadge />

          {/* Settings */}
          <button
            onClick={() => router.push('/settings')}
            title="Settings"
            style={{
              width: 36, height: 36, borderRadius: 9, border: 'none',
              background: isActive('/settings') ? 'var(--accent-light)' : 'transparent',
              color: isActive('/settings') ? 'var(--accent)' : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => {
              e.currentTarget.style.background = isActive('/settings') ? 'var(--accent-light)' : 'transparent';
              e.currentTarget.style.color = isActive('/settings') ? 'var(--accent)' : 'var(--text-muted)';
            }}
          >
            <Settings size={17} />
          </button>

          {/* Notifications */}
          <div ref={notifRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowNotifications(v => !v)}
              title="Notifications"
              style={{
                width: 36, height: 36, borderRadius: 9, border: 'none',
                background: showNotifications ? 'var(--accent-light)' : 'transparent',
                color: showNotifications ? 'var(--accent)' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', position: 'relative', transition: 'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => {
                e.currentTarget.style.background = showNotifications ? 'var(--accent-light)' : 'transparent';
                e.currentTarget.style.color = showNotifications ? 'var(--accent)' : 'var(--text-muted)';
              }}
            >
              <Bell size={17} />
              {notifBadge > 0 && (
                <span style={{
                  position: 'absolute', top: 5, right: 5,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#ef4444', fontSize: 9, fontWeight: 900,
                  color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: '2px solid var(--surface)',
                }}>
                  {notifBadge > 9 ? '9+' : notifBadge}
                </span>
              )}
            </button>

            {showNotifications && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 320,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
                zIndex: 300, overflow: 'hidden', animation: 'navFadeIn 0.12s ease',
              }}>
                <MiniNotifPanel
                  todayLeads={todayLeads}
                  reminders={reminders}
                  onClose={() => setShowNotifications(false)}
                  onNavigate={(path) => { router.push(path); setShowNotifications(false); }}
                  onMarkAllRead={() => {
                    const all = [
                      ...todayLeads.map(l => `lead-${l.id}`),
                      ...reminders.map(r => `rem-${r.id}`),
                    ];
                    localStorage.setItem('wf_dismissed_notifications', JSON.stringify(all));
                    setNotifBadge(0);
                    setShowNotifications(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* User avatar / menu */}
          <div ref={userMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 10px 5px 5px', borderRadius: 10, border: 'none',
                background: showUserMenu ? 'var(--surface2)' : 'transparent',
                cursor: 'pointer', transition: 'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { if (!showUserMenu) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 900, color: 'white',
              }}>
                {(user?.full_name || user?.email || 'U')[0]?.toUpperCase()}
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {workspace?.name || user?.business_name || 'Workspace'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2 }}>
                  {user?.full_name || user?.email || ''}
                </div>
              </div>
              <ChevronDown size={12} color="var(--text-muted)" />
            </button>

            {showUserMenu && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 180,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                zIndex: 300, overflow: 'hidden', animation: 'navFadeIn 0.12s ease',
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                    {user?.full_name || user?.email}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                    {workspace?.name || ''}
                  </p>
                </div>
                <button
                  onClick={() => { router.push('/profile'); setShowUserMenu(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', border: 'none', background: 'transparent',
                    color: 'var(--text)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  My Profile
                </button>
                <button
                  onClick={handleLogout}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', border: 'none', background: 'transparent',
                    color: '#ef4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <LogOut size={14} /> Sign out
                </button>
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="mobile-hamburger"
            onClick={() => setMobileOpen(true)}
            style={{
              display: 'none', width: 36, height: 36, borderRadius: 9,
              border: 'none', background: 'var(--surface2)', color: 'var(--text)',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <Menu size={18} />
          </button>
        </div>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div onClick={() => setMobileOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, width: 280, height: '100vh',
            background: 'var(--surface)', zIndex: 250,
            boxShadow: '-8px 0 40px rgba(0,0,0,0.2)',
            display: 'flex', flexDirection: 'column',
            animation: 'slideInRight 0.2s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>Menu</span>
              <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              {NAV_ITEMS.map(item => (
                <button key={item.path}
                  onClick={() => { router.push(item.path); setMobileOpen(false); }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '11px 14px', borderRadius: 10, border: 'none',
                    background: isActive(item.path) ? 'var(--accent-light)' : 'transparent',
                    color: isActive(item.path) ? 'var(--accent)' : 'var(--text)',
                    fontSize: 14, fontWeight: isActive(item.path) ? 700 : 500,
                    cursor: 'pointer', textAlign: 'left', marginBottom: 2,
                  }}
                >
                  <item.icon size={16} />
                  {item.label}
                </button>
              ))}

              {/* Platform section in mobile */}
              <div style={{ margin: '8px 0 4px 14px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Platform</div>
              <button
                onClick={() => { router.push('/leads-list'); setMobileOpen(false); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left', marginBottom: 2 }}
              >
                <Layers size={15} /> All in One
              </button>
              {['whatsapp', 'instagram', 'facebook', 'website'].map(p => {
                const meta = PLATFORM_META[p];
                const Icon = meta.icon;
                const accounts = accountsByPlatform[p];
                return (
                  <div key={p}>
                    <button
                      onClick={() => {
                        if (accounts.length > 0) router.push(`/leads-list?platform=${p}`);
                        else router.push('/settings?tab=connections');
                        setMobileOpen(false);
                      }}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left', marginBottom: 2 }}
                    >
                      <Icon size={15} color={meta.color} /> {meta.label}
                      {accounts.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 10, background: meta.color + '20', color: meta.color, padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>{accounts.length}</span>}
                    </button>
                    {accounts.map(acc => (
                      <button key={acc.id}
                        onClick={() => { router.push(`/leads-list?platform=${p}&account=${acc.id}`); setMobileOpen(false); }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px 8px 40px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', textAlign: 'left', marginBottom: 1 }}
                      >
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: acc.status === 'connected' ? '#10b981' : '#9ca3af' }} />
                        {acc.account_name}
                      </button>
                    ))}
                  </div>
                );
              })}

              <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
              {MORE_ITEMS.map(item => {
                const ItemIcon = item.icon;
                if (item.external) {
                  return (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMobileOpen(false)}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        padding: '11px 14px', borderRadius: 10, marginBottom: 2,
                        background: 'linear-gradient(135deg, rgba(167,139,250,0.10), rgba(34,211,238,0.08), rgba(236,72,153,0.10))',
                        textDecoration: 'none',
                        boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.18)',
                      }}
                    >
                      <div style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: 'linear-gradient(135deg, #A78BFA, #22D3EE, #EC4899)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <ItemIcon size={14} color="white" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: 14, fontWeight: 800,
                            background: 'linear-gradient(135deg, #A78BFA, #22D3EE, #EC4899)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                          }}>{item.label}</span>
                          {item.badge && (
                            <span style={{
                              fontSize: 8.5, fontWeight: 900, letterSpacing: '0.05em',
                              padding: '1.5px 5px', borderRadius: 4,
                              background: 'linear-gradient(135deg, #A78BFA, #EC4899)', color: 'white',
                            }}>{item.badge}</span>
                          )}
                        </div>
                        {item.description && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                            {item.description}
                          </div>
                        )}
                      </div>
                      <ExternalLink size={13} color="var(--text-muted)" />
                    </a>
                  );
                }
                return (
                  <button key={item.path}
                    onClick={() => { router.push(item.path); setMobileOpen(false); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 14px', borderRadius: 10, border: 'none',
                      background: isActive(item.path) ? 'var(--accent-light)' : 'transparent',
                      color: isActive(item.path) ? 'var(--accent)' : 'var(--text)',
                      fontSize: 14, fontWeight: isActive(item.path) ? 700 : 500,
                      cursor: 'pointer', textAlign: 'left', marginBottom: 2,
                    }}
                  >
                    <ItemIcon size={16} />
                    {item.label}
                  </button>
                );
              })}
            </div>
            <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
              <button onClick={handleLogout}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 14px', borderRadius: 10, border: 'none',
                  background: 'rgba(239,68,68,0.08)', color: '#ef4444',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <LogOut size={15} /> Sign out
              </button>
            </div>
          </div>
        </>
      )}

      {/* Page content — offset below the fixed nav */}
      <div style={{ paddingTop: 60, minHeight: '100vh', background: 'var(--bg)' }}>
        {children}
      </div>

      <AICommandCenter enabled={true} />
      <FloatingChat />

      {/* Flux upgrade modal — shown when the user's plan tier doesn't include Flux. */}
      {fluxUpgrade && (
        <div
          onClick={() => setFluxUpgrade(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, animation: 'navFadeIn 0.18s ease',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 460, width: '100%',
              background: 'linear-gradient(180deg, rgba(20,22,33,0.98) 0%, rgba(12,14,22,0.98) 100%)',
              border: '1px solid rgba(167,139,250,0.25)',
              borderRadius: 18, padding: 28,
              boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            {/* aurora glow */}
            <div aria-hidden style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(circle at 20% 0%, rgba(167,139,250,0.18), transparent 50%), radial-gradient(circle at 80% 100%, rgba(34,211,238,0.14), transparent 55%)',
              pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: 'linear-gradient(135deg, #A78BFA 0%, #22D3EE 50%, #EC4899 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px -4px rgba(34,211,238,0.5)',
              }}>
                <Sparkles size={22} color="white" />
              </div>

              <h2 style={{
                margin: '20px 0 6px', fontSize: 22, fontWeight: 800, color: 'var(--text)',
                letterSpacing: '-0.02em', lineHeight: 1.2,
              }}>
                Flux is on the Growth plan.
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Your workspace is on <strong style={{ color: 'var(--text)' }}>{fluxUpgrade.plan}</strong>.
                Upgrade to <strong style={{
                  background: 'linear-gradient(135deg, #A78BFA, #22D3EE, #EC4899)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  fontWeight: 800,
                }}>Growth</strong> or <strong style={{
                  background: 'linear-gradient(135deg, #A78BFA, #22D3EE, #EC4899)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  fontWeight: 800,
                }}>Enterprise</strong> to unlock the AI Instagram content engine.
              </p>

              <div style={{
                marginTop: 18, padding: '14px 16px', borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', color: 'var(--text-muted)', marginBottom: 8 }}>
                  WHAT YOU GET WITH FLUX
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {[
                    'Topic → finished carousel in minutes',
                    'On-brand AI captions + hashtags',
                    '9 theme presets + brand color overrides',
                    'Auto-schedule to Instagram',
                  ].map(t => (
                    <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                      <CheckCircle2 size={14} color="#22D3EE" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { router.push('/settings?tab=billing'); setFluxUpgrade(null); }}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 11, border: 'none',
                    background: 'linear-gradient(135deg, #A78BFA 0%, #22D3EE 50%, #EC4899 100%)',
                    color: '#0a0a13', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                    boxShadow: '0 10px 28px -8px rgba(34,211,238,0.5)',
                  }}
                >
                  Upgrade plan
                </button>
                <button
                  onClick={() => { window.open(FLUX_URL, '_blank', 'noopener,noreferrer'); setFluxUpgrade(null); }}
                  style={{
                    padding: '12px 16px', borderRadius: 11,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Preview Flux
                </button>
              </div>

              <button
                onClick={() => setFluxUpgrade(null)}
                aria-label="Close"
                style={{
                  position: 'absolute', top: -10, right: -10,
                  width: 28, height: 28, borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes navFadeIn    { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideInRight { from { transform:translateX(100%); } to { transform:translateX(0); } }
        @media (max-width: 768px) {
          .nav-links     { display: none !important; }
          .mobile-hamburger { display: flex !important; }
        }
      `}</style>
    </>
  );
}

function MiniNotifPanel({ todayLeads, reminders, onClose, onNavigate, onMarkAllRead }) {
  const now       = new Date();
  const dismissed = new Set(JSON.parse(localStorage.getItem('wf_dismissed_notifications') || '[]'));

  const items = [
    ...todayLeads.map(l => ({
      id: `lead-${l.id}`, type: 'lead',
      title: `New lead: ${l.customer_name || 'Unknown'}`,
      sub: displayPhone(l.customer_phone, l.platform_source),
      color: '#6366f1', bg: 'rgba(99,102,241,0.12)',
      href: `/leads/${l.id}`,
    })),
    ...reminders.map(r => {
      const due     = new Date(r.due_date || r.reminder_date);
      const overdue = due < now;
      return {
        id: `rem-${r.id}`, type: 'reminder',
        title: r.title || r.message || 'Reminder',
        sub: overdue ? `Overdue — ${due.toLocaleTimeString()}` : `Due ${due.toLocaleString()}`,
        color: overdue ? '#ef4444' : '#f59e0b',
        bg:    overdue ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
        href: null,
      };
    }),
  ].filter(i => !dismissed.has(i.id));

  return (
    <div>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={13} color="var(--text)" />
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Notifications</span>
          {items.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 10, background: '#ef4444', color: 'white' }}>
              {items.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {items.length > 0 && (
            <button onClick={onMarkAllRead} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
              Mark all read
            </button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ padding: '28px 20px', textAlign: 'center' }}>
            <CheckCircle size={26} color="#10b981" style={{ margin: '0 auto 8px', display: 'block' }} />
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>All caught up!</p>
          </div>
        ) : items.map(item => (
          <div
            key={item.id}
            onClick={() => item.href && onNavigate(item.href)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 16px', borderBottom: '1px solid var(--border)', cursor: item.href ? 'pointer' : 'default', transition: 'background 0.1s' }}
            onMouseEnter={e => { if (item.href) e.currentTarget.style.background = 'var(--surface2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ width: 30, height: 30, borderRadius: 8, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {item.type === 'lead'
                ? <Users size={13} color={item.color} />
                : <Clock size={13} color={item.color} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{item.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
