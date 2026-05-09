'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
  Zap, LayoutDashboard, Users, BarChart2, UserCheck,
  HelpCircle, Settings, Bell, LogOut, MessageSquare,
  MessageCircle, X, Clock, CheckCircle, Brain,
  FileText, Inbox, Menu, ChevronDown
} from 'lucide-react';
import { leadsAPI, remindersAPI, displayPhone, BASE_URL } from '../lib/api';
import FloatingChat from './FloatingChat';
import AICommandCenter from './AICommandCenter';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Leads',     icon: Users,           path: '/leads-list' },
  { label: 'WhatsApp',  icon: MessageCircle,   path: '/whatsapp' },
  { label: 'Inbox',     icon: Inbox,           path: '/chat' },
  { label: 'Invoices',  icon: FileText,        path: '/invoices' },
  { label: 'Analytics', icon: BarChart2,       path: '/reports' },
];

const MORE_ITEMS = [
  { label: 'Team',      icon: UserCheck,       path: '/team' },
  { label: 'Knowledge', icon: Brain,           path: '/knowledge' },
  { label: 'Help',      icon: HelpCircle,      path: '/help' },
];

export default function NavBar({ children }) {
  const router   = useRouter();
  const pathname = usePathname();
  const notifRef = useRef(null);
  const moreRef  = useRef(null);

  const [user, setUser]                     = useState(null);
  const [workspace, setWorkspace]           = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifBadge, setNotifBadge]         = useState(0);
  const [reminders, setReminders]           = useState([]);
  const [todayLeads, setTodayLeads]         = useState([]);
  const [mobileOpen, setMobileOpen]         = useState(false);
  const [showMore, setShowMore]             = useState(false);
  const [showUserMenu, setShowUserMenu]     = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
    const wsData = localStorage.getItem('workspace');
    if (wsData) setWorkspace(JSON.parse(wsData));
    loadNotifData();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
      if (moreRef.current  && !moreRef.current.contains(e.target))  setShowMore(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
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

  const handleLogout = () => { localStorage.clear(); router.push('/login'); };

  const isActive = (path) =>
    pathname === path || (path !== '/dashboard' && pathname?.startsWith(path));

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

          {/* More dropdown */}
          <div ref={moreRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowMore(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 11px', borderRadius: 9, border: 'none',
                background: MORE_ITEMS.some(i => isActive(i.path)) ? 'var(--accent-light)' : 'transparent',
                color: MORE_ITEMS.some(i => isActive(i.path)) ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 13, fontWeight: 500, cursor: 'pointer', transition: 'all 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => {
                const anyActive = MORE_ITEMS.some(i => isActive(i.path));
                e.currentTarget.style.background = anyActive ? 'var(--accent-light)' : 'transparent';
                e.currentTarget.style.color = anyActive ? 'var(--accent)' : 'var(--text-muted)';
              }}
            >
              More <ChevronDown size={13} />
            </button>
            {showMore && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 160,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                zIndex: 300, overflow: 'hidden', animation: 'navFadeIn 0.12s ease',
              }}>
                {MORE_ITEMS.map(item => {
                  const active = isActive(item.path);
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
                      <item.icon size={14} />
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
            position: 'fixed', top: 0, right: 0, width: 260, height: '100vh',
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
              {[...NAV_ITEMS, ...MORE_ITEMS].map(item => (
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
      sub: displayPhone(l.customer_phone),
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
