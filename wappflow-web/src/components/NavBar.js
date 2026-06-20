'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
  Zap, LayoutDashboard, Users, BarChart2, UserCheck,
  HelpCircle, Settings, Bell, LogOut,
  MessageCircle, X, Clock, CheckCircle, CheckCircle2, Brain,
  FileText, Inbox, Menu, ChevronDown,
  Camera, Globe, MonitorSmartphone, Sparkles,
  Crown, Lock, Calendar
} from 'lucide-react';

// Flux — sibling AI content engine. Opens in a new tab.
const FLUX_URL = process.env.NEXT_PUBLIC_FLUX_URL || 'http://localhost:3000';
import { leadsAPI, remindersAPI, displayPhone, BASE_URL, platformAccountsAPI, ssoAPI, notificationsAPI } from '../lib/api';
import { usePlan } from '@/lib/plan';
import FloatingChat from './FloatingChat';
import AppSwitcher from './AppSwitcher';
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

// ─────────────────────────────────────────────────────────────────────────────
//  LeadUsageChip — renders "X / 50" usage on Free/Starter tiers, with the
//  background going red when the user is ≥80% of their cap. Clicking it
//  bounces to the leads list. Hidden for unlimited plans (Growth/Enterprise).
// ─────────────────────────────────────────────────────────────────────────────
function LeadUsageChip({ planInfo, router }) {
  if (planInfo.loading) return null;
  const limit = planInfo.limits?.leads;
  if (limit == null || limit < 0) return null; // unlimited / unknown
  const used = planInfo.usage?.leads ?? 0;
  const ratio = limit > 0 ? used / limit : 0;
  const atLimit = used >= limit;
  const nearLimit = ratio >= 0.8;
  const colors = atLimit
    ? { bg: 'rgba(239,68,68,0.16)', border: 'rgba(239,68,68,0.55)', fg: '#fca5a5' }
    : nearLimit
      ? { bg: 'rgba(245,158,11,0.16)', border: 'rgba(245,158,11,0.50)', fg: '#fbbf24' }
      : { bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.30)', fg: '#86efac' };

  return (
    <button
      type="button"
      onClick={() => router.push('/leads-list')}
      title={
        atLimit
          ? `Lead cap reached (${used}/${limit}). Upgrade to add more.`
          : `Leads used: ${used} of ${limit}`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 10px',
        marginRight: 4,
        borderRadius: 999,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.fg,
        fontSize: 11.5,
        fontWeight: 800,
        letterSpacing: '0.02em',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
    >
      <Users size={11} />
      {used}/{limit}
      <span style={{ opacity: 0.65, fontWeight: 600, fontSize: 10 }}>leads</span>
    </button>
  );
}

const PLATFORM_META = {
  whatsapp:  { label: 'WhatsApp',  color: '#25d366', icon: MessageCircle },
  instagram: { label: 'Instagram', color: '#e1306c', icon: Camera },
  facebook:  { label: 'Facebook',  color: '#1877f2', icon: MonitorSmartphone },
  website:   { label: 'Website',   color: '#6366f1', icon: Globe },
};

// Each nav item that requires a paid plan declares `lockFeature` (the key the
// usePlan().hasFeature() check uses) and `requiredPlan` (the display label
// shown in the lock badge + upgrade modal).
const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Leads',     icon: Users,           path: '/leads-list' },
  { label: 'Clients',   icon: UserCheck,       path: '/clients' },
  { label: 'Inbox',     icon: Inbox,           path: '/chat' },
  { label: 'Invoices',  icon: FileText,        path: '/invoices' },
  { label: 'Bookings',  icon: Calendar,        path: '/bookings' },
  { label: 'Analytics', icon: BarChart2,       path: '/reports',
    lockFeature: 'analytics', requiredPlan: 'Growth' },
];

// Secondary items — now live in the top-right account menu (no more "More"
// dropdown, and Flux lives in the app-switcher).
const MORE_ITEMS = [
  { label: 'Team',      icon: UserCheck,       path: '/team',
    lockFeature: 'team_collaboration', requiredPlan: 'Growth' },
  { label: 'Knowledge', icon: Brain,           path: '/knowledge',
    lockFeature: 'team_collaboration', requiredPlan: 'Growth' },
  { label: 'Help',      icon: HelpCircle,      path: '/help' },
];

// Per-platform gates for the Platform dropdown. WhatsApp is always allowed.
const PLATFORM_GATES = {
  whatsapp:  { feature: null,              requiredPlan: null },
  instagram: { feature: 'instagram',       requiredPlan: 'Growth' },
  facebook:  { feature: 'facebook',        requiredPlan: 'Growth' },
  website:   { feature: 'website_capture', requiredPlan: 'Growth' },
};

// Shared row style for the account dropdown.
const menuItem = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
  padding: '10px 16px', border: 'none', background: 'transparent',
  color: 'var(--text)', fontSize: 13, cursor: 'pointer', textAlign: 'left',
};

export default function NavBar({ children }) {
  const router   = useRouter();
  const pathname = usePathname();
  const planInfo = usePlan();
  // CRM tab title. The studio/contracts modules set their own via route metadata,
  // so don't clobber those even if a page happens to render the CRM navbar.
  useEffect(() => {
    if (!pathname || (!pathname.startsWith('/studio') && !pathname.startsWith('/contracts'))) document.title = 'WappFlow CRM';
  }, [pathname]);
  const notifRef   = useRef(null);
  const moreRef    = useRef(null);
  const platformRef = useRef(null);
  const userMenuRef = useRef(null);

  // Helper: does the current plan have a feature? Defensive — if planInfo
  // hasn't loaded yet, we show the lock optimistically (better UX than
  // flashing an unlocked item then snapping locked).
  const featureLocked = (featureKey) => {
    if (!featureKey) return false;
    if (planInfo.loading) return false; // don't show locks until we know
    return !planInfo.hasFeature(featureKey);
  };

  const [user, setUser]                     = useState(null);
  const [workspace, setWorkspace]           = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifBadge, setNotifBadge]         = useState(0);
  const [reminders, setReminders]           = useState([]);
  const [todayLeads, setTodayLeads]         = useState([]);
  const [feed, setFeed]                     = useState([]);
  const [mobileOpen, setMobileOpen]         = useState(false);
  const [showMore, setShowMore]             = useState(false);
  const [showUserMenu, setShowUserMenu]     = useState(false);
  const [showPlatform, setShowPlatform]     = useState(false);
  const [platformAccounts, setPlatformAccounts] = useState([]);
  const [expandedPlatform, setExpandedPlatform] = useState(null);
  const [fluxLoading, setFluxLoading]       = useState(false);
  const [fluxUpgrade, setFluxUpgrade]       = useState(null); // { plan } when locked
  // Generic upgrade prompt for ANY locked nav item (Analytics, Team, etc.)
  const [navUpgrade, setNavUpgrade]         = useState(null); // { label, requiredPlan, feature }

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
    const poll = setInterval(loadNotifData, 60000);
    return () => clearInterval(poll);
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
      // Persistent notification feed (contracts signed, bookings, gallery activity, cross-platform leads)
      let feedItems = [], feedUnread = 0;
      try { const nr = await notificationsAPI.get(); feedItems = nr.data.notifications || []; feedUnread = nr.data.unread || 0; setFeed(feedItems); } catch {}
      // Dedupe derived lead cards against feed entries that already point at the same lead
      const feedLeadUrls = new Set(feedItems.map(f => f.url).filter(Boolean));
      const dismissed = new Set(JSON.parse(localStorage.getItem('wf_dismissed_notifications') || '[]'));
      const derivedCount = [
        ...today.filter(l => !feedLeadUrls.has(`/leads/${l.id}`)).map(l => `lead-${l.id}`),
        ...urgent.map(r => `rem-${r.id}`),
      ].filter(id => !dismissed.has(id)).length;
      setNotifBadge(derivedCount + feedUnread);
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

  const NavBtn = ({ label, icon: Icon, path, onClick, lockFeature, requiredPlan }) => {
    const active = isActive(path);
    const locked = featureLocked(lockFeature);
    const handleClick = (e) => {
      if (locked) {
        e.preventDefault();
        setNavUpgrade({ label, requiredPlan: requiredPlan || 'Growth', feature: lockFeature });
        setMobileOpen(false);
        return;
      }
      if (onClick) onClick();
      else { router.push(path); setMobileOpen(false); }
    };
    return (
      <button
        onClick={handleClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '7px 13px', borderRadius: 9, border: 'none',
          background: active ? 'var(--accent-light)' : 'transparent',
          color: active ? 'var(--accent)' : (locked ? 'var(--text-muted)' : 'var(--text-muted)'),
          opacity: locked ? 0.85 : 1,
          fontSize: 13, fontWeight: active ? 700 : 500,
          cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.12s',
          position: 'relative',
        }}
        onMouseEnter={e => {
          if (!active) { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }
        }}
        onMouseLeave={e => {
          if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }
        }}
        title={locked ? `${label} — Upgrade to ${requiredPlan || 'Growth'} to unlock` : label}
      >
        <Icon size={15} />
        {label}
        {locked && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            marginLeft: 2, padding: '2px 6px', borderRadius: 5,
            background: 'linear-gradient(135deg, rgba(239,68,68,0.18), rgba(239,68,68,0.10))',
            border: '1px solid rgba(239,68,68,0.40)',
            color: '#fca5a5', fontSize: 9, fontWeight: 900, letterSpacing: '0.04em',
          }}>
            <Lock size={9} />{requiredPlan || 'Growth'}
          </span>
        )}
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
        </div>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>

          {/* App switcher — Studio opens in its own tab/module */}
          <AppSwitcher />

          {/* Lead usage chip — only when limit is finite (Free/Starter). Red at ≥80%. */}
          <LeadUsageChip planInfo={planInfo} router={router} />

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
                  feed={feed}
                  onClose={() => setShowNotifications(false)}
                  onNavigate={(path) => { router.push(path); setShowNotifications(false); }}
                  onMarkAllRead={() => {
                    const all = [
                      ...todayLeads.map(l => `lead-${l.id}`),
                      ...reminders.map(r => `rem-${r.id}`),
                    ];
                    localStorage.setItem('wf_dismissed_notifications', JSON.stringify(all));
                    notificationsAPI.readAll().catch(() => {});
                    setFeed(f => f.map(n => ({ ...n, is_read: 1 })));
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
              <div className="nav-userinfo" style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {workspace?.name || user?.business_name || 'Workspace'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2 }}>
                  {user?.full_name || user?.email || ''}
                </div>
              </div>
              <ChevronDown className="nav-userinfo" size={12} color="var(--text-muted)" />
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
                  style={menuItem}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <UserCheck size={15} /> My Profile
                </button>
                <button
                  onClick={() => { router.push('/settings'); setShowUserMenu(false); }}
                  style={menuItem}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Settings size={15} /> Settings
                </button>

                {/* Team / Knowledge / Help — moved out of the old "More" dropdown */}
                {MORE_ITEMS.map(item => {
                  const ItemIcon = item.icon;
                  const itemLocked = featureLocked(item.lockFeature);
                  return (
                    <button key={item.path}
                      onClick={() => {
                        if (itemLocked) { setNavUpgrade({ label: item.label, requiredPlan: item.requiredPlan || 'Growth', feature: item.lockFeature }); setShowUserMenu(false); return; }
                        router.push(item.path); setShowUserMenu(false);
                      }}
                      style={menuItem}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <ItemIcon size={15} style={itemLocked ? { color: '#ef4444', opacity: 0.7 } : undefined} />
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {itemLocked && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 5, background: 'linear-gradient(135deg, #A78BFA, #EC4899)', color: 'white', fontSize: 8.5, fontWeight: 900 }}>
                          <Lock size={8} />{(item.requiredPlan || 'GROWTH').toUpperCase()}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Plan & billing — the tier badge now lives here */}
                <button
                  onClick={() => { router.push('/settings?tab=billing'); setShowUserMenu(false); }}
                  style={{ ...menuItem, borderTop: '1px solid var(--border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Crown size={15} color="#f59e0b" />
                  <span style={{ flex: 1 }}>Plan &amp; billing</span>
                  <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: '0.06em', padding: '2px 7px', borderRadius: 6, background: 'var(--accent-light)', color: 'var(--accent)' }}>
                    {(planInfo.planName || planInfo.plan || 'free').toString().toUpperCase()}
                  </span>
                </button>

                <button
                  onClick={handleLogout}
                  style={{ ...menuItem, color: '#ef4444', fontWeight: 600, borderTop: '1px solid var(--border)' }}
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

              <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
              <button
                onClick={() => { router.push('/settings'); setMobileOpen(false); }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 10, border: 'none', background: isActive('/settings') ? 'var(--accent-light)' : 'transparent', color: isActive('/settings') ? 'var(--accent)' : 'var(--text)', fontSize: 14, fontWeight: isActive('/settings') ? 700 : 500, cursor: 'pointer', textAlign: 'left', marginBottom: 2 }}
              >
                <Settings size={16} /> Settings
              </button>
              {MORE_ITEMS.map(item => {
                const ItemIcon = item.icon;
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

      {/* Generic upgrade modal — for any locked nav item (Analytics / Team / IG / etc.) */}
      {navUpgrade && (
        <div
          onClick={() => setNavUpgrade(null)}
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
            <div aria-hidden style={{
              position: 'absolute', inset: 0,
              background: 'radial-gradient(circle at 20% 0%, rgba(167,139,250,0.18), transparent 50%), radial-gradient(circle at 80% 100%, rgba(34,211,238,0.14), transparent 55%)',
              pointerEvents: 'none',
            }} />

            <div style={{ position: 'relative' }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 24px -4px rgba(239,68,68,0.45)',
              }}>
                <Lock size={20} color="white" />
              </div>

              <h2 style={{
                margin: '20px 0 6px', fontSize: 22, fontWeight: 800, color: 'var(--text)',
                letterSpacing: '-0.02em', lineHeight: 1.2,
              }}>
                {navUpgrade.label} is on the {navUpgrade.requiredPlan} plan.
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                You&apos;re on <strong style={{ color: 'var(--text)' }}>{(planInfo.plan || 'free').toString().toUpperCase()}</strong>.
                Upgrade to <strong style={{
                  background: 'linear-gradient(135deg, #A78BFA, #22D3EE, #EC4899)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  fontWeight: 800,
                }}>{navUpgrade.requiredPlan}</strong> to unlock {navUpgrade.label.toLowerCase()} and the rest of the team-grade toolkit.
              </p>

              <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { router.push('/settings?tab=billing'); setNavUpgrade(null); }}
                  style={{
                    flex: 1, padding: '12px 16px', borderRadius: 11, border: 'none',
                    background: 'linear-gradient(135deg, #A78BFA 0%, #22D3EE 50%, #EC4899 100%)',
                    color: '#0a0a13', fontWeight: 800, fontSize: 14, cursor: 'pointer',
                    boxShadow: '0 10px 28px -8px rgba(34,211,238,0.5)',
                  }}
                >
                  Upgrade to {navUpgrade.requiredPlan}
                </button>
                <button
                  onClick={() => { router.push('/#pricing'); setNavUpgrade(null); }}
                  style={{
                    padding: '12px 16px', borderRadius: 11,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  Compare plans
                </button>
              </div>

              <button
                onClick={() => setNavUpgrade(null)}
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
          /* Collapse the profile button to just the avatar circle — the
             workspace/user name block is what overflowed narrow phones. */
          .nav-userinfo  { display: none !important; }
        }
      `}</style>
    </>
  );
}

function MiniNotifPanel({ todayLeads, reminders, feed = [], onClose, onNavigate, onMarkAllRead }) {
  const now       = new Date();
  const dismissed = new Set(JSON.parse(localStorage.getItem('wf_dismissed_notifications') || '[]'));
  const feedLeadUrls = new Set(feed.map(f => f.url).filter(Boolean));

  const feedItems = feed.map(n => ({
    id: `notif-${n.id}`, type: n.type || 'info', emoji: n.icon || '🔔',
    title: n.title, sub: n.body || '',
    color: '#6366f1', bg: 'rgba(99,102,241,0.12)',
    href: n.url || null, unread: !n.is_read,
  }));

  const items = [
    ...feedItems,
    ...todayLeads.filter(l => !feedLeadUrls.has(`/leads/${l.id}`)).map(l => ({
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
            <div style={{ width: 30, height: 30, borderRadius: 8, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15 }}>
              {item.emoji
                ? <span>{item.emoji}</span>
                : item.type === 'lead'
                  ? <Users size={13} color={item.color} />
                  : <Clock size={13} color={item.color} />
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>{item.title}{item.unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />}</p>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
